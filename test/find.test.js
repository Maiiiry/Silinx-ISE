// Unit tests (#1430): find in the project's texts and drawings, and replace (core/find.js), against a reference made
// with String methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPattern, findInText, replaceInText, findInDrawing } from '../core/find.js';

const TEXT = 'entity Counter is\n  port (clk : in std_logic;\n        count : out unsigned(3 downto 0));\nend counter;\n-- counter of clk\n';

test('findPattern: a text (case and word), a regular expression; nothing to find; an error said', () => {
  assert.equal(findPattern({ text: '' }).re, null);
  assert.equal(findPattern({ text: 'a.b' }).re.source, 'a\\.b');
  assert.equal(findPattern({ text: 'x', matchCase: true }).re.flags, 'g');
  assert.equal(findPattern({ text: 'x' }).re.flags, 'gi');
  const bad = findPattern({ text: '(', regex: true });
  assert.equal(bad.re, null);
  assert.match(bad.error, /Unterminated group|unterminated/i);
});

test('findInText: every match with its line and column, case and whole word, against indexOf', () => {
  const all = findInText(TEXT, findPattern({ text: 'counter' }).re);
  assert.deepEqual(all.map(m => [m.line, m.col, m.length]), [[1, 8, 7], [4, 5, 7], [5, 4, 7]]);
  assert.equal(all[1].text, 'end counter;');
  // (the reference: every case-insensitive occurrence)
  const low = TEXT.toLowerCase(), ref = [];
  for (let i = low.indexOf('counter'); i >= 0; i = low.indexOf('counter', i + 1)) ref.push(i);
  assert.deepEqual(all.map(m => m.index), ref);
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'counter', matchCase: true }).re).map(m => m.line), [4, 5]);
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'count', word: true }).re).map(m => [m.line, m.col]), [[3, 9]], 'not counter');
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'c\\w+r\\b', regex: true }).re).map(m => m.text.slice(m.col - 1, m.col - 1 + m.length)), ['Counter', 'counter', 'counter']);
  assert.equal(findInText('aaaa', findPattern({ text: 'a' }).re, { max: 2 }).length, 2);
  assert.deepEqual(findInText('abc', findPattern({ text: 'x*', regex: true }).re), [], 'an empty match only: none');
});

test('replaceInText: every match replaced, how many; a regular expression\'s groups; nothing to replace', () => {
  const r = replaceInText(TEXT, findPattern({ text: 'clk', word: true }).re, 'clock');
  assert.equal(r.count, 2);
  assert.equal(r.text, TEXT.split('clk').join('clock'));
  const g = replaceInText('a1 b22 c3', findPattern({ text: '([a-z])(\\d+)', regex: true }).re, '$2$1', { regex: true });
  assert.deepEqual(g, { text: '1a 22b 3c', count: 3 });
  assert.deepEqual(replaceInText('x$&y', findPattern({ text: '$&' }).re, '-'), { text: 'x-y', count: 1 }, 'a text with $ found as written');
  assert.deepEqual(replaceInText('abc', null, 'z'), { text: 'abc', count: 0 });
});

test('findInDrawing: the string values of a drawing\'s document, where each is; not JSON: none', () => {
  const doc = { name: 'traffic', states: [{ name: 'RED', label: 'stop the cars' }, { name: 'GREEN' }], notes: 'red light first', n: 3 };
  const m = findInDrawing(JSON.stringify(doc), findPattern({ text: 'red' }).re);
  assert.deepEqual(m.map(x => [x.where, x.col]), [['states[0].name', 1], ['notes', 1]]);
  assert.deepEqual(findInDrawing('not json', findPattern({ text: 'a' }).re), []);
});
