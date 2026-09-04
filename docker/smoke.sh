#!/bin/sh
# Probe a built pr-radar image the way a user meets it: over HTTP, from outside,
# and from inside via the image's own HEALTHCHECK.
#
# The inside/outside split is the point. An earlier version of this check only
# curled the published port, which passes even when the container reports
# `unhealthy` — the HEALTHCHECK asked for `http://localhost/`, busybox wget
# resolved that to ::1 first, and nginx's `listen 80` binds IPv4 only. Checking
# only the path you already trust proves nothing about the one you don't.
#
# Usage: docker/smoke.sh [image-tag] [host-port]
set -eu

IMAGE=${1:-pr-radar:smoke}
PORT=${2:-8088}
NAME=pr-radar-smoke-$$
ALT=pr-radar-smoke-noipv6-$$
BASE=http://localhost:$PORT
failures=0

cleanup() { docker rm -f "$NAME" "$ALT" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

pass() { printf '  ok    %s\n' "$1"; }
skip() { printf '  skip  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi; }

# HTTP header names are case-insensitive, and HTTP/2 sends them lowercased, so
# matching has to fold case. awk's IGNORECASE is a gawk extension that BSD awk
# silently ignores -- these checks once passed only because the casing happened
# to line up.
header() {
  curl -sI "$1" | tr -d '\r' \
    | awk -v k="$2" 'tolower(substr($0, 1, length(k) + 1)) == tolower(k) ":" {
        print substr($0, length(k) + 3)
      }'
}

# Poll rather than sleep a fixed span: the interval is overridden per container,
# so a fixed wait would be either wrong or wasteful.
await_health() {
  _n=0
  _s=$(docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing)
  while [ "$_s" = starting ] && [ "$_n" -lt 40 ]; do
    sleep 1
    _n=$((_n + 1))
    _s=$(docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing)
  done
  echo "$_s"
}

printf '\nSmoke-testing %s\n\n' "$IMAGE"

# The health interval is shortened so the run takes seconds rather than minutes.
# The command being tested is still the one baked into the image.
docker run -d --name "$NAME" -p "$PORT:80" \
  --health-interval=2s --health-retries=3 --health-start-period=0s \
  "$IMAGE" >/dev/null

i=0
while [ "$i" -lt 30 ]; do
  curl -sf "$BASE/" -o /dev/null && break
  i=$((i + 1))
  sleep 1
done

echo 'Serving'
body=$(curl -sf "$BASE/" || true)
case $body in *'PR Radar'*) pass 'index.html is the app' ;; *) fail 'index.html is the app' ;; esac

