"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type Initial = {
  q: string;
  role: string;
  status: string;
  accountType: string;
  includeDeleted: boolean;
};

export function UsuariosFilters({ initial }: { initial: Initial }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const [role, setRole] = useState(initial.role);
  const [status, setStatus] = useState(initial.status);
  const [accountType, setAccountType] = useState(initial.accountType);
  const [includeDeleted, setIncludeDeleted] = useState(initial.includeDeleted);

  function apply(next: Partial<Initial>) {
    const merged: Initial = {
      q: next.q ?? q,
      role: next.role ?? role,
      status: next.status ?? status,
      accountType: next.accountType ?? accountType,
      includeDeleted: next.includeDeleted ?? includeDeleted,
    };
    const sp = new URLSearchParams(params.toString());
    if (merged.q) sp.set("q", merged.q);
    else sp.delete("q");
    if (merged.role) sp.set("role", merged.role);
    else sp.delete("role");
    if (merged.status) sp.set("status", merged.status);
    else sp.delete("status");
    if (merged.accountType) sp.set("accountType", merged.accountType);
    else sp.delete("accountType");
    if (merged.includeDeleted) sp.set("includeDeleted", "true");
    else sp.delete("includeDeleted");
    startTransition(() => router.replace(`/usuarios?${sp.toString()}`));
  }

  function clear() {
    setQ("");
    setRole("");
    setStatus("");
    setAccountType("");
    setIncludeDeleted(false);
    startTransition(() => router.replace("/usuarios"));
  }

  const hasFilters =
    q || role || status || accountType || includeDeleted;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-2 items-center text-sm">
      <div className="flex-1 min-w-[200px]">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ q });
          }}
          placeholder="Buscar usuario, nombre o correo..."
          className="w-full border border-border rounded px-3 py-1.5 bg-background"
        />
      </div>

      <select
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          apply({ role: e.target.value });
        }}
        className="border border-border rounded px-2 py-1.5 bg-background"
      >
        <option value="">Todos los roles</option>
        <option value="admin">Admin</option>
        <option value="operario">Operario</option>
      </select>

      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          apply({ status: e.target.value });
        }}
        className="border border-border rounded px-2 py-1.5 bg-background"
      >
        <option value="">Todos los estados</option>
        <option value="active">Activos</option>
        <option value="suspended">Suspendidos</option>
        <option value="deleted">Eliminados</option>
      </select>

      <select
        value={accountType}
        onChange={(e) => {
          setAccountType(e.target.value);
          apply({ accountType: e.target.value });
        }}
        className="border border-border rounded px-2 py-1.5 bg-background"
      >
        <option value="">Todos los tipos</option>
        <option value="regular">Regulares</option>
        <option value="demo">Demos</option>
      </select>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={(e) => {
            setIncludeDeleted(e.target.checked);
            apply({ includeDeleted: e.target.checked });
          }}
        />
        Incluir eliminados
      </label>

      <button
        onClick={() => apply({ q })}
        disabled={isPending}
        className="border border-border rounded px-3 py-1.5 hover:bg-muted disabled:opacity-50"
      >
        Buscar
      </button>

      {hasFilters && (
        <button
          onClick={clear}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
