// Small helpers the New Source wizards share (#1406).

/** A folder of the project as typed (no trailing '/'; empty: src). */
export const cleanLoc = loc => String(loc || 'src').trim().replace(/\/+$/, '') || 'src';
/** A port as the wizards list it: its name and, a bus, its range (count [7:0]). */
export const portText = p => `${p.name}${+p.width > 1 ? ` [${p.width - 1}:0]` : ''}`;
