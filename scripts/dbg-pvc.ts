import { createClient } from "@libsql/client";

async function main() {
  const c = createClient({
    url: "file:C:\\Users\\andres.osorio\\Desktop\\Datos\\Tuberias_Quindio.gpkg",
  });
  const r = await c.execute('SELECT * FROM "PVC_3_4" LIMIT 3');
  for (const row of r.rows) {
    console.log("keys:", Object.keys(row));
    console.log("CODIGO:", JSON.stringify(row.CODIGO));
    console.log("OBJECTID:", JSON.stringify(row.OBJECTID));
    console.log("---");
  }
  // Cuenta de CODIGOs únicos vs total
  const cnt = await c.execute(
    `SELECT count(*) c, count(distinct CODIGO) u FROM "PVC_3_4"`,
  );
  console.log("PVC_3_4 total:", cnt.rows[0].c, "unique CODIGO:", cnt.rows[0].u);

  // Cross-layer: count(distinct CODIGO) global
  const layers = await c.execute(
    `SELECT table_name FROM gpkg_geometry_columns WHERE geometry_type_name IN ('LINESTRING','MULTILINESTRING')`,
  );
  let total = 0;
  const codigos = new Set<string>();
  for (const l of layers.rows) {
    const t = String(l.table_name);
    const rr = await c.execute(`SELECT CODIGO FROM "${t}"`);
    for (const r of rr.rows) {
      total++;
      if (r.CODIGO) codigos.add(String(r.CODIGO));
    }
  }
  console.log(`\nTotal filas: ${total}, codigos únicos global: ${codigos.size}`);

  c.close();
}
main();
