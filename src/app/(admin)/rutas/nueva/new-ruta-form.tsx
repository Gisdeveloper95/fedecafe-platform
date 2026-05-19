"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useDialog } from "@/components/ui/modal";

type Operario = { id: string; username: string; fullName: string };

function parseCodes(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;\t\n\r]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

export function NewRutaForm({ operarios }: { operarios: Operario[] }) {
  const router = useRouter();
  const dialog = useDialog();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    tipo: "medidores" as "medidores" | "estructuras",
    operarioId: operarios[0]?.id ?? "",
    rawCodes: "",
    notas: "",
  });

  const parsed = parseCodes(form.rawCodes);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (parsed.length === 0) {
      setError("Debes ingresar al menos un codigo.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/rutas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        tipo: form.tipo,
        operarioId: form.operarioId,
        codigos: parsed,
        notas: form.notas || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data?.error ?? "Error al crear ruta");
      return;
    }

    if (data.missingCodes?.length > 0) {
      await dialog.alert({
        title: "Ruta creada con códigos faltantes",
        message:
          `${data.missingCodes.length} códigos no existen en la base de datos:\n\n` +
          data.missingCodes.slice(0, 20).join(", ") +
          (data.missingCodes.length > 20 ? "..." : ""),
        tone: "warning",
      });
    }

    router.push(`/rutas/${data.ruta.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Nombre de la ruta</span>
        <input
          type="text"
          required
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Ruta La Tebaida - 15 junio"
          className="border border-border rounded px-3 py-2 bg-card"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Tipo de ruta</span>
          <select
            value={form.tipo}
            onChange={(e) =>
              setForm({ ...form, tipo: e.target.value as typeof form.tipo })
            }
            className="border border-border rounded px-3 py-2 bg-card"
          >
            <option value="medidores">Medidores (por contrato)</option>
            <option value="estructuras">Estructuras (por codigo)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Operario asignado</span>
          <select
            value={form.operarioId}
            onChange={(e) => setForm({ ...form, operarioId: e.target.value })}
            className="border border-border rounded px-3 py-2 bg-card"
          >
            {operarios.map((op) => (
              <option key={op.id} value={op.id}>
                {op.fullName} ({op.username})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Codigos a visitar{" "}
          <span className="text-muted-foreground font-normal">
            ({parsed.length} unicos)
          </span>
        </span>
        <textarea
          required
          rows={8}
          value={form.rawCodes}
          onChange={(e) => setForm({ ...form, rawCodes: e.target.value })}
          placeholder={
            form.tipo === "medidores"
              ? "CTR-001\nCTR-002\nCTR-003\n\n(o separados por comas, punto y coma o tabs)"
              : "BOC-001\nTNK-002\nV_REG-003\n\n(o separados por comas, punto y coma o tabs)"
          }
          className="border border-border rounded px-3 py-2 bg-card font-mono text-sm"
        />
        <span className="text-xs text-muted-foreground">
          Separa por lineas, espacios, comas, punto y comas o tabs. Los codigos
          duplicados se eliminan automaticamente.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notas (opcional)</span>
        <textarea
          rows={2}
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
          className="border border-border rounded px-3 py-2 bg-card"
        />
      </label>

      {error && (
        <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || parsed.length === 0}
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creando..." : `Crear ruta (${parsed.length} puntos)`}
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
