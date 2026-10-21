// Open-flow test (#96): feat_iob_bidir in Verilog. Bidirectional pads (IOBUF): io[0] driven with a register's value
// while sw[0] is 1, io[1] with sw[1] while sw[0] is 0; the register captures io[1] on the 50 MHz clock (B8); led[0]
// shows io[0], led[1] io[1] xor the register.
module top (input clk, input [1:0] sw, inout [1:0] io, output [1:0] led);
  reg r = 1'b0;
  always @(posedge clk) r <= io[1];
  assign io[0] = sw[0] ? r : 1'bz;
  assign io[1] = !sw[0] ? sw[1] : 1'bz;
  assign led = {io[1] ^ r, io[0]};
endmodule
