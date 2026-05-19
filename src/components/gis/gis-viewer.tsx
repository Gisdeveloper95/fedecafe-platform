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
  /// Si true y hay un feature seleccionado, se renderiza como DOM marker
  /// draggable encima de la capa circle. El resto va siempre en la capa nativa.
  editable?: boolean;
  selectedFeatureIds?: Record<string, Set<string>>;
  initialView?: InitialView;
  showLayerToggle?: boolean;
  showCoords?: boolean;
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
    onFeatureClick,
    onMapClick,
    onPointMoved,
  } = props;
  // initialView lo resolvemos sin destructure-default para no romper la
  // identidad referencial en cada render del padre (eso disparaba el efecto
  // de capas en cada render y apilaba listeners "once" zombie).
  const initialView: InitialView = props.initialView ?? DEFAULT_VIEW;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const dragMarkersRef = useRef<Array<import("maplibre-gl").Marker>>([]);
  const fittedRef = useRef(false);
  const layerClickHandlersRef = useRef<
    Array<{
      layerId: string;
      handler: (e: unknown) => void;
    }>
  >([]);

  // mapReady dispara re-render cuando el map.on("load") fire → permite que el
  // efecto de capas corra DESPUÉS de que el style esté listo, sin depender de
  // `once` que sólo se dispara una vez.
  const [mapReady, setMapReady] = useState(false);

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
        if (cancelled) return;
        setMapReady(true);
      });

      // Click vacío
      map.on("click", (e) => {
        const ourLayers = (map.getStyle().layers ?? [])
          .map((l) => l.id)
          .filter((id) => id.startsWith("gv-"));
        if (ourLayers.length === 0) {
          onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
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
      setMapReady(false);
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Pintar capas (corre solo cuando map está listo) --------
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapRef.current) return;

      // Limpiar handlers de click previos
      for (const { layerId, handler } of layerClickHandlersRef.current) {
        try {
          map.off("click", layerId, handler as never);
        } catch {
          /* layer ya no existe */
        }
      }
      layerClickHandlersRef.current = [];

      // Limpiar layers/sources previas
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

      // Limpiar markers DOM previos
      for (const m of dragMarkersRef.current) m.remove();
      dragMarkersRef.current = [];

      for (const layer of layers) {
        if (layerVis[layer.id] === false) continue;

        if (layer.kind === "points") {
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
          layerClickHandlersRef.current.push({
            layerId: layerCirclesId,
            handler: handleClick as never,
          });
          layerClickHandlersRef.current.push({
            layerId: layerSelectedId,
            handler: handleClick as never,
          });

          map.on("mouseenter", layerCirclesId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerCirclesId, () => {
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
                kind: "line",
              });
            }
          };
          map.on("click", layerId, handleClick);
          layerClickHandlersRef.current.push({
            layerId,
            handler: handleClick as never,
          });
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      }

      // Auto-fit la primera vez que hay features visibles
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
    })();

    return () => {
      cancelled = true;
    };
  }, [
    mapReady,
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

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
          Cargando mapa...
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
