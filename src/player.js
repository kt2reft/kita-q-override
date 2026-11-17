// プレイヤー：移動、2.1 武器・アクション、強制給餌テイクダウン、パラグライダー、3.2 ヤンキー横断、カメラ
import * as THREE from 'three';
import { CFG, PAINT_COLORS } from './config.js';
import { clamp, damp, lerp, angDiff, turnToward } from './utils.js';
import { makeMats, makePose, applyAnim, applyUpper, computeMatrices, makeGeoms } from './humanoid.js';

export const WEAPONS = [
  { id: 'none', name: '素手', key: 'Q' }, { id: 'spray', name: '洗脳スプレー', key: '1' }, { id: 'goboten', name: 'ごぼ天ソード', key: '2' },
  { id: 'paint', name: 'ペイントガン', key: '3' }, { id: 'rocket', name: 'ロケラン', key: '4' }, { id: 'bokuto', name: '木刀', key: '5' },
];
const std = (o) => new THREE.MeshStandardMaterial(o);
const PAINT_KEYS = Object.keys(PAINT_COLORS);

class PlayerModel {
  constructor(G) {
    const scene = G.scene, geo = makeGeoms(true), T = G.T; this.parts = [];
    const coat = std({ color: 0x3d1466, roughness: 0.68 }), coatDS = std({ color: 0x3d1466, roughness: 0.68, side: THREE.DoubleSide }), pants = std({ color: 0x2a0e49, roughness: 0.75 });
    const skin = std({ color: 0xe8b991, roughness: 0.55 }), face = std({ color: 0xe8b991, roughness: 0.55, map: T.face }), hair = std({ color: 0x120e0b, roughness: 0.32 }), sandal = std({ color: 0xe8e2d2, roughness: 0.7 });
    const add = (g, m, part) => { const me = new THREE.Mesh(g, m); me.matrixAutoUpdate = false; me.castShadow = true; me.receiveShadow = true; me.frustumCulled = false; scene.add(me); this.parts.push({ me, part }); return me; };
    add(geo.hips, pants, 0); add(geo.torso, coat, 1); add(geo.head, face, 2); add(geo.hair, hair, 2); add(geo.regent, hair, 2);
    add(geo.uarm, coat, 3); add(geo.uarm, coat, 4); add(geo.farm, coat, 5); add(geo.farm, coat, 6); add(geo.hand, skin, 7); add(geo.hand, skin, 8);
    add(geo.thigh, pants, 9); add(geo.thigh, pants, 10); add(geo.shin, pants, 11); add(geo.shin, pants, 12); add(geo.foot, sandal, 13); add(geo.foot, sandal, 14);
    // 特攻服の裾と背中の刺繍
    add(new THREE.LatheGeometry([new THREE.Vector2(0.19, 0.08), new THREE.Vector2(0.23, -0.25), new THREE.Vector2(0.275, -0.56)], 16, 0.5, Math.PI * 2 - 1.0).scale(1, 1, 0.72), coatDS, 0);
    add(new THREE.PlaneGeometry(0.3, 0.42).rotateY(Math.PI).translate(0, 0.3, -0.136), std({ map: T.coatBack, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1).castShadow = false;
    add(new THREE.BoxGeometry(0.36, 0.1, 0.25).translate(0, 0.12, 0), std({ color: 0xf0ece2, roughness: 0.9 }), 1); // さらし
    // ---- 武器（右手にアタッチ）----
    const wg = (build) => { const g = new THREE.Group(); g.matrixAutoUpdate = false; build(g); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); g.visible = false; scene.add(g); return g; };
    const mesh = (g, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); return me; };
    const gold = std({ color: 0xe0b23a, metalness: 0.9, roughness: 0.3 });
    this.weapons = {
      goboten: wg((g) => { // ごぼ天：巨大なごぼう天ぷら
        const gg = new THREE.CapsuleGeometry(0.078, 1.5, 6, 16); const a = gg.attributes.position;
        for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); const n = 1 + 0.2 * Math.sin(x * 46 + y * 9) * Math.sin(z * 43 + y * 11) + 0.08 * Math.sin(y * 31); a.setXYZ(i, x * n, y, z * n); }
        gg.computeVertexNormals(); gg.rotateX(Math.PI / 2);
        g.add(mesh(gg, std({ map: T.tempura.map, normalMap: T.tempura.normalMap, roughness: 0.62 }), 0, -0.05, 0.92));
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10).rotateX(Math.PI / 2), std({ color: 0xf0ece2, roughness: 0.9 }), 0, -0.05, 0.06));
      }),
      bokuto: wg((g) => g.add(mesh(new THREE.BoxGeometry(0.036, 0.05, 1.12), std({ color: 0x5f3d24, roughness: 0.5 }), 0, -0.05, 0.47))),
      spray: wg((g) => { g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.2, 12), std({ color: 0x7a2bbf, roughness: 0.3, metalness: 0.7 }), 0, -0.1, 0.03)); g.add(mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.05, 8), std({ color: 0xf2f2f2 }), 0, -0.22, 0.03)); }),
      paint: wg((g) => { g.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.07), std({ color: 0x1d1f22, roughness: 0.4, metalness: 0.6 }), 0, -0.2, 0.03)); g.add(mesh(new THREE.SphereGeometry(0.075, 12, 8), std({ color: 0xff4fa3, roughness: 0.3 }), 0, -0.13, 0.11)); g.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.12), gold, 0, -0.34, 0.03)); }),
      rocket: wg((g) => { g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 14), std({ color: 0x2f4a2a, roughness: 0.5, metalness: 0.4 }), 0, -0.22, 0.02)); g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 14), gold, 0, -0.66, 0.02)); g.add(mesh(new THREE.ConeGeometry(0.07, 0.16, 12).rotateX(Math.PI), std({ color: 0xc8261f, roughness: 0.4 }), 0, -0.76, 0.02)); }),
    };
    // ---- パラグライダー ----
    const gl = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2.3, 28, 1, true, Math.PI - 0.72, 1.44).rotateX(Math.PI / 2).translate(0, -0.55, 0), std({ color: 0xf2b705, side: THREE.DoubleSide, roughness: 0.55 }));
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(4.03, 4.03, 0.6, 28, 1, true, Math.PI - 0.72, 1.44).rotateX(Math.PI / 2).translate(0, -0.55, 0), std({ color: 0x5b1a8f, side: THREE.DoubleSide, roughness: 0.55 }));
    canopy.castShadow = true; gl.add(canopy, stripe);
    const lp = []; for (const s of [-1, 1]) for (const [x, y] of [[2.64, 2.46], [1.9, 2.96], [1.0, 3.32]]) for (const z of [-1.1, 1.1]) lp.push(s * 0.42, 1.98, 0.05, s * x, y, z);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); gl.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 })));
    gl.visible = false; scene.add(gl); this.glider = gl;
  }
  update(mats, visible, weaponId) {
    for (const p of this.parts) { p.me.visible = visible; if (visible) { p.me.matrix.copy(mats[p.part]); p.me.matrixWorldNeedsUpdate = true; } }
    for (const k in this.weapons) { const w = this.weapons[k]; w.visible = visible && k === weaponId; if (w.visible) { w.matrix.copy(mats[8]); w.matrixWorldNeedsUpdate = true; } }
  }
}

