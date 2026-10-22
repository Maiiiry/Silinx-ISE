// Silinx ink - the $P point-cloud recognizer (#1056; Vatavu, Anthony and Wobbrock, "Gestures as Point Clouds: A $P
// Recognizer for User Interface Prototypes", ICMI 2012): the strokes of a symbol resampled to a cloud of N points,
// scaled (keeping the proportions) and centred, matched to each template's cloud by a greedy point matching. The
// stroke order and direction do not matter, nor the number of strokes. Pure, no dependencies.
//
//   cloud(strokes) -> [{x, y}] (N points), strokes: [[{x, y}, ...], ...]
//   template(ch, strokes, extra) -> { ch, cloud, ink, ...extra }
//   classify(strokes, templates, { best }) -> [{ ch, d, t }] the nearest template of each symbol, nearest first

export const N = 32;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// N points equally spaced along the strokes (the jumps between strokes are not ink)
function resample(strokes, n) {
  const live = strokes.filter(s => s.length);
  let len = 0;
  for (const s of live) for (let i = 1; i < s.length; i++) len += dist(s[i - 1], s[i]);
  if (len === 0) {
    const p = live[0][0];
    return Array.from({ length: n }, () => ({ x: p.x, y: p.y }));
  }
  const I = len / (n - 1);
  const out = [{ x: live[0][0].x, y: live[0][0].y }];
  let D = 0;
  for (const s of live) {
    let prev = s[0];
    for (let i = 1; i < s.length; i++) {
      let q = s[i];
      let d = dist(prev, q);
      while (D + d >= I && out.length < n) {
        const t = (I - D) / d;
        const p = { x: prev.x + t * (q.x - prev.x), y: prev.y + t * (q.y - prev.y) };
        out.push(p);
        prev = p; d = dist(prev, q); D = 0;
      }
      D += d;
      prev = q;
    }
  }
  const last = live.at(-1).at(-1);
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}

/** The normalized cloud of a symbol: N points, the larger side of the box 1, the centroid at 0. */
export function cloud(strokes) {
  if (!strokes?.some(s => s?.length)) throw new Error('no ink');
  const pts = resample(strokes, N);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const sc = pts.map(p => ({ x: (p.x - minX) / size, y: (p.y - minY) / size }));
  const cx = sc.reduce((s, p) => s + p.x, 0) / N, cy = sc.reduce((s, p) => s + p.y, 0) / N;
  return sc.map(p => ({ x: p.x - cx, y: p.y - cy }));
}

/** How much ink a symbol has: its strokes' length over the larger side of its box (a + has less than a ⊕). */
export function inkLength(strokes) {
  let len = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i++) {
      if (i) len += dist(s[i - 1], s[i]);
      minX = Math.min(minX, s[i].x); maxX = Math.max(maxX, s[i].x); minY = Math.min(minY, s[i].y); maxY = Math.max(maxY, s[i].y);
    }
  }
  return len / (Math.max(maxX - minX, maxY - minY) || 1);
}

export const template = (ch, strokes, extra = {}) => ({ ch, cloud: cloud(strokes), ink: inkLength(strokes), ...extra });

// the distance grows with the difference of the amounts of ink
const INK_WEIGHT = 0.5;

// the weighted sum of the distances of a greedy matching of a's points (from `start`) to b's; stops above `limit`
function cloudDistance(a, b, start, limit) {
  const matched = new Uint8Array(N);
  let sum = 0, i = start, w = N;
  do {
    let best = -1, min = Infinity;
    for (let j = 0; j < N; j++) {
      if (matched[j]) continue;
      const dx = a[i].x - b[j].x, dy = a[i].y - b[j].y, d = dx * dx + dy * dy;
      if (d < min) { min = d; best = j; }
    }
    matched[best] = 1;
    sum += (w-- / N) * Math.sqrt(min);
    if (sum >= limit) return sum;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

/** The distance of two clouds (smaller is nearer). */
export function matchDistance(a, b, limit = Infinity) {
  const step = Math.floor(Math.pow(N, 0.5));
  let min = limit;
  for (let i = 0; i < N; i += step) {
    min = Math.min(min, cloudDistance(a, b, i, min), cloudDistance(b, a, i, min));
  }
  return min;
}

/** The templates nearest to the strokes, one per symbol, nearest first (at most `best`); a template's `k` scales its distance. */
export function classify(strokes, templates, { best = 6 } = {}) {
  const c = cloud(strokes), ink = inkLength(strokes);
  const bySym = new Map();
  for (const t of templates) {
    const prev = bySym.get(t.ch), k = (t.k ?? 1) * (1 + INK_WEIGHT * Math.abs(Math.log((ink + 0.5) / (t.ink + 0.5))));
    const d = matchDistance(c, t.cloud, prev ? prev.d / k : Infinity) * k;
    if (!prev || d < prev.d) bySym.set(t.ch, { ch: t.ch, d, t });
  }
  return [...bySym.values()].sort((a, b) => a.d - b.d).slice(0, best);
}
