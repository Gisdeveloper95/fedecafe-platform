"use client";

import { useState } from "react";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-sm text-muted-foreground">
        Si esa dirección está registrada, recibirás un correo con un enlace para
        restablecer la contraseña. Revisa la bandeja de entrada (y la carpeta de
        spam).
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Correo electrónico</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-border rounded px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-brand text-brand-foreground rounded px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Enviando..." : "Enviar enlace"}
      </button>
    </form>
  );
}
