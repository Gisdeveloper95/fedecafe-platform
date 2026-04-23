import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

export default async function EstructurasPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const estructuras = await db
    .select()
    .from(schema.estructuras)
    .orderBy(asc(schema.estructuras.layerName), asc(schema.estructuras.codigo))
    .limit(500);

  const byLayer = estructuras.reduce<Record<string, typeof estructuras>>((acc, e) => {
    (acc[e.layerName] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Estructuras</h1>
        <p className="text-muted-foreground text-sm">
          {estructuras.length} estructuras en {Object.keys(byLayer).length} capas.
        </p>
      </div>

      {Object.entries(byLayer).map(([layer, items]) => (
        <div key={layer} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 font-medium text-sm">
            {layer}{" "}
            <span className="text-muted-foreground font-normal">
              ({items.length})
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Codigo</th>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Ramal</th>
                <th className="text-left px-4 py-2">Municipio</th>
                <th className="text-left px-4 py-2">Coords</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.codigo} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{e.codigo}</td>
                  <td className="px-4 py-2">{e.nombre ?? "-"}</td>
                  <td className="px-4 py-2">{e.ramal ?? "-"}</td>
                  <td className="px-4 py-2">{e.municipio ?? "-"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                    {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {estructuras.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          No hay estructuras. Sincroniza desde rutas_builder.
        </div>
      )}
    </div>
  );
}
