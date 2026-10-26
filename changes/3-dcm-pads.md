In detail:

- **The measured XC3S250E description: the clock pads' dedicated paths to the DCMs, an input-only pad's clock pins
  (#3):** a design of the four DCMs on their clock pads, implemented by ISE, gives pad A9's path to DCM_X1Y1 (no design
  had taken it); a rule gives an I/O site's clock pins still not seen. The DCM and differential-pair tests pass on the
  measured graph (research/s3e-device README section 15).
