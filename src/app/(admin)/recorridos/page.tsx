import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

export default async function RecorridosPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const conditions = [];
  if (me.role === "operario") {
    conditions.push(eq(schema.recorridos.operarioId, me.id));
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
      rutaNombre: schema.rutas.nombre,
    })
    .from(schema.recorridos)
    .leftJoin(schema.users, eq(schema.users.id, schema.recorridos.operarioId))
    .leftJoin(schema.rutas, eq(schema.rutas.id, schema.recorridos.rutaId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.recorridos.iniciadoAt))
    .limit(100);

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
          {me.role === "admin" ? "Recorridos" : "Mis recorridos"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} recorridos subidos desde la app movil.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              {me.role === "admin" && (
                <th className="text-left px-4 py-3 font-medium">Operario</th>
              )}
              <th className="text-left px-4 py-3 font-medium">Ruta asociada</th>
              <th className="text-left px-4 py-3 font-medium">Duracion</th>
              <th className="text-left px-4 py-3 font-medium">Distancia</th>
              <th className="text-right px-4 py-3 font-medium">Reporte</th>
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
                {me.role === "admin" && (
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
                  <Link
                    href={`/api/recorridos/${r.id}/reporte`}
                    className="text-xs bg-brand text-brand-foreground px-3 py-1 rounded hover:opacity-90"
                  >
                    Descargar Word
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={me.role === "admin" ? 6 : 5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Aun no hay recorridos subidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
