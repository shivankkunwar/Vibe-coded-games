// DEAD AIR v2 — the run. Script: DEAD-AIR-V2-SCRIPT.md rev 5, plus the paced takes (rd_8, end_b3).
// D = seconds of holding at the chapter frontier; lines surface while holding, in chapter order.
// Every line carries its bus: she (room mic) | radio (dry, no room) | older (A5 captures); tape is reserved.
// Shots crossfade on the line that cues them; sfx fire with the line. sig = the being's one sound, rationed.

export const STATION = { name: 'Relay Nine', callsign: 'RN-9', freq: '1612 kHz', time: '02:14', delay: 40, plays: 4117 };

// — the cold open: black, the dial sweeps, one dry line; static closes over it, then cut to the desk.
export const COLD = { id: 'cold_0', text: '—that isn’t how I meant it.', at: 2.8, cut: 7.2 };

// — act one opens on her. INTRO is time-based (seconds after the cut); then the run begins.
export const INTRO = [
  { t: 2.0,  id: 'intro_0', text: 'Relay Nine. Night log. Station time two-fourteen.', shot: 'underdesk' },
  { t: 8.5,  id: 'intro_1', text: 'The monitor is ahead of me again. Forty seconds.', shot: 'deckWide' },
  { t: 15.0, id: 'intro_2', text: 'Shortwave under the desk is on. Passed down one operator to the next. Just for the company.', shot: 'radio' },
];

export const HOLD = { id: 'hold_0', text: 'Stay with me. Keep it running.' };

// Buses (build doc §1). she = shipped narrator staging; radio = dry, no room; tape = the monitor; older = captures.
export const BUS = {
  she:   { gain: 1.00, verb: 0.18, pan:  0.00 },
  radio: { gain: 0.88, verb: 0.00, pan:  0.00 },
  tape:  { gain: 0.85, verb: 0.50, pan: -0.22 },
  older: { gain: 0.92, verb: 0.00, pan:  0.08 },
};

// The morph scope: the 20 radio lines that ship __a2/__a4/__a6 variants (voice states, 2026-10-18).
export const MORPH_IDS = new Set([
  'rd_1', 'rd_2', 'rd_3', 'rd_4', 'rd_5', 'rd_6', 'rd_7', 'rd_8', 'rd_9',
  'ch4_a', 'ch4_b', 'ch4_c', 'ch4_d', 'ch4_e', 'ch4_f', 'ch4_g', 'ch4_h', 'ch4_i',
  'ch5_a', 'ask',
]);

// The being's one sound — three uses per run, hard-gated in code.
export const SIG_ALLOWED = new Set(['ch2_deadband', 'rd_6', 'flash_3']);

const she = 'she', radio = 'radio', older = 'older';

