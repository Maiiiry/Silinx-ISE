# silinx-fpga

The Silinx toolchain for Spartan-3E FPGAs (Basys2, Nexys2) without Xilinx tools: synthesis with Yosys in
WebAssembly, then pack, place, route, timing and bitstream, with the device data. It is being separated from
Silinx ISE, the IDE that uses it ([#1651](https://github.com/pmnmalo/Silinx-ISE/issues/1651), the plan:
[docs/TOOLCHAIN-SEPARATION.md](../../docs/TOOLCHAIN-SEPARATION.md)). For now this folder is the package's
workspace and holds no code yet: the toolchain still lives in `core/` of this repository and moves here step
by step. Not published yet.

Licence: Apache-2.0 ([LICENSE](LICENSE)), its code and its data.
