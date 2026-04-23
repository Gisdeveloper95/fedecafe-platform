"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Ruta = {
  id: string;
  nombre: string;
  tipo: "medidores" | "estructuras";
  estado: "pendiente" | "en_curso" | "completada" | "archivada";
  operarioId: string;
  operarioName: string | null;
  notas: string | null;
  createdAt: string;
};

type Item = {
  rutaId: string;
  codigo: string;
  orden: number | null;
  visitado: boolean;
  visitadoAt: string | null;
};

type Coords = Record<string, { lat: number; lng: number; nombre: string | null }>;

export function RutaDetail({
  ruta,
  items,
  coords,
  canEdit,
}: {
  ruta: Ruta;
  items: Item[];
  coords: Coords;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(ruta.estado);
  const [loadingEstado, setLoadingEstado] = useState(false);

  async function cambiarEstado(nuevo: Ruta["estado"]) {
    setLoadingEstado(true);
    const res = await fetch(`/api/rutas/${ruta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    setLoadingEstado(false);
    if (res.ok) {
      setEstado(nuevo);
      router.refresh();
    } else {
      alert("Error al cambiar estado");
    }
  }

  async function eliminar() {
    if (!confirm("Eliminar esta ruta? No se puede deshacer.")) return;
    const res = await fetch(`/api/rutas/${ruta.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/rutas");
      router.refresh();
    } else {
      alert("Error al eliminar");
    }
  }

  const visitados = items.filter((i) => i.visitado).length;
  const missing = items.filter((i) => !coords[i.codigo]).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/rutas" className="text-xs text-brand hover:underline">
          ← Volver a rutas
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold">{ruta.nombre}</h1>
            <div className="flex gap-2 items-center mt-1 text-sm text-muted-foreground">
              <span>Tipo: {ruta.tipo}</span>
              <span>•</span>
              <span>Operario: {ruta.operarioName}</span>
              <span>•</span>
              <span>
                {new Date(ruta.createdAt).toLocaleString("es-CO", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={eliminar}
              className="text-xs border border-destructive text-destructive rounded px-3 py-1 hover:bg-red-50"
            >
              Eliminar ruta
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground">Total puntos</div>
          <div className="text-2xl font-bold">{items.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground">Visitados</div>
          <div className="text-2xl font-bold text-success">{visitados}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground">Pendientes</div>
          <div className="text-2xl font-bold">{items.length - visitados}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground">Sin coordenadas</div>
          <div className="text-2xl font-bold text-destructive">{missing}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Estado</h2>
          <span className="text-xs bg-muted rounded px-2 py-0.5">{estado}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["pendiente", "en_curso", "completada", "archivada"] as const).map((e) => (
            <button
              key={e}
              disabled={loadingEstado || e === estado}
              onClick={() => cambiarEstado(e)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                e === estado
                  ? "bg-brand text-brand-foreground border-brand"
                  : "border-border hover:bg-muted"
              } disabled:opacity-50`}
            >
              {e}
            </button>
          ))}
        </div>
        {ruta.notas && (
          <div className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium">Notas:</span> {ruta.notas}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="bg-muted px-4 py-2 font-medium text-sm">
          Puntos de la ruta
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 w-10">#</th>
              <th className="text-left px-4 py-2">Codigo</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Coords</th>
              <th className="text-center px-4 py-2">Visitado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const c = coords[it.codigo];
              return (
                <tr key={it.codigo} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2 font-mono">{it.codigo}</td>
                  <td className="px-4 py-2">{c?.nombre ?? "-"}</td>
                  <td className="px-4 py-2 text-xs font-mono">
                    {c ? (
                      `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`
                    ) : (
                      <span className="text-destructive">sin coords</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {it.visitado ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
