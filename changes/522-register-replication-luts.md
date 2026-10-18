In short:

- **Faster circuits from register replication:** when a reset or clock enable computed by logic drives many
  flip-flops on the critical path, its LUT is now copied too, as register replication already copied
  flip-flops; the design corpus's vtr-ch-intrinsics is 7 % faster (6.43 ns to 5.99 by ISE's trce). The
  replication's second placement starts from the first one, so it takes a fraction of the time (0.4 s instead
  of 8 s on the T80).

In detail:

- **Register replication: the second placement from the first one (#87):** the replicated design is placed
  from the first placement (place.js option `start`, replicate.js `warmStart`: each slice on the slice of its
  cells, a copy on the free slice nearest the centre of its loads, pads, block RAMs and multipliers on their
  sites), then only the placer's greedy pass runs (a window of 3 slices, `WARM`). Placed from scratch, the noise
  of a new placement (±0.5 ns on the T80) hid what the copies gained. epfl-bar keeps its replication (10.98 to
  10.73 ns) with a 0.1 s placement instead of 3 s.
- **Register replication of LUTs (#522):** replicationPlan also takes the LUT1-4 at F / G whose X / Y output
  drives many critical loads (a reset or clock enable computed by logic, on SR / CE pins; REPLICATION.luts),
  its loads in its own slice left on it; replicateFlipFlops is now replicateCells. vtr-ch-intrinsics (Normal,
  XC3S1200E): its reset LUT on 32 FDRE.R copied, 6.43 to 5.99 ns by ISE's trce (ISE 5.06); t80 and
  iwls05-usb-phy unchanged. Not closed: the logic before that LUT is a chain of three LUT2s of fanout ~33 each,
  and a sync reset moved into the D LUTs was 2 % faster on ch-intrinsics but 4 % slower on usb-phy, so it is not
  done (research/s3e-route/README.md).
