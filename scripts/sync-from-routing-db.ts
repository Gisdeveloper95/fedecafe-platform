/**
 * Lee routing.db (SQLite local) y envia medidores + estructuras
 * al endpoint /api/sync/* del backend desplegado (o local).
 *
 * Uso:
 *   BASE=https://fedecafe-platform.vercel.app \
 *   DB_PATH="C:/Users/andres.osorio/Desktop/routing.db" \
 *   ADMIN_USER=admin ADMIN_PASS=admin123 \
 *   npx tsx scripts/sync-from-routing-db.ts
 */
import { createClient } from "@libsql/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DB_PATH = process.env.DB_PATH ?? "C:/Users/andres.osorio/Desktop/routing.db";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASS ?? "admin123";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "500");

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function loginAdmin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASS,
      mobile: true,
      deviceFingerprint: "sync-script",
      deviceName: "sync-from-routing-db",
    }),
  });
  if (!res.ok) {
    throw new Error(`Login fallo: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

async function postSync(
  path: string,
  token: string,
  items: unknown[],
  mode: string,
): Promise<{ ok: boolean; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items, mode }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`POST ${path} fallo: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  return { ok: true, body };
}

async function main() {
  log(`BASE   = ${BASE}`);
  log(`DB     = ${DB_PATH}`);
  log(`BATCH  = ${BATCH_SIZE}`);

  log("Abriendo routing.db...");
  const db = createClient({ url: `file:${DB_PATH}` });

  log("Consultando medidores...");
  const medidoresResult = await db.execute(
    "SELECT contrato, latitude, longitude, usuario, nombre, direccion FROM medidores_routing",
  );
  const medidores = medidoresResult.rows
    .map((r) => {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const contrato =
        r.contrato == null ? null : String(r.contrato).trim();
      if (!contrato) return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        contrato,
        latitude: lat,
        longitude: lon,
        usuario: r.usuario ? String(r.usuario) : undefined,
        nombre: r.nombre ? String(r.nombre) : undefined,
        direccion: r.direccion ? String(r.direccion) : undefined,
        municipio: undefined as string | undefined,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v != null);

  // De-dup por contrato (el endpoint usa PK contrato)
  const medidoresMap = new Map<string, (typeof medidores)[number]>();
  for (const m of medidores) medidoresMap.set(m.contrato, m);
  const medidoresUnicos = [...medidoresMap.values()];
  log(
    `Medidores leidos: ${medidores.length} -> unicos por contrato: ${medidoresUnicos.length}`,
  );

  log("Consultando estructuras...");
  const estructurasResult = await db.execute(
    "SELECT codigo, layer_name, latitude, longitude, ramal, nombre, tipo, estado, municipio, acueducto FROM estructuras",
  );
  const estructuras = estructurasResult.rows
    .map((r) => {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const codigo =
        r.codigo == null ? null : String(r.codigo).trim();
      const layerName =
        r.layer_name == null ? null : String(r.layer_name).trim();
      if (!codigo || !layerName) return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        codigo,
        layerName,
        latitude: lat,
        longitude: lon,
        ramal: r.ramal ? String(r.ramal) : undefined,
        nombre: r.nombre ? String(r.nombre) : undefined,
        tipo: r.tipo ? String(r.tipo) : undefined,
        estado: r.estado ? String(r.estado) : undefined,
        municipio: r.municipio ? String(r.municipio) : undefined,
        acueducto: r.acueducto ? String(r.acueducto) : undefined,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v != null);

  const estructurasMap = new Map<string, (typeof estructuras)[number]>();
  for (const e of estructuras) estructurasMap.set(e.codigo, e);
  const estructurasUnicas = [...estructurasMap.values()];
  log(
    `Estructuras leidas: ${estructuras.length} -> unicas por codigo: ${estructurasUnicas.length}`,
  );

  await db.close();

  log("Haciendo login en backend...");
  const token = await loginAdmin();
  log("Token obtenido.");

  // Sincronizar medidores
  log("Sincronizando medidores con replace_all...");
  // Envio todos de un golpe si caben, sino por batches con modo 'upsert' (replace_all solo en el primer batch).
  if (medidoresUnicos.length <= BATCH_SIZE) {
    const t0 = Date.now();
    const result = await postSync(
      "/api/sync/medidores",
      token,
      medidoresUnicos,
      "replace_all",
    );
    log(
      `Medidores OK (${medidoresUnicos.length} en ${Date.now() - t0}ms): ${JSON.stringify(result.body)}`,
    );
  } else {
    // Primer batch borra + inserta; siguientes son upsert
    let first = true;
    for (let i = 0; i < medidoresUnicos.length; i += BATCH_SIZE) {
      const batch = medidoresUnicos.slice(i, i + BATCH_SIZE);
      const t0 = Date.now();
      const result = await postSync(
        "/api/sync/medidores",
        token,
        batch,
        first ? "replace_all" : "upsert",
      );
      log(
        `  Batch ${i}-${i + batch.length} (${Date.now() - t0}ms): ${JSON.stringify(result.body)}`,
      );
      first = false;
    }
  }

  log("Sincronizando estructuras con replace_all...");
  if (estructurasUnicas.length <= BATCH_SIZE) {
    const t0 = Date.now();
    const result = await postSync(
      "/api/sync/estructuras",
      token,
      estructurasUnicas,
      "replace_all",
    );
    log(
      `Estructuras OK (${estructurasUnicas.length} en ${Date.now() - t0}ms): ${JSON.stringify(result.body)}`,
    );
  } else {
    let first = true;
    for (let i = 0; i < estructurasUnicas.length; i += BATCH_SIZE) {
      const batch = estructurasUnicas.slice(i, i + BATCH_SIZE);
      const t0 = Date.now();
      const result = await postSync(
        "/api/sync/estructuras",
        token,
        batch,
        first ? "replace_all" : "upsert",
      );
      log(
        `  Batch ${i}-${i + batch.length} (${Date.now() - t0}ms): ${JSON.stringify(result.body)}`,
      );
      first = false;
    }
  }

  log("✓ Sincronizacion completa");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
