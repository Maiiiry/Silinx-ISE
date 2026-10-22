In detail:

- **core/fpga/route.js split: routeDesign's power nets, delays, polish and output (#405):** the power nets with no
  source (route-power.js), the connections' delays (route-delays.js), the polish after the routing (route-polish.js)
  and the routed design written (route-output.js) move to mounts of their own, called where they were (routeDesign
  484 → 291 lines). No change in behaviour: the 92 routings of the router's, placer's and I/O registers' tests are
  byte-identical to before, no slower. Tests: `test/route-parts.test.js`.
