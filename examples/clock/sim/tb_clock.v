// Test bench for digital_clock: a fast clock (a second every 64 clock cycles, a 2-cycle debounce, 2
// cycles per display digit). Reads the time off the display and the LEDs, as a person would: 00.00
// after reset, the seconds on LD5-LD0, the first minute (00.01), the minutes and seconds (BTN0),
// the time set to 23.59 with the buttons and the seconds zeroed (BTN1), midnight (00.00), and the
// 12-hour display (12.00 at midnight, " 1.00" with LD6 lit at 13 h).
`timescale 1ns / 1ps
module tb_clock;
    localparam T = 64;                        // clock cycles per second
    reg        clk = 1'b0;
    reg  [1:0] sw = 2'b01;                    // in reset
    reg  [3:0] btn = 4'b0000;
    wire [7:0] led;
    wire [6:0] seg;
    wire [3:0] an;
    wire       dp;
    integer    errors = 0, k;

    digital_clock #(.TICK(T), .STABLE(2), .REFRESH(2)) uut (
        .clk(clk), .sw(sw), .btn(btn), .led(led), .seg(seg), .an(an), .dp(dp));

    always #10 clk = ~clk;

    // the digit a segment pattern shows (15: blank, 14: not a digit)
    function [3:0] digit_of(input [6:0] s);
        case (s)
            7'b1000000: digit_of = 4'd0;  7'b1111001: digit_of = 4'd1;  7'b0100100: digit_of = 4'd2;
            7'b0110000: digit_of = 4'd3;  7'b0011001: digit_of = 4'd4;  7'b0010010: digit_of = 4'd5;
            7'b0000010: digit_of = 4'd6;  7'b1111000: digit_of = 4'd7;  7'b0000000: digit_of = 4'd8;
            7'b0010000: digit_of = 4'd9;  7'b1111111: digit_of = 4'd15;
            default:    digit_of = 4'd14;
        endcase
    endfunction

    // the four digits on the display, left to right, 4 bits each
    task read_display(output [15:0] v);
        integer d, n;
        begin
            for (d = 3; d >= 0; d = d - 1) begin
                n = 0;
                while (an !== ~(4'b0001 << d) && n < 20) begin @(posedge clk); n = n + 1; end
                #1;
                v[d * 4 +: 4] = digit_of(seg);
            end
        end
    endtask

    task expect_display(input [15:0] want, input [8*28-1:0] what);
        reg [15:0] v;
        begin
            read_display(v);
            if (v !== want) begin $display("ERROR: %0s: the display shows %h, expected %h", what, v, want); errors = errors + 1; end
        end
    endtask

    task press(input integer b);
        begin
            btn[b] = 1'b1; repeat (6) @(posedge clk);
            btn[b] = 1'b0; repeat (6) @(posedge clk);
        end
    endtask

    task seconds(input integer n);
        begin repeat (n * T) @(posedge clk); end
    endtask

    initial begin
        repeat (4) @(posedge clk);
        sw = 2'b00;
        expect_display(16'h0000, "after reset: 00.00");
        seconds(5);
        if (led[5:0] < 6'd4 || led[5:0] > 6'd5) begin $display("ERROR: after 5 s the seconds LEDs show %0d", led[5:0]); errors = errors + 1; end
        // the decimal point between hours and minutes blinks
        k = 0;
        while (!(an === 4'b1011 && dp === 1'b0) && k < 2 * T) begin @(posedge clk); k = k + 1; end
        if (k >= 2 * T) begin $display("ERROR: the decimal point of digit 2 never lights"); errors = errors + 1; end
        k = 0;
        while (!(an === 4'b1011 && dp === 1'b1) && k < 2 * T) begin @(posedge clk); k = k + 1; end
        if (k >= 2 * T) begin $display("ERROR: the decimal point of digit 2 never goes out"); errors = errors + 1; end
        // the first minute
        seconds(57);
        expect_display(16'h0001, "after a minute: 00.01");
        // minutes and seconds
        press(0);
        begin : mmss
            reg [15:0] v;
            read_display(v);
            // a minute and a few seconds
            if (v[15:4] !== 12'h010) begin $display("ERROR: BTN0: the display shows %h, expected 01.0x (MM.SS)", v); errors = errors + 1; end
        end
        press(0);
        // set 23.59 with the buttons, zero the seconds: midnight a minute later
        for (k = 0; k < 23; k = k + 1) press(3);
        for (k = 0; k < 58; k = k + 1) press(2);
        expect_display(16'h2359, "set to 23.59");
        press(1);
        if (led[5:0] !== 6'd0) begin $display("ERROR: BTN1 did not zero the seconds (%0d)", led[5:0]); errors = errors + 1; end
        seconds(61);
        expect_display(16'h0000, "midnight: 00.00");
        // 12-hour display
        sw[1] = 1'b1;
        expect_display(16'h1200, "12-hour: 12.00 at midnight");
        if (led[6] !== 1'b0) begin $display("ERROR: LD6 lit before noon"); errors = errors + 1; end
        for (k = 0; k < 13; k = k + 1) press(3);
        expect_display(16'hF100, "12-hour: 1.00 at 13 h");
        if (led[6] !== 1'b1) begin $display("ERROR: LD6 not lit after noon"); errors = errors + 1; end
        if (errors == 0) $display("Simulation finished OK");
        else $display("ERROR: %0d check(s) failed", errors);
        $finish;
    end

    initial begin
        #20000000;
        $display("ERROR: timeout");
        $finish;
    end
endmodule