# Vite rewrites the entry paths at build time; PR_RADAR_BASE=/ must have applied,
# or every asset 404s behind a path that only exists on GitHub Pages.
asset=$(printf '%s' "$body" | grep -o '/assets/[^"]*\.js' | head -1)
case $asset in
  /assets/*) pass "entry script is root-relative ($asset)" ;;
  *) fail "entry script is root-relative (got '${asset:-none}')" ;;
esac
check 'entry script is served' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")" '200'

echo 'Caching'
check 'assets are immutable' \
  "$(curl -sI "$BASE$asset" | tr -d '\r' | awk -F': ' '/^[Cc]ache-[Cc]ontrol/ {print $2}')" \
  'public, max-age=31536000, immutable'
check 'index.html is not cached' \
  "$(curl -sI "$BASE/" | tr -d '\r' | awk -F': ' '/^[Cc]ache-[Cc]ontrol/ {print $2}')" \
  'no-cache'

echo 'Routing'
check 'unknown route falls back to the app' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/a/deep/route")" '200'
# The fallback must not swallow missing assets, or a bad build looks healthy
# while serving HTML in place of every script.
check 'missing asset 404s rather than falling back' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/does-not-exist.js")" '404'

echo 'Progressive web app'
# A manifest served as the wrong type is ignored, and the only symptom is an
# install prompt that never appears.
check 'the manifest has the right content type' \
  "$(header "$BASE/manifest.webmanifest" 'Content-Type' | cut -d';' -f1 | tr -d ' ')" \
  'application/manifest+json'
check 'the service worker is served' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/sw.js")" '200'
# A cached service worker is a service worker that can never be replaced.
check 'the service worker is not cached' \
  "$(header "$BASE/sw.js" 'Cache-Control')" 'no-cache'
# Read the icon list out of the manifest rather than keeping a copy of it here.
# A hardcoded list passes happily after an icon is renamed and the manifest still
# points at the old name -- which is the failure worth catching.
icons=$(curl -s "$BASE/manifest.webmanifest" | tr ',' '\n' | sed -n 's/.*"src"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$icons" ]; then
  fail 'the manifest names at least one icon'
else
  for icon in $icons; do
    check "manifest icon $icon is served" \
      "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/${icon#/}")" '200'
  done
fi
check 'the apple touch icon is served' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/icons/apple-touch-icon.png")" '200'

echo 'Signing in'
# The container relays two OAuth requests so a GitHub account can be used
# instead of a pasted token. Everything about *what* it relays is compared
# against the CLI in tests/node/conformance.test.js; these are the two things
# only the image can answer: that the JavaScript module actually loaded, and
# that an unconfigured container says so rather than offering a broken button.
check 'no GitHub App configured means no sign-in offered' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/auth/config")" '404'
check 'and it says so as JSON, not as the app' \
  "$(curl -s "$BASE/auth/config")" '{"error":"device_flow_unavailable"}'
check 'an unknown auth route is a 404, not the app' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/auth/nope")" '404'
check 'a device route refuses GET' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/auth/device/code")" '405'

# The same image, told about a GitHub App. If the JavaScript module failed to
# load, nginx would not have started at all -- but a route left out of the
# config would answer the app's HTML with a 200, which looks like success to
# anything that only checks a status code.
CONFIGURED="$NAME-configured"
docker rm -f "$CONFIGURED" >/dev/null 2>&1 || true
docker run -d --name "$CONFIGURED" -p "$((PORT + 2)):80" \
  -e PR_RADAR_CLIENT_ID=Iv1.smoketest "$IMAGE" >/dev/null
CBASE="http://127.0.0.1:$((PORT + 2))"
i=0
while [ "$i" -lt 30 ]; do curl -sf "$CBASE/" -o /dev/null && break; i=$((i + 1)); sleep 1; done
check 'a configured container offers the flow' \
  "$(curl -s "$CBASE/auth/config")" '{"deviceFlow":true,"clientId":"Iv1.smoketest"}'
check 'and never lets that answer be cached' \
  "$(header "$CBASE/auth/config" 'Cache-Control')" 'no-store'
# A relay that answered a cross-origin request would let any page on the
# internet start sign-in attempts against a machine running this container.
check 'and refuses a request from another origin' \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
     -H 'Origin: https://evil.example' -d '{}' "$CBASE/auth/device/code")" '403'
docker rm -f "$CONFIGURED" >/dev/null 2>&1 || true

echo ''
echo 'Security headers'
# The page carries its own Content-Security-Policy in a meta tag. These are the
# parts a meta tag cannot express, and they have to match between the container
# and `npx pr-radar` or the two channels protect their users differently.
check 'frames are refused'          "$(header "$BASE/" 'Content-Security-Policy')" "frame-ancestors 'none'"
check 'X-Frame-Options is DENY'     "$(header "$BASE/" 'X-Frame-Options')" 'DENY'
check 'content types are not sniffed' "$(header "$BASE/" 'X-Content-Type-Options')" 'nosniff'
check 'referrers are trimmed'       "$(header "$BASE/" 'Referrer-Policy')" 'strict-origin-when-cross-origin'
case $(header "$BASE/" 'Permissions-Policy') in
  *'camera=()'*) pass 'powerful features are denied' ;;
  *) fail 'powerful features are denied' ;;
esac
# Assets too: a script served without nosniff is the interesting case.
check 'assets are not sniffed'      "$(header "$BASE$asset" 'X-Content-Type-Options')" 'nosniff'

echo 'Addressing'
# A client picks a family from DNS, not from our preferences, so the server has
# to answer on both. Reported as skipped rather than failed where the runtime has
# no IPv6 at all -- a phantom failure teaches nobody anything.
if docker exec "$NAME" wget --quiet --tries=1 --spider http://127.0.0.1/ 2>/dev/null; then
  pass 'reachable over IPv4'
else
  fail 'reachable over IPv4'
fi
if docker exec "$NAME" ip -6 addr show lo 2>/dev/null | grep -q '::1'; then
  if docker exec "$NAME" wget --quiet --tries=1 --spider 'http://[::1]/' 2>/dev/null; then
    pass 'reachable over IPv6'
  else
    fail 'reachable over IPv6'
  fi
else
  skip 'reachable over IPv6 (this runtime has no ::1)'
fi

echo 'Health'
status=$(await_health "$NAME")
if [ "$status" = healthy ]; then
  pass 'container reports healthy'
else
  fail "container reports healthy (got '$status')"
  docker inspect --format '{{range .State.Health.Log}}{{.Output}}{{end}}' "$NAME" | sed 's/^/        /'
fi

echo 'Degraded runtime'
# `listen [::]:80` must not cost us the environments that have no IPv6, or the
# dual-stack bind would simply trade one broken deployment for another.
if docker run -d --name "$ALT" --sysctl net.ipv6.conf.all.disable_ipv6=1 \
     --health-interval=2s --health-retries=3 --health-start-period=0s \
     "$IMAGE" >/dev/null 2>&1; then
  status=$(await_health "$ALT")
  if [ "$status" = healthy ]; then
    pass 'still serves with IPv6 switched off'
  else
    fail "still serves with IPv6 switched off (got '$status')"
    docker logs "$ALT" 2>&1 | tail -5 | sed 's/^/        /'
  fi
else
  skip 'still serves with IPv6 switched off (runtime refused the sysctl)'
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'All checks passed.'
else
  echo "$failures check(s) failed."
  exit 1
fi
