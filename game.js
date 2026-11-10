// Iron Tide: online co-op third-person robot-wave shooter.
// One phone hosts (runs the robots, waves and pickups); each phone owns its own
// player (movement, health, shots). Connection is peer-to-peer via PeerJS.
import * as THREE from 'three';
import { EffectComposer } from './lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from './lib/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from './lib/jsm/environments/RoomEnvironment.js';

// ===================================================================== basics
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = v => Math.round(v * 100) / 100;
const qs = new URLSearchParams(location.search);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmpV = V(), tmpV2 = V(), tmpV3 = V();
function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function toast(msg, ms = 2200) { const t = $("toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = "none", ms); }
const COARSE = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

const COLORS = ["#2ef2ff", "#ff2e88", "#b6ff2e", "#ffb02e", "#a46bff", "#ffffff"];
const ID_PREFIX = "irontide-v1-";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";

// ===================================================================== tuning
const HALF = 35, GRAV = 26, JUMPV = 9.2, STEP = 0.5;
const P_R = 0.42, P_H = 1.8, P_SPEED = 7.2;
const BREAK_TIME = 22, BLEED_TIME = 25, REVIVE_TIME = 3, REVIVE_DIST = 2.6;

const WEAPONS = {
  rifle:   { name: "Pulse Rifle", auto: true, rate: 8, dmg: 14, pellets: 1, spread: 0.012, max: Infinity, color: 0x2ef2ff },
  shotgun: { name: "Scattergun", auto: true, rate: 1.5, dmg: 13, pellets: 9, spread: 0.075, max: 30, color: 0xffb02e },
  rail:    { name: "Rail Gun", auto: true, rate: 0.85, dmg: 150, pellets: 1, spread: 0, max: 12, color: 0xa46bff, pierce: true },
  rocket:  { name: "Rocket Launcher", auto: true, rate: 1.1, dmg: 130, pellets: 1, spread: 0, max: 10, color: 0xff7a2e, rocket: true, splash: 4.2 }
};
const WORDER = ["rifle", "shotgun", "rail", "rocket"];

const UPGRADES = [
  { id: "dmg", name: "Damage", desc: "+15% weapon damage", max: 6, cost: [120, 200, 300, 420, 560, 720] },
  { id: "rate", name: "Fire rate", desc: "+12% fire rate", max: 5, cost: [120, 200, 300, 420, 560] },
  { id: "hp", name: "Max health", desc: "+25 max health", max: 5, cost: [100, 170, 260, 370, 500] },
  { id: "armor", name: "Plating", desc: "-8% damage taken", max: 4, cost: [140, 240, 360, 520] },
  { id: "speed", name: "Servo legs", desc: "+7% move speed", max: 3, cost: [120, 220, 340] }
];
const BUY_WEAPONS = [
  { id: "shotgun", cost: 180, desc: "Huge damage up close" },
  { id: "rail", cost: 320, desc: "Pierces every robot in a line" },
  { id: "rocket", cost: 400, desc: "Splash damage, rocket-jump" }
];
const AMMO_COST = 60;

const ETYPES = {
  drone:   { hp: 35,  speed: 6.5, r: 0.55, h: 0.9, fly: true, reward: 15, fire: 1.7, range: 32, bolt: 7,  boltSpd: 20 },
  grunt:   { hp: 75,  speed: 4.2, r: 0.5,  h: 1.95, reward: 20, fire: 2.2, burst: 3, range: 32, bolt: 7, boltSpd: 24, keep: 12, gltf: 0xd0602a, head: true },
  sniper:  { hp: 60,  speed: 3.8, r: 0.5,  h: 2.05, reward: 35, fire: 5.0, charge: 1.6, range: 70, bolt: 32, boltSpd: 75, keep: 27, gltf: 0x8a5cff, head: true },
  bulwark: { hp: 280, speed: 2.7, r: 0.8,  h: 2.7, reward: 50, fire: 2.6, range: 22, bolt: 8, boltSpd: 19, spreadN: 5, keep: 6, shield: true, gltf: 0x3c78c8, head: true },
  rusher:  { hp: 45,  speed: 8.4, r: 0.5,  h: 1.2, reward: 15, boom: 36, fuse: 0.65 },
  tank:    { hp: 420, speed: 2.3, r: 1.15, h: 2.6, reward: 60, fire: 3.0, range: 45, mortar: 26, keep: 16 },
  boss:    { hp: 2700, speed: 2.4, r: 1.9, h: 6.4, reward: 400, fire: 2.2, range: 60, bolt: 12, boltSpd: 18, mortar: 30, keep: 14, gltf: 0xc01428, head: true }
};
const ENAMES = { drone: "Drone", grunt: "Trooper", sniper: "Sniper", bulwark: "Bulwark", rusher: "Rusher", tank: "Mortar tank", boss: "Titan" };
// hit spheres: [yOffset, radius] measured from the feet (drones from their center). Last sphere of a "head" type is a weak point (crit).
const HITS = {
  drone: [[0, 0.62]], rusher: [[0.6, 0.62]],
  tank: [[0.7, 1.15], [1.7, 0.95]],
  player: [[0.5, 0.42], [1.05, 0.42], [1.6, 0.3]]
};
for (const k in ETYPES) if (ETYPES[k].gltf) { const h = ETYPES[k].h; HITS[k] = [[0.2 * h, 0.17 * h], [0.46 * h, 0.21 * h], [0.78 * h, 0.2 * h]]; }
const CRIT_MUL = 2;

// ===================================================================== profile
let myName = store("it-name") || "", myColor = clamp(+(store("it-color") || 0), 0, COLORS.length - 1);
$("nameIn").value = myName;
COLORS.forEach((c, i) => { const d = document.createElement("div"); d.className = "sw" + (i === myColor ? " sel" : ""); d.style.boxShadow = "inset 0 0 0 6px " + c + ",0 0 12px " + c; d.onclick = () => { myColor = i; store("it-color", i); document.querySelectorAll(".sw").forEach((s, j) => s.classList.toggle("sel", j === i)); }; $("colors").appendChild(d); });
$("nameIn").oninput = () => { myName = $("nameIn").value.trim(); store("it-name", myName); };
const nameOr = (n, d) => (n || "").trim().slice(0, 12) || d;
function showBest() { const b = +(store("it-best") || 0); $("best").textContent = b ? "Best: wave " + b : ""; }
showBest();

// ===================================================================== audio
let actx = null, noiseBuf = null, master = null, sfxBus = null, musBus = null;
function ac() {
  if (!actx) { try {
    actx = new (window.AudioContext || window.webkitAudioContext)(); const n = actx.sampleRate; noiseBuf = actx.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    master = actx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.connect(actx.destination);
    sfxBus = actx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musBus = actx.createGain(); musBus.gain.value = MUS.on ? 0.55 : 0; musBus.connect(master);
    loadSounds();
  } catch (e) {} }
  if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  return actx;
}
function tone(freq, dur = 0.08, type = "sine", vol = 0.1, slide = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.3, vol = 0.2, freq = 800, type = "lowpass", bus) {
  const a = ac(); if (!a || !noiseBuf) return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noiseBuf; s.loopStart = Math.random() * 0.5; f.type = type; f.frequency.setValueAtTime(freq, t); if (type === "lowpass") f.frequency.exponentialRampToValueAtTime(60, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(bus || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur);
}
// recorded sounds (made for this game)
const BUF = {};
function loadSounds() {
  for (const n of ["boom", "rifle", "robodie", "vo_wave", "vo_titan", "vo_clear"]) fetch("assets/" + n + ".mp3").then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(d => BUF[n] = d).catch(() => {});
}
function playBuf(n, vol = 1, rate = 1) {
  if (!actx || !BUF[n]) return false;
  const s = actx.createBufferSource(), g = actx.createGain(); s.buffer = BUF[n]; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g).connect(sfxBus); s.start(); return true;
}
let voT = 0;
function voice(n) { const now = performance.now(); if (now - voT < 1500) return; voT = now; playBuf(n, 1.1); }
function distVol(p) { if (!camera) return 1; return clamp(1 - camera.position.distanceTo(p) / 60, 0.05, 1); }
const SFX = {
  rifle: () => { if (!playBuf("rifle", 0.32, rand(0.95, 1.08))) tone(900, 0.07, "square", 0.05, 0.35); },
  shotgun: () => { noise(0.3, 0.32, 2800); tone(140, 0.18, "square", 0.08, 0.45); playBuf("rifle", 0.25, 0.55); },
  rail: () => { tone(2200, 0.5, "sawtooth", 0.06, 0.12); noise(0.25, 0.1, 6000); tone(90, 0.4, "sine", 0.2, 0.5); },
  rocket: () => { noise(0.45, 0.14, 1200); tone(220, 0.35, "sawtooth", 0.04, 0.4); },
  boom: (v = 1) => { if (!playBuf("boom", 0.9 * v, rand(0.85, 1.1))) { noise(0.7, 0.35 * v, 900); tone(70, 0.5, "sine", 0.25 * v, 0.4); } },
  hit: () => tone(1400, 0.04, "square", 0.035),
  crit: () => { tone(2400, 0.05, "square", 0.04); tone(1800, 0.08, "triangle", 0.05); },
  block: () => { tone(300, 0.08, "square", 0.05, 1.6); noise(0.08, 0.06, 5000, "highpass"); },
  kill: () => { tone(1100, 0.06, "square", 0.05); setTimeout(() => tone(1600, 0.08, "square", 0.05), 50); },
  robodie: v => playBuf("robodie", 0.55 * v, rand(0.9, 1.15)),
  hurt: () => { tone(140, 0.2, "sawtooth", 0.1, 0.5); if (navigator.vibrate) navigator.vibrate(60); },
  bolt: v => tone(500, 0.12, "triangle", 0.03 * v, 2),
  snipe: v => { tone(3200, 0.25, "sawtooth", 0.07 * v, 0.1); noise(0.3, 0.15 * v, 4000); },
  charge: v => tone(300, 1.4, "sine", 0.06 * v, 6),
  fuse: v => tone(1800, 0.06, "square", 0.06 * v),
  pad: () => tone(200, 0.4, "sine", 0.12, 3.5),
  dash: () => { noise(0.22, 0.15, 3000, "bandpass"); tone(500, 0.18, "sine", 0.06, 2.5); },
  throw: () => tone(400, 0.15, "triangle", 0.06, 0.6),
  ult: () => { [220, 330, 440, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.3, "sawtooth", 0.06), i * 60)); noise(0.8, 0.12, 2000); },
  pick: () => { tone(880, 0.1, "triangle", 0.1); setTimeout(() => tone(1320, 0.12, "triangle", 0.1), 70); },
  buy: () => { tone(660, 0.08, "triangle", 0.1); setTimeout(() => tone(990, 0.15, "triangle", 0.1), 80); },
  wave: () => { [220, 165, 220, 165].forEach((f, i) => setTimeout(() => tone(f, 0.35, "sawtooth", 0.05), i * 380)); },
  clear: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.08), i * 120)); },
  down: () => { tone(400, 0.8, "sawtooth", 0.08, 0.2); if (navigator.vibrate) navigator.vibrate([100, 60, 200]); },
  revive: () => { [440, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.15, "triangle", 0.1), i * 90)); },
  click: () => tone(1200, 0.03, "square", 0.03)
};
// procedural synthwave soundtrack: calm between waves, full beat in combat, darker for bosses
const MUS = { on: store("it-music") !== "0", level: 0, next: 0, step: 0 };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const PROG_BOSS = [[57, 60, 64], [58, 62, 65], [57, 60, 64], [56, 59, 63]];
function msynth(f, t, dur, type, vol, cut, att = 0.005) {
  const o = actx.createOscillator(), fl = actx.createBiquadFilter(), g = actx.createGain();
  o.type = type; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.value = cut; fl.Q.value = 4;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(fl).connect(g).connect(musBus); o.start(t); o.stop(t + dur + 0.05);
}
function mdrum(k, t) {
  if (k === "kick") { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(musBus); o.start(t); o.stop(t + 0.32); return; }
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); s.buffer = noiseBuf; f.type = "highpass";
  f.frequency.value = k === "hat" ? 7000 : 1400; const d = k === "hat" ? 0.04 : 0.16, v = k === "hat" ? 0.06 : 0.22;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(f).connect(g).connect(musBus); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.01);
}
function musicTick() {
  if (!actx || !MUS.on || actx.state !== "running" || !MUS.level) return;
  const t = actx.currentTime, s16 = 60 / (MUS.level === 3 ? 132 : 118) / 4;
  if (MUS.next < t) MUS.next = t + 0.05;
  while (MUS.next < t + 0.25) { musStep(MUS.step++, MUS.next, s16); MUS.next += s16; }
}
function musStep(i, t, s16) {
  const lv = MUS.level, s = i % 16, bar = Math.floor(i / 16) % 4, ch = (lv === 3 ? PROG_BOSS : PROG)[bar];
  if (lv >= 2) { if (s % 4 === 0) mdrum("kick", t); if (s === 4 || s === 12) mdrum("snare", t); if (s % 2 === 1) mdrum("hat", t); }
  else if (s === 0) mdrum("kick", t);
  if (s % 2 === 0) msynth(mtof(ch[0] - 24 + (s % 4 === 2 ? 12 : 0)), t, s16 * 1.8, "sawtooth", lv >= 2 ? 0.1 : 0.05, lv >= 2 ? 900 : 500);
  if (s === 0) ch.forEach(n => msynth(mtof(n), t, s16 * 15, "triangle", 0.022, 1600, 0.35));
  if (lv >= 2 && (lv === 3 || bar % 2 === 1 || s % 2 === 0)) msynth(mtof(ch[s % 3] + 12 + (s % 6 >= 3 ? 12 : 0)), t, s16 * 0.9, "square", 0.016, 2600);
}
function setMusic(on) { MUS.on = on; store("it-music", on ? "1" : "0"); if (musBus) musBus.gain.value = on ? 0.55 : 0; document.querySelectorAll(".mus").forEach(b => b.textContent = (b.id === "bMus2" ? "♪ " : "♪ Music ") + (on ? "on" : "off")); }

// ===================================================================== renderer / scene
const view = $("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c1e);
scene.fog = new THREE.Fog(0x1a1430, 45, 150);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: qs.get("lowfx") ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;
// soft studio reflections so metal looks like metal
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45; pm.dispose(); }

scene.add(new THREE.HemisphereLight(0x9ab4ff, 0x3a2448, 1.6));
const sun = new THREE.DirectionalLight(0xffe2c8, 2.8);
sun.position.set(20, 40, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
sun.shadow.bias = -0.0008;
scene.add(sun);
const flash = new THREE.PointLight(0xff8844, 0, 18, 2); scene.add(flash);

let baseFov = 70;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  // keep a sensible horizontal field of view whether folded (tall) or unfolded (wide/square)
  const hfov = 82 * Math.PI / 180;
  baseFov = camera.fov = clamp(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI, 52, 96);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
if (window.visualViewport) visualViewport.addEventListener("resize", resize);
new ResizeObserver(resize).observe(document.documentElement);
resize();

// ===================================================================== world
const boxes = []; // {x0,y0,z0,x1,y1,z1}
const texLoader = new THREE.TextureLoader();
function tex(url, rep = 1) { const t = texLoader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t; }
const floorTex = tex("assets/floor.jpg", HALF * 2 / 6);
const matFloor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.35, color: 0xb8c0d8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), matFloor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const wallTex = tex("assets/wall.jpg"), topTex = tex("assets/floor.jpg");
const matSide = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, metalness: 0.3, color: 0xc8d0e8 });
const matTop = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.55, metalness: 0.35, color: 0x9aa4c0 });
const matPerim = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, metalness: 0.25, color: 0x8890b0 });
const edgeMats = [0x2ef2ff, 0xff2e88, 0xa46bff].map(c => new THREE.LineBasicMaterial({ color: c }));
// box with world-scaled UVs so textures keep the same size on every block
function boxGeo(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function block(cx, cz, w, d, h, y0 = 0, edge = 0, perim = false) {
  const b = { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 };
  boxes.push(b);
  const geo = boxGeo(w, h, d, perim ? 7 : 3);
  const side = perim ? matPerim : matSide;
  const m = new THREE.Mesh(geo, [side, side, matTop, matTop, side, side]); m.position.set(cx, y0 + h / 2, cz); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (edge >= 0) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), edgeMats[edge]); e.position.copy(m.position); scene.add(e); }
  return b;
}
// perimeter
block(0, -HALF - 0.5, HALF * 2 + 2, 1, 7, 0, 0, true); block(0, HALF + 0.5, HALF * 2 + 2, 1, 7, 0, 0, true);
block(-HALF - 0.5, 0, 1, HALF * 2, 7, 0, 0, true); block(HALF + 0.5, 0, 1, HALF * 2, 7, 0, 0, true);
// central platform + steps
block(0, 0, 8, 8, 3, 0, 0);
for (const s of [1, -1]) { block(0, s * 5, 3, 2, 2, 0, 2); block(0, s * 7, 3, 2, 1, 0, 2); }
// pillars
for (const x of [-12, 12]) for (const z of [-12, 12]) block(x, z, 2.2, 2.2, 5.5, 0, 1);
// low walls
for (const s of [1, -1]) { block(s * 20, 6, 1, 6, 1.3, 0, 0); block(s * 20, -6, 1, 6, 1.3, 0, 0); block(6, s * 20, 6, 1, 1.3, 0, 0); block(-6, s * 20, 6, 1, 1.3, 0, 0); }
// crates
[[24, 18], [-24, -18], [18, -24], [-18, 24], [-10, 22], [10, -22], [22, 10], [-22, -10], [27, -6], [-27, 6]].forEach(([x, z]) => block(x, z, 2, 2, 1.2, 0, 2));
// corner bunkers (high ground)
for (const x of [-27, 27]) for (const z of [-27, 27]) { block(x, z, 6, 6, 3.2, 0, 1); block(x - Math.sign(x) * 4.2, z, 2.4, 2.4, 1.6, 0, 2); }
// glowing floor strips leading to the centre
{ const m = new THREE.MeshBasicMaterial({ color: 0x2ef2ff, transparent: true, opacity: 0.55 });
  for (const [x, z, w, d] of [[0, 18, 0.18, 14], [0, -18, 0.18, 14], [18, 0, 14, 0.18], [-18, 0, 14, 0.18]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z); scene.add(s); } }

