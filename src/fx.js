// エフェクト：パーティクル、破片（Fracture）、衝撃波、ロケット花火
import * as THREE from 'three';

class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap; this.i = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float psize; attribute vec4 pcolor; varying vec4 vColor; uniform float uScale;
        void main(){ vColor = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(psize * uScale / max(0.1, -mv.z), 512.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(1.0, 0.0, dot(d, d) * 4.0);
          if (vColor.a * a < 0.003) discard; gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, a, s0, s1, life, grav = 0, drag = 0) {
    const i = this.i; this.i = (i + 1) % this.cap; const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0; this.a0[i] = a; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const { pos, vel, life, max, col, size, s0, s1, a0, grav, drag, cap } = this;
    for (let i = 0; i < cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
      const i3 = i * 3, dk = Math.exp(-drag[i] * dt);
      vel[i3] *= dk; vel[i3 + 1] = vel[i3 + 1] * dk - grav[i] * dt; vel[i3 + 2] *= dk;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.03) { pos[i3 + 1] = 0.03; vel[i3 + 1] *= -0.25; vel[i3] *= 0.6; vel[i3 + 2] *= 0.6; }
      const t = 1 - life[i] / max[i];
      size[i] = s0[i] + (s1[i] - s0[i]) * t; col[i * 4 + 3] = a0[i] * (1 - t * t);
    }
    const at = this.points.geometry.attributes; at.position.needsUpdate = true; at.pcolor.needsUpdate = true; at.psize.needsUpdate = true;
  }
}

