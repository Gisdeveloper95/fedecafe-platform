"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        current_password_required: "Ingresa tu contraseña actual.",
        current_password_incorrect: "La contraseña actual es incorrecta.",
      };
      setError(map[data?.error] ?? "Error al cambiar contraseña.");
      return;
    }
    // Después de cambiar password, las sesiones móviles fueron revocadas.
    // La sesión web sigue activa porque no la borramos. Forzamos refresh.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Contraseña actual</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Repetir nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      {error && (
        <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="bg-brand text-brand-foreground rounded px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Cambiar contraseña"}
      </button>
    </form>
  );
}
