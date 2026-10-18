import { BUS, MORPH_IDS } from './story.js';

// Narration player: lines queue instead of cutting each other off; beds duck while she speaks.
// The bus (she | radio | tape | older) is passed in with the line. Radio lines resolve their awake-morph
// variant when they are queued — never mid-line — so a choice steps the band's voice between lines.
const morphSuffix = awake => awake >= 6 ? '__a6' : awake >= 4 ? '__a4' : awake >= 2 ? '__a2' : '';

// Breathing room between takes, in seconds — a human answers after a beat, never on the same frame the
// previous sentence ends. turn = the other end of the conversation picks up; same = the same speaker keeps
// going; chase = the tape was wound ahead and the queue is catching up (shortest breath that still reads as
// breathing). Live-tunable while playing: window.__pace = { turn: 1.8, same: 0.9, chase: 0.6 }.
const PACE = { turn: 1.8, same: 0.9, chase: 0.6 };
const pace = k => window.__pace?.[k] ?? PACE[k];

export class Voice {
  constructor(audio) {
    this.a = audio; this.cur = null; this.queue = []; this.seq = 0; this.awake = 0;
    this.timer = null; this.unduckTimer = null; this.lastBus = null; this.endedAt = -1e9;
  }
  setAwake(n) { this.awake = Math.max(0, n | 0); }
  // onStart fires when the take actually begins playing (subtitles stay in sync behind long queues).
  say(id, bus = 'she', onStart) {
    const key = this._key(id, bus);
    if (!key) return false;
    const n = ++this.seq;
    const entry = { key, bus, n, onStart };
    if (!this.cur && !this.timer) this._arm(entry); else this.queue.push(entry);
    return true;
  }
  _key(id, bus) {
    const dry = 'vo_' + id;
    if (bus === 'radio' && MORPH_IDS.has(id)) {
      const k = dry + morphSuffix(this.awake);
      if (this.a.has(k)) return k;
    }
    return this.a.has(dry) ? dry : null;
  }
  // Start a take — but never closer than one breath to the take that ended before it.
  _arm(e) {
    const gap = this.lastBus == null ? 0
      : this.queue.length ? pace('chase')
      : e.bus === this.lastBus ? pace('same') : pace('turn');
    const wait = Math.max(0, gap * 1000 - (performance.now() - this.endedAt));
    if (wait > 30) { this.timer = setTimeout(() => { this.timer = null; this._play(e); }, wait); return; }
    this._play(e);
  }
  _play(e) {
    const bus = BUS[e.bus] || BUS.she;
    const src = this.a.play(e.key, bus);
    if (!src) { this.endedAt = performance.now(); return this._next(); }
    this.cur = { src, n: e.n };
    this.lastBus = e.bus;
    if (this.unduckTimer) { clearTimeout(this.unduckTimer); this.unduckTimer = null; }
    this.a.duck(true);
    e.onStart?.();
    src.onended = () => { if (this.cur?.src === src) { this.cur = null; this.endedAt = performance.now(); this._next(); } };
  }
  busy() { return !!this.cur || !!this.timer || this.queue.length > 0; }
  _next() {
    this.queue = this.queue.filter(q => this.seq - q.n < 2);   // stale lines fall away
    const q = this.queue.shift();
    if (q) return this._arm(q);
    // the beds stay down through the breath so the room doesn't swell up between two sentences
    if (this.unduckTimer) clearTimeout(this.unduckTimer);
    this.unduckTimer = setTimeout(() => { this.unduckTimer = null; this.a.duck(false); }, 2000);
  }
  stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.unduckTimer) { clearTimeout(this.unduckTimer); this.unduckTimer = null; }
    this.queue = []; try { this.cur?.src.stop(); } catch {} this.cur = null; this.a.duck(false);
    this.lastBus = null; this.endedAt = -1e9;
  }
}
