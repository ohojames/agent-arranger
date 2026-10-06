// Read the stamps back off the produced PDF and render proof images.
//
// Env:
//   OUT      the stamped .pdf                                 (required)
//   PREFIX / START / SKIP_FIRST / DIGITS / TURN / CORNER      (same values used for stamping)
//   PAGES    comma-separated pages to render as proof         (default first,second,middle,last)
//   IMGDIR   where the proof PNGs go                          (default alongside OUT)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOTS = [
  process.env.NODE_MODULES,
  path.join(process.cwd(), 'node_modules'),
  path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
].filter(Boolean);
function resolveRoot(name) {
  for (const root of ROOTS) {
    try { require.resolve(path.join(root, name, 'package.json')); return root; } catch { /* keep looking */ }
  }
  throw new Error(`cannot find "${name}". Checked:\n  ${ROOTS.join('\n  ')}`);
}
const NM = resolveRoot('pdfjs-dist').replace(/\\/g, '/');
const { chromium } = await import(new URL('playwright/index.mjs', 'file:///' + resolveRoot('playwright').replace(/\\/g, '/') + '/').href);

const OUT = process.env.OUT;
if (!OUT) throw new Error('OUT is required');
const PREFIX = process.env.PREFIX ?? 'C';
const START = Number(process.env.START ?? 1);
const SKIP_FIRST = process.env.SKIP_FIRST === '1';
const DIGITS = Number(process.env.DIGITS ?? 3);
const TURN = (process.env.TURN ?? 'none').toLowerCase();
const CORNER = (process.env.CORNER ?? 'tr').toLowerCase();
const IMGDIR = process.env.IMGDIR || path.dirname(OUT);

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/pdf' ? OUT : path.join(NM, 'pdfjs-dist', url.replace(/^\/lib\//, ''));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'content-type': /\.m?js$/.test(url) ? 'text/javascript' : 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(`http://127.0.0.1:${port}/lib/build/pdf.mjs`).catch(() => {});
await page.setContent('<canvas id="c"></canvas>');

const report = await page.evaluate(async (o) => {
  const pdfjs = await import(`http://127.0.0.1:${o.port}/lib/build/pdf.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `http://127.0.0.1:${o.port}/lib/build/pdf.worker.mjs`;
  const doc = await pdfjs.getDocument(`http://127.0.0.1:${o.port}/pdf`).promise;
  window.__doc = doc;
  const out = { pages: doc.numPages, sizes: {}, bad: [], first: null, last: null };
  let counter = o.START;
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    out.sizes[`${vp.width}x${vp.height}r${p.rotate}`] = (out.sizes[`${vp.width}x${vp.height}r${p.rotate}`] || 0) + 1;
    if (o.SKIP_FIRST && n === 1) continue;
    const want = o.PREFIX + String(counter).padStart(o.DIGITS, '0');
    counter++;
    const items = (await p.getTextContent()).items.filter(i => (i.str || '').trim() === want);
    if (items.length !== 1) { out.bad.push({ page: n, want, found: items.length }); continue; }
    const t = items[0].transform, x = t[4], y = t[5];
    // does it sit in the page corner the mapping predicted?
    const want_l = o.pageCorner[1] === 'l', want_b = o.pageCorner[0] === 'b';
    const okX = want_l ? x < vp.width * 0.25 : x > vp.width * 0.75;
    const okY = want_b ? y < vp.height * 0.25 : y > vp.height * 0.75;
    if (!okX || !okY) out.bad.push({ page: n, want, x: Math.round(x), y: Math.round(y), why: `not in page corner ${o.pageCorner}` });
    if (!out.first) out.first = want;
    out.last = want;
  }
  return out;
}, {
  port, PREFIX, START, SKIP_FIRST, DIGITS,
  pageCorner: { none: { tl: 'tl', tr: 'tr', br: 'br', bl: 'bl' }, ccw: { tl: 'tr', tr: 'br', br: 'bl', bl: 'tl' }, cw: { tl: 'bl', tr: 'tl', br: 'tr', bl: 'br' } }[TURN][CORNER],
});

const defaults = [1, 2, Math.ceil(report.pages / 2), report.pages].filter((v, i, a) => v >= 1 && v <= report.pages && a.indexOf(v) === i);
const PAGES = (process.env.PAGES ? process.env.PAGES.split(',').map(Number) : defaults);
await fsp.mkdir(IMGDIR, { recursive: true });
const shots = [];
for (const n of PAGES) {
  await page.evaluate(async (n) => {
    const p = await window.__doc.getPage(n);
    const vp = p.getViewport({ scale: 1.4 });
    const c = document.getElementById('c');
    c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }, n);
  const file = path.join(IMGDIR, `proof-${String(n).padStart(3, '0')}.png`);
  await (await page.$('#c')).screenshot({ path: file });
  shots.push(file);
}
await browser.close(); server.close();

console.log('pages:', report.pages);
console.log('page sizes:', JSON.stringify(report.sizes));
console.log('labels:', report.first, '…', report.last);
console.log('pages failing the check:', report.bad.length);
for (const b of report.bad.slice(0, 10)) console.log('  ', JSON.stringify(b));
console.log('proof images:', shots.join(', '));
if (TURN !== 'none') {
  console.log(`\nTURN=${TURN}: the proof images are still in stored orientation.`);
  console.log(`Rotate them ${TURN === 'ccw' ? '90° counter-clockwise' : '90° clockwise'} and confirm the label`);
  console.log(`reads level in the ${CORNER} corner before reporting done.`);
}
if (report.bad.length) process.exitCode = 1;
