#!/bin/sh
# Nothing machine-generated is tracked.
#
# `wrangler dev` writes miniflare's sqlite files into worker/.wrangler, and
# nineteen of them reached main. They are per-developer, rewritten on every run,
# and they blocked a checkout the first time two branches disagreed about them.
#
# The gitignore was added in the same pull request that introduced them, and the
# squash was composed before that fix -- so the ignore rule shipped and the files
# shipped with it. An ignore rule is not a check.
set -eu

failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# Paths that are output, state or dependency trees. A tracked file under any of
# them is a mistake regardless of what it contains.
FORBIDDEN='^(worker/\.wrangler/|dist/|dist-lib/|node_modules/|playwright-report/|test-results/|coverage/|\.vite/)'

echo 'No generated file is tracked'
tracked=$(git ls-files | grep -E "$FORBIDDEN" || true)
if [ -z "$tracked" ]; then
  pass 'the working tree holds only source'
else
  fail 'these are generated and should not be tracked:'
  printf '%s\n' "$tracked" | sed 's/^/          /'
fi

# A tarball or a lockfile-adjacent artefact left behind by a test run.
echo 'No build artefact is tracked'
strays=$(git ls-files | grep -E '\.(tgz|tsbuildinfo)$' || true)
if [ -z "$strays" ]; then
  pass 'no packed tarball or build info'
else
  fail 'these look like build artefacts:'
  printf '%s\n' "$strays" | sed 's/^/          /'
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'The tree is clean.'
else
  echo "$failures problem(s)."
  exit 1
fi
