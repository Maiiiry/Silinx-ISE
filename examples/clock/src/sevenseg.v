// Silinx example (clock): the 4-digit 7-segment display of the Basys2 / Nexys2, multiplexed: one
// digit at a time, each for REFRESH clock cycles (1 ms at 50 MHz: the four digits seem lit at once).
// Segments, decimal point and anodes are active low; seg[0] is segment a ... seg[6] is segment g.
// Each digit: 0-9 a number, 15 blank. points[i]: the decimal point of digit i.
module sevenseg #(
    parameter REFRESH = 50000
) (
    input  wire        clk,
    input  wire [15:0] digits,                // digit 3 (left) .. digit 0 (right), 4 bits each
    input  wire [3:0]  points,
    output reg  [6:0]  seg,
    output wire        dp,
    output wire [3:0]  an
);
    reg [15:0] count = 16'd0;
    reg [1:0]  sel = 2'd0;
    // the digit shown now
    wire [3:0] d = (sel == 2'd0) ? digits[3:0] : (sel == 2'd1) ? digits[7:4] : (sel == 2'd2) ? digits[11:8] : digits[15:12];

    always @(posedge clk) begin
        if (count == REFRESH - 1) begin
            count <= 16'd0;
            sel   <= sel + 2'd1;
        end else
            count <= count + 16'd1;
    end

    assign an = ~(4'b0001 << sel);
    assign dp = ~points[sel];

    always @(*) begin
        case (d)                              //  gfedcba
            4'd0:  seg = 7'b1000000;
            4'd1:  seg = 7'b1111001;
            4'd2:  seg = 7'b0100100;
            4'd3:  seg = 7'b0110000;
            4'd4:  seg = 7'b0011001;
            4'd5:  seg = 7'b0010010;
            4'd6:  seg = 7'b0000010;
            4'd7:  seg = 7'b1111000;
            4'd8:  seg = 7'b0000000;
            4'd9:  seg = 7'b0010000;
            default: seg = 7'b1111111;        // blank
        endcase
    end
endmodule