// jump pads: launch up and toward a target
const pads = [
  { x: 7, z: 0, tx: 1.5, tz: 0 }, { x: -7, z: 0, tx: -1.5, tz: 0 },
  { x: 21, z: 27, tx: 27, tz: 27 }, { x: -21, z: -27, tx: -27, tz: -27 }, { x: 27, z: -21, tx: 27, tz: -27 }, { x: -27, z: 21, tx: -27, tz: 27 }
];
const padMeshes = [];
pads.forEach(p => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 32), new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
  ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.06, p.z); scene.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: 0x1d5a2a, transparent: true, opacity: 0.8 }));
  disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.04, p.z); scene.add(disc);
  padMeshes.push(ring);
});
// spawn portals for robots
const portals = [[0, -32], [0, 32], [-32, 0], [32, 0], [-31, -14], [31, 14]];
const portalMeshes = portals.map(([x, z]) => {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
  ring.position.y = 2; ring.lookAt(0, 2, 0); g.add(ring);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  inner.position.y = 2; inner.lookAt(0, 2, 0); g.add(inner);
  const base = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0x3a0610 }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.03; g.add(base);
  scene.add(g); return ring;
});
// sky: painted neon-city panorama wrapped around the arena
{
  const t = texLoader.load("assets/sky.jpg"); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(3, 1);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(180, 180, 200, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
  cyl.position.y = 70; scene.add(cyl);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(180, 48), new THREE.MeshBasicMaterial({ color: 0x0a0c1e, fog: false })); cap.rotation.x = Math.PI / 2; cap.position.y = 169; scene.add(cap);
}
// explosive barrels (host decides when they blow; they come back every wave)
const barrels = [[15, 15], [-15, -15], [15, -15], [-15, 15], [0, 25], [0, -25], [25, 0], [-25, 0], [4.8, 4.8], [-4.8, -4.8]].map(([x, z], i) => {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0xc02818, roughness: 0.45, metalness: 0.4 })); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xffb02e, emissiveIntensity: 1.5 })); band.position.y = 0.75; g.add(band);
  scene.add(g);
  return { i, x, z, g, alive: true, box: { x0: x - 0.42, x1: x + 0.42, y0: 0, y1: 1.1, z0: z - 0.42, z1: z + 0.42 } };
});
barrels.forEach(b => boxes.push(b.box));
function setBarrel(b, alive) {
  if (b.alive === alive) return; b.alive = alive; b.g.visible = alive;
  const k = boxes.indexOf(b.box); if (alive && k < 0) boxes.push(b.box); if (!alive && k >= 0) boxes.splice(k, 1);
}

// ===================================================================== collision + rays
function circleBox(x, z, r, b) { const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1), dx = x - cx, dz = z - cz; return dx * dx + dz * dz < r * r; }
function resolveXZ(o) {
  for (const b of boxes) {
    if (o.p.y + o.h <= b.y0 + 0.01 || o.p.y >= b.y1 - 0.01) continue;
    if (!circleBox(o.p.x, o.p.z, o.r, b)) continue;
    if (o.grounded && b.y1 - o.p.y <= STEP && !o.noStep) { o.p.y = b.y1; continue; }
    const cx = clamp(o.p.x, b.x0, b.x1), cz = clamp(o.p.z, b.z0, b.z1);
    let dx = o.p.x - cx, dz = o.p.z - cz, d = Math.hypot(dx, dz);
    if (d > 1e-5) { const push = o.r - d; o.p.x += dx / d * push; o.p.z += dz / d * push; const vn = (o.v.x * dx + o.v.z * dz) / d; if (vn < 0) { o.v.x -= vn * dx / d; o.v.z -= vn * dz / d; } }
    else { // center inside: push out the shortest way
      const opts = [[b.x0 - o.r - o.p.x, 0], [b.x1 + o.r - o.p.x, 0], [0, b.z0 - o.r - o.p.z], [0, b.z1 + o.r - o.p.z]];
      opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1])); o.p.x += opts[0][0]; o.p.z += opts[0][1];
    }
  }
}
function moveBody(o, dt) {
  o.v.y -= GRAV * dt;
  o.p.x += o.v.x * dt; resolveXZ(o);
  o.p.z += o.v.z * dt; resolveXZ(o);
  const py = o.p.y; o.p.y += o.v.y * dt;
  const wasGrounded = o.grounded; o.grounded = false;
  if (o.v.y <= 0) {
    let top = 0;
    for (const b of boxes) if (b.y1 <= py + 0.05 && b.y1 > top && circleBox(o.p.x, o.p.z, o.r * 0.9, b)) top = b.y1;
    if (o.p.y <= top) { o.p.y = top; o.v.y = 0; o.grounded = true; }
    else if (wasGrounded && o.p.y > top - 0.0 && o.p.y - top < 0.25 && o.v.y > -6) { o.p.y = top; o.v.y = 0; o.grounded = true; } // stick to ground on small drops
  } else {
    for (const b of boxes) if (b.y0 >= py + o.h - 0.05 && o.p.y + o.h > b.y0 && circleBox(o.p.x, o.p.z, o.r * 0.9, b)) { o.p.y = b.y0 - o.h; o.v.y = 0; }
  }
  o.p.x = clamp(o.p.x, -HALF + o.r, HALF - o.r); o.p.z = clamp(o.p.z, -HALF + o.r, HALF - o.r);
}
// ray vs world boxes + floor: returns distance or Infinity
function rayWorld(o, d, maxT = 200) {
  let best = maxT;
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
  for (const b of boxes) {
    let t0 = 0, t1 = best;
    for (const [oa, da, mn, mx] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
      if (Math.abs(da) < 1e-9) { if (oa < mn || oa > mx) { t0 = Infinity; break; } }
      else { let ta = (mn - oa) / da, tb = (mx - oa) / da; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) break; }
    }
    if (t0 <= t1 && t0 < best && t0 >= 0) best = t0;
  }
  return best < maxT ? best : Infinity;
}
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
  if (disc < 0) return Infinity; const t = -b - Math.sqrt(disc); return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
function hitSpheresOf(e) { return HITS[e.type].map(([y, r]) => [V(e.pos.x, e.pos.y + y, e.pos.z), r * (e.scale || 1)]); }
function rayEnemy(o, d, e) { let best = Infinity; for (const [c, r] of hitSpheresOf(e)) { const t = raySphere(o, d, c, r); if (t < best) best = t; } return best; }
function rayEnemyX(o, d, e) { let best = Infinity, idx = -1; const hs = hitSpheresOf(e); hs.forEach(([c, r], i) => { const t = raySphere(o, d, c, r); if (t < best) { best = t; idx = i; } }); return { t: best, crit: !!ETYPES[e.type].head && idx === hs.length - 1 }; }
function rayBarrel(o, d) { let best = Infinity, bb = null; for (const b of barrels) if (b.alive) { const t = raySphere(o, d, V(b.x, 0.55, b.z), 0.6); if (t < best) { best = t; bb = b; } } return [best, bb]; }
// bulwarks block shots that hit their front shield
function shielded(e, from) { if (!ETYPES[e.type].shield) return false; const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), dx = from.x - e.pos.x, dz = from.z - e.pos.z, l = Math.hypot(dx, dz) || 1; return (fx * dx + fz * dz) / l > 0.4; }
function los(a, b) { tmpV.subVectors(b, a); const len = tmpV.length(); tmpV.divideScalar(len); return rayWorld(a, tmpV, len) === Infinity; }
function chestOf(e) { const hs = HITS[e.type]; return V(e.pos.x, e.pos.y + hs[Math.min(1, hs.length - 1)][0] * (e.scale || 1), e.pos.z); }

// ===================================================================== effects
const PMAX = 900;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const dotTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.14, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
let pNext = 0;
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -999;
function spark(p, color, n = 10, speed = 6, up = 2, life = 0.5) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
    const a = rand(0, 6.283), b = rand(-1, 1), s = rand(0.3, 1) * speed;
    pVel[i * 3] = Math.cos(a) * Math.sqrt(1 - b * b) * s; pVel[i * 3 + 1] = b * s + up; pVel[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - b * b) * s;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b; pLife[i] = life * rand(0.6, 1.2);
  }
}
function updParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt; if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pVel[i * 3 + 1] -= 12 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] *= -0.3; }
    const f = Math.pow(0.5, dt * 3); pCol[i * 3] *= f; pCol[i * 3 + 1] *= f; pCol[i * 3 + 2] *= f;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
const tracers = [];
for (let i = 0; i < 40; i++) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, life: 0, max: 0.1 });
}
let trNext = 0;
function tracer(a, b, color, life = 0.08) {
  const t = tracers[trNext = (trNext + 1) % tracers.length];
  const arr = t.l.geometry.attributes.position.array; arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
  t.l.geometry.attributes.position.needsUpdate = true; t.l.material.color.set(color); t.l.material.opacity = 1; t.l.visible = true; t.life = t.max = life;
}
const booms = [];
const boomGeo = new THREE.SphereGeometry(1, 16, 12);
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; scene.add(m); booms.push({ m, life: 0, r: 1 }); }
// shockwave rings
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
const rings = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); rings.push({ m, life: 0, r: 1, max: 0.5 }); }
let ringNext = 0;
function shockRing(p, r, color = 0xffc080, life = 0.5) { const o = rings[ringNext = (ringNext + 1) % rings.length]; o.m.position.set(p.x, p.y + 0.15, p.z); o.m.material.color.set(color); o.m.visible = true; o.life = o.max = life; o.r = r; }
// smoke puffs
const SMAX = 160, sPos = new Float32Array(SMAX * 3), sVel = new Float32Array(SMAX * 3), sLife = new Float32Array(SMAX), sCol = new Float32Array(SMAX * 3);
const smokeGeo = new THREE.BufferGeometry(); smokeGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3)); smokeGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
const smokeTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.5, "rgba(255,255,255,.25)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 2.6, map: smokeTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7 }));
smoke.frustumCulled = false; scene.add(smoke);
for (let i = 0; i < SMAX; i++) sPos[i * 3 + 1] = -999;
let sNext = 0;
function puff(p, n = 8, spread = 1.2, shade = 0.35) {
  for (let k = 0; k < n; k++) { const i = sNext = (sNext + 1) % SMAX; sPos[i * 3] = p.x + rand(-spread, spread); sPos[i * 3 + 1] = p.y + rand(0, spread); sPos[i * 3 + 2] = p.z + rand(-spread, spread); sVel[i * 3] = rand(-1, 1); sVel[i * 3 + 1] = rand(1, 2.5); sVel[i * 3 + 2] = rand(-1, 1); sLife[i] = rand(1.2, 2.2); const c = shade * rand(0.7, 1.1); sCol[i * 3] = c; sCol[i * 3 + 1] = c * 0.95; sCol[i * 3 + 2] = c * 1.05; }
}
// scorch marks
const scorchTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.85)"); gr.addColorStop(0.6, "rgba(10,5,5,.5)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const scorches = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); scorches.push({ m, life: 0 }); }
let scNext = 0;
function scorch(p, r) { const top = groundAt(p.x, p.z, p.y + 0.5); if (Math.abs(top - p.y) > 1.2) return; const o = scorches[scNext = (scNext + 1) % scorches.length]; o.m.position.set(p.x, top + 0.03 + scNext * 0.001, p.z); o.m.scale.setScalar(r * 1.4); o.m.rotation.z = rand(0, 6); o.m.material.opacity = 1; o.m.visible = true; o.life = 14; }
function groundAt(x, z, maxY = 99) { let top = 0; for (const b of boxes) if (b.y1 <= maxY && b.y1 > top && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) top = b.y1; return top; }
// camera shake
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.min(1.2, shakeAmt + a); }
let boomNext = 0, flashT = 0;
function explosion(p, r = 3, color = 0xff8a3a) {
  const b = booms[boomNext = (boomNext + 1) % booms.length]; b.m.position.copy(p); b.m.material.color.set(color); b.m.visible = true; b.life = 0.45; b.r = r;
  spark(p, color, 40, 12, 3, 0.8); spark(p, 0xffffff, 12, 6, 2, 0.4); spark(p, 0x221a18, 14, 9, 5, 1.2);
  puff(p, Math.round(4 + r * 1.5), r * 0.35); shockRing(p, r * 1.6, color, 0.45); scorch(p, r * 0.8);
  flash.position.copy(p); flash.color.set(color); flash.intensity = 60; flashT = 0.25;
  SFX.boom(distVol(p));
  const d = camera.position.distanceTo(p); if (d < 25) shake(clamp((r / 3) * (1 - d / 25), 0, 0.8));
}
function updEffects(dt) {
  tracers.forEach(t => { if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.l.visible = false; } });
  booms.forEach(b => { if (b.life > 0) { b.life -= dt; const k = 1 - b.life / 0.45; b.m.scale.setScalar(b.r * (0.3 + k * 0.9)); b.m.material.opacity = Math.max(0, 1 - k); if (b.life <= 0) b.m.visible = false; } });
  rings.forEach(o => { if (o.life > 0) { o.life -= dt; const k = 1 - o.life / o.max; o.m.scale.setScalar(0.2 + o.r * k); o.m.material.opacity = Math.max(0, 1 - k); if (o.life <= 0) o.m.visible = false; } });
  scorches.forEach(o => { if (o.life > 0) { o.life -= dt; o.m.material.opacity = Math.min(1, o.life / 3); if (o.life <= 0) o.m.visible = false; } });
  for (let i = 0; i < SMAX; i++) { if (sLife[i] <= 0) continue; sLife[i] -= dt; if (sLife[i] <= 0) { sPos[i * 3 + 1] = -999; continue; } sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt; const f = Math.pow(0.5, dt * 0.9); sCol[i * 3] *= f; sCol[i * 3 + 1] *= f; sCol[i * 3 + 2] *= f; }
  smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.color.needsUpdate = true;
  if (flashT > 0) { flashT -= dt; flash.intensity = Math.max(0, flashT / 0.25 * 60); }
  shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
  updParticles(dt); updDmgNums(dt); updLasers(dt); updHazards(dt);
}
// floating damage numbers (DOM, projected from the world)
const dmgNums = [];
function dmgNum(p, n, crit, col) {
  if (dmgNums.length > 28) { dmgNums[0].el.remove(); dmgNums.shift(); }
  const el = document.createElement("div"); el.className = "dn" + (crit ? " crit" : ""); el.textContent = crit ? n + "!" : n; if (col) el.style.color = col; $("dnums").appendChild(el);
  dmgNums.push({ el, p: p.clone().add(V(rand(-0.3, 0.3), 0.2, rand(-0.3, 0.3))), life: 0.8, vy: 2.2 });
}
function updDmgNums(dt) {
  const w = innerWidth, h = innerHeight;
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i]; d.life -= dt; d.p.y += d.vy * dt; d.vy *= 0.93;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    tmpV3.copy(d.p).project(camera);
    if (tmpV3.z > 1) { d.el.style.opacity = 0; continue; }
    d.el.style.transform = "translate(" + ((tmpV3.x + 1) / 2 * w).toFixed(1) + "px," + ((1 - tmpV3.y) / 2 * h).toFixed(1) + "px) translate(-50%,-50%) scale(" + (d.life > 0.65 ? 1.35 : 1) + ")";
    d.el.style.opacity = Math.min(1, d.life / 0.3);
  }
}
// sniper aim lasers
const lasers = new Map(); // enemy id -> {line, tgt, t, dur}
function startLaser(id, tgt, dur) {
  let L = lasers.get(id);
  if (!L) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)); L = { line: new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff2050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })) }; L.line.frustumCulled = false; scene.add(L.line); lasers.set(id, L); }
  L.tgt = tgt; L.t = 0; L.dur = dur; L.line.visible = true;
  const e = enemies.get(id); if (e) SFX.charge(distVol(e.pos));
}
function stopLaser(id) { const L = lasers.get(id); if (L) { scene.remove(L.line); lasers.delete(id); } }
function playerPos(idx) { return idx === myIdx ? me.body.p : mate.pos; }
function updLasers(dt) {
  lasers.forEach((L, id) => {
    const e = enemies.get(id); L.t += dt;
    if (!e || e.dying || L.t > L.dur + 0.1) { stopLaser(id); return; }
    const a = chestOf(e); a.y += 0.15 * ETYPES[e.type].h; const tp = playerPos(L.tgt); const b = V(tp.x, tp.y + 1.2, tp.z);
    const dir = b.clone().sub(a); const len = dir.length(); dir.normalize(); const wt = rayWorld(a, dir, len); const end = wt === Infinity ? b : a.clone().addScaledVector(dir, wt);
    const arr = L.line.geometry.attributes.position.array; arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = end.x; arr[4] = end.y; arr[5] = end.z; L.line.geometry.attributes.position.needsUpdate = true;
    const k = L.t / L.dur; L.line.material.opacity = 0.35 + 0.65 * (k > 0.75 ? (Math.sin(L.t * 60) > 0 ? 1 : 0.2) : k);
  });
}

