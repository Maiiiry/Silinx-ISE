// SSim's rendering (#405: out of mountISim): the names column (names, the values at the cursor, groups, forces, the
// drop line of a drag) and the wave window (the time ruler, the grid, the waves, the drawn stimuli, the markers, the
// cursor and their delta), drawn on their canvases. mountDraw(ctx) is called by mountISim where this code was; the
// scheduling of a frame (invalidate) stays there.
import { ROW_H, RULER_H, fmtTime, trimNum, formatValue, clamp, isBitsType } from './isim.js';
import { mountWaveDraw } from './isim-draw-wave.js';

/** { drawNames, drawWaves, setFont, fitText } of an SSim window. */
export function mountDraw(ctx) {
  const { st, sim, cn, cw, sizes, colors: getColors, flat: getFlat, dragRow: getDragRow, xOf, tOf, itemWave, valueOf, itemType, itemRadix,
    isForced, drawStim } = ctx;
  // the canvases' sizes, the colours of the theme and the rows shown, read from the window at every frame
  let dpr = 1, NW = 0, NH = 0, WW = 0, WH = 0, colors = {}, flat = [];
  function sync() { ({ dpr, NW, NH, WW, WH } = sizes()); colors = getColors(); flat = getFlat(); }

  function setFont(ctx, size = 12, bold = false) { ctx.font = `${bold ? 'bold ' : ''}${size}px ${colors.font}`; }
  function fitText(ctx, s, maxW) {
    if (maxW <= 4) return '';
    if (ctx.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; }
    return lo ? s.slice(0, lo) + '…' : '';
  }

  function drawNames() {
    sync();
    const ctx = cn.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.names; ctx.fillRect(0, 0, NW, NH);
    // header
    const hg = ctx.createLinearGradient(0, 0, 0, RULER_H);
    hg.addColorStop(0, colors.head1); hg.addColorStop(1, colors.head2);
    ctx.fillStyle = hg; ctx.fillRect(0, 0, NW, RULER_H);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, RULER_H - 0.5); ctx.lineTo(NW, RULER_H - 0.5);
    ctx.moveTo(st.nameW - 0.5, 0); ctx.lineTo(st.nameW - 0.5, NH); ctx.stroke();
    setFont(ctx, 12, false); ctx.fillStyle = colors.fgText; ctx.textBaseline = 'middle';
    ctx.fillText('Name', 8, RULER_H / 2);
    ctx.fillText('Value', st.nameW + 6, RULER_H / 2);
    // rows
    ctx.save();
    ctx.beginPath(); ctx.rect(0, RULER_H, NW, NH - RULER_H); ctx.clip();
    const first = Math.max(0, Math.floor(st.scrollY / ROW_H)), last = Math.min(flat.length - 1, Math.ceil((st.scrollY + NH) / ROW_H));
    for (let i = first; i <= last; i++) {
      const it = flat[i];
      const y = RULER_H + i * ROW_H - st.scrollY;
      const sel = st.sel.has(it.key);
      if (sel) { ctx.fillStyle = colors.accent; ctx.fillRect(0, y, NW, ROW_H); }
      else if (i % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,0.025)'; ctx.fillRect(0, y, NW, ROW_H); }
      ctx.strokeStyle = sel ? colors.accent : '#ececec';
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H - 0.5); ctx.lineTo(NW, y + ROW_H - 0.5); ctx.stroke();
      const fg = sel ? colors.accentFg : colors.fgText;
      const cy = y + ROW_H / 2;
      if (it.row.kind === 'div') {
        setFont(ctx, 12, true); ctx.fillStyle = sel ? colors.accentFg : '#15428b';
        ctx.textAlign = 'center'; ctx.fillText(fitText(ctx, it.row.name, NW - 10), NW / 2, cy); ctx.textAlign = 'left';
        continue;
      }
      if (it.row.kind === 'group') {
        // its twisty, a folder, its name (bold) and the number of its signals
        const gx = 4;
        ctx.fillStyle = sel ? colors.accentFg : '#555';
        ctx.beginPath();
        if (it.row.expanded) { ctx.moveTo(gx, cy - 2); ctx.lineTo(gx + 8, cy - 2); ctx.lineTo(gx + 4, cy + 3); }
        else { ctx.moveTo(gx + 2, cy - 4); ctx.lineTo(gx + 7, cy); ctx.lineTo(gx + 2, cy + 4); }
        ctx.fill();
        ctx.fillStyle = sel ? 'rgba(255,255,255,.3)' : '#f2c94c'; ctx.strokeStyle = sel ? '#fff' : '#a07d1c';
        ctx.beginPath(); ctx.rect(gx + 15.5, cy - 4.5, 13, 9); ctx.fill(); ctx.stroke();
        setFont(ctx, 12, true); ctx.fillStyle = fg;
        ctx.fillText(fitText(ctx, it.row.name, st.nameW - gx - 38), gx + 34, cy);
        setFont(ctx, 12); ctx.fillStyle = sel ? colors.accentFg : '#888';
        ctx.fillText(`(${st.rows.filter(r => r.group === it.row.id).length})`, st.nameW + 6, cy);
        continue;
      }
      const sig = it.row.sig;
      let x = 4 + it.depth * 16;
      const expandable = !it.bit && sig.wave && isBitsType(sig.t) && sig.t.w > 1;
      if (expandable) {
        ctx.fillStyle = sel ? colors.accentFg : '#555';
        ctx.beginPath();
        if (it.row.expanded) { ctx.moveTo(x, cy - 2); ctx.lineTo(x + 8, cy - 2); ctx.lineTo(x + 4, cy + 3); }
        else { ctx.moveTo(x + 2, cy - 4); ctx.lineTo(x + 7, cy); ctx.lineTo(x + 2, cy + 4); }
        ctx.fill();
      }
      x += 11;
      drawSigIcon(ctx, x, cy, it, sel);
      x += 18;
      setFont(ctx, 12); ctx.fillStyle = fg;
      const forced = !it.bit && isForced(sig);
      const label = it.bit ? `[${it.bit.index}]` : it.row.name + (sig.t.kind === 'logic' && sig.t.w > 1 ? `[${sig.t.left ?? sig.t.w - 1}:${sig.t.right ?? 0}]` : '');
      ctx.fillText(fitText(ctx, label, st.nameW - x - (forced ? 16 : 4)), x, cy);
      if (forced) { ctx.fillStyle = sel ? colors.accentFg : '#c06000'; setFont(ctx, 10, true); ctx.fillText('F', st.nameW - 12, cy); }
      // value at cursor
      setFont(ctx, 12); ctx.fillStyle = fg;
      let vt;
      if (!sig.wave) vt = Array.isArray(sig.val) ? '(array)' : formatValue(sig.val, sig.t);
      else vt = formatValue(valueOf(it, st.cursor), itemType(it), itemRadix(it));
      ctx.fillText(fitText(ctx, vt, st.valW - 10), st.nameW + 6, cy);
    }
    const dragRow = getDragRow();
    if (dragRow) {
      const y = RULER_H + dragRow.y - st.scrollY;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NW, y); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.restore();
    ctx.strokeStyle = colors.border;
    ctx.beginPath(); ctx.moveTo(NW - 0.5, 0); ctx.lineTo(NW - 0.5, NH); ctx.stroke();
  }

  function drawSigIcon(ctx, x, cy, it, sel) {
    const sig = it.row.sig;
    ctx.save(); ctx.lineWidth = 1.3;
    const c = sel ? '#fff' : '#108010';
    ctx.strokeStyle = c;
    if (!sig.wave) {
      ctx.strokeStyle = sel ? '#fff' : '#666';
      ctx.strokeRect(x + 0.5, cy - 5.5, 12, 11);
      ctx.beginPath(); ctx.moveTo(x + 0.5, cy - 0.5); ctx.lineTo(x + 12.5, cy - 0.5); ctx.moveTo(x + 6.5, cy - 5.5); ctx.lineTo(x + 6.5, cy + 5.5); ctx.stroke();
    } else if (it.bit || (sig.t.w === 1 && sig.t.kind === 'logic')) {
      ctx.beginPath(); ctx.moveTo(x, cy + 4); ctx.lineTo(x + 4, cy + 4); ctx.lineTo(x + 4, cy - 4); ctx.lineTo(x + 9, cy - 4); ctx.lineTo(x + 9, cy + 4); ctx.lineTo(x + 13, cy + 4); ctx.stroke();
    } else {
      ctx.fillStyle = sel ? 'rgba(255,255,255,.25)' : '#e3f5e3';
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + 3, cy - 4.5); ctx.lineTo(x + 11, cy - 4.5); ctx.lineTo(x + 14, cy); ctx.lineTo(x + 11, cy + 4.5); ctx.lineTo(x + 3, cy + 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return { step: Math.max(1, k * p), mant: k };
  }

  function drawWaves() {
    sync();
    const ctx = cw.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, WW, WH);
    const tA = st.t0, tB = tOf(WW);
    // ---- ruler
    const { step, mant } = niceStep(st.scale * 110);
    const unit = step * 10 >= 1e9 ? 1e9 : step * 10 >= 1e6 ? 1e6 : step * 10 >= 1e3 ? 1e3 : 1;
    const uname = { 1: 'ps', 1e3: 'ns', 1e6: 'us', 1e9: 'ms' }[unit];
    const minor = step / (mant === 2 ? 4 : 5);
    const rg = ctx.createLinearGradient(0, 0, 0, RULER_H);
    rg.addColorStop(0, colors.head1); rg.addColorStop(1, colors.head2);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, WW, RULER_H);
    ctx.strokeStyle = colors.border; ctx.beginPath(); ctx.moveTo(0, RULER_H - 0.5); ctx.lineTo(WW, RULER_H - 0.5); ctx.stroke();
    ctx.strokeStyle = colors.rulerTick; ctx.fillStyle = colors.rulerFg; setFont(ctx, 11); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.beginPath();
    const decs = Math.max(0, Math.ceil(-Math.log10(step / unit) - 1e-9));
    if (minor * 1 / st.scale >= 4) {
      for (let t = Math.ceil(tA / minor) * minor; t <= tB; t += minor) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.moveTo(x, RULER_H - 4); ctx.lineTo(x, RULER_H - 1);
      }
    }
    const majors = [];
    // keep ruler labels clear of the cursor time box
    setFont(ctx, 11, true);
    const cx0 = xOf(st.cursor), cbw = ctx.measureText(fmtTime(st.cursor)).width + 8;
    const busy = [[clamp(cx0 - cbw / 2, 1, WW - cbw - 1) - 4, 0]];
    busy[0][1] = busy[0][0] + cbw + 8;
    setFont(ctx, 11);
    for (const m of st.markers) {
      const mw = ctx.measureText(fmtTime(m.t)).width + 8, mx = xOf(m.t);
      const l = clamp(mx - mw / 2, 1, WW - mw - 1) - 4;
      busy.push([l, l + mw + 8]);
    }
    for (let t = Math.ceil(tA / step) * step; t <= tB + step; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.moveTo(x, RULER_H - 9); ctx.lineTo(x, RULER_H - 1);
      majors.push(x);
      const lab = `${trimNum(t / unit, Math.min(decs, 6))} ${uname}`;
      const lw = ctx.measureText(lab).width / 2 + 2;
      const lx = clamp(x, lw, Math.max(lw, WW - lw));
      if (busy.every(([l, r]) => lx + lw < l || lx - lw > r)) ctx.fillText(lab, lx, RULER_H - 11);
    }
    ctx.stroke();
    ctx.textAlign = 'left';
    // ---- clip rows region
    ctx.save();
    ctx.beginPath(); ctx.rect(0, RULER_H, WW, WH - RULER_H); ctx.clip();
    // grid
    ctx.strokeStyle = colors.grid; ctx.setLineDash([1, 3]); ctx.beginPath();
    for (const x of majors) { ctx.moveTo(x, RULER_H); ctx.lineTo(x, WH); }
    ctx.stroke(); ctx.setLineDash([]);
    // end-of-sim shading
    const xe = xOf(sim.now);
    if (xe < WW) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(Math.max(0, xe), RULER_H, WW, WH); }
    // rows
    const first = Math.max(0, Math.floor(st.scrollY / ROW_H)), last = Math.min(flat.length - 1, Math.ceil((st.scrollY + WH) / ROW_H));
    setFont(ctx, 11);
    ctx.textBaseline = 'middle';
    for (let i = first; i <= last; i++) {
      const it = flat[i], y = RULER_H + i * ROW_H - st.scrollY;
      if (st.sel.has(it.key)) { ctx.fillStyle = 'rgba(80,120,255,0.18)'; ctx.fillRect(0, y, WW, ROW_H); }
      if (it.row.kind === 'div') {
        ctx.strokeStyle = '#3a3a3a'; ctx.beginPath(); ctx.moveTo(0, y + ROW_H / 2 + 0.5); ctx.lineTo(WW, y + ROW_H / 2 + 0.5); ctx.stroke();
        continue;
      }
      if (it.row.kind === 'group') continue;
      drawItem(ctx, it, y, tA, Math.min(tB, sim.now));
    }
    if (st.stim.m) drawStim(ctx, first, last);
    ctx.restore();
    // ---- markers, cursor
    for (const m of st.markers) drawVLine(ctx, m.t, colors.marker, m === st.activeMarker ? [] : [4, 3], fmtTime(m.t), false);
    drawVLine(ctx, st.cursor, colors.cursor, [], fmtTime(st.cursor), true);
    if (st.activeMarker) drawDelta(ctx, st.activeMarker.t, st.cursor);
  }

  function drawVLine(ctx, t, color, dash, label, isCursor) {
    const x = Math.round(xOf(t)) + 0.5;
    if (x < -40 || x > WW + 40) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, WH); ctx.stroke(); ctx.setLineDash([]);
    setFont(ctx, 11, isCursor); ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 8, bh = 14;
    let bx = x - tw / 2; bx = clamp(bx, 1, WW - tw - 1);
    const by = isCursor ? 1 : RULER_H - bh - 1;
    if (!isCursor) {
      // small flag in ruler
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 4, RULER_H - 6); ctx.lineTo(x + 4, RULER_H - 6); ctx.lineTo(x, RULER_H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(bx, by - 2, tw, bh - 1);
      ctx.fillStyle = '#000'; ctx.fillText(label, bx + 4, by + bh / 2 - 2.5);
      return;
    }
    ctx.fillStyle = color; ctx.fillRect(bx, by, tw, bh);
    ctx.strokeStyle = '#8a8a00'; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, bh - 1);
    ctx.fillStyle = '#000'; ctx.fillText(label, bx + 4, by + bh / 2 + 0.5);
  }
  function drawDelta(ctx, ta, tb) {
    if (ta === tb) return;
    const x1 = xOf(Math.min(ta, tb)), x2 = xOf(Math.max(ta, tb));
    const y = WH - 12;
    if (x2 < 0 || x1 > WW) return;
    ctx.strokeStyle = colors.delta || '#ffffff'; ctx.fillStyle = colors.delta || '#ffffff';   // (on paper: dark, #1511)
    ctx.beginPath(); ctx.moveTo(x1, y + 0.5); ctx.lineTo(x2, y + 0.5); ctx.stroke();
    const arrow = (x, d) => { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + 5 * d, y - 3); ctx.lineTo(x + 5 * d, y + 4); ctx.closePath(); ctx.fill(); };
    if (x2 - x1 > 12) { arrow(x1, 1); arrow(x2, -1); }
    const label = `Δ ${fmtTime(Math.abs(tb - ta))}`;
    setFont(ctx, 11, true);
    const tw = ctx.measureText(label).width + 8;
    const cx = clamp((Math.max(x1, 0) + Math.min(x2, WW)) / 2, tw / 2 + 2, WW - tw / 2 - 2);
    ctx.fillStyle = '#202020'; ctx.fillRect(cx - tw / 2, y - 16, tw, 13);
    ctx.strokeStyle = '#ffffff'; ctx.strokeRect(cx - tw / 2 + 0.5, y - 15.5, tw - 1, 12);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx - tw / 2 + 4, y - 9);
  }

  // the drawing of one wave (isim-draw-wave.js)
  const { drawItem } = mountWaveDraw({ WW: () => WW, colors: () => colors, fitText, setFont, xOf, tOf, itemWave, itemType, itemRadix });

  return { drawNames, drawWaves, setFont, fitText };
}
