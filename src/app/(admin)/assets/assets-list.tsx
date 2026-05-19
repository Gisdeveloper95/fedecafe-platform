"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/toast";

type Asset = {
  key: string;
  layerType: string;
  layerLabel: string;
  scope: string | null;
  latestVersion: number;
  totalVersions: number;
  latestPublishedAt: string;
  sizeBytes: number | null;
};

function humanBytes(b: number | null): string {
  if (!b || b <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function AssetsList({ assets }: { assets: Asset[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function descargar(a: Asset) {
    setBusy(a.key);
    try {
      const res = await fetch(
        `/api/data-assets/${encodeURIComponent(a.key)}/download`,
      );
      if (!res.ok) {
        toast.error("No se pudo obtener la URL de descarga");
        return;
      }
      const data = await res.json();
      const url = data.downloadUrl;
      if (!url) {
        toast.error("La URL firmada no llegó");
        return;
      }
      // Forzar descarga al PC. El cliente baja directo de R2 — no pasa por
      // el servidor de la app, evitando timeouts de Vercel.
      const link = document.createElement("a");
      link.href = url;
      link.download = `${a.key}-v${a.latestVersion}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(
        `Descarga iniciada. El archivo se está bajando directamente desde R2.`,
      );
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Clave</th>
            <th className="text-left px-4 py-3 font-medium">Tipo</th>
            <th className="text-left px-4 py-3 font-medium">Ámbito</th>
            <th className="text-left px-4 py-3 font-medium">Versión</th>
            <th className="text-left px-4 py-3 font-medium">Tamaño</th>
            <th className="text-left px-4 py-3 font-medium">Publicado</th>
            <th className="text-right px-4 py-3 font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="text-center text-muted-foreground py-10"
              >
                No hay assets publicados. Publica MBTiles, ortofotos u otros
                archivos pesados desde rutas_builder.
              </td>
            </tr>
          )}
          {assets.map((a) => (
            <tr key={a.key} className="border-t border-border align-middle">
              <td className="px-4 py-3 font-mono">{a.key}</td>
              <td className="px-4 py-3 text-xs">{a.layerLabel}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {a.scope ?? "—"}
              </td>
              <td className="px-4 py-3 text-xs">
                v{a.latestVersion}
                {a.totalVersions > 1 && (
                  <span className="text-muted-foreground ml-1">
                    ({a.totalVersions} totales)
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">{humanBytes(a.sizeBytes)}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(a.latestPublishedAt).toLocaleString("es-CO")}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => descargar(a)}
                  disabled={busy === a.key}
                  className="text-xs bg-brand text-brand-foreground rounded px-3 py-1 hover:opacity-90 disabled:opacity-50"
                >
                  {busy === a.key ? "..." : "Descargar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
