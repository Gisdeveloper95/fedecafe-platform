import { desc } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { createUniqueDemoCode } from "@/lib/auth/demo-tokens";
import { renderDemoTokenEmail, sendEmail } from "@/lib/email/resend";

const CreateDemoTokenRequest = z.object({
  label: z.string().min(1).max(120).optional(),
  ttlDays: z.coerce.number().int().min(1).max(90),
  maxActivations: z.coerce.number().int().min(1).max(50).default(1),
  notes: z.string().max(500).optional(),
  notifyEmail: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const tokens = await db
    .select()
    .from(schema.demoTokens)
    .orderBy(desc(schema.demoTokens.createdAt))
    .limit(500);
  return json({ tokens });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CreateDemoTokenRequest>;
  try {
    body = await parseJson(request, CreateDemoTokenRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const code = await createUniqueDemoCode();
  const expiresAt = new Date(
    Date.now() + body.ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db.insert(schema.demoTokens).values({
    code,
    label: body.label ?? null,
    expiresAt,
    maxActivations: body.maxActivations,
    activationsUsed: 0,
    isRevoked: false,
    createdBy: admin.userId,
    notes: body.notes ?? null,
  });

  await logAudit({
    userId: admin.userId,
    action: "demo_token.created",
    targetId: code,
    details: {
      ttlDays: body.ttlDays,
      maxActivations: body.maxActivations,
      label: body.label,
    },
  });

  let emailResult: { delivery: string; error?: string } | null = null;
  if (body.notifyEmail) {
    const tpl = renderDemoTokenEmail({
      toName: body.label ?? "usuario demo",
      code,
      expiresAt: new Date(expiresAt).toLocaleString("es-CO"),
    });
    const r = await sendEmail({
      to: body.notifyEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    emailResult = { delivery: r.delivery, error: r.error };
  }

  return json(
    {
      token: {
        code,
        label: body.label ?? null,
        expiresAt,
        maxActivations: body.maxActivations,
        activationsUsed: 0,
        isRevoked: false,
      },
      email: emailResult,
    },
    { status: 201 },
  );
}
