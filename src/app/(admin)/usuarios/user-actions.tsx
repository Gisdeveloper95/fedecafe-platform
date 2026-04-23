"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserActions({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleActive() {
    if (!confirm(active ? "Desactivar este usuario?" : "Reactivar?")) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: active ? "DELETE" : "PATCH",
      headers: { "content-type": "application/json" },
      body: active ? undefined : JSON.stringify({ active: true }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Error");
      return;
    }
    router.refresh();
  }

  async function resetPassword() {
    const newPassword = prompt("Nueva contrasena (min 6 caracteres)");
    if (!newPassword || newPassword.length < 6) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    setLoading(false);
    if (!res.ok) {
      alert("Error al cambiar contrasena");
      return;
    }
    alert("Contrasena actualizada.");
  }

  return (
    <div className="flex gap-2 justify-end">
      <button
        onClick={resetPassword}
        disabled={loading}
        className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
      >
        Reset password
      </button>
      {!isSelf && (
        <button
          onClick={toggleActive}
          disabled={loading}
          className={`text-xs border rounded px-2 py-1 disabled:opacity-50 ${
            active
              ? "border-destructive text-destructive hover:bg-red-50"
              : "border-success text-success hover:bg-green-50"
          }`}
        >
          {active ? "Desactivar" : "Reactivar"}
        </button>
      )}
    </div>
  );
}
