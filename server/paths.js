// A project's paths stay inside its folder, also once their symbolic links are followed (#1234): a folder put in
// the workspace by hand (a clone, a copy) may hold a link to a file of the user's (src/top.vhd -> ~/.ssh/id_rsa).
import fs from 'node:fs';
import path from 'node:path';

/** Where a path really is: its deepest part that exists, with its symbolic links resolved, then the rest. */
export function realOf(p) {
  const rest = [];
  for (let q = p; ;) {
    try { return path.join(fs.realpathSync(q), ...rest); } catch { /* not there (yet): its folder */ }
    const up = path.dirname(q);
    if (up === q) return p;
    rest.unshift(path.basename(q));
    q = up;
  }
}

const isIn = (dir, full) => full === dir || full.startsWith(dir + path.sep);

/** Is `full` (absolute) the folder `dir` or inside it, by name and once the links of both are followed? */
export function within(dir, full) {
  return isIn(dir, full) && isIn(realOf(dir), realOf(full));
}
