/**
 * Genera un recorrido GPS SINTÉTICO pero realista para demo: en lugar de
 * unir los puntos de visita con líneas rectas (Superman a través de curvas
 * de nivel), pide a OSRM la ruta por carretera entre cada par consecutivo,
 * y guarda los puntos intermedios en `recorrido_puntos`. El director ve
 * un trazado que respeta las vías de verdad.
 *
 * Uso:
 *   RUTA_ID=<uuid-de-ruta> npx tsx scripts/seed-demo-recorrido.ts
 *
 * Si la ruta no tiene start_point_json o puntos suficientes, falla con
 * mensaje claro. Es idempotente: si ya hay un recorrido demo para esa
 * ruta hoy, no crea otro (a menos que pases REPLACE=1).
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

import { createClient } from "@libsql/client";

type LatLon = { lat: number; lon: number };

async function osrmRoute(a: LatLon, b: LatLon): Promise<LatLon[]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    code: string;
    routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
  };
  if (data.code !== "Ok" || !data.routes?.[0]) {
    // Fallback: línea recta con interpolación
    const steps = 20;
    const out: LatLon[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      });
    }
    return out;
  }
  return data.routes[0].geometry.coordinates.map(([lon, lat]) => ({
    lat,
    lon,
  }));
}

function haversine(a: LatLon, b: LatLon): number {
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

async function main() {
  const rutaId = process.env.RUTA_ID;
  if (!rutaId) {
    console.error("RUTA_ID es obligatorio");
    process.exit(2);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Cargar la ruta
  const r = await client.execute({
    sql:
      "SELECT id, nombre, operario_id, start_point_json FROM rutas WHERE id = ?",
    args: [rutaId],
  });
  if (r.rows.length === 0) {
    console.error("Ruta no encontrada");
    process.exit(3);
  }
  const ruta = r.rows[0];
  const operarioId = String(ruta.operario_id);

  // Punto de partida: usa start_point_json si existe, sino el primer item de
  // la ruta como fallback (típico de rutas legacy)
  const startJson = ruta.start_point_json as string | null;
  let startPoint: { lat: number; lon: number } | null = null;
  if (startJson) {
    startPoint = JSON.parse(startJson) as { lat: number; lon: number };
  }

  // Items en orden
  const itemsRes = await client.execute({
    sql:
      `SELECT ri.codigo, ri.kind, ri.orden, ri.wp_lat, ri.wp_lon,
              m.latitude AS mlat, m.longitude AS mlon,
              e.latitude AS elat, e.longitude AS elon
       FROM ruta_items ri
       LEFT JOIN medidores m ON ri.kind = 'entity' AND m.contrato = ri.codigo
       LEFT JOIN estructuras e ON ri.kind = 'entity' AND e.codigo = ri.codigo
       WHERE ri.ruta_id = ?
       ORDER BY ri.orden ASC`,
    args: [rutaId],
  });

  const stops: LatLon[] = [];
  for (const row of itemsRes.rows) {
    if (row.kind === "waypoint") {
      stops.push({
        lat: Number(row.wp_lat),
        lon: Number(row.wp_lon),
      });
    } else {
      const lat = row.mlat ?? row.elat;
      const lon = row.mlon ?? row.elon;
      if (lat != null && lon != null) {
        stops.push({ lat: Number(lat), lon: Number(lon) });
      }
    }
  }
  if (stops.length < 2) {
    console.error("La ruta tiene <2 items mapeables; agrega más");
    process.exit(5);
  }

  // Si no hay startPoint, usa el primer stop como inicio y los demás como tour
  const sequence: LatLon[] = startPoint
    ? [startPoint, ...stops]
    : stops;
  console.log(
    `Generando recorrido para ruta "${ruta.nombre}" (${sequence.length - 1} segmentos OSRM, ${startPoint ? "con" : "sin"} punto de partida)...`,
  );

  // Pedir OSRM por cada segmento (start→stop1, stop1→stop2, ...)
  const path: LatLon[] = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    process.stdout.write(`  segmento ${i + 1}/${sequence.length - 1}... `);
    const segment = await osrmRoute(sequence[i], sequence[i + 1]);
    console.log(`${segment.length} pts`);
    // Evitamos duplicar el primer punto del siguiente segmento
    if (path.length === 0) path.push(...segment);
    else path.push(...segment.slice(1));
    await new Promise((r) => setTimeout(r, 200)); // sé amable con OSRM público
  }

  // Calcular distancia y duración aproximadas
  let distMeters = 0;
  for (let i = 1; i < path.length; i++) {
    distMeters += haversine(path[i - 1], path[i]);
  }
  // Velocidad campo: ~30 km/h promedio
  const durSec = Math.round(distMeters / (30 * 1000 / 3600));

  // Borrar recorrido demo previo de esta ruta (idempotente)
  const replace = process.env.REPLACE === "1";
  const prev = await client.execute({
    sql: "SELECT id FROM recorridos WHERE ruta_id = ? AND operario_id = ?",
    args: [rutaId, operarioId],
  });
  if (prev.rows.length > 0 && !replace) {
    console.log(
      `Ya hay ${prev.rows.length} recorridos para esta ruta. Pasa REPLACE=1 para sobrescribir.`,
    );
    process.exit(0);
  }
  if (replace) {
    for (const row of prev.rows) {
      await client.execute({
        sql: "DELETE FROM recorridos WHERE id = ?",
        args: [String(row.id)],
      });
    }
    console.log(`Borrados ${prev.rows.length} recorridos previos`);
  }

  // Insertar recorrido
  const recorridoId = randomUUID();
  const now = new Date();
  const startTime = new Date(now.getTime() - durSec * 1000);
  await client.execute({
    sql: `INSERT INTO recorridos
      (id, operario_id, ruta_id, iniciado_at, finalizado_at,
       distancia_total_m, duracion_segundos)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      recorridoId,
      operarioId,
      rutaId,
      startTime.toISOString(),
      now.toISOString(),
      distMeters,
      durSec,
    ],
  });

  // Insertar puntos en batch
  const BATCH = 200;
  for (let i = 0; i < path.length; i += BATCH) {
    const batch = path.slice(i, i + BATCH);
    const placeholders = batch
      .map(() => "(?, ?, ?, ?, ?, ?)")
      .join(",");
    const args: (string | number)[] = [];
    batch.forEach((p, j) => {
      const idx = i + j;
      const tSec = (idx / (path.length - 1)) * durSec;
      const t = new Date(startTime.getTime() + tSec * 1000 + idx).toISOString();
      // Velocidad simulada: ~8 m/s caminando/lento (sin variaciones)
      const vel = idx === 0 ? 0 : 8 + (Math.random() - 0.5) * 2;
      const acc = 4 + Math.random() * 3;
      args.push(recorridoId, t, p.lat, p.lon, vel, acc);
    });
    await client.execute({
      sql: `INSERT INTO recorrido_puntos
        (recorrido_id, timestamp, latitude, longitude, velocidad_ms, precision_m)
        VALUES ${placeholders}`,
      args,
    });
  }

  console.log("\n✓ Recorrido creado");
  console.log(`  id: ${recorridoId}`);
  console.log(`  puntos GPS: ${path.length}`);
  console.log(`  distancia: ${(distMeters / 1000).toFixed(2)} km`);
  console.log(`  duración: ${Math.floor(durSec / 60)} min`);
  console.log(`  Visualízalo en /recorridos/${recorridoId}`);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Para evitar warning de "createHash unused"
void createHash;