// ===================================================================== models
const ASSETS = { soldier: null, robot: null };
const SOLDIER_STRIP = /(Shoulder|Arm|ForeArm|Hand)/;
function loadAssets(onProgress) {
  const L = new GLTFLoader(); let done = 0;
  const one = (url, key) => L.loadAsync(url).then(g => { ASSETS[key] = g; onProgress(++done / 2); });
  return Promise.all([one("assets/Soldier.glb", "soldier"), one("assets/RobotExpressive.glb", "robot")]);
}
function glowMat(c, i = 2.2) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }); }
const darkArmor = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.35, metalness: 0.7 });
const lightArmor = new THREE.MeshStandardMaterial({ color: 0xaab4c8, roughness: 0.3, metalness: 0.6 });
function shadowAll(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; } }); return o; }
function ownMats(o) { const mats = []; o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); } }); return mats; }
// --- world-space bone helpers for the aiming pose
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V();
function aimBone(bone, child, target) {
  bone.getWorldPosition(_v1); child.getWorldPosition(_v2);
  _v2.sub(_v1).normalize(); _v3.copy(target).sub(_v1).normalize();
  _q1.setFromUnitVectors(_v2, _v3);
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q1);
  bone.parent.getWorldQuaternion(_q1).invert(); bone.quaternion.copy(_q1.multiply(_q2));
  bone.updateMatrixWorld(true);
}
function ik2(up, lo, hand, target, pole) {
  const a = up.getWorldPosition(V()), b = lo.getWorldPosition(V()), c = hand.getWorldPosition(V());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const dir = target.clone().sub(a); const d = clamp(dir.length(), 0.05, (l1 + l2) * 0.999); dir.normalize();
  const ang = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const pn = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = a.clone().addScaledVector(dir, Math.cos(ang) * l1).addScaledVector(pn, Math.sin(ang) * l1);
  aimBone(up, lo, elbow); aimBone(lo, hand, target);
}
function rotBoneWorld(bone, axis, ang) {
  _q1.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q2.premultiply(_q1);
  bone.parent.getWorldQuaternion(_q1).invert(); bone.quaternion.copy(_q1.multiply(_q2)); bone.updateMatrixWorld(true);
}
function makeGun() {
  const gun = new THREE.Group(), glow = glowMat(0xffffff, 2.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), darkArmor); body.position.z = -0.22; gun.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.4), lightArmor); top.position.set(0, 0.085, -0.2); gun.add(top);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), darkArmor); mag.position.set(0, -0.12, -0.18); mag.rotation.x = 0.25; gun.add(mag);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.24, 8).rotateX(Math.PI / 2), lightArmor); barrel.position.z = -0.64; gun.add(barrel);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.36), glow); strip.position.set(0, 0.02, -0.22); gun.add(strip);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -0.78; gun.add(muzzle);
  const mflash = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); mflash.position.z = -0.84; mflash.scale.set(1, 1, 2.2); mflash.visible = false; gun.add(mflash);
  const grip = new THREE.Object3D(); grip.position.set(0, -0.06, -0.02); gun.add(grip);
  const fore = new THREE.Object3D(); fore.position.set(0, -0.05, -0.4); gun.add(fore);
  shadowAll(gun); mflash.castShadow = false;
  return { gun, muzzle, mflash, glow, grip, fore };
}
function makeSoldier(colorHex) {
  const src = ASSETS.soldier, col = new THREE.Color(colorHex);
  const root = new THREE.Group(), m = SkeletonUtils.clone(src.scene); root.add(m);
  const mats = [];
  m.traverse(o => { if (o.isMesh) {
    o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); mats.push(o.material);
    if (/Visor/i.test(o.material.name)) { o.material.color.copy(col); o.material.emissive = col.clone(); o.material.emissiveIntensity = 1.3; }
    else { o.material.color.lerp(col, 0.12); o.material.metalness = 0.45; o.material.roughness = 0.5; }
  } });
  const bones = {}; m.traverse(o => { if (o.isBone) bones[o.name.replace("mixamorig", "").replace(":", "")] = o; });
  const mixer = new THREE.AnimationMixer(m), acts = {};
  for (const clip of src.animations) {
    if (clip.name === "TPose") continue;
    const c = clip.clone(); c.tracks = c.tracks.filter(t => !SOLDIER_STRIP.test(t.name.split(".")[0]));
    const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(clip.name === "Idle" ? 1 : 0); acts[clip.name] = a;
  }
  const armBones = ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "LeftShoulder", "RightShoulder"].map(n => bones[n]);
  const bind = armBones.map(b => b.quaternion.clone());
  const G = makeGun(); G.glow.color.copy(col); G.glow.emissive.copy(col);
  const pivot = new THREE.Group(); pivot.position.set(0.09, 1.38, 0.02); pivot.add(G.gun); root.add(pivot);
  root.userData = { mixer, acts, bones, armBones, bind, pivot, muzzle: G.muzzle, mflash: G.mflash, grip: G.grip, fore: G.fore, mats, w: { Idle: 1, Walk: 0, Run: 0 }, flashT: 0, recoil: 0, glowT: 0 };
  return root;
}
const _right = V(), _down = V(0, -1, 0), _back = V();
function animSoldier(m, vel, pitch, downed, dt, od) {
  const u = m.userData, speed = Math.hypot(vel.x, vel.z);
  // blend idle / walk / run by speed; play backwards when backpedalling
  const want = speed < 0.6 ? "Idle" : speed < 4.2 ? "Walk" : "Run";
  const yaw = m.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const back = speed > 0.6 && (vel.x * fx + vel.z * fz) / speed < -0.3;
  for (const k in u.w) { u.w[k] = lerp(u.w[k], k === want && !downed ? 1 : 0, Math.min(1, dt * 8)); const a = u.acts[k]; if (a) { a.setEffectiveWeight(u.w[k]); a.timeScale = k === "Idle" ? 1 : (back ? -1 : 1) * clamp(speed / (k === "Run" ? 6.5 : 3), 0.6, 1.4); } }
  if (downed) u.acts.Idle.setEffectiveWeight(1);
  u.mixer.update(dt);
  m.rotation.x = downed ? lerp(m.rotation.x, -1.35, Math.min(1, dt * 6)) : lerp(m.rotation.x, 0, Math.min(1, dt * 10));
  m.updateMatrixWorld(true);
  // aiming pose: gun follows the view pitch; spine leans; arms reach the gun
  u.recoil = Math.max(0, u.recoil - dt * 6);
  u.pivot.rotation.x = downed ? 0.4 : pitch + u.recoil * 0.25; u.pivot.position.z = 0.02 + u.recoil * 0.06;
  u.armBones.forEach((b, i) => b.quaternion.copy(u.bind[i]));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw)); _back.set(-fx, 0, -fz);
  if (!downed) rotBoneWorld(u.bones.Spine1, _right, pitch * 0.35);
  m.updateMatrixWorld(true);
  const B = u.bones;
  ik2(B.RightArm, B.RightForeArm, B.RightHand, u.grip.getWorldPosition(_v4), _right.clone().add(_down).addScaledVector(_back, 0.4));
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, u.fore.getWorldPosition(_v4), _right.clone().negate().add(_down).addScaledVector(_back, 0.2));
  if (u.flashT > 0) { u.flashT -= dt; u.mflash.visible = true; u.mflash.scale.set(rand(0.7, 1.3), rand(0.7, 1.3), rand(1.6, 2.6)); u.mflash.rotation.z = rand(0, 6); } else u.mflash.visible = false;
  // overdrive glow
  const g = od ? 1 : 0; if (u.glowT !== g) { u.glowT = g; u.mats.forEach(mt => { if (!/Visor/i.test(mt.name)) { mt.emissive.set(od ? 0xffaa20 : 0x000000); mt.emissiveIntensity = od ? 0.55 : 1; } }); }
}
const robotRed = glowMat(0xff2a2a, 3), robotOrange = glowMat(0xff7a1a, 3), robotBody = new THREE.MeshStandardMaterial({ color: 0x8a8f9e, roughness: 0.3, metalness: 0.7 }), robotDark = new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 0.4, metalness: 0.6 });
const shieldMat = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, emissive: 0x2a7fff, emissiveIntensity: 1.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 });
function makeGltfRobot(type, g, u) {
  const T = ETYPES[type], src = ASSETS.robot;
  const inner = SkeletonUtils.clone(src.scene); inner.rotation.y = Math.PI; inner.scale.setScalar(T.h / 4.77); g.add(inner);
  inner.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  const mats = ownMats(inner);
  for (const mt of mats) {
    if (mt.name === "Main") { mt.color.set(T.gltf); mt.metalness = 0.55; mt.roughness = 0.35; }
    else if (mt.name === "Grey") { mt.color.set(0x2c303c); mt.metalness = 0.7; mt.roughness = 0.35; }
    else if (mt.name === "Black") { mt.color.set(0x050505); mt.emissive = new THREE.Color(0xff1830); mt.emissiveIntensity = 0.5; }
  }
  const mixer = new THREE.AnimationMixer(inner), acts = {};
  for (const n of ["Idle", "Walking", "Running", "Punch", "Death"]) { const c = src.animations.find(a => a.name === n); if (c) acts[n] = mixer.clipAction(c); }
  acts.Idle.play();
  acts.Punch.setLoop(THREE.LoopOnce); acts.Punch.clampWhenFinished = false;
  acts.Death.setLoop(THREE.LoopOnce); acts.Death.clampWhenFinished = true;
  mixer.addEventListener("finished", ev => { if (ev.action === acts.Punch) acts.Punch.fadeOut(0.15); });
  Object.assign(u, { mixer, acts, base: "Idle", inner });
  const h = T.h, red = glowMat(type === "sniper" ? 0xb06bff : 0xff2a2a, 3);
  if (type === "grunt" || type === "boss") {
    for (const sd of type === "boss" ? [-1, 1] : [1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.09 * h, 0.09 * h, 0.4 * h), robotDark); c.position.set(sd * 0.2 * h, 0.66 * h, -0.08 * h); g.add(c);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06 * h, 0.06 * h, 0.03 * h), red); tip.position.set(sd * 0.2 * h, 0.66 * h, -0.29 * h); g.add(tip);
    }
  }
  if (type === "sniper") {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * h, 0.035 * h, 0.75 * h, 8).rotateX(Math.PI / 2), robotDark); c.position.set(0.17 * h, 0.68 * h, -0.2 * h); g.add(c);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * h, 0.03 * h, 0.12 * h, 8).rotateX(Math.PI / 2), red); sc.position.set(0.17 * h, 0.72 * h, -0.05 * h); g.add(sc);
  }
  if (type === "bulwark") {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * h, 0.62 * h, 0.75 * h, 20, 1, true, -0.75, 1.5), shieldMat); sh.rotation.y = Math.PI; sh.position.set(0, 0.42 * h, 0.12 * h); g.add(sh); u.parts.shield = sh;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62 * h, 0.012 * h, 4, 20, 1.5), glowMat(0x4aa8ff, 3)); rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.75 + Math.PI); rim.position.set(0, 0.8 * h, 0.12 * h); g.add(rim);
  }
  if (type === "boss") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07 * h, 16, 12), robotRed); core.position.set(0, 0.5 * h, -0.13 * h); g.add(core); u.parts.core = core;
  }
}
function makeRobot(type) {
  const g = new THREE.Group(), u = { parts: {} };
  if (ETYPES[type].gltf) makeGltfRobot(type, g, u);
  else if (type === "drone") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), robotBody); g.add(b);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), robotRed); eye.position.z = -0.38; g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), robotRed); ring.rotation.x = Math.PI / 2; g.add(ring); u.parts.ring = ring;
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), robotDark); w.position.x = s * 0.55; g.add(w); }
  } else if (type === "rusher") {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), robotBody); b.position.y = 0.6; g.add(b); u.parts.body = b;
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), robotOrange); glow.position.y = 0.6; g.add(glow); u.parts.glow = glow;
    for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), robotDark); const a = i / 8 * Math.PI * 2; c.position.set(Math.cos(a) * 0.55, 0.6, Math.sin(a) * 0.55); c.lookAt(Math.cos(a) * 2, 0.6, Math.sin(a) * 2); c.rotateX(Math.PI / 2); g.add(c); }
  } else if (type === "tank") {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 2.6), robotBody); hull.position.y = 0.75; g.add(hull);
    for (const s of [-1, 1]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 2.8), robotDark); tr.position.set(s * 1.1, 0.4, 0); g.add(tr); const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 2.6), robotOrange); st.position.set(s * 1.34, 0.5, 0); g.add(st); }
    const tur = new THREE.Group(); tur.position.y = 1.5; g.add(tur);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.6, 10), robotBody); tur.add(top);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 10), robotDark); barrel.rotation.x = Math.PI / 2 - 0.5; barrel.position.set(0, 0.35, -0.8); tur.add(barrel);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.05), robotRed); eye.position.set(0, 0.1, -0.78); tur.add(eye);
    u.parts.tur = tur;
  }
  if (!ETYPES[type].gltf) u.mats = ownMats(g); else { u.mats = []; g.traverse(o => { if (o.isMesh && !u.mats.includes(o.material)) u.mats.push(o.material); }); }
  // health bar (billboarded)
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3355, depthWrite: false })); fg.position.z = 0.001;
  bar.add(bg, fg); bar.visible = false; scene.add(bar);
  u.bar = bar; u.fg = fg; u.phase = rand(0, 6); u.flashT = 0;
  shadowAll(g); g.userData = u; scene.add(g);
  return g;
}
function setEnemyGlow(e, elite) { if (!elite) return; for (const mt of e.model.userData.mats) if (mt.emissive && mt.name !== "Black" && mt.emissiveIntensity < 1.5) { mt.emissive.set(0xffa000); mt.emissiveIntensity = 0.35; } }
function setFlash(u, on) {
  if (u.flashOn === on) return; u.flashOn = on;
  for (const m of u.mats) { if (!m.emissive) continue; if (!m.userData.e) m.userData.e = [m.emissive.getHex(), m.emissiveIntensity]; if (on) { m.emissive.set(0xffffff); m.emissiveIntensity = 0.8; } else { m.emissive.setHex(m.userData.e[0]); m.emissiveIntensity = m.userData.e[1]; } }
}
function robotBase(u, n) { if (!u.acts || u.base === n || !u.acts[n]) return; u.acts[n].reset().setEffectiveWeight(1).fadeIn(0.25).play(); u.acts[u.base].fadeOut(0.25); u.base = n; }
function robotAttack(e) { const u = e.model.userData; if (!u.acts) return; const a = u.acts.Punch; a.reset(); a.setEffectiveTimeScale(e.type === "boss" ? 1.2 : 1.6); a.setEffectiveWeight(1); a.fadeIn(0.08).play(); }
function labelSprite(text, color = "#fff") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2, 0.5, 1); s.renderOrder = 10;
  s.userData.set = (t, col) => { if (s.userData.t === t + col) return; s.userData.t = t + col; g.clearRect(0, 0, 256, 64); g.font = "bold 34px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.8)"; g.strokeText(t, 128, 32); g.fillStyle = col; g.fillText(t, 128, 32); tex.needsUpdate = true; };
  s.userData.set(text, color); return s;
}

// ===================================================================== game state
let mode = null; // "host" | "guest" | "solo"
let myIdx = 0;
const DASH_CD = 2.4, NADE_CD = 7, OD_TIME = 8, COMBO_WIN = 2.6;
const me = {
  body: { p: V(), v: V(), r: P_R, h: P_H, grounded: false },
  yaw: 0, pitch: -0.1, hp: 100, downed: false, dead: false, bleed: 0, revive: 0,
  weapon: "rifle", owned: { rifle: true }, ammo: { rifle: Infinity }, cd: 0,
  credits: 0, up: { dmg: 0, rate: 0, hp: 0, armor: 0, speed: 0 }, kills: 0, dmgDone: 0, model: null, label: null, padCd: 0, hurtT: 0,
  dashCd: 0, dashT: 0, dashDir: V(), nadeCd: 0, ult: 0, odT: 0, combo: 0, comboT: 0, bestCombo: 0, crits: 0
};
function maxHp() { return 100 + me.up.hp * 25; }
function resetMe(full) {
  if (full) { me.credits = 0; me.up = { dmg: 0, rate: 0, hp: 0, armor: 0, speed: 0 }; me.owned = { rifle: true }; me.ammo = { rifle: Infinity }; me.weapon = "rifle"; me.kills = 0; me.dmgDone = 0; me.ult = 0; me.odT = 0; me.bestCombo = 0; me.crits = 0; }
  me.hp = maxHp(); me.downed = false; me.dead = false; me.bleed = 0; me.revive = 0; me.dashCd = 0; me.nadeCd = 0;
}
function spawnMe() {
  me.body.p.set(myIdx === 0 ? -1.6 : 1.6, 3, 1.5); me.body.v.set(0, 0, 0); me.yaw = 0; me.pitch = -0.08;
}
// partner (remote)
const mate = { on: false, buf: [], pos: V(), yaw: 0, pitch: 0, hp: 100, mhp: 100, downed: false, dead: false, revive: 0, weapon: "rifle", kills: 0, name: "Partner", color: 1, model: null, label: null, speed: 0, lastSeen: 0, od: false, vel: V() };

// shared game (host-authoritative)
const G = { ph: "menu", wave: 0, tm: 0, left: 0, bossFrac: -1, bonus: 0, seq: 0 };
// host-only wave data
const H = { queue: [], spawnT: 0, nextId: 1, maxAlive: 10 };

const enemies = new Map();   // id -> enemy
const corpses = [];          // dying robots playing their death animation
const eproj = new Map();     // enemy projectiles
const rockets = [];          // player rockets + grenades (local and remote visuals)
const pickups = new Map();

const boltGeo = new THREE.SphereGeometry(0.16, 8, 6), mortarGeo = new THREE.SphereGeometry(0.32, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff4040 }), mortarMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a }), snipeMat = new THREE.MeshBasicMaterial({ color: 0xd080ff });
const rocketGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0 });
const nadeGeo = new THREE.SphereGeometry(0.14, 10, 8), nadeMat = glowMat(0x7dff8a, 2);
const pickMat = { hp: glowMat(0x7dff8a, 2.5), ammo: glowMat(0xffb02e, 2.5) };
const warnGeo = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);

