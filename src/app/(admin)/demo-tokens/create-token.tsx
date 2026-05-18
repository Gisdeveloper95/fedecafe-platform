"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateDemoTokenButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    code: string;
    expiresAt: string;
    maxActivations: number;
    emailDelivery?: string;
  } | null>(null);
  const [form, setForm] = useState({
    label: "",
    ttlDays: 7,
    maxActivations: 1,
    notifyEmail: "",
    notes: "",
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload: Record<string, unknown> = {
      ttlDays: Number(form.ttlDays),
      maxActivations: Number(form.maxActivations),
    };
    if (form.label) payload.label = form.label;
    if (form.notifyEmail) payload.notifyEmail = form.notifyEmail;
    if (form.notes) payload.notes = form.notes;

    const res = await fetch("/api/demo-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "Error al crear el token");
      return;
    }
    setCreated({
      code: data.token.code,
      expiresAt: data.token.expiresAt,
      maxActivations: data.token.maxActivations,
      emailDelivery: data.email?.delivery,
    });
  }

  function close() {
    setOpen(false);
    setCreated(null);
    setError(null);
    setForm({
      label: "",
      ttlDays: 7,
      maxActivations: 1,
      notifyEmail: "",
      notes: "",
    });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
      >
        + Crear token demo
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-6 flex flex-col gap-4">
        {created ? (
          <>
            <h2 className="text-lg font-semibold">Token creado</h2>
            <div className="bg-muted rounded p-4 text-center">
              <div className="text-xs text-muted-foreground mb-2">
                Código de 6 dígitos
              </div>
              <div className="text-4xl font-bold font-mono tracking-widest text-brand">
                {created.code}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div>
                <strong>Vence:</strong>{" "}
                {new Date(created.expiresAt).toLocaleString("es-CO")}
              </div>
              <div>
                <strong>Activaciones máx:</strong> {created.maxActivations}
              </div>
              {created.emailDelivery && (
                <div>
                  <strong>Correo:</strong> {created.emailDelivery}
                </div>
              )}
            </div>
            <button
              onClick={close}
              className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90"
            >
              Listo
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Crear token demo</h2>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Etiqueta (opcional)</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ej: Demo cliente X"
                className="border border-border rounded px-3 py-2 bg-card"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Días de vigencia</span>
              <input
                type="number"
                required
                min={1}
                max={90}
                value={form.ttlDays}
                onChange={(e) =>
                  setForm({ ...form, ttlDays: Number(e.target.value) })
                }
                className="border border-border rounded px-3 py-2 bg-card"
              />
              <span className="text-xs text-muted-foreground">
                El usuario podrá usar la app este número de días desde su activación.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Activaciones máximas</span>
              <input
                type="number"
                required
                min={1}
                max={50}
                value={form.maxActivations}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxActivations: Number(e.target.value),
                  })
                }
                className="border border-border rounded px-3 py-2 bg-card"
              />
              <span className="text-xs text-muted-foreground">
                Cuántos dispositivos pueden activar este código.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Enviar por correo (opcional)
              </span>
              <input
                type="email"
                value={form.notifyEmail}
                onChange={(e) =>
                  setForm({ ...form, notifyEmail: e.target.value })
                }
                className="border border-border rounded px-3 py-2 bg-card"
              />
            </label>

            {error && (
              <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={close}
                className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Creando..." : "Crear"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
