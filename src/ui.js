// HUD / UI（HTML オーバーレイ）
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp } from './utils.js';
import { WEAPONS } from './player.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(G) {
    this.G = G; this.v = new THREE.Vector3(); this.frame = 0;
    this.el = { hud: $('hud'), objT: $('obj-title'), objB: $('obj-body'), toasts: $('toasts'), prompt: $('prompt'), banner: $('banner'), fade: $('fade'), flash: $('flash'), hurt: $('hurt'),
      hp: $('hp-fill'), spray: $('spray-fill'), weapons: $('weapons'), wanted: $('wanted'), skill: $('skill'), stats: $('stats'), cross: $('crosshair'), alt: $('altimeter'), shura: $('shura-tint'), fps: $('fps') };
    this.map = $('minimap').getContext('2d');
    this.bubbles = []; const host = $('bubbles');
    for (let i = 0; i < 10; i++) { const el = document.createElement('div'); el.className = 'bubble'; host.appendChild(el); this.bubbles.push({ el, target: null, ttl: 0 }); }
    this.el.weapons.innerHTML = WEAPONS.map((w, i) => `<div class="wslot" data-i="${i}"><span class="wkey">${w.key}</span><span class="wname">${w.name}</span><span class="wammo"></span></div>`).join('');
    this.slots = [...this.el.weapons.children]; this.bannerT = 0; this.lastPrompt = ''; this.lastStats = ''; this.lastSkill = ''; this.lastAlt = '';
  }
  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  objective(title, body) { this.el.objT.textContent = title; this.el.objB.innerHTML = body; }
  toast(text, cls = 'info') {
    const el = document.createElement('div'); el.className = `toast ${cls}`; el.textContent = text; this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
  }
  prompt(html) { const h = html || ''; if (h === this.lastPrompt) return; this.lastPrompt = h; this.el.prompt.innerHTML = h; this.el.prompt.classList.toggle('show', !!h); }
  banner(title, sub = '', dur = 3, cls = '') { const b = this.el.banner; b.className = `show ${cls}`; b.innerHTML = `<div class="b-title">${title}</div><div class="b-sub">${sub}</div>`; this.bannerT = dur; }
  bubble(target, text, dur = 2, cls = '') {
    let b = this.bubbles.find((k) => k.ttl <= 0) || this.bubbles.reduce((a, k) => (k.ttl < a.ttl ? k : a));
    b.target = target; b.ttl = dur; b.el.textContent = text; b.el.className = `bubble show ${cls}`;
  }
  fade(v) { this.el.fade.style.opacity = v; }
  flash() { const f = this.el.flash; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  letterbox(on) { document.body.classList.toggle('cine', on); }
  altimeter(html) { const h = html || ''; if (h === this.lastAlt) return; this.lastAlt = h; this.el.alt.innerHTML = h; this.el.alt.classList.toggle('show', !!h); }

  update(dt) {
    const G = this.G, P = G.player, cam = G.camera; this.frame++;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.className = ''; }
    // 吹き出し
    const w = innerWidth, h = innerHeight;
    for (const b of this.bubbles) {
      if (b.ttl <= 0) continue; b.ttl -= dt; const t = b.target;
      if (b.ttl <= 0 || !t || t.on === false) { b.el.className = 'bubble'; b.ttl = 0; continue; }
      this.v.set(t.x, (t.y || 0) + (t.rag > 0 ? 1.0 : 2.3 * (t.sc || 1)), t.z); const d = this.v.distanceTo(cam.position); this.v.project(cam);
      if (this.v.z > 1 || d > 55) { b.el.style.opacity = 0; continue; }
      b.el.style.opacity = ''; b.el.style.transform = `translate(-50%,-100%) translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-this.v.y * 0.5 + 0.5) * h).toFixed(1)}px) scale(${clamp(9 / d, 0.55, 1.15).toFixed(2)})`;
    }
    if (this.frame % 3 !== 0) return;
    this.el.hp.style.width = `${clamp(P.hp, 0, 100)}%`; this.el.spray.style.width = `${clamp(P.spray, 0, 100)}%`;
    this.el.hurt.style.opacity = P.hurtFlash > 0 ? P.hurtFlash * 1.2 : 0;
    this.prompt(G.mission.cutscene ? null : P.interact ? P.interact.text : null);
    // 武器スロット
    const onFoot = P.mode === 'foot' || P.mode === 'takedown';
    this.slots.forEach((s, i) => {
      const id = WEAPONS[i].id; let ammo = '', avail = true;
      if (id === 'paint') avail = P.inv.paint; else if (id === 'rocket') { ammo = `×${P.inv.rockets}`; avail = P.inv.rockets > 0; } else if (id === 'bokuto') { ammo = P.inv.bokuto > 0 ? `${P.inv.bokuto}` : ''; avail = P.inv.bokuto > 0; }
      s.classList.toggle('active', i === P.weapon && onFoot); s.classList.toggle('off', !avail); s.lastChild.textContent = ammo;
    });
    const ranged = onFoot && ['spray', 'paint', 'rocket'].includes(WEAPONS[P.weapon].id); this.el.cross.classList.toggle('show', ranged && !G.mission.cutscene);
    // 通報レベル
    const lv = G.law.level; this.el.wanted.innerHTML = lv > 0 ? `<span class="wl">通報</span>${'<i class="on"></i>'.repeat(lv)}${'<i></i>'.repeat(3 - lv)}` : '';
    // スキル表示
    let sk = '';
    if (P.mode === 'foot' && P.yankeeWalk) sk = `<b>ヤンキー横断</b> 発動中${P.braked ? `　Force_Brake ×${P.braked}` : ''}${P.glare && !P.glare.yankee ? `<br>睨みつけ：運転手の恐怖 ${Math.min(100, P.glare.fear).toFixed(0)}%` : ''}`;
    else if (P.mode === 'foot' && WEAPONS[P.weapon].id === 'none') sk = '<span class="dim">歩く（C）か立ち止まるとヤンキー横断</span>';
    if (sk !== this.lastSkill) { this.lastSkill = sk; this.el.skill.innerHTML = sk; this.el.skill.classList.toggle('show', !!sk); }
    // 統計
    const S = G.stats, shura = this.shuraPct(); const inZone = G.facilities.inShura(P.pos.x, P.pos.z);
    const st = `<div class="shura"><span>修羅度</span><b>${shura}%</b></div><div class="row"><span>ヤンキー化</span><b>${G.npcs.yankeeCount}人</b></div><div class="row"><span>舎弟（追従）</span><b>${G.npcs.followerCount || 0}人</b></div><div class="row"><span>角打ち化</span><b>${S.kakuuchi} / 3</b></div><div class="row"><span>信号破壊</span><b>${S.lights}交差点</b></div><div class="row"><span>族車</span><b>${S.cars}台</b></div><div class="row"><span>カップ酒</span><b>${P.inv.cup}</b></div>${inZone ? '<div class="zone">修羅ゾーン内</div>' : ''}`;
    if (st !== this.lastStats) { this.lastStats = st; this.el.stats.innerHTML = st; }
    this.el.shura.style.opacity = inZone ? 0.55 : 0;
    if (this.frame % 6 === 0) this.drawMap();
    if (this.frame % 30 === 0 && this.el.fps) this.el.fps.textContent = `${G.fps.toFixed(0)} fps / ${G.qualityName}`;
  }
  shuraPct() {
    const G = this.G, S = G.stats;
    return Math.round(Math.min(1, S.kakuuchi / 3) * 30 + Math.min(1, S.lights / 12) * 20 + Math.min(1, G.npcs.yankeeCount / 60) * 30 + Math.min(1, S.cars / 6) * 5 + (G.mission.phase === 5 ? 15 : G.mission.phase * 2.5));
  }
  drawMap() {
    const G = this.G, c = this.map, S = 200, P = G.player, sc = S / 336, m = (v) => (v + 168) * sc;
    c.clearRect(0, 0, S, S); c.fillStyle = 'rgba(12,14,18,0.82)'; c.fillRect(0, 0, S, S);
    c.strokeStyle = '#3d434c'; c.lineWidth = 12 * sc; c.beginPath();
    for (const r of CFG.ROADS) { c.moveTo(m(r), m(-126)); c.lineTo(m(r), m(126)); c.moveTo(m(-126), m(r)); c.lineTo(m(126), m(r)); } c.stroke();
    const W = G.world; c.fillStyle = 'rgba(214,170,60,0.28)'; c.fillRect(m(W.plaza.x0), m(W.plaza.z0), 62 * sc, 40 * sc);
    c.fillStyle = '#5b6470'; c.fillRect(m(W.hall.x0), m(W.hall.z0), 48 * sc, 18 * sc); c.fillRect(m(W.tower.x0), m(W.tower.z0), 28 * sc, 19 * sc);
    c.fillStyle = '#2a4f8f'; c.fillRect(m(W.parking.x0), m(W.parking.z0), 20 * sc, 20 * sc);
    for (const n of W.nodes) if (n.signaled && !n.mgr.bIsRegulated) { c.fillStyle = 'rgba(255,70,40,0.75)'; c.fillRect(m(n.x) - 3, m(n.z) - 3, 6, 6); }
    for (const f of G.facilities.cafes) {
      if (f.bIsKakuuchi) { c.fillStyle = 'rgba(255,60,30,0.16)'; c.strokeStyle = 'rgba(255,80,40,0.7)'; c.lineWidth = 1; c.beginPath(); c.arc(m(f.cx), m(f.cz), CFG.SHURA_RADIUS * sc, 0, 6.3); c.fill(); c.stroke(); }
      c.fillStyle = f.bIsKakuuchi ? '#ff5a36' : '#45e08c'; c.beginPath(); c.arc(m(f.cx), m(f.cz), 4.5, 0, 6.3); c.fill();
    }
    for (const it of G.facilities.items) { c.fillStyle = '#9fe8ff'; c.fillRect(m(it.x) - 1, m(it.z) - 1, 2.5, 2.5); }
    for (const n of G.npcs.list) { if (!n.on || n.kind === 'quest') continue; c.fillStyle = n.kind === 'enforcer' && n.state !== 'Yankee' ? '#4aa3ff' : n.state === 'Yankee' ? '#ffc531' : 'rgba(220,220,220,0.5)'; const s = n.kind === 'enforcer' ? 3.4 : 2; c.fillRect(m(n.x) - s / 2, m(n.z) - s / 2, s, s); }
    for (const v of G.vehicles.list) { c.fillStyle = v.type === 'dump' ? '#35d0a0' : '#ff8a3a'; c.fillRect(m(v.x) - 3, m(v.z) - 3, 6, 6); }
    const ph = G.mission.phase, mk = ph <= 1 ? W.tower.elevator : ph === 3 ? W.plaza.mic : null;
    if (mk) { c.fillStyle = '#ffd24a'; c.save(); c.translate(m(mk.x), m(mk.z)); c.rotate(Math.PI / 4); const s = 4 + Math.sin(performance.now() / 200) * 1.2; c.fillRect(-s, -s, s * 2, s * 2); c.restore(); }
    if (ph === 1) { c.strokeStyle = '#ffd24a'; c.lineWidth = 1.5; c.strokeRect(m(W.trigger.minX), m(W.trigger.minZ), 44 * sc, 30 * sc); }
    c.save(); c.translate(m(P.pos.x), m(P.pos.z)); c.rotate(-P.yaw); c.fillStyle = '#fff'; c.strokeStyle = '#7a2bbf'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 7); c.lineTo(4.5, -5); c.lineTo(0, -2.5); c.lineTo(-4.5, -5); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
}
