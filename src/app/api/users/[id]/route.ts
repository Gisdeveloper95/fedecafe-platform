import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";

const UpdateUserRequest = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    role: z.enum(["admin", "operario"]).optional(),
    active: z.boolean().optional(),
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
      role: schema.users.role,
      active: schema.users.active,
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

  // Evitar que un admin se desactive/despromueva a si mismo por accidente
  if (id === admin.userId && (body.active === false || body.role === "operario")) {
    return jsonError("cannot_modify_self_critical_fields", 400);
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (existing.length === 0) return jsonError("not_found", 404);

  await db
    .update(schema.users)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(schema.users.id, id));

  // Si se desactiva, revocar todas sus sesiones moviles
  if (body.active === false) {
    await db
      .update(schema.sessions)
      .set({ revoked: true })
      .where(eq(schema.sessions.userId, id));
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "USER_UPDATED",
    targetId: id,
    details: JSON.stringify(body),
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

  // Soft delete: marcar como inactivo + revocar sesiones
  await db
    .update(schema.users)
    .set({ active: false })
    .where(eq(schema.users.id, id));
  await db
    .update(schema.sessions)
    .set({ revoked: true })
    .where(eq(schema.sessions.userId, id));

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "USER_DEACTIVATED",
    targetId: id,
  });

  return json({ ok: true });
}
