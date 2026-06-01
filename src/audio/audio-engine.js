import '../app/context.js';

const app = window.PhantomApp;
const { SPEC, clamp } = app;

  /* ============================================================================
     AUDIO — synthesised V12, turbo, wind, and bespoke cabin feedback.
     Not samples: a real additive/subtractive model driven by rpm, load & speed.
     ============================================================================ */
  const audio = {
    ctx: null, ready: false,
    master: null, engineBus: null, windGain: null, roadGain: null,
    turboGain: null, oscs: [], engFilter: null, noiseBuf: null,
    musicGain: null, musicOn: false, musicNodes: [],
    blowoffAt: 0, lastThrottle: 0,

    init() {
      if (this.ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      this.ctx = c;

      this.master = c.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(c.destination);

      // ---- engine ----
      this.engFilter = c.createBiquadFilter();
      this.engFilter.type = "lowpass";
      this.engFilter.frequency.value = 420;
      this.engFilter.Q.value = 0.9;

      this.engineBus = c.createGain();
      this.engineBus.gain.value = 0.0;
      this.engFilter.connect(this.engineBus);
      this.engineBus.connect(this.master);

      // Two engine voices feed the mode filter: the built-in synth, and (if the owner loads
      // one) a REAL Phantom recording. Loading a recording fades the synth out and the
      // recording in — and because both pass through engFilter/engineBus, the recording is
      // hushed in Magic Carpet, opens up in Sport, and responds to the windows, like the car.
      this.synthGain = c.createGain(); this.synthGain.gain.value = 1.0;
      this.synthGain.connect(this.engFilter);
      this.recGain = c.createGain(); this.recGain.gain.value = 0.0;
      this.recGain.connect(this.engFilter);

      const shaper = c.createWaveShaper();
      shaper.curve = this._satCurve(2.4);
      shaper.oversample = "2x";
      shaper.connect(this.synthGain);

      // oscillator bank: sub, fundamental(firing), detuned, 2nd & 1.5 harmonic
      const defs = [
        { type: "sine",     mul: 0.5,  gain: 0.55, toShaper: false },
        { type: "sawtooth", mul: 1.0,  gain: 0.5,  toShaper: true  },
        { type: "sawtooth", mul: 1.006,gain: 0.28, toShaper: true  },
        { type: "sawtooth", mul: 2.0,  gain: 0.16, toShaper: true  },
        { type: "square",   mul: 1.5,  gain: 0.05, toShaper: true  }
      ];
      this.oscs = defs.map(d => {
        const o = c.createOscillator();
        o.type = d.type;
        o.frequency.value = 60 * d.mul;
        const g = c.createGain();
        g.gain.value = d.gain;
        o.connect(g);
        g.connect(d.toShaper ? shaper : this.synthGain);
        o.start();
        return { o, g, mul: d.mul };
      });

      // ---- noise sources ----
      this.noiseBuf = this._noiseBuffer(2.0);

      const mkNoise = (filterType, freq, q) => {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf; src.loop = true;
        const f = c.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
        return { src, f, g };
      };

      this.windNode = mkNoise("lowpass", 500);   // air over the body
      this.windGain = this.windNode.g;
      this.roadNode = mkNoise("bandpass", 180, 0.8); // tyre/road
      this.roadGain = this.roadNode.g;
      this.turboNode = mkNoise("bandpass", 1600, 4); // turbo spool/whoosh
      this.turboGain = this.turboNode.g;

      // ---- bespoke audio (music pad) bus ----
      this.musicGain = c.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);

      this.ready = true;
    },

    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

    _satCurve(k) {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x); }
      return curve;
    },
    _noiseBuffer(sec) {
      const c = this.ctx, len = Math.floor(c.sampleRate * sec);
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    },
    _set(param, value, tc) {
      if (!this.ready) return;
      param.setTargetAtTime(value, this.ctx.currentTime, tc || 0.04);
    },

    // called each frame
    update(s, dt) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      // V12 four-stroke: 6 firing events per revolution
      const firing = Math.max(18, (s.rpm / 60) * 6);
      for (const osc of this.oscs) {
        osc.o.frequency.setTargetAtTime(firing * osc.mul, t, 0.03);
      }
      const rpmN = clamp(s.rpm / SPEC.redlineRpm, 0, 1);
      const load = clamp(s.throttle, 0, 1);
      const spd = Math.abs(s.speedMps);
      let engLevel, cutoff, turbo, turboFreq, wind, windFreq, road;

      if (s.magicRide) {
        // ---- Magic Carpet Ride: the hushed, refined Phantom voice. Glass changes it. ----
        const open = !!s.windowsOpen;
        engLevel = (0.03 + load * 0.26 + rpmN * 0.09) * (open ? 0.72 : 0.42);
        cutoff = 170 + s.rpm * 0.05 + load * 420 + (open ? (s.rpm * 0.10 + load * 1400) : 0);
        turbo = load * (0.04 + rpmN * 0.10) * (open ? 0.7 : 0.35);
        turboFreq = 700 + rpmN * 1500;
        if (open) {
          // windows down — wind and tyres rush in, the V12 gains a little air
          wind = clamp((spd - 2) / 38, 0, 1) * 0.20;
          windFreq = 380 + spd * 15;
          road = clamp(spd / 55, 0, 1) * 0.045 * (1 + s.roadInputG * 1.8);
        } else {
          // windows up — sealed, serene; the world is almost gone
          wind = clamp((spd - 25) / 130, 0, 1) * 0.012;
          windFreq = 300 + spd * 8;
          road = clamp(spd / 90, 0, 1) * 0.006 * (1 + s.roadInputG * 0.8);
        }
      } else {
        // ---- Sport: unchanged ----
        engLevel = (0.045 + load * 0.5 + rpmN * 0.16) * 1.0;
        cutoff = 320 + s.rpm * 0.2 + load * 2900;
        turbo = load * (0.18 + rpmN * 0.5) * 1.0;
        turboFreq = 900 + rpmN * 2600;
        wind = clamp((spd - 6) / 70, 0, 1) * 0.16;
        windFreq = 400 + spd * 16;
        road = clamp(spd / 60, 0, 1) * 0.12 * (1 + s.roadInputG * 2.2);
      }

      this._set(this.engineBus.gain, engLevel, 0.05);
      this._set(this.engFilter.frequency, clamp(cutoff, 150, 7000), 0.05);
      this._set(this.turboGain.gain, turbo, 0.06);
      this.turboNode.f.frequency.setTargetAtTime(turboFreq, t, 0.06);
      this._set(this.windGain.gain, wind, 0.1);
      this.windNode.f.frequency.setTargetAtTime(windFreq, t, 0.1);
      this._set(this.roadGain.gain, road, 0.08);

      // If a real recording is loaded, fade the synth out and the recording in, and pitch
      // the recording with the revs (idle plays near its natural pitch, rising to redline).
      if (this.synthGain && this.recGain) {
        this._set(this.synthGain.gain, this.useRecording ? 0 : 1, 0.12);
        this._set(this.recGain.gain, this.useRecording ? 1 : 0, 0.12);
      }
      if (this.useRecording && this.engineSrc) {
        const rate = 0.85 + rpmN * 1.4;   // ~1.0x at idle, ~2.25x at redline
        this.engineSrc.playbackRate.setTargetAtTime(rate, t, 0.05);
      }

      // sporty blow-off / overrun on quick lift at speed (Sport only — unchanged)
      if (!s.magicRide && this.lastThrottle - load > 0.28 && s.rpm > 2600 && t - this.blowoffAt > 0.5) {
        this.blowoffAt = t; this.blowoff();
      }
      this.lastThrottle = load;
    },

    blowoff() {
      const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 2;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.34);
    },

    // ---- discrete cabin sounds ----
    _env(node, g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    },
    thunk() { // door drawing shut — deep, damped
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      const g = c.createGain(); this._env(o, g, t, 0.5, 0.005, 0.2);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.26);
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
      const ng = c.createGain(); this._env(src, ng, t, 0.25, 0.004, 0.12);
      src.connect(f); f.connect(ng); ng.connect(this.master); src.start(t); src.stop(t + 0.16);
    },
    click(freq) { // precise solenoid click (belt, button, indicator)
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 2400; f.Q.value = 6;
      const g = c.createGain(); this._env(src, g, t, 0.18, 0.001, 0.03);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.05);
    },
    chime(notes) { // bespoke two/three-note bell
      if (!this.ready) return; const c = this.ctx; let t = c.currentTime;
      (notes || [784, 988, 1319]).forEach((freq, i) => {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
        const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
        const g = c.createGain(); const g2 = c.createGain();
        const tt = t + i * 0.16;
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.16, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.2);
        g2.gain.setValueAtTime(0.0001, tt); g2.gain.exponentialRampToValueAtTime(0.05, tt + 0.01); g2.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7);
        o.connect(g); o2.connect(g2); g.connect(this.master); g2.connect(this.master);
        o.start(tt); o.stop(tt + 1.3); o2.start(tt); o2.stop(tt + 0.8);
      });
    },
    hornNode: null,
    horn(on) {
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      if (on && !this.hornNode) {
        const mk = (freq) => { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; return o; };
        const o1 = mk(370), o2 = mk(440);              // twin-tone, a major-third apart
        const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
        o1.start(t); o2.start(t);
        this.hornNode = { o1, o2, g };
      } else if (!on && this.hornNode) {
        const { o1, o2, g } = this.hornNode; const tt = c.currentTime;
        g.gain.setTargetAtTime(0.0001, tt, 0.04);
        o1.stop(tt + 0.2); o2.stop(tt + 0.2);
        this.hornNode = null;
      }
    },
    motor(dur) { // seat / damper actuator whir
      if (!this.ready) return; const c = this.ctx, t = c.currentTime; dur = dur || 0.5;
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 95;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 360; f.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.4);
    },
    whoosh(dur) { // glass / screens / divider
      if (!this.ready) return; const c = this.ctx, t = c.currentTime; dur = dur || 0.6;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(1400, t + dur); f.Q.value = 1.2;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.1);
    },
    cork() { // champagne
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
      const g = c.createGain(); this._env(o, g, t, 0.3, 0.002, 0.06);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2000;
      const ng = c.createGain(); this._env(src, ng, t + 0.04, 0.08, 0.002, 0.4);
      src.connect(f); f.connect(ng); ng.connect(this.master); src.start(t + 0.04); src.stop(t + 0.5);
    },
    setMusic(on) {
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      // If the owner has uploaded a track, the studio plays that instead of the house suite.
      if (this.hasUserTrack()) {
        if (on) {
          this.stopSynthPad();
          this.musicGain.gain.setTargetAtTime(0.78, t, 0.4);
          this.mediaEl.play().catch(() => {});
          this.musicOn = true;
        } else {
          this.musicGain.gain.setTargetAtTime(0.0001, t, 0.4);
          if (this.mediaEl) this.mediaEl.pause();
          this.musicOn = false;
        }
        return;
      }
      if (on && !this.musicOn) {
        this.musicOn = true;
        const chord = [196, 246.94, 293.66, 392, 587.33]; // Gmaj voicing — warm pad
        this.musicNodes = chord.map((f, i) => {
          const o = c.createOscillator(); o.type = i < 3 ? "triangle" : "sine"; o.frequency.value = f;
          const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.12 + i * 0.03;
          const lg = c.createGain(); lg.gain.value = 1.5; lfo.connect(lg); lg.connect(o.frequency);
          const g = c.createGain(); g.gain.value = 0.02 / (i * 0.4 + 1);
          o.connect(g); g.connect(this.musicGain); o.start(); lfo.start();
          return { o, lfo };
        });
        this.musicGain.gain.setTargetAtTime(0.5, t, 0.6);
      } else if (!on && this.musicOn) {
        this.stopSynthPad();
      }
    },
    stopSynthPad() {
      if (!this.ready) return; const t = this.ctx.currentTime;
      if (this.musicNodes && this.musicNodes.length) {
        this.musicGain.gain.setTargetAtTime(0.0001, t, 0.4);
        const nodes = this.musicNodes; this.musicNodes = [];
        setTimeout(() => nodes.forEach(n => { try { n.o.stop(); n.lfo.stop(); } catch (e) {} }), 1200);
      }
      if (!this.hasUserTrack()) this.musicOn = false;
    },

    /* ---- Uploaded music: real MP3 playback, with MP4/MOV soundtrack extraction ----
       A single hidden media element plays both audio files and video files. We tap only
       its audio into the bespoke-audio bus, so a film is heard as sound alone — its
       picture is discarded and you simply listen to the music, like an MP3. */
    ensureMediaGraph() {
      if (!this.ready) this.init();
      this.resume();
      if (!this.mediaEl) {
        const v = document.createElement("video");   // a media element plays audio-only files too
        v.setAttribute("playsinline", ""); v.style.display = "none"; v.loop = true; v.preload = "auto"; v.crossOrigin = "anonymous";
        document.body.appendChild(v);
        this.mediaEl = v;
        this.mediaSrcNode = this.ctx.createMediaElementSource(v);
        this.mediaSrcNode.connect(this.musicGain);     // routed through the bespoke-audio volume
      }
    },
    loadUserTrack(file) {
      this.ensureMediaGraph();
      this.stopSynthPad();
      if (this._userUrl) { try { URL.revokeObjectURL(this._userUrl); } catch (e) {} }
      this._userUrl = URL.createObjectURL(file);
      this.userTrackName = file.name.replace(/\.[^.]+$/, "");
      this.userTrackIsVideo = /^video\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name);
      this.mediaEl.src = this._userUrl;
      this.mediaEl.load();
      return this.mediaEl;
    },
    hasUserTrack() { return !!this.mediaEl && !!this._userUrl; },
    setMusicVolume(v) { if (this.ready) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); },

    /* ---- REAL engine recording: play the owner's Phantom clip as the engine voice,
       looped and pitched with the revs. This is the genuine V12 sound. ---- */
    hasEngineRecording() { return !!this.engineBuffer; },
    useEngineRecording(buffer) {
      if (!this.ready || !buffer) return;
      this.engineBuffer = buffer;
      if (this.engineSrc) { try { this.engineSrc.stop(); } catch (e) {} }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      src.connect(this.recGain);
      src.start();
      this.engineSrc = src;
      this.useRecording = true;
    },
    loadEngineFromArrayBuffer(arrayBuf) {
      if (!this.ready) this.init();
      this.resume();
      return this.ctx.decodeAudioData(arrayBuf).then(buf => { this.useEngineRecording(buf); return buf.duration; });
    },
    loadEngineFromFile(file) {
      return file.arrayBuffer().then(ab => this.loadEngineFromArrayBuffer(ab));
    },
    loadEngineFromURL(url) {
      return fetch(url).then(r => { if (!r.ok) throw new Error("not found"); return r.arrayBuffer(); }).then(ab => this.loadEngineFromArrayBuffer(ab));
    },
    clearEngineRecording() {
      this.useRecording = false;
      if (this.engineSrc) { try { this.engineSrc.stop(); } catch (e) {} this.engineSrc = null; }
      this.engineBuffer = null;
    }
  };


app.audio = audio;
