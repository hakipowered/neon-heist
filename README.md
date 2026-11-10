# Neon Heist

A fast online 1v1 arena duel for two phones. Built for Galaxy Z Fold phones: the arena re-fits instantly when you fold, unfold or rotate.

## How to play
- **Move:** touch anywhere and drag (a joystick appears under your thumb).
- **Dash:** the pink button. You hold 2 charges that refill over time.
- **Ram:** dash into your rival to steal a quarter of their cores. One comes straight to you, the rest scatter.
- **Cores** = 1, **Prisms** = 5 (they vanish fast).
- **Pickups:** 🛡 Shield (blocks one ram and stuns the attacker), ⚡ Overdrive (faster, quicker dash refills), 🧲 Magnet (pulls cores in).
- **Black hole** opens with 35s left: it pulls you in, and touching it costs a third of your cores.
- **Last 15s:** everything is worth double. Win 2 of 3 rounds to take the match.

## Install on Android (both phones)
1. Open the game link in **Chrome**.
2. Tap the **⋮** menu, then **Add to Home screen** (or **Install app**).
3. Launch it from the home screen icon. It runs full screen.

## Play online
1. Player 1 taps **Create match** and gets a 4-letter code (or taps **Share code** to send a link).
2. Player 2 taps **Join match** and types the code (or just opens the shared link).
3. The match starts as soon as both are connected. The creator can tap **Rematch** at the end.

Works on Wi-Fi or mobile data, in any country. No accounts, no ads, no cost.

## How it works (tech)
- One static web page (`index.html`), no server of our own.
- Phones connect directly peer-to-peer with WebRTC via PeerJS (`peerjs.min.js`, MIT). The free PeerJS cloud service only introduces the two phones (and relays traffic if a direct link is impossible).
- The match creator's phone runs the game simulation; the other phone sends its controls and draws what it receives (30 updates/s, smoothed).
- `sw.js` + `manifest.webmanifest` make it installable and fast to open.
- Testing tip: `?ps=localhost:9000` points it at your own PeerJS server.
