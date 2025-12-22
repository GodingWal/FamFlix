#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-http://localhost:5000}
COOKIES="${COOKIES:-/tmp/ff-cookies.txt}"
CONDA_BIN="${CONDA_BIN:-$HOME/miniconda3/bin/conda}"
PY_ENV="${PY_ENV:-voice-clone}"
PROMPT_WAV="temp/cb-prompt.wav"
NAME_PREFIX="HTTP Chatter Voice"
PASS="password123"
TS=$(date +%s)
EMAIL="cbhttp+$TS@local.test"
USERNAME="cbhttp_$TS"

jq_present() {
  command -v jq >/dev/null 2>&1
}

parse_json() {
  # $1: file, $2: jq filter
  if jq_present; then
    jq -r "$2" "$1"
  else
    python3 - "$1" "$2" <<'PY'
import json,sys
path = sys.argv[1]
flt = sys.argv[2]
with open(path) as f:
  j=json.load(f)
# extremely small parser: support .field and .a.b only
if flt.startswith('.'):
  parts = [p for p in flt.split('.') if p]
  v=j
  for p in parts:
    v = v.get(p)
  if v is None:
    print("")
  else:
    print(v)
else:
  print("")
PY
  fi
}

step() { echo; echo "==== $* ===="; }

step "0) Ensure long prompt WAV"
mkdir -p temp
if [ ! -f "$PROMPT_WAV" ]; then
  echo "Generating prompt via CLI (CPU)..."
  # Placeholder for future CLI-based TTS validation
  echo "Skipping legacy CLI invocation; ensure F5/RVC services are reachable."
    --text "This is a longer sample for Chatterbox. We will speak for several seconds to exceed the required minimum length. The sample continues." \
    --out "$PROMPT_WAV" \
    --device cpu \
    > /tmp/cb_cli.json || true
fi
ls -lh "$PROMPT_WAV"

step "1) Fetch CSRF token"
rm -f "$COOKIES"
curl -sS -c "$COOKIES" "$HOST/api/csrf-token" -o /tmp/csrf.json
CSRF=$(parse_json /tmp/csrf.json '.csrfToken' || true)
echo "CSRF=$CSRF"

step "2) Register user"
curl -sS -b "$COOKIES" -c "$COOKIES" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\"}" \
  "$HOST/api/auth/register" -o /tmp/register.json
cat /tmp/register.json

step "3) Login"
curl -sS -b "$COOKIES" -c "$COOKIES" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$HOST/api/auth/login" -o /tmp/login.json
cat /tmp/login.json

step "4) Verify session (/api/auth/me)"
curl -sS -b "$COOKIES" "$HOST/api/auth/me" -o /tmp/me.json
cat /tmp/me.json

step "5) Create voice profile (multipart)"
NAME="$NAME_PREFIX $TS"
curl -sS -b "$COOKIES" -c "$COOKIES" -H "X-CSRF-Token: $CSRF" \
  -F "name=$NAME" -F "audio=@$PROMPT_WAV;type=audio/wav" \
  "$HOST/api/voice-profiles" -o /tmp/profile.json
cat /tmp/profile.json
PROFILE_ID=$(parse_json /tmp/profile.json '.id')
echo "PROFILE_ID=$PROFILE_ID"
if [ -z "$PROFILE_ID" ]; then echo "Profile creation failed"; exit 1; fi

step "6) Preview voice profile"
curl -sS -b "$COOKIES" -H "Content-Type: application/json" -d '{"targetSeconds": 8}' \
  "$HOST/api/voice-profiles/$PROFILE_ID/preview" -o /tmp/preview.json
head -c 800 /tmp/preview.json; echo
AUDIO_URL=$(parse_json /tmp/preview.json '.generation.audioUrl' || true)
echo "AUDIO_URL=$AUDIO_URL"

step "7) Download audio if available"
if [ -n "$AUDIO_URL" ]; then
  curl -sS -b "$COOKIES" -o temp/http-preview.wav "$HOST$AUDIO_URL"
  ls -lh temp/http-preview.wav
else
  echo "No audioUrl returned; TTS may have failed for preview."
fi

step "DONE"
