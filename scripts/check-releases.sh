#!/bin/sh
# Every version on npm must have a git tag and a GitHub release, and the other
# way round.
#
# They drift apart quietly. `npm publish` from a laptop leaves no tag at all, and
# a tag pushed without a release leaves nobody able to read what changed. Neither
# breaks anything, so neither is noticed -- 0.1.0 sat on the registry for hours
# with no tag and no notes.
#
# Usage: scripts/check-releases.sh [package] [owner/repo]
set -eu

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

npm_versions=$(curl -sf "https://registry.npmjs.org/$PKG" \
  | tr ',' '\n' | sed -n 's/.*"\([0-9][0-9.]*\)":{"name".*/\1/p' | sort -V || true)
if [ -z "$npm_versions" ]; then
  npm_versions=$(curl -sf "https://registry.npmjs.org/$PKG" \
    | python3 -c 'import json,sys; print("\n".join(sorted(json.load(sys.stdin)["versions"])))' || true)
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

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'Versions agree.'
else
  echo "$failures disagreement(s)."
  exit 1
fi
