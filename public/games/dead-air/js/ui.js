// DOM layer: the broadcast transcript (lower left), the tape counter and the ON AIR bulb (top right).
const $ = s => document.querySelector(s);
const log = $('#log'), digits = [...document.querySelectorAll('#deck .counter b')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let stampFn = () => '';

export function setStamp(fn) { stampFn = fn; }

// A line "tunes in": characters lock on in quick steps with per-character jitter. It "drops out" by losing characters.
export function say(text, { big = false, hold = 0, stamp, cls = '' } = {}) {
  const row = addRow(stamp ?? stampFn(), [big && 'big', cls].filter(Boolean).join(' '));
  const t = row.querySelector('.text');
  [...text].forEach((ch, i) => {
    const s = document.createElement('span'); s.className = 'c'; s.textContent = ch;
    s.style.setProperty('--d', (i * 14 + Math.random() * 90).toFixed(0) + 'ms');
    t.append(s);
  });
  requestAnimationFrame(() => row.classList.add('in'));
  row.timer = setTimeout(() => dropOut(row), hold || Math.max(4500, 1800 + text.length * 70));
  return row;
}
export function addRow(stamp, cls = '') {
  // Choice rows (still awaiting an answer) never age out or evict others — the player must see every option.
  for (const r of log.querySelectorAll('.row:not(.out):not(.pick)')) r.classList.add('old');
  const rows = log.querySelectorAll('.row:not(.out):not(.pick)');
  if (rows.length >= 3) dropOut(rows[0]);
  const row = document.createElement('div');
  row.className = 'row ' + cls;
  row.innerHTML = '<span class="stamp"></span><span class="text"></span>';
  row.querySelector('.stamp').textContent = stamp;
  log.append(row);
  return row;
}
export function dropOut(row) {
  if (!row || row.classList.contains('out')) return;
  clearTimeout(row.timer);
  row.querySelectorAll('.c').forEach(c => { if (Math.random() < 0.7) { c.classList.add('gone'); c.style.setProperty('--d', (Math.random() * 520).toFixed(0) + 'ms'); } });
  row.classList.add('out');
  setTimeout(() => row.remove(), reduced ? 400 : 900);
}
export function clear() { log.querySelectorAll('.row:not(.you)').forEach(dropOut); }

// Diegetic choices (v2): options live inside the transcript as rows — numbered, clickable, no chrome.
const picks = new Set();
export function pick(text, key, onPick) {
  const row = addRow('', 'pick');
  const wrap = row.querySelector('.text');
  const b = document.createElement('button');
  b.type = 'button';
  const k = document.createElement('span'); k.className = 'k'; k.textContent = String(key + 1);
  const t = document.createElement('span'); t.className = 't'; t.textContent = text;
  b.append(k, t);
  b.addEventListener('click', onPick);
  wrap.append(b);
  requestAnimationFrame(() => row.classList.add('in'));
  row.timer = setTimeout(() => dropOut(row), 120000);
  picks.add(row);
  return b;
}
export function unpick() {
  for (const r of picks) { clearTimeout(r.timer); dropOut(r); }
  picks.clear();
}

// Tape counter: 4 digits that roll on change.
let shown = '';
export function counter(n) {
  const s = String(Math.max(0, Math.floor(n)) % 10000).padStart(4, '0');
  if (s === shown) return; shown = s;
  digits.forEach((b, i) => {
    if (b.dataset.v === s[i]) return;
    b.dataset.v = s[i];
    const now = performance.now(), fast = now - (b.last || 0) < 340; b.last = now;
    const olds = [...b.querySelectorAll('span')], nu = document.createElement('span');
    nu.textContent = s[i];
    // a digit spinning faster than the roll just swaps (like a blur on a real counter wheel)
    if (reduced || fast || !olds.length) { olds.forEach(o => o.remove()); b.append(nu); return; }
    olds.slice(0, -1).forEach(o => o.remove());
    const old = olds[olds.length - 1]; b.append(nu);
    nu.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => { nu.style.transform = ''; old.style.transform = 'translateY(-100%)'; });
    setTimeout(() => old.remove(), 300);
  });
}
// ON AIR: a hard switch with a short filament warm-up (CSS transition var(--t-fast)).
let airState = null;
export function onAir(on) {
  on = !!on; if (on === airState) return; airState = on;
  document.body.classList.toggle('onair', on);
  // the favicon is the bulb too
  const fill = on ? '%23c4372c' : '%233a1714', glow = on ? `%3Ccircle cx='16' cy='16' r='14' fill='%23c4372c' opacity='.25'/%3E` : '';
  const l = document.querySelector('#icon');
  if (l) l.href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E${glow}%3Ccircle cx='16' cy='16' r='9' fill='${fill}'/%3E%3C/svg%3E`;
}

const pad = n => String(Math.floor(n)).padStart(2, '0');
export const tapeStamp = secs => (secs > 0.05 ? '−' : ' ') + pad(secs / 60) + ':' + pad(secs % 60);

export function fmtHeld(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m ? `${m} minute${m > 1 ? 's' : ''} and ${s} second${s !== 1 ? 's' : ''}` : `${s} seconds`;
}
export function fmtYourTime(d = new Date()) {
  const t = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ');
  return `It’s ${t} where you are.`;
}
