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

const ID_PREFIX = "irontide-v3-";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";

// ===================================================================== tuning
const HALF = 56, GRAV = 26, JUMPV = 9.2, STEP = 0.5;
const P_R = 0.42, P_H = 1.8, P_SPEED = 7.2;
const BLEED_TIME = 25, REVIVE_TIME = 3, REVIVE_DIST = 2.6;

// ---- survivors: each has its own primary weapon and three abilities (secondary, utility, special)
const SURVIVORS = {
  vanguard: { name: "Vanguard", role: "Assault", color: "#2ef2ff", alt: "#a46bff", hp: 110, gun: "rifle",
    weapon: { name: "Pulse Rifle", rate: 8, dmg: 14, pellets: 1, spread: 0.012, color: 0x2ef2ff, proc: 1 },
    sec: { name: "Frag Grenade", short: "FRAG", cd: 7, desc: "Bouncing grenade, 190 damage in a wide blast." },
    utl: { name: "Combat Dash", short: "DASH", cd: 2.4, desc: "Burst forward. Shots pass through you." },
    spc: { name: "Overdrive", desc: "8s of double damage, +50% fire rate, half damage taken." } },
  breacher: { name: "Breacher", role: "Tank", color: "#ffb02e", alt: "#ff7a2e", hp: 150, gun: "shotgun",
    weapon: { name: "Scattergun", rate: 1.5, dmg: 11, pellets: 9, spread: 0.07, color: 0xffb02e, proc: 0.35 },
    sec: { name: "Concussion Blast", short: "BLAST", cd: 5, desc: "Cone blast for 70 damage that hurls robots back." },
    utl: { name: "Jet Jump", short: "JET", cd: 7, desc: "Rocket into the air, then slam down for 90 damage." },
    spc: { name: "Iron Skin", desc: "7s of 75% damage reduction and fast healing." } },
  marksman: { name: "Marksman", role: "Precision", color: "#b6ff2e", alt: "#7dff8a", hp: 90, gun: "rail",
    weapon: { name: "Rail Rifle", rate: 1.8, dmg: 55, pellets: 1, spread: 0, color: 0xb6ff2e, proc: 1, pierce: true },
    sec: { name: "Shock Mine", short: "MINE", cd: 6, desc: "Sticky mine. 150 damage when a robot gets close. Up to 3." },
    utl: { name: "Cloak", short: "CLOAK", cd: 12, desc: "4s invisible and faster. Robots lose you. Next shot crits." },
    spc: { name: "Lance", desc: "Fire 3 huge piercing rail shots that always crit." } },
  demo: { name: "Demolisher", role: "Explosives", color: "#ff2e88", alt: "#ff6ab0", hp: 120, gun: "launcher",
    weapon: { name: "Grenade Launcher", rate: 2.2, dmg: 42, pellets: 1, spread: 0, color: 0xff2e88, proc: 1, launcher: true, splash: 3.2 },
    sec: { name: "Cluster Bomb", short: "CLUSTER", cd: 7, desc: "Splits into 5 bomblets, 55 damage each." },
    utl: { name: "Rocket Jump", short: "R-JUMP", cd: 6, desc: "Blast off the ground for 60 damage around you. No self-damage." },
    spc: { name: "Missile Barrage", desc: "12 homing missiles, 90 damage each." } }
};
const SORDER = ["vanguard", "breacher", "marksman", "demo"];

// ---- stacking items (Common / Uncommon / Legendary)
const TIERS = [{ name: "Common", col: "#e8eef8" }, { name: "Uncommon", col: "#6dff8a" }, { name: "Legendary", col: "#ff4a4a" }];
const ITEMS = {
  servo:   { t: 0, name: "Servo Oil", desc: "+15% attack speed." },
  sights:  { t: 0, name: "Red Sight", desc: "+10% critical hit chance." },
  plate:   { t: 0, name: "Riveted Plate", desc: "Chance to fully block a hit (+10%, stacks less each time)." },
  tonic:   { t: 0, name: "Med Vial", desc: "+25 max health." },
  nanites: { t: 0, name: "Repair Nanites", desc: "Regenerate 2 health per second." },
  opener:  { t: 0, name: "Breaching Axe", desc: "+75% damage to robots above 90% health." },
  boots:   { t: 0, name: "Sprint Boots", desc: "+12% move speed." },
  cell:    { t: 0, name: "Fuel Cell", desc: "Ability cooldowns 10% shorter." },
  arc:     { t: 1, name: "Tesla Coil", desc: "20% chance on hit to chain lightning to 3 robots (80% damage)." },
  pod:     { t: 1, name: "Rocket Rack", desc: "10% chance on hit to launch a homing missile (300% damage)." },
  leech:   { t: 1, name: "Leech Chip", desc: "Heal 2 health every time you hit." },
  booster: { t: 1, name: "Jet Booster", desc: "+1 extra jump in mid-air." },
  shield:  { t: 1, name: "Shield Emitter", desc: "Gain a recharging shield worth 20% of your max health." },
  battery: { t: 1, name: "Skull Battery", desc: "Kills give +35% attack speed for 3 seconds." },
  volatile:{ t: 1, name: "Unstable Core", desc: "Killed robots explode for 40% of their max health." },
  hunter:  { t: 1, name: "Hunter's Eye", desc: "+5% crit chance. Crits deal +50% more damage." },
  seeker:  { t: 2, name: "Swarm Drone", desc: "15% chance on hit to fire 3 homing missiles (150% each)." },
  phoenix: { t: 2, name: "Phoenix Chip", desc: "Once per wave, instead of going down, rise with half health and a firestorm." },
  glass:   { t: 2, name: "Glass Reactor", desc: "+100% damage, but 40% less max health." },
  storm:   { t: 2, name: "Storm Crown", desc: "Every 3 seconds, lightning strikes nearby robots for heavy damage." },
  echo:    { t: 2, name: "Echo Speaker", desc: "Your primary weapon fires twice." }
};
const ITEM_IDS = Object.keys(ITEMS);
const itemsOfTier = t => ITEM_IDS.filter(k => ITEMS[k].t === t);
const POWERUPS = { rage: { name: "RAGE", col: "#ff3a3a", desc: "Double damage" }, haste: { name: "HASTE", col: "#2ef2ff", desc: "+40% speed and fire rate" }, aegis: { name: "AEGIS", col: "#ffd23a", desc: "Half damage taken, healing" } };
const PU_TIME = 10;

// ---- arenas
const ARENAS = {
  rooftop: { name: "Neon Rooftop", sky: "sky.jpg", floor: "floor.jpg", wall: "wall.jpg", fog: 0x1a1430, hemi: [0x9ab4ff, 0x3a2448, 1.6], sun: [0xffe2c8, 2.8], edges: [0x2ef2ff, 0xff2e88, 0xa46bff], tint: 0xb8c0d8, wx: "clear" },
  foundry: { name: "Molten Foundry", sky: "sky_foundry.jpg", floor: "floor_foundry.jpg", wall: "wall_foundry.jpg", fog: 0x2a140a, hemi: [0xffb27a, 0x301208, 1.4], sun: [0xffc08a, 2.6], edges: [0xff7a1a, 0xffb02e, 0xff3a2a], tint: 0xc8b8b0, wx: "clear" },
  frost: { name: "Frost Yard", sky: "sky_frost.jpg", floor: "floor_frost.jpg", wall: "wall_frost.jpg", fog: 0x8296b8, hemi: [0xcfe2ff, 0x4a5a78, 1.8], sun: [0xe8f2ff, 2.4], edges: [0x8ae8ff, 0xffffff, 0x4aa8ff], tint: 0xd8e4f4, wx: "snow" },
  downtown: { name: "Downtown", sky: "sky_downtown.jpg", floor: "floor_downtown.jpg", wall: "wall_downtown.jpg", fog: 0x141a2c, hemi: [0x8aa4ff, 0x2a2238, 1.5], sun: [0xc8d4ff, 2.2], edges: [0xff2e55, 0x2ef2ff, 0xffb02e], tint: 0x9aa4bc, wx: "rain" },
  desert: { name: "Desert Ruins", sky: "sky_desert.jpg", floor: "floor_desert.jpg", wall: "wall_desert.jpg", fog: 0xb88a5a, hemi: [0xffe0b0, 0x6a4022, 1.7], sun: [0xfff0d0, 3.2], edges: [0xffb02e, 0xff7a2e, 0xffe14a], tint: 0xd8c0a0, wx: "clear" }
};
const AORDER = ["rooftop", "downtown", "foundry", "frost", "desert"];
const WEATHERS = { clear: "Clear", rain: "Rain", snow: "Snow", storm: "Thunderstorm" };
const TODS = { day: "Day", dusk: "Dusk", night: "Night" };

const ETYPES = {
  drone:   { hp: 35,  speed: 5.4, r: 0.55, h: 0.9, fly: true, reward: 15, fire: 2.1, range: 26, bolt: 7,  boltSpd: 20 },
  grunt:   { hp: 75,  speed: 3.6, r: 0.5,  h: 1.95, reward: 20, fire: 2.6, burst: 3, range: 25, bolt: 7, boltSpd: 24, keep: 12, gltf: 0xd0602a, head: true },
  sniper:  { hp: 60,  speed: 3.2, r: 0.5,  h: 2.05, reward: 35, fire: 5.5, charge: 1.9, range: 55, bolt: 32, boltSpd: 75, keep: 27, gltf: 0x8a5cff, head: true },
  bulwark: { hp: 280, speed: 2.4, r: 0.8,  h: 2.7, reward: 50, fire: 2.6, range: 22, bolt: 8, boltSpd: 19, spreadN: 5, keep: 6, shield: true, gltf: 0x3c78c8, head: true },
  rusher:  { hp: 45,  speed: 7.0, r: 0.5,  h: 1.2, reward: 15, boom: 36, fuse: 0.65 },
  tank:    { hp: 420, speed: 2.0, r: 1.15, h: 2.6, reward: 60, fire: 3.4, range: 38, mortar: 26, keep: 16 },
  leaper:  { hp: 55,  speed: 5.6, r: 0.55, h: 0.9, reward: 18, melee: 14, leap: true },
  zapper:  { hp: 120, speed: 2.8, r: 0.6,  h: 1.7, reward: 30, fire: 3.4, range: 30, bolt: 16, boltSpd: 10, keep: 14, orb: true },
  boss:    { hp: 2900, speed: 2.4, r: 2.1, h: 7.2, reward: 400, fire: 2.2, range: 70, bolt: 12, boltSpd: 18, mortar: 30, keep: 15, gltf: 0x30333d, head: true, boss: true },
  walker:  { hp: 3300, speed: 2.1, r: 2.8, h: 7.4, reward: 450, fire: 1.5, range: 75, bolt: 10, boltSpd: 24, mortar: 26, keep: 19, head: true, boss: true }
};
const ENAMES = { leaper: "Leaper", zapper: "Arc Trooper", drone: "Drone", grunt: "Trooper", sniper: "Sniper", bulwark: "Bulwark", rusher: "Rusher", tank: "Mortar tank", boss: "Titan", walker: "Siege Walker" };
const isBoss = e => !!ETYPES[e.type].boss;
// 0 on wave 1, 1 by wave 15: robots get faster, more accurate and quicker to react as waves go on
const diffK = () => clamp(((G && G.wave) || 1) - 1, 0, 14) / 14;
// hit spheres: [yOffset, radius] measured from the feet (drones from their center). Last sphere of a "head" type is a weak point (crit).
const HITS = {
  drone: [[0, 0.62]], rusher: [[0.6, 0.62]], leaper: [[0.5, 0.62]], zapper: [[0.6, 0.55], [1.35, 0.5]],
  tank: [[0.7, 1.15], [1.7, 0.95]],
  walker: [[2.6, 1.6], [5.0, 2.7], [6.9, 1.0]],
  player: [[0.5, 0.42], [1.05, 0.42], [1.6, 0.3]]
};
for (const k in ETYPES) if (ETYPES[k].gltf) { const h = ETYPES[k].h; HITS[k] = [[0.28 * h, 0.2 * h], [0.57 * h, 0.22 * h], [0.89 * h, 0.15 * h]]; }

// ===================================================================== profile
let myName = store("it-name") || "", mySurv = SURVIVORS[store("it-surv")] ? store("it-surv") : "vanguard";
let arenaCfg = { a: ARENAS[store("it-arena")] ? store("it-arena") : "rooftop", wx: WEATHERS[store("it-wx")] ? store("it-wx") : "auto", tod: TODS[store("it-tod")] ? store("it-tod") : "day" };
$("nameIn").value = myName;
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
    loadSounds(); initTracks();
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
  launcher: () => { noise(0.22, 0.2, 1600); tone(180, 0.22, "triangle", 0.12, 0.5); playBuf("rifle", 0.2, 0.45); },
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
// the real soundtrack: two looping tracks (calm for menus and breaks, combat for waves) that crossfade.
// If they can't load, the procedural synth below takes over.
const TRACKS = {};
function initTracks() {
  for (const k of ["calm", "combat"]) {
    try {
      const a = new Audio("assets/music_" + k + ".mp3"); a.loop = true; a.preload = "auto"; a.crossOrigin = "anonymous";
      const src = actx.createMediaElementSource(a), g = actx.createGain(); g.gain.value = 0; src.connect(g).connect(musBus);
      TRACKS[k] = { a, g, ok: true, vol: 0 };
      a.addEventListener("error", () => { TRACKS[k].ok = false; });
    } catch (e) { TRACKS[k] = { ok: false }; }
  }
}
function realMusic() { return TRACKS.calm && TRACKS.calm.ok && TRACKS.combat && TRACKS.combat.ok; }
function tracksTick(dt) {
  const want = !MUS.on ? null : MUS.level >= 2 ? "combat" : "calm";
  for (const k in TRACKS) {
    const T = TRACKS[k]; if (!T.ok) continue;
    const target = k === want ? (k === "combat" ? (MUS.level === 3 ? 1 : 0.85) : (MUS.level === 0 ? 0.55 : 0.8)) : 0;
    T.vol = target > T.vol ? Math.min(target, T.vol + dt / 1.5) : Math.max(target, T.vol - dt / 2.5);
    T.g.gain.value = T.vol;
    if (T.vol > 0.001 && T.a.paused) { if (k === "combat" && T.vol < 0.05) T.a.currentTime = 0; T.a.play().catch(() => {}); }
    else if (T.vol <= 0.001 && !T.a.paused) T.a.pause();
  }
}
function musicTick(dt) {
  if (!actx || actx.state !== "running") return;
  if (realMusic()) { tracksTick(dt); return; }
  if (!MUS.on || !MUS.level) return;
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

const sun = new THREE.DirectionalLight(0xffe2c8, 2.8);
sun.position.set(20, 40, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 120 });
sun.shadow.bias = -0.0008;
scene.add(sun); scene.add(sun.target);
const sunOff = V(20, 40, 12);
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

