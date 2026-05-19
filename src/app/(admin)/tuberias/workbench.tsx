"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GisViewer } from "@/components/gis/gis-viewer";
import { PhotoGallery } from "@/components/gis/photo-gallery";
import type {
  FeatureLine,
  FeaturePoint,
  LayerSpec,
  SelectedFeature,
} from "@/components/gis/types";
import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Tuberia = {
  codigo: string;
  layerName: string;
  material: string | null;
  diametro: string | null;
  ramal: string | null;
  municipio: string | null;
  acueducto: string | null;
  longitudM: number | null;
  centroidLat: number | null;
  centroidLon: number | null;
  geometryJson: string | null;
  updatedAt: string;
};

type Meta = { nombre: string; total: number };

// Color por material (común en QField). Si no se reconoce, usa fallback.
const MATERIAL_COLORS: Record<string, string> = {
  PVC: "#1d4ed8",
  HG: "#ea580c",
  PE: "#16a34a",
  HFD: "#7c3aed",
  CONCRETO: "#6b7280",
  default: "#0891b2",
};
function colorFor(material: string | null) {
  if (!material) return MATERIAL_COLORS.default;
  const k = material.toUpperCase().trim().split(/\s/)[0];
  return MATERIAL_COLORS[k] ?? MATERIAL_COLORS.default;
}

