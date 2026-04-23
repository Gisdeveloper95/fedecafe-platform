import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import {
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

  // Verificar que el usuario sigue activo
  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);
  const user = userRows[0];
  if (!user || !user.active) return jsonError("user_inactive", 401);

  // Rotar tokens: emitir uno nuevo y guardar el hash
  const newAccess = await signAccessToken({
    sub: user.id,
    role: user.role as "admin" | "operario",
    username: user.username,
    device: payload.device,
  });
  const newRefresh = await signRefreshToken({
    sub: user.id,
    role: user.role as "admin" | "operario",
    username: user.username,
    device: payload.device,
  });

  const refreshTtlMs = env.MOBILE_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  await db
    .update(schema.sessions)
    .set({
      refreshTokenHash: hashToken(newRefresh),
      lastUsedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + refreshTtlMs).toISOString(),
    })
    .where(eq(schema.sessions.id, session.id));

  return json({
    accessToken: newAccess,
    refreshToken: newRefresh,
    accessTokenTtlSec: env.MOBILE_ACCESS_TOKEN_TTL_MIN * 60,
    refreshTokenTtlSec: env.MOBILE_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}