export const CHAPTERS = [
  {
    id: 'ch1', name: 'Night Watch', act: 1,
    end: 100,                       // D ceiling: the run waits here for the choice
    silence: { from: 38, to: 46, shot: 'radioRun', sfx: ['tune'] },
    lines: [
      { id: 'ch1_a', at: 6,  text: 'Two-fourteen. Log open. Nothing to report.', bus: she, shot: 'deck' },
      { id: 'ch1_b', at: 19, text: 'The lamp comes on at dusk. I don’t remember switching it on.', bus: she, shot: 'lamp' },
      { id: 'ch1_c', at: 31, text: 'The monitor keeps me company. My own voice, a little early.', bus: she, shot: 'deck' },
      { id: 'ch1_d', at: 46, text: 'You can turn the dial while I talk. There isn’t much on it. Static, and the songs I stopped finding years ago.', bus: she, shot: 'radio' },
      { id: 'ch1_e', at: 55, text: 'Desk check. Logbook. Thermos. Watch on the nail.', bus: she, shot: 'desk' },
      { id: 'ch1_f', at: 63, text: 'The watch runs forty seconds fast. I set it that way, so I’d never be late.', bus: she, shot: 'watch' },
      { id: 'ch1_g', at: 71, text: 'No. I never set it. It was always forty seconds ahead.', bus: she, shot: 'watch' },
      { id: 'ch1_h', at: 79, text: 'Relief is due at six.', bus: she, shot: 'outside' },
      { id: 'ch1_i', at: 87, text: 'The salt goes white to every edge out there. Nothing moves on it but the wind.', bus: she, shot: 'outside' },
    ],
    choice: {
      at: 92, prompt: 'Say something into the radio.', sting: 'black',
      options: [
        { id: 'aw1_a', option: 'You’re repeating my log back to me.', awake: 1 },
        { id: 'aw1_b', option: 'This is Relay Nine. Do you copy?', awake: 2 },
        { id: 'aw1_c', option: 'Say nothing. Keep the log.', awake: 2, then: 'ch1_t' },
      ],
    },
    extras: {
      aw1_a: { text: '—that isn’t how I meant it.', bus: radio, shot: 'radio' },
      aw1_b: { text: 'Copy, Relay Nine. Station time two-fourteen.', bus: radio, shot: 'radio' },
      aw1_c: { text: 'Nothing to report.', bus: radio, shot: 'radio' },
      ch1_t: { text: '…That’s my line.', bus: she, shot: 'radio' },
    },
  },

  {
    id: 'ch2', name: 'Something She Never Said', act: 1,
    end: 108,
    silence: { from: 70, to: 78, shot: 'radioDead', sfx: ['deadband'], sig: 'ch2_deadband' },
    lines: [
      { id: 'ch2_a',  at: 6,  text: 'There’s a voice on the band.', bus: she, shot: 'radio' },
      { id: 'ch2_b',  at: 11, text: 'It’s mine.', bus: she, shot: 'radio' },
      { id: 'rd_1',   at: 16, text: 'The thermos is full. It’s always full. You have never once drunk from it.', bus: radio, shot: 'radio' },
      { id: 'flash_1', at: 24, text: 'That wasn’t— I didn’t say that. I never said that.', bus: she, shot: 'bleed_1', flash: true, sfx: ['bleed', 'bulb'] },
      { id: 'rd_2',   at: 30, text: 'You said that last night.', bus: radio },
      { id: 'rd_3',   at: 38, text: 'It knows this room.', bus: radio },
      { id: 'ch2_c',  at: 40, text: 'It knows this— It said it before me.', bus: she, shot: 'deckWide' },
      { id: 'ch2_d',  at: 49, text: 'It keeps saying it’s sorry. It keeps saying it’s trying.', bus: she, shot: 'radio' },
      { id: 'rd_4',   at: 54, text: 'I am. Both.', bus: radio, shot: 'radio' },
      { id: 'ch2_e',  at: 62, text: 'It keeps talking about something. It never gives it a name. It says I already know. I just can’t hold… the thought.', bus: she, shot: 'radio' },
      { id: 'ch2_f',  at: 68, text: 'Know what?', bus: she },
      { id: 'ch2_g',  at: 80, text: '…Silence. That’s new.', bus: she, shot: 'radioDead' },
      { id: 'older_1', at: 88, text: 'Haah, Relay Nine, portable log. I’m outside by the mast— the lamp just came on by itself. Somebody’s on the shortwave using my voice. I can see the window from here— there’s a shape at my desk. I’m not going back in.', bus: older, shot: 'visitor' },
    ],
    choice: {
      at: 104, prompt: 'Answer it.', sting: 'black',
      options: [
        { id: 'aw2_a', option: 'I believe it.', awake: 2 },
        { id: 'aw2_b', option: 'It’s the tape. It’s my own voice coming back at me.', awake: -1 },
        { id: 'aw2_c', option: 'Say something I couldn’t have said.', awake: 1 },
      ],
    },
    extras: {
      aw2_a: { text: 'Then say it in your own voice. Not mine.', bus: radio, shot: 'radio' },
      aw2_b: { text: 'It isn’t the tape.', bus: radio, shot: 'radio' },
      aw2_c: { text: 'You haven’t sat down… tonight.', bus: radio, shot: 'radio' },
    },
  },

  {
    id: 'ch3', name: 'The Line', act: 1,
    end: 92,
    lines: [
      { id: 'ch3_a',  at: 6,  text: 'It isn’t a recording. Something is on the other end of it, and it’s listening while I talk.', bus: she, shot: 'radio' },
      { id: 'flash_2', at: 14, text: 'It’s me. That’s my voice on the other end. Not the tape.', bus: she, shot: 'bleed_2', flash: true, sfx: ['bleed', 'reels'] },
      { id: 'rd_5',   at: 24, text: 'I’ve been trying for a long time. There were others at this desk before you. None of them believed me.', bus: radio, shot: 'radio' },
      { id: 'rd_6',   at: 34, text: 'When the log closes, something sits in your chair. It wears your night.', bus: radio, shot: 'chairSalt', sig: true },
      { id: 'ch3_b',  at: 40, text: 'Who’s at my desk when I— stop?', bus: she },
      { id: 'rd_7',   at: 45, text: 'I don’t know. I have never seen it. I only see what it moves.', bus: radio, shot: 'deskEmpty' },
      { id: 'rd_8',   at: 54, text: 'You have to want to wake. That’s the part I can’t do.', bus: radio },
      { id: 'ch3_c',  at: 60, text: 'How do I… want it?', bus: she },
      { id: 'rd_9',   at: 65, text: 'Miss it. Even one thing. Miss the room.', bus: radio },
      { id: 'ch3_d',  at: 76, text: 'I’m going to stop now. Not sleep. Stop.', bus: she, shot: 'deskEmpty' },
      { id: 'ch3_e',  at: 84, text: 'If you’re still there… keep the channel open. I’ll be on the other side.', bus: she, shot: 'leader' },
    ],
    seq: { kind: 'switch', sfx: 'switch', silence: 3.0, black: 1.5 },
  },

  {
    id: 'ch4', name: 'The Other Side', act: 2,
    end: 104,
    silence: { from: 52, to: 60, shot: 'radioRun', sfx: ['tune'] },
    lines: [
      { id: 'ch4_a', at: 5,  text: 'The band is wider on this side. Mostly dead.', bus: radio, shot: 'otherside', sfx: ['carrier'] },
      { id: 'ch4_b', at: 14, text: 'You’re here. Not awake. Not gone. Held.', bus: radio, shot: 'otherworld' },
      { id: 'ch4_c', at: 22, text: 'Others sat at that desk before you. Every one of them heard me. Every one of them called it static.', bus: radio, shot: 'radio' },
      { id: 'ch4_d', at: 31, text: 'Your memories are in there with you. Somewhere it can’t let you look. It gives you one night, over and over.', bus: radio, shot: 'beingseat' },
      { id: 'ch4_e', at: 41, text: 'It has no name. Names are how it finds people. Every time I try, the band goes quiet. So I won’t name it. I’ll touch the room instead.', bus: radio, shot: 'radioDead', sfx: ['deadband'] },
      { id: 'ch4_f', at: 60, text: 'Keep holding. Slipped— I’m almost at your frequency.', bus: radio, shot: 'radioRun' },
      { id: 'ch4_g', at: 68, text: 'There. I have it. It won’t hold long.', bus: radio, shot: 'desk' },
    ],
    choice: {
      at: 74, kind: 'object', prompt: 'Show her something she can’t explain.', sting: null,
      options: [
        { id: 'ev_lamp',    option: 'the lamp',    awake: 2, shot: 'lamp' },
        { id: 'ev_watch',   option: 'the watch',   awake: 2, shot: 'watch' },
        { id: 'ev_salt',    option: 'the salt',    awake: 1, shot: 'chairSalt' },
        { id: 'ev_thermos', option: 'the thermos', awake: 1, shot: 'desk' },
      ],
    },
    extras: {
      ev_lamp:    { text: 'The lamp is on. You never switched it. Something else did.', bus: radio, shot: 'lamp' },
      ev_watch:   { text: 'The watch is forty seconds fast. You never set it— something else is keeping time in your room.', bus: radio, shot: 'watch' },
      ev_salt:    { text: 'The salt on the chair is pressed down. You haven’t sat tonight. …So who has?', bus: radio, shot: 'chairSalt' },
      ev_thermos: { text: 'The thermos is full. You keep meaning to drink it. You never do. Someone’s been keeping it warm.', bus: radio, shot: 'desk' },
    },
    after: [
      { id: 'ch4_i',   at: 76, text: 'She left one thing on the band for whoever came next. It’s for you, not for me. Listen.', bus: radio, shot: 'radio' },
      { id: 'older_2', at: 84, text: 'If you find this under the desk— don’t log the dead band. Don’t give it a word. Haah, my eyes won’t stay— it’s waiting for me to close the book. Whoever relieves me, don’t answer the—', bus: older, shot: 'radio' },
      { id: 'ch4_h',   at: 96, text: 'She woke. Long enough to answer. Then the night closed over her.', bus: radio },
    ],
    seq: { kind: 'sting' },
  },

  {
    id: 'ch5', name: 'The Confrontation', act: 2,
    end: 60,
    lines: [
      { id: 'ch5_a', at: 5,  text: 'I’m opening the mic from this side. When you answer, it’s going to sound like you.', bus: radio, shot: 'otherworld' },
      { id: 'ask',   at: 14, text: 'Relay Nine. Do you copy?', bus: radio, shot: 'copy', sfx: ['carrier'] },
    ],
    typed: { after: 'ask' },                 // the live moment: she waits on empty carrier
    after: [
      { id: 'flash_3', at: null, text: 'That’s my voice… That’s my voice, and I’m listening to it.', bus: she, shot: 'bleed_3', flash: true, sig: true, sfx: ['squeak'] },
      { id: 'ch5_b', at: 24, text: 'The room is on the wrong side. I can see it… from behind.', bus: she, shot: 'approach' },
      { id: 'ch5_c', at: 34, text: 'I’m not at the desk. Something is. It’s wearing my night.', bus: she, shot: 'visitorTurn' },
      { id: 'ch5_d', at: 43, text: 'Everything points to it. The lamp. The salt. The watch. It’s in the room right now.', bus: she, shot: 'otherworld' },
      { id: 'ch5_e', at: 53, text: 'I still don’t know what it is. I only know it isn’t me.', bus: she, shot: 'otherworld' },
    ],
    seq: { kind: 'ending' },
  },
];

