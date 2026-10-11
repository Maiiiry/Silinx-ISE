// Open-flow board test (Spartan-3E Starter Kit, XC3S500E-FG320) with the kit's own I/O settings
// (UG230): LVTTL inputs with pull-ups (switches, rotary encoder) and pull-downs (buttons), LVTTL
// outputs of drive 8, slow (LEDs, RS-232) and fast (VGA), LVCMOS33 outputs of drive 4 (LCD).
// The LEDs show a counter (about 3 Hz) or, while a button is pressed, the switches and buttons;
// the rotary encoder moves a 4-bit position XORed onto the counter; RS-232 echoes RXD to TXD on
// both ports; VGA gets its 640x480 sync (60 Hz, 25 MHz pixel rate) and a colour from the
// switches; the LCD's control lines are held idle (the StrataFlash disabled), its data lines
// show the counter.
module top (
    input  wire       clk,
    input  wire [3:0] sw,
    input  wire       btn_east, btn_north, btn_south, btn_west,
    input  wire       rot_a, rot_b, rot_center,
    input  wire       rs232_dce_rxd, rs232_dte_rxd,
    output wire       rs232_dce_txd, rs232_dte_txd,
    output wire [7:0] led,
    output reg        vga_red = 1'b0, vga_green = 1'b0, vga_blue = 1'b0,
    output reg        vga_hsync = 1'b1, vga_vsync = 1'b1,
    output wire       lcd_e, lcd_rs, lcd_rw,
    output wire [3:0] lcd_d,
    output wire       sf_ce0
);
    reg [23:0] cnt = 24'd0;
    reg [1:0]  ra = 2'b00, rb = 2'b00;
    reg [3:0]  pos = 4'd0;
    always @(posedge clk) begin
        cnt <= cnt + 24'd1;
        // the rotary encoder: a step on each rising edge of A, its direction from B
        ra <= {ra[0], rot_a};
        rb <= {rb[0], rot_b};
        if (rot_center) pos <= 4'd0;
        else if (ra == 2'b01) pos <= rb[1] ? pos - 4'd1 : pos + 4'd1;
    end
    wire any = btn_east | btn_north | btn_south | btn_west;
    assign led = any ? {btn_east, btn_north, btn_south, btn_west, sw} : {cnt[23:20] ^ pos, cnt[23:20]};

    assign rs232_dce_txd = rs232_dce_rxd;
    assign rs232_dte_txd = rs232_dte_rxd;

    // VGA 640x480 at 60 Hz: a pixel every other clock (25 MHz)
    reg       pix = 1'b0;
    reg [9:0] hc = 10'd0, vc = 10'd0;
    always @(posedge clk) begin
        pix <= ~pix;
        if (pix) begin
            if (hc == 10'd799) begin
                hc <= 10'd0;
                vc <= vc == 10'd524 ? 10'd0 : vc + 10'd1;
            end else hc <= hc + 10'd1;
            vga_hsync <= !(hc >= 10'd656 && hc < 10'd752);
            vga_vsync <= !(vc >= 10'd490 && vc < 10'd492);
            vga_red   <= hc < 10'd640 && vc < 10'd480 && sw[0];
            vga_green <= hc < 10'd640 && vc < 10'd480 && sw[1];
            vga_blue  <= hc < 10'd640 && vc < 10'd480 && sw[2];
        end
    end

    assign lcd_e = 1'b0;
    assign lcd_rs = 1'b0;
    assign lcd_rw = 1'b0;
    assign lcd_d = cnt[23:20];
    assign sf_ce0 = 1'b1;
endmodule