// ===================================================================== enemies: shared visuals
function addEnemyVisual(id, type, x, y, z, hpFrac = 1, elite = false) {
  const e = { id, type, pos: V(x, y, z), yaw: 0, hpFrac, model: makeRobot(type), scale: elite ? 1.15 : 1, buf: [], spawnT: 0.6, moving: 0, elite, fl: 0, atk: 0 };
  e.model.position.copy(e.pos);
  setEnemyGlow(e, elite);
  enemies.set(id, e);
  spark(V(x, y + 1, z), 0xff2a2a, 25, 5, 3, 0.6); puff(V(x, y + 0.5, z), 3, 0.6, 0.5);
  return e;
}
function disposeModel(m) { scene.remove(m); scene.remove(m.userData.bar); }
function removeEnemyVisual(e, exploded) {
  enemies.delete(e.id); stopLaser(e.id);
  const u = e.model.userData;
  if (exploded && u.acts && u.acts.Death) {
    // humanoid robots play a death animation, then blow apart
    u.bar.visible = false; setFlash(u, false);
    for (const k in u.acts) if (k !== "Death") u.acts[k].fadeOut(0.1);
    u.acts.Death.reset().setEffectiveWeight(1).fadeIn(0.1).play();
    e.dying = true; e.dieT = e.type === "boss" ? 2.2 : 0.9; corpses.push(e);
    spark(chestOf(e), 0xffd27a, 20, 6, 2, 0.5);
    SFX.robodie(distVol(e.pos));
    return;
  }
  disposeModel(e.model);
  if (exploded) { const c = chestOf(e); explosion(c, e.type === "tank" ? 4 : 2.2, e.type === "rusher" ? 0xff7a1a : 0xff4a3a); SFX.robodie(distVol(e.pos) * 0.7); }
}
function stepCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const e = corpses[i]; e.dieT -= dt; e.model.userData.mixer.update(dt);
    if (e.type === "boss" && Math.random() < dt * 6) explosion(chestOf(e).add(V(rand(-2, 2), rand(-2, 2), rand(-2, 2))), 2.5, 0xff5a2a);
    if (e.dieT <= 0) { corpses.splice(i, 1); disposeModel(e.model); const c = chestOf(e); explosion(c, e.type === "boss" ? 8 : e.type === "bulwark" ? 3.4 : 2.4, 0xff4a3a); if (e.type === "boss") { shockRing(e.pos, 30, 0xff6040, 1.2); shake(1); } }
  }
}
function animEnemy(e, dt, now) {
  const u = e.model.userData;
  e.model.position.copy(e.pos); e.model.rotation.y = e.yaw;
  if (e.spawnT > 0) { e.spawnT -= dt; e.model.scale.setScalar(Math.max(0.05, 1 - e.spawnT / 0.6) * (e.scale || 1)); } else e.model.scale.setScalar(e.scale || 1);
  u.phase += dt * (2 + e.moving * 1.2);
  if (u.mixer) {
    robotBase(u, e.moving < 0.4 ? "Idle" : e.moving < 3.2 ? "Walking" : "Running");
    const ws = u.acts[u.base]; if (u.base !== "Idle") ws.timeScale = clamp(e.moving / (u.base === "Running" ? 5 : 2.2), 0.5, 1.6) * (ETYPES[e.type].h > 3 ? 0.6 : 1);
    u.mixer.update(dt);
  }
  if (u.parts.ring) u.parts.ring.rotation.z += dt * 8;
  if (u.parts.glow) { const fuse = e.fl & 2; const k = 1 + Math.sin(now / (fuse ? 25 : e.near ? 50 : 120)) * (fuse ? 0.35 : 0.15); u.parts.glow.scale.setScalar(k); u.parts.body.rotation.y += dt * (fuse ? 20 : 6); if (fuse && (u.beepT = (u.beepT || 0) - dt) <= 0) { u.beepT = 0.12; SFX.fuse(distVol(e.pos)); } }
  if (u.parts.core) u.parts.core.scale.setScalar(1 + Math.sin(now / 150) * 0.15);
  if (u.parts.shield) u.parts.shield.material.opacity = 0.35 + Math.sin(now / 200) * 0.08;
  if (u.flashT > 0) { u.flashT -= dt; setFlash(u, true); } else setFlash(u, false);
  // health bar
  const bar = u.bar, hs = HITS[e.type]; const top = hs[hs.length - 1][0] * (e.scale || 1) + hs[hs.length - 1][1] + 0.35;
  bar.visible = e.hpFrac < 0.999 && e.type !== "boss" && e.spawnT <= 0;
  if (bar.visible) { bar.position.set(e.pos.x, e.pos.y + top, e.pos.z); bar.quaternion.copy(camera.quaternion); const w = e.type === "tank" || e.type === "bulwark" ? 2 : 1.1; bar.scale.set(w, 1.2, 1); u.fg.scale.x = Math.max(0.001, e.hpFrac); u.fg.position.x = -(1 - e.hpFrac) / 2; u.fg.material.color.set(e.elite ? 0xffb02e : 0xff3355); }
}
function enemyFlags(e) { return (e.elite ? 1 : 0) | (e.fuse > 0 ? 2 : 0) | ((e.atk & 7) << 2); }
function applyFlags(e, fl) {
  const atk = (fl >> 2) & 7; if (atk !== (e.atk & 7)) { e.atk = atk; robotAttack(e); }
  e.fl = fl;
}

