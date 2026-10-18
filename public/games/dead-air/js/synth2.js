// More offline buffers: rain bed, clay shatter, whoosh, low swell.
const SR = 44100;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function make(ctx, secs, fill, ch = 1) {
  const b = ctx.createBuffer(ch, Math.floor(secs * SR), SR);
  for (let c = 0; c < ch; c++) fill(b.getChannelData(c), c);
  return b;
}

// Soft monsoon rain: filtered noise plus sparse droplets. Loops (ends faded into start).
export function rain(ctx, secs = 8) {
  return make(ctx, secs, d => {
    let lp = 0, bp = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd() * 2 - 1;
      lp += (w - lp) * 0.08; bp += (lp - bp) * 0.5;
      d[i] = (lp - bp) * 0.9 + w * 0.04;
    }
    for (let k = 0; k < secs * 40; k++) {
      const at = Math.floor(rnd() * (d.length - 2000)), f = 1800 + rnd() * 3000, a = 0.05 + rnd() * 0.12;
      for (let i = 0; i < 1500; i++) d[at + i] += a * Math.sin(2 * Math.PI * f * i / SR) * Math.exp(-i / 160);
    }
    const x = SR; // crossfade tail into head for a seamless loop
    for (let i = 0; i < x; i++) { const t = i / x; d[i] = d[i] * t + d[d.length - x + i] * (1 - t); }
  }, 2);
}

// Kulhad hitting a stone floor: thud + clay crack + tinkling shards.
export function shatter(ctx) {
  return make(ctx, 2.2, d => {
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      d[i] = Math.sin(2 * Math.PI * (95 + 60 * Math.exp(-t * 30)) * t) * Math.exp(-t / 0.06) * 0.8
           + (rnd() * 2 - 1) * Math.exp(-t / 0.035) * 0.7;
    }
    for (let k = 0; k < 26; k++) {
      const at = Math.floor((0.02 + Math.pow(rnd(), 1.8) * 1.2) * SR), f = 2200 + rnd() * 4200, a = 0.25 * (1 - at / d.length);
      for (let i = 0; i < 4000 && at + i < d.length; i++) d[at + i] += a * Math.sin(2 * Math.PI * f * i / SR) * Math.exp(-i / 500);
    }
  });
}

// Air rushing past: band-limited noise with a swelling envelope (reverse it for the "going back" inhale).
export function whoosh(ctx, secs = 1.6) {
  return make(ctx, secs, (d, c) => {
    let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      const k = 0.02 + 0.25 * t * t;
      a += ((rnd() * 2 - 1) - a) * k; b += (a - b) * k;
      d[i] = (a - b) * Math.pow(t, 2.2) * (1 - Math.pow(t, 40)) * 2.2;
    }
  }, 2);
}

// Sub swell for reveals.
export function swell(ctx, f = 41, secs = 6) {
  return make(ctx, secs, d => {
    for (let i = 0; i < d.length; i++) {
      const t = i / SR, e = Math.sin(Math.PI * Math.min(1, t / secs)) ** 2;
      d[i] = e * 0.6 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * t));
    }
  });
}
