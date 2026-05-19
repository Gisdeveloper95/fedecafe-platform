import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, schema } from "@/db/client";
import { getWebSessionUser } from "@/lib/auth/web-session";

import { LogoutButton } from "./_components/logout-button";

type NavItem = { href: string; label: string; badge?: number };

const operarioNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rutas", label: "Mis Rutas" },
  { href: "/recorridos", label: "Mis Recorridos" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getWebSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?suspended=1");
  if (user.mustChangePassword) redirect("/change-password");

  let nav: NavItem[] = [];
  if (user.role === "admin") {
    const pendingRows = await db
      .select({ c: count() })
      .from(schema.pendingCaptures)
      .where(eq(schema.pendingCaptures.state, "pending"));
    const pending = pendingRows[0]?.c ?? 0;

    nav = [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/usuarios", label: "Usuarios" },
      { href: "/demo-tokens", label: "Demos" },
      { href: "/revision", label: "Revisión", badge: pending },
      { href: "/medidores", label: "Medidores" },
      { href: "/estructuras", label: "Estructuras" },
      { href: "/rutas", label: "Rutas" },
      { href: "/recorridos", label: "Recorridos" },
      { href: "/configuracion", label: "Configuración" },
    ];
  } else {
    nav = operarioNav;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand text-brand-foreground shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-bold text-lg">
              Fedecafe Platform
            </Link>
            <nav className="flex gap-4 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1.5"
                >
                  {n.label}
                  {n.badge !== undefined && n.badge > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none font-semibold">
                      {n.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-90">
              {user.fullName}{" "}
              <span className="opacity-60">({user.role})</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
