#!/bin/sh
# Installs the ISE runner's protections (#482) on the runner's machine (macOS), for the user the runner's
# service runs as:
#   - job-started.sh as the runner's job-started hook (ACTIONS_RUNNER_HOOK_JOB_STARTED in its .env):
#     every job but ise.yml's and quality.yml's of main fails before its first step;
#   - window.mjs as a launchd agent, every 15 minutes and at log-in: the runner on line only in the
#     ISE and Quality workflows' window.
# The scripts are copied out of the repository (a job's checkout must not change them): run it again
# after they change.
#   sh scripts/ise-runner/install.sh <the runner's folder>      install, or update
#   sh scripts/ise-runner/install.sh --uninstall <the runner's folder>
set -eu
uninstall=no
if [ "${1:-}" = --uninstall ]; then uninstall=yes; shift; fi
RUNNER_DIR=$(cd "${1:?usage: install.sh [--uninstall] RUNNER_FOLDER}" && pwd)
[ -x "$RUNNER_DIR/svc.sh" ] && [ -f "$RUNNER_DIR/.runner" ] || { echo "$RUNNER_DIR: not a configured runner (no svc.sh / .runner)" >&2; exit 1; }
SRC=$(cd "$(dirname "$0")" && pwd)
DEST="$HOME/Library/Application Support/Silinx-ISE-runner"
LABEL=com.github.pmnmalo.silinx-ise.runner-window
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ENVF="$RUNNER_DIR/.env"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
touch "$ENVF"
grep -v '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' "$ENVF" > "$ENVF.tmp" || true
mv "$ENVF.tmp" "$ENVF"
if [ $uninstall = yes ]; then
  rm -f "$PLIST"
  (cd "$RUNNER_DIR" && ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh start)
  echo "Uninstalled: the hook and the window removed, the runner on line as before."
  exit 0
fi

mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$SRC/job-started.sh" "$SRC/window.sh" "$SRC/window.mjs" "$DEST/"
chmod 755 "$DEST/job-started.sh" "$DEST/window.sh"
echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$DEST/job-started.sh" >> "$ENVF"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>$DEST/window.sh</string><string>tick</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>RUNNER_DIR</key><string>$RUNNER_DIR</string><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DEST/window.log</string>
  <key>StandardErrorPath</key><string>$DEST/window.log</string>
</dict>
</plist>
PLIST
# the runner reads its .env when it starts
(cd "$RUNNER_DIR" && ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh start)
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed in $DEST. Check:"
echo "  RUNNER_DIR=\"$RUNNER_DIR\" sh \"$DEST/window.sh\" status"
echo "  then Actions > ISE > Run workflow: its log says 'Silinx ISE runner: ... allowed' (the hook ran)."
