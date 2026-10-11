// Open-flow board test (Basys2-250): shift registers in SRL16 LUTs. btn[0] enters eight delay
// lines clocked at about 6 Hz: LED k lights 4k ticks after the button (LED 0 at once, LED 7
// about 4.7 s later), and goes out as late after it is released: a slow wave across the LEDs.
// sw[0] = 1 freezes the delay lines (their shift enable).
module top (
    input  wire       clk,
    input  wire [7:0] sw,
    input  wire [3:0] btn,
    output wire [7:0] led
);
    reg [22:0] cnt = 23'd0;
    reg        tick = 1'b0;
    reg        b = 1'b0;
    always @(posedge clk) begin
        cnt <= cnt + 23'd1;
        tick <= cnt == 23'd0 && !sw[0];
        b <= btn[0];
    end

    // one delay line per LED (a chain of flip-flops without reset: SRL16E, 16 stages each)
    reg [3:0]  d1 = 4'd0;
    reg [7:0]  d2 = 8'd0;
    reg [11:0] d3 = 12'd0;
    reg [15:0] d4 = 16'd0;
    reg [19:0] d5 = 20'd0;
    reg [23:0] d6 = 24'd0;
    reg [27:0] d7 = 28'd0;
    always @(posedge clk) if (tick) begin
        d1 <= {d1[2:0], b};
        d2 <= {d2[6:0], b};
        d3 <= {d3[10:0], b};
        d4 <= {d4[14:0], b};
        d5 <= {d5[18:0], b};
        d6 <= {d6[22:0], b};
        d7 <= {d7[26:0], b};
    end
    assign led = {d7[27], d6[23], d5[19], d4[15], d3[11], d2[7], d1[3], b};
endmodule
