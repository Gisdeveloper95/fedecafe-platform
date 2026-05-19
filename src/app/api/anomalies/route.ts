import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";

const CreateAnomalyRequest = z.object({
  targetType: z.enum(["medidor", "estructura", "tuberia"]),
  targetId: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLon: z.number().min(-180).max(180).optional(),
  attachments: z.array(z.string()).max(10).optional(),
  sourceCaptureId: z.string().optional(),
});

export async function GET(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const targetType = url.searchParams.get("targetType");

  const where = [];
  if (principal.role === "operario") {
    where.push(eq(schema.estructuraAnomalies.reportedBy, principal.userId));
  }
  if (
    state === "open" ||
    state === "in_progress" ||
    state === "resolved" ||
    state === "discarded"
  ) {
    where.push(eq(schema.estructuraAnomalies.state, state));
  }
  if (
    targetType === "medidor" ||
    targetType === "estructura" ||
    targetType === "tuberia"
  ) {
    where.push(eq(schema.estructuraAnomalies.targetType, targetType));
  }

  const rows = await db
    .select()
    .from(schema.estructuraAnomalies)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.estructuraAnomalies.reportedAt))
    .limit(200);

  return json({ anomalies: rows });
}

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CreateAnomalyRequest>;
  try {
    body = await parseJson(request, CreateAnomalyRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const id = randomUUID();
  await db.insert(schema.estructuraAnomalies).values({
    id,
    targetType: body.targetType,
    targetId: body.targetId,
    severity: body.severity,
    title: body.title,
    description: body.description ?? null,
    reportedBy: principal.userId,
    gpsLat: body.gpsLat ?? null,
    gpsLon: body.gpsLon ?? null,
    attachmentsJson:
      body.attachments && body.attachments.length > 0
        ? JSON.stringify(body.attachments)
        : null,
    sourceCaptureId: body.sourceCaptureId ?? null,
  });

  await logAudit({
    userId: principal.userId,
    action: "anomaly.created",
    targetId: id,
    details: {
      targetType: body.targetType,
      targetId: body.targetId,
      severity: body.severity,
    },
  });

  return json({ id, state: "open" }, { status: 201 });
}

export async function PATCH(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  if (principal.role !== "admin") {
    return jsonError("forbidden", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    state?: "open" | "in_progress" | "resolved" | "discarded";
    resolutionNotes?: string;
  } | null;
  if (!body || !body.id || !body.state) {
    return jsonError("id_and_state_required", 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.estructuraAnomalies)
    .set({
      state: body.state,
      resolvedBy:
        body.state === "resolved" || body.state === "discarded"
          ? principal.userId
          : null,
      resolvedAt:
        body.state === "resolved" || body.state === "discarded" ? now : null,
      resolutionNotes: body.resolutionNotes ?? null,
    })
    .where(eq(schema.estructuraAnomalies.id, body.id));

  await logAudit({
    userId: principal.userId,
    action: `anomaly.${body.state}`,
    targetId: body.id,
  });

  return json({ ok: true, id: body.id, state: body.state });
}
