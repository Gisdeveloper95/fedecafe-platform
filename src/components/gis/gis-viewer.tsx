"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GisViewerHandlers,
  LayerSpec,
} from "./types";

type InitialView =
  | { mode: "fit"; padding?: number }
  | { mode: "fixed"; lat: number; lon: number; zoom: number };

type Props = {
  layers: LayerSpec[];
  editable?: boolean;
  selectedFeatureIds?: Record<string, Set<string>>;
  initialView?: InitialView;
  showLayerToggle?: boolean;
  showCoords?: boolean;
  /// Icono Material-Symbols (texto) opcional para pintar dentro de cada
  /// punto de una capa. Mapa de layerId → name (ej: "water_drop"). Si no
  /// está, el visor usa un círculo plano (más rápido).
  pointIconByLayer?: Record<string, string>;
} & GisViewerHandlers;

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

const DEFAULT_VIEW: InitialView = { mode: "fit", padding: 60 };

export function GisViewer(props: Props) {
  const {
    layers,
    editable = false,
    selectedFeatureIds,
    showLayerToggle = true,
    showCoords = false,
    pointIconByLayer,
    onFeatureClick,
    onMapClick,
    onPointMoved,
  } = props;
  const initialView: InitialView = props.initialView ?? DEFAULT_VIEW;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const dragMarkersRef = useRef<Array<import("maplibre-gl").Marker>>([]);
  const fittedRef = useRef(false);

  // Refs para que el efecto de pintado vea siempre los valores más recientes
  // sin tener que volver a montar el mapa. Esto evita el bug anterior donde
  // initialView (objeto literal en el padre) re-disparaba el efecto y apilaba
  // listeners zombie sobre map.once("load", ...).
  const layersRef = useRef(layers);
  const layerVisRef = useRef<Record<string, boolean>>({});
  const selectedRef = useRef(selectedFeatureIds);
  const editableRef = useRef(editable);
  const handlersRef = useRef({ onFeatureClick, onMapClick, onPointMoved });
  const pointIconRef = useRef(pointIconByLayer);

  layersRef.current = layers;
  selectedRef.current = selectedFeatureIds;
  editableRef.current = editable;
  handlersRef.current = { onFeatureClick, onMapClick, onPointMoved };
  pointIconRef.current = pointIconByLayer;

  const [layerVis, setLayerVis] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const l of layers) init[l.id] = l.visible ?? true;
    return init;
  });
  layerVisRef.current = layerVis;

  useEffect(() => {
    setLayerVis((prev) => {
      const next = { ...prev };
      for (const l of layers) {
        if (next[l.id] === undefined) next[l.id] = l.visible ?? true;
      }
      return next;
    });
  }, [layers]);

  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Estado UI para mostrar progreso al usuario (no afecta lógica del mapa)
  const [status, setStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // -------- Init del mapa (UNA sola vez) + pintar capas dentro de "load" --------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OSM_STYLE,
          center:
            initialView.mode === "fixed"
              ? [initialView.lon, initialView.lat]
              : [-75.7, 4.5],
          zoom: initialView.mode === "fixed" ? initialView.zoom : 7,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(new maplibregl.ScaleControl(), "bottom-left");

        map.on("error", (e) => {
          console.error("[GisViewer] map error:", e);
          if (!cancelled) {
            setStatus("error");
            setErrorMsg(
              e?.error?.message ?? "Error desconocido cargando el mapa",
            );
          }
        });

        const applyLayers = () => {
          if (cancelled) return;
          renderLayers(map, maplibregl);
        };

        map.on("load", () => {
          if (cancelled) return;
          setStatus("ready");
          applyLayers();
        });

        // Re-pintar capas cuando cambian props (sin reset del mapa)
        const interval = window.setInterval(() => {
          if (cancelled) {
            window.clearInterval(interval);
            return;
          }
          if (!map.isStyleLoaded()) return;
          if (map.__lastLayersHash === hashLayers(layersRef.current, layerVisRef.current, selectedRef.current))
            return;
          map.__lastLayersHash = hashLayers(layersRef.current, layerVisRef.current, selectedRef.current);
          renderLayers(map, maplibregl);
        }, 250);

        // Click vacío
        map.on("click", (e) => {
          const ourLayers = (map.getStyle().layers ?? [])
            .map((l) => l.id)
            .filter((id) => id.startsWith("gv-"));
          if (ourLayers.length === 0) {
            handlersRef.current.onMapClick?.({
              lat: e.lngLat.lat,
              lon: e.lngLat.lng,
            });
            return;
          }
          const feats = map.queryRenderedFeatures(e.point, {
            layers: ourLayers,
          });
          if (feats.length === 0) {
            handlersRef.current.onMapClick?.({
              lat: e.lngLat.lat,
              lon: e.lngLat.lng,
            });
          }
        });

        if (showCoords) {
          map.on("mousemove", (e) => {
            setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          });
          map.on("mouseout", () => setCursorCoords(null));
        }
      } catch (err) {
        console.error("[GisViewer] init failed:", err);
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      for (const m of dragMarkersRef.current) m.remove();
      dragMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Función pura que pinta las capas en el mapa. Lee de refs para evitar
  // closures stale.
  function renderLayers(
    map: import("maplibre-gl").Map,
    maplibregl: typeof import("maplibre-gl"),
  ) {
    const currentLayers = layersRef.current;
    const currentVis = layerVisRef.current;
    const currentSelected = selectedRef.current;
    const currentEditable = editableRef.current;
    const currentHandlers = handlersRef.current;
    const currentPointIcons = pointIconRef.current;

    // Limpieza
    const style = map.getStyle();
    const ourLayerIds = (style.layers ?? [])
      .map((l) => l.id)
      .filter((id) => id.startsWith("gv-"));
    for (const id of ourLayerIds) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    const ourSourceIds = Object.keys(style.sources ?? {}).filter((id) =>
      id.startsWith("gv-"),
    );
    for (const id of ourSourceIds) {
      if (map.getSource(id)) map.removeSource(id);
    }
    for (const m of dragMarkersRef.current) m.remove();
    dragMarkersRef.current = [];

    for (const layer of currentLayers) {
      if (currentVis[layer.id] === false) continue;

      if (layer.kind === "points") {
        const sourceId = `gv-${layer.id}-src`;
        const circlesId = `gv-${layer.id}-circles`;
        const selectedId = `gv-${layer.id}-selected`;
        const symbolsId = `gv-${layer.id}-symbols`;

        const selectedSet = currentSelected?.[layer.id];
        const editableSelected =
          currentEditable && selectedSet && selectedSet.size === 1
            ? Array.from(selectedSet)[0]
            : null;

        const fc: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: layer.features
            .filter((f) => f.id !== editableSelected)
            .map((f) => ({
              type: "Feature",
              properties: {
                id: f.id,
                label: f.label ?? "",
                selected: selectedSet?.has(f.id) ? 1 : 0,
              },
              geometry: { type: "Point", coordinates: [f.lon, f.lat] },
            })),
        };

        map.addSource(sourceId, { type: "geojson", data: fc });

        map.addLayer({
          id: circlesId,
          type: "circle",
          source: sourceId,
          filter: ["==", ["get", "selected"], 0],
          paint: {
            "circle-radius": 6,
            "circle-color": layer.color,
            "circle-opacity": 0.9,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: selectedId,
          type: "circle",
          source: sourceId,
          filter: ["==", ["get", "selected"], 1],
          paint: {
            "circle-radius": 9,
            "circle-color": layer.color,
            "circle-opacity": 1,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Icono opcional encima del punto (ej: gota de agua para medidores)
        const iconChar = currentPointIcons?.[layer.id];
        if (iconChar) {
          map.addLayer({
            id: symbolsId,
            type: "symbol",
            source: sourceId,
            layout: {
              "text-field": iconChar,
              "text-font": ["Open Sans Regular"],
              "text-size": 11,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#ffffff",
            },
          });
        }

        const handleClick = (
          e: import("maplibre-gl").MapMouseEvent & {
            features?: GeoJSON.Feature[];
          },
        ) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const id = String(feat.properties?.id ?? "");
          const found = layer.features.find((x) => x.id === id);
          if (found) {
            currentHandlers.onFeatureClick?.({
              layerId: layer.id,
              feature: found,
              kind: "point",
            });
          }
        };
        map.on("click", circlesId, handleClick);
        map.on("click", selectedId, handleClick);
        map.on("mouseenter", circlesId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", circlesId, () => {
          map.getCanvas().style.cursor = "";
        });

        if (editableSelected) {
          const feat = layer.features.find((f) => f.id === editableSelected);
          if (feat) {
            const el = document.createElement("div");
            el.style.cssText = `
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background: ${layer.color};
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              cursor: move;
            `;
            const marker = new maplibregl.Marker({
              element: el,
              draggable: true,
            })
              .setLngLat([feat.lon, feat.lat])
              .addTo(map);
            marker.on("dragend", () => {
              const lngLat = marker.getLngLat();
              currentHandlers.onPointMoved?.(layer.id, feat.id, {
                lat: lngLat.lat,
                lon: lngLat.lng,
              });
            });
            dragMarkersRef.current.push(marker);
          }
        }
      } else if (layer.kind === "lines") {
        const sourceId = `gv-${layer.id}-src`;
        const layerId = `gv-${layer.id}`;
        const fc: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: layer.features.map((f) => ({
            type: "Feature",
            properties: { id: f.id, label: f.label ?? "" },
            geometry: {
              type: "LineString",
              coordinates: f.vertices.map(([lat, lon]) => [lon, lat]),
            },
          })),
        };
        map.addSource(sourceId, { type: "geojson", data: fc });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": layer.color,
            "line-width": layer.width ?? 3,
            "line-opacity": 0.85,
          },
        });
        const handleClick = (
          e: import("maplibre-gl").MapMouseEvent & {
            features?: GeoJSON.Feature[];
          },
        ) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const id = String(feat.properties?.id ?? "");
          const found = layer.features.find((x) => x.id === id);
          if (found) {
            currentHandlers.onFeatureClick?.({
              layerId: layer.id,
              feature: found,
              kind: "line",
            });
          }
        };
        map.on("click", layerId, handleClick);
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    }

    // Auto-fit la primera vez que hay features
    if (initialView.mode === "fit" && !fittedRef.current) {
      const lngLats: [number, number][] = [];
      for (const layer of currentLayers) {
        if (currentVis[layer.id] === false) continue;
        if (layer.kind === "points") {
          for (const f of layer.features) lngLats.push([f.lon, f.lat]);
        } else {
          for (const f of layer.features) {
            for (const [lat, lon] of f.vertices) lngLats.push([lon, lat]);
          }
        }
      }
      if (lngLats.length > 0) {
        let west = lngLats[0][0],
          east = lngLats[0][0],
          south = lngLats[0][1],
          north = lngLats[0][1];
        for (const [lng, lat] of lngLats) {
          if (lng < west) west = lng;
          if (lng > east) east = lng;
          if (lat < south) south = lat;
          if (lat > north) north = lat;
        }
        if (lngLats.length === 1) {
          map.setCenter(lngLats[0]);
          map.setZoom(15);
        } else {
          map.fitBounds(
            [
              [west, south],
              [east, north],
            ],
            { padding: initialView.padding ?? 60, animate: false },
          );
        }
        fittedRef.current = true;
      }
    }
  }

  const totalsByLayer = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of layers) t[l.id] = l.features.length;
    return t;
  }, [layers]);

  // Altura mínima garantizada — antes el contenedor podía colapsar a 0px
  // si el padre no propagaba altura (bug que dejaba el visor invisible
  // aunque MapLibre cargara bien).
  return (
    <div
      className="relative w-full bg-muted rounded-md overflow-hidden"
      style={{ minHeight: "500px", height: "100%" }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {showLayerToggle && layers.length > 0 && (
        <div className="absolute top-2 left-2 bg-card/95 backdrop-blur rounded shadow border border-border p-2 text-xs space-y-1 z-10 max-h-[60%] overflow-auto">
          {layers.map((l) => (
            <label
              key={l.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={layerVis[l.id] !== false}
                onChange={(e) =>
                  setLayerVis((p) => ({ ...p, [l.id]: e.target.checked }))
                }
              />
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              <span className="flex-1">{l.label}</span>
              <span className="text-muted-foreground">
                {totalsByLayer[l.id] ?? 0}
              </span>
            </label>
          ))}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
          Cargando mapa…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-destructive z-20 bg-card/80 p-4 text-center">
          Error cargando el mapa.<br />
          <span className="font-mono">{errorMsg}</span>
        </div>
      )}

      {showCoords && cursorCoords && (
        <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur rounded px-2 py-1 text-xs font-mono shadow border border-border z-10">
          {cursorCoords.lat.toFixed(6)}, {cursorCoords.lon.toFixed(6)}
        </div>
      )}
    </div>
  );
}

function hashLayers(
  layers: LayerSpec[],
  vis: Record<string, boolean>,
  selected?: Record<string, Set<string>>,
): string {
  const parts: string[] = [];
  for (const l of layers) {
    parts.push(
      `${l.id}:${vis[l.id] !== false ? 1 : 0}:${l.features.length}`,
    );
    if (selected?.[l.id]) {
      parts.push(`s=${Array.from(selected[l.id]).slice(0, 5).join(",")}`);
    }
  }
  return parts.join("|");
}

// Decoración para que TS no se queje del campo custom que pegamos a la
// instancia del mapa para evitar re-renders innecesarios.
declare module "maplibre-gl" {
  interface Map {
    __lastLayersHash?: string;
  }
}
