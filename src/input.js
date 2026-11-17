// 入力統合レイヤー：キーボード＋マウス / タッチ（仮想スティック・ボタン）/ ゲームパッド
//
// ゲーム側のインターフェースは従来どおり down('KeyW') / hit('KeyE') / dx,dy。
// ・パッドとタッチのボタンは「仮想キーコード」として同じ名前空間に注入する
// ・移動・ステア・スロットルはアナログ値 mvx / mvz に合成する（キーは ±1 として参加）
// ・視点はすべて「マウス px 相当」のデルタ dx / dy に合成する
import { clamp } from './utils.js';

export function isTouchDevice() {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    return (navigator.maxTouchPoints || 0) > 0 && (coarse || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  } catch (e) { return false; }
}

const DEAD = 0.2;          // スティックのデッドゾーン
const PAD_LOOK = 1250;     // 右スティック全倒しの視点速度（マウス px/秒 相当）
const TOUCH_LOOK = 1.25;   // タッチドラッグ → 視点デルタ倍率
const STICK_R = 62;        // 仮想スティックの半径(px)
const STICK_DEAD = 0.14;

// ゲームパッド（standard mapping）→ 仮想キーコード。3=Y と 6/7=トリガーは文脈依存で別処理
const PAD_BTN = { 0: 'Space', 1: 'KeyF', 2: 'KeyE', 8: 'VHelp', 9: 'VPause', 10: 'KeyC', 12: 'KeyQ', 13: 'KeyG', 16: 'VPause' };
const PAD_WHEEL = { 4: -1, 5: 1, 14: -1, 15: 1 }; // LB/RB・十字左右 → 武器送り

// デッドゾーン処理。expo>0 で指数カーブ（視点用：中央付近を細かく、端で速く）
const curve = (v, expo = 0) => {
  const a = Math.abs(v); if (a < DEAD) return 0;
  const t = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * (expo ? t * t * expo + t * (1 - expo) : t);
};

export class Input {
  constructor(G, canvas) {
    this.G = G; this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();   // 物理キー：押下中 / 押した瞬間
    this.vd = new Set(); this.vp = new Set();          // 仮想（パッド・タッチ）：押下中 / 押した瞬間
    this.tgl = new Set();                              // タッチのトグルボタン（ダッシュ）
    this.dx = 0; this.dy = 0;                          // 視点デルタ
    this.mvx = 0; this.mvz = 0;                        // 移動（-1..1）
    this.mouse = false; this.click = false;            // 攻撃・使用（押下中 / 押した瞬間）
    this.locked = false; this.noLock = false;
    this.wcycle = 0;                                   // 武器送り（-1/+1、1フレームのみ）
    this.anyPress = false;                             // タイトルでの「何か押された」
    this.diag = false;                                 // F2：コントローラ検出状況の表示
    this.ctx = 'foot';                                 // 'foot' | 'vehicle' | 'glide' | 'cut' …
    this.scheme = 'kb';                                // 'kb' | 'pad' | 'touch'（UI 表記の切替用）
    this.sens = 1;
    this.touch = isTouchDevice();
    this.pad = false;
    this._mdx = 0; this._mdy = 0; this._held = false; this._clk = false; this._drag = false;
    this._px = 0; this._pz = 0; this._pt = 0; this._rt = false; this._pb = []; this.padIndex = -1;
    this._ptr = new Map(); this._stick = null; this._tv = { x: 0, z: 0 };
    this.elTouch = document.getElementById('touch');
    this.elStick = document.getElementById('tstick');
    this.elKnob = document.getElementById('tknob');
    if (this.touch) { this.noLock = true; document.body.classList.add('touch'); }
  }

  // ---------- 問い合わせ ----------
  raw(c) { return this.keys.has(c) || this.vd.has(c) || this.tgl.has(c); }
  down(c) { return this.G.started && this.raw(c); }
  hit(c) { return this.G.started && (this.pressed.has(c) || this.vp.has(c)); }
  hitKey(c) { return this.G.started && this.pressed.has(c); } // 物理キーのみ（H/P の衝突回避）