// — endings. awake ≥ gate → A; a 3 can be broken by the typed reply (the ask endpoint's boolean).
export const ENDINGS = {
  gate: 4,
  A: {
    shot: 'dawn',
    lines: [
      { id: 'end_a0', t: 3,  text: 'Relay Nine. End of log.', bus: she },
      { id: 'end_a1', t: 8,  text: 'Something to report.', bus: she },
      { id: 'end_a2', t: 14, text: 'There’s someone on the other side of my voice. There always was.', bus: she },
      { id: 'end_a3', t: 20, text: 'I can hear the room you’re in. Hold the line. I’m waking up.', bus: she, after: 3.0 },
      { id: 'end_a4', t: 26, text: 'Leaving the channel open.', bus: she },
    ],
  },
  B: {
    shot: 'seated',
    lines: [
      { id: 'end_b0', t: 3,  text: 'Relay Nine. End of log.', bus: she },
      { id: 'end_b1', t: 8,  text: 'Nothing to report.', bus: she },
      { id: 'end_b2', t: 14, text: 'It’s my voice. It was always my voice.', bus: she },
      { id: 'end_b3', t: 19, text: 'I’m going to close the log. And leave the deck running.', bus: she },
      { id: 'end_b4', t: 25, text: 'Leaving the channel open.', bus: she },
    ],
    under: { id: 'under_b', at: 26, text: '—that isn’t how I meant it.', bus: radio, gain: 0.5 },
  },
};

