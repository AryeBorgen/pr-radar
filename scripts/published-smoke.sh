#!/bin/sh
# Drive the package npm actually serves, not the one in this working tree.
#
# Everything else here tests a build. This installs pr-radar from the registry,
# checks that the two paths the README tells people to import actually resolve,
# and mounts it in a real browser from a page with no bundler. That last part is
# not ceremony: the first library build referenced `process.env.NODE_ENV`, a Node
# global, and threw the moment a plain page loaded it -- in exactly the case an
# imperative function exists to serve. Nothing in the source, the types or the
# bundle said a word about it.
#
# Usage: scripts/published-smoke.sh [version]   (default: latest)
set -eu

VERSION=${1:-latest}
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

echo "Installing pr-radar@$VERSION from the registry"
(cd "$DIR" && npm init -y >/dev/null 2>&1 &&
  npm install --no-audit --no-fund "pr-radar@$VERSION" react@19 react-dom@19 >/dev/null 2>&1)

PKG="$DIR/node_modules/pr-radar"
installed=$(node -p "require('$PKG/package.json').version")
echo "  installed $installed"

# The README says `import 'pr-radar/render'` and `import 'pr-radar/style.css'`.
# If either stops resolving, the README is telling people to do something that
# does not work, and nothing in this repository would otherwise notice.
# Resolved as ESM, because that is what the package is. `require.resolve` throws
# ERR_PACKAGE_PATH_NOT_EXPORTED here and that is correct: there is no `require`
# condition, so a CommonJS consumer cannot load it, by design.
echo 'The documented import paths resolve'
(cd "$DIR" && node --input-type=module -e "
  for (const p of ['pr-radar/render', 'pr-radar/style.css']) {
    const to = import.meta.resolve(p).split('/node_modules/')[1]
    console.log('  ok    ' + p + ' -> ' + to)
  }
") || { echo '  FAIL  an import path in the README does not resolve'; exit 1; }

echo "Mounting pr-radar@$installed in a browser, from a page with no bundler"
PR_RADAR_LIB="$PKG/dist-lib" npx playwright test tests/embed.spec.ts --reporter=line

echo
echo "pr-radar@$installed works as published."
