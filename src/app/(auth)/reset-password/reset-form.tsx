"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        data?.error === "invalid_or_expired_token"
          ? "El enlace es inválido o ya expiró. Solicita uno nuevo."
          : "No se pudo cambiar la contraseña.",
      );
      return;
    }
    router.push("/login?reset=ok");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
