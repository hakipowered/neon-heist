// Iron Tide: online co-op third-person robot-wave shooter.
// One phone hosts (runs the robots, waves and pickups); each phone owns its own
// player (movement, health, shots). Connection is peer-to-peer via PeerJS.
import * as THREE from 'three';
import { EffectComposer } from './lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/jsm/postprocessing/OutputPass.js';

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
  drone:  { hp: 35,  speed: 6.5, r: 0.55, h: 0.9, fly: true, reward: 15, fire: 1.7, range: 32, bolt: 7,  boltSpd: 20 },
  grunt:  { hp: 75,  speed: 3.8, r: 0.5,  h: 1.9, reward: 20, fire: 1.4, range: 30, bolt: 10, boltSpd: 22, keep: 11 },
  rusher: { hp: 45,  speed: 8.2, r: 0.5,  h: 1.2, reward: 15, boom: 28 },
  tank:   { hp: 420, speed: 2.3, r: 1.15, h: 2.6, reward: 60, fire: 3.0, range: 45, mortar: 26, keep: 16 },
  boss:   { hp: 2600, speed: 2.6, r: 1.9, h: 5.2, reward: 400, fire: 2.2, range: 60, bolt: 12, boltSpd: 18, mortar: 30, keep: 14 }
};
// hit spheres: [yOffset, radius] measured from the feet (drones from their center)
const HITS = {
  drone: [[0, 0.62]], grunt: [[0.55, 0.42], [1.15, 0.45], [1.7, 0.32]], rusher: [[0.6, 0.62]],
  tank: [[0.7, 1.15], [1.7, 0.95]], boss: [[1.4, 1.5], [3.0, 1.6], [4.6, 1.0]],
  player: [[0.5, 0.42], [1.05, 0.42], [1.6, 0.3]]
};

// ===================================================================== profile
let myName = store("it-name") || "", myColor = clamp(+(store("it-color") || 0), 0, COLORS.length - 1);
$("nameIn").value = myName;
COLORS.forEach((c, i) => { const d = document.createElement("div"); d.className = "sw" + (i === myColor ? " sel" : ""); d.style.boxShadow = "inset 0 0 0 6px " + c + ",0 0 12px " + c; d.onclick = () => { myColor = i; store("it-color", i); document.querySelectorAll(".sw").forEach((s, j) => s.classList.toggle("sel", j === i)); }; $("colors").appendChild(d); });
$("nameIn").oninput = () => { myName = $("nameIn").value.trim(); store("it-name", myName); };
const nameOr = (n, d) => (n || "").trim().slice(0, 12) || d;
function showBest() { const b = +(store("it-best") || 0); $("best").textContent = b ? "Best: wave " + b : ""; }
showBest();

// ===================================================================== audio
let actx = null, noiseBuf = null;
function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); const n = actx.sampleRate; noiseBuf = actx.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } catch (e) {} } return actx; }
function tone(freq, dur = 0.08, type = "sine", vol = 0.1, slide = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.3, vol = 0.2, freq = 800) {
  const a = ac(); if (!a || !noiseBuf) return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noiseBuf; f.type = "lowpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + dur);
}
function distVol(p) { if (!camera) return 1; return clamp(1 - camera.position.distanceTo(p) / 60, 0.05, 1); }
const SFX = {
  rifle: () => tone(900, 0.07, "square", 0.05, 0.35),
  shotgun: () => { noise(0.25, 0.25, 2500); tone(160, 0.15, "square", 0.06, 0.5); },
  rail: () => { tone(1800, 0.45, "sawtooth", 0.06, 0.15); noise(0.2, 0.08, 6000); },
  rocket: () => { noise(0.4, 0.12, 1200); tone(220, 0.35, "sawtooth", 0.04, 0.4); },
  boom: (v = 1) => { noise(0.7, 0.35 * v, 900); tone(70, 0.5, "sine", 0.25 * v, 0.4); },
  hit: () => tone(1400, 0.04, "square", 0.04),
  kill: () => { tone(1100, 0.06, "square", 0.05); setTimeout(() => tone(1600, 0.08, "square", 0.05), 50); },
  hurt: () => { tone(140, 0.2, "sawtooth", 0.1, 0.5); if (navigator.vibrate) navigator.vibrate(60); },
  bolt: v => tone(500, 0.12, "triangle", 0.035 * v, 2),
  pad: () => tone(200, 0.4, "sine", 0.12, 3.5),
  pick: () => { tone(880, 0.1, "triangle", 0.1); setTimeout(() => tone(1320, 0.12, "triangle", 0.1), 70); },
  buy: () => { tone(660, 0.08, "triangle", 0.1); setTimeout(() => tone(990, 0.15, "triangle", 0.1), 80); },
  wave: () => { [220, 165, 220, 165].forEach((f, i) => setTimeout(() => tone(f, 0.35, "sawtooth", 0.06), i * 380)); },
  clear: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.1), i * 120)); },
  down: () => { tone(400, 0.8, "sawtooth", 0.08, 0.2); if (navigator.vibrate) navigator.vibrate([100, 60, 200]); },
  revive: () => { [440, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.15, "triangle", 0.1), i * 90)); },
  click: () => tone(1200, 0.03, "square", 0.03)
};