// ===================================================================== world (rebuildable: 4 arenas, weather, time of day)
const boxes = []; // {x0,y0,z0,x1,y1,z1}
const texLoader = new THREE.TextureLoader();
const texCache = {};
function tex(url, rep = 1) { const key = url + "|" + rep; if (texCache[key]) return texCache[key]; const t = texLoader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return texCache[key] = t; }
const world = new THREE.Group(); scene.add(world);
const matFloor = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35, color: 0xb8c0d8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), matFloor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const matSide = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, color: 0xc8d0e8 });
const matTop = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35, color: 0x9aa4c0 });
const matPerim = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.25, color: 0x8890b0 });
const edgeMats = [0, 1, 2].map(() => new THREE.LineBasicMaterial({ color: 0xffffff }));
const lavaMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 1.3, roughness: 0.6, emissiveMap: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#802000'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,${120 + Math.random() * 120 | 0},40,${0.3 + Math.random() * 0.6})`; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 12, 0, 7); x.fill(); } for (let i = 0; i < 25; i++) { x.fillStyle = 'rgba(30,6,0,.7)'; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 0, 7); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })() });
const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8d8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x204060, emissiveIntensity: 0.4 });
// box with world-scaled UVs so textures keep the same size on every block
function boxGeo(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function block(cx, cz, w, d, h, y0 = 0, edge = 0, perim = false, mat = null) {
  const b = { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 };
  boxes.push(b);
  const geo = boxGeo(w, h, d, perim ? 7 : 3);
  const side = mat || (perim ? matPerim : matSide);
  const m = new THREE.Mesh(geo, mat ? mat : [side, side, matTop, matTop, side, side]); m.position.set(cx, y0 + h / 2, cz); m.castShadow = true; m.receiveShadow = true; world.add(m);
  if (edge >= 0) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), edgeMats[edge]); e.position.copy(m.position); world.add(e); }
  return b;
}
// a seeded random so both phones build the exact same arena
let seedS = 1; const srand = () => { seedS = (seedS * 16807) % 2147483647; return (seedS - 1) / 2147483646; };
let pads = [], padMeshes = [], portals = [], portalMeshes = [], barrels = [], spawnPt = { x: 0, y: 3.2, z: 1.5 };
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
{ const cyl = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 240, 48, 1, true), skyMat); cyl.position.y = 80; scene.add(cyl);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(220, 48), new THREE.MeshBasicMaterial({ color: 0x0a0c1e, fog: false })); cap.rotation.x = Math.PI / 2; cap.position.y = 199; scene.add(cap); skyMat.userData.cap = cap; }
const hemi = new THREE.HemisphereLight(0x9ab4ff, 0x3a2448, 1.6); scene.add(hemi);
const nightLight = new THREE.PointLight(0xbfd4ff, 0, 22, 1.6); scene.add(nightLight);
function strip(x, z, w, d, col) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z); world.add(s); }
function addPad(x, z, tx, tz, y = 0) { pads.push({ x, z, tx, tz, y }); }
function addBarrel(x, z) { barrels.push({ x, z }); }
function perimeter(h = 7) {
  block(0, -HALF - 0.5, HALF * 2 + 2, 1, h, 0, 0, true); block(0, HALF + 0.5, HALF * 2 + 2, 1, h, 0, 0, true);
  block(-HALF - 0.5, 0, 1, HALF * 2, h, 0, 0, true); block(HALF + 0.5, 0, 1, HALF * 2, h, 0, 0, true);
}
function scatterCover(n, rMin, rMax) {
  const PK = (HALF - 3) / 43, avoid = [[0, -43], [0, 43], [-43, 0], [43, 0], [-42, -21], [42, 21], [-21, 42], [21, -42]].map(([x, z]) => [x * PK, z * PK]);
  const free = (x, z, w, d) => {
    if (Math.abs(x) + w / 2 > HALF - 1.5 || Math.abs(z) + d / 2 > HALF - 1.5) return false;
    if (Math.hypot(x - spawnPt.x, z - spawnPt.z) < 7) return false;
    for (const [px, pz] of avoid) if (Math.hypot(x - px, z - pz) < 7) return false;
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < 3.5 || Math.hypot(x - p.tx, z - p.tz) < 3.5) return false;
    for (const b of barrels) if (Math.hypot(x - b.x, z - b.z) < 2.5) return false;
    const m = 2.6; for (const b of boxes) if (x + w / 2 + m > b.x0 && x - w / 2 - m < b.x1 && z + d / 2 + m > b.z0 && z - d / 2 - m < b.z1) return false;
    return true;
  };
  let placed = 0;
  for (let tries = 0; tries < n * 12 && placed < n; tries++) {
    const a = srand() * Math.PI * 2, r = rMin + srand() * (rMax - rMin), x = Math.round(Math.cos(a) * r * 2) / 2, z = Math.round(Math.sin(a) * r * 2) / 2, kind = Math.floor(srand() * 4), along = srand() < 0.5;
    if (kind === 0) { const w = along ? 4.6 : 0.9, d = along ? 0.9 : 4.6; if (!free(x, z, w, d)) continue; block(x, z, w, d, 2.0, 0, 1); }
    else if (kind === 1) { if (!free(x, z, 4.6, 4.6)) continue; block(x, z - 1.85, 4.6, 0.9, 2.0, 0, 1); block(x + (along ? 1.85 : -1.85), z + 0.45, 0.9, 2.8, 2.0, 0, 1); }
    else if (kind === 2) { if (!free(x, z, 1.8, 1.8)) continue; block(x, z, 1.8, 1.8, 3.4, 0, 2); }
    else { if (!free(x, z, 2.6, 2.6)) continue; block(x, z, 2.6, 2.6, 1.7, 0, 0); block(x + 0.3, z - 0.3, 1.6, 1.6, 1.3, 1.7, 2); }
    placed++;
  }
}
const LAYOUTS = {
  rooftop() {
    perimeter(7);
    block(0, 0, 9, 9, 3, 0, 0);
    for (const s of [1, -1]) { block(0, s * 5.5, 3.4, 2, 2, 0, 2); block(0, s * 7.5, 3.4, 2, 1, 0, 2); }
    for (const x of [-15, 15]) for (const z of [-15, 15]) block(x, z, 2.4, 2.4, 5.5, 0, 1);
    for (const s of [1, -1]) { block(s * 26, 8, 1, 7, 1.3, 0, 0); block(s * 26, -8, 1, 7, 1.3, 0, 0); block(8, s * 26, 7, 1, 1.3, 0, 0); block(-8, s * 26, 7, 1, 1.3, 0, 0); }
    [[31, 23], [-31, -23], [23, -31], [-23, 31], [-13, 29], [13, -29], [29, 13], [-29, -13], [36, -8], [-36, 8], [10, 12], [-10, -12], [20, 2], [-20, -2]].forEach(([x, z]) => block(x, z, 2.2, 2.2, 1.2, 0, 2));
    for (const x of [-36, 36]) for (const z of [-36, 36]) { block(x, z, 7, 7, 3.2, 0, 1); block(x - Math.sign(x) * 4.9, z, 2.6, 2.6, 1.6, 0, 2); }
    for (const s of [1, -1]) { block(s * 18, s * -30, 6, 3, 2.2, 0, 1); block(s * -30, s * -18, 3, 6, 2.2, 0, 1); }
    for (const [x, z, w, d] of [[0, 22, 0.18, 22], [0, -22, 0.18, 22], [22, 0, 22, 0.18], [-22, 0, 22, 0.18]]) strip(x, z, w, d, 0x2ef2ff);
    addPad(8.5, 0, 1.5, 0); addPad(-8.5, 0, -1.5, 0);
    for (const [x, z] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) addPad(x * 27, z * 36, x * 36, z * 36);
    [[18, 18], [-18, -18], [18, -18], [-18, 18], [0, 31], [0, -31], [31, 0], [-31, 0], [5.6, 5.6], [-5.6, -5.6], [40, 20], [-40, -20]].forEach(([x, z]) => addBarrel(x, z));
    spawnPt = { x: 0, y: 3.2, z: 1.5 };
  },
  foundry() {
    perimeter(9);
    block(0, 0, 10, 10, 2, 0, 0); for (const s of [1, -1]) { block(0, s * 6, 3.4, 2, 1, 0, 1); block(s * 6, 0, 2, 3.4, 1, 0, 1); }
    { const l = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), lavaMat); l.rotation.x = -Math.PI / 2; l.position.set(0, 2.03, 0); world.add(l); }
    for (const s of [1, -1]) {
      block(0, s * 19, 40, 3.2, 0.5, 3.0, 0);                  // catwalk
      for (const x of [-14, 0, 14]) block(x, s * 19, 0.8, 0.8, 3.0, 0, -1);
      for (const e of [1, -1]) { block(e * 21.5, s * 19, 3, 3.2, 2.4, 0, 1); block(e * 24.5, s * 19, 3, 3.2, 1.2, 0, 1); }
    }
    for (const x of [-34, 34]) for (const z of [-32, 32]) { block(x, z, 7, 7, 6.5, 0, 0); const f = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), lavaMat); f.position.set(x - Math.sign(x) * 3.52, 1.8, z); f.rotation.y = Math.sign(x) * -Math.PI / 2; world.add(f); }
    block(0, 34, 26, 1.4, 1.4, 0, 1); block(0, -34, 26, 1.4, 1.4, 0, 1); block(34, 0, 1.4, 18, 1.4, 0, 1); block(-34, 0, 1.4, 18, 1.4, 0, 1);
    [[10, 9], [-10, -9], [15, -8], [-15, 8], [28, 12], [-28, -12], [9, 28], [-9, -28], [24, -26], [-24, 26]].forEach(([x, z]) => block(x, z, 2.2, 2.2, 1.3, 0, 2));
    for (const [x, z, w, d] of [[0, 27, 30, 0.25], [0, -27, 30, 0.25], [27, 0, 0.25, 30], [-27, 0, 0.25, 30]]) strip(x, z, w, d, 0xff6a1a);
    for (const s of [1, -1]) addPad(0, s * 13, 0, s * 19);
    addPad(9, 0, 3, 0); addPad(-9, 0, -3, 0);
    [[20, 24], [-20, -24], [20, -24], [-20, 24], [30, 3], [-30, -3], [6, 14], [-6, -14], [38, -18], [-38, 18], [0, 40], [0, -40]].forEach(([x, z]) => addBarrel(x, z));
    spawnPt = { x: 0, y: 2.2, z: 2.5 };
  },
  frost() {
    perimeter(6);
    block(0, 0, 9, 9, 1.2, 0, 1); block(0, 0, 6, 6, 1.2, 1.2, 1); block(0, 0, 3.2, 3.2, 1.2, 2.4, 0);
    const box = (x, z, along, y0 = 0) => along === "x" ? block(x, z, 7, 2.7, 2.6, y0, 0) : block(x, z, 2.7, 7, 2.6, y0, 0);
    for (const s of [1, -1]) { box(s * 13, 9, "z"); box(s * 13, -9, "z"); box(9 * s, s * 24, "x"); box(-9 * s, s * 24, "x"); box(s * 24, 0, "z"); box(s * 24, 0, "z", 2.6); box(s * 31, s * 26, "x"); box(s * 31, s * 26, "x", 2.6); block(s * 31, s * 21.5, 3, 2, 1.3, 0, 2); box(s * -30, s * 30, "z"); }
    [[18, 16], [-18, -16], [8, -16], [-8, 16], [36, 10], [-36, -10], [20, -36], [-20, 36]].forEach(([x, z]) => { const h = 4 + srand() * 3; block(x, z, 1.6, 1.6, h, 0, -1, false, iceMat); });
    for (const s of [1, -1]) { block(s * 18, s * 34, 8, 1.2, 1.0, 0, -1); block(s * -38, s * 2, 1.2, 8, 1.0, 0, -1); }
    addPad(6.5, 6.5, 1, 1); addPad(-6.5, -6.5, -1, -1); addPad(28, 0, 24, 0); addPad(-28, 0, -24, 0); addPad(35, 26, 31, 26); addPad(-35, -26, -31, -26);
    [[16, 0], [-16, 0], [0, 16], [0, -16], [26, 14], [-26, -14], [38, -30], [-38, 30], [5, 33], [-5, -33]].forEach(([x, z]) => addBarrel(x, z));
    spawnPt = { x: 0, y: 3.8, z: 0.8 };
  },
  downtown() {
    perimeter(8);
    const conc = new THREE.MeshStandardMaterial({ color: 0x9a9eaa, roughness: 0.75, metalness: 0.15, map: tex("assets/floor.jpg") });
    // four city blocks with rooftops you can reach, streets in a cross between them
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const cx = sx * 25, cz = sz * 25;
      block(cx, cz, 13, 13, 6.5, 0, 0);                                   // building
      block(cx - sx * 7.6, cz, 2.2, 5, 2.2, 0, 2, false, conc); block(cx - sx * 7.6, cz - sz * 4.2, 2.2, 3.4, 4.3, 0, 2, false, conc); // stair-step to roof
      block(cx + sx * 2, cz + sz * 2, 3, 3, 1.4, 6.5, 1, false, conc);                 // rooftop AC unit (cover)
      block(cx - sx * 3, cz + sz * 3.5, 4, 0.6, 1.1, 6.5, -1);             // roof parapet
      addPad(cx - sx * 9.5, cz + sz * 4.5, cx - sx * 3, cz + sz * 1);
      // neon sign on the street-facing walls
      for (const [fx, fz, ry] of [[cx - sx * 6.52, cz, sx > 0 ? -Math.PI / 2 : Math.PI / 2], [cx, cz - sz * 6.52, sz > 0 ? Math.PI : 0]]) {
        const col = [0xff2e55, 0x2ef2ff, 0xffb02e, 0xa46bff][(sx > 0 ? 0 : 1) + (sz > 0 ? 0 : 2)];
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ color: col })); sg.position.set(fx, 4.6, fz); sg.rotation.y = ry; world.add(sg);
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.5), new THREE.MeshBasicMaterial({ color: 0x050608 })); fr.position.set(fx - Math.sin(ry) * 0.01, 4.6, fz - Math.cos(ry) * 0.01); fr.rotation.y = ry; world.add(fr);
      }
    }
    // central plaza with a monument
    block(0, 0, 10, 10, 0.5, 0, 1, false, conc); block(0, 0, 3.2, 3.2, 1.6, 0.5, 0, false, conc); block(0, 0, 1.4, 1.4, 6, 2.1, 2, false, new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.15, metalness: 0.95, emissive: 0x2ef2ff, emissiveIntensity: 0.04 }));
    for (const s of [1, -1]) { block(s * 4, 0, 0.6, 4, 1.0, 0.5, -1, false, conc); block(0, s * 4, 4, 0.6, 1.0, 0.5, -1, false, conc); }
    // wrecked cars and a bus as cover in the streets
    const carCols = [0xb02020, 0x2050a0, 0xd0d0d0, 0x202428, 0xc89020, 0x307040];
    const carMats = carCols.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.6 }));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a0e18, roughness: 0.05, metalness: 0.9 });
    let ci = 0;
    const car = (x, z, along) => {
      const m = carMats[ci++ % carMats.length], L = 4.2, W = 1.9;
      if (along === "x") { block(x, z, L, W, 0.95, 0, -1, false, m); block(x - 0.2, z, 2.2, W - 0.2, 0.7, 0.95, -1, false, glassMat); }
      else { block(x, z, W, L, 0.95, 0, -1, false, m); block(x, z - 0.2, W - 0.2, 2.2, 0.7, 0.95, -1, false, glassMat); }
      for (const d of [-1, 1]) { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: srand() < 0.5 ? 0xfff0c0 : 0xff3020 })); if (along === "x") hl.position.set(x + d * 2.12, 0.6, z + 0.6); else hl.position.set(x + 0.6, 0.6, z + d * 2.12); world.add(hl); }
    };
    car(9, 11, "z"); car(-10, -12, "z"); car(12, -9, "x"); car(-12, 9, "x"); car(5, 36, "x"); car(-6, -37, "x"); car(36, -5, "z"); car(-37, 6, "z"); car(-3, 19, "x"); car(3, -19, "x");
    const busM = new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.4, metalness: 0.4 });
    block(19, 2, 2.6, 10, 2.8, 0, -1, false, busM); block(-19, -2, 2.6, 10, 2.8, 0, -1, false, busM);
    // jersey barriers
    for (const [x, z, a] of [[0, 13, "x"], [0, -13, "x"], [13, 0, "z"], [-13, 0, "z"], [30, 9, "x"], [-30, -9, "x"], [9, -30, "z"], [-9, 30, "z"]]) a === "x" ? block(x, z, 4, 0.8, 1.1, 0, -1, false, conc) : block(x, z, 0.8, 4, 1.1, 0, -1, false, conc);
    // street lamps (no collision) and puddles that catch the light
    const poleM = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.5, metalness: 0.7 }), lampM = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
    for (const [x, z] of [[8, 8], [-8, -8], [8, -8], [-8, 8], [8, 30], [-8, -30], [30, -8], [-30, 8], [8, -40], [-8, 40], [40, 8], [-40, -8]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6), poleM); pole.position.set(x, 2.75, z); world.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.3), lampM); head.position.set(x, 5.5, z); world.add(head);
      if (Math.abs(x) === 8 && Math.abs(z) === 8) { const pl = new THREE.PointLight(0xffe0b0, 12, 14, 1.6); pl.position.set(x, 5.2, z); world.add(pl); }
    }
    const puddleM = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.02, metalness: 1, envMapIntensity: 2.5 });
    for (let i = 0; i < 16; i++) { const x = (srand() - 0.5) * 80, z = (srand() < 0.5 ? -1 : 1) * srand() * 4 + (i % 2 ? 0 : (srand() - 0.5) * 70); const px = i % 2 ? x : z * 0.1 + (srand() - 0.5) * 6; const pz = i % 2 ? z : x; const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + srand() * 1.6, 20), puddleM); p.rotation.x = -Math.PI / 2; p.scale.x = 1 + srand(); p.position.set(px, 0.015, pz); world.add(p); }
    // lane markings
    for (const [x, z, w, d] of [[0, 24, 0.25, 30], [0, -24, 0.25, 30], [24, 0, 30, 0.25], [-24, 0, 30, 0.25]]) strip(x, z, w, d, 0xffd040);
    // skyline outside the walls (scenery only)
    const skyM = new THREE.MeshStandardMaterial({ map: matSide.map, color: 0x8890a8, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: matSide.map, emissiveIntensity: 0.35 });
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2 + srand() * 0.06, r = HALF + 13 + srand() * 26, w = 8 + srand() * 10, h = 22 + srand() * 60;
      const g = boxGeo(w, h, w, 8), m = new THREE.Mesh(g, skyM); m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); m.rotation.y = -a; world.add(m);
      if (srand() < 0.35) { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tip.position.set(m.position.x, h + 0.6, m.position.z); world.add(tip); }
    }
    [[16, 16], [-16, -16], [16, -16], [-16, 16], [0, 30], [0, -30], [30, 0], [-30, 0], [40, 36], [-40, -36], [36, -40], [-36, 40]].forEach(([x, z]) => addBarrel(x, z));
    spawnPt = { x: 0, y: 2.6, z: 5.5 };
  },
  desert() {
    perimeter(8);
    block(0, 0, 8, 8, 0.8, 0, 1); block(0, 0, 2.6, 2.6, 10, 0.8, 0);
    const mesa = (x, z, w, d, h, sx, sz) => { block(x, z, w, d, h, 0, 1); const hs = h / 2; block(x + sx * (w / 2 + 1.5), z + sz * (d / 2 + 1.5), 3, 3, Math.min(hs, 1.6), 0, 2); block(x + sx * (w / 2 + 0.75), z + sz * (d / 2 + 0.75), 1.5, 1.5, Math.min(h - 0.6, 3.1), 0, -1); };
    mesa(-32, -10, 10, 14, 4.2, 1, 1); mesa(32, 10, 10, 14, 4.2, -1, -1); mesa(-10, 32, 14, 9, 3.6, 1, -1); mesa(10, -32, 14, 9, 3.6, -1, 1);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; if (i % 3 === 2) continue; const r = 17; block(Math.cos(a) * r, Math.sin(a) * r, 3.4, 3.4, 1.5 + (i % 2) * 2.2, 0, 2); }
    for (const [x, z] of [[24, -22], [-24, 22], [36, -34], [-36, 34], [12, 10], [-12, -10]]) { block(x, z, 1.5, 1.5, 5, 0, -1); block(x, z, 2.1, 2.1, 0.5, 5, 1); }
    for (const s of [1, -1]) { block(s * 24, s * 30, 9, 1.2, 2.2, 0, 0); block(s * -40, s * 12, 1.2, 9, 2.2, 0, 0); }
    addPad(-24.5, -10, -32, -10); addPad(24.5, 10, 32, 10); addPad(-10, 25.5, -10, 32); addPad(10, -25.5, 10, -32);
    [[8, 20], [-8, -20], [20, -8], [-20, 8], [30, 30], [-30, -30], [40, -6], [-40, 6], [3, 6], [-3, -6]].forEach(([x, z]) => addBarrel(x, z));
    spawnPt = { x: 0, y: 1.0, z: 5 };
  }
};
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), bandGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.12, 14);
const barrelMat = new THREE.MeshStandardMaterial({ color: 0xc02818, roughness: 0.45, metalness: 0.4 }), bandMat = new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xffb02e, emissiveIntensity: 1.5 });
let builtCfg = "";
function buildArena(cfg) {
  const key = cfg.a + "|" + cfg.wx + "|" + cfg.tod; if (key === builtCfg) return; builtCfg = key;
  const A = ARENAS[cfg.a] || ARENAS.rooftop;
  // clear the old arena
  world.traverse(o => { if (o.geometry && o.geometry !== barrelGeo && o.geometry !== bandGeo) o.geometry.dispose(); });
  world.clear(); boxes.length = 0; pads = []; padMeshes = []; portals = []; portalMeshes = []; barrels = []; seedS = 7;
  // materials + sky
  matFloor.map = tex("assets/" + A.floor, HALF * 2 / 6); matFloor.color.set(A.tint); matFloor.needsUpdate = true;
  matSide.map = tex("assets/" + A.wall); matTop.map = tex("assets/" + A.floor); matPerim.map = tex("assets/" + A.wall);
  [matSide, matTop, matPerim].forEach(m => m.needsUpdate = true);
  A.edges.forEach((c, i) => edgeMats[i].color.set(c));
  const st = texLoader.load("assets/" + A.sky); st.colorSpace = THREE.SRGBColorSpace; st.wrapS = THREE.MirroredRepeatWrapping; st.repeat.set(3, 1);
  if (skyMat.map) skyMat.map.dispose(); skyMat.map = st; skyMat.needsUpdate = true;
  LAYOUTS[cfg.a]();
  // extra cover: the outer ring of the (bigger) map plus some in the middle, placed the same way on both phones
  scatterCover(10, 12, 40); scatterCover(24, 44, HALF - 3);
  // jump pads
  pads.forEach(p => {
    const y = groundAt(p.x, p.z); p.y = y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 32), new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
    ring.rotation.x = Math.PI / 2; ring.position.set(p.x, y + 0.06, p.z); world.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: 0x1d5a2a, transparent: true, opacity: 0.8 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, y + 0.04, p.z); world.add(disc);
    padMeshes.push(ring);
  });
  // robot spawn portals around the edge
  const PK = (HALF - 3) / 43; portals = [[0, -43], [0, 43], [-43, 0], [43, 0], [-42, -21], [42, 21], [-21, 42], [21, -42]].map(([x, z]) => [x * PK, z * PK]);
  portalMeshes = portals.map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
    ring.position.y = 2; ring.lookAt(0, 2, 0); g.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    inner.position.y = 2; inner.lookAt(0, 2, 0); g.add(inner);
    const base = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0x3a0610 }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.03; g.add(base);
    world.add(g); return ring;
  });
  // explosive barrels (host decides when they blow; they come back every wave)
  barrels = barrels.map(({ x, z }, i) => {
    const y = groundAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    const body = new THREE.Mesh(barrelGeo, barrelMat); body.position.y = 0.55; body.castShadow = true; g.add(body);
    const band = new THREE.Mesh(bandGeo, bandMat); band.position.y = 0.75; g.add(band);
    world.add(g);
    return { i, x, z, y, g, alive: true, box: { x0: x - 0.42, x1: x + 0.42, y0: y, y1: y + 1.1, z0: z - 0.42, z1: z + 0.42 } };
  });
  barrels.forEach(b => boxes.push(b.box)); chests.forEach(c => boxes.push(c.box));
  // light, fog, weather
  const tod = cfg.tod;
  const fog = new THREE.Color(A.fog), sunC = new THREE.Color(A.sun[0]); let sunI = A.sun[1], hemiI = A.hemi[2];
  skyMat.color.set(0xffffff); sunOff.set(20, 40, 12);
  if (tod === "dusk") { fog.lerp(new THREE.Color(0x3a1c2a), 0.5); sunC.lerp(new THREE.Color(0xff8a4a), 0.7); sunI *= 0.75; hemiI *= 0.7; skyMat.color.set(0xffb898); sunOff.set(40, 16, 10); }
  if (tod === "night") { fog.lerp(new THREE.Color(0x05070f), 0.8); sunC.set(0x8aa0ff); sunI = 0.7; hemiI *= 0.38; skyMat.color.set(0x3a4870); }
  scene.fog.color.copy(fog); scene.background.copy(fog).multiplyScalar(0.5); skyMat.userData.cap.material.color.copy(fog).multiplyScalar(0.6);
  scene.fog.near = cfg.wx === "snow" || cfg.wx === "storm" ? 30 : 50; scene.fog.far = cfg.wx === "storm" ? 130 : 170;
  hemi.color.set(A.hemi[0]); hemi.groundColor.set(A.hemi[1]); hemi.intensity = hemiI; hemi.userData.base = hemiI;
  sun.color.copy(sunC); sun.intensity = sunI;
  nightLight.intensity = tod === "night" ? 26 : 0;
  const wxNow = cfg.wx === "auto" ? A.wx : cfg.wx; setWeather(wxNow);
  // rain makes every surface wet and shiny
  const wet = wxNow === "rain" || wxNow === "storm";
  matFloor.roughness = wet ? 0.18 : 0.55; matFloor.metalness = wet ? 0.55 : 0.35; matTop.roughness = wet ? 0.22 : 0.55; matSide.roughness = wet ? 0.35 : 0.6;
  matFloor.envMapIntensity = wet ? 1.8 : 1;
}
// weather particles follow the camera
const WX_N = 1600, wxPos = new Float32Array(WX_N * 6), wxGeo = new THREE.BufferGeometry(); wxGeo.setAttribute("position", new THREE.BufferAttribute(wxPos, 3));
const rainMesh = new THREE.LineSegments(wxGeo, new THREE.LineBasicMaterial({ color: 0xa8c0ff, transparent: true, opacity: 0.35, depthWrite: false }));
const snowGeo = new THREE.BufferGeometry(); const snowPos = new Float32Array(WX_N * 3); snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snowMesh = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
rainMesh.frustumCulled = snowMesh.frustumCulled = false; rainMesh.visible = snowMesh.visible = false; scene.add(rainMesh, snowMesh);
let wxKind = "clear", boltT = 6;
function setWeather(k) {
  wxKind = k; rainMesh.visible = k === "rain" || k === "storm"; snowMesh.visible = k === "snow";
  for (let i = 0; i < WX_N; i++) { const x = rand(-35, 35), y = rand(0, 30), z = rand(-35, 35); wxPos.set([x, y, z, x, y - 0.7, z], i * 6); snowPos.set([x, y, z], i * 3); }
  wxGeo.attributes.position.needsUpdate = snowGeo.attributes.position.needsUpdate = true;
}
function updWeather(dt) {
  if (wxKind === "clear") return;
  const c = camera.position;
  if (rainMesh.visible) {
    for (let i = 0; i < WX_N; i++) { const o = i * 6; let y = wxPos[o + 1] - 34 * dt; if (y < c.y - 12) { y += 30; wxPos[o] = c.x + rand(-35, 35); wxPos[o + 2] = c.z + rand(-35, 35); } else { if (wxPos[o] - c.x > 35) wxPos[o] -= 70; else if (wxPos[o] - c.x < -35) wxPos[o] += 70; if (wxPos[o + 2] - c.z > 35) wxPos[o + 2] -= 70; else if (wxPos[o + 2] - c.z < -35) wxPos[o + 2] += 70; }
      wxPos[o + 1] = y; wxPos[o + 3] = wxPos[o] + 0.08; wxPos[o + 4] = y - 0.8; wxPos[o + 5] = wxPos[o + 2]; }
    wxGeo.attributes.position.needsUpdate = true;
  }
  if (snowMesh.visible) {
    const t = performance.now() / 1000;
    for (let i = 0; i < WX_N; i++) { const o = i * 3; let y = snowPos[o + 1] - 2.2 * dt; snowPos[o] += Math.sin(t + i) * 0.6 * dt; if (y < c.y - 10) { y += 26; snowPos[o] = c.x + rand(-35, 35); snowPos[o + 2] = c.z + rand(-35, 35); } else { if (snowPos[o] - c.x > 35) snowPos[o] -= 70; else if (snowPos[o] - c.x < -35) snowPos[o] += 70; if (snowPos[o + 2] - c.z > 35) snowPos[o + 2] -= 70; else if (snowPos[o + 2] - c.z < -35) snowPos[o + 2] += 70; } snowPos[o + 1] = y; }
    snowGeo.attributes.position.needsUpdate = true;
  }
  if (wxKind === "storm") {
    boltT -= dt;
    if (boltT <= 0) { boltT = rand(5, 13); hemi.intensity = 6; skyFlash = 0.35; setTimeout(() => { noise(2.2, 0.35, 300); tone(45, 1.6, "sine", 0.25, 0.6); }, rand(150, 700)); }
    if (skyFlash > 0) { skyFlash -= dt; if (skyFlash <= 0) hemi.intensity = hemi.userData.base; else hemi.intensity = hemi.userData.base + (Math.random() < 0.5 ? 4 : 1); }
  }
}
let skyFlash = 0;
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
function rayBarrel(o, d) { let best = Infinity, bb = null; for (const b of barrels) if (b.alive) { const t = raySphere(o, d, V(b.x, b.y + 0.55, b.z), 0.6); if (t < best) { best = t; bb = b; } } return [best, bb]; }
// bulwarks block shots that hit their front shield
function shielded(e, from, head) { if (!ETYPES[e.type].shield || head) return false; const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), dx = from.x - e.pos.x, dz = from.z - e.pos.z, l = Math.hypot(dx, dz) || 1; return (fx * dx + fz * dz) / l > 0.4; }
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
// flying debris chunks that bounce and tumble (pooled)
const DEB_N = 70, debGeo = new THREE.BoxGeometry(1, 1, 1), debMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.8, metalness: 0.3, emissive: 0xff5a10, emissiveIntensity: 0 });
const debMesh = new THREE.InstancedMesh(debGeo, debMat, DEB_N); debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debMesh.frustumCulled = false; debMesh.castShadow = true; scene.add(debMesh);
const debs = Array.from({ length: DEB_N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2 }));
let debNext = 0; const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _ds = new THREE.Vector3();
function debris(p, n, spd) { for (let i = 0; i < n; i++) { const d = debs[debNext = (debNext + 1) % DEB_N]; d.life = 1.6 + Math.random(); d.p.copy(p); d.p.y += 0.3; const a = Math.random() * 6.283, h = Math.random(); d.v.set(Math.cos(a) * spd * (0.4 + h), 4 + Math.random() * spd, Math.sin(a) * spd * (0.4 + h)); d.w.set(rand(-12, 12), rand(-12, 12), rand(-12, 12)); d.s = 0.08 + Math.random() * 0.22; } }
function updDebris(dt) {
  for (let i = 0; i < DEB_N; i++) { const d = debs[i];
    if (d.life > 0) { d.life -= dt; d.v.y -= 22 * dt; d.p.addScaledVector(d.v, dt); const g = groundAt(d.p.x, d.p.z, d.p.y + 0.3); if (d.p.y < g + d.s / 2) { d.p.y = g + d.s / 2; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); } d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt; }
    const sc = d.life > 0 ? d.s * Math.min(1, d.life * 2) : 0; _dq.setFromEuler(d.r); _ds.setScalar(sc); _dm.compose(d.p, _dq, _ds); debMesh.setMatrixAt(i, _dm); }
  debMesh.instanceMatrix.needsUpdate = true;
}
function explosion(p, r = 3, color = 0xff8a3a) {
  debris(p, Math.round(4 + r * 2.5), 3 + r * 1.5);
  spark(p, 0xffe0a0, Math.round(10 + r * 4), 4 + r * 2, 6, 1.1);
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
function makeGun(kind = "rifle") {
  const gun = new THREE.Group(), glow = glowMat(0xffffff, 2.5), dark = darkArmor.clone(), light = lightArmor.clone();
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); gun.add(o); return o; };
  const cyl = (r1, r2, l, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, 10).rotateX(Math.PI / 2), m); o.position.set(x, y, z); gun.add(o); return o; };
  let mz = -0.78;
  if (kind === "shotgun") {
    box(0.13, 0.15, 0.5, dark, 0, 0, -0.18); box(0.1, 0.05, 0.3, light, 0, 0.1, -0.16);
    cyl(0.036, 0.036, 0.34, light, 0.036, 0.02, -0.56); cyl(0.036, 0.036, 0.34, light, -0.036, 0.02, -0.56);
    box(0.12, 0.08, 0.16, dark, 0, -0.07, -0.44); box(0.135, 0.025, 0.3, glow, 0, 0.03, -0.18); mz = -0.76;
  } else if (kind === "rail") {
    box(0.08, 0.12, 0.78, dark, 0, 0, -0.28); cyl(0.03, 0.03, 0.5, light, 0, 0.01, -0.9);
    cyl(0.035, 0.035, 0.22, dark, 0, 0.11, -0.2); cyl(0.028, 0.028, 0.02, glow, 0, 0.11, -0.31);
    for (let i = 0; i < 4; i++) box(0.1, 0.02, 0.03, glow, 0, 0.02, -0.55 - i * 0.09);
    box(0.085, 0.02, 0.5, glow, 0, -0.065, -0.3); mz = -1.18;
  } else if (kind === "launcher") {
    box(0.1, 0.13, 0.4, dark, 0, 0, -0.1); cyl(0.12, 0.12, 0.2, light, 0, 0, -0.32);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(0.03, 0.03, 0.21, glow, Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.32); }
    cyl(0.065, 0.075, 0.42, dark, 0, 0.0, -0.62); cyl(0.07, 0.07, 0.05, glow, 0, 0.0, -0.83); mz = -0.88;
  } else {
    box(0.09, 0.13, 0.62, dark, 0, 0, -0.22); box(0.07, 0.05, 0.4, light, 0, 0.085, -0.2);
    const mag = box(0.06, 0.16, 0.1, dark, 0, -0.12, -0.18); mag.rotation.x = 0.25;
    cyl(0.025, 0.03, 0.24, light, 0, 0, -0.64); box(0.095, 0.02, 0.36, glow, 0, 0.02, -0.22);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.z = mz; gun.add(muzzle);
  const mflash = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); mflash.position.z = mz - 0.06; mflash.scale.set(1, 1, 2.2); mflash.visible = false; gun.add(mflash);
  const grip = new THREE.Object3D(); grip.position.set(0, -0.06, -0.02); gun.add(grip);
  const fore = new THREE.Object3D(); fore.position.set(0, -0.05, -0.4); gun.add(fore);
  shadowAll(gun); mflash.castShadow = false;
  return { gun, muzzle, mflash, glow, grip, fore };
}
function makeSoldier(colorHex, gunKind) {
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
  const G = makeGun(gunKind); G.glow.color.copy(col); G.glow.emissive.copy(col);
  const pivot = new THREE.Group(); pivot.position.set(0.09, 1.38, 0.02); pivot.add(G.gun); root.add(pivot);
  const allMats = []; root.traverse(o => { if (o.isMesh && o.material && !allMats.includes(o.material) && o !== G.mflash) allMats.push(o.material); });
  root.userData = { mixer, acts, bones, armBones, bind, pivot, muzzle: G.muzzle, mflash: G.mflash, grip: G.grip, fore: G.fore, mats, allMats, w: { Idle: 1, Walk: 0, Run: 0 }, flashT: 0, recoil: 0, glowT: 0, tw: 0, cloak: false };
  return root;
}
function setCloak(m, on) {
  const u = m.userData; if (u.cloak === on) return; u.cloak = on;
  u.allMats.forEach(mt => { mt.transparent = on; mt.opacity = on ? 0.14 : 1; mt.depthWrite = !on; mt.needsUpdate = true; });
}
const _right = V(), _down = V(0, -1, 0), _back = V(), _up = V(0, 1, 0);
function animSoldier(m, vel, pitch, downed, dt, glow) {
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
  // strafing: hips (and legs) turn toward the movement direction, the upper body keeps facing the aim
  let tw = 0;
  if (!downed && speed > 0.6) { const fw = vel.x * fx + vel.z * fz, lat = vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw); tw = -(back ? Math.atan2(-lat, -fw) : Math.atan2(lat, fw)); tw = clamp(tw, -1.25, 1.25); }
  u.tw = lerp(u.tw, tw, Math.min(1, dt * 10));
  if (Math.abs(u.tw) > 0.01 && u.bones.Hips) { rotBoneWorld(u.bones.Hips, _up, u.tw); if (u.bones.Spine) rotBoneWorld(u.bones.Spine, _up, -u.tw * 0.55); rotBoneWorld(u.bones.Spine1, _up, -u.tw * 0.45); }
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
  // ability glow (overdrive gold, iron skin steel blue, rage red)
  const g = glow || 0; if (u.glowT !== g) { u.glowT = g; u.mats.forEach(mt => { if (!/Visor/i.test(mt.name)) { mt.emissive.setHex(g); mt.emissiveIntensity = g ? 0.55 : 1; } }); }
}
const robotRed = glowMat(0xff1010, 1.8), robotOrange = glowMat(0xff5a00, 1.6), robotBody = new THREE.MeshStandardMaterial({ color: 0x8a8f9e, roughness: 0.3, metalness: 0.7 }), robotDark = new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 0.4, metalness: 0.6 });
const shieldMat = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, emissive: 0x2a7fff, emissiveIntensity: 1.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 });
// ---- combat droids: troopers, snipers, bulwarks and the Titan share the players' animated body rig,
// rebuilt in black chrome with glowing visors, armour plates and their own guns
const DROID = {
  grunt:   { tint: 0xd0602a, glow: 0xff3a1a, gun: "rifle" },
  sniper:  { tint: 0x8a5cff, glow: 0xb06bff, gun: "rail" },
  bulwark: { tint: 0x3c78c8, glow: 0x4aa8ff, gun: "shotgun" },
  boss:    { tint: 0x40242a, glow: 0xff1a10, gun: "launcher" }
};
function makeDroid(type, g, u) {
  const T = ETYPES[type], D = DROID[type], h = T.h, k = h / 1.8;
  const inner = makeSoldier(D.glow, D.gun); inner.scale.setScalar(k); g.add(inner);
  const iu = inner.userData, tint = new THREE.Color(D.tint);
  iu.mats.forEach(mt => {
    if (/Visor/i.test(mt.name)) { mt.color.set(D.glow); mt.emissive.set(D.glow); mt.emissiveIntensity = 2.2; }
    else { mt.color.set(0x1c1f26).lerp(tint, 0.22); mt.metalness = 0.88; mt.roughness = 0.28; mt.emissive = new THREE.Color(0x000000); }
  });
  g.updateMatrixWorld(true);
  const B = iu.bones, P = (b, x, y, z) => (b ? b.getWorldPosition(V()) : V(0, h * 0.5, 0)).add(V(x * k, y * k, z * k));
  const glow = glowMat(D.glow, 2.2), plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2e38).lerp(tint, 0.45), roughness: 0.25, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35, metalness: 0.8 });
  // head: helmet shell, glowing eye slit, antenna
  bolt(g, B.Head, new THREE.Mesh(new THREE.SphereGeometry(0.135 * k, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), plate), P(B.Head, 0, 0.1, 0.01));
  bolt(g, B.Head, new THREE.Mesh(new THREE.BoxGeometry(0.2 * k, 0.035 * k, 0.04 * k), glow), P(B.Head, 0, 0.09, -0.115));
  bolt(g, B.Head, new THREE.Mesh(new THREE.CylinderGeometry(0.006 * k, 0.01 * k, 0.22 * k, 5), dark), P(B.Head, 0.1, 0.24, 0.03), [0, 0, -0.25]);
  bolt(g, B.Head, new THREE.Mesh(new THREE.SphereGeometry(0.018 * k, 6, 4), glow), P(B.Head, 0.128, 0.345, 0.03));
  // chest plate with reactor core, back power pack
  bolt(g, B.Spine2, new THREE.Mesh(new THREE.BoxGeometry(0.34 * k, 0.24 * k, 0.07 * k), plate), P(B.Spine2, 0, 0.02, -0.12), [0.12, 0, 0]);
  bolt(g, B.Spine2, new THREE.Mesh(new THREE.SphereGeometry(0.045 * k, 12, 8), glow), P(B.Spine2, 0, 0.03, -0.16));
  bolt(g, B.Spine2, new THREE.Mesh(new THREE.BoxGeometry(0.3 * k, 0.32 * k, 0.13 * k), dark), P(B.Spine2, 0, -0.02, 0.17));
  for (const s of [-1, 1]) bolt(g, B.Spine2, new THREE.Mesh(new THREE.BoxGeometry(0.03 * k, 0.24 * k, 0.02 * k), glow), P(B.Spine2, s * 0.09, -0.02, 0.24));
  // shoulder pads and shin guards
  for (const [bn, s] of [["LeftArm", 1], ["RightArm", -1]]) bolt(g, B[bn], new THREE.Mesh(new THREE.BoxGeometry(0.17 * k, 0.06 * k, 0.2 * k), plate), P(B[bn], 0, 0.07, 0), [0, 0, s * 0.35]);
  for (const bn of ["LeftLeg", "RightLeg"]) if (B[bn]) bolt(g, B[bn], new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.26 * k, 0.05 * k), plate), P(B[bn], 0, -0.16, -0.08));
  if (type === "sniper") bolt(g, B.Head, new THREE.Mesh(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 0.06 * k, 8).rotateX(Math.PI / 2), glow), P(B.Head, -0.08, 0.1, -0.13));
  Object.assign(u, { droid: true, inner, lastPos: null });
  if (type === "bulwark") {
    // shield covers legs and chest only: the head pokes out above it and can be shot
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * h, 0.62 * h, 0.5 * h, 20, 1, true, -0.75, 1.5), shieldMat); sh.rotation.y = Math.PI; sh.position.set(0, 0.31 * h, 0.12 * h); g.add(sh); u.parts.shield = sh;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62 * h, 0.012 * h, 4, 20, 1.5), glowMat(0x4aa8ff, 3)); rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.75 + Math.PI); rim.position.set(0, 0.56 * h, 0.12 * h); g.add(rim);
  }
  if (type === "boss") {
    // Titan: horns, spiked pauldrons, forearm blades, a big reactor core and back exhausts on the same rig
    const L = (b, x, y, z) => P(B[b], x, y, z);
    for (const s of [-1, 1]) {
      bolt(g, B.Head, spike(0.028 * k, 0.24 * k), L("Head", s * 0.11, 0.2, 0.02), [-0.35, 0, -s * 0.85]);
      bolt(g, B.Head, spike(0.012 * k, 0.1 * k, bossRed), L("Head", s * 0.2, 0.3, 0.03), [-0.35, 0, -s * 0.85]);
      const arm = s < 0 ? "LeftArm" : "RightArm", fore = s < 0 ? "LeftForeArm" : "RightForeArm", leg = s < 0 ? "LeftLeg" : "RightLeg";
      bolt(g, B[arm], new THREE.Mesh(new THREE.BoxGeometry(0.22 * k, 0.08 * k, 0.26 * k), bossMetal), L(arm, 0, 0.1, 0), [0, 0, -s * 0.35]);
      bolt(g, B[arm], new THREE.Mesh(new THREE.BoxGeometry(0.23 * k, 0.015 * k, 0.27 * k), bossRed), L(arm, 0, 0.055, 0), [0, 0, -s * 0.35]);
      for (let i = 0; i < 3; i++) bolt(g, B[arm], spike(0.022 * k, 0.14 * k), L(arm, -s * 0.02, 0.19, -0.08 + i * 0.08), [0, 0, -s * 0.4]);
      if (B[fore]) { bolt(g, B[fore], new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.16 * k, 0.09 * k), bossMetal), L(fore, 0, -0.1, 0)); bolt(g, B[fore], spike(0.02 * k, 0.26 * k, bossRed), L(fore, -s * 0.06, -0.12, 0), [0, 0, s * 1.4]); }
      if (B[leg]) bolt(g, B[leg], spike(0.03 * k, 0.16 * k), L(leg, 0, 0.0, -0.12), [-Math.PI / 2, 0, 0]);
      const ex = bolt(g, B.Spine2, new THREE.Mesh(new THREE.CylinderGeometry(0.035 * k, 0.045 * k, 0.3 * k, 10), bossMetal), L("Spine2", s * 0.09, 0.2, 0.22), [0.25, 0, 0]);
      const fl = bolt(g, B.Spine2, new THREE.Mesh(new THREE.ConeGeometry(0.03 * k, 0.16 * k, 8), bossFlame), L("Spine2", s * 0.09, 0.4, 0.27), [0.25, 0, 0]);
      (u.parts.flames = u.parts.flames || []).push(fl);
    }
    for (let i = 0; i < 3; i++) bolt(g, B.Head, spike(0.02 * k, 0.12 * k + i * 0.02 * k), L("Head", 0, 0.24 - i * 0.03, 0.06 + i * 0.05), [-0.9, 0, 0]);
    bolt(g, B.Spine2, new THREE.Mesh(new THREE.BoxGeometry(0.4 * k, 0.3 * k, 0.08 * k), bossMetal), L("Spine2", 0, 0.03, -0.14), [0.12, 0, 0]);
    u.parts.core = bolt(g, B.Spine2, new THREE.Mesh(new THREE.SphereGeometry(0.06 * k, 16, 12), bossRed), L("Spine2", 0, 0.04, -0.19));
    u.parts.ring2 = bolt(g, B.Spine2, new THREE.Mesh(new THREE.TorusGeometry(0.08 * k, 0.012 * k, 6, 24), bossTrim), L("Spine2", 0, 0.04, -0.185));
  }
}
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
    // shield covers legs and chest only: the head pokes out above it and can be shot
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * h, 0.62 * h, 0.5 * h, 20, 1, true, -0.75, 1.5), shieldMat); sh.rotation.y = Math.PI; sh.position.set(0, 0.31 * h, 0.12 * h); g.add(sh); u.parts.shield = sh;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62 * h, 0.012 * h, 4, 20, 1.5), glowMat(0x4aa8ff, 3)); rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.75 + Math.PI); rim.position.set(0, 0.56 * h, 0.12 * h); g.add(rim);
  }
  if (type === "boss") titanArmor(g, inner, u, h);
}
// ---- boss looks: heavy spiked armour bolted onto the Titan's skeleton
const bossMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.22, metalness: 0.92, emissive: 0x200404, emissiveIntensity: 1 });
const bossTrim = new THREE.MeshStandardMaterial({ color: 0x55596a, roughness: 0.25, metalness: 0.9 });
const bossRed = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0800, emissiveIntensity: 1.7, roughness: 0.4 }); for (const m of [bossMetal, bossTrim, bossRed]) m.userData.shared = true;
const bossFlame = new THREE.MeshBasicMaterial({ color: 0xff4008, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
// armour-plate texture on every procedural robot and the Siege Walker, so they match the droids' metal look
{ const mt = texLoader.load("assets/robot_metal.jpg"); mt.colorSpace = THREE.SRGBColorSpace; mt.wrapS = mt.wrapT = THREE.RepeatWrapping; mt.anisotropy = 4;
  robotBody.map = mt; robotBody.color.set(0xb0b6c4); robotBody.metalness = 0.8; robotBody.roughness = 0.32;
  robotDark.map = mt; robotDark.color.set(0x80869a);
  bossMetal.map = mt; bossMetal.color.set(0x9098a8); bossTrim.map = mt; bossTrim.color.set(0xc0c6d4);
  [robotBody, robotDark, bossMetal, bossTrim].forEach(m => m.needsUpdate = true); }
const RIG_MAP = { Torso: "Spine2", ShoulderL: "LeftShoulder", ShoulderR: "RightShoulder", UpperArmL: "LeftArm", UpperArmR: "RightArm", LowerArmL: "LeftForeArm", LowerArmR: "RightForeArm", Palm2L: "LeftHand", Palm2R: "RightHand", LowerLegL: "LeftLeg", LowerLegR: "RightLeg", UpperLegL: "LeftUpLeg", UpperLegR: "RightUpLeg" };
function findBone(root, n) { let b = null; const norm = o => o.name.replace(/[.\s_:]/g, "").replace(/^mixamorig/, ""); root.traverse(o => { if (o.isBone && norm(o) === n) b = b || o; }); if (!b && RIG_MAP[n]) return findBone(root, RIG_MAP[n]); return b; }
function bolt(parent, bone, mesh, pos, rot) { mesh.position.copy(pos); if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]); parent.add(mesh); mesh.updateMatrixWorld(true); (bone || parent).attach(mesh); mesh.castShadow = true; return mesh; }
function spike(r, l, mat = bossTrim) { return new THREE.Mesh(new THREE.ConeGeometry(r, l, 6), mat); }
function titanArmor(g, inner, u, h) {
  g.updateMatrixWorld(true);
  const B = n => findBone(inner, n), P = n => { const b = B(n); return b ? b.getWorldPosition(V()) : V(0, h * 0.5, 0); };
  const head = P("Head"), torso = P("Torso"), hd = B("Head"), to = B("Torso");
  // head: swept horns, glowing visor, crest
  for (const s of [-1, 1]) {
    bolt(g, hd, spike(0.045 * h, 0.26 * h), head.clone().add(V(s * 0.1 * h, 0.15 * h, 0.02 * h)), [-0.5, 0, -s * 0.75]);
    bolt(g, hd, spike(0.02 * h, 0.1 * h, bossRed), head.clone().add(V(s * 0.06 * h, 0.08 * h, -0.115 * h)), [-1.2, 0, 0]);
  }
  bolt(g, hd, new THREE.Mesh(new THREE.BoxGeometry(0.2 * h, 0.03 * h, 0.03 * h), bossRed), head.clone().add(V(0, 0.07 * h, -0.13 * h)));
  for (let i = 0; i < 3; i++) bolt(g, hd, spike(0.025 * h, 0.12 * h), head.clone().add(V(0, 0.2 * h - i * 0.01 * h, 0.02 * h + i * 0.05 * h)), [0.4 + i * 0.25, 0, 0]);
  // chest plate + reactor core
  bolt(g, to, new THREE.Mesh(new THREE.BoxGeometry(0.34 * h, 0.2 * h, 0.06 * h), bossMetal), torso.clone().add(V(0, 0.09 * h, -0.13 * h)), [0.15, 0, 0]);
  const core = bolt(g, to, new THREE.Mesh(new THREE.SphereGeometry(0.06 * h, 16, 12), bossRed), torso.clone().add(V(0, 0.08 * h, -0.17 * h)));
  const ring = bolt(g, to, new THREE.Mesh(new THREE.TorusGeometry(0.075 * h, 0.012 * h, 6, 24), bossTrim), torso.clone().add(V(0, 0.08 * h, -0.165 * h)));
  u.parts.core = core; u.parts.ring2 = ring;
  // exhaust stacks with flames on the back
  u.parts.flames = [];
  for (const s of [-1, 1]) {
    bolt(g, to, new THREE.Mesh(new THREE.CylinderGeometry(0.035 * h, 0.045 * h, 0.28 * h, 10), bossMetal), torso.clone().add(V(s * 0.1 * h, 0.2 * h, 0.15 * h)), [0.25, 0, 0]);
    u.parts.flames.push(bolt(g, to, new THREE.Mesh(new THREE.ConeGeometry(0.035 * h, 0.16 * h, 8), bossFlame), torso.clone().add(V(s * 0.1 * h, 0.37 * h, 0.2 * h)), [0.25, 0, 0]));
  }
  // spiked shoulder pauldrons, forearm blades, knee spikes
  for (const [sd, L] of [[-1, "L"], [1, "R"]]) {
    const sb = B("Shoulder" + L) || B("UpperArm" + L), sp = P("UpperArm" + L);
    const s = sp.x > 0 ? 1 : -1;
    bolt(g, sb, new THREE.Mesh(new THREE.BoxGeometry(0.2 * h, 0.07 * h, 0.2 * h), bossMetal), sp.clone().add(V(s * 0.02 * h, 0.06 * h, 0)), [0, 0, s * -0.35]);
    bolt(g, sb, new THREE.Mesh(new THREE.BoxGeometry(0.21 * h, 0.012 * h, 0.21 * h), bossRed), sp.clone().add(V(s * 0.02 * h, 0.022 * h, 0)), [0, 0, s * -0.35]);
    for (let i = -1; i <= 1; i++) bolt(g, sb, spike(0.025 * h, 0.14 * h), sp.clone().add(V(s * 0.05 * h, 0.13 * h, i * 0.06 * h)), [0, 0, s * -0.6]);
    const la = B("LowerArm" + L), lp = P("LowerArm" + L), hp = P("Palm2" + L);
    if (la) { const mid = lp.clone().lerp(hp, 0.5); bolt(g, la, new THREE.Mesh(new THREE.BoxGeometry(0.03 * h, 0.06 * h, 0.06 * h), bossMetal), mid.clone().add(V(s * 0.05 * h, 0, 0))); bolt(g, la, spike(0.02 * h, 0.12 * h, bossRed), mid.clone().add(V(s * 0.08 * h, 0, 0)), [0, 0, s * -Math.PI / 2]); }
    const ll = B("LowerLeg" + L), kp = P("LowerLeg" + L);
    if (ll) bolt(g, ll, spike(0.03 * h, 0.1 * h), kp.clone().add(V(0, 0.02 * h, -0.06 * h)), [-1.4, 0, 0]);
  }
}
// ---- second boss: a four-legged siege walker (procedural, legs animated with a simple gait)
function segment(m, a, b) { const d = tmpV2.subVectors(b, a); const l = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.divideScalar(l || 1)); m.scale.set(1, l, 1); }
function makeWalker(g, u) {
  const hull = new THREE.Group(); hull.position.y = 5; g.add(hull); u.parts.hull = hull;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); hull.add(m); return m; };
  add(new THREE.BoxGeometry(4.2, 1.5, 5.2), bossMetal, 0, 0, 0);
  add(new THREE.BoxGeometry(3.6, 0.5, 4.2), bossTrim, 0, 0.95, 0.2);
  add(new THREE.BoxGeometry(3.0, 1.1, 1.4), bossMetal, 0, 0.2, -3.0, 0.25);
  add(new THREE.BoxGeometry(2.4, 0.14, 0.1), bossRed, 0, 0.35, -3.72, 0.25);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.9, 0.9, 2.2), bossTrim, s * 2.5, 0.1, -1.4);
    add(new THREE.CylinderGeometry(0.2, 0.26, 2.6, 10).rotateX(Math.PI / 2), bossMetal, s * 2.5, 0.1, -3.4);
    add(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 10).rotateX(Math.PI / 2), bossRed, s * 2.5, 0.1, -4.7);
    add(new THREE.CylinderGeometry(0.28, 0.34, 1.4, 10), bossMetal, s * 1.2, 1.5, 2.1, 0.3);
    for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.16, 0.7, 6), bossTrim, s * (0.6 + i * 0.45), 1.3, 1.2 - i * 0.6, 0, 0, s * -0.3);
  }
  u.parts.flames = [-1, 1].map(s => add(new THREE.ConeGeometry(0.28, 1.1, 8), bossFlame, s * 1.2, 2.5, 2.4, 0.3));
  const dome = add(new THREE.SphereGeometry(1.0, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), bossRed, 0, 1.2, -0.6); u.parts.core = dome;
  add(new THREE.TorusGeometry(1.02, 0.08, 6, 28).rotateX(Math.PI / 2), bossTrim, 0, 1.22, -0.6);
  u.parts.legs = [];
  for (const [sx, sz, off] of [[-1, -1, 0], [1, 1, 0], [1, -1, Math.PI], [-1, 1, Math.PI]]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 1, 10), bossMetal), shin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 1, 10), bossTrim);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bossMetal), kneeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bossRed), foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.3, 12), bossMetal);
    const kspike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), bossTrim);
    g.add(thigh, shin, knee, kneeGlow, foot, kspike);
    u.parts.legs.push({ sx, sz, off, thigh, shin, knee, kneeGlow, foot, kspike, hip: V(sx * 1.9, 4.7, sz * 2.2), rest: V(sx * 4.0, 0, sz * 3.6), lastLift: 0 });
  }
  poseWalker(u, 0, 0);
}
const _hip = V(), _foot = V(), _knee = V();
function poseWalker(u, phase, mv) {
  const hull = u.parts.hull; hull.position.y = 5 + Math.sin(phase * 2) * 0.1 * mv; hull.rotation.z = Math.sin(phase) * 0.03 * mv;
  for (const L of u.parts.legs) {
    const p = phase + L.off, lift = Math.max(0, Math.cos(p)) * 0.9 * mv;
    _hip.copy(L.hip); _hip.y += hull.position.y - 5;
    _foot.set(L.rest.x, lift, L.rest.z - Math.sin(p) * 1.1 * mv);
    _knee.copy(_hip).lerp(_foot, 0.45); _knee.x += L.sx * 1.5; _knee.y += 1.8;
    segment(L.thigh, _hip, _knee); segment(L.shin, _knee, _foot);
    L.knee.position.copy(_knee); L.kneeGlow.position.copy(_knee).add(V(L.sx * 0.3, 0.1, 0)); L.foot.position.set(_foot.x, _foot.y + 0.15, _foot.z);
    L.kspike.position.copy(_knee).add(V(L.sx * 0.35, 0.45, 0)); L.kspike.rotation.z = -L.sx * 0.5;
    L.planted = lift < 0.05;
  }
}
function makeRobot(type) {
  const g = new THREE.Group(), u = { parts: {}, isBoss: !!ETYPES[type].boss };
  if (DROID[type] && ASSETS.soldier) makeDroid(type, g, u);
  else if (ETYPES[type].gltf) makeGltfRobot(type, g, u);
  else if (type === "walker") makeWalker(g, u);
  else if (type === "drone") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), robotBody); g.add(b);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), robotRed); eye.position.z = -0.38; g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), robotRed); ring.rotation.x = Math.PI / 2; g.add(ring); u.parts.ring = ring;
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), robotDark); w.position.x = s * 0.55; g.add(w); }
  } else if (type === "rusher") {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), robotBody); b.position.y = 0.6; g.add(b); u.parts.body = b;
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), robotOrange); glow.position.y = 0.6; g.add(glow); u.parts.glow = glow;
    for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), robotDark); const a = i / 8 * Math.PI * 2; c.position.set(Math.cos(a) * 0.55, 0.6, Math.sin(a) * 0.55); c.lookAt(Math.cos(a) * 2, 0.6, Math.sin(a) * 2); c.rotateX(Math.PI / 2); g.add(c); }
  } else if (type === "leaper") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), robotDark); b.scale.set(1, 0.6, 1.25); b.position.y = 0.55; g.add(b); u.parts.body = b;
    for (const s of [-1, 1]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), robotRed); ey.position.set(s * 0.13, 0.66, -0.45); g.add(ey); }
    u.parts.legs2 = [];
    for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3; const leg = new THREE.Group(); leg.position.set(s * 0.3, 0.55, -0.25 + k * 0.25); g.add(leg);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 5), robotBody); up.position.set(s * 0.22, 0.12, 0); up.rotation.z = s * -1.1; leg.add(up);
      const lo = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.6, 5), robotDark); lo.position.set(s * 0.46, -0.22, 0); lo.rotation.z = Math.PI + s * 0.35; leg.add(lo); u.parts.legs2.push(leg); }
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 5), robotOrange); sp.position.set(0, 0.75, 0.25); sp.rotation.x = 0.6; g.add(sp);
  } else if (type === "zapper") {
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), robotDark); wheel.position.y = 0.38; g.add(wheel); u.parts.wheel = wheel;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.75, 10), robotBody); body.position.y = 1.0; g.add(body);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), robotRed); vis.position.set(0, 1.15, -0.45); g.add(vis);
    for (const s of [-1, 1]) { const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), robotDark); coil.position.set(s * 0.55, 1.05, 0); g.add(coil); }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glowMat(0xb06bff, 2.2)); orb.position.y = 1.6; g.add(orb); u.parts.orb = orb;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 20), glowMat(0xb06bff, 1.6)); ring.position.y = 1.6; ring.rotation.x = Math.PI / 2; g.add(ring); u.parts.ring = ring;
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
  const bf = u.isBoss;
  for (const m of u.mats) { if (!m.emissive || m.userData.shared) continue; if (!m.userData.e) m.userData.e = [m.emissive.getHex(), m.emissiveIntensity]; if (on) { m.emissive.set(bf ? 0xff3a1a : 0xffffff); m.emissiveIntensity = bf ? 0.3 : 0.8; } else { m.emissive.setHex(m.userData.e[0]); m.emissiveIntensity = m.userData.e[1]; } }
}
function robotBase(u, n) { if (!u.acts || u.base === n || !u.acts[n]) return; u.acts[n].reset().setEffectiveWeight(1).fadeIn(0.25).play(); u.acts[u.base].fadeOut(0.25); u.base = n; }
function robotAttack(e) { const u = e.model.userData; if (u.droid) { u.inner.userData.flashT = 0.08; u.inner.userData.recoil = 1; return; } if (!u.acts) { if (u.parts.hull) u.recoil = 1; return; } const a = u.acts.Punch; a.reset(); a.setEffectiveTimeScale(isBoss(e) ? 1.2 : 1.6); a.setEffectiveWeight(1); a.fadeIn(0.08).play(); }
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
const OD_TIME = 8, SKIN_TIME = 7, CLOAK_TIME = 4, COMBO_WIN = 2.6;
const me = {
  body: { p: V(), v: V(), r: P_R, h: P_H, grounded: false },
  yaw: 0, pitch: -0.1, hp: 100, downed: false, dead: false, bleed: 0, revive: 0, cd: 0,
  credits: 0, kills: 0, dmgDone: 0, model: null, label: null, padCd: 0, hurtT: 0,
  secCd: 0, utlCd: 0, dashT: 0, dashDir: V(), ult: 0, odT: 0, skinT: 0, cloakT: 0, cloakCrit: false, slam: false, combo: 0, comboT: 0, bestCombo: 0, crits: 0,
  items: {}, nItems: 0, xp: 0, lvl: 1, shield: 0, sinceHurt: 9, jumps: 0, battT: 0, stormT: 3, phoenixUsed: 0, buffs: {}, ready: false, offers: null, bought: false, mines: []
};
const S = () => SURVIVORS[mySurv];
const ic = k => me.items[k] || 0;
// derived stats from survivor, level and items
const ST = {};
function recalc() {
  const s = S(), oldMax = ST.maxHp || 0;
  ST.maxHp = Math.round((s.hp + 25 * ic("tonic")) * (1 + 0.1 * (me.lvl - 1)) * Math.pow(0.6, ic("glass")));
  ST.dmg = (1 + 0.12 * (me.lvl - 1)) * (1 + ic("glass"));
  ST.atk = 1 + 0.15 * ic("servo");
  ST.crit = 0.02 + 0.1 * ic("sights") + 0.05 * ic("hunter");
  ST.critMul = 2 + 0.5 * ic("hunter");
  ST.block = 1 - 1 / (1 + 0.1 * ic("plate"));
  ST.regen = 2 * ic("nanites");
  ST.speed = 1 + 0.12 * ic("boots");
  ST.cdMul = Math.pow(0.9, ic("cell"));
  ST.jumps = ic("booster");
  ST.shieldMax = Math.round(0.2 * ic("shield") * ST.maxHp);
  if (oldMax && ST.maxHp > oldMax && !me.downed && !me.dead) me.hp += ST.maxHp - oldMax;
  me.hp = Math.min(me.hp, ST.maxHp);
}
function maxHp() { return ST.maxHp || S().hp; }
const xpNeed = l => Math.round(110 * Math.pow(1.45, l - 1));
function gainXp(n) {
  me.xp += n;
  while (me.xp >= xpNeed(me.lvl)) { me.xp -= xpNeed(me.lvl); me.lvl++; recalc(); me.hp = Math.min(maxHp(), me.hp + maxHp() * 0.25); feed("LEVEL " + me.lvl + " · damage and health up", "#ffe14a"); spark(V(me.body.p.x, me.body.p.y + 1, me.body.p.z), 0xffe14a, 30, 5, 4, 0.8); shockRing(me.body.p, 3, 0xffe14a, 0.6); tone(880, 0.2, "triangle", 0.08); setTimeout(() => tone(1320, 0.3, "triangle", 0.08), 120); }
}
function resetMe(full) {
  if (full) { me.credits = 0; me.kills = 0; me.dmgDone = 0; me.ult = 0; me.odT = 0; me.skinT = 0; me.cloakT = 0; me.bestCombo = 0; me.crits = 0; me.items = {}; me.nItems = 0; me.xp = 0; me.lvl = 1; me.buffs = {}; me.offers = null; me.bought = false; me.ready = false; ST.maxHp = 0; recalc(); }
  me.hp = maxHp(); me.downed = false; me.dead = false; me.bleed = 0; me.revive = 0; me.secCd = 0; me.utlCd = 0; me.shield = ST.shieldMax || 0;
}
function spawnMe() {
  me.body.p.set(spawnPt.x + (myIdx === 0 ? -1.6 : 1.6), spawnPt.y, spawnPt.z); me.body.v.set(0, 0, 0); me.yaw = 0; me.pitch = -0.08;
}
// partner (remote)
const mate = { on: false, buf: [], pos: V(), yaw: 0, pitch: 0, hp: 100, mhp: 100, downed: false, dead: false, revive: 0, kills: 0, name: "Partner", surv: "breacher", col: "#ffb02e", model: null, label: null, speed: 0, lastSeen: 0, glow: 0, cloak: false, ready: false, vel: V(), lvl: 1, items: 0 };

