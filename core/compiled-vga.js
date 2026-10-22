// Silinx - the compiled simulator's VGA monitor (#405: out of core/compiled-sim.js): the code that finds the picture
// in the sync signals, each cycle, in the compiled design's run() (compileNetlist's watch.vga).

// ------------------------------------------------------------------ a VGA monitor (watch.vga)
// The picture as a monitor finds it in the sync signals, each cycle: a line from each leading edge of HSYNC
// (its active level: the shorter one, low until both are measured), the pixel clock from the line's period
// (VGA_TOTAL_W pixels a line), the column from the time since that edge (the active picture VGA_BEFORE_X pixels
// after it: the sync pulse and the back porch), the row from the time since the leading edge of VSYNC in lines
// (VGA_BEFORE_Y lines of sync and back porch), whether VSYNC changes at the start of a line or with HSYNC. FB:
// the rgb bits' value of each pixel of the VGA_W x VGA_H picture; VG (VGA_STATE): the monitor's state, its
// measures in cycles.
export const VGA_W = 640, VGA_H = 480, VGA_TOTAL_W = 800, VGA_BEFORE_X = 144, VGA_BEFORE_Y = 35;
/** The monitor's state (core/vga.js reads it): the cycle, the HSYNC / VSYNC levels and edges, the measures. */
export const VGA_STATE = ['ct', 'hp', 'hr', 'hf', 'hhi', 'hlo', 'lead', 'L', 'kx', 'row', 'vp', 'vr', 'vf', 'vhi', 'vlo', 'vlead', 'frames', 'fp', 'hsw', 'vsw'];
export const VGA_CODE = (hs, vs, rgb) => `{
  const hs = ${hs}, vs = ${vs};
  // (the first cycle: the levels, no edge)
  if (g_vp < 0) { g_vp = vs; g_hp = hs; }
  if (vs !== g_vp) {
    if (vs) { if (g_vf >= 0) g_vlo = g_ct - g_vf; g_vr = g_ct; } else { if (g_vr >= 0) g_vhi = g_ct - g_vr; g_vf = g_ct; }
    const low = !(g_vhi > 0 && g_vlo > 0 && g_vhi < g_vlo);
    if (vs === (low ? 0 : 1)) { if (g_vlead >= 0) { g_fp = g_ct - g_vlead; g_frames++; } g_vlead = g_ct; }
    else if (g_vlead >= 0 && g_L > 0) g_vsw = (g_ct - g_vlead) / g_L;
    g_vp = vs;
  }
  if (hs !== g_hp) {
    if (hs) { if (g_hf >= 0) g_hlo = g_ct - g_hf; g_hr = g_ct; } else { if (g_hr >= 0) g_hhi = g_ct - g_hr; g_hf = g_ct; }
    const low = !(g_hhi > 0 && g_hlo > 0 && g_hhi < g_hlo);
    if (hs === (low ? 0 : 1)) {
      if (g_lead >= 0) { g_L = g_ct - g_lead; g_kx = ${VGA_TOTAL_W} / g_L; }
      g_lead = g_ct;
      g_row = g_vlead >= 0 && g_L > 0 ? Math.floor((g_ct - g_vlead) / g_L) + 1 - ${VGA_BEFORE_Y} : -1;
    } else if (g_lead >= 0) g_hsw = g_ct - g_lead;
    g_hp = hs;
  }
  if (g_row >= 0 && g_row < ${VGA_H} && g_L > 0) {
    const x = ((g_ct - g_lead) * g_kx | 0) - ${VGA_BEFORE_X};
    if (x >= 0 && x < ${VGA_W}) FB[g_row * ${VGA_W} + x] = ${rgb};
  }
  g_ct++;
}`;
