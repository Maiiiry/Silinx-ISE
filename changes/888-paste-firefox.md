In short:

- **Paste in Firefox and Safari:** Edit ▸ Paste no longer opens the browser's own Paste prompt nor waits for it; it
  pastes what was copied in Silinx (Ctrl+V still pastes from other applications).

In detail:

- **Edit ▸ Paste and the system clipboard (#888):** the system clipboard is read only where the browser has a
  clipboard-read permission (Chromium), and waited for 300 ms at most. Firefox and Safari answer a read with a
  Paste prompt of their own, which held the paste and stayed open in the way of the next clicks
  (web/js/clipboard.js).