// ===================================================================== host: enemy simulation
function playersForAI() {
  const list = [];
  if (!me.downed && !me.dead) list.push({ idx: myIdx, p: me.body.p, v: me.body.v });
  if (mode === "host" && mate.on && !mate.downed && !mate.dead) list.push({ idx: 1, p: mate.pos, v: mate.vel });
  return list;
}
function allPlayersForHits() {
  const list = [{ idx: myIdx, p: me.body.p, alive: !me.downed && !me.dead }];
  if (mode === "host" && mate.on) list.push({ idx: 1, p: mate.pos, alive: !mate.downed && !mate.dead });
  return list;
}
function hostSpawnEnemy(type, elite) {
  const coop = mode === "host" && mate.on;
  const [px, pz] = portals[Math.floor(Math.random() * portals.length)];
  const T = ETYPES[type];
  if (elite === undefined) elite = G.wave >= 6 && type !== "boss" && Math.random() < Math.min(0.3, 0.04 + G.wave * 0.012);
  const scaleHp = (1 + 0.13 * (G.wave - 1)) * (coop ? 1.55 : 1) * (elite ? 1.8 : 1);
  const id = H.nextId++;
  const y = T.fly ? 6 : 0;
  const e = addEnemyVisual(id, type, px + rand(-1, 1), y, pz + rand(-1, 1), 1, elite);
  e.hp = e.maxHp = Math.round(T.hp * scaleHp);
  e.body = { p: e.pos, v: V(), r: T.r * e.scale, h: T.h * e.scale, grounded: false, noStep: false };
  Object.assign(e, { cd: rand(1, 2.5), cd2: 5, side: Math.random() < 0.5 ? 1 : -1, sideT: 0, stuckT: 0, summoned: false, tgt: null, tgtT: 0,
    slot: rand(-1.3, 1.3), burst: 0, burstT: 0, charge: 0, losT: 0, fuse: 0, cover: null, coverT: 0, coverUsed: false, dodgeCd: 0, phase: 1, hazCd: 7, hazK: 0 });
  e.dmgMul = (1 + 0.06 * (G.wave - 1)) * (elite ? 1.25 : 1);
  if (type === "boss") { voice("vo_titan"); }
  return e;
}
const rotY = (v, a) => V(v.x * Math.cos(a) - v.z * Math.sin(a), 0, v.x * Math.sin(a) + v.z * Math.cos(a));
function findCover(e, from) {
  let best = null, bd = 14;
  for (const b of boxes) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0; if (b.y1 < 1.1 || w > 9 || d > 9 || b.y0 > 0.1) continue;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const away = V(cx - from.x, 0, cz - from.z).normalize();
    const spot = V(cx + away.x * (Math.max(w, d) / 2 + 0.9), 0, cz + away.z * (Math.max(w, d) / 2 + 0.9));
    const dd = spot.distanceTo(e.pos); if (dd < bd && Math.abs(spot.x) < HALF - 1 && Math.abs(spot.z) < HALF - 1) { bd = dd; best = spot; }
  }
  return best;
}
function hostStepEnemy(e, dt) {
  const T = ETYPES[e.type];
  if (e.spawnT > 0) return;
  const targets = playersForAI();
  // sticky targeting: keep a target for a while unless a much closer one shows up
  e.tgtT -= dt;
  let tgt = targets.find(t => e.tgt === t.idx);
  if (!tgt || e.tgtT <= 0) { let best = 1e9; tgt = null; for (const t of targets) { const d = t.p.distanceTo(e.pos) * (t.idx === e.tgt ? 0.75 : 1); if (d < best) { best = d; tgt = t; } } e.tgtT = 3; e.tgt = tgt ? tgt.idx : null; }
  e.cd -= dt; e.cd2 -= dt; e.dodgeCd -= dt; e.coverT -= dt;
  const desired = V(); let face = null, speedMul = 1;
  if (tgt) {
    tmpV.subVectors(tgt.p, e.pos); tmpV.y = 0; const dist = tmpV.length(); const toT = tmpV.clone().normalize();
    face = Math.atan2(-toT.x, -toT.z);
    e.sideT -= dt; if (e.sideT <= 0) { e.sideT = rand(1.5, 3.5); if (Math.random() < 0.4) e.side *= -1; }
    const eye = T.gltf ? V(e.pos.x, e.pos.y + 0.7 * T.h * e.scale, e.pos.z) : chestOf(e); const aim = V(tgt.p.x, tgt.p.y + 1.1, tgt.p.z); const canSee = dist < (T.range || 99) && los(eye, aim);
    if (e.type === "rusher") {
      e.near = dist < 7;
      if (e.fuse > 0) { e.fuse -= dt; speedMul = 0.15; desired.copy(toT); if (e.fuse <= 0) { hostEnemyBoom(e); return; } }
      else { desired.copy(toT).addScaledVector(V(-toT.z, 0, toT.x), dist > 8 ? e.side * 0.5 : 0); if (dist < 3.6 + T.r) e.fuse = T.fuse; }
    } else if (e.type === "sniper") {
      if (e.charge > 0) {
        speedMul = 0; e.charge -= dt; if (!canSee) e.losT += dt; else e.losT = 0;
        if (e.losT > 0.45) { e.charge = 0; e.cd = 1.2; netSend({ t: "lz", id: e.id, d: 0 }); stopLaser(e.id); }
        else if (e.charge <= 0) {
          e.cd = T.fire * rand(0.85, 1.15); e.atk++;
          hostBolt(eye.clone().add(V(0, 0.15 * T.h, 0)), aim.clone().sub(eye).normalize(), T.boltSpd, T.bolt * e.dmgMul, "s");
        }
      } else {
        if (dist > T.keep + 4) desired.copy(toT); else if (dist < T.keep - 8) desired.copy(toT).multiplyScalar(-1);
        desired.addScaledVector(V(-toT.z, 0, toT.x), e.side * 0.6);
        if (e.cd <= 0 && canSee) { e.charge = T.charge * (e.elite ? 0.8 : 1); e.losT = 0; startLaser(e.id, tgt.idx, e.charge); netSend({ t: "lz", id: e.id, tg: tgt.idx, d: r2(e.charge) }); }
      }
    } else if (e.type === "grunt") {
      // squad tactics: each trooper holds its own angle around the target (flanking); hurt ones fall back to cover
      if (e.hp < e.maxHp * 0.45 && !e.coverUsed && !e.cover) { e.cover = findCover(e, tgt.p); e.coverT = 4.5; e.coverUsed = true; }
      if (e.cover && e.coverT > 0) { tmpV2.subVectors(e.cover, e.pos); tmpV2.y = 0; if (tmpV2.length() > 0.6) desired.copy(tmpV2.normalize()); }
      else {
        e.cover = null;
        const ang = Math.atan2(e.pos.z - tgt.p.z, e.pos.x - tgt.p.x);
        const want = V(tgt.p.x + Math.cos(ang + e.slot * 0.4) * T.keep, 0, tgt.p.z + Math.sin(ang + e.slot * 0.4) * T.keep);
        tmpV2.subVectors(want, e.pos); tmpV2.y = 0; if (tmpV2.length() > 1.5) desired.copy(tmpV2.normalize()); else desired.set(-toT.z * e.side, 0, toT.x * e.side).multiplyScalar(0.5);
        if (!canSee && dist < 30) desired.add(toT).normalize();
      }
      if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.13; fireAimedBolt(e, tgt, eye, aim, dist, T); } }
      else if (e.cd <= 0 && canSee) { e.cd = T.fire * rand(0.8, 1.25); e.burst = T.burst + (e.elite ? 2 : 0); e.burstT = 0; e.atk++; }
    } else if (T.keep) { // tank, bulwark, boss
      if (dist > T.keep + 3) desired.copy(toT);
      else if (dist < T.keep - 4) desired.copy(toT).multiplyScalar(-0.7);
      desired.addScaledVector(V(-toT.z, 0, toT.x), e.side * (e.type === "bulwark" ? 0.3 : 0.8));
      if (e.type === "boss") hostBossBrain(e, tgt, eye, aim, dist, canSee, dt);
      else if (e.cd <= 0 && canSee) {
        if (T.mortar) { e.cd = T.fire * rand(0.8, 1.2); hostMortar(e, tgt.p.clone().addScaledVector(tgt.v || V(), 0.6), T.mortar * e.dmgMul); }
        else if (T.spreadN) { // bulwark: shotgun spread, or a punch up close
          e.cd = T.fire * rand(0.8, 1.2); e.atk++;
          if (dist < 3.4) damagePlayer(tgt.idx, 24 * e.dmgMul, e.pos);
          else { const base = Math.atan2(aim.x - eye.x, aim.z - eye.z); for (let k = 0; k < T.spreadN; k++) { const a = base + (k - (T.spreadN - 1) / 2) * 0.1; hostBolt(eye, V(Math.sin(a), (aim.y - eye.y) / Math.max(1, dist), Math.cos(a)).normalize(), T.boltSpd, T.bolt * e.dmgMul); } }
        }
      }
    } else if (T.fly) {
      desired.copy(toT).multiplyScalar(dist > 9 ? 1 : -0.3).addScaledVector(V(-toT.z, 0, toT.x), e.side);
      if (e.cd <= 0 && canSee) { e.cd = T.fire * rand(0.75, 1.25); fireAimedBolt(e, tgt, eye, aim, dist, T); }
    }
  } else { desired.set(Math.sin(e.id + performance.now() / 4000), 0, Math.cos(e.id * 1.3 + performance.now() / 5000)); }
  if (desired.lengthSq() > 1e-4 && desired.lengthSq() > 1) desired.normalize();
  // obstacle avoidance for ground robots
  if (!T.fly && desired.lengthSq() > 0.01) {
    const o = V(e.pos.x, e.pos.y + Math.min(1, T.h * 0.5), e.pos.z), dn = desired.clone().normalize();
    if (rayWorld(o, dn, 1.6 + T.r) !== Infinity) {
      for (const a of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4].map(x => x * e.side)) { const d = rotY(dn, a); if (rayWorld(o, d, 1.6 + T.r) === Infinity) { desired.copy(d); break; } }
    }
  }
  // separation
  enemies.forEach(o => { if (o === e) return; const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = (T.r + ETYPES[o.type].r) * 1.1; if (d < m && d > 0.01 && Math.abs(e.pos.y - o.pos.y) < 2) { desired.x += dx / d * 0.8; desired.z += dz / d * 0.8; } });
  const spd = T.speed * speedMul * (e.type === "boss" && e.phase === 3 ? 1.35 : 1) * (e.elite ? 1.12 : 1);
  if (T.fly) {
    e.body.v.x = lerp(e.body.v.x, desired.x * spd, Math.min(1, dt * 2)); e.body.v.z = lerp(e.body.v.z, desired.z * spd, Math.min(1, dt * 2));
    const alt = 5.8 + Math.sin(performance.now() / 700 + e.id) * 0.6;
    e.pos.x += e.body.v.x * dt; e.pos.z += e.body.v.z * dt; e.pos.y = lerp(e.pos.y, alt, Math.min(1, dt * 2));
    e.pos.x = clamp(e.pos.x, -HALF + 1, HALF - 1); e.pos.z = clamp(e.pos.z, -HALF + 1, HALF - 1);
    e.moving = Math.hypot(e.body.v.x, e.body.v.z);
  } else {
    const k = Math.min(1, dt * 6);
    e.body.v.x = lerp(e.body.v.x, desired.x * spd, k); e.body.v.z = lerp(e.body.v.z, desired.z * spd, k);
    const before = e.pos.clone(); moveBody(e.body, dt);
    const moved = Math.hypot(e.pos.x - before.x, e.pos.z - before.z) / dt;
    if (moved < spd * 0.2 && desired.lengthSq() > 0.1) { e.stuckT += dt; if (e.stuckT > 0.6) { e.stuckT = 0; e.side *= -1; e.slot = -e.slot; if (e.body.grounded && e.type !== "tank" && e.type !== "boss" && e.type !== "bulwark") e.body.v.y = 8; } } else e.stuckT = 0;
    e.moving = moved;
  }
  if (face !== null) e.yaw = angLerp(e.yaw, face, Math.min(1, dt * (e.type === "bulwark" ? 2.2 : e.type === "boss" ? 2 : 5)));
}
function fireAimedBolt(e, tgt, eye, aim, dist, T) {
  const lead = (e.elite ? 0.7 : 0.4) * dist / T.boltSpd;
  const aimP = aim.clone().addScaledVector(tgt.v || V(), lead).add(V(rand(-0.5, 0.5), rand(-0.3, 0.3), rand(-0.5, 0.5)));
  hostBolt(eye, aimP.sub(eye).normalize(), T.boltSpd, T.bolt * e.dmgMul);
}
// boss: three phases. Phase 2 adds a sweeping laser (jump it or hide), phase 3 adds shockwave stomps.
function hostBossBrain(e, tgt, eye, aim, dist, canSee, dt) {
  const T = ETYPES.boss, f = e.hp / e.maxHp, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  if (ph !== e.phase) { e.phase = ph; e.hazCd = 2; sendHazard({ k: "ph", id: e.id, n: ph }); }
  e.hazCd -= dt;
  if (ph >= 2 && e.hazCd <= 0) {
    e.hazK++; e.atk++;
    const sweep = ph === 2 || e.hazK % 2 === 0;
    e.hazCd = ph === 3 ? 7 : 9;
    if (sweep) sendHazard({ k: "sw", id: e.id, a: r2(e.yaw), s: Math.random() < 0.5 ? 1 : -1, dm: Math.round(26 * e.dmgMul) });
    else sendHazard({ k: "st", id: e.id, dm: Math.round(30 * e.dmgMul) });
    e.cd = Math.max(e.cd, 2.5);
    return;
  }
  if (e.cd <= 0 && canSee) {
    e.cd = T.fire * rand(0.8, 1.2) * (ph === 3 ? 0.75 : 1); e.atk++;
    if (e.cd2 <= 0) { e.cd2 = 6; for (let k = 0; k < 4 + ph; k++) setTimeout(() => { if (enemies.has(e.id) && tgt) hostMortar(e, V(tgt.p.x + rand(-4, 4), tgt.p.y, tgt.p.z + rand(-4, 4)), T.mortar * e.dmgMul); }, k * 220); }
    else { const base = Math.atan2(aim.x - eye.x, aim.z - eye.z), n = 3 + ph; for (let k = -n; k <= n; k++) { const a = base + k * 0.085; const d = V(Math.sin(a), (aim.y - eye.y) / Math.max(1, dist), Math.cos(a)).normalize(); hostBolt(V(eye.x, eye.y + 0.3, eye.z), d, T.boltSpd, T.bolt * e.dmgMul); } }
  }
  if (!e.summoned && f < 0.5) { e.summoned = true; for (let k = 0; k < 4; k++) H.queue.push(k < 2 ? "drone" : "rusher"); G.left += 4; }
}
function hostBolt(p, dir, spd, dmg, k = "b") { const id = H.nextId++; const v = dir.clone().multiplyScalar(spd); addProj(id, k, p.clone(), v, dmg, 0); netSend({ t: "pj", id, k, p: vArr(p), v: vArr(v) }); }
function hostMortar(e, target, dmg) {
  const p = chestOf(e); p.y += 1; const tf = clamp(p.distanceTo(target) / 14, 1.0, 2.2);
  target.y = groundAt(target.x, target.z, target.y + 0.5);
  const v = V((target.x - p.x) / tf, (target.y - p.y + 0.5 * GRAV * 0.5 * tf * tf) / tf, (target.z - p.z) / tf);
  const id = H.nextId++; addProj(id, "m", p, v, dmg, 3.6, target); netSend({ t: "pj", id, k: "m", p: vArr(p), v: vArr(v), tg: vArr(target) });
}
function addProj(id, k, p, v, dmg = 0, splash = 0, tg = null) {
  const mesh = new THREE.Mesh(k === "m" ? mortarGeo : boltGeo, k === "m" ? mortarMat : k === "s" ? snipeMat : boltMat); mesh.position.copy(p);
  if (k === "b") mesh.scale.set(1, 1, 2.6); if (k === "s") mesh.scale.set(0.8, 0.8, 9);
  scene.add(mesh); const pj = { id, k, p, v, dmg, splash, mesh, life: 6 };
  if (tg) { pj.warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); pj.warn.position.set(tg.x, tg.y + 0.05, tg.z); pj.warn.scale.setScalar(3.6); scene.add(pj.warn); }
  eproj.set(id, pj);
  if (k === "b") SFX.bolt(distVol(p)); else if (k === "s") { SFX.snipe(distVol(p)); tracer(p, p.clone().addScaledVector(v, 0.6), 0xd080ff, 0.25); } else tone(160, 0.3, "sawtooth", 0.05 * distVol(p), 0.6);
}
function removeProj(pj, boom) {
  scene.remove(pj.mesh); if (pj.warn) scene.remove(pj.warn); eproj.delete(pj.id);
  if (boom) { if (pj.k === "m") explosion(pj.p, 3.6, 0xff9a2a); else spark(pj.p, pj.k === "s" ? 0xd080ff : 0xff4040, 8, 4, 1, 0.3); }
}
function hostEnemyBoom(e) { // rusher detonation
  const c = chestOf(e), R = 4.2;
  for (const pl of allPlayersForHits()) { if (!pl.alive) continue; const d = V(pl.p.x, pl.p.y + 1, pl.p.z).distanceTo(c); if (d < R) damagePlayer(pl.idx, ETYPES.rusher.boom * e.dmgMul * (1 - d / (R + 1.5)), c); }
  hostKillEnemy(e, -1);
}
function stepProjectiles(dt, sim) {
  eproj.forEach(pj => {
    if (pj.k === "m") pj.v.y -= GRAV * 0.5 * dt;
    const step = pj.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    const tw = rayWorld(pj.p, dir, len + 0.05);
    pj.p.add(step); pj.mesh.position.copy(pj.p);
    if (pj.k !== "m") pj.mesh.lookAt(tmpV.copy(pj.p).add(dir));
    if (pj.warn) { pj.warn.material.opacity = 0.5 + Math.sin(performance.now() / 60) * 0.3; pj.warn.rotation.y += dt * 3; }
    pj.life -= dt;
    if (!sim) { if (tw !== Infinity || pj.life <= 0) removeProj(pj, true); return; }
    let hit = tw !== Infinity || pj.life <= 0;
    if (!hit && pj.k !== "m") {
      // sweep test so fast sniper rounds can't tunnel through players
      for (const pl of allPlayersForHits()) {
        if (!pl.alive) continue;
        const c = V(pl.p.x, pl.p.y + 0.95, pl.p.z); const prev = pj.p.clone().sub(step);
        const t = clamp(tmpV.subVectors(c, prev).dot(dir), 0, len); const cl = prev.addScaledVector(dir, t);
        if (Math.hypot(cl.x - c.x, cl.z - c.z) < 0.55 && Math.abs(cl.y - c.y) < 0.95) {
          if (pl.idx === myIdx && me.dashT > 0) continue; // dodged through it
          damagePlayer(pl.idx, pj.dmg, pj.p); hit = true; break;
        }
      }
    }
    if (hit) {
      if (pj.k === "m") for (const pl of allPlayersForHits()) { if (!pl.alive) continue; const d = V(pl.p.x, pl.p.y + 1, pl.p.z).distanceTo(pj.p); if (d < pj.splash) damagePlayer(pl.idx, pj.dmg * (1 - d / (pj.splash + 1)), pj.p); }
      netSend({ t: "px", id: pj.id, p: vArr(pj.p) });
      removeProj(pj, true);
    }
  });
}
function damagePlayer(idx, n, from) {
  n = Math.round(n); if (n <= 0) return;
  if (idx === myIdx) takeDamage(n, from);
  else netSend({ t: "dmg", n, f: [r2(from.x), r2(from.z)] });
}
function hostDamageEnemy(id, dmg, by) {
  const e = enemies.get(id); if (!e || e.hp <= 0) return false;
  e.hp -= dmg; e.hpFrac = Math.max(0, e.hp / e.maxHp);
  e.model.userData.flashT = 0.07;
  // troopers and snipers roll out of the line of fire
  if ((e.type === "grunt" || e.type === "sniper") && e.dodgeCd <= 0 && e.charge <= 0 && Math.random() < 0.3 && e.body.grounded) {
    e.dodgeCd = 2.8; const s = Math.random() < 0.5 ? 1 : -1; const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    e.body.v.x += -fz * s * 11; e.body.v.z += fx * s * 11; e.body.v.y = 3.5;
  }
  if (e.hp <= 0) { hostKillEnemy(e, by); return true; }
  return false;
}
function hostKillEnemy(e, by) {
  netSend({ t: "kill", id: e.id, by, ty: e.type, el: e.elite ? 1 : 0 });
  onEnemyKilled(e, by);
  const r = Math.random();
  if (e.type === "boss") { hostDrop("hp", e.pos); hostDrop("ammo", e.pos.clone().add(V(2, 0, 0))); hostDrop("hp", e.pos.clone().add(V(-2, 0, 0))); }
  else if (r < (e.type === "tank" || e.type === "bulwark" || e.elite ? 0.6 : 0.14)) hostDrop("hp", e.pos);
  else if (r < (e.type === "tank" || e.type === "bulwark" || e.elite ? 1 : 0.24)) hostDrop("ammo", e.pos);
  G.left = Math.max(0, G.left - 1);
}
function rewardFor(type, elite) {
  const base = ETYPES[type].reward * (elite ? 2 : 1);
  me.combo = me.comboT > 0 ? me.combo + 1 : 1; me.comboT = COMBO_WIN; me.bestCombo = Math.max(me.bestCombo, me.combo);
  const mul = 1 + Math.min(me.combo - 1, 8) * 0.25;
  return Math.round(base * mul);
}
function onEnemyKilled(e, by) { // runs on both phones
  if (by === myIdx) {
    me.kills++; const r = rewardFor(e.type, e.elite); me.credits += r; me.ult = Math.min(1, me.ult + (e.type === "boss" ? 0.3 : 0.025));
    hitMarker(true); SFX.kill(); dmgNum(chestOf(e).add(V(0, 0.8, 0)), "+" + r + " ⬢", false, "#ffb02e");
    if (e.type === "boss") feed("TITAN DESTROYED +" + r + " ⬢", "#ffb02e"); else if (e.elite) feed("Elite " + ENAMES[e.type] + " down +" + r + " ⬢", "#ffb02e");
  }
  removeEnemyVisual(e, true);
}
function hostDrop(k, at) {
  const id = H.nextId++; const p = V(clamp(at.x, -HALF + 2, HALF - 2), 0, clamp(at.z, -HALF + 2, HALF - 2));
  let top = 0; for (const b of boxes) if (circleBox(p.x, p.z, 0.3, b) && b.y1 > top && b.y1 < 6.5) top = b.y1; p.y = top;
  addPickup(id, k, p); netSend({ t: "pk", id, k, p: vArr(p) });
}
function addPickup(id, k, p) {
  const g = new THREE.Group(); g.position.copy(p);
  const m = new THREE.Mesh(k === "hp" ? new THREE.OctahedronGeometry(0.35) : new THREE.BoxGeometry(0.5, 0.35, 0.35), pickMat[k]); m.position.y = 0.8; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), new THREE.MeshBasicMaterial({ color: k === "hp" ? 0x7dff8a : 0xffb02e, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  scene.add(g); pickups.set(id, { id, k, pos: p, mesh: g, item: m, life: 30, asked: 0 });
}
function removePickup(id) { const pk = pickups.get(id); if (!pk) return; scene.remove(pk.mesh); pickups.delete(id); }

// ===================================================================== boss hazards (every phone checks its own player)
const hazards = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function sendHazard(h) { netSend({ t: "hz", ...h }); startHazard(h); }
function startHazard(h) {
  const e = enemies.get(h.id); if (!e) return;
  if (h.k === "ph") { bigMsg(h.n === 2 ? "TITAN ENRAGED" : "TITAN OVERLOAD", h.n === 2 ? "Jump the laser sweep or get behind cover" : "Jump the shockwaves!", 2600); shake(0.5); SFX.ult(); return; }
  robotAttack(e);
  if (h.k === "sw") {
    const g = new THREE.Group(); const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 34), beamMat.clone()); beam.position.z = -17; g.add(beam);
    scene.add(g); hazards.push({ k: "sw", e, g, beam, t: 0, warm: 1.0, dur: 4.2, a: h.a, s: h.s, dm: h.dm, done: false });
    tone(120, 1.0, "sawtooth", 0.08, 3);
  } else if (h.k === "st") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(e.pos); ring.position.y = e.pos.y + 0.25; ring.visible = false; scene.add(ring);
    hazards.push({ k: "st", e, ring, t: 0, warm: 0.7, r: 0, o: e.pos.clone(), dm: h.dm, done: false });
  }
}
function updHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]; h.t += dt;
    if (h.k === "sw") {
      const o = h.e.pos; h.g.position.set(o.x, o.y + 0.75, o.z);
      const act = h.t > h.warm, prevA = h.cur ?? h.a;
      h.cur = h.a + (act ? h.s * (h.t - h.warm) * (Math.PI * 2 / (h.dur - h.warm)) : 0); h.g.rotation.y = h.cur;
      h.beam.scale.set(act ? 1.6 : 0.4, act ? 1.6 : 0.4, 1); h.beam.material.opacity = act ? 1 : (Math.sin(h.t * 40) > 0 ? 0.8 : 0.2);
      if (act && !h.done && !me.downed && !me.dead) {
        const p = me.body.p, dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
        const pa = Math.atan2(-dx, -dz); let d0 = pa - prevA, d1 = pa - h.cur;
        d0 = Math.atan2(Math.sin(d0), Math.cos(d0)); d1 = Math.atan2(Math.sin(d1), Math.cos(d1));
        const crossed = (Math.sign(d0) !== Math.sign(d1) && Math.abs(d0) < 1) || Math.abs(d1) < 0.02;
        const by = o.y + 0.75;
        if (crossed && d < 34 && p.y < by && p.y + P_H > by && me.dashT <= 0) {
          const from = V(o.x, by, o.z); const blocked = rayWorld(from, V(dx, p.y + 0.5 - by, dz).normalize(), d) !== Infinity;
          if (!blocked) { h.done = true; takeDamage(h.dm, from); spark(V(p.x, by, p.z), 0xff2040, 20, 6, 2, 0.4); }
        }
      }
      if (h.t > h.dur || !enemies.has(h.e.id)) { scene.remove(h.g); hazards.splice(i, 1); }
    } else if (h.k === "st") {
      if (h.t < h.warm) { if (h.t + dt >= h.warm * 0.5 && !h.boomed) { h.boomed = true; } continue; }
      if (!h.ring.visible) { h.ring.visible = true; explosion(h.o.clone().add(V(0, 0.4, 0)), 3, 0xff7a2e); shake(0.6); }
      const pr = h.r; h.r += dt * 13; h.ring.scale.set(h.r, 1 + h.r * 0.02, h.r); h.ring.material.opacity = Math.max(0, 1 - h.r / 34);
      if (!h.done && !me.downed && !me.dead) {
        const p = me.body.p, d = Math.hypot(p.x - h.o.x, p.z - h.o.z);
        if (d >= pr - 0.4 && d <= h.r + 0.4 && p.y - h.o.y < 0.45 && p.y >= h.o.y - 0.3 && me.dashT <= 0) { h.done = true; takeDamage(h.dm, h.o); me.body.v.y = 6; me.body.grounded = false; }
      }
      if (h.r > 34) { scene.remove(h.ring); hazards.splice(i, 1); }
    }
  }
}
function clearHazards() { hazards.splice(0).forEach(h => scene.remove(h.g || h.ring)); }

// ===================================================================== barrels
function hitBarrel(b, by) { if (mode === "guest") netSend({ t: "bh", i: b.i, by }); else hostBarrel(b.i, by); }
function hostBarrel(i, by) { const b = barrels[i]; if (!b || !b.alive) return; netSend({ t: "bx", i, by }); barrelBoom(i, by); }
function barrelBoom(i, by) {
  const b = barrels[i]; if (!b.alive) return; setBarrel(b, false);
  const at = V(b.x, 0.7, b.z), R = 5.5;
  explosion(at, 5, 0xff6a20); puff(at, 10, 1.5, 0.3);
  if (mode !== "guest") enemies.forEach(e => { const d = chestOf(e).distanceTo(at); if (d < R) hostDamageEnemy(e.id, 220 * (1 - d / (R * 1.3)), by); });
  const c = V(me.body.p.x, me.body.p.y + 0.9, me.body.p.z), d = c.distanceTo(at);
  if (d < R && !me.downed && !me.dead) { takeDamage(35 * (1 - d / R), at); me.body.v.addScaledVector(c.clone().sub(at).normalize(), 10 * (1 - d / R)); me.body.v.y += 5; me.body.grounded = false; }
}
function resetBarrels() { barrels.forEach(b => setBarrel(b, true)); }

// ===================================================================== waves (host)
function waveComposition(w, coop) {
  const list = [];
  if (w % 5 === 0) { list.push("boss"); for (let i = 0; i < 4 + w / 5 * 2; i++) list.push(["grunt", "drone", "grunt", "sniper"][i % 4]); return list; }
  const n = Math.round((5 + w * 2.6) * (coop ? 1.35 : 1));
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (w >= 4 && r < 0.07 + w * 0.006) list.push("tank");
    else if (w >= 3 && r < 0.16 + w * 0.006) list.push("bulwark");
    else if (w >= 2 && r < 0.3) list.push("sniper");
    else if (w >= 2 && r < 0.45) list.push("rusher");
    else if (r < 0.66) list.push("drone");
    else list.push("grunt");
  }
  return list.sort(() => Math.random() - 0.5);
}
function hostStartWave() {
  G.wave++; G.ph = "wave"; G.bonus = 0;
  H.queue = waveComposition(G.wave, mode === "host" && mate.on);
  G.left = H.queue.length; H.spawnT = 1.5; H.maxAlive = Math.min(9 + G.wave, 22);
  resetBarrels(); netSend({ t: "bb" });
  hostSendGm();
}
function hostTick(dt) {
  if (G.ph === "count") { G.tm -= dt; if (G.tm <= 0) hostStartWave(); }
  else if (G.ph === "wave") {
    H.spawnT -= dt;
    if (H.queue.length && H.spawnT <= 0 && enemies.size < H.maxAlive) { H.spawnT = Math.max(0.35, 1.1 - G.wave * 0.04); hostSpawnEnemy(H.queue.shift()); }
    if (!H.queue.length && enemies.size === 0) { G.ph = "break"; G.tm = BREAK_TIME; G.bonus = 100 + G.wave * 15; hostSendGm(); }
    const boss = [...enemies.values()].find(e => e.type === "boss"); G.bossFrac = boss ? boss.hpFrac : -1;
    const meOut = me.downed || me.dead, mateOut = !(mode === "host" && mate.on) || mate.downed || mate.dead;
    if (meOut && mateOut) { G.ph = "over"; hostSendGm(); }
  } else if (G.ph === "break") { G.tm -= dt; if (G.tm <= 0) hostStartWave(); }
  enemies.forEach(e => hostStepEnemy(e, dt));
  pickups.forEach(pk => { pk.life -= dt; if (pk.life <= 0) { removePickup(pk.id); netSend({ t: "pr", id: pk.id }); } });
}
function hostSendGm() { G.seq++; applyGm({ ...G }); netSend({ t: "gm", ...G }); }
function clearWorld() {
  enemies.forEach(e => removeEnemyVisual(e, false)); corpses.splice(0).forEach(e => disposeModel(e.model));
  eproj.forEach(p => removeProj(p, false)); [...pickups.keys()].forEach(removePickup);
  rockets.splice(0).forEach(r => scene.remove(r.mesh)); clearHazards(); [...lasers.keys()].forEach(stopLaser); resetBarrels();
}
function hostResetGame() {
  clearWorld();
  H.queue = []; Object.assign(G, { ph: "count", wave: 0, tm: 5, left: 0, bossFrac: -1, bonus: 0 });
  netSend({ t: "reset" }); localReset(); hostSendGm();
}
function localReset() {
  clearWorld();
  resetMe(true); spawnMe(); lastPh = null; showScreen(null); $("feed").innerHTML = "";
}

