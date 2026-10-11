// Open-flow board test (Basys2-250): the square of the switches on the 7-segment display.
//   sw[7:0]   the number n (also shown on the LEDs)
//   display   n * n in hexadecimal (4 digits), from a multiplier (MULT18X18) of the open synthesis
//   btn[0]    held: n * (n + 1) instead (a second multiplier)
// Example: sw = 00001111 -> 00E1; with btn[0] -> 00F0.
module top (
    input  wire       clk,
    input  wire [7:0] sw,
    input  wire [3:0] btn,
    output wire [7:0] led,
    output wire [6:0] seg,    // a..g, active low
    output wire       dp,
    output reg  [3:0] an      // active low, an[3] = leftmost digit
);
    reg  [7:0]  n = 8'd0;
    reg         b = 1'b0;
    wire [15:0] sq = n * n;
    wire [15:0] pr = n * (n + 8'd1);
    reg  [15:0] p = 16'd0;
    reg  [16:0] cnt = 17'd0;
    reg  [3:0]  nib;
    reg  [6:0]  s;

    always @(posedge clk) begin
        n <= sw;
        b <= btn[0];
        p <= b ? pr : sq;
        cnt <= cnt + 17'd1;
    end

    always @* begin
        case (cnt[16:15])
            2'd0: begin an = 4'b1110; nib = p[3:0]; end
            2'd1: begin an = 4'b1101; nib = p[7:4]; end
            2'd2: begin an = 4'b1011; nib = p[11:8]; end
            default: begin an = 4'b0111; nib = p[15:12]; end
        endcase
        case (nib)              // gfedcba, 1 = lit
            4'h0: s = 7'h3F; 4'h1: s = 7'h06; 4'h2: s = 7'h5B; 4'h3: s = 7'h4F;
            4'h4: s = 7'h66; 4'h5: s = 7'h6D; 4'h6: s = 7'h7D; 4'h7: s = 7'h07;
            4'h8: s = 7'h7F; 4'h9: s = 7'h6F; 4'hA: s = 7'h77; 4'hB: s = 7'h7C;
            4'hC: s = 7'h39; 4'hD: s = 7'h5E; 4'hE: s = 7'h79; default: s = 7'h71;
        endcase
    end

    assign seg = ~s;
    assign dp = 1'b1;
    assign led = n;
endmodule
