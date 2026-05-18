import Link from "next/link";
import { desc, ne } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { UserActions } from "./user-actions";

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
  searchParams: Promise<{ includeDeleted?: string }>;
}) {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const includeDeleted = sp.includeDeleted === "true";

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
    .where(includeDeleted ? undefined : ne(schema.users.status, "deleted"))
    .orderBy(desc(schema.users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground text-sm">
            {users.length} usuarios{includeDeleted ? " (incluye eliminados)" : ""}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href={
              includeDeleted ? "/usuarios" : "/usuarios?includeDeleted=true"
            }
            className="text-xs border border-border rounded px-3 py-2 hover:bg-muted"
          >
            {includeDeleted ? "Ocultar eliminados" : "Mostrar eliminados"}
          </Link>
          <Link
            href="/usuarios/nuevo"
            className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
          >
            + Crear usuario
          </Link>
        </div>
      </div>

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
