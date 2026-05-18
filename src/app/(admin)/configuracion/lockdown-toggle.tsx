"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LockdownToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !enabled;
    const msg = next
      ? "Activar kill switch global? Esto bloquea a todos los usuarios no-admin en sus próximas llamadas."
      : "Desactivar kill switch global y restaurar el acceso?";
    if (!confirm(msg)) return;

    setLoading(true);
    const res = await fetch("/api/admin/lockdown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setLoading(false);
    if (!res.ok) {
      alert("Error al cambiar el estado.");
      return;
    }
    setEnabled(next);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-50 ${
        enabled
          ? "bg-destructive text-white border-destructive"
          : "bg-card border-border hover:bg-muted"
      }`}
    >
      {enabled ? "BLOQUEO ACTIVO" : "Sistema activo"}
    </button>
  );
}
