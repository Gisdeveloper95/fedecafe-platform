# Separación CORE vs DOMINIO

Este proyecto está organizado para que el día que aparezca otro cliente (médicos
de campo, geología, etc.), se pueda forkar y reemplazar **solo la capa de
dominio**, manteniendo intacta la infraestructura (auth, capturas, R2, email,
admin UI base).

No hay paquetes separados ni multi-tenant. Es disciplina de carpetas. Cuando
tengamos 3 implementaciones reales en producción, ahí sí extraeremos a
librerías compartidas (npm + pub.dev).

---

## Backend (`src/`)

### CORE — copia/pega entre proyectos

| Ruta | Qué hace |
|---|---|
| `lib/auth/*` | JWT móvil, cookie web, bcrypt, lockdown, demo tokens, principal |
| `lib/storage/r2.ts` | S3-compatible client + presign upload/download |
| `lib/email/mailer.ts` | SMTP transactional (Gmail/SES/cualquiera) |
| `lib/idempotency.ts` | Cache de respuestas por idempotency_key |
| `lib/audit.ts` | Log de auditoría |
| `lib/api/json.ts` | Helpers de response JSON |
| `lib/env.ts` | Validación de env vars con zod |
| `db/schema-core.ts` | Tablas: users, sessions, web_sessions, demo_tokens, global_settings, password_resets, pending_captures, idempotency_keys, data_assets, audit_log |
| `app/api/auth/*` | login, refresh, activate-demo, forgot-password, reset-password |
| `app/api/captures/*` | presign, post, GET, [id], approve, reject |
| `app/api/data-assets/*` | catálogo + upload-url + download |
| `app/api/admin/lockdown/*` | kill switch global |
| `app/api/demo-tokens/*` | CRUD tokens demo |
| `app/api/users/*` + `me` | gestión usuarios |
| `app/(auth)/*` | login, forgot/reset password pages |
| `app/(admin)/usuarios/` `demo-tokens/` `configuracion/` `revision/` | UI base admin |
| `app/change-password/` | self-service de password |

### DOMINIO "AGUA" — específico Fedecafe

| Ruta | Qué hace |
|---|---|
| `db/schema-water.ts` | Tablas: medidores, estructuras, rutas, ruta_items, recorridos, recorrido_puntos |
| `app/api/medidores/*` | CRUD + sync delta `?since=` |
| `app/api/estructuras/*` | CRUD + sync delta |
| `app/api/rutas/*` | CRUD rutas de trabajo + items |
| `app/api/recorridos/*` | upload GPS tracking + reportes Word |
| `app/api/sync/medidores/*` `sync/estructuras/*` | bulk sync desde rutas_builder |
| `app/(admin)/medidores/` `estructuras/` `rutas/` `recorridos/` | UI admin del dominio |

---

## Flutter (`../rutas_app/lib/`)

### CORE — copia/pega entre proyectos

| Ruta | Qué hace |
|---|---|
| `data/services/api/api_client.dart` | HTTP con auto-refresh + retry 401 |
| `data/services/api/token_store.dart` | Sesión cifrada en flutter_secure_storage |
| `data/services/api/online_auth_service.dart` | login/logout/activate-demo/change-password |
| `data/services/captures/outbox_db.dart` | Cola local SQLite |
| `data/services/captures/captures_service.dart` | Subida + bajada + cancel |
| `data/services/captures/edit_sync_bridge.dart` | Hook de modo edición → outbox |
| `data/services/gps_service.dart` | Lectura GPS |
| `data/services/track_recorder_service.dart` | Grabación de recorridos |
| `data/services/tile_cache_service.dart` + `mbtiles_tile_provider.dart` | Tiles offline |
| `presentation/providers/edit_mode_provider.dart` | State machine genérico de edición |
| `presentation/screens/login_screen.dart` | Login + activar demo |
| `presentation/screens/activate_demo_screen.dart` | Pantalla de 6 dígitos |
| `presentation/screens/change_password_screen.dart` | Self-service |
| `presentation/screens/sync_outbox_screen.dart` | UI dual-mode (subida + bajada + cancel) |

### DOMINIO "AGUA" — específico Fedecafe

| Ruta | Qué hace |
|---|---|
| `data/models/medidor.dart` `estructura.dart` `tuberia.dart` `network_*.dart` `photo_annotation.dart` | Modelos del dominio |
| `data/services/database_service.dart` (tablas water) | CRUD a SQLite local (medidores_routing, estructuras, tuberias) — los hooks `addWriteListener` son CORE pero las tablas son dominio |
| `data/services/routing_service.dart` | Algoritmo de grafo de vías |
| `data/services/field_data_export_service.dart` | Empaquetado ZIP (modo uga-uga) |
| `presentation/widgets/edit_mode_controls.dart` | Formularios específicos (3 tipos: medidor, estructura, tubería) |
| `presentation/screens/mis_rutas_screen.dart` `ruta_detalle_screen.dart` `mis_recorridos_screen.dart` | Operario consume rutas |

---

## Plan al aparecer cliente 2 (estimado)

1. **Fork** `fedecafe-platform` → `medicos-platform`
2. **Mantener intacto**: todo CORE de arriba
3. **Reemplazar**: `schema-water.ts` → `schema-medical.ts` (pacientes, visitas, etc.); endpoints del dominio; UI admin del dominio
4. **Re-skin**: colores, copy, navegación
5. **Esperado**: 3–4 semanas vs 8 desde cero. Reuso real ~60–70% backend, ~50% Flutter.

## Plan al aparecer cliente 3

Extraer CORE a librerías compartidas:
- `@fedecafe-tools/core` (npm interno) con `lib/auth/*`, `lib/storage/*`, `lib/email/*`, helpers
- `fedecafe_tools_core` (pub.dev) con `api_client`, `token_store`, `outbox`, `captures_service`, `edit_sync_bridge`

Tiempo esperado para cliente 4 en adelante: 1–2 semanas por proyecto nuevo.

---

## Anti-patrones a NO meter ahora

- ❌ `org_id` en todas las tablas (multi-tenant compartido)
- ❌ Abstracciones genéricas tipo `Entity` / `Module` / `FormField` antes de tener 2–3 dominios reales
- ❌ Diseñar APIs imaginarias para casos hipotéticos
