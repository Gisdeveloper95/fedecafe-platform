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

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role", { enum: ["admin", "operario"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    createdBy: text("created_by"),
    lastLoginAt: text("last_login_at"),
  },
  (t) => [index("idx_users_username").on(t.username)],
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
export type Medidor = typeof medidores.$inferSelect;
export type Estructura = typeof estructuras.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type RutaItem = typeof rutaItems.$inferSelect;
export type Recorrido = typeof recorridos.$inferSelect;
export type RecorridoPunto = typeof recorridoPuntos.$inferSelect;
