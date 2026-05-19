import { createClient } from "@libsql/client";

async function main() {
  const local = createClient({
    url: "file:C:\\Users\\andres.osorio\\Desktop\\Datos\\Estructuras_Quindio.gpkg",
  });
  // Bocatomas usa 'geom' como columna, no 'Shape' (probablemente)
  const cols = await local.execute('PRAGMA table_info("Bocatomas")');
  console.log("columns:");
  for (const c of cols.rows) console.log("  ", c.name, c.type);
  const r = await local.execute('SELECT * FROM "Bocatomas" LIMIT 1');
  console.log("\nfirst row keys:", Object.keys(r.rows[0]));
  local.close();
}
main();
