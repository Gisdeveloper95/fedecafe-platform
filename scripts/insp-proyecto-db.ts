/**
 * Inspecciona proyecto_completo.db (la BD local con TODO el dato del proyecto)
 * para ver qué tablas tiene y cuántas filas. Es lo que el rutas_builder usa
 * como fuente; si el server tiene menos, necesitamos resincronizar desde aquí.
 */
import { spawnSync } from "node:child_process";

const dbPath = "C:\\Users\\andres.osorio\\Desktop\\Datos\\proyecto_completo.db";

function sqlite(q: string): string {
  const r = spawnSync("sqlite3", [dbPath, "-cmd", ".mode column", "-cmd", ".headers on", q], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    return `ERROR: ${r.stderr || r.stdout}`;
  }
  return r.stdout;
}

console.log("=== Tablas ===");
console.log(sqlite("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"));

console.log("\n=== Conteos por tabla relevante ===");
for (const t of ["medidores", "estructuras", "tuberias", "vias"]) {
  try {
    const r = sqlite(`SELECT '${t}' AS tabla, count(*) AS filas FROM ${t}`);
    console.log(r.trim());
  } catch {
    console.log(`(no ${t})`);
  }
}

console.log("\n=== Schema tuberias ===");
console.log(sqlite(".schema tuberias"));

console.log("\n=== Muestra tuberia ===");
console.log(sqlite("SELECT * FROM tuberias LIMIT 2"));

console.log("\n=== Schema estructuras ===");
console.log(sqlite(".schema estructuras"));

console.log("\n=== Schema medidores ===");
console.log(sqlite(".schema medidores"));
