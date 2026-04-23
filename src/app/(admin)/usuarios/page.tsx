import Link from "next/link";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { UserActions } from "./user-actions";

export default async function UsuariosPage() {
  const me = await getWebSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      role: schema.users.role,
      active: schema.users.active,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground text-sm">
            {users.length} usuarios registrados
          </p>
        </div>
        <Link
          href="/usuarios/nuevo"
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
        >
          + Crear usuario
        </Link>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 font-medium">Nombre completo</th>
              <th className="text-left px-4 py-3 font-medium">Rol</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Ultimo login</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono">{u.username}</td>
                <td className="px-4 py-3">{u.fullName}</td>
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
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="text-success text-xs">Activo</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString("es-CO")
                    : "Nunca"}
                </td>
                <td className="px-4 py-3 text-right">
                  <UserActions
                    userId={u.id}
                    active={u.active}
                    isSelf={u.id === me.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
