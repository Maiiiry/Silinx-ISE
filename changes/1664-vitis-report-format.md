In detail:

- **The Vitis oracle reads Vitis HLS 2025.2's reports (#1664):** the loops of csynth.xml (an element per loop, named
  as the loop, an inner loop inside its outer loop's) and the ports' directions (`<Dir>`) were missed.
