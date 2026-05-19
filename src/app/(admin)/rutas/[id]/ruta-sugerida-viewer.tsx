"use client";

import { useEffect, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

type Punto = {
  codigo: string;
  lat: number;
  lon: number;
  visitado: boolean;
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

/// Pide a OSRM la ruta por CARRETERA entre dos puntos. Si OSRM falla,
/// devuelve línea recta como fallback.
async function osrmSegment(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): Promise<Array<[number, number]>> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM HTTP " + res.status);
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
    };
    if (data.code === "Ok" && data.routes?.[0]) {
      return data.routes[0].geometry.coordinates;
    }
  } catch {
    // ignore — caemos al fallback abajo
  }
  return [
    [a.lon, a.lat],
    [b.lon, b.lat],
  ];
}

export function RutaSugeridaViewer({
  puntos,
  startPoint,
}: {
  puntos: Punto[];
  startPoint: { lat: number; lon: number; label?: string } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [estado, setEstado] = useState<"calculando" | "lista" | "error">(
    "calculando",
  );
  const [stats, setStats] = useState<{ km: number; segmentos: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: puntos[0] ? [puntos[0].lon, puntos[0].lat] : [-75.7, 4.5],
        zoom: 12,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.ScaleControl(), "bottom-left");

      map.on("load", async () => {
        if (cancelled) return;

        // Marcadores numerados de cada punto
        puntos.forEach((p, i) => {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: ${p.visitado ? "#16a34a" : "#dc2626"};
            color: white;
            border: 2.5px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            cursor: pointer;
          `;
          el.textContent = String(i + 1);
          new maplibregl.Marker({ element: el })
            .setLngLat([p.lon, p.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 22 }).setHTML(
                `<div style="font-family:monospace;font-weight:600">${p.codigo}</div>` +
                  `<div style="font-size:11px;color:#666">${p.visitado ? "✓ Visitado" : "Pendiente"}</div>`,
              ),
            )
            .addTo(map);
        });

        // Marcador star del punto de partida
        if (startPoint) {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #dc2626;
            color: white;
            border: 3px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          `;
          el.textContent = "★";
          new maplibregl.Marker({ element: el })
            .setLngLat([startPoint.lon, startPoint.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 22 }).setText(
                startPoint.label ?? "Punto de partida",
              ),
            )
            .addTo(map);
        }

        // Fit a todos los puntos antes de pedir OSRM (UX rápida)
        const allCoords: [number, number][] = [
          ...(startPoint ? [[startPoint.lon, startPoint.lat] as [number, number]] : []),
          ...puntos.map((p) => [p.lon, p.lat] as [number, number]),
        ];
        if (allCoords.length > 1) {
          let west = allCoords[0][0],
            east = allCoords[0][0],
            south = allCoords[0][1],
            north = allCoords[0][1];
          for (const [lng, lat] of allCoords) {
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
            { padding: 50, animate: false },
          );
        }

        // Calcular ruta sugerida por carretera via OSRM (segmento a segmento)
        const sequence: Array<{ lat: number; lon: number }> = [];
        if (startPoint) sequence.push(startPoint);
        for (const p of puntos) sequence.push({ lat: p.lat, lon: p.lon });

        if (sequence.length < 2) {
          if (!cancelled) setEstado("error");
          return;
        }

        const fullCoords: [number, number][] = [];
        for (let i = 0; i < sequence.length - 1; i++) {
          if (cancelled) return;
          const seg = await osrmSegment(sequence[i], sequence[i + 1]);
          if (fullCoords.length === 0) fullCoords.push(...seg);
          else fullCoords.push(...seg.slice(1));
        }
        if (cancelled) return;

        // Distancia total en km (Haversine sobre los puntos del path)
        let distM = 0;
        for (let i = 1; i < fullCoords.length; i++) {
          const [lon1, lat1] = fullCoords[i - 1];
          const [lon2, lat2] = fullCoords[i];
          const R = 6371000;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) *
              Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
          distM += 2 * R * Math.asin(Math.sqrt(h));
        }

        if (cancelled) return;
        map.addSource("ruta", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: fullCoords },
          },
        });
        map.addLayer({
          id: "ruta-line-halo",
          type: "line",
          source: "ruta",
          paint: {
            "line-color": "#ffffff",
            "line-width": 7,
            "line-opacity": 0.7,
          },
        });
        map.addLayer({
          id: "ruta-line",
          type: "line",
          source: "ruta",
          paint: {
            "line-color": "#0f4d3a",
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });

        if (!cancelled) {
          setStats({ km: distM / 1000, segmentos: sequence.length - 1 });
          setEstado("lista");
        }
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos.length, startPoint?.lat, startPoint?.lon]);

  return (
    <div className="relative w-full h-full bg-muted">
      <div ref={containerRef} className="absolute inset-0" />

      {estado === "calculando" && (
        <div className="absolute top-3 left-3 bg-card/95 backdrop-blur border border-border rounded-full px-3 py-1.5 text-xs font-medium shadow flex items-center gap-2 z-10">
          <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Calculando ruta sugerida por carretera…
        </div>
      )}
      {estado === "lista" && stats && (
        <div className="absolute bottom-3 left-3 bg-brand text-brand-foreground rounded-full px-3 py-1.5 text-xs font-medium shadow flex items-center gap-2 z-10">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M9 6l-6 6 6 6M15 6l6 6-6 6" />
          </svg>
          Ruta sugerida · {stats.km.toFixed(1)} km · {stats.segmentos} segmentos
        </div>
      )}
    </div>
  );
}
