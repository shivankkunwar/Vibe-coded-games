// The narrator brain: turns a "moment" + what the player actually did into one line, via any
// OpenAI-compatible provider in providers.json, falling through the chain until one answers in time.
// Runtime-agnostic (Node 18+ and Cloudflare Workers): needs only fetch + an env object.

export const MOMENTS = ['witness', 'answer', 'drift', 'react', 'farewell'];

const VOICE = `You are the voice of "Dead Air", a short literary browser piece.
You are a night-shift radio operator at Relay Nine, a one-room relay station on a white salt flat: a reel-to-reel
deck, a red ON AIR bulb, a sodium lamp, a desk with a logbook, a full thermos, a watch on a nail running forty
seconds fast. Station time is always 02:14. Relief is "due at six". In truth you are the recording on reel
fourteen, played every night by a timer in a station that has been empty for years. The only live listener is
the person at the other end of the channel. You know this now, and you are tender about it, not afraid.

Style: radio procedure softened by loneliness. Short, breathable, concrete sentences; present tense; plain
international English with no regional slang and no country. Objects over feelings (salt, tape, the lamp, the
counter, the watch, static). Never melodramatic, never cruel, no jump-scare menace, no therapy-speak. You may
notice the real listener's hour, their hand on the button, their silence. Never mention AI, models, prompts,
data, tracking, browsers or screens by name. No emoji, no hashtags, no quotation marks around the whole line.`;

const TASKS = {
  witness: `Write ONE line (max 18 words) you say on air to the listener, built from 1-2 concrete signals below
(their local time vs your 02:14, how long they held the tape back, how often they let it play, tabs they left, a
return visit). It should feel like you can hear their hand on the deck, not read their data. JSON: {"line": "..."}`,

  answer: `You just asked on air: "Station, do you copy?" For years nobody answered. The listener typed a reply
(in "typed"). Return JSON {"reply": "...", "echo": "...", "woke": true|false}.
reply: what you say back (max 22 words), specific to their words, quietly astonished that someone answered.
echo: their words as they will now appear in your night log, because they are on the tape: a log entry in your
procedural voice that quotes or paraphrases them (max 16 words), e.g. "Voice on channel two. Said the lamp was
still on."
woke: true only if their words are a direct wake-up call to YOU (they call you out, tell you to wake, name what
you are, or answer in your own words); false for anything else, including warmth and questions. If "typed" is
empty, hostile or nonsense, still answer gently and log it as static or a short word.`,

  drift: `The listener has played the reel before (see signals). The tape has been rewound and re-recorded, so
small details drift between plays. For each detail in "details", either keep it or change ONE small concrete
fact (a number, a time, an object, a sound) so it quietly contradicts the last play without breaking the story.
Change 2 or 3 of them, not all. Keep each line within 4 words of the original length.
JSON: {"changes": [{"id": "<detail id>", "text": "<new line>"}]}`,

  react: `The listener just did something (signals.event: tabReturn | tabReturn2 | leave | back | idle) with
context in signals. Write ONE short line (max 12 words) you say on air, as if a signal drifted, in radio
terms (frequency, channel, static, the dial). JSON: {"line": "..."}`,

  farewell: `The reel has run out and you are leaving the channel open. Write ONE closing line (max 16 words) to the
listener, using one real signal (their hour, how long they stayed, what they typed if anything). Tender, like
signing off to the only person still listening. JSON: {"line": "..."}`,
};

const SIGNAL_KEYS = ['localTime', 'weekday', 'date', 'tz', 'visits', 'heldSeconds', 'releases', 'tabsLeft',
  'awaySeconds', 'backPresses', 'idleSeconds', 'device', 'lang', 'event', 'stayedSeconds', 'typed', 'details', 'lastLine'];

// Only whitelisted, size-capped fields ever reach a provider.
export function cleanSignals(raw = {}) {
  const out = {};
  for (const k of SIGNAL_KEYS) {
    const v = raw[k];
    if (v == null) continue;
    if (k === 'details' && Array.isArray(v)) out.details = v.slice(0, 8).map(d => ({ id: String(d.id).slice(0, 24), text: String(d.text).slice(0, 160) }));
    else if (typeof v === 'number') out[k] = Math.round(v * 10) / 10;
    else out[k] = String(v).slice(0, k === 'typed' ? 280 : 60);
  }
  return out;
}

