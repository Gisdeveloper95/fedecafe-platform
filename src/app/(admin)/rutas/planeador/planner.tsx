"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";

import { useDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Operario = { id: string; username: string; fullName: string };
type Municipio = { nombre: string; total: number };

type EntityPunto = {
  kind: "entity";
  codigo: string;
  lat: number;
  lon: number;
  nombre: string | null;
};

type Waypoint = {
  kind: "waypoint";
  codigo: string;
  lat: number;
  lon: number;
  label: string;
};

type StartPoint = {
  lat: number;
  lon: number;
  label: string;
  favoriteId?: string;
};

type StopItem = EntityPunto | Waypoint;

type StartFavorite = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  createdAt: number;
};

type LeafletNS = typeof import("leaflet");

const FAVORITES_KEY = "fedecafe.startFavorites.v1";

function loadFavorites(): StartFavorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as StartFavorite[];
  } catch {
    return [];
  }
}

function saveFavorites(favs: StartFavorite[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

type Mode = "select" | "addStart" | "addWaypoint";

export function RoutePlanner({ operarios }: { operarios: Operario[] }) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();

  const [nombre, setNombre] = useState("");
  const [operarioIds, setOperarioIds] = useState<string[]>(
    operarios[0] ? [operarios[0].id] : [],
  );
  const [tipo, setTipo] = useState<"medidores" | "estructuras">("medidores");
  const [notas, setNotas] = useState("");
  const [fechaObjetivo, setFechaObjetivo] = useState<string>("");

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioSel, setMunicipioSel] = useState<string>("");

  const [mode, setMode] = useState<Mode>("select");

  const [puntos, setPuntos] = useState<EntityPunto[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);

  // Búsqueda de entidades por código/nombre. Es el flujo principal: el usuario
  // teclea el código y los resultados aparecen abajo con un botón para agregar.
  const [search, setSearch] = useState("");

  // Total de medidores/estructuras en la BD (no los cargados en mapa). Sirve
  // para mostrar al usuario "hay 8614 medidores disponibles" aunque no
  // estén pintados todos.
  const [totalInDb, setTotalInDb] = useState<number | null>(null);

  const [startPoint, setStartPoint] = useState<StartPoint | null>(null);
  const [stops, setStops] = useState<StopItem[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const [favorites, setFavorites] = useState<StartFavorite[]>([]);
  useEffect(() => setFavorites(loadFavorites()), []);

  const [submitting, setSubmitting] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersGroupRef = useRef<unknown>(null);
  const startMarkerRef = useRef<unknown>(null);
  const routeLineRef = useRef<unknown>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const modeRef = useRef<Mode>("select");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const stopCodes = useMemo(() => new Set(stops.map((s) => s.codigo)), [stops]);

  useEffect(() => {
    fetch("/api/municipios", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMunicipios(d.municipios ?? []))
      .catch(() => {});
  }, []);

  // Toggle visibilidad de la capa de referencia (puntos del municipio en el
  // mapa, NO los stops ya seleccionados). Útil para limpiar el mapa cuando hay
  // miles de puntos y solo quieres ver lo que ya armaste.
  const [showRefLayer, setShowRefLayer] = useState(true);

  // Una sola llamada al cambiar `tipo` para conocer cuántos hay en total en la
  // BD. Necesario para mostrar al usuario "X medidores disponibles" sin tener
  // que cargarlos todos en el mapa.
  useEffect(() => {
    const endpoint =
      tipo === "medidores" ? "/api/medidores" : "/api/estructuras";
    fetch(`${endpoint}?limit=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.totalInDb === "number") setTotalInDb(d.totalInDb);
      })
      .catch(() => {});
  }, [tipo]);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      if (!mapDivRef.current || mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
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

      map.on("click", (e) => {
        const m = modeRef.current;
        if (m === "addStart") {
          setStartPoint({
            lat: e.latlng.lat,
            lon: e.latlng.lng,
            label: "Punto de partida",
          });
          setMode("select");
        } else if (m === "addWaypoint") {
          const id = crypto.randomUUID();
          setStops((prev) => [
            ...prev,
            {
              kind: "waypoint",
              codigo: id,
              lat: e.latlng.lat,
              lon: e.latlng.lng,
              label: `Parada ${
                prev.filter((p) => p.kind === "waypoint").length + 1
              }`,
            },
          ]);
          setMode("select");
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cargar puntos. Reglas:
  //  - Si hay texto en `search` (>=2 chars): consulta server con q= y SIN
  //    filtro de municipio. Esto deja al buscador encontrar códigos de
  //    cualquier municipio (la queja del operario fue exactamente esa).
  //  - Si no hay búsqueda pero sí municipio: carga puntos de ese municipio
  //    para tenerlos como referencia en el mapa.
  //  - Si no hay ni búsqueda ni municipio: no carga (sería demasiado).
  useEffect(() => {
    const q = search.trim();
    const useSearch = q.length >= 2;
    if (!useSearch && !municipioSel) {
      setPuntos([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoadingPoints(true);
      const endpoint =
        tipo === "medidores" ? "/api/medidores" : "/api/estructuras";
      const params = new URLSearchParams();
      if (useSearch) {
        params.set("q", q);
        params.set("limit", "200");
      } else {
        params.set("municipio", municipioSel);
        params.set("limit", "2000");
      }
      fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const list = (tipo === "medidores" ? d.medidores : d.estructuras) ?? [];
          const items: EntityPunto[] = list.map(
            (i: Record<string, unknown>) => ({
              kind: "entity" as const,
              codigo:
                tipo === "medidores" ? String(i.contrato) : String(i.codigo),
              lat: Number(i.latitude),
              lon: Number(i.longitude),
              nombre: (i.nombre as string | null) ?? null,
            }),
          );
          setPuntos(items);
          if (typeof d.totalInDb === "number") setTotalInDb(d.totalInDb);
          setLoadingPoints(false);
        })
        .catch(() => setLoadingPoints(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [municipioSel, tipo, search]);

  const fittedRef = useRef(false);
  useEffect(() => {
    fittedRef.current = false;
  }, [municipioSel]);

  // Render
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current as import("leaflet").Map | null;
    const group = markersGroupRef.current as
      | import("leaflet").LayerGroup
      | null;
    if (!L || !map || !group) return;
    group.clearLayers();

    // Render puntos de referencia + los ya seleccionados (stops kind=entity).
    // Si showRefLayer=false, solo mostramos los que ya están en stops.
    const renderable = showRefLayer
      ? puntos
      : puntos.filter((p) => stopCodes.has(p.codigo));
    for (const p of renderable) {
      const isSelected = stopCodes.has(p.codigo);
      const ordenInStops = stops.findIndex((s) => s.codigo === p.codigo);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: isSelected ? 9 : 6,
        weight: isSelected ? 3 : 1,
        color: isSelected ? "#0f4d3a" : "#666",
        fillColor: isSelected ? "#16a34a" : "#cbd5e1",
        fillOpacity: 0.85,
      });
      marker.bindTooltip(
        isSelected
          ? `#${ordenInStops + 1} · ${p.codigo}${p.nombre ? " · " + p.nombre : ""}`
          : `${p.codigo}${p.nombre ? " · " + p.nombre : ""}`,
      );
      marker.on("click", (e) => {
        if (modeRef.current !== "select") return;
        L.DomEvent.stopPropagation(e);
        toggleStop(p);
      });
      group.addLayer(marker);
    }

    for (const w of stops.filter((s): s is Waypoint => s.kind === "waypoint")) {
      const idx = stops.findIndex((s) => s.codigo === w.codigo);
      const icon = L.divIcon({
        className: "wp-marker",
        html: `<div style="
          background:#f59e0b;color:#fff;border:2px solid white;
          border-radius:4px;padding:2px 4px;font-size:11px;font-weight:bold;
          box-shadow:0 1px 3px rgba(0,0,0,0.35);
          white-space:nowrap;
        ">#${idx + 1} ${w.label}</div>`,
        iconAnchor: [0, 8],
      });
      const marker = L.marker([w.lat, w.lon], { icon });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (modeRef.current === "select") removeStop(w.codigo);
      });
      group.addLayer(marker);
    }

    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current as never);
      startMarkerRef.current = null;
    }
    if (startPoint) {
      const icon = L.divIcon({
        className: "start-marker",
        html: `<div style="
          background:#dc2626;color:#fff;border:2px solid white;
          width:24px;height:24px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:bold;
          box-shadow:0 2px 4px rgba(0,0,0,0.4);
        ">★</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([startPoint.lat, startPoint.lon], { icon })
        .bindTooltip(`Partida: ${startPoint.label}`)
        .addTo(map);
      startMarkerRef.current = marker;
    }

    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current as never);
      routeLineRef.current = null;
    }
    const polyPoints: [number, number][] = [];
    if (startPoint) polyPoints.push([startPoint.lat, startPoint.lon]);
    for (const s of stops) polyPoints.push([s.lat, s.lon]);
    if (polyPoints.length >= 2) {
      routeLineRef.current = L.polyline(polyPoints, {
        color: "#0f4d3a",
        weight: 3,
        opacity: 0.7,
        dashArray: "6,8",
      }).addTo(map);
    }

    if (puntos.length > 0 && !fittedRef.current) {
      const lats = puntos.map((p) => p.lat);
      const lons = puntos.map((p) => p.lon);
      const bounds = L.latLngBounds(
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      );
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
      fittedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, stops, stopCodes, startPoint, showRefLayer]);

  function toggleStop(p: EntityPunto) {
    setStops((prev) => {
      const idx = prev.findIndex((s) => s.codigo === p.codigo);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, p];
    });
  }

  function removeStop(codigo: string) {
    setStops((prev) => prev.filter((s) => s.codigo !== codigo));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setStops((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveDown(idx: number) {
    setStops((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function clearAll() {
    if (stops.length === 0 && !startPoint) return;
    const ok = await dialog.confirm({
      title: "Vaciar planeación",
      message:
        "Se quitarán todos los puntos seleccionados y el punto de partida.",
      danger: true,
      confirmLabel: "Vaciar",
    });
    if (!ok) return;
    setStops([]);
    setStartPoint(null);
  }

  function optimizar() {
    if (!startPoint) {
      toast.warning("Primero define el punto de partida.");
      setMode("addStart");
      return;
    }
    if (stops.length < 2) return;
    const restantes = [...stops];
    const orden: StopItem[] = [];
    let actual: { lat: number; lon: number } = startPoint;
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
    setStops(orden);
    toast.success("Orden óptimo calculado desde el punto de partida");
  }

  const distanciaTotalKm = useMemo(() => {
    let total = 0;
    let actual: { lat: number; lon: number } | null = startPoint;
    for (const s of stops) {
      if (actual) total += haversine(actual, s);
      actual = s;
    }
    return total / 1000;
  }, [startPoint, stops]);

  async function guardarFavoritoActual() {
    if (!startPoint) return;
    const label = await dialog.prompt({
      title: "Guardar como favorito",
      message:
        "Asigna un nombre al punto de partida (ej: 'Bodega Armenia', 'Casa').",
      label: "Nombre",
      defaultValue:
        startPoint.label === "Punto de partida" ? "" : startPoint.label,
      required: true,
    });
    if (!label) return;
    const fav: StartFavorite = {
      id: crypto.randomUUID(),
      label,
      lat: startPoint.lat,
      lon: startPoint.lon,
      createdAt: Date.now(),
    };
    const next = [...favorites, fav];
    setFavorites(next);
    saveFavorites(next);
    setStartPoint({ ...startPoint, label, favoriteId: fav.id });
    toast.success("Favorito guardado");
  }

  function usarFavorito(f: StartFavorite) {
    setStartPoint({
      lat: f.lat,
      lon: f.lon,
      label: f.label,
      favoriteId: f.id,
    });
    setMode("select");
    toast.success(`Punto de partida: ${f.label}`);
  }

  async function borrarFavorito(f: StartFavorite) {
    const ok = await dialog.confirm({
      title: "Borrar favorito",
      message: `Eliminar "${f.label}" de tus favoritos?`,
      danger: true,
    });
    if (!ok) return;
    const next = favorites.filter((x) => x.id !== f.id);
    setFavorites(next);
    saveFavorites(next);
  }

  async function crearRuta() {
    if (!nombre.trim()) {
      toast.error("Falta el nombre de la ruta");
      return;
    }
    if (!startPoint) {
      toast.error("Define el punto de partida antes de guardar la ruta");
      setMode("addStart");
      return;
    }
    if (stops.length === 0) {
      toast.error("Agrega al menos un punto a visitar");
      return;
    }
    setSubmitting(true);
    try {
      if (operarioIds.length === 0) {
        toast.error("Asigna al menos un operario");
        setSubmitting(false);
        return;
      }
      const payload = {
        nombre,
        tipo,
        operarioIds,
        items: stops.map((s) =>
          s.kind === "entity"
            ? { kind: "entity" as const, codigo: s.codigo }
            : {
                kind: "waypoint" as const,
                codigo: s.codigo,
                lat: s.lat,
                lon: s.lon,
                label: s.label,
              },
        ),
        startPoint: {
          lat: startPoint.lat,
          lon: startPoint.lon,
          label: startPoint.label,
          favoriteId: startPoint.favoriteId,
        },
        fechaObjetivo: fechaObjetivo || undefined,
        notas: notas || undefined,
      };
      const res = await fetch("/api/rutas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al crear ruta");
        setSubmitting(false);
        return;
      }
      toast.success("Ruta creada");
      router.push(`/rutas/${data.ruta.id}`);
      router.refresh();
    } catch (e) {
      toast.error("Error de red: " + e);
      setSubmitting(false);
    }
  }

  const totalEntities = stops.filter((s) => s.kind === "entity").length;
  const totalWaypoints = stops.filter((s) => s.kind === "waypoint").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-4 h-[calc(100vh-200px)] min-h-[600px]">
      <div className="bg-card border border-border rounded-lg overflow-hidden relative">
        <div ref={mapDivRef} className="w-full h-full" />

        {mode !== "select" && (
          <div
            className="absolute inset-0 cursor-crosshair pointer-events-none"
            style={{
              outline:
                mode === "addStart" ? "2px dashed #dc2626" : "2px dashed #f59e0b",
              outlineOffset: -2,
            }}
          />
        )}

        {loadingPoints && (
          <div className="absolute top-3 left-3 bg-card border border-border rounded px-3 py-1.5 text-xs shadow z-10">
            Cargando puntos...
          </div>
        )}

        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur border border-border rounded-full p-1 flex gap-1 shadow z-10">
          <ModeBtn
            label={startPoint ? "Cambiar partida" : "★ Definir punto de partida"}
            active={mode === "addStart"}
            color="#dc2626"
            onClick={() =>
              setMode(mode === "addStart" ? "select" : "addStart")
            }
          />
          <ModeBtn
            label="+ Parada intermedia"
            active={mode === "addWaypoint"}
            color="#f59e0b"
            onClick={() =>
              setMode(mode === "addWaypoint" ? "select" : "addWaypoint")
            }
          />
        </div>

        <div className="absolute bottom-3 right-3 bg-card/95 backdrop-blur border border-border rounded p-2 shadow flex gap-2 items-center text-xs z-10">
          <span>{puntos.length} en mapa</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-brand">
            {totalEntities} {tipo}
          </span>
          {totalWaypoints > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-amber-600">
                {totalWaypoints} paradas
              </span>
            </>
          )}
          {stops.length >= 1 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>{distanciaTotalKm.toFixed(2)} km</span>
            </>
          )}
        </div>
      </div>

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
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setStops((prev) => prev.filter((s) => s.kind === "waypoint"));
            }}
            className="border border-border rounded px-2 py-2 bg-background text-sm"
          >
            <option value="medidores">Medidores</option>
            <option value="estructuras">Estructuras</option>
          </select>
          {/* Multi-asignación: chips de operarios + selector para agregar */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              Asignar a {operarioIds.length > 1 && `(${operarioIds.length} operarios — cuadrilla)`}
            </label>
            <div className="flex flex-wrap gap-1 min-h-[28px]">
              {operarioIds.map((oid) => {
                const op = operarios.find((o) => o.id === oid);
                if (!op) return null;
                return (
                  <span
                    key={oid}
                    className="inline-flex items-center gap-1 bg-brand-soft text-brand text-xs rounded-full px-2 py-0.5 border border-brand/20"
                  >
                    {op.fullName}
                    <button
                      onClick={() =>
                        setOperarioIds((prev) => prev.filter((id) => id !== oid))
                      }
                      className="hover:bg-red-100 rounded-full px-1"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !operarioIds.includes(v)) {
                  setOperarioIds((prev) => [...prev, v]);
                }
                e.target.value = "";
              }}
              className="border border-border rounded px-2 py-2 bg-background text-sm"
            >
              <option value="">+ Agregar operario...</option>
              {operarios
                .filter((o) => !operarioIds.includes(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Municipio (opcional — para precargar puntos como referencia)
            </label>
            <select
              value={municipioSel}
              onChange={(e) => setMunicipioSel(e.target.value)}
              className="border border-border rounded px-3 py-2 bg-background text-sm"
            >
              <option value="">Todos / ninguno — busca por código abajo</option>
              {municipios.map((m) => (
                <option key={m.nombre} value={m.nombre}>
                  {m.nombre} ({m.total})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Una ruta puede mezclar puntos de varios municipios — el buscador
              encuentra códigos en toda la base, no se limita a este filtro.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRefLayer}
              onChange={(e) => setShowRefLayer(e.target.checked)}
            />
            <span>
              Mostrar capa de referencia (
              {puntos.length} cargados
              {totalInDb !== null && (
                <span className="text-muted-foreground">
                  {" "}· {totalInDb.toLocaleString("es-CO")} total {tipo}
                </span>
              )}
              ) en el mapa
            </span>
          </label>
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

        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">★ Punto de partida</h3>
            {startPoint && (
              <button
                onClick={guardarFavoritoActual}
                className="text-xs text-brand underline"
              >
                Guardar como favorito
              </button>
            )}
          </div>

          {startPoint ? (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-900">
                  {startPoint.label}
                </span>
                <button
                  onClick={() => setStartPoint(null)}
                  className="text-red-700 hover:underline"
                >
                  Quitar
                </button>
              </div>
              <div className="text-red-700 mt-1 font-mono">
                {startPoint.lat.toFixed(5)}, {startPoint.lon.toFixed(5)}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMode("addStart")}
              className="border border-dashed border-red-300 text-red-700 rounded px-3 py-2 text-xs hover:bg-red-50"
            >
              Toca aquí, luego click en el mapa para definirlo
            </button>
          )}

          {favorites.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Tus favoritos
              </div>
              <div className="flex flex-wrap gap-1">
                {favorites.map((f) => (
                  <div
                    key={f.id}
                    className="group flex items-center gap-1 bg-muted rounded px-2 py-1 text-xs"
                  >
                    <button
                      onClick={() => usarFavorito(f)}
                      className="hover:underline"
                    >
                      ★ {f.label}
                    </button>
                    <button
                      onClick={() => borrarFavorito(f)}
                      className="opacity-0 group-hover:opacity-100 text-destructive"
                      title="Eliminar favorito"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <h3 className="font-semibold text-sm">
            🔍 Agregar {tipo === "medidores" ? "medidores" : "estructuras"} por código
          </h3>
          <input
            type="search"
            placeholder={`Ej: ${tipo === "medidores" ? "CTR-3015" : "TQ-001"} o nombre del usuario`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-border rounded px-3 py-2 bg-background text-sm"
            autoFocus={stops.length === 0}
          />
          {search.trim().length > 0 && (
            <div className="border border-border rounded bg-background max-h-44 overflow-auto text-xs">
              {(() => {
                const q = search.trim().toLowerCase();
                const results = puntos
                  .filter((p) => {
                    if (stopCodes.has(p.codigo)) return false;
                    return (
                      p.codigo.toLowerCase().includes(q) ||
                      (p.nombre ?? "").toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 50);
                if (results.length === 0) {
                  return (
                    <div className="px-3 py-2 text-muted-foreground">
                      Sin resultados.
                    </div>
                  );
                }
                return results.map((p) => (
                  <button
                    key={p.codigo}
                    onClick={() => {
                      toggleStop(p);
                      // El user típicamente sigue buscando; no limpio search.
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between border-b border-border last:border-b-0"
                  >
                    <span className="font-mono">{p.codigo}</span>
                    <span className="text-muted-foreground truncate ml-2">
                      {p.nombre ?? ""}
                    </span>
                    <span className="ml-2 text-brand font-bold">＋</span>
                  </button>
                ));
              })()}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Tip: también puedes hacer click directo en los puntos del mapa, o
            usar &quot;+ Parada intermedia&quot; arriba para un sitio que no está
            en la base.
          </p>
        </div>

        <div className="border-t border-border pt-3 flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">
              Orden de visita ({stops.length})
            </h3>
            <div className="flex gap-1">
              <button
                onClick={optimizar}
                disabled={!startPoint || stops.length < 2}
                title="Vecino más cercano desde el punto de partida"
                className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
              >
                Optimizar
              </button>
              <button
                onClick={clearAll}
                disabled={stops.length === 0 && !startPoint}
                className="text-xs border border-border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
              >
                Vaciar
              </button>
            </div>
          </div>

          {stops.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Haz click en puntos del mapa para añadirlos. Para una parada que
              no está mapeada, usa "+ Parada intermedia".
            </p>
          )}

          <ul className="flex flex-col gap-1">
            {stops.map((s, i) => (
              <li
                key={s.codigo}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIdx === null || dragIdx === i) return;
                  setStops((prev) => {
                    const next = [...prev];
                    const [moved] = next.splice(dragIdx, 1);
                    next.splice(i, 0, moved);
                    return next;
                  });
                  setDragIdx(i);
                }}
                onDragEnd={() => setDragIdx(null)}
                className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 cursor-grab active:cursor-grabbing ${
                  s.kind === "waypoint"
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-muted/50"
                } ${dragIdx === i ? "opacity-50" : ""}`}
              >
                <span className="text-muted-foreground select-none">⋮⋮</span>
                <span className="font-bold text-brand min-w-[1.5rem]">
                  #{i + 1}
                </span>
                {s.kind === "waypoint" ? (
                  <span className="flex-1 text-amber-800 font-medium truncate">
                    📍 {s.label}
                  </span>
                ) : (
                  <span className="font-mono flex-1 truncate">{s.codigo}</span>
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
                  disabled={i === stops.length - 1}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeStop(s.codigo)}
                  className="p-1 hover:bg-red-100 text-destructive rounded"
                  title="Quitar"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={crearRuta}
          disabled={submitting || stops.length === 0}
          className="bg-brand text-brand-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 mt-auto"
        >
          {submitting ? "Creando..." : `Crear ruta (${stops.length} puntos)`}
        </button>
      </div>
    </div>
  );
}

function ModeBtn({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "text-white" : "bg-transparent text-foreground hover:bg-muted"
      }`}
      style={{ backgroundColor: active ? color : undefined }}
    >
      {label}
    </button>
  );
}

function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
