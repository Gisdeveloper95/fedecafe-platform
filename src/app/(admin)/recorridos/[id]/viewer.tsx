"use client";

import { useEffect, useRef } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

type Punto = {
  lat: number;
  lon: number;
  t: string;
  v: number | null;
  a: number | null;
};

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

export function RecorridoViewer({ puntos }: { puntos: Punto[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Centro inicial: primer punto si hay, sino Colombia
      const center: [number, number] = puntos[0]
        ? [puntos[0].lon, puntos[0].lat]
        : [-75.7, 4.5];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center,
        zoom: 12,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.ScaleControl(), "bottom-left");

      map.on("load", () => {
        if (puntos.length < 2) return;
        const coords = puntos.map((p) => [p.lon, p.lat] as [number, number]);

        map.addSource("recorrido", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          },
        });
        map.addLayer({
          id: "recorrido-line",
          type: "line",
          source: "recorrido",
          paint: {
            "line-color": "#0f4d3a",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });

        // Inicio (verde) y fin (rojo)
        const start = puntos[0];
        const end = puntos[puntos.length - 1];
        const startEl = document.createElement("div");
        startEl.style.cssText = `
          width: 18px; height: 18px; border-radius: 50%;
          background: #16a34a; border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.35);
        `;
        const endEl = document.createElement("div");
        endEl.style.cssText = `
          width: 18px; height: 18px; border-radius: 50%;
          background: #dc2626; border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.35);
        `;
        new maplibregl.Marker({ element: startEl })
          .setLngLat([start.lon, start.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 18 }).setText(
              `Inicio · ${new Date(start.t).toLocaleString("es-CO")}`,
            ),
          )
          .addTo(map);
        new maplibregl.Marker({ element: endEl })
          .setLngLat([end.lon, end.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 18 }).setText(
              `Fin · ${new Date(end.t).toLocaleString("es-CO")}`,
            ),
          )
          .addTo(map);

        // Fit a bbox del trazo
        let west = coords[0][0],
          east = coords[0][0],
          south = coords[0][1],
          north = coords[0][1];
        for (const [lng, lat] of coords) {
          if (lng < west) west = lng;
          if (lng > east) east = lng;
          if (lat < south) south = lat;
          if (lat > north) north = lat;
        }
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 40, animate: false },
        );
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [puntos]);

  if (puntos.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        Este recorrido no tiene puntos GPS registrados.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
