"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function TokenRowActions({ code }: { code: string }) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function revoke() {
    const ok = await dialog.confirm({
      title: "Revocar token demo",
      message: `Revocar el token ${code}? Los usuarios demo activos con este código serán suspendidos.`,
      danger: true,
      confirmLabel: "Revocar",
    });
    if (!ok) return;
    setLoading(true);
    const res = await fetch(`/api/demo-tokens/${code}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "No se pudo revocar el token");
      return;
    }
    toast.success("Token revocado y demos suspendidos");
    router.refresh();
  }

  return (
    <button
      onClick={revoke}
      disabled={loading}
      className="text-xs border border-destructive text-destructive rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
    >
      Revocar
    </button>
  );
}
