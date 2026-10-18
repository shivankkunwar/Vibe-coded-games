// Drives a forward/reversed video pair so that it follows the direction of time.
// Returns the element that should be drawn this frame (or the poster image).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const playing = new Set();

function safePlay(el) { if (el.paused) el.play().catch(() => {}); playing.add(el); }
function pause(el) { if (!el.paused) el.pause(); }

// item: {fwd, rev, poster}; scene: {from, to, mode}; t: Timeline
export function syncVideo(item, scene, t) {
  const { fwd, rev } = item;
  if (!fwd || !rev || !fwd.duration || !rev.duration) return item.poster;
  const back = t.back;     // time running backwards
  const still = Math.abs(t.v) < 0.02;
  const cine = !!scene.cine;   // cold open / intro / ending: the tape isn't in the player's hands, keep the room alive
  const act = back && !item.once ? rev : fwd, other = back && !item.once ? fwd : rev;   // a once-move always plays forward: the look lands on the line
  const dur = fwd.duration;

  if (scene.mode === 'scrub') {
    const span = scene.to - scene.from;
    const k = clamp((t.D - scene.from) / span, 0, 1);
    const tf = dur * (1 - k) * 0.999;           // forward-file time
    const target = back ? dur - tf : tf;
    pause(other);
    if (act.seeking) return act;               // let a seek land before asking for another
    if (still) { pause(act); if (Math.abs(act.currentTime - target) > 0.04) act.currentTime = target; return act; }
    if (Math.abs(act.currentTime - target) > 0.25) act.currentTime = target;
    act.playbackRate = clamp(Math.abs(t.v) * dur / span, 0.25, 4);
    safePlay(act);
    return act;
  }
  // loop: ambient clip; direction swaps keep the mirrored position. A clip that is 'once' plays a single
  // move (the reveal) and then holds its final frame for good.
  act.loop = !item.once; other.loop = !item.once;
  if (act.paused && !other.paused) act.currentTime = clamp(dur - (other.currentTime || 0), 0, dur - 0.05);   // flipped mid-play: mirrored spot
  if (still && !cine) {
    if (!act.paused) { other.currentTime = clamp(dur - act.currentTime, 0, dur - 0.05); pause(act); }         // parked: keep the twin in sync
    return act;
  }
  if (item.once && (act.ended || act.currentTime >= dur - 0.02)) { pause(act); return act; }                  // the move is done: hold the last frame
  act.playbackRate = clamp(Math.abs(t.v) || 1, 0.6, 2.5);
  safePlay(act);
  return act;
}

// Pause videos that are no longer on screen.
export function pauseExcept(visible) {
  for (const el of playing) if (!visible.has(el)) { el.pause(); playing.delete(el); }
}
