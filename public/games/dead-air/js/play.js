import { Timeline, smooth } from './time.js';
import { COLD, INTRO, HOLD, CHAPTERS, STATION, SIG_ALLOWED } from './story.js';
import * as UI from './ui.js';
import * as Sig from './signals.js';
import { syncVideo, pauseExcept } from './vsync.js';
import { Sound } from './sound.js';
import { Voice } from './voice.js';

const lerp = (a, b, k) => a + (b - a) * k;
const loadRun = () => { try { return JSON.parse(localStorage.getItem('deadair.run') || 'null'); } catch { return null; } };
const saveRun = o => { try { localStorage.setItem('deadair.run', JSON.stringify(o)); } catch {} };
const clearRun = () => { try { localStorage.removeItem('deadair.run'); } catch {} };
const CLIP = { mode: 'loop', from: 0, to: 1 };   // v2 plays clips as loops; direction follows the tape

// The run: cold open → act one (ch. 1–3) → the switch-off → act two (ch. 4–5) → one of two endings.
export class Play {
  constructor(renderer, audio, media, { visits = 0, onEnd } = {}) {
    Object.assign(this, { r: renderer, a: audio, m: media, visits, onEnd });
    this.t = new Timeline(); this.sound = new Sound(audio, media); this.vox = new Voice(audio);
    const run = loadRun();
    this.chI = run && run.chapter > 0 && run.chapter <= CHAPTERS.length - 1 ? run.chapter : 0;
    this.awake = run?.awake ?? 0; this.vox.setAwake(this.awake);
    this.shown = new Set(); this.phase = 'cold'; this.clock = 0; this.idle = 0; this.slipped = false;
    this.ptr = [0, 0]; this.ptrT = [0, 0]; this.ptrLag = [0, 0];
    this.curShot = 'now'; this.prevShot = null; this.mixShot = 1; this.act2 = 0;
    this.cueSig = new Set(); this.pending = null; this.askDone = false; this.woke = false;
    this.choiceOpen = false; this.choiceDone = false; this.silActive = false;
    this.u = { rewind: 0, warm: 0.6, white: 0, fade: 0, flash: 0, zoomA: 1.07, zoomB: 1.07, rain: 0, rainDir: 1, speed: 0, mixAB: 0, act2: 0, time: 0, ptr: this.ptr, ptrLag: this.ptrLag };
    UI.setStamp(() => UI.tapeStamp(this.clock));
  }

  // — start: the cold open, or straight back to where the band left you ---------------------------
  start() {
    this.sound.start(); this.liveStart?.(); UI.onAir(true);
    this.clock = 0; this.u.fade = 0;
    if (this.opener) setTimeout(() => this.opener(), 1500);
    if (this.chI > 0) return this.beginRun();          // a return visit resumes at the chapter
    this.phase = 'cold';
    this.sound.startLoop('static', 'static', 0.1);
    setTimeout(() => this.sound.cue('tune', { gain: 0.5, verb: 0.2 }), 600);
    setTimeout(() => this.line(COLD, 'radio', { cls: 'mon' }), COLD.at * 1000);
    setTimeout(() => this.sound.loops.static?.set(0.22, 1.0), (COLD.at + 2.2) * 1000);
    setTimeout(() => this.coldCut(), COLD.cut * 1000);
  }
  coldCut() {
    if (this.phase !== 'cold') return;
    this.phase = 'intro'; this.u.fade = 0.35;
    this.sound.stopLoop('static');
    this.setShot(INTRO[0].shot);
    INTRO.forEach(l => setTimeout(() => {
      if (this.phase !== 'intro') return;
      this.line(l, 'she');
    }, l.t * 1000));
    this.introEnd = INTRO[INTRO.length - 1].t + 6;
    setTimeout(() => { if (this.phase === 'intro') this.beginRun(); }, this.introEnd * 1000);
  }
  beginRun() {
    if (this.phase === 'play' || this.phase === 'ending' || this.phase === 'credits') return;
    this.phase = 'play';
    this.loadChapter(this.chI);
    this.persist();
  }

