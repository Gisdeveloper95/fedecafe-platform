import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({ url: "file:C:/Users/andres.osorio/Desktop/routing.db" });

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  console.log("Tablas:");
  for (const row of tables.rows) console.log(" -", row.name);

  console.log("\nConteos y columnas de tablas candidatas:");
  for (const row of tables.rows) {
    const name = String(row.name);
    if (name.startsWith("sqlite_")) continue;
    try {
      const count = await client.execute(`SELECT COUNT(*) as c FROM "${name}"`);
      const cols = await client.execute(`PRAGMA table_info("${name}")`);
      const colNames = cols.rows.map((c) => c.name).join(", ");
      console.log(`\n ${name} (${count.rows[0].c} filas)`);
      console.log(`   cols: ${colNames}`);
      // Mostrar 1 fila de muestra si hay datos
      if (Number(count.rows[0].c) > 0) {
        const sample = await client.execute(`SELECT * FROM "${name}" LIMIT 1`);
        console.log(`   sample:`, sample.rows[0]);
      }
    } catch (e) {
      console.log(` ${name}: error`, (e as Error).message);
    }
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
