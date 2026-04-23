"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs border border-brand-foreground/30 rounded px-2 py-1 hover:bg-brand-foreground/10 transition-colors"
    >
      Cerrar sesion
    </button>
  );
}
