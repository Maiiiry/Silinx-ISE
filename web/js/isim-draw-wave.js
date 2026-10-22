// ISim's drawing of one wave (#405: out of mountDraw in isim-draw.js): a scalar's levels (0, 1, Z, X boxes) and a
// bus's hexagons with their values, scanned over the visible time with the sub-pixel transitions coalesced into
// dense blocks.
import { ROW_H, formatValue, idxAt, isScalarType, lowerBound } from './isim.js';
import * as V from '/core/values.js';

/** { drawItem } of mountDraw (WW(), colors(): its current values). */
export function mountWaveDraw(ctx) {
  const { WW, colors, fitText, setFont, xOf, tOf, itemWave, itemType, itemRadix } = ctx;

  // Iterate the visible part of a wave, coalescing sub-pixel transitions.
  // cb(x0, x1, value, dense, startEdge, endEdge)
  function scanWave(w, tA, tEnd, cb) {
    const T = w.t, n = T.length;
    if (!n || tEnd < tA) return;
    let i = idxAt(T, tA);
    if (i < 0) return;
    let curX = xOf(Math.max(T[i], tA)), curV = w.v[i], curEdge = T[i] >= tA && T[i] > 0;
    let k = i + 1;
    while (k < n && T[k] <= tEnd) {
      const xk = xOf(T[k]);
      const px = Math.floor(xk);
      const m = lowerBound(T, tOf(px + 1), k + 1);
      // dense: several transitions in this pixel, or the next one already in the adjacent pixel
      if (m - k >= 2 || (m === k + 1 && m < n && T[m] <= tEnd && xOf(T[m]) < px + 2)) {
        let endPx = px + 1, mm = m;
        while (mm < n && T[mm] <= tEnd) {
          const p2 = Math.floor(xOf(T[mm]));
          if (p2 > endPx + 1) break; // tolerate a single quiet pixel inside a dense run
          endPx = p2 + 1; mm = lowerBound(T, tOf(p2 + 1), mm + 1);
        }
        if (xk > curX) cb(curX, xk, curV, false, curEdge, true);
        cb(Math.min(px, xk), endPx, w.v[mm - 1], true, true, true);
        curX = endPx; curV = w.v[mm - 1]; curEdge = false; k = mm;
      } else {
        cb(curX, xk, curV, false, curEdge, true);
        curX = xk; curV = w.v[k]; curEdge = true; k++;
      }
    }
    const xEnd = xOf(tEnd);
    if (xEnd > curX) cb(curX, xEnd, curV, false, curEdge, false);
  }

  function valColor(v) {
    if (!v || Array.isArray(v) || v.str !== undefined || !v.x) return colors().fg;
    return (v.x === V.mask(v.w) && v.v === v.x) ? colors().z : colors().x;
  }

  function drawItem(ctx, it, y, tA, tEnd) {
    const sig = it.row.sig;
    const w = itemWave(it);
    const yT = y + 4, yB = y + ROW_H - 4, yM = y + ROW_H / 2;
    if (!w) {
      ctx.fillStyle = '#9a9a9a'; setFont(ctx, 11);
      ctx.fillText(Array.isArray(sig.val) ? '(array - not plotted)' : formatValue(sig.val, sig.t), 6, yM);
      return;
    }
    const t = itemType(it), radix = itemRadix(it);
    const scalar = it.bit || isScalarType(t);
    if (scalar) {
      let prevY = null;
      ctx.lineWidth = 1;
      scanWave(w, tA, tEnd, (x0, x1, v, dense, se) => {
        const X0 = Math.round(x0) + 0.5, X1 = Math.round(x1) + 0.5;
        if (dense) {
          ctx.fillStyle = colors().fg; ctx.fillRect(Math.round(x0), yT, Math.max(1, Math.round(x1) - Math.round(x0)), yB - yT + 1);
          prevY = null; return;
        }
        let ly, col = colors().fg;
        if (v.x) {
          if (v.v) { col = colors().z; ly = yM; } else { col = colors().x; ly = null; }
        } else ly = v.v ? yT : yB;
        if (ly === null) {
          // X: red box
          ctx.fillStyle = 'rgba(255,0,0,0.28)'; ctx.fillRect(X0, yT, X1 - X0, yB - yT);
          ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(X0, yT + 0.5); ctx.lineTo(X1, yT + 0.5); ctx.moveTo(X0, yB + 0.5); ctx.lineTo(X1, yB + 0.5);
          if (se) { ctx.moveTo(X0, yT); ctx.lineTo(X0, yB + 1); }
          ctx.stroke(); prevY = null; return;
        }
        ctx.strokeStyle = col; ctx.beginPath();
        const Ly = Math.round(ly) + 0.5;
        if (se && prevY !== null && prevY !== Ly) { ctx.moveTo(X0, prevY); ctx.lineTo(X0, Ly); }
        else if (se && prevY === null && v.x === 0n) { ctx.moveTo(X0, yT + 0.5); ctx.lineTo(X0, yB + 0.5); }
        ctx.moveTo(X0, Ly); ctx.lineTo(X1, Ly); ctx.stroke();
        prevY = Ly;
      });
      return;
    }
    // bus
    scanWave(w, tA, tEnd, (x0, x1, v, dense, se, ee) => {
      if (dense) {
        ctx.fillStyle = colors().fg; ctx.fillRect(Math.round(x0), yT, Math.max(1, Math.round(x1) - Math.round(x0)), yB - yT + 1);
        return;
      }
      const col = valColor(v);
      const width = x1 - x0;
      const d = Math.min(3, width / 2);
      const L = Math.round(x0) + 0.5, R = Math.round(x1) + 0.5;
      const a = se ? d : 0, b = ee ? d : 0;
      const tY = yT + 0.5, bY = yB + 0.5;
      if (v.x && col === colors().x) {
        ctx.fillStyle = 'rgba(255,0,0,0.22)';
        ctx.beginPath(); ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, tY); ctx.lineTo(R - b, tY); ctx.lineTo(R, yM + 0.5); ctx.lineTo(R - b, bY); ctx.lineTo(L + a, bY); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath();
      if (col === colors().z) { ctx.moveTo(L, Math.round(yM) + 0.5); ctx.lineTo(R, Math.round(yM) + 0.5); }
      else {
        ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, tY); ctx.lineTo(R - b, tY); ctx.lineTo(R, yM + 0.5);
        ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, bY); ctx.lineTo(R - b, bY); ctx.lineTo(R, yM + 0.5);
      }
      ctx.stroke();
      // label centred in the visible part of the segment
      const vis0 = Math.max(x0 + a, 0), vis1 = Math.min(x1 - b, WW());
      const avail = vis1 - vis0 - 6;
      if (avail > 8) {
        const s = fitText(ctx, formatValue(v, t, radix), avail);
        if (s) {
          ctx.fillStyle = col === colors().fg ? colors().text : col;
          const tw = ctx.measureText(s).width;
          ctx.fillText(s, Math.round((vis0 + vis1 - tw) / 2), yM + 0.5);
        }
      }
    });
  }

  return { drawItem };
}
