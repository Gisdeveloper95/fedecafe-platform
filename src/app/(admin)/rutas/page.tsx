import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

export default async function RutasPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");

  const conditions = [];
  if (me.role === "operario") {
    conditions.push(eq(schema.rutas.operarioId, me.id));
  }

  const rutas = await db
    .select({
      id: schema.rutas.id,
      nombre: schema.rutas.nombre,
      tipo: schema.rutas.tipo,
      estado: schema.rutas.estado,
      operarioId: schema.rutas.operarioId,
      operarioName: schema.users.fullName,
      createdAt: schema.rutas.createdAt,
    })
    .from(schema.rutas)
    .leftJoin(schema.users, eq(schema.users.id, schema.rutas.operarioId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.rutas.createdAt))
    .limit(200);

  const estadoStyle = {
    pendiente: "bg-yellow-100 text-yellow-800",
    en_curso: "bg-blue-100 text-blue-800",
    completada: "bg-green-100 text-green-800",
    archivada: "bg-gray-100 text-gray-600",
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {me.role === "admin" ? "Rutas" : "Mis Rutas"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {rutas.length} rutas{me.role === "admin" ? " en total" : " asignadas a ti"}
          </p>
        </div>
        {me.role === "admin" && (
          <div className="flex gap-2">
            <Link
              href="/rutas/nueva"
              className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
            >
              Crear por códigos
            </Link>
            <Link
              href="/rutas/planeador"
              className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
            >
              + Planeador con mapa
            </Link>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              {me.role === "admin" && (
                <th className="text-left px-4 py-3 font-medium">Operario</th>
              )}
              <th className="text-left px-4 py-3 font-medium">Creada</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rutas.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.nombre}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-muted rounded px-2 py-0.5">
                    {r.tipo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${estadoStyle[r.estado]}`}>
                    {r.estado}
                  </span>
                </td>
                {me.role === "admin" && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.operarioName ?? "-"}
                  </td>
                )}
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/rutas/${r.id}`}
                    className="text-xs text-brand hover:underline"
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
            {rutas.length === 0 && (
              <tr>
                <td
                  colSpan={me.role === "admin" ? 6 : 5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No hay rutas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