// shared game (host-authoritative)
const G = { ph: "menu", wave: 0, tm: 0, left: 0, bossFrac: -1, bossTy: "", bonus: 0, seq: 0 };
// host-only wave data
const H = { queue: [], spawnT: 0, nextId: 1, maxAlive: 10 };

const enemies = new Map();   // id -> enemy
const corpses = [];          // dying robots playing their death animation
const eproj = new Map();     // enemy projectiles
const orbMat = new THREE.MeshBasicMaterial({ color: 0xc890ff });
const rockets = [];          // player projectiles (local and remote visuals)
const pickups = new Map();
const chests = new Map();
const delayed = [];          // small game-time scheduler for multi-shot abilities
function later(t, fn) { delayed.push({ t, fn }); }
function runDelayed(dt) { for (let i = delayed.length - 1; i >= 0; i--) { const d = delayed[i]; d.t -= dt; if (d.t <= 0) { delayed.splice(i, 1); try { d.fn(); } catch (e) { console.error(e); } } } }

const boltGeo = new THREE.SphereGeometry(0.16, 8, 6), mortarGeo = new THREE.SphereGeometry(0.32, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff4040 }), mortarMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a }), snipeMat = new THREE.MeshBasicMaterial({ color: 0xd080ff });
const rocketGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0 });
const missileGeo = new THREE.ConeGeometry(0.07, 0.42, 8).rotateX(Math.PI / 2), missileMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.3, metalness: 0.8, emissive: 0xff3a10, emissiveIntensity: 0.9 });
const nadeGeo = new THREE.SphereGeometry(0.14, 10, 8), nadeMat = glowMat(0x7dff8a, 2), lnchMat = glowMat(0xff2e88, 2), clusterMat = glowMat(0xffb02e, 2), mineMat = glowMat(0xb6ff2e, 2.5);
const pickMat = { hp: glowMat(0x7dff8a, 2.5), ammo: glowMat(0x2ef2ff, 2.5), rage: glowMat(0xff3a3a, 3), haste: glowMat(0x2ef2ff, 3), aegis: glowMat(0xffd23a, 3) };
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
  if (exploded && (u.acts && u.acts.Death || u.droid || isBoss(e))) {
    // humanoid robots play a death animation, then blow apart
    u.bar.visible = false; setFlash(u, false);
    if (u.acts) { for (const k in u.acts) if (k !== "Death") u.acts[k].fadeOut(0.1); u.acts.Death.reset().setEffectiveWeight(1).fadeIn(0.1).play(); }
    e.dying = true; e.dieT = isBoss(e) ? 2.4 : 0.9; corpses.push(e);
    spark(chestOf(e), 0xffd27a, 20, 6, 2, 0.5);
    SFX.robodie(distVol(e.pos));
    return;
  }
  disposeModel(e.model);
  if (exploded) { const c = chestOf(e); explosion(c, e.type === "tank" ? 4 : 2.2, e.type === "rusher" ? 0xff7a1a : 0xff4a3a); SFX.robodie(distVol(e.pos) * 0.7); }
}
function stepCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const e = corpses[i], u = e.model.userData; e.dieT -= dt; if (u.mixer) u.mixer.update(dt); if (u.droid) animSoldier(u.inner, V(), 0, true, dt, 0);
    if (u.parts.hull) { u.parts.hull.rotation.x = lerp(u.parts.hull.rotation.x, 0.35, dt); u.parts.hull.position.y = Math.max(2.5, u.parts.hull.position.y - dt * 1.4); }
    if (isBoss(e) && Math.random() < dt * 7) explosion(chestOf(e).add(V(rand(-2.5, 2.5), rand(-2, 2.5), rand(-2.5, 2.5))), 2.6, Math.random() < 0.5 ? 0xff5a2a : 0xffb02e);
    if (e.dieT <= 0) { corpses.splice(i, 1); disposeModel(e.model); const c = chestOf(e); explosion(c, isBoss(e) ? 9 : e.type === "bulwark" ? 3.4 : 2.4, 0xff4a3a); if (isBoss(e)) { shockRing(e.pos, 36, 0xff6040, 1.3); shake(1.2); puff(c, 20, 4, 0.25); } }
  }
}
function animEnemy(e, dt, now) {
  const u = e.model.userData;
  e.model.position.copy(e.pos); e.model.rotation.y = e.yaw;
  if (e.spawnT > 0) { e.spawnT -= dt; e.model.scale.setScalar(Math.max(0.05, 1 - e.spawnT / 0.6) * (e.scale || 1)); } else e.model.scale.setScalar(e.scale || 1);
  u.phase += dt * (2 + e.moving * 1.2);
  if (u.droid) {
    // drive the shared soldier animator with the robot's velocity in its own frame
    const lp = u.lastPos || e.pos.clone(), vx = (e.pos.x - lp.x) / Math.max(dt, 1e-3), vz = (e.pos.z - lp.z) / Math.max(dt, 1e-3); u.lastPos = e.pos.clone();
    const sc = 1 / ((ETYPES[e.type].h / 1.8) * (e.scale || 1)), c = Math.cos(-e.yaw), sn = Math.sin(-e.yaw);
    u.vel = u.vel || V(); u.vel.x = lerp(u.vel.x, (vx * c + vz * sn) * sc, Math.min(1, dt * 8)); u.vel.z = lerp(u.vel.z, (-vx * sn + vz * c) * sc, Math.min(1, dt * 8));
    if (Math.hypot(vx, vz) > 40) u.vel.set(0, 0, 0);
    animSoldier(u.inner, u.vel, u.aimPitch || 0, false, dt, 0);
  } else if (u.mixer) {
    robotBase(u, e.moving < 0.4 ? "Idle" : e.moving < 3.2 ? "Walking" : "Running");
    const ws = u.acts[u.base]; if (u.base !== "Idle") ws.timeScale = clamp(e.moving / (u.base === "Running" ? 5 : 2.2), 0.5, 1.6) * (ETYPES[e.type].h > 3 ? (isBoss(e) ? 0.5 : 0.6) : 1);
    u.mixer.update(dt);
  }
  if (u.parts.legs) {
    u.gait = (u.gait || 0) + dt * (1.2 + e.moving * 0.9); const mv = clamp(e.moving / 1.5, 0, 1); u.mv = lerp(u.mv || 0, mv, Math.min(1, dt * 4));
    poseWalker(u, u.gait, u.mv);
    for (const L of u.parts.legs) { if (L.planted && !L.wasPlanted && u.mv > 0.3) { const fp = L.foot.getWorldPosition(V()); puff(fp, 2, 0.8, 0.4); if (camera.position.distanceTo(fp) < 30) shake(0.08); } L.wasPlanted = L.planted; }
    u.recoil = Math.max(0, (u.recoil || 0) - dt * 4); u.parts.hull.position.z = u.recoil * 0.35;
  }
  if (u.parts.flames) u.parts.flames.forEach((f, i) => f.scale.set(1, 0.7 + Math.random() * 0.7, 1));
  if (u.parts.ring2) u.parts.ring2.rotation.z += dt * 2;
  if (u.parts.legs2) u.parts.legs2.forEach((L, i) => { L.rotation.x = Math.sin(now / 70 + i * 2.1) * 0.5 * Math.min(1, (e.moving || 0) / 2); });
  if (u.parts.wheel) u.parts.wheel.rotation.x -= dt * (e.moving || 0) * 2.5;
  if (u.parts.orb) u.parts.orb.scale.setScalar(1 + Math.sin(now / 90) * 0.15);
  if (u.parts.ring) u.parts.ring.rotation.z += dt * 8;
  if (u.parts.glow) { const fuse = e.fl & 2; const k = 1 + Math.sin(now / (fuse ? 25 : e.near ? 50 : 120)) * (fuse ? 0.35 : 0.15); u.parts.glow.scale.setScalar(k); u.parts.body.rotation.y += dt * (fuse ? 20 : 6); if (fuse && (u.beepT = (u.beepT || 0) - dt) <= 0) { u.beepT = 0.12; SFX.fuse(distVol(e.pos)); } }
  if (u.parts.core) u.parts.core.scale.setScalar(1 + Math.sin(now / 150) * 0.15);
  if (u.parts.shield) u.parts.shield.material.opacity = 0.35 + Math.sin(now / 200) * 0.08;
  if (u.flashT > 0) { u.flashT -= dt; setFlash(u, true); } else setFlash(u, false);
  // health bar
  const bar = u.bar, hs = HITS[e.type]; const top = hs[hs.length - 1][0] * (e.scale || 1) + hs[hs.length - 1][1] + 0.35;
  bar.visible = e.hpFrac < 0.999 && !isBoss(e) && e.spawnT <= 0;
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
  if (mode === "host" && mate.on && !mate.downed && !mate.dead) list.push({ idx: 1, p: mate.pos, v: mate.vel, cloak: mate.cloak });
  if (me.cloakT > 0 && list.length) list[0].cloak = true;
  const vis = list.filter(t => !t.cloak);
  return vis;
}
function allPlayersForHits() {
  const list = [{ idx: myIdx, p: me.body.p, alive: !me.downed && !me.dead }];
  if (mode === "host" && mate.on) list.push({ idx: 1, p: mate.pos, alive: !mate.downed && !mate.dead });
  return list;
}
function hostSpawnEnemy(type, elite) {
  const coop = mode === "host" && mate.on;
  let [px, pz] = portals[Math.floor(Math.random() * portals.length)];
  const T = ETYPES[type];
  if (T.boss) { px *= 0.82; pz *= 0.82; }
  if (elite === undefined) elite = G.wave >= 6 && !T.boss && Math.random() < Math.min(0.3, 0.04 + G.wave * 0.012);
  const scaleHp = (1 + 0.13 * (G.wave - 1)) * (coop ? 1.55 : 1) * (elite ? 1.8 : 1);
  const id = H.nextId++;
  const y = T.fly ? 6 : 0;
  const e = addEnemyVisual(id, type, px + rand(-1, 1), y, pz + rand(-1, 1), 1, elite);
  e.hp = e.maxHp = Math.round(T.hp * scaleHp);
  e.body = { p: e.pos, v: V(), r: T.r * e.scale, h: T.h * e.scale, grounded: false, noStep: false };
  Object.assign(e, { cd: rand(1, 2.5), cd2: 5, side: Math.random() < 0.5 ? 1 : -1, sideT: 0, stuckT: 0, summoned: false, tgt: null, tgtT: 0,
    slot: rand(-1.3, 1.3), burst: 0, burstT: 0, charge: 0, losT: 0, fuse: 0, cover: null, coverT: 0, coverUsed: false, dodgeCd: 0, phase: 1, hazCd: 7, hazK: 0 });
  e.dmgMul = (0.8 + 0.065 * (G.wave - 1)) * (elite ? 1.25 : 1);
  if (T.boss) { sendHazard({ k: "bi", id, ty: type }); }
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
    const eye = T.gltf ? V(e.pos.x, e.pos.y + 0.7 * T.h * e.scale, e.pos.z) : chestOf(e); const aim = V(tgt.p.x, tgt.p.y + 1.0, tgt.p.z);
    // cover works: the robot needs a clear line to your lower chest, so anything waist-high or taller hides you
    const canSee = dist < (T.range || 99) && los(eye, V(tgt.p.x, tgt.p.y + 0.85, tgt.p.z));
    const dk = diffK();
    e.seeT = canSee ? (e.seeT || 0) + dt : 0; e.age = (e.age || 0) + dt;
    const ready = e.seeT > 0.95 - 0.55 * dk; // reaction time before it opens fire
    if (!e.aggro && (isBoss(e) || dist < 22 + 12 * dk || e.hp < e.maxHp || e.age > 24 - 12 * dk)) e.aggro = true;
    if (!e.aggro) {
      // not alerted yet: patrol toward a random spot, drifting toward the players
      if (!e.wp || Math.hypot(e.wp.x - e.pos.x, e.wp.z - e.pos.z) < 2.5) e.wp = V(clamp(tgt.p.x * 0.5 + rand(-20, 20), -HALF + 3, HALF - 3), 0, clamp(tgt.p.z * 0.5 + rand(-20, 20), -HALF + 3, HALF - 3));
      tmpV2.subVectors(e.wp, e.pos); tmpV2.y = 0; desired.copy(tmpV2.normalize()); speedMul = 0.55; face = Math.atan2(-desired.x, -desired.z);
    } else if (e.type === "leaper") {
      // closes in, then pounces; bites on landing
      e.near = dist < 6;
      if (e.body.grounded && dist < 7.5 && e.cd <= 0 && canSee) { e.cd = 2.2 - 0.6 * dk; e.body.v.y = 7.5; e.leapT = 0.9; e.leapV = toT.clone().multiplyScalar(Math.min(13, dist * 1.6)); e.bit = false; }
      if (e.leapT > 0) { e.leapT -= dt; desired.copy(toT); speedMul = 0; e.body.v.x = e.leapV.x; e.body.v.z = e.leapV.z; if (!e.bit && dist < 1.6 && Math.abs(tgt.p.y - e.pos.y) < 2) { e.bit = true; damagePlayer(tgt.idx, T.melee * e.dmgMul, e.pos); } }
      else desired.copy(toT).addScaledVector(V(-toT.z, 0, toT.x), dist > 9 ? e.side * 0.7 : 0);
    } else if (e.type === "zapper") {
      if (dist > T.keep + 3) desired.copy(toT); else if (dist < T.keep - 4) desired.copy(toT).multiplyScalar(-0.6);
      desired.addScaledVector(V(-toT.z, 0, toT.x), e.side * 0.6);
      if (e.cd <= 0 && canSee && ready) { e.cd = T.fire * rand(0.85, 1.2); e.atk++; const o = V(e.pos.x, e.pos.y + 1.6, e.pos.z); hostBolt(o, aim.clone().add(V(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))).sub(o).normalize(), T.boltSpd, T.bolt * e.dmgMul, "o"); }
    } else if (e.type === "rusher") {
      e.near = dist < 7;
      if (e.fuse > 0) { e.fuse -= dt; speedMul = 0.15; desired.copy(toT); if (e.fuse <= 0) { hostEnemyBoom(e); return; } }
      else { desired.copy(toT).addScaledVector(V(-toT.z, 0, toT.x), dist > 8 ? e.side * 0.5 : 0); if (dist < 3.6 + T.r) e.fuse = T.fuse; }
    } else if (e.type === "sniper") {
      if (e.charge > 0) {
        speedMul = 0; e.charge -= dt; if (!canSee) e.losT += dt; else e.losT = 0;
        if (e.losT > 0.45) { e.charge = 0; e.cd = 1.2; netSend({ t: "lz", id: e.id, d: 0 }); stopLaser(e.id); }
        else if (e.charge <= 0) {
          e.cd = T.fire * rand(0.85, 1.15); e.atk++;
          const sm = 0.5 * (1 - 0.6 * diffK()); hostBolt(eye.clone().add(V(0, 0.15 * T.h, 0)), aim.clone().add(V(rand(-sm, sm), rand(-sm, sm) * 0.5, rand(-sm, sm))).sub(eye).normalize(), T.boltSpd, T.bolt * e.dmgMul, "s");
        }
      } else {
        if (dist > T.keep + 4) desired.copy(toT); else if (dist < T.keep - 8) desired.copy(toT).multiplyScalar(-1);
        desired.addScaledVector(V(-toT.z, 0, toT.x), e.side * 0.6);
        if (e.cd <= 0 && canSee && ready) { e.charge = T.charge * (e.elite ? 0.8 : 1); e.losT = 0; startLaser(e.id, tgt.idx, e.charge); netSend({ t: "lz", id: e.id, tg: tgt.idx, d: r2(e.charge) }); }
      }
    } else if (e.type === "grunt") {
      // squad tactics: each trooper holds its own angle around the target (flanking); hurt ones fall back to cover
      if (e.hp < e.maxHp * 0.45 && !e.coverUsed && !e.cover) { e.cover = findCover(e, tgt.p); e.coverT = 4.5; e.coverUsed = true; }
      if (e.cover && e.coverT > 0) { tmpV2.subVectors(e.cover, e.pos); tmpV2.y = 0; if (tmpV2.length() > 0.6) desired.copy(tmpV2.normalize()); }
      else {
        e.cover = null;
        const ang = Math.atan2(e.pos.z - tgt.p.z, e.pos.x - tgt.p.x);
        const want = V(tgt.p.x + Math.cos(ang + e.slot * 0.22) * T.keep, 0, tgt.p.z + Math.sin(ang + e.slot * 0.22) * T.keep);
        tmpV2.subVectors(want, e.pos); tmpV2.y = 0; if (tmpV2.length() > 1.5) desired.copy(tmpV2.normalize()); else desired.set(-toT.z * e.side, 0, toT.x * e.side).multiplyScalar(0.5);
        if (!canSee && dist < 30) desired.add(toT).normalize();
      }
      if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.13; fireAimedBolt(e, tgt, eye, aim, dist, T); } }
      else if (e.cd <= 0 && canSee && ready) { e.cd = T.fire * rand(0.8, 1.25); e.burst = T.burst + (e.elite ? 2 : 0); e.burstT = 0; e.atk++; }
    } else if (T.keep) { // tank, bulwark, boss
      if (dist > T.keep + 3) desired.copy(toT);
      else if (dist < T.keep - 4) desired.copy(toT).multiplyScalar(-0.7);
      desired.addScaledVector(V(-toT.z, 0, toT.x), e.side * (e.type === "bulwark" ? 0.3 : 0.8));
      if (isBoss(e)) hostBossBrain(e, tgt, eye, aim, dist, canSee, dt);
      else if (e.cd <= 0 && canSee && ready) {
        if (T.mortar) { e.cd = T.fire * rand(0.8, 1.2); hostMortar(e, tgt.p.clone().addScaledVector(tgt.v || V(), 0.6), T.mortar * e.dmgMul); }
        else if (T.spreadN) { // bulwark: shotgun spread, or a punch up close
          e.cd = T.fire * rand(0.8, 1.2); e.atk++;
          if (dist < 3.4) damagePlayer(tgt.idx, 24 * e.dmgMul, e.pos);
          else { const base = Math.atan2(aim.x - eye.x, aim.z - eye.z); for (let k = 0; k < T.spreadN; k++) { const a = base + (k - (T.spreadN - 1) / 2) * 0.1; hostBolt(eye, V(Math.sin(a), (aim.y - eye.y) / Math.max(1, dist), Math.cos(a)).normalize(), T.boltSpd, T.bolt * e.dmgMul); } }
        }
      }
    } else if (T.fly) {
      desired.copy(toT).multiplyScalar(dist > 9 ? 1 : -0.3).addScaledVector(V(-toT.z, 0, toT.x), e.side);
      if (e.cd <= 0 && canSee && ready) { e.cd = T.fire * rand(0.75, 1.25); fireAimedBolt(e, tgt, eye, aim, dist, T); }
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
  const spd = T.speed * (0.85 + 0.25 * diffK()) * speedMul * (isBoss(e) && e.phase === 3 ? 1.35 : 1) * (e.elite ? 1.12 : 1) * (e.stunT > 0 ? 0 : 1);
  if (e.stunT > 0) e.stunT -= dt;
  if (T.fly) {
    e.body.v.x = lerp(e.body.v.x, desired.x * spd, Math.min(1, dt * 2)); e.body.v.z = lerp(e.body.v.z, desired.z * spd, Math.min(1, dt * 2));
    const alt = 4.0 + Math.sin(performance.now() / 700 + e.id) * 0.5;
    e.pos.x += e.body.v.x * dt; e.pos.z += e.body.v.z * dt; e.pos.y = lerp(e.pos.y, alt, Math.min(1, dt * 2));
    e.pos.x = clamp(e.pos.x, -HALF + 1, HALF - 1); e.pos.z = clamp(e.pos.z, -HALF + 1, HALF - 1);
    e.moving = Math.hypot(e.body.v.x, e.body.v.z);
  } else {
    const k = Math.min(1, dt * 6);
    if (!(e.leapT > 0)) { e.body.v.x = lerp(e.body.v.x, desired.x * spd, k); e.body.v.z = lerp(e.body.v.z, desired.z * spd, k); }
    const before = e.pos.clone(); moveBody(e.body, dt);
    const moved = Math.hypot(e.pos.x - before.x, e.pos.z - before.z) / dt;
    if (moved < spd * 0.2 && desired.lengthSq() > 0.1) { e.stuckT += dt; if (e.stuckT > 0.6) { e.stuckT = 0; e.side *= -1; e.slot = -e.slot; if (e.body.grounded && e.type !== "tank" && !isBoss(e) && e.type !== "bulwark") e.body.v.y = 8; } } else e.stuckT = 0;
    e.moving = moved;
  }
  if (face !== null) e.yaw = angLerp(e.yaw, face, Math.min(1, dt * (e.type === "bulwark" ? 2.2 : isBoss(e) ? 2 : 5)));
}
function fireAimedBolt(e, tgt, eye, aim, dist, T) {
  const dk = diffK(), lead = ((e.elite ? 0.25 : 0) + 0.45 * dk) * dist / T.boltSpd;
  const miss = (1.5 - 0.8 * dk) * (0.45 + dist / 22) * (e.elite ? 0.75 : 1);
  const aimP = aim.clone().addScaledVector(tgt.v || V(), lead).add(V(rand(-miss, miss), rand(-miss * 0.5, miss * 0.6), rand(-miss, miss)));
  hostBolt(eye, aimP.sub(eye).normalize(), T.boltSpd, T.bolt * e.dmgMul);
}
// boss: three phases. Phase 2 adds a sweeping laser (jump it or hide), phase 3 adds shockwave stomps.
// Siege Walker: twin cannon bursts and mortar volleys; phase 2 adds stomps, phase 3 adds the laser sweep.
function hostBossBrain(e, tgt, eye, aim, dist, canSee, dt) {
  const T = ETYPES[e.type], f = e.hp / e.maxHp, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3, walker = e.type === "walker";
  if (ph !== e.phase) { e.phase = ph; e.hazCd = 2; sendHazard({ k: "ph", id: e.id, n: ph }); }
  e.hazCd -= dt;
  if (ph >= 2 && e.hazCd <= 0) {
    e.hazK++; e.atk++;
    const sweep = walker ? (ph === 3 && e.hazK % 2 === 0) : (ph === 2 || e.hazK % 2 === 0);
    e.hazCd = ph === 3 ? 7 : 9;
    if (sweep) sendHazard({ k: "sw", id: e.id, a: r2(e.yaw), s: Math.random() < 0.5 ? 1 : -1, dm: Math.round(26 * e.dmgMul) });
    else sendHazard({ k: "st", id: e.id, dm: Math.round(30 * e.dmgMul) });
    e.cd = Math.max(e.cd, 2.5);
    return;
  }
  if (e.cd <= 0 && canSee && walker) {
    e.cd = T.fire * rand(0.8, 1.2) * (ph === 3 ? 0.7 : 1); e.atk++;
    if (e.cd2 <= 0) { e.cd2 = 5; for (let k = 0; k < 5 + ph * 2; k++) setTimeout(() => { if (enemies.has(e.id) && tgt) hostMortar(e, V(tgt.p.x + rand(-6, 6), tgt.p.y, tgt.p.z + rand(-6, 6)), T.mortar * e.dmgMul); }, k * 160); }
    else { const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      for (let k = 0; k < 6; k++) setTimeout(() => { if (!enemies.has(e.id) || !tgt) return; const s = k % 2 ? 1 : -1; const mz = V(e.pos.x + rx * s * 2.5 + fx * 4.7, e.pos.y + 5.1, e.pos.z + rz * s * 2.5 + fz * 4.7); const a = V(tgt.p.x, tgt.p.y + 1, tgt.p.z).addScaledVector(tgt.v || V(), 0.4).add(V(rand(-0.8, 0.8), rand(-0.3, 0.3), rand(-0.8, 0.8))); hostBolt(mz, a.sub(mz).normalize(), T.boltSpd, T.bolt * e.dmgMul); }, k * 110); }
  } else if (e.cd <= 0 && canSee) {
    e.cd = T.fire * rand(0.8, 1.2) * (ph === 3 ? 0.75 : 1); e.atk++;
    if (e.cd2 <= 0) { e.cd2 = 6; for (let k = 0; k < 4 + ph; k++) setTimeout(() => { if (enemies.has(e.id) && tgt) hostMortar(e, V(tgt.p.x + rand(-4, 4), tgt.p.y, tgt.p.z + rand(-4, 4)), T.mortar * e.dmgMul); }, k * 220); }
    else { const base = Math.atan2(aim.x - eye.x, aim.z - eye.z), n = 3 + ph; for (let k = -n; k <= n; k++) { const a = base + k * 0.085; const d = V(Math.sin(a), (aim.y - eye.y) / Math.max(1, dist), Math.cos(a)).normalize(); hostBolt(V(eye.x, eye.y + 0.3, eye.z), d, T.boltSpd, T.bolt * e.dmgMul); } }
  }
  if (!e.summoned && f < 0.5) { e.summoned = true; for (let k = 0; k < 4; k++) H.queue.push(walker ? (k < 2 ? "rusher" : "grunt") : (k < 2 ? "drone" : "rusher")); G.left += 4; }
}
function hostBolt(p, dir, spd, dmg, k = "b") { const id = H.nextId++; const v = dir.clone().multiplyScalar(spd); addProj(id, k, p.clone(), v, dmg, 0); netSend({ t: "pj", id, k, p: vArr(p), v: vArr(v) }); }
function hostMortar(e, target, dmg) {
  const p = chestOf(e); p.y += 1; const tf = clamp(p.distanceTo(target) / 14, 1.0, 2.2);
  target.y = groundAt(target.x, target.z, target.y + 0.5);
  const v = V((target.x - p.x) / tf, (target.y - p.y + 0.5 * GRAV * 0.5 * tf * tf) / tf, (target.z - p.z) / tf);
  const id = H.nextId++; addProj(id, "m", p, v, dmg, 3.6, target); netSend({ t: "pj", id, k: "m", p: vArr(p), v: vArr(v), tg: vArr(target) });
}
function addProj(id, k, p, v, dmg = 0, splash = 0, tg = null) {
  const mesh = new THREE.Mesh(k === "m" ? mortarGeo : boltGeo, k === "m" ? mortarMat : k === "s" ? snipeMat : k === "o" ? orbMat : boltMat); mesh.position.copy(p);
  if (k === "o") mesh.scale.setScalar(3.2);
  if (k === "b") mesh.scale.set(1, 1, 2.6); if (k === "s") mesh.scale.set(0.8, 0.8, 9);
  scene.add(mesh); const pj = { id, k, p, v, dmg, splash, mesh, life: 6 };
  if (tg) { pj.warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); pj.warn.position.set(tg.x, tg.y + 0.05, tg.z); pj.warn.scale.setScalar(3.6); scene.add(pj.warn); }
  eproj.set(id, pj);
  if (k === "b") SFX.bolt(distVol(p)); else if (k === "s") { SFX.snipe(distVol(p)); tracer(p, p.clone().addScaledVector(v, 0.6), 0xd080ff, 0.25); } else tone(160, 0.3, "sawtooth", 0.05 * distVol(p), 0.6);
}
function removeProj(pj, boom) {
  scene.remove(pj.mesh); if (pj.warn) scene.remove(pj.warn); eproj.delete(pj.id);
  if (boom) { if (pj.k === "m") explosion(pj.p, 3.6, 0xff9a2a); else spark(pj.p, pj.k === "s" || pj.k === "o" ? 0xd080ff : 0xff4040, pj.k === "o" ? 18 : 8, 4, 1, 0.3); }
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
function hostDamageEnemy(id, dmg, by, kb) {
  const e = enemies.get(id); if (!e || e.hp <= 0) return false;
  e.hp -= dmg; e.hpFrac = Math.max(0, e.hp / e.maxHp);
  e.model.userData.flashT = 0.07;
  if (kb && !isBoss(e) && !ETYPES[e.type].fly) { const m = e.type === "tank" || e.type === "bulwark" ? 0.4 : 1; e.body.v.x += kb[0] * m; e.body.v.z += kb[1] * m; e.body.v.y = 5 * m; e.body.grounded = false; e.stunT = 0.6; }
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
  const r = Math.random(), big = e.type === "tank" || e.type === "bulwark" || e.elite;
  if (isBoss(e)) { hostDrop("hp", e.pos); hostDrop("rage", e.pos.clone().add(V(3, 0, 0))); hostDrop("hp", e.pos.clone().add(V(-3, 0, 0))); const n = mode === "host" && mate.on ? 2 : 1; for (let i = 0; i < n; i++) hostChest(2, e.pos.clone().add(V(i * 4 - (n - 1) * 2, 0, 3)), true); }
  else if (r < (big ? 0.25 : 0.06)) hostDrop(["rage", "haste", "aegis"][Math.floor(Math.random() * 3)], e.pos);
  else if (r < (big ? 0.6 : 0.16)) hostDrop("hp", e.pos);
  else if (r < (big ? 0.8 : 0.22)) hostDrop("ammo", e.pos);
  G.left = Math.max(0, G.left - 1);
}
const waveScale = () => 1 + 0.15 * (Math.max(1, G.wave) - 1);
const estHp = e => e.maxHp || ETYPES[e.type].hp * (1 + 0.13 * (G.wave - 1)) * (mate.on ? 1.55 : 1) * (e.elite ? 1.8 : 1);
function rewardFor(type, elite) {
  const base = ETYPES[type].reward * (elite ? 2 : 1) * waveScale();
  me.combo = me.comboT > 0 ? me.combo + 1 : 1; me.comboT = COMBO_WIN; me.bestCombo = Math.max(me.bestCombo, me.combo);
  const mul = 1 + Math.min(me.combo - 1, 8) * 0.25;
  return Math.round(base * mul);
}
function onEnemyKilled(e, by) { // runs on both phones
  gainXp(ETYPES[e.type].reward * (e.elite ? 2 : 1));
  if (by === myIdx) {
    me.kills++; const r = rewardFor(e.type, e.elite); me.credits += r; me.ult = Math.min(1, me.ult + (isBoss(e) ? 0.3 : 0.025));
    hitMarker(true); SFX.kill(); dmgNum(chestOf(e).add(V(0, 0.8, 0)), "+" + r + " ⬢", false, "#ffb02e");
    if (isBoss(e)) feed(ENAMES[e.type].toUpperCase() + " DESTROYED +" + r + " ⬢", "#ffb02e"); else if (e.elite) feed("Elite " + ENAMES[e.type] + " down +" + r + " ⬢", "#ffb02e");
    if (ic("battery")) { me.battT = 3; }
    if (ic("volatile")) { const c = chestOf(e), R = 4 + ic("volatile") * 0.5, dmg = 0.4 * estHp(e) * (0.5 + 0.5 * ic("volatile"));
      later(0.05, () => { explosion(c, R * 0.8, 0xff9a2a); fxSend({ k: "boom", p: vArr(c), r: R * 0.8, c: 0xff9a2a }); enemies.forEach(o => { if (o !== e && !o.dying && chestOf(o).distanceTo(c) < R + ETYPES[o.type].r) hitEnemy(o, dmg, { at: chestOf(o), noProc: true, noCrit: true }); }); }); }
  }
  removeEnemyVisual(e, true);
}
function dropSpot(at) {
  const p = V(clamp(at.x, -HALF + 2, HALF - 2), 0, clamp(at.z, -HALF + 2, HALF - 2));
  let top = 0; for (const b of boxes) if (circleBox(p.x, p.z, 0.3, b) && b.y1 > top && b.y1 < 6.5) top = b.y1; p.y = top; return p;
}
function hostDrop(k, at) {
  const id = H.nextId++; const p = dropSpot(at);
  addPickup(id, k, p); netSend({ t: "pk", id, k, p: vArr(p) });
}
function addPickup(id, k, p) {
  const g = new THREE.Group(); g.position.copy(p);
  const pu = POWERUPS[k], col = pu ? pu.col : k === "hp" ? "#7dff8a" : "#2ef2ff";
  const geo = k === "hp" ? new THREE.OctahedronGeometry(0.35) : pu ? new THREE.IcosahedronGeometry(0.36, 0) : new THREE.TorusGeometry(0.26, 0.09, 8, 16);
  const m = new THREE.Mesh(geo, pickMat[k] || pickMat.ammo); m.position.y = 0.8; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  if (pu) { const s = labelSprite(pu.name, col); s.scale.set(1.6, 0.4, 1); s.position.y = 1.6; g.add(s); }
  scene.add(g); pickups.set(id, { id, k, pos: p, mesh: g, item: m, life: 30, asked: 0 });
}
function removePickup(id) { const pk = pickups.get(id); if (!pk) return; scene.remove(pk.mesh); pickups.delete(id); }

// ---- chests: bought with scrap, roll a random item (host decides what's inside)
const CHEST_KINDS = [{ name: "Supply crate", col: 0xd8e4f4, cost: 60, odds: [0.8, 0.19, 0.01] }, { name: "Large crate", col: 0x6dff8a, cost: 140, odds: [0, 0.8, 0.2] }, { name: "Legendary cache", col: 0xff3a3a, cost: 0, odds: [0, 0, 1] }];
const chestCost = (k, w) => Math.round(CHEST_KINDS[k].cost * (1 + 0.15 * (Math.max(1, w) - 1)));
function rollItem(odds) { const r = Math.random(); const t = r < odds[0] ? 0 : r < odds[0] + odds[1] ? 1 : 2; const l = itemsOfTier(t); return l[Math.floor(Math.random() * l.length)]; }
function freeChestSpot() {
  for (let tries = 0; tries < 60; tries++) {
    const x = rand(-HALF + 4, HALF - 4), z = rand(-HALF + 4, HALF - 4);
    if (Math.hypot(x, z) < 6) continue;
    if (portals.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) continue;
    if (boxes.some(b => b.y0 < 0.5 && circleBox(x, z, 1.6, b))) continue;
    if ([...chests.values()].some(c => Math.hypot(c.p.x - x, c.p.z - z) < 6)) continue;
    return V(x, 0, z);
  }
  return null;
}
function hostChest(k, at, free) {
  const p = at ? dropSpot(at) : freeChestSpot(); if (!p) return;
  const id = H.nextId++, cost = free ? 0 : chestCost(k, G.wave);
  addChest(id, k, p, cost); netSend({ t: "ch", id, k, p: vArr(p), c: cost });
}
function hostRefillChests() {
  const coop = mode === "host" && mate.on, want = [coop ? 6 : 4, coop ? 2 : 1];
  const have = [0, 0]; chests.forEach(c => { if (!c.open && c.k < 2) have[c.k]++; });
  for (let k = 0; k < 2; k++) for (let i = have[k]; i < want[k]; i++) hostChest(k);
}
function addChest(id, k, p, cost) {
  const K = CHEST_KINDS[k], g = new THREE.Group(); g.position.copy(p); g.rotation.y = rand(0, 6);
  const sz = k === 0 ? 1 : 1.35, glow = glowMat(K.col, 2.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3 * sz, 0.7 * sz, 0.85 * sz), k === 2 ? bossMetal : darkArmor); body.position.y = 0.35 * sz; body.castShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.34 * sz, 0.08 * sz, 0.89 * sz), glow); band.position.y = 0.55 * sz; g.add(band);
  const lid = new THREE.Group(); lid.position.set(0, 0.7 * sz, 0.42 * sz); g.add(lid);
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(1.3 * sz, 0.22 * sz, 0.85 * sz), k === 2 ? bossMetal : lightArmor); lidM.position.set(0, 0.11 * sz, -0.42 * sz); lid.add(lidM);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22 * sz, 0.22 * sz, 0.06), glow); lock.position.set(0, 0.5 * sz, -0.45 * sz); g.add(lock);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.35, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: K.col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3.4; g.add(beam);
  const label = labelSprite(cost ? "⬢ " + cost : "FREE", k === 2 ? "#ff6a6a" : "#ffb02e"); label.position.y = 1.7 * sz; label.scale.set(1.6, 0.4, 1); g.add(label);
  scene.add(g);
  const box = { x0: p.x - 0.6 * sz, x1: p.x + 0.6 * sz, y0: p.y, y1: p.y + 0.7 * sz, z0: p.z - 0.6 * sz, z1: p.z + 0.6 * sz }; boxes.push(box);
  chests.set(id, { id, k, p, cost, g, lid, beam, label, open: false, box, t: 0 });
}
function removeChest(c) { scene.remove(c.g); const i = boxes.indexOf(c.box); if (i >= 0) boxes.splice(i, 1); chests.delete(c.id); }
function chestOpened(id, who, it) { // both phones
  const c = chests.get(id); if (!c || c.open) return;
  c.open = true; c.t = 0; c.label.visible = false; c.beam.visible = false;
  spark(V(c.p.x, c.p.y + 1, c.p.z), CHEST_KINDS[c.k].col, 30, 5, 5, 0.8); tone(520, 0.15, "triangle", 0.08); setTimeout(() => tone(1040, 0.25, "triangle", 0.08), 120);
  if (who === myIdx) { me.credits -= c.cost; me.credits = Math.max(0, me.credits); giveItem(it); }
  else if (mate.on) feed(mate.name + " found " + ITEMS[it].name, TIERS[ITEMS[it].t].col);
}
function hostOpenChest(id, who) {
  const c = chests.get(id); if (!c || c.open) return;
  const it = rollItem(CHEST_KINDS[c.k].odds);
  netSend({ t: "co", id, who, it }); chestOpened(id, who, it);
}
function tryOpenChest(c) {
  if (c.open || me.downed || me.dead) return;
  if (me.credits < c.cost) { toast("Need ⬢ " + c.cost + " to open this", 1200); SFX.block(); return; }
  if (mode === "guest") { if (performance.now() - (c.asked || 0) > 800) { c.asked = performance.now(); netSend({ t: "op", id: c.id }); } }
  else hostOpenChest(c.id, myIdx);
}
function nearestChest() { let best = null, bd = 2.6; chests.forEach(c => { if (c.open) return; const d = Math.hypot(c.p.x - me.body.p.x, c.p.z - me.body.p.z); if (d < bd && Math.abs(c.p.y - me.body.p.y) < 2) { bd = d; best = c; } }); return best; }
function stepChests(dt) { chests.forEach(c => { if (c.open) { c.t += dt; c.lid.rotation.x = -Math.min(1.9, c.t * 6); if (c.t > 6) { c.g.scale.setScalar(Math.max(0.01, 1 - (c.t - 6) * 2)); if (c.t > 6.5) removeChest(c); } } else c.beam.material.opacity = 0.14 + Math.sin(performance.now() / 300 + c.id) * 0.06; }); }
// items
function giveItem(it, silent) {
  me.items[it] = (me.items[it] || 0) + 1; me.nItems++; recalc();
  if (it === "shield") me.shield = ST.shieldMax;
  if (!silent) { itemBanner(it); SFX.pick(); }
  renderItemBar();
}

