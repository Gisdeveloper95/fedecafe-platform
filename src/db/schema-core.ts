// =========================================================================
// SCHEMA CORE — REUTILIZABLE ENTRE PROYECTOS (Fedecafe, médicos, geología…)
// =========================================================================
//
// Estas tablas NO son específicas del dominio "agua". El día que arranque
// otro proyecto (médicos de campo, geología de muestras, etc.), este archivo
// se copia tal cual. Solo cambia `schema-water.ts` (la capa de dominio).
//
// Mantenlo limpio: si una tabla solo tiene sentido para Fedecafe, NO la
// agregues aquí — va en schema-water.ts.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Usuarios y sesiones
// ---------------------------------------------------------------------------

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
// Demo tokens y kill switch global
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

export const globalSettings = sqliteTable("global_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedBy: text("updated_by"),
});

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
// Capturas en staging (Capture → Review → Production)
// ---------------------------------------------------------------------------
//
// El esquema de captura es GENÉRICO: cualquier proyecto puede usar
// `pending_captures` para que sus operarios envíen propuestas de cambio.
// Los `op_type` listados aquí son los del dominio agua; otros proyectos
// pueden añadir/quitar valores del enum sin tocar la estructura.

export const pendingCaptures = sqliteTable(
  "pending_captures",
  {
    id: text("id").primaryKey(),
    /// Valores válidos validados en aplicación (zod):
    /// capture_visit | create_medidor | update_medidor | mark_removed_medidor
    /// create_estructura | update_estructura | mark_removed_estructura
    /// create_tuberia | update_tuberia | mark_removed_tuberia
    /// report_anomaly
    opType: text("op_type").notNull(),
    /// medidor | estructura | tuberia
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    payloadJson: text("payload_json").notNull(),
    attachmentsJson: text("attachments_json"),

    operarioId: text("operario_id")
      .notNull()
      .references(() => users.id),
    rutaId: text("ruta_id"),
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

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("idx_idempotency_expires").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Catálogo de assets pesados (MBTiles, ortofotos, routing dbs)
// ---------------------------------------------------------------------------

export const dataAssets = sqliteTable(
  "data_assets",
  {
    key: text("key").primaryKey(),
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
    scope: text("scope"),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
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
// Auditoría
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    targetId: text("target_id"),
    details: text("details"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("idx_audit_user_time").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Tipos inferidos (core)
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type DemoToken = typeof demoTokens.$inferSelect;
export type PendingCapture = typeof pendingCaptures.$inferSelect;
export type NewPendingCapture = typeof pendingCaptures.$inferInsert;
export type DataAsset = typeof dataAssets.$inferSelect;
export type NewDataAsset = typeof dataAssets.$inferInsert;
