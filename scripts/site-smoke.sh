#!/bin/sh
# Fetch a deployed site and check that what came back is the built application.
#
# A deploy reporting success is not evidence that the site works. This one has
# already gone green while serving the unbuilt source -- HTTP 200, correct
# title, and a <script src="/src/main.tsx"> that no browser can execute. Status
# codes cannot tell those apart; only the body can.
#
# Usage: scripts/site-smoke.sh <url>
set -eu

URL=${1:?usage: scripts/site-smoke.sh <url>}
URL=${URL%/}
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi; }

printf '\nSmoke-testing %s\n\n' "$URL"

echo 'Reachable'
# Pages can take a moment to serve a fresh deploy through its cache.
i=0
while [ "$i" -lt 30 ]; do
  curl -sf "$URL/" -o /dev/null && break
  i=$((i + 1))
  sleep 2
done
check 'the site answers' "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" '200'

body=$(curl -sf "$URL/" || true)
case $body in *'PR Radar'*) pass 'the page is PR Radar' ;; *) fail 'the page is PR Radar' ;; esac

echo 'Built, not raw'
# The single most important assertion here. Source entry points mean the deploy
# published the repository instead of the bundle, which renders a blank page.
case $body in
  *'/src/main.tsx'* | *'/src/main.jsx'*)
    fail 'the page loads a bundle rather than TypeScript source' ;;
  *) pass 'the page loads a bundle rather than TypeScript source' ;;
esac

asset=$(printf '%s' "$body" | grep -o 'src="[^"]*/assets/[^"]*\.js"' | head -1 | sed 's/^src="//; s/"$//')
if [ -n "$asset" ]; then
  pass "the page references a hashed bundle ($asset)"
else
  fail 'the page references a hashed bundle'
fi

echo 'Assets load'
# A base path built for the wrong host is the other way this goes wrong: the
# HTML is perfect and every asset it names 404s.
origin=$(printf '%s' "$URL" | sed -E 's|^(https?://[^/]+).*|\1|')
case $asset in
  http*) asset_url=$asset ;;
  /*) asset_url="$origin$asset" ;;
  *) asset_url="$URL/$asset" ;;
esac
check 'the bundle is served' "$(curl -s -o /dev/null -w '%{http_code}' "$asset_url")" '200'
case $(curl -sI "$asset_url" | tr -d '\r' | awk -F': ' '/^[Cc]ontent-[Tt]ype/ {print $2}') in
  *javascript*) pass 'the bundle has a JavaScript content type' ;;
  *) fail 'the bundle has a JavaScript content type' ;;
esac

css=$(printf '%s' "$body" | grep -o 'href="[^"]*/assets/[^"]*\.css"' | head -1 | sed 's/^href="//; s/"$//')
if [ -n "$css" ]; then
  case $css in
    http*) css_url=$css ;;
    /*) css_url="$origin$css" ;;
    *) css_url="$URL/$css" ;;
  esac
  check 'the stylesheet is served' "$(curl -s -o /dev/null -w '%{http_code}' "$css_url")" '200'
fi

echo 'Progressive web app'
manifest=$(printf '%s' "$body" | grep -o 'href="[^"]*\.webmanifest"' | head -1 | sed 's/^href="//; s/"$//')
if [ -n "$manifest" ]; then
  case $manifest in
    http*) manifest_url=$manifest ;;
    /*) manifest_url="$origin$manifest" ;;
    *) manifest_url="$URL/$manifest" ;;
  esac
  check 'the manifest is served' \
    "$(curl -s -o /dev/null -w '%{http_code}' "$manifest_url")" '200'
  # Without a start_url and icons the browser will not offer to install it.
  m=$(curl -s "$manifest_url")
  case $m in *'"start_url"'*) pass 'the manifest names a start_url' ;; *) fail 'the manifest names a start_url' ;; esac
  case $m in *'"icons"'*) pass 'the manifest lists icons' ;; *) fail 'the manifest lists icons' ;; esac
else
  fail 'the page links a web app manifest'
fi

echo 'Transport'
case $URL in
  https://*) pass 'served over HTTPS' ;;
  *) fail 'served over HTTPS' ;;
esac

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'All checks passed.'
else
  echo "$failures check(s) failed."
  exit 1
fi
