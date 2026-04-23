#!/usr/bin/env bash
# Smoke test de UI: login via cookie + carga de paginas + verificacion de contenido.
set -e
set -o pipefail

BASE="${BASE:-http://localhost:3000}"
TMP="$(mktemp -d)"
COOKIES="$TMP/cookies.txt"
trap "rm -rf $TMP" EXIT

fail() { echo "❌ $1" >&2; exit 1; }
ok()   { echo "✓  $1"; }

check_has() {
  local url="$1"; local needle="$2"; local name="$3"
  local out="$TMP/$(echo $name | tr ' /' '__').html"
  local http_code
  http_code=$(curl -sS -b "$COOKIES" -c "$COOKIES" -o "$out" -w "%{http_code}" "$BASE$url")
  if [ "$http_code" -ge "400" ]; then
    cat "$out" | head -50 >&2
    fail "$name: HTTP $http_code en $url"
  fi
  # Si el servidor redirige a login pero deberia estar logueado, falla.
  # Detectamos la pagina de login por su subtitulo unico.
  if grep -q "Administracion y seguimiento" "$out" && [ "$name" != "login" ] && [ "$name" != "redirect" ]; then
    fail "$name: fue redirigido a login (sesion perdida?)"
  fi
  if ! grep -q "$needle" "$out"; then
    echo "  ---- excerpt ----" >&2
    grep -oE ".{0,200}$(echo $needle | head -c 20).{0,200}" "$out" | head -3 >&2 || echo "(no hay pista)" >&2
    fail "$name: no contiene '$needle' en $url"
  fi
  ok "$name: $url OK ($(wc -c < $out) bytes)"
}

echo "== 1. Login via web =="
HTTP=$(curl -sS -c "$COOKIES" -X POST "$BASE/api/auth/login" \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -o "$TMP/login.json" -w "%{http_code}")
[ "$HTTP" = "200" ] || { cat "$TMP/login.json"; fail "Login fallo: HTTP $HTTP"; }
grep -q "fedecafe_session" "$COOKIES" || fail "No se guardo cookie de sesion"
ok "Login ok. Cookie guardada."

echo
echo "== 2. GET / -> redirect a /dashboard =="
HTTP=$(curl -sS -b "$COOKIES" -c "$COOKIES" -o "$TMP/root.html" -w "%{http_code}" -L "$BASE/")
[ "$HTTP" = "200" ] || fail "Home HTTP $HTTP"
grep -q "Dashboard" "$TMP/root.html" || fail "Home no llevo a dashboard"
ok "/ -> /dashboard OK"

echo
echo "== 3. Paginas admin =="
check_has "/dashboard" "Dashboard" "dashboard"
check_has "/dashboard" "Usuarios activos" "dashboard-stats"
check_has "/usuarios" "Usuarios" "usuarios"
check_has "/usuarios/nuevo" "Crear usuario" "usuarios-nuevo"
check_has "/medidores" "Medidores" "medidores"
check_has "/estructuras" "Estructuras" "estructuras"
check_has "/rutas" "Rutas" "rutas"
check_has "/rutas/nueva" "Crear ruta" "rutas-nueva"
check_has "/recorridos" "Recorridos" "recorridos"

echo
echo "== 4. GET /login sin sesion =="
rm -f "$COOKIES"
check_has "/login" "Administracion y seguimiento" "login"

echo
echo "== 5. Acceso directo a /dashboard sin sesion =="
HTTP=$(curl -sS -o "$TMP/redirect.html" -w "%{http_code}" "$BASE/dashboard")
# Puede ser redirect (307) o contenido del login tras redirect
if [ "$HTTP" = "200" ]; then
  grep -q "Administracion y seguimiento" "$TMP/redirect.html" || fail "Dashboard sin sesion deberia redirigir a login"
  ok "Dashboard sin sesion -> redirect a login (HTTP 200 con HTML de login)"
else
  [ "$HTTP" = "307" ] || [ "$HTTP" = "302" ] || fail "Esperaba redirect, fue HTTP $HTTP"
  ok "Dashboard sin sesion -> redirect (HTTP $HTTP)"
fi

echo
echo "========================================="
echo "  ✓ TODAS LAS PAGINAS UI FUNCIONAN"
echo "========================================="
