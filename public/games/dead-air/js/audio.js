import * as S from './synth.js';
import * as S2 from './synth2.js';

// Audio engine: master bus with a generated room reverb, and forward/reversed twins of every sound.
export class Audio {
  constructor() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(3.2);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.master);
    this.beds = ctx.createGain(); this.beds.connect(this.master);   // loops go here so narration can duck them
    this.b = {};
  }
  _impulse(secs) {
    const ctx = this.ctx, n = Math.floor(secs * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.5); }
    return b;
  }
  // Build every synthesised buffer (and its reverse). Spread across frames so the page never hitches.
  async build() {
    const ctx = this.ctx, add = (k, buf) => { this.b[k] = buf; this.b[k + '_r'] = S.reverse(ctx, buf); };
    const steps = [
      () => add('d1', S.drone(ctx, 55)), () => add('d2', S.drone(ctx, 82.41)),
      () => add('d3', S.drone(ctx, 110)), () => add('d4', S.drone(ctx, 130.81)),
      () => add('ident', S.ident(ctx)), () => { add('tick', S.tick(ctx)); add('tock', S.tick(ctx, 1700)); },
      () => add('hiss', S2.rain(ctx)), () => add('runout', S2.shatter(ctx)),
      () => add('whoosh', S2.whoosh(ctx)), () => add('swell', S2.swell(ctx)),
    ];
    // Yield between steps via MessageChannel (setTimeout is throttled in background tabs).
    const ch = new MessageChannel(), tick = () => new Promise(r => { ch.port1.onmessage = r; ch.port2.postMessage(0); });
    for (const s of steps) { s(); await tick(); }
  }
  // Decode a recorded file and register it (plus its reversed twin) under key. Overrides the synth version.
  async loadFile(key, url, reversible = true) {
    try {
      const r = await fetch(url); if (!r.ok) return false;
      const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.b[key] = buf; if (reversible) this.b[key + '_r'] = S.reverse(this.ctx, buf);
      return true;
    } catch (e) { console.warn('audio file', key, e); return false; }
  }
  has(key) { return !!this.b[key]; }
  duck(on) { const g = this.beds.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(on ? 0.5 : 1, t + (on ? 0.25 : 1.2)); }
  async resume() { if (this.ctx.state !== 'running') await this.ctx.resume(); }
  fadeMaster(v, secs = 2) { const g = this.master.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + secs); }
  // One-shot. Returns the source so callers can stop it.
  play(key, { gain = 1, rate = 1, verb = 0.3, when = 0, pan = 0 } = {}) {
    const buf = this.b[key]; if (!buf) return null;
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain; p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; p.connect(v).connect(this.verbIn); }
    src.start(ctx.currentTime + when);
    return src;
  }
  // Looping bed with a controllable gain (for rain, clip ambience).
  loop(key, gain = 0) {
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = this.b[key]; src.loop = true; g.gain.value = gain;
    src.connect(g).connect(this.beds); src.start();
    return { src, g, set: (v, secs = 0.8) => { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + secs); } };
  }
}
