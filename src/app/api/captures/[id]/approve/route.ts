import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { logAudit } from "@/lib/audit";
import { json, jsonError } from "@/lib/api/json";
import { requireAdmin } from "@/lib/auth/principal";
import { pushToUser } from "@/lib/push/fcm";

const ApproveRequest = z.object({
  notes: z.string().max(1000).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

type Payload = Record<string, unknown>;

export async function POST(
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

  let body: z.infer<typeof ApproveRequest> = {};
  try {
    const parsed = await request.json().catch(() => null);
    if (parsed && typeof parsed === "object") {
      const result = ApproveRequest.safeParse(parsed);
      if (result.success) body = result.data;
    }
  } catch {
    // body opcional: aceptamos POST vacío
  }

  const rows = await db
    .select()
    .from(schema.pendingCaptures)
    .where(eq(schema.pendingCaptures.id, id))
    .limit(1);
  const capture = rows[0];
  if (!capture) return jsonError("not_found", 404);
  if (capture.state !== "pending" && capture.state !== "needs_info") {
    return jsonError(`capture_in_state_${capture.state}`, 409);
  }

  const payload = (safeParse<Payload>(capture.payloadJson) ?? {}) as Payload;
  if (body.overrides) Object.assign(payload, body.overrides);

  const now = new Date().toISOString();
  let appliedTable: string | null = null;
  let appliedId: string | null = null;
  let applyError: string | null = null;

  try {
    if (capture.opType === "capture_visit") {
      // Visita a un punto existente: no modifica medidor/estructura.
      // Solo deja el registro de visita asociado (audit + opcional foto en ruta_items).
      appliedTable = "ruta_items";
      appliedId = capture.targetId;
      if (capture.rutaId && capture.targetId) {
        await db
          .update(schema.rutaItems)
          .set({ visitado: true, visitadoAt: capture.capturedAt })
          .where(eq(schema.rutaItems.rutaId, capture.rutaId));
      }
    } else if (capture.opType === "create_medidor") {
      const contrato = String(payload.contrato ?? "").trim();
      if (!contrato) throw new Error("contrato_required");
      const exists = await db
        .select({ contrato: schema.medidores.contrato })
        .from(schema.medidores)
        .where(eq(schema.medidores.contrato, contrato))
        .limit(1);
      if (exists.length > 0) throw new Error("contrato_already_exists");

      await db.insert(schema.medidores).values({
        contrato,
        latitude: Number(payload.latitude ?? capture.gpsLat),
        longitude: Number(payload.longitude ?? capture.gpsLon),
        nombre: payload.nombre ? String(payload.nombre) : null,
        direccion: payload.direccion ? String(payload.direccion) : null,
        municipio: payload.municipio ? String(payload.municipio) : null,
        usuario: payload.usuario ? String(payload.usuario) : null,
      });
      appliedTable = "medidores";
      appliedId = contrato;
    } else if (capture.opType === "update_medidor") {
      const contrato = capture.targetId;
      if (!contrato) throw new Error("target_id_required");
      const exists = await db
        .select()
        .from(schema.medidores)
        .where(eq(schema.medidores.contrato, contrato))
        .limit(1);
      if (exists.length === 0) throw new Error("medidor_not_found");
      const update: Record<string, unknown> = {
        updatedAt: now,
      };
      if (payload.latitude !== undefined) update.latitude = Number(payload.latitude);
      if (payload.longitude !== undefined) update.longitude = Number(payload.longitude);
      if (payload.nombre !== undefined) update.nombre = payload.nombre;
      if (payload.direccion !== undefined) update.direccion = payload.direccion;
      if (payload.municipio !== undefined) update.municipio = payload.municipio;
      if (payload.usuario !== undefined) update.usuario = payload.usuario;
      await db
        .update(schema.medidores)
        .set(update)
        .where(eq(schema.medidores.contrato, contrato));
      appliedTable = "medidores";
      appliedId = contrato;
    } else if (capture.opType === "create_estructura") {
      const codigo = String(payload.codigo ?? "").trim();
      if (!codigo) throw new Error("codigo_required");
      const exists = await db
        .select({ codigo: schema.estructuras.codigo })
        .from(schema.estructuras)
        .where(eq(schema.estructuras.codigo, codigo))
        .limit(1);
      if (exists.length > 0) throw new Error("codigo_already_exists");
      await db.insert(schema.estructuras).values({
        codigo,
        layerName: String(payload.layerName ?? "default"),
        latitude: Number(payload.latitude ?? capture.gpsLat),
        longitude: Number(payload.longitude ?? capture.gpsLon),
        nombre: payload.nombre ? String(payload.nombre) : null,
        tipo: payload.tipo ? String(payload.tipo) : null,
        estado: payload.estado ? String(payload.estado) : null,
        municipio: payload.municipio ? String(payload.municipio) : null,
      });
      appliedTable = "estructuras";
      appliedId = codigo;
    } else if (capture.opType === "update_estructura") {
      const codigo = capture.targetId;
      if (!codigo) throw new Error("target_id_required");
      const update: Record<string, unknown> = { updatedAt: now };
      if (payload.latitude !== undefined) update.latitude = Number(payload.latitude);
      if (payload.longitude !== undefined) update.longitude = Number(payload.longitude);
      if (payload.nombre !== undefined) update.nombre = payload.nombre;
      if (payload.tipo !== undefined) update.tipo = payload.tipo;
      if (payload.estado !== undefined) update.estado = payload.estado;
      if (payload.municipio !== undefined) update.municipio = payload.municipio;
      await db
        .update(schema.estructuras)
        .set(update)
        .where(eq(schema.estructuras.codigo, codigo));
      appliedTable = "estructuras";
      appliedId = codigo;
    } else if (capture.opType === "create_tuberia") {
      const codigo = String(payload.codigo ?? "").trim();
      if (!codigo) throw new Error("codigo_required");
      const exists = await db
        .select({ codigo: schema.tuberias.codigo })
        .from(schema.tuberias)
        .where(eq(schema.tuberias.codigo, codigo))
        .limit(1);
      if (exists.length > 0) throw new Error("codigo_already_exists");
      await db.insert(schema.tuberias).values({
        codigo,
        layerName: String(payload.layerName ?? payload.layer_name ?? "tuberias"),
        material: payload.material ? String(payload.material) : null,
        diametro: payload.diametro ? String(payload.diametro) : null,
        ramal: payload.ramal ? String(payload.ramal) : null,
        municipio: payload.municipio ? String(payload.municipio) : null,
        acueducto: payload.acueducto ? String(payload.acueducto) : null,
        longitudM: payload.longitud != null ? Number(payload.longitud) : null,
        centroidLat:
          payload.centroid_lat != null
            ? Number(payload.centroid_lat)
            : capture.gpsLat ?? null,
        centroidLon:
          payload.centroid_lon != null
            ? Number(payload.centroid_lon)
            : capture.gpsLon ?? null,
        geometryJson: payload.geometry_json
          ? String(payload.geometry_json)
          : null,
      });
      appliedTable = "tuberias";
      appliedId = codigo;
    } else if (capture.opType === "update_tuberia") {
      const codigo = capture.targetId;
      if (!codigo) throw new Error("target_id_required");
      const update: Record<string, unknown> = { updatedAt: now };
      if (payload.material !== undefined) update.material = payload.material;
      if (payload.diametro !== undefined) update.diametro = payload.diametro;
      if (payload.ramal !== undefined) update.ramal = payload.ramal;
      if (payload.municipio !== undefined) update.municipio = payload.municipio;
      if (payload.acueducto !== undefined) update.acueducto = payload.acueducto;
      if (payload.longitud !== undefined) update.longitudM = Number(payload.longitud);
      if (payload.centroid_lat !== undefined)
        update.centroidLat = Number(payload.centroid_lat);
      if (payload.centroid_lon !== undefined)
        update.centroidLon = Number(payload.centroid_lon);
      if (payload.geometry_json !== undefined)
        update.geometryJson = payload.geometry_json;
      await db
        .update(schema.tuberias)
        .set(update)
        .where(eq(schema.tuberias.codigo, codigo));
      appliedTable = "tuberias";
      appliedId = codigo;
    } else if (
      capture.opType === "mark_removed" ||
      capture.opType === "mark_removed_medidor" ||
      capture.opType === "mark_removed_estructura" ||
      capture.opType === "mark_removed_tuberia"
    ) {
      // Borrado lógico: la entidad va al log de auditoría. No la borramos de la
      // tabla productiva todavía (mantener el historial; admin puede borrar manual).
      appliedTable = "audit_log";
      appliedId = capture.targetId;
    } else if (capture.opType === "report_anomaly") {
      // Insertar en estructura_anomalies con el payload del operario.
      const anomalyId = randomUUID();
      await db.insert(schema.estructuraAnomalies).values({
        id: anomalyId,
        targetType: (capture.targetType ?? "estructura") as
          | "medidor"
          | "estructura"
          | "tuberia",
        targetId: String(capture.targetId ?? payload.targetId ?? "(sin id)"),
        severity:
          (payload.severity as "info" | "warning" | "critical" | undefined) ??
          "warning",
        title: String(payload.title ?? "Anomalía reportada"),
        description: payload.description ? String(payload.description) : null,
        reportedBy: capture.operarioId,
        gpsLat: capture.gpsLat ?? null,
        gpsLon: capture.gpsLon ?? null,
        attachmentsJson: capture.attachmentsJson,
        sourceCaptureId: capture.id,
      });
      appliedTable = "estructura_anomalies";
      appliedId = anomalyId;
    }
  } catch (err) {
    applyError = err instanceof Error ? err.message : String(err);
  }

  const newState = applyError ? "apply_failed" : "approved";
  await db
    .update(schema.pendingCaptures)
    .set({
      state: newState,
      reviewedBy: admin.userId,
      reviewedAt: now,
      reviewNotes: body.notes ?? null,
      appliedToTable: appliedTable,
      appliedToId: appliedId,
      appliedAt: applyError ? null : now,
      applyError,
    })
    .where(eq(schema.pendingCaptures.id, id));

  await logAudit({
    userId: admin.userId,
    action: applyError ? "capture.apply_failed" : "capture.approved",
    targetId: id,
    details: { appliedTable, appliedId, applyError },
  });

  if (applyError) {
    return jsonError(applyError, 422, { captureId: id });
  }

  // Push notif al operario que envió la captura (silencioso si FCM no está)
  pushToUser(capture.operarioId, {
    kind: "captura_aprobada",
    title: "Captura aprobada",
    body: `Tu ${humanOpType(capture.opType)} fue aprobada.`,
    data: { captureId: id },
  }).catch(() => {
    /* no-op */
  });

  return json({
    id,
    state: newState,
    appliedToTable: appliedTable,
    appliedToId: appliedId,
    appliedAt: now,
  });
}

function humanOpType(op: string): string {
  switch (op) {
    case "create_medidor":
      return "captura de medidor nuevo";
    case "update_medidor":
      return "actualización de medidor";
    case "create_estructura":
      return "captura de estructura nueva";
    case "update_estructura":
      return "actualización de estructura";
    case "create_tuberia":
      return "captura de tubería nueva";
    case "update_tuberia":
      return "actualización de tubería";
    case "capture_visit":
      return "visita";
    case "report_anomaly":
      return "anomalía reportada";
    default:
      return "captura";
  }
}

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
