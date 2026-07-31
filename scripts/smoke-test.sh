#!/usr/bin/env bash
# scripts/smoke-test.sh — Smoke test end-to-end del server.
#
# Uso:
#   bash scripts/smoke-test.sh                       # server ya corriendo en :3000
#   bash scripts/smoke-test.sh --start-server        # arranca el server él mismo
#   PONTE_VIGA_START_SERVER=1 bash scripts/smoke-test.sh   # equivalente (Linux/Mac)
#
# Cubre: auth (register/login/session/set-pin/remove-pin/logout/admin),
# ownership guards, payload validation, rate limits, security headers,
# migración PIN legacy, y aislamiento entre perfiles.
set -u

# Parse args para compat cross-platform (npm scripts en Windows no soportan
# `VAR=val cmd`, así que exponemos también un flag `--start-server`).
START_SERVER="${PONTE_VIGA_START_SERVER:-0}"
for arg in "$@"; do
  if [ "$arg" = "--start-server" ]; then
    START_SERVER=1
  fi
done

BASE="${PONTE_VIGA_URL:-http://localhost:3000}"
PASS=0
FAIL=0
FAILED_TESTS=()

# ── Utilidades ────────────────────────────────────────────────────
c_pass=$'\033[32m'
c_fail=$'\033[31m'
c_dim=$'\033[90m'
c_end=$'\033[0m'

check() {
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS+1))
    printf "  %s✓%s %s\n" "$c_pass" "$c_end" "$name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name")
    printf "  %s✗%s %s\n     %sexpected substring:%s %s\n     %sgot:%s %s\n" \
      "$c_fail" "$c_end" "$name" "$c_dim" "$c_end" "$expected" "$c_dim" "$c_end" "${actual:0:120}"
  fi
}

check_http() {
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1))
    printf "  %s✓%s %s (HTTP %s)\n" "$c_pass" "$c_end" "$name" "$actual"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name")
    printf "  %s✗%s %s (expected HTTP %s, got %s)\n" "$c_fail" "$c_end" "$name" "$expected" "$actual"
  fi
}

extract_token() {
  echo "$1" | grep -oE '"token":"[a-f0-9]+' | cut -d'"' -f4
}

