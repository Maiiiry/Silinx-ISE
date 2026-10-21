// Silinx test design (compiled simulator, #845): a PLL_BASE whose RST is an active-low button (as the Clocking
// Wizard's reset, inverted), a second one reset by a register of the first one's CLKOUT2 domain, a DCM_SP clocked by
// a third PLL's CLKOUT0 (a cascade); BUFIO2s on the main clock (inverted, divided by 3) and on a PLL output (DIVIDE
// bypassed, its SERDESSTROBE 0); counters on their clocks, a BUFGCE of a reset PLL's clock, the LOCKEDs.
module pll_rst_v (
    input  wire       clk, rst_n, ce,
    input  wire [3:0] d,
    output wire       lock_a, lock_b, lock_c, lock_d, strobe_b,
    output reg  [7:0] na0 = 0, na1 = 0, na1f = 0, nb0 = 0, nb3 = 0, nce = 0, nc = 0, ndfx = 0, ndv = 0, nio = 0, nio_d = 0, nio_b = 0,
    output reg  [3:0] na2 = 0
);
    wire fa, a0, a1, a2, b0, b3, c0u, c0, dfx, ddv, gclk, io, io_div, io_b;
    PLL_BASE #(.CLKFBOUT_MULT(10), .DIVCLK_DIVIDE(1), .CLKIN_PERIOD(20.0), .CLKOUT0_DIVIDE(10), .CLKOUT1_DIVIDE(4),
        .CLKOUT1_DUTY_CYCLE(0.4), .CLKOUT1_PHASE(45.0), .CLKOUT2_DIVIDE(25)) pll_a (
        .CLKIN(clk), .CLKFBIN(fa), .RST(~rst_n), .CLKFBOUT(fa), .CLKOUT0(a0), .CLKOUT1(a1), .CLKOUT2(a2), .LOCKED(lock_a));
    PLL_BASE #(.CLKFBOUT_MULT(4), .DIVCLK_DIVIDE(2), .CLKIN_PERIOD(20.0), .CLKOUT0_DIVIDE(1), .CLKOUT3_DIVIDE(6), .CLKOUT3_PHASE(180.0)) pll_b (
        .CLKIN(clk), .RST(na2[3]), .CLKOUT0(b0), .CLKOUT3(b3), .LOCKED(lock_b));
    PLL_BASE #(.CLKFBOUT_MULT(6), .CLKIN_PERIOD(20.0), .CLKOUT0_DIVIDE(12)) pll_c (
        .CLKIN(clk), .RST(1'b0), .CLKOUT0(c0u), .LOCKED(lock_c));
    BUFG bc (.I(c0u), .O(c0));
    DCM_SP #(.CLKFX_MULTIPLY(3), .CLKFX_DIVIDE(2), .CLKDV_DIVIDE(4.0)) dcm_d (
        .CLKIN(c0), .RST(1'b0), .CLKFX(dfx), .CLKDV(ddv), .LOCKED(lock_d));
    BUFGCE gce (.I(b0), .CE(ce), .O(gclk));
    BUFIO2 #(.DIVIDE(3), .DIVIDE_BYPASS("FALSE"), .I_INVERT("TRUE")) bio (.I(clk), .IOCLK(io), .DIVCLK(io_div));
    BUFIO2 #(.DIVIDE(4), .DIVIDE_BYPASS("TRUE")) bio_b (.I(a1), .DIVCLK(io_b), .SERDESSTROBE(strobe_b));

    always @(posedge a0) na0 <= na0 + d;
    always @(posedge a1) na1 <= na1 + 1;
    always @(negedge a1) na1f <= na1f + 3;
    always @(posedge a2) na2 <= na2 + 1;
    always @(posedge b0) nb0 <= nb0 + 1;
    always @(posedge b3) if (lock_b) nb3 <= nb3 + 5;
    always @(posedge gclk) nce <= nce + 1;
    always @(posedge c0) nc <= nc + 1;
    always @(posedge dfx) ndfx <= ndfx + 1;
    always @(posedge ddv) ndv <= ndv + d;
    always @(negedge io) nio <= nio + 1;   // (its rising edge: x to 1 at time 0 in the event-driven simulator)
    always @(posedge io_div) nio_d <= nio_d + 2;
    always @(posedge io_b) nio_b <= nio_b + 1;
endmodule
