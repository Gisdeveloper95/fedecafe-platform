"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewUserForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    fullName: "",
    password: "",
    role: "operario" as "admin" | "operario",
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      if (data?.error === "username_taken") setError("Ese usuario ya existe.");
      else if (data?.error === "validation_error") setError("Datos invalidos.");
      else setError("Error al crear usuario.");
      return;
    }

    router.push("/usuarios");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Usuario (sin espacios)</span>
        <input
          type="text"
          required
          minLength={3}
          maxLength={50}
          pattern="[a-zA-Z0-9._\-]+"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Nombre completo</span>
        <input
          type="text"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Contrasena inicial (min 6 caracteres)</span>
        <input
          type="text"
          required
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand font-mono"
        />
        <span className="text-xs text-muted-foreground">
          El usuario debera cambiarla al primer inicio de sesion.
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Rol</span>
        <select
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as "admin" | "operario" })
          }
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="operario">Operario (usa la app movil en campo)</option>
          <option value="admin">Administrador (usa la web)</option>
        </select>
      </label>

      {error && (
        <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear usuario"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
