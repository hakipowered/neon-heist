# Iron Tide

Online co-op third-person shooter for two Android phones. You and your partner hold a neon arena against waves of killer robots. Built for Galaxy Z Fold phones, so the view re-fits when you fold, unfold or rotate.

**Play:** https://hakipowered.github.io/neon-heist/
(The older 2D duel, Neon Heist, is still at `/classic/`.)

## Install on Android (both phones)
1. Open the link in **Chrome**.
2. Tap **⋮**, then **Add to Home screen** (or **Install app**).
3. Launch it from the new icon. It runs full screen. Landscape plays best, but portrait works too.

## Start a co-op game
1. One player taps **Host co-op game** and gets a 4-letter code (**Share code** sends a link).
2. The other taps **Join co-op game** and enters the code, or opens the shared link.
3. Wave 1 starts 5 seconds later. **Play solo** works offline-style with no partner.

## Controls
- **Left side of the screen:** drag to move.
- **Right side:** drag to aim. You can also drag on the FIRE button to aim while shooting. Light aim assist is on for touch.
- **FIRE / JUMP / SWAP**, plus **DASH** (quick dodge that shots pass through), **NADE** (bouncing grenade) and the **Overdrive** button (the % ring).
- Green rings are jump pads to the high ground. Red barrels explode.
- Keyboard and mouse also work: WASD, mouse (click to lock), Space jump, Shift dash, G or right-click grenade, F Overdrive, Q swap, B upgrades.

## The game
- **Robots**
  - **Troopers** flank you in squads, fire bursts, dodge-roll, and fall back to cover when hurt.
  - **Snipers** paint you with a red laser before firing. Break line of sight or dash. A ⚠ on the screen edge shows where they are.
  - **Bulwarks** carry a front energy shield. Hit them from the side or behind, or use explosives.
  - **Rushers** flash and beep before they blow up.
  - **Mortar tanks** mark where their shells will land.
  - **Drones** strafe from the air.
  - From wave 6, **gold elites** are tougher and pay double.
- **Titan boss (every 5th wave):** its head is a weak point. Below two thirds of its health it sweeps a laser (jump it or hide behind cover). Below one third it also slams shockwaves along the ground (jump them).
- **Headshots** do double damage. Quick kills build a **kill streak** that multiplies your scrap, up to x3.
- **Overdrive** charges as you deal damage. It gives 8 seconds of double damage, faster fire, infinite ammo and half damage taken.
- **Scrap ⬢** comes from kills and from clearing waves. Between waves, open **Upgrades** to buy:
  - Weapons: the Scattergun, the Rail Gun (pierces) and the Rocket Launcher (splash damage and rocket jumps).
  - Upgrades: damage, fire rate, max health, plating, speed, ammo and repairs.
- **Down, not out:** at 0 health you go down. Your partner revives you by standing next to you for 3 seconds. You bleed out after 25 seconds, and everyone comes back when the wave is cleared. If you're both down, it's game over.

## Tech
- Plain static site: `index.html` + `game.js` (ES module).
- Rendering: Three.js r170 (`lib/`) with MSAA, bloom, ACES tone mapping and soft shadows.
- Networking: PeerJS for the peer-to-peer link (`lib/peerjs.min.js`, MIT).
- Characters:
  - Players: the animated soldier from the Three.js examples (`assets/Soldier.glb`), with a code-driven aiming pose (IK arms that follow your aim).
  - Robots: RobotExpressive by Tomás Laulhé (CC0, `assets/RobotExpressive.glb`), recoloured per class.
- Arena textures, the sky panorama, the recorded sound effects and the voice lines were generated for this game. The music is synthesised live in the browser.
- How the two phones split the work:
  - The host phone simulates robots, waves, pickups and barrels.
  - Each phone owns its own player: movement, health and hit detection, which favours the shooter. Boss lasers and shockwaves are also checked on your own phone, so jumps register fairly.
- Quality drops automatically if a phone can't hold the frame rate: bloom goes first, then shadows. `?lowfx=1` forces low effects, and `?ps=host:port` uses your own PeerJS server.