class Projectiles {
  constructor(G) {
    this.G = G; this.cap = 48; this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), std({ roughness: 0.3, metalness: 0.2 }), this.cap); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    const z = new THREE.Matrix4().makeScale(0, 0, 0), w = new THREE.Color(1, 1, 1); for (let i = 0; i < this.cap; i++) { this.mesh.setMatrixAt(i, z); this.mesh.setColorAt(i, w); this.list.push({ on: false, id: i }); }
    G.scene.add(this.mesh); this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }
  fire(kind, x, y, z, dx, dy, dz, speed, key) {
    const p = this.list.find((k) => !k.on); if (!p) return;
    Object.assign(p, { on: true, kind, x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 3, key, trail: 0 });
    this.mesh.setColorAt(p.id, kind === 'paint' ? this._c.setHex(PAINT_COLORS[key].hex) : this._c.setRGB(1, 0.25, 0.1)); this.mesh.instanceColor.needsUpdate = true;
  }
  explode(x, y, z) { // ロケラン（ロケット花火）着弾
    const G = this.G, fx = G.fx, P = G.player;
    fx.burst(x, y + 0.5, z, [1, 0.75, 0.2], 80, 12); fx.burst(x, y + 0.5, z, [1, 0.3, 0.6], 50, 8); fx.puff(x, y + 0.5, z, 18, [0.4, 0.38, 0.36], 2.5, 1.6, 4, 2, 0.6);
    const d = Math.hypot(x - P.pos.x, z - P.pos.z); G.audio.play('boom', clamp(1.3 - d / 70, 0, 1)); G.shake = Math.max(G.shake || 0, clamp(1 - d / 40, 0, 0.8));
    G.npcs.inRadius(x, z, 8.5, (n, nd) => {
      const k = 1 - nd / 9.5, dx = (n.x - x) / (nd || 1), dz = (n.z - z) / (nd || 1);
      if (n.state !== 'Yankee') G.npcs.addInfection(n, 70 * k, { cause: 'rocket' });
      G.npcs.knock(n, dx * 7 * k, dz * 7 * k, 8 * k, 3);
    });
    G.traffic.damageLights(x, z, 7.5, 100);
    for (const c of G.traffic.cars) if (Math.hypot(c.x - x, c.z - z) < 9) { c.fear += 60; c.forceBrake = 2; if (c.fear >= 100) G.traffic.yankeeCar(c); }
    G.npcs.alarm(x, z, 24, 0.4);
  }
  update(dt) {
    const G = this.G, W = G.world; let any = false;
    for (const p of this.list) {
      if (!p.on) continue; any = true;
      p.life -= dt; p.vy -= (p.kind === 'paint' ? 7 : 2.5) * dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz), len = sp * dt, dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
      let t = W.raycast(p.x, p.y, p.z, dx, dy, dz, len), hitN = null;
      for (const n of G.npcs.list) { // 線分 vs NPC カプセル
        if (!n.on || n.held) continue; const rx = n.x - p.x, rz = n.z - p.z; if (rx > 3 || rx < -3 || rz > 3 || rz < -3) continue;
        const hl = Math.hypot(dx, dz) || 1e-6; let u = clamp((rx * dx + rz * dz) / (hl * hl), 0, t);
        const qx = p.x + dx * u, qy = p.y + dy * u, qz = p.z + dz * u; const top = n.rag > 0 ? 0.7 : 1.95 * n.sc;
        if (Math.hypot(n.x - qx, n.z - qz) < 0.5 && qy > n.y - 0.15 && qy < n.y + top) { t = u; hitN = n; }
      }
      const hit = hitN || t < len - 1e-5;
      p.x += dx * t; p.y += dy * t; p.z += dz * t;
      if (p.kind === 'rocket') G.fx.add.emit(p.x, p.y, p.z, 0, 0.5, 0, 3, 1.6, 0.5, 1, 0.3, 0.05, 0.4, 0, 1);
      if (hit || p.life <= 0) {
        p.on = false; this.mesh.setMatrixAt(p.id, this._m.makeScale(0, 0, 0));
        if (p.kind === 'paint') {
          if (hitN) G.npcs.paint(hitN, p.key); else if (hit) { const c = this._c.setHex(PAINT_COLORS[p.key].hex); G.fx.paint(p.x, p.y, p.z, [c.r, c.g, c.b]); G.audio.play('splat', clamp(1 - Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z) / 40, 0, 0.6)); }
        } else this.explode(p.x, p.y, p.z);
        continue;
      }
      const s = p.kind === 'paint' ? 0.09 : 0.13; this._m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); this.mesh.setMatrixAt(p.id, this._m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Player {
  constructor(G) {
    this.G = G; const s = G.world.spawn;
    this.pos = new THREE.Vector3(s.x, CFG.CURB, s.z); this.vel = new THREE.Vector3(); this.yaw = s.yaw; this.moveYaw = s.yaw; this.roll = 0;
    this.onGround = true; this.mode = 'foot'; this.vehicle = null; this.speed = 0; this.phase = 0; this.t = 0; this.gs = 0;
    this.hp = 100; this.spray = 100; this.weapon = 1; this.inv = { cup: 1, rockets: 0, bokuto: 0, paint: false };
    this.walkMode = false; this.squat = false; this.swingT = -1; this.swingHit = false; this.fireCool = 0; this.aimT = 0; this.spraying = false; this.invuln = 0; this.td = null; this.downT = 0;
    this.yankeeWalk = false; this.glare = null; this.braked = 0; this.alarmT = 0; this.interact = null; this.hurtFlash = 0;
    this.camYaw = s.yaw; this.camPitch = 0.2; this.camD = 4.4; this.camT = new THREE.Vector3(s.x, 1.6, s.z);
    this.mats = makeMats(); this.pose = makePose(); this.hand = new THREE.Vector3(); this.aim = new THREE.Vector3(0, 0, 1); this.aimPoint = new THREE.Vector3();
    this.model = new PlayerModel(G); this.shots = new Projectiles(G);
  }
  get wid() { return WEAPONS[this.weapon].id; }
  setWeapon(i) {
    const id = WEAPONS[i].id, G = this.G;
    if (id === 'paint' && !this.inv.paint) return G.ui.toast('ペイントガンは MQ_05 フェーズ2で支給される', 'info');
    if (id === 'rocket' && this.inv.rockets <= 0) return G.ui.toast('ロケラン弾がない（修羅ゾーンで拾いやすい）', 'info');
    if (id === 'bokuto' && this.inv.bokuto <= 0) return G.ui.toast('木刀を持っていない（修羅ゾーンで拾いやすい）', 'info');
    if (this.weapon !== i) { this.weapon = i; this.swingT = -1; G.audio.play('ui'); }
  }
  damage(amount, by) {
    if (this.invuln > 0 || this.mode === 'vehicle' || this.mode === 'down' || this.G.mission.cutscene) return;
    this.hp -= amount; this.hurtFlash = 0.5; this.G.audio.play('hurt'); if (this.hp <= 0) this.goDown();
  }
  hitByCar(vx, vz, v) {
    if (this.invuln > 0 || this.mode === 'down' || this.mode === 'takedown') return; const G = this.G;
    this.damage(18 + v, null); this.invuln = 1.4; this.vel.x = vx * 0.7; this.vel.z = vz * 0.7; this.vel.y = 5; this.onGround = false; G.shake = 0.8; G.audio.play('hit'); G.audio.play('horn', 0.7);
  }
  goDown() { const G = this.G; this.hp = 0; this.mode = 'down'; this.downT = 0; if (this.td) { this.td.n.held = false; this.td = null; } G.ui.banner('補導された…', '気合が尽きた', 2.4, 'bad'); G.audio.sprayOn(false); }

  // ---------- 入力ごとの更新 ----------
  update(dt) {
    const G = this.G, I = G.input; this.t += dt;
    if (this.invuln > 0) this.invuln -= dt; if (this.fireCool > 0) this.fireCool -= dt; if (this.aimT > 0) this.aimT -= dt; if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.camYaw -= I.dx * 0.0024 + ((I.down('ArrowRight') ? 1 : 0) - (I.down('ArrowLeft') ? 1 : 0)) * 1.9 * dt;
    this.camPitch = clamp(this.camPitch + I.dy * 0.0022 + ((I.down('ArrowDown') ? 1 : 0) - (I.down('ArrowUp') ? 1 : 0)) * 1.2 * dt, -0.45, 1.25);
    this.interact = null; this.spraying = false;
    if (!G.mission.cutscene) {
      if (this.mode === 'foot') this.updFoot(dt, I); else if (this.mode === 'glide') this.updGlide(dt, I); else if (this.mode === 'vehicle') this.updVehicle(dt, I);
      else if (this.mode === 'takedown') this.updTakedown(dt); else if (this.mode === 'down') this.updDown(dt);
    }
    G.audio.sprayOn(this.spraying);
    if (!this.spraying) this.spray = Math.min(100, this.spray + 11 * dt);
    if (this.mode !== 'vehicle') G.audio.engine(false);
    this.shots.update(dt);
    this.updModel(dt);
  }
  moveAndCollide(dt) {
    const W = this.G.world, p = this.pos;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt; p.y += this.vel.y * dt;
    const hit = W.resolveCircle(p, 0.38, p.y);
    p.x = clamp(p.x, -CFG.LIMIT, CFG.LIMIT); p.z = clamp(p.z, -CFG.LIMIT, CFG.LIMIT);
    const g = W.groundAt(p.x, p.z, p.y);
    if (p.y <= g) { if (!this.onGround && this.vel.y < -13) { this.G.shake = 0.4; this.G.fx.puff(p.x, g + 0.2, p.z, 8, [0.6, 0.58, 0.55], 1, 0.7, 1.5, 0.4, 0.4); } p.y = g; this.vel.y = 0; this.onGround = true; }
    else if (this.onGround && p.y - g < 0.35 && this.vel.y <= 0) { p.y = g; this.vel.y = 0; } else this.onGround = false;
    return hit;
  }
  aimUpdate() { // カメラ中心のレイから照準点を求める
    const G = this.G, cam = G.camera, d = this.aim; cam.getWorldDirection(d);
    const t = G.world.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 70);
    this.aimPoint.copy(cam.position).addScaledVector(d, Math.max(t, this.camD + 3));
  }
  muzzleDir(out) { out.copy(this.aimPoint).sub(this.hand); const l = out.length() || 1; return out.multiplyScalar(1 / l); }

  updFoot(dt, I) {
    const G = this.G, p = this.pos;
    if (I.hit('Digit1')) this.setWeapon(1); if (I.hit('Digit2')) this.setWeapon(2); if (I.hit('Digit3')) this.setWeapon(3); if (I.hit('Digit4')) this.setWeapon(4); if (I.hit('Digit5')) this.setWeapon(5); if (I.hit('KeyQ')) this.setWeapon(0);
    if (I.hit('KeyC')) { this.walkMode = !this.walkMode; G.ui.toast(this.walkMode ? '歩きモード：肩で風を切る' : '走りモード', 'info'); }
    if (I.hit('KeyG')) this.squat = !this.squat;
    const mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0), mz = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0), moving = mx !== 0 || mz !== 0;
    if (moving) this.squat = false;
    const cy = this.camYaw; let dx = Math.sin(cy) * mz - Math.cos(cy) * mx, dz = Math.cos(cy) * mz + Math.sin(cy) * mx; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const sprint = I.down('ShiftLeft') || I.down('ShiftRight');
    const max = this.walkMode ? 1.75 : sprint ? 7.6 : 4.6, acc = this.onGround ? 13 : 2.5;
    this.vel.x = damp(this.vel.x, moving ? dx * max : 0, acc, dt); this.vel.z = damp(this.vel.z, moving ? dz * max : 0, acc, dt);
    if (this.onGround && I.hit('Space')) { this.vel.y = 5.7; this.onGround = false; G.audio.play('jump'); }
    else if (!this.onGround && I.hit('Space') && p.y - G.world.groundAt(p.x, p.z, p.y) > 3 && this.vel.y < 1) { // パラグライダー展開
      this.mode = 'glide'; this.gs = Math.max(6, Math.hypot(this.vel.x, this.vel.z)); this.swingT = -1; G.audio.play('glider'); this.camYaw = this.yaw; return;
    }
    this.vel.y -= 18 * dt;
    this.moveAndCollide(dt);
    const hs = Math.hypot(this.vel.x, this.vel.z); this.speed = hs; if (hs > 0.5) this.moveYaw = Math.atan2(this.vel.x, this.vel.z);
    this.aimUpdate();
    // ---- 武器 ----
    const w = this.wid; let facingCam = this.aimT > 0;
    if (this.swingT >= 0) {
      this.swingT += dt / (w === 'bokuto' ? 0.34 : 0.52); facingCam = true;
      if (!this.swingHit && this.swingT >= 0.48) { this.swingHit = true; this.meleeHit(w); }
      if (this.swingT >= 1) this.swingT = -1;
    } else if ((w === 'goboten' || w === 'bokuto') && I.click) { this.swingT = 0; this.swingHit = false; G.audio.play('swing'); facingCam = true; }
    else if (w === 'spray' && I.mouse) { facingCam = true; if (this.spray > 1) { this.spraying = true; this.doSpray(dt); } }
    else if (w === 'paint' && I.mouse) { facingCam = true; this.aimT = 0.4; if (this.fireCool <= 0) this.firePaint(); }
    else if (w === 'rocket' && I.click && this.fireCool <= 0) { this.aimT = 0.6; this.fireRocket(); }
    if (I.hit('KeyF')) this.tryTakedown();
    if (this.mode !== 'foot') return;
    if (facingCam) this.yaw = turnToward(this.yaw, this.camYaw, 16 * dt); else if (moving) this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), 11 * dt);
    // ---- 3.2 Skill_YankeeWalk：武器を構えず、歩き状態のときのパッシブ ----
    this.yankeeWalk = w === 'none' && this.onGround && hs <= 2.0;
    if (this.yankeeWalk) { const r = G.traffic.yankeeWalk(p.x, p.z, this.yaw, dt); this.glare = r.target; this.braked = r.braked; } else { this.glare = null; this.braked = 0; }
    // ---- インタラクト ----
    this.interact = this.findInteract();
    if (this.interact && this.interact.fn && I.hit('KeyE')) this.interact.fn();
  }
  findInteract() {
    const G = this.G, p = this.pos, W = G.world;
    const mi = G.mission.interact(p); if (mi) return mi;
    const v = G.vehicles.nearest(p.x, p.z, 1.9); if (v && this.onGround) return { text: `<b>E</b> ${v.P.name}に乗る`, fn: () => this.enter(v) };
    for (const c of G.facilities.cafes) {
      if (c.bIsKakuuchi || Math.hypot(p.x - c.doorX, p.z - c.doorZ) > 3.6) continue;
      return this.inv.cup > 0 ? { text: '<b>E</b> カップ酒を供えて「角打ち」にオーバーライド', fn: () => { this.inv.cup--; c.overrideToKakuuchi('item'); } } : { text: 'カップ酒が必要（街で拾う）— またはダンプで突っ込め', fn: null };
    }
    const el = W.tower.elevator; if (Math.hypot(p.x - el.x, p.z - el.z) < 3.2 && p.y < 3) return { text: '<b>E</b> エレベーターで屋上へ（パラグライダー発進点）', fn: () => G.mission.rideElevator() };
    return null;
  }
  doSpray(dt) { // 洗脳スプレー：命中中は Infection_Meter を加算
    const G = this.G, h = this.hand, d = this.muzzleDir(_v1); this.spray -= 15 * dt;
    G.fx.mist(h.x, h.y, h.z, d.x, d.y, d.z, [0.85, 0.35, 1.0]);
    let any = false;
    G.npcs.inRadius(this.pos.x, this.pos.z, 8, (n) => {
      if (n.state === 'Yankee' || n.held) return; const rx = n.x - h.x, ry = n.y + 1.15 - h.y, rz = n.z - h.z, dd = Math.hypot(rx, ry, rz) || 1;
      if (dd > 7.5 || ((rx * d.x + ry * d.y + rz * d.z) / dd < 0.9 && dd > 1.3)) return;
      any = true; G.npcs.addInfection(n, CFG.SPRAY_RATE * dt * (1.1 - dd / 12), { cause: 'spray' });
    });
    for (const c of G.traffic.cars) { const rx = c.x - h.x, rz = c.z - h.z, dd = Math.hypot(rx, rz); if (dd < 7 && (rx * d.x + rz * d.z) / dd > 0.85 && !c.yankee) { c.fear += 34 * dt; if (c.fear >= 100) G.traffic.yankeeCar(c); } }
    this.alarmT -= dt; if (any && this.alarmT <= 0) { this.alarmT = 0.9; G.npcs.alarm(this.pos.x, this.pos.z, 11, 0.28); }
  }
  meleeHit(w) { // ごぼ天ソード：長大な Capsule Collider、先端ほど Knockback(Impulse) が高い
    const G = this.G, p = this.pos, gob = w === 'goboten', reach = gob ? 3.3 : 2.0, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); let any = false;
    G.npcs.inRadius(p.x, p.z, reach + 0.4, (n, d) => {
      if (n.held || d < 0.01) return; const rx = (n.x - p.x) / d, rz = (n.z - p.z) / d; if (rx * fx + rz * fz < 0.3 && d > 0.9) return;
      any = true; const tip = clamp(d / reach, 0, 1), impulse = gob ? lerp(2.5, 11.5, tip * tip) : 3.2;
      if (n.state !== 'Yankee') G.npcs.addInfection(n, gob ? CFG.GOBOTEN_HIT : CFG.BOKUTO_HIT, { cause: w });
      if (impulse > 7.5) G.npcs.knock(n, rx * impulse, rz * impulse, impulse, n.state === 'Yankee' ? 1.6 : 2.4); else G.npcs.stagger(n, rx * impulse, rz * impulse);
      G.fx.sparks(n.x, n.y + 1.2, n.z, 14, gob ? [3, 2, 0.6] : [2.5, 2.5, 2.5], 4 + impulse * 0.4, 0.5, 0.07, 9);
    });
    const hx = p.x + fx * reach * 0.55, hz = p.z + fz * reach * 0.55;
    if (G.traffic.damageLights(hx, hz, reach * 0.62, gob ? 30 : 22)) any = true;
    for (const c of G.traffic.cars) if (Math.hypot(c.x - hx, c.z - hz) < reach * 0.6 + 1.2) { any = true; c.fear += 28; c.forceBrake = 1; G.fx.sparks(c.x, 1.2, c.z, 12, [3, 2.4, 1.4], 5, 0.4, 0.07); if (c.fear >= 100) G.traffic.yankeeCar(c); }
    if (any) { G.audio.play('hit'); G.shake = Math.max(G.shake || 0, 0.25); G.npcs.alarm(p.x, p.z, 12, 0.32); if (!gob && --this.inv.bokuto <= 0) { G.ui.toast('木刀が折れた', 'info'); this.setWeapon(2); } }
  }
  firePaint() { // MQ_05 ギミック武器 Weapon_PaintGun
    const d = this.muzzleDir(_v1), h = this.hand; this.fireCool = 0.15;
    this.shots.fire('paint', h.x + d.x * 0.3, h.y + d.y * 0.3 + 0.05, h.z + d.z * 0.3, d.x, d.y + 0.035, d.z, 44, PAINT_KEYS[Math.floor(Math.random() * PAINT_KEYS.length)]); this.G.audio.play('paint', 0.8);
  }
  fireRocket() {
    const d = this.muzzleDir(_v1), h = this.hand, G = this.G; this.fireCool = 0.9; this.inv.rockets--;
    this.shots.fire('rocket', h.x + d.x * 0.5, h.y + d.y * 0.5, h.z + d.z * 0.5, d.x, d.y + 0.02, d.z, 36, null); G.audio.play('launch'); G.shake = 0.3;
    G.fx.puff(h.x - d.x, h.y, h.z - d.z, 8, [0.8, 0.8, 0.8], 0.9, 0.7, 2, 0.5, 0.5);
    if (this.inv.rockets <= 0) { this.setWeapon(2); }
  }
  // ---------- 強制給餌テイクダウン ----------
  tryTakedown() {
    const G = this.G, p = this.pos, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); let best = null, bd = 2.6, low = false;
    G.npcs.inRadius(p.x, p.z, 2.6, (n, d) => {
      if (n.state === 'Yankee' || n.held || n.rag > 0) return; if (d > 0.6 && ((n.x - p.x) * fx + (n.z - p.z) * fz) / d < 0.1) return;
      if (n.inf < CFG.TAKEDOWN_MIN) { low = true; return; } if (d < bd) { bd = d; best = n; }
    });
    if (!best) { if (low) G.ui.toast('テイクダウンには Infection_Meter 50 以上が必要', 'info'); return; }
    // 発動：敵とプレイヤーの相対位置を固定（AttachToComponent 相当）
    this.weapon = 2; this.swingT = -1; this.mode = 'takedown'; this.vel.set(0, 0, 0); this.speed = 0;
    this.yaw = Math.atan2(best.x - p.x, best.z - p.z); this.td = { n: best, t: 0, crunch: 0.45 }; best.held = true; best.dance = 0; best.flee = 0; best.report = 0;
    G.audio.play('swing');
  }
  updTakedown(dt) {
    const G = this.G, td = this.td, n = td.n, p = this.pos; td.t += dt;
    n.x = p.x + Math.sin(this.yaw) * 1.32; n.z = p.z + Math.cos(this.yaw) * 1.32; n.y = G.world.baseHeight(n.x, n.z); n.yaw = this.yaw + Math.PI; n.anim = 'kneel';
    this.camYaw = turnToward(this.camYaw, this.yaw - 0.7, 2.5 * dt);
    td.crunch -= dt;
    if (td.crunch <= 0 && td.t < 2.0) { td.crunch = 0.3; G.audio.play('crunch'); G.fx.sparks(n.x, n.y + 1.05, n.z, 10, [3, 2.1, 0.7], 3, 0.5, 0.06, 9); G.shake = Math.max(G.shake || 0, 0.15); }
    if (td.t >= 2.25) { // Montage 終了：Infection_Meter を即座に 100、気絶（Ragdoll 10 秒）
      n.held = false; G.npcs.addInfection(n, 9999, { cause: 'takedown', ragdoll: CFG.RAGDOLL_TIME });
      this.mode = 'foot'; this.td = null; G.npcs.alarm(p.x, p.z, 14, 0.45);
    }
  }
  // ---------- パラグライダー ----------
  updGlide(dt, I) {
    const G = this.G, turn = (I.down('KeyA') ? 1 : 0) - (I.down('KeyD') ? 1 : 0), dive = I.down('KeyW'), flare = I.down('KeyS');
    this.yaw += turn * 1.3 * dt; this.roll = damp(this.roll, -turn * 0.38, 4, dt);
    this.gs = damp(this.gs, dive ? 15.5 : flare ? 7 : 11, 1.8, dt);
    this.vel.x = Math.sin(this.yaw) * this.gs; this.vel.z = Math.cos(this.yaw) * this.gs; this.vel.y = damp(this.vel.y, dive ? -5 : flare ? -0.9 : -1.9, 3, dt);
    this.camYaw = turnToward(this.camYaw, this.yaw, Math.abs(angDiff(this.camYaw, this.yaw)) * 2.5 * dt + 0.2 * dt);
    const hit = this.moveAndCollide(dt); if (hit) this.gs *= 0.6;
    this.speed = this.gs; this.moveYaw = this.yaw;
    if (this.onGround || I.hit('Space')) { this.mode = 'foot'; this.roll = 0; if (this.onGround) G.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, 6, [0.6, 0.58, 0.55], 0.9, 0.6, 1.5, 0.4, 0.4); }
  }
  // ---------- ビークル ----------
  enter(v) { this.mode = 'vehicle'; this.vehicle = v; v.driver = this; this.vel.set(0, 0, 0); this.squat = false; this.swingT = -1; this.camYaw = v.yaw; this.G.audio.play('ui'); this.G.ui.toast(v.type === 'daiko' ? '太鼓：クリック/F で衝撃波（半径20m・盆踊り5秒）／ドリフト注意' : 'ダンプ：オーガニックカフェに速度500以上で突っ込め', 'info'); }
  exit() {
    const v = this.vehicle; if (!v) return; const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    this.pos.set(v.x + lx * (v.P.wid / 2 + 0.9), v.y, v.z + lz * (v.P.wid / 2 + 0.9)); this.G.world.resolveCircle(this.pos, 0.4, 0.3);
    v.driver = null; v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = false; this.vehicle = null; this.mode = 'foot'; this.yaw = v.yaw; this.vel.set(0, 0, 0);
  }
  updVehicle(dt, I) {
    const G = this.G, v = this.vehicle;
    v.ctl.throttle = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0); v.ctl.steer = (I.down('KeyA') ? 1 : 0) - (I.down('KeyD') ? 1 : 0); v.ctl.handbrake = I.down('Space');
    this.pos.set(v.x, v.y + v.P.seatY, v.z); this.yaw = v.yaw; this.moveYaw = v.yaw; this.speed = v.speed;
    if (v.type === 'daiko' && (I.click || I.hit('KeyF'))) G.vehicles.daikoHit(v);
    if (I.hit('KeyH')) G.audio.play('horn');
    G.audio.engine(v.type === 'dump', v.speed, true);
    if (v.speed > 2) this.camYaw = turnToward(this.camYaw, v.yaw, (Math.abs(angDiff(this.camYaw, v.yaw)) * 2.2 + 0.1) * dt);
    this.interact = { text: `<b>E</b> 降りる　<b>W/S</b> アクセル/ブレーキ　<b>A/D</b> ハンドル　<b>SPACE</b> サイドブレーキ${v.type === 'daiko' ? '　<b>クリック/F</b> 太鼓' : ''}`, fn: null };
    if (I.hit('KeyE') && v.speed < 6) this.exit();
  }
  updDown(dt) {
    const G = this.G; this.downT += dt; this.vel.set(0, 0, 0); this.speed = 0;
    G.ui.fade(clamp((this.downT - 1.0) / 0.8, 0, 1));
    if (this.downT > 2.4) {
      const s = G.world.spawn; this.pos.set(s.x, CFG.CURB, s.z); this.yaw = this.camYaw = s.yaw; this.hp = 100; this.mode = 'foot'; this.onGround = true; this.invuln = 3;
      G.law.reset(); for (const n of G.npcs.list) if (n.on && n.kind === 'enforcer' && n.state !== 'Yankee') G.npcs.despawn(n);
      G.ui.fade(0); G.ui.toast('駐車場で目を覚ました', 'info');
    }
  }
  // ---------- モデル ----------
  updModel(dt) {
    const G = this.G, p = this.pos, pose = this.pose, w = this.wid; let anim = 'idle', visible = true, py = p.y;
    const hs = this.speed;
    if (G.mission.cutscene) { anim = 'firework'; }
    else if (this.mode === 'vehicle') { if (this.vehicle.type === 'dump') visible = false; anim = 'drumstance'; }
    else if (this.mode === 'glide') anim = 'glide';
    else if (this.mode === 'down') anim = 'down';
    else if (this.mode === 'takedown') anim = 'idle';
    else if (!this.onGround) anim = 'fall';
    else if (this.squat) anim = 'squat';
    else if (hs > 2.6) anim = 'run';
    else if (hs > 0.25) anim = 'swagger';
    if (anim === 'run' || anim === 'swagger') this.phase += hs * dt * (anim === 'run' ? 2.5 : 4.6);
    applyAnim(pose, anim, anim === 'run' || anim === 'swagger' ? this.phase : this.t);
    if (this.mode === 'vehicle') applyUpper(pose, 'drum', this.vehicle.drumT / 0.32, this.t);
    else if (this.mode === 'takedown') applyUpper(pose, 'feed', clamp(this.td.t / 0.5, 0, 1), this.t);
    else if (this.mode === 'foot' && !this.squat) {
      if (this.swingT >= 0) applyUpper(pose, 'swing', this.swingT);
      else if (w === 'spray' && this.spraying) applyUpper(pose, 'spray', 0, this.t);
      else if ((w === 'paint' || w === 'rocket') && this.aimT > 0) applyUpper(pose, 'aim', clamp(this.fireCool / 0.15, 0, 1));
      else if (w === 'goboten' || w === 'bokuto') applyUpper(pose, 'hold');
      else if (this.yankeeWalk && this.glare) applyUpper(pose, 'glare');
    }
    if (this.mode === 'glide') pose.rootRoll = this.roll;
    computeMatrices(pose, p.x, py, p.z, this.yaw, 1.03, this.mats);
    const blink = this.invuln > 0 && this.mode === 'foot' && Math.sin(this.t * 40) > 0.3;
    this.model.update(this.mats, visible && !blink, this.mode === 'takedown' ? 'goboten' : this.mode === 'foot' ? w : 'none');
    const e = this.mats[8].elements; this.hand.set(e[12], e[13], e[14]);
    const gl = this.model.glider; gl.visible = this.mode === 'glide';
    if (gl.visible) { gl.position.set(p.x, p.y, p.z); gl.rotation.set(0, this.yaw, this.roll, 'YXZ'); }
  }
  // ---------- カメラ ----------
  updCamera(dt) {
    const G = this.G, cam = G.camera, W = G.world, p = this.pos; let tx, ty, tz, dist, yaw = this.camYaw, pitch = this.camPitch;
    if (this.mode === 'vehicle') { const v = this.vehicle; tx = v.x; ty = v.y + v.P.camH * 0.62; tz = v.z; dist = v.P.camDist; pitch = Math.max(pitch, 0.06); }
    else {
      const sh = this.mode === 'glide' ? 0 : 0.55; tx = p.x - Math.cos(yaw) * sh; tz = p.z + Math.sin(yaw) * sh; ty = p.y + (this.squat ? 1.05 : 1.58);
      dist = this.mode === 'glide' ? 8 : this.mode === 'takedown' ? 3.3 : 4.4; if (this.mode === 'glide') ty += 1.2;
    }
    this.camT.x = damp(this.camT.x, tx, 22, dt); this.camT.y = damp(this.camT.y, ty, 14, dt); this.camT.z = damp(this.camT.z, tz, 22, dt);
    if (this.camT.distanceToSquared(_v2.set(tx, ty, tz)) > 400) this.camT.set(tx, ty, tz);
    const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const free = Math.max(0.7, W.raycast(this.camT.x, this.camT.y, this.camT.z, dx, dy, dz, dist + 0.35) - 0.35);
    this.camD = free < this.camD ? free : damp(this.camD, free, 5, dt);
    cam.position.set(this.camT.x + dx * this.camD, this.camT.y + dy * this.camD, this.camT.z + dz * this.camD);
    const sk = G.shake || 0; if (sk > 0.001) { cam.position.x += (Math.random() - 0.5) * sk * 0.35; cam.position.y += (Math.random() - 0.5) * sk * 0.35; cam.position.z += (Math.random() - 0.5) * sk * 0.35; }
    cam.lookAt(this.camT.x - dx * 4, this.camT.y - dy * 4 + 0.15, this.camT.z - dz * 4);
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
