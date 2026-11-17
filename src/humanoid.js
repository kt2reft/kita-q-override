// 人型リグ：パーツ行列の FK と手続き的アニメーション（NPC とプレイヤーで共有）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp, clamp, ease } from './utils.js';

export const PART = { HIPS: 0, TORSO: 1, HEAD: 2, UARM_L: 3, UARM_R: 4, FARM_L: 5, FARM_R: 6, HAND_L: 7, HAND_R: 8, THIGH_L: 9, THIGH_R: 10, SHIN_L: 11, SHIN_R: 12, FOOT_L: 13, FOOT_R: 14 };
export const PART_COUNT = 15;
export const makeMats = () => Array.from({ length: PART_COUNT }, () => new THREE.Matrix4());

export function resetPose(p) {
  p.hipY = 0.93; p.hipX = 0; p.swayX = 0; p.rootPitch = 0; p.rootRoll = 0; p.rootYOff = 0;
  p.torsoX = 0; p.torsoY = 0; p.torsoZ = 0; p.headX = 0; p.headY = 0; p.headZ = 0;
  p.aLp = 0; p.aLr = 0.09; p.aLe = 0.12; p.aRp = 0; p.aRr = 0.09; p.aRe = 0.12;
  p.lLp = 0; p.lLr = 0.02; p.lLk = 0; p.lRp = 0; p.lRr = 0.02; p.lRk = 0;
  return p;
}
export const makePose = () => resetPose({});

