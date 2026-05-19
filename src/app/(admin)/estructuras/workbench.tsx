"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GisViewer } from "@/components/gis/gis-viewer";
import { PhotoGallery } from "@/components/gis/photo-gallery";
import type { FeaturePoint, SelectedFeature } from "@/components/gis/types";
import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Estructura = {
  codigo: string;
  layerName: string;
  latitude: number;
  longitude: number;
  ramal: string | null;
  nombre: string | null;
  tipo: string | null;
  estado: string | null;
  municipio: string | null;
  acueducto: string | null;
  updatedAt: string;
};

type Municipio = { nombre: string; total: number };

// Paleta por tipo de capa (consistente con QField/QGIS típicos)
const LAYER_COLORS: Record<string, string> = {
  Tanques: "#1d4ed8",
  Bocatomas: "#0891b2",
  Desarenadores: "#7c3aed",
  V_Salida: "#f59e0b",
  V_Regulacion: "#ea580c",
  V_Inspeccion: "#dc2626",
  default: "#16a34a",
};

function colorFor(layer: string) {
  return LAYER_COLORS[layer] ?? LAYER_COLORS.default;
}

export function EstructurasWorkbench() {
  const dialog = useDialog();
  const toast = useToast();

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [layerNames, setLayerNames] = useState<string[]>([]);
  const [municipioSel, setMunicipioSel] = useState<string>("");
  const [layerSel, setLayerSel] = useState<string>("");
  const [q, setQ] = useState("");
  const [estructuras, setEstructuras] = useState<Estructura[]>([]);
  const [totalInDb, setTotalInDb] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Estructura | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Estructura>>({});

  useEffect(() => {
    fetch("/api/municipios", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMunicipios(d.municipios ?? []))
      .catch(() => setMunicipios([]));
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (municipioSel) params.set("municipio", municipioSel);
      if (layerSel) params.set("layer", layerSel);
      if (q) params.set("q", q);
      params.set("limit", "2000");
      setLoading(true);
      fetch(`/api/estructuras?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const items = (d.estructuras ?? []) as Estructura[];
          setEstructuras(items);
          setTotalInDb(d.totalInDb ?? null);
          // Recolectar layerNames distintos para el filtro
          const setL = new Set<string>();
          for (const e of items) setL.add(e.layerName);
          setLayerNames(Array.from(setL).sort());
          setLoading(false);
        })
        .catch(() => {
          setEstructuras([]);
          setLoading(false);
          toast.error("No se pudieron cargar las estructuras");
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipioSel, layerSel, q]);

  // Una capa GIS por layer_name distinto
  const layers = useMemo(() => {
    const grouped = new Map<string, Estructura[]>();
    for (const e of estructuras) {
      const arr = grouped.get(e.layerName) ?? [];
      arr.push(e);
      grouped.set(e.layerName, arr);
    }
    return Array.from(grouped.entries()).map(([layerName, items]) => ({
      kind: "points" as const,
      id: `layer-${layerName}`,
      label: layerName,
      color: colorFor(layerName),
      features: items.map<FeaturePoint>((e) => ({
        id: e.codigo,
        lat: e.latitude,
        lon: e.longitude,
        label: e.nombre ?? e.codigo,
        category: layerName,
      })),
    }));
  }, [estructuras]);

  const selectedFeatureIds = useMemo(() => {
    if (!selected) return undefined;
    return { [`layer-${selected.layerName}`]: new Set([selected.codigo]) };
  }, [selected]);

  const handleFeatureClick = useCallback(
    (sel: SelectedFeature) => {
      const e = estructuras.find((x) => x.codigo === sel.feature.id);
      if (e) {
        setSelected(e);
        setForm(e);
        setEditing(false);
      }
    },
    [estructuras],
  );

  const handlePointMoved = useCallback(
    (
      _layerId: string,
      featureId: string,
      newLatLon: { lat: number; lon: number },
    ) => {
      const target = estructuras.find((e) => e.codigo === featureId);
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
    [estructuras, toast],
  );

  async function save() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/estructuras/${selected.codigo}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        layerName: form.layerName,
        latitude: form.latitude,
        longitude: form.longitude,
        nombre: form.nombre ?? null,
        ramal: form.ramal ?? null,
        tipo: form.tipo ?? null,
        estado: form.estado ?? null,
        municipio: form.municipio ?? null,
        acueducto: form.acueducto ?? null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Estructura actualizada");
    const params = new URLSearchParams();
    if (municipioSel) params.set("municipio", municipioSel);
    if (layerSel) params.set("layer", layerSel);
    if (q) params.set("q", q);
    params.set("limit", "2000");
    const d = await fetch(`/api/estructuras?${params}`).then((r) => r.json());
    setEstructuras(d.estructuras ?? []);
    setEditing(false);
    setSelected({ ...selected, ...form } as Estructura);
  }

  async function remove() {
    if (!selected) return;
    const ok = await dialog.confirm({
      title: "Eliminar estructura",
      message: `Eliminar ${selected.codigo} (${selected.layerName})? Esta acción no se puede deshacer.`,
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/estructuras/${selected.codigo}`, {
      method: "DELETE",
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Estructura eliminada");
    setEstructuras((prev) => prev.filter((e) => e.codigo !== selected.codigo));
    setSelected(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
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

      <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 overflow-auto">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Filtros</h2>
            {totalInDb !== null && (
              <span className="text-xs text-muted-foreground">
                {estructuras.length} / {totalInDb}
              </span>
            )}
          </div>
          <input
            type="search"
            placeholder="Buscar código, nombre, ramal..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          />
          <select
            value={layerSel}
            onChange={(e) => setLayerSel(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          >
            <option value="">Todas las capas</option>
            {layerNames.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
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

        <div className="border-t border-border pt-3 flex-1 min-h-0">
          {!selected && (
            <div className="text-sm text-muted-foreground text-center py-6">
              Haz click en una estructura del mapa para ver detalle y editarla.
            </div>
          )}

          {selected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-mono text-sm">
                  {selected.codigo}
                </h3>
                <span
                  className="text-xs px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: colorFor(selected.layerName) }}
                >
                  {selected.layerName}
                </span>
              </div>

              <Field
                label="Capa"
                value={form.layerName ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, layerName: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Nombre"
                value={form.nombre ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, nombre: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Tipo"
                value={form.tipo ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, tipo: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Estado"
                value={form.estado ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, estado: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Ramal"
                value={form.ramal ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, ramal: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Acueducto"
                value={form.acueducto ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, acueducto: v }));
                  setEditing(true);
                }}
              />
              <Field
                label="Municipio"
                value={form.municipio ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, municipio: v }));
                  setEditing(true);
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Lat"
                  mono
                  value={(form.latitude ?? 0).toString()}
                  onChange={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                      setForm((f) => ({ ...f, latitude: n }));
                      setEditing(true);
                    }
                  }}
                />
                <Field
                  label="Lon"
                  mono
                  value={(form.longitude ?? 0).toString()}
                  onChange={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                      setForm((f) => ({ ...f, longitude: n }));
                      setEditing(true);
                    }
                  }}
                />
              </div>

              <div className="border-t border-border pt-3">
                <PhotoGallery
                  targetType="estructura"
                  targetId={selected.codigo}
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

function Field({
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
