/**
 * Ingest masivo de GeoPackage (.gpkg) a Turso.
 * - Tuberias_Quindio.gpkg → tabla `tuberias` (con geometry_json LineString)
 * - Estructuras_Quindio.gpkg → tabla `estructuras`
 *
 * Lee directamente los blobs GPKG binarios (header GPKG + WKB) y los
 * convierte a GeoJSON LineString antes de subir. Trabaja en batches.
 *
 * Uso:
 *   npx tsx scripts/ingest-gpkg.ts tuberias
 *   npx tsx scripts/ingest-gpkg.ts estructuras
 *   npx tsx scripts/ingest-gpkg.ts both
 */
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

import { createClient, type Client } from "@libsql/client";
import proj4 from "proj4";

// MAGNA-SIRGAS / Colombia West zone (EPSG:3114) — central meridian -77.0775.
// OJO: el header del gpkg dice SRID=3115 (Bogota zone, central -74.0775)
// pero los datos REALES están en 3114. Es un bug típico de QGIS / ArcGIS al
// guardar el SRID. Verificado contra los centroides en proyecto_completo.db.
proj4.defs(
  "EPSG:3114",
  "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-77.0775079166667 " +
    "+k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
);
const TO_WGS84 = proj4("EPSG:3114", "EPSG:4326");

function projectXYToLatLon(x: number, y: number): [number, number] {
  // proj4 devuelve [lon, lat]; nosotros queremos [lat, lon]
  const [lon, lat] = TO_WGS84.forward([x, y]);
  return [lat, lon];
}

const TUB_GPKG =
  "C:\\Users\\andres.osorio\\Desktop\\Datos\\Tuberias_Quindio.gpkg";
const EST_GPKG =
  "C:\\Users\\andres.osorio\\Desktop\\Datos\\Estructuras_Quindio.gpkg";
const MED_GPKG = "C:\\Users\\andres.osorio\\Desktop\\Datos\\Medidores.gpkg";

type Coord = [number, number]; // [lat, lon]
type LineGeom = { type: "LineString"; coordinates: [number, number][] };

// ────────────────────────────────────────────────────────────────────
// Parser GPKG binary header + WKB
// ────────────────────────────────────────────────────────────────────

function toUint8(b: unknown): Uint8Array | null {
  if (!b) return null;
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  return null;
}

/// Parsea blob GPKG y reproyecta de EPSG:3115 → EPSG:4326 sobre la marcha.
/// El SRID se lee del header (offset 4, 4 bytes LE) — en estos gpkg viene 3115.
function parseGpkgBlob(blob: Uint8Array):
  | { kind: "point"; lat: number; lon: number }
  | { kind: "linestring"; coords: Coord[] }
  | { kind: "multilinestring"; lines: Coord[][] }
  | null {
  if (blob.length < 8) return null;
  if (blob[0] !== 0x47 || blob[1] !== 0x50) return null; // 'GP'
  const flags = blob[3];
  const envelopeType = (flags >> 1) & 0x07;
  if ((flags >> 4) & 0x01) return null;

  let offset = 8;
  const envSizes = [0, 32, 48, 48, 64];
  offset += envSizes[envelopeType] ?? 0;

  const dv = new DataView(blob.buffer, blob.byteOffset + offset);
  let pos = 0;
  const byteOrder = dv.getUint8(pos);
  pos += 1;
  const little = byteOrder === 1;
  const u32 = (p: number) => dv.getUint32(p, little);
  const f64 = (p: number) => dv.getFloat64(p, little);
  const type = u32(pos) & 0xff;
  pos += 4;

  if (type === 1) {
    const x = f64(pos);
    const y = f64(pos + 8);
    const [lat, lon] = projectXYToLatLon(x, y);
    return { kind: "point", lat, lon };
  }
  if (type === 4) {
    // MultiPoint — tomamos el primero
    const numPoints = u32(pos);
    pos += 4;
    if (numPoints === 0) return null;
    pos += 1; // byte order
    pos += 4; // type
    const x = f64(pos);
    const y = f64(pos + 8);
    const [lat, lon] = projectXYToLatLon(x, y);
    return { kind: "point", lat, lon };
  }
  if (type === 2) {
    const n = u32(pos);
    pos += 4;
    const coords: Coord[] = [];
    for (let i = 0; i < n; i++) {
      const x = f64(pos);
      pos += 8;
      const y = f64(pos);
      pos += 8;
      coords.push(projectXYToLatLon(x, y));
    }
    return { kind: "linestring", coords };
  }
  if (type === 5) {
    const numLines = u32(pos);
    pos += 4;
    const lines: Coord[][] = [];
    for (let i = 0; i < numLines; i++) {
      pos += 1; // byte order
      pos += 4; // type
      const np = u32(pos);
      pos += 4;
      const coords: Coord[] = [];
      for (let j = 0; j < np; j++) {
        const x = f64(pos);
        pos += 8;
        const y = f64(pos);
        pos += 8;
        coords.push(projectXYToLatLon(x, y));
      }
      lines.push(coords);
    }
    return { kind: "multilinestring", lines };
  }
  return null;
}

