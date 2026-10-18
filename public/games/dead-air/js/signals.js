// What the real person has done, in the shape /api/narrate accepts (whitelisted server-side).
const S = { visits: 0, releases: 0, tabsLeft: 0, awaySeconds: 0, backPresses: 0, idleSince: performance.now(), t0: performance.now() };
let play = null;

export function bind(p, visits) { play = p; S.visits = visits; }
export const count = (k, n = 1) => { S[k] = (S[k] || 0) + n; };
export const touch = () => { S.idleSince = performance.now(); };

export function snapshot(extra = {}) {
  const d = new Date();
  const mobile = matchMedia('(pointer: coarse)').matches;
  return {
    localTime: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    weekday: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    visits: S.visits,
    heldSeconds: Math.round(play?.t.held || 0),
    releases: S.releases,
    tabsLeft: S.tabsLeft,
    awaySeconds: Math.round(S.awaySeconds),
    backPresses: S.backPresses,
    idleSeconds: Math.round((performance.now() - S.idleSince) / 1000),
    stayedSeconds: Math.round((performance.now() - S.t0) / 1000),
    device: mobile ? 'phone' : 'computer',
    lang: navigator.language || 'en',
    ...extra,
  };
}
