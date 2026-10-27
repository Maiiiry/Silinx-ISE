#!/bin/bash
# Installs Vivado ML Standard (with Vitis HLS, the small 7-series devices only) into the base image and saves the
# result as the Vitis HLS image (#1624, README.md). Run on the machine with Docker, after downloading AMD's Linux
# web installer (FPGAs_AdaptiveSoCs_Unified_<version>_<date>_Lin64.bin) and writing install_config.txt beside it:
#   bash scripts/vitis-hls-image/install.sh <the installer's folder> <version, e.g. 2025.1>
# It asks for the AMD account once (xsetup -b AuthTokenGen, typed by its owner); the token is deleted before the
# image is saved.
set -eu
DIR=$(cd "${1:?usage: install.sh <installer folder> <version>}" && pwd)
VER=${2:?usage: install.sh <installer folder> <version>}
HERE=$(cd "$(dirname "$0")" && pwd)
BIN=$(ls "$DIR"/FPGAs_AdaptiveSoCs_Unified_*_Lin64.bin | head -1)
[ -f "$DIR/install_config.txt" ] || { echo "no install_config.txt in $DIR (README.md)"; exit 2; }
docker build --platform linux/amd64 -t silinx/vitis-hls-base "$HERE"
NAME=silinx-vitis-install
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -it --platform linux/amd64 --name "$NAME" -v "$DIR":/installer:ro silinx/vitis-hls-base bash -c '
  set -e
  cp /installer/'"$(basename "$BIN")"' /tmp/web.bin && chmod +x /tmp/web.bin
  /tmp/web.bin --keep --noexec --target /tmp/web
  /tmp/web/xsetup -b AuthTokenGen
  /tmp/web/xsetup --agree XilinxEULA,3rdPartyEULA --batch Install --config /installer/install_config.txt
  rm -rf /tmp/web /tmp/web.bin /root/.Xilinx/wi_authentication_key /root/.Xilinx/*.key'
docker commit "$NAME" "xilinx/vitis-hls:$VER"
docker rm "$NAME"
docker image ls "xilinx/vitis-hls:$VER"