function centroidOf(coords: Coord[]): { lat: number; lon: number } {
  if (coords.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0,
    sumLon = 0;
  for (const [lat, lon] of coords) {
    sumLat += lat;
    sumLon += lon;
  }
  return { lat: sumLat / coords.length, lon: sumLon / coords.length };
}

function lineStringFromCoords(coords: Coord[]): LineGeom {
  return {
    type: "LineString",
    coordinates: coords.map(([lat, lon]) => [lon, lat]),
  };
}

// Aplana MultiLineString → la línea más larga
function pickLongestLine(lines: Coord[][]): Coord[] | null {
  if (lines.length === 0) return null;
  let best = lines[0];
  let bestLen = best.length;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length > bestLen) {
      best = lines[i];
      bestLen = lines[i].length;
    }
  }
  return best.length >= 2 ? best : null;
}

// ────────────────────────────────────────────────────────────────────
// Ingest TUBERIAS
// ────────────────────────────────────────────────────────────────────

async function ingestTuberias(local: Client, remote: Client) {
  // Obtener todas las tablas que son MULTILINESTRING (registradas en
  // gpkg_geometry_columns)
  const geomCols = await local.execute(
    `SELECT table_name, column_name FROM gpkg_geometry_columns
       WHERE geometry_type_name IN ('MULTILINESTRING','LINESTRING')`,
  );
  const tables = geomCols.rows.map((r) => ({
    name: String(r.table_name),
    geomCol: String(r.column_name),
  }));
  console.log(`Tuberías: ${tables.length} capas en gpkg`);

  let total = 0;
  const rows: Array<{
    codigo: string;
    layerName: string;
    material: string | null;
    diametro: string | null;
    ramal: string | null;
    municipio: string | null;
    acueducto: string | null;
    longitudM: number | null;
    centroidLat: number | null;
    centroidLon: number | null;
    geometryJson: string | null;
  }> = [];

  for (const tableInfo of tables) {
    const table = tableInfo.name;
    const geomCol = tableInfo.geomCol;
    const r = await local.execute(`SELECT * FROM "${table}"`);
    let withGeom = 0,
      withoutGeom = 0;
    for (const row of r.rows) {
      // El CODIGO del gpkg NO es único — múltiples segmentos de la misma
      // tubería comparten CODIGO. La unicidad real es (layer, OBJECTID).
      // PK compuesto = "CODIGO_layer_OBJECTID" → mantenemos búsqueda
      // por CODIGO con LIKE '%CODIGO%' y permitimos 1826 segmentos en lugar
      // de colapsarlos a 234 únicos.
      const baseCodigo = row.CODIGO ?? row.codigo ?? "S";
      const oid = row.OBJECTID ?? row.fid ?? Math.random();
      const codigo = `${baseCodigo}_${table}_${oid}`;
      const blob = toUint8(row[geomCol]);
      let geomJson: string | null = null;
      let centLat: number | null = null;
      let centLon: number | null = null;
      if (blob) {
        const parsed = parseGpkgBlob(blob);
        if (parsed?.kind === "multilinestring") {
          const longest = pickLongestLine(parsed.lines);
          if (longest) {
            geomJson = JSON.stringify(lineStringFromCoords(longest));
            const c = centroidOf(longest);
            centLat = c.lat;
            centLon = c.lon;
          }
        } else if (parsed?.kind === "linestring" && parsed.coords.length >= 2) {
          geomJson = JSON.stringify(lineStringFromCoords(parsed.coords));
          const c = centroidOf(parsed.coords);
          centLat = c.lat;
          centLon = c.lon;
        }
      }
      if (geomJson) withGeom++;
      else withoutGeom++;

      rows.push({
        codigo,
        layerName: table,
        material: row.MATERIAL ? String(row.MATERIAL) : null,
        diametro: row.DIAMETRO ? String(row.DIAMETRO) : null,
        ramal: row.RAMAL ? String(row.RAMAL) : null,
        municipio:
          row.MUNICIPIO ? String(row.MUNICIPIO) :
          row.MUNICIPIO_ORIGEN ? String(row.MUNICIPIO_ORIGEN) : null,
        acueducto: row.ACUEDUCTO ? String(row.ACUEDUCTO) : null,
        longitudM:
          row.SHAPE_Length != null ? Number(row.SHAPE_Length) :
          row.LONGITUD != null && !isNaN(Number(row.LONGITUD)) ? Number(row.LONGITUD) : null,
        centroidLat: centLat,
        centroidLon: centLon,
        geometryJson: geomJson,
      });
    }
    console.log(`  ${table}: ${r.rows.length} (${withGeom} con geom, ${withoutGeom} sin)`);
    total += r.rows.length;
  }

  console.log(`\nTotal a subir: ${total}`);
  console.log("Borrando tabla `tuberias` en Turso para upsert limpio...");
  await remote.execute("DELETE FROM tuberias");

  // Upsert batch
  console.log("Insertando en batches de 100...");
  const BATCH = 100;
  let inserted = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const args: (string | number | null)[] = [];
    for (const r of batch) {
      args.push(
        r.codigo,
        r.layerName,
        r.material,
        r.diametro,
        r.ramal,
        r.municipio,
        r.acueducto,
        r.longitudM,
        r.centroidLat,
        r.centroidLon,
        r.geometryJson,
        now,
      );
    }
    await remote.execute({
      sql: `INSERT OR REPLACE INTO tuberias
        (codigo, layer_name, material, diametro, ramal, municipio, acueducto,
         longitud_m, centroid_lat, centroid_lon, geometry_json, updated_at)
        VALUES ${placeholders}`,
      args,
    });
    inserted += batch.length;
    if (inserted % 500 === 0 || inserted === rows.length) {
      console.log(`  ${inserted}/${rows.length}`);
    }
  }
  console.log(`✓ ${inserted} tuberías ingestadas`);
}

