#!/usr/bin/env bash
# Smoke test completo: ejercita todos los endpoints contra el dev server local.
# Sale con codigo != 0 al primer fallo.
set -e
set -o pipefail

BASE="${BASE:-http://localhost:3000}"
TMP="$(mktemp -d)"
trap "rm -rf $TMP" EXIT

fail() { echo "❌ $1" >&2; exit 1; }
ok()   { echo "✓  $1"; }

# JSON extraction sin jq: usa node
jget() {
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const path='$1'.split('.');let v=d;for(const p of path){v=v?.[p]}console.log(v??'')"
}

echo "== 1. Health check =="
curl -sS "$BASE/" >/dev/null || fail "Server no responde en $BASE"
ok "Server up en $BASE"

echo
echo "== 2. Login admin (mobile mode) =="
LOGIN=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"admin123","mobile":true,"deviceFingerprint":"smoke-device","deviceName":"smoke"}')
echo "$LOGIN" > "$TMP/login.json"
ACCESS=$(cat "$TMP/login.json" | jget "accessToken")
REFRESH=$(cat "$TMP/login.json" | jget "refreshToken")
ADMIN_ID=$(cat "$TMP/login.json" | jget "user.id")
[ -n "$ACCESS" ] || fail "No hubo accessToken"
[ -n "$REFRESH" ] || fail "No hubo refreshToken"
[ -n "$ADMIN_ID" ] || fail "No hubo admin id"
ok "Login admin ok. access=${ACCESS:0:20}... admin_id=$ADMIN_ID"

AUTH="-H authorization:Bearer $ACCESS"

echo
echo "== 3. GET /api/me (mobile) =="
ME=$(curl -sS "$BASE/api/me" -H "authorization: Bearer $ACCESS")
ROLE=$(echo "$ME" | jget "user.role")
[ "$ROLE" = "admin" ] || fail "Esperaba role=admin, obtuve role=$ROLE"
ok "/api/me funciona (role=$ROLE)"

echo
echo "== 4. POST /api/auth/refresh =="
R=$(curl -sS -X POST "$BASE/api/auth/refresh" \
  -H "content-type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}")
NEW_ACCESS=$(echo "$R" | jget "accessToken")
[ -n "$NEW_ACCESS" ] || fail "Refresh fallo: $R"
ok "Refresh rotation ok"
ACCESS="$NEW_ACCESS"

echo
echo "== 5. Crear operario =="
CREATE=$(curl -sS -X POST "$BASE/api/users" \
  -H "authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d '{"username":"pedro.test","password":"pedro123","fullName":"Pedro Smoke","role":"operario"}')
OP_ID=$(echo "$CREATE" | jget "user.id")
[ -n "$OP_ID" ] || fail "No se creo operario: $CREATE"
ok "Operario creado id=$OP_ID"

echo
echo "== 6. Listar usuarios =="
LIST=$(curl -sS "$BASE/api/users" -H "authorization: Bearer $ACCESS")
COUNT=$(echo "$LIST" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).users.length)")
[ "$COUNT" -ge "2" ] || fail "Esperaba >=2 users, obtuve $COUNT"
ok "Listado de users ok ($COUNT usuarios)"

echo
echo "== 7. Sincronizar medidores (upsert) =="
SYNC=$(curl -sS -X POST "$BASE/api/sync/medidores" \
  -H "authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d '{"items":[
    {"contrato":"CTR-001","latitude":4.5361,"longitude":-75.8098,"nombre":"Medidor 1","municipio":"La Tebaida"},
    {"contrato":"CTR-002","latitude":4.5401,"longitude":-75.8120,"nombre":"Medidor 2","municipio":"La Tebaida"},
    {"contrato":"CTR-003","latitude":4.5450,"longitude":-75.8200,"nombre":"Medidor 3","municipio":"Armenia"}
  ]}')
PROCESSED=$(echo "$SYNC" | jget "processed")
[ "$PROCESSED" = "3" ] || fail "Esperaba processed=3, obtuve: $SYNC"
ok "Sync medidores upsert ok (processed=$PROCESSED)"

echo
echo "== 8. Sincronizar estructuras (upsert) =="
curl -sS -X POST "$BASE/api/sync/estructuras" \
  -H "authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d '{"items":[
    {"codigo":"BOC-001","layerName":"Bocatomas","latitude":4.53,"longitude":-75.81,"nombre":"Bocatoma 1","municipio":"La Tebaida"},
    {"codigo":"TNK-001","layerName":"Tanques","latitude":4.54,"longitude":-75.82,"nombre":"Tanque A"}
  ]}' | grep -q '"processed":2' || fail "Sync estructuras fallo"
ok "Sync estructuras ok"

echo
echo "== 9. Buscar medidores =="
SEARCH=$(curl -sS "$BASE/api/medidores?q=CTR" -H "authorization: Bearer $ACCESS")
TOTAL=$(echo "$SEARCH" | jget "totalInDb")
[ "$TOTAL" = "3" ] || fail "Esperaba total 3, obtuve $SEARCH"
ok "Busqueda medidores ok (total=$TOTAL)"

