// 1.2 施設ハッキング（「角打ち」化）：BP_OrganicCafe、Area_Shura_Zone、スポーンテーブル
import * as THREE from 'three';
import { CFG } from './config.js';
import { Batch, xform } from './world.js';
import { makeRng, clamp } from './utils.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

class OrganicCafe {
  constructor(G, def) {
    this.G = G; this.def = def;
    this.bIsKakuuchi = false; // GDD: bool bIsKakuuchi = false
    this.mix = 0; this.swapT = 0; this.t = 0;
    this.cx = (def.x0 + def.x1) / 2; this.cz = (def.z0 + def.z1) / 2;
    const halfDepth = def.nx ? (def.x1 - def.x0) / 2 : (def.z1 - def.z0) / 2;
    this.doorX = this.cx + def.nx * (halfDepth + 1.5); this.doorZ = this.cz + def.nz * (halfDepth + 1.5);
    const M = G.world.mats, T = G.T, root = new THREE.Group();
    root.position.set(this.cx, CFG.CURB, this.cz); root.rotation.y = Math.atan2(def.nx, def.nz); G.scene.add(root);
    const Wd = 16, Dp = 12, H = 4.6, F = Dp / 2;
    // ---- お上品（クリーン）状態 ----
    const clean = new THREE.Group(); let b = new Batch();
    const interior = std({ color: 0xffe7c0, emissive: 0xffd49a, emissiveIntensity: 1.5 });
    b.box(M.plaster, Wd, H, Dp, 0, H / 2, 0); b.box(M.glass, 14.4, 3.0, 0.14, 0, 1.75, F + 0.02);
    for (let k = 0; k <= 4; k++) b.box(M.white, 0.12, 3.1, 0.2, -7.2 + k * 3.6, 1.75, F + 0.03);
    b.box(M.white, 14.6, 0.14, 0.22, 0, 3.3, F + 0.03); b.box(M.wood, Wd + 0.1, 1.0, 0.24, 0, 4.05, F + 0.02);
    b.box(interior, 13.8, 0.35, 0.05, 0, 2.85, F + 0.1); b.box(M.plaster, 15, 0.08, 1.5, 0, 3.42, F + 0.75);
    for (const sx of [-1, 1]) { b.box(M.wood, 1.4, 0.6, 0.7, sx * 6.6, 0.3, F + 0.9); b.box(M.hedge, 1.3, 0.75, 0.6, sx * 6.6, 0.95, F + 0.9); b.cyl(M.white, 0.45, 0.45, 0.04, sx * 3.4, 0.74, F + 2.0, 14); b.cyl(M.metalDark, 0.04, 0.04, 0.74, sx * 3.4, 0.37, F + 2.0, 6); }
    for (const sx of [-1, 1]) { // 側面：木ルーバー帯・窓・腰壁
      b.box(M.wood, 0.2, 1.0, Dp + 0.1, sx * (Wd / 2 + 0.02), 4.05, 0); b.box(M.glass, 0.1, 1.7, 4.6, sx * (Wd / 2 + 0.02), 2.0, 2.2); b.box(M.white, 0.14, 1.86, 0.12, sx * (Wd / 2 + 0.03), 2.0, 2.2);
      b.box(M.white, 0.14, 0.1, 4.8, sx * (Wd / 2 + 0.03), 2.9, 2.2); b.box(M.white, 0.14, 0.1, 4.8, sx * (Wd / 2 + 0.03), 1.1, 2.2);
      for (let k = 0; k < 6; k++) b.box(M.wood, 0.12, 2.6, 0.14, sx * (Wd / 2 + 0.04), 1.9, -5.2 + k * 0.5);
      b.box(M.hedge, 0.7, 0.8, 6.5, sx * (Wd / 2 + 0.55), 0.4, -1.5);
    }
    b.box(M.concrete, Wd + 0.16, 0.45, Dp + 0.16, 0, 0.225, 0);
    b.box(M.roof, Wd - 0.4, 0.05, Dp - 0.4, 0, H + 0.03, 0);
    b.build(clean);
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.8), std({ map: T.cafeSign, roughness: 0.7 })); s1.position.set(0, 4.05, F + 0.16); clean.add(s1);
    // ---- 修羅（角打ち）状態 ----
    const kaku = new THREE.Group(); b = new Batch();
    const darkWood = std({ map: T.wood.map, color: 0x7a6250, roughness: 0.8 }), warm = std({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 2.2 });
    const crateY = std({ color: 0xe0b020, roughness: 0.6 }), crateR = std({ color: 0xb02a20, roughness: 0.6 });
    const lantern = std({ map: T.lantern, emissiveMap: T.lantern, emissive: 0xffffff, emissiveIntensity: 2.6, roughness: 0.6 });
    b.box(darkWood, Wd, H, Dp, 0, H / 2, 0); b.box(warm, 6.4, 2.5, 0.06, 0, 1.3, F + 0.03); b.box(darkWood, 0.2, 2.7, 0.3, -3.3, 1.35, F + 0.06); b.box(darkWood, 0.2, 2.7, 0.3, 3.3, 1.35, F + 0.06);
    for (let k = 0; k < 9; k++) { b.box(darkWood, 0.1, 2.4, 0.12, -7.4 + k * 0.45, 1.5, F + 0.06); b.box(darkWood, 0.1, 2.4, 0.12, 3.8 + k * 0.45, 1.5, F + 0.06); }
    b.box(warm, 3.6, 2.2, 0.04, -5.6, 1.5, F + 0.02); b.box(warm, 3.6, 2.2, 0.04, 5.6, 1.5, F + 0.02);
    b.box(M.metalDark, Wd + 0.6, 0.12, 1.7, 0, 3.25, F + 0.85); // トタン庇
    for (let k = 0; k < 7; k++) { const lg = new THREE.CylinderGeometry(0.2, 0.2, 0.52, 14); b.add(lantern, lg, xform(-6 + k * 2, 2.8, F + 1.5)); b.box(M.metalDark, 0.3, 0.05, 0.3, -6 + k * 2, 3.08, F + 1.5); b.box(M.metalDark, 0.3, 0.05, 0.3, -6 + k * 2, 2.52, F + 1.5); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) for (let j = 0; j < 2 - (k > 1 ? 1 : 0); j++) b.box((k + j) % 2 ? crateY : crateR, 0.5, 0.34, 0.38, sx * (6.2 + j * 0.56), 0.17 + k * 0.35, F + 0.9);
    for (const sx of [-2.4, 2.6]) { b.cyl(darkWood, 0.42, 0.36, 1.0, sx, 0.5, F + 2.3, 14); b.cyl(M.wood, 0.5, 0.5, 0.05, sx, 1.03, F + 2.3, 14); b.cyl(M.white, 0.045, 0.04, 0.12, sx + 0.15, 1.12, F + 2.3, 8); b.cyl(M.white, 0.045, 0.04, 0.12, sx - 0.18, 1.12, F + 2.4, 8); }
    b.box(M.roof, Wd - 0.4, 0.05, Dp - 0.4, 0, H + 0.03, 0);
    b.build(kaku);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.8), std({ map: T.kakuSign, roughness: 0.8, emissiveMap: T.kakuSign, emissive: 0xffffff, emissiveIntensity: 0.25 })); s2.position.set(0, 4.05, F + 0.18); kaku.add(s2);
    const nr = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.25), std({ map: T.noren, roughness: 0.9, side: THREE.DoubleSide })); nr.position.set(0, 2.1, F + 0.2); kaku.add(nr); this.noren = nr;
    kaku.visible = false; root.add(clean, kaku); this.clean = clean; this.kaku = kaku;
    // ---- Area_Shura_Zone の可視化とビーコン ----
    const rg = new THREE.RingGeometry(CFG.SHURA_RADIUS - 0.45, CFG.SHURA_RADIUS, 160); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.2), transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.ring.position.set(this.cx, 0.2, this.cz); this.ring.visible = false; G.scene.add(this.ring);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 0.7), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.set(this.cx, 39, this.cz); G.scene.add(this.beam); G.noAO.push(this.ring, this.beam);
  }
  // Override_To_Kakuuchi
  overrideToKakuuchi(cause, impact = 0) {
    if (this.bIsKakuuchi) return false; const G = this.G;
    this.bIsKakuuchi = true;            // 1. bIsKakuuchi = true
    this.mix = 0;                       // 2. Environment Audio クロスフェード開始（update で 2.0s）
    this.swapT = 0.35; this.cause = cause;
    const fx = G.fx, px = this.doorX, pz = this.doorZ;
    fx.puff(px, 2, pz, 40, [0.55, 0.5, 0.45], 3.2, 1.8, 5, 2, 0.75); fx.sparks(px, 2.2, pz, 90, [3, 1.6, 0.5], 10, 1.2, 0.1, 10); fx.debris(px, 2, pz, 26, 0xe9e4d8, 8, 0.4); fx.debris(px, 2, pz, 10, 0x3b6b45, 7, 0.3);
    G.audio.play('glass'); G.audio.play('override'); G.shake = Math.max(G.shake || 0, 0.9);
    G.stats.kakuuchi++;
    G.ui.banner('角打ち化', `${this.def.name} →「角打ち 修羅」`, 3.2, 'shura');
    G.ui.toast(cause === 'vehicle' ? `ダンプ突入（衝突速度 ${(impact * 100).toFixed(0)} uu/s）で施設をオーバーライド！` : 'カップ酒を供えて施設をオーバーライド！', 'shura');
    G.ui.toast('半径50mが「修羅ゾーン」化：クリーン系NPCに毎秒 +5 感染／木刀・ロケランのドロップ率上昇', 'info');
    G.npcs.alarm(this.cx, this.cz, 22, 0.2); G.onKakuuchi?.(this);
    return true;
  }
  update(dt) {
    const G = this.G; this.t += dt;
    if (this.swapT > 0) { this.swapT -= dt; if (this.swapT <= 0) { this.clean.visible = false; this.kaku.visible = true; this.ring.visible = true; this.beam.material.color.setRGB(2.2, 0.35, 0.15); } }
    if (!this.bIsKakuuchi) return;
    this.mix = Math.min(1, this.mix + dt / CFG.KAKUUCHI_FADE); // FadeTime = 2.0s
    this.ring.material.opacity = 0.5 + 0.25 * Math.sin(this.t * 2.4);
    this.noren.rotation.x = Math.sin(this.t * 1.7) * 0.05;
    // 3. Area Buff/Debuff：ゾーン内のクリーン系敵対NPCに毎秒 Infection_Meter +5.0
    const add = CFG.SHURA_DPS * dt;
    G.npcs.inRadius(this.cx, this.cz, CFG.SHURA_RADIUS, (n) => { if (n.faction === 'Enemy' && n.state !== 'Yankee') G.npcs.addInfection(n, add * n.resist, { cause: 'zone' }); });
  }
}

