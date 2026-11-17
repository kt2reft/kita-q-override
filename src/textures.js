// プロシージャル PBR テクスチャ生成（外部アセットなしで写実寄りの質感を作る）
import * as THREE from 'three';
import { makeRng, clamp } from './utils.js';

const JP = '"Yu Gothic UI","Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
const JP_BRUSH = '"HGP行書体","HG行書体","HGS行書体","Yu Mincho","MS PMincho",serif';

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const rm = (rough, metal) => `rgb(0,${Math.round(clamp(rough, 0, 1) * 255)},${Math.round(clamp(metal, 0, 1) * 255)})`;

// ---- タイル可能なバリューノイズ / fBm ----
function valueNoise(seed, period) {
  const rng = makeRng(seed); const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    let xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period;
    const x1 = (xi + 1) % period, y1 = (yi + 1) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = g[yi * period + xi], b = g[yi * period + x1], c = g[y1 * period + xi], d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbmField(size, seed, basePeriod, octaves, gain = 0.5) {
  const out = new Float32Array(size * size); let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = basePeriod << o; const n = valueNoise(seed + o * 101, p); const s = p / size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] += n(x * s, y * s) * amp;
    norm += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function normalCanvas(h, size, strength) {
  const c = mk(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
    const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
    const nx = (xl - xr) * strength, ny = (yd - yu) * strength; const l = Math.hypot(nx, ny, 1);
    const i = (y * size + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
function heightFromCanvas(c) {
  const S = c.width, d = c.getContext('2d').getImageData(0, 0, S, S).data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = d[i * 4] / 255;
  return h;
}
// キャンバス全体にノイズで汚れを乗算
function grime(c, field, amount, streak = 0) {
  const S = c.width, ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, S, c.height), d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; const n = field[(y % S) * S + x];
    let k = 1 - amount + n * amount * 1.6;
    if (streak) k *= 1 - streak * field[((x * 7) % S) + ((y >> 3) % S) * S] * 0.6;
    d[i] = clamp(d[i] * k, 0, 255); d[i + 1] = clamp(d[i + 1] * k, 0, 255); d[i + 2] = clamp(d[i + 2] * k, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

// ---- 路面 ----
function makeAsphalt() {
  const S = 512; const low = fbmField(S, 11, 4, 4), hi = fbmField(S, 23, 32, 3); const rng = makeRng(5);
  const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  const rc = mk(S, S), rctx = rc.getContext('2d'), rimg = rctx.createImageData(S, S), rd = rimg.data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const sp = rng();
    let v = 74 + (low[i] - 0.5) * 44 + (hi[i] - 0.5) * 24 + (sp - 0.5) * 26;
    if (sp > 0.975) v += 42; if (sp < 0.02) v -= 18;
    d[i * 4] = v; d[i * 4 + 1] = v * 0.99; d[i * 4 + 2] = v * 1.03; d[i * 4 + 3] = 255;
    h[i] = hi[i] * 0.45 + sp * 0.55;
    const rough = clamp(232 - (0.62 - low[i]) * 190, 120, 250);
    rd[i * 4] = 0; rd[i * 4 + 1] = rough; rd[i * 4 + 2] = 0; rd[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); rctx.putImageData(rimg, 0, 0);
  // ひび割れと補修跡
  ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = rng() * S, y = rng() * S, a = rng() * 6.28;
    ctx.strokeStyle = `rgba(14,14,16,${0.35 + rng() * 0.3})`; ctx.lineWidth = 1 + rng() * 1.2; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 26; s++) { a += (rng() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return { map: tex(c, true), normalMap: tex(normalCanvas(h, S, 2.4)), roughnessMap: tex(rc) };
}
function makePaving() {
  const S = 512, N = 8, cell = S / N, rng = makeRng(31); const f = fbmField(S, 77, 8, 4);
  const c = mk(S, S), ctx = c.getContext('2d'), hc = mk(S, S), H = hc.getContext('2d');
  ctx.fillStyle = '#5c5952'; ctx.fillRect(0, 0, S, S); H.fillStyle = '#404040'; H.fillRect(0, 0, S, S);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 138 + rng() * 34; const warm = rng() * 10;
    ctx.fillStyle = `rgb(${v + warm},${v + warm * 0.5},${v - 4})`;
    ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    H.fillStyle = `rgb(${200 + rng() * 40},0,0)`; H.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
  }
  grime(c, f, 0.3);
  return { map: tex(c, true), normalMap: tex(normalCanvas(heightFromCanvas(hc), S, 3)) };
}
function makePlaza() {
  const S = 512, N = 4, cell = S / N, rng = makeRng(41); const f = fbmField(S, 91, 16, 4);
  const c = mk(S, S), ctx = c.getContext('2d'), hc = mk(S, S), H = hc.getContext('2d');
  ctx.fillStyle = '#3d3a37'; ctx.fillRect(0, 0, S, S); H.fillStyle = '#505050'; H.fillRect(0, 0, S, S);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dark = (x + y) % 2 === 0; const v = (dark ? 112 : 168) + rng() * 16;
    ctx.fillStyle = `rgb(${v + 6},${v + 2},${v - 2})`; ctx.fillRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
    H.fillStyle = '#e0e0e0'; H.fillRect(x * cell + 2.5, y * cell + 2.5, cell - 5, cell - 5);
  }
  grime(c, f, 0.22);
  return { map: tex(c, true), normalMap: tex(normalCanvas(heightFromCanvas(hc), S, 2)) };
}
function makeConcrete() {
  const S = 256; const f = fbmField(S, 51, 4, 5);
  const c = mk(S, S), ctx = c.getContext('2d'); ctx.fillStyle = '#a6a39c'; ctx.fillRect(0, 0, S, S);
  grime(c, f, 0.35, 0.5);
  return { map: tex(c, true) };
}
function makeRoof() {
  const S = 256; const f = fbmField(S, 61, 8, 5); const rng = makeRng(9);
  const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const v = 70 + f[i] * 50 + (rng() - 0.5) * 22; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v * 1.02; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, true) };
}
function makeWood() {
  const S = 256; const f = fbmField(S, 71, 4, 5);
  const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const grain = f[(y * S + ((x * 9) % S))] * 0.6 + f[i] * 0.4;
    const plank = (x % 64 < 2) ? 0.55 : 1; const v = (0.62 + grain * 0.5) * plank;
    d[i * 4] = 150 * v; d[i * 4 + 1] = 100 * v; d[i * 4 + 2] = 58 * v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, true) };
}
function makeTempura() {
  const S = 128; const f = fbmField(S, 81, 8, 4); const rng = makeRng(3);
  const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = f[i] * 0.8 + rng() * 0.2;
    d[i * 4] = 150 + v * 90; d[i * 4 + 1] = 92 + v * 80; d[i * 4 + 2] = 24 + v * 46; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const h = new Float32Array(S * S); for (let i = 0; i < h.length; i++) h[i] = f[i];
  return { map: tex(c, true), normalMap: tex(normalCanvas(h, S, 5)) };
}

