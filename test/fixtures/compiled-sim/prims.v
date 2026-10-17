// Silinx test design (compiled simulator, #429): Xilinx primitives instantiated in Verilog: block RAMs
// (RAMB16_S9_S9, RAMB16_S4_S9, RAMB16_S36_S36, RAMB16_S1_S1, RAMB16_S18, RAMB16_S2) on a few words, a
// MULT18X18SIO with its default registers, SRL16_1, SRL16E_1, SRLC16E, RAM64X1S, RAM16X1S_1, RAM32X1D,
// RAM16X1D_1; a counter on a BUFGCE and one on a BUFGMUX between the clock and the BUFGCE's.
module prims_v (
    input  wire        clk, en, we, ssr, en2, we2, ssr2, ce, sel,
    input  wire [5:0]  a, b,
    input  wire [35:0] di,
    input  wire [17:0] m,
    output wire [8:0]  q1a, q1b,
    output wire [3:0]  q2a,
    output wire [8:0]  q2b,
    output wire [35:0] q3a, q3b,
    output wire        q4a, q4b,
    output wire [17:0] q5,
    output wire [1:0]  q6,
    output wire [35:0] p,
    output wire [17:0] bc,
    output wire [3:0]  s,
    output wire [4:0]  r,
    output reg  [3:0]  nce = 0, nmux = 0
);
    RAMB16_S9_S9 #(.WRITE_MODE_A("READ_FIRST"), .WRITE_MODE_B("NO_CHANGE"), .INIT_A(9'h1FF), .SRVAL_B(9'h0AA),
        .INIT_00(256'h0F1E2D3C4B5A69788796A5B4C3D2E1F00F1E2D3C4B5A69788796A5B4C3D2E1F0), .INITP_00(256'h55AA))
    r1 (.DOA(q1a[7:0]), .DOPA(q1a[8]), .ADDRA({5'd0, a}), .CLKA(clk), .DIA(di[7:0]), .DIPA(di[8]), .ENA(en), .SSRA(ssr), .WEA(we),
        .DOB(q1b[7:0]), .DOPB(q1b[8]), .ADDRB({8'd0, b[2:0]}), .CLKB(clk), .DIB(di[16:9]), .DIPB(di[17]), .ENB(en2), .SSRB(ssr2), .WEB(we2));
    RAMB16_S4_S9 #(.WRITE_MODE_A("WRITE_FIRST"), .WRITE_MODE_B("READ_FIRST"), .INIT_B(9'h123))
    r2 (.DOA(q2a), .ADDRA({6'd0, a}), .CLKA(clk), .DIA(di[3:0]), .ENA(en2), .SSRA(ssr), .WEA(we),
        .DOB(q2b[7:0]), .DOPB(q2b[8]), .ADDRB({6'd0, b[4:0]}), .CLKB(clk), .DIB(di[11:4]), .DIPB(di[12]), .ENB(en), .SSRB(ssr2), .WEB(we2));
    RAMB16_S36_S36 #(.WRITE_MODE_A("NO_CHANGE"), .WRITE_MODE_B("WRITE_FIRST"), .SRVAL_A(36'hF_DEADBEEF), .INIT_B(36'h1_00000001),
        .INIT_01(256'h00000001000000020000000300000004000000050000000600000007DEADBEEF))
    r3 (.DOA(q3a[31:0]), .DOPA(q3a[35:32]), .ADDRA({6'd0, a[5:3]}), .CLKA(clk), .DIA(di[31:0]), .DIPA(di[35:32]), .ENA(en), .SSRA(ssr), .WEA(we),
        .DOB(q3b[31:0]), .DOPB(q3b[35:32]), .ADDRB({6'd0, b[2:0]}), .CLKB(clk), .DIB(di[35:4]), .DIPB(di[3:0]), .ENB(en2), .SSRB(ssr2), .WEB(we2));
    RAMB16_S1_S1 #(.INIT_A(1'b1), .SRVAL_B(1'b1), .INIT_00(256'hA5))
    r4 (.DOA(q4a), .ADDRA({8'd0, a}), .CLKA(clk), .DIA(di[0]), .ENA(en), .SSRA(ssr), .WEA(we),
        .DOB(q4b), .ADDRB({8'd0, b}), .CLKB(clk), .DIB(di[1]), .ENB(en2), .SSRB(ssr2), .WEB(we2));
    RAMB16_S18 #(.WRITE_MODE("READ_FIRST"), .INIT(18'h3FFFF), .SRVAL(18'h12345), .INITP_00(256'hE4))
    r5 (.DO(q5[15:0]), .DOP(q5[17:16]), .ADDR({4'd0, a}), .CLK(clk), .DI(di[15:0]), .DIP(di[17:16]), .EN(en), .SSR(ssr2), .WE(we));
    RAMB16_S2 #(.WRITE_MODE("NO_CHANGE"), .INIT(2'b10))
    r6 (.DO(q6), .ADDR({7'd0, b}), .CLK(clk), .DI(di[1:0]), .EN(en2), .SSR(ssr), .WE(we2));

    MULT18X18SIO u0 (.A(m), .B(di[17:0]), .BCIN(18'd0), .CEA(ce), .CEB(en), .CEP(en2), .CLK(clk),
        .RSTA(ssr), .RSTB(ssr2), .RSTP(1'b0), .BCOUT(bc), .P(p));

    SRL16_1 #(.INIT(16'h8001)) s0 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .CLK(clk), .D(di[0]), .Q(s[0]));
    SRL16E_1 s1 (.A0(b[0]), .A1(b[1]), .A2(b[2]), .A3(b[3]), .CE(ce), .CLK(clk), .D(di[1]), .Q(s[1]));
    SRLC16E #(.INIT(16'hF0F0)) s2 (.A0(a[2]), .A1(a[3]), .A2(a[4]), .A3(a[5]), .CE(en), .CLK(clk), .D(di[2]), .Q(s[2]), .Q15(s[3]));

    RAM64X1S #(.INIT(64'hFEDCBA9876543210)) d0 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .A4(a[4]), .A5(a[5]), .D(di[3]), .WCLK(clk), .WE(we), .O(r[0]));
    RAM16X1S_1 #(.INIT(16'h1234)) d1 (.A0(b[0]), .A1(b[1]), .A2(b[2]), .A3(b[3]), .D(di[4]), .WCLK(clk), .WE(we2), .O(r[1]));
    RAM32X1D #(.INIT(32'hCAFEBABE)) d2 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .A4(a[4]), .DPRA0(b[0]), .DPRA1(b[1]), .DPRA2(b[2]), .DPRA3(b[3]), .DPRA4(b[4]),
        .D(di[5]), .WCLK(clk), .WE(we), .SPO(r[2]), .DPO(r[3]));
    RAM16X1D_1 d3 (.A0(a[1]), .A1(a[2]), .A2(a[3]), .A3(a[4]), .DPRA0(b[1]), .DPRA1(b[2]), .DPRA2(b[3]), .DPRA3(b[4]),
        .D(di[6]), .WCLK(clk), .WE(we2), .SPO(r[4]), .DPO());

    wire gclk, mclk;
    BUFGCE g (.I(clk), .CE(ce), .O(gclk));
    BUFGMUX x (.I0(clk), .I1(gclk), .S(sel), .O(mclk));
    always @(posedge gclk) nce <= nce + 1;
    always @(posedge mclk) nmux <= nmux + 3;
endmodule
