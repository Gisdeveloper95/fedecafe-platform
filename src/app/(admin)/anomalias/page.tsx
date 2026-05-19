import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { AnomalyActions } from "./actions";

const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};
const STATE_COLOR: Record<string, string> = {
  open: "text-amber-700",
  in_progress: "text-blue-700",
  resolved: "text-success",
  discarded: "text-muted-foreground",
};

export default async function AnomaliasPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const state = sp.state ?? "open";

  const where = [];
  if (state === "open" || state === "in_progress" || state === "resolved" || state === "discarded") {
    where.push(eq(schema.estructuraAnomalies.state, state));
  }

  const anomalies = await db
    .select()
    .from(schema.estructuraAnomalies)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.estructuraAnomalies.reportedAt))
    .limit(200);

  const reporters = Array.from(
    new Set(anomalies.map((a) => a.reportedBy).filter(Boolean) as string[]),
  );
  const users =
    reporters.length > 0
      ? await db
          .select({
            id: schema.users.id,
            fullName: schema.users.fullName,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, reporters))
      : [];
  const userMap = new Map(users.map((u) => [u.id, u.fullName]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Anomalías</h1>
        <p className="text-muted-foreground text-sm">
          Reportes de problemas en campo (medidores dañados, sin acceso, etc.).
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(["open", "in_progress", "resolved", "discarded"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/anomalias?state=${s}`}
              className={`px-3 py-1.5 rounded border ${
                state === s
                  ? "bg-brand text-brand-foreground border-brand"
                  : "bg-card border-border hover:bg-muted"
              }`}
            >
              {s === "open" && "Abiertas"}
              {s === "in_progress" && "En curso"}
              {s === "resolved" && "Resueltas"}
              {s === "discarded" && "Descartadas"}
            </Link>
          ),
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Severidad</th>
              <th className="text-left px-4 py-3 font-medium">Objetivo</th>
              <th className="text-left px-4 py-3 font-medium">Título</th>
              <th className="text-left px-4 py-3 font-medium">Reportado por</th>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-right px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground">
                  No hay anomalías en este filtro.
                </td>
              </tr>
            )}
            {anomalies.map((a) => (
              <tr key={a.id} className="border-t border-border align-middle">
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      SEVERITY_COLOR[a.severity] ?? "bg-muted"
                    }`}
                  >
                    {a.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{a.targetId}</div>
                  <div className="text-muted-foreground">{a.targetType}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.title}</div>
                  {a.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 max-w-md">
                      {a.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {userMap.get(a.reportedBy) ?? a.reportedBy}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(a.reportedAt).toLocaleString("es-CO")}
                </td>
                <td
                  className={`px-4 py-3 text-xs font-medium ${
                    STATE_COLOR[a.state] ?? ""
                  }`}
                >
                  {a.state}
                </td>
                <td className="px-4 py-3 text-right">
                  {(a.state === "open" || a.state === "in_progress") && (
                    <AnomalyActions id={a.id} currentState={a.state} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
