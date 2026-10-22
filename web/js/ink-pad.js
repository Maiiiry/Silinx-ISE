// The drawing pad of the handwritten input (#1056): a canvas a pen, a finger or the mouse writes on, one stroke at a
// time (a second pointer is ignored; once a pen has written, a touch is the hand resting on the screen). The strokes
// are kept in CSS pixels of the canvas; the characters recognized can be shown under their ink.
//
//   const pad = mountInkPad(host, { onStroke(strokes) });
//   pad.strokes(), pad.undo(), pad.clear(), pad.setLabels([{ ch, box }]), pad.canvas, pad.destroy()
// Styles: web/css/ink.css.
import { h } from './ui.js';

export function mountInkPad(host, { onStroke } = {}) {
  const canvas = h('canvas', { class: 'ink-canvas' });
  host.append(canvas);
  let strokes = [], cur = null, penSeen = false, labels = [];
  const ctx = canvas.getContext('2d');
  const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function draw() {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, ht = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(ht * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(ht * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, ht);
    const css = getComputedStyle(canvas);
    // a guide line to write on
    ctx.strokeStyle = css.getPropertyValue('--ink-guide').trim() || css.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(8, ht * 0.72); ctx.lineTo(w - 8, ht * 0.72); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = css.color;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    }
    ctx.fillStyle = css.getPropertyValue('--ink-label').trim() || css.color;
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    for (const l of labels) ctx.fillText(l.ch, (l.box.minX + l.box.maxX) / 2, Math.min(ht - 4, l.box.maxY + 16));
  }

  const down = e => {
    if (cur || (e.pointerType === 'touch' && penSeen) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'pen') penSeen = true;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    cur = { id: e.pointerId, pts: [point(e)] };
    strokes.push(cur.pts);
    labels = [];
    draw();
  };
  const move = e => {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    // the points the browser merged into this event too (a pen moves faster than the frames); none in an event made by a script
    const all = e.getCoalescedEvents?.();
    for (const ev of all?.length ? all : [e]) cur.pts.push(point(ev));
    draw();
  };
  const up = e => {
    if (!cur || e.pointerId !== cur.id) return;
    cur = null;
    draw();
    onStroke?.(strokes);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // (an iPad's pen, #1086: its touches' own actions, selecting the text around, Scribble's handwriting into text,
  // cancelled; the pointer events still come)
  const still = e => { if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener('touchstart', still, { passive: false });
  canvas.addEventListener('touchmove', still, { passive: false });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(canvas);
  requestAnimationFrame(draw);

  return {
    canvas,
    strokes: () => strokes.map(s => s.map(p => ({ ...p }))),
    undo() { if (cur) return; strokes.pop(); labels = []; draw(); onStroke?.(strokes); },
    clear() { cur = null; strokes = []; labels = []; draw(); onStroke?.(strokes); },
    setLabels(list) { labels = list || []; draw(); },
    destroy() { ro?.disconnect(); canvas.remove(); },
  };
}
