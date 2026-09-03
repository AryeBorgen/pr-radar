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