  // ---------- 状態 ----------
  setScheme(s) {
    if (this.scheme === s) return;
    this.scheme = s;
    if (s === 'touch') { this.touch = true; this.noLock = true; try { document.exitPointerLock?.(); } catch (e) {} }
    document.body.classList.toggle('touch', this.touch);
    document.body.classList.toggle('pad', s === 'pad');
    this.showTouch(this.G.started);
    this.G.ui?.schemeChanged?.(s);
  }
  showTouch(v) { this.elTouch?.classList.toggle('hidden', !(v && this.touch)); }
  setCtx(c) {
    if (c === this.ctx) return;
    this.ctx = c;
    document.body.classList.toggle('veh', c === 'vehicle');
    const el = this.elTouch; if (!el) return;
    el.classList.remove('foot', 'vehicle', 'glide');
    el.classList.add(c === 'vehicle' ? 'vehicle' : c === 'glide' ? 'glide' : 'foot');
    el.classList.toggle('cine', c === 'cut' || c === 'down');
  }
  lock() {
    if (this.locked || this.noLock) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { this.noLock = true; }); } catch (e) { this.noLock = true; }
  }
  clearAll() {
    this.keys.clear(); this.vd.clear(); this.tgl.clear(); this._ptr.clear();
    this._held = false; this._drag = false; this._stick = null; this._tv.x = this._tv.z = 0;
    for (const el of document.querySelectorAll('.tbtn.on')) el.classList.remove('on');
    this.stickVis(false);
  }

  // ---------- 毎フレーム ----------
  beginFrame(dt) {
    this.pollPad(dt);
    this.dx = this._mdx * this.sens; this.dy = this._mdy * this.sens; this._mdx = this._mdy = 0;
    let mx = (this.raw('KeyD') ? 1 : 0) - (this.raw('KeyA') ? 1 : 0) + this._tv.x + this._px;
    let mz = (this.raw('KeyW') ? 1 : 0) - (this.raw('KeyS') ? 1 : 0) + this._tv.z + this._pz;
    if (this.ctx === 'vehicle' || this.ctx === 'glide') { // アナログトリガー。舵とスロットルは独立した軸として扱う
      mz += this._pt; mx = clamp(mx, -1, 1); mz = clamp(mz, -1, 1);
    } else { const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; } } // 徒歩は斜め入力で速くならないよう円でクランプ
    this.mvx = mx; this.mvz = mz;
    const on = this.G.started;
    this.mouse = on && (this._held || this.raw('KeyJ'));
    this.click = on && (this._clk || this.pressed.has('KeyJ') || this.vp.has('KeyJ'));
  }
  endFrame() { this.pressed.clear(); this.vp.clear(); this._clk = false; this.wcycle = 0; this.anyPress = false; }

  // ---------- ゲームパッド ----------
  padCode(i) { return i === 3 ? (this.ctx === 'vehicle' ? 'KeyH' : 'KeyG') : PAD_BTN[i]; }
  pollPad(dt) {
    this._px = this._pz = this._pt = 0;
    const list = navigator.getGamepads ? navigator.getGamepads() : null; if (!list) return;
    let gp = null;
    for (const p of list) { if (!p || !p.connected) continue; if (p.index === this.padIndex) { gp = p; break; } if (!gp) gp = p; }
    if (!gp) { this._pb.length = 0; this.pad = false; return; }
    this.pad = true;
    const bt = gp.buttons, ax = gp.axes, prev = this._pb;
    const val = (i) => { const b = bt[i]; return !b ? 0 : typeof b.value === 'number' && b.value > 0 ? b.value : b.pressed ? 1 : 0; };
    // 左スティック（移動・操舵）は線形、右スティック（視点）は指数カーブ
    const lx = curve(ax[0] || 0), ly = curve(ax[1] || 0), rx = curve(ax[2] || 0, 0.6), ry = curve(ax[3] || 0, 0.6);
    let act = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.001;
    for (let i = 0; i < bt.length; i++) {
      const p = val(i) > 0.45, was = !!prev[i], edge = p && !was; prev[i] = p;
      if (p) act = true;
      if (edge && (i === 0 || i === 9)) this.anyPress = true;
      const code = this.padCode(i);
      if (code) { if (p) this.vd.add(code); else this.vd.delete(code); if (edge) this.vp.add(code); }
      if (edge && PAD_WHEEL[i] !== undefined) this.wcycle = PAD_WHEEL[i];
    }
    const lt = val(6), rt = val(7);
    if (this.ctx === 'vehicle' || this.ctx === 'glide') { this._pt = clamp(rt - lt, -1, 1); this._rt = false; }
    else { // 徒歩：RT 攻撃・使用、LT ダッシュ
      if (lt > 0.3) this.vd.add('ShiftLeft'); else if (!this.tgl.has('ShiftLeft')) this.vd.delete('ShiftLeft');
      const r = rt > 0.35;
      if (r && !this._rt) this._clk = true;
      if (r) this._held = true; else if (this._rt) this._held = false;
      this._rt = r;
    }
    this._px = lx; this._pz = -ly;
    this._mdx += rx * PAD_LOOK * dt; this._mdy += ry * PAD_LOOK * 0.75 * dt;
    if (act) { this.padIndex = gp.index; this.setScheme('pad'); }
  }

  // ブラウザがコントローラをどう見ているかをそのまま表示する（F2）
  diagText() {
    let list = null;
    try { list = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return 'getGamepads() が使えない環境です'; }
    if (!list) return 'このブラウザは Gamepad API に対応していません';
    const pads = [...list].filter((p) => p && p.connected);
    if (!pads.length) return '<b>コントローラ未検出</b><br>ブラウザがパッドを認識していません。<br>ページをクリックしてから、パッドのボタンを一度押してください。<br>（Bluetooth なら接続を、PS/Switch パッドは対応モードかを確認）';
    return pads.map((g) => {
      const ax = [...g.axes].map((v) => v.toFixed(2)).join(' ');
      const on = [...g.buttons].map((b, i) => (b && (b.pressed || b.value > 0.45) ? i : -1)).filter((i) => i >= 0);
      return `<b>${g.id}</b><br>mapping: <b>${g.mapping || '(なし)'}</b>　index: ${g.index}　軸数: ${g.axes.length}　ボタン数: ${g.buttons.length}`
        + `<br>軸: ${ax}<br>押下中のボタン番号: ${on.length ? on.join(', ') : '(なし)'}`
        + `<br>入力方式: ${this.scheme}　移動: ${this.mvx.toFixed(2)} / ${this.mvz.toFixed(2)}`;
    }).join('<hr>');
  }

  // ---------- 仮想スティック ----------
  stickAt(x, y) { const el = this.elStick; if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; } }
  stickVis(on) { const el = this.elStick; if (!el) return; el.classList.toggle('on', on); if (!on) { el.style.left = ''; el.style.top = ''; this.knob(0, 0); } }
  knob(dx, dy) { if (this.elKnob) this.elKnob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`; }

  // ---------- タッチ（画面領域） ----------
  tDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    this.setScheme('touch');
    if (!this.G.started || this.G.paused) return; // タイトル・ヘルプ中は通常のタップとして扱う
    e.preventDefault();
    if (this._stick === null && e.clientX < innerWidth * 0.46 && e.clientY > innerHeight * 0.3) {
      this._stick = e.pointerId; this._ptr.set(e.pointerId, { kind: 's', ox: e.clientX, oy: e.clientY });
      this.stickAt(e.clientX, e.clientY); this.stickVis(true);
    } else this._ptr.set(e.pointerId, { kind: 'l', x: e.clientX, y: e.clientY });
  }
  tMove(e) {
    const p = this._ptr.get(e.pointerId); if (!p) return;
    e.preventDefault();
    if (p.kind === 's') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy; const d = Math.hypot(dx, dy);
      if (d > STICK_R) { const k = 1 - STICK_R / d; p.ox += dx * k; p.oy += dy * k; dx *= STICK_R / d; dy *= STICK_R / d; this.stickAt(p.ox, p.oy); }
      this.knob(dx, dy);
      const f = (v) => { const a = Math.abs(v) / STICK_R; return a < STICK_DEAD ? 0 : (Math.sign(v) * (a - STICK_DEAD)) / (1 - STICK_DEAD); };
      this._tv.x = f(dx); this._tv.z = -f(dy);
    } else { this._mdx += (e.clientX - p.x) * TOUCH_LOOK; this._mdy += (e.clientY - p.y) * TOUCH_LOOK; p.x = e.clientX; p.y = e.clientY; }
  }
  tUp(e) {
    const p = this._ptr.get(e.pointerId); if (!p) return;
    this._ptr.delete(e.pointerId);
    if (p.kind === 's') { this._stick = null; this._tv.x = this._tv.z = 0; this.stickVis(false); }
  }

  // ---------- タッチボタン（data-k / data-toggle） ----------
  bindButtons() {
    for (const el of document.querySelectorAll('[data-k],[data-toggle]')) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setScheme('touch');
        const tg = el.dataset.toggle;
        if (tg) { if (this.tgl.has(tg)) { this.tgl.delete(tg); el.classList.remove('on'); } else { this.tgl.add(tg); el.classList.add('on'); } return; }
        const k = el.dataset.k; el.classList.add('on');
        if (k === 'ATTACK') { this._held = true; this._clk = true; } else { this.vd.add(k); this.vp.add(k); }
      });
      const up = (e) => {
        e.stopPropagation();
        if (el.dataset.toggle) return;
        el.classList.remove('on');
        const k = el.dataset.k;
        if (k === 'ATTACK') this._held = false; else this.vd.delete(k);
      };
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, up);
    }
  }

  // ---------- イベント登録 ----------
  attach() {
    const canvas = this.canvas, G = this.G;
    addEventListener('keydown', (e) => {
      if (!G.started) return;
      this.setScheme('kb');
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.clearAll());
    canvas.addEventListener('mousedown', (e) => {
      if (!G.started || G.paused || this.scheme === 'touch') return;
      this.setScheme('kb');
      if (!this.locked && !this.noLock) { this.lock(); if (e.button === 0) this._held = true; return; }
      if (e.button === 0) { this._held = true; this._clk = true; } else this._drag = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this._held = false; else this._drag = false; });
    addEventListener('mousemove', (e) => {
      if (this.scheme === 'touch') return;
      if (this.locked || (this.noLock && (this._held || this._drag))) { this._mdx += e.movementX; this._mdy += e.movementY; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { this.noLock = true; });
    addEventListener('pointerdown', (e) => this.tDown(e), { passive: false });
    addEventListener('pointermove', (e) => this.tMove(e), { passive: false });
    addEventListener('pointerup', (e) => this.tUp(e));
    addEventListener('pointercancel', (e) => this.tUp(e));
    addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index; this.pad = true; this.setScheme('pad');
      G.ui?.toast('コントローラを検出：左スティック移動／右スティック視点／RT 攻撃（SELECT で操作説明）', 'info');
    });
    addEventListener('gamepaddisconnected', () => { this._pb.length = 0; this.pad = false; });
    const sl = document.getElementById('sens');
    if (sl) {
      try { const s = localStorage.getItem('kqo.sens'); if (s) sl.value = s; } catch (e) {}
      this.sens = parseFloat(sl.value) || 1;
      sl.addEventListener('input', () => { this.sens = parseFloat(sl.value) || 1; try { localStorage.setItem('kqo.sens', sl.value); } catch (e) {} });
    }
    this.bindButtons();
  }
}
