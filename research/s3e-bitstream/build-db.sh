#!/bin/bash
# Rebuilds the bit database from the experiments' results in $W (bitstreams made by run-many.sh;
# nothing of it is in the repository): db/xc3s250e-layout.json, the shared tile types db/s3e-tiles.json
# and the XC3S250E's pads (db/xc3s250e-cp132-pads.json), then (stage F) the other devices from $W2.
#   $W/dev-full.xdlrc        xdl -report -pips -all_conns xc3s250ecp132-4
#   $W/map/                  gen-map.mjs + decode-map.mjs (map.json, EMPTY.bit: the layout, the format)
#   measured/slice/*.json    slice harness results (analyze-slice.mjs), in the repository
#   measured/learn-*, fix-*  features found by ana-residual / ana-attrdrop / ana-pads / learn-single /
#                            explain-diff (see README), in the repository
#   $W/{p1,c1,c2,k1,iop/*}/  PIP batches (gen-pipdrop.mjs, gen-pipcover.mjs, gen-clock.mjs)
#   $W/{d1,d2}/              PIP batches on blinky and lab11 placed and routed by Silinx (gen-pipdrop.mjs)
#   $W/pd-*/                 PIP batches on designs implemented by ISE from HDL (ise-impl.sh, gen-pipdrop.mjs)
#   $W/{c6…c10,n1,n2,b-*}/   PIP batches of stage D (gen-pipcover.mjs: carry outputs, clock pins, the
#                            constant 1, long lines, terminal tiles, I/O and block-RAM pins)
#   $W/io1/                  I/O settings (gen-iob.mjs)
#   $W/io4/, $W/io7/         I/O settings per pad (gen-iob.mjs --perpad, --perstd)
#   $W/br1/                  block-RAM contents (gen-bram.mjs)
#   $W/ref/                  designs implemented by ISE (routed XDL + .bit) for the residual analysis
#   $W2/s100, s500, s1200/  stage F, per device (PART): map/, iot/ + ios/ (gen-iob.mjs --third / --sparse),
#                            iop/ + iostd/ (--perpad / --perstd), br/ (gen-bram.mjs), s1200/clkhll/
#                            (gen-pipcover.mjs --types CLKH_LL --long 1, ana-pipdrop.mjs)
set -e
W=${1:-/tmp/claude-501/bg}; W2=${2:-/tmp/claude-501/bg2}
cd "$(dirname "$0")"
node gen-layout.mjs "$W/map/map.json" "$W/map/EMPTY.bit" > db/xc3s250e-layout.json
rm -f db/s3e-tiles.json db/xc3s250e-cp132-pads.json
node gen-slicedb.mjs measured/slice/*.json > "$W/slice-features.json"
echo '{"types":{"CENTER_SMALL_BRK":{"sameAs":"CENTER_SMALL"}}}' > "$W/brk.json"
PIPS=()
for d in p1 c1 c2 c3 c4 c5 k1 iop/O iop/I d1 d2 c6 c7 c8 c9 c10 n1 n2 n3 b-k1 b-g b-g3 pd-dcm pd-bufgmux pd-brmul pd-bram_sp pd-ramprim pd-dram pd-srl; do
  [ -f "$W/$d/key.json" ] && [ -f "$W/$d/BASE.bit" ] && [ "$(ls "$W/$d" | grep -c "^V.*bit$")" = "$(node -p "require(\"$W/$d/key.json\").L")" ] || continue
  [ -f "$W/$d/pips.json" ] || node ana-pipdrop.mjs "$W/$d" "$W/dev-full.xdlrc" > "$W/$d/pips.json"
  PIPS+=("$W/$d/pips.json")
done
node pips-to-db.mjs "${PIPS[@]}" > "$W/pip-features.json" 2> "$W/pip-report.txt"
tail -1 "$W/pip-report.txt"
node merge-db.mjs "$W/slice-features.json" "$W/brk.json" "$W/pip-features.json"
for f in measured/learn-*.json; do [ -f "$f" ] && node merge-db.mjs --keep "$f"; done
node unify-io.mjs
# the I/O, corner, block-RAM interconnect and DCM tiles share the CLB's switch box (stage D)
node share-sb.mjs
# I/O standards, drive, slew and pull per pad (gen-iob.mjs --perpad, stage D)
if [ -f "$W/io4/key.json" ]; then node ana-perpad.mjs "$W/io4" > "$W/perpad.json" && node merge-db.mjs "$W/perpad.json"; fi
if [ -f "$W/io7/key.json" ] && [ -f "$W/io7/LVCMOS12_BASE.bit" ]; then node ana-perpad.mjs "$W/io7" > "$W/perstd.json" && node merge-db.mjs "$W/perstd.json"; fi
# corrections found by comparing whole designs with ISE (check-writer.mjs, explain-diff.mjs)
for f in measured/fix-*.json; do [ -f "$f" ] && node merge-db.mjs "$f"; done

node gen-slicetable.mjs > db/xc3s250e-slice.json
# block-RAM contents (gen-bram.mjs, stage D)
if [ -f "$W/br1/V14.bit" ]; then node ana-bram.mjs "$W/br1" > db/xc3s250e-bram.json; fi

# stage F: the other devices (the shared tile types above serve them; their own layout, LUTs, block
# RAMs, pads, and the XC3S1200E's long-line splitters)
for d in s100:xc3s100ecp132-4:xc3s100e s500:xc3s500efg320-4:xc3s500e s1200:xc3s1200efg320-4:xc3s1200e; do
  IFS=: read -r s p dev <<< "$d"
  [ -d "$W2/$s/map" ] || continue
  export PART=$p
  node decode-map.mjs "$W2/$s/map" > /dev/null && cp "$W2/$s/map/lut.json" "db/$dev-lut.json"
  node gen-layout.mjs "$W2/$s/map/map.json" "$W2/$s/map/EMPTY.bit" > "$W2/$s/layout.json" && cp "$W2/$s/layout.json" "db/$dev-layout.json"
  rm -f "db/$dev-"*-pads.json
  node ana-pads.mjs "$W2/$s/iot" "$W2/$s/ios" > "$W2/$s/pads.json" && node merge-db.mjs "$W2/$s/pads.json"
  [ -f "$W2/$s/iop/key.json" ] && node ana-perpad.mjs "$W2/$s/iop" > "$W2/$s/perpad.json" && node merge-db.mjs "$W2/$s/perpad.json"
  [ -f "$W2/$s/iostd/key.json" ] && node ana-perpad.mjs "$W2/$s/iostd" > "$W2/$s/perstd.json" && node merge-db.mjs "$W2/$s/perstd.json"
  node ana-bram.mjs "$W2/$s/br" > "$W2/$s/bram.json" && cp "$W2/$s/bram.json" "db/$dev-bram.json"
done
if [ -f "$W2/s1200/clkhll/key.json" ]; then
  export PART=xc3s1200efg320-4
  node ana-pipdrop.mjs "$W2/s1200/clkhll" "$PART" > "$W2/s1200/clkhll/pips.json"
  node clkh-ll.mjs "$W2/s1200/clkhll/pips.json" > "$W2/s1200/clkh-ll.json"
  rm -f db/xc3s1200e-tiles.json && node merge-db.mjs --device "$W2/s1200/clkh-ll.json"
  node -e "const fs=require('fs'),f='db/xc3s1200e-tiles.json',t=JSON.parse(fs.readFileSync(f,'utf8'));t.types.CLKH_LL.noRoute=true;fs.writeFileSync(f,JSON.stringify(t))"
fi
