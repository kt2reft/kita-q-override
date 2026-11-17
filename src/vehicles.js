// 運転可能ビークル：ダンプ（施設ハッキング用）と 2.2 小倉祇園太鼓チャージ（Vehicle_GionDaiko）
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp } from './utils.js';
import { Batch, xform } from './world.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

function buildDump(G) {
  const g = new THREE.Group(), b = new Batch(), M = G.world.mats;
  const paintA = new THREE.MeshPhysicalMaterial({ color: 0x0f5a41, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
  const paintB = std({ color: 0x1b6b50, metalness: 0.4, roughness: 0.5 });
  const chrome = std({ color: 0xe8eaec, metalness: 1, roughness: 0.12 }), tire = std({ color: 0x131313, roughness: 0.88 });
  const head = std({ color: 0xfff6dd, emissive: 0xfff0cc, emissiveIntensity: 2.5 }), tail = std({ color: 0xff2a18, emissive: 0xff2a18, emissiveIntensity: 1.6 });
  const amber = std({ color: 0xffb020, emissive: 0xffa010, emissiveIntensity: 3.5 }), purple = std({ color: 0xb040ff, emissive: 0xa030ff, emissiveIntensity: 3.5 });
  const dirt = std({ color: 0x5a4632, roughness: 1 });
  b.box(M.metalDark, 2.2, 0.45, 7.0, 0, 0.85, 0);
  b.box(paintA, 2.4, 2.0, 1.9, 0, 2.05, 2.55); b.box(chrome, 2.44, 0.12, 0.55, 0, 3.1, 3.3);
  b.box(M.glass, 2.2, 0.85, 0.06, 0, 2.5, 3.51); b.box(M.glass, 0.06, 0.7, 1.0, 1.21, 2.5, 2.7); b.box(M.glass, 0.06, 0.7, 1.0, -1.21, 2.5, 2.7);
  b.box(chrome, 2.5, 0.42, 0.28, 0, 0.75, 3.55); b.box(M.metalDark, 1.6, 0.6, 0.06, 0, 1.5, 3.51);
  for (const s of [-1, 1]) {
    b.box(head, 0.42, 0.22, 0.08, s * 0.85, 1.2, 3.53); b.box(tail, 0.3, 0.2, 0.06, s * 0.95, 1.1, -3.56);
    b.box(paintB, 0.12, 1.15, 4.7, s * 1.19, 1.95, -1.15); b.cyl(chrome, 0.07, 0.07, 1.7, s * 1.12, 3.0, 1.45, 8);
    for (const z of [2.4, -1.4, -2.6]) b.cyl(tire, 0.52, 0.52, 0.36, s * 1.05, 0.52, z, 16, 0, Math.PI / 2);
    for (let k = 0; k < 7; k++) b.box(k % 2 ? amber : purple, 0.08, 0.08, 0.14, s * 1.26, 2.5, -3.2 + k * 0.7);
    for (let k = 0; k < 5; k++) b.box(amber, 0.1, 0.06, 0.06, s * (0.2 + k * 0.22), 3.2, 3.56);
  }
  b.box(paintB, 2.5, 0.18, 4.7, 0, 1.3, -1.15); b.box(paintB, 2.5, 1.6, 0.14, 0, 2.15, 1.2); b.box(paintB, 2.5, 1.15, 0.12, 0, 1.95, -3.5);
  b.add(dirt, new THREE.SphereGeometry(1.1, 12, 8), xform(0, 2.25, -1.1, 0, 0, 0, 1, 0.55, 1.9));
  b.build(g);
  const signM = std({ map: G.T.dumpSign, roughness: 0.5 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), signM); p.position.set(s * 1.26, 1.9, -1.15); p.rotation.y = s * Math.PI / 2; g.add(p); }
  return g;
}

function buildDaiko(G) {
  const g = new THREE.Group(), b = new Batch(), M = G.world.mats;
  const red = std({ color: 0xb3201a, roughness: 0.45 }), cloth = std({ color: 0x4a1578, roughness: 0.85 }), gold = std({ color: 0xe0b23a, metalness: 0.9, roughness: 0.3 });
  const drumBody = std({ color: 0x3a1c12, roughness: 0.4, map: G.T.wood.map }), skin = std({ color: 0xe9dcc0, roughness: 0.6 });
  const lanR = std({ color: 0xff5a40, emissive: 0xff3a20, emissiveIntensity: 3.2 }), lanW = std({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 3.0 });
  b.box(M.wood, 2.2, 0.3, 3.8, 0, 0.85, 0); b.box(cloth, 2.24, 0.5, 0.04, 0, 0.5, 1.9); b.box(cloth, 2.24, 0.5, 0.04, 0, 0.5, -1.9);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) { b.cyl(M.wood, 0.5, 0.5, 0.14, sx * 1.02, 0.5, sz * 1.25, 18, 0, Math.PI / 2); b.cyl(gold, 0.12, 0.12, 0.18, sx * 1.02, 0.5, sz * 1.25, 10, 0, Math.PI / 2); b.box(red, 0.1, 2.6, 0.1, sx * 1.0, 2.3, sz * 1.75); }
    b.box(red, 0.1, 0.1, 3.7, sx * 1.0, 3.55, 0); b.box(M.wood, 0.08, 0.08, 1.5, sx * 0.6, 0.85, 2.6);
    for (let k = 0; k < 9; k++) for (let r = 0; r < 2; r++) b.add((k + r) % 2 ? lanR : lanW, new THREE.SphereGeometry(1, 8, 6), xform(sx * 1.08, 3.3 - r * 0.42, -1.6 + k * 0.4, 0, 0, 0, 0.13, 0.17, 0.13));
  }
  for (const sz of [-1, 1]) {
    b.box(red, 2.1, 0.1, 0.1, 0, 3.55, sz * 1.75); b.box(M.wood, 0.9, 0.75, 0.5, 0, 1.35, sz * 1.35);
    b.cyl(drumBody, 0.56, 0.56, 0.72, 0, 1.95, sz * 1.35, 20, Math.PI / 2); b.cyl(skin, 0.57, 0.57, 0.03, 0, 1.95, sz * 1.35 + 0.37, 20, Math.PI / 2); b.cyl(skin, 0.57, 0.57, 0.03, 0, 1.95, sz * 1.35 - 0.37, 20, Math.PI / 2);
    b.cyl(gold, 0.6, 0.6, 0.05, 0, 1.95, sz * 1.35, 20, Math.PI / 2);
    for (let k = 0; k < 5; k++) b.add(k % 2 ? lanR : lanW, new THREE.SphereGeometry(1, 8, 6), xform(-0.8 + k * 0.4, 3.3, sz * 1.82, 0, 0, 0, 0.13, 0.17, 0.13));
  }
  b.box(M.wood, 1.28, 0.08, 0.08, 0, 0.85, 3.3); b.box(cloth, 2.5, 0.08, 3.9, 0, 3.66, 0); b.box(gold, 2.56, 0.04, 3.96, 0, 3.61, 0);
  b.build(g);
  const cm = std({ map: G.T.daikoCloth, roughness: 0.8 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.56), cm); p.position.set(s * 1.115, 0.5, 0); p.rotation.y = s * Math.PI / 2; g.add(p); }
  return g;
}

