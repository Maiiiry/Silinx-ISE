// Silinx - the technology view moved to core/techview.js (#1673, the toolchain's separation, #1651): it belongs to
// the IDE (it draws with the schematic model), not to the toolchain. This path re-exports it for its importers.
export { vhdlName, technologyNetlist, initBits, lutFunction } from '../techview.js';
