"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GisViewer } from "@/components/gis/gis-viewer";
import { PhotoGallery } from "@/components/gis/photo-gallery";
import type { FeaturePoint, SelectedFeature } from "@/components/gis/types";
import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Medidor = {
  contrato: string;
  latitude: number;
  longitude: number;
  usuario: string | null;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  updatedAt: string;
};

type Municipio = { nombre: string; total: number };

export function MedidoresWorkbench() {
  const dialog = useDialog();
  const toast = useToast();

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioSel, setMunicipioSel] = useState<string>("");
  const [q, setQ] = useState("");
  const [medidores, setMedidores] = useState<Medidor[]>([]);
  const [totalInDb, setTotalInDb] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Medidor | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Medidor>>({});

  // Cargar municipios al montar
  useEffect(() => {
    fetch("/api/municipios", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMunicipios(d.municipios ?? []))
      .catch(() => setMunicipios([]));
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar medidores cuando cambian filtros (con debounce)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (municipioSel) params.set("municipio", municipioSel);
      if (q) params.set("q", q);
      params.set("limit", "2000");
      setLoading(true);
      fetch(`/api/medidores?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setMedidores(d.medidores ?? []);
          setTotalInDb(d.totalInDb ?? null);
          setLoading(false);
        })
        .catch(() => {
          setMedidores([]);
          setLoading(false);
          toast.error("No se pudieron cargar los medidores");
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipioSel, q]);

  // Capas para el visor (memoized)
  const layers = useMemo(
    () => [
      {
        kind: "points" as const,
        id: "medidores",
        label: "Medidores",
        color: "#0f4d3a",
        features: medidores.map<FeaturePoint>((m) => ({
          id: m.contrato,
          lat: m.latitude,
          lon: m.longitude,
          label: m.nombre ?? m.contrato,
          data: {
            contrato: m.contrato,
            nombre: m.nombre,
            usuario: m.usuario,
            direccion: m.direccion,
            municipio: m.municipio,
          },
        })),
      },
    ],
    [medidores],
  );

  const selectedFeatureIds = useMemo(() => {
    if (!selected) return undefined;
    return { medidores: new Set([selected.contrato]) };
  }, [selected]);

  const handleFeatureClick = useCallback(
    (sel: SelectedFeature) => {
      const m = medidores.find((x) => x.contrato === sel.feature.id);
      if (m) {
        setSelected(m);
        setForm(m);
        setEditing(false);
      }
    },
    [medidores],
  );

  const handlePointMoved = useCallback(
    (_layerId: string, featureId: string, newLatLon: { lat: number; lon: number }) => {
      const target = medidores.find((m) => m.contrato === featureId);
      if (!target) return;
      setSelected(target);
      setForm({
        ...target,
        latitude: newLatLon.lat,
        longitude: newLatLon.lon,
      });
      setEditing(true);
      toast.warning(
        "Posición ajustada. Revisa y guarda los cambios en el panel.",
      );
    },
    [medidores, toast],
  );

  async function save() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/medidores/${selected.contrato}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        latitude: form.latitude,
        longitude: form.longitude,
        nombre: form.nombre ?? null,
        direccion: form.direccion ?? null,
        municipio: form.municipio ?? null,
        usuario: form.usuario ?? null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo guardar el medidor");
      return;
    }
    toast.success("Medidor actualizado");
    // Refrescar
    const params = new URLSearchParams();
    if (municipioSel) params.set("municipio", municipioSel);
    if (q) params.set("q", q);
    params.set("limit", "2000");
    const d = await fetch(`/api/medidores?${params}`).then((r) => r.json());
    setMedidores(d.medidores ?? []);
    setEditing(false);
    setSelected({ ...selected, ...form } as Medidor);
  }

  async function remove() {
    if (!selected) return;
    const ok = await dialog.confirm({
      title: "Eliminar medidor",
      message: `Eliminar el medidor ${selected.contrato}? Esta acción no se puede deshacer.`,
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/medidores/${selected.contrato}`, {
      method: "DELETE",
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Medidor eliminado");
    setMedidores((prev) =>
      prev.filter((m) => m.contrato !== selected.contrato),
    );
    setSelected(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
      {/* Mapa */}
      <div className="bg-card border border-border rounded-lg overflow-hidden relative min-h-[400px]">
        <GisViewer
          layers={layers}
          editable={true}
          selectedFeatureIds={selectedFeatureIds}
          onFeatureClick={handleFeatureClick}
          onPointMoved={handlePointMoved}
          showCoords
        />
        {loading && (
          <div className="absolute top-2 right-2 bg-card border border-border rounded px-3 py-1.5 text-xs shadow z-10">
            Cargando...
          </div>
        )}
      </div>

      {/* Panel lateral */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 overflow-auto">
        {/* Filtros */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Filtros</h2>
            {totalInDb !== null && (
              <span className="text-xs text-muted-foreground">
                {medidores.length} / {totalInDb}
              </span>
            )}
          </div>
          <input
            type="search"
            placeholder="Buscar contrato, nombre, usuario..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          />
          <select
            value={municipioSel}
            onChange={(e) => setMunicipioSel(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          >
            <option value="">Todos los municipios</option>
            {municipios.map((m) => (
              <option key={m.nombre} value={m.nombre}>
                {m.nombre} ({m.total})
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-border pt-3 flex-1 min-h-0 flex flex-col gap-3">
          {!selected && (
            <div className="text-sm text-muted-foreground text-center py-6">
              Haz click en un medidor del mapa para ver detalle y editarlo.
            </div>
          )}

          {selected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-mono text-sm">
                  {selected.contrato}
                </h3>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cerrar
                </button>
              </div>

              <FormField
                label="Nombre"
                value={form.nombre ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, nombre: v }));
                  setEditing(true);
                }}
              />
              <FormField
                label="Usuario"
                value={form.usuario ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, usuario: v }));
                  setEditing(true);
                }}
              />
              <FormField
                label="Dirección"
                value={form.direccion ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, direccion: v }));
                  setEditing(true);
                }}
              />
              <FormField
                label="Municipio"
                value={form.municipio ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, municipio: v }));
                  setEditing(true);
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  label="Latitud"
                  value={(form.latitude ?? 0).toString()}
                  mono
                  onChange={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                      setForm((f) => ({ ...f, latitude: n }));
                      setEditing(true);
                    }
                  }}
                />
                <FormField
                  label="Longitud"
                  value={(form.longitude ?? 0).toString()}
                  mono
                  onChange={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                      setForm((f) => ({ ...f, longitude: n }));
                      setEditing(true);
                    }
                  }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Tip: arrastra el marcador en el mapa para mover el medidor a su
                ubicación correcta.
              </p>

              <div className="border-t border-border pt-3">
                <PhotoGallery
                  targetType="medidor"
                  targetId={selected.contrato}
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={save}
                  disabled={saving || !editing}
                  className="flex-1 bg-brand text-brand-foreground rounded px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={remove}
                  disabled={saving}
                  className="border border-destructive text-destructive rounded px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border border-border rounded px-3 py-1.5 bg-background text-sm ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
