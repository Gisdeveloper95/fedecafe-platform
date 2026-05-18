"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TokenRowActions({ code }: { code: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function revoke() {
    if (
      !confirm(
        `Revocar el token ${code}? Los usuarios demo activos con este código serán suspendidos.`,
      )
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/demo-tokens/${code}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Error");
      return;
    }
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
