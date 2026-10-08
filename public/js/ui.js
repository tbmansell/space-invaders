// Space Invaders UI Manager

class UIManager {
  constructor() {
    this.selectedColor = '#00ff66';

    this.cacheElements();
    this.bindEvents();
    this.initTouchControls();
  }

  cacheElements() {
    this.elScore = document.getElementById('player-score');
    this.elHighScore = document.getElementById('high-score');
    this.elWave = document.getElementById('wave-num');
    this.elPlayerCount = document.getElementById('player-count');
    this.elSquadList = document.getElementById('squad-list');
    this.elChatFeed = document.getElementById('chat-feed');
    this.elEventFeed = document.getElementById('event-feed');
    this.elBanner = document.getElementById('game-banner');
    this.elBannerTitle = document.getElementById('banner-title');
    this.elBannerSub = document.getElementById('banner-subtitle');
    this.elCrtOverlay = document.getElementById('crt-overlay');

    // Modals
    this.modalJoin = document.getElementById('modal-join');
    this.formJoin = document.getElementById('form-join');
    this.inputJoinName = document.getElementById('input-join-name');
    this.joinColorPalette = document.getElementById('join-color-palette');

    // Squad Panel & Mobile Drawer Elements
    this.squadPanel = document.getElementById('squad-panel');
    this.squadBackdrop = document.getElementById('squad-backdrop');
    this.btnCloseSquad = document.getElementById('btn-close-squad');
    this.btnOpenSquad = document.getElementById('btn-open-squad');
    this.marqueeSquad = document.getElementById('marquee-squad');

    // Chat Radio Form Elements
    this.chatForm = document.getElementById('chat-form');
    this.inputChat = document.getElementById('input-chat');
    // Utility Toolbar Buttons
    this.btnSound = document.getElementById('btn-sound');

    // On-Screen Faint Controls
    this.btnScreenLeft = document.getElementById('btn-screen-left');
    this.btnScreenRight = document.getElementById('btn-screen-right');
    this.btnScreenFire = document.getElementById('btn-screen-fire');

    // Sync sound button state immediately
    this.updateSoundButton();
  }

  updateSoundButton() {
    if (!this.btnSound) return;
    this.btnSound.innerText = Sound.muted ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
    this.btnSound.classList.toggle('active', !Sound.muted);
  }

