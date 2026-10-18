// Silinx test design (compiled simulator, #465): a DCM whose RST is an active-low button (as a coregen
// wrapper's RST_IN, inverted), a second one reset by a register of the first one's CLKDV domain (a reset at a
// time of the DCMs' own edges); counters on their clocks, a BUFGCE of a reset DCM's clock, both LOCKED.
module dcm_rst_v (
    input  wire       clk, rst_n, ce,
    input  wire [3:0] d,
    output wire       lock_a, lock_b,
    output reg  [7:0] na = 0, n2x = 0, nfx = 0, nfx180 = 0, nb0 = 0, nb180 = 0, nbfx = 0, nce = 0,
    output reg  [3:0] ndv = 0
);
    wire a0u, a0, a2x, adv, afx, afx180, b0, b180, bfx, gclk;
    DCM_SP #(.CLKDV_DIVIDE(1.5), .CLKFX_MULTIPLY(7), .CLKFX_DIVIDE(3), .CLKIN_PERIOD(20.0)) dcm_a (
        .CLKIN(clk), .CLKFB(a0), .RST(~rst_n), .CLK0(a0u), .CLK2X(a2x), .CLKDV(adv), .CLKFX(afx), .CLKFX180(afx180), .LOCKED(lock_a));
    BUFG ba0 (.I(a0u), .O(a0));
    DCM_SP #(.CLKFX_MULTIPLY(2), .CLKFX_DIVIDE(3), .CLKIN_DIVIDE_BY_2("TRUE"), .CLKIN_PERIOD(20.0)) dcm_b (
        .CLKIN(clk), .RST(ndv[3]), .CLK0(b0), .CLK180(b180), .CLKFX(bfx), .LOCKED(lock_b));
    BUFGCE gce (.I(bfx), .CE(ce), .O(gclk));

    always @(posedge a0) na <= na + d;
    always @(posedge a2x) n2x <= n2x + 1;
    always @(posedge adv) ndv <= ndv + 1;
    always @(posedge afx) nfx <= nfx + 1;
    always @(negedge afx180) nfx180 <= nfx180 + 3;
    always @(posedge b0) nb0 <= nb0 + 1;
    always @(negedge b180) nb180 <= nb180 + 1;
    always @(posedge bfx) if (lock_b) nbfx <= nbfx + 5;
    always @(posedge gclk) nce <= nce + 1;
endmodule
