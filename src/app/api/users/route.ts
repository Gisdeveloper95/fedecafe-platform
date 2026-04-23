import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { hashPassword } from "@/lib/auth/passwords";
import { requireAdmin } from "@/lib/auth/principal";

const CreateUserRequest = z.object({
  username: z.string().min(3).max(50).regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(6).max(100),
  fullName: z.string().min(2).max(120),
  role: z.enum(["admin", "operario"]),
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const where = [];
  if (role === "admin" || role === "operario") {
    where.push(eq(schema.users.role, role));
  }
  if (!includeInactive) {
    where.push(eq(schema.users.active, true));
  }

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
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.users.createdAt));

  return json({ users: rows });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CreateUserRequest>;
  try {
    body = await parseJson(request, CreateUserRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const username = body.username.toLowerCase().trim();

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return jsonError("username_taken", 409);
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(body.password);

  await db.insert(schema.users).values({
    id,
    username,
    passwordHash,
    fullName: body.fullName,
    role: body.role,
    active: true,
    createdBy: admin.userId,
  });

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "USER_CREATED",
    targetId: id,
    details: JSON.stringify({ username, role: body.role }),
  });

  return json(
    {
      user: {
        id,
        username,
        fullName: body.fullName,
        role: body.role,
        active: true,
      },
    },
    { status: 201 },
  );
}