  bindEvents() {
    // 1. Join Game Modal Submit (Player Call Sign)
    if (this.formJoin) {
      this.formJoin.addEventListener('submit', (e) => {
        e.preventDefault();
        Sound.unlock();
        const callsign = (this.inputJoinName.value || '').trim().substring(0, 15);
        if (!callsign) {
          this.inputJoinName.focus();
          return;
        }

        try {
          localStorage.setItem('space_invaders_callsign', callsign);
        } catch (err) {}

        if (this.inputJoinName) this.inputJoinName.blur();

        if (window.Game) {
          window.Game.joinGame(callsign, this.selectedColor);
        }
      });
    }

    if (this.joinColorPalette) {
      this.joinColorPalette.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch) {
          const color = swatch.getAttribute('data-color');
          this.highlightColor(color);
        }
      });
    }

    // 2. Chat Button & Mobile Squad Drawer Controls
    if (this.btnOpenSquad) {
      this.btnOpenSquad.addEventListener('click', () => {
        Sound.unlock();
        if (window.matchMedia('(max-width: 900px)').matches) {
          this.openSquadPanel();
        }
        if (this.inputChat) {
          setTimeout(() => this.inputChat.focus(), 150);
        }
      });
    }

    if (this.marqueeSquad) {
      this.marqueeSquad.addEventListener('click', () => {
        Sound.unlock();
        if (window.matchMedia('(max-width: 900px)').matches) {
          this.toggleSquadPanel();
        }
      });
    }

    if (this.btnCloseSquad) {
      this.btnCloseSquad.addEventListener('click', () => {
        Sound.unlock();
        this.closeSquadPanel();
      });
    }

    if (this.squadBackdrop) {
      this.squadBackdrop.addEventListener('click', () => {
        this.closeSquadPanel();
      });
    }

    // 3. Free Text Radio Chat (Submit on Enter for any mobile or desktop keyboard)
    const submitChat = () => {
      if (!this.inputChat) return;
      const text = this.inputChat.value.trim().substring(0, 50);
      if (text && window.Game) {
        window.Game.sendChat(text);
        this.inputChat.value = '';
        this.inputChat.blur(); // Dismiss virtual keyboard on touch screens
      }
    };

    if (this.chatForm) {
      this.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        Sound.unlock();
        submitChat();
      });
    }

    if (this.inputChat) {
      this.inputChat.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
          e.preventDefault();
          Sound.unlock();
          submitChat();
        }
      });
    }

    // 4. Sound toggle
    if (this.btnSound) {
      this.btnSound.addEventListener('click', () => {
        Sound.unlock();
        Sound.toggleMute();
        this.updateSoundButton();
        this.btnSound.blur();
      });
    }

    // Close mobile drawer on escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSquadPanel();
      }
    });
  }

  openSquadPanel() {
    if (this.squadPanel) {
      this.squadPanel.classList.add('mobile-open');
    }
    if (this.squadBackdrop) {
      this.squadBackdrop.classList.remove('hidden');
    }
  }

  closeSquadPanel() {
    if (this.squadPanel) {
      this.squadPanel.classList.remove('mobile-open');
    }
    if (this.squadBackdrop) {
      this.squadBackdrop.classList.add('hidden');
    }
  }

  toggleSquadPanel() {
    if (this.squadPanel && this.squadPanel.classList.contains('mobile-open')) {
      this.closeSquadPanel();
    } else {
      this.openSquadPanel();
    }
  }

  showJoinModal(defaultColor) {
    if (this.modalJoin) {
      this.modalJoin.classList.remove('hidden');
      try {
        const saved = localStorage.getItem('space_invaders_callsign');
        if (saved && this.inputJoinName) {
          this.inputJoinName.value = saved;
        }
      } catch (e) {}

      if (defaultColor) {
        this.highlightColor(defaultColor);
      }
      setTimeout(() => {
        if (this.inputJoinName) this.inputJoinName.focus();
      }, 100);
    }
  }

  onPlayerJoined(name, color) {
    if (this.modalJoin) {
      this.modalJoin.classList.add('hidden');
    }
    this.setLocalProfile(name, color);
  }

  highlightColor(color) {
    this.selectedColor = color;
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.classList.toggle('selected', swatch.getAttribute('data-color') === color);
    });
  }

  setLocalProfile(name, color) {
    if (this.inputPilotName) this.inputPilotName.value = name;
    this.highlightColor(color);
  }

  initTouchControls() {
    const bindTouch = (btn, action) => {
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (window.Game) window.Game.setTouchInput(action, true);
      };
      const end = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (window.Game) window.Game.setTouchInput(action, false);
      };

      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('touchcancel', end, { passive: false });
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    };

    bindTouch(this.btnScreenLeft, 'left');
    bindTouch(this.btnScreenRight, 'right');
    bindTouch(this.btnScreenFire, 'fire');
  }

  updateSquad(players, localP1Id, localP2Id) {
    if (!players) return;

    // 1. Update Header Marquee
    const localPlayer = players.find(p => p.id === localP1Id);
    if (localPlayer) {
      this.elScore.innerText = String(localPlayer.score).padStart(4, '0');
    }

    if (window.Game && window.Game.state) {
      this.elHighScore.innerText = String(window.Game.state.highScore || 9990).padStart(4, '0');
      this.elWave.innerText = String(window.Game.state.wave || 1).padStart(2, '0');
    }

    const count = players.length;
    this.elPlayerCount.innerText = `${count} PILOT${count === 1 ? '' : 'S'}`;

    // 2. Sort players by score descending
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const highestScore = sorted.length > 0 ? sorted[0].score : 0;

    // 3. Render Squad List
    this.elSquadList.innerHTML = '';
    sorted.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'squad-member';
      if (p.id === localP1Id || p.id === localP2Id) {
        li.classList.add('self');
      }

      const isMvp = highestScore > 0 && p.score === highestScore;
      const youBadge = p.id === localP1Id ? ' (YOU)' : (p.id === localP2Id ? ' (P2)' : '');
      const mvpBadge = isMvp ? ' 👑' : '';

      // Generate life icons
      let lifeStr = '';
      for (let i = 0; i < p.lives; i++) lifeStr += '▲ ';
      if (p.lives === 0) lifeStr = 'FALLEN';

      li.innerHTML = `
        <div class="member-top">
          <span class="member-name" style="color: ${p.color};">${p.name}${youBadge}${mvpBadge}</span>
          <span class="member-score">${String(p.score).padStart(4, '0')}</span>
        </div>
        <div class="member-stats">
          <span class="member-lives">${lifeStr}</span>
          <span>KILLS: ${p.kills}</span>
        </div>
      `;
      this.elSquadList.appendChild(li);
    });
  }

  showBanner(title, subtitle, isWaveClear = false) {
    this.elBannerTitle.innerText = title;
    this.elBannerSub.innerText = subtitle;
    this.elBanner.classList.remove('hidden');
    this.elBanner.classList.toggle('wave-clear', isWaveClear);
  }

  hideBanner() {
    this.elBanner.classList.add('hidden');
  }

  addChatMessage(sender, color, text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.style.borderLeftColor = color;
    msgEl.innerHTML = `<strong style="color: ${color};">${sender}:</strong> ${text}`;
    this.elChatFeed.appendChild(msgEl);

    // Limit visible chat messages
    while (this.elChatFeed.children.length > 4) {
      this.elChatFeed.removeChild(this.elChatFeed.firstChild);
    }

    setTimeout(() => {
      if (msgEl.parentNode) {
        msgEl.remove();
      }
    }, 6000);
  }

  addEventNotification(text, color = '#00ff66', isLeave = false) {
    if (!this.elEventFeed) return;
    const el = document.createElement('div');
    el.className = 'event-msg' + (isLeave ? ' leave' : '');
    if (color) el.style.borderRightColor = color;
    el.innerText = text;
    this.elEventFeed.appendChild(el);

    while (this.elEventFeed.children.length > 4) {
      this.elEventFeed.removeChild(this.elEventFeed.firstChild);
    }

    setTimeout(() => {
      if (el.parentNode) {
        el.remove();
      }
    }, 5000);
  }
}

// Global UI instance
window.addEventListener('DOMContentLoaded', () => {
  window.UI = new UIManager();
});
