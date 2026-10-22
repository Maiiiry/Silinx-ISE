// The spike page: a canvas to draw on, a worker that runs the model, the 10-sample benchmark (#1060).
// Copyright 2026 Pedro Maló, AGPL-3.0-only.
import { MODELS, downloadBytes } from './models.js';
import { score } from './score.js';

const $ = id => document.getElementById(id);
const canvas = $('ink'), g = canvas.getContext('2d', { willReadFrequently: true });
const SAMPLES = await (await fetch('samples.json')).json();
const results = { env: {}, runs: [] };
// ?threads=1 (WebAssembly threads) and ?dtype={…} (JSON, per ONNX file) override the defaults.
const params = new URLSearchParams(location.search);
const THREADS = params.get('threads') ? Number(params.get('threads')) : undefined;
const DTYPE = params.get('dtype') ? JSON.parse(params.get('dtype')) : undefined;

// ---- the worker ------------------------------------------------------------------------------
const worker = new Worker('worker.js', { type: 'module' });
let nextId = 1;
const waiting = new Map();
const ready = new Promise(resolve => {
  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') return resolve(data);
    const w = waiting.get(data.id);
    if (!w) return;
    if (data.type === 'progress') return w.progress?.(data);
    waiting.delete(data.id);
    data.type === 'error' ? w.reject(new Error(data.message)) : w.resolve(data);
  };
});
worker.onerror = e => setStatus(`Worker failed: ${e.message}`);
function call(msg, progress, transfer) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, progress });
    worker.postMessage({ ...msg, id }, transfer || []);
  });
}

// ---- the environment ------------------------------------------------------------------------
async function describeEnv() {
  const env = {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    crossOriginIsolated: self.crossOriginIsolated,
    webgpu: null,
  };
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      const info = adapter.info || {};
      env.webgpu = { vendor: info.vendor, architecture: info.architecture, f16: adapter.features.has('shader-f16') };
    }
  } catch { /* no WebGPU */ }
  return env;
}

async function memoryMB() {
  // Every agent of the page (its worker and the WebAssembly memory included); needs cross-origin
  // isolation (serve.mjs). GPU buffers are not counted.
  if (self.crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
    const m = await Promise.race([performance.measureUserAgentSpecificMemory(), new Promise(r => setTimeout(r, 20000))]);
    if (m) return Math.round(m.bytes / 1048576);
  }
  return null;
}

// ---- drawing --------------------------------------------------------------------------------
function clear() {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
}
let last = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  last = point(e);
});
canvas.addEventListener('pointermove', e => {
  if (!last) return;
  for (const c of e.getCoalescedEvents?.() || [e]) {
    const p = point(c);
    g.strokeStyle = '#111';
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = c.pointerType === 'pen' ? 2 + 4 * (c.pressure || 0.5) : 4;
    g.beginPath();
    g.moveTo(...last);
    g.lineTo(...p);
    g.stroke();
    last = p;
  }
});
for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, () => { last = null; });

