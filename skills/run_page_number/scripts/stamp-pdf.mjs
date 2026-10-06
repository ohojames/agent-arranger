// Stamp a running control number onto every page of a PDF.
//
// Env:
//   SRC          input .pdf                                   (required)
//   OUT          output .pdf                                  (required, must differ from SRC)
//   PREFIX       label prefix, ASCII only                     (default "C")
//   START        number of the first stamped page             (default 1)
//   SKIP_FIRST   "1" = leave page 1 unstamped                 (default 0)
//   DIGITS       zero-padded width                            (default 3)
//   SIZE         font size in pt                              (default 11)
//   MARGIN       distance from both trimmed edges in pt       (default 20)
//   BOLD         "0" for Helvetica, "1" for Helvetica-Bold    (default 1)
//   TURN         how the sheet is turned to be read/printed:
//                  none | ccw | cw                            (default none)
//   CORNER       corner as read on the FINAL sheet:
//                  tr | tl | br | bl                          (default tr)
//   PLATE        "1" draws a white pad behind the label       (default 0)
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOTS = [
  process.env.NODE_MODULES,
  path.join(process.cwd(), 'node_modules'),
  path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
].filter(Boolean);

function resolvePkg(name) {
  for (const root of ROOTS) {
    const p = path.join(root, name);
    try { require.resolve(path.join(p, 'package.json')); return p; } catch { /* keep looking */ }
  }
  throw new Error(`cannot find "${name}". Checked:\n  ${ROOTS.join('\n  ')}\nSet NODE_MODULES to the folder that has it.`);
}

const { PDFDocument, StandardFonts, rgb, degrees } =
  await import(new URL('cjs/index.js', 'file:///' + resolvePkg('pdf-lib').replace(/\\/g, '/') + '/').href);

const SRC = process.env.SRC;
const OUT = process.env.OUT;
if (!SRC || !OUT) throw new Error('SRC and OUT are required');
if (path.resolve(SRC) === path.resolve(OUT)) throw new Error('OUT must differ from SRC — never overwrite the source');

const PREFIX = process.env.PREFIX ?? 'C';
const START = Number(process.env.START ?? 1);
const SKIP_FIRST = process.env.SKIP_FIRST === '1';
const DIGITS = Number(process.env.DIGITS ?? 3);
const SIZE = Number(process.env.SIZE ?? 11);
const MARGIN = Number(process.env.MARGIN ?? 20);
const BOLD = process.env.BOLD !== '0';
const TURN = (process.env.TURN ?? 'none').toLowerCase();
const CORNER = (process.env.CORNER ?? 'tr').toLowerCase();
const PLATE = process.env.PLATE === '1';

if (!['none', 'ccw', 'cw'].includes(TURN)) throw new Error(`TURN must be none|ccw|cw, got "${TURN}"`);
if (!['tr', 'tl', 'br', 'bl'].includes(CORNER)) throw new Error(`CORNER must be tr|tl|br|bl, got "${CORNER}"`);
// Helvetica is WinAnsi — a Thai prefix would be silently mangled or throw
if (/[^\x20-\x7E]/.test(PREFIX)) throw new Error('PREFIX must be ASCII (the standard fonts cannot encode Thai)');

// Turning the sheet moves every corner. Map the corner the reader sees on the
// finished sheet back to the corner of the stored page.
const CORNER_MAP = {
  none: { tl: 'tl', tr: 'tr', br: 'br', bl: 'bl' },
  ccw: { tl: 'tr', tr: 'br', br: 'bl', bl: 'tl' },   // sheet = page turned 90° counter-clockwise
  cw: { tl: 'bl', tr: 'tl', br: 'tr', bl: 'br' },    // sheet = page turned 90° clockwise
};
const ROT = { none: 0, ccw: -90, cw: 90 };           // pre-rotation so the label reads level on the sheet
const pageCorner = CORNER_MAP[TURN][CORNER];
const rot = ROT[TURN];

/** anchor for pdf-lib drawText, per rotation and page corner */
function anchor(corner, W, H, tw, h, m) {
  if (rot === 0) {
    const x = corner[1] === 'l' ? m : W - m - tw;
    const y = corner[0] === 't' ? H - m - h : m;
    return { x, y };
  }
  if (rot === -90) {           // advance runs down, glyph height grows toward +x
    const x = corner[1] === 'l' ? m : W - m - h;
    const y = corner[0] === 't' ? H - m : m + tw;
    return { x, y };
  }
  const x = corner[1] === 'l' ? m + h : W - m;       // rot === 90: advance runs up, height grows toward -x
  const y = corner[0] === 't' ? H - m - tw : m;
  return { x, y };
}

const bytes = await fs.readFile(SRC);
const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
const font = await pdf.embedFont(BOLD ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
const pages = pdf.getPages();

let counter = START;
const placed = [];
for (const [i, page] of pages.entries()) {
  if (SKIP_FIRST && i === 0) continue;
  const label = PREFIX + String(counter).padStart(DIGITS, '0');
  const { width: W, height: H } = page.getSize();
  const tw = font.widthOfTextAtSize(label, SIZE);
  const { x, y } = anchor(pageCorner, W, H, tw, SIZE, MARGIN);
  if (x < 0 || y < 0 || x > W || y > H) throw new Error(`page ${i + 1} (${W}x${H}) is too small for the stamp`);

  if (PLATE) {
    const pad = 3;
    const box = rot === 0
      ? { x: x - pad, y: y - pad, width: tw + pad * 2, height: SIZE + pad * 2 }
      : rot === -90
        ? { x: x - pad, y: y - tw - pad, width: SIZE + pad * 2, height: tw + pad * 2 }
        : { x: x - SIZE - pad, y: y - pad, width: SIZE + pad * 2, height: tw + pad * 2 };
    page.drawRectangle({ ...box, color: rgb(1, 1, 1), opacity: 0.85 });
  }
  page.drawText(label, { x, y, size: SIZE, font, color: rgb(0, 0, 0), rotate: degrees(rot) });
  placed.push({ page: i + 1, label, x: +x.toFixed(1), y: +y.toFixed(1) });
  counter++;
}

const out = await pdf.save();
await fs.writeFile(OUT, out);
console.log(`turn=${TURN} corner=${CORNER} -> page corner ${pageCorner}, text rotation ${rot}°`);
console.log(`stamped ${placed.length}/${pages.length} page(s): ${placed[0]?.label} … ${placed[placed.length - 1]?.label}`);
console.log(`anchor on first stamped page: ${JSON.stringify(placed[0])}`);
console.log(`${(bytes.length / 1048576).toFixed(1)} MB -> ${(out.length / 1048576).toFixed(1)} MB`);
console.log('written:', OUT);
