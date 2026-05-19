"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewActions({ captureId }: { captureId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [needsInfo, setNeedsInfo] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");

  async function approve() {
    setLoading("approve");
    setError(null);
    const res = await fetch(`/api/captures/${captureId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: approveNotes || undefined }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "No se pudo aprobar");
      return;
    }
    router.push("/revision");
    router.refresh();
  }

  async function reject() {
    if (!rejectReason.trim()) {
      setError("La razón del rechazo es obligatoria.");
      return;
    }
    setLoading("reject");
    setError(null);
    const res = await fetch(`/api/captures/${captureId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: rejectReason, needsInfo }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "No se pudo rechazar");
      return;
    }
    router.push("/revision");
    router.refresh();
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
      <h2 className="font-semibold">Acción</h2>

      {error && (
        <div className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {!rejectMode ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Nota de aprobación (opcional)
            </span>
            <input
              type="text"
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              placeholder="Ej: Verificado contra catastro"
              className="border border-border rounded px-3 py-2 bg-card text-sm"
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={approve}
              disabled={loading !== null}
              className="bg-success text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#16a34a" }}
            >
              {loading === "approve" ? "Aprobando..." : "✓ Aprobar y aplicar"}
            </button>
            <button
              onClick={() => setRejectMode(true)}
              disabled={loading !== null}
              className="border border-destructive text-destructive rounded px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Razón del rechazo *</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Ej: La foto no muestra un medidor sino una caja de inspección"
              className="border border-border rounded px-3 py-2 bg-card text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={needsInfo}
              onChange={(e) => setNeedsInfo(e.target.checked)}
            />
            Pedir corrección al operario (puede reenviar)
          </label>

          <div className="flex gap-2">
            <button
              onClick={reject}
              disabled={loading !== null}
              className="bg-destructive text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#dc2626" }}
            >
              {loading === "reject"
                ? "Rechazando..."
                : needsInfo
                ? "Pedir corrección"
                : "Rechazar definitivo"}
            </button>
            <button
              onClick={() => setRejectMode(false)}
              disabled={loading !== null}
              className="border border-border rounded px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
