// 3. 環境・トラフィックAI：BP_TrafficLight（破壊可能）、Traffic_Manager、ビークルAI、Skill_YankeeWalk
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, DRIVER_LINES } from './config.js';
import { makeRng, clamp, pick } from './utils.js';
import { Batch, xform } from './world.js';

const INT = 11, LANE = 3, CYCLE = 26;

class TrafficManager {
  constructor(node, rng) { this.node = node; this.bIsRegulated = true; this.t = rng() * CYCLE; this.lights = []; }
  state(axis) {
    if (!this.bIsRegulated) return 'off';
    const t = this.t % CYCLE;
    if (axis === 'z') return t < 10 ? 'green' : t < 12 ? 'yellow' : 'red';
    return t < 13 ? 'red' : t < 23 ? 'green' : t < 25 ? 'yellow' : 'red';
  }
}

// ---- 車体モデル ----
function extrudeProfile(profile, width) {
  const sh = new THREE.Shape(); profile.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2); return g;
}
function slopePanel(z0, y0, z1, y1, width) { // 斜面に沿ったガラス板
  const len = Math.hypot(z1 - z0, y1 - y0), a = Math.atan2(-(y1 - y0), z1 - z0);
  const g = new THREE.BoxGeometry(width, 0.03, len * 0.9); g.applyMatrix4(xform((0), (y0 + y1) / 2, (z0 + z1) / 2, 0, a)); return g;
}
function nonIdx(g) { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') o.deleteAttribute(k); return o; }
const merge = (list) => mergeGeometries(list.map(nonIdx), false);
function makeCarTypes() {
  const wheel = (x, z, r = 0.31) => { const g = new THREE.CylinderGeometry(r, r, 0.2, 14); g.applyMatrix4(xform(x, r, z, 0, 0, Math.PI / 2)); return g; };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const types = [];
  { // セダン
    const w = 1.72;
    const body = extrudeProfile([[-2.2, 0.36], [-2.2, 0.88], [-1.92, 1.0], [-1.3, 1.04], [-0.78, 1.43], [0.56, 1.43], [1.16, 1.02], [2.02, 0.9], [2.2, 0.68], [2.2, 0.36]], w);
    const glass = merge([extrudeProfile([[-1.2, 1.07], [-0.74, 1.39], [0.52, 1.39], [1.06, 1.05]], w + 0.02), slopePanel(0.56, 1.44, 1.16, 1.03, w - 0.2), slopePanel(-1.3, 1.05, -0.78, 1.44, w - 0.2)]);
    types.push({ body, glass, wheels: merge([wheel(-0.8, 1.38), wheel(0.8, 1.38), wheel(-0.8, -1.32), wheel(0.8, -1.32)]), front: merge([box(0.34, 0.12, 0.06, -0.58, 0.78, 2.21), box(0.34, 0.12, 0.06, 0.58, 0.78, 2.21)]), rear: merge([box(0.4, 0.12, 0.06, -0.56, 0.86, -2.21), box(0.4, 0.12, 0.06, 0.56, 0.86, -2.21)]), half: 2.2 });
  }
  { // 軽バン
    const w = 1.46;
    const body = extrudeProfile([[-1.68, 0.36], [-1.68, 1.5], [-1.56, 1.68], [0.72, 1.68], [1.22, 1.12], [1.62, 1.0], [1.7, 0.7], [1.7, 0.36]], w);
    const glass = merge([extrudeProfile([[-1.5, 1.12], [-1.5, 1.6], [0.66, 1.6], [1.1, 1.14]], w + 0.02), slopePanel(0.72, 1.69, 1.22, 1.13, w - 0.16), box(w - 0.3, 0.42, 0.03, 0, 1.36, -1.69)]);
    types.push({ body, glass, wheels: merge([wheel(-0.68, 1.12, 0.28), wheel(0.68, 1.12, 0.28), wheel(-0.68, -1.1, 0.28), wheel(0.68, -1.1, 0.28)]), front: merge([box(0.26, 0.14, 0.06, -0.5, 0.82, 1.71), box(0.26, 0.14, 0.06, 0.5, 0.82, 1.71)]), rear: merge([box(0.14, 0.34, 0.06, -0.62, 1.0, -1.69), box(0.14, 0.34, 0.06, 0.62, 1.0, -1.69)]), half: 1.7 });
  }
  return types;
}

export class Traffic {
  constructor(G) {
    this.G = G; const W = G.world, rng = (this.rng = makeRng(99)); const scene = G.scene;
    this.edges = [];
    for (const a of W.nodes) { a.out = []; a.mgr = new TrafficManager(a, rng); }
    for (const a of W.nodes) for (const b of a.neighbors) {
      const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z), lx = dz, lz = -dx;
      const e = { from: a, to: b, dx, dz, axis: dx ? 'x' : 'z', sx: a.x + dx * INT + lx * LANE, sz: a.z + dz * INT + lz * LANE, ex: b.x - dx * INT + lx * LANE, ez: b.z - dz * INT + lz * LANE, len: 80 - INT * 2, yaw: Math.atan2(dx, dz) };
      this.edges.push(e); a.out.push(e);
    }
    // ---- 信号機 ----
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.poleMat = std({ color: 0x6d7275, roughness: 0.55, metalness: 0.6 });
    this.lampMat = {
      green: [std({ color: 0x0c2a22, roughness: 0.3 }), std({ color: 0x10ffb0, emissive: 0x10ffb0, emissiveIntensity: 5 })],
      yellow: [std({ color: 0x2c2408, roughness: 0.3 }), std({ color: 0xffc820, emissive: 0xffc820, emissiveIntensity: 5 })],
      red: [std({ color: 0x2c0a08, roughness: 0.3 }), std({ color: 0xff2a18, emissive: 0xff2a18, emissiveIntensity: 5 })],
    };
    this.lights = [];
    const lampGeo = new THREE.CircleGeometry(0.15, 14); lampGeo.rotateY(Math.PI);
    for (const n of W.nodes) if (n.signaled) for (const e of this.edges) if (e.to === n) {
      const lx = e.dz, lz = -e.dx, px = n.x + e.dx * 8.7 + lx * 8.7, pz = n.z + e.dz * 8.7 + lz * 8.7;
      const group = new THREE.Group(); group.position.set(px, CFG.CURB, pz); group.rotation.y = e.yaw;
      const b = new Batch();
      b.cyl(this.poleMat, 0.11, 0.15, 6.4, 0, 3.2, 0, 10); b.cyl(this.poleMat, 0.06, 0.07, 5.9, -2.95, 6.0, 0, 8, 0, Math.PI / 2);
      b.box(this.poleMat, 1.3, 0.46, 0.26, -5.7, 5.62, 0); b.box(this.poleMat, 1.34, 0.05, 0.3, -5.7, 5.87, -0.16); b.box(this.poleMat, 0.3, 0.5, 0.2, 0, 1.3, 0.12);
      b.build(group);
      const lamps = {};
      [['green', 0.42], ['yellow', 0], ['red', -0.42]].forEach(([k, ox]) => { const m = new THREE.Mesh(lampGeo, this.lampMat[k][0]); m.position.set(-5.7 + ox, 5.62, -0.135); group.add(m); lamps[k] = m; });
      scene.add(group);
      const L = { node: n, axis: e.axis, x: px, z: pz, hp: 60, alive: true, group, lamps, shown: '', shake: 0 };
      this.lights.push(L); n.mgr.lights.push(L);
    }
    // ---- 車 ----
    const types = makeCarTypes();
    const paint = (c, m = 0.55) => new THREE.MeshPhysicalMaterial({ color: c, metalness: m, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.paints = [0xf2f2f0, 0xb9bcc0, 0x18191b, 0xe6e2d6, 0x1c2c4c, 0x8f1d1d, 0x5a5d61, 0xf2f2f0].map((c) => paint(c));
    this.yankPaint = paint(0xd9a514, 0.95); this.yankPaint2 = paint(0x6a1fa8, 0.8);
    const glassM = std({ color: 0x10171c, roughness: 0.05, metalness: 0.9 }), tire = std({ color: 0x141414, roughness: 0.85 });
    const head = std({ color: 0xfff6dd, emissive: 0xfff0cc, emissiveIntensity: 2.2 });
    this.tail = [std({ color: 0x5a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.9 }), std({ color: 0xff2a18, emissive: 0xff2a18, emissiveIntensity: 5 })];
    this.cars = [];
    for (let i = 0; i < CFG.TRAFFIC_CARS; i++) {
      const ty = types[i % 3 === 2 ? 1 : 0]; const group = new THREE.Group();
      const mk = (g, m, sh = true) => { const me = new THREE.Mesh(g, m); me.castShadow = sh; me.receiveShadow = true; group.add(me); return me; };
      const body = mk(ty.body, pick(rng, this.paints)); mk(ty.glass, glassM); mk(ty.wheels, tire); mk(ty.front, head, false); const rear = mk(ty.rear, this.tail[0], false);
      scene.add(group);
      let e, s, tries = 0;
      do { e = pick(rng, this.edges); s = rng() * e.len; tries++; } while (tries < 30 && this.cars.some((c) => c.edge === e && Math.abs(c.s - s) < 10));
      this.cars.push({ edge: e, s, mode: 'edge', turn: null, tt: 0, v: 0, cruise: 8 + rng() * 3.5, x: 0, z: 0, yaw: e.yaw, fear: 0, yankee: false, forceBrake: 0, ghost: 0, blocked: 0, hitCool: 0, sayCool: 0, half: ty.half, group, body, rear, Override_Brake: false });
    }
  }

  // ---------- 信号機の破壊 ----------
  damageLights(x, z, r, dmg) {
    let hit = false;
    for (const L of this.lights) {
      if (!L.alive || Math.hypot(L.x - x, L.z - z) > r) continue;
      hit = true; L.hp -= dmg; L.shake = 0.4; this.G.fx.sparks(L.x, 1.6, L.z, 10, [3, 2.4, 1], 4, 0.4, 0.06);
      if (L.hp <= 0) this.destroyLight(L);
    }
    return hit;
  }
  destroyLight(L) {
    if (!L.alive) return; const G = this.G, fx = G.fx; L.alive = false; G.scene.remove(L.group);
    // 破砕（Fracture）エフェクト
    fx.debris(L.x, 2.5, L.z, 16, 0x6d7275, 6, 0.42); fx.debris(L.x, 5.5, L.z, 10, 0x2a2d30, 7, 0.35);
    fx.sparks(L.x, 5.4, L.z, 70, [3, 2.5, 1.2], 9, 1.0, 0.09, 12); fx.sparks(L.x, 1, L.z, 30, [1.5, 2.2, 3], 6, 0.6, 0.07, 10);
    fx.puff(L.x, 1.5, L.z, 12, [0.5, 0.5, 0.5], 1.4, 1.4, 2.2, 1.2, 0.5);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 8), this.poleMat); stump.position.set(L.x, CFG.CURB + 0.4, L.z); stump.rotation.set(0.25, 0, 0.3); stump.castShadow = true; G.scene.add(stump);
    const v = clamp(1.2 - Math.hypot(L.x - G.player.pos.x, L.z - G.player.pos.z) / 60, 0, 1); G.audio.play('crash', v); G.audio.play('glass', v);
    const mgr = L.node.mgr;
    if (mgr.bIsRegulated) { // Traffic_Manager.bIsRegulated = false
      mgr.bIsRegulated = false; G.stats.lights++;
      G.ui.toast('信号機を破壊！ この交差点の交通ルールは崩壊した', 'shura'); G.onLightDestroyed?.(L);
    }
  }

  // ---------- Skill_YankeeWalk ----------
  // 前方 Cone 内に接近するビークルAIへ Force_Brake を送信し、睨みつけ Raycast で運転手へ恐怖ダメージ
  yankeeWalk(px, pz, yaw, dt) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw); let nearest = null, nd = 1e9, braked = 0;
    for (const c of this.cars) {
      const rx = c.x - px, rz = c.z - pz, d = Math.hypot(rx, rz); if (d > 30 || d < 0.4) continue;
      if ((rx * fx + rz * fz) / d < 0.62) continue; // Cone（約±52°）
      if (-(rx * Math.sin(c.yaw) + rz * Math.cos(c.yaw)) / d < 0.2) continue; // こちらへ接近している車のみ
      if (c.v > 2 && c.forceBrake <= 0) this.G.audio.play('screech', clamp(1.2 - d / 30, 0, 1));
      c.forceBrake = 0.4; braked++;
      if (d < nd) { nd = d; nearest = c; }
    }
    if (nearest && !nearest.yankee) {
      nearest.fear += 15 * dt;
      if (nearest.sayCool <= 0) { nearest.sayCool = 3; this.G.ui.bubble({ x: nearest.x, y: 1.9, z: nearest.z, sc: 1, on: true }, pick(this.rng, DRIVER_LINES), 1.6, 'clean'); }
      if (nearest.fear >= 100) this.yankeeCar(nearest);
    }
    return { braked, target: nearest };
  }
  yankeeCar(c) {
    if (c.yankee) return; const G = this.G; c.yankee = true; c.body.material = this.rng() < 0.6 ? this.yankPaint : this.yankPaint2; G.stats.cars++;
    G.fx.sparks(c.x, 1.4, c.z, 40, [3, 2.2, 0.6], 6, 0.9, 0.1, 6); G.audio.play('horn'); G.audio.play('yankee');
    G.ui.toast('運転手がヤンキー化！ 族車が誕生した', 'shura');
  }

  beginTurn(c) {
    const e = c.edge, node = e.to; let outs = node.out.filter((o) => o.to !== e.from); if (!outs.length) outs = node.out;
    const nx = pick(this.rng, outs); const x0 = e.ex, z0 = e.ez, x2 = nx.sx, z2 = nx.sz; let x1, z1;
    if (nx.dx === e.dx && nx.dz === e.dz) { x1 = (x0 + x2) / 2; z1 = (z0 + z2) / 2; } else { const a = (x2 - x0) * e.dx + (z2 - z0) * e.dz; x1 = x0 + e.dx * a; z1 = z0 + e.dz * a; }
    let len = 0, px = x0, pz = z0;
    for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t, x = u * u * x0 + 2 * u * t * x1 + t * t * x2, z = u * u * z0 + 2 * u * t * z1 + t * t * z2; len += Math.hypot(x - px, z - pz); px = x; pz = z; }
    c.turn = { x0, z0, x1, z1, x2, z2, len, next: nx, node }; c.mode = 'turn'; c.tt = 0;
  }

  updateCar(c, dt) {
    const G = this.G, P = G.player, npcs = G.npcs; let x, z, yaw;
    if (c.mode === 'edge') { const e = c.edge, t = c.s / e.len; x = e.sx + (e.ex - e.sx) * t; z = e.sz + (e.ez - e.sz) * t; yaw = e.yaw; } else {
      const T = c.turn, t = clamp(c.tt, 0, 1), u = 1 - t; x = u * u * T.x0 + 2 * u * t * T.x1 + t * t * T.x2; z = u * u * T.z0 + 2 * u * t * T.z1 + t * t * T.z2;
      yaw = Math.atan2(2 * u * (T.x1 - T.x0) + 2 * t * (T.x2 - T.x1), 2 * u * (T.z1 - T.z0) + 2 * t * (T.z2 - T.z1));
    }
    c.x = x; c.z = z; c.yaw = yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    let stop = Infinity, byVehicle = false;
    // 信号（Traffic_Manager.bIsRegulated が true の間のみ従う）
    if (c.mode === 'edge' && c.edge.to.signaled && c.edge.to.mgr.bIsRegulated && !c.yankee) {
      const rem = c.edge.len - c.s, st = c.edge.to.mgr.state(c.edge.axis);
      if (st === 'red' || (st === 'yellow' && rem > 7)) stop = rem - 0.3;
    }
    // Override_Brake：信号が破壊された交差点では横断者への停止処理（前方衝突予測）を無視
    let override = c.yankee;
    if (!override) {
      const nn = c.mode === 'turn' ? c.turn.node : c.s > c.edge.len - 28 ? c.edge.to : c.s < 16 ? c.edge.from : null;
      if (nn && nn.signaled && !nn.mgr.bIsRegulated) override = true;
    }
    c.Override_Brake = override;
    const look = 5 + c.v * 1.4;
    if (c.ghost <= 0) {
      for (const o of this.cars) {
        if (o === c) continue; const rx = o.x - x, rz = o.z - z, f = rx * fx + rz * fz; if (f < 1 || f > look + 4) continue;
        if (Math.abs(rx * lx + rz * lz) < 1.8) { stop = Math.min(stop, f - c.half - o.half - 1.6); byVehicle = true; }
      }
      for (const o of G.vehicles.list) {
        const rx = o.x - x, rz = o.z - z, f = rx * fx + rz * fz; if (f < 1 || f > look + 6) continue;
        if (Math.abs(rx * lx + rz * lz) < o.P.wid / 2 + 1.1) { stop = Math.min(stop, f - c.half - o.P.len / 2 - 1.5); byVehicle = true; }
      }
    }
    // 前方の横断者に対する Raycast 相当（コリドー判定）
    if (!override) {
      for (const n of npcs.list) {
        if (!n.on) continue; const rx = n.x - x, rz = n.z - z; if (rx > 32 || rx < -32 || rz > 32 || rz < -32) continue;
        const f = rx * fx + rz * fz; if (f < 0.5 || f > look) continue;
        if (Math.abs(rx * lx + rz * lz) < 1.7) stop = Math.min(stop, f - c.half - 1.2);
      }
    }
    if ((!override || c.yankee) && P.mode !== 'vehicle' && P.pos.y < 2.5) {
      const rx = P.pos.x - x, rz = P.pos.z - z, f = rx * fx + rz * fz;
      if (f > 0.5 && f < look && Math.abs(rx * lx + rz * lz) < 1.7) stop = Math.min(stop, f - c.half - 1.2);
    }
    let brake = 8;
    if (c.forceBrake > 0) { c.forceBrake -= dt; stop = 0; brake = 26; } // Force_Brake
    let target = c.yankee ? c.cruise * 1.3 : c.cruise;
    if (c.mode === 'turn') target = Math.min(target, 5.5); else if (c.edge.len - c.s < 9) target = Math.min(target, 7);
    if (stop < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 10 * stop)));
    const braking = c.v > target + 0.05;
    c.v = braking ? Math.max(target, c.v - brake * dt) : Math.min(target, c.v + 3 * dt);
    c.rear.material = this.tail[braking || c.v < 0.3 ? 1 : 0];
    if (c.v < 0.2 && byVehicle && c.forceBrake <= 0) { c.blocked += dt; if (c.blocked > 5) { c.ghost = 3; c.blocked = 0; G.audio.play('horn', clamp(1.1 - Math.hypot(x - P.pos.x, z - P.pos.z) / 50, 0, 1)); } } else c.blocked = 0;
    if (c.ghost > 0) c.ghost -= dt; if (c.hitCool > 0) c.hitCool -= dt; if (c.sayCool > 0) c.sayCool -= dt;
    if (c.fear > 0 && !c.yankee) c.fear = Math.max(0, c.fear - 2 * dt);
    const ds = c.v * dt;
    if (c.mode === 'edge') { c.s += ds; if (c.s >= c.edge.len) this.beginTurn(c); } else { c.tt += ds / c.turn.len; if (c.tt >= 1) { c.mode = 'edge'; c.edge = c.turn.next; c.s = 0; c.turn = null; } }
    // 交通ルール崩壊時：歩行者をはね飛ばす
    if (c.v > 2.5) {
      for (const n of npcs.list) {
        if (!n.on || n.rag > 0 || n.held) continue; const rx = n.x - x, rz = n.z - z; if (rx > 4 || rx < -4 || rz > 4 || rz < -4) continue;
        const f = rx * fx + rz * fz, l = rx * lx + rz * lz; if (f < -c.half || f > c.half + 0.3 || Math.abs(l) > 1.08) continue;
        const side = l >= 0 ? 1 : -1; npcs.knock(n, fx * c.v * 0.75 + lx * side * 2.5, fz * c.v * 0.75 + lz * side * 2.5, c.v, 4);
        if (n.state !== 'Yankee') npcs.addInfection(n, 30, { cause: 'traffic' });
        G.audio.play('hit', npcs.vol(n)); G.fx.puff(n.x, 1, n.z, 4, [0.6, 0.6, 0.6], 0.6, 0.5, 1, 0.5, 0.4);
      }
      if (P.mode !== 'vehicle' && P.pos.y < 1.6 && c.hitCool <= 0) {
        const rx = P.pos.x - x, rz = P.pos.z - z, f = rx * fx + rz * fz, l = rx * lx + rz * lz;
        if (f > -c.half && f < c.half + 0.4 && Math.abs(l) < 1.1) { c.hitCool = 1.5; P.hitByCar(fx * c.v, fz * c.v, c.v); }
      }
    }
    c.group.position.set(x, 0, z); c.group.rotation.y = yaw;
  }

  update(dt) {
    for (const n of this.G.world.nodes) n.mgr.t += dt;
    for (const L of this.lights) {
      if (!L.alive) continue; const st = L.node.mgr.state(L.axis);
      if (st !== L.shown) { L.shown = st; for (const k of ['green', 'yellow', 'red']) L.lamps[k].material = this.lampMat[k][st === k ? 1 : 0]; }
      if (L.shake > 0) { L.shake -= dt; L.group.rotation.z = Math.sin(L.shake * 60) * 0.03 * L.shake; }
    }
    for (const c of this.cars) this.updateCar(c, dt);
  }
}