function makeFoliage() {
  const S = 256; const f = fbmField(S, 131, 16, 4); const rng = makeRng(17);
  const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data; const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const sp = rng(), v = 0.62 + f[i] * 0.5 + (sp - 0.5) * 0.34;
    d[i * 4] = clamp(255 * v, 0, 255); d[i * 4 + 1] = clamp(250 * v * (0.92 + f[i] * 0.12), 0, 255); d[i * 4 + 2] = clamp(235 * v * 0.9, 0, 255); d[i * 4 + 3] = 255;
    h[i] = f[i] * 0.5 + sp * 0.5;
  }
  ctx.putImageData(img, 0, 0);
  const m = tex(c, true), n = tex(normalCanvas(h, S, 4.5)); m.repeat.set(3, 3); n.repeat.set(3, 3);
  return { map: m, normalMap: n };
}

// ---- ビル外壁（4列×4階ぶんを1タイル）----
const FACADE_STYLES = [
  { name: 'glass', wall: '#2f3d47', frame: '#26323a', glassA: '#31505f', glassB: '#182a36', winW: 0.93, winTop: 0.05, winH: 0.9, lit: 0.1, wallRough: 0.45, wallMetal: 0.6, blind: 0.12, grime: 0.12 },
  { name: 'mansion', wall: '#b9a88e', frame: '#6d665c', glassA: '#3c4b55', glassB: '#1c252c', winW: 0.62, winTop: 0.12, winH: 0.5, lit: 0.22, wallRough: 0.85, wallMetal: 0, blind: 0.4, tiles: true, balcony: '#d6cdbd', grime: 0.3 },
  { name: 'office', wall: '#a9a8a2', frame: '#4a4c4e', glassA: '#3b5563', glassB: '#17252e', winW: 1.0, winTop: 0.24, winH: 0.46, lit: 0.16, wallRough: 0.8, wallMetal: 0, blind: 0.3, grime: 0.28 },
  { name: 'white', wall: '#d6d2c9', frame: '#8a8a86', glassA: '#445863', glassB: '#1d2a32', winW: 0.5, winTop: 0.22, winH: 0.5, lit: 0.18, wallRough: 0.75, wallMetal: 0, blind: 0.35, grime: 0.32 },
  { name: 'brick', wall: '#7b4d3c', frame: '#d9d4c8', glassA: '#3a4a52', glassB: '#141d22', winW: 0.56, winTop: 0.2, winH: 0.54, lit: 0.2, wallRough: 0.88, wallMetal: 0, blind: 0.3, tiles: true, grime: 0.3 },
  { name: 'old', wall: '#8d887c', frame: '#55524b', glassA: '#39464c', glassB: '#151b1f', winW: 0.46, winTop: 0.26, winH: 0.42, lit: 0.2, wallRough: 0.92, wallMetal: 0, blind: 0.45, ac: true, grime: 0.5 },
];
function makeFacade(seed, o) {
  const S = 512, C = 4, R = 4, cw = S / C, ch = S / R, rng = makeRng(seed);
  const a = mk(S, S), r = mk(S, S), e = mk(S, S), h = mk(S, S);
  const A = a.getContext('2d'), M = r.getContext('2d'), E = e.getContext('2d'), H = h.getContext('2d');
  A.fillStyle = o.wall; A.fillRect(0, 0, S, S);
  M.fillStyle = rm(o.wallRough, o.wallMetal); M.fillRect(0, 0, S, S);
  E.fillStyle = '#000'; E.fillRect(0, 0, S, S);
  H.fillStyle = '#9a9a9a'; H.fillRect(0, 0, S, S);
  if (o.tiles) {
    A.strokeStyle = 'rgba(0,0,0,0.16)'; A.lineWidth = 1; H.strokeStyle = '#707070'; H.lineWidth = 1;
    for (let y = 0; y < S; y += 8) { A.beginPath(); A.moveTo(0, y + 0.5); A.lineTo(S, y + 0.5); A.stroke(); H.beginPath(); H.moveTo(0, y + 0.5); H.lineTo(S, y + 0.5); H.stroke(); }
    for (let y = 0; y < S; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) { A.beginPath(); A.moveTo(x + 0.5, y); A.lineTo(x + 0.5, y + 8); A.stroke(); }
  }
  for (let row = 0; row < R; row++) for (let col = 0; col < C; col++) {
    const x0 = col * cw + cw * (1 - o.winW) / 2, y0 = row * ch + ch * o.winTop, w = cw * o.winW, hh = ch * o.winH;
    A.fillStyle = o.frame; A.fillRect(x0 - 3, y0 - 3, w + 6, hh + 6);
    H.fillStyle = '#d0d0d0'; H.fillRect(x0 - 3, y0 - 3, w + 6, hh + 6);
    M.fillStyle = rm(0.5, 0.4); M.fillRect(x0 - 3, y0 - 3, w + 6, hh + 6);
    const lit = rng() < o.lit;
    const g = A.createLinearGradient(0, y0, 0, y0 + hh); g.addColorStop(0, o.glassA); g.addColorStop(1, o.glassB);
    A.fillStyle = g; A.fillRect(x0, y0, w, hh);
    H.fillStyle = '#4a4a4a'; H.fillRect(x0, y0, w, hh);
    M.fillStyle = rm(0.06 + rng() * 0.08, 0.85); M.fillRect(x0, y0, w, hh);
    if (lit) {
      const warm = rng() < 0.7; const col = warm ? [255, 196, 120] : [205, 225, 255]; const k = 0.5 + rng() * 0.5;
      A.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.82)`; A.fillRect(x0, y0, w, hh);
      E.fillStyle = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`; E.fillRect(x0, y0, w, hh);
      M.fillStyle = rm(0.3, 0.1); M.fillRect(x0, y0, w, hh);
    } else if (rng() < o.blind) {
      const bh = hh * (0.25 + rng() * 0.7);
      A.fillStyle = `rgba(${205 + rng() * 30 | 0},${205 + rng() * 25 | 0},${190 + rng() * 25 | 0},0.86)`; A.fillRect(x0, y0, w, bh);
      M.fillStyle = rm(0.55, 0.0); M.fillRect(x0, y0, w, bh);
    }
    // 方立て
    A.fillStyle = o.frame; H.fillStyle = '#c0c0c0';
    A.fillRect(x0 + w / 2 - 1.5, y0, 3, hh); H.fillRect(x0 + w / 2 - 1.5, y0, 3, hh);
    if (o.name === 'glass') { A.fillRect(x0, y0 + hh * 0.72, w, 3); H.fillRect(x0, y0 + hh * 0.72, w, 3); }
    if (o.balcony) {
      const by = row * ch + ch * 0.66, bh = ch * 0.3;
      A.fillStyle = o.balcony; A.fillRect(col * cw + 3, by, cw - 6, bh);
      A.fillStyle = 'rgba(0,0,0,0.28)'; A.fillRect(col * cw + 3, by + bh, cw - 6, 5);
      A.fillStyle = 'rgba(255,255,255,0.25)'; A.fillRect(col * cw + 3, by, cw - 6, 3);
      H.fillStyle = '#ffffff'; H.fillRect(col * cw + 3, by, cw - 6, bh);
      M.fillStyle = rm(0.8, 0); M.fillRect(col * cw + 3, by, cw - 6, bh + 5);
    }
    if (o.ac && rng() < 0.6) {
      const ax = x0 + w * 0.15, ay = y0 + hh + 8;
      A.fillStyle = '#c9c7c0'; A.fillRect(ax, ay, 30, 20); A.fillStyle = '#6b6a66'; A.beginPath(); A.arc(ax + 11, ay + 10, 7, 0, 6.3); A.fill();
      H.fillStyle = '#ffffff'; H.fillRect(ax, ay, 30, 20);
    }
    // 窓下の雨だれ
    A.fillStyle = 'rgba(30,26,20,0.10)';
    for (let k = 0; k < 3; k++) A.fillRect(x0 + rng() * w, y0 + hh + 3, 2 + rng() * 3, ch * 0.2 * rng());
  }
  grime(a, fbmField(S, seed + 5, 4, 5), o.grime, 0.25);
  return { map: tex(a, true), rm: tex(r), emissive: tex(e, true), normal: tex(normalCanvas(heightFromCanvas(h), S, 2.2)) };
}