// ===================================================================== boss hazards (every phone checks its own player)
const hazards = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function sendHazard(h) { netSend({ t: "hz", ...h }); startHazard(h); }
function startHazard(h) {
  if (h.k === "bi") { // boss entrance
    const titan = h.ty === "boss"; bigMsg(titan ? "THE TITAN" : "SIEGE WALKER", titan ? "Shoot the head · jump its laser and shockwaves" : "Hit the red dome on top · dodge the mortar rain", 3200);
    shake(0.9); SFX.ult(); if (titan) voice("vo_titan"); noise(2.5, 0.3, 200); tone(55, 2.2, "sawtooth", 0.12, 0.5);
    const e = enemies.get(h.id); if (e) { shockRing(e.pos, 22, 0xff2020, 1.2); explosion(V(e.pos.x, 2, e.pos.z), 5, 0xff2a2a); }
    return;
  }
  const e = enemies.get(h.id); if (!e) return;
  const nm = e.type === "walker" ? "WALKER" : "TITAN";
  if (h.k === "ph") { bigMsg(nm + (h.n === 2 ? " ENRAGED" : " OVERLOAD"), e.type === "walker" ? (h.n === 2 ? "Jump the shockwaves!" : "Jump the laser sweep or get behind cover") : (h.n === 2 ? "Jump the laser sweep or get behind cover" : "Jump the shockwaves!"), 2600); shake(0.5); SFX.ult(); return; }
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
  const at = V(b.x, b.y + 0.7, b.z), R = 5.5;
  explosion(at, 5, 0xff6a20); puff(at, 10, 1.5, 0.3);
  if (mode !== "guest") enemies.forEach(e => { const d = chestOf(e).distanceTo(at); if (d < R) hostDamageEnemy(e.id, 220 * (1 - d / (R * 1.3)), by); });
  const c = V(me.body.p.x, me.body.p.y + 0.9, me.body.p.z), d = c.distanceTo(at);
  if (d < R && !me.downed && !me.dead) { takeDamage(35 * (1 - d / R), at); me.body.v.addScaledVector(c.clone().sub(at).normalize(), 10 * (1 - d / R)); me.body.v.y += 5; me.body.grounded = false; }
}
function resetBarrels() { barrels.forEach(b => setBarrel(b, true)); }