const ITEM_DEFS = {
  cup: { name: 'カップ酒', color: [0.5, 0.9, 1.6] },
  spray: { name: '洗脳スプレー缶', color: [1.5, 0.5, 1.8] },
  bokuto: { name: '木刀', color: [1.8, 1.1, 0.4] },
  rocket: { name: 'ロケラン弾', color: [2.0, 0.5, 0.3] },
};
// スポーンテーブル（修羅ゾーン内では木刀やロケランのドロップ率上昇）
const TABLE_BASE = [['cup', 0.45], ['spray', 0.4], ['bokuto', 0.1], ['rocket', 0.05]];
const TABLE_SHURA = [['bokuto', 0.36], ['rocket', 0.32], ['cup', 0.2], ['spray', 0.12]];

export class Facilities {
  constructor(G) {
    this.G = G; this.cafes = G.world.cafeDefs.map((d) => new OrganicCafe(G, d)); this.rng = makeRng(31337);
    this.items = []; this.spawnT = 3;
    const glass = std({ color: 0xbfe6f2, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 }), label = std({ color: 0x1c4fa8, roughness: 0.5 });
    const can = std({ color: 0x7a2bbf, roughness: 0.3, metalness: 0.7 }), wood = std({ color: 0x6a4428, roughness: 0.6 }), red = std({ color: 0xc8261f, roughness: 0.4 }), gold = std({ color: 0xe0b23a, metalness: 0.9, roughness: 0.3 });
    const at = (mesh, y) => { mesh.position.y = y; return mesh; };
    const nozzle = std({ color: 0xeeeeee });
    this.proto = {
      cup: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.26, 14), glass), new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.1, 0.12, 14), label), at(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 14), gold), 0.14)); return g; },
      spray: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 14), can), at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 10), nozzle), 0.22)); return g; },
      bokuto: () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.07), wood); m.rotation.z = 0.5; g.add(m); return g; },
      rocket: () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 12), gold); c.position.y = 0.33; g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 12), red), c); return g; },
    };
    this.glowGeo = new THREE.RingGeometry(0.35, 0.6, 28); this.glowGeo.rotateX(-Math.PI / 2);
  }
  inShura(x, z) { for (const c of this.cafes) if (c.bIsKakuuchi && Math.hypot(c.cx - x, c.cz - z) < CFG.SHURA_RADIUS) return true; return false; }
  // 環境音ストリーム：最寄り施設の状態で「クラシック」⇔「演歌」
  ambience(x, z) {
    let best = null, bd = 1e9; for (const c of this.cafes) { const d = Math.hypot(c.cx - x, c.cz - z); if (d < bd) { bd = d; best = c; } }
    const v = Math.pow(clamp(1 - (bd - 9) / 55, 0, 1), 1.4); let enka = v * best.mix, classical = v * (1 - best.mix);
    for (const c of this.cafes) if (c !== best && c.bIsKakuuchi) { const d = Math.hypot(c.cx - x, c.cz - z); if (d < CFG.SHURA_RADIUS) enka = Math.max(enka, 0.3 * c.mix); }
    if (best.bIsKakuuchi && bd < CFG.SHURA_RADIUS) enka = Math.max(enka, 0.3 * best.mix);
    return { classical, enka };
  }
  spawnItem(kind, x, z) {
    const G = this.G, def = ITEM_DEFS[kind], grp = new THREE.Group(), body = this.proto[kind](); body.scale.setScalar(1.7); body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const glow = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color[0], def.color[1], def.color[2]), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.05; grp.add(body, glow); grp.position.set(x, G.world.baseHeight(x, z), z); G.scene.add(grp);
    const it = { kind, x, z, grp, body, glow, t: this.rng() * 6, life: 110 }; this.items.push(it); return it;
  }
  roll(x, z) { const table = this.inShura(x, z) ? TABLE_SHURA : TABLE_BASE; let r = this.rng(); for (const [k, p] of table) { if (r < p) return k; r -= p; } return table[0][0]; }
  collect(it) {
    const G = this.G, P = G.player, name = ITEM_DEFS[it.kind].name;
    if (it.kind === 'cup') P.inv.cup++; else if (it.kind === 'spray') P.spray = 100; else if (it.kind === 'bokuto') P.inv.bokuto = 25; else if (it.kind === 'rocket') P.inv.rockets += 3;
    G.audio.play('pickup'); G.ui.toast(`${name} を拾った${it.kind === 'bokuto' ? '（5キー）' : it.kind === 'rocket' ? '（4キー）' : ''}`, 'info');
    G.fx.sparks(it.x, 1, it.z, 14, ITEM_DEFS[it.kind].color, 3, 0.5, 0.08, 2);
  }
  update(dt) {
    const G = this.G, P = G.player;
    for (const c of this.cafes) c.update(dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.items.length < 10) {
      this.spawnT = 6.5; const p = G.world.randomSidewalkPoint(this.rng, P.pos, 10, 60); this.spawnItem(this.roll(p.x, p.z), p.x + (this.rng() - 0.5), p.z + (this.rng() - 0.5));
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt; it.life -= dt;
      it.body.position.y = 0.75 + Math.sin(it.t * 2.2) * 0.12; it.body.rotation.y = it.t * 1.6; it.glow.scale.setScalar(1 + 0.15 * Math.sin(it.t * 4));
      const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z), reach = P.mode === 'vehicle' ? 2.6 : 1.4;
      if (d < reach && P.mode !== 'down' && P.pos.y < 3) { this.collect(it); it.life = 0; }
      if (it.life <= 0) { G.scene.remove(it.grp); this.items.splice(i, 1); }
    }
  }
}
