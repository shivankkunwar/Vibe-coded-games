const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// v2 timeline: D grows while you hold (time runs backwards) and falls when you let go — but the run is now
// chapter-scoped: the release floors at the chapter's start, never all the way back to zero.
// New territory is slow (1 unit/s); ground you've already covered rushes by.
export class Timeline {
  constructor() { this.D = 0; this.maxD = 0; this.v = 0; this.holding = false; this.held = 0; this.slip = 0; this.floor = 0; this.ceiling = 1e9; this.script = null; }
  get back() { return this.holding ? this.slip <= 0 : this.v > 0.02; }   // is time running backwards?
  setChapter(floor = 0, ceiling = 1e9) { this.floor = floor; this.ceiling = ceiling; this.D = floor; this.maxD = floor; this.v = 0; }
  update(dt) {
    if (this.script) { const s = this.script(dt); this.v = (s - this.D) / Math.max(dt, 1e-3); this.D = s; return; }
    if (this.holding && this.slip > 0) {           // another hand: time lurches forward under a held finger
      this.slip -= dt; this.v += (-2.2 - this.v) * Math.min(1, dt * 5);
      this.D = Math.max(this.floor, this.D + this.v * dt); this.held += dt; return;
    }
    if (this.holding) {
      const frontier = this.D >= this.maxD - 0.05;
      const target = frontier ? 1 : Math.max(4, (this.maxD - this.floor) / 4);
      this.v += (target - this.v) * Math.min(1, dt * (frontier ? 6 : 2.5));
      this.D = Math.min(this.D + this.v * dt, this.ceiling);
      if (this.D >= this.ceiling) this.v = 0;
      this.maxD = Math.max(this.maxD, this.D);
      this.held += dt;
    } else {
      const target = -Math.max(1.4, (this.maxD - this.floor) / 5);
      this.v += (target - this.v) * Math.min(1, dt * 1.1);
      this.D = Math.max(this.floor, this.D + this.v * dt);
      if (this.D <= this.floor) this.v = 0;
    }
  }
  crossed(prev, at) { return (prev < at && this.D >= at) ? 1 : (prev >= at && this.D < at) ? -1 : 0; }
}
export { smooth };
