# 👾 Space Invaders - Multiplayer Arcade

A classic, faithful recreation of the 1978 arcade phenomenon **Space Invaders**, built for instant drop-in cooperative multiplayer.

---

## ⚡ Quick Start

### 1. Start the Server
```bash
npm start
```
*(Default port: **4000**)*

### 2. Join & Play!
- **On this computer:** Open [http://localhost:4000](http://localhost:4000)
- **On other devices (Phones, Laptops, Tablets on same Wi-Fi):** Open `http://<Your-IP>:4000` (e.g. `http://192.168.1.126:4000`)
- **Single Keyboard 2-Player:** Click the **`👥 ADD LOCAL P2`** button in the bottom toolbar to play 2-player on the same keyboard!

### 3. Play Across the Internet with Friends
Want friends outside your house to join without deploying to the cloud? Run a secure tunnel:
- **Instant (No install/signup):** In a second terminal, run:
  ```bash
  npm run tunnel
  ```
  *(or `npx localtunnel --port 4000`)* and share the generated link!
- **Cloudflare Tunnel (Best speed & zero latency):**
  ```powershell
  npm run cloudflare
  ```
  *(or `cloudflared tunnel --url http://localhost:4000`)*
  Generates a free global `https://*.trycloudflare.com` link with native WebSocket acceleration!

---

## 🕹️ Controls

| Control Scheme | Move Left | Move Right | Fire Cannon |
| :--- | :--- | :--- | :--- |
| **Player 1 (Solo / Online)** | `A` or `◀` | `D` or `▶` | `SPACE` or `W` or `▲` |
| **Player 2 (Local Split-Keyboard)** | `◀` | `▶` | `ENTER` or `▲` |
| **Mobile / Tablets** | ◀ On-Screen Button | ▶ On-Screen Button | 💥 FIRE Button |

---

## 👾 Classic Rules & Game Mechanics

- **55-Invader Swarm (11 Columns x 5 Rows):**
  - **Top Row:** 11 × Squid (30 PTS each, animated tentacles)
  - **Middle Rows:** 22 × Crab (20 PTS each, animated claws)
  - **Bottom Rows:** 22 × Octopus (10 PTS each, animated arms)
- **Accelerating March & Heartbeat:**
  - Invaders march left-to-right, drop down upon hitting edges, and reverse direction.
  - As invaders are destroyed, march speed ramps up exponentially down to a frenetic sprint for the last survivor!
  - 4-note descending procedural 8-bit heartbeat rhythm accelerates in sync with the swarm.
- **4 Destructible Defense Bunkers:**
  - Classic arch-shaped shields with real-time destructible pixel grids.
  - Carved away by player missiles from below, alien bombs from above, and dissolved if invaders reach them.
- **Mystery UFO / Flying Saucer:**
  - Periodically glides across the top of the screen accompanied by a high-pitched warble siren.
  - Scoring mystery bonus: **50, 100, 150, or 300 points**!
- **Alien Bomb Attacks:**
  - Bottom-most alive aliens drop rolling, plunger, and squiggly bombs.
  - Mid-air bullet collisions: Player missiles and alien bombs can collide and cancel each other out!
- **Earth Invasion (Loss Condition):**
  - If any alien reaches the defense baseline, Earth is conquered immediately!
  - If all squad pilots lose their lives, game is over.
- **Squad Bonus & Wave Progression:**
  - Clearing all invaders advances to the next wave with restored bunkers and +1 bonus life for all surviving pilots!

---

## 👥 Multiplayer Features (Zero-Friction Drop-in)

- **Instant URL Joining:** Anyone opening the link immediately joins the active squad with their own cannon on the shared defense line.
- **No Accounts Required:** No logins, passwords, or setup needed.
- **Custom Pilot Call-signs & Colors:** Pick your favorite neon color (Neon Green, Cyber Cyan, Hot Magenta, Solar Gold, Blaze Orange, Hyper Purple, Ice White).
- **Squad Leaderboard & MVP Tracker:** Tracks scores and kills per pilot, crowning the squad MVP.
- **Quick Radio Transmissions:** Send in-game radio emotes (`👾 UFO!`, `🔥 NICE!`, `🛡️ DEFEND`, `💥 HELP!`).
- **Retro CRT Mode:** Authentic phosphor scanlines and arcade screen curvature (can be toggled ON/OFF).
- **Procedural 8-bit Web Audio:** Zero external audio dependencies—all sound effects are synthesized live using the Web Audio API.
# space-invaders