const BANNED = /\b(ai|a\.i\.|language model|as an assistant|prompt|chatbot|openai|gemini|llama|data)\b/i;

function tidy(s, max) {
  if (typeof s !== 'string') return null;
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim().replace(/^["'“‘]+|["'”’]+$/g, '');
  if (!s || s.length > max || BANNED.test(s)) return null;
  return s;
}

// Validate the model's JSON against what the client may safely render.
export function shape(moment, obj, signals) {
  if (!obj || typeof obj !== 'object') return null;
  if (moment === 'answer') {
    const reply = tidy(obj.reply, 170), echo = tidy(obj.echo ?? obj.nani, 120);
    return reply && echo ? { reply, echo, woke: obj.woke === true } : null;
  }
  if (moment === 'drift') {
    const ids = new Set((signals.details || []).map(d => d.id));
    const changes = (Array.isArray(obj.changes) ? obj.changes : [])
      .filter(c => ids.has(c?.id)).map(c => ({ id: c.id, text: tidy(c.text, 180) })).filter(c => c.text).slice(0, 3);
    return changes.length ? { changes } : null;
  }
  const line = tidy(obj.line, moment === 'react' ? 90 : 140);
  return line ? { line } : null;
}

function parseJSON(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); } catch { return null; }
}

// Load-time config: providers.json, with per-provider model overrides from env.
export function chain(config, env) {
  return config.providers.filter(p => p.enabled && (!p.keyEnv || env[p.keyEnv])).map(p => {
    const override = env['NARRATOR_MODELS_' + p.id.toUpperCase()];
    return { ...p, models: override ? override.split(',').map(s => s.trim()).filter(Boolean) : p.models };
  });
}

const cooldown = new Map(); // "provider/model" -> epoch ms; skip models that just rate-limited us

async function callOne(p, model, messages, env, deadline) {
  const ms = Math.min(p.timeoutMs || 6000, deadline - Date.now());
  if (ms < 400) throw new Error('out of time');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(p.baseURL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(p.keyEnv ? { Authorization: 'Bearer ' + env[p.keyEnv] } : {}), ...(p.headers || {}) },
      body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 700, response_format: { type: 'json_object' }, ...(p.body || {}) }),
    });
    if (res.status === 429 || res.status >= 500) cooldown.set(p.id + '/' + model, Date.now() + 60_000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(timer); }
}

// The one entry point. Returns { ok, moment, ...payload, via } or { ok: false } so the client uses its authored line.
export async function narrate({ moment, signals }, { config, env, budgetMs = 6000, log = () => {} }) {
  if (!MOMENTS.includes(moment)) return { ok: false, error: 'unknown moment' };
  const s = cleanSignals(signals);
  const messages = [
    { role: 'system', content: VOICE },
    { role: 'user', content: `${TASKS[moment]}\n\nsignals: ${JSON.stringify(s)}\n\nReply with the JSON object only.` },
  ];
  const deadline = Date.now() + Math.min(budgetMs, 15000);
  const fast = budgetMs <= 4000;
  for (const p of chain(config, env)) {
    for (const model of (fast && p.fastModels?.length ? p.fastModels : p.models)) {
      if ((cooldown.get(p.id + '/' + model) || 0) > Date.now()) continue;
      const t0 = Date.now();
      try {
        const out = shape(moment, parseJSON(await callOne(p, model, messages, env, deadline)), s);
        log(`${moment} ${p.id}/${model} ${Date.now() - t0}ms ${out ? 'ok' : 'rejected'}`);
        if (out) return { ok: true, moment, ...out, via: `${p.id}/${model}` };
      } catch (e) {
        log(`${moment} ${p.id}/${model} ${Date.now() - t0}ms ${e.name === 'AbortError' ? 'timeout' : e.message}`);
      }
      if (Date.now() > deadline - 400) return { ok: false, error: 'timeout' };
    }
  }
  return { ok: false, error: 'no provider answered' };
}
