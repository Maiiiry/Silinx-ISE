// Open-flow test (#96): feat_iob_ddr in Verilog. The IOBs' DDR registers on the 50 MHz clock (B8) and its inverse:
// two IDDR2 (sw[0]: a clock enable and a synchronous reset, INIT_Q1 = 1; sw[1]: an asynchronous set) and three ODDR2
// (led[0]: a clock enable and a synchronous reset; led[1]: an asynchronous set, INIT = 1; led[2]: no set / reset),
// their data from the IDDR2s and the switches; led[3] the four captured bits through the fabric.
module top (input clk, input [3:0] sw, input [1:0] btn, output [3:0] led);
  wire ck, ckn = ~ck;
  wire [1:0] q0, q1;
  BUFG u_b (.I(clk), .O(ck));
  IDDR2 #(.DDR_ALIGNMENT("NONE"), .INIT_Q0(1'b0), .INIT_Q1(1'b1), .SRTYPE("SYNC"))
    u_i0 (.D(sw[0]), .C0(ck), .C1(ckn), .CE(btn[0]), .R(btn[1]), .S(1'b0), .Q0(q0[0]), .Q1(q1[0]));
  IDDR2 #(.DDR_ALIGNMENT("NONE"), .INIT_Q0(1'b0), .INIT_Q1(1'b0), .SRTYPE("ASYNC"))
    u_i1 (.D(sw[1]), .C0(ck), .C1(ckn), .CE(1'b1), .R(1'b0), .S(btn[1]), .Q0(q0[1]), .Q1(q1[1]));
  ODDR2 #(.DDR_ALIGNMENT("NONE"), .INIT(1'b0), .SRTYPE("SYNC"))
    u_o0 (.D0(q0[0] ^ q1[1]), .D1(q1[0]), .C0(ck), .C1(ckn), .CE(btn[0]), .R(btn[1]), .S(1'b0), .Q(led[0]));
  ODDR2 #(.DDR_ALIGNMENT("NONE"), .INIT(1'b1), .SRTYPE("ASYNC"))
    u_o1 (.D0(q0[1]), .D1(sw[2]), .C0(ck), .C1(ckn), .CE(1'b1), .R(1'b0), .S(btn[1]), .Q(led[1]));
  ODDR2 #(.DDR_ALIGNMENT("NONE"), .INIT(1'b0), .SRTYPE("SYNC"))
    u_o2 (.D0(sw[3]), .D1(q1[1]), .C0(ck), .C1(ckn), .CE(1'b1), .R(1'b0), .S(1'b0), .Q(led[2]));
  assign led[3] = q0[0] ^ q1[0] ^ q0[1] ^ q1[1];
endmodule
