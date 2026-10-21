In short:

- **Paste in Firefox:** Edit ▸ Paste no longer waits for ever for Firefox's own Paste prompt; it pastes what was
  copied in Silinx.

In detail:

- **Edit ▸ Paste: the system clipboard waited for a moment only (#888):** Firefox holds a read of the system
  clipboard until the viewer clicks its Paste prompt. After 300 ms the app's own copy is pasted instead
  (web/js/clipboard.js).
