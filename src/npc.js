// 1.1 NPCのヤンキー化処理（Infection System）+ AI（BT_CleanCitizen / BT_YankeeAlly）+ 通報
import * as THREE from 'three';
import { CFG, YANKEE_LINES, CLEAN_LINES, CONFUSED_LINES, ENFORCER_LINES, PAINT_COLORS } from './config.js';
import { makeRng, clamp, turnToward, pick, lerp } from './utils.js';
import { makeMats, makePose, applyAnim, computeMatrices, makeGeoms } from './humanoid.js';

const MAX = 190, BAR_MAX = 48;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SKIN = [0xf1c9a5, 0xe8b991, 0xd9a57e, 0xf5d3b3, 0xe2ad88];
const SUITS = [0x1c2742, 0x26262b, 0x363b46, 0x45454d, 0x222831, 0x574f45];
const CASUAL = [0xe6e2d8, 0xc7d4de, 0xd6c5ae, 0xb5c7ae, 0xe4cece, 0xf0efe9];
const PANTS = [0x2a2d36, 0x3c3f47, 0x55504a, 0x1d2233, 0x6b6558];
const SWEATS = [0x8a8a8f, 0x1a1a1e, 0x5a2d82, 0xd45a9a, 0xe6e6e6, 0x7a1a1a, 0x1f3d7a, 0xc9a227];
const TIES = [0x8c1c1c, 0x1c3f8c, 0x2d6b3a, 0x777777, 0xb58a1e];
const HAIRS = [0x15110e, 0x1e1712, 0x2b2118, 0x3a2a1c];
const YHAIRS = [0x15110e, 0x15110e, 0xd9b648, 0xb5651d, 0xe8e2d0];
const WALKLIKE = { walk: 1, run: 1, panic: 1, swagger: 1 };