const PARAMS = {
  dump: { name: 'ダンプ', len: 7.2, wid: 2.5, accel: 7.5, maxV: 21, rev: 6, brake: 16, grip: 7.5, hbGrip: 2.0, drag: 0.22, steer: 1.45, seatY: 0, camDist: 11, camH: 4.2, heavy: true },
  // 特殊ハンドリング設定：極端に滑りやすいドリフト特化の摩擦係数
  daiko: { name: '小倉祇園太鼓 山車', len: 4.6, wid: 2.3, accel: 9.5, maxV: 17, rev: 5, brake: 12, grip: 1.05, hbGrip: 0.35, drag: 0.3, steer: 2.3, seatY: 1.0, camDist: 8.5, camH: 3.6, heavy: false },
};

export class Drivable {
  constructor(G, type, x, z, yaw) {
    this.G = G; this.type = type; this.P = PARAMS[type]; this.x = x; this.z = z; this.y = 0; this.yaw = yaw; this.vx = 0; this.vz = 0; this.steer = 0; this.roll = 0;
    this.driver = null; this.ctl = { throttle: 0, steer: 0, handbrake: false }; this.drumCool = 0; this.drumT = 9; this.skidT = 0; this.crashCool = 0;
    this.group = type === 'dump' ? buildDump(G) : buildDaiko(G);
    G.scene.add(this.group); this._p = { x: 0, z: 0 }; this.sync();
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.set(0, this.yaw, this.roll, 'YXZ'); }
  update(dt) {
    const G = this.G, W = G.world, P = this.P, ctl = this.driver ? this.ctl : null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    let vf = this.vx * fx + this.vz * fz, vl = this.vx * lx + this.vz * lz;
    if (this.drumCool > 0) this.drumCool -= dt; this.drumT += dt; if (this.crashCool > 0) this.crashCool -= dt;
    if (ctl) {
      if (ctl.throttle > 0) vf += (vf < 0 ? P.brake : P.accel) * dt;
      else if (ctl.throttle < 0) vf -= (vf > 0.5 ? P.brake : P.accel * 0.6) * dt;
      vf = clamp(vf, -P.rev, P.maxV); this.steer = damp(this.steer, ctl.steer, 7, dt);
    } else { this.steer = damp(this.steer, 0, 6, dt); vf *= Math.exp(-1.6 * dt); }
    const hb = ctl && ctl.handbrake;
    vl *= Math.exp(-(hb ? P.hbGrip : P.grip) * dt); vf *= Math.exp(-(P.drag + (hb ? 1.3 : 0)) * dt);
    if (!ctl && Math.abs(vf) < 0.05) vf = 0;
    this.yaw += this.steer * P.steer * clamp(vf / 5, -1, 1) * dt / (1 + Math.abs(vf) * 0.035);
    this.vx = fx * vf + lx * vl; this.vz = fz * vf + lz * vl;
    this.x += this.vx * dt; this.z += this.vz * dt;
    const sp = this.speed;
    if (sp > 0.02 || ctl) this.collide(dt);
    this.x = clamp(this.x, -CFG.LIMIT, CFG.LIMIT); this.z = clamp(this.z, -CFG.LIMIT, CFG.LIMIT);
    this.y = damp(this.y, W.baseHeight(this.x, this.z), 14, dt);
    this.roll = damp(this.roll, clamp(-vl * 0.035 - this.steer * vf * 0.004, -0.14, 0.14), 6, dt);
    // スキッド
    if (Math.abs(vl) > 3.2 && sp > 4) {
      this.skidT -= dt;
      for (const s of [-1, 1]) G.fx.puff(this.x - fx * P.len * 0.35 + lx * s * P.wid * 0.4, 0.25, this.z - fz * P.len * 0.35 + lz * s * P.wid * 0.4, 1, [0.75, 0.75, 0.75], 1.1, 0.8, 0.5, 0.5, 0.28);
      if (this.skidT <= 0) { this.skidT = 0.45; G.audio.play('screech', 0.7); }
    }
    this.sync();
  }
  collide(dt) {
    const G = this.G, W = G.world, P = this.P, r = P.wid / 2, p = this._p; const sp0 = this.speed;
    for (let k = -1; k <= 1; k++) {
      const off = k * (P.len / 2 - r), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      p.x = this.x + fx * off; p.z = this.z + fz * off; const ox = p.x, oz = p.z;
      const hit = W.resolveCircle(p, r, 0.5);
      if (hit) {
        this.x += p.x - ox; this.z += p.z - oz;
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        if (vn < 0) {
          const impact = -vn; this.vx -= 1.25 * vn * hit.nx; this.vz -= 1.25 * vn * hit.nz; this.vx *= 0.82; this.vz *= 0.82;
          if (impact > 2.5 && this.crashCool <= 0) {
            this.crashCool = 0.5; G.audio.play('crash', clamp(impact / 12, 0.3, 1)); G.fx.sparks(p.x - hit.nx * r, 1.2, p.z - hit.nz * r, 24, [3, 2.2, 1], 6, 0.6, 0.08); G.fx.debris(p.x - hit.nx * r, 1.2, p.z - hit.nz * r, 6, 0x9a9a9a, 4, 0.25);
            G.shake = Math.max(G.shake || 0, clamp(impact / 14, 0.2, 0.8));
          }
          // 施設ハッキングトリガー：ImpactVelocity > 500 でカフェの Collider に衝突
          if (hit.c && hit.c.cafeId !== undefined && impact > CFG.IMPACT_VELOCITY && this.driver) G.facilities.cafes[hit.c.cafeId].overrideToKakuuchi('vehicle', impact);
        }
      }
      // 信号柱
      for (const L of G.traffic.lights) {
        if (!L.alive) continue; const dx = p.x - L.x, dz = p.z - L.z, d = Math.hypot(dx, dz);
        if (d < r + 0.25) { if (sp0 > 3.5) { G.traffic.destroyLight(L); this.vx *= 0.85; this.vz *= 0.85; G.shake = 0.5; } else { const push = r + 0.25 - d; this.x += (dx / d) * push; this.z += (dz / d) * push; } }
      }
      // AI 車両
      for (const c of G.traffic.cars) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rr = r + 1.15;
        if (d < rr && d > 0.01) {
          const push = rr - d; this.x += (dx / d) * push; this.z += (dz / d) * push; const vn = this.vx * (dx / d) + this.vz * (dz / d);
          if (vn < 0) { this.vx -= 1.2 * vn * (dx / d); this.vz -= 1.2 * vn * (dz / d); if (-vn > 3 && this.crashCool <= 0) { this.crashCool = 0.5; G.audio.play('crash', 0.6); G.audio.play('horn', 0.8); c.fear += 25; G.fx.sparks(c.x + dx * 0.5, 1, c.z + dz * 0.5, 16, [3, 2.2, 1], 5, 0.5, 0.07); if (c.fear >= 100) G.traffic.yankeeCar(c); } }
        }
      }
    }
    // NPC をはね飛ばす（怒りで感染が進む）
    if (sp0 > 2.5) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw), npcs = G.npcs;
      for (const n of npcs.list) {
        if (!n.on || n.rag > 0 || n.held) continue; const rx = n.x - this.x, rz = n.z - this.z; if (rx > 6 || rx < -6 || rz > 6 || rz < -6) continue;
        const f = rx * fx + rz * fz, l = rx * lx + rz * lz; if (Math.abs(f) > P.len / 2 + 0.3 || Math.abs(l) > P.wid / 2 + 0.3) continue;
        const side = l >= 0 ? 1 : -1; npcs.knock(n, this.vx * 0.8 + lx * side * 3, this.vz * 0.8 + lz * side * 3, sp0, 3.5);
        if (n.state !== 'Yankee') { npcs.addInfection(n, 22, { cause: 'vehicle' }); npcs.alarm(n.x, n.z, 12, 0.25); }
        G.audio.play('hit', 0.8);
      }
    }
  }
}