// The ink's bounding box with a margin, so every model sees the drawing, not the empty board.
function cropped() {
  const { width: W, height: H } = canvas;
  const px = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('The canvas is empty');
  const m = 24;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  return g.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

async function drawSample(s) {
  const img = new Image();
  img.src = `samples/${s.id}.png`;
  await img.decode();
  clear();
  g.drawImage(img, Math.round((canvas.width - img.width) / 2), Math.round((canvas.height - img.height) / 2));
  $('kind').value = s.kind;
}

// ---- models ----------------------------------------------------------------------------------
let loaded = null; // { key, backend }

async function cachedFiles(key) {
  try {
    const c = await caches.open('transformers-cache');
    const m = MODELS[key];
    return (await c.keys()).filter(r => r.url.includes(`${m.id}/resolve/${m.revision}/`) && r.url.endsWith('.onnx')).length;
  } catch { return null; }
}

async function loadModel(key, backend) {
  const m = MODELS[key];
  const files = {};
  const warm = await cachedFiles(key);
  setStatus(`Loading ${m.label} on ${backend}…`);
  const r = await call({ type: 'load', key, backend, dtype: DTYPE, threads: THREADS }, p => {
    files[p.file] = [p.loaded, p.total];
    const [l, t] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
    setStatus(`Loading ${m.label} on ${backend}: ${mb(l)} of ${mb(t)} MB`);
  });
  loaded = { key, backend };
  const run = {
    model: key, backend, dtype: r.dtype, threads: r.threads, cachedOnnxFiles: warm,
    downloadMB: mb(downloadBytes(key, backend)), loadedMB: mb(r.bytes), loadS: +(r.loadMs / 1000).toFixed(1),
    memoryAfterLoadMB: await memoryMB(), samples: [],
  };
  setStatus(`${m.label} on ${backend}: loaded in ${run.loadS} s`);
  return run;
}

async function recognize(kind) {
  const image = cropped();
  return call({ type: 'recognize', kind, image }, null, [image.data.buffer]);
}

async function runSamples(run) {
  for (const s of SAMPLES) {
    await drawSample(s);
    setStatus(`${MODELS[run.model].label} on ${run.backend}: sample ${s.id}…`);
    const r = await recognize(s.kind);
    $('answer').textContent = r.text;
    run.samples.push({ id: s.id, kind: s.kind, text: r.text, s: +(r.ms / 1000).toFixed(2), tokens: r.tokens, ...score(s, r.text) });
  }
  const times = run.samples.map(x => x.s).sort((a, b) => a - b);
  run.medianS = times[Math.floor(times.length / 2)];
  run.memoryAfterRunMB = await memoryMB();
  for (const k of ['expression', 'table', 'schematic']) {
    const xs = run.samples.filter(x => x.kind === k);
    run[`${k}Score`] = +(xs.reduce((a, x) => a + x.score, 0) / xs.length).toFixed(2);
  }
  results.runs.push(run);
  render();
  return run;
}

// ---- results ---------------------------------------------------------------------------------
const mb = b => +(b / 1048576).toFixed(1);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
function render() {
  $('results').innerHTML = results.runs.map(r => `
    <table>
      <tr class="sum"><td colspan="5">${esc(MODELS[r.model].label)} · ${r.backend} · ${esc(JSON.stringify(r.dtype))} ·
        download ${r.downloadMB} MB · load ${r.loadS} s${r.cachedOnnxFiles ? ' (from cache)' : ''} ·
        memory ${r.memoryAfterLoadMB ?? '–'} / ${r.memoryAfterRunMB ?? '–'} MB · median ${r.medianS} s ·
        scores: expressions ${r.expressionScore}, tables ${r.tableScore}, schematics ${r.schematicScore}</td></tr>
      <tr><th>Sample</th><th>Answer</th><th>Time</th><th>Tokens</th><th>Score</th></tr>
      ${r.samples.map(s => `<tr><td>${s.id}</td><td class="text">${esc(s.text)}</td><td class="num">${s.s} s</td>
        <td class="num">${s.tokens ?? ''}</td><td class="num">${s.score.toFixed(2)}${s.exact ? ' ✓' : ''}</td></tr>`).join('')}
    </table>`).join('');
}
function setStatus(s) { $('status').textContent = s; }

// ---- wiring ----------------------------------------------------------------------------------
async function busy(f) {
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(b => { b.disabled = true; });
  try { return await f(); } catch (e) { setStatus(`Error: ${e.message}`); throw e; } finally { buttons.forEach(b => { b.disabled = false; }); }
}

for (const [key, m] of Object.entries(MODELS)) $('model').add(new Option(m.label, key));
for (const s of SAMPLES) {
  const b = document.createElement('button');
  b.textContent = s.id;
  b.onclick = () => drawSample(s);
  $('samples').append(b);
}
clear();

const info = await ready;
results.env = { ...(await describeEnv()), transformers: info.version };
const e = results.env;
$('env').textContent = `Transformers.js ${e.transformers} · ${e.cores} cores · ${e.deviceMemoryGB ?? '?'} GB · ` +
  `WebGPU: ${e.webgpu ? `${e.webgpu.vendor || '?'} ${e.webgpu.architecture || ''}${e.webgpu.f16 ? ', f16' : ''}` : 'no'} · ` +
  `cross-origin isolated (threads, memory): ${e.crossOriginIsolated ? 'yes' : 'no'} · ${e.userAgent}`;
if (!e.webgpu) $('backend').value = 'wasm';
setStatus('Ready: load a model.');

$('load').onclick = () => busy(() => loadModel($('model').value, $('backend').value).then(r => { results.runs.push(r); render(); }));
$('recognize').onclick = () => busy(async () => {
  if (!loaded) throw new Error('Load a model first');
  const r = await recognize($('kind').value);
  $('answer').textContent = r.text;
  setStatus(`Recognized in ${(r.ms / 1000).toFixed(2)} s`);
});
$('clear').onclick = clear;
$('save').onclick = () => canvas.toBlob(b => save(b, `drawing-${Date.now()}.png`));
$('bench').onclick = () => busy(async () => runSamples(await loadModel($('model').value, $('backend').value)));
$('benchAll').onclick = () => busy(() => runAll($('backend').value));
$('copy').onclick = () => navigator.clipboard.writeText(JSON.stringify(results, null, 2)).then(() => setStatus('Results copied.'));
$('download').onclick = () => save(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }), `ink-models-${Date.now()}.json`);
$('forget').onclick = async () => { await caches.delete('transformers-cache'); setStatus('Model cache cleared.'); };

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function runAll(backend, keys = Object.keys(MODELS)) {
  for (const key of keys) await runSamples(await loadModel(key, backend));
  setStatus('Done.');
  return results;
}

// For bench.mjs (the Mac runner).
window.spike = { results, runAll, loadModel, runSamples, ready: true };
