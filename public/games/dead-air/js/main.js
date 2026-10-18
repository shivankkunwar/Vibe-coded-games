import { Renderer } from './renderer.js';
import { Audio } from './audio.js';
import { Media } from './media.js';
import { Play } from './play.js';
import { runEnding } from './ending.js';
import * as UI from './ui.js';
import { installMeta } from './meta.js';
import { installLive } from './live.js';

const $ = s => document.querySelector(s);
const beginBtn = $('#begin'), label = $('#begin .label');
let visits = 0;
try { visits = +(localStorage.getItem('deadair.visits') || 0); } catch {}
if (visits > 0) $('.revisit').hidden = false;
$('#logtime').textContent = 'LOG ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

let renderer;
try { renderer = new Renderer($('#gl')); }
catch (e) { label.textContent = 'NO WEBGL2 SIGNAL'; console.error(e); throw e; }

const audio = new Audio();
const media = new Media(audio.ctx);
const play = new Play(renderer, audio, media, { visits, onEnd: p => runEnding(p, credits) });
window.__play = play; // handy for debugging / screenshots
installMeta(play, { visits });
installLive(play, { visits });

// Title backdrop: the broken cup, very dim.
let last = performance.now(), started = false;
play.u.fade = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (window.__timeScale || 1); last = now;   // __timeScale: test hook
  if (!started) play.u.fade = Math.min(0.32, play.u.fade + dt * 0.12);
  else if (play.phase === 'cold') { /* the cold open holds black until the cut */ }
  else if (play.phase !== 'ending' || !play.fading) play.u.fade = Math.min(1, play.u.fade + dt * 0.25);
  if (started) play.frame(dt, now / 1000);
  else if (media.get('now')) { const f = media.get('now'); renderer.draw({ el: f.el, depth: f.depth, aspect: 16 / 9, fx: f.fx }, null, { ...play.u, warm: 0.4, time: now / 1000, zoomA: 1.1 }); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Load what the first minute needs, build the synth, then open the door. The rest streams in behind.
(async () => {
  await media.load('now');
  await Promise.all([audio.build(), media.load('deck'), media.load('deckWide'), media.load('radio'), media.load('underdesk')]);
  beginBtn.disabled = false; label.textContent = 'TRANSMIT';  // the ▸ is drawn in CSS: neither font has the glyph
  media.loadAll();
  tryPack();
})();

// Optional recorded audio pack layered over the synth (key -> file in assets/aud/pack.json).
// Sounds and beds load in parallel up front; narration streams in lazily, intro lines first.
async function tryPack() {
  let pack;
  try { const r = await fetch('assets/aud/pack.json'); if (!r.ok) return; pack = await r.json(); } catch { return; }
  const entries = Object.entries(pack);
  const load = ([k, f]) => audio.loadFile(k, 'assets/aud/' + f, !k.startsWith('vo_'));
  const sfx = entries.filter(([k]) => !k.startsWith('vo_'));
  const vo = entries.filter(([k]) => k.startsWith('vo_')).sort(([a], [b]) => (b.includes('intro') - a.includes('intro')));
  await Promise.all(sfx.map(load));
  play.sound.packLoaded?.();
  for (let i = 0; i < vo.length; i += 6) await Promise.all(vo.slice(i, i + 6).map(load));
}

beginBtn.addEventListener('click', async e => {
  e.stopPropagation();
  await audio.resume();
  audio.fadeMaster(0.9, 3);
  $('#plate').classList.add('gone');
  document.body.classList.add('playing');
  try { localStorage.setItem('deadair.visits', String(visits + 1)); } catch {}
  started = true;
  play.start();                 // the cold open holds black; the cut brings the picture up
});

// Input: hold anywhere (mouse, touch, space).
const isUI = el => el.closest && el.closest('button, input, form, a');
addEventListener('pointerdown', e => { if (!started || isUI(e.target)) return; play.hold(true); });
addEventListener('pointerup', () => started && play.hold(false));
addEventListener('pointercancel', () => started && play.hold(false));
addEventListener('blur', () => started && play.hold(false));
addEventListener('keydown', e => {
  if (e.target.closest?.('input, form')) return;
  if (/^Digit[1-4]$/.test(e.code) && play.paused === 'choice') { play.keyPick(+e.code.slice(5)); return; }
  if (e.code === 'Space' && !e.repeat && started && !e.target.closest?.('button')) { e.preventDefault(); play.hold(true); }
});
addEventListener('keyup', e => { if (e.target.closest?.('input, form')) return; if (e.code === 'Space' && started) play.hold(false); });
addEventListener('pointermove', e => {
  play.pointer(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
});
addEventListener('contextmenu', e => e.preventDefault());

function credits(p) {
  document.body.classList.remove('playing');
  document.body.classList.add('credits');
  p.phase = 'credits';
  UI.clear();
  const m = Math.floor(p.t.held / 60), s = Math.floor(p.t.held % 60);
  $('#held').textContent = `${m}:${String(s).padStart(2, '0')}`;
  $('#recorded').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const c = $('#credits'); c.hidden = false; c.classList.add('gone');
  requestAnimationFrame(() => c.classList.remove('gone'));
  p.onFarewell?.();
}
$('#again').addEventListener('click', () => location.reload());
