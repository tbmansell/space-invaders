const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');
const { createBunkerTemplate } = require('./public/js/sprites.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4000;

// High score persistence
const HIGH_SCORE_FILE = path.join(__dirname, 'highscore.json');
let highScore = 9990;
try {
  if (fs.existsSync(HIGH_SCORE_FILE)) {
    const data = JSON.parse(fs.readFileSync(HIGH_SCORE_FILE, 'utf-8'));
    if (typeof data.highScore === 'number') {
      highScore = data.highScore;
    }
  }
} catch (e) {
  console.warn('Could not read highscore file, using default');
}

function saveHighScore(score) {
  if (score > highScore) {
    highScore = score;
    try {
      fs.writeFileSync(HIGH_SCORE_FILE, JSON.stringify({ highScore }, null, 2));
    } catch (e) {}
  }
}

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Network IP helper
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();


// ==========================================
// GAME STATE & CONSTANTS
// ==========================================
const GAME_WIDTH = 800;
const GAME_HEIGHT = 850;
const BASELINE_Y = 750;
const BUNKER_Y = 630;
const INVADER_COLS = 11;
const INVADER_ROWS = 5;

// Bunker layout: 4 bunkers
const BUNKER_CELL_SIZE = 3;
const BUNKER_COLS = 22;
const BUNKER_ROWS = 16;
const BUNKER_WIDTH = BUNKER_COLS * BUNKER_CELL_SIZE;   // 66 px
const BUNKER_HEIGHT = BUNKER_ROWS * BUNKER_CELL_SIZE; // 48 px
const BUNKER_X_POSITIONS = [100, 275, 455, 635];

// Color palette for auto-assigning players
const PLAYER_COLORS = [
  { name: 'Neon Green', hex: '#00ff66' },
  { name: 'Cyber Cyan', hex: '#00e5ff' },
  { name: 'Hot Magenta', hex: '#ff007f' },
  { name: 'Solar Gold', hex: '#ffd700' },
  { name: 'Blaze Orange', hex: '#ff6600' },
  { name: 'Hyper Purple', hex: '#b026ff' },
  { name: 'Ice White', hex: '#e0f7fa' }
];

const UFO_COLORS = ['#ff3344', '#00e5ff', '#ffd700', '#00ff66', '#b026ff', '#ff007f'];
const BOSS_COLORS = ['#ff0055', '#00e5ff', '#ffd700', '#b026ff', '#00ff66'];
const POWERUP_TYPES = ['rapid_fire', 'super_speed', 'fast_move', 'shield', 'triple_shot', 'rocket_launcher'];

class GameEngine {
  constructor() {
    this.status = 'playing'; // 'playing', 'wave_cleared', 'game_over'
    this.wave = 1;
    this.players = {}; // id -> player object
    this.bullets = []; // player shots
    this.bombs = [];   // invader shots
    this.bunkers = []; // 4 bunkers
    this.invaders = []; // 55 invaders
    this.aliveCount = 55;
    this.marchDir = 1; // 1 = right, -1 = left
    this.marchStepTimer = 0;
    this.marchStepInterval = 800;
    this.marchBeat = 0;
    this.animFrame = 0;
    
    // UFO (5 random types and vibrant colors)
    this.ufo = {
      active: false,
      x: -60,
      y: 75,
      width: 48,
      height: 21,
      speed: 120,
      dir: 1,
      type: 0,
      color: '#ff3344'
    };
    this.ufoTimer = 0;
    this.ufoSpawnInterval = 25000; // 25s

    // Falling Power-up Drops
    this.powerups = [];

    // Boss Enemy above the horde (Takes 20 hits, moves with horde, 3-way attacks)
    this.boss = {
      alive: true,
      type: 0,
      color: '#ff0055',
      x: 364,
      y: 50,
      width: 72,
      height: 36,
      hp: 20,
      maxHp: 20,
      flashTimer: 0,
      shootTimer: 0,
      shootInterval: 3000
    };

    // Alien Bomb timer
    this.bombTimer = 0;
    this.bombInterval = 1400; // drops every 1.4s

    // Galaxian breakaway dive bomber timer (randomized between 3-10s)
    this.diveBombTimer = 0;
    this.diveBombInterval = 3000 + Math.random() * 7000;

    // Intermission timer for wave clear / game over
    this.intermissionTimer = 0;

    // Ephemeral events for sound and effects
    this.events = [];

    this.resetBunkers();
    this.spawnInvaders();
    this.initBoss();
  }

  resetBunkers() {
    this.bunkers = BUNKER_X_POSITIONS.map(x => ({
      x,
      y: BUNKER_Y,
      width: BUNKER_WIDTH,
      height: BUNKER_HEIGHT,
      grid: createBunkerTemplate()
    }));
  }

  spawnInvaders() {
    this.invaders = [];
    // Start Y descends slightly on higher waves (capped at y = 260)
    const startY = Math.min(260, 110 + (this.wave - 1) * 20);
    const startX = 130;
    const spacingX = 48;
    const spacingY = 38;

    for (let r = 0; r < INVADER_ROWS; r++) {
      let type = 'octopus';
      let points = 10;
      let width = 36;
      let height = 24;

      if (r === 0) {
        type = 'squid';
        points = 30;
        width = 24;
        height = 24;
      } else if (r === 1 || r === 2) {
        type = 'crab';
        points = 20;
        width = 33;
        height = 24;
      }

      for (let c = 0; c < INVADER_COLS; c++) {
        const invX = startX + c * spacingX;
        const invY = startY + r * spacingY;
        this.invaders.push({
          id: `inv_${r}_${c}`,
          row: r,
          col: c,
          type,
          points,
          x: invX,
          y: invY,
          formationX: invX,
          formationY: invY,
          width,
          height,
          alive: true,
          diving: false,
          divePhase: null, // 'diving' | 'returning'
          diveTime: 0,
          diveParams: null,
          diveShootTimer: 0,
          shotsFired: 0,
          maxShots: 2,
          angle: 0
        });
      }
    }

    this.aliveCount = 55;
    this.marchDir = 1;
    this.marchStepTimer = 0;
    this.diveBombTimer = 0;
    this.diveBombInterval = 3000 + Math.random() * 7000;
    this.updateMarchInterval();
    this.marchBeat = 0;
    this.animFrame = 0;
  }

  updateMarchInterval() {
    // Classic acceleration: from ~800ms down to 60ms for last invader
    const ratio = Math.max(0, this.aliveCount - 1) / 54;
    // Speed increases slightly on later waves
    const baseMin = Math.max(50, 70 - (this.wave - 1) * 5);
    const baseMax = Math.max(350, 780 - (this.wave - 1) * 30);
    this.marchStepInterval = Math.round(baseMin + ratio * (baseMax - baseMin));
  }

  initBoss() {
    this.boss.alive = true;
    this.boss.type = Math.floor(Math.random() * 5);
    this.boss.color = BOSS_COLORS[this.boss.type % BOSS_COLORS.length];
    this.boss.hp = 20;
    this.boss.maxHp = 20;
    this.boss.flashTimer = 0;
    this.boss.shootTimer = 0;
    this.boss.shootInterval = Math.max(2000, 3200 - (this.wave - 1) * 200);
    this.updateBossPosition();
  }

  updateBossPosition() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let anyAlive = false;

    for (const inv of this.invaders) {
      if (inv.alive) {
        anyAlive = true;
        const fx = inv.formationX !== undefined ? inv.formationX : inv.x;
        const fy = inv.formationY !== undefined ? inv.formationY : inv.y;
        if (fx < minX) minX = fx;
        if (fx + inv.width > maxX) maxX = fx + inv.width;
        if (fy < minY) minY = fy;
      }
    }

    if (anyAlive) {
      this.boss.x = Math.round((minX + maxX) / 2 - this.boss.width / 2);
      this.boss.y = Math.max(45, Math.round(minY - this.boss.height - 16));
    }
  }

  spawnPowerup(x, y) {
    const pType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    this.powerups.push({
      id: `pw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: pType,
      x: Math.round(x - 10),
      y: Math.round(y),
      width: 20,
      height: 20,
      vy: 95
    });
    this.events.push({
      type: 'powerup_spawned',
      powerupType: pType,
      x: Math.round(x),
      y: Math.round(y)
    });
  }

  // Cross explosion triggered by Rocket Launcher missile: kills up to 1 alien on each side (top, bottom, left, right)
  triggerMissileSplash(blastX, blastY, shooterPlayerId, hitInvader = null) {
    this.events.push({
      type: 'rocket_explosion',
      x: Math.round(blastX),
      y: Math.round(blastY),
      radius: 48
    });

    const player = this.players[shooterPlayerId];
    let topCandidate = null;
    let bottomCandidate = null;
    let leftCandidate = null;
    let rightCandidate = null;

    let minTopDist = Infinity;
    let minBottomDist = Infinity;
    let minLeftDist = Infinity;
    let minRightDist = Infinity;

    for (const other of this.invaders) {
      if (!other.alive || (hitInvader && other.id === hitInvader.id)) continue;
      const otherCenterX = other.x + other.width / 2;
      const otherCenterY = other.y + other.height / 2;
      const dx = otherCenterX - blastX;
      const dy = otherCenterY - blastY;

      // TOP side: above the hit (dy < 0)
      const isGridTop = (hitInvader && !hitInvader.diving && !other.diving && other.row === hitInvader.row - 1 && other.col === hitInvader.col);
      if (isGridTop || (dy < -4 && Math.abs(dx) <= 32 && Math.abs(dy) <= 65)) {
        const dist = isGridTop ? 0 : Math.abs(dy);
        if (dist < minTopDist) {
          minTopDist = dist;
          topCandidate = other;
        }
      }

      // BOTTOM side: below the hit (dy > 0)
      const isGridBottom = (hitInvader && !hitInvader.diving && !other.diving && other.row === hitInvader.row + 1 && other.col === hitInvader.col);
      if (isGridBottom || (dy > 4 && Math.abs(dx) <= 32 && dy <= 65)) {
        const dist = isGridBottom ? 0 : dy;
        if (dist < minBottomDist) {
          minBottomDist = dist;
          bottomCandidate = other;
        }
      }

      // LEFT side: left of the hit (dx < 0)
      const isGridLeft = (hitInvader && !hitInvader.diving && !other.diving && other.row === hitInvader.row && other.col === hitInvader.col - 1);
      if (isGridLeft || (dx < -4 && Math.abs(dy) <= 28 && Math.abs(dx) <= 75)) {
        const dist = isGridLeft ? 0 : Math.abs(dx);
        if (dist < minLeftDist) {
          minLeftDist = dist;
          leftCandidate = other;
        }
      }

      // RIGHT side: right of the hit (dx > 0)
      const isGridRight = (hitInvader && !hitInvader.diving && !other.diving && other.row === hitInvader.row && other.col === hitInvader.col + 1);
      if (isGridRight || (dx > 4 && Math.abs(dy) <= 28 && dx <= 75)) {
        const dist = isGridRight ? 0 : dx;
        if (dist < minRightDist) {
          minRightDist = dist;
          rightCandidate = other;
        }
      }
    }

    const splashTargets = new Set();
    if (topCandidate) splashTargets.add(topCandidate);
    if (bottomCandidate) splashTargets.add(bottomCandidate);
    if (leftCandidate) splashTargets.add(leftCandidate);
    if (rightCandidate) splashTargets.add(rightCandidate);

    for (const sideInv of splashTargets) {
      sideInv.alive = false;
      const wasDiving = Boolean(sideInv.diving);
      sideInv.diving = false;
      sideInv.divePhase = null;
      this.aliveCount--;

      const pts = wasDiving ? sideInv.points * 2 : sideInv.points;
      if (player) {
        player.score += pts;
        player.kills++;
        saveHighScore(player.score);
      }

      this.events.push({
        type: 'invader_hit',
        x: Math.round(sideInv.x + sideInv.width / 2),
        y: Math.round(sideInv.y + sideInv.height / 2),
        points: pts,
        invaderType: sideInv.type,
        playerId: shooterPlayerId,
        wasDiving,
        isRocketSplash: true
      });
    }

    if (splashTargets.size > 0) {
      this.updateMarchInterval();
    }

    if (this.aliveCount === 0 && !this.boss.alive) {
      this.status = 'wave_cleared';
      this.intermissionTimer = 3000;
      this.events.push({ type: 'wave_clear', wave: this.wave });
    }
  }

  addPlayer(id, name, color) {
    const existingCount = Object.keys(this.players).length;
    // Space players out across baseline
    const initialX = 150 + (existingCount % 5) * 120;

    this.players[id] = {
      id,
      name: name || `Pilot ${existingCount + 1}`,
      color: color || PLAYER_COLORS[existingCount % PLAYER_COLORS.length].hex,
      x: initialX,
      y: BASELINE_Y,
      width: 39,
      height: 24,
      speed: 300,
      lives: 3,
      score: 0,
      kills: 0,
      alive: true,
      powerups: {},
      respawnTimer: 0,
      invulnerableTimer: 2000,
      inputs: { left: false, right: false, shoot: false },
      lastAckSeq: 0,
      predictedX: initialX,
      lastShootTime: 0
    };

    // If game was gameover and a player joins, restart fresh
    if (this.status === 'game_over') {
      this.restartGame();
    }
  }

  removePlayer(id) {
    delete this.players[id];
    // Remove their active bullets
    this.bullets = this.bullets.filter(b => b.playerId !== id);
    
    // If no players remain, reset to waiting state
    if (Object.keys(this.players).length === 0) {
      this.status = 'playing';
      this.wave = 1;
      this.resetBunkers();
      this.spawnInvaders();
      this.initBoss();
      this.bombs = [];
      this.bullets = [];
      this.powerups = [];
      this.ufo.active = false;
    }
  }

  handleInput(id, inputs) {
    const player = this.players[id];
    if (!player) return;
    player.inputs = {
      left: Boolean(inputs.left),
      right: Boolean(inputs.right),
      shoot: Boolean(inputs.shoot)
    };
    if (typeof inputs.seq === 'number') {
      player.lastAckSeq = inputs.seq;
    }
    if (typeof inputs.predictedX === 'number' && Number.isFinite(inputs.predictedX)) {
      const boundedX = Math.max(30, Math.min(GAME_WIDTH - player.width - 30, inputs.predictedX));
      // Dodge leniency sanity check: ensure predicted position is within reasonable drift (<180px)
      if (Math.abs(boundedX - player.x) < 180) {
        player.predictedX = boundedX;
      }
    }
  }

  restartGame() {
    this.status = 'playing';
    this.wave = 1;
    this.bullets = [];
    this.bombs = [];
    this.powerups = [];
    this.ufo.active = false;
    this.ufoTimer = 0;
    this.resetBunkers();
    this.spawnInvaders();
    this.initBoss();

    for (const p of Object.values(this.players)) {
      p.lives = 3;
      p.score = 0;
      p.kills = 0;
      p.alive = true;
      p.powerups = {};
      p.respawnTimer = 0;
      p.invulnerableTimer = 2000;
    }

    this.events.push({ type: 'game_restart' });
  }

  damageBunker(bunkerIndex, hitX, hitY, radiusCells = 3) {
    const bunker = this.bunkers[bunkerIndex];
    if (!bunker) return;

    // Convert world hit coords to bunker grid cells
    const cellX = Math.floor((hitX - bunker.x) / BUNKER_CELL_SIZE);
    const cellY = Math.floor((hitY - bunker.y) / BUNKER_CELL_SIZE);

    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        if (dx * dx + dy * dy <= radiusCells * radiusCells) {
          const gx = cellX + dx;
          const gy = cellY + dy;
          if (gy >= 0 && gy < BUNKER_ROWS && gx >= 0 && gx < BUNKER_COLS) {
            // Add slight jagged organic crater noise
            if (Math.random() > 0.15) {
              bunker.grid[gy][gx] = 0;
            }
          }
        }
      }
    }
  }

  checkBunkerCollision(x, y, radius = 4) {
    for (let i = 0; i < this.bunkers.length; i++) {
      const b = this.bunkers[i];
      if (
        x >= b.x - 2 &&
        x <= b.x + b.width + 2 &&
        y >= b.y - 2 &&
        y <= b.y + b.height + 2
      ) {
        const cx = Math.floor((x - b.x) / BUNKER_CELL_SIZE);
        const cy = Math.floor((y - b.y) / BUNKER_CELL_SIZE);
        if (cy >= 0 && cy < BUNKER_ROWS && cx >= 0 && cx < BUNKER_COLS) {
          if (b.grid[cy][cx] === 1) {
            return i;
          }
        }
      }
    }
    return -1;
  }

  // Main 60 FPS update
  tick(dt) {
    const dtSeconds = dt / 1000;

    // 1. Handle Game Statuses
    if (this.status === 'wave_cleared') {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) {
        this.wave++;
        this.spawnInvaders();
        this.initBoss();
        this.resetBunkers();
        this.bombs = [];
        this.bullets = [];
        this.powerups = [];
        // Grant +1 extra life to surviving players and retain power-ups across waves
        for (const p of Object.values(this.players)) {
          if (p.lives < 5) p.lives++;
          p.alive = true;
          // Retain active power-ups between waves as game escalates in difficulty
          if (!p.powerups) p.powerups = {};
          p.respawnTimer = 0;
          p.invulnerableTimer = 2500;
        }
        this.status = 'playing';
        this.events.push({ type: 'wave_start', wave: this.wave });
      }
      return;
    }

    if (this.status === 'game_over') {
      // Waiting for restart
      return;
    }

    // 2. Update Players
    for (const player of Object.values(this.players)) {
      if (!player.alive) {
        if (player.lives > 0) {
          player.respawnTimer -= dt;
          if (player.respawnTimer <= 0) {
            player.alive = true;
            player.invulnerableTimer = 2500;
            player.x = Math.max(50, Math.min(GAME_WIDTH - 80, player.x));
          }
        }
        continue;
      }

      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer -= dt;
      }

      // Movement (Power-up: Fast Movement = 50% more speed)
      const currentSpeed = (player.powerups && player.powerups.fast_move) ? 450 : 300;
      if (player.inputs.left && !player.inputs.right) {
        player.x -= currentSpeed * dtSeconds;
      } else if (player.inputs.right && !player.inputs.left) {
        player.x += currentSpeed * dtSeconds;
      }

      // Bound to defense baseline
      player.x = Math.max(30, Math.min(GAME_WIDTH - player.width - 30, player.x));

      // Shooting (Power-up: Faster Firing = double shots & half cooldown)
      let maxActiveBullets = Object.keys(this.players).length === 1 ? 2 : 1;
      if (player.powerups && player.powerups.rapid_fire) {
        maxActiveBullets *= 2;
      }
      const playerBullets = this.bullets.filter(b => b.playerId === player.id).length;
      const minCooldown = (player.powerups && player.powerups.rapid_fire) ? 150 : 300;

      if (player.inputs.shoot && playerBullets < maxActiveBullets) {
        const now = Date.now();
        if (now - player.lastShootTime > minCooldown) {
          player.lastShootTime = now;
          const spawnX = (typeof player.predictedX === 'number' && Math.abs(player.predictedX - player.x) < 120)
            ? player.predictedX
            : player.x;

          // Power-up: Super Shot Speed = twice the speed (1040 vs 520)
          const bulletSpeed = (player.powerups && player.powerups.super_speed) ? 1040 : 520;
          const isMissile = Boolean(player.powerups && player.powerups.rocket_launcher);
          const bulletWidth = isMissile ? 6 : 4;
          const bulletHeight = isMissile ? 14 : 12;
          const bulletBaseX = Math.round(spawnX + player.width / 2 - bulletWidth / 2);
          const bulletBaseY = player.y - 8;
          const bulletColor = isMissile ? '#ff4400' : player.color;

          // Power-up: 3-way shot (up, 45 degrees left, 45 degrees right)
          if (player.powerups && player.powerups.triple_shot) {
            // Center bullet (Straight up)
            this.bullets.push({
              id: `b_${Date.now()}_c_${Math.random()}`,
              playerId: player.id,
              color: bulletColor,
              x: bulletBaseX,
              y: bulletBaseY,
              width: bulletWidth,
              height: bulletHeight,
              vx: 0,
              vy: -bulletSpeed,
              speed: bulletSpeed,
              isMissile
            });
            // Left bullet (45 degrees left)
            this.bullets.push({
              id: `b_${Date.now()}_l_${Math.random()}`,
              playerId: player.id,
              color: bulletColor,
              x: bulletBaseX,
              y: bulletBaseY,
              width: bulletWidth,
              height: bulletHeight,
              vx: -bulletSpeed * 0.707,
              vy: -bulletSpeed * 0.707,
              speed: bulletSpeed,
              isMissile
            });
            // Right bullet (45 degrees right)
            this.bullets.push({
              id: `b_${Date.now()}_r_${Math.random()}`,
              playerId: player.id,
              color: bulletColor,
              x: bulletBaseX,
              y: bulletBaseY,
              width: bulletWidth,
              height: bulletHeight,
              vx: bulletSpeed * 0.707,
              vy: -bulletSpeed * 0.707,
              speed: bulletSpeed,
              isMissile
            });
          } else {
            // Standard single missile/bullet
            this.bullets.push({
              id: `b_${Date.now()}_${Math.random()}`,
              playerId: player.id,
              color: bulletColor,
              x: bulletBaseX,
              y: bulletBaseY,
              width: bulletWidth,
              height: bulletHeight,
              vx: 0,
              vy: -bulletSpeed,
              speed: bulletSpeed,
              isMissile
            });
          }

          this.events.push({ type: 'player_shoot', playerId: player.id, isMissile });
        }
      }
    }

    // 3. Update Invader March
    if (this.aliveCount > 0) {
      this.marchStepTimer += dt;
      if (this.marchStepTimer >= this.marchStepInterval) {
        this.marchStepTimer = 0;
        this.stepInvaders();
      }
    }

    // 4. Update Invader Bomb Attacks
    this.bombTimer += dt;
    const targetBombInterval = Math.max(600, 1500 - (this.wave - 1) * 80 - (Object.keys(this.players).length - 1) * 150);
    const maxActiveBombs = 3 + Math.min(5, Object.keys(this.players).length * 2);

    if (this.bombTimer >= targetBombInterval && this.bombs.length < maxActiveBombs && this.aliveCount > 0) {
      this.bombTimer = 0;
      this.dropInvaderBomb();
    }

    // 4.1. Update Galaxian Breakaway Dive-Bombers (randomized 3-10s, overlapping allowed)
    if (this.aliveCount > 0) {
      this.diveBombTimer += dt;
      if (this.diveBombTimer >= this.diveBombInterval) {
        this.diveBombTimer = 0;
        this.diveBombInterval = 3000 + Math.random() * 7000;
        this.triggerDiveAttack();
      }
      this.updateDivingInvaders(dt);
    }

    // 4.5. Update Boss Enemy above the horde
    if (this.boss.alive) {
      if (this.boss.flashTimer > 0) {
        this.boss.flashTimer -= dt;
      }

      // If all invaders in horde are dead, boss marches on its own fast and descends down the screen
      if (this.aliveCount === 0) {
        // Toggle animation frame during solo boss march
        this.bossAnimTimer = (this.bossAnimTimer || 0) + dt;
        if (this.bossAnimTimer >= 220) {
          this.bossAnimTimer = 0;
          this.animFrame = this.animFrame === 0 ? 1 : 0;
        }

        // Fast endgame boss speed (stays fast like the last invader, scaling with wave)
        const hpPercent = Math.max(0, this.boss.hp / this.boss.maxHp);
        const enrageSpeedBonus = (1 - hpPercent) * 50; // extra burst speed as boss takes damage
        const bossSpeed = Math.min(340, 260 + (this.wave - 1) * 20 + enrageSpeedBonus);

        if (this.marchDir !== -1 && this.marchDir !== 1) {
          this.marchDir = 1;
        }

        this.boss.x += this.marchDir * bossSpeed * dtSeconds;
        const bossDropDist = 24;

        if (this.marchDir > 0 && this.boss.x >= GAME_WIDTH - this.boss.width - 30) {
          this.boss.x = GAME_WIDTH - this.boss.width - 30;
          this.marchDir = -1;
          this.boss.y += bossDropDist;
          this.marchBeat = (this.marchBeat + 1) % 4;
          this.events.push({ type: 'march_step', beat: this.marchBeat });
        } else if (this.marchDir < 0 && this.boss.x <= 30) {
          this.boss.x = 30;
          this.marchDir = 1;
          this.boss.y += bossDropDist;
          this.marchBeat = (this.marchBeat + 1) % 4;
          this.events.push({ type: 'march_step', beat: this.marchBeat });
        }
      }

      // Boss 3-way attacks down occasionally (faster pace when alone)
      this.boss.shootTimer += dt;
      const effectiveShootInterval = this.aliveCount === 0
        ? Math.min(this.boss.shootInterval, Math.max(1600, 2200 - (this.wave - 1) * 150))
        : this.boss.shootInterval;
      if (this.boss.shootTimer >= effectiveShootInterval) {
        this.boss.shootTimer = 0;
        this.dropBoss3WayAttack();
      }
    }

    // 4.6. Update Falling Power-up Drops
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pw = this.powerups[i];
      pw.y += pw.vy * dtSeconds;

      // Bottom screen out of bounds
      if (pw.y > BASELINE_Y + 40) {
        this.powerups.splice(i, 1);
        continue;
      }

      // Collision check with alive players
      for (const player of Object.values(this.players)) {
        if (!player.alive) continue;
        if (
          pw.x + pw.width >= player.x &&
          pw.x <= player.x + player.width &&
          pw.y + pw.height >= player.y &&
          pw.y <= player.y + player.height
        ) {
          if (!player.powerups) player.powerups = {};
          player.powerups[pw.type] = true;
          this.powerups.splice(i, 1);

          this.events.push({
            type: 'powerup_collected',
            playerId: player.id,
            playerName: player.name,
            powerupType: pw.type,
            x: pw.x,
            y: pw.y
          });
          break;
        }
      }
    }

    // 5. Update Mystery UFO Hover Spaceships (Randomized between 5 types & colors)
    this.ufoTimer += dt;
    if (!this.ufo.active && this.ufoTimer >= this.ufoSpawnInterval && (this.aliveCount > 10 || this.boss.alive)) {
      this.ufoTimer = 0;
      this.ufo.active = true;
      this.ufo.type = Math.floor(Math.random() * 5);
      this.ufo.color = UFO_COLORS[Math.floor(Math.random() * UFO_COLORS.length)];
      this.ufo.dir = Math.random() > 0.5 ? 1 : -1;
      this.ufo.x = this.ufo.dir === 1 ? -this.ufo.width : GAME_WIDTH + 10;
      this.events.push({ type: 'ufo_spawn' });
    }

    if (this.ufo.active) {
      this.ufo.x += this.ufo.speed * this.ufo.dir * dtSeconds;
      if (this.ufo.dir === 1 && this.ufo.x > GAME_WIDTH + 20) {
        this.ufo.active = false;
        this.events.push({ type: 'ufo_despawn' });
      } else if (this.ufo.dir === -1 && this.ufo.x < -this.ufo.width - 20) {
        this.ufo.active = false;
        this.events.push({ type: 'ufo_despawn' });
      }
    }

    // 6. Update Player Bullets (Supports 3-way angled trajectories)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += (b.vx || 0) * dtSeconds;
      b.y += (b.vy !== undefined ? b.vy : -b.speed) * dtSeconds;

      // Hit ceiling or sides
      if (b.y < 35 || b.x < 10 || b.x > GAME_WIDTH - 10) {
        if (b.isMissile) {
          this.triggerMissileSplash(b.x + b.width / 2, b.y, b.playerId, null);
        }
        this.bullets.splice(i, 1);
        continue;
      }

      let bulletRemoved = false;

      // Check vs Boss Enemy (Takes 20 hits, flashes when hit)
      if (this.boss.alive && !bulletRemoved) {
        if (
          b.x + b.width >= this.boss.x &&
          b.x <= this.boss.x + this.boss.width &&
          b.y <= this.boss.y + this.boss.height &&
          b.y + b.height >= this.boss.y
        ) {
          bulletRemoved = true;
          this.bullets.splice(i, 1);
          const bossDamage = b.isMissile ? 3 : 1;
          this.boss.hp = Math.max(0, this.boss.hp - bossDamage);
          this.boss.flashTimer = 160;

          const player = this.players[b.playerId];
          if (player) {
            player.score += 50 * bossDamage;
            saveHighScore(player.score);
          }

          this.events.push({
            type: 'boss_hit',
            hp: this.boss.hp,
            maxHp: this.boss.maxHp,
            x: b.x,
            y: b.y
          });

          if (b.isMissile) {
            this.triggerMissileSplash(b.x + b.width / 2, b.y + b.height / 2, b.playerId, null);
          }

          if (this.boss.hp <= 0) {
            this.boss.alive = false;
            if (player) {
              player.score += 1000;
              player.kills += 5;
              saveHighScore(player.score);
            }
            this.events.push({
              type: 'boss_killed',
              x: this.boss.x + this.boss.width / 2,
              y: this.boss.y + this.boss.height / 2
            });

            // When a boss is killed they drop a power-up too!
            this.spawnPowerup(this.boss.x + this.boss.width / 2, this.boss.y + this.boss.height / 2);

            if (this.aliveCount === 0) {
              this.status = 'wave_cleared';
              this.intermissionTimer = 3000;
              this.events.push({ type: 'wave_clear', wave: this.wave });
            }
          }
          continue;
        }
      }

      // Check vs UFO Hover Spaceships
      if (this.ufo.active && !bulletRemoved) {
        if (
          b.x + b.width >= this.ufo.x &&
          b.x <= this.ufo.x + this.ufo.width &&
          b.y <= this.ufo.y + this.ufo.height &&
          b.y + b.height >= this.ufo.y
        ) {
          this.ufo.active = false;
          bulletRemoved = true;
          this.bullets.splice(i, 1);

          // Mystery scores
          const mysteryScores = [50, 100, 150, 300];
          const pts = mysteryScores[Math.floor(Math.random() * mysteryScores.length)];
          const player = this.players[b.playerId];
          if (player) {
            player.score += pts;
            saveHighScore(player.score);
          }

          this.events.push({
            type: 'ufo_hit',
            x: this.ufo.x + this.ufo.width / 2,
            y: this.ufo.y,
            points: pts,
            playerId: b.playerId
          });

          if (b.isMissile) {
            this.triggerMissileSplash(this.ufo.x + this.ufo.width / 2, this.ufo.y + 10, b.playerId, null);
          }

          // When hover ship is killed, drop a power-up!
          this.spawnPowerup(this.ufo.x + this.ufo.width / 2, this.ufo.y + 10);
          continue;
        }
      }

      // Check vs Invaders
      if (!bulletRemoved) {
        for (let inv of this.invaders) {
          if (!inv.alive) continue;
          if (
            b.x + b.width >= inv.x - 2 &&
            b.x <= inv.x + inv.width + 2 &&
            b.y <= inv.y + inv.height + 3 &&
            b.y + b.height >= inv.y - 2
          ) {
            inv.alive = false;
            const wasDiving = Boolean(inv.diving);
            inv.diving = false;
            inv.divePhase = null;
            this.aliveCount--;
            this.updateMarchInterval();
            bulletRemoved = true;
            this.bullets.splice(i, 1);

            const awardedPoints = wasDiving ? inv.points * 2 : inv.points;
            const player = this.players[b.playerId];
            if (player) {
              player.score += awardedPoints;
              player.kills++;
              saveHighScore(player.score);
            }

            this.events.push({
              type: 'invader_hit',
              x: Math.round(inv.x + inv.width / 2),
              y: Math.round(inv.y + inv.height / 2),
              points: awardedPoints,
              invaderType: inv.type,
              playerId: b.playerId,
              wasDiving
            });

            if (b.isMissile) {
              this.triggerMissileSplash(inv.x + inv.width / 2, inv.y + inv.height / 2, b.playerId, inv);
            }

            // Check if wave cleared (both horde and boss must be defeated)
            if (this.aliveCount === 0 && !this.boss.alive) {
              this.status = 'wave_cleared';
              this.intermissionTimer = 3000;
              this.events.push({ type: 'wave_clear', wave: this.wave });
            }
            break;
          }
        }
      }

      // Check vs Bunkers (from below)
      if (!bulletRemoved) {
        const bunkerHit = this.checkBunkerCollision(b.x + b.width / 2, b.y);
        if (bunkerHit !== -1) {
          const blastRadius = b.isMissile ? 8 : 3;
          this.damageBunker(bunkerHit, b.x + b.width / 2, b.y, blastRadius);
          if (b.isMissile) {
            this.triggerMissileSplash(b.x + b.width / 2, b.y, b.playerId, null);
          }
          bulletRemoved = true;
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Check vs Alien Bombs (bullet clash!)
      if (!bulletRemoved) {
        for (let j = this.bombs.length - 1; j >= 0; j--) {
          const bomb = this.bombs[j];
          if (
            Math.abs((b.x + b.width / 2) - (bomb.x + bomb.width / 2)) < 8 &&
            Math.abs(b.y - bomb.y) < 12
          ) {
            this.events.push({
              type: 'bullet_clash',
              x: (b.x + bomb.x) / 2,
              y: (b.y + bomb.y) / 2
            });
            if (b.isMissile) {
              this.triggerMissileSplash((b.x + bomb.x) / 2, (b.y + bomb.y) / 2, b.playerId, null);
            }
            this.bombs.splice(j, 1);
            this.bullets.splice(i, 1);
            bulletRemoved = true;
            break;
          }
        }
      }
    }

    // 7. Update Alien Bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      bomb.x += (bomb.vx || 0) * dtSeconds;
      bomb.y += (bomb.vy !== undefined ? bomb.vy : bomb.speed) * dtSeconds;

      // Hit bottom baseline or sides
      if (bomb.y > BASELINE_Y + 30 || bomb.x < 10 || bomb.x > GAME_WIDTH - 10) {
        this.bombs.splice(i, 1);
        continue;
      }

      let bombRemoved = false;

      // Check vs Bunkers (from above)
      const bunkerHit = this.checkBunkerCollision(bomb.x + bomb.width / 2, bomb.y + bomb.height);
      if (bunkerHit !== -1) {
        this.damageBunker(bunkerHit, bomb.x + bomb.width / 2, bomb.y + bomb.height, 4);
        this.bombs.splice(i, 1);
        bombRemoved = true;
        continue;
      }

      // Check vs Players (with Dodge Tolerance & Lag Compensation)
      if (!bombRemoved) {
        for (const player of Object.values(this.players)) {
          if (!player.alive || player.invulnerableTimer > 0) continue;

          // Inset horizontal player hitbox by 4px on each side
          const playerLeft = player.x + 4;
          const playerRight = player.x + player.width - 4;
          const playerTop = player.y + 2;
          const playerBottom = player.y + player.height - 2;

          const hitAuth = (
            bomb.x + bomb.width >= playerLeft &&
            bomb.x <= playerRight &&
            bomb.y + bomb.height >= playerTop &&
            bomb.y <= playerBottom
          );

          if (hitAuth) {
            let dodgedLocally = false;
            if (typeof player.predictedX === 'number') {
              const predLeft = player.predictedX + 3;
              const predRight = player.predictedX + player.width - 3;
              const hitPred = (
                bomb.x + bomb.width >= predLeft &&
                bomb.x <= predRight &&
                bomb.y + bomb.height >= playerTop &&
                bomb.y <= playerBottom
              );
              if (!hitPred) {
                dodgedLocally = true;
              }
            }

            if (!dodgedLocally) {
              // Power-up: Stronger (Can take 2 hits, reverts when hit)
              if (player.powerups && player.powerups.shield) {
                delete player.powerups.shield;
                player.invulnerableTimer = 1200;
                this.bombs.splice(i, 1);
                bombRemoved = true;

                this.events.push({
                  type: 'shield_absorbed',
                  playerId: player.id,
                  x: player.x + player.width / 2,
                  y: player.y + player.height / 2
                });
                break;
              }

              // Normal hit: lose life & lose ALL power-ups
              player.alive = false;
              player.lives--;
              player.powerups = {}; // All power-ups cleared on losing a life
              player.respawnTimer = 2200;
              this.bombs.splice(i, 1);
              bombRemoved = true;

              this.events.push({
                type: 'player_hit',
                playerId: player.id,
                x: player.x + player.width / 2,
                y: player.y + player.height / 2
              });

              // Check if all players out of lives
              const anyAlive = Object.values(this.players).some(p => p.lives > 0);
              if (!anyAlive && Object.keys(this.players).length > 0) {
                this.status = 'game_over';
                this.events.push({ type: 'game_over', reason: 'all_players_eliminated' });
              }
              break;
            }
          }
        }
      }
    }

    // 8. Check Invaders and Boss reaching Defense Line / Bunkers
    let lowestEnemyY = 0;
    let hordeReachedShields = false;
    for (const inv of this.invaders) {
      if (!inv.alive || inv.diving) continue;
      const bottom = inv.y + inv.height;
      if (bottom > lowestEnemyY) {
        lowestEnemyY = bottom;
      }

      // Check if any marching horde alien has reached the shield line
      if (bottom >= BUNKER_Y) {
        hordeReachedShields = true;
      }
    }

    // When the horde (but not a diving alien) reaches the shields, destroy them all and remove them
    if (hordeReachedShields && this.bunkers.length > 0) {
      const bunkerCenters = this.bunkers.map(b => ({
        x: Math.round(b.x + b.width / 2),
        y: Math.round(b.y + b.height / 2)
      }));
      this.bunkers = [];
      this.events.push({
        type: 'shields_destroyed',
        bunkers: bunkerCenters
      });
    }

    // Boss reaching defense line / dissolving bunkers / colliding with players
    if (this.boss.alive) {
      const bossBottom = this.boss.y + this.boss.height;
      if (bossBottom > lowestEnemyY) {
        lowestEnemyY = bossBottom;
      }

      // Boss dissolving bunkers if passing through them
      if (bossBottom >= BUNKER_Y && this.boss.y <= BUNKER_Y + BUNKER_HEIGHT) {
        for (let bIdx = 0; bIdx < this.bunkers.length; bIdx++) {
          const b = this.bunkers[bIdx];
          if (this.boss.x + this.boss.width >= b.x && this.boss.x <= b.x + b.width) {
            const startCol = Math.max(0, Math.floor((this.boss.x - b.x) / BUNKER_CELL_SIZE));
            const endCol = Math.min(BUNKER_COLS - 1, Math.floor((this.boss.x + this.boss.width - b.x) / BUNKER_CELL_SIZE));
            const startRow = Math.max(0, Math.floor((this.boss.y - b.y) / BUNKER_CELL_SIZE));
            const endRow = Math.min(BUNKER_ROWS - 1, Math.floor((bossBottom - b.y) / BUNKER_CELL_SIZE));

            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                b.grid[r][c] = 0;
              }
            }
          }
        }
      }

      // Boss crushing players on contact
      for (const player of Object.values(this.players)) {
        if (!player.alive || player.invulnerableTimer > 0) continue;
        if (
          this.boss.x + this.boss.width >= player.x &&
          this.boss.x <= player.x + player.width &&
          bossBottom >= player.y &&
          this.boss.y <= player.y + player.height
        ) {
          player.alive = false;
          player.lives--;
          player.powerups = {};
          player.respawnTimer = 2200;
          this.events.push({
            type: 'player_hit',
            playerId: player.id,
            lives: player.lives,
            x: player.x,
            y: player.y
          });

          // Check if all players dead
          const anyAlivePlayer = Object.values(this.players).some(p => p.lives > 0);
          if (!anyAlivePlayer) {
            this.status = 'game_over';
            this.events.push({ type: 'game_over', reason: 'all_players_eliminated' });
          }
        }
      }
    }

    // Invasion touchdown!
    if (lowestEnemyY >= BASELINE_Y - 5) {
      this.status = 'game_over';
      this.events.push({ type: 'game_over', reason: 'invasion_complete' });
    }
  }

  stepInvaders() {
    // Find alive bounding box for horde formation
    let minX = Infinity;
    let maxX = -Infinity;

    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const fx = inv.formationX !== undefined ? inv.formationX : inv.x;
      if (fx < minX) minX = fx;
      if (fx + inv.width > maxX) maxX = fx + inv.width;
    }

    if (minX === Infinity) return; // All dead

    const stepDist = 12;
    const dropDist = 20;
    let hitEdge = false;

    if (this.marchDir === 1 && maxX + stepDist >= GAME_WIDTH - 25) {
      hitEdge = true;
    } else if (this.marchDir === -1 && minX - stepDist <= 25) {
      hitEdge = true;
    }

    if (hitEdge) {
      this.marchDir = -this.marchDir;
      for (const inv of this.invaders) {
        inv.formationY = (inv.formationY !== undefined ? inv.formationY : inv.y) + dropDist;
        if (!inv.diving) {
          inv.y = inv.formationY;
        }
      }
    } else {
      for (const inv of this.invaders) {
        inv.formationX = (inv.formationX !== undefined ? inv.formationX : inv.x) + stepDist * this.marchDir;
        if (!inv.diving) {
          inv.x = inv.formationX;
        }
      }
    }

    this.animFrame = this.animFrame === 0 ? 1 : 0;
    this.marchBeat = (this.marchBeat + 1) % 4;

    // Keep Boss positioned in the middle above the moving horde
    this.updateBossPosition();

    this.events.push({
      type: 'march_step',
      beat: this.marchBeat
    });
  }

  dropBoss3WayAttack() {
    const originX = this.boss.x + this.boss.width / 2;
    const originY = this.boss.y + this.boss.height;

    // Center missile straight down
    this.bombs.push({
      id: `boss_b_${Date.now()}_c`,
      type: 'rolling',
      x: Math.round(originX - 2),
      y: Math.round(originY),
      width: 4,
      height: 12,
      vx: 0,
      vy: 240,
      speed: 240
    });

    // Left 45-deg angled missile
    this.bombs.push({
      id: `boss_b_${Date.now()}_l`,
      type: 'squiggly',
      x: Math.round(originX - 2),
      y: Math.round(originY),
      width: 4,
      height: 12,
      vx: -130,
      vy: 220,
      speed: 220
    });

    // Right 45-deg angled missile
    this.bombs.push({
      id: `boss_b_${Date.now()}_r`,
      type: 'squiggly',
      x: Math.round(originX - 2),
      y: Math.round(originY),
      width: 4,
      height: 12,
      vx: 130,
      vy: 220,
      speed: 220
    });

    this.events.push({ type: 'boss_shoot' });
  }

  dropInvaderBomb() {
    // Find bottom-most alive invader in each column that is not diving
    const bottomInvaders = {};
    for (const inv of this.invaders) {
      if (!inv.alive || inv.diving) continue;
      if (!bottomInvaders[inv.col] || inv.row > bottomInvaders[inv.col].row) {
        bottomInvaders[inv.col] = inv;
      }
    }

    const availableCols = Object.keys(bottomInvaders);
    if (availableCols.length === 0) return;

    // Pick random column
    const chosenCol = availableCols[Math.floor(Math.random() * availableCols.length)];
    const shooter = bottomInvaders[chosenCol];

    const bombTypes = ['rolling', 'plunger', 'squiggly'];
    const bombType = bombTypes[Math.floor(Math.random() * bombTypes.length)];

    this.bombs.push({
      id: `bomb_${Date.now()}_${Math.random()}`,
      type: bombType,
      x: shooter.x + shooter.width / 2 - 2,
      y: shooter.y + shooter.height + 2,
      width: 4,
      height: 12,
      speed: 210 + (this.wave - 1) * 15
    });
  }

  // Galaxian breakaway dive attack initiator
  triggerDiveAttack() {
    if (this.status !== 'playing' || this.aliveCount === 0) return;

    // Allow overlapping dive bombers (up to 5 concurrent dive-bombers)
    const maxDivers = Math.min(5, Math.max(1, this.aliveCount));
    const currentDivers = this.invaders.filter(inv => inv.alive && inv.diving).length;
    if (currentDivers >= maxDivers) return;

    // Select candidates: bottom-most alive invaders in columns not already diving
    const bottomInvaders = {};
    for (const inv of this.invaders) {
      if (!inv.alive || inv.diving) continue;
      if (!bottomInvaders[inv.col] || inv.row > bottomInvaders[inv.col].row) {
        bottomInvaders[inv.col] = inv;
      }
    }

    let candidates = Object.values(bottomInvaders);
    if (candidates.length === 0) {
      candidates = this.invaders.filter(inv => inv.alive && !inv.diving);
    }
    if (candidates.length === 0) return;

    const diver = candidates[Math.floor(Math.random() * candidates.length)];

    diver.diving = true;
    diver.divePhase = 'diving';
    diver.diveTime = 0;
    diver.diveShootTimer = 650 + Math.random() * 450;
    diver.shotsFired = 0;
    diver.maxShots = 2 + Math.floor(Math.random() * 2);

    const startX = diver.x;
    const startY = diver.y;

    // Target a live player's baseline position or a random baseline target
    const livePlayers = Object.values(this.players).filter(p => p.alive);
    let targetX = startX;
    if (livePlayers.length > 0) {
      const chosenPlayer = livePlayers[Math.floor(Math.random() * livePlayers.length)];
      targetX = chosenPlayer.x + (Math.random() * 60 - 30);
    } else {
      targetX = 120 + Math.random() * (GAME_WIDTH - 240);
    }

    // Circular movement parameters (clockwise or counter-clockwise)
    const dir = Math.random() > 0.5 ? 1 : -1;
    const radius = 45 + Math.random() * 30; // 45px - 75px radius
    const omega = 3.6 + Math.random() * 1.4; // 3.6 - 5.0 rad/s
    const vDown = 135 + Math.random() * 35 + (this.wave - 1) * 8; // 135 - 170+ px/s descent

    // Descent time to baseline (~600-750px descent)
    const estTime = Math.max(1.5, (BASELINE_Y - startY) / vDown);
    const driftVx = (targetX - startX) / estTime;

    diver.diveParams = {
      startX,
      startY,
      centerX: startX,
      centerY: startY,
      driftVx: Math.max(-110, Math.min(110, driftVx)),
      dir,
      radius,
      omega,
      vDown
    };

    diver.angle = 0;

    this.events.push({
      type: 'invader_dive_start',
      id: diver.id,
      x: Math.round(diver.x),
      y: Math.round(diver.y),
      invaderType: diver.type
    });
  }

  // 60 FPS update for Galaxian dive-bombers
  updateDivingInvaders(dt) {
    const dtSec = dt / 1000;

    for (const inv of this.invaders) {
      if (!inv.alive || !inv.diving) continue;

      if (inv.divePhase === 'diving') {
        inv.diveTime += dtSec;
        const p = inv.diveParams;
        if (!p) continue;

        // Advance center of circular motion
        p.centerX += p.driftVx * dtSec;
        p.centerY += p.vDown * dtSec;

        // Screen horizontal boundaries for center
        if (p.centerX < 60) {
          p.centerX = 60;
          p.driftVx = Math.abs(p.driftVx);
        } else if (p.centerX > GAME_WIDTH - 60 - inv.width) {
          p.centerX = GAME_WIDTH - 60 - inv.width;
          p.driftVx = -Math.abs(p.driftVx);
        }

        const prevX = inv.x;
        const prevY = inv.y;

        // Circular pattern:
        // x = centerX + R * sin(dir * omega * t)
        // y = centerY + R * (1 - cos(omega * t))
        const curX = p.centerX + p.radius * Math.sin(p.dir * p.omega * inv.diveTime);
        const curY = p.centerY + p.radius * (1 - Math.cos(p.omega * inv.diveTime));

        inv.x = Math.max(15, Math.min(GAME_WIDTH - inv.width - 15, curX));
        inv.y = curY;

        // Calculate velocity vector for orientation
        const vx = (inv.x - prevX) / Math.max(0.001, dtSec);
        const vy = (inv.y - prevY) / Math.max(0.001, dtSec);
        inv.angle = Math.atan2(vy, vx) + Math.PI / 2;

        // Shooting as they go
        inv.diveShootTimer -= dt;
        if (inv.diveShootTimer <= 0 && inv.shotsFired < inv.maxShots && inv.y < BASELINE_Y - 30) {
          inv.diveShootTimer = 800 + Math.random() * 500;
          inv.shotsFired++;

          this.bombs.push({
            id: `dive_bomb_${Date.now()}_${Math.random()}`,
            type: 'rolling',
            x: Math.round(inv.x + inv.width / 2 - 2),
            y: Math.round(inv.y + inv.height + 2),
            width: 4,
            height: 12,
            vx: vx * 0.2, // inherit slight horizontal momentum
            vy: 230 + (this.wave - 1) * 15,
            speed: 230 + (this.wave - 1) * 15
          });

          this.events.push({ type: 'invader_shoot' });
        }

        // Off the bottom of the screen:
        // "If they are not killed and go off the bottom of the screen, they should whizz back up to the horde, in the slot they came from."
        if (inv.y > GAME_HEIGHT + 20) {
          inv.divePhase = 'returning';
          inv.y = GAME_HEIGHT + 20;
          this.events.push({
            type: 'invader_returning',
            id: inv.id,
            x: Math.round(inv.x),
            y: Math.round(inv.y)
          });
        }
      } else if (inv.divePhase === 'returning') {
        // Whizz back up to the horde slot
        const targetX = inv.formationX;
        const targetY = inv.formationY;

        const dx = targetX - inv.x;
        const dy = targetY - inv.y;
        const dist = Math.hypot(dx, dy);

        // High return speed ("whizz back up")
        const returnSpeed = 560; // 560 px/s
        const step = returnSpeed * dtSec;

        if (dist <= step || (inv.y <= targetY + 8 && Math.abs(dx) < 25)) {
          // Re-dock into the horde formation slot!
          inv.x = targetX;
          inv.y = targetY;
          inv.diving = false;
          inv.divePhase = null;
          inv.angle = 0;
          inv.diveParams = null;
        } else {
          const moveX = (dx / dist) * step;
          const moveY = (dy / dist) * step;
          inv.x += moveX;
          inv.y += moveY;
          inv.angle = Math.atan2(moveY, moveX) + Math.PI / 2;
        }
      }

      // Bunker carving if diving/returning invader passes through bunkers
      if (inv.y + inv.height >= BUNKER_Y && inv.y <= BUNKER_Y + BUNKER_HEIGHT) {
        for (let bIdx = 0; bIdx < this.bunkers.length; bIdx++) {
          const b = this.bunkers[bIdx];
          if (inv.x + inv.width >= b.x && inv.x <= b.x + b.width) {
            const startCol = Math.max(0, Math.floor((inv.x - b.x) / BUNKER_CELL_SIZE));
            const endCol = Math.min(BUNKER_COLS - 1, Math.floor((inv.x + inv.width - b.x) / BUNKER_CELL_SIZE));
            const startRow = Math.max(0, Math.floor((inv.y - b.y) / BUNKER_CELL_SIZE));
            const endRow = Math.min(BUNKER_ROWS - 1, Math.floor((inv.y + inv.height - b.y) / BUNKER_CELL_SIZE));
            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                b.grid[r][c] = 0;
              }
            }
          }
        }
      }

      // COLLISION WITH PLAYER:
      // "If they collide with the player, both them and the player die"
      for (const player of Object.values(this.players)) {
        if (!player.alive || player.invulnerableTimer > 0) continue;

        const pLeft = player.x + 3;
        const pRight = player.x + player.width - 3;
        const pTop = player.y + 2;
        const pBottom = player.y + player.height - 2;

        const invLeft = inv.x + 2;
        const invRight = inv.x + inv.width - 2;
        const invTop = inv.y + 2;
        const invBottom = inv.y + inv.height - 2;

        if (
          invRight >= pLeft &&
          invLeft <= pRight &&
          invBottom >= pTop &&
          invTop <= pBottom
        ) {
          // Direct kamikaze collision! Both die!
          inv.alive = false;
          inv.diving = false;
          inv.divePhase = null;
          this.aliveCount--;
          this.updateMarchInterval();

          // Player eliminated
          player.alive = false;
          player.lives--;
          player.powerups = {};
          player.respawnTimer = 2200;

          const crashX = Math.round((inv.x + player.x) / 2 + 15);
          const crashY = Math.round((inv.y + player.y) / 2 + 10);

          this.events.push({
            type: 'invader_crash',
            x: crashX,
            y: crashY,
            playerId: player.id
          });

          this.events.push({
            type: 'player_hit',
            playerId: player.id,
            x: Math.round(player.x + player.width / 2),
            y: Math.round(player.y + player.height / 2)
          });

          this.events.push({
            type: 'invader_hit',
            x: Math.round(inv.x + inv.width / 2),
            y: Math.round(inv.y + inv.height / 2),
            points: inv.points * 2,
            invaderType: inv.type,
            playerId: player.id,
            wasDiving: true
          });

          // Check if all players dead
          const anyAlive = Object.values(this.players).some(p => p.lives > 0);
          if (!anyAlive && Object.keys(this.players).length > 0) {
            this.status = 'game_over';
            this.events.push({ type: 'game_over', reason: 'all_players_eliminated' });
          }

          // Check if wave cleared
          if (this.aliveCount === 0 && !this.boss.alive) {
            this.status = 'wave_cleared';
            this.intermissionTimer = 3000;
            this.events.push({ type: 'wave_clear', wave: this.wave });
          }
          break;
        }
      }
    }
  }

  // Get compact state payload for broadcast
  getBroadcastState() {
    return {
      status: this.status,
      wave: this.wave,
      aliveCount: this.aliveCount,
      animFrame: this.animFrame,
      highScore,
      ufo: {
        active: this.ufo.active,
        x: Math.round(this.ufo.x),
        y: Math.round(this.ufo.y),
        dir: this.ufo.dir,
        type: this.ufo.type || 0,
        color: this.ufo.color || '#ff3344'
      },
      boss: {
        alive: this.boss.alive,
        type: this.boss.type || 0,
        color: this.boss.color || '#ff0055',
        x: Math.round(this.boss.x),
        y: Math.round(this.boss.y),
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        flash: this.boss.flashTimer > 0
      },
      powerups: this.powerups.map(p => ({
        id: p.id,
        type: p.type,
        x: Math.round(p.x),
        y: Math.round(p.y)
      })),
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: Math.round(p.x),
        y: p.y,
        alive: p.alive,
        lives: p.lives,
        score: p.score,
        kills: p.kills,
        powerups: p.powerups || {},
        isInvulnerable: p.invulnerableTimer > 0,
        lastAckSeq: p.lastAckSeq || 0
      })),
      bullets: this.bullets.map(b => ({
        id: b.id,
        playerId: b.playerId,
        color: b.color,
        x: Math.round(b.x),
        y: Math.round(b.y),
        isMissile: Boolean(b.isMissile)
      })),
      bombs: this.bombs.map(b => ({
        id: b.id,
        type: b.type,
        x: Math.round(b.x),
        y: Math.round(b.y)
      })),
      // Invaders: only send alive ones with minimal footprint
      invaders: this.invaders
        .filter(inv => inv.alive)
        .map(inv => ({
          id: inv.id,
          row: inv.row,
          col: inv.col,
          type: inv.type,
          x: Math.round(inv.x),
          y: Math.round(inv.y),
          diving: Boolean(inv.diving),
          divePhase: inv.divePhase || null,
          angle: Number((inv.angle || 0).toFixed(2))
        })),
      // Bunkers bitmasks
      bunkers: this.bunkers.map(b => ({
        x: b.x,
        y: b.y,
        grid: b.grid
      })),
      events: this.events
    };
  }
}

const gameState = new GameEngine();

app.get('/api/info', (req, res) => {
  res.json({
    localIp,
    port: PORT,
    highScore,
    playerCount: Object.keys(gameState.players).length,
    wave: gameState.wave,
    status: gameState.status
  });
});

// ==========================================
// WEBSOCKET LOGIC
// ==========================================
let nextPlayerIndex = 1;

wss.on('connection', (ws) => {
  const playerId = `pilot_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
  const defaultColor = PLAYER_COLORS[(nextPlayerIndex - 1) % PLAYER_COLORS.length].hex;
  nextPlayerIndex++;
  ws.playerId = playerId;
  ws.defaultColor = defaultColor;
  ws.hasJoined = false;

  // Send initial connected message so client knows its ID, assigned color, and current game state
  ws.send(JSON.stringify({
    type: 'connected',
    playerId,
    defaultColor,
    localIp,
    port: PORT,
    state: gameState.getBroadcastState()
  }));

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw);
      switch (msg.type) {
        case 'join': {
          if (ws.hasJoined) break;
          const chosenName = (msg.name && typeof msg.name === 'string')
            ? msg.name.trim().substring(0, 15)
            : '';
          if (!chosenName) break;

          const chosenColor = (msg.color && typeof msg.color === 'string')
            ? msg.color
            : ws.defaultColor;

          ws.hasJoined = true;
          gameState.addPlayer(playerId, chosenName, chosenColor);

          // Acknowledge join to player
          ws.send(JSON.stringify({
            type: 'welcome',
            playerId,
            name: chosenName,
            color: chosenColor,
            state: gameState.getBroadcastState()
          }));

          // Broadcast player joined to squad with their entered name
          broadcast({
            type: 'player_joined',
            playerId,
            name: chosenName,
            color: chosenColor
          });
          break;
        }

        case 'set_profile': {
          if (!ws.hasJoined) break;
          const player = gameState.players[playerId];
          if (player) {
            if (msg.name && typeof msg.name === 'string') {
              const clean = msg.name.trim().substring(0, 15);
              if (clean) player.name = clean;
            }
            if (msg.color && typeof msg.color === 'string') {
              player.color = msg.color;
            }
            broadcast({
              type: 'player_profile_updated',
              playerId,
              name: player.name,
              color: player.color
            });
          }
          break;
        }

        case 'input': {
          if (!ws.hasJoined) break;
          gameState.handleInput(playerId, {
            left: Boolean(msg.left),
            right: Boolean(msg.right),
            shoot: Boolean(msg.shoot),
            seq: typeof msg.seq === 'number' ? msg.seq : undefined,
            predictedX: typeof msg.predictedX === 'number' ? msg.predictedX : undefined
          });
          break;
        }

        case 'add_local_p2': {
          if (!ws.hasJoined) break;
          const p2Id = `${playerId}_p2`;
          if (!gameState.players[p2Id]) {
            const p2Color = PLAYER_COLORS[(nextPlayerIndex - 1) % PLAYER_COLORS.length].hex;
            const p1 = gameState.players[playerId];
            const p2Name = p1 ? `${p1.name} (P2)` : `Pilot (P2)`;
            gameState.addPlayer(p2Id, p2Name, p2Color);
            ws.send(JSON.stringify({
              type: 'local_p2_created',
              p2Id,
              p2Name,
              p2Color
            }));
            broadcast({
              type: 'player_joined',
              playerId: p2Id,
              name: p2Name,
              color: p2Color
            });
          }
          break;
        }

        case 'input_local_p2': {
          if (!ws.hasJoined) break;
          const p2Id = `${playerId}_p2`;
          if (gameState.players[p2Id]) {
            gameState.handleInput(p2Id, {
              left: Boolean(msg.left),
              right: Boolean(msg.right),
              shoot: Boolean(msg.shoot),
              seq: typeof msg.seq === 'number' ? msg.seq : undefined,
              predictedX: typeof msg.predictedX === 'number' ? msg.predictedX : undefined
            });
          }
          break;
        }

        case 'remove_local_p2': {
          const p2Id = `${playerId}_p2`;
          if (gameState.players[p2Id]) {
            const p2Name = gameState.players[p2Id].name || 'Pilot P2';
            gameState.removePlayer(p2Id);
            broadcast({ type: 'player_left', playerId: p2Id, name: p2Name });
          }
          break;
        }

        case 'chat': {
          if (!ws.hasJoined) break;
          if (msg.text && typeof msg.text === 'string') {
            const sender = gameState.players[playerId];
            const text = msg.text.trim().substring(0, 50);
            if (text) {
              broadcast({
                type: 'chat',
                sender: sender ? sender.name : 'Unknown',
                color: sender ? sender.color : '#fff',
                text
              });
            }
          }
          break;
        }

        case 'restart': {
          if (!ws.hasJoined) break;
          if (gameState.status === 'game_over') {
            gameState.restartGame();
          }
          break;
        }
      }
    } catch (e) {
      console.warn('Error handling client message:', e);
    }
  });

  ws.on('close', () => {
    const p2Id = `${playerId}_p2`;
    if (gameState.players[p2Id]) {
      const p2Name = gameState.players[p2Id].name || 'Pilot P2';
      gameState.removePlayer(p2Id);
      broadcast({ type: 'player_left', playerId: p2Id, name: p2Name });
    }
    if (ws.hasJoined && gameState.players[playerId]) {
      const pName = gameState.players[playerId].name || 'A pilot';
      gameState.removePlayer(playerId);
      broadcast({ type: 'player_left', playerId, name: pName });
    }
  });

  ws.on('error', (err) => {
    console.warn(`WebSocket error for ${playerId}:`, err.message);
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// 60 FPS Physics Simulation Loop
let lastTickTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(100, now - lastTickTime); // cap lag spikes
  lastTickTime = now;
  gameState.tick(dt);
}, 1000 / 60);

// 30 FPS Network Sync Broadcast
setInterval(() => {
  if (wss.clients.size > 0) {
    const statePayload = gameState.getBroadcastState();
    broadcast({
      type: 'tick',
      timestamp: Date.now(),
      ...statePayload
    });
    // Clear ephemeral events after broadcast
    gameState.events = [];
  }
}, 1000 / 30);

if (require.main === module) {
  // Start HTTP Server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
============================================================
👾 SPACE INVADERS MULTIPLAYER ARCADE ONLINE! 👾
============================================================
> Local play:     http://localhost:${PORT}
> Network play:   http://${localIp}:${PORT}
============================================================
Open the URL in any browser (or phone on same Wi-Fi) to play!
Multiple tabs or devices join the same cooperative squad!
============================================================
    `);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEngine, BUNKER_Y };
}
