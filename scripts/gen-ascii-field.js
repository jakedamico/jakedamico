// Generates ascii-field.svg / ascii-field-dark.svg for the profile README:
// the jakedami.co ascii theme (domain-warped simplex noise → char ramp on a
// 12px grid, field parting around the text block) baked into a self-animating
// SMIL SVG. Frames crossfade on a ping-pong loop so it drifts like the site
// with no JS. The "building stuff_" type-out + blinking cursor sits in the
// carved void. Run: node scripts/gen-ascii-field.js
'use strict';
const fs = require('fs');
const path = require('path');

// Seeded RNG so regeneration is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3D simplex noise — same compact Gustavson port as themes/ascii.js.
function createNoise3D(random = Math.random) {
  const F3 = 1 / 3, G3 = 1 / 6;
  const grad3 = new Float32Array([
    1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
    1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
    0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1,
  ]);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (random() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
  return function noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3,  y3 = y0 - 1 + 3 * G3,  z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0;
    else {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0;
    else {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0;
    else {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0;
    else {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  };
}

// Field tuning — desktop values from themes/ascii.js.
const config = {
  cellSize: 12,
  noiseScale: 0.021,
  warpAmp: 1.25,
  warpBias: 0.05,
  ramp: ' .,:;+*o#',
  visibilityThreshold: 0.5,
};

// Banner geometry.
const W = 900, H = 260;
const CELL = config.cellSize;
const COLS = Math.ceil(W / CELL);   // 75
const ROWS = Math.ceil(H / CELL);   // 22
// Zone the field parts around — sized to "building stuff_" at 23px, same
// padding (+30 / +22) and fade (96) as the site's setZone call.
const ZONE = { cx: W / 2, cy: H / 2, hw: 140, hh: 36, fade: 96 };

// Animation: unique frames ping-pong (0..N-1..1) so the loop is seamless
// without needing time-periodic noise. Crossfaded linearly.
const FRAMES = 12;
const STEP_SECONDS = 1.8;
const DT_NOISE = 0.3;          // noise-time between frames (t units)
const STEPS = 2 * FRAMES - 2;  // 22
const DUR = STEPS * STEP_SECONDS;

const noise = createNoise3D(mulberry32(42));

// One frame = per-ramp-index row strings (index → one char, one gray).
function renderFrame(f) {
  const t = f * DT_NOISE;
  const clockMs = f * STEP_SECONDS * 1000;
  const breath = Math.sin(t * 0.18) * 0.05;
  const zoneBreath = Math.sin(clockMs * 0.0006) * 4;
  const ramp = config.ramp;
  const rampMax = ramp.length - 1;
  const ns = config.noiseScale;
  const minN = config.visibilityThreshold;
  const invSpan = 1 / (1 - minN);

  // levels[idx][row] = array of COLS chars (spaces where other levels live)
  const levels = Array.from({ length: ramp.length }, () =>
    Array.from({ length: ROWS }, () => null));

  for (let j = 0; j < ROWS; j++) {
    const y = j * CELL;
    for (let i = 0; i < COLS; i++) {
      const x = i * CELL;
      const wx = noise(i * ns + 13.7, j * ns + 7.3, t);
      const wy = noise(i * ns - 9.2, j * ns + 3.1, t);
      let n = noise(i * ns + config.warpAmp * wx, j * ns + config.warpAmp * wy, t) * 0.5 + 0.5 + config.warpBias;
      n += breath;

      const zdx = Math.max(0, Math.abs(x - ZONE.cx) - (ZONE.hw + zoneBreath));
      const zdy = Math.max(0, Math.abs(y - ZONE.cy) - (ZONE.hh + zoneBreath));
      const zd = Math.hypot(zdx, zdy);
      if (zd < ZONE.fade) {
        const kf = 1 - zd / ZONE.fade;
        n *= 1 - kf * kf;
      }

      if (n < minN) continue;
      if (n > 1) n = 1;
      const nn = (n - minN) * invSpan;
      const idx = Math.min(rampMax, Math.max(1, (nn * (rampMax + 1)) | 0));
      if (!levels[idx][j]) levels[idx][j] = new Array(COLS).fill(' ');
      levels[idx][j][i] = ramp[idx];
    }
  }
  return levels;
}

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function frameGroup(levels, f, grayFor) {
  const rampMax = config.ramp.length - 1;
  // Opacity keyframe at every step edge: 1 where the ping-pong sequence
  // shows this frame, 0 elsewhere — linear interpolation = crossfade.
  const values = [];
  const keyTimes = [];
  for (let s = 0; s <= STEPS; s++) {
    const k = s <= FRAMES - 1 ? s : STEPS - s; // 0..11..1, wraps to 0
    values.push(k === f ? '1' : '0');
    keyTimes.push((s / STEPS).toFixed(4));
  }
  let out = `<g opacity="0"><animate attributeName="opacity" dur="${DUR}s" repeatCount="indefinite" values="${values.join(';')}" keyTimes="${keyTimes.join(';')}"/>`;
  for (let idx = 1; idx <= rampMax; idx++) {
    const rows = levels[idx];
    if (!rows.some(Boolean)) continue;
    const g = grayFor(idx / rampMax);
    out += `<text xml:space="preserve" fill="rgb(${g},${g},${g})" font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace" font-size="11"`;
    for (let j = 0; j < ROWS; j++) {
      if (!rows[j]) continue;
      out += `><tspan x="3" y="${j * CELL + 10}" textLength="${COLS * CELL}" lengthAdjust="spacing">${xmlEsc(rows[j].join(''))}</tspan`;
    }
    out += `></text>`;
  }
  return out + `</g>`;
}

// "building stuff_" — same type-out + blink as typing.svg, in the void.
function typedText(fill) {
  const chars = 'building stuff'.split('');
  let out = `<text x="${ZONE.cx}" y="${H / 2 + 8}" text-anchor="middle" font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace" font-size="23" letter-spacing="1.4" fill="${fill}"`;
  chars.forEach((c, i) => {
    const ch = c === ' ' ? '&#160;' : c;
    const begin = (0.40 + i * 0.09).toFixed(2);
    out += `><tspan opacity="0">${ch}<animate attributeName="opacity" to="1" begin="${begin}s" dur="0.01s" fill="freeze"/></tspan`;
  });
  out += `><tspan opacity="0">_<animate attributeName="opacity" calcMode="discrete" values="1;0" keyTimes="0;0.5" begin="1.72s" dur="1.1s" repeatCount="indefinite"/></tspan`;
  return out + `></text>`;
}

function buildSvg({ grayFor, textFill }) {
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameGroup(renderFrame(f), f, grayFor));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="building stuff">\n` +
    frames.join('\n') + '\n' + typedText(textFill) + '\n</svg>\n';
}

const outDir = path.join(__dirname, '..');
// Dark: site brightness ramp (gray 80→190) on transparent, off-white text.
fs.writeFileSync(path.join(outDir, 'ascii-field-dark.svg'), buildSvg({
  grayFor: (t) => Math.floor(80 + t * (190 - 80)),
  textFill: '#f2f2f2',
}));
// Light: ramp inverted for a light page (faint 200 → strong 90), dark text.
fs.writeFileSync(path.join(outDir, 'ascii-field.svg'), buildSvg({
  grayFor: (t) => Math.floor(200 - t * (200 - 90)),
  textFill: '#1c1a17',
}));

for (const f of ['ascii-field-dark.svg', 'ascii-field.svg']) {
  const kb = (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(1);
  console.log(`${f}  ${kb} KB`);
}
