"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GisViewerHandlers,
  LayerSpec,
} from "./types";

type Props = {
  layers: LayerSpec[];
  /// Si true y hay un feature en `selectedFeatureIds`, ese marker se renderiza
  /// como un DOM marker draggable. El resto se renderizan como capa de círculos
  /// nativa (rápida para miles de puntos).
  editable?: boolean;
  selectedFeatureIds?: Record<string, Set<string>>;
  initialView?:
    | { mode: "fit"; padding?: number }
    | { mode: "fixed"; lat: number; lon: number; zoom: number };
  showLayerToggle?: boolean;
  showCoords?: boolean;
} & GisViewerHandlers;

// Estilo OSM raster (gratis, sin API key).
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
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const dragMarkersRef = useRef<Array<import("maplibre-gl").Marker>>([]);
  const fittedRef = useRef(false);
  const styleReadyRef = useRef(false);

  // Estados de visibilidad por capa
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const l of layers) init[l.id] = l.visible ?? true;
    return init;
  });

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

  // -------- Init del mapa (una sola vez) --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
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

      map.on("load", () => {
        styleReadyRef.current = true;
      });

      // Click vacío del mapa (cuando no cae en ninguna capa nuestra)
      map.on("click", (e) => {
        if (!mapRef.current) return;
        // Si el click cae sobre una capa nuestra, el handler de la capa
        // ya tomó el evento (registramos handlers por layer-id abajo).
        const ourLayers = (map.getStyle().layers ?? [])
          .map((l) => l.id)
          .filter((id) => id.startsWith("gv-"));
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ourLayers,
        });
        if (feats.length === 0) {
          onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        }
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
      mapRef.current?.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Pintar capas cada vez que cambian --------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = async () => {
      const maplibregl = (await import("maplibre-gl")).default;

      // Limpiar layers/sources previas nuestras
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

      // Limpiar markers DOM previos (solo se usan para el seleccionado en modo edit)
      for (const m of dragMarkersRef.current) m.remove();
      dragMarkersRef.current = [];

      for (const layer of layers) {
        if (layerVis[layer.id] === false) continue;

        if (layer.kind === "points") {
          // Capa nativa de círculos — escala a 100K+ puntos sin trabarse
          const sourceId = `gv-${layer.id}-src`;
          const layerCirclesId = `gv-${layer.id}-circles`;
          const layerSelectedId = `gv-${layer.id}-selected`;

          const selectedSet = selectedFeatureIds?.[layer.id];
          const selectedIds = selectedSet ? Array.from(selectedSet) : [];
          const editableSelected =
            editable && selectedIds.length === 1 ? selectedIds[0] : null;

          const featuresAsGeoJson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: layer.features
              // En modo edit, sacamos el seleccionado del source para mostrarlo
              // como DOM marker draggable arriba.
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

          map.addSource(sourceId, {
            type: "geojson",
            data: featuresAsGeoJson,
          });

          // Círculos no seleccionados
          map.addLayer({
            id: layerCirclesId,
            type: "circle",
            source: sourceId,
            filter: ["==", ["get", "selected"], 0],
            paint: {
              "circle-radius": 5,
              "circle-color": layer.color,
              "circle-opacity": 0.85,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
            },
          });

          // Círculos seleccionados (más grandes, contorno destacado)
          map.addLayer({
            id: layerSelectedId,
            type: "circle",
            source: sourceId,
            filter: ["==", ["get", "selected"], 1],
            paint: {
              "circle-radius": 8,
              "circle-color": layer.color,
              "circle-opacity": 1,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            },
          });

          // Click handlers para ambos sub-layers
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
              onFeatureClick?.({
                layerId: layer.id,
                feature: found,
                kind: "point",
              });
            }
          };
          map.on("click", layerCirclesId, handleClick);
          map.on("click", layerSelectedId, handleClick);
          map.on("mouseenter", layerCirclesId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerCirclesId, () => {
            map.getCanvas().style.cursor = "";
          });

          // DOM marker draggable para el seleccionado en modo edit
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
                onPointMoved?.(layer.id, feat.id, {
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
          map.addSource(sourceId, {
            type: "geojson",
            data: featureCollection,
          });
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

      // Auto-fit a las features visibles (solo la primera vez)
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

    if (styleReadyRef.current && map.isStyleLoaded()) {
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

  const totalsByLayer = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of layers) t[l.id] = l.features.length;
    return t;
  }, [layers]);

  return (
    <div className="relative w-full h-full bg-muted rounded-md overflow-hidden">
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

      {showCoords && cursorCoords && (
        <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur rounded px-2 py-1 text-xs font-mono shadow border border-border z-10">
          {cursorCoords.lat.toFixed(6)}, {cursorCoords.lon.toFixed(6)}
        </div>
      )}
    </div>
  );
}
