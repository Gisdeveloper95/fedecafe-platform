import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { CreateDemoTokenButton } from "./create-token";
import { TokenRowActions } from "./token-actions";

export default async function DemoTokensPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const tokens = await db
    .select()
    .from(schema.demoTokens)
    .orderBy(desc(schema.demoTokens.createdAt))
    .limit(200);

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tokens demo</h1>
          <p className="text-muted-foreground text-sm">
            Códigos de 6 dígitos para acceso temporal a la app móvil. Cada token
            tiene una fecha de vencimiento y un número máximo de activaciones.
          </p>
        </div>
        <CreateDemoTokenButton />
      </div>

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
                  No hay tokens demo. Crea uno con el botón "+ Crear token demo".
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
