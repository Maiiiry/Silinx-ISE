# A third interface, organised around the tasks (#782): inventory and mock-ups

Steps 1 and 2 of #782. Nothing here is part of the app: `web/` does not load these files, the server
does not serve them and the standalone build does not include them.

| File | What it is |
|---|---|
| `inventory.md` | Step 1: every panel, console, view, dialog, menu and process of the app (15.11.3), where each message goes, the tasks of a lab session in order, what each task needs on screen and what is in the way |
| `index.html`, `mockups.css`, `mockups.js` | Step 2: clickable mock-ups of three directions (A task workspaces, B the flow, C stage and dock), each covering the five tasks (edit, simulate, emulate, implement, program) at four screens (lab desktop 1920 × 1080, laptop 1366 × 768, tablet landscape 1180 × 820 and portrait 820 × 1180), in English and Portuguese, light and dark |

Open `index.html` in a browser: no build step and no server (the IBM Plex fonts come from Google Fonts,
with system fonts as the fallback). Each screen is laid out at its real pixel size and scaled to fit;
"100%" shows it unscaled. A view has a link of its own: `index.html#<direction>-<task>-<screen>[-pt]`,
for example `#b-sim-tabp` or `#a-emu-laptop-pt` (tasks `edit sim emu impl prog`, screens
`desk laptop tabl tabp all`).

The content is the pong example's (`examples/pong`): its hierarchy and sources, a simulation of
`tb_pong` (a ball step every 640 ns), the Basys2 with a small model of the game (BTN0 serves, BTN3
returns the ball at LED 7, BTN1 / BTN2 pause, SW0 resets), and the reports and messages the app printed
for it (utilization 243 slices, PERIOD 20 ns met at 11.724 ns, `pong.bit` 165 KB).

The choice of a direction (step 3) is the maintainer's, on #782.