  // — chapters ------------------------------------------------------------------------------------
  loadChapter(i) {
    const ch = this.ch = CHAPTERS[i];
    this.shown = new Set(); this.choiceOpen = false; this.choiceDone = false; this.silActive = false; this.pending = null;
    this.t.setChapter(0, ch.end);
    this.act2 = ch.act === 2 ? 1 : 0;
    const first = ch.lines.find(l => l.shot);
    if (first) this.setShot(first.shot);
    if (ch.act === 2) this.sound.startLoop('carrier', 'carrier', 0.12);
    UI.onAir(!this.t.holding);
  }
  advance() {
    if (this.chI >= CHAPTERS.length - 1) return;
    this.chI++; this.persist(); this.loadChapter(this.chI);
  }
  persist() { saveRun({ chapter: this.chI, awake: this.awake }); }
  setShot(key) {
    if (!key || key === this.curShot) return;
    const it = this.m?.get(key);
    if (it?.once) for (const v of [it.fwd, it.rev]) if (v && v.currentTime > 0) { try { v.pause(); v.currentTime = 0; } catch {} }
    this.prevShot = this.curShot; this.mixShot = 0; this.curShot = key;
  }
  cut(on) { document.body.classList.toggle('cut', on); }

  // — lines, silences, moments --------------------------------------------------------------------
  // meta.js and the endings speak through here; the subtitle may wait for the take to actually start
  voice(id, onStart) { return this.vox.say(id, 'she', onStart); }
  // The picture, the flash, the cue sounds and the subtitle all land on the take's first frame —
  // the scene on screen is always the line you are hearing, even when the voice queue runs long.
  cueLine(l, opts) {
    if (l.shot) this.setShot(l.shot);
    if (l.flash) this.u.flash = Math.max(this.u.flash, 0.14);
    for (const k of l.sfx || []) {
      if (k === 'carrier') this.sound.startLoop('carrier', 'carrier', 0.12);
      else if (k === 'tune') this.sound.startLoop('tune', 'tune', 0.16);
      else this.sound.cue(k, { gain: 0.8, verb: k === 'bulb' ? 0.1 : 0.3 });
    }
    if (l.sig) this.signature(l.id);
    // every character speaks in their own ink: she = salt, the band = cold, the older captures = amber
    UI.say(l.text, { ...opts, cls: [(opts && opts.cls) || '', 'vx-' + (l.bus || 'she')].filter(Boolean).join(' ') });
  }
  line(l, bus, opts) {
    const spoken = this.vox.say(l.id, bus || l.bus, () => this.cueLine(l, opts));
    if (!spoken) this.cueLine(l, opts);
  }
  fire(l) {
    this.shown.add(l.id);
    this.line(l);
    // chapter tails
    if (l.id === 'ch3_e') this.pending = 'switch';
    if (l.id === 'ch4_h') this.pending = 'sting';
    if (l.id === 'ch5_e') this.pending = 'ending';
  }
  signature(id) {
    if (!SIG_ALLOWED.has(id) || this.cueSig.has(id)) return;
    this.cueSig.add(id);
    this.sound.cue('signature', { gain: 0.75, verb: 0.15 });
  }
  lines() {
    if (this.paused) return;
    for (const l of this.ch.lines) if (l.at != null && !this.shown.has(l.id) && this.t.D >= l.at) this.fire(l);
    for (const l of this.ch.after || []) if (l.at != null && !this.shown.has(l.id) && this.t.D >= l.at) this.fire(l);
  }
  silences() {
    const s = this.ch.silence; if (!s) return;
    const inWin = this.t.D >= s.from && this.t.D < s.to;
    if (inWin && !this.silActive) {
      this.silActive = true; this.setShot(s.shot);
      for (const k of s.sfx || []) k === 'tune' ? this.sound.startLoop('tune', 'tune', 0.16) : this.sound.cue(k, { gain: 0.7 });
      if (s.sig) this.signature(s.sig);
    } else if (!inWin && this.silActive) {
      this.silActive = false; this.sound.stopLoop('tune');
    }
  }
  moments() {
    if (this.paused) return;
    const ch = this.ch;
    if (ch.choice && !this.choiceOpen && !this.choiceDone && this.t.D >= ch.choice.at && !this.vox.busy()) return this.openChoice();
    // the typed moment outranks every chapter tail — the ending must never skip the ask
    const ask = ch.lines.find(l => l.id === 'ask');
    if (ask && !this.askDone && this.shown.has('ask') && !this.vox.busy()) return this.openAsk();
    if (this.pending === 'sting' && !this.vox.busy()) { this.pending = null; return this.stingAdvance(); }
    if (this.pending === 'switch' && !this.vox.busy()) { this.pending = null; return this.switchOff(); }
    if (this.pending === 'ending' && !this.vox.busy()) { this.pending = null; return this.end(); }
  }
  openChoice() {
    const c = this.ch.choice;
    this.choiceOpen = true; this.paused = 'choice';
    UI.say(c.prompt, { cls: 'mon', hold: 120000 });
    this.pickR = c.options.map((o, i) => UI.pick(o.option, i, () => this.pick(o)));
    document.body.classList.add('choosing');
  }
  pick(opt) {
    if (this.paused !== 'choice') return;
    this.choiceDone = true;
    UI.unpick(); document.body.classList.remove('choosing');
    this.choiceOpen = false; this.paused = false;
    UI.say(opt.option, { cls: 'said' });
    this.awake = Math.max(0, this.awake + (opt.awake || 0));
    this.vox.setAwake(this.awake); this.persist();
    const ex = this.ch.extras?.[opt.id];
    if (ex) this.fire({ ...ex, id: opt.id });
    if (opt.then) { const t2 = this.ch.extras?.[opt.then]; if (t2) this.fire({ ...t2, id: opt.then }); }
    if (this.ch.choice.sting) this.pending = 'sting';
  }
  stingAdvance() {
    this.cut(true);
    setTimeout(() => { this.advance(); this.cut(false); }, 1000);
  }
  switchOff() {
    this.paused = true;
    this.cut(true);
    this.sound.cue('switch', { gain: 0.9, verb: 0.2 });
    const g = this.a.master.gain, level = g.value;
    setTimeout(() => { const t = this.a.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.015); }, 700);
    setTimeout(() => {
      this.chI = 3; this.persist(); this.loadChapter(3); this.paused = false;
      const t = this.a.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + 0.4);
      this.cut(false);
    }, 3900);
  }
  openAsk() {
    this.paused = 'answer'; this.setShot('copy'); UI.clear();
    if (this.liveAsk) this.liveAsk(); else this.finishAsk();
  }
  finishAsk() {
    if (this.askDone) return;
    this.askDone = true;
    const f = (this.ch.after || []).find(l => l.id === 'flash_3');
    if (f) this.fire(f);
    this.paused = false;
  }
  end() {
    this.phase = 'ending';
    this.endingKey = (this.awake >= 4 || (this.awake === 3 && this.woke)) ? 'A' : 'B';
    clearRun();
    this.onEnd?.(this);
  }

  // — input ---------------------------------------------------------------------------------------
  hold(on) {
    if (this.phase === 'intro' && on && this.clock > (this.introEnd || 99) - 6) this.beginRun();
    if (!on && this.t.holding) {                     // a release always lands, even while a choice/ask holds the tape
      Sig.touch(); Sig.count('releases');
      this.t.holding = false; this.idle = 0;
      document.body.classList.remove('holding'); UI.onAir(true);
      this.a.play(this.a.has('clunk') ? 'clunk' : 'whoosh_r', { gain: this.a.has('clunk') ? 0.42 : 0.3, verb: 0.3 });
      this.a.play('bulb', { gain: 0.35, verb: 0.1 });
      return;
    }
    if (this.phase !== 'play' || this.paused) return;
    if (this.t.holding === on) return;
    Sig.touch(); if (!on) Sig.count('releases');
    this.t.holding = on; this.idle = 0;
    document.body.classList.toggle('holding', on);
    UI.onAir(!on);                       // the bulb is lit while the tape plays forward, dark while you wind it back
    this.a.play(this.a.has('clunk') ? 'clunk' : (on ? 'whoosh' : 'whoosh_r'), { gain: this.a.has('clunk') ? 0.42 : 0.3, verb: 0.3 });
    this.a.play('bulb', { gain: 0.35, verb: 0.1 });
  }
  pointer(nx, ny) { this.ptrT[0] = nx; this.ptrT[1] = ny; this.sound.setDial(nx); }
  keyPick(n) { if (this.paused !== 'choice' || !this.pickR) return; this.pickR[n - 1]?.click(); }

  // — per frame -----------------------------------------------------------------------------------
  frame(dt, time) {
    this.clock += dt;
    const t = this.t, prev = t.D;
    if ((this.phase === 'play' && !this.paused) || this.phase === 'ending') t.update(dt);
    if (this.phase === 'play') {
      this.lines();
      this.silences();
      this.moments();
      if (this.ch.id === 'ch2' && !this.slipped && prev < 44 && t.D >= 44) { this.slipped = true; this.onSlip?.(); }
      if (!t.holding && t.D <= t.floor + 0.01 && !this.paused) {
        this.idle += dt;
        if (this.idle > 14) { this.idle = 0; this.line(HOLD, 'she'); }
      }
    }
    this.draw(dt, time);
  }
  source(key, vis) {
    const item = this.m.get(key); if (!item) return null;
    let el = item.fwd ? syncVideo(item, { ...CLIP, media: key, cine: this.phase !== 'play' }, this.t) : item.el;
    if (el) vis.add(el);
    if (el instanceof HTMLVideoElement && el.readyState < 2 && !this.r.texCache.get(el)?.ready) el = item.poster;
    return { el, depth: item.depth, aspect: item.aspect, fx: item.fx };
  }
  draw(dt, time) {
    const t = this.t, u = this.u, vis = new Set();
    const cur = this.source(this.curShot, vis);
    const prev = this.prevShot && this.mixShot < 1 ? this.source(this.prevShot, vis) : null;
    pauseExcept(vis);
    const k = Math.min(1, dt * 3);
    if (this.prevShot) this.mixShot = Math.min(1, this.mixShot + dt / 0.8);
    if (this.mixShot >= 1) this.prevShot = null;
    u.rewind = lerp(u.rewind, t.back ? 1 : 0, k);
    u.warm = lerp(u.warm, this.warmTarget ?? (t.holding ? 0.15 : 0.7), k * 0.6);
    u.speed = lerp(u.speed, Math.min(1, Math.abs(t.v) / 6), k);
    u.white = this.whiteOverride ?? 0;
    u.flash *= Math.pow(0.04, dt);
    u.time = time;                                   // grain, dust and rain keep breathing during the run
    u.zoomA = u.zoomB = 1.07 + 0.012 * Math.sin(time * 0.07);
    this.ptr[0] = lerp(this.ptr[0], this.ptrT[0], dt * 2); this.ptr[1] = lerp(this.ptr[1], this.ptrT[1], dt * 2);
    this.ptrLag[0] = lerp(this.ptrLag[0], this.ptrT[0], dt * 0.5); this.ptrLag[1] = lerp(this.ptrLag[1], this.ptrT[1], dt * 0.5);
    u.act2 = lerp(u.act2, this.act2, dt * 0.6);
    u.mixAB = prev ? smooth(0, 1, this.mixShot) : 0;
    this.r.draw(prev || cur, prev ? cur : null, u);
    if (this.phase !== 'credits') this.sound.update(dt, t, this.curShot, { act2: u.act2, quiet: this.quiet, silence: this.silActive });
    this.hud();
  }
  hud() {
    if (this.phase === 'credits') return;
    const t = this.t;
    if (!this.override) {
      const secs = this.ch ? (t.D / this.ch.end) * 40 : 0;
      UI.counter(1400 + (STATION.delay - secs) * 12);
    }
    if (this.phase !== 'play') return;
    const moving = t.D > t.floor + 0.05 || t.holding;
    this.onTitle?.(moving ? `${STATION.callsign} · ${STATION.freq} · ${UI.tapeStamp(this.clock).trim()}`
      : `${STATION.callsign} · ${STATION.freq}`);
  }
}
