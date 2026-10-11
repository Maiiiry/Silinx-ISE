# Device descriptions shipped with Silinx

`<part>.json.gz`: the routing graph of a device (its tiles, sites, wires and routing switches) in
Silinx's own packed format (`core/fpga/device.js`, `packDevice`), used by the open toolchain's
placer, router and bitstream writer (`core/fpga/`).

| File | Device | Board |
|---|---|---|
| `xc3s250ecp132-4.json.gz` | XC3S250E, CP132 package (any speed grade) | Digilent Basys2-250 |

Each file was computed by Silinx from the output of ISE 14.7's documented
`xdl -report -pips -all_conns <part>` command (`xdl` P.20131013), with
`research/s3e-route/build-device.mjs`. It is not that report, nor any file of ISE's installation.
For any other device, Silinx builds the description once from the user's own ISE installation and
keeps it in `~/.silinx/devices/`, which takes precedence over the files here. See
[docs/OPEN-TOOLCHAIN.md](../../../docs/OPEN-TOOLCHAIN.md).
