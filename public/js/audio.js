// Space Invaders Retro 8-bit Procedural Web Audio API Sound System
// Pure procedural synthesis - no external audio files required!

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.ufoOsc = null;
    this.ufoGain = null;
    this.ufoLfo = null;
    this.ufoPanner = null;
    this.ufoNodes = null;
    this.noiseBuffer = null;

    // Alien Voice Transmission state
    this.alienVoiceBuffer = null;
    this.alienVoiceLoading = false;
    this.alienVoicePromise = null;
    this.alienVoiceUrl = '/audio/alien_wave_start.wav';
    this.alienVoiceSource = null;

    // 4 Classic descending march notes
    this.marchFrequencies = [175, 155, 138, 123];

    // Load mute preference
    try {
      const savedMute = localStorage.getItem('space_invaders_muted');
      if (savedMute !== null) {
        this.muted = savedMute === 'true';
      }
    } catch (e) {
      // Local storage not available
    }
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.4;
      this.masterGain.connect(this.ctx.destination);
      this.buildNoiseBuffer();
      this.preloadAlienVoice();
    } catch (e) {
      console.warn('AudioContext initialization error:', e);
    }
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    try {
      localStorage.setItem('space_invaders_muted', String(this.muted));
    } catch (e) {}

    this.unlock();
    if (this.masterGain) {
      try {
        if (this.ctx) {
          this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
          this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
        }
        this.masterGain.gain.value = this.muted ? 0 : 0.4;
      } catch (e) {
        this.masterGain.gain.value = this.muted ? 0 : 0.4;
      }
    }
    if (this.muted) {
      this.stopUfo();
      this.stopAlienVoice();
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playTestBeep();
    }
    return this.muted;
  }

  playTestBeep() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.05); // A5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {
      console.warn('Test beep error:', e);
    }
  }

  buildNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  // 1. Invader March Step (4 descending notes)
  playMarchBeat(step) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const freq = this.marchFrequencies[step % 4];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 2. Player Cannon Shoot Laser
  playShoot() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // 3. Invader Destroyed (Crisp noise burst)
  playInvaderExplosion() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    if (!this.noiseBuffer) this.buildNoiseBuffer();
    if (!this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.23);
  }

  // 4. Player Cannon Destroyed (Deep rumbling explosion)
  playPlayerExplosion() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    if (!this.noiseBuffer) this.buildNoiseBuffer();
    if (!this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.6);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    // Add a low buzz oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.6);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.66);
    osc.start(now);
    osc.stop(now + 0.66);
  }

  // 5. Mystery UFO / Hover Spaceship Thruster & Beacon (Rich layered retro sound with stereo panning)
  startUfo() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    // Clean up any previously running UFO sound so we never reject a new spawn
    if (this.ufoNodes) {
      this.stopUfo();
    }

    try {
      const now = this.ctx.currentTime;
      this.ufoNodes = [];

      // Master UFO gain with smooth fade-in
      this.ufoGain = this.ctx.createGain();
      this.ufoGain.gain.setValueAtTime(0.0001, now);
      this.ufoGain.gain.exponentialRampToValueAtTime(0.24, now + 0.08);
      this.ufoNodes.push(this.ufoGain);

      // Stereo Panner (smoothly pans left-to-right as hover ship crosses the screen)
      if (this.ctx.createStereoPanner) {
        this.ufoPanner = this.ctx.createStereoPanner();
        this.ufoPanner.pan.setValueAtTime(0, now);
        this.ufoGain.connect(this.ufoPanner);
        this.ufoPanner.connect(this.masterGain);
        this.ufoNodes.push(this.ufoPanner);
      } else {
        this.ufoGain.connect(this.masterGain);
      }

      // --- Layer 1: Alien Mystery Beacon (Classic retro stepped sci-fi warble) ---
      const beaconOsc = this.ctx.createOscillator();
      beaconOsc.type = 'triangle';
      beaconOsc.frequency.setValueAtTime(540, now);

      // Stepped pitch modulation (8.5Hz alternating high/low alien chirp)
      const beaconLfo = this.ctx.createOscillator();
      beaconLfo.type = 'square';
      beaconLfo.frequency.setValueAtTime(8.5, now);

      const beaconLfoGain = this.ctx.createGain();
      beaconLfoGain.gain.setValueAtTime(75, now);
      beaconLfo.connect(beaconLfoGain);
      beaconLfoGain.connect(beaconOsc.frequency);

      // Resonant bandpass filter with slow sweeping phasing
      const beaconFilter = this.ctx.createBiquadFilter();
      beaconFilter.type = 'bandpass';
      beaconFilter.frequency.setValueAtTime(1100, now);
      beaconFilter.Q.setValueAtTime(2.4, now);

      const filterLfo = this.ctx.createOscillator();
      filterLfo.type = 'sine';
      filterLfo.frequency.setValueAtTime(0.75, now);
      const filterLfoGain = this.ctx.createGain();
      filterLfoGain.gain.setValueAtTime(320, now);
      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(beaconFilter.frequency);

      const beaconGain = this.ctx.createGain();
      beaconGain.gain.setValueAtTime(0.2, now);

      beaconOsc.connect(beaconFilter);
      beaconFilter.connect(beaconGain);
      beaconGain.connect(this.ufoGain);

      this.ufoNodes.push(beaconOsc, beaconLfo, beaconLfoGain, beaconFilter, filterLfo, filterLfoGain, beaconGain);

      // --- Layer 2: Hover Propulsion Engine (Low thrumming anti-gravity thruster drone) ---
      const engineOsc = this.ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(138, now);

      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.setValueAtTime(380, now);
      engineFilter.Q.setValueAtTime(1.8, now);

      const engineGain = this.ctx.createGain();
      engineGain.gain.setValueAtTime(0.09, now);

      // Hover tremolo pulsing thruster output at 6Hz
      const engineLfo = this.ctx.createOscillator();
      engineLfo.type = 'sine';
      engineLfo.frequency.setValueAtTime(6.0, now);
      const engineLfoGain = this.ctx.createGain();
      engineLfoGain.gain.setValueAtTime(0.045, now);
      engineLfo.connect(engineLfoGain);
      engineLfoGain.connect(engineGain.gain);

      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(this.ufoGain);

      this.ufoNodes.push(engineOsc, engineFilter, engineGain, engineLfo, engineLfoGain);

      // Backward compatibility reference
      this.ufoOsc = beaconOsc;
      this.ufoLfo = beaconLfo;

      // Start all sound generators
      beaconLfo.start(now);
      filterLfo.start(now);
      beaconOsc.start(now);
      engineLfo.start(now);
      engineOsc.start(now);
    } catch (e) {
      console.warn('UFO audio error:', e);
    }
  }

  stopUfo() {
    if (!this.ufoNodes) return;
    try {
      const now = this.ctx ? this.ctx.currentTime : 0;
      if (this.ufoGain && this.ctx) {
        try {
          this.ufoGain.gain.cancelScheduledValues(now);
          const currentGain = Math.max(0.0001, this.ufoGain.gain.value || 0.2);
          this.ufoGain.gain.setValueAtTime(currentGain, now);
          this.ufoGain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        } catch (e) {}
      }
      const nodesToCleanup = this.ufoNodes;
      this.ufoNodes = null;
      this.ufoGain = null;
      this.ufoPanner = null;
      this.ufoOsc = null;
      this.ufoLfo = null;
      setTimeout(() => {
        nodesToCleanup.forEach(node => {
          try {
            if (node.stop) node.stop();
            node.disconnect();
          } catch (e) {}
        });
      }, 50);
    } catch (e) {
      this.ufoNodes = null;
      this.ufoGain = null;
      this.ufoPanner = null;
      this.ufoOsc = null;
      this.ufoLfo = null;
    }
  }

  // Smoothly update stereo sound pan as hover ship glides across the screen (x: 0 to 800)
  updateUfo(x) {
    if (!this.ufoPanner || !this.ctx) return;
    try {
      const pan = Math.max(-0.92, Math.min(0.92, (x - 400) / 380));
      this.ufoPanner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.04);
    } catch (e) {}
  }

  isUfoActive() {
    return Boolean(this.ufoNodes);
  }

  // 6. UFO Mystery Bonus Destroyed (celebratory arpeggio)
  playUfoHit() {
    this.stopUfo();
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const noteTime = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.3, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.13);
    });
  }

  // 7. Wave Cleared Victory Fanfare (Celebration sound when a wave is killed)
  playWaveClear() {
    this.stopUfo();
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // --- Part 1: Triumphant Lead Melody (Bright 8-bit fanfare in C Major) ---
      const leadNotes = [
        // Opening Fanfare Call (Ascending arpeggio)
        { f: 523.25, t: 0.00, d: 0.09 },  // C5
        { f: 659.25, t: 0.09, d: 0.09 },  // E5
        { f: 783.99, t: 0.18, d: 0.09 },  // G5
        { f: 1046.50, t: 0.27, d: 0.24 }, // C6 (proud hold)

        // Celebratory Syncopated Hook
        { f: 783.99, t: 0.54, d: 0.09 },  // G5
        { f: 880.00, t: 0.63, d: 0.09 },  // A5
        { f: 987.77, t: 0.72, d: 0.09 },  // B5
        { f: 1046.50, t: 0.81, d: 0.15 }, // C6
        { f: 1174.66, t: 0.98, d: 0.12 }, // D6
        { f: 1318.51, t: 1.11, d: 0.24 }, // E6

        // Grand Victory Resolution
        { f: 1174.66, t: 1.38, d: 0.10 }, // D6
        { f: 1318.51, t: 1.48, d: 0.10 }, // E6
        { f: 1567.98, t: 1.58, d: 0.45 }  // G6 (triumphant climax)
      ];

      leadNotes.forEach((note) => {
        const start = now + note.t;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(note.f, start);

        gain.gain.setValueAtTime(0.32, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + note.d);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + note.d + 0.02);
      });

      // --- Part 2: Harmonic Bassline (Warm supporting chord progression) ---
      const bassNotes = [
        { f: 130.81, t: 0.00, d: 0.48 }, // C3 (I)
        { f: 174.61, t: 0.54, d: 0.40 }, // F3 (IV)
        { f: 196.00, t: 0.98, d: 0.36 }, // G3 (V)
        { f: 261.63, t: 1.38, d: 0.65 }  // C4 (I Resolution)
      ];

      bassNotes.forEach((note) => {
        const start = now + note.t;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, start);

        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + note.d);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + note.d + 0.02);
      });

      // --- Part 3: Victory Sparkles / Fireworks Cascade (High celebratory chimes at climax) ---
      const sparkles = [
        { f: 1567.98, t: 1.58 }, // G6
        { f: 2093.00, t: 1.65 }, // C7
        { f: 2637.02, t: 1.72 }, // E7
        { f: 3135.96, t: 1.79 }, // G7
        { f: 4186.01, t: 1.86 }  // C8
      ];

      sparkles.forEach((spk) => {
        const start = now + spk.t;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(spk.f, start);

        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + 0.09);
      });
    } catch (e) {
      console.warn('Wave clear fanfare error:', e);
    }
  }

  // 7b. New Wave Incoming Warning Alarm (Urgent combat klaxon siren & mothership rumble)
  playWaveWarning() {
    this.stopUfo();
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // --- Layer 1: Sub-Bass Armada Approach Rumble ---
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(160, now);
      subOsc.frequency.exponentialRampToValueAtTime(38, now + 0.65);

      subGain.gain.setValueAtTime(0.45, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      const subFilter = this.ctx.createBiquadFilter();
      subFilter.type = 'lowpass';
      subFilter.frequency.setValueAtTime(320, now);
      subFilter.frequency.exponentialRampToValueAtTime(80, now + 0.65);

      subOsc.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(this.masterGain);

      subOsc.start(now);
      subOsc.stop(now + 0.66);

      // Atmospheric noise rumble burst
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(450, now);
        nFilter.frequency.exponentialRampToValueAtTime(80, now + 0.5);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.4, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + 0.53);
      }

      // --- Layer 2: Urgent Triple Red-Alert Klaxon Pulses ---
      const klaxons = [
        { t: 0.00, startF: 880, endF: 520, d: 0.13, gain: 0.38 },
        { t: 0.18, startF: 880, endF: 520, d: 0.13, gain: 0.38 },
        { t: 0.36, startF: 1046.5, endF: 587, d: 0.28, gain: 0.42 }
      ];

      klaxons.forEach((k) => {
        const start = now + k.t;

        // Primary alarm saw sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(k.startF, start);
        osc.frequency.exponentialRampToValueAtTime(k.endF, start + k.d);

        gain.gain.setValueAtTime(k.gain, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + k.d);

        // Resonant bandpass filter for biting alarm tone
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, start);
        filter.Q.setValueAtTime(3.5, start);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        // Harsh square harmonic buzzer
        const buzzOsc = this.ctx.createOscillator();
        const buzzGain = this.ctx.createGain();
        buzzOsc.type = 'square';
        buzzOsc.frequency.setValueAtTime(k.startF * 1.5, start);
        buzzOsc.frequency.exponentialRampToValueAtTime(k.endF * 1.5, start + k.d);

        buzzGain.gain.setValueAtTime(k.gain * 0.45, start);
        buzzGain.gain.exponentialRampToValueAtTime(0.001, start + k.d);

        buzzOsc.connect(buzzGain);
        buzzGain.connect(this.masterGain);

        osc.start(start);
        buzzOsc.start(start);
        osc.stop(start + k.d + 0.02);
        buzzOsc.stop(start + k.d + 0.02);
      });
    } catch (e) {
      console.warn('Wave warning audio error:', e);
    }
  }

  // 7c. Alien Voice Transmission: "Puny humans, your planet is ours!"
  async preloadAlienVoice(url = null) {
    if (url) {
      this.alienVoiceUrl = url;
      this.alienVoiceBuffer = null;
      this.alienVoicePromise = null;
    }
    if (this.alienVoiceBuffer) return this.alienVoiceBuffer;
    if (this.alienVoicePromise) return this.alienVoicePromise;

    this.alienVoiceLoading = true;
    this.alienVoicePromise = (async () => {
      try {
        this.unlock();
        const resp = await fetch(this.alienVoiceUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx) {
          return await new Promise((resolve) => {
            this.ctx.decodeAudioData(
              arrayBuf,
              (decoded) => {
                this.alienVoiceBuffer = decoded;
                this.alienVoiceLoading = false;
                resolve(decoded);
              },
              (err) => {
                console.warn('decodeAudioData error:', err);
                this.alienVoiceLoading = false;
                resolve(null);
              }
            );
          });
        }
      } catch (e) {
        console.warn('Preload alien voice notice:', e);
      } finally {
        this.alienVoiceLoading = false;
      }
      return null;
    })();

    return this.alienVoicePromise;
  }

  setAlienVoiceStyle(styleName) {
    const map = {
      'overlord': '/audio/alien_overlord.wav',
      'arcade8bit': '/audio/alien_arcade8bit.wav',
      'cybernetic': '/audio/alien_cybernetic.wav',
      'default': '/audio/alien_wave_start.wav'
    };
    const targetUrl = map[styleName] || '/audio/alien_wave_start.wav';
    this.alienVoiceUrl = targetUrl;
    this.alienVoiceBuffer = null;
    this.alienVoicePromise = null;
    this.preloadAlienVoice(targetUrl);
  }

  playAlienVoice(options = {}) {
    if (this.muted) return;
    this.unlock();

    // If preloaded PCM audio buffer is ready, play high-fidelity processed alien voice
    if (this.ctx && this.alienVoiceBuffer) {
      try {
        this.stopAlienVoice();
        const source = this.ctx.createBufferSource();
        source.buffer = this.alienVoiceBuffer;

        const voiceGain = this.ctx.createGain();
        const gainVal = typeof options.volume === 'number' ? options.volume : 0.85;
        voiceGain.gain.setValueAtTime(gainVal, this.ctx.currentTime);

        source.connect(voiceGain);
        voiceGain.connect(this.masterGain || this.ctx.destination);

        const startTime = this.ctx.currentTime + (options.delay !== undefined ? options.delay : 0.15);
        source.start(startTime);
        this.alienVoiceSource = source;
        return;
      } catch (e) {
        console.warn('AudioBuffer playback error, attempting fallback:', e);
      }
    }

    // If buffer is loading or not loaded yet, wait for preload and then play
    if (!this.alienVoiceBuffer) {
      this.preloadAlienVoice().then((buf) => {
        if (buf && !this.muted) {
          this.playAlienVoice({ ...options, delay: 0.05 });
        } else if (!buf && !this.muted) {
          this.playAlienVoiceProcedural();
        }
      }).catch(() => {
        if (!this.muted) this.playAlienVoiceProcedural();
      });
      return;
    }

    this.playAlienVoiceProcedural();
  }

  stopAlienVoice() {
    if (this.alienVoiceSource) {
      try {
        this.alienVoiceSource.stop();
        this.alienVoiceSource.disconnect();
      } catch (e) {}
      this.alienVoiceSource = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  playAlienVoiceProcedural() {
    if (this.muted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Puny humans... your planet is ours!");
      utterance.pitch = 0.22; // Low, menacing pitch
      utterance.rate = 0.72;  // Slow, ominous tempo
      utterance.volume = this.muted ? 0 : 0.95;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('Male') || v.name.includes('George')));
        if (preferred) utterance.voice = preferred;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Procedural alien voice error:', e);
    }
  }

  // 8. Game Over Fanfare
  playGameOver() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const notes = [293.66, 277.18, 261.63, 246.94]; // D4, C#4, C4, B3
    let t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.32);

      t += 0.28;
    });
  }

  // 9. Power-up Collected Chime (Fast ascending retro arpeggio)
  playPowerup() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const arpeggio = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    let t = this.ctx.currentTime;

    arpeggio.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.09);

      t += 0.06;
    });
  }

  // 10. Shield / Armor Deflection Sound
  playShieldAbsorb() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // 10.1. Rocket Launcher Firing Whoosh
  playRocketLaunch() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Layer 1: Pitch-dropping engine whine
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.2);
    oscGain.gain.setValueAtTime(0.28, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);

    // Layer 2: Filtered rocket booster thruster whoosh
    if (!this.noiseBuffer) this.buildNoiseBuffer();
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(1600, now + 0.1);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.22);
      filter.Q.setValueAtTime(2.2, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.35, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.25);
    }
  }

  // 10.2. Rocket Missile Cross Blast Explosion (Deep Sub-bass rumble + noise blast)
  playRocketExplosion() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    if (!this.noiseBuffer) this.buildNoiseBuffer();

    const now = this.ctx.currentTime;

    // Layer 1: Heavy filtered explosion noise
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.42);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.45);
    }

    // Layer 2: Heavy sub-bass boom
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(170, now);
    boomOsc.frequency.exponentialRampToValueAtTime(35, now + 0.38);
    boomGain.gain.setValueAtTime(0.55, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(now);
    boomOsc.stop(now + 0.41);
  }

  // 11. Boss Struck / Armor Ping
  playBossHit() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 12. Boss 3-Way Attack Burst
  playBossShoot() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.23);
  }

  // 13. Giant Boss Destruction Explosion
  playBossExplosion() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Deep sub-bass drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.25);

    // Filtered noise blast
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.linearRampToValueAtTime(80, now + 1.2);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(now);
      noise.stop(now + 1.25);
    }
  }

  // 9. Galaxian Breakaway Dive-Bomb Siren
  playDiveAttack() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      // Pitch sweeps down from 950Hz to 320Hz
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.45);

      // Fast FM vibrato warble (16Hz)
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(16, now);
      lfoGain.gain.setValueAtTime(80, now);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      lfo.start(now);
      osc.start(now);
      lfo.stop(now + 0.46);
      osc.stop(now + 0.46);
    } catch (e) {
      console.warn('Dive sound error:', e);
    }
  }

  // 10. Whizz Return Rocket Sound (Rising high-speed thrust)
  playWhizzReturn() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.37);
    } catch (e) {
      console.warn('Whizz return sound error:', e);
    }
  }

  // 11. Kamikaze Crash Collision Explosion
  playCrash() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Heavy distorted sub bass rumble
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.7);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.72);

      // Noise impact blast
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(120, now + 0.65);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + 0.68);
      }
    } catch (e) {
      console.warn('Crash sound error:', e);
    }
  }

  // 12. Player Joined Squad Chime (Positive ascending 3-note arcade welcome blip)
  playPlayerJoin() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5
      let t = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        const dur = idx === notes.length - 1 ? 0.16 : 0.08;
        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + dur + 0.02);

        t += 0.07;
      });
    } catch (e) {
      console.warn('Player join sound error:', e);
    }
  }

  // 13. Player Left Squad Cue (Gentle descending 2-note disconnect tone)
  playPlayerLeave() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const notes = [587.33, 392.00]; // D5 -> G4
      let t = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);

        const dur = idx === notes.length - 1 ? 0.18 : 0.09;
        gain.gain.setValueAtTime(0.20, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + dur + 0.02);

        t += 0.09;
      });
    } catch (e) {
      console.warn('Player leave sound error:', e);
    }
  }

  // 14. All Defense Shields Overrun & Shattered
  playShieldsDestroyed() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      if (!this.noiseBuffer) this.buildNoiseBuffer();
      const now = this.ctx.currentTime;

      // Heavy shattering noise blast
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.65);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.75, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + 0.68);
      }

      // Deep crumbling sub-bass sweep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.7);

      gain.gain.setValueAtTime(0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.72);
    } catch (e) {
      console.warn('Shields destroyed sound error:', e);
    }
  }
}

// Global sound singleton
const Sound = new SoundSystem();

// Auto-unlock Web Audio context on the first user interaction anywhere on the window
if (typeof window !== 'undefined') {
  const unlockAudioGlobally = () => {
    Sound.unlock();
  };
  ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudioGlobally, { passive: true });
  });

  // Preload alien voice sound effect buffer as early as possible
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      Sound.preloadAlienVoice().catch(() => {});
    });
  } else {
    Sound.preloadAlienVoice().catch(() => {});
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SoundSystem, Sound };
}
