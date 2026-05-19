import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin, requirePrincipal } from "@/lib/auth/principal";
import { pushToUser } from "@/lib/push/fcm";

/// `operarioId` (legacy, 1 operario) o `operarioIds[]` (multi). Si vienen
/// ambos, se unen.
const OperariosField = z
  .object({
    operarioId: z.string().uuid().optional(),
    operarioIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  })
  .refine((v) => v.operarioId || (v.operarioIds && v.operarioIds.length > 0), {
    message: "operarioId_or_operarioIds_required",
  });

/// Forma legacy: solo códigos. Mantenida por compatibilidad con /rutas/nueva.
const LegacyCreateRutaRequest = z
  .object({
    nombre: z.string().min(1).max(200),
    tipo: z.enum(["medidores", "estructuras"]),
    operarioId: z.string().uuid().optional(),
    operarioIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    codigos: z.array(z.string().min(1)).min(1).max(500),
    fechaObjetivo: z.string().date().optional(),
    notas: z.string().max(1000).optional(),
    startPoint: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        label: z.string().optional(),
        favoriteId: z.string().optional(),
      })
      .optional(),
  })
  .refine((v) => v.operarioId || (v.operarioIds && v.operarioIds.length > 0), {
    message: "operarioId_or_operarioIds_required",
  });

/// Forma rica: items mixtos (entidades existentes + waypoints arbitrarios).
const RichCreateRutaRequest = z
  .object({
    nombre: z.string().min(1).max(200),
    tipo: z.enum(["medidores", "estructuras"]),
    operarioId: z.string().uuid().optional(),
    operarioIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    items: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("entity"),
            codigo: z.string().min(1),
          }),
          z.object({
            kind: z.literal("waypoint"),
            codigo: z.string().min(1),
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180),
            label: z.string().max(120).optional(),
          }),
        ]),
      )
      .min(1)
      .max(500),
    fechaObjetivo: z.string().date().optional(),
    notas: z.string().max(1000).optional(),
    startPoint: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        label: z.string().optional(),
        favoriteId: z.string().optional(),
      })
      .optional(),
  })
  .refine((v) => v.operarioId || (v.operarioIds && v.operarioIds.length > 0), {
    message: "operarioId_or_operarioIds_required",
  });

type RichItem = z.infer<typeof RichCreateRutaRequest>["items"][number];

const CreateRutaRequest = z.union([
  RichCreateRutaRequest,
  LegacyCreateRutaRequest,
]);
void OperariosField; // tipo auxiliar exportado para futuras refactors

