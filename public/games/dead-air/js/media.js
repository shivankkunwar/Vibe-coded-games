// Asset manifest + progressive loader. Videos come as forward/reversed pairs (muted; their audio is separate).
// v2 shots: the new batch reuses the matching base depth maps (no depth generator in-repo; deck_d/deckWide_d/desk_d).
const IMG = 'assets/img/', VID = 'assets/vid/', AUD = 'assets/aud/';
const A = 16 / 9;

export const MANIFEST = {
  now:          { img: 'deck', depth: 'deck_d', fx: 0.55 },                  // the forty-second mark (title + rest frame)
  deck:         { vid: 'deckRun', img: 'deck', depth: 'deck_d', fx: 0.55 },
  deckWide:     { vid: 'deckWide', img: 'deckWide', depth: 'deckWide_d', audio: 'deckWide' },
  lamp:         { vid: 'lamp', img: 'lamp', depth: 'lamp_d', fx: 0.3, audio: 'lamp' },
  desk:         { vid: 'desk', img: 'desk', depth: 'desk_d', fx: 0.4, audio: 'desk' },
  watch:        { img: 'watch', fx: 0.6 },
  outside:      { vid: 'outside', img: 'outside', depth: 'outside_d', fx: 0.68, audio: 'outside' },
  chairSalt:    { img: 'chairSalt', depth: 'desk_d', fx: 0.4 },
  deskEmpty:    { img: 'deskEmpty', depth: 'desk_d', fx: 0.4 },
  leader:       { img: 'leader' },
  dawn:         { vid: 'dawn', img: 'dawn', depth: 'outside_d', fx: 0.68, audio: 'dawn' },
  // — v2 batch
  radio:        { img: 'radio', depth: 'deck_d', fx: 0.5 },
  radioRun:     { vid: 'radioRun', img: 'radio', depth: 'deck_d', fx: 0.5 },
  radioDead:    { img: 'radioDead', depth: 'deck_d', fx: 0.45 },
  underdesk:    { img: 'underdesk', fx: 0.55 },
  copy:         { img: 'copy', fx: 0.5 },
  otherworld:   { img: 'otherworld', depth: 'deckWide_d', fx: 0.55 },
  otherworldRun: { vid: 'otherworldRun', img: 'otherworld', depth: 'deckWide_d', fx: 0.55 },
  bleed_1:      { img: 'bleed_1', depth: 'desk_d', fx: 0.4 },
  bleed_2:      { img: 'bleed_2', depth: 'deck_d', fx: 0.45 },
  bleed_3:      { vid: 'bleed_3', img: 'bleed_3', depth: 'desk_d', fx: 0.4 },
  seated:       { img: 'seated', depth: 'desk_d', fx: 0.4 },
  // — v2 batch 2: the other side of the room, the view from her chair, and the window seen from the salt
  otherside:    { img: 'otherside', depth: 'deckWide_d', fx: 0.55 },
  beingseat:    { img: 'beingseat', depth: 'desk_d', fx: 0.4 },
  visitor:      { img: 'visitor', depth: 'outside_d', fx: 0.68 },
  visitorTurn:  { vid: 'windowTurn', img: 'visitor', depth: 'outside_d', fx: 0.68, once: 1 },
  approach:     { vid: 'walkup', img: 'visitor', depth: 'outside_d', fx: 0.68, once: 1 },
};
// Load order: what the first minute needs comes first; clips stream in behind.
export const ORDER = ['now', 'deck', 'radio', 'underdesk', 'deckWide', 'radioDead', 'lamp', 'desk', 'watch',
  'outside', 'otherworld', 'bleed_1', 'bleed_2', 'bleed_3', 'seated', 'copy', 'chairSalt', 'deskEmpty', 'leader',
  'dawn', 'radioRun', 'otherworldRun', 'otherside', 'beingseat', 'visitor', 'visitorTurn', 'approach'];

const imgCache = {};
function loadImg(name) {
  if (!name) return Promise.resolve(null);
  if (imgCache[name]) return imgCache[name];
  return (imgCache[name] = new Promise(res => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => res(i); i.onerror = () => { console.warn('missing image', name); res(null); };
    i.src = IMG + name + '.webp';
  }));
}
function loadVid(src) {
  return new Promise(res => {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto', loop: false, crossOrigin: 'anonymous' });
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    let done = false; const ok = () => { if (!done) { done = true; res(v); } };
    v.addEventListener('canplaythrough', ok, { once: true });
    v.addEventListener('loadeddata', () => setTimeout(ok, 1500), { once: true });
    v.onerror = () => { if (!done) { done = true; console.warn('missing video', src); res(null); } };
    setTimeout(ok, 6000);   // never let one slow clip hold the door shut; the poster covers until frames arrive
    v.src = src; v.load();
  });
}
async function loadAudio(ctx, name) {
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
    let data;
    try { const r = await fetch(AUD + name + '.m4a', { signal: ctl.signal }); if (!r.ok) return null; data = await r.arrayBuffer(); }
    finally { clearTimeout(timer); }
    return await ctx.decodeAudioData(data);
  } catch (e) { console.warn('audio', name, e); return null; }
}

export class Media {
  constructor(ctx) { this.ctx = ctx; this.items = {}; this.ready = {}; }
  // Resolves with a source {el, depth, aspect, fwd, rev, audio} — images first, videos upgrade it later.
  load(key) {
    if (this.ready[key]) return this.ready[key];
    const m = MANIFEST[key];
    return (this.ready[key] = (async () => {
      const [img, depth] = await Promise.all([loadImg(m.img), loadImg(m.depth)]);
      const item = this.items[key] = { fx: m.fx ?? 0.5, once: !!m.once, el: img, poster: img, depth, aspect: img ? img.naturalWidth / img.naturalHeight : A };
      if (m.vid) {
        const [fwd, rev] = await Promise.all([loadVid(VID + m.vid + '.mp4'), loadVid(VID + m.vid + '_r.mp4')]);
        Object.assign(item, { fwd, rev });
        if (fwd) item.aspect = fwd.videoWidth / fwd.videoHeight || item.aspect;
      }
      if (m.audio && this.ctx) item.audio = await loadAudio(this.ctx, m.audio);
      return item;
    })());
  }
  async loadAll(onProgress) {
    let n = 0;
    for (const k of ORDER) { await this.load(k); onProgress?.(++n / ORDER.length, k); }
  }
  get(key) { return this.items[key]; }
}
