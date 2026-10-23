// Silinx - where a schematic's Try it draws an I/O marker's control (#1124): on the marker's body near its tip, whichever
// side of the tip the body is on (a marker turned or mirrored, #296, has it on another side than its direction's
// default: an input's left, an output's right). No DOM: unit tested (test/sch-live-place.test.js).
import { portSide } from './schdoc.js';

const DIR = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };

/** The point `dist` from the marker's tip along its body (a switch's or a clock box's centre, an LED's). */
export function alongMarker(port, dist) {
  const [dx, dy] = DIR[portSide(port)];
  return { x: port.x + dx * dist, y: port.y + dy * dist };
}

/** The top-left corner of a value box (w x 13) by the marker: above its body for a marker on the W or E side (as
 *  before #1124: its right edge 3 from the tip on the W side, its left edge on the E side), beside it for N or S. */
export function valueBoxAt(port, w) {
  switch (portSide(port)) {
    case 'W': return { x: port.x - 3 - w, y: port.y - 22 };
    case 'E': return { x: port.x + 3, y: port.y - 22 };
    case 'N': return { x: port.x + 13, y: port.y - 16 };
    default: return { x: port.x + 13, y: port.y + 3 };
  }
}
