// Offline-synthesised sound buffers. Each returns an AudioBuffer; reverse() makes its time-inverted twin.
const SR = 44100;
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);

export function reverse(ctx, buf) {
  const r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) r.getChannelData(c).set(Float32Array.from(buf.getChannelData(c)).reverse());
  return r;
}
function make(ctx, secs, fill, ch = 1) {
  const b = ctx.createBuffer(ch, Math.floor(secs * SR), SR);
  for (let c = 0; c < ch; c++) fill(b.getChannelData(c), c);
  return b;
}

// Tape drone: a slow, saturated sine swell with wow and flutter, like a tone left on a worn reel.
export function drone(ctx, f0, secs = 9) {
  return make(ctx, secs, (d, c) => {
    const parts = [[1, 1], [2, 0.32], [3, 0.12], [0.5, 0.2]];
    const ph = parts.map(() => rnd() * 6.28);
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      const wow = 1 + 0.0035 * Math.sin(2 * Math.PI * 0.42 * t + c) + 0.0012 * Math.sin(2 * Math.PI * 6.3 * t);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t / secs)), 1.6);
      let v = 0;
      for (let k = 0; k < parts.length; k++) v += parts[k][1] * Math.sin(2 * Math.PI * f0 * parts[k][0] * wow * t + ph[k]);
      d[i] = Math.tanh(v * 1.6) * env * 0.42;
    }
  }, 2);
}

// Station ident: three soft sine tones through a small speaker.
export function ident(ctx) {
  return make(ctx, 2.6, d => {
    [[0, 880], [0.42, 660], [0.84, 990]].forEach(([at, f]) => {
      const a = Math.floor(at * SR);
      for (let i = 0; i < 0.7 * SR && a + i < d.length; i++) {
        const t = i / SR, env = Math.min(1, t / 0.01) * Math.exp(-t / 0.22);
        d[a + i] += 0.3 * env * Math.tanh(1.5 * (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(2 * Math.PI * f * 3 * t)));
      }
    });
  });
}

// Wall clock tick (or tock with a lower body).
export function tick(ctx, f = 2600) {
  return make(ctx, 0.12, d => {
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      d[i] = (Math.sin(2 * Math.PI * f * t) * 0.5 + (rnd() - 0.5) * 0.6) * Math.exp(-t / 0.008) * 0.5
           + Math.sin(2 * Math.PI * f * 0.31 * t) * Math.exp(-t / 0.02) * 0.25;
    }
  });
}
