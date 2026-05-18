"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (sp.get("suspended") === "1") {
      setError("Tu cuenta no está activa. Contacta al administrador.");
    } else if (sp.get("reset") === "ok") {
      setError(null);
    }
  }, [sp]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const map: Record<string, string> = {
        invalid_credentials: "Usuario o contraseña incorrectos",
        user_suspended: "Tu cuenta está suspendida. Contacta al administrador.",
        user_deleted: "Esta cuenta fue eliminada.",
        global_lockdown:
          "El acceso al sistema está bloqueado en este momento.",
        access_expired: "Tu acceso expiró. Contacta al administrador.",
        demo_token_expired: "Tu acceso demo expiró.",
      };
      setError(map[data?.error] ?? "Error al iniciar sesión");
      setLoading(false);
      return;
    }

    if (data?.user?.mustChangePassword) {
      router.push("/change-password");
      router.refresh();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Usuario</span>
        <input
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        className="bg-brand text-brand-foreground rounded px-4 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? "Ingresando..." : "Iniciar sesión"}
      </button>
      <div className="text-center">
        <a
          href="/forgot-password"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>
    </form>
  );
}