// ────────────────────────────────────────────────────────────────────
// Ingest ESTRUCTURAS
// ────────────────────────────────────────────────────────────────────

async function ingestEstructuras(local: Client, remote: Client) {
  // Aceptamos POINT y MULTIPOINT. La columna de geometría se llama 'Shape'
  // en la mayoría de capas exportadas desde ArcGIS, pero algunas (Bocatomas)
  // vienen como 'geom' por una pasada por QGIS. Leemos column_name de
  // gpkg_geometry_columns en lugar de hardcodear.
  const geomCols = await local.execute(
    `SELECT table_name, column_name, geometry_type_name
       FROM gpkg_geometry_columns
       WHERE geometry_type_name IN ('POINT','MULTIPOINT')`,
  );
  const tables = geomCols.rows.map((r) => ({
    name: String(r.table_name),
    geomCol: String(r.column_name),
  }));
  console.log(`Estructuras: ${tables.length} capas en gpkg`);

  type Row = {
    codigo: string;
    layerName: string;
    latitude: number;
    longitude: number;
    ramal: string | null;
    nombre: string | null;
    tipo: string | null;
    estado: string | null;
    municipio: string | null;
    acueducto: string | null;
  };
  const rows: Row[] = [];

  for (const tableInfo of tables) {
    const table = tableInfo.name;
    const geomCol = tableInfo.geomCol;
    const r = await local.execute(`SELECT * FROM "${table}"`);
    let withGeom = 0,
      skipped = 0;
    for (const row of r.rows) {
      // PK compuesto para garantizar unicidad. La búsqueda por CODIGO real
      // funciona con LIKE '%CODIGO%' porque está al inicio del campo.
      const baseCodigo = row.CODIGO ?? row.codigo ?? "S";
      const oid = row.OBJECTID ?? row.fid ?? Math.random();
      const codigo = `${baseCodigo}_${table}_${oid}`;
      const blob = toUint8(row[geomCol]);
      let lat: number | null = null;
      let lon: number | null = null;
      if (blob) {
        const parsed = parseGpkgBlob(blob);
        if (parsed?.kind === "point") {
          lat = parsed.lat;
          lon = parsed.lon;
        }
      }
      if (
        lat == null ||
        lon == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ) {
        skipped++;
        continue;
      }
      withGeom++;
      rows.push({
        codigo,
        layerName: table,
        latitude: lat,
        longitude: lon,
        ramal: row.RAMAL ? String(row.RAMAL) : null,
        nombre: row.NOMBRE ? String(row.NOMBRE) : null,
        tipo: row.TIPO ? String(row.TIPO) : null,
        estado: row.ESTADO ? String(row.ESTADO) : null,
        municipio: row.MUNICIPIO ? String(row.MUNICIPIO) :
                   row.MUNICIPIO_ORIGEN ? String(row.MUNICIPIO_ORIGEN) : null,
        acueducto: row.ACUEDUCTO ? String(row.ACUEDUCTO) : null,
      });
    }
    console.log(`  ${table}: ${withGeom} con geom${skipped > 0 ? ` (skipped ${skipped})` : ""}`);
  }

  console.log(`\nTotal a subir: ${rows.length}`);
  console.log("Borrando tabla `estructuras` en Turso para upsert limpio...");
  await remote.execute("DELETE FROM estructuras");

  const BATCH = 200;
  let inserted = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const args: (string | number | null)[] = [];
    for (const r of batch) {
      args.push(
        r.codigo,
        r.layerName,
        r.latitude,
        r.longitude,
        r.ramal,
        r.nombre,
        r.tipo,
        r.estado,
        r.municipio,
        r.acueducto,
        now,
      );
    }
    await remote.execute({
      sql: `INSERT OR REPLACE INTO estructuras
        (codigo, layer_name, latitude, longitude, ramal, nombre, tipo, estado,
         municipio, acueducto, updated_at)
        VALUES ${placeholders}`,
      args,
    });
    inserted += batch.length;
  }
  console.log(`✓ ${inserted} estructuras ingestadas`);
}