// Parsea geometry_json (GeoJSON LineString) y devuelve vértices [lat, lon]
function parseGeometry(json: string | null): Array<[number, number]> | null {
  if (!json) return null;
  try {
    const g = JSON.parse(json) as {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
    if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return null;
    return g.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

export function TuberiasWorkbench() {
  const dialog = useDialog();
  const toast = useToast();

  const [meta, setMeta] = useState<{
    layers: Meta[];
    materiales: Meta[];
    diametros: Meta[];
    municipios: Meta[];
  }>({ layers: [], materiales: [], diametros: [], municipios: [] });

  const [q, setQ] = useState("");
  const [layerSel, setLayerSel] = useState("");
  const [municipioSel, setMunicipioSel] = useState("");
  const [materialSel, setMaterialSel] = useState(""); // client-side
  const [diametroSel, setDiametroSel] = useState(""); // client-side

  const [tuberias, setTuberias] = useState<Tuberia[]>([]);
  const [totalInDb, setTotalInDb] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Tuberia | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Tuberia>>({});

  useEffect(() => {
    fetch("/api/tuberias/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMeta(d))
      .catch(() => {});
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (layerSel) params.set("layer", layerSel);
      if (municipioSel) params.set("municipio", municipioSel);
      if (q) params.set("q", q);
      params.set("limit", "2000");
      setLoading(true);
      fetch(`/api/tuberias?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setTuberias((d.tuberias ?? []) as Tuberia[]);
          setTotalInDb(d.totalInDb ?? null);
          setLoading(false);
        })
        .catch(() => {
          setTuberias([]);
          setLoading(false);
          toast.error("No se pudieron cargar las tuberías");
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerSel, municipioSel, q]);

  // Filtro client-side por material y diámetro
  const filteredTuberias = useMemo(() => {
    return tuberias.filter(
      (t) =>
        (!materialSel || (t.material ?? "").trim() === materialSel) &&
        (!diametroSel || (t.diametro ?? "").trim() === diametroSel),
    );
  }, [tuberias, materialSel, diametroSel]);

  // Agrupar por material. Para cada material se generan HASTA 2 capas:
  //  - Líneas (cuando hay geometry_json válido)
  //  - Puntos en centroide (fallback cuando no hay geometría — caso actual
  //    en producción: las 234 tuberías sincronizadas no tienen LineString
  //    todavía, solo centroide).
  const layers = useMemo<LayerSpec[]>(() => {
    const byMaterial = new Map<string, Tuberia[]>();
    for (const t of filteredTuberias) {
      const m = (t.material ?? "—").trim() || "—";
      const arr = byMaterial.get(m) ?? [];
      arr.push(t);
      byMaterial.set(m, arr);
    }
    const result: LayerSpec[] = [];
    for (const [material, items] of byMaterial.entries()) {
      const lines: FeatureLine[] = [];
      const points: FeaturePoint[] = [];
      for (const t of items) {
        const vertices = parseGeometry(t.geometryJson);
        if (vertices && vertices.length >= 2) {
          lines.push({
            id: t.codigo,
            vertices,
            label: t.codigo,
            category: material,
          });
        } else if (t.centroidLat != null && t.centroidLon != null) {
          points.push({
            id: t.codigo,
            lat: t.centroidLat,
            lon: t.centroidLon,
            label: t.codigo,
            category: material,
          });
        }
      }
      if (lines.length > 0) {
        result.push({
          kind: "lines",
          id: `material-${material}`,
          label: `${material}${
            points.length > 0
              ? ` · ${lines.length} líneas + ${points.length} pts`
              : ` (${lines.length})`
          }`,
          color: colorFor(material),
          width: 4,
          features: lines,
        });
      }
      if (points.length > 0) {
        result.push({
          kind: "points",
          id: `material-${material}-pts`,
          label:
            lines.length > 0
              ? `${material} (centroide)`
              : `${material} (${points.length} centroides)`,
          color: colorFor(material),
          features: points,
        });
      }
    }
    return result;
  }, [filteredTuberias]);

  const selectedFeatureIds = useMemo(() => {
    if (!selected) return undefined;
    const mat = (selected.material ?? "—").trim() || "—";
    // Resaltamos en ambas capas posibles — la que esté visible aplicará
    return {
      [`material-${mat}`]: new Set([selected.codigo]),
      [`material-${mat}-pts`]: new Set([selected.codigo]),
    };
  }, [selected]);

  const handleFeatureClick = useCallback(
    (sel: SelectedFeature) => {
      const t = filteredTuberias.find((x) => x.codigo === sel.feature.id);
      if (t) {
        setSelected(t);
        setForm(t);
        setEditing(false);
      }
    },
    [filteredTuberias],
  );

  async function save() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/tuberias/${selected.codigo}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        layerName: form.layerName,
        material: form.material ?? null,
        diametro: form.diametro ?? null,
        ramal: form.ramal ?? null,
        municipio: form.municipio ?? null,
        acueducto: form.acueducto ?? null,
        longitudM: form.longitudM ?? null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo guardar la tubería");
      return;
    }
    toast.success("Tubería actualizada");
    setEditing(false);
    setSelected({ ...selected, ...form } as Tuberia);
    setTuberias((prev) =>
      prev.map((t) =>
        t.codigo === selected.codigo ? ({ ...t, ...form } as Tuberia) : t,
      ),
    );
  }

  async function remove() {
    if (!selected) return;
    const ok = await dialog.confirm({
      title: "Eliminar tubería",
      message: `Eliminar tubería ${selected.codigo}? Esta acción no se puede deshacer.`,
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/tuberias/${selected.codigo}`, {
      method: "DELETE",
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Tubería eliminada");
    setTuberias((prev) => prev.filter((t) => t.codigo !== selected.codigo));
    setSelected(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
      <div className="bg-card border border-border rounded-lg overflow-hidden relative min-h-[400px]">
        <GisViewer
          layers={layers}
          selectedFeatureIds={selectedFeatureIds}
          onFeatureClick={handleFeatureClick}
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
                {filteredTuberias.length} / {totalInDb}
              </span>
            )}
          </div>
          <input
            type="search"
            placeholder="Buscar código, material, ramal..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Selector
              value={materialSel}
              placeholder="Material"
              items={meta.materiales}
              onChange={setMaterialSel}
            />
            <Selector
              value={diametroSel}
              placeholder="Diámetro"
              items={meta.diametros}
              onChange={setDiametroSel}
            />
          </div>
          <Selector
            value={layerSel}
            placeholder="Capa (layer_name)"
            items={meta.layers}
            onChange={setLayerSel}
          />
          <Selector
            value={municipioSel}
            placeholder="Municipio"
            items={meta.municipios}
            onChange={setMunicipioSel}
          />
        </div>

        <div className="border-t border-border pt-3 flex-1 min-h-0">
          {!selected && (
            <div className="text-sm text-muted-foreground text-center py-6">
              Haz click en una tubería del mapa para ver detalle y editarla.
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
                  style={{ backgroundColor: colorFor(selected.material) }}
                >
                  {selected.material ?? "—"}
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
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Material"
                  value={form.material ?? ""}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, material: v }));
                    setEditing(true);
                  }}
                />
                <Field
                  label="Diámetro"
                  value={form.diametro ?? ""}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, diametro: v }));
                    setEditing(true);
                  }}
                />
              </div>
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
              <Field
                label="Longitud (m)"
                mono
                value={(form.longitudM ?? 0).toString()}
                onChange={(v) => {
                  const n = parseFloat(v);
                  if (!isNaN(n)) {
                    setForm((f) => ({ ...f, longitudM: n }));
                    setEditing(true);
                  }
                }}
              />

              <p className="text-xs text-muted-foreground">
                La edición de la geometría (vértices) se hace desde
                rutas_builder. Aquí solo atributos.
              </p>

              <div className="border-t border-border pt-3">
                <PhotoGallery
                  targetType="tuberia"
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

function Selector({
  value,
  placeholder,
  items,
  onChange,
}: {
  value: string;
  placeholder: string;
  items: Meta[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-border rounded px-2 py-2 bg-background text-sm"
    >
      <option value="">{placeholder}</option>
      {items.map((i) => (
        <option key={i.nombre} value={i.nombre}>
          {i.nombre} ({i.total})
        </option>
      ))}
    </select>
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
