// input pads that drive nothing: the clock and the buttons (#18)
module top(input clk, input [7:0] sw, input [3:0] btn, output [7:0] led);
  assign led = sw;
endmodule