echo
echo "== 10. Crear ruta =="
RUTA=$(curl -sS -X POST "$BASE/api/rutas" \
  -H "authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d "{\"nombre\":\"Ruta smoke\",\"tipo\":\"medidores\",\"operarioId\":\"$OP_ID\",\"codigos\":[\"CTR-001\",\"CTR-002\",\"CTR-999\"]}")
RUTA_ID=$(echo "$RUTA" | jget "ruta.id")
MISSING=$(echo "$RUTA" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).missingCodes.length)")
[ -n "$RUTA_ID" ] || fail "No se creo ruta: $RUTA"
[ "$MISSING" = "1" ] || fail "Esperaba 1 missing (CTR-999), obtuve $MISSING"
ok "Ruta creada id=$RUTA_ID, missing=$MISSING"

echo
echo "== 11. Login operario =="
OP_LOGIN=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "content-type: application/json" \
  -d '{"username":"pedro.test","password":"pedro123","mobile":true,"deviceFingerprint":"pedro-phone"}')
OP_ACCESS=$(echo "$OP_LOGIN" | jget "accessToken")
[ -n "$OP_ACCESS" ] || fail "Login operario fallo: $OP_LOGIN"
ok "Login operario ok"

echo
echo "== 12. Operario lista sus rutas =="
MIS_RUTAS=$(curl -sS "$BASE/api/rutas" -H "authorization: Bearer $OP_ACCESS")
MIS_COUNT=$(echo "$MIS_RUTAS" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).rutas.length)")
[ "$MIS_COUNT" = "1" ] || fail "Esperaba 1 ruta para el operario, obtuve $MIS_COUNT"
ok "Operario ve 1 ruta asignada"

echo
echo "== 13. Detalle de ruta con coords =="
DET=$(curl -sS "$BASE/api/rutas/$RUTA_ID" -H "authorization: Bearer $OP_ACCESS")
ITEMS_COUNT=$(echo "$DET" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).items.length)")
[ "$ITEMS_COUNT" = "3" ] || fail "Esperaba 3 items en ruta, obtuve $ITEMS_COUNT"
ok "Detalle de ruta ok ($ITEMS_COUNT items)"

echo
echo "== 14. Marcar item visitado =="
MARK=$(curl -sS -X PATCH "$BASE/api/rutas/$RUTA_ID/items/CTR-001" \
  -H "authorization: Bearer $OP_ACCESS" \
  -H "content-type: application/json" \
  -d '{"visitado":true}')
echo "$MARK" | grep -q '"ok":true' || fail "Mark visitado fallo: $MARK"
ok "Item marcado como visitado"

echo
echo "== 15. Subir recorrido =="
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EARLIER=$(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ")
REC=$(curl -sS -X POST "$BASE/api/recorridos" \
  -H "authorization: Bearer $OP_ACCESS" \
  -H "content-type: application/json" \
  -d "{
    \"rutaId\":\"$RUTA_ID\",
    \"iniciadoAt\":\"$EARLIER\",
    \"finalizadoAt\":\"$NOW\",
    \"distanciaTotalM\":1234.5,
    \"duracionSegundos\":3600,
    \"puntos\":[
      {\"timestamp\":\"$EARLIER\",\"latitude\":4.5361,\"longitude\":-75.8098,\"precisionM\":5,\"bateriaPct\":85},
      {\"timestamp\":\"$NOW\",\"latitude\":4.5401,\"longitude\":-75.8120,\"precisionM\":7,\"bateriaPct\":78}
    ]
  }")
REC_ID=$(echo "$REC" | jget "recorrido.id")
[ -n "$REC_ID" ] || fail "Subida de recorrido fallo: $REC"
ok "Recorrido subido id=$REC_ID"

echo
echo "== 16. Descargar reporte Word =="
curl -sS "$BASE/api/recorridos/$REC_ID/reporte" \
  -H "authorization: Bearer $OP_ACCESS" \
  -o "$TMP/reporte.docx"
SIZE=$(wc -c < "$TMP/reporte.docx")
[ "$SIZE" -gt "1000" ] || fail "Reporte Word muy pequeno ($SIZE bytes), fallo"
# Verificar que es un ZIP valido (docx es un ZIP con .xml dentro)
head -c 2 "$TMP/reporte.docx" | od -c | head -1 | grep -q "P   K" || fail "Reporte no parece un DOCX valido"
ok "Reporte Word generado ok ($SIZE bytes, firma PK valida)"

echo
echo "== 17. Desactivar operario (soft delete) =="
DEL=$(curl -sS -X DELETE "$BASE/api/users/$OP_ID" -H "authorization: Bearer $ACCESS")
echo "$DEL" | grep -q '"ok":true' || fail "DELETE user fallo: $DEL"
# Verificar que su token viejo ya no funciona (sesion revocada)
AFTER_DEACT=$(curl -sS "$BASE/api/me" -H "authorization: Bearer $OP_ACCESS")
echo "$AFTER_DEACT" | grep -q '"user_inactive"\|"unauthenticated"\|"invalid_token"' || fail "Token deberia fallar tras desactivar: $AFTER_DEACT"
ok "Desactivacion + revocacion de token ok"

echo
echo "== 18. Limpieza (eliminar ruta de prueba) =="
curl -sS -X DELETE "$BASE/api/rutas/$RUTA_ID" -H "authorization: Bearer $ACCESS" > /dev/null
ok "Ruta eliminada"

echo
echo "==================================="
echo "  ✓ TODOS LOS SMOKE TESTS PASARON"
echo "==================================="
