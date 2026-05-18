"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "active" | "suspended" | "deleted";

export function UserActions({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: Status;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(next: Status, msg: string) {
    if (!confirm(msg)) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Error");
      return;
    }
    router.refresh();
  }

  async function softDelete() {
    if (!confirm("Eliminar este usuario? Se podrá restaurar luego.")) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Error");
      return;
    }
    router.refresh();
  }

  async function resetPassword() {
    const newPassword = prompt(
      "Nueva contraseña (mínimo 6 caracteres). El usuario deberá cambiarla en su próximo login.",
    );
    if (!newPassword || newPassword.length < 6) return;
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    setLoading(false);
    if (!res.ok) {
      alert("Error al cambiar contraseña");
      return;
    }
    alert("Contraseña actualizada. Las sesiones móviles fueron revocadas.");
  }

  return (
    <div className="flex gap-2 justify-end flex-wrap">
      <button
        onClick={resetPassword}
        disabled={loading}
        className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
      >
        Reset password
      </button>
      {!isSelf && status === "active" && (
        <button
          onClick={() =>
            setStatus(
              "suspended",
              "Suspender este usuario? Se revocan sus sesiones y no podrá hacer login.",
            )
          }
          disabled={loading}
          className="text-xs border border-amber-500 text-amber-700 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-50"
        >
          Suspender
        </button>
      )}
      {!isSelf && status === "suspended" && (
        <button
          onClick={() => setStatus("active", "Reactivar este usuario?")}
          disabled={loading}
          className="text-xs border border-success text-success rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
        >
          Reactivar
        </button>
      )}
      {!isSelf && status === "deleted" && (
        <button
          onClick={() =>
            setStatus("active", "Restaurar este usuario como activo?")
          }
          disabled={loading}
          className="text-xs border border-success text-success rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
        >
          Restaurar
        </button>
      )}
      {!isSelf && status !== "deleted" && (
        <button
          onClick={softDelete}
          disabled={loading}
          className="text-xs border border-destructive text-destructive rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
        >
          Eliminar
        </button>
      )}
    </div>
  );
}