export class NPCSystem {
  constructor(G) {
    this.G = G; this.rng = makeRng(4242); this.list = []; this.mats = makeMats(); this.pose = makePose();
    this.yankeeCount = 0; this.playerIdle = 0; this.formYaw = 0; this.respawnT = 0;
    this._c = new THREE.Color(); this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._r = new THREE.Vector3();
    const geo = makeGeoms(false), scene = G.scene;
    this.cloth = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    this.cloth.onBeforeCompile = (sh) => { // インスタンス毎のメタリック（金・銀ペイント用）
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float instMetal;\nvarying float vInstMetal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstMetal = instMetal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstMetal;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, vInstMetal);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, vInstMetal);');
    };
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 }), face = new THREE.MeshStandardMaterial({ roughness: 0.55, map: G.T.face });
    const hairM = new THREE.MeshStandardMaterial({ roughness: 0.42 }), dark = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }), tieM = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const white = new THREE.Color(1, 1, 1);
    const im = (g, mat, n, metal) => {
      const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, white); }
      if (metal) g.setAttribute('instMetal', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      scene.add(m); return m;
    };
    this.m = {
      hips: im(geo.hips, this.cloth, MAX, true), torso: im(geo.torso, this.cloth, MAX, true), head: im(geo.head, face, MAX),
      hair: im(geo.hair, hairM, MAX), punch: im(geo.punch, hairM, MAX), regent: im(geo.regent, hairM, MAX), shades: im(geo.shades, dark, MAX), tie: im(geo.tie, tieM, MAX),
      uarm: im(geo.uarm, this.cloth, MAX * 2, true), farm: im(geo.farm, this.cloth, MAX * 2, true), hand: im(geo.hand, skin, MAX * 2),
      thigh: im(geo.thigh, this.cloth, MAX * 2, true), shin: im(geo.shin, this.cloth, MAX * 2, true), foot: im(geo.foot, dark, MAX * 2),
    };
    this.all = Object.values(this.m);
    // Infection_Meter 表示用ビルボード
    const bm = () => { const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ fog: false }), BAR_MAX); m.frustumCulled = false; m.renderOrder = 20; for (let i = 0; i < BAR_MAX; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, white); } scene.add(m); return m; };
    this.barBg = bm(); this.barFill = bm(); this.barFill.renderOrder = 21; G.noAO.push(this.barBg, this.barFill);
    for (let i = 0; i < MAX; i++) this.list.push({ id: i, on: false, vis: false });
  }

  // ---------- 生成 ----------
  cleanLook(kind) {
    const r = this.rng;
    if (kind === 'enforcer') return { skin: pick(r, SKIN), top: 0x1b3a6b, pants: 0x18243d, shoe: 0x111111, hair: pick(r, HAIRS), hairStyle: 0, shades: false, tie: 0xf2c200, metal: 0 };
    const suit = kind === 'quest' ? true : r() < 0.6, top = suit ? pick(r, SUITS) : pick(r, CASUAL);
    return { skin: pick(r, SKIN), top, pants: suit ? top : pick(r, PANTS), shoe: 0x15120f, hair: pick(r, HAIRS), hairStyle: 0, shades: false, tie: suit ? pick(r, TIES) : null, metal: 0 };
  }
  yankeeLook(n) {
    const r = this.rng, c = pick(r, SWEATS), st = r();
    return { skin: n.look.skin, top: c, pants: r() < 0.7 ? c : pick(r, SWEATS), shoe: 0xd8d2c4, hair: pick(r, YHAIRS), hairStyle: st < 0.5 ? 1 : st < 0.9 ? 2 : 3, shades: r() < 0.6, tie: null, metal: c === 0xc9a227 ? 0.85 : 0 };
  }
  spawn(kind, x, z, o = {}) {
    const n = this.list.find((k) => !k.on); if (!n) return null; const r = this.rng;
    Object.assign(n, {
      on: true, kind, x, z, y: this.G.world.baseHeight(x, z), yaw: r() * 6.28, sc: 0.94 + r() * 0.13, t: r() * 10, phase: r() * 6, anim: 'idle', spd: 0,
      state: 'Clean', inf: 0, faction: 'Enemy', bt: 'BT_CleanCitizen', resist: kind === 'enforcer' ? 1.8 : 1,
      rag: 0, choke: 0, dance: 0, stag: 0, kx: 0, kz: 0, vy: 0, held: false, swapT: 0, flee: 0, fx: 0, fz: 0, report: 0, willReport: false, wait: 0,
      walk: 1.15 + r() * 0.45, wpFrom: null, wpTo: null, tx: x, tz: z, offX: (r() - 0.5) * 1.6, offZ: (r() - 0.5) * 1.6, wanderT: 0, cheer: 0,
      paint: null, counted: false, atk: 0.5, settled: false, bubbleCool: 0, look: null, src: null, hitCool: 0,
    });
    n.look = this.cleanLook(kind);
    if (o.wp) { n.wpTo = o.wp; n.tx = o.wp.x + n.offX; n.tz = o.wp.z + n.offZ; } else if (kind !== 'quest') this.rejoin(n);
    this.applyLook(n); return n;
  }
  despawn(n) { if (!n.on) return; if (n.state === 'Yankee') this.yankeeCount--; n.on = false; }
  populate() {
    const W = this.G.world;
    for (let i = 0; i < CFG.AMBIENT_NPCS; i++) { const p = W.randomSidewalkPoint(this.rng, this.G.player.pos, 6, 400); this.spawn('citizen', p.x, p.z); }
  }
  applyLook(n) {
    const L = n.look, i = n.id, m = this.m, c = this._c;
    const top = n.paint ? n.paint.hex : L.top, pants = n.paint ? n.paint.hex : L.pants, metal = n.paint ? n.paint.metal : L.metal || 0, hair = n.paint ? n.paint.hex : L.hair;
    m.torso.setColorAt(i, c.setHex(top)); m.hips.setColorAt(i, c.setHex(pants)); m.head.setColorAt(i, c.setHex(L.skin));
    c.setHex(hair); m.hair.setColorAt(i, c); m.punch.setColorAt(i, c); m.regent.setColorAt(i, c);
    m.shades.setColorAt(i, c.setHex(0x0b0b0c)); m.tie.setColorAt(i, c.setHex(L.tie ?? 0));
    m.torso.geometry.attributes.instMetal.setX(i, metal); m.hips.geometry.attributes.instMetal.setX(i, metal);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      c.setHex(top); m.uarm.setColorAt(j, c); m.farm.setColorAt(j, c); c.setHex(pants); m.thigh.setColorAt(j, c); m.shin.setColorAt(j, c);
      m.hand.setColorAt(j, c.setHex(L.skin)); m.foot.setColorAt(j, c.setHex(L.shoe));
      for (const key of ['uarm', 'farm', 'thigh', 'shin']) m[key].geometry.attributes.instMetal.setX(j, metal);
    }
    this.lookDirty = true;
  }
  rejoin(n) { // 最寄りの歩道ウェイポイントへ復帰
    let best = null, bd = 1e9;
    for (const wp of this.G.world.wps) { const d = (wp.x - n.x) ** 2 + (wp.z - n.z) ** 2; if (d < bd) { bd = d; best = wp; } }
    n.wpFrom = null; n.wpTo = best; n.tx = best.x + n.offX; n.tz = best.z + n.offZ;
  }

  // ---------- Comp_Infection ----------
  addInfection(n, amt, src = {}) {
    if (!n.on || n.state === 'Yankee') return false;
    n.inf = Math.min(CFG.INFECTION_MAX, n.inf + amt / n.resist);
    if (src.cause === 'spray') { n.choke = 0.6; n.flee = 0; n.report = 0; }
    if (n.inf >= CFG.INFECTION_MAX) { this.yankeefy(n, src); return true; }
    if (n.inf >= CFG.CONFUSED_AT && n.state === 'Clean') {
      n.state = 'Confused'; n.flee = 0; n.report = 0; n.willReport = false;
      this.say(n, pick(this.rng, CONFUSED_LINES), 2.4, 'confused'); this.G.audio.play('confuse', this.vol(n));
    }
    return false;
  }
  // OnYankeeFied イベント
  yankeefy(n, src = {}) {
    if (n.state === 'Yankee') return;
    const G = this.G;
    n.state = 'Yankee'; n.inf = CFG.INFECTION_MAX;
    n.faction = 'Player_Ally';            // 2. Faction Change: Enemy -> Player_Ally
    n.bt = 'BT_YankeeAlly';               // 3. Behavior Tree Swap
    n.swapT = 0.3; n.src = src;           // 1. Mesh/Material Swap（非同期ロード相当の遅延）
    n.flee = 0; n.report = 0; n.willReport = false; n.dance = 0; n.settled = false;
    if (src.ragdoll) { n.rag = src.ragdoll; n.kx = 0; n.kz = 0; n.vy = 0; }
    G.fx.puff(n.x, n.y + 1.1, n.z, 14, [0.75, 0.6, 0.9], 1.3, 0.9, 1.6, 1.2, 0.7);
    this.yankeeCount++; G.onYankeeFied?.(n, src);
  }
  finishYankee(n) {
    const G = this.G; n.look = this.yankeeLook(n); this.applyLook(n);
    const line = pick(this.rng, YANKEE_LINES);
    this.say(n, line, 2.8, 'yankee', true);
    const v = this.vol(n); G.audio.play('yankee', v); if (v > 0.25) G.audio.speak(line); // 4. Audio Event
    G.fx.sparks(n.x, n.y + 1.4, n.z, 26, [3, 2.2, 0.6], 5, 0.8, 0.1, 6);
  }
  silentYankee(n) { // 演出なしで即ヤンキー化（ムービー後の一括処理用）
    if (!n.on || n.state === 'Yankee') return;
    n.state = 'Yankee'; n.inf = CFG.INFECTION_MAX; n.faction = 'Player_Ally'; n.bt = 'BT_YankeeAlly'; n.look = this.yankeeLook(n); this.applyLook(n); this.yankeeCount++;
  }
  paint(n, key) { // MQ_05: Color_Tint を Random(Gold, Silver, Pink) に変更
    const G = this.G; n.paint = PAINT_COLORS[key]; this.applyLook(n); n.cheer = 2.2; n.flee = 0;
    const c = this._c.setHex(n.paint.hex); G.fx.paint(n.x, n.y + 1.2, n.z, [c.r, c.g, c.b]); G.audio.play('splat', this.vol(n));
    if (n.kind === 'quest' && !n.counted) { n.counted = true; G.mission.onPainted(n); }
    this.inRadius(n.x, n.z, 5, (o) => { if (o !== n && o.kind === 'quest' && !o.paint && o.rag <= 0) { o.flee = 1.2 + this.rng(); o.fx = n.x; o.fz = n.z; } });
  }
  dance(n, time) { if (!n.on || n.rag > 0 || n.held) return; n.dance = Math.max(n.dance, time); n.flee = 0; n.report = 0; n.willReport = false; }
  knock(n, vx, vz, power, ragTime = 3.5) { if (!n.on || n.held) return; n.rag = Math.max(n.rag, ragTime); n.kx = vx; n.kz = vz; n.vy = 2.5 + power * 0.3; n.y += 0.15; n.dance = 0; }
  stagger(n, vx, vz) { n.stag = 0.55; n.kx = vx; n.kz = vz; }
  // 目撃した一般市民が逃走・通報する
  alarm(x, z, radius, chance = 0.3) {
    let spoke = false;
    this.inRadius(x, z, radius, (n) => {
      if (n.kind !== 'citizen' || n.state !== 'Clean' || n.choke > 0 || n.rag > 0 || n.dance > 0 || n.flee > 0 || n.report > 0) return;
      n.flee = 2.2 + this.rng() * 2; n.fx = x; n.fz = z; n.willReport = this.rng() < chance;
      if (!spoke && this.rng() < 0.5) { spoke = true; this.say(n, pick(this.rng, CLEAN_LINES), 2.2, 'clean'); }
    });
  }
  say(n, text, dur, cls, force) { if (!force && n.bubbleCool > 0) return; n.bubbleCool = dur + 1.5; this.G.ui.bubble(n, text, dur, cls); }
  vol(n) { const p = this.G.player.pos; return clamp(1.15 - Math.hypot(n.x - p.x, n.z - p.z) / 45, 0, 1); }
  inRadius(x, z, r, fn) { const r2 = r * r; for (const n of this.list) { if (!n.on) continue; const dx = n.x - x, dz = n.z - z, d2 = dx * dx + dz * dz; if (d2 <= r2) fn(n, Math.sqrt(d2)); } }
  count(fn) { let c = 0; for (const n of this.list) if (n.on && fn(n)) c++; return c; }

  // ---------- 移動 ----------
  moveTo(n, tx, tz, speed, dt, collide) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { n.spd = 0; return d; }
    n.yaw = turnToward(n.yaw, Math.atan2(dx, dz), 8 * dt);
    const step = Math.min(d, speed * dt);
    if (d < 1.6) { n.x += (dx / d) * step; n.z += (dz / d) * step; } else { n.x += Math.sin(n.yaw) * step; n.z += Math.cos(n.yaw) * step; }
    n.spd = speed; n.phase += step * (speed > 4 ? 2.7 : 4.4);
    if (collide) this.G.world.resolveCircle(n, 0.35, n.y);
    const L = CFG.LIMIT; n.x = clamp(n.x, -L, L); n.z = clamp(n.z, -L, L);
    return d;
  }
  nextWaypoint(n) {
    const wp = n.wpTo, r = this.rng; let opts = wp.adj.filter((e) => e.to !== n.wpFrom); if (!opts.length) opts = wp.adj;
    const e = opts[Math.floor(r() * opts.length)];
    if (e.cross && e.cross.node.signaled) { // 横断歩道：歩行者信号待ち（信号が生きている場合のみ）
      const mgr = e.cross.node.mgr;
      if (mgr && mgr.bIsRegulated && mgr.state(e.cross.axis === 'z' ? 'x' : 'z') !== 'green') { n.wait = 0.5 + r(); return; }
    }
    n.wpFrom = wp; n.wpTo = e.to; n.tx = e.to.x + n.offX; n.tz = e.to.z + n.offZ;
  }
  confusedWalk(n, dt) {
    n.wanderT -= dt; if (n.wanderT <= 0) { n.wanderT = 1.4 + this.rng() * 2; n.tx = n.x + (this.rng() - 0.5) * 6; n.tz = n.z + (this.rng() - 0.5) * 6; }
    this.moveTo(n, n.tx, n.tz, 0.55, dt, true); n.anim = 'confused';
  }

  // ---------- Behavior Trees ----------
  btClean(n, dt) { // BT_CleanCitizen：巡回・逃走・通報
    if (n.state === 'Confused') return this.confusedWalk(n, dt);
    if (n.choke > 0) { n.choke -= dt; n.anim = 'stagger'; n.spd = 0; if (n.choke <= 0) { n.flee = 2.5; n.fx = this.G.player.pos.x; n.fz = this.G.player.pos.z; n.willReport = this.rng() < 0.3; } return; }
    if (n.flee > 0) {
      n.flee -= dt; const dx = n.x - n.fx, dz = n.z - n.fz, d = Math.hypot(dx, dz) || 1;
      this.moveTo(n, n.x + (dx / d) * 6, n.z + (dz / d) * 6, 5.6, dt, true); n.anim = 'panic';
      if (n.flee <= 0) { if (n.willReport) n.report = 2.6; else this.rejoin(n); }
      return;
    }
    if (n.report > 0) {
      n.report -= dt; n.anim = 'phone'; n.spd = 0;
      if (n.report <= 0) { n.willReport = false; this.G.law.report(n); this.rejoin(n); }
      return;
    }
    if (n.wait > 0) { n.wait -= dt; n.anim = 'idle'; return; }
    if (!n.wpTo) this.rejoin(n);
    const d = this.moveTo(n, n.tx, n.tz, n.walk, dt, false); n.anim = 'walk';
    if (d < 0.6) this.nextWaypoint(n);
  }
  btAlly(n, dt, idx) { // BT_YankeeAlly：プレイヤーに追従し、共にヤンキー座り
    const P = this.G.player, px = P.pos.x, pz = P.pos.z;
    const far = Math.hypot(n.x - px, n.z - pz);
    if (far > 75 || P.pos.y > 8) { n.anim = 'squat'; n.spd = 0; return; }
    let ring = 1, i = idx; while (i >= 3 + ring * 3) { i -= 3 + ring * 3; ring++; }
    const cap = 3 + ring * 3, ang = this.formYaw + Math.PI + ((i + 0.5) / cap - 0.5) * 4.0, R = 1.2 + ring * 1.25;
    const tx = px + Math.sin(ang) * R, tz = pz + Math.cos(ang) * R, d = Math.hypot(tx - n.x, tz - n.z);
    if (n.settled && d < 1.3) {
      n.yaw = turnToward(n.yaw, Math.atan2(px - n.x, pz - n.z) + (ring % 2 ? 0.5 : -0.5), 3 * dt); n.spd = 0;
      n.anim = P.squat || this.playerIdle > 1.8 ? 'squat' : 'idle'; return;
    }
    n.settled = false;
    if (d < 0.35) { n.settled = true; return; }
    const sp = d > 8 ? 8 : d > 3 ? Math.max(3.4, P.speed + 1.2) : clamp(P.speed, 1.5, 3);
    this.moveTo(n, tx, tz, sp, dt, true); n.anim = sp > 4.2 ? 'run' : 'swagger';
  }
  btEnforcer(n, dt) { // コンプラ指導員：通報で出動しプレイヤーを追う
    const G = this.G, P = G.player;
    if (n.state === 'Confused') return this.confusedWalk(n, dt);
    if (G.law.level === 0) { n.kind = 'citizen'; this.rejoin(n); return; }
    let allies = 0; // 仲間ヤンキーに囲まれるとメンチを切られて感染
    for (const o of this.list) if (o.on && o.state === 'Yankee' && o.kind !== 'quest' && o.rag <= 0 && Math.abs(o.x - n.x) < 5 && Math.abs(o.z - n.z) < 5) allies++;
    if (allies) this.addInfection(n, Math.min(allies, 4) * 5 * dt, { cause: 'glare' });
    const foot = P.mode !== 'vehicle', d = Math.hypot(P.pos.x - n.x, P.pos.z - n.z);
    if (d > (foot ? 1.5 : 4.5)) { this.moveTo(n, P.pos.x, P.pos.z, 5.4, dt, true); n.anim = 'run'; } else { n.yaw = turnToward(n.yaw, Math.atan2(P.pos.x - n.x, P.pos.z - n.z), 8 * dt); n.anim = 'phone'; n.spd = 0; }
    n.atk -= dt;
    if (foot && d < 1.9 && n.atk <= 0 && Math.abs(P.pos.y - n.y) < 2) { n.atk = 1.15; P.damage(9, n); G.audio.play('whistle', 0.8); this.say(n, pick(this.rng, ENFORCER_LINES), 1.6, 'clean'); }
  }
  btQuest(n, dt) { // MQ_05 のスーツ新成人：広場でたむろ
    const G = this.G, Pz = G.world.plaza;
    if (G.mission.cutscene) { n.anim = 'firework'; n.spd = 0; n.yaw = turnToward(n.yaw, Math.atan2(Pz.mic.x - n.x, Pz.mic.z - n.z), 3 * dt); return; }
    if (n.cheer > 0) { n.cheer -= dt; n.anim = 'cheer'; n.spd = 0; return; }
    if (n.flee > 0 && !n.paint) {
      n.flee -= dt; const dx = n.x - n.fx, dz = n.z - n.fz, d = Math.hypot(dx, dz) || 1;
      this.moveTo(n, clamp(n.x + (dx / d) * 5, Pz.x0 + 2, Pz.x1 - 2), clamp(n.z + (dz / d) * 5, Pz.z0 + 8, Pz.z1 - 1), 3.6, dt, true); n.anim = 'panic'; return;
    }
    n.wanderT -= dt;
    if (n.wanderT <= 0) { n.wanderT = 4 + this.rng() * 8; n.tx = lerp(Pz.x0 + 3, Pz.x1 - 3, this.rng()); n.tz = lerp(Pz.z0 + 9, Pz.z1 - 1.5, this.rng()); }
    const y = n.state === 'Yankee' || n.paint;
    const d = this.moveTo(n, n.tx, n.tz, y ? 1.3 : 1.0, dt, true);
    n.anim = d < 0.3 ? (n.state === 'Yankee' ? 'squat' : 'idle') : y ? 'swagger' : 'walk';
  }
  updRag(n, dt) {
    const W = this.G.world; n.rag -= dt; n.anim = 'down'; n.spd = 0;
    n.vy -= 18 * dt; n.y += n.vy * dt; n.x += n.kx * dt; n.z += n.kz * dt;
    const g = W.baseHeight(n.x, n.z);
    if (n.y <= g) { n.y = g; n.vy = 0; const k = Math.exp(-5 * dt); n.kx *= k; n.kz *= k; }
    W.resolveCircle(n, 0.4, n.y);
    if (n.rag <= 0) { n.y = g; if (n.state === 'Clean' && n.kind === 'citizen') { n.flee = 2.5; n.fx = this.G.player.pos.x; n.fz = this.G.player.pos.z; n.willReport = this.rng() < 0.4; } }
  }

  update(dt) {
    const G = this.G, P = G.player, W = G.world;
    this.playerIdle = P.speed < 0.3 && P.mode === 'foot' ? this.playerIdle + dt : 0;
    if (P.speed > 0.6) this.formYaw = turnToward(this.formYaw, P.moveYaw ?? P.yaw, 2.2 * dt);
    let fi = 0, clean = 0, ambient = 0;
    for (const n of this.list) {
      if (!n.on) continue;
      n.t += dt; if (n.bubbleCool > 0) n.bubbleCool -= dt; if (n.hitCool > 0) n.hitCool -= dt;
      if (n.swapT > 0) { n.swapT -= dt; if (n.swapT <= 0) this.finishYankee(n); }
      if (n.kind !== 'quest') { ambient++; if (n.state !== 'Yankee') clean++; }
      if (n.rag > 0) { this.updRag(n, dt); if (n.state === 'Yankee' && n.kind !== 'quest') fi++; continue; }
      if (n.held) continue;
      if (n.dance > 0) { n.dance -= dt; n.anim = 'dance'; n.spd = 0; }
      else if (n.stag > 0) { n.stag -= dt; n.x += n.kx * dt; n.z += n.kz * dt; const k = Math.exp(-5 * dt); n.kx *= k; n.kz *= k; n.anim = 'stagger'; W.resolveCircle(n, 0.35, n.y); }
      else if (n.kind === 'quest') this.btQuest(n, dt);
      else if (n.state === 'Yankee') this.btAlly(n, dt, fi);
      else if (n.kind === 'enforcer') this.btEnforcer(n, dt);
      else this.btClean(n, dt);
      if (n.state === 'Yankee' && n.kind !== 'quest') fi++;
      n.y = W.baseHeight(n.x, n.z);
    }
    this.followerCount = fi;
    // 一般市民の補充（常にオーバーライド対象がいるように）
    this.respawnT -= dt;
    if (this.respawnT <= 0 && clean < 26 && ambient < 82) {
      this.respawnT = 2.5; const p = W.randomSidewalkPoint(this.rng, P.pos, 60, 400); this.spawn('citizen', p.x, p.z);
    }
    this.write();
  }

  write() {
    const G = this.G, cam = G.camera, m = this.m, M = this.mats; let bars = 0;
    this._r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    for (const n of this.list) {
      const i = n.id;
      const far = n.on ? (n.x - cam.position.x) ** 2 + (n.z - cam.position.z) ** 2 : 0;
      if (!n.on || far > 175 * 175) {
        if (n.vis) { n.vis = false; for (const k of ['hips', 'torso', 'head', 'hair', 'punch', 'regent', 'shades', 'tie']) m[k].setMatrixAt(i, ZERO); for (const k of ['uarm', 'farm', 'hand', 'thigh', 'shin', 'foot']) { m[k].setMatrixAt(i * 2, ZERO); m[k].setMatrixAt(i * 2 + 1, ZERO); } }
        continue;
      }
      n.vis = true;
      applyAnim(this.pose, n.anim, WALKLIKE[n.anim] ? n.phase : n.t);
      computeMatrices(this.pose, n.x, n.y, n.z, n.yaw, n.sc, M);
      const hs = n.look.hairStyle;
      m.hips.setMatrixAt(i, M[0]); m.torso.setMatrixAt(i, M[1]); m.head.setMatrixAt(i, M[2]);
      m.hair.setMatrixAt(i, hs === 0 || hs === 2 ? M[2] : ZERO); m.punch.setMatrixAt(i, hs === 1 ? M[2] : ZERO); m.regent.setMatrixAt(i, hs === 2 ? M[2] : ZERO);
      m.shades.setMatrixAt(i, n.look.shades ? M[2] : ZERO); m.tie.setMatrixAt(i, n.look.tie != null && !n.paint ? M[1] : ZERO);
      const j = i * 2;
      m.uarm.setMatrixAt(j, M[3]); m.uarm.setMatrixAt(j + 1, M[4]); m.farm.setMatrixAt(j, M[5]); m.farm.setMatrixAt(j + 1, M[6]); m.hand.setMatrixAt(j, M[7]); m.hand.setMatrixAt(j + 1, M[8]);
      m.thigh.setMatrixAt(j, M[9]); m.thigh.setMatrixAt(j + 1, M[10]); m.shin.setMatrixAt(j, M[11]); m.shin.setMatrixAt(j + 1, M[12]); m.foot.setMatrixAt(j, M[13]); m.foot.setMatrixAt(j + 1, M[14]);
      // Infection_Meter バー
      if (n.inf > 0.5 && n.state !== 'Yankee' && far < 42 * 42 && bars < BAR_MAX) {
        const f = n.inf / CFG.INFECTION_MAX, w = 0.8, h = 0.085, y = n.y + (n.rag > 0 ? 0.9 : 2.05 * n.sc);
        this._m.compose(this._v.set(n.x, y, n.z), cam.quaternion, this._s.set(w + 0.05, h + 0.05, 1)); this.barBg.setMatrixAt(bars, this._m); this.barBg.setColorAt(bars, this._c.setRGB(0.02, 0.02, 0.03));
        this._v.set(n.x, y, n.z).addScaledVector(this._r, -(1 - f) * w * 0.5); this._m.compose(this._v, cam.quaternion, this._s.set(w * f, h, 1));
        this.barFill.setMatrixAt(bars, this._m); this.barFill.setColorAt(bars, f < 0.5 ? this._c.setRGB(1.6, 0.35, 2.2) : this._c.setRGB(3.0, 2.0, 0.3)); bars++;
      }
    }
    for (let b = bars; b < this.lastBars; b++) { this.barBg.setMatrixAt(b, ZERO); this.barFill.setMatrixAt(b, ZERO); }
    this.lastBars = bars;
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
    this.barBg.instanceMatrix.needsUpdate = true; this.barFill.instanceMatrix.needsUpdate = true; this.barBg.instanceColor.needsUpdate = true; this.barFill.instanceColor.needsUpdate = true;
    if (this.lookDirty) {
      this.lookDirty = false;
      for (const im of this.all) { im.instanceColor.needsUpdate = true; const a = im.geometry.attributes.instMetal; if (a) a.needsUpdate = true; }
    }
  }
}