// ---- 1階店舗（8m × 3.6m を 1 タイル、2 店舗入り）----
const SHOP_NAMES = [['ラーメン', '#b3261e', '#fff'], ['居酒屋', '#1d1a17', '#f3d9a0'], ['焼うどん', '#e9e2d0', '#7a1d12'], ['薬', '#0f7b4d', '#fff'],
['不動産', '#1f4b8f', '#fff'], ['珈琲', '#3b2a20', '#e9d8b8'], ['焼鳥', '#8d1414', '#ffd76a'], ['理容', '#f4f4f4', '#1b3fa0'],
['カラオケ', '#6a1b9a', '#ffe14d'], ['弁当', '#f2b705', '#3a1d00'], ['酒', '#20324f', '#fff'], ['整骨院', '#e8f1ec', '#157a54'],
['学習塾', '#ffffff', '#c22'], ['たばこ', '#b3261e', '#fff'], ['餃子', '#f6e9c8', '#a3190f'], ['角打ち', '#2a2018', '#f1e4c2']];
function makeShop(seed) {
  const W = 512, Hh = 256, rng = makeRng(seed);
  const a = mk(W, Hh), r = mk(W, Hh), e = mk(W, Hh);
  const A = a.getContext('2d'), M = r.getContext('2d'), E = e.getContext('2d');
  A.fillStyle = '#6c6860'; A.fillRect(0, 0, W, Hh); M.fillStyle = rm(0.85, 0); M.fillRect(0, 0, W, Hh); E.fillStyle = '#000'; E.fillRect(0, 0, W, Hh);
  for (let s = 0; s < 2; s++) {
    const x0 = s * 256 + 6, w = 244; const shop = SHOP_NAMES[Math.floor(rng() * SHOP_NAMES.length)];
    // 看板帯
    A.fillStyle = shop[1]; A.fillRect(x0, 8, w, 56);
    A.fillStyle = shop[2]; A.font = `900 38px ${JP}`; A.textAlign = 'center'; A.textBaseline = 'middle'; A.fillText(shop[0], x0 + w / 2, 38);
    E.drawImage(a, x0, 8, w, 56, x0, 8, w, 56); E.fillStyle = 'rgba(0,0,0,0.55)'; E.fillRect(x0, 8, w, 56);
    M.fillStyle = rm(0.4, 0); M.fillRect(x0, 8, w, 56);
    const kind = rng();
    if (kind < 0.3) { // シャッター
      for (let y = 72; y < 250; y += 6) { A.fillStyle = (y / 6) % 2 ? '#9a9c9e' : '#7f8284'; A.fillRect(x0, y, w, 6); }
      M.fillStyle = rm(0.45, 0.7); M.fillRect(x0, 72, w, 178);
    } else if (kind < 0.6) { // 木格子 + のれん
      A.fillStyle = '#3b2a1e'; A.fillRect(x0, 72, w, 178);
      A.fillStyle = '#f0c27a'; for (let x = x0 + 8; x < x0 + w - 8; x += 12) A.fillRect(x, 80, 6, 164);
      E.fillStyle = 'rgba(255,180,90,0.75)'; for (let x = x0 + 8; x < x0 + w - 8; x += 12) E.fillRect(x, 80, 6, 164);
      A.fillStyle = '#1e2c4a'; A.fillRect(x0 + 70, 72, 104, 62); A.fillStyle = '#fff'; A.font = `900 30px ${JP}`; A.fillText('の', x0 + 96, 104); A.fillText('れ', x0 + 122, 104); A.fillText('ん', x0 + 148, 104);
      E.fillStyle = '#000'; E.fillRect(x0 + 70, 72, 104, 62);
    } else { // ガラス張り
      const g = A.createLinearGradient(0, 72, 0, 250); g.addColorStop(0, '#5c6d70'); g.addColorStop(1, '#2a3336');
      A.fillStyle = g; A.fillRect(x0, 72, w, 178);
      A.fillStyle = 'rgba(255,214,150,0.5)'; A.fillRect(x0 + 6, 96, w - 12, 110);
      E.fillStyle = 'rgba(255,200,130,0.6)'; E.fillRect(x0 + 6, 96, w - 12, 110);
      M.fillStyle = rm(0.08, 0.6); M.fillRect(x0, 72, w, 178);
      A.fillStyle = '#2c2f31'; for (let k = 0; k <= 3; k++) A.fillRect(x0 + k * (w / 3) - 2, 72, 4, 178);
      A.fillRect(x0, 72, w, 4);
    }
    A.fillStyle = '#4b4843'; A.fillRect(x0 - 6, 250, w + 12, 6);
  }
  grime(a, fbmField(512, seed + 3, 4, 4), 0.18);
  return { map: tex(a, true), rm: tex(r), emissive: tex(e, true) };
}

