In short:

- **The single file:** opened from the disk, it no longer downloads what Implement needs (Yosys, about 17 MB) in
  the background when a project opens; the first Implement downloads it, as before.

In detail:

- **No prefetch of Implement's assets in a page opened from a file (#1450):** the background download of #967
  was meant only for the site, but WebKit and Firefox give a file:// page a Cache Storage and call it a secure
  context, so the single file downloaded Yosys, the device description and its bit database from the site; a
  navigation that cancelled it (a reload) was a console error in WebKit ("Fetch API cannot load … due to access
  control checks"), the failure at times of the standalone edition's test in the release CI.
