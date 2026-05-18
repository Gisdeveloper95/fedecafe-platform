import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, parseJson } from "@/lib/api/json";
import { hashToken } from "@/lib/auth/mobile-jwt";
import { env } from "@/lib/env";
import {
  renderPasswordResetEmail,
  sendEmail,
} from "@/lib/email/mailer";

const ForgotRequest = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ForgotRequest>;
  try {
    body = await parseJson(request, ForgotRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Por seguridad: respondemos siempre 200 incluso si el email no existe
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1);

  const user = rows[0];
  if (!user || user.status !== "active" || user.accountType !== "regular") {
    return json({ ok: true });
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
  await sendEmail({
    to: body.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  await logAudit({
    userId: user.id,
    action: "password_reset.requested",
    targetId: user.id,
  });

  return json({ ok: true });
}
