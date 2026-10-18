import { ENDINGS } from './story.js';
import * as UI from './ui.js';

// The two v2 endings. A — awake ≥ 4 (or a broken 3): she reaches back, first light on the dawn shot.
// B — the deck left running: the room holds her, and the deck keeps the channel open anyway.
export function runEnding(play, done) {
  const key = play.endingKey === 'A' ? 'A' : 'B';
  const E = ENDINGS[key];
  const u = play.u;
  UI.clear();
  document.body.classList.remove('holding', 'choosing', 'cut');
  play.t.holding = false;
  play.paused = true;
  play.quiet = true;
  play.act2 = key === 'A' ? 0 : 1;                 // A: the grade warms as she wakes; B: still on the other side
  play.setShot(E.shot);
  play.sound.stopLoop('carrier', 1.5);
  play.sound.stopLoop('tune', 0.8);
  const score = key === 'A' ? 'score_realise' : 'score_low';
  if (play.a.has(score)) play.a.play(score, { gain: key === 'A' ? 0.5 : 0.4, verb: 0.2 });

  const lines = E.lines;
  const last = lines[lines.length - 1];
  const echoAt = last.t + 4, hardStop = last.t + 10;
  const t0 = performance.now();
  let i = 0, underFired = false, echoFired = !play.typedWords, fadeStarted = false;

  function tick() {
    const e = (performance.now() - t0) / 1000;
    while (i < lines.length && e >= lines[i].t) {
      const l = lines[i++];
      play.line({ id: l.id, text: l.text }, l.bus || 'she');
    }
    if (E.under && !underFired && e >= E.under.at) {
      underFired = true;
      play.a.play('vo_' + E.under.id, { gain: E.under.gain ?? 0.5, verb: 0 });
      UI.say(E.under.text, { cls: 'mon' });
    }
    if (!echoFired && e >= echoAt) { echoFired = true; UI.say(play.typedWords, { stamp: 'RX', hold: 14000 }); }
    if (e >= hardStop) {
      if (!fadeStarted) { fadeStarted = true; play.fading = true; play.a.fadeMaster(0, 3); }
      u.fade = Math.max(0, u.fade - 1 / 180);
      if (u.fade <= 0) return done(play);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
