In detail:

- **The register file as distributed RAM, measured after #370 (#54):** research/synth-quality/README.md has IWLS'05
  simple_spi's trce (at Normal 3.3 % faster, at High 1.8 % slower in the mean, within the seeds' spread, 11 % fewer
  slices at both) and the T80 at High with #370's `DEPTH_ABC2_LUT4`: 992 slices (XST 1000), trce 21.34 ns (main's
  21.67). Normal's RAM remap stays on `DEPTH_ABC2` (the T80 1009 slices, 20.36 ns; with `DEPTH_ABC2_LUT4` 992 slices,
  4.8 % slower).