// ===================================================================== waves (host)
function waveComposition(w, coop) {
  const list = [];
  if (w % 5 === 0) { list.push((w / 5) % 2 === 1 ? "boss" : "walker"); if (w >= 20) list.push((w / 5) % 2 === 1 ? "walker" : "boss"); for (let i = 0; i < 4 + w / 5 * 2; i++) list.push(["grunt", "leaper", "grunt", "sniper", "zapper"][i % 5]); return list; }
  const n = Math.round((4.5 + w * 2.35) * (coop ? 1.35 : 1));
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (w >= 4 && r < 0.07 + w * 0.005) list.push("tank");
    else if (w >= 3 && r < 0.15 + w * 0.005) list.push("bulwark");
    else if (w >= 4 && r < 0.25) list.push("zapper");
    else if (w >= 2 && r < 0.35) list.push("sniper");
    else if (w >= 2 && r < 0.46) list.push("leaper");
    else if (w >= 2 && r < 0.55) list.push("rusher");
    else if (r < 0.65) list.push("drone"); // about 1 in 10: mostly ground robots
    else list.push("grunt");
  }
  return list.sort(() => Math.random() - 0.5);
}
function hostStartWave() {
  G.wave++; G.ph = "wave"; G.bonus = 0;
  H.queue = waveComposition(G.wave, mode === "host" && mate.on);
  G.left = H.queue.length; H.spawnT = 1.5; H.maxAlive = Math.min(7 + G.wave, 20);
  resetBarrels(); netSend({ t: "bb" });
  hostSendGm();
}
const bothReady = () => me.ready && (!(mode === "host" && mate.on) || mate.ready);
function hostTick(dt) {
  if (G.ph === "count") { G.tm -= dt; if (G.tm <= 0) hostStartWave(); }
  else if (G.ph === "wave") {
    H.spawnT -= dt;
    if (H.queue.length && H.spawnT <= 0 && enemies.size < H.maxAlive) { H.spawnT = Math.max(0.4, 1.25 - G.wave * 0.04); hostSpawnEnemy(H.queue.shift()); }
    if (!H.queue.length && enemies.size === 0) { G.ph = "break"; G.tm = 0; G.bonus = Math.round((100 + G.wave * 15) * waveScale()); hostSendGm(); hostRefillChests(); }
    const boss = [...enemies.values()].find(isBoss); G.bossFrac = boss ? boss.hpFrac : -1; G.bossTy = boss ? boss.type : "";
    const meOut = me.downed || me.dead, mateOut = !(mode === "host" && mate.on) || mate.downed || mate.dead;
    if (meOut && mateOut) { G.ph = "over"; hostSendGm(); }
  } else if (G.ph === "break") { if (bothReady()) { G.ph = "count"; G.tm = (G.wave + 1) % 5 === 0 ? 5.5 : 3; hostSendGm(); } }
  enemies.forEach(e => hostStepEnemy(e, dt));
  pickups.forEach(pk => { pk.life -= dt; if (pk.life <= 0) { removePickup(pk.id); netSend({ t: "pr", id: pk.id }); } });
}
function hostSendGm() { G.seq++; applyGm({ ...G }); netSend({ t: "gm", ...G }); }
function clearWorld() {
  enemies.forEach(e => removeEnemyVisual(e, false)); corpses.splice(0).forEach(e => disposeModel(e.model));
  eproj.forEach(p => removeProj(p, false)); [...pickups.keys()].forEach(removePickup); [...chests.values()].forEach(removeChest);
  rockets.splice(0).forEach(r => scene.remove(r.mesh)); clearHazards(); [...lasers.keys()].forEach(stopLaser); resetBarrels(); delayed.length = 0;
  me.mines = [];
}
function hostResetGame() {
  clearWorld();
  H.queue = []; Object.assign(G, { ph: "count", wave: 0, tm: 5, left: 0, bossFrac: -1, bossTy: "", bonus: 0 });
  netSend({ t: "cfg", ...arenaCfg }); netSend({ t: "reset" }); localReset(); hostSendGm(); hostRefillChests();
}
function localReset() {
  clearWorld();
  resetMe(true); spawnMe(); lastPh = null; showScreen(null); $("feed").innerHTML = ""; renderItemBar(); setupAbilityButtons();
}

// phase changes, on both phones
let lastPh = null;
// ---- cinematics: boss entrance before a boss wave, boss destroyed after it, looping title screen
const CINE = { titan: ["cin_titan", "THE TITAN", "Hit the head · jump the shockwaves"], walker: ["cin_walker", "SIEGE WALKER", "Shoot the red dome · dodge the mortars"], down: ["cin_down", "BOSS DESTROYED", "Grab the legendary cache"] };
let cineT = 0;
function playCine(k, ms = 5200) {
  const c = CINE[k]; if (!c || qs.get("nocine")) return;
  const el = $("cine"), v = $("cineVid");
  el.querySelector("b").textContent = c[1]; el.querySelector("span").textContent = c[2];
  // restart the text animation
  el.querySelectorAll("#cineTxt b,#cineTxt span").forEach(n => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
  v.poster = "assets/" + c[0] + ".jpg"; v.src = "assets/" + c[0] + ".mp4"; v.currentTime = 0;
  el.classList.add("on"); requestAnimationFrame(() => el.classList.add("vis"));
  v.play().catch(() => {});
  if (k === "down") { SFX.boom(1); shake(0.4); } else { voice("vo_titan"); SFX.boom(0.7); }
  clearTimeout(cineT); cineT = setTimeout(stopCine, ms);
}
function stopCine() { const el = $("cine"); if (!el.classList.contains("on")) return; el.classList.remove("vis"); clearTimeout(cineT); setTimeout(() => { el.classList.remove("on"); $("cineVid").pause(); }, 350); }
$("cine").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); stopCine(); });
{ const mv = $("menuVid"); mv.src = "assets/cin_title.mp4"; const tryPlay = () => { if ($("sMenu").classList.contains("on")) mv.play().catch(() => {}); else mv.pause(); }; setInterval(tryPlay, 1000); addEventListener("pointerdown", tryPlay, { once: true }); }
function applyGm(g) {
  const prev = lastPh; Object.assign(G, g); lastPh = G.ph;
  MUS.level = G.ph === "wave" ? (G.wave % 5 === 0 ? 3 : 2) : G.ph === "over" ? 0 : 1;
  if (prev === G.ph) return;
  if ((prev === null || prev === "connecting" || prev === "menu") && G.ph !== "over") showScreen(null);
  if (G.ph === "count") { if ($("shop").classList.contains("on")) showScreen(null); const nw = G.wave + 1; if (nw % 5 === 0) playCine((nw / 5) % 2 === 1 ? "titan" : "walker"); else if (G.wave > 0) bigMsg("GET READY", "Wave " + (G.wave + 1) + " incoming", 2000); }
  if (G.ph === "wave") stopCine();
  if (G.ph === "break" && G.wave % 5 === 0 && G.wave > 0) playCine("down", 4800);
  if (G.ph === "wave") {
    me.ready = false; me.phoenixUsed = 0; me.offers = null; me.bought = false;
    SFX.wave(); if (G.wave % 5 !== 0) setTimeout(() => voice("vo_wave"), 300);
    bigMsg(G.wave % 5 === 0 ? "BOSS WAVE " + G.wave : "WAVE " + G.wave, G.wave % 5 === 0 ? "Something huge is coming" : G.wave === 2 ? "Snipers: break their red laser · Leapers pounce, keep moving" : G.wave === 3 ? "Bulwarks: aim for the head or flank them" : G.wave === 4 ? "Arc Troopers fire slow plasma orbs: sidestep them" : G.wave === 6 ? "Elite robots glow gold" : "", 2400);
    if ($("shop").classList.contains("on")) showScreen(null);
  }
  if (G.ph === "break") {
    me.ready = false;
    SFX.clear(); setTimeout(() => voice("vo_clear"), 200); me.credits += G.bonus;
    if (me.downed || me.dead) { resetMe(false); SFX.revive(); }
    else me.hp = Math.min(maxHp(), me.hp + maxHp() * 0.3);
    bigMsg("WAVE " + G.wave + " CLEARED", "+" + G.bonus + " ⬢  ·  open crates, visit the Armory, then READY", 3200);
    const b = +(store("it-best") || 0); if (G.wave > b) store("it-best", G.wave);
  }
  if (G.ph === "over") setTimeout(showOver, 1200);
}

