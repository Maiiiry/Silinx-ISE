// Test bench for pong: fast parameters (a ball step every 32 clock cycles, a 2-cycle debounce, games
// of 2 points). Plays a game: the right player serves, the left player misses (1-0 on the display);
// the left player serves, a pause (BTN1) holds the ball and BTN2 goes on, the right player
// returns the ball (it comes back), the left player
// presses too early and misses although they press again in time (2-0: game over, the right half
// of the LEDs blinks); a button starts a new game (0-0, the right player serves).
`timescale 1ns / 1ps
module tb_pong;
    reg        clk = 1'b0;
    reg  [1:0] sw = 2'b01;                    // in reset
    reg  [3:0] btn = 4'b0000;
    wire [7:0] led;
    wire [6:0] seg;
    wire [3:0] an;
    wire       dp;
    integer    errors = 0;

    localparam [6:0] SEG0 = 7'b1000000, SEG1 = 7'b1111001, SEG2 = 7'b0100100, SEGDASH = 7'b0111111, SEGBLANK = 7'b1111111;
    reg  [7:0] snap;

    pong #(.TICK(32), .STABLE(2), .REFRESH(2), .WIN(2)) uut (
        .clk(clk), .sw(sw), .btn(btn), .led(led), .seg(seg), .an(an), .dp(dp));

    always #10 clk = ~clk;                    // 50 MHz

    // wait until the LEDs show v (at most n clock cycles)
    task wait_led(input [7:0] v, input integer n, input [8*24-1:0] what);
        integer k;
        begin
            k = 0;
            while (led !== v && k < n) begin @(posedge clk); k = k + 1; end
            if (led !== v) begin $display("ERROR: %0s: LEDs %b, expected %b", what, led, v); errors = errors + 1; end
        end
    endtask

    // press and release a button (long enough for the debouncer)
    task press(input integer b);
        begin
            btn[b] = 1'b1; repeat (6) @(posedge clk);
            btn[b] = 1'b0; repeat (6) @(posedge clk);
        end
    endtask

    // the segments of digit d (0 = right .. 3 = left) must be v
    task check_digit(input integer d, input [6:0] v, input [8*24-1:0] what);
        integer k;
        begin
            k = 0;
            while (an !== ~(4'b0001 << d) && k < 20) begin @(posedge clk); k = k + 1; end
            #1;
            if (seg !== v) begin $display("ERROR: %0s: digit %0d shows %b, expected %b", what, d, seg, v); errors = errors + 1; end
        end
    endtask

    initial begin
        repeat (4) @(posedge clk);
        sw = 2'b00;
        // the right player serves: their LED blinks
        wait_led(8'h01, 200, "right serves");
        check_digit(3, SEG0, "score left 0");
        check_digit(0, SEG0, "score right 0");
        press(0);
        wait_led(8'h80, 600, "ball at the left end");
        // the left player does not press: point for the right player
        wait_led(8'h0F, 200, "point for the right");
        check_digit(0, SEG1, "score right 1");
        check_digit(3, SEG0, "score left still 0");
        // the left player (who lost the point) serves
        wait_led(8'h80, 1000, "left serves");
        press(3);
        wait_led(8'h40, 200, "ball moves right");
        // pause (BTN1): the ball stays, the middle digits show dashes; BTN2 goes on
        press(1);
        snap = led;
        repeat (200) @(posedge clk);
        if (led !== snap) begin $display("ERROR: paused: the ball moved (%b -> %b)", snap, led); errors = errors + 1; end
        check_digit(1, SEGDASH, "paused: dash");
        press(2);
        check_digit(1, SEGBLANK, "going on: blank");
        wait_led(8'h01, 600, "ball at the right end");
        press(0);                             // in time: the ball comes back
        wait_led(8'h02, 200, "ball returned");
        wait_led(8'h08, 600, "ball on its way left");
        press(3);                             // too early: locked out
        wait_led(8'h80, 600, "ball at the left end again");
        press(3);                             // in time, but locked out
        wait_led(8'h0F, 200, "point for the right again");
        check_digit(0, SEG2, "score right 2");
        // game over: the winner's half blinks, the serve does not come back
        repeat (300) @(posedge clk);
        if (led !== 8'h0F && led !== 8'h00) begin $display("ERROR: game over: LEDs %b", led); errors = errors + 1; end
        wait_led(8'h00, 100, "game over blinks (off)");
        wait_led(8'h0F, 100, "game over blinks (on)");
        // any button: a new game
        press(3);
        wait_led(8'h01, 200, "new game: right serves");
        check_digit(0, SEG0, "new game: score right 0");
        if (dp !== 1'b1) begin $display("ERROR: the decimal point is lit"); errors = errors + 1; end
        if (errors == 0) $display("Simulation finished OK");
        else $display("ERROR: %0d check(s) failed", errors);
        $finish;
    end

    initial begin
        #2000000;
        $display("ERROR: timeout");
        $finish;
    end
endmodule