export class Vehicles {
  constructor(G) {
    this.G = G; const pk = G.world.parking;
    this.list = [new Drivable(G, 'dump', pk.x0 + 4.5, pk.z0 + 12, Math.PI), new Drivable(G, 'daiko', pk.x0 + 15, pk.z0 + 12, Math.PI)];
    this.waves = []; this.waveId = 0;
  }
  nearest(x, z, r) { let best = null, bd = r; for (const v of this.list) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd + v.P.len / 2) { bd = d; best = v; } } return best; }
  // アクションキー：太鼓を叩く Montage + 不可視 Sphere Collider（半径20m, 持続0.5秒, 拡大）
  daikoHit(v) {
    if (v.drumCool > 0) return false; const G = this.G; v.drumCool = 0.95; v.drumT = 0;
    G.audio.play('taiko'); G.fx.shockwave(v.x, 1.8, v.z, CFG.DAIKO_RADIUS, CFG.DAIKO_DURATION);
    G.fx.sparks(v.x + Math.sin(v.yaw) * 1.0, 2.0, v.z + Math.cos(v.yaw) * 1.0, 18, [3, 2, 0.8], 4, 0.4, 0.07);
    this.waves.push({ x: v.x, z: v.z, t: 0, id: ++this.waveId }); G.shake = Math.max(G.shake || 0, 0.35);
    return true;
  }
  update(dt) {
    const G = this.G;
    for (const v of this.list) v.update(dt);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.t += dt; const R = CFG.DAIKO_RADIUS * Math.min(1, w.t / CFG.DAIKO_DURATION);
      // Hit Event：CharacterMovement を強制停止し bIsDancing=true（盆踊り 5.0 秒）
      G.npcs.inRadius(w.x, w.z, R, (n) => { if (n.waveId !== w.id) { n.waveId = w.id; G.npcs.dance(n, CFG.DANCE_TIME); } });
      for (const c of G.traffic.cars) if (Math.hypot(c.x - w.x, c.z - w.z) < R) c.forceBrake = Math.max(c.forceBrake, CFG.DANCE_TIME);
      if (w.t >= CFG.DAIKO_DURATION) this.waves.splice(i, 1);
    }
  }
}
