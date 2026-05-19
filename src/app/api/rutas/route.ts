import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db/client";
import { json, jsonError, parseJson } from "@/lib/api/json";
import { requireAdmin, requirePrincipal } from "@/lib/auth/principal";
import { pushToUser } from "@/lib/push/fcm";

/// Forma legacy: solo códigos. Mantenida por compatibilidad con /rutas/nueva.
const LegacyCreateRutaRequest = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["medidores", "estructuras"]),
  operarioId: z.string().uuid(),
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
});

/// Forma rica: items mixtos (entidades existentes + waypoints arbitrarios).
const RichCreateRutaRequest = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["medidores", "estructuras"]),
  operarioId: z.string().uuid(),
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
});

type RichItem = z.infer<typeof RichCreateRutaRequest>["items"][number];

const CreateRutaRequest = z.union([
  RichCreateRutaRequest,
  LegacyCreateRutaRequest,
]);

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

  // Operarios solo ven sus rutas; admin puede ver todas.
  let operarioFilter: string | null = null;
  if (principal.role === "operario") {
    operarioFilter = principal.userId;
  } else if (scope === "mias") {
    operarioFilter = principal.userId;
  }

  const where = [];
  if (operarioFilter) where.push(eq(schema.rutas.operarioId, operarioFilter));
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

  return json({ rutas });
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

  // Verificar que el operario exista y este activo
  const operarioRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, body.operarioId))
    .limit(1);
  const operario = operarioRows[0];
  if (!operario || operario.status !== "active") {
    return jsonError("operario_not_found_or_inactive", 400);
  }

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
    operarioId: body.operarioId,
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

  // Notif al operario asignado
  pushToUser(body.operarioId, {
    kind: "ruta_asignada",
    title: "Nueva ruta asignada",
    body: `${body.nombre} · ${items.length} puntos${
      body.fechaObjetivo ? " · " + body.fechaObjetivo : ""
    }`,
    data: { rutaId },
  }).catch(() => {
    /* no-op */
  });

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    userId: admin.userId,
    action: "RUTA_CREATED",
    targetId: rutaId,
    details: JSON.stringify({
      tipo: body.tipo,
      operarioId: body.operarioId,
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
        operarioId: body.operarioId,
        fechaObjetivo: body.fechaObjetivo,
        estado: "pendiente",
      },
      missingCodes: missing,
    },
    { status: 201 },
  );
}
