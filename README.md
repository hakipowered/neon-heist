# Iron Tide

Online co-op third-person shooter for two Android phones. You and your partner hold a neon arena against waves of killer robots. Built for Galaxy Z Fold phones, so the view re-fits when you fold, unfold or rotate.

**Play:** https://hakipowered.github.io/neon-heist/
(Older versions stay playable: the previous version is at `/v2/`, the first 3D version at `/v1/`, and the 2D duel, Neon Heist, at `/classic/`.)

## Install on Android (both phones)
1. Open the link in **Chrome**.
2. Tap **⋮**, then **Add to Home screen** (or **Install app**).
3. Launch it from the new icon. It runs full screen. Landscape plays best, but portrait works too.

## Start a co-op game
1. Both players pick a **survivor**. The host also picks the **arena**, weather and time of day.
2. One player taps **Host co-op game** and gets a 4-letter code (**Share code** sends a link).
3. The other taps **Join co-op game** and enters the code, or opens the shared link.
4. Between waves there is no timer. The next wave starts when **both players press READY**. **Play solo** works with no partner.

## Survivors
Each has its own weapon and three abilities (secondary, utility, special):
- **Vanguard:** pulse rifle, frag grenade, combat dash, Overdrive.
- **Breacher:** shotgun, concussion blast, jet jump with ground slam, Iron Skin.
- **Marksman:** rail rifle that pierces, shock mines, cloak (next shot crits), Lance.
- **Demolisher:** grenade launcher, cluster bomb, rocket jump, homing missile barrage.

## Items and crates
- Crates appear around the arena after each wave. Walk up and press **USE (E)** to open one with scrap. Bosses drop a free legendary cache for each player.
- 21 items in three rarities (white, green, red) that stack, for example extra crit, chain lightning, homing missiles, lifesteal, a regenerating shield, and a one-time revive.
- The **Armory (B)** offers three items per break (buy one), plus reroll and repair.
- Kills give XP. Each level adds damage and health.
- Robots sometimes drop power-ups: **Rage** (more damage), **Haste** (speed and fire rate) and **Aegis** (damage shield).

## Arenas
Neon Rooftop, Downtown (a rainy city block with skyscrapers, wrecked cars, a bus and neon signs; climb the stairs or jump pads to the rooftops), Molten Foundry (lava and catwalks), Frost Yard (shipping containers) and Desert Ruins. Each can have clear, rain, snow or storm weather, and day, dusk or night lighting.

## Controls
- **Left side of the screen:** drag to move.
- **Right side:** drag to aim. Aim assist is on for touch: while you hold FIRE, the camera pulls onto the robot nearest the crosshair.
- **FIRE / JUMP** plus the three ability buttons, **USE** for crates and **READY** between waves.
- Green rings are jump pads to the high ground. Red barrels explode.
- Keyboard and mouse: WASD, mouse (click to lock), Space jump, G/right-click secondary, Shift utility, F special, E use, R ready, B armory.

## Robots and bosses
- Robots start out slow and inaccurate and get faster, sharper and quicker to react each wave (fully by wave 15). They patrol until they spot you nearby or get shot, and they need a clear line to your chest to fire, so waist-high cover protects you.
- **Leapers** are spider bots that pounce and bite. **Arc Troopers** fire slow plasma orbs you can sidestep.
- **Troopers** flank in squads. **Snipers** paint you with a red laser first. **Bulwarks** carry a front shield, but their head sticks out above it. **Rushers** blow up. **Mortar tanks** mark where shells land. **Drones** strafe from the air. From wave 6, **gold elites** pay double.
- **Every 5th wave is a boss**, alternating between:
  - **The Titan:** a horned, armored giant. Its head is the weak point. It sweeps a laser and slams shockwaves (jump them).
  - **The Siege Walker:** a four-legged gun platform. Shoot the red dome on top. It fires twin cannon bursts and mortar volleys, stomps, and calls in reinforcements.
  - From wave 20 both come at once.
- **Down, not out:** at 0 health you go down. Your partner revives you by standing next to you for 3 seconds.

## Tech
- Plain static site: `index.html` + `game.js` (ES module).
- Rendering: Three.js r170 (`lib/`) with MSAA, bloom, ACES tone mapping and soft shadows.
- Networking: PeerJS for the peer-to-peer link (`lib/peerjs.min.js`, MIT).
- Characters:
  - Players: the animated soldier from the Three.js examples (`assets/Soldier.glb`), with a code-driven aiming pose (IK arms that follow your aim).
  - Robots: RobotExpressive by Tomás Laulhé (CC0, `assets/RobotExpressive.glb`), recoloured per class.
- Arena textures, the sky panorama, the recorded sound effects and the voice lines were generated for this game. The music tracks (calm and combat, crossfaded by the action) were also generated for this game, with a live-synthesised fallback.
- How the two phones split the work:
  - The host phone simulates robots, waves, pickups and barrels.
  - Each phone owns its own player: movement, health and hit detection, which favours the shooter. Boss lasers and shockwaves are also checked on your own phone, so jumps register fairly.
- Quality drops automatically if a phone can't hold the frame rate: bloom goes first, then shadows. `?lowfx=1` forces low effects, and `?ps=host:port` uses your own PeerJS server.
