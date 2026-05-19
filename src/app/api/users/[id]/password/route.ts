import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
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
  const isAdmin = principal.role === "admin" || principal.role === "developer";

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
  if (user.status === "deleted") return jsonError("not_found", 404);

  // Inmunidad: solo otro developer puede cambiar password a un developer
  if (user.role === "developer" && principal.role !== "developer" && !isSelf) {
    return jsonError("cannot_modify_developer", 403);
  }

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
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(schema.users.id, id));

  // Revocar todas las sesiones móviles al cambiar password
  await db
    .update(schema.sessions)
    .set({ revoked: true })
    .where(eq(schema.sessions.userId, id));

  await logAudit({
    userId: principal.userId,
    action: isSelf ? "password.self_changed" : "password.admin_changed",
    targetId: id,
  });

  return json({ ok: true });
}