const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 6000, true);
    this.soft = new Particles(scene, 2600, false);
    this.rockets = [];
    // 破片
    this.debCap = 110; this.deb = [];
    this.debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), this.debCap);
    this.debMesh.frustumCulled = false; this.debMesh.castShadow = true; this.debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const z = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.debCap; i++) { this.debMesh.setMatrixAt(i, z); this.debMesh.setColorAt(i, white); this.deb.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3() }); }
    this.debI = 0; scene.add(this.debMesh);
    // 衝撃波（太鼓の Audio_Wave_Collider の可視化）
    this.waves = [];
    const waveMat = () => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 0.75, 0.3) }, uAlpha: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uColor * (0.5 + f * 3.0), uAlpha * (0.05 + f)); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const sg = new THREE.SphereGeometry(1, 40, 20), rg = new THREE.RingGeometry(0.93, 1, 72); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(sg, waveMat()); s.visible = false; s.renderOrder = 12; scene.add(s);
      const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); r.visible = false; r.renderOrder = 12; scene.add(r);
      this.waves.push({ s, r, t: 0, dur: 0, R: 0, on: false });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color();
  }
  setViewport(h, fovDeg) { const k = h / (2 * Math.tan((fovDeg * Math.PI) / 360)); this.add.mat.uniforms.uScale.value = k; this.soft.mat.uniforms.uScale.value = k; }

  sparks(x, y, z, n, c, speed = 6, life = 0.6, size = 0.08, grav = 9, up = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = Math.acos(rnd()), sp = speed * (0.4 + Math.random() * 0.6);
      this.add.emit(x, y, z, Math.cos(a) * Math.sin(e) * sp, Math.cos(e) * sp + up * speed, Math.sin(a) * Math.sin(e) * sp, c[0], c[1], c[2], 1, size, size * 0.3, life * (0.5 + Math.random() * 0.5), grav, 1.2);
    }
  }
  puff(x, y, z, n, c, size = 0.8, life = 1.0, spread = 1, rise = 0.6, alpha = 0.5) {
    for (let i = 0; i < n; i++) this.soft.emit(x + rnd(spread * 0.3), y + rnd(spread * 0.3), z + rnd(spread * 0.3), rnd(spread), Math.random() * rise + rnd(spread * 0.3), rnd(spread), c[0], c[1], c[2], alpha, size * 0.4, size * (1.2 + Math.random()), life * (0.6 + Math.random() * 0.6), -0.2, 1.5);
  }
  mist(x, y, z, dx, dy, dz, c) { // 洗脳スプレー
    for (let i = 0; i < 3; i++) {
      const sp = 7 + Math.random() * 4;
      this.soft.emit(x, y, z, dx * sp + rnd(1.3), dy * sp + rnd(1.3), dz * sp + rnd(1.3), c[0], c[1], c[2], 0.34, 0.12, 1.5 + Math.random(), 0.75 + Math.random() * 0.3, -0.3, 2.2);
    }
    this.add.emit(x, y, z, dx * 9 + rnd(1.5), dy * 9 + rnd(1.5), dz * 9 + rnd(1.5), c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, 0.8, 0.07, 0.02, 0.5, 1, 2);
  }
  paint(x, y, z, c) {
    this.puff(x, y, z, 8, c, 0.7, 0.6, 2.0, 0.8, 0.85);
    for (let i = 0; i < 12; i++) this.soft.emit(x, y, z, rnd(4), Math.random() * 4, rnd(4), c[0], c[1], c[2], 1, 0.14, 0.06, 0.7, 12, 0.5);
  }
  burst(x, y, z, c, n = 70, power = 11) { // 花火の開花
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = Math.acos(rnd()), sp = power * (0.75 + Math.random() * 0.35);
      this.add.emit(x, y, z, Math.cos(a) * Math.sin(e) * sp, Math.cos(e) * sp, Math.sin(a) * Math.sin(e) * sp, c[0] * 3, c[1] * 3, c[2] * 3, 1, 0.34, 0.1, 1.2 + Math.random() * 0.7, 2.6, 1.6);
    }
    this.add.emit(x, y, z, 0, 0, 0, c[0] * 6, c[1] * 6, c[2] * 6, 1, 7, 2, 0.25, 0, 0);
  }
  rocket(x, y, z, vx, vy, vz, c, fuse = 1.2, onBoom = null) { this.rockets.push({ x, y, z, vx, vy, vz, c, fuse, onBoom }); }
  shockwave(x, y, z, R, dur, colorHex = 0xffb040) {
    const w = this.waves.find((k) => !k.on) || this.waves[0];
    w.on = true; w.t = 0; w.dur = dur; w.R = R; w.s.position.set(x, y, z); w.r.position.set(x, 0.2, z);
    w.s.material.uniforms.uColor.value.setHex(colorHex); w.r.material.color.setHex(colorHex); w.s.visible = w.r.visible = true;
  }
  debris(x, y, z, n, colorHex, speed = 6, size = 0.3) {
    for (let k = 0; k < n; k++) {
      const i = this.debI; this.debI = (i + 1) % this.debCap; const d = this.deb[i];
      d.life = 3 + Math.random() * 2; d.p.set(x + rnd(0.3), y + rnd(0.6), z + rnd(0.3)); d.v.set(rnd(speed), Math.random() * speed * 0.9 + 1, rnd(speed));
      d.r.set(rnd(3), rnd(3), rnd(3)); d.w.set(rnd(8), rnd(8), rnd(8)); d.s.set(size * (0.3 + Math.random()), size * (0.3 + Math.random()), size * (0.4 + Math.random() * 1.6));
      this.debMesh.setColorAt(i, this._c.setHex(colorHex).multiplyScalar(0.6 + Math.random() * 0.6));
    }
    this.debMesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.fuse -= dt; r.vy -= 3 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      this.add.emit(r.x, r.y, r.z, rnd(0.6), -1, rnd(0.6), 3, 2.2, 1.0, 1, 0.16, 0.03, 0.45, 2, 1);
      if (r.fuse <= 0) { this.burst(r.x, r.y, r.z, r.c); if (r.onBoom) r.onBoom(r); this.rockets.splice(i, 1); }
    }
    this.add.update(dt); this.soft.update(dt);
    let any = false;
    for (let i = 0; i < this.debCap; i++) {
      const d = this.deb[i]; if (d.life <= 0) continue; any = true; d.life -= dt;
      d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.08) { d.p.y = 0.08; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      if (d.life <= 0) this._m.makeScale(0, 0, 0); else { const k = Math.min(1, d.life); this._q.setFromEuler(d.r); this._m.compose(d.p, this._q, d.s); if (k < 1) this._m.scale(d.w.set(k, k, k)); }
      this.debMesh.setMatrixAt(i, this._m);
    }
    if (any) this.debMesh.instanceMatrix.needsUpdate = true;
    for (const w of this.waves) {
      if (!w.on) continue; w.t += dt; const k = Math.min(1, w.t / w.dur), R = Math.max(0.01, w.R * k);
      w.s.scale.setScalar(R); w.r.scale.set(R, 1, R); const fade = w.t > w.dur ? Math.max(0, 1 - (w.t - w.dur) / 0.35) : 1;
      w.s.material.uniforms.uAlpha.value = 0.9 * fade; w.r.material.opacity = 0.8 * fade;
      if (fade <= 0) { w.on = false; w.s.visible = w.r.visible = false; }
    }
  }
}
