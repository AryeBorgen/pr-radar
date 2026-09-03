#!/bin/sh
# Probe the npm package the way `npx pr-radar` meets it: pack it, install the
# tarball into a throwaway prefix, run the installed binary and talk to it.
#
# Packing rather than running bin/pr-radar.js in place is the point. Running the
# file directly would pass even if `files` in package.json omitted dist/, which
# is exactly the mistake that would ship a package serving nothing.
#
# Usage: scripts/cli-smoke.sh [port]
set -eu

PORT=${1:-8097}
WORK=$(mktemp -d)
BASE=http://127.0.0.1:$PORT
PID=
failures=0

cleanup() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

pass() { printf '  ok    %s\n' "$1"; }
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

printf '\nSmoke-testing the npm package\n\n'

echo 'Packaging'
# dist/ is shipped prebuilt, so the package is only meaningful once it exists.
[ -d dist ] || npm run build >/dev/null 2>&1
tarball=$(npm pack --pack-destination "$WORK" 2>/dev/null | tail -1)
if [ -f "$WORK/$tarball" ]; then
  pass "packs ($tarball)"
else
  fail 'packs'
  exit 1
fi
# A package that ships the source but not the build serves nothing at all.
if tar -tzf "$WORK/$tarball" | grep -q '^package/dist/index.html$'; then
  pass 'tarball carries the built app'
else
  fail 'tarball carries the built app'
fi

npm install -g --prefix "$WORK/prefix" "$WORK/$tarball" >/dev/null 2>&1
if [ -x "$WORK/prefix/bin/pr-radar" ]; then
  pass 'installs an executable binary'
else
  fail 'installs an executable binary'
  exit 1
fi

echo 'Serving'
"$WORK/prefix/bin/pr-radar" --no-open --port "$PORT" >"$WORK/server.log" 2>&1 &
PID=$!
i=0
while [ "$i" -lt 30 ]; do
  curl -sf "$BASE/" -o /dev/null && break
  i=$((i + 1))
  sleep 1
done

body=$(curl -sf "$BASE/" || true)
case $body in *'PR Radar'*) pass 'serves the app' ;; *) fail 'serves the app' ;; esac

asset=$(printf '%s' "$body" | grep -o '/assets/[^"]*\.js' | head -1)
check 'serves the entry script' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")" '200'
# HTML served under a .js name is worse than an error: the browser reports a
# syntax error somewhere inside the markup rather than a missing file.
case $(curl -sI "$BASE$asset" | tr -d '\r' | awk -F': ' '/^[Cc]ontent-[Tt]ype/ {print $2}') in
  *javascript*) pass 'entry script has a JavaScript content type' ;;
  *) fail 'entry script has a JavaScript content type' ;;
esac

echo 'Caching'
check 'index.html is not cached' \
  "$(curl -sI "$BASE/" | tr -d '\r' | awk -F': ' '/^[Cc]ache-[Cc]ontrol/ {print $2}')" \
  'no-cache'
check 'assets are immutable' \
  "$(curl -sI "$BASE$asset" | tr -d '\r' | awk -F': ' '/^[Cc]ache-[Cc]ontrol/ {print $2}')" \
  'public, max-age=31536000, immutable'

echo 'Routing'
check 'unknown route falls back to the app' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/a/deep/route")" '200'
# The container answers 404 here. Two install channels that disagree about what
# a missing file means are two different products.
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
for icon in /icons/icon-192.png /icons/icon-512.png /icons/icon-maskable-512.png /icons/apple-touch-icon.png; do
  check "$icon is served" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$icon")" '200'
done

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

echo 'Isolation'
# The server may answer these however it likes as long as the answer is not the
# contents of a file outside dist/.
for probe in '/../package.json' '/%2e%2e/package.json' '/../../etc/hosts'; do
  out=$(curl -s --path-as-is "$BASE$probe" || true)
  case $out in
    *'"name": "pr-radar"'* | *'localhost'*) fail "does not leak $probe" ;;
    *) pass "does not leak $probe" ;;
  esac
done

echo 'Interface'
case $("$WORK/prefix/bin/pr-radar" --help 2>&1) in
  *'--port'*'--host'*'--no-open'*) pass '--help documents the flags' ;;
  *) fail '--help documents the flags' ;;
esac

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'All checks passed.'
else
  echo "$failures check(s) failed."
  exit 1
fi
