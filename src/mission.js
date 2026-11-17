// 4. ミッションスクリプト：MQ_05_ComingOfAge「成人式は金ピカだろ！」
import * as THREE from 'three';
import { CFG, PAINT_COLORS } from './config.js';
import { lerp } from './utils.js';

const PKEYS = Object.keys(PAINT_COLORS);
const rnd = (a) => (Math.random() - 0.5) * 2 * a;

export class Mission {
  constructor(G) {
    this.G = G; this.Quest_ID = 'MQ_05_ComingOfAge';
    this.phase = 0;               // 0:未開始 1:乱入 2:強制カラーリング 3:占拠 4:完了ムービー 5:完了
    this.Quest_Target_Count = 0;
    this.cutscene = false; this.cutT = 0; this.t = 0; this.launchT = 0; this.crowd = []; this.wasGlide = false;
    const W = G.world, tr = W.trigger, scene = G.scene;
    const gold = new THREE.Color(3, 2.1, 0.4), add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
    // フェーズ1 Trigger Box（市役所上空の指定高度）
    const sx = tr.maxX - tr.minX, sy = tr.maxY - tr.minY, sz = tr.maxZ - tr.minZ;
    this.trig = new THREE.Group(); this.trig.position.set((tr.minX + tr.maxX) / 2, (tr.minY + tr.maxY) / 2, (tr.minZ + tr.maxZ) / 2);
    this.trig.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color: gold, fog: false })));
    this.trig.add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({ color: gold, opacity: 0.045, side: THREE.DoubleSide, ...add })));
    this.rings = [];
    for (const [r, x] of [[8.5, -sx / 2], [7, 0], [8.5, sx / 2]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.24, 8, 56), new THREE.MeshBasicMaterial({ color: gold, opacity: 0.9, ...add })); ring.rotation.y = Math.PI / 2; ring.position.x = x; this.trig.add(ring); this.rings.push(ring); }
    this.trig.visible = false; scene.add(this.trig);
    // タワー入口のビーコン
    const beamG = new THREE.CylinderGeometry(0.7, 0.7, 90, 12, 1, true);
    this.beacon = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: gold, opacity: 0.2, side: THREE.DoubleSide, ...add })); this.beacon.position.set(W.tower.elevator.x, 45, W.tower.elevator.z); scene.add(this.beacon);
    // BP_Microphone（広場中央）
    const mic = W.plaza.mic, mg = new THREE.Group(); mg.position.set(mic.x, CFG.CURB, mic.z);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.22, 28), std({ color: 0x9a1a1a, roughness: 0.8 })); pod.position.y = 0.11; pod.receiveShadow = true;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 8), std({ color: 0xc8ccd0, metalness: 1, roughness: 0.25 })); stand.position.set(0, 0.92, 0.45); stand.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 16), std({ color: 0x202224, metalness: 0.8, roughness: 0.4 })); base.position.set(0, 0.235, 0.45);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), std({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.45 })); head.position.set(0, 1.66, 0.45);
    const rg = new THREE.RingGeometry(1.3, 1.55, 48); rg.rotateX(-Math.PI / 2);
    this.micGlow = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: gold, opacity: 0.9, side: THREE.DoubleSide, ...add })); this.micGlow.position.y = 0.06; this.micGlow.visible = false;
    this.micBeam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: gold, opacity: 0.22, side: THREE.DoubleSide, ...add })); this.micBeam.position.y = 45; this.micBeam.visible = false;
    mg.add(pod, stand, base, head, this.micGlow, this.micBeam); scene.add(mg); G.noAO.push(this.trig, this.beacon, this.micGlow, this.micBeam);
  }
  objective() {
    const ui = this.G.ui, T = 'MQ_05「成人式は金ピカだろ！」';
    if (this.phase === 0) ui.objective(T, '<b>修羅タワー</b>（金色のビーコン）のエレベーターで屋上へ');
    else if (this.phase === 1) ui.objective(`${T}　フェーズ1：乱入`, '屋上から飛び降りて <b>SPACE</b> でパラグライダー展開。<br>市役所上空のリング（高度 36〜56m）を通過せよ<br><span class="dim">A/D 旋回　W 急降下　S フレア</span>');
    else if (this.phase === 2) ui.objective(`${T}　フェーズ2：強制カラーリング`, `ペイントガンでスーツの新成人を染め上げろ　<b class="count">${this.Quest_Target_Count} / ${CFG.QUEST_TARGET}</b>`);
    else if (this.phase === 3) ui.objective(`${T}　フェーズ3：占拠`, '広場中央の<b>マイク</b>を奪え（<b>E</b>）');
    else if (this.phase === 5) ui.objective('MISSION COMPLETE', '自由行動：北九州のすべてを修羅に染め上げろ');
  }
  start() { if (this.phase !== 0) return; const G = this.G; this.phase = 1; this.trig.visible = true; this.beacon.material.opacity = 0.08; G.audio.play('mission'); G.ui.banner('MQ_05 成人式は金ピカだろ！', 'フェーズ1：乱入', 3.4, 'gold'); this.objective(); }
  rideElevator() {
    const G = this.G, P = G.player, r = G.world.tower.roof;
    P.pos.set(r.x, r.y, r.z); P.vel.set(0, 0, 0); P.yaw = P.camYaw = Math.PI / 2; P.camPitch = 0.25; P.onGround = true; P.camT.set(r.x, r.y + 1.6, r.z);
    G.ui.flash(); G.audio.play('ui'); if (this.phase === 0) this.start();
    G.ui.toast('屋上に到着。東（市役所方向）へ飛び降りて SPACE でパラグライダー', 'info');
  }
  toPhase2() {
    const G = this.G, Pz = G.world.plaza, rng = G.npcs.rng; this.phase = 2; this.trig.visible = false; this.beacon.visible = false;
    // Target: 広場にスーツNPC（100体）をスポーン
    for (let i = 0; i < CFG.QUEST_NPCS; i++) { const n = G.npcs.spawn('quest', lerp(Pz.x0 + 3, Pz.x1 - 3, rng()), lerp(Pz.z0 + 9, Pz.z1 - 1.5, rng())); if (!n) break; n.faction = 'Neutral'; }
    G.player.inv.paint = true; G.player.weapon = 3; // ギミック武器 Weapon_PaintGun を支給
    G.audio.play('mission'); G.ui.banner('乱入成功！', 'フェーズ2：強制カラーリング — ペイントガン支給', 3.4, 'gold'); this.objective();
  }
  onPainted(n) { // Hit処理：Quest_Target_Count +1
    if (this.phase !== 2) return; this.Quest_Target_Count++; this.objective();
    if (this.Quest_Target_Count >= CFG.QUEST_TARGET) this.toPhase3();
  }
  toPhase3() { const G = this.G; this.phase = 3; this.micGlow.visible = this.micBeam.visible = true; G.audio.play('mission'); G.ui.banner('会場は金ピカだ！', 'フェーズ3：占拠 — 広場中央のマイクを奪え', 3.4, 'gold'); this.objective(); }
  interact(p) {
    if (this.phase !== 3) return null; const mic = this.G.world.plaza.mic;
    return Math.hypot(p.x - mic.x, p.z - mic.z) < 3 ? { text: '<b>E</b> マイクを奪って成人式を占拠する', fn: () => this.startCutscene() } : null;
  }
  startCutscene() { // 完了ムービー（Sequencer 相当）
    const G = this.G, P = G.player, mic = G.world.plaza.mic; this.phase = 4; this.cutscene = true; this.cutT = 0; this.launchT = 0;
    this.micGlow.visible = this.micBeam.visible = false;
    P.pos.set(mic.x, CFG.CURB + 0.22, mic.z); P.vel.set(0, 0, 0); P.yaw = 0; P.weapon = 0; P.squat = false; P.speed = 0; P.swingT = -1;
    G.law.reset(); G.ui.letterbox(true); G.ui.prompt(null); G.audio.play('mission');
    this.crowd = G.npcs.list.filter((n) => n.on && n.kind === 'quest');
    for (const n of this.crowd) { n.rag = 0; n.dance = 0; n.cheer = 0; n.flee = 0; if (!n.paint) { n.paint = PAINT_COLORS[PKEYS[Math.floor(Math.random() * 3)]]; G.npcs.applyLook(n); } }
  }
  updCutscene(dt) {
    const G = this.G, mic = G.world.plaza.mic; this.cutT += dt; const t = this.cutT;
    // 広場南側から市役所（横断幕）を背景に群衆と花火を見上げる
    const a = 0.55 - t * 0.09, R = 26 - t * 0.6, h = 2.2 + t * 0.75;
    G.camera.position.set(mic.x + Math.sin(a) * R, h, mic.z + 4 + Math.cos(a) * R); G.camera.lookAt(mic.x, 3 + t * 1.5, mic.z - 2);
    if (t > 0.8 && !this.said) { this.said = true; G.ui.banner('成人式は金ピカだろ！', '会場占拠 — 全員、ロケット花火 用意ッ！', 4.5, 'gold'); G.audio.speak('成人式は金ピカだろ'); }
    // NPC全員がロケット花火を一斉に上空へ発射
    if (t > 2.2 && t < 10.5 && this.crowd.length) {
      this.launchT -= dt;
      while (this.launchT <= 0) {
        this.launchT += t < 3.0 ? 0.009 : 0.055; const n = this.crowd[Math.floor(Math.random() * this.crowd.length)], c = new THREE.Color(PAINT_COLORS[PKEYS[Math.floor(Math.random() * 3)]].hex);
        G.fx.rocket(n.x, n.y + 2.35, n.z, rnd(2.4), 15 + Math.random() * 8, rnd(2.4), [c.r, c.g, c.b], 0.9 + Math.random() * 0.8, () => { if (Math.random() < 0.3) G.audio.play('boom', 0.4); });
        if (Math.random() < 0.25) G.audio.play('launch', 0.5);
      }
    }
    if (t >= 13) this.endCutscene();
  }
  endCutscene() {
    const G = this.G; this.cutscene = false; this.phase = 5; G.ui.letterbox(false);
    for (const n of this.crowd) G.npcs.silentYankee(n);
    G.player.camYaw = Math.PI; G.player.camPitch = 0.2;
    G.ui.banner('MISSION COMPLETE', 'MQ_05「成人式は金ピカだろ！」クリア', 5, 'gold'); G.audio.play('mission'); this.objective();
  }
  update(dt) {
    const G = this.G, P = G.player, tr = G.world.trigger; this.t += dt;
    if (this.phase === 0) this.beacon.material.opacity = 0.16 + 0.08 * Math.sin(this.t * 3);
    else if (this.phase === 1) {
      this.rings.forEach((r, i) => { r.rotation.x = this.t * (0.6 + i * 0.2); r.material.opacity = 0.65 + 0.3 * Math.sin(this.t * 4 + i); });
      const p = P.pos, alt = p.y;
      G.ui.altimeter(P.mode === 'glide' || alt > 10 ? `高度 ${alt.toFixed(0)}m　<span class="${alt >= tr.minY && alt <= tr.maxY ? 'ok' : 'ng'}">目標 ${tr.minY}〜${tr.maxY}m</span>` : null);
      // パラグライダー装備状態で Trigger Box を通過すると進行
      if (P.mode === 'glide' && p.x > tr.minX && p.x < tr.maxX && p.y > tr.minY && p.y < tr.maxY && p.z > tr.minZ && p.z < tr.maxZ) { G.ui.altimeter(null); this.toPhase2(); }
      if (this.wasGlide && P.mode === 'foot' && P.onGround && this.phase === 1) G.ui.toast('リングを通過できなかった。もう一度タワー屋上へ', 'bad');
      this.wasGlide = P.mode === 'glide';
    } else if (this.phase === 3) { this.micGlow.scale.setScalar(1 + 0.12 * Math.sin(this.t * 5)); }
    else if (this.phase === 4) this.updCutscene(dt);
  }
}
