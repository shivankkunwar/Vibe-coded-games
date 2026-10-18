// One-origin server: the game at the repo root and the narrator API, so the page can call /api/narrate.
// Local:  node --env-file-if-exists=.env server.mjs      (keys come from .env or the shell)
// Deploy: node narrator/server.mjs inside the container   (keys come from the environment)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrate, chain } from './narrator.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, process.env.SITE_DIR || '../dist');
const PORT = Number(process.env.PORT || 5173);
const config = JSON.parse(await readFile(join(here, 'providers.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// Tiny per-IP limiter: 30 narrator calls per 10 minutes is far more than one playthrough needs.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 600_000);
  list.push(now); hits.set(ip, list);
  return list.length > 30;
}
// Behind the deploy proxy every socket is the proxy: rate-limit the real client, not the box.
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 8000) throw new Error('too large'); }
  return JSON.parse(s || '{}');
}

const send = (res, code, obj, type = 'application/json') =>
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, providers: chain(config, process.env).map(p => p.id) });
  if (url.pathname === '/api/narrate' && req.method === 'POST') {
    if (limited(clientIp(req))) return send(res, 429, { ok: false, error: 'slow down' });
    try {
      const { moment, signals, budgetMs } = await body(req);
      return send(res, 200, await narrate({ moment, signals }, { config, env: process.env, budgetMs, log: m => console.log('[narrator]', m) }));
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }
  // Static files, confined to ROOT. Astro pages are directories: /games/x -> /games/x/ -> x/index.html.
  const path = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return send(res, 403, 'forbidden', 'text/plain');
  let data;
  try { data = await readFile(path); } catch {
    if (extname(path)) return send(res, 404, 'not found', 'text/plain');
    try {
      data = await readFile(join(path, 'index.html'));
      if (!url.pathname.endsWith('/')) return res.writeHead(301, { Location: url.pathname + '/' }).end();
    } catch {
      try { data = await readFile(path + '.html'); } catch { return send(res, 404, 'not found', 'text/plain'); }
    }
  }
  // X-Narrator tells the page the API exists (so a static host never sees /api requests).
  // Range support lets <video> seek, which the time-reversal relies on.
  const head = { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream', 'X-Narrator': '1', 'Accept-Ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? +m[1] : Math.max(0, data.length - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], data.length - 1) : data.length - 1;
    if (start > end || start >= data.length) return res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end();
    return res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1));
  }
  res.writeHead(200, { ...head, 'Content-Length': data.length }).end(req.method === 'HEAD' ? undefined : data);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Dead Air  ->  http://localhost:${PORT}`);
  const live = chain(config, process.env).map(p => p.id);
  console.log(live.length ? `narrator providers: ${live.join(' -> ')}` : 'narrator: no API keys found, the piece will use its written lines');
});
