// =========================================================================
// SCHEMA DOMINIO "AGUA" (FEDECAFE)
// =========================================================================
//
// Tablas específicas del proyecto Fedecafe — acueductos veredales:
// medidores, estructuras (pozos, lavadores, desarenadores…), rutas de
// trabajo y recorridos GPS.
//
// Cuando se arranque proyecto 2 (médicos de campo) o 3 (geología),
// se reemplaza este archivo por uno equivalente del nuevo dominio
// (`schema-medical.ts`, `schema-geology.ts`). El core no se toca.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { users } from "./schema-core";

// ---------------------------------------------------------------------------
// Datos maestros GIS
// ---------------------------------------------------------------------------

export const medidores = sqliteTable(
  "medidores",
  {
    contrato: text("contrato").primaryKey(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    usuario: text("usuario"),
    nombre: text("nombre"),
    direccion: text("direccion"),
    municipio: text("municipio"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("idx_medidores_municipio").on(t.municipio)],
);

export const estructuras = sqliteTable(
  "estructuras",
  {
    codigo: text("codigo").primaryKey(),
    layerName: text("layer_name").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    ramal: text("ramal"),
    nombre: text("nombre"),
    tipo: text("tipo"),
    estado: text("estado"),
    municipio: text("municipio"),
    acueducto: text("acueducto"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("idx_estructuras_layer").on(t.layerName),
    index("idx_estructuras_municipio").on(t.municipio),
  ],
);

// ---------------------------------------------------------------------------
// Tuberías (geometría LineString como GeoJSON serializado en texto)
// ---------------------------------------------------------------------------

export const tuberias = sqliteTable(
  "tuberias",
  {
    codigo: text("codigo").primaryKey(),
    layerName: text("layer_name").notNull(),
    material: text("material"),
    diametro: text("diametro"),
    ramal: text("ramal"),
    municipio: text("municipio"),
    acueducto: text("acueducto"),
    longitudM: real("longitud_m"),
    centroidLat: real("centroid_lat"),
    centroidLon: real("centroid_lon"),
    geometryJson: text("geometry_json"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("idx_tuberias_layer").on(t.layerName),
    index("idx_tuberias_municipio").on(t.municipio),
  ],
);

// ---------------------------------------------------------------------------
// Rutas de trabajo (asignación de puntos a un operario)
// ---------------------------------------------------------------------------

export const rutas = sqliteTable(
  "rutas",
  {
    id: text("id").primaryKey(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo", { enum: ["medidores", "estructuras"] }).notNull(),
    operarioId: text("operario_id")
      .notNull()
      .references(() => users.id),
    creadaPor: text("creada_por")
      .notNull()
      .references(() => users.id),
    estado: text("estado", {
      enum: ["pendiente", "en_curso", "completada", "archivada"],
    })
      .notNull()
      .default("pendiente"),
    notas: text("notas"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("idx_rutas_operario").on(t.operarioId, t.estado)],
);

export const rutaItems = sqliteTable(
  "ruta_items",
  {
    rutaId: text("ruta_id")
      .notNull()
      .references(() => rutas.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    orden: integer("orden"),
    visitado: integer("visitado", { mode: "boolean" }).notNull().default(false),
    visitadoAt: text("visitado_at"),
  },
  (t) => [primaryKey({ columns: [t.rutaId, t.codigo] })],
);

// ---------------------------------------------------------------------------
// Recorridos GPS del operario
// ---------------------------------------------------------------------------

export const recorridos = sqliteTable(
  "recorridos",
  {
    id: text("id").primaryKey(),
    operarioId: text("operario_id")
      .notNull()
      .references(() => users.id),
    rutaId: text("ruta_id").references(() => rutas.id),
    iniciadoAt: text("iniciado_at").notNull(),
    finalizadoAt: text("finalizado_at").notNull(),
    distanciaTotalM: real("distancia_total_m"),
    duracionSegundos: integer("duracion_segundos"),
    subidoAt: text("subido_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("idx_recorridos_operario").on(t.operarioId, t.iniciadoAt)],
);

export const recorridoPuntos = sqliteTable(
  "recorrido_puntos",
  {
    recorridoId: text("recorrido_id")
      .notNull()
      .references(() => recorridos.id, { onDelete: "cascade" }),
    timestamp: text("timestamp").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    velocidadMs: real("velocidad_ms"),
    precisionM: real("precision_m"),
    bateriaPct: integer("bateria_pct"),
  },
  (t) => [primaryKey({ columns: [t.recorridoId, t.timestamp] })],
);

// ---------------------------------------------------------------------------
// Tipos inferidos (water)
// ---------------------------------------------------------------------------

export type Medidor = typeof medidores.$inferSelect;
export type Estructura = typeof estructuras.$inferSelect;
export type Tuberia = typeof tuberias.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type RutaItem = typeof rutaItems.$inferSelect;
export type Recorrido = typeof recorridos.$inferSelect;
export type RecorridoPunto = typeof recorridoPuntos.$inferSelect;
