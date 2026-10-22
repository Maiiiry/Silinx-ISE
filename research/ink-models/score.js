// How good a model's answer is, 0 to 1, per kind of sample (#1060). Copyright 2026 Pedro Maló,
// AGPL-3.0-only. Deliberately simple and the same for every model:
//   expression: 1 - character error rate, after spaces dropped and the usual spellings of an
//               operator made one (· * . ∙ × \cdot for AND, ’ ` ´ ^{\prime} for the complement,
//               ~ ¬ \neg for NOT, \oplus for XOR);
//   table:      1 - error rate on the sequence of 0/1 digits, rows in reading order;
//   schematic:  the share of the expected gate types and signal names the answer mentions.

export function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

export function normalizeExpression(s) {
  return String(s)
    .replace(/<\/?s>|<pad>/g, '')
    // LaTeX, as SmolVLM answers: \cdot, ^{\prime}, \oplus, \overline{X} (read as X')
    .replace(/\\(cdot|land|wedge)/g, '·').replace(/\\(lor|vee)/g, '+').replace(/\\oplus/g, '⊕')
    .replace(/\\(neg|lnot)/g, '~').replace(/\^\{?\\prime\}?/g, "'").replace(/\\overline\{(\w)\}/g, "$1'")
    .replace(/\s+/g, '')
    .replace(/[*.∙•×⋅]/g, '·')
    .replace(/[’`´′]/g, "'")
    .replace(/¬/g, '~')
    .toUpperCase();
}

const rate = (got, want) => want.length ? Math.max(0, 1 - levenshtein(got, want) / want.length) : 0;

export function tableDigits(sample) {
  return sample.rows.map(r => r.join('')).join('');
}

export function score(sample, answer) {
  const text = String(answer ?? '');
  if (sample.kind === 'expression') {
    const got = normalizeExpression(text), want = normalizeExpression(sample.text);
    return { score: rate(got, want), exact: got === want };
  }
  if (sample.kind === 'table') {
    const got = (text.match(/[01]/g) || []).join(''), want = tableDigits(sample);
    return { score: rate(got, want), exact: got === want };
  }
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const gateWord = g => words.some(w => w === g || w === `${g}s`);
  const names = text.replace(/\bA(?=\s+[a-z])/g, ''); // the article "A drawing…" is not the signal A
  const label = l => new RegExp(`(^|[^A-Za-z])${l}([^A-Za-z]|$)`).test(names);
  const hits = sample.gates.filter(gateWord).length + sample.labels.filter(label).length;
  const all = sample.gates.length + sample.labels.length;
  return { score: hits / all, exact: hits === all };
}
