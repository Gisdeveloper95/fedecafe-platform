import { createClient } from "@libsql/client";
import proj4 from "proj4";

proj4.defs(
  "EPSG:3115",
  "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
);

async function main() {
  const local = createClient({
    url: "file:C:\\Users\\andres.osorio\\Desktop\\Datos\\Tuberias_Quindio.gpkg",
  });
  const r = await local.execute(
    `SELECT CODIGO, Shape FROM "PVC_3_4" WHERE CODIGO = '101810' LIMIT 1`,
  );
  const row = r.rows[0];
  const blob = new Uint8Array(row.Shape as ArrayBuffer);

  console.log("Header bytes 0-7:", Array.from(blob.slice(0, 8)));
  const srid =
    blob[4] | (blob[5] << 8) | (blob[6] << 16) | (blob[7] << 24);
  console.log("SRID from header:", srid);

  const flags = blob[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envSizes = [0, 32, 48, 48, 64];
  const offset = 8 + (envSizes[envelopeType] ?? 0);
  console.log("envelopeType:", envelopeType, "WKB starts at offset:", offset);

  const dv = new DataView(blob.buffer, blob.byteOffset + offset);
  const byteOrder = dv.getUint8(0);
  const little = byteOrder === 1;
  console.log("WKB byte order:", byteOrder, "little:", little);
  const type = dv.getUint32(1, little);
  console.log("WKB type:", type, "(5 = MultiLineString)");

  // For MultiLineString: 1 byte order + 4 type + 4 numLines + ... LineStrings
  const numLines = dv.getUint32(5, little);
  console.log("numLines:", numLines);

  // First LineString starts at pos 9
  let pos = 9;
  pos += 1; // byte order
  pos += 4; // type
  const np = dv.getUint32(pos, little);
  pos += 4;
  console.log("numPoints in first line:", np);

  // First 3 points
  for (let i = 0; i < Math.min(3, np); i++) {
    const x = dv.getFloat64(pos, little);
    pos += 8;
    const y = dv.getFloat64(pos, little);
    pos += 8;
    console.log(`  Point ${i}: x=${x}, y=${y}`);
    const t = proj4("EPSG:3115", "EPSG:4326");
    const [lon, lat] = t.forward([x, y]);
    console.log(`    → proj4(3115→4326): lat=${lat}, lon=${lon}`);
    // try 9377 (Magna-Sirgas Origen-Nacional)
    proj4.defs(
      "EPSG:9377",
      "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs",
    );
    const t9377 = proj4("EPSG:9377", "EPSG:4326");
    const [lon2, lat2] = t9377.forward([x, y]);
    console.log(`    → proj4(9377→4326): lat=${lat2}, lon=${lon2}`);
  }
  local.close();
}
main();