// phase changes, on both phones
let lastPh = null;
function applyGm(g) {
  const prev = lastPh; Object.assign(G, g); lastPh = G.ph;
  MUS.level = G.ph === "wave" ? (G.wave % 5 === 0 ? 3 : 2) : G.ph === "over" ? 0 : 1;
  if (prev === G.ph) return;
  if ((prev === null || prev === "connecting" || prev === "menu") && G.ph !== "over") showScreen(null);
  if (G.ph === "count") { showScreen(null); }
  if (G.ph === "wave") {
    SFX.wave(); if (G.wave % 5 !== 0) setTimeout(() => voice("vo_wave"), 300);
    bigMsg(G.wave % 5 === 0 ? "BOSS WAVE " + G.wave : "WAVE " + G.wave, G.wave % 5 === 0 ? "A Titan is coming" : G.wave === 2 ? "Snipers: break their red laser" : G.wave === 3 ? "Bulwarks: shoot them from the side" : G.wave === 6 ? "Elite robots glow gold" : "", 2400);
    if ($("shop").classList.contains("on")) showScreen(null);
  }
  if (G.ph === "break") {
    SFX.clear(); setTimeout(() => voice("vo_clear"), 200); me.credits += G.bonus;
    if (me.downed || me.dead) { resetMe(false); SFX.revive(); }
    else me.hp = Math.min(maxHp(), me.hp + 30);
    bigMsg("WAVE " + G.wave + " CLEARED", "+" + G.bonus + " ⬢  ·  open Upgrades", 2600);
    const b = +(store("it-best") || 0); if (G.wave > b) store("it-best", G.wave);
  }
  if (G.ph === "over") setTimeout(showOver, 1200);
}

// ===================================================================== local player
const input = { mx: 0, my: 0, lookX: 0, lookY: 0, fire: false, jump: false, swap: false, dash: false, nade: false, ult: false };
function takeDamage(n, from) {
  if (me.downed || me.dead || G.ph === "over") return;
  if (me.dashT > 0) return; // dash i-frames
  n = Math.round(n * (1 - me.up.armor * 0.08) * (me.odT > 0 ? 0.5 : 1));
  me.hp -= n; me.hurtT = 0.35; SFX.hurt(); shake(clamp(n / 60, 0.1, 0.5));
  if (from) dmgIndicator(from);
  if (me.hp <= 0) { me.hp = 0; me.downed = true; me.bleed = BLEED_TIME; me.revive = 0; me.odT = 0; SFX.down(); feed("You are down!", "#ff2e88"); }
}
function stepMe(dt) {
  const b = me.body;
  me.padCd -= dt; me.hurtT = Math.max(0, me.hurtT - dt); me.dashCd -= dt; me.nadeCd -= dt; me.dashT -= dt;
  if (me.comboT > 0) { me.comboT -= dt; if (me.comboT <= 0) me.combo = 0; }
  if (me.odT > 0) { me.odT -= dt; if (me.odT <= 0) feed("Overdrive ended", "#ffb02e"); }
  if (me.dead) return;
  if (me.downed) {
    b.v.x *= 0.8; b.v.z *= 0.8; moveBody(b, dt);
    me.bleed -= dt;
    const near = mate.on && !mate.downed && !mate.dead && mate.pos.distanceTo(b.p) < REVIVE_DIST;
    if (near) { me.revive += dt; if (me.revive >= REVIVE_TIME) { me.downed = false; me.hp = Math.round(maxHp() * 0.5); me.revive = 0; SFX.revive(); feed("Revived by " + mate.name, "#7dff8a"); } }
    else me.revive = Math.max(0, me.revive - dt * 0.5);
    if (me.bleed <= 0 && me.downed) { me.downed = false; me.dead = true; feed("You bled out. Back next wave.", "#ff2e88"); }
    input.dash = input.nade = input.ult = false;
    return;
  }
  // look
  me.yaw -= input.lookX; me.pitch = clamp(me.pitch - input.lookY, -1.2, 0.9); input.lookX = input.lookY = 0;
  // move relative to camera yaw
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  let wx = rx * input.mx + fx * -input.my, wz = rz * input.mx + fz * -input.my; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const spd = P_SPEED * (1 + me.up.speed * 0.07) * (me.odT > 0 ? 1.15 : 1), k = Math.min(1, dt * (b.grounded ? 12 : 3));
  // dash: short burst in the move direction (or forward), invulnerable while dashing
  if (input.dash && me.dashCd <= 0) {
    const l = Math.hypot(wx, wz); me.dashDir.set(l > 0.2 ? wx / l : fx, 0, l > 0.2 ? wz / l : fz);
    me.dashT = 0.2; me.dashCd = DASH_CD; SFX.dash(); spark(V(b.p.x, b.p.y + 1, b.p.z), COLORS[myColor], 14, 3, 0.5, 0.4);
  }
  input.dash = false;
  if (me.dashT > 0) { b.v.x = me.dashDir.x * 24; b.v.z = me.dashDir.z * 24; spark(V(b.p.x, b.p.y + rand(0.4, 1.6), b.p.z), COLORS[myColor], 2, 0.5, 0, 0.35); }
  else { b.v.x = lerp(b.v.x, wx * spd, k); b.v.z = lerp(b.v.z, wz * spd, k); }
  if (input.jump && b.grounded) { b.v.y = JUMPV; b.grounded = false; }
  input.jump = false;
  // jump pads
  if (b.grounded && me.padCd <= 0) for (const p of pads) if (Math.hypot(b.p.x - p.x, b.p.z - p.z) < 1.1 && b.p.y < 0.3) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1; b.v.y = 15.5; b.v.x = dx / d * 5.2; b.v.z = dz / d * 5.2; b.grounded = false; me.padCd = 0.5; SFX.pad(); spark(V(p.x, 0.2, p.z), 0x7dff8a, 20, 4, 6, 0.6);
  }
  moveBody(b, dt);
  // abilities
  if (input.nade && me.nadeCd <= 0) { me.nadeCd = NADE_CD; throwNade(); }
  input.nade = false;
  if (input.ult && me.ult >= 1 && me.odT <= 0) { me.ult = 0; me.odT = OD_TIME; SFX.ult(); shake(0.4); bigMsg("OVERDRIVE", "Double damage · infinite ammo", 1500); explosion(V(b.p.x, b.p.y + 1, b.p.z), 2.5, 0xffb02e); }
  input.ult = false;
  // weapons
  me.cd -= dt;
  if (input.swap) { input.swap = false; cycleWeapon(); }
  if (input.fire && me.cd <= 0 && G.ph !== "over") fireWeapon();
  // pickups
  pickups.forEach(pk => {
    if (Math.hypot(pk.pos.x - b.p.x, pk.pos.z - b.p.z) < 1.2 && Math.abs(pk.pos.y - b.p.y) < 1.5) {
      if (mode === "guest") { if (performance.now() - pk.asked > 600) { pk.asked = performance.now(); netSend({ t: "grab", id: pk.id }); } }
      else { removePickup(pk.id); netSend({ t: "got", id: pk.id, who: myIdx }); applyPickup(pk.k); }
    }
  });
}
function applyPickup(k) {
  SFX.pick();
  if (k === "hp") { me.hp = Math.min(maxHp(), me.hp + 35); feed("+35 health", "#7dff8a"); }
  else { WORDER.forEach(w => { if (me.owned[w] && w !== "rifle") me.ammo[w] = Math.min(WEAPONS[w].max, me.ammo[w] + Math.ceil(WEAPONS[w].max * 0.5)); }); me.nadeCd = 0; feed("Ammo + grenade refilled", "#ffb02e"); }
}
function cycleWeapon() {
  const owned = WORDER.filter(w => me.owned[w] && (me.ammo[w] > 0));
  const i = owned.indexOf(me.weapon); me.weapon = owned[(i + 1) % owned.length]; SFX.click();
}

// camera + aiming
const camPivot = V(), camWanted = V(), aimPoint = V();
let camKick = 0, fovKick = 0;
function updateCamera(dt) {
  let target = me.body.p, yaw = me.yaw, pitch = me.pitch;
  if (me.dead && mate.on) { target = mate.pos; yaw = mate.yaw; pitch = -0.25; }
  camKick = Math.max(0, camKick - dt * 5); pitch += camKick * 0.04;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fwd = V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camPivot.set(target.x + rx * 0.85, target.y + (me.downed ? 0.9 : 1.75), target.z + rz * 0.85);
  const dist = me.downed ? 5 : 4.3;
  camWanted.copy(camPivot).addScaledVector(fwd, -dist); camWanted.y += 0.5;
  const dir = tmpV2.subVectors(camWanted, camPivot); const len = dir.length(); dir.divideScalar(len);
  const hit = rayWorld(camPivot, dir, len + 0.3);
  if (hit !== Infinity) camWanted.copy(camPivot).addScaledVector(dir, Math.max(0.4, hit - 0.3));
  camera.position.copy(camWanted);
  const sh = shakeAmt * shakeAmt * 0.12;
  camera.quaternion.setFromEuler(new THREE.Euler(pitch + rand(-sh, sh), yaw + rand(-sh, sh), rand(-sh, sh) * 0.5, "YXZ"));
  fovKick = lerp(fovKick, me.dashT > 0 ? 9 : me.odT > 0 ? 4 : 0, Math.min(1, dt * 10));
  if (Math.abs(camera.fov - baseFov - fovKick) > 0.05) { camera.fov = baseFov + fovKick; camera.updateProjectionMatrix(); }
  if (window.__camO) { camera.position.copy(window.__camO[0]); camera.lookAt(window.__camO[1]); }
}
function computeAim(spread = 0) {
  const o = camera.position.clone();
  const d = V(0, 0, -1).applyQuaternion(camera.quaternion);
  if (spread) { d.x += rand(-spread, spread); d.y += rand(-spread, spread); d.z += rand(-spread, spread); d.normalize(); }
  // aim assist on touch: snap toward a robot close to the crosshair
  if (COARSE && !spread) {
    let best = null, bestA = 0.06;
    enemies.forEach(e => { if (e.spawnT > 0) return; const c = chestOf(e); const to = c.clone().sub(o); const dist = to.length(); to.normalize(); const a = Math.acos(clamp(to.dot(d), -1, 1)); const lim = bestA * (1 + 6 / Math.max(6, dist)); if (a < lim && los(o, c)) { best = to; bestA = a; } });
    if (best) d.lerp(best, 0.85).normalize();
  }
  const skip = o.distanceTo(camPivot) + 0.3; // ignore stuff between camera and the player
  const start = o.clone().addScaledVector(d, skip);
  let t = rayWorld(start, d, 250);
  enemies.forEach(e => { const te = rayEnemy(start, d, e); if (te < t) t = te; });
  if (t === Infinity) t = 120;
  return start.addScaledVector(d, t);
}
function dealDamage(e, dmg, crit, at) {
  me.dmgDone += dmg; me.ult = Math.min(1, me.ult + dmg / 2200);
  dmgNum(at, Math.round(dmg), crit);
  if (mode === "guest") { netSend({ t: "hit", id: e.id, d: Math.round(dmg) }); e.model.userData.flashT = 0.07; return false; }
  return hostDamageEnemy(e.id, dmg, myIdx);
}
function fireWeapon() {
  const W = WEAPONS[me.weapon], od = me.odT > 0;
  if (me.ammo[me.weapon] <= 0) { cycleWeapon(); return; }
  me.cd = 1 / (W.rate * (1 + me.up.rate * 0.12) * (od ? 1.5 : 1));
  if (W.max !== Infinity && !od) me.ammo[me.weapon]--;
  const dmgMul = (1 + me.up.dmg * 0.15) * (od ? 2 : 1);
  const muzzle = V(); me.model.userData.muzzle.getWorldPosition(muzzle);
  me.model.userData.flashT = 0.05; me.model.userData.recoil = W.rocket || W.pierce ? 1 : W.pellets > 1 ? 0.8 : 0.35; SFX[me.weapon]();
  camKick += W.rocket || W.pierce ? 1 : W.pellets > 1 ? 0.8 : 0.25;
  if (W.rocket) {
    const target = computeAim(); const dir = target.sub(muzzle).normalize();
    spawnRocket(muzzle, dir, true, W.dmg * dmgMul);
    netSend({ t: "rk", p: vArr(muzzle), d: vArr(dir) });
  } else {
    let hitAny = false, killed = false, critAny = false, blocked = false;
    for (let k = 0; k < W.pellets; k++) {
      const target = computeAim(W.spread);
      const dir = target.clone().sub(muzzle); const maxT = dir.length(); dir.normalize();
      let wallT = rayWorld(muzzle, dir, maxT + 0.01);
      const [bt, bb] = rayBarrel(muzzle, dir);
      const hits = [];
      enemies.forEach(e => { if (e.spawnT > 0) return; const r = rayEnemyX(muzzle, dir, e); if (r.t < Math.min(wallT, bt) && r.t <= maxT + 1) hits.push([r.t, e, r.crit]); });
      hits.sort((a, b) => a[0] - b[0]);
      const used = W.pierce ? hits : hits.slice(0, 1);
      let end = wallT !== Infinity ? muzzle.clone().addScaledVector(dir, wallT) : target;
      if (bb && bt <= wallT + 0.7 && (!used.length || W.pierce || bt < used[0][0])) { end = muzzle.clone().addScaledVector(dir, bt); hitBarrel(bb, myIdx); }
      if (!W.pierce && used.length) end = muzzle.clone().addScaledVector(dir, used[0][0]);
      for (const [t, e, crit] of used) {
        const hp = muzzle.clone().addScaledVector(dir, t);
        if (shielded(e, muzzle)) { blocked = true; spark(hp, 0x4aa8ff, 6, 4, 1, 0.3); if (!W.pierce) break; continue; }
        const dmg = W.dmg * dmgMul * (crit ? CRIT_MUL : 1); hitAny = true; if (crit) { critAny = true; me.crits++; }
        spark(hp, crit ? 0xfff07a : 0xffd27a, crit ? 10 : 6, 5, 1, 0.3);
        if (dealDamage(e, dmg, crit, hp)) killed = true;
      }
      if (!used.length && wallT !== Infinity) spark(end, W.color, 4, 3, 1, 0.25);
      tracer(muzzle, end, od ? 0xffc040 : W.color, W.pierce ? 0.35 : 0.06);
      if (k < 3) netSend({ t: "tr", a: vArr(muzzle), b: vArr(end), c: od ? 0xffc040 : W.color, l: W.pierce ? 0.35 : 0.06 });
    }
    if (hitAny && !killed) { hitMarker(false, critAny); critAny ? SFX.crit() : SFX.hit(); }
    else if (blocked && !hitAny) { SFX.block(); }
  }
}
function spawnRocket(p, dir, mine, dmg = 0) {
  const mesh = new THREE.Mesh(rocketGeo, rocketMat); mesh.position.copy(p); mesh.lookAt(p.clone().add(dir)); scene.add(mesh);
  rockets.push({ k: "r", p: p.clone(), v: dir.clone().multiplyScalar(30), mesh, mine, dmg, life: 4 });
}
function spawnNade(p, v, mine, dmg = 0) {
  const mesh = new THREE.Mesh(nadeGeo, nadeMat); mesh.position.copy(p); scene.add(mesh);
  rockets.push({ k: "g", p: p.clone(), v: v.clone(), mesh, mine, dmg, life: 1.6 });
}
function throwNade() {
  const p = V(); me.model.userData.muzzle.getWorldPosition(p);
  const target = computeAim(); const dir = target.clone().sub(p).normalize();
  const v = dir.multiplyScalar(17).add(V(0, 4.5, 0)).add(V(me.body.v.x * 0.5, 0, me.body.v.z * 0.5));
  spawnNade(p, v, true, 190 * (1 + me.up.dmg * 0.15) * (me.odT > 0 ? 2 : 1)); SFX.throw();
  netSend({ t: "gn", p: vArr(p), v: vArr(v) });
}
function stepRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    if (r.k === "g") r.v.y -= GRAV * 0.8 * dt;
    const step = r.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    let t = rayWorld(r.p, dir, len + (r.k === "g" ? 0.14 : 0));
    let hitE = false;
    if (r.mine) enemies.forEach(e => { const te = rayEnemy(r.p, dir, e); if (te < len + 0.2 && te < (t === Infinity ? 1e9 : t)) { t = te; hitE = true; } });
    if (r.mine && r.k === "r") { const [bt, bb] = rayBarrel(r.p, dir); if (bb && bt < len) hitBarrel(bb, myIdx); }
    r.life -= dt;
    if (r.k === "r") spark(r.p, 0xff9a40, 2, 1, 0.5, 0.3); else if (Math.random() < 0.5) spark(r.p, 0x7dff8a, 1, 0.5, 0.2, 0.25);
    if (r.k === "g" && t !== Infinity && !hitE && r.life > 0) {
      // bounce
      const at = r.p.clone().addScaledVector(dir, Math.max(0, t - 0.05)); r.p.copy(at);
      if (Math.abs(dir.y) > 0.6) { r.v.y = -r.v.y * 0.4; r.v.x *= 0.7; r.v.z *= 0.7; } else { r.v.x = -r.v.x * 0.5; r.v.z = -r.v.z * 0.5; }
      if (r.v.length() > 3) tone(900, 0.03, "triangle", 0.03 * distVol(r.p));
      r.mesh.position.copy(r.p); continue;
    }
    if ((t !== Infinity && (r.k === "r" || hitE)) || r.life <= 0) {
      const at = t !== Infinity ? r.p.clone().addScaledVector(dir, t) : r.p.clone();
      rocketBoom(r, at); scene.remove(r.mesh); rockets.splice(i, 1); continue;
    }
    r.p.add(step); r.mesh.position.copy(r.p);
  }
}
function rocketBoom(r, at) {
  const nade = r.k === "g";
  explosion(at, nade ? 4.6 : 4, nade ? 0x7dff8a : 0xff7a2e);
  if (!r.mine) return;
  const R = nade ? 5.2 : WEAPONS.rocket.splash; let hitAny = false;
  enemies.forEach(e => {
    const c = chestOf(e); const d = Math.max(0, c.distanceTo(at) - ETYPES[e.type].r * 0.5);
    if (d < R) { let dmg = r.dmg * (1 - d / (R * 1.4)); if (shielded(e, at)) dmg *= 0.35; hitAny = true; dealDamage(e, dmg, false, c); }
  });
  barrels.forEach(b => { if (b.alive && Math.hypot(b.x - at.x, b.z - at.z) < R * 0.8) hitBarrel(b, myIdx); });
  if (hitAny) { hitMarker(false); SFX.hit(); }
  // rocket jump: knock myself, a little self-damage
  const c = V(me.body.p.x, me.body.p.y + 0.9, me.body.p.z), d = c.distanceTo(at);
  if (d < 3.5 && !me.downed && !me.dead) { const k = 1 - d / 3.5; me.body.v.addScaledVector(c.clone().sub(at).normalize(), 14 * k); me.body.v.y += 9 * k; me.body.grounded = false; takeDamage(10 * k); }
  netSend({ t: "rx", p: vArr(at), g: nade ? 1 : 0 });
}

