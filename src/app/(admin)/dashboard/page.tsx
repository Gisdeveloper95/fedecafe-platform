import Link from "next/link";
import { and, count, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";
import { redirect } from "next/navigation";

type Stat = { label: string; value: number; href: string };

export default async function DashboardPage() {
  const user = await getWebSessionUser();
  if (!user) redirect("/login");

  let stats: Stat[] = [];

  if (user.role === "admin") {
    const [users, operarios, medidores, estructuras, rutasPendientes, recorridos] =
      await Promise.all([
        db.select({ c: count() }).from(schema.users).where(eq(schema.users.active, true)),
        db
          .select({ c: count() })
          .from(schema.users)
          .where(and(eq(schema.users.active, true), eq(schema.users.role, "operario"))),
        db.select({ c: count() }).from(schema.medidores),
        db.select({ c: count() }).from(schema.estructuras),
        db
          .select({ c: count() })
          .from(schema.rutas)
          .where(eq(schema.rutas.estado, "pendiente")),
        db.select({ c: count() }).from(schema.recorridos),
      ]);

    stats = [
      { label: "Usuarios activos", value: users[0]?.c ?? 0, href: "/usuarios" },
      { label: "Operarios", value: operarios[0]?.c ?? 0, href: "/usuarios?role=operario" },
      { label: "Medidores en BD", value: medidores[0]?.c ?? 0, href: "/medidores" },
      { label: "Estructuras en BD", value: estructuras[0]?.c ?? 0, href: "/estructuras" },
      { label: "Rutas pendientes", value: rutasPendientes[0]?.c ?? 0, href: "/rutas" },
      { label: "Recorridos totales", value: recorridos[0]?.c ?? 0, href: "/recorridos" },
    ];
  } else {
    const [misRutas, misRecorridos] = await Promise.all([
      db
        .select({ c: count() })
        .from(schema.rutas)
        .where(and(eq(schema.rutas.operarioId, user.id), eq(schema.rutas.estado, "pendiente"))),
      db
        .select({ c: count() })
        .from(schema.recorridos)
        .where(eq(schema.recorridos.operarioId, user.id)),
    ]);

    stats = [
      { label: "Mis rutas pendientes", value: misRutas[0]?.c ?? 0, href: "/rutas" },
      { label: "Mis recorridos subidos", value: misRecorridos[0]?.c ?? 0, href: "/recorridos" },
    ];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Bienvenido, {user.fullName}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-card border border-border rounded-lg p-5 hover:shadow-md transition-shadow"
          >
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="text-3xl font-bold text-brand mt-1">{s.value}</div>
          </Link>
        ))}
      </div>

      {user.role === "admin" && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="font-semibold mb-3">Acciones rapidas</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/usuarios/nuevo"
              className="bg-brand text-brand-foreground rounded px-3 py-2 text-sm hover:opacity-90"
            >
              + Crear usuario
            </Link>
            <Link
              href="/rutas/nueva"
              className="bg-brand text-brand-foreground rounded px-3 py-2 text-sm hover:opacity-90"
            >
              + Crear ruta
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
