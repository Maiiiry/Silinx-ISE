#!/usr/bin/env bash
# Installs adepttool (open-source driver for the Digilent Adept USB programmer of the Basys2,
# https://github.com/mwkmwkmwk/adepttool, MIT licence) into ~/.silinx/adepttool with its own
# Python virtualenv. On macOS it uses Homebrew's Python + libusb (the system Python cannot load
# Homebrew libraries because of SIP).
set -euo pipefail
ROOT="${SILINX_CONFIG_DIR:-$HOME/.silinx}/adepttool"
REPO="https://github.com/mwkmwkmwk/adepttool.git"
# the upstream commit installed (checked: the Silinx patch applies to it); never its moving HEAD
COMMIT="99ff19414bb458ea322a1eb99e74fd9d8a22c38b"

PY=""
for c in /opt/homebrew/bin/python3 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /usr/local/bin/python3 python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$(command -v "$c")"; break; fi
done
[ -n "$PY" ] || { echo "Python 3 not found (macOS: brew install python)"; exit 1; }
if [ "$(uname)" = "Darwin" ] && [ ! -e /opt/homebrew/lib/libusb-1.0.dylib ] && [ ! -e /usr/local/lib/libusb-1.0.dylib ]; then
  echo "libusb not found: brew install libusb"; exit 1
fi

mkdir -p "$ROOT"
# a fresh copy at the pinned commit (an earlier install, maybe patched or of another commit, is replaced)
rm -rf "$ROOT/src"
git clone --quiet "$REPO" "$ROOT/src"
git -C "$ROOT/src" -c advice.detachedHead=false checkout --quiet "$COMMIT"
[ "$(git -C "$ROOT/src" rev-parse HEAD)" = "$COMMIT" ] || { echo "adepttool: commit $COMMIT not found"; exit 1; }
# Silinx patch: claim the USB interface (required by libusb on macOS) and add the
# XC3S250E/500E/1200E/1600E IDCODEs (upstream only knows the Basys2-100E's XC3S100E).
HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="$HERE/adepttool-silinx.patch"
git -C "$ROOT/src" apply "$PATCH" || { echo "adepttool: the Silinx patch does not apply to $COMMIT"; exit 1; }
echo "applied $PATCH"
"$PY" -m venv "$ROOT/venv"
# libusb1, pinned with its hashes (adepttool-requirements.txt)
"$ROOT/venv/bin/python" -m pip install --quiet --require-hashes -r "$HERE/adepttool-requirements.txt"

LIBS="/opt/homebrew/lib:/usr/local/lib"
DYLD_FALLBACK_LIBRARY_PATH="$LIBS" PYTHONPATH="$ROOT/src" "$ROOT/venv/bin/python" -c "import usb1; c = usb1.USBContext(); c.open(); print('libusb OK, version', usb1.getVersion())"
echo "adepttool installed in $ROOT"
echo "Test with the Basys2 connected:  DYLD_FALLBACK_LIBRARY_PATH=$LIBS PYTHONPATH=$ROOT/src $ROOT/venv/bin/python $ROOT/src/list.py"
