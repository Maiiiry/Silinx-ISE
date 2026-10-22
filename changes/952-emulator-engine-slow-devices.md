In short:

- **Board Emulator on a tablet or a phone:** it starts at once on the event-driven engine, instead of compiling the
  design first; the Engine selector still runs it compiled, and the engine you choose is remembered.

In detail:

- **The event-driven engine by default on slow devices (#952):** a phone or tablet (User-Agent Client Hints'
  `mobile`, a mobile User-Agent, an iPad that says it is a Mac but has a touch screen), fewer than 4 processor
  cores or less than 4 GB of memory (`deviceMemory`) start the Board Emulator on the event-driven engine, and its
  side panel says why; a browser API that is missing says nothing (`core/emulate-engine.js`). The engine the user
  chooses in the Engine selector is remembered and wins over the default, on any device.
