import { and, desc, eq, like, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { CreateDemoTokenButton } from "./create-token";
import { TokenRowActions } from "./token-actions";
import { DemoTokensFilters } from "./filters";

type StateFilter = "all" | "active" | "expired" | "revoked" | "exhausted";

export default async function DemoTokensPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const stateFilter = (sp.state ?? "all") as StateFilter;
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const where = [];
  if (q) {
    where.push(
      sql`(${schema.demoTokens.code} LIKE ${`%${q}%`} OR LOWER(COALESCE(${schema.demoTokens.label}, '')) LIKE ${`%${q.toLowerCase()}%`})`,
    );
  }
  if (stateFilter === "active") {
    where.push(eq(schema.demoTokens.isRevoked, false));
    where.push(sql`${schema.demoTokens.expiresAt} > ${nowIso}`);
    where.push(
      sql`${schema.demoTokens.activationsUsed} < ${schema.demoTokens.maxActivations}`,
    );
  } else if (stateFilter === "expired") {
    where.push(eq(schema.demoTokens.isRevoked, false));
    where.push(sql`${schema.demoTokens.expiresAt} <= ${nowIso}`);
  } else if (stateFilter === "revoked") {
    where.push(eq(schema.demoTokens.isRevoked, true));
  } else if (stateFilter === "exhausted") {
    where.push(eq(schema.demoTokens.isRevoked, false));
    where.push(
      sql`${schema.demoTokens.activationsUsed} >= ${schema.demoTokens.maxActivations}`,
    );
  }

  const tokens = await db
    .select()
    .from(schema.demoTokens)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.demoTokens.createdAt))
    .limit(500);

  // Contadores por estado (siempre, sin filtro de búsqueda) para mostrar en tabs
  const counts = await db
    .select({
      total: sql<number>`count(*)`,
      revoked: sql<number>`sum(case when ${schema.demoTokens.isRevoked} = 1 then 1 else 0 end)`,
    })
    .from(schema.demoTokens);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tokens demo</h1>
          <p className="text-muted-foreground text-sm">
            {tokens.length} de {Number(counts[0]?.total ?? 0)} tokens
            {q && " · búsqueda activa"}
          </p>
        </div>
        <CreateDemoTokenButton />
      </div>

      <DemoTokensFilters
        initial={{ q, state: stateFilter }}
      />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Código</th>
              <th className="text-left px-4 py-3 font-medium">Etiqueta</th>
              <th className="text-left px-4 py-3 font-medium">Vence</th>
              <th className="text-left px-4 py-3 font-medium">Activaciones</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Creado</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {q || stateFilter !== "all"
                    ? "No hay tokens que coincidan con los filtros."
                    : 'No hay tokens demo. Crea uno con el botón "+ Crear token demo".'}
                </td>
              </tr>
            )}
            {tokens.map((t) => {
              const expMs = new Date(t.expiresAt).getTime();
              const isExpired = expMs < now;
              const isExhausted = t.activationsUsed >= t.maxActivations;
              let statusText = "Activo";
              let statusClass = "text-success";
              if (t.isRevoked) {
                statusText = "Revocado";
                statusClass = "text-destructive";
              } else if (isExpired) {
                statusText = "Vencido";
                statusClass = "text-muted-foreground";
              } else if (isExhausted) {
                statusText = "Sin cupos";
                statusClass = "text-amber-600";
              }
              return (
                <tr key={t.code} className="border-t border-border">
                  <td className="px-4 py-3 font-mono font-semibold text-lg">
                    {t.code}
                  </td>
                  <td className="px-4 py-3">{t.label ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(t.expiresAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.activationsUsed} / {t.maxActivations}
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${statusClass}`}>
                    {statusText}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!t.isRevoked && (
                      <TokenRowActions code={t.code} />
                    )}
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
