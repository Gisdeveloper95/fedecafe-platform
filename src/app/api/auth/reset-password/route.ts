import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { hashToken } from "@/lib/auth/mobile-jwt";
import { hashPassword } from "@/lib/auth/passwords";

const ResetRequest = z.object({
  token: z.string().min(8),
  newPassword: z.string().min(6).max(100),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ResetRequest>;
  try {
    body = await parseJson(request, ResetRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const tokenHash = hashToken(body.token);
  const now = new Date().toISOString();

  const rows = await db
    .select()
    .from(schema.passwordResets)
    .where(
      and(
        eq(schema.passwordResets.tokenHash, tokenHash),
        gte(schema.passwordResets.expiresAt, now),
      ),
    )
    .limit(1);

  const reset = rows[0];
  if (!reset || reset.usedAt) {
    return jsonError("invalid_or_expired_token", 401);
  }

  const newHash = await hashPassword(body.newPassword);

  await db
    .update(schema.users)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(schema.users.id, reset.userId));

  await db
    .update(schema.passwordResets)
    .set({ usedAt: now })
    .where(eq(schema.passwordResets.id, reset.id));

  // Revocar todas las sesiones móviles del usuario
  await db
    .update(schema.sessions)
    .set({ revoked: true })
    .where(eq(schema.sessions.userId, reset.userId));

  await logAudit({
    userId: reset.userId,
    action: "password_reset.completed",
    targetId: reset.userId,
  });

  return json({ ok: true });
}