// ────────────────────────────────────────────────────────────────────

async function ingestMedidores(local: Client, remote: Client) {
  console.log("Medidores:");
  const r = await local.execute("SELECT * FROM Medidores");
  type Row = {
    contrato: string;
    lat: number;
    lon: number;
    usuario: string | null;
    nombre: string | null;
    direccion: string | null;
  };
  const rows: Row[] = [];
  let skipped = 0;
  for (const row of r.rows) {
    const blob = toUint8(row.geom);
    if (!blob) {
      skipped++;
      continue;
    }
    const parsed = parseGpkgBlob(blob);
    if (parsed?.kind !== "point") {
      skipped++;
      continue;
    }
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) {
      skipped++;
      continue;
    }
    // CONTRATO puede repetirse (mismo contrato con varios medidores físicos).
    // PK compuesto = "CONTRATO_fid"
    const baseContrato = row.CONTRATO ?? row.USUARIO ?? row.fid;
    const contrato = `${baseContrato}_${row.fid}`;
    rows.push({
      contrato,
      lat: parsed.lat,
      lon: parsed.lon,
      usuario: row.USUARIO != null ? String(row.USUARIO) : null,
      nombre: row.NOMBRE ? String(row.NOMBRE) : null,
      direccion: row.DIRECCION ? String(row.DIRECCION) : null,
    });
  }
  console.log(`  ${rows.length} con geom (skipped ${skipped})`);

  console.log("Borrando tabla `medidores` en Turso para upsert limpio...");
  await remote.execute("DELETE FROM medidores");

  const BATCH = 200;
  let inserted = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?)").join(",");
    const args: (string | number | null)[] = [];
    for (const r of batch) {
      args.push(
        r.contrato,
        r.lat,
        r.lon,
        r.usuario,
        r.nombre,
        r.direccion,
        null, // municipio (no está en el gpkg de Medidores)
        now,
      );
    }
    await remote.execute({
      sql: `INSERT OR REPLACE INTO medidores
        (contrato, latitude, longitude, usuario, nombre, direccion,
         municipio, updated_at)
        VALUES ${placeholders}`,
      args,
    });
    inserted += batch.length;
    if (inserted % 2000 === 0 || inserted === rows.length) {
      console.log(`  ${inserted}/${rows.length}`);
    }
  }
  console.log(`✓ ${inserted} medidores ingestados`);
}

async function main() {
  const target = process.argv[2] ?? "both";
  const remote = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  if (target === "tuberias" || target === "both" || target === "all") {
    const local = createClient({ url: `file:${TUB_GPKG}` });
    await ingestTuberias(local, remote);
    local.close();
  }
  if (target === "estructuras" || target === "both" || target === "all") {
    const local = createClient({ url: `file:${EST_GPKG}` });
    await ingestEstructuras(local, remote);
    local.close();
  }
  if (target === "medidores" || target === "all") {
    const local = createClient({ url: `file:${MED_GPKG}` });
    await ingestMedidores(local, remote);
    local.close();
  }

  remote.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