// 全身アニメーション。t は位相（歩行系は移動距離に比例、その他は秒）
export function applyAnim(p, anim, t) {
  resetPose(p);
  const s = Math.sin(t), c = Math.cos(t);
  switch (anim) {
    case 'walk':
      p.lLp = 0.5 * s; p.lRp = -0.5 * s; p.lLk = 0.95 * Math.max(0, c); p.lRk = 0.95 * Math.max(0, -c);
      p.aLp = -0.42 * s; p.aRp = 0.42 * s; p.aLe = 0.22 + 0.15 * Math.max(0, -s); p.aRe = 0.22 + 0.15 * Math.max(0, s);
      p.hipY = 0.93 - 0.02 * Math.abs(s); p.torsoY = 0.07 * s; p.torsoX = 0.03; break;
    case 'run':
      p.lLp = 0.95 * s; p.lRp = -0.95 * s; p.lLk = 0.25 + 1.6 * Math.max(0, c); p.lRk = 0.25 + 1.6 * Math.max(0, -c);
      p.aLp = -1.0 * s; p.aRp = 1.0 * s; p.aLe = 1.45; p.aRe = 1.45;
      p.hipY = 0.9 - 0.035 * Math.abs(s); p.torsoX = 0.24; p.torsoY = 0.14 * s; p.headX = -0.1; break;
    case 'panic': // 逃走（両手を上げて走る）
      p.lLp = 0.95 * s; p.lRp = -0.95 * s; p.lLk = 0.25 + 1.6 * Math.max(0, c); p.lRk = 0.25 + 1.6 * Math.max(0, -c);
      p.aLp = 2.7 + 0.25 * s; p.aRp = 2.7 - 0.25 * s; p.aLr = 0.45; p.aRr = 0.45; p.aLe = 0.5; p.aRe = 0.5;
      p.hipY = 0.9 - 0.035 * Math.abs(s); p.torsoX = 0.18; p.headX = -0.15; break;
    case 'swagger': // ヤンキー歩き（ガニ股・ポケットに手）
      p.lLp = 0.4 * s; p.lRp = -0.4 * s; p.lLk = 0.75 * Math.max(0, c); p.lRk = 0.75 * Math.max(0, -c); p.lLr = 0.24; p.lRr = 0.24;
      p.torsoX = -0.1; p.torsoZ = 0.075 * s; p.torsoY = 0.17 * s; p.headX = -0.08; p.swayX = 0.03 * s;
      p.aLp = -0.2; p.aRp = -0.2; p.aLr = 0.38; p.aRr = 0.38; p.aLe = 0.95; p.aRe = 0.95; p.hipY = 0.92 - 0.02 * Math.abs(s); break;
    case 'squat': // ヤンキー座り
      p.hipY = 0.3 + 0.008 * Math.sin(t * 1.3); p.lLp = 1.95; p.lRp = 1.95; p.lLr = 0.55; p.lRr = 0.55; p.lLk = 2.45; p.lRk = 2.45;
      p.torsoX = 0.42; p.headX = -0.34; p.headY = 0.25 * Math.sin(t * 0.4);
      p.aLp = 1.05; p.aRp = 1.05; p.aLr = 0.3; p.aRr = 0.3; p.aLe = 0.35; p.aRe = 0.35; break;
    case 'dance': { // 盆踊り
      const a = Math.sin(t * 3.2), b = Math.sin(t * 1.6);
      p.swayX = 0.07 * b; p.torsoZ = 0.1 * b; p.torsoY = 0.3 * b; p.headZ = 0.12 * b;
      p.aLp = 1.7 + 0.55 * a; p.aRp = 1.7 - 0.55 * a; p.aLr = 0.5; p.aRr = 0.5; p.aLe = 0.6 + 0.3 * a; p.aRe = 0.6 - 0.3 * a;
      p.lLp = 0.3 * Math.max(0, a); p.lLk = 0.6 * Math.max(0, a); p.lRp = 0.3 * Math.max(0, -a); p.lRk = 0.6 * Math.max(0, -a); p.hipY = 0.91 - 0.02 * Math.abs(a); break;
    }
    case 'confused': {
      const a = Math.sin(t * 2.3);
      p.aLp = 2.45; p.aRp = 2.45; p.aLr = 0.5; p.aRr = 0.5; p.aLe = 2.0; p.aRe = 2.0;
      p.headZ = 0.22 * a; p.torsoZ = 0.1 * Math.sin(t * 1.7); p.torsoX = 0.1; p.lLp = 0.12 * a; p.lRp = -0.12 * a; p.lLk = 0.2; p.lRk = 0.2; p.hipY = 0.9; break;
    }
    case 'down': // 気絶（Ragdoll 相当）
      p.rootPitch = -Math.PI / 2; p.rootYOff = 0.17; p.aLr = 1.15 + 0.05 * Math.sin(t * 9); p.aRr = 0.9; p.aLp = 0.3; p.aRp = -0.2;
      p.lLr = 0.3; p.lRr = 0.42; p.lLk = 0.35 + 0.1 * Math.sin(t * 7); p.lRk = 0.15; p.headY = 0.5; break;
    case 'kneel': { // 強制給餌を受ける側
      const a = Math.sin(t * 15);
      p.hipY = 0.5; p.lLp = 0.2; p.lRp = 0.2; p.lLk = 1.7; p.lRk = 1.7; p.torsoX = -0.38; p.headX = -0.5;
      p.aLp = 1.3 + 0.6 * a; p.aRp = 1.3 - 0.6 * a; p.aLr = 0.7; p.aRr = 0.7; p.aLe = 0.7; p.aRe = 0.7; break;
    }
    case 'cheer':
      p.rootYOff = Math.max(0, Math.sin(t * 8)) * 0.14; p.aRp = 3.0; p.aLp = 3.0; p.aLr = 0.3; p.aRr = 0.3; p.aRe = 0.15 + 0.2 * s; p.aLe = 0.15 - 0.2 * s; p.headX = -0.2; break;
    case 'firework':
      p.aRp = 3.05; p.aRr = 0.1; p.aRe = 0.05; p.aLp = 0.3; p.aLr = 0.55; p.aLe = 1.6; p.headX = -0.45; p.torsoX = -0.08; p.lLr = 0.12; p.lRr = 0.12; break;
    case 'phone': // 通報中
      p.aRp = 0.9; p.aRr = 0.32; p.aRe = 2.5; p.headZ = -0.15; p.torsoY = 0.3 * Math.sin(t * 2); p.lLp = 0.05 * s; break;
    case 'stagger':
      p.torsoX = -0.32; p.headX = -0.2; p.aLp = -0.6; p.aRp = -0.5; p.aLr = 0.6; p.aRr = 0.7; p.lLp = 0.3; p.lRp = -0.3; p.lLk = 0.4; p.hipY = 0.88; break;
    case 'glide':
      p.aLp = 2.85; p.aRp = 2.85; p.aLr = 0.38; p.aRr = 0.38; p.aLe = 0.25; p.aRe = 0.25;
      p.lLp = 0.34 + 0.05 * s; p.lLk = 0.55; p.lRp = 0.16 - 0.05 * s; p.lRk = 0.36; p.torsoX = 0.12; p.headX = -0.1; break;
    case 'fall':
      p.aLp = 2.2 + 0.4 * Math.sin(t * 14); p.aRp = 2.2 - 0.4 * Math.sin(t * 14); p.aLr = 0.7; p.aRr = 0.7; p.lLp = 0.4; p.lRp = -0.2; p.lLk = 0.7; p.lRk = 0.5; break;
    case 'drumstance':
      p.lLr = 0.2; p.lRr = 0.2; p.hipY = 0.88; p.lLk = 0.2; p.lRk = 0.2; p.lLp = 0.1; p.lRp = 0.1; p.torsoX = 0.08; break;
    default: // idle
      p.torsoX = Math.sin(t * 1.5) * 0.012; p.aLe = 0.14; p.aRe = 0.14; p.headY = 0.12 * Math.sin(t * 0.35);
  }
  return p;
}

