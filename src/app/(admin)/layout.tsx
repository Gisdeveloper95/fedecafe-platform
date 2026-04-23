import Link from "next/link";
import { redirect } from "next/navigation";

import { getWebSessionUser } from "@/lib/auth/web-session";

import { LogoutButton } from "./_components/logout-button";

const adminNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuarios" },
  { href: "/medidores", label: "Medidores" },
  { href: "/estructuras", label: "Estructuras" },
  { href: "/rutas", label: "Rutas" },
  { href: "/recorridos", label: "Recorridos" },
];

const operarioNav = [
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

  const nav = user.role === "admin" ? adminNav : operarioNav;

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
                  className="opacity-80 hover:opacity-100 transition-opacity"
                >
                  {n.label}
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
