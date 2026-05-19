"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnomalyActions({
  id,
  currentState,
}: {
  id: string;
  currentState: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setState(state: string, prompt_resolution = false) {
    let resolutionNotes: string | null = null;
    if (prompt_resolution) {
      resolutionNotes = window.prompt("Nota de resolución (opcional):");
      if (resolutionNotes === null) return;
    }
    setLoading(true);
    const res = await fetch("/api/anomalies", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, state, resolutionNotes }),
    });
    setLoading(false);
    if (!res.ok) {
      alert("Error: " + (await res.text()));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-1 justify-end flex-wrap">
      {currentState === "open" && (
        <button
          onClick={() => setState("in_progress")}
          disabled={loading}
          className="text-xs border border-blue-400 text-blue-700 rounded px-2 py-1 hover:bg-blue-50 disabled:opacity-50"
        >
          En curso
        </button>
      )}
      <button
        onClick={() => setState("resolved", true)}
        disabled={loading}
        className="text-xs border border-success text-success rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
      >
        Resolver
      </button>
      <button
        onClick={() => setState("discarded", true)}
        disabled={loading}
        className="text-xs border border-destructive text-destructive rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
      >
        Descartar
      </button>
    </div>
  );
}
