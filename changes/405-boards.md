In detail:

- **server/devices.js split: the boards in server/boards.js (#405):** the boards' table moves to a module of its
  own, the device family it shares with the parts to server/family.js; devices.js still exports both (devices.js
  1023 → 517 lines). No change in behaviour: the same device database, boards and every board and variant resolved
  as before. Tests: `test/boards.test.js`.
