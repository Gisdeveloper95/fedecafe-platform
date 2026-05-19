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
import { sendEmail } from "@/lib/email/mailer";
import { env } from "@/lib/env";

const ActivateDemoRequest = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceFingerprint: z.string().min(1),
  deviceName: z.string().optional(),
  fullName: z.string().min(2).max(120).optional(),
  email: z.string().email(),
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

  let isFirstActivation = false;
  if (!user) {
    isFirstActivation = true;
    const id = randomUUID();
    const tempPasswordHash = await hashPassword(randomUUID());
    await db.insert(schema.users).values({
      id,
      username,
      passwordHash: tempPasswordHash,
      fullName: body.fullName ?? `Demo ${body.code}`,
      email: body.email,
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
    details: { device: body.deviceName ?? null, email: body.email },
  });

  // Correo de bienvenida en la primera activación (no resend si re-activa
  // desde el mismo device, no spam).
  if (isFirstActivation) {
    const ms = new Date(token.expiresAt).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    const expiresHuman = new Date(token.expiresAt).toLocaleString("es-CO");
    sendEmail({
      to: body.email,
      subject: "Tu acceso demo a Rutas Fedecafe está activo",
      text: `Hola ${user.fullName},

Activaste el código demo ${token.code} en Rutas Fedecafe.

Tu acceso está vigente desde hoy y durará ${days} días (hasta ${expiresHuman}).

Durante este tiempo puedes usar la app móvil con todas las funcionalidades
de operario (mapas offline, captura de visitas, sincronización).

Al vencer el período, la app cerrará tu sesión automáticamente. Si quieres
extender el acceso, contacta a tu administrador.

— Fedecafe Plataforma`,
      html: `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
  <tr><td style="background:#0f4d3a;padding:20px 24px;color:#fff;font-size:18px;font-weight:600;">Rutas Fedecafe</td></tr>
  <tr><td style="padding:24px;">
    <h2 style="margin:0 0 12px 0;font-size:18px;color:#111827;">Demo activado</h2>
    <p style="color:#374151;line-height:1.5;">Hola ${user.fullName},</p>
    <p style="color:#374151;line-height:1.5;">Tu acceso demo está activo desde ahora.</p>
    <table style="margin:16px 0;background:#f3f4f6;border-radius:6px;width:100%;">
      <tr><td style="padding:10px 14px;color:#6b7280;width:140px;">Código</td><td style="padding:10px 14px;font-family:monospace;font-size:18px;font-weight:700;color:#0f4d3a;">${token.code}</td></tr>
      <tr><td style="padding:10px 14px;color:#6b7280;">Duración</td><td style="padding:10px 14px;color:#111827;">${days} días</td></tr>
      <tr><td style="padding:10px 14px;color:#6b7280;">Vence</td><td style="padding:10px 14px;color:#111827;">${expiresHuman}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.5;font-size:13px;">Al vencer el período, la app cerrará tu sesión automáticamente. Para extender, contacta a tu administrador.</p>
  </td></tr>
  <tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;background:#f9fafb;">Mensaje automático. No respondas a este correo.</td></tr>
</table>
</td></tr></table></body></html>`,
    }).catch((err) => {
      console.warn("[activate-demo] no se pudo enviar correo:", err);
    });
  }

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
