// Silinx - the direction an I/O marker takes from the symbols' pins it is connected to (#1109): placed on empty space it
// is an input unless chosen (#680), and wired later to a symbol's output it was still an input. When an edit connects a
// marker to pins of symbols its net did not have, the marker takes their direction: an output pin on the net (it drives
// it) makes it an output, an inout pin bidirectional, input pins only an input (a bus tap's pins none: a connector,
// #1796). A direction set in the properties stays:
// that edit connects no new pin. No DOM: unit tested (test/schdoc-markers.test.js).

const pinKey = e => `${e.sym}/${e.pin}`;
// the symbols' pins of a marker's net in a netlist (core/schdoc.js netlist): their keys and directions
function pinsOf(nl, portId) {
  const net = nl?.portNet?.get(portId);
  return (net?.endpoints || []).filter(e => e.kind === 'pin');
}

/** The markers an edit connected to symbols' pins, and the direction those give them: [{ port (its id), dir }], only
 *  where it differs from the marker's own. doc: the drawing after the edit; before, after: its netlists before and after. */
export function markerDirections(doc, before, after) {
  const out = [];
  // (a bus tap is a connector, its pins give no direction, #1796)
  const taps = new Set((doc.symbols || []).filter(s => s.type === 'slice').map(s => s.id));
  for (const p of doc.ports || []) {
    const now = pinsOf(after, p.id).filter(e => !taps.has(e.sym));
    if (!now.length) continue;
    const had = new Set(pinsOf(before, p.id).map(pinKey));
    if (now.every(e => had.has(pinKey(e)))) continue;   // (no pin it was not connected to)
    const dir = now.some(e => e.dir === 'out') ? 'out' : now.some(e => e.dir === 'inout') ? 'inout' : 'in';
    if (dir !== p.dir) out.push({ port: p.id, dir });
  }
  return out;
}
