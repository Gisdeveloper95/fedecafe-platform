import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { describeAccountBlock, getGlobalLockdown } from "@/lib/auth/lockdown";
import {
  effectiveRefreshTtlSec,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyMobileToken,
} from "@/lib/auth/mobile-jwt";
import { env } from "@/lib/env";

const RefreshRequest = z.object({
  refreshToken: z.string().min(1),
});

export async function POST(request: Request) {
  let body: z.infer<typeof RefreshRequest>;
  try {
    body = await parseJson(request, RefreshRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let payload;
  try {
    payload = await verifyMobileToken(body.refreshToken);
  } catch {
    return jsonError("invalid_refresh_token", 401);
  }
  if (payload.type !== "refresh") {
    return jsonError("not_a_refresh_token", 401);
  }

  // Verificar que la sesion existe, no esta revocada y no expiro
  const tokenHash = hashToken(body.refreshToken);
  const sessionRows = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, payload.sub),
        eq(schema.sessions.refreshTokenHash, tokenHash),
      ),
    )
    .limit(1);

  const session = sessionRows[0];
  if (!session) return jsonError("session_not_found", 401);
  if (session.revoked) return jsonError("session_revoked", 401);
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return jsonError("session_expired", 401);
  }

  // Verificar estado actual del usuario y lockdown global
  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);
  const user = userRows[0];
  if (!user) return jsonError("user_not_found", 401);

  const lockdown = await getGlobalLockdown();
  const block = describeAccountBlock({
    status: user.status,
    accountType: user.accountType,
    accessExpiresAt: user.accessExpiresAt,
    globalLockdown: lockdown.enabled,
    role: user.role,
    bypassLockdownForAdmin: true,
  });
  if (!block.allowed) {
    // Revocar sesión para evitar reintentos infinitos
    await db
      .update(schema.sessions)
      .set({ revoked: true })
      .where(eq(schema.sessions.id, session.id));
    return jsonError(block.reason, 401);
  }

  const accountType = (user.accountType as "regular" | "demo") ?? "regular";
  const refreshTtlSec = effectiveRefreshTtlSec({
    accountType,
    accessExpiresAt: user.accessExpiresAt,
  });
  if (refreshTtlSec <= 0) {
    await db
      .update(schema.sessions)
      .set({ revoked: true })
      .where(eq(schema.sessions.id, session.id));
    return jsonError("access_expired", 401);
  }

  // Rotar tokens
  const newAccess = await signAccessToken({
    sub: user.id,
    role: user.role as "admin" | "operario",
    username: user.username,
    device: payload.device,
    accountType,
  });
  const newRefresh = await signRefreshToken(
    {
      sub: user.id,
      role: user.role as "admin" | "operario",
      username: user.username,
      device: payload.device,
      accountType,
    },
    refreshTtlSec,
  );

  await db
    .update(schema.sessions)
    .set({
      refreshTokenHash: hashToken(newRefresh),
      lastUsedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + refreshTtlSec * 1000).toISOString(),
    })
    .where(eq(schema.sessions.id, session.id));

  return json({
    accessToken: newAccess,
    refreshToken: newRefresh,
    accessTokenTtlSec: env.MOBILE_ACCESS_TOKEN_TTL_MIN * 60,
    refreshTokenTtlSec: refreshTtlSec,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      accountType,
      mustChangePassword: Boolean(user.mustChangePassword),
      accessExpiresAt: user.accessExpiresAt,
    },
  });
}
