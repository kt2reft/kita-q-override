// KITA-Q OVERRIDE — エントリーポイント：レンダラー、空・ライティング、ポストプロセス、ゲームループ
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildTextures } from './textures.js';
import { buildWorld } from './world.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { NPCSystem, Law } from './npc.js';
import { Traffic } from './traffic.js';
import { Vehicles } from './vehicles.js';
import { Facilities } from './facility.js';
import { Player } from './player.js';
import { Mission } from './mission.js';
import { UI } from './ui.js';
import { Input, isTouchDevice } from './input.js';
import { CFG } from './config.js';
import { damp } from './utils.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const QUALITY = {
  high: { name: '高画質', pr: 1.5, msaa: 4, ao: true, bloom: true, shadow: 4096 },
  mid: { name: '標準', pr: 1.25, msaa: 4, ao: false, bloom: true, shadow: 2048 },
  low: { name: '軽量', pr: 1.0, msaa: 0, ao: false, bloom: false, shadow: 1024 },
};
// レンズ表現（色収差・周辺減光・フィルムグレイン・軽いコントラスト）で写真的なルックに寄せる
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.045 }, uVig: { value: 0.42 }, uCA: { value: 0.012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVig, uCA; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
    void main(){ vec2 c = vUv - 0.5; float r2 = dot(c, c); vec2 off = c * r2 * uCA;
      vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      col *= 1.0 - uVig * smoothstep(0.12, 0.8, r2 * 1.7);
      col += (hash(gl_FragCoord.xy) - 0.5) * uGrain * (1.0 - 0.5 * dot(col, vec3(0.333)));
      gl_FragColor = vec4(col, 1.0); }`,
};

const G = (window.G = { noAO: [], started: false, paused: false, time: 0, fps: 60, shake: 0, quality: 'high', qualityName: '', stats: { kakuuchi: 0, lights: 0, cars: 0 } });

function showError(e) { const el = $('err'); if (el) el.textContent += `${e && e.stack ? e.stack : e}\n`; }
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

function init() {
  // スマホ・タブレットは既定で軽量側に寄せ、群衆・交通量も控えめにする
  const TOUCH = (G.touch = isTouchDevice());
  if (TOUCH) {
    document.body.classList.add('touch');
    G.quality = 'low'; const q = $('quality'); if (q) q.value = 'low';
    CFG.AMBIENT_NPCS = 36; CFG.TRAFFIC_CARS = 11;
  }
  const renderer = (G.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.66;
  const scene = (G.scene = new THREE.Scene());
  const camera = (G.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.25, 7000));
  camera.position.set(80, 20, 110);

  // ---- 空（大気散乱）と IBL：夕方の斜光 ----
  const elev = (25 * Math.PI) / 180, sunDir = new THREE.Vector3(-0.82 * Math.cos(elev), Math.sin(elev), 0.57 * Math.cos(elev)).normalize();
  const mkSky = () => { const s = new Sky(); s.scale.setScalar(6000); const u = s.material.uniforms; u.turbidity.value = 6.5; u.rayleigh.value = 2.3; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85; u.sunPosition.value.copy(sunDir); return s; };
  { const skyMesh = mkSky(); scene.add(skyMesh); G.noAO.push(skyMesh); }
  { const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(mkSky()); scene.environment = pm.fromScene(es, 0, 1, 9000).texture; scene.environmentIntensity = 0.62; pm.dispose(); }
  scene.fog = new THREE.FogExp2(new THREE.Color(0.62, 0.5, 0.42), 0.0019);
  const sun = (G.sun = new THREE.DirectionalLight(0xffcb96, 5.2)); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 560; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target); scene.add(new THREE.HemisphereLight(0xb9ccff, 0x6a5848, 0.6));
  G.sunDir = sunDir;

  const T = (G.T = buildTextures());
  { // 雲レイヤー
    T.cloud.repeat.set(2.5, 2.5);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshBasicMaterial({ map: T.cloud, alphaMap: T.cloudMask, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.5, 1.1, 0.9), opacity: 0.8 }));
    cl.rotation.x = Math.PI / 2; cl.position.y = 1250; cl.renderOrder = -1; scene.add(cl); G.clouds = cl; G.noAO.push(cl);
  }
  G.world = buildWorld(scene, T); G.noAO.push(G.world.mountains, G.world.mountains2);
  G.fx = new FX(scene); for (const w of G.fx.waves) G.noAO.push(w.s, w.r);
  G.audio = new AudioSys();
  G.ui = new UI(G);
  G.law = new Law(G);
  G.traffic = new Traffic(G);
  G.vehicles = new Vehicles(G);
  G.facilities = new Facilities(G);
  G.mission = new Mission(G);
  G.player = new Player(G);
  G.npcs = new NPCSystem(G);
  G.npcs.populate();
  G.facilities.spawnItem('cup', 44, 46.5);

  let firstYankee = true, zoneToast = 0;
  G.onYankeeFied = (n, src) => {
    if (firstYankee && n.kind !== 'quest') { firstYankee = false; G.ui.toast('ヤンキー化成功！ 舎弟として追従する（<b>G</b> でヤンキー座り）', 'shura'); }
    else if (src.cause === 'zone' && G.time - zoneToast > 8) { zoneToast = G.time; G.ui.toast('修羅ゾーンの空気で市民がヤンキー化した', 'shura'); }
    else if (src.cause === 'traffic') G.ui.toast('交通崩壊にブチ切れた市民がヤンキー化', 'shura');
  };

  // ---- 入力（キーボード・マウス / タッチ / ゲームパッド） ----
  const input = (G.input = new Input(G, canvas));
  input.attach();
  // タッチでは pointerdown の直後に合成 click が飛んでくるため、連続トグルを無視する
  let helpT = 0;
  const toggleHelp = () => {
    const now = performance.now(); if (now - helpT < 320) return; helpT = now;
    const h = $('help'); h.classList.toggle('hidden');
    G.paused = !h.classList.contains('hidden');
    if (G.paused) document.exitPointerLock?.();
  };
  const togglePause = () => {
    G.paused = !G.paused;
    const how = input.scheme === 'touch' ? 'II ボタンで再開' : input.scheme === 'pad' ? 'START で再開' : 'P で再開';
    G.ui.banner(G.paused ? 'PAUSE' : '', G.paused ? how : '', G.paused ? 9999 : 0.01);
  };
  // click ではなく pointerdown で閉じる：タッチでボタンから開いた直後に合成 click が重なるため。
  // カード内のタップはスクロール用に残し、背景か「閉じる」行で閉じる
  $('help').addEventListener('pointerdown', (e) => {
    const card = e.target.closest?.('.help-card');
    if (!card || e.target.classList.contains('close')) toggleHelp();
  });

  // ---- ポストプロセス ----
  let film = null;
  function buildComposer() {
    const q = QUALITY[G.quality], pr = Math.min(devicePixelRatio || 1, q.pr * (G.touch ? 0.8 : 1)), w = Math.max(2, Math.floor(innerWidth * pr)), h = Math.max(2, Math.floor(innerHeight * pr));
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
    if (G.composer) { G.composer.renderTarget1.dispose(); G.composer.renderTarget2.dispose(); }
    const composer = (G.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa })));
    composer.addPass(new RenderPass(scene, camera));
    if (q.ao) {
      const ao = new GTAOPass(scene, camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.5, thickness: 1.3, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 2, rings: 2, samples: 12 });
      // 空・雲・加算エフェクトは AO の法線/深度プリパスから除外する
      const ov = ao.overrideVisibility.bind(ao); ao.overrideVisibility = () => { ov(); for (const o of G.noAO) o.visible = false; };
      composer.addPass(ao);
    }
    if (q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.7, 1.1));
    composer.addPass(new OutputPass());
    film = new ShaderPass(FilmShader); composer.addPass(film);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    G.fx.setViewport(h, camera.fov); G.qualityName = q.name;
    if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  }
  G.setQuality = (name) => { if (!QUALITY[name]) return; G.quality = name; buildComposer(); };
  buildComposer();
  addEventListener('resize', buildComposer);

  // ---- タイトル ----
  const startBtn = $('start'); startBtn.disabled = false; startBtn.textContent = '修羅の国へ';
  const startGame = () => {
    if (G.started) return;
    G.audio.voice = $('voice').checked; G.audio.init(); if ($('quality').value !== G.quality) G.setQuality($('quality').value);
    if (G.touch) { try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch (e) {} }
    G.started = true; $('title').classList.add('gone'); G.ui.showHUD(true); G.mission.objective(); input.lock(); input.showTouch(true);
    G.player.camT.set(G.player.pos.x, G.player.pos.y + 1.6, G.player.pos.z);
    setTimeout(() => G.ui.toast(G.input.touch ? '画面下の武器リストをタップして切替：洗脳スプレー／ごぼ天ソードで市民の Infection_Meter を上げろ' : '1：洗脳スプレー／2：ごぼ天ソード で市民の Infection_Meter を上げろ', 'info'), 600);
    setTimeout(() => G.ui.toast('目の前のダンプ（<b>E</b>）でオーガニックカフェ（緑の光柱）に突っ込め', 'info'), 2600);
    setTimeout(() => G.ui.toast(G.touch ? '画面上の ？ ボタンで操作説明' : input.scheme === 'pad' ? 'SELECT：操作説明' : 'H：操作説明', 'info'), 4600);
  };
  startBtn.addEventListener('click', startGame);
  // パッドのボタンだけで開始した場合、AudioContext が suspended のままになることがある
  for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, () => { try { G.audio.ctx?.resume?.(); } catch (e) {} }, { passive: true });

  // ---- ループ ----
  let last = performance.now(), slowT = 0, sinceSwitch = 0, diagT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now; if (dt > 0.25) dt = 0.016; const raw = dt; dt = Math.min(dt, 0.05);
    G.fps = damp(G.fps, 1 / Math.max(raw, 1e-4), 2, raw);
    input.beginFrame(dt);
    if (!G.started) { if (input.anyPress) startGame(); }
    else {
      if (input.hitKey('KeyH') || input.hit('VHelp')) toggleHelp();
      if (input.hitKey('KeyP') || input.hit('VPause')) togglePause();
      if (input.hitKey('F2')) { input.diag = !input.diag; const d = $('paddiag'); d.classList.toggle('show', input.diag); if (input.diag) d.innerHTML = input.diagText(); }
    }
    // コントローラ診断（ポーズ中も更新する）
    if (input.diag && ++diagT % 6 === 0) $('paddiag').innerHTML = input.diagText();
    if (!G.paused) {
      G.time += dt; G.dt = dt;
      G.vehicles.update(dt);
      G.player.update(dt);
      G.traffic.update(dt);
      G.npcs.update(dt);
      G.law.update(dt);
      G.facilities.update(dt);
      G.mission.update(dt);
      G.fx.update(dt);
      const P = G.player;
      if (!G.started) { const a = G.time * 0.045 + 0.7; camera.position.set(22 + Math.sin(a) * 74, 19 + Math.sin(G.time * 0.1) * 5, 26 + Math.cos(a) * 74); camera.lookAt(10, 9, 14); }
      else if (!G.mission.cutscene) P.updCamera(dt);
      G.shake = Math.max(0, (G.shake || 0) - dt * 1.8);
      const fx = G.mission.cutscene ? 0 : G.started ? P.pos.x : 20, fz = G.mission.cutscene ? 12 : G.started ? P.pos.z : 20;
      sun.target.position.set(fx, 0, fz); sun.position.set(fx + sunDir.x * 260, sunDir.y * 260, fz + sunDir.z * 260); sun.target.updateMatrixWorld();
      G.clouds.position.x = camera.position.x; G.clouds.position.z = camera.position.z; T.cloud.offset.x += dt * 0.0012;
      const amb = G.started ? G.facilities.ambience(P.pos.x, P.pos.z) : { classical: 0, enka: 0 }; G.audio.update(dt, amb);
      G.ui.update(dt);
      // 自動画質調整
      sinceSwitch += raw;
      if (G.started && G.fps < 27 && sinceSwitch > 5) { slowT += raw; if (slowT > 3.5 && G.quality !== 'low') { G.setQuality(G.quality === 'high' ? 'mid' : 'low'); G.ui.toast(`描画負荷が高いため画質を「${G.qualityName}」に下げた`, 'info'); slowT = 0; sinceSwitch = 0; } } else slowT = 0;
    }
    input.endFrame();
    if (film) film.uniforms.uTime.value = G.time % 100;
    G.composer.render(dt);
  }
  requestAnimationFrame(frame);
}

setTimeout(() => { try { init(); } catch (e) { showError(e); console.error(e); } }, 30);
