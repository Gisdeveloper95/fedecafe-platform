"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  FeatureLine,
  FeaturePoint,
  GisViewerHandlers,
  LayerSpec,
  SelectedFeature,
} from "./types";

type MapLibreNS = typeof import("maplibre-gl");

type Props = {
  layers: LayerSpec[];
  /// Si true, los markers de capas tipo "points" son draggables (los nuevos
  /// vértices reportan onPointMoved). Default: false.
  editable?: boolean;
  /// Si está definido, el visor muestra los IDs como "seleccionados" (marker
  /// resaltado). Estructura: { [layerId]: Set<featureId> }
  selectedFeatureIds?: Record<string, Set<string>>;
  /// Cómo encajar la vista inicial. "fit" centra y zooma a los features.
  /// "fixed" usa el centro/zoom dados. Si no hay features, va a Colombia.
  initialView?:
    | { mode: "fit"; padding?: number }
    | { mode: "fixed"; lat: number; lon: number; zoom: number };
  /// Toggle visibilidad de capas. Si no se pasa, se renderiza una barra interna
  /// con switches por capa.
  showLayerToggle?: boolean;
  /// Mostrar coordenadas del cursor abajo a la derecha (útil para edición)
  showCoords?: boolean;
} & GisViewerHandlers;

// MapLibre demo tile estilo OSM. Sin API key, gratis.
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

export function GisViewer({
  layers,
  editable = false,
  selectedFeatureIds,
  initialView = { mode: "fit", padding: 60 },
  showLayerToggle = true,
  showCoords = false,
  onFeatureClick,
  onMapClick,
  onPointMoved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null); // maplibregl.Map
  const mlRef = useRef<MapLibreNS | null>(null);
  const draggingMarkerRef = useRef<{
    layerId: string;
    featureId: string;
  } | null>(null);

  // Estados de visibilidad por capa (controlado internamente)
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const l of layers) init[l.id] = l.visible ?? true;
    return init;
  });

  // Resincronizar cuando llegan nuevas capas (ej: al cambiar entidad)
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

  // -------- Inicialización del mapa (una sola vez) --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      mlRef.current = (await import("maplibre-gl")) as unknown as MapLibreNS;

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

      map.on("click", (e) => {
        // Si el click cae sobre una capa, el handler de la capa ya lo manejó
        // (los layers tienen prioridad por orden); aquí solo se llama si el
        // click no cae sobre nada interactivo.
        const target = e.originalEvent.target as HTMLElement | null;
        if (target?.dataset?.featureClick === "true") return;
        onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      });

      if (showCoords) {
        map.on("mousemove", (e) => {
          setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        });
        map.on("mouseout", () => setCursorCoords(null));
      }
    })();
    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      m?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Pintar capas cada vez que cambian --------
  useEffect(() => {
    const map = mapRef.current as
      | (import("maplibre-gl").Map & {
          isStyleLoaded: () => boolean;
        })
      | null;
    if (!map) return;

    const apply = async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      // Remover capas anteriores nuestras
      const style = map.getStyle();
      const ourLayerIds = style.layers
        ?.map((l) => l.id)
        .filter((id) => id.startsWith("gv-")) ?? [];
      for (const id of ourLayerIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      const ourSourceIds = Object.keys(style.sources ?? {}).filter((id) =>
        id.startsWith("gv-"),
      );
      for (const id of ourSourceIds) {
        if (map.getSource(id)) map.removeSource(id);
      }

      // Cualquier marker DOM previo
      // (los markers DOM no son layers; los manejamos en otro ref)
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      for (const layer of layers) {
        if (layerVis[layer.id] === false) continue;
        if (layer.kind === "points") {
          // Markers DOM para mejor interactividad (drag + click)
          for (const f of layer.features) {
            const selected =
              selectedFeatureIds?.[layer.id]?.has(f.id) ?? false;
            const el = document.createElement("div");
            el.dataset.featureClick = "true";
            el.style.cssText = `
              width: ${selected ? 16 : 12}px;
              height: ${selected ? 16 : 12}px;
              border-radius: 50%;
              background: ${selected ? layer.color : layer.color + "cc"};
              border: ${selected ? "3px" : "2px"} solid white;
              box-shadow: 0 1px 3px rgba(0,0,0,0.35);
              cursor: ${editable ? "move" : "pointer"};
            `;
            const marker = new maplibregl.Marker({
              element: el,
              draggable: editable,
            })
              .setLngLat([f.lon, f.lat])
              .addTo(map);

            el.addEventListener("click", (e) => {
              e.stopPropagation();
              onFeatureClick?.({
                layerId: layer.id,
                feature: f,
                kind: "point",
              });
            });

            if (editable && onPointMoved) {
              marker.on("dragstart", () => {
                draggingMarkerRef.current = {
                  layerId: layer.id,
                  featureId: f.id,
                };
              });
              marker.on("dragend", () => {
                const lngLat = marker.getLngLat();
                onPointMoved(layer.id, f.id, {
                  lat: lngLat.lat,
                  lon: lngLat.lng,
                });
                draggingMarkerRef.current = null;
              });
            }
            markersRef.current.push(marker);
          }
        } else if (layer.kind === "lines") {
          const sourceId = `gv-${layer.id}-src`;
          const layerId = `gv-${layer.id}`;
          const featureCollection: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: layer.features.map((f) => ({
              type: "Feature",
              properties: {
                id: f.id,
                label: f.label ?? "",
                category: f.category ?? "",
              },
              geometry: {
                type: "LineString",
                coordinates: f.vertices.map(([lat, lon]) => [lon, lat]),
              },
            })),
          };
          map.addSource(sourceId, { type: "geojson", data: featureCollection });
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
          map.on("click", layerId, (e) => {
            const feat = e.features?.[0];
            if (!feat) return;
            const id = String(feat.properties?.id ?? "");
            const found = layer.features.find((x) => x.id === id);
            if (found) {
              onFeatureClick?.({
                layerId: layer.id,
                feature: found,
                kind: "line",
              });
            }
          });
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      }

      // Auto-fit a las features visibles si no se pidió vista fija
      if (initialView.mode === "fit" && !fittedRef.current) {
        const lngLats: [number, number][] = [];
        for (const layer of layers) {
          if (layerVis[layer.id] === false) continue;
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
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [
    layers,
    layerVis,
    editable,
    onFeatureClick,
    onPointMoved,
    initialView,
    selectedFeatureIds,
  ]);

  const markersRef = useRef<Array<import("maplibre-gl").Marker>>([]);
  const fittedRef = useRef(false);

  const totalsByLayer = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of layers) t[l.id] = l.features.length;
    return t;
  }, [layers]);

  return (
    <div className="relative w-full h-full bg-muted rounded-md overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {showLayerToggle && layers.length > 0 && (
        <div className="absolute top-2 left-2 bg-card/95 backdrop-blur rounded shadow border border-border p-2 text-xs space-y-1 z-10">
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

      {showCoords && cursorCoords && (
        <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur rounded px-2 py-1 text-xs font-mono shadow border border-border z-10">
          {cursorCoords.lat.toFixed(6)}, {cursorCoords.lon.toFixed(6)}
        </div>
      )}
    </div>
  );
}
