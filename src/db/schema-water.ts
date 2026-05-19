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
    fechaObjetivo: text("fecha_objetivo"),
    notas: text("notas"),
    /// JSON con punto de partida: { lat, lon, label?, favoriteId? }
    startPointJson: text("start_point_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("idx_rutas_operario").on(t.operarioId, t.estado),
    index("idx_rutas_fecha").on(t.fechaObjetivo),
  ],
);

/// Tabla N:N de asignación de rutas a operarios. Una ruta puede tener varios
/// operarios (cuadrilla, parejas en campo). `rutas.operarioId` se mantiene como
/// "líder/creador originalmente asignado" por compat, pero el filtro de
/// visibilidad usa esta tabla.
export const rutaAssignees = sqliteTable(
  "ruta_assignees",
  {
    rutaId: text("ruta_id")
      .notNull()
      .references(() => rutas.id, { onDelete: "cascade" }),
    operarioId: text("operario_id")
      .notNull()
      .references(() => users.id),
    asignadoAt: text("asignado_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    primaryKey({ columns: [t.rutaId, t.operarioId] }),
    index("idx_ruta_assignees_operario").on(t.operarioId),
  ],
);

export const rutaItems = sqliteTable(
  "ruta_items",
  {
    rutaId: text("ruta_id")
      .notNull()
      .references(() => rutas.id, { onDelete: "cascade" }),
    /// Para items kind='entity': es contrato/codigo del medidor o estructura.
    /// Para items kind='waypoint': UUID generado por el cliente.
    codigo: text("codigo").notNull(),
    /// 'entity' | 'waypoint'. Si null, asumir 'entity' (compat con datos viejos).
    kind: text("kind"),
    orden: integer("orden"),
    visitado: integer("visitado", { mode: "boolean" }).notNull().default(false),
    visitadoAt: text("visitado_at"),
    /// Solo para waypoints: posición geográfica + etiqueta libre.
    wpLat: real("wp_lat"),
    wpLon: real("wp_lon"),
    wpLabel: text("wp_label"),
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

// ---------------------------------------------------------------------------
// Fotografías asociadas a entidades GIS (medidor/estructura/tubería)
// ---------------------------------------------------------------------------
//
// El admin sube fotos directamente desde la web a R2 y se asocian aquí.
// Las fotos capturadas por operarios entran via pending_captures → review.
// Estas son distintas: van directo a producción porque el admin es la
// autoridad de validación.

export const entityPhotos = sqliteTable(
  "entity_photos",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type", {
      enum: ["medidor", "estructura", "tuberia"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    caption: text("caption"),
    uploadedBy: text("uploaded_by"),
    uploadedAt: text("uploaded_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    /// Si la foto vino de una captura del operario (no del admin web).
    sourceCaptureId: text("source_capture_id"),
  },
  (t) => [
    index("idx_photos_target").on(t.targetType, t.targetId),
    index("idx_photos_uploaded").on(t.uploadedAt),
  ],
);

// ---------------------------------------------------------------------------
// Anomalías reportadas en campo (visualmente dañado, sin acceso, etc.)
// ---------------------------------------------------------------------------

export const estructuraAnomalies = sqliteTable(
  "estructura_anomalies",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type", {
      enum: ["medidor", "estructura", "tuberia"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    severity: text("severity", { enum: ["info", "warning", "critical"] })
      .notNull()
      .default("info"),
    title: text("title").notNull(),
    description: text("description"),
    reportedBy: text("reported_by")
      .notNull()
      .references(() => users.id),
    reportedAt: text("reported_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    gpsLat: real("gps_lat"),
    gpsLon: real("gps_lon"),
    attachmentsJson: text("attachments_json"),
    state: text("state", {
      enum: ["open", "in_progress", "resolved", "discarded"],
    })
      .notNull()
      .default("open"),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: text("resolved_at"),
    resolutionNotes: text("resolution_notes"),
    sourceCaptureId: text("source_capture_id"),
  },
  (t) => [
    index("idx_anomalies_state").on(t.state, t.reportedAt),
    index("idx_anomalies_target").on(t.targetType, t.targetId),
  ],
);

export type Medidor = typeof medidores.$inferSelect;
export type Estructura = typeof estructuras.$inferSelect;
export type Tuberia = typeof tuberias.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type RutaAssignee = typeof rutaAssignees.$inferSelect;
export type NewRutaAssignee = typeof rutaAssignees.$inferInsert;
export type RutaItem = typeof rutaItems.$inferSelect;
export type Recorrido = typeof recorridos.$inferSelect;
export type RecorridoPunto = typeof recorridoPuntos.$inferSelect;
export type EstructuraAnomaly = typeof estructuraAnomalies.$inferSelect;
export type NewEstructuraAnomaly = typeof estructuraAnomalies.$inferInsert;
export type EntityPhoto = typeof entityPhotos.$inferSelect;
export type NewEntityPhoto = typeof entityPhotos.$inferInsert;
