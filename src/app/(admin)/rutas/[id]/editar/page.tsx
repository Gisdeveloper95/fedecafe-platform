import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { RoutePlanner } from "../../planeador/planner";

export default async function EditarRutaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin" && me.role !== "developer") redirect("/dashboard");

  const { id } = await params;

  const rutaRows = await db
    .select()
    .from(schema.rutas)
    .where(eq(schema.rutas.id, id))
    .limit(1);
  const ruta = rutaRows[0];
  if (!ruta) notFound();

  // Items en orden
  const items = await db
    .select()
    .from(schema.rutaItems)
    .where(eq(schema.rutaItems.rutaId, id))
    .orderBy(asc(schema.rutaItems.orden));

  // Resolver coords de items entity
  const entityCodes = items
    .filter((it) => (it.kind ?? "entity") === "entity")
    .map((it) => it.codigo);
  let coordsByCode = new Map<
    string,
    { lat: number; lon: number; nombre: string | null }
  >();
  if (entityCodes.length > 0) {
    if (ruta.tipo === "medidores") {
      const rows = await db
        .select()
        .from(schema.medidores)
        .where(inArray(schema.medidores.contrato, entityCodes));
      coordsByCode = new Map(
        rows.map((m) => [
          m.contrato,
          { lat: m.latitude, lon: m.longitude, nombre: m.nombre ?? null },
        ]),
      );
    } else {
      const rows = await db
        .select()
        .from(schema.estructuras)
        .where(inArray(schema.estructuras.codigo, entityCodes));
      coordsByCode = new Map(
        rows.map((e) => [
          e.codigo,
          { lat: e.latitude, lon: e.longitude, nombre: e.nombre ?? null },
        ]),
      );
    }
  }

  // Stops del planner = items con coordenadas + waypoints con sus coords propias
  type EntityStop = {
    kind: "entity";
    codigo: string;
    lat: number;
    lon: number;
    nombre: string | null;
  };
  type WaypointStop = {
    kind: "waypoint";
    codigo: string;
    lat: number;
    lon: number;
    label: string;
  };
  type Stop = EntityStop | WaypointStop;
  const stops: Stop[] = [];
  for (const it of items) {
    const kind = it.kind ?? "entity";
    if (kind === "waypoint") {
      if (it.wpLat == null || it.wpLon == null) continue;
      stops.push({
        kind: "waypoint",
        codigo: it.codigo,
        lat: it.wpLat,
        lon: it.wpLon,
        label: it.wpLabel ?? "Parada",
      });
    } else {
      const c = coordsByCode.get(it.codigo);
      if (!c) continue;
      stops.push({
        kind: "entity",
        codigo: it.codigo,
        lat: c.lat,
        lon: c.lon,
        nombre: c.nombre,
      });
    }
  }

  const assignees = await db
    .select({ operarioId: schema.rutaAssignees.operarioId })
    .from(schema.rutaAssignees)
    .where(eq(schema.rutaAssignees.rutaId, id));
  const operarioIds =
    assignees.length > 0
      ? assignees.map((a) => a.operarioId)
      : [ruta.operarioId];

  const startPoint = ruta.startPointJson
    ? (JSON.parse(ruta.startPointJson) as {
        lat: number;
        lon: number;
        label: string;
        favoriteId?: string;
      })
    : null;

  const operarios = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
    })
    .from(schema.users)
    .where(
      and(eq(schema.users.role, "operario"), eq(schema.users.status, "active")),
    )
    .orderBy(asc(schema.users.fullName));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/rutas/${id}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Volver a la ruta
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          Editar ruta: {ruta.nombre}
        </h1>
        <p className="text-muted-foreground text-sm">
          Modifica nombre, operarios asignados, items o el punto de partida.
          Los cambios se guardan al hacer click en &quot;Guardar cambios&quot;.
        </p>
      </div>
      <RoutePlanner
        operarios={operarios}
        initial={{
          id: ruta.id,
          nombre: ruta.nombre,
          tipo: ruta.tipo,
          operarioIds,
          notas: ruta.notas,
          fechaObjetivo: ruta.fechaObjetivo,
          startPoint,
          stops,
        }}
      />
    </div>
  );
}
