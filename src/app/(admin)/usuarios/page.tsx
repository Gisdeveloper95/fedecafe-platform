import Link from "next/link";
import { and, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { UserActions } from "./user-actions";
import { UsuariosFilters } from "./filters";

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return { text: "Activo", className: "text-success" };
    case "suspended":
      return { text: "Suspendido", className: "text-amber-600" };
    case "deleted":
      return { text: "Eliminado", className: "text-muted-foreground" };
    default:
      return { text: status, className: "text-muted-foreground" };
  }
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    accountType?: string;
    includeDeleted?: string;
  }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const roleFilter = sp.role ?? "";
  const statusFilter = sp.status ?? "";
  const accountTypeFilter = sp.accountType ?? "";
  const includeDeleted = sp.includeDeleted === "true";

  const where = [] as ReturnType<typeof eq>[];
  if (!includeDeleted && !statusFilter) {
    where.push(ne(schema.users.status, "deleted"));
  }
  if (q) {
    where.push(
      or(
        like(sql`LOWER(${schema.users.username})`, `%${q.toLowerCase()}%`),
        like(sql`LOWER(${schema.users.fullName})`, `%${q.toLowerCase()}%`),
        like(sql`LOWER(${schema.users.email})`, `%${q.toLowerCase()}%`),
      )!,
    );
  }
  if (roleFilter === "admin" || roleFilter === "operario") {
    where.push(eq(schema.users.role, roleFilter));
  }
  if (
    statusFilter === "active" ||
    statusFilter === "suspended" ||
    statusFilter === "deleted"
  ) {
    where.push(eq(schema.users.status, statusFilter));
  }
  if (accountTypeFilter === "regular" || accountTypeFilter === "demo") {
    where.push(eq(schema.users.accountType, accountTypeFilter));
  }

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      email: schema.users.email,
      role: schema.users.role,
      status: schema.users.status,
      accountType: schema.users.accountType,
      accessExpiresAt: schema.users.accessExpiresAt,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.users.createdAt));

  // Total absoluto sin filtros (para mostrar contador "X de Y")
  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.users)
    .where(ne(schema.users.status, "deleted"));
  const totalActive = Number(totalRows[0]?.c ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground text-sm">
            {users.length} de {totalActive} usuarios activos
            {includeDeleted ? " (incluye eliminados)" : ""}
            {(q ||
              roleFilter ||
              statusFilter ||
              accountTypeFilter) &&
              " · filtros aplicados"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href="/usuarios/nuevo"
            className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
          >
            + Crear usuario
          </Link>
        </div>
      </div>

      <UsuariosFilters
        initial={{
          q,
          role: roleFilter,
          status: statusFilter,
          accountType: accountTypeFilter,
          includeDeleted,
        }}
      />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Correo</th>
              <th className="text-left px-4 py-3 font-medium">Rol</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Vence</th>
              <th className="text-left px-4 py-3 font-medium">Último login</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const st = statusLabel(u.status);
              return (
                <tr key={u.id} className="border-t border-border align-middle">
                  <td className="px-4 py-3 font-mono">{u.username}</td>
                  <td className="px-4 py-3">{u.fullName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.role === "admin"
                          ? "bg-brand/10 text-brand px-2 py-0.5 rounded text-xs font-medium"
                          : "bg-muted px-2 py-0.5 rounded text-xs"
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.accountType === "demo" ? (
                      <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        demo
                      </span>
                    ) : (
                      <span className="text-muted-foreground">regular</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${st.className}`}>
                    {st.text}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.accessExpiresAt
                      ? new Date(u.accessExpiresAt).toLocaleDateString("es-CO")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString("es-CO")
                      : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <UserActions
                      userId={u.id}
                      status={u.status}
                      isSelf={u.id === me.id}
                      hasEmail={Boolean(u.email)}
                    />
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