# ── Setup opcional: arrancar server ───────────────────────────────
SERVER_PID=""
if [[ "$START_SERVER" == "1" ]]; then
  echo "→ Arrancando server..."
  rm -f "$(dirname "$0")/../data-files"/*.json 2>/dev/null
  (cd "$(dirname "$0")/.." && node server.js > /tmp/pv-smoke.log 2>&1) &
  SERVER_PID=$!
  sleep 2
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
fi

# ── Verificar server responde ────────────────────────────────────
if ! curl -s -f "$BASE/healthz" > /dev/null; then
  echo "${c_fail}✗ Server no responde en $BASE${c_end}"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Smoke test contra $BASE"
echo "════════════════════════════════════════════════════════════════"

# ─── Grupo 1: infraestructura ────────────────────────────────────
echo ""
echo "━━ Infraestructura ━━"
check_http "healthz responde 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/healthz")" "200"
check "healthz reporta backend OK" \
  "$(curl -s "$BASE/healthz")" '"backendOk":true'
check_http "manifest.webmanifest 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/manifest.webmanifest")" "200"
check_http "index.html 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/index.html")" "200"
check_http "/admin SPA route 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")" "200"

# ─── Grupo 2: seguridad headers ──────────────────────────────────
echo ""
echo "━━ Security headers ━━"
HEADERS="$(curl -sI "$BASE/index.html")"
check "CSP present" "$HEADERS" "Content-Security-Policy"
check "X-Frame-Options DENY" "$HEADERS" "X-Frame-Options: DENY"
check "X-Content-Type-Options nosniff" "$HEADERS" "X-Content-Type-Options: nosniff"
check "Referrer-Policy" "$HEADERS" "Referrer-Policy:"
check "Permissions-Policy" "$HEADERS" "Permissions-Policy:"

# CORS: evil.com no debe recibir headers
CORS_HEADERS="$(curl -sI "$BASE/data/profiles.json" -H "Origin: https://evil.com" | grep -i 'access-control' || echo '(none)')"
check "CORS bloqueado por defecto" "$CORS_HEADERS" "(none)"

OPTIONS_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/data/anything.json" -H 'Origin: https://evil.com' -H 'Access-Control-Request-Method: PUT')"
check_http "OPTIONS preflight de evil → 403" "$OPTIONS_CODE" "403"

# ─── Grupo 3: register + login ───────────────────────────────────
echo ""
echo "━━ Auth: register + login ━━"
R="$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"name":"smoke_alice","emoji":"A","color":"#111","pin":"1234"}')"
check "register alice OK" "$R" '"token"'
ATOK="$(extract_token "$R")"

R="$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"name":"smoke_bob","emoji":"B","color":"#222"}')"
check "register bob (sin PIN) OK" "$R" '"token"'

check "register alice de nuevo con PIN → 409 profile_exists_with_pin" \
  "$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"5555"}')" \
  "profile_exists_with_pin"

check "register bob (sin PIN existente) con PIN → 409 profile_exists_use_login" \
  "$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"name":"smoke_bob","pin":"5555"}')" \
  "profile_exists_use_login"

check "register nombre inválido → 400" \
  "$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"name":"a","pin":"1234"}')" \
  "invalid_name"

check "register PIN corto → 400" \
  "$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"name":"testx","pin":"12"}')" \
  "invalid_pin"

check "login alice sin PIN → pin_required" \
  "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice"}')" \
  "pin_required"

check "login alice PIN incorrecto → invalid_credentials" \
  "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"0000"}')" \
  "invalid_credentials"

R="$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"1234"}')"
check "login alice OK" "$R" '"token"'
ATOK="$(extract_token "$R")"

check "session válida con token" \
  "$(curl -s "$BASE/api/auth/session" -H "Authorization: Bearer $ATOK")" \
  '"profileName":"smoke_alice"'

check "session con token inválido → expired" \
  "$(curl -s "$BASE/api/auth/session" -H "Authorization: Bearer INVALIDTOKEN")" \
  "expired"

# ─── Grupo 4: ownership guards ───────────────────────────────────
echo ""
echo "━━ Ownership guards ━━"
BTOK="$(extract_token "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_bob"}')")"

check "PUT alice_sessions con token alice OK" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"2026-08-01":[{"sessionId":"s1","date":"2026-08-01"}]}')" \
  '"success":true'

check "PUT bob_sessions con token alice → wrong_profile" \
  "$(curl -s -X PUT "$BASE/data/smoke_bob_sessions.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{}')" \
  "wrong_profile"

check "PUT sin token → unauthorized" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H 'Content-Type: application/json' -d '{}')" \
  "unauthorized"

check "PUT groups como user → admin_required" \
  "$(curl -s -X PUT "$BASE/data/groups.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{}')" \
  "admin_required"

check "PUT profiles añadiendo maliciously → cannot_modify_other_profiles" \
  "$(curl -s -X PUT "$BASE/data/profiles.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' \
    -d '[{"name":"smoke_alice","emoji":"A"},{"name":"smoke_bob","emoji":"B"},{"name":"evil","emoji":"X"}]')" \
  "cannot_modify_other_profiles"

# ─── Grupo 5: payload validation ─────────────────────────────────
echo ""
echo "━━ Payload validation ━━"
check "PUT sessions con array (esperado object) → invalid_payload" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '[]')" \
  "invalid_payload"

check "PUT measures con object (esperado array) → invalid_payload" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_measures.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{}')" \
  "invalid_payload"

check "PUT measures sin date field → invalid_payload" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_measures.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '[{"peso":80}]')" \
  "invalid_payload"

check "PUT JSON malformado → invalid_json (no 500)" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{broken')" \
  "invalid_json"

check "PUT JSON null → invalid_json" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d 'null')" \
  "invalid_json"

check_http "GET clave con espacios → 400" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/alice%20sessions.json")" "400"

# ─── Grupo 6: leak de PIN hashes ─────────────────────────────────
echo ""
echo "━━ Sensitive fields ━━"
PROFILES_RESP="$(curl -s "$BASE/data/profiles.json")"
if [[ "$PROFILES_RESP" == *"pinHash"* || "$PROFILES_RESP" == *"pinSalt"* ]]; then
  FAIL=$((FAIL+1)); FAILED_TESTS+=("GET profiles NO debe leakear pinHash/pinSalt")
  printf "  %s✗%s GET profiles leakea pinHash!\n" "$c_fail" "$c_end"
else
  PASS=$((PASS+1))
  printf "  %s✓%s GET profiles no leakea campos sensibles\n" "$c_pass" "$c_end"
fi
check "GET profiles incluye hasPin" "$PROFILES_RESP" '"hasPin"'

# ─── Grupo 7: set-pin / remove-pin ───────────────────────────────
echo ""
echo "━━ set-pin / remove-pin ━━"
check "set-pin con currentPin correcto OK" \
  "$(curl -s -X POST "$BASE/api/auth/set-pin" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"currentPin":"1234","newPin":"5678"}')" \
  '"ok":true'

check "login con nuevo PIN" \
  "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"5678"}')" \
  '"token"'

check "login con PIN viejo → invalid_credentials" \
  "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"1234"}')" \
  "invalid_credentials"

ATOK="$(extract_token "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice","pin":"5678"}')")"

check "set-pin con currentPin incorrecto → current_pin_invalid" \
  "$(curl -s -X POST "$BASE/api/auth/set-pin" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"currentPin":"0000","newPin":"1111"}')" \
  "current_pin_invalid"

check "set-pin con newPin no numérico → invalid_new_pin" \
  "$(curl -s -X POST "$BASE/api/auth/set-pin" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"currentPin":"5678","newPin":"abcd"}')" \
  "invalid_new_pin"

check "remove-pin OK" \
  "$(curl -s -X POST "$BASE/api/auth/remove-pin" -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"currentPin":"5678"}')" \
  '"ok":true'

check "login sin PIN post remove-pin" \
  "$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"smoke_alice"}')" \
  '"token"'

# ─── Grupo 8: rate limiting ──────────────────────────────────────
echo ""
echo "━━ Rate limits ━━"
LAST_CODE=""
for i in 1 2 3 4 5 6; do
  LAST_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"name":"nonexistent_smoke","pin":"0000"}')"
done
check_http "6º login fallido → 429" "$LAST_CODE" "429"

# ─── Grupo 9: admin ──────────────────────────────────────────────
echo ""
echo "━━ Admin ━━"
R="$(curl -s -X POST "$BASE/api/auth/admin" -H 'Content-Type: application/json' -d '{"pin":"1236"}')"
check "admin login OK (default 1236)" "$R" '"isAdmin":true'
ADMTOK="$(extract_token "$R")"

check "admin puede PUT groups" \
  "$(curl -s -X PUT "$BASE/data/groups.json" -H "Authorization: Bearer $ADMTOK" -H 'Content-Type: application/json' -d '{"#smoke":{"name":"Smoke","members":["smoke_alice"]}}')" \
  '"success":true'

check "admin puede PUT alice_sessions (bypass ownership)" \
  "$(curl -s -X PUT "$BASE/data/smoke_alice_sessions.json" -H "Authorization: Bearer $ADMTOK" -H 'Content-Type: application/json' -d '{}')" \
  '"success":true'

check "admin PIN incorrecto → invalid_credentials" \
  "$(curl -s -X POST "$BASE/api/auth/admin" -H 'Content-Type: application/json' -d '{"pin":"0000"}')" \
  "invalid_credentials"

check "logout invalida token" \
  "$(curl -s -X POST "$BASE/api/auth/logout" -H "Authorization: Bearer $ADMTOK")" \
  '"ok":true'

check "session con token loggeado-out → expired" \
  "$(curl -s "$BASE/api/auth/session" -H "Authorization: Bearer $ADMTOK")" \
  "expired"

# ─── Grupo 10: AI coach ──────────────────────────────────────────
echo ""
echo "━━ AI Coach ━━"
check "AI coach fallback rules cuando sin API key" \
  "$(curl -s -X POST "$BASE/api/ai/coach" -H 'Content-Type: application/json' -d '{"streak":3}')" \
  '"source":"rules"'

# ─── Resumen ──────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ${c_pass}Pass: $PASS${c_end}    ${c_fail}Fail: $FAIL${c_end}"
echo "════════════════════════════════════════════════════════════════"
if [ $FAIL -gt 0 ]; then
  echo "Fallidos:"
  for t in "${FAILED_TESTS[@]}"; do
    echo "  - $t"
  done
  exit 1
fi
echo "  ${c_pass}All good.${c_end}"
exit 0
