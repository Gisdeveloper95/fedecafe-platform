import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Usuarios y sesiones
// ---------------------------------------------------------------------------
//
// status: estado del acceso del usuario.
//   - active: puede operar normalmente
//   - suspended: queda bloqueado al próximo refresh (offline grace period vence con el JWT actual)
//   - deleted: equivalente a borrado lógico
//
// accountType:
//   - regular: usuario permanente, login con username + password
//   - demo: activado con token de 6 dígitos, TTL controlado por demoTokensTable.expiresAt

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    role: text("role", { enum: ["admin", "operario"] }).notNull(),
    status: text("status", {
      enum: ["active", "suspended", "deleted"],
    })
      .notNull()
      .default("active"),
    accountType: text("account_type", { enum: ["regular", "demo"] })
      .notNull()
      .default("regular"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    accessExpiresAt: text("access_expires_at"),
    demoTokenCode: text("demo_token_code"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    createdBy: text("created_by"),
    lastLoginAt: text("last_login_at"),
  },
  (t) => [
    index("idx_users_username").on(t.username),
    index("idx_users_status").on(t.status),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceFingerprint: text("device_fingerprint").notNull(),
    deviceName: text("device_name"),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_refresh").on(t.refreshTokenHash),
  ],
);

// Sesiones web Better Auth (cookies)
export const webSessions = sqliteTable(
  "web_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
);

// ---------------------------------------------------------------------------
// Demo tokens (códigos de 6 dígitos generados por admin)
// ---------------------------------------------------------------------------

export const demoTokens = sqliteTable(
  "demo_tokens",
  {
    code: text("code").primaryKey(),
    label: text("label"),
    expiresAt: text("expires_at").notNull(),
    maxActivations: integer("max_activations").notNull().default(1),
    activationsUsed: integer("activations_used").notNull().default(0),
    isRevoked: integer("is_revoked", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    createdBy: text("created_by"),
    notes: text("notes"),
  },
  (t) => [index("idx_demo_tokens_expires").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Configuración global (kill switch y otros)
// ---------------------------------------------------------------------------

export const globalSettings = sqliteTable("global_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedBy: text("updated_by"),
});

// ---------------------------------------------------------------------------
// Reset de contraseña (links enviados por correo)
// ---------------------------------------------------------------------------

export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("idx_password_resets_user").on(t.userId),
    index("idx_password_resets_token").on(t.tokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Datos maestros (sincronizados a demanda desde rutas_builder)
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
// Rutas asignadas
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

// Un item de una ruta puede ser un medidor (por contrato) o una estructura (por codigo).
// El tipo efectivo se determina por ruta.tipo.
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
// Recorridos (tracking de GPS enviado por el operario al terminar su jornada)
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
// Capturas del operario en staging (Capture → Review → Production)
// ---------------------------------------------------------------------------
//
// Toda operación que mande el operario desde campo entra acá primero. Nada
// toca tablas productivas hasta que un admin la apruebe.

export const pendingCaptures = sqliteTable(
  "pending_captures",
  {
    id: text("id").primaryKey(), // UUID generado en el dispositivo (idempotency key)
    opType: text("op_type", {
      enum: [
        "capture_visit",
        "create_medidor",
        "update_medidor",
        "mark_removed",
        "create_estructura",
        "update_estructura",
        "report_anomaly",
      ],
    }).notNull(),
    targetType: text("target_type", {
      enum: ["medidor", "estructura"],
    }).notNull(),
    targetId: text("target_id"), // contrato/codigo de la entidad afectada (null si es create)
    payloadJson: text("payload_json").notNull(),
    attachmentsJson: text("attachments_json"), // ["photos/.../1.jpg", "photos/.../2.jpg"]

    operarioId: text("operario_id")
      .notNull()
      .references(() => users.id),
    rutaId: text("ruta_id").references(() => rutas.id),
    deviceFingerprint: text("device_fingerprint"),
    capturedAt: text("captured_at").notNull(),
    uploadedAt: text("uploaded_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    gpsLat: real("gps_lat"),
    gpsLon: real("gps_lon"),
    gpsAccuracy: real("gps_accuracy"),

    state: text("state", {
      enum: ["pending", "approved", "rejected", "needs_info", "apply_failed"],
    })
      .notNull()
      .default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    reviewNotes: text("review_notes"),

    appliedToTable: text("applied_to_table"),
    appliedToId: text("applied_to_id"),
    appliedAt: text("applied_at"),
    applyError: text("apply_error"),
  },
  (t) => [
    index("idx_pending_state").on(t.state, t.uploadedAt),
    index("idx_pending_operario").on(t.operarioId, t.uploadedAt),
    index("idx_pending_target").on(t.targetType, t.targetId),
  ],
);

// Llaves de idempotencia para que reintentos del cliente no dupliquen.
// El cliente genera un UUID por operación; si llega 2 veces, devolvemos el mismo resultado.
export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(), // ej: "captures"
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("idx_idempotency_expires").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Catálogo de assets versionados en R2 (MBTiles, ortofotos, routing dbs)
// ---------------------------------------------------------------------------

export const dataAssets = sqliteTable(
  "data_assets",
  {
    key: text("key").primaryKey(), // ej: "basemap-osm-eje-cafetero"
    layerType: text("layer_type", {
      enum: [
        "basemap",
        "ortofoto",
        "routing_db",
        "vias",
        "tuberias",
        "fotos_historicas",
      ],
    }).notNull(),
    scope: text("scope"), // ej: "quindio" | "eje-cafetero" | "global"
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(), // path dentro del bucket R2
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    contentType: text("content_type"),
    publishedAt: text("published_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    publishedBy: text("published_by"),
    notes: text("notes"),
  },
  (t) => [
    index("idx_assets_layer").on(t.layerType, t.scope),
    index("idx_assets_published").on(t.publishedAt),
  ],
);

// ---------------------------------------------------------------------------
// Log de auditoria
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    targetId: text("target_id"),
    details: text("details"), // JSON
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("idx_audit_user_time").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type DemoToken = typeof demoTokens.$inferSelect;
export type PendingCapture = typeof pendingCaptures.$inferSelect;
export type NewPendingCapture = typeof pendingCaptures.$inferInsert;
export type DataAsset = typeof dataAssets.$inferSelect;
export type NewDataAsset = typeof dataAssets.$inferInsert;
export type Medidor = typeof medidores.$inferSelect;
export type Estructura = typeof estructuras.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type RutaItem = typeof rutaItems.$inferSelect;
export type Recorrido = typeof recorridos.$inferSelect;
export type RecorridoPunto = typeof recorridoPuntos.$inferSelect;
