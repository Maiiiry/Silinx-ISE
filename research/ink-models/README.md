# Small vision models for hand drawings, in the browser: a spike (2026-10-22)

Issue [#1060](https://github.com/pmnmalo/Silinx-ISE/issues/1060). Silinx's own template recognizer
($P/$Q, offline, no download) is the default way hand-drawn expressions, truth tables and schematics will
become modules. This spike asks whether an optional "smart recognition" model, downloaded on demand like
Yosys's WebAssembly (kept in Cache Storage, #967), would be worth adding later for what templates cannot
read, and whether it can run on the classroom board (a BenQ Board Essential RE7504: Android, an 8-core Arm
Cortex chipset, A73 ×4 + A53 ×4 per retailers, 8 GB).

Nothing here is part of the app: the page is not loaded, served or built by Silinx.

## In short

- **Expressions:** SmolVLM-256M reads them well with no training (5 of 6 exact on WebGPU, LaTeX
  spellings such as `\cdot` and `^{\prime}` accepted), Florence-2-base fairly (2 of 6 exact; the
  complement `'` read as `8`, `⊕` as `+`), TrOCR-small poorly (its `=` is `-`, it knows no `⊕`).
- **Truth tables and schematics:** none of the three can. Tables come back as runs of `0`/`O`, LaTeX
  matrices or a sentence about "a table of 0s and 1s"; schematics as "a drawing of a pot", "a flower",
  letters — no answer named an AND or an OR gate. The schematic scores below count only the signal
  names they read.
- **Cost:** 65–343 MB to download, 1–2 s to load from the cache, 0.9–2 GB more browser memory (all
  processes, measured on the Mac), and per drawing on an Apple M-series Mac: 0.1–0.4 s with WebGPU,
  0.2–3 s with WebAssembly on 4 threads, 0.7–10 s on one thread. The board will be several times
  slower; its own figures are to be measured (below).
- **Recommendation:** no model now. Expressions are what the templates are best at too, tables are a
  grid of `0`/`1` cells (geometry plus a digit classifier), and schematics need either the templates'
  shape recognition or a model trained on Silinx-style drawings. If expressions turn out to be the
  templates' weak spot, the candidate is **SmolVLM-256M-Instruct (Apache-2.0, ~200 MB)** on WebGPU,
  its answer accepted only when Silinx's expression parser accepts it; the cheaper one to try first is
  **TrOCR-small fine-tuned on Boolean expressions** (65 MB, 0.2 s), which needs that fine-tuning.

## The page

`index.html` (with `spike.js`, `worker.js`, `models.js`, `score.js`): a canvas to draw on with the pen,
a finger or the mouse; a model and a backend (WebGPU, offered when the browser has it, or WebAssembly);
**Recognize** crops the ink (its bounding box and a margin) and asks the model, in a Web Worker, as an
expression, a truth table or a schematic. **Run the 10 samples** loads the model and recognizes the 10
sample drawings (`samples/*.png`, ground truth in `samples.json`) one by one through the same canvas;
**Run every model** does it for the three. **Save PNG** keeps a drawing (to make real samples), **Save
results** writes the measurements as JSON, **Clear the model cache** makes the next load a cold one.
Options in the address: `?threads=1` (WebAssembly threads), `?dtype={"vision_encoder":"fp16",…}`.

| File | What it does |
|---|---|
| `models.js` | The library (Transformers.js 4.3.1, pinned, from jsDelivr; it pins ONNX Runtime Web 1.31.0-dev.20260914), the models at pinned Hub commits with each backend's ONNX files and sizes, the prompts |
| `worker.js` | Loads a model (`pipeline('image-to-text')` for TrOCR, `AutoModelForVision2Seq` for SmolVLM, `Florence2ForConditionalGeneration`) and recognizes; one 512-pixel tile for SmolVLM (its default splits a drawing into up to 16) |
| `score.js` | 0 to 1 per answer: expressions 1 − character error rate (operator spellings made one), tables the same on the 0/1 digits, schematics the share of expected gate types and signal names mentioned |
| `gen-samples.mjs` | Draws the 10 samples: two handwriting fonts (Caveat, Kalam: SIL OFL) with every character turned, moved and sized at random, wobbly lines for the gates and rules; a fixed seed |
| `serve.mjs` | Serves the folder on the network with COOP/COEP (`credentialless`), so the page is cross-origin isolated: WebAssembly threads, and a memory measure |
| `bench.mjs` | The Mac runner: the installed Chrome, headless, per model and backend a cold load, then in a fresh browser a warm load and the samples while every Chrome process's resident memory is sampled |
| `report.mjs` | The tables below from `results/*.json`, answers scored again |
| `results/` | The measurements, one JSON per machine or option |

Weights are never in git: the worker fetches them from the Hugging Face Hub at the pinned commit, and
Transformers.js keeps them in Cache Storage (`transformers-cache`), as Silinx would.

## Results (Apple M-series Mac, Chrome 156 headless, 14 cores, WebGPU Metal 3)

`node research/ink-models/bench.mjs mac-m-series` (WebGPU and WebAssembly, 4 threads),
`SPIKE_BACKENDS=wasm SPIKE_QUERY=threads=1 … mac-wasm-1-thread` (a page that is not cross-origin
isolated gets one thread), and Florence-2 on WebAssembly with WebGPU's dtypes (`mac-florence-wasm-fp16`).
Download: what the backend's files weigh. Memory: the peak of all Chrome processes' resident memory
(the GPU process included) over the empty page's, so it includes ONNX Runtime's arenas and threads, not
only the weights. Time: the median of the 10 samples (the first is ~0.5 s slower: warm-up).

| Model | Backend (dtype) | Download | Cold load | Warm load | Memory + | Median / drawing | Expressions | Tables | Schematics¹ |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| TrOCR-small | WebGPU (fp32) | 239 MB | 7.3 s | 1.6 s | 1.75 GB | 0.10 s | 0.40 | 0.00 | 0.21 |
| SmolVLM-256M | WebGPU (q4, embeddings fp16) | 201 MB | 7.5 s | 0.8 s | 1.38 GB | 0.36 s | **0.94** | 0.08 | 0.46 |
| Florence-2-base-ft | WebGPU (q4, vision fp16) | 343 MB | 9.3 s | 2.0 s | 1.59 GB | 0.34 s | 0.83 | 0.25 | 0.46 |
| TrOCR-small | WASM 4 threads (q8) | 65 MB | 3.4 s | 1.3 s | 0.92 GB | 0.23 s | 0.51 | 0.00 | 0.13 |
| SmolVLM-256M | WASM 4 threads (q8) | 251 MB | 7.0 s | 0.9 s | 1.59 GB | 1.59 s | 0.78 | 0.23 | 0.38 |
| Florence-2-base-ft | WASM 4 threads (q8) | 265 MB | 8.3 s | 1.4 s | 1.49 GB | 2.90 s | 0.56 | 0.28 | 0.54 |
| Florence-2-base-ft | WASM 4 threads (WebGPU's dtypes) | 343 MB | 10.3 s | 2.1 s | 2.06 GB | 3.06 s | 0.80 | 0.22 | 0.54 |
| TrOCR-small | WASM 1 thread (q8) | 65 MB | 3.7 s | 1.4 s | 0.92 GB | 0.73 s | 0.51 | 0.00 | 0.13 |
| SmolVLM-256M | WASM 1 thread (q8) | 251 MB | 7.8 s | 0.8 s | 1.41 GB | 5.46 s | 0.78 | 0.23 | 0.38 |
| Florence-2-base-ft | WASM 1 thread (q8) | 265 MB | 8.3 s | 1.4 s | 1.29 GB | 10.25 s | 0.56 | 0.28 | 0.54 |

¹ Signal names only: no model named a gate type, so a schematic score is the share of A, B, C, F it
mentioned.

What the answers look like (WebGPU):

| Sample | Truth | TrOCR-small | SmolVLM-256M | Florence-2-base-ft |
|---|---|---|---|---|
| e2 | `F = A·B + C'` | `F-A.Bt ( "` | `F=A\cdot B+C^{\prime}` | `F= A.B + C` |
| e4 | `S = A ⊕ B` | `S-A-O.B.` | `S=A\oplus B` | `S=A+B` |
| e5 | `Z = A'B + AB'` | `2 - A"B + AB'` | `Z=A^{B}+AB^{\prime}` | `Z = A8 + A8` |
| t1 | 4 rows of A B \| F | `# STS` | `\frac{0\cdot0+0+0+…` | `ABIFO0O0oO0-0O1O0` |
| s2 | AND and OR gates | `# DVD F.` | `\lfloor{D_{\mathbb{D}}…` | "A simple black drawing of a arrow…" |

Observations:

- **Quantisation matters for the vision encoder.** Florence-2's 8-bit vision encoder on WebAssembly
  falls from 0.83 to 0.56 on expressions; with WebGPU's fp16 encoder, still on WebAssembly, it is back
  at 0.80 for the same time. SmolVLM's 8-bit build loses `⊕` (read `⊗`) and the first complement of
  e5 (0.94 → 0.78).
- **SmolVLM answers in LaTeX** for expressions: a post-processor maps it to Silinx's notation
  (`\cdot` → `·`, `^{\prime}` → `'`, `\oplus` → `⊕`, `\overline{X}`).
- **Tables are out of reach** of these models: none returns rows; SmolVLM loops on `0+0+…` until the
  token limit. TrOCR reads one line of text by design.
- **Schematics are out of reach**: the general captioner (Florence-2's `<MORE_DETAILED_CAPTION>`) sees
  pots, flowers and arrows; SmolVLM lists letters. Reading gates would need a model trained on them.
- **Speed scales with threads**: one WebAssembly thread is 3–4× slower than four. A page that is not
  cross-origin isolated has one thread; Silinx's browser edition would need COOP/COEP (or the
  standalone edition's server) to get them.

## Licences (all compatible with AGPL-3.0-only)

The weights are not part of Silinx: they would be downloaded by the user's browser on demand, like
Yosys's WebAssembly, and the licence and source of each would be shown before downloading.

| Model | Weights' licence | Notes |
|---|---|---|
| TrOCR-small-handwritten (Microsoft; ONNX by Xenova) | MIT | The model card states none; the weights are released in microsoft/unilm, MIT. Fine-tuned on the IAM handwriting database, whose own licence is for non-commercial research: a fine-tune of ours would not use IAM |
| SmolVLM-256M-Instruct (Hugging Face) | Apache-2.0 | Built on SmolLM2-135M (Apache-2.0) and SigLIP base (Apache-2.0); Apache-2.0 is compatible with (A)GPL-3.0 |
| Florence-2-base-ft (Microsoft; ONNX by onnx-community) | MIT | |
| Transformers.js 4.3.1, ONNX Runtime Web | Apache-2.0, MIT | Would be listed in THIRD-PARTY-NOTICES if shipped |

## Measuring on the BenQ board (Android Chrome)

WebGPU and cross-origin isolation need a secure origin; the board reaches the Mac over plain HTTP, so
Chrome is told to treat that one address as secure.

1. On the Mac, in the repository: `node research/ink-models/serve.mjs` — it prints the page's address
   on the network (`http://<the Mac's address>:8790/`). The board and the Mac on the same network.
2. On the board, in Chrome: open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter that
   address (`http://<the Mac's address>:8790`), set it to **Enabled**, **Relaunch**.
3. Open the address. The line under the title says whether WebGPU is there (Android 12+ with a
   supported GPU) and whether the page is cross-origin isolated (it should say yes).
4. **Run every model** with WebGPU if offered, then choose WebAssembly and **Run every model** again.
   The first run downloads about 0.6 GB per backend (cold loads); press **Clear the model cache**
   first to measure a cold load again. Then **Save results** (a JSON in Downloads).
5. Draw your own: pick Expression, Truth table or Schematic, write on the canvas with the pen,
   **Recognize**; **Save PNG** keeps it (real board drawings can replace the generated samples).
6. Memory: the page shows a measure when Chrome gives one (the JSON's `memoryAfterRunMB`; it does not
   count GPU memory); otherwise Android's Settings ▸ Developer options ▸ Memory shows Chrome's use.

Copy the JSON into `results/benq-re7504.json`; `node research/ink-models/report.mjs` adds its table.
Expect the board to be several times slower than the Mac on WebAssembly (its A73 cores against the
Mac's): a few seconds per expression for SmolVLM on 4 threads, ten or more for Florence-2. Under
about 3 s per drawing would make SmolVLM usable for expressions.

## Recommendation

| Drawing | Model? | Instead |
|---|---|---|
| Expressions | Not needed now. If the templates fall short: SmolVLM-256M on WebGPU zero-shot (or a TrOCR-small fine-tuned on synthetic Boolean expressions: 65 MB, 0.2 s), its answer kept only when Silinx's parser accepts it | The template recognizer, per character: a small alphabet (A–Z, 0/1, `= + · ' ⊕ ( )`, `not and or`) |
| Truth tables | No: none of the models reads them | The grid from the ruled lines (or the cells' positions), each cell a `0` or `1` for the template recognizer, or a tiny digit classifier (an MNIST-sized network, under 1 MB) |
| Schematics | No: none of the models understands gates | The template recognizer's shapes (gate outlines, wires, labels); if a model is ever needed, a small object detector trained on synthetic Silinx-style gate drawings (fine-tuning is required) |

Fine-tuning on Silinx-style drawings: not needed for expressions with SmolVLM; needed for any model on
tables or schematics, and for TrOCR on expressions. The generator here (`gen-samples.mjs`) is a start
for synthetic training data, but real board drawings should be collected first (the page's Save PNG).

## Limits

- The samples are generated from handwriting fonts and wobbly lines, not real pen strokes on the board;
  real ink is thicker, less regular and may be anti-aliased differently.
- Ten samples: scores are indicative, one answer moves an expression score by 0.17.
- Memory on the Mac is the resident memory of all Chrome processes, including what Chrome does
  anyway when a page runs a model; `performance.measureUserAgentSpecificMemory` did not answer in
  headless Chrome.
- The Mac is not the board. The board's figures are the ones that decide.