// ===================================================================== local player
const input = { mx: 0, my: 0, lookX: 0, lookY: 0, fire: false, jump: false, dash: false, nade: false, ult: false, use: false };
const buff = k => (me.buffs[k] || 0) > 0;
function takeDamage(n, from) {
  if (me.downed || me.dead || G.ph === "over") return;
  if (me.dashT > 0) return; // dash i-frames
  if (ST.block > 0 && Math.random() < ST.block) { dmgNum(V(me.body.p.x, me.body.p.y + 2, me.body.p.z), "BLOCKED", false, "#e8eef8"); SFX.block(); return; }
  n = n * (me.odT > 0 ? 0.5 : 1) * (me.skinT > 0 ? 0.25 : 1) * (buff("aegis") ? 0.5 : 1);
  me.sinceHurt = 0;
  if (me.shield > 0) { const a = Math.min(me.shield, n); me.shield -= a; n -= a; }
  n = Math.round(n); if (n <= 0) { SFX.block(); return; }
  me.hp -= n; me.hurtT = 0.35; SFX.hurt(); shake(clamp(n / 60, 0.1, 0.5));
  if (from) dmgIndicator(from);
  if (me.hp <= 0) {
    if (ic("phoenix") > me.phoenixUsed) { // rise from the ashes
      me.phoenixUsed++; me.hp = Math.round(maxHp() * 0.5); const c = V(me.body.p.x, me.body.p.y + 1, me.body.p.z);
      explosion(c, 6, 0xff7a1a); shockRing(me.body.p, 8, 0xffb02e, 0.8); fxSend({ k: "boom", p: vArr(c), r: 6, c: 0xff7a1a });
      enemies.forEach(e => { if (chestOf(e).distanceTo(c) < 8) hitEnemy(e, 150 * ST.dmg, { at: chestOf(e), noProc: true }); });
      bigMsg("PHOENIX", "Back from the brink", 1500); return;
    }
    me.hp = 0; me.downed = true; me.bleed = BLEED_TIME; me.revive = 0; me.odT = 0; me.skinT = 0; me.cloakT = 0; SFX.down(); feed("You are down!", "#ff2e88");
  }
}
function stepMe(dt) {
  const b = me.body, s = S();
  me.padCd -= dt; me.hurtT = Math.max(0, me.hurtT - dt); me.secCd -= dt; me.utlCd -= dt; me.dashT -= dt; me.sinceHurt += dt; me.battT -= dt;
  for (const k in me.buffs) if (me.buffs[k] > 0) { me.buffs[k] -= dt; if (me.buffs[k] <= 0) feed(POWERUPS[k].name + " ended", POWERUPS[k].col); }
  if (me.comboT > 0) { me.comboT -= dt; if (me.comboT <= 0) me.combo = 0; }
  if (me.odT > 0) { me.odT -= dt; if (me.odT <= 0) feed("Overdrive ended", "#ffb02e"); }
  if (me.skinT > 0) { me.skinT -= dt; if (!me.downed) me.hp = Math.min(maxHp(), me.hp + maxHp() * 0.04 * dt); }
  if (me.cloakT > 0) { me.cloakT -= dt; if (me.cloakT <= 0) uncloak(); }
  if (me.dead) return;
  if (me.downed) {
    b.v.x *= 0.8; b.v.z *= 0.8; moveBody(b, dt);
    me.bleed -= dt;
    const near = mate.on && !mate.downed && !mate.dead && mate.pos.distanceTo(b.p) < REVIVE_DIST;
    if (near) { me.revive += dt; if (me.revive >= REVIVE_TIME) { me.downed = false; me.hp = Math.round(maxHp() * 0.5); me.revive = 0; SFX.revive(); feed("Revived by " + mate.name, "#7dff8a"); } }
    else me.revive = Math.max(0, me.revive - dt * 0.5);
    if (me.bleed <= 0 && me.downed) { me.downed = false; me.dead = true; feed("You bled out. Back next wave.", "#ff2e88"); }
    input.dash = input.nade = input.ult = input.use = false;
    return;
  }
  // regen + shield recharge
  if (ST.regen || buff("aegis")) me.hp = Math.min(maxHp(), me.hp + (ST.regen + (buff("aegis") ? 4 : 0)) * dt);
  if (ST.shieldMax && me.sinceHurt > 4) me.shield = Math.min(ST.shieldMax, me.shield + ST.shieldMax * dt);
  // look
  me.yaw -= input.lookX; me.pitch = clamp(me.pitch - input.lookY, -1.2, 0.9); input.lookX = input.lookY = 0;
  // move relative to camera yaw
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  let wx = Math.cos(me.yaw) * input.mx + fx * -input.my, wz = -Math.sin(me.yaw) * input.mx + fz * -input.my; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const spd = P_SPEED * ST.speed * (me.odT > 0 ? 1.15 : 1) * (me.cloakT > 0 ? 1.3 : 1) * (buff("haste") ? 1.4 : 1), k = Math.min(1, dt * (b.grounded ? 12 : 3));
  if (me.dashT > 0) { b.v.x = me.dashDir.x * 24; b.v.z = me.dashDir.z * 24; spark(V(b.p.x, b.p.y + rand(0.4, 1.6), b.p.z), s.color, 2, 0.5, 0, 0.35); }
  else { b.v.x = lerp(b.v.x, wx * spd, k); b.v.z = lerp(b.v.z, wz * spd, k); }
  if (b.grounded) me.jumps = ST.jumps;
  if (input.jump) {
    if (b.grounded) { b.v.y = JUMPV; b.grounded = false; }
    else if (me.jumps > 0) { me.jumps--; b.v.y = JUMPV * 0.95; spark(V(b.p.x, b.p.y + 0.2, b.p.z), 0x7dff8a, 12, 3, -2, 0.4); SFX.dash(); }
  }
  input.jump = false;
  // jump pads
  if (b.grounded && me.padCd <= 0) for (const p of pads) if (Math.hypot(b.p.x - p.x, b.p.z - p.z) < 1.1 && Math.abs(b.p.y - p.y) < 0.3) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1; b.v.y = 15.5; b.v.x = dx / d * 5.2; b.v.z = dz / d * 5.2; b.grounded = false; me.padCd = 0.5; SFX.pad(); spark(V(p.x, p.y + 0.2, p.z), 0x7dff8a, 20, 4, 6, 0.6);
  }
  const wasAir = !b.grounded, vy = b.v.y;
  moveBody(b, dt);
  if (me.slam && b.grounded && wasAir) { me.slam = false; slamDown(vy); }
  // abilities: secondary (nade button), utility (dash button), special (ult button)
  if (input.nade && me.secCd <= 0) { if (useSecondary()) me.secCd = s.sec.cd * ST.cdMul; }
  input.nade = false;
  if (input.dash && me.utlCd <= 0) { if (useUtility(wx, wz)) me.utlCd = s.utl.cd * ST.cdMul; }
  input.dash = false;
  if (input.ult && me.ult >= 1 && me.odT <= 0 && me.skinT <= 0) { me.ult = 0; useSpecial(); }
  input.ult = false;
  // primary
  me.cd -= dt;
  if (input.fire && me.cd <= 0 && G.ph !== "over") fireWeapon();
  // storm crown
  if (ic("storm")) { me.stormT -= dt; if (me.stormT <= 0) { me.stormT = 3; stormStrike(); } }
  // pickups
  pickups.forEach(pk => {
    if (Math.hypot(pk.pos.x - b.p.x, pk.pos.z - b.p.z) < 1.2 && Math.abs(pk.pos.y - b.p.y) < 1.5) {
      if (mode === "guest") { if (performance.now() - pk.asked > 600) { pk.asked = performance.now(); netSend({ t: "grab", id: pk.id }); } }
      else { removePickup(pk.id); netSend({ t: "got", id: pk.id, who: myIdx }); applyPickup(pk.k); }
    }
  });
  // chests
  if (input.use) { const c = nearestChest(); if (c) tryOpenChest(c); }
  input.use = false;
}
function applyPickup(k) {
  SFX.pick();
  if (k === "hp") { me.hp = Math.min(maxHp(), me.hp + 35 + maxHp() * 0.1); feed("+health", "#7dff8a"); }
  else if (POWERUPS[k]) { me.buffs[k] = PU_TIME; bigMsg(POWERUPS[k].name, POWERUPS[k].desc + " · " + PU_TIME + "s", 1300); feed(POWERUPS[k].name + "! " + POWERUPS[k].desc, POWERUPS[k].col); shockRing(me.body.p, 3, new THREE.Color(POWERUPS[k].col).getHex(), 0.5); }
  else { me.secCd = 0; me.utlCd = 0; me.ult = Math.min(1, me.ult + 0.1); feed("Abilities recharged", "#2ef2ff"); }
}
// ---------------------------------------------------------------- abilities
function useSecondary() {
  const s = mySurv;
  if (s === "vanguard") { throwProj("g", 17, 4.5, 190); return true; }
  if (s === "demo") { throwProj("c", 18, 4, 0); return true; }
  if (s === "marksman") { if (me.mines.filter(m => rockets.includes(m)).length >= 3) { toast("3 mines out already", 900); return false; } const m = throwProj("m", 14, 3, 150); me.mines.push(m); return true; }
  if (s === "breacher") { concussion(); return true; }
}
function useUtility(wx, wz) {
  const s = mySurv, b = me.body, fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  if (s === "vanguard") { const l = Math.hypot(wx, wz); me.dashDir.set(l > 0.2 ? wx / l : fx, 0, l > 0.2 ? wz / l : fz); me.dashT = 0.2; SFX.dash(); spark(V(b.p.x, b.p.y + 1, b.p.z), S().color, 14, 3, 0.5, 0.4); return true; }
  if (s === "breacher") { b.v.y = 17; b.v.x += fx * 7; b.v.z += fz * 7; b.grounded = false; me.slam = true; SFX.ult(); explosion(V(b.p.x, b.p.y + 0.2, b.p.z), 1.6, 0xffb02e); fxSend({ k: "boom", p: vArr(b.p), r: 1.6, c: 0xffb02e }); return true; }
  if (s === "marksman") { me.cloakT = CLOAK_TIME; me.cloakCrit = true; setCloak(me.model, true); SFX.dash(); puff(V(b.p.x, b.p.y + 1, b.p.z), 6, 0.8, 0.5); feed("Cloaked: robots lost you", "#b6ff2e"); return true; }
  if (s === "demo") {
    const at = V(b.p.x, b.p.y + 0.3, b.p.z); explosion(at, 3.5, 0xff2e88); fxSend({ k: "boom", p: vArr(at), r: 3.5, c: 0xff2e88 });
    enemies.forEach(e => { const c = chestOf(e); if (c.distanceTo(at) < 4.5 + ETYPES[e.type].r) hitEnemy(e, 60 * ST.dmg, { at: c, proc: 0.5 }); });
    const l = Math.hypot(wx, wz); b.v.y = 15; b.v.x = (l > 0.2 ? wx / l : fx) * 11; b.v.z = (l > 0.2 ? wz / l : fz) * 11; b.grounded = false; return true;
  }
}
function useSpecial() {
  const s = mySurv, b = me.body, c = V(b.p.x, b.p.y + 1, b.p.z);
  SFX.ult(); shake(0.4);
  if (s === "vanguard") { me.odT = OD_TIME; bigMsg("OVERDRIVE", "Double damage · faster fire", 1500); explosion(c, 2.5, 0xffb02e); }
  if (s === "breacher") { me.skinT = SKIN_TIME; bigMsg("IRON SKIN", "75% less damage · healing", 1500); shockRing(b.p, 4, 0x8ab4ff, 0.6); spark(c, 0x8ab4ff, 30, 5, 2, 0.6); }
  if (s === "marksman") { bigMsg("LANCE", "", 900); for (let i = 0; i < 3; i++) later(0.15 + i * 0.38, () => { if (!me.downed && !me.dead) fireLance(); }); }
  if (s === "demo") { bigMsg("MISSILE BARRAGE", "", 1000); const tg = targetsNearAim(12); for (let i = 0; i < 12; i++) later(i * 0.09, () => { if (me.downed || me.dead) return; const t = tg.length ? tg[i % tg.length] : null; launchMissile(t, 90, 0.2); }); }
}
function uncloak() { me.cloakT = 0; if (me.model) setCloak(me.model, false); }
function concussion() {
  const b = me.body, at = V(b.p.x, b.p.y + 1, b.p.z), fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  SFX.boom(0.7); shake(0.3); camKick += 1;
  for (let i = 0; i < 26; i++) { const a = me.yaw + rand(-0.5, 0.5), d = rand(1, 8); spark(V(at.x - Math.sin(a) * d, at.y + rand(-0.5, 0.8), at.z - Math.cos(a) * d), 0xffb02e, 1, 2, 0.5, 0.35); }
  shockRing(V(at.x + fx * 3, b.p.y, at.z + fz * 3), 4, 0xffb02e, 0.35);
  fxSend({ k: "cone", p: vArr(at), y: r2(me.yaw) });
  let hit = false;
  enemies.forEach(e => { if (e.spawnT > 0 || e.dying) return; const c = chestOf(e), dx = c.x - at.x, dz = c.z - at.z, d = Math.hypot(dx, dz); if (d > 9 + ETYPES[e.type].r) return; if ((dx * fx + dz * fz) / (d || 1) < 0.5 && d > 1.6) return; hit = true; hitEnemy(e, 70 * ST.dmg, { at: c, proc: 1, kb: [dx / (d || 1) * 16, dz / (d || 1) * 16] }); });
  if (hit) hitMarker(false);
  b.v.x -= fx * 4; b.v.z -= fz * 4;
}
function slamDown(vy) {
  const at = V(me.body.p.x, me.body.p.y + 0.2, me.body.p.z), R = 5.5;
  explosion(at, 4.5, 0xffb02e); shockRing(me.body.p, 7, 0xffb02e, 0.6); shake(0.6); fxSend({ k: "boom", p: vArr(at), r: 4.5, c: 0xffb02e });
  enemies.forEach(e => { const c = chestOf(e); const d = Math.hypot(c.x - at.x, c.z - at.z); if (d < R + ETYPES[e.type].r && Math.abs(c.y - at.y) < 4) hitEnemy(e, 90 * ST.dmg, { at: c, proc: 1, kb: [(c.x - at.x) / (d || 1) * 10, (c.z - at.z) / (d || 1) * 10] }); });
}
function targetsNearAim(n) {
  const o = camera.position, d = V(0, 0, -1).applyQuaternion(camera.quaternion), list = [];
  enemies.forEach(e => { if (e.spawnT > 0 || e.dying) return; const c = chestOf(e), to = c.clone().sub(o), dist = to.length(); to.normalize(); list.push([Math.acos(clamp(to.dot(d), -1, 1)) + dist * 0.01, e]); });
  return list.sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1].id);
}
function stormStrike() {
  const list = []; enemies.forEach(e => { if (e.spawnT > 0 || e.dying) return; const d = e.pos.distanceTo(me.body.p); if (d < 22) list.push([d, e]); });
  list.sort((a, b) => a[0] - b[0]).slice(0, 1 + ic("storm")).forEach(([, e]) => {
    const c = chestOf(e); lightning(V(c.x + rand(-2, 2), c.y + 24, c.z + rand(-2, 2)), c, 0xbfe0ff, 6); fxSend({ k: "zap", pts: [vArr(V(c.x, c.y + 24, c.z)), vArr(c)], c: 0xbfe0ff });
    hitEnemy(e, 65 * ST.dmg, { at: c, proc: 0.5, noProc: true }); flash.position.copy(c); flash.color.set(0xbfe0ff); flash.intensity = 50; flashT = 0.2;
  });
  if (list.length) { noise(0.4, 0.18, 4000, "highpass"); tone(80, 0.5, "sawtooth", 0.08, 0.5); }
}
// jagged lightning made of short tracers
function lightning(a, b, color, segs = 5) {
  let p = a.clone(); for (let i = 1; i <= segs; i++) { const q = a.clone().lerp(b, i / segs); if (i < segs) q.add(V(rand(-0.7, 0.7), rand(-0.4, 0.4), rand(-0.7, 0.7))); tracer(p, q, color, 0.18); p = q; }
  spark(b, color, 8, 4, 1, 0.3);
}
// ---------------------------------------------------------------- damage + on-hit item effects
function dealDamage(e, dmg, crit, at, kb) {
  me.dmgDone += dmg; me.ult = Math.min(1, me.ult + dmg / 2200);
  dmgNum(at, Math.round(dmg), crit);
  if (mode === "guest") { netSend({ t: "hit", id: e.id, d: Math.round(dmg), kb: kb ? [r2(kb[0]), r2(kb[1])] : undefined }); e.model.userData.flashT = 0.07; return false; }
  return hostDamageEnemy(e.id, dmg, myIdx, kb);
}
// base -> final damage with crits, buffs and items. opts: {at, crit (weak point), proc, kb, noProc, noCrit, forceCrit}
function hitEnemy(e, base, o = {}) {
  if (!e || e.dying || !enemies.has(e.id)) return false;
  let dmg = base * (me.odT > 0 ? 2 : 1) * (buff("rage") ? 2 : 1);
  if (ic("opener") && e.hpFrac > 0.9) dmg *= 1 + 0.75 * ic("opener");
  let crit = false;
  if (!o.noCrit) { const roll = o.forceCrit || Math.random() < ST.crit; if (o.crit && roll) { dmg *= ST.critMul * 1.5; crit = true; } else if (o.crit || roll) { dmg *= ST.critMul; crit = true; } }
  if (crit) me.crits++;
  const at = o.at || chestOf(e);
  const killed = dealDamage(e, dmg, crit, at, o.kb);
  if (!o.noProc) onHitProcs(e, dmg, o.proc ?? 1, at);
  return killed;
}
function onHitProcs(e, dmg, proc, at) {
  if (ic("leech")) me.hp = Math.min(maxHp(), me.hp + 2 * ic("leech") * proc);
  if (ic("arc") && Math.random() < 0.2 * proc) {
    const targets = []; enemies.forEach(o => { if (o !== e && !o.dying && o.spawnT <= 0 && o.pos.distanceTo(e.pos) < 13) targets.push(o); });
    targets.sort((a, b) => a.pos.distanceTo(e.pos) - b.pos.distanceTo(e.pos)).slice(0, 1 + 2 * ic("arc")).reduce((from, o) => { const c = chestOf(o); lightning(from, c, 0x7ae8ff, 4); fxSend({ k: "zap", pts: [vArr(from), vArr(c)], c: 0x7ae8ff }); hitEnemy(o, dmg * 0.8, { at: c, noProc: true, noCrit: true }); return c; }, at.clone());
    tone(1600, 0.1, "sawtooth", 0.03, 0.4);
  }
  if (ic("pod") && Math.random() < 0.1 * proc) launchMissile(e.id, dmg * 3 * ic("pod"), 0);
  if (ic("seeker") && Math.random() < 0.15 * proc) for (let i = 0; i < 3 * ic("seeker"); i++) later(i * 0.07, () => launchMissile(e.id, dmg * 1.5, 0));
}
// ---------------------------------------------------------------- camera + aiming
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
  fovKick = lerp(fovKick, me.dashT > 0 ? 9 : me.odT > 0 || buff("haste") ? 4 : 0, Math.min(1, dt * 10));
  if (Math.abs(camera.fov - baseFov - fovKick) > 0.05) { camera.fov = baseFov + fovKick; camera.updateProjectionMatrix(); }
  if (window.__camO) { camera.position.copy(window.__camO[0]); camera.lookAt(window.__camO[1]); }
  sun.position.copy(target).add(sunOff); sun.target.position.copy(target);
  if (nightLight.intensity > 0) nightLight.position.set(target.x, target.y + 3, target.z);
}
// aim assist (touch): while firing, the camera is gently pulled onto the robot nearest the crosshair
function aimAssist(dt) {
  if (!COARSE || !input.fire || me.downed || me.dead) return;
  const o = camera.position, d = V(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null, bestA = 0.22;
  enemies.forEach(e => { if (e.spawnT > 0 || e.hp <= 0) return; const c = chestOf(e); const to = c.clone().sub(o); const dist = to.length(); if (dist > 60) return; to.normalize(); const a = Math.acos(clamp(to.dot(d), -1, 1)); if (a < bestA && los(o, c)) { best = c; bestA = a; } });
  if (!best) return;
  const t = best.clone().sub(camPivot).normalize(), k = Math.min(1, dt * 7);
  me.yaw = angLerp(me.yaw, Math.atan2(-t.x, -t.z), k * 0.6);
  me.pitch = lerp(me.pitch, clamp(Math.asin(t.y), -1.2, 1.2), k * 0.35);
}
function computeAim(spread = 0) {
  const o = camera.position.clone();
  const d = V(0, 0, -1).applyQuaternion(camera.quaternion);
  if (spread) { d.x += rand(-spread, spread); d.y += rand(-spread, spread); d.z += rand(-spread, spread); d.normalize(); }
  // aim assist on touch: snap toward a robot close to the crosshair
  if (COARSE && !spread) {
    let best = null, bestA = 0.09;
    enemies.forEach(e => { if (e.spawnT > 0) return; const c = chestOf(e); const to = c.clone().sub(o); const dist = to.length(); to.normalize(); const a = Math.acos(clamp(to.dot(d), -1, 1)); const lim = bestA * (1 + 6 / Math.max(6, dist)); if (a < lim && los(o, c)) { best = to; bestA = a; } });
    if (best) d.copy(best);
  }
  const skip = o.distanceTo(camPivot) + 0.3; // ignore stuff between camera and the player
  const start = o.clone().addScaledVector(d, skip);
  let t = rayWorld(start, d, 250);
  enemies.forEach(e => { const te = rayEnemy(start, d, e); if (te < t) t = te; });
  if (t === Infinity) t = 120;
  return start.addScaledVector(d, t);
}
// ---------------------------------------------------------------- primary weapons
function fireRate() { return ST.atk * (me.odT > 0 ? 1.5 : 1) * (buff("haste") ? 1.4 : 1) * (me.battT > 0 ? 1 + 0.35 * ic("battery") : 1); }
function fireWeapon(echo) {
  const W = S().weapon;
  if (!echo) { me.cd = 1 / (W.rate * fireRate()); if (ic("echo")) for (let i = 0; i < ic("echo"); i++) later(0.07 * (i + 1), () => { if (!me.downed && !me.dead) fireWeapon(true); }); }
  const forceCrit = me.cloakCrit; if (me.cloakT > 0 || me.cloakCrit) { me.cloakCrit = false; if (me.cloakT > 0) uncloak(); }
  const muzzle = V(); me.model.userData.muzzle.getWorldPosition(muzzle);
  me.model.userData.flashT = 0.05; me.model.userData.recoil = W.launcher || W.pierce ? 1 : W.pellets > 1 ? 0.8 : 0.35;
  SFX[S().gun]();
  camKick += W.launcher || W.pierce ? 0.8 : W.pellets > 1 ? 0.8 : 0.25;
  const col = me.odT > 0 ? 0xffc040 : buff("rage") ? 0xff3a3a : W.color;
  if (W.launcher) {
    const target = computeAim(); const dir = target.sub(muzzle).normalize();
    spawnProj("l", muzzle, dir.multiplyScalar(38).add(V(0, 1.2, 0)), true, W.dmg * ST.dmg, { forceCrit });
    return;
  }
  hitscan(muzzle, W, W.dmg * ST.dmg, col, forceCrit, W.pierce ? 0.35 : 0.06);
}
function hitscan(muzzle, W, base, col, forceCrit, life) {
  let hitAny = false, killed = false, critAny = false, blocked = false;
  for (let k = 0; k < W.pellets; k++) {
    const target = computeAim(W.spread);
    const dir = target.clone().sub(muzzle); const maxT = dir.length(); dir.normalize();
    let wallT = rayWorld(muzzle, dir, maxT + 0.01);
    const [bt, bb] = rayBarrel(muzzle, dir);
    const hits = [];
    enemies.forEach(e => { if (e.spawnT > 0 || e.dying) return; const r = rayEnemyX(muzzle, dir, e); if (r.t < Math.min(wallT, bt) && r.t <= maxT + 1) hits.push([r.t, e, r.crit]); });
    hits.sort((a, b) => a[0] - b[0]);
    const used = W.pierce ? hits : hits.slice(0, 1);
    let end = wallT !== Infinity ? muzzle.clone().addScaledVector(dir, wallT) : target;
    if (bb && bt <= wallT + 0.7 && (!used.length || W.pierce || bt < used[0][0])) { end = muzzle.clone().addScaledVector(dir, bt); hitBarrel(bb, myIdx); }
    if (!W.pierce && used.length) end = muzzle.clone().addScaledVector(dir, used[0][0]);
    for (const [t, e, head] of used) {
      const hp = muzzle.clone().addScaledVector(dir, t);
      if (shielded(e, muzzle, head)) { blocked = true; spark(hp, 0x4aa8ff, 6, 4, 1, 0.3); if (!W.pierce) break; continue; }
      hitAny = true; const before = me.crits;
      if (hitEnemy(e, base, { at: hp, crit: head, proc: W.proc, forceCrit })) killed = true;
      if (me.crits > before) critAny = true;
      spark(hp, critAny ? 0xfff07a : 0xffd27a, critAny ? 10 : 6, 5, 1, 0.3);
    }
    if (!used.length && wallT !== Infinity) spark(end, W.color, 4, 3, 1, 0.25);
    tracer(muzzle, end, col, life);
    if (k < 3) netSend({ t: "tr", a: vArr(muzzle), b: vArr(end), c: col, l: life });
  }
  if (hitAny && !killed) { hitMarker(false, critAny); critAny ? SFX.crit() : SFX.hit(); }
  else if (blocked && !hitAny) { SFX.block(); }
}
function fireLance() {
  const muzzle = V(); me.model.userData.muzzle.getWorldPosition(muzzle);
  me.model.userData.flashT = 0.1; me.model.userData.recoil = 1.4; camKick += 1.6; shake(0.25);
  SFX.rail(); tone(160, 0.6, "sawtooth", 0.12, 0.3);
  hitscan(muzzle, { pellets: 1, spread: 0, pierce: true, proc: 1, color: 0xd8ff7a }, 320 * ST.dmg, 0xd8ff7a, true, 0.6);
  const end = computeAim(); for (let i = 0; i < 3; i++) tracer(muzzle.clone().add(V(rand(-0.05, 0.05), rand(-0.05, 0.05), 0)), end, 0xffffff, 0.4);
}
// ---------------------------------------------------------------- player projectiles (grenades, launcher shells, mines, cluster bombs, homing missiles)
let pidN = 0;
const PROJ = {
  g: { geo: nadeGeo, mat: nadeMat, grav: 0.8, life: 1.6, bounce: true, R: 5.2, col: 0x7dff8a },
  c: { geo: nadeGeo, mat: clusterMat, grav: 0.8, life: 1.2, bounce: true, R: 3.2, col: 0xffb02e, scale: 1.4 },
  l: { geo: nadeGeo, mat: lnchMat, grav: 0.32, life: 3, R: 3.2, col: 0xff2e88, scale: 1.2 },
  b: { geo: nadeGeo, mat: clusterMat, grav: 0.8, life: 0.6, bounce: true, R: 2.8, col: 0xffb02e, scale: 0.8 },
  m: { geo: new THREE.OctahedronGeometry(0.2), mat: mineMat, grav: 0.8, life: 40, stick: true, R: 4, col: 0xb6ff2e },
  h: { geo: missileGeo, mat: missileMat, grav: 0, life: 4, R: 2, col: 0xff9a40, homing: true }
};
function spawnProj(k, p, v, mine, dmg = 0, extra = {}) {
  const P = PROJ[k], mesh = new THREE.Mesh(P.geo, P.mat); mesh.position.copy(p); if (P.scale) mesh.scale.setScalar(P.scale); scene.add(mesh);
  const r = Object.assign({ id: extra.id ?? (myIdx * 1e6 + (++pidN)), k, p: p.clone(), v: v.clone(), mesh, mine, dmg, life: P.life, armT: 0.6 }, extra);
  rockets.push(r);
  if (mine) netSend({ t: "rk", id: r.id, k, p: vArr(p), v: vArr(v), tg: r.tg });
  return r;
}
function throwProj(k, spd, up, dmg) {
  const p = V(); me.model.userData.muzzle.getWorldPosition(p);
  const dir = computeAim().sub(p).normalize();
  const v = dir.multiplyScalar(spd).add(V(0, up, 0)).add(V(me.body.v.x * 0.5, 0, me.body.v.z * 0.5));
  SFX.throw(); return spawnProj(k, p, v, true, dmg * ST.dmg);
}
function launchMissile(tg, dmg, proc) {
  const p = V(me.body.p.x, me.body.p.y + 2.1, me.body.p.z), fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  const v = V(fx * 8 + rand(-5, 5), rand(8, 13), fz * 8 + rand(-5, 5));
  SFX.rocket(); spawnProj("h", p, v, true, dmg, { tg, proc });
}
function stepRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i], P = PROJ[r.k];
    if (r.stuck) { // armed mine waiting for a robot
      r.armT -= dt; r.mesh.rotation.y += dt * 3; r.mesh.scale.setScalar(1 + Math.sin(performance.now() / (r.armT > 0 ? 200 : 80)) * 0.2);
      r.life -= dt;
      if (r.mine && r.armT <= 0) { let trig = false; enemies.forEach(e => { if (!e.dying && e.spawnT <= 0 && chestOf(e).distanceTo(r.p) < 3 + ETYPES[e.type].r) trig = true; }); if (trig || r.life <= 0) { detonate(r, r.p.clone()); rockets.splice(i, 1); } }
      continue;
    }
    if (P.homing) {
      r.age = (r.age || 0) + dt;
      let e = enemies.get(r.tg); if (!e || e.dying) { let bd = 1e9; enemies.forEach(o => { if (o.dying || o.spawnT > 0) return; const d = o.pos.distanceTo(r.p); if (d < bd) { bd = d; e = o; } }); r.tg = e ? e.id : null; }
      const spd = Math.min(34, 12 + r.age * 40);
      if (e && r.age > 0.18) { const want = chestOf(e).sub(r.p).normalize().multiplyScalar(spd); r.v.lerp(want, Math.min(1, dt * 6)); } else r.v.y -= 14 * dt;
      r.v.setLength(spd); r.mesh.lookAt(tmpV.copy(r.p).add(r.v));
    } else r.v.y -= GRAV * P.grav * dt;
    const step = r.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    let t = rayWorld(r.p, dir, len + (P.bounce ? 0.14 : 0));
    let hitE = false;
    if (r.mine || P.homing || r.k === "l") enemies.forEach(e => { if (e.dying) return; const te = rayEnemy(r.p, dir, e); if (te < len + 0.2 && te < (t === Infinity ? 1e9 : t)) { t = te; hitE = true; } });
    if (r.mine && (r.k === "l" || P.homing)) { const [bt, bb] = rayBarrel(r.p, dir); if (bb && bt < len) hitBarrel(bb, myIdx); }
    r.life -= dt;
    if (P.homing || r.k === "l") spark(r.p, P.col, 1, 1, 0.5, 0.3); else if (Math.random() < 0.5) spark(r.p, P.col, 1, 0.5, 0.2, 0.25);
    if (P.stick && (t !== Infinity || hitE)) { r.p.addScaledVector(dir, Math.max(0, (t === Infinity ? 0 : t) - 0.1)); r.mesh.position.copy(r.p); r.stuck = true; r.armT = 0.6; tone(1200, 0.06, "square", 0.03 * distVol(r.p)); continue; }
    if (P.bounce && t !== Infinity && !hitE && r.life > 0) {
      const at = r.p.clone().addScaledVector(dir, Math.max(0, t - 0.05)); r.p.copy(at);
      if (Math.abs(dir.y) > 0.6) { r.v.y = -r.v.y * 0.4; r.v.x *= 0.7; r.v.z *= 0.7; } else { r.v.x = -r.v.x * 0.5; r.v.z = -r.v.z * 0.5; }
      if (r.v.length() > 3) tone(900, 0.03, "triangle", 0.03 * distVol(r.p));
      r.mesh.position.copy(r.p); continue;
    }
    if ((t !== Infinity && (!P.bounce || hitE)) || r.life <= 0) {
      const at = t !== Infinity ? r.p.clone().addScaledVector(dir, t) : r.p.clone();
      detonate(r, at); rockets.splice(i, 1); continue;
    }
    r.p.add(step); r.mesh.position.copy(r.p);
  }
}
function detonate(r, at) {
  const P = PROJ[r.k]; scene.remove(r.mesh);
  explosion(at, r.k === "b" ? 2.4 : r.k === "h" ? 2 : P.R * 0.85, P.col);
  if (!r.mine) return;
  netSend({ t: "rx", id: r.id, p: vArr(at) });
  if (r.k === "c") { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + rand(-0.3, 0.3); spawnProj("b", at.clone().add(V(0, 0.4, 0)), V(Math.cos(a) * rand(5, 8), rand(5, 8), Math.sin(a) * rand(5, 8)), true, 55 * ST.dmg); } }
  const R = P.R; let hitAny = false;
  if (r.dmg > 0) enemies.forEach(e => {
    if (e.dying) return; const c = chestOf(e); const d = Math.max(0, c.distanceTo(at) - ETYPES[e.type].r * 0.5);
    if (d < R) { let dmg = r.dmg * (1 - d / (R * 1.6)); if (shielded(e, at)) dmg *= 0.35; hitAny = true; hitEnemy(e, dmg, { at: c, proc: r.proc ?? 0.6, forceCrit: r.forceCrit, noProc: r.k === "h" }); }
  });
  barrels.forEach(b => { if (b.alive && Math.hypot(b.x - at.x, b.z - at.z) < R * 0.8 && Math.abs(b.y - at.y) < 2.5) hitBarrel(b, myIdx); });
  if (hitAny) { hitMarker(false); SFX.hit(); }
  // grenades shove me around a little (no self damage)
  const c = V(me.body.p.x, me.body.p.y + 0.9, me.body.p.z), d = c.distanceTo(at);
  if ((r.k === "g" || r.k === "l") && d < 3 && !me.downed && !me.dead) { const k = 1 - d / 3; me.body.v.addScaledVector(c.clone().sub(at).normalize(), 8 * k); me.body.v.y += 5 * k; me.body.grounded = false; }
}
function fxSend(m) { netSend({ t: "fx", ...m }); }
function playFx(m) {
  if (m.k === "boom") explosion(arrV(m.p), m.r || 3, m.c || 0xff8a3a);
  else if (m.k === "zap") lightning(arrV(m.pts[0]), arrV(m.pts[1]), m.c || 0x7ae8ff, 4);
  else if (m.k === "cone") { const at = arrV(m.p); for (let i = 0; i < 22; i++) { const a = m.y + rand(-0.5, 0.5), d = rand(1, 8); spark(V(at.x - Math.sin(a) * d, at.y + rand(-0.5, 0.8), at.z - Math.cos(a) * d), 0xffb02e, 1, 2, 0.5, 0.35); } SFX.boom(distVol(at) * 0.6); }
}

