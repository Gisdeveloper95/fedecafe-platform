import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { RecorridosFilters } from "./filters";

type SearchParams = {
  operario?: string;
  desde?: string;
  hasta?: string;
};

export default async function RecorridosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const sp = await searchParams;

  const conditions = [];
  // Operarios siempre limitados a sus propios recorridos
  if (me.role === "operario") {
    conditions.push(eq(schema.recorridos.operarioId, me.id));
  } else if (sp.operario) {
    conditions.push(eq(schema.recorridos.operarioId, sp.operario));
  }
  if (sp.desde) {
    conditions.push(gte(schema.recorridos.iniciadoAt, sp.desde));
  }
  if (sp.hasta) {
    // hasta incluye el día entero (hasta 23:59:59)
    conditions.push(lte(schema.recorridos.iniciadoAt, sp.hasta + "T23:59:59"));
  }

  const rows = await db
    .select({
      id: schema.recorridos.id,
      iniciadoAt: schema.recorridos.iniciadoAt,
      finalizadoAt: schema.recorridos.finalizadoAt,
      distanciaTotalM: schema.recorridos.distanciaTotalM,
      duracionSegundos: schema.recorridos.duracionSegundos,
      subidoAt: schema.recorridos.subidoAt,
      operarioName: schema.users.fullName,
      operarioUsername: schema.users.username,
      rutaId: schema.recorridos.rutaId,
      rutaNombre: schema.rutas.nombre,
    })
    .from(schema.recorridos)
    .leftJoin(schema.users, eq(schema.users.id, schema.recorridos.operarioId))
    .leftJoin(schema.rutas, eq(schema.rutas.id, schema.recorridos.rutaId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.recorridos.iniciadoAt))
    .limit(200);

  // Lista de operarios para el filtro (solo admin)
  const operarios =
    me.role === "operario"
      ? []
      : await db
          .select({
            id: schema.users.id,
            fullName: schema.users.fullName,
            username: schema.users.username,
          })
          .from(schema.users)
          .where(eq(schema.users.role, "operario"))
          .orderBy(schema.users.fullName);

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          {me.role === "operario" ? "Mis recorridos" : "Recorridos"}
        </h1>
        <p className="text-muted-foreground text-sm">
          Trazos GPS subidos desde la app móvil. Retención: 1 año (más viejos se
          borran automáticamente).
        </p>
      </div>

      {me.role !== "operario" && (
        <RecorridosFilters operarios={operarios} initial={sp} />
      )}

      <div className="text-xs text-muted-foreground">
        {rows.length} recorridos {rows.length === 200 ? "(máx mostrado)" : ""}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              {me.role !== "operario" && (
                <th className="text-left px-4 py-3 font-medium">Operario</th>
              )}
              <th className="text-left px-4 py-3 font-medium">Ruta asociada</th>
              <th className="text-left px-4 py-3 font-medium">Duración</th>
              <th className="text-left px-4 py-3 font-medium">Distancia</th>
              <th className="text-right px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {new Date(r.iniciadoAt).toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                {me.role !== "operario" && (
                  <td className="px-4 py-3">
                    {r.operarioName}{" "}
                    <span className="text-xs text-muted-foreground font-mono">
                      ({r.operarioUsername})
                    </span>
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  {r.rutaNombre ?? "Sin ruta asociada"}
                </td>
                <td className="px-4 py-3">{formatDur(r.duracionSegundos)}</td>
                <td className="px-4 py-3">{formatM(r.distanciaTotalM)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <Link
                      href={`/recorridos/${r.id}`}
                      className="text-xs border border-border px-3 py-1 rounded hover:bg-muted"
                    >
                      Ver mapa
                    </Link>
                    <Link
                      href={`/api/recorridos/${r.id}/reporte`}
                      className="text-xs bg-brand text-brand-foreground px-3 py-1 rounded hover:opacity-90"
                    >
                      Word
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={me.role === "operario" ? 5 : 6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Sin recorridos para los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