// ===================================================================== renderer / scene
const view = $("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x05070f, 40, 110);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;

scene.add(new THREE.HemisphereLight(0xa8c0ff, 0x30244a, 2.2));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
sun.position.set(20, 40, 12); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
sun.shadow.bias = -0.0008;
scene.add(sun);
const flash = new THREE.PointLight(0xff8844, 0, 18, 2); scene.add(flash);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  // keep a sensible horizontal field of view whether folded (tall) or unfolded (wide/square)
  const hfov = 82 * Math.PI / 180;
  camera.fov = clamp(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI, 52, 96);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
if (window.visualViewport) visualViewport.addEventListener("resize", resize);
new ResizeObserver(resize).observe(document.documentElement);
resize();

// ===================================================================== world
const boxes = []; // {x0,y0,z0,x1,y1,z1}
const matFloor = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d");
  g.fillStyle = "#1a2038"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#2a3c78"; g.lineWidth = 4; g.strokeRect(0, 0, 512, 512);
  g.strokeStyle = "#222e5a"; g.lineWidth = 2; g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  for (let i = 0; i < 300; i++) { g.fillStyle = "rgba(255,255,255," + Math.random() * 0.03 + ")"; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HALF / 2, HALF / 2); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.2 });
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), matFloor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const matBlock = new THREE.MeshStandardMaterial({ color: 0x3a4570, roughness: 0.6, metalness: 0.15 });
const matWall = new THREE.MeshStandardMaterial({ color: 0x252d50, roughness: 0.75, metalness: 0.1 });
const edgeMats = [0x2ef2ff, 0xff2e88, 0xa46bff].map(c => new THREE.LineBasicMaterial({ color: c }));
function block(cx, cz, w, d, h, y0 = 0, edge = 0, mat = matBlock) {
  const b = { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 };
  boxes.push(b);
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat); m.position.set(cx, y0 + h / 2, cz); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (edge >= 0) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMats[edge]); e.position.copy(m.position); scene.add(e); }
  return b;
}
// perimeter
block(0, -HALF - 0.5, HALF * 2 + 2, 1, 7, 0, 0, matWall); block(0, HALF + 0.5, HALF * 2 + 2, 1, 7, 0, 0, matWall);
block(-HALF - 0.5, 0, 1, HALF * 2, 7, 0, 0, matWall); block(HALF + 0.5, 0, 1, HALF * 2, 7, 0, 0, matWall);
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
  const base = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0x3a0610 }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.03; g.add(base);
  scene.add(g); return ring;
});
// background: distant city of glowing towers + stars
(() => {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), d = rand(60, 95), h = rand(8, 40), w = rand(3, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rand(0.55, 0.95), 0.6, rand(0.03, 0.08)) }));
    m.scale.set(w, h, w); m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); scene.add(m);
    if (Math.random() < 0.5) { const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x2ef2ff : 0xff2e88 })); s.scale.set(w * 1.02, 0.3, w * 1.02); s.position.set(m.position.x, h - 2 - rand(0, h * 0.3), m.position.z); scene.add(s); }
  }
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const th = rand(0, Math.PI * 2), ph = rand(0.05, 1.3), r = 200; pos[i * 3] = Math.cos(th) * Math.cos(ph) * r; pos[i * 3 + 1] = Math.sin(ph) * r; pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false })));
})();

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
let boomNext = 0, flashT = 0;
function explosion(p, r = 3, color = 0xff8a3a) {
  const b = booms[boomNext = (boomNext + 1) % booms.length]; b.m.position.copy(p); b.m.material.color.set(color); b.m.visible = true; b.life = 0.45; b.r = r;
  spark(p, color, 40, 12, 3, 0.8); spark(p, 0xffffff, 12, 6, 2, 0.4);
  flash.position.copy(p); flash.color.set(color); flash.intensity = 60; flashT = 0.25;
  SFX.boom(distVol(p));
}
function updEffects(dt) {
  tracers.forEach(t => { if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.l.visible = false; } });
  booms.forEach(b => { if (b.life > 0) { b.life -= dt; const k = 1 - b.life / 0.45; b.m.scale.setScalar(b.r * (0.3 + k * 0.9)); b.m.material.opacity = Math.max(0, 1 - k); if (b.life <= 0) b.m.visible = false; } });
  if (flashT > 0) { flashT -= dt; flash.intensity = Math.max(0, flashT / 0.25 * 60); }
  updParticles(dt);
}

// ===================================================================== models
function glowMat(c, i = 2.2) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }); }
const darkArmor = new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.5, metalness: 0.2 });
const lightArmor = new THREE.MeshStandardMaterial({ color: 0xaab4c8, roughness: 0.45, metalness: 0.15 });
function shadowAll(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; } }); return o; }
function makeSoldier(colorHex) {
  const col = new THREE.Color(colorHex), g = new THREE.Group(), glow = glowMat(col, 2.5);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), darkArmor); torso.position.y = 1.18; g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.2), lightArmor); chest.position.set(0, 1.3, -0.16); g.add(chest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), glow); stripe.position.set(0, 1.32, -0.27); g.add(stripe);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.22), darkArmor); pack.position.set(0, 1.25, 0.28); g.add(pack);
  const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), glow); packGlow.position.set(0, 1.25, 0.4); g.add(packGlow);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), lightArmor); head.position.y = 1.68; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.14), glow); visor.position.set(0, 1.7, -0.17); g.add(visor);
  const legs = [], arms = new THREE.Group();
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.15, 0.82, 0); g.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), darkArmor); leg.position.y = -0.4; hip.add(leg);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.05), glow); knee.position.set(0, -0.38, -0.12); hip.add(knee);
    legs.push(hip);
  }
  arms.position.set(0, 1.42, 0); g.add(arms);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.5), darkArmor); a.position.set(s * 0.22, -0.12, -0.25); arms.add(a); }
  const gun = new THREE.Group(); gun.position.set(0.12, -0.12, -0.55); arms.add(gun);
  const gbody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.7), lightArmor); gun.add(gbody);
  const gtip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), glow); gtip.position.z = -0.38; gun.add(gtip);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -0.5; gun.add(muzzle);
  const mflash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); mflash.position.z = -0.55; mflash.visible = false; gun.add(mflash);
  shadowAll(g); mflash.castShadow = false;
  g.userData = { legs, arms, muzzle, mflash, gtip, phase: 0, flashT: 0 };
  return g;
}
function animSoldier(m, speed, pitch, downed, dt) {
  const u = m.userData;
  u.phase += dt * speed * 1.6;
  const sw = Math.sin(u.phase) * Math.min(1, speed / 4) * 0.7;
  u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
  u.arms.rotation.x = pitch;
  m.rotation.x = downed ? lerp(m.rotation.x, -1.35, Math.min(1, dt * 6)) : lerp(m.rotation.x, 0, Math.min(1, dt * 10));
  if (u.flashT > 0) { u.flashT -= dt; u.mflash.visible = true; u.mflash.scale.setScalar(rand(0.7, 1.3)); } else u.mflash.visible = false;
}
const robotRed = glowMat(0xff2a2a, 3), robotOrange = glowMat(0xff7a1a, 3), robotBody = new THREE.MeshStandardMaterial({ color: 0x8a8f9e, roughness: 0.4, metalness: 0.25 }), robotDark = new THREE.MeshStandardMaterial({ color: 0x3a3d48, roughness: 0.5, metalness: 0.2 });
function makeRobot(type) {
  const g = new THREE.Group(), u = { parts: {} };
  if (type === "drone") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), robotBody); g.add(b);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), robotRed); eye.position.z = -0.38; g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), robotRed); ring.rotation.x = Math.PI / 2; g.add(ring); u.parts.ring = ring;
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), robotDark); w.position.x = s * 0.55; g.add(w); }
  } else if (type === "grunt") {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.5), robotBody); torso.position.y = 1.25; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), robotDark); head.position.y = 1.82; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05), robotRed); visor.position.set(0, 1.84, -0.22); g.add(visor);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), robotRed); core.rotation.x = Math.PI / 2; core.position.set(0, 1.28, -0.26); g.add(core);
    const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.75), robotDark); cannon.position.set(0.5, 1.25, -0.25); g.add(cannon);
    const ctip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), robotRed); ctip.position.set(0.5, 1.25, -0.64); g.add(ctip);
    const legs = [];
    for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(s * 0.22, 0.88, 0); const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.88, 0.24), robotDark); l.position.y = -0.44; hip.add(l); g.add(hip); legs.push(hip); }
    u.parts.legs = legs;
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
  } else if (type === "boss") {
    const s = 1;
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.2), robotDark); pelvis.position.y = 2.2; g.add(pelvis);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.0, 1.8), robotBody); torso.position.y = 3.5; g.add(torso);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), robotRed); core.position.set(0, 3.5, -0.85); g.add(core); u.parts.core = core;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.0), robotDark); head.position.y = 4.85; g.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.05), robotRed); eye.position.set(0, 4.9, -0.52); g.add(eye);
    for (const sd of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), robotDark); sh.position.set(sd * 1.85, 4.1, 0); g.add(sh);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.2), robotBody); arm.position.set(sd * 1.85, 3.4, -0.7); g.add(arm);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), robotRed); tip.rotation.x = Math.PI / 2; tip.position.set(sd * 1.85, 3.4, -1.82); g.add(tip);
    }
    const legs = [];
    for (const sd of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(sd * 0.75, 2.1, 0); const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.9), robotDark); l.position.y = -1.05; hip.add(l); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.4), robotBody); foot.position.set(0, -1.95, -0.15); hip.add(foot); g.add(hip); legs.push(hip); }
    u.parts.legs = legs; u.parts.s = s;
  }
  // health bar (billboarded)
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3355, depthWrite: false })); fg.position.z = 0.001;
  bar.add(bg, fg); bar.visible = false; scene.add(bar);
  u.bar = bar; u.fg = fg; u.phase = rand(0, 6);
  shadowAll(g); g.userData = u; scene.add(g);
  return g;
}
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
const me = {
  body: { p: V(), v: V(), r: P_R, h: P_H, grounded: false },
  yaw: 0, pitch: -0.1, hp: 100, downed: false, dead: false, bleed: 0, revive: 0,
  weapon: "rifle", owned: { rifle: true }, ammo: { rifle: Infinity }, cd: 0,
  credits: 0, up: { dmg: 0, rate: 0, hp: 0, armor: 0, speed: 0 }, kills: 0, dmgDone: 0, model: null, label: null, padCd: 0, hurtT: 0
};
function maxHp() { return 100 + me.up.hp * 25; }
function resetMe(full) {
  if (full) { me.credits = 0; me.up = { dmg: 0, rate: 0, hp: 0, armor: 0, speed: 0 }; me.owned = { rifle: true }; me.ammo = { rifle: Infinity }; me.weapon = "rifle"; me.kills = 0; me.dmgDone = 0; }
  me.hp = maxHp(); me.downed = false; me.dead = false; me.bleed = 0; me.revive = 0;
}
function spawnMe() {
  me.body.p.set(myIdx === 0 ? -1.6 : 1.6, 3, 1.5); me.body.v.set(0, 0, 0); me.yaw = 0; me.pitch = -0.08;
}
// partner (remote)
const mate = { on: false, buf: [], pos: V(), yaw: 0, pitch: 0, hp: 100, mhp: 100, downed: false, dead: false, revive: 0, weapon: "rifle", kills: 0, name: "Partner", color: 1, model: null, label: null, speed: 0, lastSeen: 0 };

