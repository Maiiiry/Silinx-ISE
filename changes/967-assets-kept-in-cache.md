In short:

- **Implement in the browser, faster the first time:** the site downloads Yosys (17 MB) and the board's device
  description when a project opens, in the background, and keeps them; Implement no longer waits for them,
  nor downloads them again after the site is updated.

In detail:

- **The browser edition's assets kept in Cache Storage (#967):** Yosys in WebAssembly and the device descriptions
  and bit database, whose URLs name their version, are read from the browser's Cache Storage with no request
  (`web/js/asset-cache.js`, in the flow's worker and the Yosys workers). The HTTP cache kept them 10 minutes
  (GitHub Pages' `max-age=600`), and every deployment of the site changed their ETags, so that Implement
  downloaded the 16.7 MB again; measured, the first Implement of blinky took 18.9 s instead of 5.7 s at 10 Mbit/s,
  and the download from the site alone 36 to 169 s. They are fetched when a project opens (not with Save-Data or
  on 2G/3G), the older versions' entries deleted; the console says "Downloading Yosys … about 17 MB: once" when it
  has to. A page opened from a file has no Cache Storage: the HTTP cache, as before.
