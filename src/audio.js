// サウンド：WebAudio による完全シンセ（環境音楽「クラシック/演歌」のクロスフェード、SE、音声合成ボイス）
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  constructor() { this.ctx = null; this.voice = true; this.lastSpeak = 0; this.cool = {}; }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.gClassical = ctx.createGain(); this.gClassical.gain.value = 0; this.gClassical.connect(this.master);
    this.gEnka = ctx.createGain(); this.gEnka.gain.value = 0; this.gEnka.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // スプレー（ループ）
    this.sprayG = ctx.createGain(); this.sprayG.gain.value = 0;
    const sn = ctx.createBufferSource(); sn.buffer = nb; sn.loop = true; const sf = ctx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 3800;
    sn.connect(sf); sf.connect(this.sprayG); this.sprayG.connect(this.sfx); sn.start();
    // エンジン（ループ）
    this.engG = ctx.createGain(); this.engG.gain.value = 0; this.engO = ctx.createOscillator(); this.engO.type = 'sawtooth'; this.engO.frequency.value = 50;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 420; this.engO.connect(ef); ef.connect(this.engG); this.engG.connect(this.sfx); this.engO.start();
    // 街の環境ノイズ
    const an = ctx.createBufferSource(); an.buffer = nb; an.loop = true; const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 320;
    const ag = ctx.createGain(); ag.gain.value = 0.035; an.connect(af); af.connect(ag); ag.connect(this.master); an.start();
    this.dC = 60 / 92 / 2; this.dE = 60 / 72 / 2; this.tC = ctx.currentTime + 0.1; this.tE = ctx.currentTime + 0.1; this.stepC = 0; this.stepE = 0;
  }
  // ---- 基本発音 ----
  tone(type, f, t, dur, vol, dest, o = {}) {
    if (dest && !(dest instanceof AudioNode)) { o = dest; dest = null; } // tone(..., vol, opts) の省略形
    const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(o.f0 || f, t);
    if (o.f0) osc.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.08));
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const a = o.attack ?? 0.006, r = o.release ?? 0.08;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.decay) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.02), t + dur); else g.gain.setValueAtTime(vol, t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + (o.decay ? 0.02 : 0));
    let node = osc;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; node.connect(fl); node = fl; }
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vibRate || 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * o.vib, t + dur * 0.6); l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.1); }
    node.connect(g); g.connect(dest || this.sfx); osc.start(t); osc.stop(t + dur + 0.1);
  }
  noise(t, dur, vol, o = {}, dest) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur); f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // ---- 音楽 ----
  schedClassical(t, step) { // カノン進行のアルペジオ（お上品）
    const chords = [[50, 54, 57], [45, 49, 52], [47, 50, 54], [42, 45, 49], [43, 47, 50], [38, 42, 45], [43, 47, 50], [45, 49, 52]];
    const mel = [78, 76, 74, 73, 71, 69, 71, 73]; const bar = Math.floor(step / 8) % 8, k = step % 8, ch = chords[bar], d = this.gClassical;
    const arp = [ch[0], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[2]];
    this.tone('triangle', mtof(arp[k] + 12), t, 0.5, 0.2, d, { decay: true, lp: 3200 });
    if (k === 0) {
      for (const n of ch) this.tone('sine', mtof(n + 12), t, this.dC * 8, 0.07, d, { attack: 0.5, release: 0.6 });
      this.tone('sawtooth', mtof(mel[bar]), t, this.dC * 8 * 0.96, 0.075, d, { attack: 0.25, release: 0.4, lp: 1700, vib: 0.006 });
      this.tone('sine', mtof(ch[0] - 12), t, this.dC * 8, 0.16, d, { attack: 0.05, release: 0.4 });
    }
    if (k === 4) this.tone('sawtooth', mtof(mel[bar] - (bar % 2 ? 3 : 4)), t, this.dC * 4 * 0.9, 0.04, d, { attack: 0.2, release: 0.3, lp: 1500, vib: 0.005 });
  }
  schedEnka(t, step) { // ヨナ抜き短音階の演歌（修羅）
    const s = step % 64, bar = Math.floor(s / 8), k = s % 8, d = this.gEnka, e = this.dE;
    const bass = [45, 38, 40, 45, 41, 38, 40, 45][bar];
    const chord = [[57, 60, 64], [57, 62, 65], [56, 59, 62], [57, 60, 64], [57, 60, 65], [57, 62, 65], [56, 59, 62], [57, 60, 64]][bar];
    const mel = [[76, 0, 3], [77, 3, 1], [76, 4, 2], [72, 6, 2], [69, 8, 4], [71, 12, 1], [72, 13, 3], [71, 16, 3], [72, 19, 1], [71, 20, 2], [64, 22, 2], [69, 24, 6],
    [81, 32, 3], [77, 35, 1], [76, 36, 2], [72, 38, 2], [77, 40, 2], [76, 42, 2], [72, 44, 2], [69, 46, 2], [71, 48, 2], [72, 50, 1], [71, 51, 1], [76, 52, 4], [69, 56, 6]];
    if (k === 0 || k === 4) this.tone('triangle', mtof(bass), t, e * 1.6, 0.34, d, { decay: true });
    if (k === 2 || k === 6) for (const n of chord) this.tone('sawtooth', mtof(n), t, 0.16, 0.05, d, { lp: 1800, release: 0.1 });
    if (k % 2 === 1) this.noise(t, 0.04, 0.03, { type: 'highpass', f: 7000 }, d);
    if (k === 0) for (const n of chord) this.tone('sawtooth', mtof(n - 12), t, e * 8, 0.022, d, { attack: 0.3, release: 0.5, lp: 900 });
    for (const [n, st, len] of mel) if (st === s) {
      const f = mtof(n);
      this.tone('sawtooth', f, t, e * len * 0.95, 0.15, d, { attack: 0.04, release: 0.16, lp: 2300, f0: f * 0.93, glide: 0.11, vib: len >= 2 ? 0.016 : 0.004, vibRate: 5.8 });
      this.tone('sine', f * 2, t, e * len * 0.9, 0.03, d, { attack: 0.05, release: 0.15, f0: f * 1.86, glide: 0.11 });
    }
  }
  update(dt, amb) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime;
    this.gClassical.gain.setTargetAtTime(amb.classical * 0.5, t, 0.06); this.gEnka.gain.setTargetAtTime(amb.enka * 0.62, t, 0.06);
    if (this.tC < t - 0.5) this.tC = t + 0.05; if (this.tE < t - 0.5) this.tE = t + 0.05;
    while (this.tC < t + 0.3) { if (amb.classical > 0.003) this.schedClassical(this.tC, this.stepC); this.stepC++; this.tC += this.dC; }
    while (this.tE < t + 0.3) { if (amb.enka > 0.003) this.schedEnka(this.tE, this.stepE); this.stepE++; this.tE += this.dE; }
  }
  // ---- SE ----
  sprayOn(on) { if (this.ctx) this.sprayG.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.03); }
  engine(on, speed = 0, heavy = true) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(on ? 0.1 + Math.min(0.1, speed * 0.006) : 0, t, 0.08); this.engO.frequency.setTargetAtTime((heavy ? 38 : 60) + speed * (heavy ? 5.5 : 4), t, 0.1);
  }
  play(name, vol = 1) {
    const ctx = this.ctx; if (!ctx || vol <= 0.01) return; const t = ctx.currentTime;
    if (this.cool[name] && t - this.cool[name] < 0.05) return; this.cool[name] = t;
    const v = Math.min(1, vol);
    switch (name) {
      case 'swing': this.noise(t, 0.22, 0.3 * v, { type: 'bandpass', f: 500, f1: 2400, q: 1.5, attack: 0.05 }); break;
      case 'hit': this.noise(t, 0.12, 0.6 * v, { f: 1800, f1: 300 }); this.tone('sine', 70, t, 0.16, 0.6 * v, { f0: 190, glide: 0.1, decay: true }); break;
      case 'crunch': for (let i = 0; i < 5; i++) this.noise(t + i * 0.07, 0.05, 0.4 * v, { type: 'bandpass', f: 2600 + Math.random() * 2000, q: 2 }); break;
      case 'taiko': this.tone('sine', 52, t, 0.7, 1.0 * v, { f0: 150, glide: 0.09, decay: true }); this.noise(t, 0.09, 0.5 * v, { f: 900, f1: 200 }); this.tone('triangle', 104, t, 0.3, 0.3 * v, { f0: 260, glide: 0.06, decay: true }); break;
      case 'crash': this.noise(t, 0.6, 0.8 * v, { f: 3000, f1: 150 }); this.tone('sine', 45, t, 0.4, 0.8 * v, { f0: 120, glide: 0.15, decay: true }); break;
      case 'glass': for (let i = 0; i < 6; i++) this.tone('sine', 2200 + Math.random() * 4000, t + Math.random() * 0.15, 0.25, 0.08 * v, { decay: true }); this.noise(t, 0.3, 0.3 * v, { type: 'highpass', f: 4500 }); break;
      case 'screech': this.noise(t, 0.5, 0.22 * v, { type: 'bandpass', f: 1500, f1: 900, q: 9, attack: 0.03 }); break;
      case 'horn': this.tone('square', 415, t, 0.35, 0.09 * v, { lp: 2000 }); this.tone('square', 523, t, 0.35, 0.09 * v, { lp: 2000 }); break;
      case 'whistle': this.tone('sine', 2350, t, 0.34, 0.18 * v, { vib: 0.03, vibRate: 28 }); break;
      case 'launch': this.tone('sine', 2400, t, 0.5, 0.07 * v, { f0: 700, glide: 0.5 }); this.noise(t, 0.35, 0.12 * v, { type: 'highpass', f: 3000 }); break;
      case 'boom': this.noise(t, 0.7, 0.55 * v, { f: 1400, f1: 120 }); this.tone('sine', 55, t, 0.5, 0.5 * v, { f0: 130, glide: 0.2, decay: true }); for (let i = 0; i < 8; i++) this.noise(t + 0.15 + Math.random() * 0.5, 0.03, 0.12 * v, { type: 'highpass', f: 5000 }); break;
      case 'yankee': [0, 4, 7, 12].forEach((n, i) => this.tone('sawtooth', mtof(57 + n), t + i * 0.07, 0.22, 0.12 * v, { lp: 2400, decay: true })); this.noise(t, 0.25, 0.15 * v, { type: 'bandpass', f: 900, q: 1 }); break;
      case 'confuse': this.tone('sine', 660, t, 0.3, 0.12 * v, { f1: 330 }); break;
      case 'paint': this.noise(t, 0.1, 0.35 * v, { type: 'bandpass', f: 700, q: 1.2 }); this.tone('sine', 300, t, 0.08, 0.2 * v, { f1: 120, decay: true }); break;
      case 'splat': this.noise(t, 0.14, 0.3 * v, { f: 2200, f1: 400 }); break;
      case 'pickup': this.tone('triangle', 880, t, 0.09, 0.2 * v); this.tone('triangle', 1320, t + 0.08, 0.16, 0.2 * v, { decay: true }); break;
      case 'ui': this.tone('triangle', 660, t, 0.08, 0.15 * v, { decay: true }); break;
      case 'override': [45, 52, 57, 64].forEach((n, i) => this.tone('sawtooth', mtof(n), t + i * 0.12, 0.9, 0.13 * v, { lp: 1500, attack: 0.02, release: 0.5, vib: 0.01 })); this.noise(t, 0.9, 0.3 * v, { f: 300, f1: 3000, attack: 0.5 }); break;
      case 'mission': [0, 4, 7, 12, 16].forEach((n, i) => this.tone('triangle', mtof(62 + n), t + i * 0.1, 0.5, 0.18 * v, { decay: true })); break;
      case 'hurt': this.tone('square', 180, t, 0.18, 0.2 * v, { f1: 90, lp: 900 }); break;
      case 'jump': this.noise(t, 0.08, 0.1 * v, { f: 600 }); break;
      case 'glider': this.noise(t, 0.5, 0.25 * v, { type: 'bandpass', f: 400, f1: 1200, q: 0.8, attack: 0.1 }); break;
    }
  }
  speak(text) {
    if (!this.voice || !window.speechSynthesis) return; const now = performance.now(); if (now - this.lastSpeak < 1400) return;
    const voices = speechSynthesis.getVoices(); const ja = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')); if (!ja) return;
    this.lastSpeak = now; const u = new SpeechSynthesisUtterance(text.replace(/[！？!?…]/g, '')); u.voice = ja; u.lang = 'ja-JP'; u.rate = 1.25; u.pitch = 0.4 + Math.random() * 0.6; u.volume = 0.85;
    try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* 無視 */ }
  }
}
