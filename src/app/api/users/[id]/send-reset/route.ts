import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { hashToken } from "@/lib/auth/mobile-jwt";
import { env } from "@/lib/env";
import {
  renderPasswordResetEmail,
  sendEmail,
} from "@/lib/email/mailer";

/**
 * Admin-triggered password reset.
 * Genera un enlace de reset y lo envía al correo del usuario.
 * Útil cuando el usuario olvidó su contraseña y le da pereza pedirla.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  const user = rows[0];
  if (!user) return jsonError("not_found", 404);
  if (!user.email) {
    return jsonError("user_has_no_email", 400);
  }
  if (user.status === "deleted") {
    return jsonError("cannot_reset_deleted_user", 400);
  }
  if (user.role === "developer" && admin.role !== "developer") {
    return jsonError("cannot_modify_developer", 403);
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const ttlMs = env.PASSWORD_RESET_TTL_MIN * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db.insert(schema.passwordResets).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${env.BETTER_AUTH_URL}/reset-password?token=${rawToken}`;
  const tpl = renderPasswordResetEmail({
    fullName: user.fullName,
    resetUrl,
    ttlMinutes: env.PASSWORD_RESET_TTL_MIN,
  });
  const sent = await sendEmail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  await logAudit({
    userId: admin.userId,
    action: "password_reset.admin_sent",
    targetId: user.id,
    details: { delivery: sent.delivery },
  });

  return json({
    ok: true,
    delivery: sent.delivery,
    email: user.email,
  });
}
