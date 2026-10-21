In detail:

- **The Spartan-6's first ISE measurements (#721, #723, #724, #1):** night 1 of `research/s6` run on ISE 14.7: the
  device reports of the XC6SLX16 and XC6SLX45 (their tiles, sites and PIPs: DS160's slices exactly), the empty
  designs' bitstreams (the UG380 packet sequence, the IDCODEs confirmed), and the seven examples implemented from
  HDL and from Silinx's netlist on the Nexys3 and the Atlys, all routed; recorded as `research/s6/measured/night1.json`
  and in the research note. The packer's SLICELs are map's on every example (a test); map's SLICEX are a placement's.
  The scripts' fixes: the empty designs uploaded, `ngdbuild -aul` for Silinx's netlists, one device report at a time.
