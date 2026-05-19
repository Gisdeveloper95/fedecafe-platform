import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { RecorridoViewer } from "./viewer";

export default async function RecorridoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const { id } = await params;

  const rows = await db
    .select({
      id: schema.recorridos.id,
      operarioId: schema.recorridos.operarioId,
      iniciadoAt: schema.recorridos.iniciadoAt,
      finalizadoAt: schema.recorridos.finalizadoAt,
      distanciaTotalM: schema.recorridos.distanciaTotalM,
      duracionSegundos: schema.recorridos.duracionSegundos,
      rutaId: schema.recorridos.rutaId,
      rutaNombre: schema.rutas.nombre,
      operarioName: schema.users.fullName,
      operarioUsername: schema.users.username,
    })
    .from(schema.recorridos)
    .leftJoin(schema.users, eq(schema.users.id, schema.recorridos.operarioId))
    .leftJoin(schema.rutas, eq(schema.rutas.id, schema.recorridos.rutaId))
    .where(eq(schema.recorridos.id, id))
    .limit(1);

  const r = rows[0];
  if (!r) notFound();
  // Operarios solo pueden ver sus propios recorridos
  if (me.role === "operario" && r.operarioId !== me.id) {
    redirect("/recorridos");
  }

  const puntos = await db
    .select({
      timestamp: schema.recorridoPuntos.timestamp,
      lat: schema.recorridoPuntos.latitude,
      lon: schema.recorridoPuntos.longitude,
      vel: schema.recorridoPuntos.velocidadMs,
      acc: schema.recorridoPuntos.precisionM,
    })
    .from(schema.recorridoPuntos)
    .where(eq(schema.recorridoPuntos.recorridoId, id))
    .orderBy(asc(schema.recorridoPuntos.timestamp));

  function formatDur(s: number | null) {
    if (!s) return "-";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function formatM(m: number | null) {
    if (m == null) return "-";
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-150px)] min-h-[600px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/recorridos"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Volver a recorridos
          </Link>
          <h1 className="text-xl font-bold mt-1">
            Recorrido de {r.operarioName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(r.iniciadoAt).toLocaleString("es-CO")} ·{" "}
            {formatDur(r.duracionSegundos)} · {formatM(r.distanciaTotalM)} ·{" "}
            {puntos.length} puntos GPS
            {r.rutaNombre && (
              <>
                {" "}
                · Ruta:{" "}
                <Link
                  href={r.rutaId ? `/rutas/${r.rutaId}` : "#"}
                  className="underline"
                >
                  {r.rutaNombre}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          href={`/api/recorridos/${r.id}/reporte`}
          className="text-xs bg-brand text-brand-foreground px-3 py-2 rounded hover:opacity-90 whitespace-nowrap"
        >
          Descargar Word
        </Link>
      </div>

      <div className="flex-1 min-h-0 bg-card border border-border rounded-lg overflow-hidden">
        <RecorridoViewer
          puntos={puntos.map((p) => ({
            lat: p.lat,
            lon: p.lon,
            t: p.timestamp,
            v: p.vel,
            a: p.acc,
          }))}
        />
      </div>
    </div>
  );
}
