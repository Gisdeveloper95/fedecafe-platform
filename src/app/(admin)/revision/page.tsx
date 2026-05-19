import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

const STATE_OPTIONS = [
  { value: "pending", label: "Pendientes" },
  { value: "needs_info", label: "Necesitan info" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "apply_failed", label: "Errores" },
] as const;

const OP_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  capture_visit: { label: "Visita", className: "bg-blue-100 text-blue-800" },
  create_medidor: {
    label: "Nuevo medidor",
    className: "bg-green-100 text-green-800",
  },
  update_medidor: {
    label: "Actualizar medidor",
    className: "bg-amber-100 text-amber-800",
  },
  create_estructura: {
    label: "Nueva estructura",
    className: "bg-green-100 text-green-800",
  },
  update_estructura: {
    label: "Actualizar estructura",
    className: "bg-amber-100 text-amber-800",
  },
  mark_removed: {
    label: "Retirar",
    className: "bg-red-100 text-red-800",
  },
  report_anomaly: {
    label: "Anomalía",
    className: "bg-purple-100 text-purple-800",
  },
};

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    operario?: string;
    opType?: string;
  }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const state = sp.state ?? "pending";
  const operario = sp.operario;
  const opType = sp.opType;

  const where = [];
  if (state) where.push(eq(schema.pendingCaptures.state, state as never));
  if (operario)
    where.push(eq(schema.pendingCaptures.operarioId, operario));
  if (opType)
    where.push(eq(schema.pendingCaptures.opType, opType as never));

  const captures = await db
    .select()
    .from(schema.pendingCaptures)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.pendingCaptures.uploadedAt))
    .limit(200);

  // Operarios para el filtro
  const operarioIds = Array.from(new Set(captures.map((c) => c.operarioId)));
  const operarios =
    operarioIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            fullName: schema.users.fullName,
            username: schema.users.username,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, operarioIds))
      : [];
  const operarioMap = new Map(operarios.map((u) => [u.id, u]));

  // Todos los operarios activos (para dropdown)
  const allOperarios = await db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      username: schema.users.username,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "operario"))
    .limit(200);

  // Contadores por estado para mostrar al lado del filtro
  const counts = await db
    .select({
      state: schema.pendingCaptures.state,
    })
    .from(schema.pendingCaptures);
  const countsByState: Record<string, number> = {};
  for (const c of counts) {
    countsByState[c.state] = (countsByState[c.state] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Revisión de capturas</h1>
        <p className="text-muted-foreground text-sm">
          Capturas enviadas desde campo por los operarios. Aprobar las que estén
          correctas para que pasen a la base de datos.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center text-sm">
        {STATE_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/revision?state=${opt.value}${operario ? `&operario=${operario}` : ""}${
              opType ? `&opType=${opType}` : ""
            }`}
            className={`px-3 py-1.5 rounded border ${
              state === opt.value
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            {opt.label}
            {countsByState[opt.value] !== undefined && (
              <span className="ml-1.5 text-xs opacity-75">
                ({countsByState[opt.value]})
              </span>
            )}
          </Link>
        ))}

        <div className="flex-1" />

        <form className="flex gap-2 items-center" method="get">
          <input type="hidden" name="state" value={state} />
          <select
            name="operario"
            defaultValue={operario ?? ""}
            className="border border-border rounded px-2 py-1.5 bg-card text-xs"
          >
            <option value="">Todos los operarios</option>
            {allOperarios.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName} ({o.username})
              </option>
            ))}
          </select>
          <select
            name="opType"
            defaultValue={opType ?? ""}
            className="border border-border rounded px-2 py-1.5 bg-card text-xs"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(OP_TYPE_LABELS).map(([v, info]) => (
              <option key={v} value={v}>
                {info.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="text-xs border border-border rounded px-2 py-1.5 hover:bg-muted"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Operario</th>
              <th className="text-left px-4 py-3 font-medium">Objetivo</th>
              <th className="text-left px-4 py-3 font-medium">Capturado</th>
              <th className="text-left px-4 py-3 font-medium">Subido</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-right px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {captures.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-muted-foreground py-10"
                >
                  No hay capturas en este filtro.
                </td>
              </tr>
            )}
            {captures.map((c) => {
              const op = operarioMap.get(c.operarioId);
              const tInfo = OP_TYPE_LABELS[c.opType] ?? {
                label: c.opType,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <tr key={c.id} className="border-t border-border align-middle">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${tInfo.className}`}
                    >
                      {tInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {op ? (
                      <div>
                        <div>{op.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          @{op.username}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {c.targetId ?? <span className="opacity-60">(nuevo)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.capturedAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.uploadedAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.state === "pending" && (
                      <span className="text-amber-700">Pendiente</span>
                    )}
                    {c.state === "approved" && (
                      <span className="text-success">Aprobada</span>
                    )}
                    {c.state === "rejected" && (
                      <span className="text-destructive">Rechazada</span>
                    )}
                    {c.state === "needs_info" && (
                      <span className="text-blue-700">Necesita info</span>
                    )}
                    {c.state === "apply_failed" && (
                      <span className="text-destructive">Falló al aplicar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/revision/${c.id}`}
                      className="text-xs border border-border rounded px-2 py-1 hover:bg-muted"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
