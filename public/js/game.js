// Space Invaders Client Game Engine

class SpaceInvadersGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ws = null;

    // Local identity & Join status
    this.localPlayerId = null;
    this.localPlayerName = '';
    this.localPlayerColor = '#00ff66';
    this.localP2Id = null;
    this.isJoined = false;
    this.hasStartedGame = false;

    // Latest server state
    this.state = {
      status: 'playing',
      wave: 1,
      aliveCount: 55,
      animFrame: 0,
      highScore: 9990,
      ufo: { active: false, x: -60, y: 75, dir: 1, type: 0, color: '#ff3344' },
      boss: { alive: false, type: 0, color: '#ff0055', x: 364, y: 50, hp: 20, maxHp: 20, flash: false },
      powerups: [],
      players: [],
      bullets: [],
      bombs: [],
      invaders: [],
      bunkers: [],
      events: []
    };

    // Client-side visual particles and popups
    this.particles = [];
    this.crossBlasts = [];
    this.floatingScores = [];
    this.playerFloatingTexts = [];
    this.stars = [];
    this.motionTrailP1 = [];
    this.motionTrailP2 = [];
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // Wave-dependent starfield trajectory (angles in radians: 0 = straight down, - = diag left, + = diag right)
    this.currentStarWave = null;
    this.starAngle = 0;
    this.targetStarAngle = 0;

    // Input tracking
    this.p1Inputs = { left: false, right: false, shoot: false };
    this.p2Inputs = { left: false, right: false, shoot: false };
    this.lastSentP1 = { left: false, right: false, shoot: false };
    this.lastSentP2 = { left: false, right: false, shoot: false };

    // Client-side prediction & entity interpolation
    this.localX = null;
    this.localP2X = null;
    this.pendingInputs = [];
    this.pendingInputsP2 = [];
    this.inputSeq = 0;
    this.inputSeqP2 = 0;
    this.snapshotBuffer = [];
    this.interpolationDelay = 65; // ms (smooth buffering for 30Hz network updates)
    this.lastInputStreamTime = 0;

    this.initStars();
    this.setStarDirectionForWave(1, true);
    this.setupInputs();
    this.connectWebSocket();
    this.startRenderLoop();
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 850,
        size: Math.random() < 0.2 ? 2 : 1,
        speed: 0.15 + Math.random() * 0.4,
        alpha: 0.3 + Math.random() * 0.7
      });
    }
  }

  setStarDirectionForWave(wave, force = false) {
    if (!force && wave === this.currentStarWave) return;
    this.currentStarWave = wave;

    // Angle range: ~[-40°, +40°] in radians (approx [-0.70, +0.70] rad)
    // 0 rad = straight down, negative = diagonally left, positive = diagonally right
    const maxAngle = 0.70;
    let newAngle = 0;
    let attempts = 0;

    do {
      newAngle = (Math.random() * 2 - 1) * maxAngle;
      attempts++;
    } while (
      attempts < 15 &&
      this.targetStarAngle !== undefined &&
      Math.abs(newAngle - this.targetStarAngle) < 0.28 // Ensure at least ~16° noticeable difference between consecutive waves
    );

    this.targetStarAngle = newAngle;

    if (force || this.starAngle === undefined || this.starAngle === null) {
      this.starAngle = newAngle;
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to Space Invaders Arcade server!');
      // If client was already joined before reconnect, rejoin automatically
      if (this.isJoined && this.localPlayerName) {
        this.joinGame(this.localPlayerName, this.localPlayerColor);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (e) {
        console.error('Error parsing server message:', e);
      }
    };

    this.ws.onclose = () => {
      console.warn('Disconnected from server. Reconnecting in 2s...');
      setTimeout(() => this.connectWebSocket(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
    };
  }

  joinGame(name, color) {
    this.localPlayerName = name;
    this.localPlayerColor = color;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join',
        name,
        color
      }));
    }
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'connected': {
        this.localPlayerId = msg.playerId;
        this.localPlayerColor = msg.defaultColor;
        if (msg.state) {
          this.state = msg.state;
          if (msg.state.wave && msg.state.wave !== this.currentStarWave) {
            this.setStarDirectionForWave(msg.state.wave, true);
          }
        }
        if (window.UI) {
          window.UI.showJoinModal(msg.defaultColor);
          window.UI.updateSquad(this.state.players || [], this.localPlayerId, this.localP2Id);
        }
        break;
      }

      case 'welcome': {
        const isFirstStart = !this.hasStartedGame;
        this.hasStartedGame = true;
        this.localPlayerId = msg.playerId;
        this.localPlayerName = msg.name;
        this.localPlayerColor = msg.color;
        this.isJoined = true;
        if (msg.state) {
          this.state = msg.state;
          if (msg.state.wave && msg.state.wave !== this.currentStarWave) {
            this.setStarDirectionForWave(msg.state.wave, true);
          }
          const p = (msg.state.players || []).find(pl => pl.id === this.localPlayerId);
          if (p) this.localX = p.x;
        }

        // Initialize UI with profile and close join modal
        if (window.UI) {
          window.UI.onPlayerJoined(this.localPlayerName, this.localPlayerColor);
        }

        // Play alien transmission voice sound effect when player first starts the game
        if (isFirstStart) {
          Sound.unlock();
          Sound.stopUfo();
          Sound.playWaveWarning();
          Sound.playAlienVoice({ delay: 0.25 });
          if (window.UI) {
            window.UI.hideBanner();
            window.UI.addEventNotification('👾 ALIEN TRANSMISSION: "PUNY HUMANS, YOUR PLANET IS OURS!"', '#ff0055');
          }
        }
        break;
      }

      case 'local_p2_created': {
        this.localP2Id = msg.p2Id;
        const p2 = (this.state.players || []).find(pl => pl.id === this.localP2Id);
        if (p2) this.localP2X = p2.x;
        const p2Btn = document.getElementById('btn-local-p2');
        if (p2Btn) {
          p2Btn.classList.add('active');
          p2Btn.innerText = '👥 REMOVE LOCAL P2';
        }
        break;
      }

      case 'tick': {
        const now = performance.now();
        this.snapshotBuffer.push({
          time: now,
          serverTime: msg.timestamp || Date.now(),
          state: msg
        });
        if (this.snapshotBuffer.length > 30) {
          this.snapshotBuffer.shift();
        }

        // Reconcile local P1 position
        if (msg.players) {
          const serverP1 = msg.players.find(p => p.id === this.localPlayerId);
          if (serverP1) {
            if (this.localX === null || !serverP1.alive) {
              this.localX = serverP1.x;
              this.pendingInputs = [];
            } else if (typeof serverP1.lastAckSeq === 'number') {
              // Discard inputs acknowledged by server
              this.pendingInputs = this.pendingInputs.filter(item => item.seq > serverP1.lastAckSeq);

              // Replay remaining unacknowledged inputs from authoritative coordinate
              let reconX = serverP1.x;
              for (const inp of this.pendingInputs) {
                reconX += inp.dir * 300 * inp.dt;
                reconX = Math.max(30, Math.min(800 - 39 - 30, reconX));
              }

              // Soft error convergence to eliminate visual jitter
              const error = reconX - this.localX;
              if (Math.abs(error) > 40) {
                this.localX = reconX;
              } else {
                this.localX += error * 0.25;
              }
            }
          }

          // Reconcile local P2 position if active
          if (this.localP2Id) {
            const serverP2 = msg.players.find(p => p.id === this.localP2Id);
            if (serverP2) {
              if (this.localP2X === null || !serverP2.alive) {
                this.localP2X = serverP2.x;
                this.pendingInputsP2 = [];
              } else if (typeof serverP2.lastAckSeq === 'number') {
                this.pendingInputsP2 = this.pendingInputsP2.filter(item => item.seq > serverP2.lastAckSeq);
                let reconP2X = serverP2.x;
                for (const inp of this.pendingInputsP2) {
                  reconP2X += inp.dir * 300 * inp.dt;
                  reconP2X = Math.max(30, Math.min(800 - 39 - 30, reconP2X));
                }
                const err2 = reconP2X - this.localP2X;
                if (Math.abs(err2) > 40) {
                  this.localP2X = reconP2X;
                } else {
                  this.localP2X += err2 * 0.25;
                }
              }
            }
          }
        }

        this.state = msg;
        if (msg.wave && msg.wave !== this.currentStarWave) {
          this.setStarDirectionForWave(msg.wave);
        }
        this.processEvents(msg.events || []);
        if (window.UI) window.UI.updateSquad(msg.players, this.localPlayerId, this.localP2Id);
        break;
      }

      case 'chat': {
        if (window.UI) window.UI.addChatMessage(msg.sender, msg.color, msg.text);
        break;
      }

      case 'player_joined': {
        Sound.playPlayerJoin();
        if (window.UI && msg.name) {
          window.UI.addEventNotification(`${msg.name} has joined the squad`, msg.color || '#00ff66');
        }
        break;
      }

      case 'player_left': {
        Sound.playPlayerLeave();
        const name = msg.name || 'A pilot';
        if (window.UI) {
          window.UI.addEventNotification(`${name} has left`, '#ff3344', true);
        }
        break;
      }
    }
  }

  processEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'march_step':
          Sound.playMarchBeat(ev.beat);
          break;

        case 'player_shoot':
          if (ev.isMissile) {
            Sound.playRocketLaunch();
          } else {
            Sound.playShoot();
          }
          break;

        case 'rocket_explosion':
          Sound.playRocketExplosion();
          this.spawnRocketCrossExplosion(ev.x, ev.y, ev.radius || 48);
          this.triggerScreenShake(5, 220);
          break;

        case 'invader_hit':
          Sound.playInvaderExplosion();
          this.spawnExplosion(ev.x, ev.y, '#ffffff');
          if (ev.isRocketSplash) {
            this.addFloatingScore(ev.x, ev.y, `+${ev.points} SPLASH!`, '#ff5500');
          } else if (ev.wasDiving) {
            this.addFloatingScore(ev.x, ev.y, `+${ev.points} DIVE KILL!`, '#ffd700');
          } else {
            this.addFloatingScore(ev.x, ev.y, `+${ev.points}`);
          }
          break;

        case 'invader_dive_start':
          Sound.playDiveAttack();
          this.spawnExplosion(ev.x, ev.y, '#ff3344', 8);
          break;

        case 'invader_returning':
          Sound.playWhizzReturn();
          break;

        case 'invader_crash':
          Sound.playCrash();
          this.spawnExplosion(ev.x, ev.y, '#ff0055', 40);
          this.spawnExplosion(ev.x, ev.y, '#00ff66', 30);
          this.addFloatingScore(ev.x, ev.y - 12, 'CRASH! KAMIKAZE!', '#ff3344');
          break;

        case 'ufo_spawn':
          Sound.startUfo();
          break;

        case 'ufo_despawn':
          Sound.stopUfo();
          break;

        case 'ufo_hit':
          Sound.playUfoHit();
          this.spawnExplosion(ev.x, ev.y, '#ff007f', 30);
          this.addFloatingScore(ev.x, ev.y, `+${ev.points}`, '#ff007f');
          break;

        case 'bullet_clash':
          this.spawnExplosion(ev.x, ev.y, '#ffff00', 8);
          break;

        case 'powerup_spawned':
          this.spawnExplosion(ev.x, ev.y, '#ffd700', 14);
          break;

        case 'powerup_collected': {
          Sound.playPowerup();
          this.spawnExplosion(ev.x, ev.y, '#ffd700', 25);
          const labels = {
            rapid_fire: 'RAPID FIRE (2X SHOTS)',
            super_speed: 'HYPER SHOT SPEED (2X)',
            fast_move: 'TURBO SPEED (+50%)',
            shield: 'SHIELD ARMOR (2 HITS)',
            triple_shot: '3-WAY TRIDENT SHOT',
            rocket_launcher: 'ROCKET LAUNCHER (MISSILE)'
          };
          const colors = {
            rapid_fire: '#ffaa00',
            super_speed: '#00e5ff',
            fast_move: '#00ff66',
            shield: '#00d4ff',
            triple_shot: '#ff00ff',
            rocket_launcher: '#ff4400'
          };
          const pType = ev.powerupType;
          const text = labels[pType] || 'POWER-UP!';
          const color = colors[pType] || '#ffd700';

          // Show power up collected text above the player rather than top right
          this.addPlayerFloatingText(ev.playerId, text, color, ev.x, ev.y);
          break;
        }

        case 'boss_hit':
          Sound.playBossHit();
          this.spawnExplosion(ev.x, ev.y, '#ff0055', 8);
          break;

        case 'boss_shoot':
          Sound.playBossShoot();
          break;

        case 'boss_killed':
          Sound.playBossExplosion();
          this.spawnExplosion(ev.x, ev.y, '#ff0055', 60);
          this.addFloatingScore(ev.x, ev.y, '+1000', '#ff0055');
          if (window.UI) {
            window.UI.addEventNotification('COMMAND BOSS DESTROYED! +1000', '#ff0055');
          }
          break;

        case 'shield_absorbed':
          Sound.playShieldAbsorb();
          this.spawnExplosion(ev.x, ev.y, '#00d4ff', 25);
          if (ev.playerId === this.localPlayerId && window.UI) {
            window.UI.addEventNotification('SHIELD ARMOR DEFLECTED HIT!', '#00d4ff');
          }
          break;

        case 'shields_destroyed':
          if (Sound.playShieldsDestroyed) {
            Sound.playShieldsDestroyed();
          } else {
            Sound.playCrash();
          }
          if (ev.bunkers && ev.bunkers.length > 0) {
            for (const b of ev.bunkers) {
              this.spawnExplosion(b.x, b.y, '#00ff66', 36);
              this.spawnExplosion(b.x, b.y, '#ffffff', 18);
            }
          } else {
            const defaultPositions = [
              { x: 133, y: 654 },
              { x: 308, y: 654 },
              { x: 488, y: 654 },
              { x: 668, y: 654 }
            ];
            for (const pos of defaultPositions) {
              this.spawnExplosion(pos.x, pos.y, '#00ff66', 36);
              this.spawnExplosion(pos.x, pos.y, '#ffffff', 18);
            }
          }
          if (window.UI) {
            window.UI.addEventNotification('HORDE OVERRAN DEFENSE LINE — ALL SHIELDS DESTROYED!', '#ff3344');
          }
          break;

        case 'player_hit':
          Sound.playPlayerExplosion();
          this.spawnExplosion(ev.x, ev.y, '#00ff66', 36);
          break;

        case 'wave_clear':
          Sound.stopUfo();
          Sound.playWaveClear();
          if (window.UI) window.UI.showBanner('WAVE CLEARED!', 'BONUS LIFE AWARDED • POWER-UPS RETAINED • NEXT WAVE INCOMING', true);
          break;

        case 'wave_start':
          Sound.stopUfo();
          Sound.playWaveWarning();
          Sound.playAlienVoice({ delay: 0.25 });
          if (window.UI) {
            window.UI.hideBanner();
            window.UI.addEventNotification('👾 ALIEN TRANSMISSION: "PUNY HUMANS, YOUR PLANET IS OURS!"', '#ff0055');
          }
          this.motionTrailP1 = [];
          this.motionTrailP2 = [];
          // Note: Players retain their collected power-ups across waves
          this.setStarDirectionForWave(ev.wave || (this.state && this.state.wave) || (this.currentStarWave ? this.currentStarWave + 1 : 1));
          break;

        case 'game_over':
          Sound.stopUfo();
          Sound.playGameOver();
          const sub = ev.reason === 'invasion_complete' ? 'THE INVADERS HAVE LANDED!' : 'ALL PILOTS ELIMINATED!';
          if (window.UI) window.UI.showBanner('EARTH INVADED!', `${sub} • PRESS SPACE TO RESTART`, false);
          break;

        case 'game_restart':
          Sound.stopUfo();
          Sound.playWaveWarning();
          Sound.playAlienVoice({ delay: 0.25 });
          if (window.UI) {
            window.UI.hideBanner();
            window.UI.addEventNotification('👾 ALIEN TRANSMISSION: "PUNY HUMANS, YOUR PLANET IS OURS!"', '#ff0055');
          }
          this.setStarDirectionForWave(1, true);
          break;
      }
    }
  }

  spawnExplosion(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.5 ? 3 : 2,
        color,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7
      });
    }
  }

  triggerScreenShake(intensity = 5, duration = 200) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  // Cross explosion: Expanding + shockwave and 4 cardinal blast jets (top, bottom, left, right)
  spawnRocketCrossExplosion(x, y, radius = 50) {
    // 1. Expanding glowing cross blast shockwave
    this.crossBlasts.push({
      x,
      y,
      size: 0,
      maxSize: radius + 22,
      life: 0.32,
      maxLife: 0.32
    });

    // 2. Dense central fireball
    const coreColors = ['#ffffff', '#ffff55', '#ff9900', '#ff3300'];
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 130;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.5 ? 3 : 2,
        color: coreColors[Math.floor(Math.random() * coreColors.length)],
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5
      });
    }

    // 3. 4 Directional blast jets shooting outward: TOP, BOTTOM, LEFT, RIGHT
    const armDirections = [
      { vxBase: 0, vyBase: -200, varX: 30, varY: 45 }, // TOP
      { vxBase: 0, vyBase: 200, varX: 30, varY: 45 },  // BOTTOM
      { vxBase: -220, vyBase: 0, varX: 45, varY: 30 }, // LEFT
      { vxBase: 220, vyBase: 0, varX: 45, varY: 30 }   // RIGHT
    ];

    armDirections.forEach(dir => {
      for (let i = 0; i < 11; i++) {
        const spreadX = (Math.random() - 0.5) * dir.varX;
        const spreadY = (Math.random() - 0.5) * dir.varY;
        const speedScale = 0.6 + Math.random() * 0.7;
        this.particles.push({
          x,
          y,
          vx: (dir.vxBase * speedScale) + spreadX,
          vy: (dir.vyBase * speedScale) + spreadY,
          size: Math.random() < 0.6 ? 3 : 2,
          color: Math.random() < 0.4 ? '#ffffff' : (Math.random() < 0.7 ? '#ffff00' : '#ff4400'),
          life: 0.22 + Math.random() * 0.18,
          maxLife: 0.4
        });
      }
    });
  }

  addFloatingScore(x, y, text, color = '#ffd700') {
    this.floatingScores.push({
      x,
      y,
      text,
      color,
      life: 0.9,
      maxLife: 0.9
    });
  }

  addPlayerFloatingText(playerId, text, color = '#ffd700', fallbackX = 400, fallbackY = 700) {
    // If this player already has an active floating popup, push older ones up so they do not overlap
    for (const item of this.playerFloatingTexts) {
      if (item.playerId === playerId) {
        item.offsetY += 16;
      }
    }
    this.playerFloatingTexts.push({
      playerId,
      text,
      color,
      fallbackX,
      fallbackY,
      offsetY: 36,
      life: 2.2,
      maxLife: 2.2
    });
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      // Ignore input when user is typing in form inputs (chat, pilot callsign, etc.)
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      // Prevent browser default page scroll on spacebar and arrow keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      // If a button previously held focus (e.g. after clicking sound or chat), blur it
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }

      // Audio unlock on user interaction
      Sound.unlock();

      if (!this.isJoined) return;

      if (this.state.status === 'game_over') {
        if (e.code === 'Space' || e.code === 'Enter') {
          this.sendRestart();
          return;
        }
      }

      if (this.localP2Id) {
        // Player 1 controls (WASD + Space)
        if (e.code === 'KeyA') this.p1Inputs.left = true;
        if (e.code === 'KeyD') this.p1Inputs.right = true;
        if (e.code === 'KeyW' || e.code === 'Space') this.p1Inputs.shoot = true;

        // Player 2 controls (Arrow keys + Enter)
        if (e.code === 'ArrowLeft') this.p2Inputs.left = true;
        if (e.code === 'ArrowRight') this.p2Inputs.right = true;
        if (e.code === 'ArrowUp' || e.code === 'Enter') this.p2Inputs.shoot = true;
      } else {
        // Solo / Online controls (Arrow keys or A/D + Space)
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.p1Inputs.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.p1Inputs.right = true;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.p1Inputs.shoot = true;
      }
      this.syncInputs();
    });

    window.addEventListener('keyup', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (!this.isJoined) return;

      if (this.localP2Id) {
        if (e.code === 'KeyA') this.p1Inputs.left = false;
        if (e.code === 'KeyD') this.p1Inputs.right = false;
        if (e.code === 'KeyW' || e.code === 'Space') this.p1Inputs.shoot = false;

        if (e.code === 'ArrowLeft') this.p2Inputs.left = false;
        if (e.code === 'ArrowRight') this.p2Inputs.right = false;
        if (e.code === 'ArrowUp' || e.code === 'Enter') this.p2Inputs.shoot = false;
      } else {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.p1Inputs.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.p1Inputs.right = false;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.p1Inputs.shoot = false;
      }
      this.syncInputs();
    });
  }

  setTouchInput(action, isPressed) {
    Sound.unlock();
    if (!this.isJoined) return;

    if (this.state.status === 'game_over' && isPressed) {
      this.sendRestart();
      return;
    }

    if (action === 'left') this.p1Inputs.left = isPressed;
    if (action === 'right') this.p1Inputs.right = isPressed;
    if (action === 'fire') this.p1Inputs.shoot = isPressed;
    this.syncInputs();
  }

  syncInputs(force = false) {
    if (!this.isJoined || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send P1 input if changed or forced
    const p1Changed = (
      this.p1Inputs.left !== this.lastSentP1.left ||
      this.p1Inputs.right !== this.lastSentP1.right ||
      this.p1Inputs.shoot !== this.lastSentP1.shoot
    );

    if (p1Changed || force) {
      this.lastSentP1 = { ...this.p1Inputs };
      this.ws.send(JSON.stringify({
        type: 'input',
        seq: this.inputSeq,
        predictedX: this.localX !== null ? Math.round(this.localX) : undefined,
        ...this.p1Inputs
      }));
    }

    // Send P2 input if P2 active and changed or forced
    if (this.localP2Id) {
      const p2Changed = (
        this.p2Inputs.left !== this.lastSentP2.left ||
        this.p2Inputs.right !== this.lastSentP2.right ||
        this.p2Inputs.shoot !== this.lastSentP2.shoot
      );

      if (p2Changed || force) {
        this.lastSentP2 = { ...this.p2Inputs };
        this.ws.send(JSON.stringify({
          type: 'input_local_p2',
          seq: this.inputSeqP2,
          predictedX: this.localP2X !== null ? Math.round(this.localP2X) : undefined,
          ...this.p2Inputs
        }));
      }
    }
  }

  sendProfileUpdate(name, color) {
    this.localPlayerName = name;
    this.localPlayerColor = color;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'set_profile',
        name,
        color
      }));
    }
  }

  sendChat(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat',
        text
      }));
    }
  }

  sendRestart() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'restart' }));
    }
  }

  toggleLocalP2() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.localP2Id) {
      this.ws.send(JSON.stringify({ type: 'remove_local_p2' }));
      this.localP2Id = null;
      this.localP2X = null;
      this.pendingInputsP2 = [];
      const p2Btn = document.getElementById('btn-local-p2');
      if (p2Btn) {
        p2Btn.classList.remove('active');
        p2Btn.innerText = '👥 ADD LOCAL P2';
      }
    } else {
      this.ws.send(JSON.stringify({ type: 'add_local_p2' }));
    }
  }

  // ==========================================
  // RENDERING LOOP
  // ==========================================
  startRenderLoop() {
    let lastTime = performance.now();

    const loop = (currentTime) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  update(dt) {
    const MIN_X = 30;
    const MAX_X = 800 - 39 - 30;

    // 1. Client-Side Prediction for Local P1 Cannon
    const localP1 = this.state.players ? this.state.players.find(p => p.id === this.localPlayerId) : null;
    const speedP1 = (localP1 && localP1.powerups && localP1.powerups.fast_move) ? 450 : 300;
    if (localP1 && localP1.alive) {
      if (this.localX === null) this.localX = localP1.x;

      let dir1 = 0;
      if (this.p1Inputs.left && !this.p1Inputs.right) dir1 = -1;
      else if (this.p1Inputs.right && !this.p1Inputs.left) dir1 = 1;

      if (dir1 !== 0) {
        this.localX += dir1 * speedP1 * dt;
        this.localX = Math.max(MIN_X, Math.min(MAX_X, this.localX));

        // Motion trail blur when turbo speed power-up is active
        if (localP1.powerups && localP1.powerups.fast_move) {
          this.motionTrailP1.unshift({ x: this.localX, y: localP1.y, color: localP1.color });
          if (this.motionTrailP1.length > 5) this.motionTrailP1.pop();
        }
      } else {
        if (this.motionTrailP1.length > 0) this.motionTrailP1.pop();
      }

      const seq1 = ++this.inputSeq;
      this.pendingInputs.push({
        seq: seq1,
        dt,
        left: this.p1Inputs.left,
        right: this.p1Inputs.right,
        dir: dir1
      });
      if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    } else if (localP1 && !localP1.alive) {
      this.pendingInputs = [];
      this.motionTrailP1 = [];
      if (this.localX === null) this.localX = localP1.x;
    }

    // Client-Side Prediction for Local P2 Cannon (if active)
    if (this.localP2Id) {
      const localP2 = this.state.players ? this.state.players.find(p => p.id === this.localP2Id) : null;
      const speedP2 = (localP2 && localP2.powerups && localP2.powerups.fast_move) ? 450 : 300;
      if (localP2 && localP2.alive) {
        if (this.localP2X === null) this.localP2X = localP2.x;

        let dir2 = 0;
        if (this.p2Inputs.left && !this.p2Inputs.right) dir2 = -1;
        else if (this.p2Inputs.right && !this.p2Inputs.left) dir2 = 1;

        if (dir2 !== 0) {
          this.localP2X += dir2 * speedP2 * dt;
          this.localP2X = Math.max(MIN_X, Math.min(MAX_X, this.localP2X));

          if (localP2.powerups && localP2.powerups.fast_move) {
            this.motionTrailP2.unshift({ x: this.localP2X, y: localP2.y, color: localP2.color });
            if (this.motionTrailP2.length > 5) this.motionTrailP2.pop();
          }
        } else {
          if (this.motionTrailP2.length > 0) this.motionTrailP2.pop();
        }

        const seq2 = ++this.inputSeqP2;
        this.pendingInputsP2.push({
          seq: seq2,
          dt,
          left: this.p2Inputs.left,
          right: this.p2Inputs.right,
          dir: dir2
        });
        if (this.pendingInputsP2.length > 120) this.pendingInputsP2.shift();
      } else if (localP2 && !localP2.alive) {
        this.pendingInputsP2 = [];
        this.motionTrailP2 = [];
        if (this.localP2X === null) this.localP2X = localP2.x;
      }
    }

    // Stream inputs regularly while keys are held (every 45ms) for continuous server acknowledgement
    const now = performance.now();
    const isMoving = this.p1Inputs.left || this.p1Inputs.right || (this.localP2Id && (this.p2Inputs.left || this.p2Inputs.right));
    if (isMoving && (now - this.lastInputStreamTime > 45)) {
      this.lastInputStreamTime = now;
      this.syncInputs(true);
    }

    // 2. Update stars with smooth angle interpolation and directional velocity
    if (this.starAngle !== this.targetStarAngle) {
      const diff = this.targetStarAngle - this.starAngle;
      const lerpSpeed = Math.min(1, dt * 2.2);
      if (Math.abs(diff) < 0.005) {
        this.starAngle = this.targetStarAngle;
      } else {
        this.starAngle += diff * lerpSpeed;
      }
    }

    const dtScale = dt > 0 ? Math.min(dt, 0.1) * 60 : 1;
    const sinA = Math.sin(this.starAngle);
    const cosA = Math.cos(this.starAngle);

    for (const star of this.stars) {
      star.x += star.speed * sinA * dtScale;
      star.y += star.speed * cosA * dtScale;

      // Toroidal wrapping across 800 x 850 boundaries preserves uniform starfield density
      if (star.x < 0) {
        star.x += 800;
      } else if (star.x >= 800) {
        star.x -= 800;
      }

      if (star.y < 0) {
        star.y += 850;
      } else if (star.y >= 850) {
        star.y -= 850;
      }
    }

    // 3. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 3.1. Update cross explosion blasts
    for (let i = this.crossBlasts.length - 1; i >= 0; i--) {
      const cb = this.crossBlasts[i];
      cb.life -= dt;
      cb.size = (1 - cb.life / cb.maxLife) * cb.maxSize;
      if (cb.life <= 0) {
        this.crossBlasts.splice(i, 1);
      }
    }

    // 3.2. Update screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt * 1000;
    }

    // 3.3. Spawn subtle rocket exhaust smoke behind active missiles
    if (this.state.bullets) {
      for (const b of this.state.bullets) {
        if (b.isMissile && Math.random() < 0.65) {
          this.particles.push({
            x: b.x + 3 + (Math.random() * 2 - 1),
            y: b.y + 14,
            vx: (Math.random() - 0.5) * 15,
            vy: 20 + Math.random() * 30,
            size: 2 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#ffaa00' : 'rgba(210, 210, 220, 0.75)',
            life: 0.18 + Math.random() * 0.15,
            maxLife: 0.35
          });
        }
      }
    }

    // 4. Update floating scores
    for (let i = this.floatingScores.length - 1; i >= 0; i--) {
      const s = this.floatingScores[i];
      s.y -= 35 * dt;
      s.life -= dt;
      if (s.life <= 0) {
        this.floatingScores.splice(i, 1);
      }
    }

    // 4.5. Update player floating texts (Power-up collected popups above ship)
    for (let i = this.playerFloatingTexts.length - 1; i >= 0; i--) {
      const t = this.playerFloatingTexts[i];
      t.offsetY += 20 * dt;
      t.life -= dt;
      if (t.life <= 0) {
        this.playerFloatingTexts.splice(i, 1);
      }
    }
  }

  // ==========================================
  // ENTITY INTERPOLATION BUFFER
  // ==========================================
  getInterpolatedEntities() {
    if (this.snapshotBuffer.length === 0) {
      return this.state;
    }
    if (this.snapshotBuffer.length === 1) {
      return this.snapshotBuffer[0].state;
    }

    // 65ms interpolation delay (smooth buffer for 30Hz server ticks)
    const renderTime = performance.now() - this.interpolationDelay;

    let s0 = null;
    let s1 = null;

    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      if (this.snapshotBuffer[i].time <= renderTime && renderTime <= this.snapshotBuffer[i + 1].time) {
        s0 = this.snapshotBuffer[i];
        s1 = this.snapshotBuffer[i + 1];
        break;
      }
    }

    if (!s0) {
      if (renderTime > this.snapshotBuffer[this.snapshotBuffer.length - 1].time) {
        s0 = this.snapshotBuffer[this.snapshotBuffer.length - 2];
        s1 = this.snapshotBuffer[this.snapshotBuffer.length - 1];
      } else {
        return this.snapshotBuffer[0].state;
      }
    }

    const span = s1.time - s0.time;
    const alpha = span > 0 ? Math.max(0, Math.min(1.0, (renderTime - s0.time) / span)) : 1.0;
    const lerp = (a, b, t) => a + (b - a) * t;

    // Remote Players
    const p0Map = new Map((s0.state.players || []).map(p => [p.id, p]));
    const players = (s1.state.players || []).map(p1 => {
      const p0 = p0Map.get(p1.id);
      let x = p1.x;
      let y = p1.y;
      if (p0) {
        x = Math.round(lerp(p0.x, p1.x, alpha));
        y = Math.round(lerp(p0.y, p1.y, alpha));
      }
      return { ...p1, x, y };
    });

    // Alien Bombs
    const b0Map = new Map((s0.state.bombs || []).map(b => [b.id, b]));
    const bombs = (s1.state.bombs || []).map(b1 => {
      const b0 = b0Map.get(b1.id);
      let x = b1.x;
      let y = b1.y;
      if (b0) {
        x = Math.round(lerp(b0.x, b1.x, alpha));
        y = Math.round(lerp(b0.y, b1.y, alpha));
      }
      return { ...b1, x, y };
    });

    // Player Bullets
    const bl0Map = new Map((s0.state.bullets || []).map(b => [b.id, b]));
    const bullets = (s1.state.bullets || []).map(b1 => {
      const b0 = bl0Map.get(b1.id);
      let x = b1.x;
      let y = b1.y;
      if (b0) {
        x = Math.round(lerp(b0.x, b1.x, alpha));
        y = Math.round(lerp(b0.y, b1.y, alpha));
      }
      return { ...b1, x, y };
    });

    // UFO
    let ufo = s1.state.ufo;
    if (s0.state.ufo && s1.state.ufo && s0.state.ufo.active && s1.state.ufo.active) {
      ufo = {
        ...s1.state.ufo,
        x: Math.round(lerp(s0.state.ufo.x, s1.state.ufo.x, alpha)),
        y: Math.round(lerp(s0.state.ufo.y, s1.state.ufo.y, alpha))
      };
    }

    // Boss Enemy
    let boss = s1.state.boss;
    if (s0.state.boss && s1.state.boss && s0.state.boss.alive && s1.state.boss.alive) {
      boss = {
        ...s1.state.boss,
        x: Math.round(lerp(s0.state.boss.x, s1.state.boss.x, alpha)),
        y: Math.round(lerp(s0.state.boss.y, s1.state.boss.y, alpha))
      };
    }

    // Invaders
    const inv0Map = new Map((s0.state.invaders || []).map(inv => [inv.id, inv]));
    const invaders = (s1.state.invaders || []).map(inv1 => {
      const inv0 = inv0Map.get(inv1.id);
      let x = inv1.x;
      let y = inv1.y;
      let angle = inv1.angle || 0;
      if (inv0) {
        x = Math.round(lerp(inv0.x, inv1.x, alpha));
        y = Math.round(lerp(inv0.y, inv1.y, alpha));
        if (typeof inv0.angle === 'number' && typeof inv1.angle === 'number') {
          let diff = inv1.angle - inv0.angle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          angle = inv0.angle + diff * alpha;
        }
      }
      return { ...inv1, x, y, angle };
    });

    return {
      ...s1.state,
      players,
      bombs,
      bullets,
      ufo,
      boss,
      powerups: s1.state.powerups || [],
      invaders,
      bunkers: s1.state.bunkers || []
    };
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 800, 850);

    // Deep space background
    ctx.fillStyle = '#020308';
    ctx.fillRect(0, 0, 800, 850);

    ctx.save();
    if (this.shakeTimer > 0 && this.shakeDuration > 0) {
      const shakeMag = (this.shakeTimer / this.shakeDuration) * this.shakeIntensity;
      ctx.translate((Math.random() - 0.5) * shakeMag * 2, (Math.random() - 0.5) * shakeMag * 2);
    }

    // 1. Draw Starfield
    for (const star of this.stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }

    // 2. Draw Classic Green Defense Baseline
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 774);
    ctx.lineTo(785, 774);
    ctx.stroke();

    // Grab smoothly interpolated state for all remote entities
    const displayState = this.getInterpolatedEntities();

    // 3. Draw Bunkers
    if (displayState.bunkers) {
      for (const bunker of displayState.bunkers) {
        this.renderBunker(bunker);
      }
    }

    // 4. Draw Invaders (Smoothly interpolated march & Galaxian dive bombers)
    const animFrame = displayState.animFrame ?? this.state.animFrame ?? 0;
    if (displayState.invaders) {
      for (const inv of displayState.invaders) {
        this.renderInvader(inv, animFrame);

        // Particle sparks behind diving / returning invaders
        if (inv.diving && Math.random() < 0.45) {
          const w = inv.type === 'squid' ? 24 : (inv.type === 'crab' ? 33 : 36);
          this.particles.push({
            x: inv.x + w / 2 + (Math.random() * 8 - 4),
            y: inv.y + 12 + (Math.random() * 8 - 4),
            vx: (Math.random() - 0.5) * 25,
            vy: (Math.random() - 0.5) * 25,
            size: Math.random() < 0.5 ? 2 : 1,
            color: inv.divePhase === 'returning' ? '#00e5ff' : '#ff7700',
            life: 0.22,
            maxLife: 0.22
          });
        }
      }
    }

    // 4.5. Draw Boss Enemy above horde
    if (displayState.boss && displayState.boss.alive) {
      this.renderBoss(displayState.boss, animFrame);
    }

    // 4.6. Draw Falling Power-up Drops
    if (displayState.powerups) {
      for (const pw of displayState.powerups) {
        this.renderPowerup(pw);
      }
    }

    // 5. Draw UFO (Randomized between 5 types and colors with dynamic stereo audio tracking)
    if (displayState.ufo && displayState.ufo.active) {
      this.renderUfo(displayState.ufo);
      Sound.updateUfo(displayState.ufo.x);
    }

    // 6. Draw Alien Bombs
    if (displayState.bombs) {
      for (const bomb of displayState.bombs) {
        this.renderBomb(bomb);
      }
    }

    // 7. Draw Player Bullets
    if (displayState.bullets) {
      for (const bullet of displayState.bullets) {
        this.renderBullet(bullet);
      }
    }

    // 8. Draw Player Cannons (Local player rendered with 0ms client prediction)
    if (displayState.players) {
      for (const player of displayState.players) {
        if (player.id === this.localPlayerId && this.localX !== null) {
          this.renderPlayer({ ...player, x: Math.round(this.localX) });
        } else if (player.id === this.localP2Id && this.localP2X !== null) {
          this.renderPlayer({ ...player, x: Math.round(this.localP2X) });
        } else {
          this.renderPlayer(player);
        }
      }
    }

    // 9. Draw Particle Explosions
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;

    // 9.1. Draw Cross Explosion Shockwaves
    for (const cb of this.crossBlasts) {
      const alpha = Math.max(0, cb.life / cb.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffd700';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(1, 4 * alpha);

      // Horizontal beam
      ctx.beginPath();
      ctx.moveTo(cb.x - cb.size, cb.y);
      ctx.lineTo(cb.x + cb.size, cb.y);
      ctx.stroke();

      // Vertical beam
      ctx.beginPath();
      ctx.moveTo(cb.x, cb.y - cb.size);
      ctx.lineTo(cb.x, cb.y + cb.size);
      ctx.stroke();

      // Cardinal blast tips
      const tipSize = 4;
      ctx.fillStyle = '#ff3300';
      ctx.fillRect(cb.x - cb.size - tipSize / 2, cb.y - tipSize / 2, tipSize, tipSize);
      ctx.fillRect(cb.x + cb.size - tipSize / 2, cb.y - tipSize / 2, tipSize, tipSize);
      ctx.fillRect(cb.x - tipSize / 2, cb.y - cb.size - tipSize / 2, tipSize, tipSize);
      ctx.fillRect(cb.x - tipSize / 2, cb.y + cb.size - tipSize / 2, tipSize, tipSize);

      // Central core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, Math.max(1, cb.size * 0.22), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 10. Draw Floating Scores
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    for (const s of this.floatingScores) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1.0;

    // 10.5. Draw Player Floating Texts (Power-up collected text above player ship)
    if (this.playerFloatingTexts && this.playerFloatingTexts.length > 0) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      for (const item of this.playerFloatingTexts) {
        const lifeFraction = item.life / item.maxLife;
        let alpha = 1.0;
        if (lifeFraction > 0.9) {
          alpha = (1.0 - lifeFraction) / 0.1; // Smooth fade-in
        } else if (lifeFraction < 0.25) {
          alpha = lifeFraction / 0.25; // Smooth fade-out
        }

        let playerObj = null;
        if (displayState.players) {
          playerObj = displayState.players.find(p => p.id === item.playerId);
        }
        let px = item.fallbackX;
        let py = item.fallbackY;
        if (playerObj) {
          let actualX = playerObj.x;
          if (playerObj.id === this.localPlayerId && this.localX !== null) {
            actualX = Math.round(this.localX);
          } else if (playerObj.id === this.localP2Id && this.localP2X !== null) {
            actualX = Math.round(this.localP2X);
          }
          px = actualX + (playerObj.width || 36) / 2;
          py = playerObj.y;
        }

        const targetY = py - item.offsetY;
        const renderX = Math.max(90, Math.min(800 - 90, px));

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1.0, alpha));

        // High contrast outline
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.strokeText(item.text, renderX, targetY);

        // Glowing neon power-up announcement text
        ctx.shadowColor = item.color || '#ffd700';
        ctx.shadowBlur = 8;
        ctx.fillStyle = item.color || '#ffd700';
        ctx.fillText(item.text, renderX, targetY);
        ctx.restore();
      }
    }

    // 11. Bottom HUD (Credits & Lives Indicator)
    this.renderBottomHud();

    ctx.restore();
  }

  renderBunker(bunker) {
    const ctx = this.ctx;
    const cellSize = 3;
    ctx.fillStyle = '#00ff66';

    for (let r = 0; r < bunker.grid.length; r++) {
      for (let c = 0; c < bunker.grid[r].length; c++) {
        if (bunker.grid[r][c] === 1) {
          ctx.fillRect(bunker.x + c * cellSize, bunker.y + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  renderInvader(inv, frame) {
    const ctx = this.ctx;
    let spriteMatrix;
    let color;

    if (inv.type === 'squid') {
      spriteMatrix = SPRITES.squid[frame];
      color = '#ff007f'; // Neon Magenta
    } else if (inv.type === 'crab') {
      spriteMatrix = SPRITES.crab[frame];
      color = '#00e5ff'; // Cyan
    } else {
      spriteMatrix = SPRITES.octopus[frame];
      color = '#ffd700'; // Yellow
    }

    const width = inv.type === 'squid' ? 24 : (inv.type === 'crab' ? 33 : 36);
    const height = 24;

    if (inv.diving) {
      const cx = inv.x + width / 2;
      const cy = inv.y + height / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(inv.angle || 0);

      // Jet flame / thruster behind tentacles (local +Y)
      const isReturning = inv.divePhase === 'returning';
      const flameColor = isReturning ? '#00e5ff' : '#ff4400';
      const flameCore = isReturning ? '#ffffff' : '#ffd700';
      const flameLength = (isReturning ? 15 : 10) + Math.random() * 4;

      ctx.fillStyle = flameColor;
      ctx.beginPath();
      ctx.moveTo(-5, height / 2);
      ctx.lineTo(0, height / 2 + flameLength);
      ctx.lineTo(5, height / 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = flameCore;
      ctx.beginPath();
      ctx.moveTo(-2, height / 2);
      ctx.lineTo(0, height / 2 + flameLength * 0.55);
      ctx.lineTo(2, height / 2);
      ctx.closePath();
      ctx.fill();

      // Subtle glow shadow around diving invader
      ctx.shadowColor = isReturning ? '#00e5ff' : color;
      ctx.shadowBlur = 8;

      // Draw sprite centered at origin
      drawPixelMatrix(ctx, spriteMatrix, -width / 2, -height / 2, 3, color);
      ctx.restore();
    } else {
      drawPixelMatrix(ctx, spriteMatrix, inv.x, inv.y, 3, color);
    }
  }

  renderUfo(ufo) {
    const ctx = this.ctx;
    const spriteMatrix = (SPRITES.ufoTypes && SPRITES.ufoTypes[ufo.type]) || SPRITES.ufo;
    const color = ufo.color || '#ff3344';
    drawPixelMatrix(ctx, spriteMatrix, ufo.x, ufo.y, 3, color);
  }

  renderBoss(boss, frame = 0) {
    const ctx = this.ctx;
    const bossSprites = (SPRITES.bosses && SPRITES.bosses[boss.type]) || SPRITES.bosses[0];
    let spriteMatrix;
    if (Array.isArray(bossSprites) && Array.isArray(bossSprites[0]) && Array.isArray(bossSprites[0][0])) {
      spriteMatrix = bossSprites[frame % bossSprites.length];
    } else {
      spriteMatrix = bossSprites;
    }
    const color = boss.flash ? '#ffffff' : (boss.color || '#ff0055');

    // Draw Boss Matrix (24 cols x 12 rows @ 3px = 72x36px)
    drawPixelMatrix(ctx, spriteMatrix, boss.x, boss.y, 3, color);

    // Draw Segmented Boss Health Bar above boss
    const barWidth = 72;
    const barHeight = 6;
    const barX = boss.x;
    const barY = boss.y - 12;

    // Background & frame
    ctx.fillStyle = 'rgba(10, 14, 25, 0.85)';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    ctx.strokeStyle = '#ff3344';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // HP segments (20 hits)
    const hp = Math.max(0, Math.min(20, boss.hp));
    const segmentWidth = barWidth / 20;
    ctx.fillStyle = hp > 6 ? (boss.color || '#ff0055') : '#ff2222';
    for (let s = 0; s < hp; s++) {
      ctx.fillRect(barX + s * segmentWidth + 0.5, barY + 0.5, segmentWidth - 1, barHeight - 1);
    }
  }

  renderPowerup(pw) {
    const ctx = this.ctx;
    const colors = {
      rapid_fire: '#ffaa00',
      super_speed: '#00e5ff',
      fast_move: '#00ff66',
      shield: '#00d4ff',
      triple_shot: '#ff00ff',
      rocket_launcher: '#ff4400'
    };
    const color = colors[pw.type] || '#ffd700';
    const bob = Math.sin(Date.now() / 140) * 3;
    const x = pw.x;
    const y = pw.y + bob;
    const size = 20;

    // Outer glowing capsule badge
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(12, 16, 32, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Central Power-up Icon
    const icon = SPRITES.powerups && SPRITES.powerups[pw.type];
    if (icon) {
      drawPixelMatrix(ctx, icon, x + 3, y + 3, 1.8, color);
    }
  }

  renderBullet(bullet) {
    const ctx = this.ctx;
    if (bullet.isMissile) {
      this.renderMissile(bullet);
      return;
    }
    ctx.fillStyle = bullet.color || '#00e5ff';
    ctx.shadowColor = bullet.color || '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.fillRect(bullet.x, bullet.y, 4, 12);
    ctx.shadowBlur = 0;
  }

  renderMissile(bullet) {
    const ctx = this.ctx;
    const x = bullet.x;
    const y = bullet.y;
    const w = 6;
    const h = 14;

    ctx.save();
    // Glowing rocket thruster and warhead
    ctx.shadowColor = '#ff5500';
    ctx.shadowBlur = 10;

    // Aerodynamic red warhead nose cone
    ctx.fillStyle = '#ff2200';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + 4);
    ctx.lineTo(x, y + 4);
    ctx.closePath();
    ctx.fill();

    // Rocket fuselage (metallic white / light grey)
    ctx.fillStyle = '#f0f0f5';
    ctx.fillRect(x + 1, y + 4, w - 2, 7);

    // Rocket body accent band
    ctx.fillStyle = '#ff5500';
    ctx.fillRect(x + 1, y + 6, w - 2, 2);

    // Stabilizer fins
    ctx.fillStyle = '#cc1100';
    ctx.fillRect(x - 1, y + 8, 2, 4);
    ctx.fillRect(x + w - 1, y + 8, 2, 4);

    // Thruster nozzle
    ctx.fillStyle = '#444444';
    ctx.fillRect(x + 1, y + 11, w - 2, 2);

    // Dynamic Rocket Exhaust Flame
    const flameH = 4 + Math.random() * 5;
    const grad = ctx.createLinearGradient(x + w / 2, y + 13, x + w / 2, y + 13 + flameH);
    grad.addColorStop(0, '#ffff55');
    grad.addColorStop(0.4, '#ff6600');
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 13);
    ctx.lineTo(x + w - 1, y + 13);
    ctx.lineTo(x + w / 2, y + 13 + flameH);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  renderBomb(bomb) {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    // Classic zigzag alien bomb look
    const tick = Math.floor(Date.now() / 80) % 4;
    const offset = tick % 2 === 0 ? 1 : -1;
    ctx.fillRect(bomb.x + offset, bomb.y, 3, 4);
    ctx.fillRect(bomb.x - offset, bomb.y + 4, 3, 4);
    ctx.fillRect(bomb.x + offset, bomb.y + 8, 3, 4);
  }

  renderPlayer(player) {
    const ctx = this.ctx;

    // If player is dead, show respawn countdown if lives left
    if (!player.alive) {
      if (player.lives > 0) {
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = player.color;
        ctx.textAlign = 'center';
        ctx.fillText('DEPLOYING...', player.x + player.width / 2, player.y + 12);
      }
      return;
    }

    // Invulnerability flashing effect
    if (player.isInvulnerable) {
      const flash = Math.floor(Date.now() / 100) % 2;
      if (flash === 0) return; // Flash off
    }

    // Motion trail blur effect when fast_move powerup is active
    const trail = (player.id === this.localPlayerId) ? this.motionTrailP1 : (player.id === this.localP2Id ? this.motionTrailP2 : null);
    if (trail && player.powerups && player.powerups.fast_move) {
      for (let i = trail.length - 1; i >= 0; i--) {
        const ghost = trail[i];
        const ghostAlpha = (1 - (i + 1) / (trail.length + 1)) * 0.45;
        ctx.save();
        ctx.globalAlpha = ghostAlpha;
        const cannonMat = (player.powerups && player.powerups.shield) ? SPRITES.cannon_armored : SPRITES.cannon;
        drawPixelMatrix(ctx, cannonMat, ghost.x, ghost.y, 3, player.color);
        ctx.restore();
      }
    }

    // Stronger (Shield) power-up: shape changes to armored cannon and displays energy barrier
    const isShielded = Boolean(player.powerups && player.powerups.shield);
    const spriteMatrix = isShielded ? SPRITES.cannon_armored : SPRITES.cannon;

    // Draw cannon sprite
    drawPixelMatrix(ctx, spriteMatrix, player.x, player.y, 3, player.color);

    // Glowing shield energy sphere if shielded
    if (isShielded) {
      ctx.save();
      ctx.strokeStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(player.x + player.width / 2, player.y + player.height / 2, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw player callsign above cannon
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = player.color;
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x + player.width / 2, player.y - 12);

    // Draw active power-up badges above the name
    if (player.powerups) {
      const activeKeys = Object.keys(player.powerups).filter(k => player.powerups[k]);
      if (activeKeys.length > 0) {
        const badgeSpacing = 13;
        const totalW = activeKeys.length * badgeSpacing;
        const startX = player.x + player.width / 2 - totalW / 2;
        const colors = {
          rapid_fire: '#ffaa00',
          super_speed: '#00e5ff',
          fast_move: '#00ff66',
          shield: '#00d4ff',
          triple_shot: '#ff00ff',
          rocket_launcher: '#ff4400'
        };
        activeKeys.forEach((key, idx) => {
          const icon = SPRITES.powerups && SPRITES.powerups[key];
          if (icon) {
            drawPixelMatrix(ctx, icon, startX + idx * badgeSpacing, player.y - 25, 1.2, colors[key] || '#fff');
          }
        });
      }
    }

    // Highlight indicator for local player
    if (player.id === this.localPlayerId) {
      ctx.fillStyle = '#00ff66';
      ctx.beginPath();
      ctx.moveTo(player.x + player.width / 2, player.y - 6);
      ctx.lineTo(player.x + player.width / 2 - 4, player.y - 2);
      ctx.lineTo(player.x + player.width / 2 + 4, player.y - 2);
      ctx.fill();
    }
  }

  renderBottomHud() {
    const ctx = this.ctx;
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';

    // Find local player to display lives
    const localPlayer = this.state.players.find(p => p.id === this.localPlayerId);
    const lives = localPlayer ? localPlayer.lives : 3;

    ctx.fillText(`${lives}`, 20, 810);
    // Draw miniature cannons for remaining lives
    for (let i = 0; i < Math.max(0, lives - 1); i++) {
      drawPixelMatrix(ctx, SPRITES.cannon, 40 + i * 26, 802, 1.5, localPlayer ? localPlayer.color : '#00ff66');
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#7d849b';
    ctx.fillText('CREDIT 00', 780, 810);
  }
}

// Global game instance
window.addEventListener('DOMContentLoaded', () => {
  window.Game = new SpaceInvadersGame();
});
