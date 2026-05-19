import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requirePrincipal } from "@/lib/auth/principal";
import {
  getIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import { pushToAdmins } from "@/lib/push/fcm";
import { headObject, isR2Configured } from "@/lib/storage/r2";

const OP_TYPES = [
  "capture_visit",
  "create_medidor",
  "update_medidor",
  "mark_removed_medidor",
  "create_estructura",
  "update_estructura",
  "mark_removed_estructura",
  "create_tuberia",
  "update_tuberia",
  "mark_removed_tuberia",
  "mark_removed", // legacy genérico
  "report_anomaly",
] as const;

const CaptureRequest = z.object({
  id: z.string().uuid(),
  opType: z.enum(OP_TYPES),
  targetType: z.enum(["medidor", "estructura", "tuberia"]),
  targetId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  attachments: z
    .array(z.string().min(1))
    .max(10)
    .optional()
    .default([]),
  capturedAt: z.string().datetime(),
  rutaId: z.string().uuid().nullable().optional(),
  gps: z
    .object({
      lat: z.number(),
      lon: z.number(),
      accuracy: z.number().optional(),
    })
    .nullable()
    .optional(),
});

type CaptureResponse = {
  id: string;
  state: string;
  uploadedAt: string;
  missingAttachments?: string[];
};

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CaptureRequest>;
  try {
    body = await parseJson(request, CaptureRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Idempotency: si ya vimos este id, devolver respuesta original
  const prior = await getIdempotentResponse<CaptureResponse>({
    key: body.id,
    scope: "captures",
  });
  if (prior) return json(prior);

  // Verificar que los attachments existan en R2 (si hay alguno)
  let missing: string[] = [];
  if (body.attachments && body.attachments.length > 0) {
    if (!isR2Configured()) {
      // En dev sin R2, aceptamos sin verificar
      missing = [];
    } else {
      const checks = await Promise.all(
        body.attachments.map(async (k) => ({
          key: k,
          head: await headObject(k),
        })),
      );
      missing = checks.filter((c) => !c.head.exists).map((c) => c.key);
      if (missing.length > 0) {
        return jsonError("attachments_not_uploaded", 409, { missing });
      }
    }
  }

  // Validaciones específicas por op_type
  if (body.opType === "capture_visit") {
    if (!body.targetId) {
      return jsonError("target_id_required_for_visit", 400);
    }
  }
  if (
    (body.opType === "update_medidor" ||
      body.opType === "update_estructura" ||
      body.opType === "mark_removed") &&
    !body.targetId
  ) {
    return jsonError("target_id_required_for_update", 400);
  }

  const uploadedAt = new Date().toISOString();
  await db.insert(schema.pendingCaptures).values({
    id: body.id,
    opType: body.opType,
    targetType: body.targetType,
    targetId: body.targetId ?? null,
    payloadJson: JSON.stringify(body.payload),
    attachmentsJson: JSON.stringify(body.attachments ?? []),
    operarioId: principal.userId,
    rutaId: body.rutaId ?? null,
    deviceFingerprint: null,
    capturedAt: body.capturedAt,
    uploadedAt,
    gpsLat: body.gps?.lat ?? null,
    gpsLon: body.gps?.lon ?? null,
    gpsAccuracy: body.gps?.accuracy ?? null,
    state: "pending",
  });

  await logAudit({
    userId: principal.userId,
    action: `capture.uploaded.${body.opType}`,
    targetId: body.id,
    details: { targetType: body.targetType, targetId: body.targetId },
  });

  const response: CaptureResponse = {
    id: body.id,
    state: "pending",
    uploadedAt,
  };
  await storeIdempotentResponse({
    key: body.id,
    scope: "captures",
    response,
  });

  // Notif a admins de que hay una captura nueva por revisar
  pushToAdmins({
    kind: "captura_pendiente",
    title: "Nueva captura por revisar",
    body: `${body.opType} sobre ${body.targetType} ${body.targetId ?? "(nuevo)"}`,
    data: { captureId: body.id, opType: body.opType },
  }).catch(() => {
    /* no-op */
  });

  return json(response, { status: 201 });
}

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
  const opType = url.searchParams.get("opType");
  const operarioFilter = url.searchParams.get("operarioId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10),
    500,
  );

  // Operarios solo ven sus propias capturas; admin ve todas
  const where = [];
  if (principal.role === "operario") {
    where.push(eq(schema.pendingCaptures.operarioId, principal.userId));
  } else if (operarioFilter) {
    where.push(eq(schema.pendingCaptures.operarioId, operarioFilter));
  }
  if (
    state === "pending" ||
    state === "approved" ||
    state === "rejected" ||
    state === "needs_info" ||
    state === "apply_failed"
  ) {
    where.push(eq(schema.pendingCaptures.state, state));
  }
  if (opType && (OP_TYPES as readonly string[]).includes(opType)) {
    where.push(eq(schema.pendingCaptures.opType, opType as typeof OP_TYPES[number]));
  }

  const rows = await db
    .select()
    .from(schema.pendingCaptures)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.pendingCaptures.uploadedAt))
    .limit(limit);

  // Enriquecer con nombres de operario
  const operarioIds = Array.from(new Set(rows.map((r) => r.operarioId)));
  const operarios =
    operarioIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            fullName: schema.users.fullName,
            username: schema.users.username,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, operarioIds))
      : [];
  const operarioMap = new Map(operarios.map((u) => [u.id, u]));

  return json({
    captures: rows.map((r) => ({
      ...r,
      payload: tryParse(r.payloadJson),
      attachments: tryParse<string[]>(r.attachmentsJson) ?? [],
      operario: operarioMap.get(r.operarioId) ?? null,
    })),
  });
}

function tryParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
