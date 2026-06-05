(function () {
  'use strict';
  const P = window.CordlePaint;
  const E = window.CordleEngine;
  const Bsh = window.CordleBrush;

  const W = 420, H = 420;
  const SPOT_X = 210, SPOT_Y = 210, SAMPLE_RADIUS = 6;
  const BEST_KEY = 'cordle-paint-best';

  const $ = (id) => document.getElementById(id);
  const rgbCss = (rgb) => `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;

  const canvas = $('paint-canvas');
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);

  const latents = P.pigmentLatents(P.PAINT_PALETTE);
  const buffer = P.createBuffer(W, H);
  const brush = Bsh.createBrush();

  let target = null;
  let selected = 0;
  let painting = false;
  let last = null;
  let strokeSeed = 1;
  let bristles = Bsh.bristleOffsets(16, strokeSeed, undefined);

  function fillWhite() {
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function renderRegion(cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(W - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(H - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = P.colorAt(buffer, x, y);
        const idx = (y * W + x) * 4;
        img.data[idx] = c[0]; img.data[idx + 1] = c[1]; img.data[idx + 2] = c[2]; img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0, x0, y0, (x1 - x0) + 1, (y1 - y0) + 1);
  }

  function positionSpot() {
    const spot = $('spot');
    spot.style.left = (SPOT_X / W * 100) + '%';
    spot.style.top = (SPOT_Y / H * 100) + '%';
  }

  function toLogical(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (W / rect.width),
      y: (ev.clientY - rect.top) * (H / rect.height),
    };
  }

  function controls() {
    return {
      radius: +$('size').value,
      flow: (+$('flow').value) / 100,
      wetness: (+$('wet').value) / 100,
    };
  }

  function updateBrushIndicator() {
    const c = Bsh.brushColor(brush);
    $('brush-swatch').style.background = c ? rgbCss(c) : 'transparent';
    $('brush-load').style.width = (Bsh.brushLoad(brush) * 100) + '%';
  }

  function dab(x, y, speed) {
    const { radius, flow, wetness } = controls();
    Bsh.applyBrushDab(buffer, brush, x, y, { radius, flow, wetness, bristles, speed });
    renderRegion(x, y, radius);
  }

  function dabLine(a, b) {
    const { radius } = controls();
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / Math.max(1, radius * 0.4)));
    for (let s = 1; s <= steps; s++) {
      dab(a.x + (dx * s) / steps, a.y + (dy * s) / steps, dist);
    }
    updateBrushIndicator();
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    painting = true;
    strokeSeed += 1;
    bristles = Bsh.bristleOffsets(+$('size').value, strokeSeed, undefined);
    const pt = toLogical(ev);
    last = pt;
    dab(pt.x, pt.y, 0);
    updateBrushIndicator();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const pt = toLogical(ev);
    dabLine(last, pt);
    last = pt;
  });
  const endStroke = () => { painting = false; last = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', endStroke);

  function reload() {
    Bsh.loadBrush(brush, latents[selected]);
    updateBrushIndicator();
  }

  function renderPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    P.PAINT_PALETTE.forEach((pig, i) => {
      const el = document.createElement('div');
      el.className = 'pig' + (i === selected ? ' selected' : '');
      el.style.background = rgbCss(pig.rgb);
      el.title = pig.name;
      el.addEventListener('click', () => { selected = i; reload(); renderPalette(); });
      pal.appendChild(el);
    });
  }

  function clearCanvas() {
    P.clearBuffer(buffer);
    fillWhite();
    $('spot-readout').style.background = '#fff';
    $('result').innerHTML = '';
  }

  function newTarget() {
    target = P.generateTarget(P.PAINT_PALETTE, Math.random);
    $('target').style.background = rgbCss(target.rgb);
    clearCanvas();
    reload();
  }

  function tier(pct) {
    if (pct >= 98) return 'Nailed it!';
    if (pct >= 90) return 'Great';
    if (pct >= 75) return 'Close';
    return 'Keep mixing';
  }

  function lockIn() {
    const c = P.sampleSpot(buffer, SPOT_X, SPOT_Y, SAMPLE_RADIUS);
    $('spot-readout').style.background = rgbCss(c);
    const pct = E.matchPercent(c, target.rgb);
    $('result').innerHTML = `<span class="pct">${pct}%</span> — ${tier(pct)}`;
    let best = 0;
    try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { best = 0; }
    if (pct > best) {
      best = pct;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    $('best').textContent = `Best match: ${best}%`;
  }

  $('lock').addEventListener('click', lockIn);
  $('clear').addEventListener('click', clearCanvas);
  $('new').addEventListener('click', newTarget);

  let best0 = 0;
  try { best0 = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { best0 = 0; }
  $('best').textContent = `Best match: ${best0}%`;

  positionSpot();
  renderPalette();
  fillWhite();
  newTarget();
})();
