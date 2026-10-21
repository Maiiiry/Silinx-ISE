// ISim's wave window, its pointer and keys (#405: out of mountISim): the names column (the selection, a group's or a
// bus's twisty, the drag that reorders the rows or puts them in a group, the columns' widths, a double click, the menu)
// and the waves (the cursor and the markers dragged, snapped to the transitions, two fingers that scroll and zoom, the
// wheel, the menu), and the keys of both. mountInput(ctx) is called by mountISim where this code was.
import { longPressMenu, twoFingerView } from './ui.js';
import { ROW_H, RULER_H, clamp, lowerBound, isBitsType } from './isim.js';

/** { rowAtY, selectRow, localXY, dragRow } of an ISim window (dragRow(): the drop line of a drag of rows, or null). */
export function mountInput(ctx) {
  const { st, sim, $, on, track, cn, cw, vsc, treeEl, objBody, flat, sizes, layout, invalidate, rebuildFlat, updateVScroll, objectsChanged,
    xOf, tOf, clampView, zoomAt, zoomFit, itemWave, setCursor, addMarker, removeMarker, jumpEdge, selectedItems, removeSelectedRows,
    renameDivider, openSource, showMenu, waveRowMenu, stimClick } = ctx;

  let dragRow = null; // { y, flatIdx }: the drop line of a drag of rows
  function rowAtY(yCss) {
    const i = Math.floor((yCss - RULER_H + st.scrollY) / ROW_H);
    return i >= 0 && i < flat().length ? i : -1;
  }
  function selectRow(i, e) {
    const it = flat()[i];
    if (!it) { if (!e?.ctrlKey && !e?.metaKey) st.sel.clear(); invalidate(false); return; }
    if (e && (e.ctrlKey || e.metaKey)) { if (st.sel.has(it.key)) st.sel.delete(it.key); else st.sel.add(it.key); st.anchor = i; }
    else if (e && e.shiftKey && st.anchor != null) {
      st.sel.clear();
      const [a, b] = [Math.min(st.anchor, i), Math.max(st.anchor, i)];
      for (let k = a; k <= b; k++) st.sel.add(flat()[k].key);
    } else if (!st.sel.has(it.key) || e?.button !== 0) { st.sel.clear(); st.sel.add(it.key); st.anchor = i; }
    else st.anchor = i;
    invalidate(false);
  }
  function localXY(e, el) { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  on(cn, 'pointerdown', (e) => {
    if (!e.isPrimary) return;
    cn.focus();
    const [x, y] = localXY(e, cn);
    if (y < RULER_H) {
      if (Math.abs(x - st.nameW) < 5) startColResize(e);
      return;
    }
    const i = rowAtY(y);
    if (e.button === 2) { if (i >= 0 && !st.sel.has(flat()[i].key)) selectRow(i, null); return; }
    if (i < 0) { selectRow(-1, e); return; }
    const it = flat()[i];
    // twisty (a group's: open / close it)
    const tx = 4 + it.depth * 16;
    if (it.row.kind === 'group' && x >= 2 && x <= 14) { it.row.expanded = !it.row.expanded; rebuildFlat(); updateVScroll(); invalidate(); return; }
    if (!it.bit && it.row.kind === 'sig' && x >= tx - 2 && x <= tx + 10 && it.row.sig.wave && isBitsType(it.row.sig.t) && it.row.sig.t.w > 1) {
      it.row.expanded = !it.row.expanded; rebuildFlat(); updateVScroll(); invalidate(); return;
    }
    const wasSelected = st.sel.has(it.key);
    selectRow(i, e);
    // drag to reorder
    const y0 = e.clientY;
    let dragging = false;
    const mm = (ev) => {
      if (!dragging && Math.abs(ev.clientY - y0) > 4) dragging = true;
      if (!dragging) return;
      const [, yy] = localXY(ev, cn);
      // auto-scroll
      if (yy < RULER_H + 5) { vsc.scrollTop -= ROW_H / 2; }
      else if (yy > sizes().NH - 5) { vsc.scrollTop += ROW_H / 2; }
      const yr = clamp(yy - RULER_H + st.scrollY, 0, flat().length * ROW_H);
      // snap to row boundaries: top-level ones, or between the signals of an open group (not inside a bus)
      let idx = Math.round(yr / ROW_H);
      while (idx < flat().length && flat()[idx]?.bit) idx++;
      while (idx < flat().length && flat()[idx]?.depth > 0 && !(flat()[idx].depth === 1 && flat()[idx].row.group != null)) idx++;
      dragRow = { y: idx * ROW_H, flatIdx: idx };
      cn.style.cursor = 'grabbing';
      invalidate(false);
    };
    const mu = (ev) => {
      cn.style.cursor = '';
      if (ev.type === 'pointercancel') { dragRow = null; invalidate(); return; }
      if (dragging && dragRow) {
        const target = flat()[dragRow.flatIdx]?.row ?? null;
        const moving = st.rows.filter(r => st.sel.has(String(r.id)) || flat().some(f => f.row === r && st.sel.has(f.key)));
        if (moving.length && !moving.includes(target)) {
          // dropped before a signal of a group (or right after a group's last one, the group open): into that group;
          // elsewhere out of any (a group itself is never put in one)
          const prev = flat()[dragRow.flatIdx - 1]?.row;
          const into = target?.group ?? (prev && prev.kind === 'group' && prev.expanded ? prev.id : null) ?? null;
          const joins = into != null && !moving.some(r => r.kind === 'group');
          for (const r of moving) if (r.kind !== 'group') { if (joins) r.group = into; else delete r.group; }
          const rest = st.rows.filter(r => !moving.includes(r));
          const at = target ? rest.indexOf(target) : rest.length;
          rest.splice(at, 0, ...moving);
          st.rows = rest; rebuildFlat();
        }
      } else if (!dragging && wasSelected && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        st.sel.clear(); st.sel.add(it.key);
      }
      dragRow = null; invalidate();
    };
    track(cn, e, mm, mu);
  });
  on(cn, 'mousemove', (e) => {
    const [x, y] = localXY(e, cn);
    if (!e.buttons) cn.style.cursor = (y < RULER_H && Math.abs(x - st.nameW) < 5) ? 'col-resize' : '';
  });
  function startColResize(e) {
    const x0 = e.clientX, w0 = st.nameW;
    track(cn, e, (ev) => { st.nameW = clamp(w0 + ev.clientX - x0, 60, 600); layout(); }, () => {});
  }
  on(cn, 'dblclick', (e) => {
    const [, y] = localXY(e, cn);
    const i = rowAtY(y);
    if (i < 0) return;
    const it = flat()[i];
    if (it.row.kind === 'div') { renameDivider(it.row); return; }
    if (it.row.kind === 'group') { it.row.expanded = !it.row.expanded; rebuildFlat(); updateVScroll(); invalidate(); return; }
    if (!it.bit && it.row.sig.wave && isBitsType(it.row.sig.t) && it.row.sig.t.w > 1) { it.row.expanded = !it.row.expanded; rebuildFlat(); invalidate(); return; }
    openSource(it.row.sig);
  });
  on(cn, 'contextmenu', (e) => {
    e.preventDefault();
    // (the row under it selected, as the right button's mousedown does: a touch's long press has none)
    const [, y] = localXY(e, cn);
    const i = y >= RULER_H ? rowAtY(y) : -1;
    if (i >= 0 && !st.sel.has(flat()[i].key)) selectRow(i, null);
    showMenu(e.clientX, e.clientY, waveRowMenu());
  });
  // the menus on touch too: a long press (#263)
  longPressMenu(cn); longPressMenu(cw); longPressMenu(treeEl); longPressMenu(objBody);
  on(cn, 'wheel', (e) => { e.preventDefault(); vsc.scrollTop += e.deltaY; }, { passive: false });

  // names-column splitter (DOM)
  const splitNames = $('.isim-split-names');
  on(splitNames, 'mousedown', (e) => e.preventDefault());   // no text selection, the focus stays
  on(splitNames, 'pointerdown', (e) => {
    if (!e.isPrimary) return;
    const x0 = e.clientX, w0 = st.valW;
    track(splitNames, e, (ev) => { st.valW = clamp(w0 + ev.clientX - x0, 40, 800); layout(); }, () => {});
  });

  // ---------------------------------------------------------------- wave canvas interaction
  function snapTime(t, y) {
    const i = rowAtY(y);
    const tol = 5 * st.scale;
    if (i < 0) return t;
    const it = flat()[i];
    if (it.row.kind !== 'sig') return t;
    const w = itemWave(it);
    if (!w) return t;
    const k = lowerBound(w.t, t);
    let best = t, bd = tol + 1;
    for (const j of [k - 1, k]) if (j >= 0 && j < w.t.length && Math.abs(w.t[j] - t) < bd) { bd = Math.abs(w.t[j] - t); best = w.t[j]; }
    return bd <= tol ? best : t;
  }
  function markerNear(x) {
    let best = null, bd = 5;
    for (const m of st.markers) { const d = Math.abs(xOf(m.t) - x); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  // two fingers on the waves (#674): a drag scrolls them (time, rows), a pinch zooms the time; the cursor, the
  // marker and the selection the first finger moved put back
  let waveDrag = null;
  twoFingerView(cw, {
    cancel: () => {
      const d = waveDrag;
      waveDrag = null;
      if (!d) return;
      d.stop();
      st.cursor = d.cursor; st.sel = d.sel; st.anchor = d.anchor; st.activeMarker = d.activeMarker;
      if (d.m) d.m.t = d.mt;
      objectsChanged(); invalidate(false);
    },
    pan: (dx, dy) => {
      if (dx) { st.t0 -= dx * st.scale; st.fit = false; clampView(); invalidate(); }
      if (dy) vsc.scrollTop -= dy;
    },
    zoom: (f, cx) => zoomAt(1 / f, cx - cw.getBoundingClientRect().left),
  });
  on(cw, 'pointerdown', (e) => {
    if (!e.isPrimary) return;
    cw.focus();
    if (e.button !== 0) return;
    const [x, y] = localXY(e, cw);
    if (st.stim.on && y >= RULER_H && stimClick(x, y)) return;
    const m = y < RULER_H ? markerNear(x) : null;
    const was = { cursor: st.cursor, sel: new Set(st.sel), anchor: st.anchor, activeMarker: st.activeMarker, m, mt: m?.t };
    if (y >= RULER_H) { const i = rowAtY(y); if (i >= 0) selectRow(i, e); }
    const move = (ev, final) => {
      const [xx, yy] = localXY(ev, cw);
      let t = clamp(tOf(xx), 0, Math.max(sim.now, tOf(sizes().WW)));
      if (m) { m.t = Math.round(snapTime(t, yy)); st.activeMarker = m; invalidate(false); }
      else setCursor(ev.shiftKey ? t : snapTime(t, yy));
      if (!final) {
        if (xx > sizes().WW - 4) { st.t0 += 10 * st.scale; st.fit = false; clampView(); invalidate(); }
        else if (xx < 4 && st.t0 > 0) { st.t0 = Math.max(0, st.t0 - 10 * st.scale); st.fit = false; invalidate(); }
      }
    };
    move(e);
    waveDrag = { ...was, stop: track(cw, e, (ev) => move(ev), (ev) => { waveDrag = null; if (ev.type === 'pointerup') move(ev, true); }) };
  });
  on(cw, 'mousemove', (e) => {
    if (e.buttons) return;
    const [x, y] = localXY(e, cw);
    cw.style.cursor = y < RULER_H && markerNear(x) ? 'ew-resize' : 'crosshair';
  });
  on(cw, 'wheel', (e) => {
    e.preventDefault();
    const [x] = localXY(e, cw);
    if (e.ctrlKey || e.metaKey) { zoomAt(Math.pow(1.0018, e.deltaY), x); return; }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      st.t0 = Math.max(0, st.t0 + d * st.scale); st.fit = false; clampView(); invalidate(); return;
    }
    vsc.scrollTop += e.deltaY;
  }, { passive: false });
  on(cw, 'contextmenu', (e) => {
    e.preventDefault();
    const [x, y] = localXY(e, cw);
    const m = markerNear(x);
    const t = tOf(x);
    if (y >= RULER_H) { const i = rowAtY(y); if (i >= 0 && !st.sel.has(flat()[i].key)) selectRow(i, null); }
    const items = [
      { label: 'Add Marker Here', action: () => addMarker(snapTime(t, y)) },
      { label: 'Add Marker at Cursor', action: () => addMarker(st.cursor) },
      { label: 'Delete Marker', disabled: !m, action: () => removeMarker(m) },
      { label: 'Delete All Markers', disabled: !st.markers.length, action: () => { st.markers = []; st.activeMarker = null; invalidate(false); } },
      { sep: true },
      { label: 'Zoom In', action: () => zoomAt(0.5, x) }, { label: 'Zoom Out', action: () => zoomAt(2, x) }, { label: 'Zoom to Full View', action: zoomFit },
    ];
    if (y >= RULER_H && selectedItems().length) items.push({ sep: true }, ...waveRowMenu());
    showMenu(e.clientX, e.clientY, items);
  });

  // keyboard (wave window)
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { removeSelectedRows(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { st.sel = new Set(flat().map(f => f.key)); invalidate(false); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && !e.ctrlKey) { jumpEdge(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && !e.ctrlKey) { jumpEdge(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const cur = flat().findIndex(f => st.sel.has(f.key));
      const i = clamp((cur < 0 ? -1 : cur) + (e.key === 'ArrowDown' ? 1 : -1), 0, flat().length - 1);
      if (flat()[i]) { selectRow(i, { shiftKey: e.shiftKey, button: 0 }); const y = i * ROW_H; if (y < st.scrollY) vsc.scrollTop = y; else if (y + ROW_H > st.scrollY + sizes().WH - RULER_H) vsc.scrollTop = y + ROW_H - (sizes().WH - RULER_H); }
      e.preventDefault();
    }
    else if (e.key === '+' || e.key === '=') zoomAt(0.5);
    else if (e.key === '-') zoomAt(2);
    else if (e.key === 'f' || e.key === 'F') zoomFit();
    else if (e.key === 'm' || e.key === 'M') addMarker(st.cursor);
  };
  on(cn, 'keydown', onKey); on(cw, 'keydown', onKey);

  return { rowAtY, selectRow, localXY, dragRow: () => dragRow };
}