// ===================================================================== networking
let peer = null, conn = null, session = 0, lastStSent = 0, lastEnSent = 0, lastGmSent = 0;
const vArr = v => [r2(v.x), r2(v.y), r2(v.z)];
const arrV = a => V(a[0], a[1], a[2]);
function netSend(m) { if (conn && conn.open) { try { conn.send(m); } catch (e) {} } }
function peerOptions() {
  // Extra relay (TURN) servers, including TCP 443, so phones on mobile data or strict Wi-Fi can still connect.
  const o = { debug: 1, config: { iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" },
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" }
  ], sdpSemantics: "unified-plan" } };
  const ps = qs.get("ps");
  if (ps) { const [h, pt] = ps.split(":"); o.host = h; o.port = +(pt || 443); o.path = "/"; o.secure = !(h === "localhost" || h === "127.0.0.1"); }
  return o;
}
function cleanup() {
  session++;
  try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {}
  stopRelays();
  conn = peer = null; mode = null; mate.on = false; mate.buf = []; mate.ready = false;
  if (mate.model) { scene.remove(mate.model); scene.remove(mate.label); mate.model = null; }
  clearWorld();
  G.ph = "menu"; lastPh = null; MUS.level = 0; releaseWake(); exitLock();
}
function backToMenu(msg) { cleanup(); showScreen("sMenu"); showBest(); if (msg) toast(msg, 3000); }
const BUILD = "4.1"; const FIXED_CODE = "UHHF"; // permanent room code for Bulmaim's games
function makeCode() { if (FIXED_CODE) return FIXED_CODE; let c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }

// ---- Fallback relay: when phones can't link directly (strict mobile/Wi-Fi networks), send game
// messages through a free public MQTT broker instead. Both phones keep their own simulation as before.
// Brokers on the standard web port (443) first, since some mobile networks block unusual ports.
const MQ_SERVERS = qs.get("mq") ? [{ url: qs.get("mq") }] : [
  { url: "wss://mqtt.eclipseprojects.io:443/mqtt" },
  { url: "wss://public.cloud.shiftr.io:443", username: "public", password: "public" },
  { url: "wss://broker.emqx.io:8084/mqtt" },
  { url: "wss://broker.hivemq.com:8884/mqtt" }];
const MQ_ROOT = "irontide-v3-relay-k7/";
let relays = [], relayUp = 0;
function makeRelayConn(client, topicOut, topicIn, tag) {
  const h = {}, c = { open: false, relay: true, tag, lastIn: performance.now() };
  c.on = (ev, fn) => { (h[ev] = h[ev] || []).push(fn); return c; };
  c.emit = (ev, a) => (h[ev] || []).forEach(fn => { try { fn(a); } catch (e) { console.error(e); } });
  c.send = m => { if (c.open) client.publish(topicOut, JSON.stringify({ g: tag, m })); };
  c.close = () => { if (c.closed) return; c.closed = true; try { client.publish(topicOut, JSON.stringify({ g: tag, bye: 1 })); } catch (e) {} c.open = false; clearInterval(c.ping); c.emit("close"); };
  c.inbound = d => { c.lastIn = performance.now(); if (d.bye) { if (!c.closed) { c.closed = true; c.open = false; clearInterval(c.ping); c.emit("close"); } return; } if (d.m !== undefined) c.emit("data", d.m); };
  c.start = () => { c.open = true; c.lastIn = performance.now(); c.ping = setInterval(() => { if (!c.open) return; client.publish(topicOut, JSON.stringify({ g: tag, p: 1 })); if (performance.now() - c.lastIn > 12000) c.close(); }, 2000); c.emit("open"); };
  return c;
}
function mqConnect(sv) { return mqtt.connect(sv.url, { username: sv.username, password: sv.password, clean: true, connectTimeout: 8000, reconnectPeriod: 2000, keepalive: 20, clientId: "it" + Math.random().toString(36).slice(2, 12) }); }
function stopRelays() { relays.forEach(r => { try { r.end(true); } catch (e) {} }); relays = []; relayUp = 0; }
// Host: listen on every broker for a guest that couldn't link directly.
function hostRelayListen(code, my) {
  if (typeof mqtt === "undefined") return;
  const status = () => { const w = $("waitMsg"); if (w && mode === "host" && !mate.on) { w.dataset.relay = relayUp + "/" + MQ_SERVERS.length; $("relayNote") && ($("relayNote").textContent = "Backup relay: " + relayUp + "/" + MQ_SERVERS.length + " servers connected"); } };
  for (const sv of MQ_SERVERS) {
    const cl = mqConnect(sv); relays.push(cl); let rc = null, up = false;
    cl.on("connect", () => { cl.subscribe(MQ_ROOT + code + "/g2h"); if (!up) { up = true; relayUp++; status(); } });
    cl.on("close", () => { if (up) { up = false; relayUp--; status(); } });
    cl.on("message", (t, buf) => {
      if (my !== session) return; let d; try { d = JSON.parse(buf.toString()); } catch (e) { return; }
      if (d.join) {
        if (conn && conn.open && !(conn.relay && conn.tag === d.join)) { cl.publish(MQ_ROOT + code + "/h2g", JSON.stringify({ g: d.join, full: 1 })); return; }
        if (rc && rc.tag === d.join) return;
        rc = makeRelayConn(cl, MQ_ROOT + code + "/h2g", null, d.join); conn = rc; wireConn(rc, my);
        cl.publish(MQ_ROOT + code + "/h2g", JSON.stringify({ g: d.join, ok: 1 })); rc.start(); return;
      }
      if (rc && d.g === rc.tag) rc.inbound(d);
    });
  }
}
// Guest: connect to every broker at once; the first one the host answers on wins.
function guestRelayJoin(code, my, onFail) {
  if (typeof mqtt === "undefined") return onFail(0);
  const tag = Math.random().toString(36).slice(2, 10); let rc = null, reached = 0, finished = false;
  const mine = [];
  const end = () => { finished = true; clearTimeout(giveUp); mine.forEach(c => { if (!rc || c !== rc.client) { try { c.end(true); } catch (e) {} } }); };
  const giveUp = setTimeout(() => { if (!rc && my === session) { end(); onFail(reached); } }, 25000);
  for (const sv of MQ_SERVERS) {
    const cl = mqConnect(sv); relays.push(cl); mine.push(cl); let counted = false;
    cl.on("connect", () => { if (finished) return; if (!counted) { counted = true; reached++; $("busyMsg").textContent = "Connecting through the relay… (" + reached + " server" + (reached > 1 ? "s" : "") + " reached)"; } cl.subscribe(MQ_ROOT + code + "/h2g", () => cl.publish(MQ_ROOT + code + "/g2h", JSON.stringify({ join: tag }))); });
    cl.on("message", (t, buf) => {
      if (my !== session) return; let d; try { d = JSON.parse(buf.toString()); } catch (e) { return; }
      if (d.g !== tag) return;
      if (rc) { if (cl === rc.client) rc.inbound(d); return; }
      if (finished) return;
      if (d.full) { end(); return backToMenu("That game already has two players."); }
      if (d.ok) { rc = makeRelayConn(cl, MQ_ROOT + code + "/g2h", null, tag); rc.client = cl; end(); conn = rc; wireConn(rc, my); rc.start(); }
    });
  }
}
function startHost(tries = 0) {
  cleanup(); const my = session; mode = "host"; myIdx = 0; showScreen("sWait"); $("myCode").textContent = "····"; $("waitMsg").textContent = "Getting a code…"; startHost.code = null;
  const code = makeCode();
  peer = new Peer(ID_PREFIX + code, peerOptions());
  peer.on("open", () => { if (my !== session) return; $("myCode").textContent = code; $("waitMsg").textContent = "Send this code to your partner, then come straight back and keep this screen open until they join (Android pauses the game in the background). Arena: " + ARENAS[arenaCfg.a].name + "."; startHost.code = code; if (!relays.length) hostRelayListen(code, my); });
  peer.on("error", e => { if (my !== session) return; if (e.type === "unavailable-id" && tries < 25) { $("waitMsg").textContent = "Freeing up code " + makeCode() + "… (" + (tries + 1) + ")"; setTimeout(() => { if (my === session) startHost(tries + 1); }, 3000); return; } if (G.ph !== "menu") return; $("waitMsg").textContent = "Couldn't reach the game server (" + e.type + "). Check your connection and try again."; });
  peer.on("disconnected", () => { try { if (my === session && peer && !peer.destroyed) peer.reconnect(); } catch (e) {} });
  peer.on("connection", c => { if (my !== session) return; if (conn && conn.open) { c.on("open", () => { c.send({ t: "full" }); setTimeout(() => c.close(), 500); }); return; } conn = c; wireConn(c, my); });
}
function startJoin(code) {
  code = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) { $("joinErr").textContent = "The code is 4 letters."; return; }
  cleanup(); const my = session; mode = "guest"; myIdx = 1; showScreen("sBusy"); $("busyTitle").textContent = "Joining " + code + "…"; $("busyMsg").textContent = "One moment.";
  let opened = false, relayStarted = false, direct = null, notFound = false;
  const fail = msg => { if (my !== session || opened) return; backToMenu(); showScreen("sJoin"); $("joinErr").textContent = msg; };
  const startRelay = () => {
    if (my !== session || opened || relayStarted) return; relayStarted = true;
    $("busyMsg").textContent = "Direct link blocked by the network. Connecting through the relay…";
    if (direct) { const d = direct; direct = null; if (conn === d) conn = null; try { d.close(); } catch (e) {} }
    const failMsg = n => fail(notFound ? "No game with code " + code + ". Make sure the host has Iron Tide open on screen (not in the background)." : "Couldn't link the two phones, even through the relay (" + (n === undefined ? "?" : n) + "/" + MQ_SERVERS.length + " relay servers reached). Check the host's waiting screen and try again.");
    guestRelayJoin(code, my, failMsg);
    const chk = setInterval(() => { if (my !== session) return clearInterval(chk); if (conn && conn.open) { opened = true; clearInterval(chk); } }, 300);
    setTimeout(() => { clearInterval(chk); failMsg(); }, 32000);
  };
  setTimeout(startRelay, qs.get("relay") ? 500 : 9000);
  try { peer = new Peer(undefined, peerOptions()); } catch (e) { return startRelay(); }
  peer.on("open", () => {
    if (my !== session || relayStarted || qs.get("nodirect")) return;
    direct = conn = peer.connect(ID_PREFIX + code, { reliable: true }); wireConn(conn, my);
    const d = direct; d.on("open", () => { if (relayStarted || conn !== d) { try { d.close(); } catch (e) {} return; } opened = true; $("busyMsg").textContent = "Connected. Starting…"; });
  });
  peer.on("error", e => { if (opened || relayStarted) return; if (e.type === "peer-unavailable") notFound = true; startRelay(); });
}
function wireConn(c, my) {
  c.on("open", () => { if (my === session) { c.send({ t: "hi", name: nameOr(myName, mode === "host" ? "Player 1" : "Player 2"), sv: mySurv }); if (mode === "host") c.send({ t: "cfg", ...arenaCfg }); } });
  c.on("data", m => { if (my === session && c === conn) { try { onData(m); } catch (e) { console.error(e); } } });
  c.on("close", () => { if (my !== session || !mode || c !== conn) return; if (mode === "host" && !mate.on) { conn = null; return; } backToMenu("Your partner left the game."); });
  c.on("error", () => {});
}
function remoteBoom(id, at) { const i = rockets.findIndex(r => r.id === id && !r.mine); if (i < 0) return; const r = rockets[i]; rockets.splice(i, 1); scene.remove(r.mesh); const P = PROJ[r.k]; explosion(at, r.k === "b" ? 2.4 : r.k === "h" ? 2 : P.R * 0.85, P.col); }
function onData(m) {
  if (!m || typeof m !== "object") return;
  switch (m.t) {
    case "full": return backToMenu("That game already has two players.");
    case "hi": {
      mate.name = nameOr(String(m.name || ""), "Partner"); mate.surv = SURVIVORS[m.sv] ? m.sv : "vanguard";
      mate.col = mate.surv === mySurv ? SURVIVORS[mate.surv].alt : SURVIVORS[mate.surv].color;
      mate.on = true; buildMate(); if (conn && !conn.relay) stopRelays();
      if (G.ph === "menu") startGame();
      break;
    }
    case "st": {
      const s = { t: performance.now(), p: arrV(m.p), v: m.v ? arrV(m.v) : V(), yaw: m.y, pitch: m.pi };
      mate.buf.push(s); if (mate.buf.length > 30) mate.buf.shift();
      mate.hp = m.hp; mate.mhp = m.mh; mate.downed = !!m.dn; mate.dead = !!m.dd; mate.revive = m.rv || 0; mate.kills = m.k || 0; mate.glow = +m.gw || 0; mate.cloak = !!m.ck; mate.ready = !!m.rd; mate.lvl = m.lv || 1; mate.items = m.ni || 0; mate.lastSeen = performance.now();
      break;
    }
    case "tr": tracer(arrV(m.a), arrV(m.b), m.c, m.l); if (mate.model) { mate.model.userData.flashT = 0.05; mate.model.userData.recoil = 0.4; } if (!playBuf("rifle", 0.12 * distVol(arrV(m.a)), 0.9)) tone(700, 0.05, "square", 0.02); break;
    case "rk": if (PROJ[m.k]) { spawnProj(m.k, arrV(m.p), arrV(m.v), false, 0, { id: m.id, tg: m.tg }); if (m.k === "h") SFX.rocket(); } break;
    case "rx": remoteBoom(m.id, arrV(m.p)); break;
    case "fx": playFx(m); break;
    case "cfg": if (mode === "guest") { arenaCfg = { a: ARENAS[m.a] ? m.a : "rooftop", wx: WEATHERS[m.wx] || m.wx === "auto" ? m.wx : "auto", tod: TODS[m.tod] ? m.tod : "day" }; buildArena(arenaCfg); if (G.wave === 0) spawnMe(); } break;
    case "ch": if (mode === "guest") addChest(m.id, m.k, arrV(m.p), m.c); break;
    case "co": chestOpened(m.id, m.who, m.it); break;
    case "op": if (mode === "host") hostOpenChest(m.id, 1); break;
    // host -> guest
    case "gm": if (mode === "guest" && G.ph !== "menu") applyGm(m); break;
    case "reset": if (mode === "guest") { localReset(); } break;
    case "en": if (mode === "guest") guestEnemies(m); break;
    case "kill": if (mode === "guest") { const e = enemies.get(m.id); if (e) { e.elite = !!m.el; onEnemyKilled(e, m.by); } else { gainXp(ETYPES[m.ty].reward); if (m.by === myIdx) { me.kills++; me.credits += rewardFor(m.ty, !!m.el); } } } break;
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
    case "hit": if (mode === "host") { const e = enemies.get(m.id); if (e) hostDamageEnemy(m.id, clamp(+m.d || 0, 0, 20000), 1, Array.isArray(m.kb) ? [clamp(+m.kb[0] || 0, -30, 30), clamp(+m.kb[1] || 0, -30, 30)] : null); } break;
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
  mate.model = makeSoldier(mate.col, SURVIVORS[mate.surv].gun); scene.add(mate.model);
  mate.label = labelSprite(mate.name, mate.col); scene.add(mate.label);
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
  setCloak(mate.model, mate.cloak);
  animSoldier(mate.model, mate.vel, mate.pitch * 0.8, mate.downed, dt, mate.glow);
  mate.label.position.set(mate.pos.x, mate.pos.y + (mate.downed ? 1.4 : 2.35), mate.pos.z);
  if (mate.downed) mate.label.userData.set("⚠ REVIVE " + (mate.revive > 0 ? Math.round(mate.revive / REVIVE_TIME * 100) + "%" : mate.name), "#ff2e88");
  else mate.label.userData.set(mate.name, mate.col);
  mate.label.visible = !mate.dead && !mate.cloak;
}

// ===================================================================== start / UI
function startGame() {
  showScreen(null); requestWake(); hideMenuBots();
  if (mode !== "guest") buildArena(arenaCfg);
  if (me.model) scene.remove(me.model);
  me.model = makeSoldier(S().color, S().gun); scene.add(me.model);
  ST.maxHp = 0; recalc();
  if (mode === "host" || mode === "solo") { lastPh = "menu"; hostResetGame(); }
  else { localReset(); G.ph = "connecting"; }
}
const screens = ["sMenu", "sSetup", "sJoin", "sWait", "sBusy", "sHelp", "shop", "sOver"];
function showScreen(id) {
  screens.forEach(s => $(s).classList.toggle("on", s === id));
  const inGame = (id === null || id === "shop") && mode && G.ph !== "menu";
  $("hud").classList.toggle("on", !!inGame);
  ["bFire", "bJump", "bDash", "bNade", "bUlt"].forEach(b => $(b).classList.toggle("on", !!inGame && id === null && COARSE));
  $("bQuit").classList.toggle("on", !!inGame && id === null); $("bMus2").classList.toggle("on", !!inGame && id === null);
  if (id !== null) exitLock();
  if (id === "shop") renderShop();
}
document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => { if (($("sHelp").classList.contains("on") || $("sSetup").classList.contains("on")) && !mode) return showScreen("sMenu"); backToMenu(); });
$("bHelp").onclick = () => showScreen("sHelp");
const ready = () => { if (!ASSETS.robot) { toast("Still loading…"); return false; } ac(); return true; };
// ---- setup: survivor select (+ arena, weather, lighting for the host)
let setupFor = "solo";
function openSetup(kind) { setupFor = kind; renderSetup(); showScreen("sSetup"); }
function renderSetup() {
  $("setupTitle").textContent = setupFor === "guest" ? "Choose your survivor" : "Choose survivor and arena";
  $("survs").innerHTML = SORDER.map(k => { const s = SURVIVORS[k]; return '<div class="surv' + (k === mySurv ? " sel" : "") + '" data-s="' + k + '" style="--c:' + s.color + '"><img src="assets/p_' + k + '.jpg" alt=""><b>' + s.name + "</b><small>" + s.role + "</small></div>"; }).join("");
  $("survs").querySelectorAll(".surv").forEach(d => d.onclick = () => { mySurv = d.dataset.s; store("it-surv", mySurv); SFX.click(); renderSetup(); });
  const s = S();
  $("survInfo").innerHTML = '<div class="si-h" style="color:' + s.color + '">' + s.name + ' <small>' + s.hp + " HP</small></div>" +
    '<div class="si-r"><span>Weapon</span><b>' + s.weapon.name + "</b></div>" +
    '<div class="si-r"><span>' + (COARSE ? "Ability 1" : "G") + '</span><b>' + s.sec.name + "</b><i>" + s.sec.desc + "</i></div>" +
    '<div class="si-r"><span>' + (COARSE ? "Ability 2" : "Shift") + '</span><b>' + s.utl.name + "</b><i>" + s.utl.desc + "</i></div>" +
    '<div class="si-r"><span>' + (COARSE ? "Special" : "F") + '</span><b>' + s.spc.name + "</b><i>" + s.spc.desc + "</i></div>";
  $("arenaOpts").style.display = setupFor === "guest" ? "none" : "block";
  $("optArena").innerHTML = AORDER.map(k => '<div class="achip' + (k === arenaCfg.a ? " sel" : "") + '" data-a="' + k + '" style="background-image:linear-gradient(transparent,#000c),url(assets/' + ARENAS[k].sky + ')"><b>' + ARENAS[k].name + "</b></div>").join("");
  $("optArena").querySelectorAll(".achip").forEach(d => d.onclick = () => { arenaCfg.a = d.dataset.a; store("it-arena", arenaCfg.a); SFX.click(); buildArena(arenaCfg); placeMenuBots(); renderSetup(); });
  const chips = (el, opts, key) => { $(el).innerHTML = Object.entries(opts).map(([k, n]) => '<div class="chip' + (arenaCfg[key] === k ? " sel" : "") + '" data-k="' + k + '">' + n + "</div>").join(""); $(el).querySelectorAll(".chip").forEach(d => d.onclick = () => { arenaCfg[key] = d.dataset.k; store("it-" + key, d.dataset.k); SFX.click(); buildArena(arenaCfg); renderSetup(); }); };
  chips("optWx", { auto: "Arena default", ...WEATHERS }, "wx"); chips("optTod", TODS, "tod");
  $("bSetupGo").textContent = setupFor === "host" ? "Create game" : setupFor === "guest" ? "Next: enter code" : "Deploy";
}
$("bSetupGo").onclick = () => {
  if (!ready()) return;
  if (setupFor === "host") startHost();
  else if (setupFor === "guest") { $("joinErr").textContent = ""; showScreen("sJoin"); setTimeout(() => $("codeIn").focus(), 50); }
  else { cleanup(); mode = "solo"; myIdx = 0; startGame(); }
};
$("bHost").onclick = () => { if (ready()) openSetup("host"); };
$("bJoin").onclick = () => { if (ready()) openSetup("guest"); };
$("bSolo").onclick = () => { if (ready()) openSetup("solo"); };
$("bJoinGo").onclick = () => { if (ready()) startJoin($("codeIn").value); };
$("codeIn").addEventListener("keydown", e => { if (e.key === "Enter" && ready()) startJoin($("codeIn").value); });
document.querySelectorAll(".mus").forEach(b => b.onclick = () => { ac(); setMusic(!MUS.on); });
setMusic(MUS.on);
$("bQuit").onclick = () => backToMenu();
$("bOverLeave").onclick = () => backToMenu();
$("bAgain").onclick = () => { if (mode === "host" && !(conn && conn.open)) return backToMenu("Your partner left the game."); hostResetGame(); };
$("bShare").onclick = async () => {
  const code = startHost.code; if (!code) return;
  const url = location.origin + location.pathname + "?join=" + code, text = "Iron Tide co-op code: " + code;
  try { if (navigator.share) await navigator.share({ title: "Iron Tide", text, url }); else { await navigator.clipboard.writeText(text + " " + url); toast("Copied"); } } catch (e) {}
};
$("codeIn").value = FIXED_CODE || "";
if (qs.get("join")) { $("codeIn").value = qs.get("join").toUpperCase().slice(0, 4); setupFor = "guest"; showScreen("sJoin"); }

