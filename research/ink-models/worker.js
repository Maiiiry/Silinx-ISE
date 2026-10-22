// The spike's Web Worker: loads one model with Transformers.js and recognizes images (#1060).
// Copyright 2026 Pedro Maló, AGPL-3.0-only.
// Messages in:  { id, type: 'load', key, backend, dtype?, threads? }  |  { id, type: 'recognize', kind, image: ImageData }
// Messages out: { id, type: 'progress', … }  |  { id, type: 'done', … }  |  { id, type: 'error', message }
import { MODELS, PROMPTS, TRANSFORMERS_URL } from './models.js';

const T = await import(TRANSFORMERS_URL);
T.env.allowLocalModels = false;

let current = null; // { key, family, model, processor, pipe }

async function load({ id, key, backend, dtype, threads }) {
  const m = MODELS[key];
  if (threads) T.env.backends.onnx.wasm.numThreads = threads; // before the first session only
  const files = {};
  const progress_callback = p => {
    if (p.file && p.total) files[p.file] = p.total;
    if (p.status === 'progress') postMessage({ id, type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  const opts = { device: backend, dtype: dtype || m.dtype[backend], revision: m.revision, progress_callback };
  await (current?.model || current?.pipe)?.dispose?.();
  current = null;
  const t0 = performance.now();
  if (m.family === 'trocr') {
    current = { key, family: m.family, pipe: await T.pipeline('image-to-text', m.id, opts) };
  } else {
    const processor = await T.AutoProcessor.from_pretrained(m.id, { revision: m.revision, progress_callback });
    const Model = m.family === 'florence2' ? T.Florence2ForConditionalGeneration : T.AutoModelForVision2Seq;
    current = { key, family: m.family, processor, model: await Model.from_pretrained(m.id, opts) };
  }
  const loadMs = performance.now() - t0;
  const bytes = Object.values(files).reduce((a, b) => a + b, 0);
  postMessage({ id, type: 'done', loadMs, bytes, files, dtype: opts.dtype, threads: T.env.backends.onnx.wasm?.numThreads ?? null });
}

async function recognize({ id, kind, image }) {
  if (!current) throw new Error('No model loaded');
  const img = new T.RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4).rgb();
  const p = PROMPTS[kind];
  const t0 = performance.now();
  let text, tokens = null;
  if (current.family === 'trocr') {
    const out = await current.pipe(img, { max_new_tokens: p.maxTokens });
    text = out[0].generated_text;
  } else if (current.family === 'florence2') {
    const { processor, model } = current;
    const inputs = await processor(img, p.florence2);
    const ids = await model.generate({ ...inputs, max_new_tokens: p.maxTokens, do_sample: false });
    tokens = ids.dims.at(-1);
    const raw = processor.batch_decode(ids, { skip_special_tokens: false })[0];
    const post = processor.post_process_generation(raw, p.florence2, img.size);
    text = String(post[p.florence2] ?? raw);
  } else {
    const { processor, model } = current;
    const messages = [{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: p.smolvlm }] }];
    const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
    // One 512-pixel tile: splitting a drawing into up to 16 tiles multiplies the time by as much.
    const inputs = await processor(prompt, [img], { do_image_splitting: false });
    const ids = await model.generate({ ...inputs, max_new_tokens: p.maxTokens, do_sample: false });
    const start = inputs.input_ids.dims.at(-1);
    tokens = ids.dims.at(-1) - start;
    text = processor.batch_decode(ids.slice(null, [start, null]), { skip_special_tokens: true })[0];
  }
  postMessage({ id, type: 'done', text: text.trim(), ms: performance.now() - t0, tokens });
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') await load(data);
    else if (data.type === 'recognize') await recognize(data);
  } catch (e) {
    postMessage({ id: data.id, type: 'error', message: String(e?.message || e) });
  }
};
postMessage({ type: 'ready', version: T.env.version, webgpu: !!self.navigator?.gpu });