// shared game (host-authoritative)
const G = { ph: "menu", wave: 0, tm: 0, left: 0, bossFrac: -1, bonus: 0, seq: 0 };
// host-only wave data
const H = { queue: [], spawnT: 0, nextId: 1, maxAlive: 10 };

// enemies: id -> {id,type,pos,yaw,hp,maxHp,model,scale, (host) body,cd,... (guest) buf}
const enemies = new Map();
// enemy projectiles: id -> {id,k,p,v,dmg,splash,mesh,owner}
const eproj = new Map();
// player rockets (local and remote visuals)
const rockets = [];
// pickups: id -> {id,k,pos,mesh}
const pickups = new Map();

const boltGeo = new THREE.SphereGeometry(0.16, 8, 6), mortarGeo = new THREE.SphereGeometry(0.32, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff4040 }), mortarMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
const rocketGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0 });
const pickMat = { hp: glowMat(0x7dff8a, 2.5), ammo: glowMat(0xffb02e, 2.5) };

// ===================================================================== enemies: shared visuals
function addEnemyVisual(id, type, x, y, z, hpFrac = 1) {
  const e = { id, type, pos: V(x, y, z), yaw: 0, hpFrac, model: makeRobot(type), scale: 1, buf: [], spawnT: 0.6, moving: 0 };
  e.model.position.copy(e.pos);
  enemies.set(id, e);
  spark(V(x, y + 1, z), 0xff2a2a, 25, 5, 3, 0.6);
  return e;
}
function removeEnemyVisual(e, exploded) {
  scene.remove(e.model); scene.remove(e.model.userData.bar);
  e.model.traverse(m => { if (m.geometry) m.geometry.dispose(); });
  enemies.delete(e.id);
  if (exploded) { const c = chestOf(e); explosion(c, e.type === "boss" ? 7 : e.type === "tank" ? 4 : 2.2, e.type === "rusher" ? 0xff7a1a : 0xff4a3a); }
}
function animEnemy(e, dt, now) {
  const u = e.model.userData;
  e.model.position.copy(e.pos); e.model.rotation.y = e.yaw;
  if (e.spawnT > 0) { e.spawnT -= dt; e.model.scale.setScalar(Math.max(0.05, 1 - e.spawnT / 0.6) * (e.scale || 1)); } else e.model.scale.setScalar(e.scale || 1);
  u.phase += dt * (2 + e.moving * 1.2);
  if (u.parts.legs) { const sw = Math.sin(u.phase) * Math.min(1, e.moving / 2) * 0.6; u.parts.legs[0].rotation.x = sw; u.parts.legs[1].rotation.x = -sw; }
  if (u.parts.ring) u.parts.ring.rotation.z += dt * 8;
  if (u.parts.glow) { const k = 1 + Math.sin(now / (e.near ? 40 : 120)) * 0.15; u.parts.glow.scale.setScalar(k); u.parts.body.rotation.y += dt * 6; }
  if (u.parts.core) u.parts.core.scale.setScalar(1 + Math.sin(now / 150) * 0.1);
  // health bar
  const bar = u.bar, hs = HITS[e.type]; const top = hs[hs.length - 1][0] * (e.scale || 1) + hs[hs.length - 1][1] + 0.35;
  bar.visible = e.hpFrac < 0.999 && e.type !== "boss" && e.spawnT <= 0;
  if (bar.visible) { bar.position.set(e.pos.x, e.pos.y + top, e.pos.z); bar.quaternion.copy(camera.quaternion); const w = e.type === "tank" ? 2 : 1.1; bar.scale.set(w, 1.2, 1); u.fg.scale.x = Math.max(0.001, e.hpFrac); u.fg.position.x = -(1 - e.hpFrac) / 2; }
}

