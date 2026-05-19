"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";

type Operario = { id: string; username: string; fullName: string };
type Municipio = { nombre: string; total: number };
type Punto = {
  codigo: string;
  latitude: number;
  longitude: number;
  nombre: string | null;
  municipio: string | null;
};

type LeafletNS = typeof import("leaflet");

export function RoutePlanner({ operarios }: { operarios: Operario[] }) {
  const router = useRouter();

  // Form de la ruta
  const [nombre, setNombre] = useState("");
  const [operarioId, setOperarioId] = useState(operarios[0]?.id ?? "");
  const [tipo, setTipo] = useState<"medidores" | "estructuras">("medidores");
  const [notas, setNotas] = useState("");
  const [fechaObjetivo, setFechaObjetivo] = useState<string>("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Filtro
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioSel, setMunicipioSel] = useState<string>("");

  // Datos cargados
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ruta en construcción
  const [seleccion, setSeleccion] = useState<Punto[]>([]);

  // Submit
  const [submitting, setSubmitting] = useState(false);

  // Refs Leaflet
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersGroupRef = useRef<unknown>(null);
  const routeLineRef = useRef<unknown>(null);
  const LRef = useRef<LeafletNS | null>(null);

  const codigosSeleccionados = useMemo(
    () => new Set(seleccion.map((p) => p.codigo)),
    [seleccion],
  );

  // ----- Cargar municipios al montar -----
  useEffect(() => {
    fetch("/api/municipios")
      .then((r) => r.json())
      .then((d) => {
        setMunicipios(d.municipios ?? []);
        if (d.municipios?.[0]) setMunicipioSel(d.municipios[0].nombre);
      })
      .catch((e) => setErrorMsg("No se pudieron cargar municipios: " + e));
  }, []);

  // ----- Inicializar mapa -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      if (!mapDivRef.current || mapRef.current) return;

      // Fix iconos por path en webpack
      // @ts-expect-error iconUrl path interno
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapDivRef.current).setView([4.5361, -75.8098], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      mapRef.current = map;
      markersGroupRef.current = L.layerGroup().addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Cargar puntos cuando cambia municipio o tipo -----
  useEffect(() => {
    if (!municipioSel) return;
    setLoadingPoints(true);
    setErrorMsg(null);
    const endpoint = tipo === "medidores" ? "/api/medidores" : "/api/estructuras";
    fetch(`${endpoint}?municipio=${encodeURIComponent(municipioSel)}&limit=2000`)
      .then((r) => r.json())
      .then((d) => {
        const list = (tipo === "medidores" ? d.medidores : d.estructuras) ?? [];
        const items: Punto[] = list.map(
          (i: Record<string, unknown>) => ({
            codigo:
              tipo === "medidores"
                ? String(i.contrato)
                : String(i.codigo),
            latitude: Number(i.latitude),
            longitude: Number(i.longitude),
            nombre: (i.nombre as string | null) ?? null,
            municipio: (i.municipio as string | null) ?? null,
          }),
        );
        setPuntos(items);
        setLoadingPoints(false);
      })
      .catch((e) => {
        setErrorMsg("Error cargando puntos: " + e);
        setLoadingPoints(false);
      });
  }, [municipioSel, tipo]);

  // ----- Renderizar marcadores cada vez que cambian puntos o selección -----
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current as ReturnType<LeafletNS["map"]> | null;
    const group = markersGroupRef.current as ReturnType<
      LeafletNS["layerGroup"]
    > | null;
    if (!L || !map || !group) return;

    group.clearLayers();

    if (puntos.length === 0) return;

    // Centrar mapa en bbox de puntos
    const lats = puntos.map((p) => p.latitude);
    const lons = puntos.map((p) => p.longitude);
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    );
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });

    for (const p of puntos) {
      const selected = codigosSeleccionados.has(p.codigo);
      const seleccionOrden = seleccion.findIndex((s) => s.codigo === p.codigo);
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: selected ? 9 : 6,
        weight: selected ? 3 : 1,
        color: selected ? "#0f4d3a" : "#666",
        fillColor: selected ? "#16a34a" : "#cbd5e1",
        fillOpacity: 0.85,
      });
      const tooltip = selected
        ? `#${seleccionOrden + 1} · ${p.codigo}${p.nombre ? " · " + p.nombre : ""}`
        : `${p.codigo}${p.nombre ? " · " + p.nombre : ""}`;
      marker.bindTooltip(tooltip);
      marker.on("click", () => togglePunto(p));
      group.addLayer(marker);
    }

    // Dibujar línea de la ruta actual
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current as never);
      routeLineRef.current = null;
    }
    if (seleccion.length >= 2) {
      const latlngs = seleccion.map(
        (p) => [p.latitude, p.longitude] as [number, number],
      );
      routeLineRef.current = L.polyline(latlngs, {
        color: "#0f4d3a",
        weight: 3,
        opacity: 0.7,
        dashArray: "6,8",
      }).addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, seleccion]);

  function togglePunto(p: Punto) {
    setSeleccion((prev) => {
      const idx = prev.findIndex((x) => x.codigo === p.codigo);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, p];
    });
  }

  function removeFromSeleccion(codigo: string) {
    setSeleccion((prev) => prev.filter((p) => p.codigo !== codigo));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setSeleccion((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx: number) {
    setSeleccion((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  function clearAll() {
    if (seleccion.length > 0 && !confirm("¿Vaciar la selección?")) return;
    setSeleccion([]);
  }

  function onDragStart(idx: number) {
    setDragIdx(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setSeleccion((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  }

  function onDragEnd() {
    setDragIdx(null);
  }

  /** TSP heurístico: vecino más cercano desde el primer punto seleccionado. */
  function optimizar() {
    if (seleccion.length < 3) return;
    const inicio = seleccion[0];
    const restantes = seleccion.slice(1);
    const orden: Punto[] = [inicio];
    let actual = inicio;
    while (restantes.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < restantes.length; i++) {
        const d = haversine(actual, restantes[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = restantes.splice(bestIdx, 1)[0];
      orden.push(next);
      actual = next;
    }
    setSeleccion(orden);
  }

  const distanciaTotalKm = useMemo(() => {
    let total = 0;
    for (let i = 1; i < seleccion.length; i++) {
      total += haversine(seleccion[i - 1], seleccion[i]);
    }
    return total / 1000;
  }, [seleccion]);

  async function crearRuta() {
    if (!nombre.trim()) {
      setErrorMsg("Falta el nombre de la ruta");
      return;
    }
    if (!operarioId) {
      setErrorMsg("Falta operario asignado");
      return;
    }
    if (seleccion.length === 0) {
      setErrorMsg("Selecciona al menos un punto");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/rutas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre,
          tipo,
          operarioId,
          codigos: seleccion.map((s) => s.codigo),
          fechaObjetivo: fechaObjetivo || undefined,
          notas: notas || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? "Error al crear ruta");
        setSubmitting(false);
        return;
      }
      router.push(`/rutas/${data.ruta.id}`);
      router.refresh();
    } catch (e) {
      setErrorMsg("Error de red: " + e);
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 h-[calc(100vh-200px)] min-h-[600px]">
      {/* MAPA */}
      <div className="bg-card border border-border rounded-lg overflow-hidden relative">
        <div ref={mapDivRef} className="w-full h-full" />
        {loadingPoints && (
          <div className="absolute top-3 left-3 bg-card border border-border rounded px-3 py-1.5 text-xs shadow">
            Cargando puntos...
          </div>
        )}
        <div className="absolute top-3 right-3 bg-card border border-border rounded p-2 shadow flex gap-2 items-center text-xs">
          <span>{puntos.length} en mapa</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-brand">
            {seleccion.length} seleccionados
          </span>
          {seleccion.length >= 2 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>{distanciaTotalKm.toFixed(2)} km</span>
            </>
          )}
        </div>
      </div>

      {/* PANEL DERECHO */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 overflow-auto">
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Datos de la ruta</h2>
          <input
            type="text"
            placeholder="Nombre (ej: La Tebaida — 25 mayo)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as typeof tipo);
                setSeleccion([]);
              }}
              className="border border-border rounded px-2 py-2 bg-background text-sm"
            >
              <option value="medidores">Medidores</option>
              <option value="estructuras">Estructuras</option>
            </select>
            <select
              value={operarioId}
              onChange={(e) => setOperarioId(e.target.value)}
              className="border border-border rounded px-2 py-2 bg-background text-sm"
            >
              {operarios.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </div>
          <select
            value={municipioSel}
            onChange={(e) => setMunicipioSel(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          >
            {municipios.map((m) => (
              <option key={m.nombre} value={m.nombre}>
                {m.nombre} ({m.total})
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              Fecha objetivo (opcional)
            </span>
            <input
              type="date"
              value={fechaObjetivo}
              onChange={(e) => setFechaObjetivo(e.target.value)}
              className="border border-border rounded px-3 py-2 bg-background text-sm"
            />
          </label>
          <textarea
            placeholder="Notas (opcional)"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
          />
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">
              Orden de visita ({seleccion.length})
            </h2>
            <div className="flex gap-1">
              <button
                onClick={optimizar}
                disabled={seleccion.length < 3}
                title="Calcular orden óptimo (vecino más cercano)"
                className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
              >
                Optimizar
              </button>
              <button
                onClick={clearAll}
                disabled={seleccion.length === 0}
                className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
              >
                Vaciar
              </button>
            </div>
          </div>

          {seleccion.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Haz click en los puntos del mapa para agregarlos a la ruta.
            </p>
          )}

          <ul className="flex flex-col gap-1">
            {seleccion.map((p, i) => (
              <li
                key={p.codigo}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 cursor-grab active:cursor-grabbing ${
                  dragIdx === i ? "opacity-50" : ""
                }`}
                title="Arrastra para reordenar"
              >
                <span className="text-muted-foreground select-none">⋮⋮</span>
                <span className="font-bold text-brand min-w-[1.5rem]">
                  #{i + 1}
                </span>
                <span className="font-mono flex-1 truncate">{p.codigo}</span>
                {p.nombre && (
                  <span className="text-muted-foreground truncate hidden md:inline">
                    {p.nombre}
                  </span>
                )}
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title="Subir"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === seleccion.length - 1}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeFromSeleccion(p.codigo)}
                  className="p-1 hover:bg-red-100 text-destructive rounded"
                  title="Quitar"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        {errorMsg && (
          <div className="text-xs text-destructive bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {errorMsg}
          </div>
        )}

        <button
          onClick={crearRuta}
          disabled={submitting || seleccion.length === 0}
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 mt-auto"
        >
          {submitting
            ? "Creando..."
            : `Crear ruta (${seleccion.length} puntos)`}
        </button>
      </div>
    </div>
  );
}

// Haversine en metros (planeta esférico de 6371 km)
function haversine(a: Punto, b: Punto): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
