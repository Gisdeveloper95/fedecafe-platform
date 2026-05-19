import proj4 from "proj4";

proj4.defs(
  "EPSG:3115",
  "+proj=tmerc +lat_0=4.59620041944444 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
);
const t = proj4("EPSG:3115", "EPSG:4326");
// El centroide esperado de PVC tubería OBJECTID 1 (CODIGO 101810) es:
//   centroid_lat = 4.5177910788038, centroid_lon = -75.7242944887026
// Sus X,Y en SRID 3115 deberían ser ~ (X, Y) que mapean a eso
// Verifico el inverso:
const r1 = t.inverse([-75.7242944887026, 4.5177910788038]);
console.log("centroid (-75.7242, 4.5177) en EPSG:3115 →", r1);
// Y el directo desde valores aproximados del blob:
const r2 = t.forward([1162400, 990000]);
console.log("(1162400, 990000) en 3115 → lat/lon:", r2);
