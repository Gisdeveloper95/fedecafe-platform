import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { validateDemoTokenForActivation } from "@/lib/auth/demo-tokens";
import { describeAccountBlock, getGlobalLockdown } from "@/lib/auth/lockdown";
import {
  effectiveRefreshTtlSec,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth/mobile-jwt";
import { hashPassword } from "@/lib/auth/passwords";
import { env } from "@/lib/env";

const ActivateDemoRequest = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceFingerprint: z.string().min(1),
  deviceName: z.string().optional(),
  fullName: z.string().min(2).max(120).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ActivateDemoRequest>;
  try {
    body = await parseJson(request, ActivateDemoRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const lockdown = await getGlobalLockdown();
  if (lockdown.enabled) {
    return jsonError("global_lockdown", 503);
  }

  const validation = await validateDemoTokenForActivation(body.code);
  if (!validation.ok) {
    return jsonError(validation.reason, 401);
  }
  const token = validation.token;

  // Crear (o re-utilizar) un usuario demo asociado al token + dispositivo
  const username = `demo_${body.code}_${body.deviceFingerprint.slice(0, 8)}`;

  let user = (
    await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1)
  )[0];

  if (!user) {
    const id = randomUUID();
    const tempPasswordHash = await hashPassword(randomUUID());
    await db.insert(schema.users).values({
      id,
      username,
      passwordHash: tempPasswordHash,
      fullName: body.fullName ?? `Demo ${body.code}`,
      role: "operario",
      status: "active",
      accountType: "demo",
      accessExpiresAt: token.expiresAt,
      demoTokenCode: token.code,
      mustChangePassword: false,
      active: true,
      createdBy: token.createdBy,
    });
    user = (
      await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1)
    )[0]!;

    await db
      .update(schema.demoTokens)
      .set({ activationsUsed: token.activationsUsed + 1 })
      .where(eq(schema.demoTokens.code, token.code));
  } else {
    // Si el usuario ya existe pero está suspendido por token revocado, no permitir
    const block = describeAccountBlock({
      status: user.status,
      accountType: user.accountType,
      accessExpiresAt: user.accessExpiresAt,
    });
    if (!block.allowed) {
      return jsonError(block.reason, 403);
    }
  }

  const refreshTtlSec = effectiveRefreshTtlSec({
    accountType: "demo",
    accessExpiresAt: user.accessExpiresAt,
  });
  if (refreshTtlSec <= 0) {
    return jsonError("demo_token_expired", 403);
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    role: "operario",
    username: user.username,
    device: body.deviceFingerprint,
    accountType: "demo",
  });
  const refreshToken = await signRefreshToken(
    {
      sub: user.id,
      role: "operario",
      username: user.username,
      device: body.deviceFingerprint,
      accountType: "demo",
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

  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  await logAudit({
    userId: user.id,
    action: "demo.activated",
    targetId: token.code,
    details: { device: body.deviceName ?? null },
  });

  return json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: "operario",
      accountType: "demo",
      mustChangePassword: false,
      accessExpiresAt: user.accessExpiresAt,
    },
    accessToken,
    refreshToken,
    accessTokenTtlSec: env.MOBILE_ACCESS_TOKEN_TTL_MIN * 60,
    refreshTokenTtlSec: refreshTtlSec,
  });
}