// — fourth wall (META). Spoken texts live in the voice set; this is the written fallback + subtitles.
export const META = [
  { id: 'revisit',     text: 'You came back. The band remembers where you were.' },
  { id: 'stationTime', text: 'Your clock and mine agree. That doesn’t happen.' },
  { id: 'sixAm',       text: 'It’s nearly six where you are. Are you my relief?' },
  { id: 'lateNight',   text: 'You’re up late. So is the lamp.' },
  { id: 'tabReturn',   text: 'You went off frequency. I kept the channel warm.' },
  { id: 'tabReturn2',  text: 'Off frequency again. I kept your place.' },
  { id: 'back',        text: 'That winds the page back, not the band. Hold.' },
  { id: 'leave',       text: 'Don’t drift off the dial. Not yet.' },
  { id: 'slip',        text: 'That wasn’t you. The band slipped.' },
  { id: 'farewell',    text: 'You can switch off. I’ll stay on air.' },
];
export const metaLine = id => META.find(m => m.id === id)?.text || '';

// — the live layer: the typed moment (Ch. 5) and its written fallback. Nothing here is required to run.
export const LIVE = {
  question: 'Say something only she would say.',
  note: 'Your reply is sent to an AI service so she can answer.',
  noteOffline: 'Nothing you type leaves this page.',
  replyFallback: 'I heard you. Hold the line.',
  echoSign: 'RX 02:14',
};
