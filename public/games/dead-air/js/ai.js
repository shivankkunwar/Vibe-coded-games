// Optional live narrator. Same-origin /api/narrate only (no keys, no provider URLs here).
// Served statically, /api/health 404s once and the whole layer goes silent for the session.
let state = 'unknown';           // unknown | on | off
let health = null;

export function init() {
  // Only the narrator server marks its responses; anywhere else we never touch /api (no 404 noise).
  if (!health) health = fetch(location.pathname, { method: 'HEAD', cache: 'no-store' })
    .then(r => r.headers.get('X-Narrator') === '1' ? fetch('/api/health', { cache: 'no-store' }) : null)
    .then(r => r?.ok ? r.json() : null)
    .then(j => { state = j?.ok && (j.providers?.length ?? 1) > 0 ? 'on' : 'off'; })
    .catch(() => { state = 'off'; });
  return health;
}
export const enabled = () => state === 'on';

// Resolves with the payload ({line} | {reply, nani} | {changes}) or null. Never throws, never waits past budget.
export async function ask(moment, signals = {}, budgetMs = 3000) {
  await Promise.race([init(), sleep(400)]);
  if (state !== 'on') return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), budgetMs + 300);
  try {
    const r = await fetch('/api/narrate', {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moment, signals, budgetMs }),
    });
    if (r.status === 404) { state = 'off'; return null; }
    const j = await r.json();
    return j?.ok ? j : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// Fire early, read later: the promise is created once and reused.
const cache = new Map();
export function prefetch(key, moment, signalsFn, budgetMs = 8000) {
  const p = ask(moment, signalsFn(), budgetMs);
  cache.set(key, p);
  return p;
}
export const cached = key => cache.get(key) || Promise.resolve(null);

const sleep = ms => new Promise(r => setTimeout(r, ms));
