// The spike's models, library and prompts (#1060). Copyright 2026 Pedro Maló, AGPL-3.0-only.
// Shared by the page (spike.js), its worker (worker.js) and the Mac runner (bench.mjs).

// Transformers.js, pinned; its bundle is self-contained and fetches ONNX Runtime Web's WebAssembly
// (1.31.0-dev.20260914-8d85527a0, pinned by the bundle) from the same CDN.
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

// Weights are fetched at run time from the Hugging Face Hub, at a pinned commit, into the browser's
// Cache Storage ('transformers-cache'); none are in git. `files` are the ONNX files each dtype loads,
// with their sizes from the Hub (bytes), so the download size is known before loading.
export const MODELS = {
  'trocr-small': {
    label: 'TrOCR-small (handwritten)',
    id: 'Xenova/trocr-small-handwritten',
    revision: '2432e24d184b1d964d07ed04f5d9e21d31a59141',
    family: 'trocr',
    licence: 'MIT (microsoft/unilm repository; the model card states none)',
    dtype: { webgpu: 'fp32', wasm: 'q8' },
    files: {
      webgpu: { 'encoder_model.onnx': 87496990, 'decoder_model_merged.onnx': 159046668, 'tokenizer.json': 4494727 },
      wasm: { 'encoder_model_quantized.onnx': 23082942, 'decoder_model_merged_quantized.onnx': 40527613, 'tokenizer.json': 4494727 },
    },
  },
  'smolvlm-256m': {
    label: 'SmolVLM-256M-Instruct',
    id: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    revision: '7e3e67edbbed1bf9888184d9df282b700a323964',
    family: 'smolvlm',
    licence: 'Apache-2.0',
    dtype: {
      webgpu: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
      wasm: { embed_tokens: 'q8', vision_encoder: 'q8', decoder_model_merged: 'q8' },
    },
    files: {
      webgpu: { 'embed_tokens_fp16.onnx': 56770946, 'vision_encoder_q4.onnx': 63784987, 'decoder_model_merged_q4.onnx': 86562901, 'tokenizer.json': 3548256 },
      wasm: { 'embed_tokens_quantized.onnx': 28385824, 'vision_encoder_quantized.onnx': 94247969, 'decoder_model_merged_quantized.onnx': 137221644, 'tokenizer.json': 3548256 },
    },
  },
  'florence2-base': {
    label: 'Florence-2-base-ft',
    id: 'onnx-community/Florence-2-base-ft',
    revision: 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f',
    family: 'florence2',
    licence: 'MIT',
    dtype: {
      webgpu: { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q4', decoder_model_merged: 'q4' },
      wasm: { embed_tokens: 'q8', vision_encoder: 'q8', encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
    files: {
      webgpu: { 'embed_tokens_fp16.onnx': 78780290, 'vision_encoder_fp16.onnx': 183930536, 'encoder_model_q4.onnx': 30058778, 'decoder_model_merged_q4.onnx': 64393474, 'tokenizer.json': 2297961 },
      wasm: { 'embed_tokens_quantized.onnx': 39390433, 'vision_encoder_quantized.onnx': 93746540, 'encoder_model_quantized.onnx': 43651493, 'decoder_model_merged_quantized.onnx': 98177697, 'tokenizer.json': 2297961 },
    },
  },
};

// What each model is asked, per kind of drawing. TrOCR takes no prompt (it reads one line of text);
// Florence-2 takes a task token; SmolVLM a chat question.
export const PROMPTS = {
  expression: {
    florence2: '<OCR>',
    smolvlm: 'Read the handwritten Boolean expression in the image. Answer with the expression only.',
    maxTokens: 32,
  },
  table: {
    florence2: '<OCR>',
    smolvlm: 'This image is a handwritten truth table. Write it out: the header first, then each row of 0s and 1s on its own line.',
    maxTokens: 96,
  },
  schematic: {
    florence2: '<MORE_DETAILED_CAPTION>',
    smolvlm: 'This is a hand-drawn digital logic schematic. List every logic gate with its type, its inputs and its output.',
    maxTokens: 96,
  },
};

export const downloadBytes = (key, backend) =>
  Object.values(MODELS[key].files[backend]).reduce((a, b) => a + b, 0);