// ===================================================================== host: enemy simulation
function playersForAI() {
  const list = [];
  if (!me.downed && !me.dead) list.push({ idx: myIdx, p: me.body.p });
  if (mode === "host" && mate.on && !mate.downed && !mate.dead) list.push({ idx: 1, p: mate.pos });
  return list;
}
function allPlayersForHits() {
  const list = [{ idx: myIdx, p: me.body.p, alive: !me.downed && !me.dead }];
  if (mode === "host" && mate.on) list.push({ idx: 1, p: mate.pos, alive: !mate.downed && !mate.dead });
  return list;
}
function hostSpawnEnemy(type) {
  const coop = mode === "host" && mate.on;
  const [px, pz] = portals[Math.floor(Math.random() * portals.length)];
  const T = ETYPES[type];
  const scaleHp = (1 + 0.13 * (G.wave - 1)) * (coop ? 1.55 : 1);
  const id = H.nextId++;
  const y = T.fly ? 6 : 0;
  const e = addEnemyVisual(id, type, px + rand(-1, 1), y, pz + rand(-1, 1));
  e.hp = e.maxHp = Math.round(T.hp * scaleHp);
  e.body = { p: e.pos, v: V(), r: T.r, h: T.h, grounded: false, noStep: false };
  e.cd = rand(1, 2.5); e.cd2 = 5; e.side = Math.random() < 0.5 ? 1 : -1; e.sideT = 0; e.stuckT = 0; e.summoned = false; e.target = null;
  e.dmgMul = 1 + 0.06 * (G.wave - 1);
  return e;
}
function hostStepEnemy(e, dt) {
  const T = ETYPES[e.type];
  if (e.spawnT > 0) return;
  const targets = playersForAI();
  let tgt = null, best = 1e9;
  for (const t of targets) { const d = t.p.distanceTo(e.pos); if (d < best) { best = d; tgt = t; } }
  e.cd -= dt; e.cd2 -= dt;
  const desired = V();
  let face = null;
  if (tgt) {
    tmpV.subVectors(tgt.p, e.pos); tmpV.y = 0; const dist = tmpV.length(); tmpV.normalize();
    face = Math.atan2(-tmpV.x, -tmpV.z);
    e.sideT -= dt; if (e.sideT <= 0) { e.sideT = rand(1.5, 3.5); if (Math.random() < 0.4) e.side *= -1; }
    if (e.type === "rusher") { desired.copy(tmpV); e.near = dist < 6; if (dist < 1.9 + T.r) { hostEnemyBoom(e); return; } }
    else if (T.keep) {
      if (dist > T.keep + 3) desired.copy(tmpV);
      else if (dist < T.keep - 4) desired.copy(tmpV).multiplyScalar(-0.7);
      desired.addScaledVector(V(-tmpV.z, 0, tmpV.x), e.side * 0.8);
    } else if (T.fly) {
      desired.copy(tmpV).multiplyScalar(dist > 9 ? 1 : -0.3).addScaledVector(V(-tmpV.z, 0, tmpV.x), e.side);
    }
    // shooting
    const eye = chestOf(e); const aim = V(tgt.p.x, tgt.p.y + 1.1, tgt.p.z);
    if (e.cd <= 0 && dist < T.range && los(eye, aim)) {
      if (e.type === "boss") {
        e.cd = T.fire * rand(0.8, 1.2);
        if (e.cd2 <= 0) { e.cd2 = 6; for (let k = 0; k < 4; k++) setTimeout(() => { if (enemies.has(e.id) && tgt) hostMortar(e, V(tgt.p.x + rand(-4, 4), tgt.p.y, tgt.p.z + rand(-4, 4)), T.mortar * e.dmgMul); }, k * 250); }
        else { const base = Math.atan2(aim.x - eye.x, aim.z - eye.z); for (let k = -3; k <= 3; k++) { const a = base + k * 0.09; const d = V(Math.sin(a), (aim.y - eye.y) / Math.max(1, dist), Math.cos(a)).normalize(); hostBolt(V(eye.x, eye.y + 0.3, eye.z), d, T.boltSpd, T.bolt * e.dmgMul); } }
        if (!e.summoned && e.hp < e.maxHp * 0.5) { e.summoned = true; for (let k = 0; k < 4; k++) H.queue.push("drone"); G.left += 4; }
      } else if (T.mortar) { e.cd = T.fire * rand(0.8, 1.2); hostMortar(e, tgt.p.clone(), T.mortar * e.dmgMul); }
      else if (T.bolt) {
        e.cd = T.fire * rand(0.75, 1.25);
        const lead = 0.25 * dist / T.boltSpd; const mv = tgt.idx === myIdx ? me.body.v : mate.vel || V();
        const aimP = aim.clone().addScaledVector(mv, lead).add(V(rand(-0.6, 0.6), rand(-0.3, 0.3), rand(-0.6, 0.6)));
        hostBolt(eye, aimP.sub(eye).normalize(), T.boltSpd, T.bolt * e.dmgMul);
      }
    }
  } else { desired.set(Math.sin(e.id + performance.now() / 4000), 0, Math.cos(e.id * 1.3 + performance.now() / 5000)); }
  if (desired.lengthSq() > 1e-4) desired.normalize();
  // obstacle avoidance for ground robots
  if (!T.fly && desired.lengthSq() > 0) {
    const o = V(e.pos.x, e.pos.y + Math.min(1, T.h * 0.5), e.pos.z);
    if (rayWorld(o, desired, 1.6 + T.r) !== Infinity) {
      for (const a of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4].map(x => x * e.side)) { const d = V(desired.x * Math.cos(a) - desired.z * Math.sin(a), 0, desired.x * Math.sin(a) + desired.z * Math.cos(a)); if (rayWorld(o, d, 1.6 + T.r) === Infinity) { desired.copy(d); break; } }
    }
  }
  // separation
  enemies.forEach(o => { if (o === e) return; const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = (T.r + ETYPES[o.type].r) * 1.1; if (d < m && d > 0.01 && Math.abs(e.pos.y - o.pos.y) < 2) { desired.x += dx / d * 0.8; desired.z += dz / d * 0.8; } });
  const spd = T.speed;
  if (T.fly) {
    e.body.v.x = lerp(e.body.v.x, desired.x * spd, Math.min(1, dt * 2)); e.body.v.z = lerp(e.body.v.z, desired.z * spd, Math.min(1, dt * 2));
    const alt = 5.8 + Math.sin(performance.now() / 700 + e.id) * 0.6;
    e.pos.x += e.body.v.x * dt; e.pos.z += e.body.v.z * dt; e.pos.y = lerp(e.pos.y, alt, Math.min(1, dt * 2));
    e.pos.x = clamp(e.pos.x, -HALF + 1, HALF - 1); e.pos.z = clamp(e.pos.z, -HALF + 1, HALF - 1);
  } else {
    const k = Math.min(1, dt * 6);
    e.body.v.x = lerp(e.body.v.x, desired.x * spd, k); e.body.v.z = lerp(e.body.v.z, desired.z * spd, k);
    const before = e.pos.clone(); moveBody(e.body, dt);
    const moved = Math.hypot(e.pos.x - before.x, e.pos.z - before.z) / dt;
    if (moved < spd * 0.2 && desired.lengthSq() > 0.1) { e.stuckT += dt; if (e.stuckT > 0.6) { e.stuckT = 0; e.side *= -1; if (e.body.grounded && e.type !== "tank" && e.type !== "boss") e.body.v.y = 8; } } else e.stuckT = 0;
    e.moving = moved;
  }
  if (face !== null) e.yaw = angLerp(e.yaw, face, Math.min(1, dt * 5));
}
function hostBolt(p, dir, spd, dmg) { const id = H.nextId++; addProj(id, "b", p.clone(), dir.clone().multiplyScalar(spd), dmg, 0); netSend({ t: "pj", id, k: "b", p: vArr(p), v: vArr(dir.clone().multiplyScalar(spd)) }); }
function hostMortar(e, target, dmg) {
  const p = chestOf(e); p.y += 1; const tf = clamp(p.distanceTo(target) / 14, 1.0, 2.2);
  const v = V((target.x - p.x) / tf, (target.y - p.y + 0.5 * GRAV * 0.5 * tf * tf) / tf, (target.z - p.z) / tf);
  const id = H.nextId++; addProj(id, "m", p, v, dmg, 3.6); netSend({ t: "pj", id, k: "m", p: vArr(p), v: vArr(v) });
}
function addProj(id, k, p, v, dmg = 0, splash = 0) {
  const mesh = new THREE.Mesh(k === "m" ? mortarGeo : boltGeo, k === "m" ? mortarMat : boltMat); mesh.position.copy(p);
  if (k === "b") mesh.scale.set(1, 1, 2.6);
  scene.add(mesh); eproj.set(id, { id, k, p, v, dmg, splash, mesh, life: 6 });
  if (k === "b") SFX.bolt(distVol(p)); else tone(160, 0.3, "sawtooth", 0.05 * distVol(p), 0.6);
}
function removeProj(pj, boom) { scene.remove(pj.mesh); eproj.delete(pj.id); if (boom) { if (pj.k === "m") explosion(pj.p, 3.6, 0xff9a2a); else spark(pj.p, 0xff4040, 8, 4, 1, 0.3); } }
function hostEnemyBoom(e) { // rusher detonation
  const c = chestOf(e);
  for (const pl of allPlayersForHits()) { if (!pl.alive) continue; const d = V(pl.p.x, pl.p.y + 1, pl.p.z).distanceTo(c); if (d < 3.3) damagePlayer(pl.idx, ETYPES.rusher.boom * e.dmgMul * (1 - d / 4.5), c); }
  hostKillEnemy(e, -1);
}
function stepProjectiles(dt, sim) {
  eproj.forEach(pj => {
    if (pj.k === "m") pj.v.y -= GRAV * 0.5 * dt;
    const step = pj.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    const tw = rayWorld(pj.p, dir, len + 0.05);
    pj.p.add(step); pj.mesh.position.copy(pj.p);
    if (pj.k === "b") pj.mesh.lookAt(tmpV.copy(pj.p).add(dir));
    pj.life -= dt;
    if (!sim) { if (tw !== Infinity || pj.life <= 0) removeProj(pj, true); return; }
    let hit = tw !== Infinity || pj.life <= 0;
    if (!hit && pj.k === "b") {
      for (const pl of allPlayersForHits()) {
        if (!pl.alive) continue;
        const dy = clamp(pj.p.y, pl.p.y + 0.3, pl.p.y + 1.6);
        if (Math.hypot(pj.p.x - pl.p.x, pj.p.y - dy, pj.p.z - pl.p.z) < 0.55) { damagePlayer(pl.idx, pj.dmg, pj.p); hit = true; break; }
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
  if (e.hp <= 0) { hostKillEnemy(e, by); return true; }
  return false;
}
function hostKillEnemy(e, by) {
  const T = ETYPES[e.type];
  netSend({ t: "kill", id: e.id, by, ty: e.type });
  onEnemyKilled(e, by);
  // drops
  const r = Math.random();
  if (e.type === "boss") { hostDrop("hp", e.pos); hostDrop("ammo", e.pos.clone().add(V(2, 0, 0))); hostDrop("hp", e.pos.clone().add(V(-2, 0, 0))); }
  else if (r < (e.type === "tank" ? 0.6 : 0.14)) hostDrop("hp", e.pos);
  else if (r < (e.type === "tank" ? 1 : 0.24)) hostDrop("ammo", e.pos);
  G.left = Math.max(0, G.left - 1);
}
function onEnemyKilled(e, by) { // runs on both phones
  if (by === myIdx) { me.kills++; me.credits += ETYPES[e.type].reward; hitMarker(true); SFX.kill(); if (e.type === "boss") feed("BOSS DESTROYED +" + ETYPES[e.type].reward + " ⬢", "#ffb02e"); }
  removeEnemyVisual(e, true);
}
function hostDrop(k, at) {
  const id = H.nextId++; const p = V(clamp(at.x, -HALF + 2, HALF - 2), 0, clamp(at.z, -HALF + 2, HALF - 2));
  // land on top of whatever is below
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

// ===================================================================== waves (host)
function waveComposition(w, coop) {
  const list = [];
  if (w % 5 === 0) { list.push("boss"); for (let i = 0; i < 4 + w / 5 * 2; i++) list.push(Math.random() < 0.5 ? "grunt" : "drone"); return list; }
  const n = Math.round((5 + w * 2.6) * (coop ? 1.35 : 1));
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (w >= 4 && r < 0.08 + w * 0.006) list.push("tank");
    else if (w >= 2 && r < 0.3) list.push("rusher");
    else if (r < 0.58) list.push("drone");
    else list.push("grunt");
  }
  return list.sort(() => Math.random() - 0.5);
}
function hostStartWave() {
  G.wave++; G.ph = "wave"; G.bonus = 0;
  H.queue = waveComposition(G.wave, mode === "host" && mate.on);
  G.left = H.queue.length; H.spawnT = 1.5; H.maxAlive = Math.min(9 + G.wave, 22);
  hostSendGm();
}
function hostTick(dt) {
  if (G.ph === "count") { G.tm -= dt; if (G.tm <= 0) hostStartWave(); }
  else if (G.ph === "wave") {
    H.spawnT -= dt;
    if (H.queue.length && H.spawnT <= 0 && enemies.size < H.maxAlive) { H.spawnT = Math.max(0.35, 1.1 - G.wave * 0.04); hostSpawnEnemy(H.queue.shift()); }
    if (!H.queue.length && enemies.size === 0) { G.ph = "break"; G.tm = BREAK_TIME; G.bonus = 100 + G.wave * 15; hostSendGm(); }
    const boss = [...enemies.values()].find(e => e.type === "boss"); G.bossFrac = boss ? boss.hpFrac : -1;
    // game over: nobody standing
    const meOut = me.downed || me.dead, mateOut = !(mode === "host" && mate.on) || mate.downed || mate.dead;
    if (meOut && mateOut) { G.ph = "over"; hostSendGm(); }
  } else if (G.ph === "break") { G.tm -= dt; if (G.tm <= 0) hostStartWave(); }
  enemies.forEach(e => hostStepEnemy(e, dt));
  pickups.forEach(pk => { pk.life -= dt; if (pk.life <= 0) { removePickup(pk.id); netSend({ t: "pr", id: pk.id }); } });
}
function hostSendGm() { G.seq++; applyGm({ ...G }); netSend({ t: "gm", ...G }); }
function hostResetGame() {
  enemies.forEach(e => removeEnemyVisual(e, false)); eproj.forEach(p => removeProj(p, false)); [...pickups.keys()].forEach(removePickup);
  H.queue = []; Object.assign(G, { ph: "count", wave: 0, tm: 5, left: 0, bossFrac: -1, bonus: 0 });
  netSend({ t: "reset" }); localReset(); hostSendGm();
}
function localReset() {
  enemies.forEach(e => removeEnemyVisual(e, false)); eproj.forEach(p => removeProj(p, false)); [...pickups.keys()].forEach(removePickup);
  rockets.splice(0).forEach(r => scene.remove(r.mesh));
  resetMe(true); spawnMe(); lastPh = null; showScreen(null); $("feed").innerHTML = "";
}

// phase changes, on both phones
let lastPh = null;
function applyGm(g) {
  const prev = lastPh; Object.assign(G, g); lastPh = G.ph;
  if (prev === G.ph) return;
  if ((prev === null || prev === "connecting" || prev === "menu") && G.ph !== "over") showScreen(null);
  if (G.ph === "count") { showScreen(null); }
  if (G.ph === "wave") { SFX.wave(); bigMsg(G.wave % 5 === 0 ? "BOSS WAVE " + G.wave : "WAVE " + G.wave, G.wave % 5 === 0 ? "Something big is coming" : "", 2200); if ($("shop").classList.contains("on")) showScreen(null); }
  if (G.ph === "break") {
    SFX.clear(); me.credits += G.bonus;
    if (me.downed || me.dead) { resetMe(false); SFX.revive(); }
    else me.hp = Math.min(maxHp(), me.hp + 30);
    bigMsg("WAVE " + G.wave + " CLEARED", "+" + G.bonus + " ⬢  ·  open Upgrades", 2600);
    const b = +(store("it-best") || 0); if (G.wave > b) store("it-best", G.wave);
  }
  if (G.ph === "over") setTimeout(showOver, 1200);
}

// ===================================================================== local player
const input = { mx: 0, my: 0, lookX: 0, lookY: 0, fire: false, jump: false, swap: false };
function takeDamage(n, from) {
  if (me.downed || me.dead || G.ph === "over") return;
  n = Math.round(n * (1 - me.up.armor * 0.08));
  me.hp -= n; me.hurtT = 0.35; SFX.hurt();
  if (from) dmgIndicator(from);
  if (me.hp <= 0) { me.hp = 0; me.downed = true; me.bleed = BLEED_TIME; me.revive = 0; SFX.down(); feed("You are down!", "#ff2e88"); }
}
function stepMe(dt) {
  const b = me.body;
  me.padCd -= dt; me.hurtT = Math.max(0, me.hurtT - dt);
  if (me.dead) return;
  if (me.downed) {
    b.v.x *= 0.8; b.v.z *= 0.8; moveBody(b, dt);
    me.bleed -= dt;
    const near = mate.on && !mate.downed && !mate.dead && mate.pos.distanceTo(b.p) < REVIVE_DIST;
    if (near) { me.revive += dt; if (me.revive >= REVIVE_TIME) { me.downed = false; me.hp = Math.round(maxHp() * 0.5); me.revive = 0; SFX.revive(); feed("Revived by " + mate.name, "#7dff8a"); } }
    else me.revive = Math.max(0, me.revive - dt * 0.5);
    if (me.bleed <= 0 && me.downed) { me.downed = false; me.dead = true; feed("You bled out. Back next wave.", "#ff2e88"); }
    return;
  }
  // look
  me.yaw -= input.lookX; me.pitch = clamp(me.pitch - input.lookY, -1.2, 0.9); input.lookX = input.lookY = 0;
  // move relative to camera yaw
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  let wx = rx * input.mx + fx * -input.my, wz = rz * input.mx + fz * -input.my; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const spd = P_SPEED * (1 + me.up.speed * 0.07), k = Math.min(1, dt * (b.grounded ? 12 : 3));
  b.v.x = lerp(b.v.x, wx * spd, k); b.v.z = lerp(b.v.z, wz * spd, k);
  if (input.jump && b.grounded) { b.v.y = JUMPV; b.grounded = false; }
  input.jump = false;
  // jump pads
  if (b.grounded && me.padCd <= 0) for (const p of pads) if (Math.hypot(b.p.x - p.x, b.p.z - p.z) < 1.1 && b.p.y < 0.3) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1; b.v.y = 15.5; b.v.x = dx / d * 5.2; b.v.z = dz / d * 5.2; b.grounded = false; me.padCd = 0.5; SFX.pad(); spark(V(p.x, 0.2, p.z), 0x7dff8a, 20, 4, 6, 0.6);
  }
  moveBody(b, dt);
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
  else { WORDER.forEach(w => { if (me.owned[w] && w !== "rifle") me.ammo[w] = Math.min(WEAPONS[w].max, me.ammo[w] + Math.ceil(WEAPONS[w].max * 0.5)); }); feed("Ammo refilled", "#ffb02e"); }
}
function cycleWeapon() {
  const owned = WORDER.filter(w => me.owned[w] && (me.ammo[w] > 0));
  const i = owned.indexOf(me.weapon); me.weapon = owned[(i + 1) % owned.length]; SFX.click();
}

// camera + aiming
const camPivot = V(), camWanted = V(), aimPoint = V();
function updateCamera(dt) {
  let target = me.body.p, yaw = me.yaw, pitch = me.pitch;
  if (me.dead && mate.on) { target = mate.pos; yaw = mate.yaw; pitch = -0.25; }
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fwd = V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camPivot.set(target.x + rx * 0.85, target.y + (me.downed ? 0.9 : 1.75), target.z + rz * 0.85);
  const dist = me.downed ? 5 : 4.3;
  camWanted.copy(camPivot).addScaledVector(fwd, -dist); camWanted.y += 0.5;
  const dir = tmpV2.subVectors(camWanted, camPivot); const len = dir.length(); dir.divideScalar(len);
  const hit = rayWorld(camPivot, dir, len + 0.3);
  if (hit !== Infinity) camWanted.copy(camPivot).addScaledVector(dir, Math.max(0.4, hit - 0.3));
  camera.position.copy(camWanted);
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
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
function fireWeapon() {
  const W = WEAPONS[me.weapon];
  if (me.ammo[me.weapon] <= 0) { cycleWeapon(); return; }
  me.cd = 1 / (W.rate * (1 + me.up.rate * 0.12));
  if (W.max !== Infinity) me.ammo[me.weapon]--;
  const dmgMul = 1 + me.up.dmg * 0.15;
  const muzzle = V(); me.model.userData.muzzle.getWorldPosition(muzzle);
  me.model.userData.flashT = 0.05; SFX[me.weapon]();
  if (W.rocket) {
    const target = computeAim(); const dir = target.sub(muzzle).normalize();
    spawnRocket(muzzle, dir, true, W.dmg * dmgMul);
    netSend({ t: "rk", p: vArr(muzzle), d: vArr(dir) });
  } else {
    let hitAny = false, killed = false;
    for (let k = 0; k < W.pellets; k++) {
      const target = computeAim(W.spread);
      const dir = target.clone().sub(muzzle); const maxT = dir.length(); dir.normalize();
      const wallT = rayWorld(muzzle, dir, maxT + 0.01);
      const hits = [];
      enemies.forEach(e => { if (e.spawnT > 0) return; const t = rayEnemy(muzzle, dir, e); if (t < wallT && t <= maxT + 1) hits.push([t, e]); });
      hits.sort((a, b) => a[0] - b[0]);
      const used = W.pierce ? hits : hits.slice(0, 1);
      let end = wallT !== Infinity ? muzzle.clone().addScaledVector(dir, wallT) : target;
      if (!W.pierce && used.length) end = muzzle.clone().addScaledVector(dir, used[0][0]);
      for (const [t, e] of used) {
        const dmg = W.dmg * dmgMul; hitAny = true; me.dmgDone += dmg;
        const hp = muzzle.clone().addScaledVector(dir, t); spark(hp, 0xffd27a, 6, 5, 1, 0.3);
        if (mode === "guest") netSend({ t: "hit", id: e.id, d: Math.round(dmg) });
        else if (hostDamageEnemy(e.id, dmg, myIdx)) killed = true;
      }
      if (!used.length && wallT !== Infinity) spark(end, W.color, 4, 3, 1, 0.25);
      tracer(muzzle, end, W.color, W.pierce ? 0.35 : 0.06);
      if (k < 3) netSend({ t: "tr", a: vArr(muzzle), b: vArr(end), c: W.color, l: W.pierce ? 0.35 : 0.06 });
    }
    if (hitAny && !killed) { hitMarker(false); SFX.hit(); }
  }
}
function spawnRocket(p, dir, mine, dmg = 0) {
  const mesh = new THREE.Mesh(rocketGeo, rocketMat); mesh.position.copy(p); mesh.lookAt(p.clone().add(dir)); scene.add(mesh);
  rockets.push({ p: p.clone(), v: dir.clone().multiplyScalar(30), mesh, mine, dmg, life: 4 });
}
function stepRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; const step = r.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len);
    let t = rayWorld(r.p, dir, len);
    if (r.mine) enemies.forEach(e => { const te = rayEnemy(r.p, dir, e); if (te < t) t = te; });
    r.life -= dt;
    spark(r.p, 0xff9a40, 2, 1, 0.5, 0.3);
    if (t !== Infinity || r.life <= 0) {
      const at = t !== Infinity ? r.p.clone().addScaledVector(dir, t) : r.p.clone();
      rocketBoom(r, at); scene.remove(r.mesh); rockets.splice(i, 1); continue;
    }
    r.p.add(step); r.mesh.position.copy(r.p);
  }
}
function rocketBoom(r, at) {
  explosion(at, 4, 0xff7a2e);
  if (!r.mine) return;
  const R = WEAPONS.rocket.splash; let hitAny = false;
  enemies.forEach(e => { const c = chestOf(e); const d = Math.max(0, c.distanceTo(at) - ETYPES[e.type].r * 0.5); if (d < R) { const dmg = r.dmg * (1 - d / (R * 1.4)); hitAny = true; me.dmgDone += dmg; if (mode === "guest") netSend({ t: "hit", id: e.id, d: Math.round(dmg) }); else hostDamageEnemy(e.id, dmg, myIdx); } });
  if (hitAny) { hitMarker(false); SFX.hit(); }
  // rocket jump: knock myself, a little self-damage
  const c = V(me.body.p.x, me.body.p.y + 0.9, me.body.p.z), d = c.distanceTo(at);
  if (d < 3.5 && !me.downed && !me.dead) { const k = 1 - d / 3.5; me.body.v.addScaledVector(c.clone().sub(at).normalize(), 14 * k); me.body.v.y += 9 * k; me.body.grounded = false; takeDamage(10 * k); }
  netSend({ t: "rx", p: vArr(at) });
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
  enemies.forEach(e => removeEnemyVisual(e, false)); eproj.forEach(p => removeProj(p, false)); [...pickups.keys()].forEach(removePickup);
  rockets.splice(0).forEach(r => scene.remove(r.mesh));
  G.ph = "menu"; lastPh = null; releaseWake(); exitLock();
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
      mate.hp = m.hp; mate.mhp = m.mh; mate.downed = !!m.dn; mate.dead = !!m.dd; mate.revive = m.rv || 0; mate.weapon = m.w; mate.kills = m.k || 0; mate.lastSeen = performance.now();
      break;
    }
    case "tr": tracer(arrV(m.a), arrV(m.b), m.c, m.l); if (mate.model) mate.model.userData.flashT = 0.05; tone(700, 0.05, "square", 0.02); break;
    case "rk": spawnRocket(arrV(m.p), arrV(m.d), false); SFX.rocket(); break;
    case "rx": { const at = arrV(m.p); let best = null, bd = 3; rockets.forEach(r => { if (!r.mine) { const d = r.p.distanceTo(at); if (d < bd) { bd = d; best = r; } } }); if (best) { scene.remove(best.mesh); rockets.splice(rockets.indexOf(best), 1); explosion(at, 4, 0xff7a2e); } break; }
    // host -> guest
    case "gm": if (mode === "guest" && G.ph !== "menu") applyGm(m); break;
    case "reset": if (mode === "guest") { localReset(); } break;
    case "en": if (mode === "guest") guestEnemies(m); break;
    case "kill": if (mode === "guest") { const e = enemies.get(m.id); if (e) onEnemyKilled(e, m.by); else if (m.by === myIdx) { me.kills++; me.credits += ETYPES[m.ty].reward; } } break;
    case "pj": if (mode === "guest") addProj(m.id, m.k, arrV(m.p), arrV(m.v)); break;
    case "px": if (mode === "guest") { const pj = eproj.get(m.id); if (pj) { pj.p.copy(arrV(m.p)); removeProj(pj, true); } } break;
    case "dmg": takeDamage(m.n, V(m.f[0], 1, m.f[1])); break;
    case "pk": if (mode === "guest") addPickup(m.id, m.k, arrV(m.p)); break;
    case "pr": removePickup(m.id); break;
    case "got": removePickup(m.id); if (m.who === myIdx) applyPickup(m.k || "hp"); break;
    // guest -> host
    case "hit": if (mode === "host") { const e = enemies.get(m.id); if (e) hostDamageEnemy(m.id, clamp(+m.d || 0, 0, 2000), 1); } break;
    case "grab": if (mode === "host") { const pk = pickups.get(m.id); if (pk) { removePickup(pk.id); netSend({ t: "got", id: pk.id, who: 1, k: pk.k }); } } break;
  }
}
function guestEnemies(m) {
  const now = performance.now(), seen = new Set();
  for (const [id, ty, x, y, z, yaw, hf] of m.e) {
    seen.add(id);
    let e = enemies.get(id);
    if (!e) { e = addEnemyVisual(id, ty, x, y, z, hf); }
    e.buf.push({ t: now, x, y, z, yaw }); if (e.buf.length > 12) e.buf.shift();
    e.hpFrac = hf;
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
    const prev = mate.pos.clone();
    mate.pos.lerpVectors(a.p, b.p, k); mate.yaw = angLerp(a.yaw, b.yaw, k); mate.pitch = lerp(a.pitch, b.pitch, k);
    mate.vel = b.v; mate.speed = Math.hypot(mate.pos.x - prev.x, mate.pos.z - prev.z) / Math.max(dt, 1e-3);
  }
  mate.model.visible = !mate.dead;
  mate.model.position.copy(mate.pos); mate.model.rotation.y = mate.yaw;
  animSoldier(mate.model, mate.speed, mate.pitch, mate.downed, dt);
  mate.label.position.set(mate.pos.x, mate.pos.y + (mate.downed ? 1.4 : 2.35), mate.pos.z);
  if (mate.downed) mate.label.userData.set("⚠ REVIVE " + (mate.revive > 0 ? Math.round(mate.revive / REVIVE_TIME * 100) + "%" : mate.name), "#ff2e88");
  else mate.label.userData.set(mate.name, COLORS[mate.color]);
  mate.label.visible = !mate.dead;
}

