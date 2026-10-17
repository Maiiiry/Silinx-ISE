// Silinx test design (compiled simulator, #429): two cascaded DCMs (B clocked by A's CLKFX through a
// BUFG), a BUFGMUX choosing between A's CLK0 and B's CLKDV, a BUFGCE, counters on each clock, B's LOCKED.
module dcm_v (
    input  wire       clk, sel, ce,
    input  wire [3:0] d,
    output wire       lock_a, lock_b,
    output reg  [7:0] na = 0, nfx = 0, nb0 = 0, nbdv = 0, nbfx = 0, nm = 0, nce = 0
);
    wire a0u, a0, afxu, afx, b0u, b0, bdv, bfx, mclk, gclk;
    DCM_SP #(.CLKFX_MULTIPLY(2), .CLKFX_DIVIDE(1), .CLKIN_PERIOD(20.0)) dcm_a (
        .CLKIN(clk), .CLKFB(a0), .RST(1'b0), .CLK0(a0u), .CLKFX(afxu), .LOCKED(lock_a));
    BUFG ba0 (.I(a0u), .O(a0));
    BUFG bafx (.I(afxu), .O(afx));
    DCM_SP #(.CLKDV_DIVIDE(2.5), .CLKFX_MULTIPLY(3), .CLKFX_DIVIDE(4), .CLKIN_PERIOD(10.0)) dcm_b (
        .CLKIN(afx), .CLKFB(b0), .RST(1'b0), .CLK0(b0u), .CLKDV(bdv), .CLKFX(bfx), .LOCKED(lock_b));
    BUFG bb0 (.I(b0u), .O(b0));
    BUFGMUX mux (.I0(a0), .I1(bdv), .S(sel), .O(mclk));
    BUFGCE gce (.I(bfx), .CE(ce), .O(gclk));

    always @(posedge a0) na <= na + d;
    always @(posedge afx) nfx <= nfx + 1;
    always @(posedge b0) nb0 <= nb0 + 3;
    always @(negedge bdv) nbdv <= nbdv + 1;
    always @(posedge bfx) if (lock_b) nbfx <= nbfx + 5;
    always @(posedge mclk) nm <= nm + 1;
    always @(posedge gclk) nce <= nce + 1;
endmodule
