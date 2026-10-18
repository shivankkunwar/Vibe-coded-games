import { addRow, dropOut } from './ui.js';
// Machine output: the only place she types instead of speaks. Teletype rows in the transcript,
// an uneven per-character cadence and a block caret. Also the inline YOU reply.
const log = document.querySelector('#log');
let cur = null;

export function write(text, { hold = 0, sign = '', stamp = 'TX', cls = '' } = {}) {
  erase();
  const row = cur = addRow(stamp, cls ? 'tty ' + cls : 'tty');
  const t = row.querySelector('.text');
  const ink = document.createElement('span'), caret = document.createElement('i');
  caret.className = 'caret'; t.append(ink, caret);
  let i = 0, done;
  const finished = new Promise(r => (done = r));
  const step = () => {
    if (cur !== row) return done();
    ink.textContent = text.slice(0, ++i);
    if (i < text.length) {
      const c = text[i - 1];
      setTimeout(step, /[.,?!—]/.test(c) ? 240 : c === ' ' ? 70 : 22 + Math.random() * 55 + (Math.random() < 0.06 ? 160 : 0));
    } else {
      if (sign) { const s = document.createElement('span'); s.className = 'sign'; s.textContent = sign; t.append(s); }
      done();
      row.timer = setTimeout(() => { if (cur === row) cur = null; dropOut(row); }, hold || Math.max(5500, text.length * 80));
    }
  };
  step();
  return finished;
}
export function erase() { if (cur) { const r = cur; cur = null; dropOut(r); } }

// Resolves with the typed text, or null if skipped or left empty.
export function askTyped(note) {
  const row = addRow('YOU', 'you');
  row.querySelector('.text').innerHTML = `<form autocomplete="off"><input name="a" maxlength="280" aria-label="your reply" enterkeyhint="send"></form>
    <div class="meta"><span class="note"></span><button type="button" class="skip">Skip</button></div>`;
  row.querySelector('.note').textContent = note;
  log.classList.add('typing');
  const input = row.querySelector('input');
  setTimeout(() => input.focus({ preventScroll: true }), 300);
  return new Promise(res => {
    const done = v => { log.classList.remove('typing'); res(v); };
    row.querySelector('form').addEventListener('submit', e => {
      e.preventDefault(); const v = input.value.trim();
      if (!v) return;
      // the reply stays in the log as a line, like anything else said on air
      row.querySelector('.text').textContent = v; row.classList.add('old');
      row.timer = setTimeout(() => dropOut(row), 12000);
      done(v);
    });
    row.querySelector('.skip').addEventListener('click', () => { dropOut(row); done(null); });
  });
}

// "receiving…" while the reply is on its way.
let wait = null;
export function writing(on) {
  if (on && !wait) { wait = addRow('RX', 'tty'); wait.querySelector('.text').innerHTML = 'receiving<i class="caret"></i>'; }
  if (!on && wait) { dropOut(wait); wait = null; }
}
