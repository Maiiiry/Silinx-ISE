// Open-flow board test (Basys2-250): shift registers read at a variable tap, in SRL16 LUTs (#5).
// btn[0] .. btn[3] enter delay lines clocked at about 6 Hz; the switches choose the tap:
//   led[0]   : a 16-stage line read at sw[3:0] (one SRL16E)
//   led[1]   : a 40-stage line on the falling edge read at {sw[7:4], sw[1:0]} (SRL16E_1, two per 16)
//   led[5:2] : a 16 x 4 array shifted word by word (btn[3:0] in), read at sw[7:4] (an SRL16E per bit)
//   led[6]   : the 16-stage line's last stage, led[7]: btn[0] itself
module top (
    input  wire       clk,
    input  wire [7:0] sw,
    input  wire [3:0] btn,
    output wire [7:0] led
);
    reg [22:0] cnt = 23'd0;
    reg        tick = 1'b0;
    reg [3:0]  b = 4'd0;
    always @(posedge clk) begin
        cnt <= cnt + 23'd1;
        tick <= cnt == 23'd0;
        b <= btn;
    end

    reg [15:0] r16 = 16'd0;
    always @(posedge clk) if (tick) r16 <= {r16[14:0], b[0]};

    reg [39:0] r40 = 40'd0;
    always @(negedge clk) if (tick) r40 <= {r40[38:0], b[1]};

    reg [3:0] m [0:15];
    integer i;
    always @(posedge clk) if (tick) begin
        for (i = 15; i > 0; i = i - 1) m[i] <= m[i - 1];
        m[0] <= b;
    end

    assign led = {b[0], r16[15], m[sw[7:4]], r40[{sw[7:4], sw[1:0]}], r16[sw[3:0]]};
endmodule
