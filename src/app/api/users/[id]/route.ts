import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const UpdateUserRequest = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    role: z.enum(["admin", "operario"]).optional(),
    email: z.string().email().nullable().optional(),
    status: z.enum(["active", "suspended", "deleted"]).optional(),
    accessExpiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_payload" });

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await ctx.params;
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      email: schema.users.email,
      role: schema.users.role,
      status: schema.users.status,
      accountType: schema.users.accountType,
      mustChangePassword: schema.users.mustChangePassword,
      accessExpiresAt: schema.users.accessExpiresAt,
      demoTokenCode: schema.users.demoTokenCode,
      createdAt: schema.users.createdAt,
      createdBy: schema.users.createdBy,
      lastLoginAt: schema.users.lastLoginAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  const user = rows[0];
  if (!user) return jsonError("not_found", 404);
  return json({ user });
}

export async function PATCH(
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

  let body: z.infer<typeof UpdateUserRequest>;
  try {
    body = await parseJson(request, UpdateUserRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (
    id === admin.userId &&
    (body.status === "suspended" ||
      body.status === "deleted" ||
      body.role === "operario")
  ) {
    return jsonError("cannot_modify_self_critical_fields", 400);
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  const update: Record<string, unknown> = {};
  if (body.fullName !== undefined) update.fullName = body.fullName;
  if (body.role !== undefined) update.role = body.role;
  if (body.email !== undefined) update.email = body.email;
  if (body.status !== undefined) {
    update.status = body.status;
    update.active = body.status === "active";
  }
  if (body.accessExpiresAt !== undefined) {
    update.accessExpiresAt = body.accessExpiresAt;
  }

  await db.update(schema.users).set(update).where(eq(schema.users.id, id));

  // Si se suspende/borra, revocar todas sus sesiones móviles
  if (body.status === "suspended" || body.status === "deleted") {
    await db
      .update(schema.sessions)
      .set({ revoked: true })
      .where(eq(schema.sessions.userId, id));
    await db
      .delete(schema.webSessions)
      .where(eq(schema.webSessions.userId, id));
  }

  await logAudit({
    userId: admin.userId,
    action: "user.updated",
    targetId: id,
    details: body,
  });

  return json({ ok: true });
}

export async function DELETE(
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

  if (id === admin.userId) {
    return jsonError("cannot_delete_self", 400);
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  await db
    .update(schema.users)
    .set({ status: "deleted", active: false })
    .where(eq(schema.users.id, id));
  await db
    .update(schema.sessions)
    .set({ revoked: true })
    .where(eq(schema.sessions.userId, id));
  await db
    .delete(schema.webSessions)
    .where(eq(schema.webSessions.userId, id));

  await logAudit({
    userId: admin.userId,
    action: "user.deleted",
    targetId: id,
  });

  return json({ ok: true });
}
