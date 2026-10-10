#!/usr/bin/env node
// Decode Thai text from legacy systems (TIS-620 / Windows-874 bytes, often inside latin1 columns) and
// report every value that did not decode cleanly — Node's decoder never throws for windows-874.
//
//   node thai-decode.mjs <in-file> <out-file>   decode line by line to UTF-8; exit 1 if any line has problems
//   import { decodeThai } from './thai-decode.mjs'   decodeThai(buffer) → { text, enc, problems }

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tis = new TextDecoder('windows-874');
const utf8 = new TextDecoder('utf-8', { fatal: true });
const NON_ASCII = /[^\x00-\x7f]/gu;
const THAI = /^[ก-๛]$/u;
const LATIN1_LETTER = /[À-ÿ]/u;

function problemsOf(text) {
  const p = [];
  if (text.includes('�')) p.push('replacement character U+FFFD');
  if (/[-]/u.test(text)) p.push('private-use character (byte not defined in TIS-620)');
  if (/[\u0080-\u009f]/u.test(text)) p.push('control character U+0080–U+009F (byte not defined in TIS-620)');
  return p;
}

export function decodeThai(buf) {
  if (buf == null) return { text: null, enc: null, problems: [] };
  if (!buf.some((b) => b >= 0x80)) return { text: buf.toString('latin1'), enc: 'ascii', problems: [] };
  let asUtf8 = null;
  try { asUtf8 = utf8.decode(buf); } catch { /* not UTF-8 */ }
  if (asUtf8 != null) {
    const others = (asUtf8.match(NON_ASCII) || []).filter((c) => !THAI.test(c));
    if (!others.length) return { text: asUtf8, enc: 'utf8', problems: problemsOf(asUtf8) };
    // Thai bytes that were read as latin1 and saved again as UTF-8 ('ÊÁªÒÂ'): re-export the source as bytes
    if (others.some((c) => LATIN1_LETTER.test(c))) return { text: asUtf8, enc: 'utf8', problems: ['mojibake (already decoded with the wrong charset)'] };
    // Short TIS-620 runs can be valid UTF-8 by accident (CA A1 = U+02A1); fall through to TIS-620
  }
  const text = tis.decode(buf);
  return { text, enc: 'tis620', problems: problemsOf(text) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node thai-decode.mjs <in-file> <out-file>');
    process.exit(2);
  }
  let buf = fs.readFileSync(input);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  const lines = [];
  const bad = [];
  const encs = {};
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i < buf.length && buf[i] !== 0x0a) continue;
    const r = decodeThai(buf.subarray(start, i));
    lines.push(r.text);
    encs[r.enc] = (encs[r.enc] || 0) + 1;
    // line numbers only — the content may be personal data
    if (r.problems.length) bad.push(`line ${lines.length}: ${r.problems.join('; ')}`);
    start = i + 1;
  }
  fs.writeFileSync(output, lines.join('\n'));
  console.log(`lines ${lines.length} · ${Object.entries(encs).map(([k, v]) => `${k} ${v}`).join(' · ')} · problems ${bad.length}`);
  for (const b of bad) console.log(b);
  process.exit(bad.length ? 1 : 0);
}
