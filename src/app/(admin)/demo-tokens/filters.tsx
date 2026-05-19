"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type StateFilter = "all" | "active" | "expired" | "revoked" | "exhausted";

const STATE_LABELS: Record<StateFilter, string> = {
  all: "Todos",
  active: "Activos",
  expired: "Vencidos",
  revoked: "Revocados",
  exhausted: "Sin cupos",
};

export function DemoTokensFilters({
  initial,
}: {
  initial: { q: string; state: StateFilter };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);

  function apply(next: Partial<{ q: string; state: StateFilter }>) {
    const sp = new URLSearchParams(params.toString());
    if (next.q !== undefined) {
      if (next.q) sp.set("q", next.q);
      else sp.delete("q");
    }
    if (next.state !== undefined) {
      if (next.state && next.state !== "all") sp.set("state", next.state);
      else sp.delete("state");
    }
    startTransition(() => router.replace(`/demo-tokens?${sp.toString()}`));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATE_LABELS) as StateFilter[]).map((s) => {
          const isCurrent = (initial.state ?? "all") === s;
          return (
            <Link
              key={s}
              href={`/demo-tokens${s === "all" ? "" : "?state=" + s}${
                q ? `${s === "all" ? "?" : "&"}q=${encodeURIComponent(q)}` : ""
              }`}
              className={`px-3 py-1.5 rounded border text-sm ${
                isCurrent
                  ? "bg-brand text-brand-foreground border-brand"
                  : "bg-card border-border hover:bg-muted"
              }`}
            >
              {STATE_LABELS[s]}
            </Link>
          );
        })}
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ q });
          }}
          placeholder="Buscar por código o etiqueta..."
          className="flex-1 border border-border rounded px-3 py-1.5 bg-background text-sm"
        />
        <button
          onClick={() => apply({ q })}
          disabled={isPending}
          className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Buscar
        </button>
        {(initial.q || initial.state !== "all") && (
          <Link
            href="/demo-tokens"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Limpiar
          </Link>
        )}
      </div>
    </div>
  );
}
