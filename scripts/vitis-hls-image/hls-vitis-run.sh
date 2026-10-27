#!/bin/bash
# Runs in the Vitis HLS image (#1624, scripts/hls-vitis.mjs): each design of <work>/designs.txt ("<name> <folder>" a
# line) through Vitis HLS from its silinx_vitis.cfg: the C simulation, the C synthesis, the C/RTL co-simulation (when
# the synthesis passed), each step's exit code in results/<name>/status.txt; the reports parsed by hls-vitis.mjs
# (csynth.xml, the co-simulation's .rpt, the C simulation's log) copied to results/<name>/. Vitis's work folder is
# deleted after each design. At the end, <work>/done.
#   bash hls-vitis-run.sh <work>
set -u
W=${1:?usage: hls-vitis-run.sh <work folder>}
STEP_TIMEOUT=${SILINX_VITIS_TIMEOUT:-1800}
# Vitis's settings: SILINX_VITIS_SETTINGS, else the first settings64.sh of an install under /tools/Xilinx or /opt/Xilinx
S=${SILINX_VITIS_SETTINGS:-$(ls -d /tools/Xilinx/*/Vitis/settings64.sh /tools/Xilinx/Vitis/*/settings64.sh /tools/Xilinx/*/Vivado/settings64.sh /opt/Xilinx/*/Vitis/settings64.sh 2>/dev/null | head -1)}
[ -n "$S" ] || { echo "no Vitis settings64.sh found (set SILINX_VITIS_SETTINGS)"; exit 2; }
# shellcheck disable=SC1090
. "$S" >/dev/null
export HOME=${HOME:-/tmp}
while read -r name dir; do
  [ -n "$name" ] || continue
  R="$W/results/$name"
  mkdir -p "$R"
  cd "$W/src/$dir" || continue
  timeout "$STEP_TIMEOUT" vitis-run --mode hls --csim --config silinx_vitis.cfg --work_dir w >/dev/null 2>&1; echo "csim $?" >>"$R/status.txt"
  timeout "$STEP_TIMEOUT" v++ -c --mode hls --config silinx_vitis.cfg --work_dir w >/dev/null 2>&1; s=$?; echo "synth $s" >>"$R/status.txt"
  if [ $s -eq 0 ]; then timeout "$STEP_TIMEOUT" vitis-run --mode hls --cosim --config silinx_vitis.cfg --work_dir w >/dev/null 2>&1; echo "cosim $?" >>"$R/status.txt"; fi
  f=$(find w -path '*syn/report/csynth.xml' | head -1); [ -n "$f" ] && cp "$f" "$R/csynth.xml"
  f=$(find w -path '*sim/report/*_cosim.rpt' | head -1); [ -n "$f" ] && cp "$f" "$R/cosim.rpt"
  f=$(find w -path '*csim/report/*.log' | head -1); [ -n "$f" ] && cp "$f" "$R/csim.log"
  rm -rf w
  echo "$name: $(tr '\n' ' ' <"$R/status.txt")"
done <"$W/designs.txt"
# (the run's end, for hls-vitis.mjs --collect)
touch "$W/done"
