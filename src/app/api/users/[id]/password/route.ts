import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { requirePrincipal } from "@/lib/auth/principal";

// Un usuario puede cambiar su propia contraseña (requiere currentPassword).
// Un admin puede cambiar la de cualquiera (sin currentPassword si id != self).
const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(100),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;
  const isSelf = principal.userId === id;
  const isAdmin = principal.role === "admin";

  if (!isSelf && !isAdmin) return jsonError("forbidden", 403);

  let body: z.infer<typeof ChangePasswordRequest>;
  try {
    body = await parseJson(request, ChangePasswordRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  const user = rows[0];
  if (!user) return jsonError("not_found", 404);

  // Si es self change, debe proveer currentPassword y debe coincidir
  if (isSelf) {
    if (!body.currentPassword) {
      return jsonError("current_password_required", 400);
    }
    const ok = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) return jsonError("current_password_incorrect", 400);
  }

  const newHash = await hashPassword(body.newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash })
    .where(eq(schema.users.id, id));

  // Revocar todas las sesiones moviles al cambiar password
  await db
    .update(schema.sessions)
    .set({ revoked: true })
    .where(eq(schema.sessions.userId, id));

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: principal.userId,
    action: isSelf ? "PASSWORD_CHANGED_SELF" : "PASSWORD_CHANGED_BY_ADMIN",
    targetId: id,
  });

  return json({ ok: true });
}