// ===================================================================== networking
let peer = null, conn = null, session = 0, lastStSent = 0, lastEnSent = 0, lastGmSent = 0;
const vArr = v => [r2(v.x), r2(v.y), r2(v.z)];
const arrV = a => V(a[0], a[1], a[2]);
function netSend(m) { if (conn && conn.open) { try { conn.send(m); } catch (e) {} } }
function peerOptions() {
  const o = { debug: 1 };
  const ps = qs.get("ps");
  if (ps) { const [h, pt] = ps.split(":"); o.host = h; o.port = +(pt || 443); o.path = "/"; o.secure = !(h === "localhost" || h === "127.0.0.1"); }
  return o;
}
function cleanup() {
  session++;
  try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {}
  conn = peer = null; mode = null; mate.on = false; mate.buf = [];
  if (mate.model) { scene.remove(mate.model); scene.remove(mate.label); mate.model = null; }
  clearWorld();
  G.ph = "menu"; lastPh = null; MUS.level = 0; releaseWake(); exitLock();
}
function backToMenu(msg) { cleanup(); showScreen("sMenu"); showBest(); if (msg) toast(msg, 3000); }
function makeCode() { let c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function startHost(tries = 0) {
  cleanup(); const my = session; mode = "host"; myIdx = 0; showScreen("sWait"); $("myCode").textContent = "····"; $("waitMsg").textContent = "Getting a code…"; startHost.code = null;
  const code = makeCode();
  peer = new Peer(ID_PREFIX + code, peerOptions());
  peer.on("open", () => { if (my !== session) return; $("myCode").textContent = code; $("waitMsg").textContent = "Send this code to your partner. The game starts when they join."; startHost.code = code; });
  peer.on("error", e => { if (my !== session) return; if (e.type === "unavailable-id" && tries < 5) return startHost(tries + 1); if (G.ph !== "menu") return; $("waitMsg").textContent = "Couldn't reach the game server (" + e.type + "). Check your connection and try again."; });
  peer.on("disconnected", () => { try { if (my === session && peer && !peer.destroyed) peer.reconnect(); } catch (e) {} });
  peer.on("connection", c => { if (my !== session) return; if (conn && conn.open) { c.on("open", () => { c.send({ t: "full" }); setTimeout(() => c.close(), 500); }); return; } conn = c; wireConn(c, my); });
}
function startJoin(code) {
  code = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) { $("joinErr").textContent = "The code is 4 letters."; return; }
  cleanup(); const my = session; mode = "guest"; myIdx = 1; showScreen("sBusy"); $("busyTitle").textContent = "Joining " + code + "…"; $("busyMsg").textContent = "One moment.";
  peer = new Peer(undefined, peerOptions());
  let opened = false;
  const fail = msg => { if (my !== session || opened) return; backToMenu(); showScreen("sJoin"); $("joinErr").textContent = msg; };
  peer.on("open", () => { if (my !== session) return; conn = peer.connect(ID_PREFIX + code, { reliable: true }); wireConn(conn, my); conn.on("open", () => { opened = true; $("busyMsg").textContent = "Connected. Starting…"; }); setTimeout(() => fail("Couldn't connect. Check the code and try again."), 20000); });
  peer.on("error", e => { if (e.type === "peer-unavailable") fail("No game with code " + code + ". Check the letters."); else if (!opened) fail("Couldn't reach the game server (" + e.type + ")."); });
}
function wireConn(c, my) {
  c.on("open", () => { if (my === session) c.send({ t: "hi", name: nameOr(myName, mode === "host" ? "Player 1" : "Player 2"), color: myColor }); });
  c.on("data", m => { if (my === session) { try { onData(m); } catch (e) { console.error(e); } } });
  c.on("close", () => { if (my === session && mode) backToMenu("Your partner left the game."); });
  c.on("error", () => {});
}
function remoteBoom(at, nade) { let best = null, bd = nade ? 7 : 3; rockets.forEach(r => { if (!r.mine) { const d = r.p.distanceTo(at); if (d < bd) { bd = d; best = r; } } }); if (best) { scene.remove(best.mesh); rockets.splice(rockets.indexOf(best), 1); } explosion(at, nade ? 4.6 : 4, nade ? 0x7dff8a : 0xff7a2e); }
function onData(m) {
  if (!m || typeof m !== "object") return;
  switch (m.t) {
    case "full": return backToMenu("That game already has two players.");
    case "hi": {
      mate.name = nameOr(String(m.name || ""), "Partner"); mate.color = clamp(Math.floor(+m.color || 0), 0, COLORS.length - 1);
      if (mate.color === myColor) mate.color = (mate.color + 1) % COLORS.length;
      mate.on = true; buildMate();
      if (G.ph === "menu") startGame();
      break;
    }
    case "st": {
      const s = { t: performance.now(), p: arrV(m.p), v: m.v ? arrV(m.v) : V(), yaw: m.y, pitch: m.pi };
      mate.buf.push(s); if (mate.buf.length > 30) mate.buf.shift();
      mate.hp = m.hp; mate.mhp = m.mh; mate.downed = !!m.dn; mate.dead = !!m.dd; mate.revive = m.rv || 0; mate.weapon = m.w; mate.kills = m.k || 0; mate.od = !!m.od; mate.lastSeen = performance.now();
      break;
    }
    case "tr": tracer(arrV(m.a), arrV(m.b), m.c, m.l); if (mate.model) { mate.model.userData.flashT = 0.05; mate.model.userData.recoil = 0.4; } if (!playBuf("rifle", 0.12 * distVol(arrV(m.a)), 0.9)) tone(700, 0.05, "square", 0.02); break;
    case "rk": spawnRocket(arrV(m.p), arrV(m.d), false); SFX.rocket(); break;
    case "gn": spawnNade(arrV(m.p), arrV(m.v), false); break;
    case "rx": remoteBoom(arrV(m.p), !!m.g); break;
    // host -> guest
    case "gm": if (mode === "guest" && G.ph !== "menu") applyGm(m); break;
    case "reset": if (mode === "guest") { localReset(); } break;
    case "en": if (mode === "guest") guestEnemies(m); break;
    case "kill": if (mode === "guest") { const e = enemies.get(m.id); if (e) { e.elite = !!m.el; onEnemyKilled(e, m.by); } else if (m.by === myIdx) { me.kills++; me.credits += rewardFor(m.ty, !!m.el); } } break;
    case "pj": if (mode === "guest") addProj(m.id, m.k, arrV(m.p), arrV(m.v), 0, 0, m.tg ? arrV(m.tg) : null); break;
    case "px": if (mode === "guest") { const pj = eproj.get(m.id); if (pj) { pj.p.copy(arrV(m.p)); removeProj(pj, true); } } break;
    case "dmg": takeDamage(m.n, V(m.f[0], 1, m.f[1])); break;
    case "pk": if (mode === "guest") addPickup(m.id, m.k, arrV(m.p)); break;
    case "pr": removePickup(m.id); break;
    case "got": removePickup(m.id); if (m.who === myIdx) applyPickup(m.k || "hp"); break;
    case "lz": if (mode === "guest") { if (m.d > 0) startLaser(m.id, m.tg, m.d); else stopLaser(m.id); } break;
    case "hz": if (mode === "guest") startHazard(m); break;
    case "bx": if (mode === "guest") barrelBoom(m.i, m.by); break;
    case "bb": if (mode === "guest") resetBarrels(); break;
    // guest -> host
    case "hit": if (mode === "host") { const e = enemies.get(m.id); if (e) hostDamageEnemy(m.id, clamp(+m.d || 0, 0, 3000), 1); } break;
    case "grab": if (mode === "host") { const pk = pickups.get(m.id); if (pk) { removePickup(pk.id); netSend({ t: "got", id: pk.id, who: 1, k: pk.k }); } } break;
    case "bh": if (mode === "host") hostBarrel(m.i, 1); break;
  }
}
function guestEnemies(m) {
  const now = performance.now(), seen = new Set();
  for (const [id, ty, x, y, z, yaw, hf, fl] of m.e) {
    seen.add(id);
    let e = enemies.get(id);
    if (!e) { e = addEnemyVisual(id, ty, x, y, z, hf, !!(fl & 1)); e.atk = (fl >> 2) & 7; }
    e.buf.push({ t: now, x, y, z, yaw }); if (e.buf.length > 12) e.buf.shift();
    if (hf < e.hpFrac - 0.001) e.model.userData.flashT = 0.07;
    e.hpFrac = hf; applyFlags(e, fl || 0);
  }
  enemies.forEach(e => { if (!seen.has(e.id) && now - (e.buf.length ? e.buf[e.buf.length - 1].t : 0) > 600) removeEnemyVisual(e, false); });
  G.bossFrac = m.bf;
}
function interp(buf, delay) {
  if (!buf.length) return null;
  const t = performance.now() - delay;
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1], b = buf[i];
    if (a.t <= t && t <= b.t) { const k = (t - a.t) / Math.max(1, b.t - a.t); return { a, b, k }; }
  }
  const last = buf[buf.length - 1]; return { a: last, b: last, k: 0 };
}
function buildMate() {
  if (mate.model) { scene.remove(mate.model); scene.remove(mate.label); }
  mate.model = makeSoldier(COLORS[mate.color]); scene.add(mate.model);
  mate.label = labelSprite(mate.name, COLORS[mate.color]); scene.add(mate.label);
}
function updateMate(dt) {
  if (!mate.on || !mate.model) return;
  const r = interp(mate.buf, 110);
  if (r) {
    const { a, b, k } = r;
    mate.pos.lerpVectors(a.p, b.p, k); mate.yaw = angLerp(a.yaw, b.yaw, k); mate.pitch = lerp(a.pitch, b.pitch, k);
    mate.vel = b.v;
  }
  mate.model.visible = !mate.dead;
  mate.model.position.copy(mate.pos); mate.model.rotation.y = mate.yaw;
  animSoldier(mate.model, mate.vel, mate.pitch * 0.8, mate.downed, dt, mate.od);
  mate.label.position.set(mate.pos.x, mate.pos.y + (mate.downed ? 1.4 : 2.35), mate.pos.z);
  if (mate.downed) mate.label.userData.set("⚠ REVIVE " + (mate.revive > 0 ? Math.round(mate.revive / REVIVE_TIME * 100) + "%" : mate.name), "#ff2e88");
  else mate.label.userData.set(mate.name, COLORS[mate.color]);
  mate.label.visible = !mate.dead;
}

// ===================================================================== start / UI
function startGame() {
  showScreen(null); requestWake(); hideMenuBots();
  if (me.model) scene.remove(me.model);
  me.model = makeSoldier(COLORS[myColor]); scene.add(me.model);
  if (mode === "host" || mode === "solo") { lastPh = "menu"; hostResetGame(); }
  else { localReset(); G.ph = "connecting"; }
}
const screens = ["sMenu", "sJoin", "sWait", "sBusy", "sHelp", "shop", "sOver"];
function showScreen(id) {
  screens.forEach(s => $(s).classList.toggle("on", s === id));
  const inGame = (id === null || id === "shop") && mode && G.ph !== "menu";
  $("hud").classList.toggle("on", !!inGame);
  ["bFire", "bJump", "bSwap", "bDash", "bNade", "bUlt"].forEach(b => $(b).classList.toggle("on", !!inGame && id === null && COARSE));
  $("bQuit").classList.toggle("on", !!inGame && id === null); $("bMus2").classList.toggle("on", !!inGame && id === null);
  if (id !== null) exitLock();
}
document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => { if ($("sHelp").classList.contains("on") && !mode) return showScreen("sMenu"); backToMenu(); });
$("bHelp").onclick = () => showScreen("sHelp");
const ready = () => { if (!ASSETS.robot) { toast("Still loading…"); return false; } ac(); return true; };
$("bHost").onclick = () => { if (ready()) startHost(); };
$("bJoin").onclick = () => { if (!ready()) return; $("joinErr").textContent = ""; showScreen("sJoin"); setTimeout(() => $("codeIn").focus(), 50); };
$("bJoinGo").onclick = () => { if (ready()) startJoin($("codeIn").value); };
$("codeIn").addEventListener("keydown", e => { if (e.key === "Enter" && ready()) startJoin($("codeIn").value); });
document.querySelectorAll(".mus").forEach(b => b.onclick = () => { ac(); setMusic(!MUS.on); });
setMusic(MUS.on);
$("bSolo").onclick = () => { if (!ready()) return; cleanup(); mode = "solo"; myIdx = 0; startGame(); };
$("bQuit").onclick = () => backToMenu();
$("bOverLeave").onclick = () => backToMenu();
$("bAgain").onclick = () => { if (mode === "host" && !(conn && conn.open)) return backToMenu("Your partner left the game."); hostResetGame(); };
$("bShare").onclick = async () => {
  const code = startHost.code; if (!code) return;
  const url = location.origin + location.pathname + "?join=" + code, text = "Iron Tide co-op code: " + code;
  try { if (navigator.share) await navigator.share({ title: "Iron Tide", text, url }); else { await navigator.clipboard.writeText(text + " " + url); toast("Copied"); } } catch (e) {}
};
if (qs.get("join")) { $("codeIn").value = qs.get("join").toUpperCase().slice(0, 4); showScreen("sJoin"); }

function showOver() {
  if (G.ph !== "over") return;
  $("overTitle").textContent = "OVERRUN";
  $("overSub").textContent = "You held out until wave " + G.wave + ".";
  let html = "<span>" + nameOr(myName, "You") + " kills</span><b>" + me.kills + "</b>";
  if (mate.on) html += "<span>" + mate.name + " kills</span><b>" + mate.kills + "</b>";
  html += "<span>Your damage</span><b>" + Math.round(me.dmgDone) + "</b><span>Weak-point hits</span><b>" + me.crits + "</b><span>Best kill streak</span><b>" + me.bestCombo + "</b><span>Best wave</span><b>" + Math.max(G.wave, +(store("it-best") || 0)) + "</b>";
  $("overStats").innerHTML = html;
  const host = mode !== "guest"; $("bAgain").style.display = host ? "block" : "none"; $("overWait").style.display = host ? "none" : "block";
  showScreen("sOver");
}

// shop
function renderShop() {
  $("shopCred").textContent = "⬢ " + me.credits;
  let html = "";
  for (const w of BUY_WEAPONS) {
    const own = me.owned[w.id];
    if (!own) html += row(WEAPONS[w.id].name, w.desc, w.cost, "w:" + w.id);
  }
  const anyAmmo = WORDER.some(w => me.owned[w] && w !== "rifle" && me.ammo[w] < WEAPONS[w].max);
  if (anyAmmo) html += row("Ammo refill", "Fill every special weapon", AMMO_COST, "ammo");
  for (const u of UPGRADES) { const lv = me.up[u.id]; html += row(u.name + ' <small style="color:var(--accent)">Lv ' + lv + "/" + u.max + "</small>", u.desc, lv >= u.max ? null : u.cost[lv], "u:" + u.id); }
  if (me.hp < maxHp()) html += row("Repair", "Restore full health", 50, "heal");
  $("shopList").innerHTML = html;
  $("shopList").querySelectorAll("button[data-k]").forEach(b => b.onclick = () => buy(b.dataset.k, +b.dataset.c));
  $("bNextWave").style.display = mode !== "guest" && G.ph === "break" ? "block" : "none";
  function row(name, desc, cost, key) { return '<div class="shoprow"><div><b>' + name + "</b><small>" + desc + "</small></div>" + (cost == null ? '<button disabled>MAX</button>' : '<button class="' + (me.credits >= cost ? "pri" : "") + '" data-k="' + key + '" data-c="' + cost + '"' + (me.credits >= cost ? "" : " disabled") + ">⬢ " + cost + "</button>") + "</div>"; }
}
function buy(k, cost) {
  if (me.credits < cost) return;
  me.credits -= cost; SFX.buy();
  if (k.startsWith("w:")) { const w = k.slice(2); me.owned[w] = true; me.ammo[w] = WEAPONS[w].max; me.weapon = w; }
  else if (k === "ammo") WORDER.forEach(w => { if (me.owned[w] && w !== "rifle") me.ammo[w] = WEAPONS[w].max; });
  else if (k === "heal") me.hp = maxHp();
  else if (k.startsWith("u:")) { const id = k.slice(2); me.up[id]++; if (id === "hp") me.hp += 25; }
  renderShop();
}
$("bShop").onclick = () => { renderShop(); showScreen("shop"); };
$("bShopClose").onclick = () => showScreen(null);
$("bNextWave").onclick = () => { if (mode !== "guest" && G.ph === "break") { G.tm = 0.01; showScreen(null); } };