// 通報システム（一般市民の通報 → コンプラ指導員が出動）
export class Law {
  constructor(G) { this.G = G; this.reports = 0; this.level = 0; this.cool = 0; }
  report(by) {
    const G = this.G; this.reports = Math.min(6, this.reports + 1); this.cool = 26;
    const lv = Math.min(3, Math.ceil(this.reports / 2));
    if (lv > this.level) { this.level = lv; G.ui.toast(`通報された！ コンプラ指導員が出動（警戒Lv.${lv}）`, 'bad'); G.audio.play('whistle', 0.7); }
    this.fill();
  }
  fill() {
    const G = this.G, want = this.level * 2; let have = G.npcs.count((n) => n.kind === 'enforcer' && n.state !== 'Yankee');
    while (have < want) { const p = G.world.randomSidewalkPoint(G.npcs.rng, G.player.pos, 32, 60); if (!G.npcs.spawn('enforcer', p.x, p.z)) break; have++; }
  }
  reset() { this.reports = 0; this.level = 0; this.cool = 0; }
  update(dt) {
    if (this.reports <= 0) return;
    this.cool -= dt;
    if (this.cool <= 0) {
      this.reports = Math.max(0, this.reports - 2); this.level = Math.min(3, Math.ceil(this.reports / 2)); this.cool = 14;
      if (this.level === 0) this.G.ui.toast('ほとぼりが冷めた', 'info');
    }
  }
}