// ===================================================================== start / UI
function startGame() {
  showScreen(null); requestWake();
  if (!me.model) { me.model = makeSoldier(COLORS[myColor]); scene.add(me.model); }
  else { scene.remove(me.model); me.model = makeSoldier(COLORS[myColor]); scene.add(me.model); }
  if (mode === "host" || mode === "solo") { lastPh = "menu"; hostResetGame(); }
  else { localReset(); G.ph = "connecting"; }
}
const screens = ["sMenu", "sJoin", "sWait", "sBusy", "sHelp", "shop", "sOver"];
function showScreen(id) {
  screens.forEach(s => $(s).classList.toggle("on", s === id));
  const inGame = (id === null || id === "shop") && mode && G.ph !== "menu";
  $("hud").classList.toggle("on", !!inGame);
  ["bFire", "bJump", "bSwap"].forEach(b => $(b).classList.toggle("on", !!inGame && id === null && COARSE));
  $("bQuit").classList.toggle("on", !!inGame && id === null);
  if (id !== null) exitLock();
}
document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => { if ($("sHelp").classList.contains("on") && !mode) return showScreen("sMenu"); backToMenu(); });
$("bHelp").onclick = () => showScreen("sHelp");
$("bHost").onclick = () => { ac(); startHost(); };
$("bJoin").onclick = () => { ac(); $("joinErr").textContent = ""; showScreen("sJoin"); setTimeout(() => $("codeIn").focus(), 50); };
$("bJoinGo").onclick = () => startJoin($("codeIn").value);
$("codeIn").addEventListener("keydown", e => { if (e.key === "Enter") startJoin($("codeIn").value); });
$("bSolo").onclick = () => { ac(); cleanup(); mode = "solo"; myIdx = 0; startGame(); };
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
  html += "<span>Your damage</span><b>" + Math.round(me.dmgDone) + "</b><span>Best wave</span><b>" + Math.max(G.wave, +(store("it-best") || 0)) + "</b>";
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
function hitMarker(kill) { const h = $("hitm"); h.classList.toggle("kill", kill); h.style.transition = "none"; h.style.opacity = 1; requestAnimationFrame(() => { h.style.transition = "opacity .25s"; h.style.opacity = 0; }); }
function dmgIndicator() { $("vig").style.boxShadow = "inset 0 0 120px 40px rgba(255,0,40,.55)"; clearTimeout(dmgIndicator.h); dmgIndicator.h = setTimeout(() => $("vig").style.boxShadow = "inset 0 0 120px 40px rgba(255,0,40,0)", 180); }
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
// keyboard + mouse
const keys = {};
addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return; const k = e.key.toLowerCase(); keys[k] = true;
  if (k === " ") { input.jump = true; e.preventDefault(); }
  if (k === "q" || k === "e") input.swap = true;
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
addEventListener("mousedown", e => { if (document.pointerLockElement === touch && e.button === 0) input.fire = true; });
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
    // guest: interpolate robots
    if (mode === "guest") enemies.forEach(e => { const r = interp(e.buf, 110); if (r) { const { a, b, k } = r; const px = e.pos.x, pz = e.pos.z; e.pos.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)); e.yaw = angLerp(a.yaw, b.yaw, k); e.moving = Math.hypot(e.pos.x - px, e.pos.z - pz) / Math.max(dt, 1e-3); } });
    enemies.forEach(e => animEnemy(e, dt, now));
    // my model
    if (me.model) {
      me.model.visible = !me.dead;
      me.model.position.copy(me.body.p); me.model.rotation.y = me.yaw;
      animSoldier(me.model, Math.hypot(me.body.v.x, me.body.v.z), me.pitch * 0.8, me.downed, dt);
    }
    updateMate(dt);
    pickups.forEach(pk => { pk.item.rotation.y += dt * 2; pk.item.position.y = 0.8 + Math.sin(now / 300 + pk.id) * 0.12; });
    padMeshes.forEach((m, i) => m.scale.setScalar(1 + Math.sin(now / 200 + i) * 0.06));
    portalMeshes.forEach(m => m.rotation.z += dt);
    updateCamera(dt);
    updateHud(dt);
    // network
    if (conn && conn.open) {
      if (now - lastStSent > 50) { lastStSent = now; netSend({ t: "st", p: vArr(me.body.p), v: vArr(me.body.v), y: r2(me.yaw), pi: r2(me.pitch), hp: Math.ceil(me.hp), mh: maxHp(), dn: me.downed ? 1 : 0, dd: me.dead ? 1 : 0, rv: r2(me.revive), w: me.weapon, k: me.kills }); }
      if (mode === "host") {
        if (now - lastEnSent > 50) { lastEnSent = now; const e = []; enemies.forEach(x => e.push([x.id, x.type, r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.yaw), r2(x.hpFrac)])); netSend({ t: "en", e, bf: r2(G.bossFrac) }); }
        if (now - lastGmSent > 250) { lastGmSent = now; netSend({ t: "gm", ...G }); }
      }
    }
  } else {
    // menu: slow orbit camera over the arena
    const a = now / 9000; camera.position.set(Math.cos(a) * 30, 14, Math.sin(a) * 30); camera.lookAt(0, 2, 0);
    portalMeshes.forEach(m => m.rotation.z += dt);
  }
  updEffects(dt);
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

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// test hooks
window.__it = { G, me, mate, input, camera, chestOf, enemies, H, pickups, hostSpawnEnemy, hostDamageEnemy, get mode() { return mode; } };
