// SSim's status bar and cursor (#405: out of mountISim in isim.js): the simulated time, the cursor and the marker's
// delta, the run buttons enabled while no run is going on and the run's progress, a message; the cursor set, the
// markers added and removed, the cursor moved to the previous or next transition of the selected signals.
import { clamp, fmtTime, lowerBound } from './isim.js';

/** { addMarker, jumpEdge, removeMarker, setCursor, setMsg, updateStatus } of mountISim (objDirty(): its current values). */
export function mountStatus(ctx) {
  const {
    $, btns, ensureVisible, invalidate, itemWave, objDirty, selectedItems, sim, st, setObjDirty
  } = ctx;

  // ---------------------------------------------------------------- status
  const stMsg = $('.isim-st-msg'), stTime = $('.isim-st-time'), stDelta = $('.isim-st-delta'), prog = $('.isim-progress');
  function updateStatus() {
    stTime.textContent = `Sim Time: ${sim.now.toLocaleString('en-US')} ps`;
    $('.isim-cursor-info').textContent = `Cursor: ${fmtTime(st.cursor)}`;
    stDelta.textContent = st.activeMarker ? `Marker: ${fmtTime(st.activeMarker.t)}   Δ = ${fmtTime(Math.abs(st.cursor - st.activeMarker.t))}` : '';
    btns.brk.disabled = !st.running;
    for (const k of ['restart', 'runAll', 'runFor', 'step']) btns[k].disabled = st.running;
    prog.style.display = st.running ? '' : 'none';
    if (st.running) {
      const f = clamp((sim.now - st.runStart) / Math.max(1, st.runTarget - st.runStart), 0, 1);
      prog.firstElementChild.style.width = (f * 100).toFixed(1) + '%';
    }
  }
  function setMsg(s) { stMsg.textContent = s; }

  // ---------------------------------------------------------------- cursor / markers / edges
  function setCursor(t) {
    st.cursor = Math.max(0, Math.round(t));
    setObjDirty(true); invalidate(false);
  }
  function addMarker(t) {
    const m = { id: st.markerSeq++, t: Math.round(t) };
    st.markers.push(m); st.activeMarker = m; invalidate(false);
    return m;
  }
  function removeMarker(m) {
    st.markers = st.markers.filter(x => x !== m);
    if (st.activeMarker === m) st.activeMarker = st.markers[st.markers.length - 1] || null;
    invalidate(false);
  }
  function jumpEdge(dir) {
    const its = selectedItems().filter(f => f.row.kind === 'sig' && f.row.sig.wave);
    if (!its.length) { setMsg('Select a signal in the wave window first'); return; }
    let best = null;
    for (const it of its) {
      const w = itemWave(it);
      let t;
      if (dir > 0) { const i = lowerBound(w.t, st.cursor + 1); t = i < w.t.length ? w.t[i] : null; }
      else { const i = lowerBound(w.t, st.cursor) - 1; t = i >= 0 && w.t[i] > 0 ? w.t[i] : (i >= 0 && w.t[i] === 0 && st.cursor > 0 ? 0 : null); }
      if (t != null && t <= sim.now && (best === null || (dir > 0 ? t < best : t > best))) best = t;
    }
    if (best === null) { setMsg('No more transitions'); return; }
    setCursor(best); ensureVisible(best);
  }

  return { addMarker, jumpEdge, removeMarker, setCursor, setMsg, updateStatus };
}
