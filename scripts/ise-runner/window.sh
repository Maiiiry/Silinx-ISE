#!/bin/sh
# Runs window.mjs (#482) with the Node.js copied beside it (install.sh --system: root's own copy, not
# the runner's user's), else the runner's own Node.js, the newest of its externals/node*/bin/node (the
# machine needs no Node.js of its own), or the one on the PATH.
set -eu
: "${RUNNER_DIR:?RUNNER_DIR: the folder of the runner}"
node="$(dirname "$0")/node"
[ -x "$node" ] || node=$(ls -d "$RUNNER_DIR"/externals/node*/bin/node 2>/dev/null | sort -V | tail -n 1)
[ -n "$node" ] || node=$(command -v node)
exec "$node" "$(dirname "$0")/window.mjs" "$@"