// HUD
function bigMsg(t, sub = "", ms = 2000) { $("msg").innerHTML = t + (sub ? "<small>" + sub + "</small>" : ""); $("msg").style.opacity = 1; clearTimeout(bigMsg.h); bigMsg.h = setTimeout(() => $("msg").style.opacity = 0, ms); }
function feed(t, col = "#fff") { const d = document.createElement("div"); d.textContent = t; d.style.color = col; $("feed").prepend(d); setTimeout(() => d.remove(), 4000); while ($("feed").children.length > 5) $("feed").lastChild.remove(); }
function hitMarker(kill, crit) { const h = $("hitm"); h.classList.toggle("kill", kill); h.classList.toggle("crit", !!crit && !kill); h.style.transition = "none"; h.style.opacity = 1; requestAnimationFrame(() => { h.style.transition = "opacity .25s"; h.style.opacity = 0; }); }
function dmgIndicator(from) {
  $("vig").style.boxShadow = "inset 0 0 120px 40px rgba(255,0,40,.55)"; clearTimeout(dmgIndicator.h); dmgIndicator.h = setTimeout(() => $("vig").style.boxShadow = "inset 0 0 120px 40px rgba(255,0,40,0)", 180);
  if (!from) return; // red arc pointing at whoever hit us
  const a = Math.atan2(from.x - me.body.p.x, from.z - me.body.p.z), rel = a - Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw));
  const el = $("dmgdir"); el.style.transform = "translate(-50%,-50%) rotate(" + (-rel) + "rad)"; el.style.transition = "none"; el.style.opacity = 1;
  requestAnimationFrame(() => { el.style.transition = "opacity .8s"; el.style.opacity = 0; });
}
// edge markers: partner position (red when down) and snipers aiming at me
function edgeMark(el, world, color, label) {
  tmpV3.copy(world).project(camera); const w = innerWidth, h = innerHeight;
  const behind = tmpV3.z > 1; let x = tmpV3.x, y = tmpV3.y; if (behind) { x = -x; y = -y; }
  const on = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
  if (!on) { const m = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, 1e-3); x /= m; y /= m; if (behind && Math.abs(y) < 0.85 && Math.abs(x) < 0.9) y = -0.85; }
  el.style.display = "block"; el.style.color = color; el.textContent = label;
  el.style.transform = "translate(" + ((x + 1) / 2 * w).toFixed(0) + "px," + ((1 - y) / 2 * h).toFixed(0) + "px) translate(-50%,-50%)";
  return on;
}
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const ph = G.ph;
  $("wave").textContent = ph === "count" ? "GET READY" : ph === "break" ? "WAVE " + G.wave + " CLEARED" : ph === "over" ? "OVERRUN" : "WAVE " + G.wave;
  $("sub").textContent = ph === "count" ? "First wave in " + Math.ceil(G.tm) + "s" : ph === "break" ? "Next wave in " + Math.ceil(G.tm) + "s" : ph === "wave" ? G.left + " robots left" : "";
  $("boss").style.display = G.bossFrac >= 0 && ph === "wave" ? "block" : "none"; $("boss").firstChild.style.width = Math.max(0, G.bossFrac * 100) + "%";
  const mh = maxHp(); $("hptxt").textContent = (me.dead ? "DEAD" : me.downed ? "DOWN · " + Math.ceil(me.bleed) + "s" : Math.ceil(me.hp) + " / " + mh);
  $("hpbar").firstChild.style.width = (me.downed || me.dead ? 0 : me.hp / mh * 100) + "%";
  $("cred").textContent = "⬢ " + me.credits;
  const W = WEAPONS[me.weapon]; $("wpn").innerHTML = W.name + "<small>" + (W.max === Infinity ? "∞" : me.ammo[me.weapon] + " / " + W.max) + "</small>";
  if (mate.on) $("mate").innerHTML = '<span style="color:' + COLORS[mate.color] + '">' + mate.name + "</span>" + (mate.dead ? " · OUT" : mate.downed ? ' · <span style="color:#ff2e88">DOWN</span>' : "") + '<div class="bar"><i style="width:' + (mate.downed || mate.dead ? 0 : clamp(mate.hp / mate.mhp, 0, 1) * 100) + '%;background:' + COLORS[mate.color] + '"></i></div>';
  else $("mate").innerHTML = "";
  const showShopBtn = ph === "break" && !$("shop").classList.contains("on") && $("hud").classList.contains("on");
  $("bShop").classList.toggle("on", showShopBtn);
  if (me.downed) { $("msg").style.opacity = 1; $("msg").innerHTML = "YOU ARE DOWN<small>" + (mate.on && !mate.downed && !mate.dead ? (me.revive > 0 ? "Reviving… " + Math.round(me.revive / REVIVE_TIME * 100) + "%" : mate.name + " can revive you. Hold on " + Math.ceil(me.bleed) + "s") : "No one left to revive you") + "</small>"; }
  else if (me.dead && ph === "wave") { $("msg").style.opacity = 1; $("msg").innerHTML = "SPECTATING<small>You'll be back when the wave is cleared</small>"; }
  else if ($("msg").innerHTML.startsWith("YOU ARE DOWN") || $("msg").innerHTML.startsWith("SPECTATING")) $("msg").style.opacity = 0;
  // abilities
  const cdFill = (el, f, lbl) => { el.style.setProperty("--f", (clamp(f, 0, 1) * 360).toFixed(0) + "deg"); el.classList.toggle("ready", f >= 1); if (lbl !== undefined) el.firstChild.textContent = lbl; };
  cdFill($("bDash"), 1 - Math.max(0, me.dashCd) / DASH_CD); cdFill($("bNade"), 1 - Math.max(0, me.nadeCd) / NADE_CD);
  cdFill($("bUlt"), me.odT > 0 ? me.odT / OD_TIME : me.ult, me.odT > 0 ? Math.ceil(me.odT) + "s" : Math.floor(me.ult * 100) + "%");
  $("abil").innerHTML = (COARSE ? "" : '<span class="' + (me.dashCd <= 0 ? "ok" : "") + '">⇧ Dash</span><span class="' + (me.nadeCd <= 0 ? "ok" : "") + '">G Grenade</span>') + '<span class="' + (me.ult >= 1 ? "ok ult" : me.odT > 0 ? "ult" : "") + '">' + (COARSE ? "" : "F ") + "Overdrive " + (me.odT > 0 ? Math.ceil(me.odT) + "s" : Math.floor(me.ult * 100) + "%") + "</span>";
  $("combo").style.opacity = me.combo >= 2 && me.comboT > 0 ? 1 : 0;
  if (me.combo >= 2) $("combo").innerHTML = me.combo + " KILL STREAK<small>scrap x" + (1 + Math.min(me.combo - 1, 8) * 0.25).toFixed(2).replace(/0$/, "") + "</small>";
  document.body.classList.toggle("od", me.odT > 0);
}
function updateMarkers() {
  const mk = $("mkMate");
  if (mate.on && mate.model && !mate.dead && !me.dead) { const on = edgeMark(mk, V(mate.pos.x, mate.pos.y + 1.2, mate.pos.z), mate.downed ? "#ff2e88" : COLORS[mate.color], mate.downed ? "✚ " + Math.round(mate.pos.distanceTo(me.body.p)) + "m" : "◆"); if (on && !mate.downed) mk.style.display = "none"; mk.classList.toggle("pulse", mate.downed); }
  else mk.style.display = "none";
  let n = 0; const els = [$("mk1"), $("mk2"), $("mk3")];
  lasers.forEach((L, id) => { if (L.tgt !== myIdx || n >= 3) return; const e = enemies.get(id); if (!e) return; const on = edgeMark(els[n], chestOf(e), "#ff2050", "⚠"); if (on) els[n].style.display = "none"; n++; });
  for (; n < 3; n++) els[n].style.display = "none";
}

// ===================================================================== input
const touch = $("touch");
const ptr = new Map(); // id -> {role, x, y, ox, oy}
const joy = { id: null, ox: 0, oy: 0 };
const LOOK_SENS = 0.0058;
let joyVis = null;
touch.addEventListener("pointerdown", e => {
  if (!mode || G.ph === "menu") return;
  if (!COARSE) { requestLock(); return; }
  const left = e.clientX < innerWidth * 0.42;
  if (left && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; ptr.set(e.pointerId, { role: "move", x: e.clientX, y: e.clientY }); }
  else ptr.set(e.pointerId, { role: "look", x: e.clientX, y: e.clientY });
  touch.setPointerCapture(e.pointerId);
});
touch.addEventListener("pointermove", e => {
  const p = ptr.get(e.pointerId); if (!p) return;
  if (p.role === "move") {
    const R = clamp(Math.min(innerWidth, innerHeight) * 0.12, 44, 80);
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy);
    if (d > R) { joy.ox = e.clientX - dx / d * R; joy.oy = e.clientY - dy / d * R; dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; }
    input.mx = dx / R; input.my = dy / R;
  } else lookDelta(e.clientX - p.x, e.clientY - p.y);
  p.x = e.clientX; p.y = e.clientY;
});
const endPtr = e => { const p = ptr.get(e.pointerId); if (!p) return; if (p.role === "move") { joy.id = null; input.mx = input.my = 0; } ptr.delete(e.pointerId); };
touch.addEventListener("pointerup", endPtr); touch.addEventListener("pointercancel", endPtr);
function lookDelta(dx, dy) { const s = LOOK_SENS * (innerWidth > innerHeight ? 1 : 1.25); input.lookX += dx * s; input.lookY += dy * s * 0.85; }
// fire button doubles as an aim pad
const fireBtn = $("bFire"); let fireP = null;
fireBtn.addEventListener("pointerdown", e => { e.preventDefault(); ac(); input.fire = true; fireP = { id: e.pointerId, x: e.clientX, y: e.clientY }; fireBtn.setPointerCapture(e.pointerId); });
fireBtn.addEventListener("pointermove", e => { if (!fireP || e.pointerId !== fireP.id) return; lookDelta(e.clientX - fireP.x, e.clientY - fireP.y); fireP.x = e.clientX; fireP.y = e.clientY; });
const fireUp = e => { if (fireP && e.pointerId === fireP.id) { fireP = null; input.fire = false; } };
fireBtn.addEventListener("pointerup", fireUp); fireBtn.addEventListener("pointercancel", fireUp);
$("bJump").addEventListener("pointerdown", e => { e.preventDefault(); input.jump = true; });
$("bSwap").addEventListener("pointerdown", e => { e.preventDefault(); input.swap = true; });
$("bDash").addEventListener("pointerdown", e => { e.preventDefault(); input.dash = true; });
$("bNade").addEventListener("pointerdown", e => { e.preventDefault(); input.nade = true; });
$("bUlt").addEventListener("pointerdown", e => { e.preventDefault(); input.ult = true; });
// keyboard + mouse
const keys = {};
addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return; const k = e.key.toLowerCase(); keys[k] = true;
  if (k === " ") { input.jump = true; e.preventDefault(); }
  if (k === "q" || k === "e") input.swap = true;
  if (k === "shift") input.dash = true;
  if (k === "g") input.nade = true;
  if (k === "f" || k === "v") input.ult = true;
  if (k === "b" && G.ph === "break") { renderShop(); showScreen($("shop").classList.contains("on") ? null : "shop"); }
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
function keyMove() {
  if (COARSE && joy.id !== null) return;
  const x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (x || y || keyMove.on) { input.mx = x; input.my = y; keyMove.on = !!(x || y); }
}
function requestLock() { if (document.pointerLockElement !== touch) touch.requestPointerLock?.(); }
function exitLock() { if (document.pointerLockElement) document.exitPointerLock?.(); }
addEventListener("mousemove", e => { if (document.pointerLockElement === touch) { input.lookX += e.movementX * 0.0025; input.lookY += e.movementY * 0.0025; } });
addEventListener("mousedown", e => { if (document.pointerLockElement === touch && e.button === 0) input.fire = true; if (document.pointerLockElement === touch && e.button === 2) input.nade = true; });
addEventListener("contextmenu", e => { if (mode) e.preventDefault(); });
addEventListener("mouseup", e => { if (e.button === 0 && !fireP) input.fire = false; });

// keep screen awake
let wake = null;
async function requestWake() { try { if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && mode) requestWake(); });

// ===================================================================== main loop
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, quality = 2;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const playing = mode && G.ph !== "menu";
  if (playing) {
    keyMove();
    acc += dt;
    while (acc >= 1 / 60) {
      const sdt = 1 / 60; acc -= sdt;
      if (G.ph !== "connecting") stepMe(sdt);
      if (mode !== "guest") hostTick(sdt);
      stepProjectiles(sdt, mode !== "guest");
      stepRockets(sdt);
    }
    stepCorpses(dt);
    // guest: interpolate robots
    if (mode === "guest") enemies.forEach(e => { const r = interp(e.buf, 110); if (r) { const { a, b, k } = r; const px = e.pos.x, pz = e.pos.z; e.pos.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)); e.yaw = angLerp(a.yaw, b.yaw, k); e.moving = Math.hypot(e.pos.x - px, e.pos.z - pz) / Math.max(dt, 1e-3); } });
    enemies.forEach(e => animEnemy(e, dt, now));
    // my model
    if (me.model) {
      me.model.visible = !me.dead;
      me.model.position.copy(me.body.p); me.model.rotation.y = me.yaw;
      animSoldier(me.model, me.body.v, me.pitch * 0.8, me.downed, dt, me.odT > 0);
    }
    updateMate(dt);
    pickups.forEach(pk => { pk.item.rotation.y += dt * 2; pk.item.position.y = 0.8 + Math.sin(now / 300 + pk.id) * 0.12; });
    padMeshes.forEach((m, i) => m.scale.setScalar(1 + Math.sin(now / 200 + i) * 0.06));
    portalMeshes.forEach(m => m.rotation.z += dt);
    updateCamera(dt);
    updateHud(dt); updateMarkers();
    // network
    if (conn && conn.open) {
      if (now - lastStSent > 50) { lastStSent = now; netSend({ t: "st", p: vArr(me.body.p), v: vArr(me.body.v), y: r2(me.yaw), pi: r2(me.pitch), hp: Math.ceil(me.hp), mh: maxHp(), dn: me.downed ? 1 : 0, dd: me.dead ? 1 : 0, rv: r2(me.revive), w: me.weapon, k: me.kills, od: me.odT > 0 ? 1 : 0 }); }
      if (mode === "host") {
        if (now - lastEnSent > 50) { lastEnSent = now; const e = []; enemies.forEach(x => e.push([x.id, x.type, r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.yaw), r2(x.hpFrac), enemyFlags(x)])); netSend({ t: "en", e, bf: r2(G.bossFrac) }); }
        if (now - lastGmSent > 250) { lastGmSent = now; netSend({ t: "gm", ...G }); }
      }
    }
  } else {
    // menu: slow orbit camera over the arena
    camera.position.set(Math.sin(now / 7000) * 5, 4.2, -7.5); camera.lookAt(0, 2.8, -20);
    portalMeshes.forEach(m => m.rotation.z += dt);
    menuBots.forEach(b => b.userData.mixer.update(dt));
  }
  updEffects(dt); musicTick();
  if (useBloom) composer.render(); else renderer.render(scene, camera);
  // automatic quality: drop effects if the phone struggles
  if (playing) {
    fpsT += dt; fpsN++;
    if (fpsT > 4) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      if (fps < 42 && quality === 2) { quality = 1; useBloom = false; }
      else if (fps < 38 && quality === 1) { quality = 0; renderer.shadowMap.enabled = false; sun.castShadow = false; renderer.setPixelRatio(1); resize(); }
    }
  }
}
requestAnimationFrame(frame);
if (qs.get("lowfx")) { useBloom = false; }

// load the 3D characters, then unlock the menu; a few robots pose in the arena behind the menu
const menuBots = [];
$("best").textContent = "Loading 3D models… 0%";
loadAssets(f => $("best").textContent = "Loading 3D models… " + Math.round(f * 100) + "%").then(() => {
  showBest(); document.body.classList.add("loaded");
  for (const [t, x, z, yaw, anim] of [["boss", 0, -26, 0, "Idle"], ["grunt", -5, -18, 0.4, "Idle"], ["sniper", 6, -19, -0.5, "Idle"], ["bulwark", 2.5, -14, 0.1, "Walking"]]) {
    const m = makeRobot(t); m.position.set(x, 0, z); m.rotation.y = yaw; const u = m.userData; if (anim !== "Idle") robotBase(u, anim); u.mixer.update(rand(0, 2)); menuBots.push(m);
  }
}).catch(e => { console.error(e); $("best").textContent = "Couldn't load the 3D models. Check your connection and reload."; });
function hideMenuBots() { menuBots.splice(0).forEach(m => { scene.remove(m); scene.remove(m.userData.bar); }); }

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// test hooks
window.__it = { G, me, mate, input, camera, chestOf, enemies, H, pickups, hostSpawnEnemy, hostDamageEnemy, barrels, hazards, lasers, corpses, ASSETS, MUS, scene, startHazard, hitBarrel, get mode() { return mode; }, get quality() { return quality; } };
