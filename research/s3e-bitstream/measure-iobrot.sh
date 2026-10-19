#!/bin/bash
# #96 / #97: the IOB registers' kinds on every pad, and the tristate output's enable from the fabric, on the
# four devices. #44 measured each kind of register on a quarter of the pads (gen-iobreg.mjs cycles the
# kinds through them): here the designs with the kinds moved by 1-3 pads (gen-iobreg.mjs --rot k: rik, rok)
# and rt (TMUX T1), implemented by ISE (impl-remote.sh), N variants of each at random register settings
# (gen-iobrand.mjs, xdl + bitgen: fuzz-remote.sh), solved per pad (ana-iobreg.mjs, only the input delay
# ISE's map chooses by itself kept) into W/<part>-pads.json, to merge (merge-db.mjs) after checking that
# the features #44 measured agree. ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-iobrot.sh [W] [N=8]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-iobrot}; W=${W%/}; N=${2:-8}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
for part in xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  auto=DLY3; [ "$part" = xc3s100ecp132-4 ] && auto=DLY2
  if [ ! -d "$W/$part/rt" ]; then
    PART=$part node gen-iobreg.mjs "$W/$part/all" >/dev/null && mv "$W/$part/all/rt" "$W/$part/rt" && rm -rf "$W/$part/all"
    for k in 1 2 3; do PART=$part node gen-iobreg.mjs "$W/$part" --rot $k >/dev/null; done
  fi
  todo=(); for d in rt rik1 rik2 rik3 rok1 rok2 rok3; do [ -s "$W/$part/$d/top.xdl" ] || todo+=("$part/$d"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-iobrot-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  dirs=()
  for d in rt rik1 rik2 rik3 rok1 rok2 rok3; do
    [ -s "$W/$part/$d/top.xdl" ] || { echo "$part/$d: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/v-$d/BASE.xdl" ] || node gen-iobrand.mjs "$W/$part/$d/top.xdl" "$W/$part/v-$d" "$N" 1 >/dev/null
    n=$(ls "$W/$part/v-$d"/*.xdl | wc -l)
    [ "$(ls "$W/$part/v-$d" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-iobrot bash fuzz-remote.sh -P 3 "$part/v-$d"
    dirs+=("$W/$part/v-$d")
  done
  PART=$part node ana-iobreg.mjs --pads "$W/$part-pads.json" --delays "^IFD:$auto\$" "${dirs[@]}" > "$W/$part-report.txt" 2>&1 || true
done
echo "pads' features in $W/<part>-pads.json (reports in <part>-report.txt)"
