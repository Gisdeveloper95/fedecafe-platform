"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: "admin" | "operario";
  sendCredentials: boolean;
  generatePassword: boolean;
};

export function NewUserForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    tempPassword?: string;
    emailDelivery?: string;
  } | null>(null);
  const [form, setForm] = useState<FormState>({
    username: "",
    fullName: "",
    email: "",
    password: "",
    role: "operario",
    sendCredentials: false,
    generatePassword: true,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      username: form.username,
      fullName: form.fullName,
      role: form.role,
      mustChangePassword: true,
    };
    if (form.email) payload.email = form.email;
    if (!form.generatePassword) payload.password = form.password;
    if (form.sendCredentials) payload.sendCredentials = true;

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      if (data?.error === "username_taken") setError("Ese usuario ya existe.");
      else if (data?.error === "validation_error") setError("Datos inválidos.");
      else if (data?.error === "email_required_when_sendCredentials")
        setError("Para enviar credenciales por correo necesitas el email.");
      else setError(data?.error ?? "Error al crear usuario.");
      return;
    }

    if (data.tempPassword || data.email) {
      setResult({
        tempPassword: data.tempPassword,
        emailDelivery: data.email?.delivery,
      });
    } else {
      router.push("/usuarios");
      router.refresh();
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Usuario creado</h2>
        {result.tempPassword && (
          <div className="border border-amber-200 bg-amber-50 rounded p-3 text-sm">
            <div className="font-medium text-amber-900">
              Contraseña temporal generada:
            </div>
            <div className="font-mono text-lg mt-1">{result.tempPassword}</div>
            <div className="text-xs text-amber-700 mt-1">
              Guárdala ahora; el sistema no la mostrará otra vez.
            </div>
          </div>
        )}
        {result.emailDelivery && (
          <div className="text-sm text-muted-foreground">
            Correo de credenciales: <strong>{result.emailDelivery}</strong>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              router.push("/usuarios");
              router.refresh();
            }}
            className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm"
          >
            Volver al listado
          </button>
        </div>
      </div>
    );
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
          onChange={(e) =>
            setForm({ ...form, username: e.target.value.toLowerCase() })
          }
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
        <span className="text-sm font-medium">
          Correo electrónico (opcional)
        </span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-xs text-muted-foreground">
          Si llenas este campo y marcas "Enviar credenciales por correo", el
          sistema enviará las credenciales automáticamente.
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.generatePassword}
          onChange={(e) =>
            setForm({ ...form, generatePassword: e.target.checked })
          }
        />
        Generar contraseña temporal automáticamente
      </label>

      {!form.generatePassword && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Contraseña inicial (mínimo 6 caracteres)
          </span>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand font-mono"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Rol</span>
        <select
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as "admin" | "operario" })
          }
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="operario">Operario (usa la app móvil en campo)</option>
          <option value="admin">Administrador (usa la web)</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.sendCredentials}
          onChange={(e) =>
            setForm({ ...form, sendCredentials: e.target.checked })
          }
          disabled={!form.email}
        />
        Enviar credenciales por correo (requiere email)
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
