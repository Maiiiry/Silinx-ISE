// web/js/app.js split by concern (#405): each part moved out lives in its own module only, and
// what app.js imports from it is what the module exports (read as text: the modules need a page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8');
const app = read('app.js');
const exportsOf = code => new Set([...code.matchAll(/^export (?:async )?function (\w+)/gm)].map(m => m[1]));
const importedFrom = (code, mod) => {
  const m = new RegExp(`^import \\{([^}]*)\\} from '\\./${mod.replace('.', '\\.')}';`, 'm').exec(code);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : null;
};
const definedIn = (code, name) => new RegExp(`^(?:export )?(?:async )?function ${name}\\(|^(?:let|const) ${name}\\b`, 'm').test(code);

// the modules taken out of app.js and the functions each one owns
const PARTS = {
  'console.js': ['log', 'logLine', 'showConsolePage', 'setDiagnostics', 'renderDiagnostics', 'clearConsole',
    'consoleMessage', 'renderDiagnosticsSoon', 'diagFixes', 'applyDiagFix', 'lastConsoleDiag'],
};

test('#405 app.js split: each moved function is defined in its module only', () => {
  for (const [mod, names] of Object.entries(PARTS)) {
    const code = read(mod);
    for (const name of names) {
      assert.ok(definedIn(code, name), `${name} in ${mod}`);
      assert.ok(!definedIn(app, name), `${name} not in app.js any more`);
    }
  }
});

test('#405 app.js split: what app.js imports from a module is exported by it, and the module reaches app.js through S / app only', () => {
  for (const mod of Object.keys(PARTS)) {
    const code = read(mod), names = importedFrom(app, mod);
    assert.ok(names?.length, `app.js imports from ${mod}`);
    const exported = exportsOf(code);
    for (const name of names) assert.ok(exported.has(name), `${mod} exports ${name}`);
    assert.deepEqual(importedFrom(code, 'app.js'), ['S', 'app'], `${mod} imports { S, app } from app.js`);
  }
  // the names other modules use on the app object are still there
  for (const name of ['log', 'logLine', 'setDiagnostics']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`));
  // and app.js still exports log / setDiagnostics by name
  assert.match(app, /^export \{ log, setDiagnostics \};/m);
});

test('#405 app.js split: the helpers fail on a part missing from a module', () => {
  assert.equal(definedIn('function other() {}', 'log'), false);
  assert.equal(definedIn('export async function log(x) {}', 'log'), true);
  assert.equal(importedFrom("import { a } from './x.js';", 'console.js'), null);
  assert.deepEqual(importedFrom("import { a, b } from './console.js';", 'console.js'), ['a', 'b']);
});