// 上半身の上書き（武器アクション）。w は 0..1 の進行度
export function applyUpper(p, kind, w = 0, t = 0) {
  switch (kind) {
    case 'hold': p.aRp = 0.3; p.aRe = 0.55; p.aRr = 0.16; break;
    case 'swing': { // ごぼ天ソード：振りかぶり→叩きつけ
      const k = w < 0.3 ? ease(w / 0.3) : 1, d = w < 0.3 ? 0 : ease(clamp((w - 0.3) / 0.35, 0, 1));
      p.aRp = lerp(lerp(0.3, 2.9, k), 0.25, d); p.aRe = lerp(0.9, 0.2, d); p.aRr = lerp(0.2, 0.45, k) - 0.5 * d;
      p.torsoY = lerp(0, -0.55, k) + 1.15 * d; p.torsoX = lerp(-0.1, 0.3, d); p.aLp = 0.5 * k; p.aLr = 0.4; break;
    }
    case 'spray': p.aRp = 1.42 + 0.03 * Math.sin(t * 30); p.aRe = 0.12; p.aRr = 0.05; p.torsoY = 0.25; p.aLp = 0.2; p.aLe = 0.6; break;
    case 'aim': p.aRp = 1.4; p.aRe = 0.25; p.aRr = -0.05; p.aLp = 1.32; p.aLr = -0.34; p.aLe = 0.55; p.torsoY = 0.3; p.torsoX += 0.05 - w * 0.12; break;
    case 'feed': { // 強制給餌（口にねじ込む）
      const a = Math.sin(t * 20);
      p.aRp = 0.72 + 0.1 * a * w; p.aRe = 0.35 + 0.12 * a; p.aRr = 0.1; p.torsoX = 0.28; p.torsoY = 0.35; p.aLp = 1.25; p.aLr = -0.2; p.aLe = 0.5;
      p.lLp = 0.45; p.lLk = 0.5; p.lRp = -0.35; p.lRk = 0.3; p.hipY = 0.86; break;
    }
    case 'drum': { // 太鼓を叩く（w: 打撃の進行）
      const hit = Math.sin(clamp(w, 0, 1) * Math.PI);
      p.aRp = 1.2 + 1.3 * hit; p.aRe = 0.9 - 0.6 * hit; p.aLp = 1.3 + 1.0 * (1 - hit) * 0.6; p.aLe = 0.9; p.aLr = 0.25; p.aRr = 0.25; p.torsoX = 0.1 + 0.12 * hit; break;
    }
    case 'glare': p.torsoX -= 0.06; p.headX = 0.08; break;
  }
  return p;
}

