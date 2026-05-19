"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Operario = { id: string; fullName: string; username: string };

export function RecorridosFilters({
  operarios,
  initial,
}: {
  operarios: Operario[];
  initial: { operario?: string; desde?: string; hasta?: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`/recorridos?${params.toString()}`);
    });
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-end gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Operario</label>
        <select
          defaultValue={initial.operario ?? ""}
          onChange={(e) => update("operario", e.target.value)}
          className="border border-border rounded px-2 py-1.5 bg-background"
        >
          <option value="">Todos</option>
          {operarios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Desde</label>
        <input
          type="date"
          defaultValue={initial.desde ?? ""}
          onChange={(e) => update("desde", e.target.value)}
          className="border border-border rounded px-2 py-1.5 bg-background"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Hasta</label>
        <input
          type="date"
          defaultValue={initial.hasta ?? ""}
          onChange={(e) => update("hasta", e.target.value)}
          className="border border-border rounded px-2 py-1.5 bg-background"
        />
      </div>
      {(initial.operario || initial.desde || initial.hasta) && (
        <button
          onClick={() => startTransition(() => router.replace("/recorridos"))}
          className="text-xs underline text-muted-foreground hover:text-foreground ml-2"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
