# fedecafe-platform

Plataforma web de administracion y seguimiento para la suite GIS de la
Federacion Nacional de Cafeteros (Quindio). Backend + panel admin + API
consumida por la app movil `rutas_app` (Flutter) y la herramienta de
administracion de datos `rutas_builder` (Python / PySide6).

## Stack

- **Frontend + API**: [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- **Base de datos**: [Turso](https://turso.tech) (SQLite distribuido, edge)
- **ORM**: [Drizzle](https://orm.drizzle.team)
- **Auth**: sesion cookie httpOnly (web) + JWT access/refresh (mobile)
- **Docx server-side**: [docx](https://docx.js.org/) para generar reportes de
  recorridos
- **Hosting**: [Vercel](https://vercel.com)

## Arquitectura de auth

| Canal | Mecanismo | TTL |
|---|---|---|
| Web (admin) | Cookie httpOnly + sesion en `web_sessions` | 30 dias |
| Mobile (operario) | JWT access + refresh con rotacion | 1 h / 180 d |

Las dos capas comparten la misma tabla `users`. Los operarios usan la app
movil con refresh token persistido en `flutter_secure_storage`; pueden abrir
sesion en campo sin internet mientras el refresh siga vigente.

## Modelo de datos

10 tablas principales:

- `users`, `sessions` (mobile), `web_sessions`, `audit_log`
- `medidores` (PK `contrato`), `estructuras` (PK `codigo`)
- `rutas`, `ruta_items`
- `recorridos`, `recorrido_puntos`

## Endpoints principales

```
POST /api/auth/login              (web y mobile)
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/me

GET/POST/PATCH/DELETE /api/users            (admin)
POST /api/users/:id/password                 (self o admin)

POST /api/sync/medidores                     (admin, bulk upsert desde rutas_builder)
POST /api/sync/estructuras
GET  /api/medidores
GET  /api/estructuras

GET/POST       /api/rutas                    (admin crea, operario lee sus rutas)
GET/PATCH/DEL  /api/rutas/:id
PATCH          /api/rutas/:id/items/:codigo  (marcar visitado)

GET/POST       /api/recorridos               (operario sube tracking)
GET            /api/recorridos/:id
GET            /api/recorridos/:id/reporte   (descarga Word server-side)
```

## Variables de entorno

Ver [`.env.example`](./.env.example). En produccion viven en Vercel Project
Settings.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellenar con creds Turso
npx drizzle-kit push --force # aplica schema
npx tsx scripts/seed-admin.ts # crea admin/admin123
npm run dev
```

## Smoke tests

Contra el servidor corriendo (local o Vercel):

```bash
BASE=http://localhost:3000 bash scripts/smoke-test.sh   # 18 checks API
BASE=http://localhost:3000 bash scripts/smoke-ui.sh     # 13 checks UI
```

## Deploy

- **URL prod**: https://fedecafe-platform.vercel.app
- Deploy automatico en cada push a `main`
- Conectado al repositorio [Gisdeveloper95/fedecafe-platform](https://github.com/Gisdeveloper95/fedecafe-platform)

## Apps relacionadas

- [`rutas_app`](../rutas_app): app movil Flutter (Android + Windows desktop)
  consume esta API.
- [`rutas_builder`](../rutas_builder): herramienta Python de preparacion de
  datos GIS; tiene item de menu `Archivo > Sincronizar con la web` que POSTea
  medidores/estructuras a `/api/sync/*`.
- [`compilador_apks`](../compilador_apks): GUI PyQt6 para compilar APK/EXE
  inyectando `API_BASE` como `--dart-define`.