const _root = new THREE.Matrix4(), _a = new THREE.Matrix4();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function local(m, x, y, z, rx, ry, rz, order) {
  _e.set(rx, ry, rz, order); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(1, 1, 1);
  return m.compose(_v, _q, _s);
}
// ポーズ → 15 パーツのワールド行列
export function computeMatrices(p, x, y, z, yaw, sc, out) {
  local(_root, x, y + p.rootYOff * sc, z, p.rootPitch, yaw, p.rootRoll, 'YXZ');
  if (sc !== 1) _root.scale(_s.set(sc, sc, sc));
  const hips = out[0], torso = out[1];
  hips.multiplyMatrices(_root, local(_a, p.swayX, p.hipY, 0, p.hipX, 0, 0, 'YXZ'));
  torso.multiplyMatrices(hips, local(_a, 0, 0.09, 0, p.torsoX, p.torsoY, p.torsoZ, 'YXZ'));
  out[2].multiplyMatrices(torso, local(_a, 0, 0.555, 0, p.headX, p.headY, p.headZ, 'YXZ'));
  out[3].multiplyMatrices(torso, local(_a, 0.215, 0.47, 0, -p.aLp, 0, p.aLr, 'ZXY'));
  out[4].multiplyMatrices(torso, local(_a, -0.215, 0.47, 0, -p.aRp, 0, -p.aRr, 'ZXY'));
  out[5].multiplyMatrices(out[3], local(_a, 0, -0.28, 0, -p.aLe, 0, 0, 'ZXY'));
  out[6].multiplyMatrices(out[4], local(_a, 0, -0.28, 0, -p.aRe, 0, 0, 'ZXY'));
  out[7].multiplyMatrices(out[5], local(_a, 0, -0.27, 0, 0, 0, 0, 'ZXY'));
  out[8].multiplyMatrices(out[6], local(_a, 0, -0.27, 0, 0, 0, 0, 'ZXY'));
  out[9].multiplyMatrices(hips, local(_a, 0.095, -0.04, 0, -p.lLp, 0, p.lLr, 'ZXY'));
  out[10].multiplyMatrices(hips, local(_a, -0.095, -0.04, 0, -p.lRp, 0, -p.lRr, 'ZXY'));
  out[11].multiplyMatrices(out[9], local(_a, 0, -0.43, 0, p.lLk, 0, 0, 'ZXY'));
  out[12].multiplyMatrices(out[10], local(_a, 0, -0.43, 0, p.lRk, 0, 0, 'ZXY'));
  out[13].multiplyMatrices(out[11], local(_a, 0, -0.43, 0, (p.lLp - p.lLk) * 0.85, 0, 0, 'ZXY'));
  out[14].multiplyMatrices(out[12], local(_a, 0, -0.43, 0, (p.lRp - p.lRk) * 0.85, 0, 0, 'ZXY'));
  return out;
}

// パーツ形状（関節が原点、四肢は -Y 方向に伸びる）
export function makeGeoms(hi = false) {
  const rs = hi ? 14 : 8, cs = hi ? 5 : 3;
  const G = {};
  G.hips = new THREE.SphereGeometry(0.175, hi ? 16 : 10, hi ? 10 : 6).scale(1.02, 0.68, 0.74);
  const pts = [[0.001, 0], [0.165, 0], [0.176, 0.12], [0.19, 0.3], [0.214, 0.43], [0.2, 0.495], [0.105, 0.54], [0.055, 0.565], [0.001, 0.565]].map(([r, y]) => new THREE.Vector2(r, y));
  G.torso = new THREE.LatheGeometry(pts, hi ? 18 : 12).scale(1, 1, 0.64);
  const head = new THREE.SphereGeometry(0.115, hi ? 24 : 16, hi ? 16 : 10).scale(0.95, 1.15, 1.02).translate(0, 0.15, 0);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.09, 8).translate(0, 0.02, 0);
  { const uv = neck.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.75, 0.5); }
  G.head = mergeGeometries([head, neck]);
  G.hair = new THREE.SphereGeometry(0.123, hi ? 20 : 14, hi ? 10 : 7, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(0.97, 1.13, 1.05).rotateX(-0.42).translate(0, 0.152, -0.012);
  const pp = new THREE.SphereGeometry(0.132, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  { // パンチパーマ：細かい凹凸
    const a = pp.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i); const n = 1 + 0.085 * Math.sin(x * 120) * Math.sin(y * 120 + 1) * Math.sin(z * 120 + 2);
      a.setXYZ(i, x * n, y * n, z * n);
    }
    pp.computeVertexNormals();
  }
  G.punch = pp.scale(0.98, 1.12, 1.05).rotateX(-0.36).translate(0, 0.155, -0.008);
  G.regent = new THREE.CapsuleGeometry(0.06, 0.13, 4, 10).rotateX(Math.PI / 2).scale(1.15, 0.9, 1).translate(0, 0.262, 0.1);
  G.shades = new THREE.BoxGeometry(0.205, 0.042, 0.06).translate(0, 0.158, 0.096);
  G.tie = new THREE.BoxGeometry(0.05, 0.27, 0.02).translate(0, 0.37, 0.127);
  const limb = (r, len) => new THREE.CapsuleGeometry(r, len, cs, rs).translate(0, -len / 2, 0);
  G.uarm = limb(0.05, 0.28); G.farm = limb(0.042, 0.26);
  G.hand = new THREE.SphereGeometry(0.046, 8, 6).scale(0.8, 1.15, 1).translate(0, -0.035, 0);
  G.thigh = limb(0.078, 0.43); G.shin = limb(0.06, 0.43);
  G.foot = new THREE.BoxGeometry(0.1, 0.075, 0.26).translate(0, 0, 0.065);
  return G;
}
