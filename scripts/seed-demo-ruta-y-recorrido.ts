/**
 * Crea una RUTA demo con 6-8 medidores reales geográficamente cercanos +
 * un RECORRIDO sintético que sigue carreteras vía OSRM. Perfecto para
 * mostrar al director: trazado realista, no "Superman" cortando curvas
 * de nivel.
 *
 * Uso:
 *   OPERARIO_ID=<uuid-operario-existente> npx tsx scripts/seed-demo-ruta-y-recorrido.ts
 */
import { randomUUID } from "node:crypto";
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

async function osrmRoute(a: LatLon, b: LatLon): Promise<LatLon[]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
  };
  if (data.code !== "Ok" || !data.routes?.[0]) {
    const steps = 30;
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

async function main() {
  const operarioId = process.env.OPERARIO_ID;
  if (!operarioId) {
    console.error("OPERARIO_ID es obligatorio (uuid de un operario existente)");
    process.exit(2);
  }

  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Validar operario
  const opR = await c.execute({
    sql: "SELECT id, full_name FROM users WHERE id = ? AND status = 'active'",
    args: [operarioId],
  });
  if (opR.rows.length === 0) {
    console.error("Operario no encontrado o inactivo");
    process.exit(3);
  }
  console.log(`Operario: ${opR.rows[0].full_name}`);

  // Tomar 8 medidores cercanos a Armenia (centro: 4.5339, -75.6811)
  // Filtramos los que estén en ~5km del centro para que el recorrido OSRM
  // sea razonable (~10-15min de "campo simulado").
  const center: LatLon = { lat: 4.5339, lon: -75.6811 };
  const allRes = await c.execute(
    "SELECT contrato, nombre, latitude, longitude FROM medidores LIMIT 2000",
  );
  const candidates = allRes.rows
    .map((row) => ({
      contrato: String(row.contrato),
      nombre: (row.nombre as string | null) ?? "",
      lat: Number(row.latitude),
      lon: Number(row.longitude),
    }))
    .filter((m) => !isNaN(m.lat) && !isNaN(m.lon))
    .map((m) => ({ ...m, d: haversine(center, m) }))
    .filter((m) => m.d > 0 && m.d < 5000)
    .sort((a, b) => a.d - b.d);

  if (candidates.length < 6) {
    console.error(
      `Solo ${candidates.length} medidores en 5km de Armenia centro; no suficientes para demo`,
    );
    process.exit(4);
  }

  // Tomar 6-8 medidores distribuidos: primero, último, y algunos en medio.
  const N = 7;
  const picks: typeof candidates = [];
  for (let i = 0; i < N; i++) {
    const idx = Math.floor((i / (N - 1)) * (candidates.length - 1));
    picks.push(candidates[idx]);
  }
  // Dedup
  const seen = new Set<string>();
  const stops = picks.filter((p) => {
    if (seen.has(p.contrato)) return false;
    seen.add(p.contrato);
    return true;
  });

  console.log(`\nSeleccionados ${stops.length} medidores:`);
  for (const s of stops) {
    console.log(`  ${s.contrato} (${s.nombre}) — ${s.d.toFixed(0)}m del centro`);
  }

  // Crear ruta
  const rutaId = randomUUID();
  const now = new Date().toISOString();
  const startPoint = {
    lat: stops[0].lat - 0.002,
    lon: stops[0].lon - 0.002,
    label: "Bodega demo",
  };

  await c.execute({
    sql: `INSERT INTO rutas (id, nombre, tipo, operario_id, creada_por,
       estado, fecha_objetivo, notas, start_point_json, created_at, updated_at)
       VALUES (?, ?, 'medidores', ?, ?, 'completada', NULL, ?, ?, ?, ?)`,
    args: [
      rutaId,
      "DEMO Armenia · 7 puntos (recorrido por carretera)",
      operarioId,
      operarioId,
      "Ruta sintética para demo. Recorrido generado vía OSRM.",
      JSON.stringify(startPoint),
      now,
      now,
    ],
  });

  // Insertar items
  const itemRows = stops.map((s, idx) => ({
    rutaId,
    codigo: s.contrato,
    kind: "entity" as const,
    orden: idx,
    visitado: 1,
    visitadoAt: now,
  }));
  for (const row of itemRows) {
    await c.execute({
      sql: `INSERT INTO ruta_items
        (ruta_id, codigo, kind, orden, visitado, visitado_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        row.rutaId,
        row.codigo,
        row.kind,
        row.orden,
        row.visitado,
        row.visitadoAt,
      ],
    });
  }
  // Multi-asignación
  await c.execute({
    sql: "INSERT OR IGNORE INTO ruta_assignees (ruta_id, operario_id, asignado_at) VALUES (?, ?, ?)",
    args: [rutaId, operarioId, now],
  });

  console.log(`\nRuta demo creada: ${rutaId}`);

  // Generar recorrido OSRM
  const sequence: LatLon[] = [startPoint, ...stops];
  const path: LatLon[] = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    process.stdout.write(`Segmento ${i + 1}/${sequence.length - 1}... `);
    const seg = await osrmRoute(sequence[i], sequence[i + 1]);
    console.log(`${seg.length} pts`);
    if (path.length === 0) path.push(...seg);
    else path.push(...seg.slice(1));
    await new Promise((r) => setTimeout(r, 200));
  }

  let distMeters = 0;
  for (let i = 1; i < path.length; i++) {
    distMeters += haversine(path[i - 1], path[i]);
  }
  const durSec = Math.round(distMeters / (25 * 1000 / 3600));

  const recorridoId = randomUUID();
  const start = new Date(Date.now() - durSec * 1000);
  await c.execute({
    sql: `INSERT INTO recorridos (id, operario_id, ruta_id, iniciado_at,
       finalizado_at, distancia_total_m, duracion_segundos)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      recorridoId,
      operarioId,
      rutaId,
      start.toISOString(),
      new Date().toISOString(),
      distMeters,
      durSec,
    ],
  });

  const BATCH = 200;
  for (let i = 0; i < path.length; i += BATCH) {
    const batch = path.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
    const args: (string | number)[] = [];
    batch.forEach((p, j) => {
      const idx = i + j;
      const tSec = (idx / (path.length - 1)) * durSec;
      const t = new Date(start.getTime() + tSec * 1000 + idx).toISOString();
      const vel = idx === 0 ? 0 : 6.9 + (Math.random() - 0.5) * 2;
      const acc = 4 + Math.random() * 3;
      args.push(recorridoId, t, p.lat, p.lon, vel, acc);
    });
    await c.execute({
      sql: `INSERT INTO recorrido_puntos
        (recorrido_id, timestamp, latitude, longitude, velocidad_ms, precision_m)
        VALUES ${placeholders}`,
      args,
    });
  }

  console.log(`\n✓ Demo lista`);
  console.log(`  Ruta: ${rutaId}`);
  console.log(`  Recorrido: ${recorridoId}`);
  console.log(`  Puntos GPS: ${path.length}`);
  console.log(`  Distancia: ${(distMeters / 1000).toFixed(2)} km`);
  console.log(`  Duración: ${Math.floor(durSec / 60)} min`);
  console.log(`  Ver en: /recorridos/${recorridoId}`);

  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
