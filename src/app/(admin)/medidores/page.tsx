import { asc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

export default async function MedidoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; municipio?: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const { q, municipio } = await searchParams;

  const medidores = await db
    .select()
    .from(schema.medidores)
    .where(
      q || municipio
        ? sql`${
            q ? sql`(${schema.medidores.contrato} LIKE ${`%${q}%`} OR ${schema.medidores.nombre} LIKE ${`%${q}%`})` : sql`1=1`
          } AND ${municipio ? sql`${schema.medidores.municipio} = ${municipio}` : sql`1=1`}`
        : undefined,
    )
    .orderBy(asc(schema.medidores.contrato))
    .limit(500);

  const municipios = await db
    .selectDistinct({ m: schema.medidores.municipio })
    .from(schema.medidores);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Medidores</h1>
        <p className="text-muted-foreground text-sm">
          {medidores.length} resultados. Estos datos se sincronizan desde rutas_builder.
        </p>
      </div>

      <form className="flex flex-wrap gap-2 items-end bg-card border border-border rounded-lg p-4">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-xs text-muted-foreground">Buscar (contrato o nombre)</span>
          <input
            name="q"
            defaultValue={q}
            className="border border-border rounded px-3 py-2 bg-card"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Municipio</span>
          <select
            name="municipio"
            defaultValue={municipio ?? ""}
            className="border border-border rounded px-3 py-2 bg-card"
          >
            <option value="">Todos</option>
            {municipios
              .filter((m) => m.m)
              .map((m) => (
                <option key={m.m} value={m.m!}>
                  {m.m}
                </option>
              ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm"
        >
          Filtrar
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left px-4 py-2">Contrato</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Usuario</th>
              <th className="text-left px-4 py-2">Direccion</th>
              <th className="text-left px-4 py-2">Municipio</th>
              <th className="text-left px-4 py-2">Coords</th>
            </tr>
          </thead>
          <tbody>
            {medidores.map((m) => (
              <tr key={m.contrato} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{m.contrato}</td>
                <td className="px-4 py-2">{m.nombre ?? "-"}</td>
                <td className="px-4 py-2">{m.usuario ?? "-"}</td>
                <td className="px-4 py-2">{m.direccion ?? "-"}</td>
                <td className="px-4 py-2">{m.municipio ?? "-"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                  {m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}
                </td>
              </tr>
            ))}
            {medidores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No hay medidores. Sincroniza desde rutas_builder.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
