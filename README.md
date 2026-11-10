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
- **FIRE / JUMP / SWAP** buttons. Green rings are jump pads to the high ground.
- Keyboard and mouse also work: WASD, mouse (click to lock), Space, Q, B.

## The game
- **Robots:** drones (fly and snipe), grunts (shoot bolts), rushers (charge and explode), tanks (lob mortars from wave 4), and a **boss every 5 waves**.
- **Scrap ⬢** comes from kills and from clearing waves. Between waves, open **Upgrades** to buy the Scattergun, Rail Gun (pierces) or Rocket Launcher (splash and rocket jumps), plus damage, fire rate, max health, plating, speed, ammo and repairs.
- **Down, not out:** at 0 health you go down. Your partner revives you by standing next to you for 3 seconds. You bleed out after 25 seconds, and everyone comes back when the wave is cleared. If you're both down, it's game over.
- Robots get tougher every wave and hit harder in co-op.

## Tech
- Plain static site: `index.html` + `game.js` (ES module), Three.js r170 with bloom (`lib/`), PeerJS for the peer-to-peer link (`lib/peerjs.min.js`, MIT).
- The host phone simulates robots, waves and pickups. Each phone owns its own player (movement, health, hit detection, favouring the shooter) and sends ~20 updates/s.
- Quality drops automatically (bloom, then shadows) if a phone can't hold the frame rate. `?lowfx=1` forces low effects, and `?ps=host:port` uses your own PeerJS server.
