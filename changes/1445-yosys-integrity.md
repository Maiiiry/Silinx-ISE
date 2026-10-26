In detail:

- **Static editions: Yosys's bundle checked before it is imported (#1445):** the Yosys workers of the single-file edition
  and of the site fetch YoWASP's bundle.js and compare its SHA-256 with the one the build wrote into the page (the
  assets' integrity map, with the WebAssembly and the device files already in it) before importing it; a bundle that
  differs is refused with a message, Yosys is not run (`core/synth-open-yosys.js` verifiedYosysUrl). Nothing changes
  where the build wrote no digest (the local server). ELK needs no check: it is inlined in the page, never loaded from
  the site.
