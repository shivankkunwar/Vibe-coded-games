import * as AI from './ai.js';
import * as Sig from './signals.js';
import * as Pen from './pen.js';
import { LIVE } from './story.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// v2 live layer: the Ch. 5 typed moment. The band holds empty carrier while the player types and while the
// answer is fetched — the wait IS the dead air (a floor of 2.5 s, even if the model answers instantly).
// Everything is optional: with no narrator server the authored fallback speaks and the run keeps going.
export function installLive(play, { visits = 0 } = {}) {
  Sig.bind(play, visits);
  AI.init();
  const snap = extra => Sig.snapshot(extra);

  play.liveAsk = async () => {
    try {
      await Pen.write(LIVE.question, { hold: 60000 });
      const typed = await Pen.askTyped(AI.enabled() ? LIVE.note : LIVE.noteOffline);
      if (!typed) { Pen.erase(); play.typedWords = null; play.woke = false; return; }
      Pen.writing(true);
      const [r] = await Promise.all([AI.ask('answer', snap({ typed }), 9000), sleep(2500)]);
      Pen.writing(false);
      play.typedWords = (r?.echo || typed).replace(/^["“]|["”]$/g, '');
      play.woke = r?.woke === true;               // a direct wake-up call; a missing flag keeps the tie at B
      await Pen.write(r?.reply || LIVE.replyFallback, { hold: 7000, stamp: 'RX', cls: 'vx-radio' });
    } finally { play.finishAsk(); }
  };
}
