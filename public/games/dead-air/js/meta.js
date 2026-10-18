import { metaLine, STATION } from './story.js';
import * as UI from './ui.js';
import * as Sig from './signals.js';

// The narrator noticing the real listener and the real browser. Each effect fires at most once or twice;
// nothing traps navigation, nothing asks for permissions.
export function installMeta(play, { visits = 0 } = {}) {
  const once = new Set();
  const say = (id, opts) => {
    if (once.has(id)) return false; once.add(id);
    const text = () => UI.say(metaLine(id), opts);
    if (!play.voice?.('meta_' + id, text)) text();
    return true;
  };
  const react = id => { if (once.has(id)) return; if (!play.react) return say(id); once.add(id); play.react(id, () => { once.delete(id); say(id); }); };
  const free = () => play.phase === 'play' && !play.t.holding;

  // 1. Your time vs station time: an opening line chosen by the listener's own clock, or by a return visit.
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = STATION.time.split(':').map(Number);
  const near = (m, w = 20) => Math.min(Math.abs(mins - m), 1440 - Math.abs(mins - m)) <= w;
  let opener = null;
  if (near(sh * 60 + sm)) opener = 'stationTime';
  else if (near(6 * 60, 30)) opener = 'sixAm';
  else if (visits > 0) opener = 'revisit';
  else if (now.getHours() < 5) opener = 'lateNight';
  play.opener = opener ? () => say(opener) : null;

  // 2. Leaving the tab is going off frequency.
  let hiddenAt = 0, leaves = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); play.hold(false); return; }
    const away = (performance.now() - hiddenAt) / 1000;
    if (away < 2.5 || play.phase !== 'play') return;
    leaves++; Sig.count('tabsLeft'); Sig.count('awaySeconds', away);
    setTimeout(() => react(leaves === 1 ? 'tabReturn' : 'tabReturn2'), 900);
  });

  // 3. Back winds the page, not the tape. Intercepted once only; the next press leaves.
  history.pushState({ deadair: 1 }, '');
  addEventListener('popstate', () => { Sig.count('backPresses'); if (play.phase === 'play' || play.phase === 'intro') react('back'); }, { once: true });

  // 4. Drifting off the dial (the pointer leaves the window) while the tape runs forward.
  document.documentElement.addEventListener('mouseleave', () => { if (free() && play.t.maxD > 10 && !play.paused) react('leave'); });

  // 5. Once, the tape slips under a held finger: time lurches forward on its own.
  play.onSlip = () => { play.t.slip = 1.4; UI.onAir(true); setTimeout(() => play.t.holding && UI.onAir(false), 1500); setTimeout(() => say('slip'), 1500); };

  // 6. The tab title is the station's readout (set by play.js); the favicon is the ON AIR bulb (ui.js).
  let lastTitle = '';
  play.onTitle = text => { if (text !== lastTitle) document.title = lastTitle = text; };
  play.onFarewell = () => setTimeout(() => say('farewell', { hold: 12000 }), 2500);

  // 7. For whoever opens DevTools.
  console.log('%cRELAY NINE  1612 kHz', 'font: 700 20px Archivo, sans-serif; color: #c4372c');
  console.log('%cYou opened the back of the deck. Reel fourteen is still threaded.\nIf you can read this, you are the only live thing on the channel.', 'font: 12px monospace; color: #e7e3da; line-height: 1.6');
}
