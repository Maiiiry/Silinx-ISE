// The editor's ES modules (CodeMirror 6) come from node_modules through the import map of
// web/index.html: the server serves the packages it names (server/server.js), the standalone edition
// bundles them (scripts/build-standalone.mjs) and the third-party notices mark them as embedded there
// (scripts/third-party.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The import map of a page (<script type="importmap">): { specifier: url }. */
export function importMap(html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8')) {
  const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]).imports : {};
}

/** The npm packages an import map loads from /vendor/npm/. */
export function importMapPackages(html) {
  return [...new Set(Object.values(importMap(html)).map(u => /^\/vendor\/npm\/((?:@[^/]+\/)?[^/]+)\//.exec(u)?.[1]).filter(Boolean))];
}