function showOver() {
  if (G.ph !== "over") return;
  $("overTitle").textContent = "OVERRUN";
  $("overSub").textContent = "You held out until wave " + G.wave + ".";
  let html = "<span>" + nameOr(myName, "You") + " (" + S().name + ") kills</span><b>" + me.kills + "</b>";
  if (mate.on) html += "<span>" + mate.name + " kills</span><b>" + mate.kills + "</b>";
  html += "<span>Your damage</span><b>" + Math.round(me.dmgDone) + "</b><span>Level reached</span><b>" + me.lvl + "</b><span>Items collected</span><b>" + me.nItems + "</b><span>Critical hits</span><b>" + me.crits + "</b><span>Best kill streak</span><b>" + me.bestCombo + "</b><span>Best wave</span><b>" + Math.max(G.wave, +(store("it-best") || 0)) + "</b>";
  $("overStats").innerHTML = html;
  const host = mode !== "guest"; $("bAgain").style.display = host ? "block" : "none"; $("overWait").style.display = host ? "none" : "block";
  showScreen("sOver");
}

// ---- Armory (between waves): supply terminal with 3 offers, reroll, repair, inventory, READY
const ws = () => 1 + 0.15 * (Math.max(1, G.wave) - 1);
const offerCost = t => Math.round([90, 190, 420][t] * ws());
function rollOffers() { const pick = t => { const l = itemsOfTier(t); return l[Math.floor(Math.random() * l.length)]; }; me.offers = [pick(0), pick(Math.random() < 0.5 ? 0 : 1), pick(Math.random() < 0.12 ? 2 : 1)]; me.bought = false; }
const itemIcon = (k, cls = "") => '<div class="icon ' + cls + ' t' + ITEMS[k].t + '"><img src="assets/i_' + k + '.jpg" alt="">' + (ic(k) > 1 && cls !== "big" ? "<em>x" + ic(k) + "</em>" : "") + "</div>";
function renderShop() {
  if (!me.offers) rollOffers();
  const s = S();
  $("shopCred").textContent = "⬢ " + me.credits;
  $("arSub").textContent = G.ph === "break" ? "Wave " + G.wave + " cleared · next: wave " + (G.wave + 1) + (G.wave + 1) % 5 === 0 ? "" : "" : "Wave " + G.wave;
  $("arSub").textContent = G.ph === "break" ? "Wave " + G.wave + " cleared · up next: " + ((G.wave + 1) % 5 === 0 ? "BOSS WAVE " : "wave ") + (G.wave + 1) : "Wave " + G.wave;
  $("arSurv").innerHTML = '<div class="pf" style="--c:' + s.color + '"><img src="assets/p_' + mySurv + '.jpg" alt=""><div class="lv">LV ' + me.lvl + "</div></div>" +
    '<div class="sn" style="color:' + s.color + '">' + s.name + "</div>" +
    '<div class="xpb"><i style="width:' + (me.xp / xpNeed(me.lvl) * 100).toFixed(0) + '%"></i></div>' +
    '<div class="stl"><span>Health</span><b>' + Math.ceil(me.hp) + " / " + maxHp() + "</b><span>Damage</span><b>" + Math.round(ST.dmg * 100) + "%</b><span>Attack speed</span><b>" + Math.round(ST.atk * 100) + "%</b><span>Crit chance</span><b>" + Math.round(ST.crit * 100) + "%</b><span>Move speed</span><b>" + Math.round(ST.speed * 100) + "%</b>" + (ST.block ? "<span>Block</span><b>" + Math.round(ST.block * 100) + "%</b>" : "") + (ST.shieldMax ? "<span>Shield</span><b>" + ST.shieldMax + "</b>" : "") + "</div>";
  $("offers").innerHTML = me.offers.map((k, i) => { const I = ITEMS[k], c = offerCost(I.t), can = !me.bought && me.credits >= c;
    return '<div class="offer t' + I.t + (me.bought ? " sold" : "") + '">' + itemIcon(k, "big") + '<div class="on"><b style="color:' + TIERS[I.t].col + '">' + I.name + '</b><small class="tier">' + TIERS[I.t].name + (ic(k) ? " · you have " + ic(k) : "") + "</small><small>" + I.desc + '</small></div><button class="buy" data-i="' + i + '"' + (can ? "" : " disabled") + ">" + (me.bought ? "SOLD OUT" : "⬢ " + c) + "</button></div>"; }).join("");
  $("offers").querySelectorAll("button.buy").forEach(b => b.onclick = () => { const k = me.offers[+b.dataset.i], c = offerCost(ITEMS[k].t); if (me.bought || me.credits < c) return; me.credits -= c; me.bought = true; giveItem(k); SFX.buy(); renderShop(); });
  const rr = Math.round(25 * ws()), rp = Math.round(40 * ws());
  $("bReroll").textContent = "↻ Reroll  ⬢ " + rr; $("bReroll").disabled = me.credits < rr || me.bought;
  $("bReroll").onclick = () => { if (me.credits < rr || me.bought) return; me.credits -= rr; rollOffers(); SFX.click(); renderShop(); };
  $("bRepair").textContent = "✚ Repair  ⬢ " + rp; $("bRepair").disabled = me.credits < rp || me.hp >= maxHp();
  $("bRepair").onclick = () => { if (me.credits < rp || me.hp >= maxHp()) return; me.credits -= rp; me.hp = maxHp(); SFX.buy(); renderShop(); };
  const own = ITEM_IDS.filter(k => ic(k)).sort((a, b) => ITEMS[a].t - ITEMS[b].t);
  $("invN").textContent = me.nItems ? "· " + me.nItems : "";
  $("inv").innerHTML = own.length ? own.map(k => '<div class="invi" data-k="' + k + '">' + itemIcon(k) + "</div>").join("") : '<p class="small">No items yet. Open crates in the arena or buy one here.</p>';
  $("inv").querySelectorAll(".invi").forEach(d => d.onclick = () => { const I = ITEMS[d.dataset.k]; $("invDesc").innerHTML = '<b style="color:' + TIERS[I.t].col + '">' + I.name + " x" + ic(d.dataset.k) + "</b> " + I.desc; });
  updateReadyUI();
}
function updateReadyUI() {
  const coop = mode !== "solo" && mate.on;
  $("bReady").textContent = me.ready ? "✓ READY" : "READY"; $("bReady").classList.toggle("on", me.ready);
  $("readyNote").textContent = G.ph !== "break" ? "" : coop ? (me.ready && mate.ready ? "Both ready. Here they come…" : me.ready ? "Waiting for " + mate.name + "…" : mate.ready ? mate.name + " is ready. Your call." : "The wave starts when you're both ready.") : "The wave starts when you're ready.";
  $("bReady").style.display = G.ph === "break" ? "" : "none";
}
function toggleReady() { if (G.ph !== "break" || me.dead) return; me.ready = !me.ready; SFX.click(); updateReadyUI(); }
$("bShop").onclick = () => showScreen("shop");
$("bShopClose").onclick = () => showScreen(null);
$("bReady").onclick = toggleReady; $("bReady2").onclick = toggleReady;
$("bUse").addEventListener("pointerdown", e => { e.preventDefault(); input.use = true; });

// item bar + RoR2-style pickup banner
function renderItemBar() {
  const own = ITEM_IDS.filter(k => ic(k)).sort((a, b) => ITEMS[b].t - ITEMS[a].t);
  $("items").innerHTML = own.map(k => itemIcon(k)).join("");
}
function itemBanner(k) {
  const I = ITEMS[k], b = $("banner");
  b.innerHTML = itemIcon(k, "big") + '<div><b style="color:' + TIERS[I.t].col + '">' + I.name + (ic(k) > 1 ? " <small>x" + ic(k) + "</small>" : "") + "</b><span>" + I.desc + "</span></div>";
  b.className = "show t" + I.t; clearTimeout(itemBanner.h); itemBanner.h = setTimeout(() => b.className = "", 3200);
  if (I.t === 2) { shake(0.3); tone(440, 0.4, "sawtooth", 0.05, 2); }
}
function setupAbilityButtons() {
  const s = S();
  $("bNade").firstChild.textContent = s.sec.short; $("bDash").firstChild.textContent = s.utl.short;
  ["bNade", "bDash", "bUlt"].forEach(b => $(b).style.setProperty("--c", s.color));
}

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
  const ph = G.ph, s = S(), coop = mode !== "solo" && mate.on;
  $("wave").textContent = ph === "count" ? "GET READY" : ph === "break" ? "WAVE " + G.wave + " CLEARED" : ph === "over" ? "OVERRUN" : "WAVE " + G.wave;
  $("sub").textContent = ph === "count" ? (G.wave ? "Wave " + (G.wave + 1) : "First wave") + " in " + Math.ceil(G.tm) + "s" : ph === "break" ? (me.ready ? (coop && !mate.ready ? "Waiting for " + mate.name + "…" : "Starting…") : "Open crates · Armory · press READY" + (coop && mate.ready ? " (" + mate.name + " is ready)" : "")) : ph === "wave" ? G.left + " robots left" : "";
  const bossOn = G.bossFrac >= 0 && ph === "wave"; $("boss").style.display = bossOn ? "block" : "none";
  if (bossOn) { $("boss").firstChild.style.width = Math.max(0, G.bossFrac * 100) + "%"; $("bossName").textContent = ENAMES[G.bossTy] || "Titan"; }
  const mh = maxHp(); $("hptxt").innerHTML = '<b style="color:' + s.color + '">' + s.name + "</b> · LV " + me.lvl + " · " + (me.dead ? "DEAD" : me.downed ? "DOWN " + Math.ceil(me.bleed) + "s" : Math.ceil(me.hp) + " / " + mh + (me.shield > 0 ? ' <span style="color:#8ad8ff">+' + Math.ceil(me.shield) + "</span>" : ""));
  $("hpbar").firstChild.style.width = (me.downed || me.dead ? 0 : me.hp / mh * 100) + "%";
  $("shbar").style.width = (ST.shieldMax ? me.shield / mh * 100 : 0) + "%";
  $("xpbar").firstChild.style.width = (me.xp / xpNeed(me.lvl) * 100).toFixed(1) + "%";
  $("cred").textContent = "⬢ " + me.credits;
  $("wpn").innerHTML = s.weapon.name + "<small>" + (me.odT > 0 ? "OVERDRIVE " + Math.ceil(me.odT) + "s" : me.skinT > 0 ? "IRON SKIN " + Math.ceil(me.skinT) + "s" : me.cloakT > 0 ? "CLOAKED " + Math.ceil(me.cloakT) + "s" : "∞") + "</small>";
  $("buffs").innerHTML = Object.keys(POWERUPS).filter(buff).map(k => '<span style="border-color:' + POWERUPS[k].col + ';color:' + POWERUPS[k].col + '">' + POWERUPS[k].name + " " + Math.ceil(me.buffs[k]) + "s</span>").join("") + (me.battT > 0 ? '<span style="border-color:#6dff8a;color:#6dff8a">CHARGED</span>' : "");
  if (mate.on) $("mate").innerHTML = '<span style="color:' + mate.col + '">' + mate.name + "</span> <small>" + SURVIVORS[mate.surv].name + " · LV " + mate.lvl + "</small>" + (mate.dead ? " · OUT" : mate.downed ? ' · <span style="color:#ff2e88">DOWN</span>' : "") + (ph === "break" ? (mate.ready ? ' · <span style="color:#7dff8a">READY</span>' : ' · <span style="color:#8d9bc4">not ready</span>') : "") + '<div class="bar"><i style="width:' + (mate.downed || mate.dead ? 0 : clamp(mate.hp / mate.mhp, 0, 1) * 100) + '%;background:' + mate.col + '"></i></div>';
  else $("mate").innerHTML = "";
  const hudOn = $("hud").classList.contains("on") && !$("shop").classList.contains("on");
  $("bShop").classList.toggle("on", ph === "break" && hudOn);
  $("bReady2").classList.toggle("on", ph === "break" && hudOn); $("bReady2").textContent = me.ready ? "✓ READY" : "READY"; $("bReady2").classList.toggle("rdy", me.ready);
  const ch = !me.downed && !me.dead && hudOn ? nearestChest() : null;
  $("bUse").classList.toggle("on", !!ch); if (ch) $("bUse").innerHTML = (COARSE ? "" : "E · ") + "OPEN " + CHEST_KINDS[ch.k].name.toUpperCase() + "<small>" + (ch.cost ? "⬢ " + ch.cost : "FREE") + "</small>";
  if (ch) $("bUse").classList.toggle("poor", me.credits < ch.cost);
  if ($("shop").classList.contains("on")) { $("shopCred").textContent = "⬢ " + me.credits; updateReadyUI(); }
  if (me.downed) { $("msg").style.opacity = 1; $("msg").innerHTML = "YOU ARE DOWN<small>" + (mate.on && !mate.downed && !mate.dead ? (me.revive > 0 ? "Reviving… " + Math.round(me.revive / REVIVE_TIME * 100) + "%" : mate.name + " can revive you. Hold on " + Math.ceil(me.bleed) + "s") : "No one left to revive you") + "</small>"; }
  else if (me.dead && ph === "wave") { $("msg").style.opacity = 1; $("msg").innerHTML = "SPECTATING<small>You'll be back when the wave is cleared</small>"; }
  else if ($("msg").innerHTML.startsWith("YOU ARE DOWN") || $("msg").innerHTML.startsWith("SPECTATING")) $("msg").style.opacity = 0;
  // abilities
  const cdFill = (el, f, lbl) => { el.style.setProperty("--f", (clamp(f, 0, 1) * 360).toFixed(0) + "deg"); el.classList.toggle("ready", f >= 1); if (lbl !== undefined) el.firstChild.textContent = lbl; };
  cdFill($("bDash"), 1 - Math.max(0, me.utlCd) / (s.utl.cd * ST.cdMul)); cdFill($("bNade"), 1 - Math.max(0, me.secCd) / (s.sec.cd * ST.cdMul));
  const act = me.odT > 0 ? me.odT / OD_TIME : me.skinT > 0 ? me.skinT / SKIN_TIME : 0;
  cdFill($("bUlt"), act || me.ult, act ? "ACTIVE" : me.ult >= 1 ? s.spc.name.split(" ")[0].toUpperCase() : Math.floor(me.ult * 100) + "%");
  $("abil").innerHTML = (COARSE ? "" : '<span class="' + (me.secCd <= 0 ? "ok" : "") + '">G ' + s.sec.name + '</span><span class="' + (me.utlCd <= 0 ? "ok" : "") + '">⇧ ' + s.utl.name + "</span>") + '<span class="' + (me.ult >= 1 ? "ok ult" : act ? "ult" : "") + '">' + (COARSE ? "" : "F ") + s.spc.name + " " + (act ? "ACTIVE" : Math.floor(me.ult * 100) + "%") + "</span>";
  $("combo").style.opacity = me.combo >= 2 && me.comboT > 0 ? 1 : 0;
  if (me.combo >= 2) $("combo").innerHTML = me.combo + " KILL STREAK<small>scrap x" + (1 + Math.min(me.combo - 1, 8) * 0.25).toFixed(2).replace(/0$/, "") + "</small>";
  document.body.classList.toggle("od", me.odT > 0 || buff("rage"));
}
function updateMarkers() {
  const mk = $("mkMate");
  if (mate.on && mate.model && !mate.dead && !me.dead) { const on = edgeMark(mk, V(mate.pos.x, mate.pos.y + 1.2, mate.pos.z), mate.downed ? "#ff2e88" : mate.col, mate.downed ? "✚ " + Math.round(mate.pos.distanceTo(me.body.p)) + "m" : "◆"); if (on && !mate.downed) mk.style.display = "none"; mk.classList.toggle("pulse", mate.downed); }
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
$("bDash").addEventListener("pointerdown", e => { e.preventDefault(); input.dash = true; });
$("bNade").addEventListener("pointerdown", e => { e.preventDefault(); input.nade = true; });
$("bUlt").addEventListener("pointerdown", e => { e.preventDefault(); input.ult = true; });
// keyboard + mouse
const keys = {};
addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return; const k = e.key.toLowerCase(); keys[k] = true;
  if (k === " ") { input.jump = true; e.preventDefault(); }
  if (k === "e") input.use = true;
  if (k === "r" && G.ph === "break") toggleReady();
  if (k === "shift") input.dash = true;
  if (k === "g") input.nade = true;
  if (k === "f" || k === "v") input.ult = true;
  if (k === "b" && G.ph === "break") showScreen($("shop").classList.contains("on") ? null : "shop");
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
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && mode) { requestWake(); try { if (peer && peer.disconnected && !peer.destroyed) peer.reconnect(); else if (mode === "host" && (!peer || peer.destroyed) && !(conn && conn.open)) startHost(); } catch (e) {} } });

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
      stepRockets(sdt); runDelayed(sdt);
    }
    stepCorpses(dt);
    // guest: interpolate robots
    stepChests(dt);
    if (mode === "guest") enemies.forEach(e => { const r = interp(e.buf, 110); if (r) { const { a, b, k } = r; const px = e.pos.x, pz = e.pos.z; e.pos.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)); e.yaw = angLerp(a.yaw, b.yaw, k); e.moving = Math.hypot(e.pos.x - px, e.pos.z - pz) / Math.max(dt, 1e-3); } });
    enemies.forEach(e => animEnemy(e, dt, now));
    // my model
    if (me.model) {
      me.model.visible = !me.dead;
      me.model.position.copy(me.body.p); me.model.rotation.y = me.yaw;
      animSoldier(me.model, me.body.v, me.pitch * 0.8, me.downed, dt, myGlow());
    }
    updateMate(dt);
    pickups.forEach(pk => { pk.item.rotation.y += dt * 2; pk.item.position.y = 0.8 + Math.sin(now / 300 + pk.id) * 0.12; });
    padMeshes.forEach((m, i) => m.scale.setScalar(1 + Math.sin(now / 200 + i) * 0.06));
    portalMeshes.forEach(m => m.rotation.z += dt);
    updateCamera(dt);
    updateHud(dt); updateMarkers();
    // network
    if (conn && conn.open) {
      if (now - lastStSent > 50) { lastStSent = now; netSend({ t: "st", p: vArr(me.body.p), v: vArr(me.body.v), y: r2(me.yaw), pi: r2(me.pitch), hp: Math.ceil(me.hp), mh: maxHp(), dn: me.downed ? 1 : 0, dd: me.dead ? 1 : 0, rv: r2(me.revive), k: me.kills, gw: myGlow(), ck: me.cloakT > 0 ? 1 : 0, rd: me.ready ? 1 : 0, lv: me.lvl, ni: me.nItems }); }
      if (mode === "host") {
        if (now - lastEnSent > 50) { lastEnSent = now; const e = []; enemies.forEach(x => e.push([x.id, x.type, r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.yaw), r2(x.hpFrac), enemyFlags(x)])); netSend({ t: "en", e, bf: r2(G.bossFrac) }); }
        if (now - lastGmSent > 250) { lastGmSent = now; netSend({ t: "gm", ...G }); }
      }
    }
  } else {
    // menu: slow orbit camera over the arena
    camera.position.set(Math.sin(now / 7000) * 6, 5.2, -6); camera.lookAt(0, 3.5, -24);
    portalMeshes.forEach(m => m.rotation.z += dt);
    menuBots.forEach(b => { if (b.userData.mixer) b.userData.mixer.update(dt); if (b.userData.parts.legs) { b.userData.gait = (b.userData.gait || 0) + dt * 0.8; poseWalker(b.userData, b.userData.gait, 0.15); } if (b.userData.parts.flames) b.userData.parts.flames.forEach(f => f.scale.set(1, 0.7 + Math.random() * 0.7, 1)); });
  }
  aimAssist(dt); updEffects(dt); updDebris(dt); updWeather(dt); lavaMat.emissiveMap.offset.x += dt * 0.03; lavaMat.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.002) * 0.25; musicTick(dt);
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
  placeMenuBots();
}).catch(e => { console.error(e); $("best").textContent = "Couldn't load the 3D models. Check your connection and reload."; });
function placeMenuBots() {
  if (!ASSETS.robot || mode) return; hideMenuBots();
  for (const [t, x, z, yaw, anim] of [["boss", -6, -30, 0.25, "Idle"], ["walker", 9, -34, -0.3, ""], ["grunt", -5, -18, 0.4, "Idle"], ["sniper", 6, -19, -0.5, "Idle"], ["bulwark", 1.5, -14, 0.1, "Walking"]]) {
    const m = makeRobot(t); m.position.set(x, groundAt(x, z, 20), z); m.rotation.y = yaw; const u = m.userData; if (u.mixer) { if (anim !== "Idle") robotBase(u, anim); u.mixer.update(rand(0, 2)); } menuBots.push(m);
  }
}
function hideMenuBots() { menuBots.splice(0).forEach(m => { scene.remove(m); scene.remove(m.userData.bar); }); }
function myGlow() { return me.odT > 0 ? 0xffaa20 : me.skinT > 0 ? 0x5a8aff : buff("rage") ? 0xff2020 : 0; }
buildArena(arenaCfg);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// test hooks
window.__it = { playCine, G, me, mate, input, camera, chestOf, enemies, H, pickups, chests, hostSpawnEnemy, hostDamageEnemy, get barrels() { return barrels; }, hazards, lasers, corpses, ASSETS, MUS, TRACKS, scene, startHazard, hitBarrel, giveItem, buildArena, get arenaCfg() { return arenaCfg; }, get curA() { return world.userData.a || null; }, ST, recalc, hostChest, rockets, boxes, get mode() { return mode; }, get quality() { return quality; }, set surv(v) { mySurv = v; } };
$("verTag") && ($("verTag").textContent = "VERSION " + BUILD + (FIXED_CODE ? " · CODE " + FIXED_CODE : ""));
