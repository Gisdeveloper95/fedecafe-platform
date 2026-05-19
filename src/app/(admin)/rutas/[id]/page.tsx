import { asc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { RutaDetail } from "./ruta-detail";

export default async function RutaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const { id } = await params;

  const rutaRows = await db
    .select({
      id: schema.rutas.id,
      nombre: schema.rutas.nombre,
      tipo: schema.rutas.tipo,
      estado: schema.rutas.estado,
      operarioId: schema.rutas.operarioId,
      operarioName: schema.users.fullName,
      notas: schema.rutas.notas,
      startPointJson: schema.rutas.startPointJson,
      createdAt: schema.rutas.createdAt,
    })
    .from(schema.rutas)
    .leftJoin(schema.users, eq(schema.users.id, schema.rutas.operarioId))
    .where(eq(schema.rutas.id, id))
    .limit(1);

  const ruta = rutaRows[0];
  if (!ruta) notFound();

  if (me.role === "operario" && ruta.operarioId !== me.id) {
    redirect("/rutas");
  }

  const items = await db
    .select()
    .from(schema.rutaItems)
    .where(eq(schema.rutaItems.rutaId, id))
    .orderBy(asc(schema.rutaItems.orden));

  const codes = items.map((i) => i.codigo);
  let coords: Record<string, { lat: number; lng: number; nombre: string | null }> = {};

  if (codes.length > 0) {
    if (ruta.tipo === "medidores") {
      const rows = await db
        .select()
        .from(schema.medidores)
        .where(inArray(schema.medidores.contrato, codes));
      coords = Object.fromEntries(
        rows.map((m) => [
          m.contrato,
          { lat: m.latitude, lng: m.longitude, nombre: m.nombre },
        ]),
      );
    } else {
      const rows = await db
        .select()
        .from(schema.estructuras)
        .where(inArray(schema.estructuras.codigo, codes));
      coords = Object.fromEntries(
        rows.map((e) => [
          e.codigo,
          { lat: e.latitude, lng: e.longitude, nombre: e.nombre },
        ]),
      );
    }
  }

  const startPoint = ruta.startPointJson
    ? (JSON.parse(ruta.startPointJson) as {
        lat: number;
        lon: number;
        label?: string;
      })
    : null;

  return (
    <RutaDetail
      ruta={ruta}
      items={items}
      coords={coords}
      startPoint={startPoint}
      canEdit={me.role === "admin" || me.role === "developer"}
    />
  );
}
