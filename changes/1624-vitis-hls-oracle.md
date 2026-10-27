In detail:

- **AMD's Vitis HLS as the HLS corpus's oracle (#1624):** `scripts/hls-vitis.mjs` runs the corpus's designs through
  Vitis HLS (C simulation, C synthesis for a small Artix-7 with the Vivado flow's interfaces, C/RTL co-simulation) in a
  Docker image of its own on the ISE runner's machine (`scripts/vitis-hls-image/`: Vivado ML Standard, installed from
  AMD's installer), and compares its C simulation, its RTL ports, its co-simulation, its latency and its loops' II with
  Silinx HLS's; `--update` writes the numbers and port names (`test/hls-corpus/vitis.json`) and the corpus README's
  table, no Vitis file.
