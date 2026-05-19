import proj4 from "proj4";

const projs: Record<string, string> = {
  "3114":
    "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-77.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "3115":
    "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "3116":
    "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-71.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "3117":
    "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-68.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  // West-West (CRTM05 style, not standard for Colombia)
  "9377":
    "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs",
};

for (const [code, def] of Object.entries(projs)) {
  proj4.defs(`EPSG:${code}`, def);
}

const x = 1149972.5728;
const y = 991365.3995;
for (const code of Object.keys(projs)) {
  try {
    const t = proj4(`EPSG:${code}`, "EPSG:4326");
    const [lon, lat] = t.forward([x, y]);
    console.log(
      `EPSG:${code} → lat=${lat.toFixed(6)}, lon=${lon.toFixed(6)}`,
    );
  } catch (e) {
    console.log(`EPSG:${code} → error: ${(e as Error).message}`);
  }
}
console.log("\nEsperado centroide cerca de (4.5177, -75.7242)");
