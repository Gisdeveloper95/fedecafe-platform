import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { verifyPassword } from "@/lib/auth/passwords";
import { describeAccountBlock, getGlobalLockdown } from "@/lib/auth/lockdown";
import {
  effectiveRefreshTtlSec,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth/mobile-jwt";
import { createWebSession } from "@/lib/auth/web-session";
import { env } from "@/lib/env";

const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  // Si viene 'mobile: true', genera tokens JWT para Flutter en lugar de cookie web.
  mobile: z.boolean().optional().default(false),
  deviceFingerprint: z.string().min(1).optional(),
  deviceName: z.string().optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof LoginRequest>;
  try {
    body = await parseJson(request, LoginRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, body.username))
    .limit(1);

  const user = rows[0];
  if (!user) return jsonError("invalid_credentials", 401);

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) return jsonError("invalid_credentials", 401);

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
    return jsonError(block.reason, 403);
  }

  // Actualizar last_login
  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  await logAudit({
    userId: user.id,
    action: body.mobile ? "auth.login.mobile" : "auth.login.web",
    targetId: user.id,
    details: {
      device: body.deviceName ?? null,
      accountType: user.accountType,
    },
  });

  const accountType = (user.accountType as "regular" | "demo") ?? "regular";

  // Rama mobile: emitir tokens JWT y registrar sesión de dispositivo
  if (body.mobile) {
    if (!body.deviceFingerprint) {
      return jsonError("device_fingerprint_required_for_mobile", 400);
    }

    const refreshTtlSec = effectiveRefreshTtlSec({
      accountType,
      accessExpiresAt: user.accessExpiresAt,
    });
    if (refreshTtlSec <= 0) {
      return jsonError("access_expired", 403);
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role as "admin" | "operario",
      username: user.username,
      device: body.deviceFingerprint,
      accountType,
    });
    const refreshToken = await signRefreshToken(
      {
        sub: user.id,
        role: user.role as "admin" | "operario",
        username: user.username,
        device: body.deviceFingerprint,
        accountType,
      },
      refreshTtlSec,
    );

    await db.insert(schema.sessions).values({
      id: randomUUID(),
      userId: user.id,
      deviceFingerprint: body.deviceFingerprint,
      deviceName: body.deviceName,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSec * 1000).toISOString(),
    });

    return json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        accountType,
        mustChangePassword: Boolean(user.mustChangePassword),
        accessExpiresAt: user.accessExpiresAt,
      },
      accessToken,
      refreshToken,
      accessTokenTtlSec: env.MOBILE_ACCESS_TOKEN_TTL_MIN * 60,
      refreshTokenTtlSec: refreshTtlSec,
    });
  }

  // Rama web: sesión en cookie httpOnly
  await createWebSession(user.id);

  return json({
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
