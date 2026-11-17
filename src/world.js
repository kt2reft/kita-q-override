// ワールド構築：道路グリッド、ビル群、市役所広場、タワー、街路の小物、遠景、コリジョン
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { makeRng, clamp, pick } from './utils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function xform(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

// 同一マテリアルの静的ジオメトリを 1 メッシュに統合してドローコールを抑える
export class Batch {
  constructor() { this.m = new Map(); }
  add(mat, geo, mtx) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (mtx) g.applyMatrix4(mtx);
    let l = this.m.get(mat); if (!l) { l = []; this.m.set(mat, l); }
    l.push(g); return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), xform(x, y, z, ry)); }
  cyl(mat, rt, rb, h, x, y, z, seg = 10, rx = 0, rz = 0) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), xform(x, y, z, 0, rx, rz)); }
  build(parent) {
    const out = [];
    for (const [mat, list] of this.m) {
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = !mat.userData.noReceive;
      parent.add(mesh); out.push(mesh);
      for (const g of list) g.dispose();
    }
    this.m.clear(); return out;
  }
}

export function planeXZ(w, d, tile) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); }
  return g;
}
// BoxGeometry の UV を実寸スケールに直す（側面: tileU×tileV, 上下面: topTile）
function scaleBoxUV(geo, w, h, d, tileU, tileV, vOffset = 0, topTile = 0) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const side = f < 2 || f >= 4; const lu = f < 2 ? d : w; const lv = side ? h : d;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (side) uv.setXY(k, uv.getX(k) * lu / tileU, (uv.getY(k) * lv - vOffset) / tileV);
      else { const t = topTile || tileU; uv.setXY(k, uv.getX(k) * lu / t, uv.getY(k) * lv / t); }
    }
  }
  return geo;
}

function makeMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};
  M.asphalt = std({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughnessMap: T.asphalt.roughnessMap, roughness: 1, metalness: 0 });
  M.asphalt.userData.noShadow = true;
  M.paving = std({ map: T.paving.map, normalMap: T.paving.normalMap, roughness: 0.88 });
  M.plaza = std({ map: T.plaza.map, normalMap: T.plaza.normalMap, roughness: 0.38, metalness: 0.05 });
  M.plaza.userData.noShadow = true;
  M.concrete = std({ map: T.concrete.map, roughness: 0.9 });
  M.roof = std({ map: T.roof.map, roughness: 0.95 }); M.roof.userData.noShadow = true;
  M.wood = std({ map: T.wood.map, roughness: 0.75 });
  M.marking = std({ color: 0xd9d9d2, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.marking.userData.noShadow = true;
  M.facades = T.facades.map((f) => std({ map: f.map, normalMap: f.normal, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: 1, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1.5 }));
  M.shops = T.shops.map((f) => std({ map: f.map, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: 1, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1.3 }));
  M.signsV = T.signsV.map((t) => std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.5 }));
  M.metalGray = std({ color: 0x8b8f93, roughness: 0.45, metalness: 0.8 });
  M.metalDark = std({ color: 0x24272b, roughness: 0.5, metalness: 0.7 });
  M.white = std({ color: 0xe9e7e1, roughness: 0.6 });
  M.plaster = std({ color: 0xf1ede4, roughness: 0.92 });
  M.red = std({ color: 0xc3211b, roughness: 0.55 });
  M.pole = std({ color: 0x8f8c84, roughness: 0.9, map: T.concrete.map });
  M.trunk = std({ color: 0x4b3a2c, roughness: 0.95 });
  M.foliage = [0xe8b81e, 0xdd9c12, 0xcdb93c].map((c) => std({ color: c, map: T.foliage.map, normalMap: T.foliage.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.82, emissive: c, emissiveIntensity: 0.045 }));
  M.hedge = std({ color: 0x35542c, roughness: 0.9 });
  M.glass = std({ color: 0x1b2b33, roughness: 0.06, metalness: 0.9 });
  M.lampGlobe = std({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2.2, roughness: 0.4 });
  M.vendBody = [std({ color: 0xeef0f2, roughness: 0.4, metalness: 0.3 }), std({ color: 0xc8261f, roughness: 0.4, metalness: 0.3 })];
  M.vend = T.vending.map((v) => std({ map: v.map, emissiveMap: v.emissive, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.25 }));
  M.leaves = std({ map: T.leaves, transparent: true, alphaTest: 0.25, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.leaves.userData.noShadow = true;
  M.earth = std({ color: 0x3f4336, roughness: 1 }); M.earth.userData.noShadow = true;
  M.sea = std({ color: 0x1a2e3d, roughness: 0.12, metalness: 0.7 }); M.sea.userData.noShadow = true;
  M.kohaku = std({ map: T.kohaku, roughness: 0.8, side: THREE.DoubleSide });
  M.chimneyW = std({ color: 0xd7d3cc, roughness: 0.8 });
  M.chimneyR = std({ color: 0xb4332a, roughness: 0.8 });
  M.factory = std({ color: 0x6f7377, roughness: 0.85 });
  M.bridge = std({ color: 0xc2382c, roughness: 0.6 });
  return M;
}

export function buildWorld(scene, T) {
  const W = {};
  const R = CFG.ROADS, RH = CFG.ROAD_HALF, CURB = CFG.CURB, EDGE = CFG.EDGE, EXT = 164;
  const rng = makeRng(8930);
  const B = new Batch();
  const M = makeMaterials(T);
  W.mats = M; W.colliders = []; W.lampPositions = [];

  // ---------- 高さ・道路判定 ----------
  const strips = [];
  for (const r of R) { strips.push({ x: r, z: 0, hx: RH, hz: EDGE }); strips.push({ x: 0, z: r, hx: EDGE, hz: RH }); }
  W.roadDist = (x, z) => { // 車道までの符号付き距離（負=車道内）
    let d = 1e9;
    for (const s of strips) { const dd = Math.max(Math.abs(x - s.x) - s.hx, Math.abs(z - s.z) - s.hz); if (dd < d) d = dd; }
    return d;
  };
  W.isRoad = (x, z) => W.roadDist(x, z) < 0;
  W.baseHeight = (x, z) => CURB * clamp(W.roadDist(x, z) / 0.35, 0, 1);

  // ---------- 地面 ----------
  B.add(M.asphalt, planeXZ(EDGE * 2, EDGE * 2, 5), xform(0, 0, 0));
  const addSlab = (x0, x1, z0, z1) => {
    const w = x1 - x0, d = z1 - z0; const g = scaleBoxUV(new THREE.BoxGeometry(w, CURB, d), w, CURB, d, 2.4, 2.4, 0, 2.4);
    B.add(M.paving, g, xform((x0 + x1) / 2, CURB / 2, (z0 + z1) / 2));
  };
  const blocks = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const b = { x0: R[i] + RH, x1: R[i + 1] - RH, z0: R[j] + RH, z1: R[j + 1] - RH, i, j };
    b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2; blocks.push(b); addSlab(b.x0, b.x1, b.z0, b.z1);
  }
  addSlab(-EXT, EXT, -EXT, -EDGE); addSlab(-EXT, EXT, EDGE, EXT); addSlab(-EXT, -EDGE, -EDGE, EDGE); addSlab(EDGE, EXT, -EDGE, EDGE);
  { // 郊外の地面と海
    const earth = new THREE.Mesh(new THREE.CircleGeometry(5000, 48), M.earth); earth.rotation.x = -Math.PI / 2; earth.position.y = -0.06; earth.receiveShadow = true; scene.add(earth);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 3000), M.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, -1900 - 330); scene.add(sea);
  }

  // ---------- ノード（交差点）----------
  W.nodes = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) W.nodes.push({ id: j * 4 + i, i, j, x: R[i], z: R[j], nb: {}, mgr: null });
  const nodeAt = (i, j) => (i < 0 || j < 0 || i > 3 || j > 3 ? null : W.nodes[j * 4 + i]);
  for (const n of W.nodes) {
    n.nb.N = nodeAt(n.i, n.j - 1); n.nb.S = nodeAt(n.i, n.j + 1); n.nb.W = nodeAt(n.i - 1, n.j); n.nb.E = nodeAt(n.i + 1, n.j);
    n.neighbors = [n.nb.N, n.nb.S, n.nb.W, n.nb.E].filter(Boolean);
    n.signaled = n.neighbors.length >= 3;
  }
  const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

  // ---------- 路面標示 ----------
  const mark = (x, z, w, d) => B.add(M.marking, planeXZ(w, d), xform(x, 0.012, z));
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 9; k++) { mark(R[i] + 16 + k * 6, R[j], 3, 0.15); mark(R[j], R[i] + 16 + k * 6, 0.15, 3); }
    for (const s of [-1, 1]) { mark(R[i] + 40, R[j] + s * 5.55, 59, 0.15); mark(R[j] + s * 5.55, R[i] + 40, 0.15, 59); }
  }
  for (const n of W.nodes) for (const key of Object.keys(DIRS)) {
    if (!n.nb[key]) continue; const [dx, dz] = DIRS[key];
    for (let k = -6; k < 6; k++) {
      const lat = (k + 0.5) * 0.9;
      if (dx) mark(n.x + dx * 8.5, n.z + lat, 3, 0.45); else mark(n.x + lat, n.z + dz * 8.5, 0.45, 3);
    }
    const lx = -dz, lz = dx; // この脚から交差点へ向かう車の左側
    if (dx) mark(n.x + dx * 10.7 + lx * 2.9, n.z + lz * 2.9, 0.45, 5.4); else mark(n.x + lx * 2.9, n.z + dz * 10.7 + lz * 2.9, 5.4, 0.45);
  }

  // ---------- 歩道ウェイポイントグラフ ----------
  W.wps = [];
  for (const n of W.nodes) for (let k = 0; k < 4; k++) {
    const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    W.wps.push({ id: n.id * 4 + k, node: n, sx, sz, x: n.x + sx * 7.5, z: n.z + sz * 7.5, adj: [] });
  }
  for (const wp of W.wps) {
    const n = wp.node, k = wp.id & 3;
    const legZ = wp.sz > 0 ? n.nb.S : n.nb.N, legX = wp.sx > 0 ? n.nb.E : n.nb.W;
    wp.adj.push({ to: W.wps[n.id * 4 + (k ^ 1)], cross: legZ ? { node: n, axis: 'z' } : null });
    wp.adj.push({ to: W.wps[n.id * 4 + (k ^ 2)], cross: legX ? { node: n, axis: 'x' } : null });
    if (legX) wp.adj.push({ to: W.wps[legX.id * 4 + (k ^ 1)], cross: null });
    if (legZ) wp.adj.push({ to: W.wps[legZ.id * 4 + (k ^ 2)], cross: null });
  }
  W.randomSidewalkPoint = (r, near, minD = 0, maxD = 1e9) => {
    for (let tries = 0; tries < 40; tries++) {
      const wp = W.wps[Math.floor(r() * W.wps.length)]; const e = wp.adj[Math.floor(r() * wp.adj.length)];
      if (e.cross) continue; const t = r();
      const x = wp.x + (e.to.x - wp.x) * t, z = wp.z + (e.to.z - wp.z) * t;
      if (near) { const d = Math.hypot(x - near.x, z - near.z); if (d < minD || d > maxD) continue; }
      return { x, z, wp };
    }
    const wp = W.wps[Math.floor(r() * W.wps.length)]; return { x: wp.x, z: wp.z, wp };
  };

  // ---------- 建物 ----------
  const addCollider = (x0, x1, z0, z1, h, extra) => { const c = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h, ...extra }; W.colliders.push(c); return c; };
  const q32 = (len) => Math.max(3.2, Math.floor(len / 3.2) * 3.2);
  function addBuilding(x0, x1, z0, z1, h, style, o = {}) {
    let w = x1 - x0, d = z1 - z0; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (!o.exact) { w = q32(w); d = q32(d); }
    x0 = cx - w / 2; x1 = cx + w / 2; z0 = cz - d / 2; z1 = cz + d / 2;
    const band = o.noShop ? 0 : 3.6;
    B.add(M.facades[style], scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 12.8, 13.2, band), xform(cx, CURB + h / 2, cz));
    if (band) B.add(M.shops[o.shop ?? Math.floor(rng() * M.shops.length)], scaleBoxUV(new THREE.BoxGeometry(w + 0.14, band, d + 0.14), w, band, d, 8, band), xform(cx, CURB + band / 2, cz));
    const top = CURB + h;
    B.add(M.roof, planeXZ(w - 0.5, d - 0.5, 4), xform(cx, top + 0.03, cz));
    if (!o.noParapet) {
      B.box(M.concrete, w, 0.9, 0.28, cx, top + 0.45, z0 + 0.14); B.box(M.concrete, w, 0.9, 0.28, cx, top + 0.45, z1 - 0.14);
      B.box(M.concrete, 0.28, 0.9, d - 0.56, x0 + 0.14, top + 0.45, cz); B.box(M.concrete, 0.28, 0.9, d - 0.56, x1 - 0.14, top + 0.45, cz);
    }
    if (!o.noProps) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) B.box(M.metalGray, 1.6, 1.1, 1.0, cx + (rng() - 0.5) * (w - 4), top + 0.6, cz + (rng() - 0.5) * (d - 4), rng() < 0.5 ? 0 : Math.PI / 2);
      if (rng() < 0.5) B.box(M.concrete, 3.2, 2.6, 3, cx + (rng() - 0.5) * (w - 6), top + 1.3, cz + (rng() - 0.5) * (d - 6));
      if (rng() < 0.35) { const tx = cx + (rng() - 0.5) * (w - 5), tz = cz + (rng() - 0.5) * (d - 5); B.cyl(M.white, 1.05, 1.05, 2.0, tx, top + 2.2, tz, 12); B.box(M.metalDark, 1.6, 1.2, 1.6, tx, top + 0.6, tz); }
    }
    addCollider(x0, x1, z0, z1, top, o.tag ? { tag: o.tag } : null);
    return { x0, x1, z0, z1, h, top, cx, cz };
  }
  // 壁面（外向き法線 n）上の点
  const facePos = (b, nx, nz, t, off) => (nx ? { x: (nx < 0 ? b.x0 : b.x1) + nx * off, z: b.z0 + (b.z1 - b.z0) * t } : { x: b.x0 + (b.x1 - b.x0) * t, z: (nz < 0 ? b.z0 : b.z1) + nz * off });
  function decorateFace(b, nx, nz) {
    const ry = Math.atan2(nx, nz);
    if (rng() < 0.5) { // 突出し看板
      const H = 4 + rng() * 3.5, p = facePos(b, nx, nz, 0.15 + rng() * 0.7, 0.68), y = CURB + 4.4 + H / 2;
      if (y + H / 2 < b.top - 0.5) {
        B.add(M.signsV[Math.floor(rng() * M.signsV.length)], new THREE.BoxGeometry(0.22, H, 1.0), xform(p.x, y, p.z, ry));
        B.box(M.metalDark, 0.08, 0.08, 0.5, p.x - nx * 0.5, y + H / 2 - 0.3, p.z - nz * 0.5, ry);
      }
    }
    if (rng() < 0.3) { // 自動販売機
      const v = rng() < 0.5 ? 0 : 1, p = facePos(b, nx, nz, 0.1 + rng() * 0.8, 0.43);
      B.add(M.vendBody[v], new THREE.BoxGeometry(1.0, 1.83, 0.72), xform(p.x, CURB + 0.915, p.z, ry));
      B.add(M.vend[v], new THREE.PlaneGeometry(0.94, 1.76), xform(p.x + nx * 0.37, CURB + 0.93, p.z + nz * 0.37, ry));
    }
  }

  // 予約区画
  W.cafeDefs = [
    { id: 0, name: 'オーガニックカフェ 小倉本店', x0: 49.6, x1: 61.6, z0: -8, z1: 8, nx: -1, nz: 0 },
    { id: 1, name: 'オーガニックカフェ 魚町店', x0: -8, x1: 8, z0: 49.6, z1: 61.6, nx: 0, nz: -1 },
    { id: 2, name: 'オーガニックカフェ 京町店', x0: -88, x1: -72, z0: -61.6, z1: -49.6, nx: 0, nz: 1 },
  ];
  W.tower = { x0: -78, x1: -50, z0: -9.6, z1: 9.6, h: 60, elevator: { x: -48.6, z: 0 }, roof: { x: -57, y: CURB + 60, z: 0 } };
  W.parking = { x0: 49.5, x1: 69.5, z0: 49.5, z1: 69.5 };
  W.plaza = { x0: -31, x1: 31, z0: -9, z1: 31, mic: { x: 0, z: 12 } };
  W.hall = { x0: -24, x1: 24, z0: -30, z1: -12, h: 30 };
  W.trigger = { minX: -22, maxX: 22, minY: 36, maxY: 56, minZ: -36, maxZ: -6 };
  W.spawn = { x: 57, z: 59.5, yaw: Math.PI };
  const reserved = [W.tower, W.parking, ...W.cafeDefs.map((c) => ({ x0: c.x0 - 5, x1: c.x1 + 5, z0: c.z0 - 5, z1: c.z1 + 5 }))];
  const hits = (a, b) => a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.z0 < b.z1 - 0.5 && a.z1 > b.z0 + 0.5;
  const styleBag = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 5];

  for (const b of blocks) {
    if (b.i === 1 && b.j === 1) continue; // 中央は広場
    const zx0 = b.x0 + 3, zz0 = b.z0 + 3, cell = (b.x1 - b.x0 - 6) / 3;
    for (let ci = 0; ci < 3; ci++) for (let cj = 0; cj < 3; cj++) {
      const lot = { x0: zx0 + ci * cell, x1: zx0 + (ci + 1) * cell, z0: zz0 + cj * cell, z1: zz0 + (cj + 1) * cell };
      if (reserved.some((r) => hits(lot, r))) continue;
      const inner = ci === 1 && cj === 1;
      const floors = inner ? 2 + Math.floor(rng() * 4) : 3 + Math.floor(Math.pow(rng(), 1.5) * 11);
      const ins = (edge) => (edge ? 0 : 0.5 + rng() * 1.3);
      const bb = addBuilding(lot.x0 + ins(ci === 0), lot.x1 - ins(ci === 2), lot.z0 + ins(cj === 0), lot.z1 - ins(cj === 2), 3.6 + floors * 3.3, pick(rng, styleBag));
      if (ci === 0) decorateFace(bb, -1, 0); if (ci === 2) decorateFace(bb, 1, 0);
      if (cj === 0) decorateFace(bb, 0, -1); if (cj === 2) decorateFace(bb, 0, 1);
    }
  }
  // 外周の建物（背景）
  for (let x = -156; x < 150; x += 22 + rng() * 6) {
    const w = 16 + rng() * 6;
    let bb = addBuilding(x, x + w, -129.5 - 14 - rng() * 8, -129.5, 3.6 + (3 + Math.floor(rng() * 9)) * 3.3, pick(rng, styleBag)); decorateFace(bb, 0, 1);
    bb = addBuilding(x, x + w, 129.5, 129.5 + 14 + rng() * 8, 3.6 + (3 + Math.floor(rng() * 9)) * 3.3, pick(rng, styleBag)); decorateFace(bb, 0, -1);
  }
  for (let z = -124; z < 108; z += 22 + rng() * 6) {
    const w = 16 + rng() * 6;
    let bb = addBuilding(-129.5 - 14 - rng() * 8, -129.5, z, z + w, 3.6 + (3 + Math.floor(rng() * 9)) * 3.3, pick(rng, styleBag)); decorateFace(bb, 1, 0);
    bb = addBuilding(129.5, 129.5 + 14 + rng() * 8, z, z + w, 3.6 + (3 + Math.floor(rng() * 9)) * 3.3, pick(rng, styleBag)); decorateFace(bb, -1, 0);
  }

  // ---------- 市役所と広場 ----------
  {
    const H = W.hall;
    addBuilding(H.x0, H.x1, H.z0, H.z1, H.h, 2, { exact: true, noShop: true, tag: 'hall' });
    B.box(M.concrete, 9, 9, 9, 0, CURB + H.h + 4.5, -21); // 時計塔
    B.cyl(M.white, 2.4, 2.4, 0.3, 0, CURB + H.h + 5.5, -16.4, 24, Math.PI / 2);
    B.box(M.concrete, 22, 0.5, 5, 0, CURB + 4.6, -9.6); // エントランス庇
    for (const sx of [-9, -3, 3, 9]) B.cyl(M.concrete, 0.35, 0.35, 4.4, sx, CURB + 2.2, -7.6, 12);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.1), new THREE.MeshStandardMaterial({ map: T.hallSign, roughness: 0.6 }));
    sign.position.set(0, CURB + 7.4, -11.9); scene.add(sign);
    // 広場
    B.add(M.plaza, planeXZ(62, 40, 2.4), xform(0, CURB + 0.012, 11));
    // ステージ
    B.box(M.wood, 18, 0.9, 4, 0, CURB + 0.45, -4.6); addCollider(-9, 9, -6.6, -2.6, CURB + 0.9);
    const kg = new THREE.PlaneGeometry(18, 0.9); { const uv = kg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 9); }
    B.add(M.kohaku, kg, xform(0, CURB + 0.45, -2.58));
    for (const sx of [-8.6, 8.6]) B.cyl(M.metalGray, 0.09, 0.09, 6, sx, CURB + 3.9, -6.2, 8);
    B.box(M.metalGray, 17.4, 0.12, 0.12, 0, CURB + 6.8, -6.2);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 4.1), new THREE.MeshStandardMaterial({ map: T.banner, roughness: 0.8, side: THREE.DoubleSide }));
    banner.position.set(0, CURB + 4.6, -6.15); banner.castShadow = true; scene.add(banner);
    // 街灯・ベンチ・植栽
    for (const [lx, lz] of [[-26, -2], [26, -2], [-26, 14], [26, 14], [-26, 28], [26, 28], [-10, 28], [10, 28]]) {
      B.cyl(M.metalDark, 0.07, 0.1, 4.6, lx, CURB + 2.3, lz, 8); B.add(M.lampGlobe, new THREE.SphereGeometry(0.3, 12, 8), xform(lx, CURB + 4.75, lz));
      W.lampPositions.push([lx, CURB + 4.75, lz]);
    }
    for (const [bx, bz, ry] of [[-22, 6, Math.PI / 2], [22, 6, Math.PI / 2], [-22, 22, Math.PI / 2], [22, 22, Math.PI / 2]]) {
      B.box(M.wood, 2.2, 0.08, 0.5, bx, CURB + 0.45, bz, ry); B.box(M.metalDark, 2.0, 0.4, 0.06, bx, CURB + 0.22, bz, ry);
    }
    for (const sx of [-30, 30]) B.box(M.hedge, 1.2, 0.9, 34, sx, CURB + 0.45, 12);
  }

  // ---------- 修羅タワー（パラグライダー発進点）----------
  {
    const Tw = W.tower;
    addBuilding(Tw.x0, Tw.x1, Tw.z0, Tw.z1, Tw.h, 0, { exact: true, noShop: true, noProps: true, noParapet: true, tag: 'tower' });
    const top = CURB + Tw.h;
    B.box(M.concrete, 28, 0.9, 0.28, -64, top + 0.45, Tw.z0 + 0.14); B.box(M.concrete, 28, 0.9, 0.28, -64, top + 0.45, Tw.z1 - 0.14);
    B.box(M.concrete, 0.28, 0.9, 19.2, Tw.x0 + 0.14, top + 0.45, 0);
    B.box(M.red, 5, 0.12, 4, -52.2, top + 0.09, 0); // 発進デッキ
    B.box(M.concrete, 5, 3, 4, -70, top + 1.5, 0); // エレベーター塔屋
    B.cyl(M.metalGray, 0.05, 0.05, 5, -51, top + 2.5, 8.6, 6); B.add(M.red, new THREE.ConeGeometry(0.35, 1.6, 8), xform(-51.9, top + 4.8, 8.6, 0, 0, Math.PI / 2));
    // 1F エレベーター入口
    B.box(M.metalDark, 0.3, 3.4, 4.4, -49.9, CURB + 1.7, 0);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshStandardMaterial({ map: T.towerSign, emissiveMap: T.towerSign, emissive: 0xffffff, emissiveIntensity: 1.2 }));
    sg.rotation.y = Math.PI / 2; sg.position.set(-49.72, CURB + 3.9, 0); scene.add(sg);
  }

  // ---------- コインパーキング ----------
  {
    const P = W.parking;
    const lot = new THREE.Mesh(planeXZ(20, 20, 5), M.asphalt); lot.position.set(59.5, CURB + 0.01, 59.5); lot.receiveShadow = true; scene.add(lot);
    const lines = new THREE.Mesh(planeXZ(20, 20), new THREE.MeshStandardMaterial({ map: T.parkingLines, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    lines.position.set(59.5, CURB + 0.02, 59.5); lines.receiveShadow = true; scene.add(lines);
    B.cyl(M.metalGray, 0.07, 0.07, 4.2, P.x0 + 0.6, CURB + 2.1, P.z0 + 0.6, 8);
    const ps = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.12), new THREE.MeshStandardMaterial({ map: T.pSign, emissiveMap: T.pSign, emissive: 0xffffff, emissiveIntensity: 1.0 }));
    ps.position.set(P.x0 + 0.6, CURB + 4.6, P.z0 + 0.6); scene.add(ps);
  }
  // カフェ本体は facility.js が建てる（コリジョンのみここで登録）
  for (const c of W.cafeDefs) c.collider = addCollider(c.x0, c.x1, c.z0, c.z1, CURB + 4.6, { cafeId: c.id });

  // ---------- 電柱・電線・街路樹 ----------
  const avoid = W.cafeDefs.map((c) => ({ x: (c.x0 + c.x1) / 2 + c.nx * 9, z: (c.z0 + c.z1) / 2 + c.nz * 9 }));
  avoid.push({ x: W.tower.elevator.x + 2, z: 0 }, { x: 59, z: 46.5 });
  const clear = (x, z, r = 11) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > r);
  const wirePts = [];
  const poleSpots = [-104, -80, -56, -24, 0, 24, 56, 80, 104];
  const addPole = (x, z, alongZ, k) => {
    B.cyl(M.pole, 0.14, 0.19, 9.6, x, CURB + 4.8, z, 8);
    B.box(M.metalDark, alongZ ? 1.9 : 0.1, 0.1, alongZ ? 0.1 : 1.9, x, CURB + 9.0, z);
    B.box(M.metalDark, alongZ ? 1.3 : 0.1, 0.1, alongZ ? 0.1 : 1.3, x, CURB + 8.2, z);
    if (k % 3 === 1) B.cyl(M.metalGray, 0.3, 0.3, 0.85, x + (alongZ ? 0.45 : 0), CURB + 7.4, z + (alongZ ? 0 : 0.45), 10);
  };
  const addWire = (ax, az, bx, bz, alongZ) => {
    for (const [off, y, sag] of [[-0.85, 9.1, 0.45], [0, 9.1, 0.5], [0.85, 9.1, 0.42], [0.55, 8.3, 0.6], [0, 7.2, 0.8]]) {
      const ox = alongZ ? off : 0, oz = alongZ ? 0 : off; let px = ax + ox, py = CURB + y, pz = az + oz;
      for (let s = 1; s <= 6; s++) {
        const t = s / 6, nx = ax + (bx - ax) * t + ox, nz = az + (bz - az) * t + oz, ny = CURB + y - sag * 4 * t * (1 - t);
        wirePts.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz;
      }
    }
  };
  for (const r of R) {
    let prev = null;
    poleSpots.forEach((p, k) => { const x = r + RH + 0.55; if (!clear(x, p)) { prev = null; return; } addPole(x, p, true, k); if (prev !== null) addWire(x, prev, x, p, true); prev = p; });
    prev = null;
    poleSpots.forEach((p, k) => { const z = r + RH + 0.55; if (!clear(p, z)) { prev = null; return; } addPole(p, z, false, k + 1); if (prev !== null) addWire(prev, z, p, z, false); prev = p; });
  }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15161a }))); }

  const blobBase = new THREE.IcosahedronGeometry(1, 2);
  const addTree = (x, z, sc) => {
    B.cyl(M.trunk, 0.12 * sc, 0.22 * sc, 3.6 * sc, x, CURB + 1.8 * sc, z, 7);
    const mat = pick(rng, M.foliage);
    for (let k = 0; k < 7; k++) { // 樹冠：小さな葉塊を楕円体状に重ねてシルエットを崩す
      const g = blobBase.clone(); const p = g.attributes.position; const sd = rng() * 10;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
        const n = 1 + 0.2 * Math.sin(px * 4.1 + sd) * Math.sin(py * 3.7 + sd * 1.3) * Math.sin(pz * 4.3 + sd * 0.7) + 0.09 * Math.sin(px * 11 + py * 9 + sd) + 0.05 * Math.sin(pz * 17 + py * 13 + sd);
        p.setXYZ(i, px * n, py * n, pz * n);
      }
      const a = rng() * 6.283, u = rng() * 2 - 1, rr = k === 0 ? 0 : 0.55 + rng() * 0.5, sq = Math.sqrt(1 - u * u);
      const s = (k === 0 ? 1.2 : 0.6 + rng() * 0.42) * sc;
      B.add(mat, g, xform(x + Math.cos(a) * sq * rr * 1.15 * sc, CURB + (5.1 + u * rr * 1.8) * sc, z + Math.sin(a) * sq * rr * 1.15 * sc, rng() * 6, rng(), rng(), s, s * 1.18, s));
    }
    B.add(M.leaves, planeXZ(3.2, 3.2), xform(x, CURB + 0.014, z, rng() * 6));
  };
  for (const r of R) for (let p = -108; p <= 108; p += 13.5) {
    if (R.some((q) => Math.abs(p - q) < 13)) continue;
    const jit = (rng() - 0.5) * 2;
    if (clear(r - RH - 1.35, p + jit, 10)) addTree(r - RH - 1.35, p + jit, 0.85 + rng() * 0.35);
    if (clear(p + jit, r - RH - 1.35, 10)) addTree(p + jit, r - RH - 1.35, 0.85 + rng() * 0.35);
  }
  for (const [tx, tz] of [[-28, 30], [-14, 30], [14, 30], [28, 30]]) addTree(tx, tz, 1.1);

  // ---------- 遠景：工業地帯・赤い吊り橋・山並み ----------
  {
    for (let k = 0; k < 9; k++) {
      const x = -520 + k * 130 + rng() * 40, z = -330 - rng() * 160, h = 70 + rng() * 60;
      for (let s = 0; s < 6; s++) B.cyl(s % 2 ? M.chimneyW : M.chimneyR, 2.6 - s * 0.12, 2.8 - s * 0.12, h / 6, x, h / 6 * (s + 0.5), z, 12);
      B.box(M.factory, 60 + rng() * 60, 14 + rng() * 14, 40, x + 30, 10, z + 10);
      if (rng() < 0.6) B.add(M.chimneyW, new THREE.SphereGeometry(14, 16, 12), xform(x - 40, 14, z - 20));
    }
    for (const sx of [-150, 150]) { B.box(M.bridge, 5, 110, 5, sx + 360, 55, -470); B.box(M.bridge, 5, 110, 5, sx + 360, 55, -494); B.box(M.bridge, 5, 4, 28, sx + 360, 96, -482); }
    B.box(M.bridge, 640, 3, 26, 360, 34, -482);
    const cablePts = [];
    for (const zz of [-470, -494]) for (let s = 0; s < 24; s++) {
      const t0 = s / 24, t1 = (s + 1) / 24; const f = (t) => { const x = 40 + 640 * t; const u = (x - 360) / 150; return [x, Math.abs(u) <= 1 ? 40 + 70 * u * u : 110 - 76 * Math.min(1, (Math.abs(u) - 1) / 1.13), zz]; };
      cablePts.push(...f(t0), ...f(t1));
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3)); scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xa33026 })));
    // 山並み（霞んだシルエット）
    const mg = new THREE.CylinderGeometry(1500, 1500, 1, 96, 1, true); const mp = mg.attributes.position; const mr = makeRng(55);
    const prof = []; for (let i = 0; i < 97; i++) prof.push(90 + 150 * Math.abs(Math.sin(i * 0.31 + 1)) + 110 * Math.abs(Math.sin(i * 0.11 + 2)) + mr() * 30);
    prof[96] = prof[0];
    for (let i = 0; i < mp.count; i++) if (mp.getY(i) > 0) { const a = Math.atan2(mp.getZ(i), mp.getX(i)); const idx = Math.round(((a + Math.PI) / (Math.PI * 2)) * 96); const north = mp.getZ(i) < -400 ? 0.35 : 1; mp.setY(i, prof[idx] * north); } else mp.setY(i, -5);
    const mm = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.36, 0.33, 0.36), side: THREE.BackSide, fog: false })); scene.add(mm); W.mountains = mm;
    const mg2 = mg.clone(); const mm2 = new THREE.Mesh(mg2, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.52, 0.45, 0.42), side: THREE.BackSide, fog: false }));
    mm2.scale.set(1.5, 0.75, 1.5); mm2.rotation.y = 1.3; scene.add(mm2); W.mountains2 = mm2;
  }

  B.build(scene);

  // ---------- コリジョン用グリッド ----------
  const CELL = 16, OFF = 176, NC = 22;
  const grid = Array.from({ length: NC * NC }, () => []);
  const cidx = (v) => clamp(Math.floor((v + OFF) / CELL), 0, NC - 1);
  W.addToGrid = (c) => { for (let gz = cidx(c.minZ - 3); gz <= cidx(c.maxZ + 3); gz++) for (let gx = cidx(c.minX - 3); gx <= cidx(c.maxX + 3); gx++) grid[gz * NC + gx].push(c); };
  for (const c of W.colliders) W.addToGrid(c);
  W.near = (x, z) => grid[cidx(z) * NC + cidx(x)];
  W.groundAt = (x, z, y) => {
    let g = W.baseHeight(x, z);
    for (const c of W.near(x, z)) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y >= c.h - 0.6 && c.h > g) g = c.h;
    return g;
  };
  // 円 vs AABB の押し出し。p は {x,z} を持つ任意のオブジェクト
  const hit = { nx: 0, nz: 0, c: null, depth: 0 };
  W.resolveCircle = (p, r, y) => {
    let found = null; hit.depth = 0;
    for (const c of W.near(p.x, p.z)) {
      if (y >= c.h - 0.35) continue;
      const qx = clamp(p.x, c.minX, c.maxX), qz = clamp(p.z, c.minZ, c.maxZ);
      let dx = p.x - qx, dz = p.z - qz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, depth;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; } else {
        const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z, m = Math.min(l, rr, t, b);
        if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
        depth = m + r;
      }
      p.x += nx * depth; p.z += nz * depth;
      if (depth > hit.depth) { hit.depth = depth; hit.nx = nx; hit.nz = nz; hit.c = c; found = hit; }
    }
    return found;
  };
  // レイ vs 全コリジョン（カメラ・弾用）
  W.raycast = (ox, oy, oz, dx, dy, dz, maxT) => {
    let best = maxT; W.rayHit = null;
    if (dy < -1e-6) { const t = (0.05 - oy) / dy; if (t > 0 && t < best) best = t; }
    for (const c of W.colliders) {
      let t0 = 0, t1 = best, a, b;
      if (Math.abs(dx) < 1e-8) { if (ox < c.minX || ox > c.maxX) continue; } else { a = (c.minX - ox) / dx; b = (c.maxX - ox) / dx; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (Math.abs(dy) < 1e-8) { if (oy < 0 || oy > c.h) continue; } else { a = (0 - oy) / dy; b = (c.h - oy) / dy; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-8) { if (oz < c.minZ || oz > c.maxZ) continue; } else { a = (c.minZ - oz) / dz; b = (c.maxZ - oz) / dz; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (t0 < best) { best = t0; W.rayHit = c; }
    }
    return best;
  };
  W.blocks = blocks;
  return W;
}
