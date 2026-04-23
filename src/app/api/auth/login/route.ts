import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { verifyPassword } from "@/lib/auth/passwords";
import {
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
  if (!user || !user.active) {
    return jsonError("invalid_credentials", 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return jsonError("invalid_credentials", 401);
  }

  // Actualizar last_login
  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  // Rama mobile: emitir tokens JWT y registrar sesión de dispositivo
  if (body.mobile) {
    if (!body.deviceFingerprint) {
      return jsonError("device_fingerprint_required_for_mobile", 400);
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role as "admin" | "operario",
      username: user.username,
      device: body.deviceFingerprint,
    });
    const refreshToken = await signRefreshToken({
      sub: user.id,
      role: user.role as "admin" | "operario",
      username: user.username,
      device: body.deviceFingerprint,
    });

    const refreshTtlMs =
      env.MOBILE_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

    await db.insert(schema.sessions).values({
      id: randomUUID(),
      userId: user.id,
      deviceFingerprint: body.deviceFingerprint,
      deviceName: body.deviceName,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlMs).toISOString(),
    });

    return json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      accessToken,
      refreshToken,
      accessTokenTtlSec: env.MOBILE_ACCESS_TOKEN_TTL_MIN * 60,
      refreshTokenTtlSec: env.MOBILE_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
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
    },
  });
}
