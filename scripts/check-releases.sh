#!/bin/sh
# Every version on npm must have a git tag and a GitHub release, and the other
# way round.
#
# They drift apart quietly. `npm publish` from a laptop leaves no tag at all, and
# a tag pushed without a release leaves nobody able to read what changed. Neither
# breaks anything, so neither is noticed -- 0.1.0 sat on the registry for hours
# with no tag and no notes.
#
# Usage: scripts/check-releases.sh [--expect <version>] [package] [owner/repo]
set -eu

# --expect <version>: wait for that version to appear on the registry before
# comparing. Parsed before the positional arguments, or it would be read as the
# package name. Only the release workflow passes it.
EXPECT=''
if [ "${1:-}" = '--expect' ]; then
  EXPECT=$2
  shift 2
fi

PKG=${1:-pr-radar}
REPO=${2:-AryeBorgen/pr-radar}
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

printf '\nComparing %s on npm against releases of %s\n\n' "$PKG" "$REPO"

if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  printf '  skip  needs an authenticated gh\n\n'
  exit 0
fi

# Read the registry, optionally waiting for a version that was just published.
#
# npm answers a successful `publish` before the public registry serves the new
# version. Run straight afterwards -- which is exactly when the release workflow
# runs it -- this saw the GitHub release and not the package, and reported a
# disagreement that resolved itself a few seconds later. 0.3.0 was published
# correctly and the release job still went red.
#
# So the release passes `--expect <version>` and this waits for it. Without the
# flag, on a pull request, there is nothing to wait for and it reads once.
read_registry() {
  _raw=$(curl -sf "https://registry.npmjs.org/$PKG" || true)
  printf '%s' "$_raw" | tr ',' '\n' | sed -n 's/.*"\([0-9][0-9.]*\)":{"name".*/\1/p' | sort -V
}

npm_versions=$(read_registry)
if [ -n "$EXPECT" ]; then
  _waited=0
  while ! printf '%s\n' "$npm_versions" | grep -qx "$EXPECT"; do
    if [ "$_waited" -ge 120 ]; then
      echo "  note  waited ${_waited}s for $PKG@$EXPECT to reach the registry; it has not"
      _waited=-1
      break
    fi
    sleep 5
    _waited=$((_waited + 5))
    npm_versions=$(read_registry)
  done
  [ "$_waited" -gt 0 ] && echo "  note  waited ${_waited}s for $PKG@$EXPECT to reach the registry"
fi
releases=$(gh release list --repo "$REPO" --limit 100 --json tagName --jq '.[].tagName' || true)
tags=$(git ls-remote --tags "https://github.com/$REPO" 2>/dev/null \
  | grep -v '\^{}' | sed 's|.*refs/tags/||' || true)

echo 'Every npm version has a tag and a release'
for v in $npm_versions; do
  has_tag=$(printf '%s\n' "$tags" | grep -cx "v$v" || true)
  has_rel=$(printf '%s\n' "$releases" | grep -cx "v$v" || true)
  if [ "$has_tag" -gt 0 ] && [ "$has_rel" -gt 0 ]; then
    pass "$v has tag v$v and a release"
  elif [ "$has_tag" -eq 0 ]; then
    fail "$v is on npm with no tag v$v"
  else
    fail "$v has a tag but no GitHub release, so nobody can read what changed"
  fi
done

echo 'Every release is on npm'
for r in $releases; do
  v=${r#v}
  if printf '%s\n' "$npm_versions" | grep -qx "$v"; then
    pass "$r is published"
  else
    fail "$r is released on GitHub but $v is not on npm"
  fi
done

# GitHub picks "Latest" for itself unless told, and it picks by creation date.
# v0.1.0's release was cut after v0.1.1's, so the releases page offered 0.1.0 to
# anyone who landed on it -- pointing at a version one release out of date, with
# nothing broken anywhere to say so.
echo 'The release marked Latest is the highest version'
latest=$(gh release list --repo "$REPO" --limit 100 --json tagName,isLatest \
  --jq '.[] | select(.isLatest) | .tagName' || true)
highest=$(printf '%s\n' "$releases" | sed 's/^v//' | sort -V | tail -1)
if [ -z "$latest" ]; then
  fail 'no release is marked Latest'
elif [ "$latest" = "v$highest" ]; then
  pass "$latest is both the highest version and the one marked Latest"
else
  fail "$latest is marked Latest but v$highest is higher"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'Versions agree.'
else
  echo "$failures disagreement(s)."
  exit 1
fi
