"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function LockdownToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !enabled;
    const ok = await dialog.confirm({
      title: next ? "Activar kill switch global" : "Desactivar kill switch",
      message: next
        ? "Esto bloquea a todos los usuarios no-admin en sus próximas llamadas al servidor o renovaciones de sesión. Solo úsalo en caso de incidente o suspensión general."
        : "El sistema volverá a permitir el acceso normal a todos los usuarios.",
      danger: next,
      confirmLabel: next ? "Activar bloqueo" : "Restaurar acceso",
    });
    if (!ok) return;

    setLoading(true);
    const res = await fetch("/api/admin/lockdown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("No se pudo cambiar el estado del kill switch");
      return;
    }
    setEnabled(next);
    toast.success(next ? "Bloqueo global activo" : "Acceso restaurado");
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
