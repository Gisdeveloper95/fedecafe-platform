import { createClient } from "@libsql/client";

async function main() {
  const local = createClient({
    url: "file:C:\\Users\\andres.osorio\\Desktop\\Datos\\Tuberias_Quindio.gpkg",
  });

  const r = await local.execute('SELECT OBJECTID, CODIGO, Shape, length(Shape) AS bytes FROM "PVC_3_4" LIMIT 2');
  for (const row of r.rows) {
    console.log("OBJECTID:", row.OBJECTID, "CODIGO:", row.CODIGO);
    console.log("  bytes:", row.bytes);
    console.log("  Shape typeof:", typeof row.Shape);
    console.log("  Shape constructor:", (row.Shape as object)?.constructor?.name);
    console.log("  isUint8Array:", row.Shape instanceof Uint8Array);
    console.log("  isArrayBuffer:", row.Shape instanceof ArrayBuffer);
    const b = row.Shape as Uint8Array | ArrayBuffer | string;
    if (b instanceof Uint8Array) {
      console.log("  first 16 bytes:", Array.from(b.slice(0, 16)).map((n) => n.toString(16).padStart(2, "0")).join(" "));
    } else if (typeof b === "string") {
      console.log("  string length:", b.length);
      console.log("  first 40 chars:", b.slice(0, 40));
    } else {
      console.log("  raw:", b);
    }
  }
  local.close();
}
main();