export async function GET(request: Request) {
  let principal;
  try {
    principal = await requirePrincipal(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "auto";
  const estado = url.searchParams.get("estado");

  // Operarios solo ven rutas donde están asignados (sea como operario_id
  // legacy o como miembro de ruta_assignees). Admin puede ver todas, salvo
  // que pida scope=mias para ver solo las suyas.
  const filterByOperario =
    principal.role === "operario" || scope === "mias"
      ? principal.userId
      : null;

  const where = [];
  if (filterByOperario) {
    // Ruta visible si: operario_id == X, O existe en ruta_assignees con operario_id == X
    where.push(
      or(
        eq(schema.rutas.operarioId, filterByOperario),
        sql`EXISTS (SELECT 1 FROM ruta_assignees ra WHERE ra.ruta_id = ${schema.rutas.id} AND ra.operario_id = ${filterByOperario})`,
      )!,
    );
  }
  if (
    estado === "pendiente" ||
    estado === "en_curso" ||
    estado === "completada" ||
    estado === "archivada"
  ) {
    where.push(eq(schema.rutas.estado, estado));
  }

  const rutas = await db
    .select({
      id: schema.rutas.id,
      nombre: schema.rutas.nombre,
      tipo: schema.rutas.tipo,
      operarioId: schema.rutas.operarioId,
      estado: schema.rutas.estado,
      notas: schema.rutas.notas,
      createdAt: schema.rutas.createdAt,
      updatedAt: schema.rutas.updatedAt,
    })
    .from(schema.rutas)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.rutas.createdAt))
    .limit(500);

  // Adjuntar todos los assignees de cada ruta (1 query batch)
  const rutaIds = rutas.map((r) => r.id);
  let assigneesByRuta = new Map<string, string[]>();
  if (rutaIds.length > 0) {
    const assigneeRows = await db
      .select({
        rutaId: schema.rutaAssignees.rutaId,
        operarioId: schema.rutaAssignees.operarioId,
      })
      .from(schema.rutaAssignees)
      .where(inArray(schema.rutaAssignees.rutaId, rutaIds));
    for (const row of assigneeRows) {
      const list = assigneesByRuta.get(row.rutaId) ?? [];
      list.push(row.operarioId);
      assigneesByRuta.set(row.rutaId, list);
    }
  }

  return json({
    rutas: rutas.map((r) => ({
      ...r,
      operarioIds: assigneesByRuta.get(r.id) ?? [r.operarioId],
    })),
  });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: z.infer<typeof CreateRutaRequest>;
  try {
    body = await parseJson(request, CreateRutaRequest);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Resolver lista de operarios a asignar. Soporta ambos formatos.
  const operarioIdList = body.operarioIds && body.operarioIds.length > 0
    ? Array.from(new Set(body.operarioIds))
    : body.operarioId
      ? [body.operarioId]
      : [];
  if (operarioIdList.length === 0) {
    return jsonError("operario_required", 400);
  }

  // Verificar que TODOS los operarios existan y estén activos
  const operarioRows = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.id, operarioIdList));
  if (operarioRows.length !== operarioIdList.length) {
    return jsonError("operario_not_found", 400);
  }
  const inactive = operarioRows.find((u) => u.status !== "active");
  if (inactive) {
    return jsonError("operario_not_found_or_inactive", 400);
  }
  // El "líder" (operario_id legacy en rutas) = primero del array
  const liderId = operarioIdList[0];

  // Normalizar a items[] mixtos
  const items: RichItem[] =
    "items" in body
      ? body.items
      : body.codigos.map((c) => ({
          kind: "entity" as const,
          codigo: c,
        }));

  // Validar que los códigos de entity existen en la tabla correspondiente
  const entityCodes = items
    .filter((it) => it.kind === "entity")
    .map((it) => it.codigo);
  let missing: string[] = [];
  if (entityCodes.length > 0) {
    const table =
      body.tipo === "medidores" ? schema.medidores : schema.estructuras;
    const col =
      body.tipo === "medidores"
        ? schema.medidores.contrato
        : schema.estructuras.codigo;
    const found = await db
      .select({ c: col })
      .from(table)
      .where(inArray(col, entityCodes));
    const foundSet = new Set(found.map((r) => r.c));
    missing = entityCodes.filter((c) => !foundSet.has(c));
  }

  const rutaId = randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.rutas).values({
    id: rutaId,
    nombre: body.nombre,
    tipo: body.tipo,
    operarioId: liderId,
    creadaPor: admin.userId,
    estado: "pendiente",
    fechaObjetivo: body.fechaObjetivo ?? null,
    notas: body.notas,
    startPointJson: body.startPoint
      ? JSON.stringify(body.startPoint)
      : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insertar todos los operarios en ruta_assignees
  await db.insert(schema.rutaAssignees).values(
    operarioIdList.map((operarioId) => ({
      rutaId,
      operarioId,
      asignadoAt: now,
    })),
  );

  // Insertar items en batch, respetando el orden recibido
  const BATCH = 200;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH).map((it, idx) => {
      if (it.kind === "entity") {
        return {
          rutaId,
          codigo: it.codigo,
          kind: "entity" as const,
          orden: i + idx,
          visitado: false,
        };
      }
      return {
        rutaId,
        codigo: it.codigo,
        kind: "waypoint" as const,
        orden: i + idx,
        visitado: false,
        wpLat: it.lat,
        wpLon: it.lon,
        wpLabel: it.label ?? null,
      };
    });
    await db.insert(schema.rutaItems).values(batch);
  }

  // Notif a TODOS los operarios asignados
  for (const operarioId of operarioIdList) {
    pushToUser(operarioId, {
      kind: "ruta_asignada",
      title: "Nueva ruta asignada",
      body: `${body.nombre} · ${items.length} puntos${
        body.fechaObjetivo ? " · " + body.fechaObjetivo : ""
      }`,
      data: { rutaId },
    }).catch(() => {
      /* no-op */
    });
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "RUTA_CREATED",
    targetId: rutaId,
    details: JSON.stringify({
      tipo: body.tipo,
      operarioIds: operarioIdList,
      count: items.length,
      waypoints: items.filter((it) => it.kind === "waypoint").length,
      missing: missing.length,
    }),
  });

  return json(
    {
      ruta: {
        id: rutaId,
        nombre: body.nombre,
        tipo: body.tipo,
        operarioId: liderId,
        operarioIds: operarioIdList,
        fechaObjetivo: body.fechaObjetivo,
        estado: "pendiente",
      },
      missingCodes: missing,
    },
    { status: 201 },
  );
}
