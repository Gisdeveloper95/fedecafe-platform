import { randomUUID } from "node:crypto";

import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { hashPassword } from "@/lib/auth/passwords";
import { requireAdmin } from "@/lib/auth/principal";
import { env } from "@/lib/env";
import {
  renderCredentialsEmail,
  sendEmail,
} from "@/lib/email/mailer";

const CreateUserRequest = z.object({
  username: z.string().min(3).max(50).regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(6).max(100).optional(),
  fullName: z.string().min(2).max(120),
  role: z.enum(["admin", "operario"]),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sendCredentials: z.boolean().optional().default(false),
  mustChangePassword: z.boolean().optional().default(true),
});

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = new Array(10);
  for (let i = 0; i < chars.length; i++) {
    chars[i] = alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return chars.join("");
}

export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const where = [];
  if (role === "admin" || role === "operario") {
    where.push(eq(schema.users.role, role));
  }
  if (status === "active" || status === "suspended" || status === "deleted") {
    where.push(eq(schema.users.status, status));
  } else if (!includeDeleted) {
    where.push(ne(schema.users.status, "deleted"));
  }
  // Solo developer ve developers. Para admin normal el rol está oculto.
  if (caller.role !== "developer") {
    where.push(ne(schema.users.role, "developer"));
  }

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

  if (body.sendCredentials && !body.email) {
    return jsonError("email_required_when_sendCredentials", 400);
  }

  const id = randomUUID();
  const tempPassword = body.password ?? generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db.insert(schema.users).values({
    id,
    username,
    passwordHash,
    fullName: body.fullName,
    email: body.email ?? null,
    role: body.role,
    status: "active",
    accountType: "regular",
    mustChangePassword: body.mustChangePassword,
    active: true,
    createdBy: admin.userId,
  });

  await logAudit({
    userId: admin.userId,
    action: "user.created",
    targetId: id,
    details: { username, role: body.role, email: body.email ?? null },
  });

  let emailResult: { delivery: string; error?: string } | null = null;
  if (body.sendCredentials && body.email) {
    const tpl = renderCredentialsEmail({
      fullName: body.fullName,
      username,
      tempPassword,
      loginUrl: env.BETTER_AUTH_URL + "/login",
    });
    const r = await sendEmail({
      to: body.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    emailResult = { delivery: r.delivery, error: r.error };
  }

  return json(
    {
      user: {
        id,
        username,
        fullName: body.fullName,
        email: body.email ?? null,
        role: body.role,
        status: "active",
        accountType: "regular",
        mustChangePassword: body.mustChangePassword,
      },
      tempPassword: body.password ? undefined : tempPassword,
      email: emailResult,
    },
    { status: 201 },
  );
}
