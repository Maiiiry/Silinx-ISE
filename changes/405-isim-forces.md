In detail:

- **mountISim split, second part: the paths and the forces (#405):** finding a signal or an instance by its path and
  the forces (isim force add / remove, the drawn stimuli's) as pseudo-processes of the simulator move from `mountISim`
  to `mountForces(ctx)` of `web/js/isim-forces.js`, called where the code was, with no change in behaviour.
  `test/web-isim-forces.test.js` checks the paths and the forces on the simulator itself.