// ---- 看板・文字系 ----
export function makeSign(text, o = {}) {
  const w = o.w || 512, h = o.h || 128; const c = mk(w, h), x = c.getContext('2d');
  if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, w, h); }
  if (o.border) { x.strokeStyle = o.border; x.lineWidth = o.borderW || 8; x.strokeRect(4, 4, w - 8, h - 8); }
  x.fillStyle = o.fg || '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = o.brush ? JP_BRUSH : JP;
  if (o.vertical) {
    const chars = [...text]; const size = o.size || Math.min(w * 0.8, (h - 16) / chars.length);
    x.font = `900 ${size}px ${font}`;
    chars.forEach((ch, i) => x.fillText(ch, w / 2, (h - chars.length * size) / 2 + size * (i + 0.5)));
  } else {
    const size = o.size || h * 0.6; x.font = `${o.weight || 900} ${size}px ${font}`;
    if (o.stroke) { x.strokeStyle = o.stroke; x.lineWidth = o.strokeW || 6; x.lineJoin = 'round'; x.strokeText(text, w / 2, o.sub ? h * 0.42 : h / 2); }
    x.fillText(text, w / 2, o.sub ? h * 0.42 : h / 2, w - 20);
    if (o.sub) { x.font = `700 ${h * 0.16}px ${JP}`; x.fillStyle = o.subColor || o.fg || '#fff'; x.fillText(o.sub, w / 2, h * 0.82, w - 20); }
  }
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeFace() {
  const c = mk(256, 128), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 128);
  const cx = 64, cy = 60;
  const g = x.createRadialGradient(cx, cy + 14, 2, cx, cy + 14, 40); g.addColorStop(0, 'rgba(255,214,200,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (const s of [-1, 1]) {
    x.fillStyle = '#f6f2ee'; x.beginPath(); x.ellipse(cx + s * 11, cy, 5.2, 2.8, 0, 0, 6.3); x.fill();
    x.fillStyle = '#231710'; x.beginPath(); x.ellipse(cx + s * 11, cy, 2.7, 2.6, 0, 0, 6.3); x.fill();
    x.strokeStyle = '#2a1c14'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cx + s * 5.5, cy - 7); x.lineTo(cx + s * 17, cy - 8.5); x.stroke();
    x.strokeStyle = 'rgba(60,35,25,0.55)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx + s * 6, cy - 2.6); x.quadraticCurveTo(cx + s * 11, cy - 4.4, cx + s * 16, cy - 2.2); x.stroke();
  }
  x.strokeStyle = 'rgba(130,80,60,0.5)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx + 1, cy + 3); x.lineTo(cx - 2.5, cy + 13); x.lineTo(cx + 2.5, cy + 14); x.stroke();
  x.strokeStyle = 'rgba(150,62,58,0.9)'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(cx - 6.5, cy + 23); x.quadraticCurveTo(cx, cy + 25, cx + 6.5, cy + 23); x.stroke();
  const t = tex(c, true); return t;
}
function makeCloud() {
  const S = 512, f = fbmField(S, 201, 3, 6, 0.55); const c = mk(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const a = clamp((f[i] - 0.5) / 0.22, 0, 1);
    d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = a * a * 235;
  }
  ctx.putImageData(img, 0, 0); return tex(c, true);
}
function makeRadialMask() { // 雲レイヤーの外周フェード用
  const S = 128, c = mk(S, S), x = c.getContext('2d'); const g = x.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = tex(c, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeLeaves() {
  const S = 256, c = mk(S, S), x = c.getContext('2d'), rng = makeRng(404);
  for (let i = 0; i < 520; i++) {
    const a = rng() * 6.28, r = Math.pow(rng(), 0.7) * 120, px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r;
    x.fillStyle = `rgba(${215 + rng() * 40 | 0},${160 + rng() * 50 | 0},${20 + rng() * 40 | 0},${0.75 + rng() * 0.25})`;
    x.save(); x.translate(px, py); x.rotate(rng() * 6.28); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 3 + rng() * 2.5, -0.9, 0.9); x.closePath(); x.fill(); x.restore();
  }
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeVending(v) {
  const c = mk(128, 256), x = c.getContext('2d'), rng = makeRng(600 + v);
  x.fillStyle = v ? '#c8261f' : '#eef0f2'; x.fillRect(0, 0, 128, 256);
  x.fillStyle = '#f7fbff'; x.fillRect(8, 10, 112, 130);
  const cols = ['#d33', '#27a', '#2a6', '#e90', '#222', '#a3c', '#fff', '#0aa'];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
    x.fillStyle = cols[Math.floor(rng() * cols.length)]; x.fillRect(13 + k * 15, 16 + r * 42, 10, 28);
    x.fillStyle = '#d7dde2'; x.fillRect(12 + k * 15, 46 + r * 42, 12, 5);
  }
  x.fillStyle = '#20242a'; x.fillRect(8, 150, 112, 26); x.fillStyle = '#111'; x.fillRect(22, 200, 84, 34);
  x.fillStyle = v ? '#fff' : '#c22'; x.font = `900 15px ${JP}`; x.textAlign = 'center'; x.fillText('つめた〜い', 64, 168);
  const e = mk(128, 256), E = e.getContext('2d'); E.fillStyle = '#000'; E.fillRect(0, 0, 128, 256); E.drawImage(c, 8, 10, 112, 130, 8, 10, 112, 130);
  const t = tex(c, true), te = tex(e, true); t.wrapS = t.wrapT = te.wrapS = te.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t, emissive: te };
}
function makeNoren() {
  const c = mk(512, 192), x = c.getContext('2d'); x.fillStyle = '#18233f'; x.fillRect(0, 0, 512, 192);
  x.fillStyle = '#10182c'; for (let k = 1; k < 4; k++) x.fillRect(k * 128 - 2, 40, 4, 152);
  x.fillStyle = '#f2ecdc'; x.font = `900 120px ${JP_BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  ['角', '打', 'ち', '酒'].forEach((ch, i) => x.fillText(ch, 64 + i * 128, 104));
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeBanner() {
  const c = mk(1024, 256), x = c.getContext('2d'); x.fillStyle = '#fbf8f0'; x.fillRect(0, 0, 1024, 256);
  for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? '#fbf8f0' : '#c8161d'; x.fillRect(k * 64, 196, 64, 60); x.fillRect(k * 64, 0, 64, 22); }
  x.fillStyle = '#c8161d'; x.font = `900 122px ${JP_BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('祝 二十歳のつどい', 512, 112, 980);
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeCoatBack() {
  const c = mk(256, 256), x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 78px ${JP_BRUSH}`;
  x.lineJoin = 'round'; x.strokeStyle = '#d9a21b'; x.lineWidth = 8; x.fillStyle = '#5b1a8f';
  ['北', '九', '魂'].forEach((ch, i) => { x.strokeText(ch, 128, 46 + i * 82); x.fillText(ch, 128, 46 + i * 82); });
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeKohaku() {
  const c = mk(256, 64), x = c.getContext('2d');
  for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#f6f2ea' : '#c8161d'; x.fillRect(k * 32, 0, 32, 64); }
  return tex(c, true);
}
function makeParkingLines() {
  const c = mk(512, 512), x = c.getContext('2d'); x.clearRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(232,232,226,0.92)'; x.lineWidth = 5;
  for (let k = 0; k <= 6; k++) { x.beginPath(); x.moveTo(40 + k * 72, 20); x.lineTo(40 + k * 72, 170); x.stroke(); x.beginPath(); x.moveTo(40 + k * 72, 340); x.lineTo(40 + k * 72, 492); x.stroke(); }
  const t = tex(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function buildTextures() {
  const T = {};
  T.asphalt = makeAsphalt();
  T.paving = makePaving();
  T.plaza = makePlaza();
  T.concrete = makeConcrete();
  T.roof = makeRoof();
  T.wood = makeWood();
  T.tempura = makeTempura();
  T.foliage = makeFoliage();
  T.facades = FACADE_STYLES.map((o, i) => makeFacade(100 + i * 7, o));
  T.shops = [makeShop(301), makeShop(302), makeShop(303), makeShop(304)];
  const vs = [['ラーメン', '#b3261e', '#fff'], ['カラオケ', '#5a1a8a', '#ffe14d'], ['焼うどん', '#f1ead6', '#8a1b10'], ['居酒屋', '#17130f', '#f3c66a'],
  ['角打ち', '#f4f0e4', '#1a1a1a'], ['パチンコ', '#e3c400', '#c20000'], ['麻雀', '#0e5a3a', '#fff'], ['サウナ', '#12508f', '#fff']];
  T.signsV = vs.map(([t, bg, fg]) => makeSign(t, { w: 128, h: 512, bg, fg, vertical: true, border: fg, borderW: 4 }));
  T.face = makeFace();
  T.cloud = makeCloud(); T.cloudMask = makeRadialMask();
  T.leaves = makeLeaves();
  T.vending = [makeVending(0), makeVending(1)];
  T.cafeSign = makeSign('ORGANIC CAFE', { w: 1024, h: 192, bg: '#f3efe6', fg: '#2f5d3a', size: 96, weight: 300, sub: '— 無添加・グルテンフリー・意識高め —', subColor: '#5f7a63' });
  T.kakuSign = makeSign('角打ち 修羅', { w: 1024, h: 192, bg: '#efe6cf', fg: '#161210', size: 150, brush: true, border: '#7a1a12', borderW: 12 });
  T.lantern = makeSign('酒', { w: 128, h: 128, bg: '#c8161d', fg: '#fff', size: 86, brush: true });
  T.noren = makeNoren();
  T.banner = makeBanner();
  T.coatBack = makeCoatBack();
  T.kohaku = makeKohaku();
  T.parkingLines = makeParkingLines();
  T.hallSign = makeSign('KITA-Q 市役所', { w: 1024, h: 160, bg: '#e9e6df', fg: '#22313f', size: 104 });
  T.towerSign = makeSign('修羅タワー ▲ 屋上', { w: 512, h: 128, bg: '#11151c', fg: '#ffc531', size: 56 });
  T.pSign = makeSign('P', { w: 128, h: 128, bg: '#1b55b8', fg: '#fff', size: 100 });
  T.daikoCloth = makeSign('小倉祇園太鼓', { w: 512, h: 96, bg: '#4a1578', fg: '#ffd24a', size: 64, brush: true, border: '#ffd24a', borderW: 6 });
  T.dumpSign = makeSign('北九建設', { w: 512, h: 128, bg: '#123a2c', fg: '#ffd24a', size: 84, brush: true });
  return T;
}
