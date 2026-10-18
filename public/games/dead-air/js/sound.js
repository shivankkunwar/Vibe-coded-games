// v2 sound director: base beds, tape transport, the dial's band-pass sweep, named loops, one-shots.
// Every key is optional: a missing recording means silence, never an error.
export class Sound {
  constructor(audio, media) {
    this.a = audio; this.m = media;
    this.enabled = { clock: false };
    this.beds = {}; this.loops = {}; this.started = false; this.dialIn = 0; this.transport = null; this.dial = null;
  }
  start() { if (this.started) return; this.started = true; this._ensure(); }
  packLoaded() { this._ensure(); }
  _ensure() {
    const mk = (k, g) => { if (!this.beds[k] && this.a.has(k)) this.beds[k] = this.a.loop(k, g); };
    mk('hiss', 0.05); mk('wind', 0); mk('roomtone', 0.03);
    if (!this.transport && this.a.has('reels')) this.transport = { f: this.a.loop('reels', 0), b: this.a.has('reels_r') ? this.a.loop('reels_r', 0) : null };
    // the dial: static through a band-pass the pointer sweeps (300 Hz – 2.8 kHz)
    if (!this.dial && this.a.has('static')) {
      const ctx = this.a.ctx, src = ctx.createBufferSource(); src.buffer = this.a.b.static; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.value = 1200;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.a.beds); src.start();
      this.dial = { f, g };
    }
  }
  cue(key, opts = {}) { if (!this.a.has(key)) return null; return this.a.play(key, { gain: 0.8, verb: 0.25, ...opts }); }
  startLoop(name, key, gain = 0.15, secs = 0.8) {
    const l = this.loops[name];
    if (l) { l.set(gain, secs); return l; }
    if (!this.a.has(key)) return null;
    const h = this.a.loop(key, 0); h.set(gain, secs);
    this.loops[name] = h; return h;
  }
  stopLoop(name, secs = 1.2) {
    const l = this.loops[name]; if (!l) return;
    delete this.loops[name];
    l.set(0, secs);
    setTimeout(() => { try { l.src.stop(); } catch {} }, secs * 1000 + 150);
  }
  setDial(x) { this.dialIn = x; }
  // Per frame: the dial sweep, the tape transport, and the level of each base bed.
  update(dt, t, shot, { act2 = 0, quiet = false, silence = false } = {}) {
    const q = quiet ? 0.45 : 1;
    if (this.dial) {
      const target = 300 + (this.dialIn * 0.5 + 0.5) * 2500;
      this.dial.f.frequency.value += (target - this.dial.f.frequency.value) * Math.min(1, dt * 3);
      const tg = (silence ? 0.28 : 0.04) * q;
      this.dial.g.gain.value += (tg - this.dial.g.gain.value) * Math.min(1, dt * 2.2);
    }
    if (this.transport) {
      const sp = Math.abs(t.v), moving = sp > 0.06;
      const f = (!t.back && moving) ? Math.min(0.16, 0.03 + sp * 0.02) * q : 0;
      const b = (t.back && moving) ? Math.min(0.2, 0.04 + sp * 0.03) * q : 0;
      this.transport.f.set(f); this.transport.b?.set(b);
    }
    if (this.beds.hiss) this.beds.hiss.set((act2 ? 0.026 : 0.05) * q);
    if (this.beds.wind) this.beds.wind.set((/outside|dawn/.test(shot || '') ? 0.08 : 0) * q);
    if (this.beds.roomtone) this.beds.roomtone.set((act2 ? 0.012 : 0.03) * q);
  }
}
