#!/usr/bin/env node
// Builds the review page for one change: before/after screenshots, the page URL, the check output
// before and after a bug fix, and the diff of the files this task touched. Prints the report line.
// Everything stays in <repo>/.claude/evidence/ (git-excluded); nothing is uploaded.
//
//   node evidence.mjs --title "ยอดรวมผิด" --files src/a.ts,src/b.ts
//                     [--url http://localhost:3000/x] [--before shot1.png] [--after shot2.png]
//                     [--check-before fail.txt] [--check-after pass.txt]
//
// stdout: {"dir": ".claude/evidence/<stamp>-<slug>", "html": ".../evidence.html", "report": "ตรวจ: [..](..) ..."}
// Paths are relative to the current folder, ready for a markdown link. Exit 2 on bad input.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_DIFF_LINES = 1500;

const fail = (msg) => {
  console.error(msg);
  process.exit(2);
};

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (!argv[i].startsWith('--') || value === undefined || value.startsWith('--')) fail(`${argv[i]} needs a value`);
    out[key] = value;
    i++;
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const slug = (title) => title.toLowerCase().replace(/[^a-z0-9฀-๿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change';

// Diff of the listed files against HEAD; a listed file git does not track yet is shown as all added.
// Without --files: every tracked change (git diff HEAD). Outside a git repo: none.
function diffOf(root, files) {
  if (!root) return '';
  if (!files.length) return git(root, 'diff', 'HEAD');
  return files.map((f) => {
    try {
      git(root, 'ls-files', '--error-unmatch', '--', f);
      return git(root, 'diff', 'HEAD', '--', f);
    } catch {
      const body = fs.readFileSync(path.resolve(root, f), 'utf8').replace(/\n$/, '').split('\n').map((l) => `+${l}`).join('\n');
      return `new file ${f}\n--- /dev/null\n+++ b/${f}\n${body}\n`;
    }
  }).join('');
}

function diffHtml(diff) {
  if (!diff.trim()) return '<p class="muted">ไม่มี diff (ไฟล์ที่ระบุไม่ได้เปลี่ยน หรือไม่ได้อยู่ใน git)</p>';
  const lines = diff.replace(/\n$/, '').split('\n');
  const shown = lines.slice(0, MAX_DIFF_LINES).map((l) => {
    const cls = /^(diff |index |new file|--- |\+\+\+ )/.test(l) ? 'meta' : l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '';
    return `<span class="${cls}">${esc(l)}</span>`;
  });
  const cut = lines.length > MAX_DIFF_LINES ? `<p class="muted">แสดง ${MAX_DIFF_LINES} จาก ${lines.length} บรรทัด ดูที่เหลือด้วย git diff</p>` : '';
  return `<pre class="diff">${shown.join('')}</pre>${cut}`;
}

function page({ title, url, before, after, checkBefore, checkAfter, diff, made }) {
  const shots = [before && ['ก่อนแก้', before], after && ['หลังแก้', after]].filter(Boolean);
  const checks = checkBefore || checkAfter;
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>หลักฐาน: ${esc(title)}</title>
<style>
body{margin:0;background:#f9fafb;color:#111827;font:14px/1.6 system-ui,sans-serif}
main{max-width:1280px;margin:0 auto;padding:32px 16px;display:grid;gap:32px}
h1{font-size:24px;font-weight:600;margin:0}h2{font-size:16px;font-weight:600;margin:0 0 12px}
.muted{color:#6b7280;margin:4px 0 0}a{color:#2563eb}
section{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
figure{margin:0}figcaption{color:#6b7280;margin-bottom:8px}img{max-width:100%;border:1px solid #e5e7eb;border-radius:6px}
pre{margin:0;overflow-x:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font:12px/1.5 ui-monospace,Consolas,monospace}
.diff span{display:block}.add{background:#dcfce7}.del{background:#fee2e2}.hunk{color:#6b7280}.meta{font-weight:600}
[data-mark]{position:relative;outline:3px solid #dc2626;outline-offset:8px;border-radius:6px}
[data-mark]::before{content:attr(data-mark);position:absolute;top:-36px;right:0;background:#dc2626;color:#fff;font-weight:600;padding:0 8px;border-radius:9999px}
</style></head><body><main>
<header><h1>${esc(title)}</h1><p class="muted">สร้างเมื่อ ${esc(made)}${url ? ` จากหน้า <a href="${esc(url)}">${esc(url)}</a>` : ''}</p></header>
${shots.length ? `<section><h2>ภาพหน้าจอ</h2><div class="pair">${shots.map(([cap, src]) => `<figure><figcaption>${cap}</figcaption><img src="${esc(src)}" alt="${cap}"></figure>`).join('')}</div></section>` : ''}
${checks ? `<section><h2>ผลตรวจ</h2><div class="pair">
<figure><figcaption>ก่อนแก้ (ต้องล้ม)</figcaption><pre id="check-before">${esc(checkBefore || 'ไม่ได้แนบ')}</pre></figure>
<figure><figcaption>หลังแก้ (ต้องผ่าน)</figcaption><div data-mark="1 หลังแก้"><pre id="check-after">${esc(checkAfter || 'ไม่ได้แนบ')}</pre></div></figure>
</div></section>` : ''}
<section><h2>บรรทัดที่แก้</h2><div data-mark="${checks ? 2 : 1} จุดที่แก้">${diffHtml(diff)}</div></section>
</main></body></html>
`;
}

function main() {
  const a = args(process.argv.slice(2));
  if (!a.title) fail('--title is required, e.g. --title "ยอดรวมผิด"');
  for (const k of ['before', 'after', 'check-before', 'check-after']) {
    if (a[k] && !fs.existsSync(a[k])) fail(`--${k}: file not found: ${a[k]}`);
  }
  let root = '';
  try {
    root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
  } catch {}
  const files = (a.files || '').split(',').map((f) => f.trim()).filter(Boolean);
  const diff = diffOf(root, files);

  const base = path.join(root || process.cwd(), '.claude', 'evidence');
  let dir = path.join(base, `${stamp()}-${slug(a.title)}`);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(base, `${stamp()}-${slug(a.title)}-${n}`);
  fs.mkdirSync(dir, { recursive: true });

  const copy = (src, name) => {
    if (!src) return '';
    const file = name + (path.extname(src).toLowerCase() || '.png');
    fs.copyFileSync(src, path.join(dir, file));
    return file;
  };
  const before = copy(a.before, 'before');
  const after = copy(a.after, 'after');
  const read = (f) => (f ? fs.readFileSync(f, 'utf8') : '');
  const html = path.join(dir, 'evidence.html');
  fs.writeFileSync(html, page({
    title: a.title, url: a.url, before, after, checkBefore: read(a['check-before']), checkAfter: read(a['check-after']), diff,
    made: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
  }));

  const links = [after && `[ภาพหลังแก้](${rel(path.join(dir, after))})`, `[หน้าหลักฐาน](${rel(html)})`, a.url && `[เปิดหน้าจริง](${a.url})`].filter(Boolean);
  console.log(JSON.stringify({ dir: rel(dir), html: rel(html), report: `ตรวจ: ${links.join(' ')}` }));
}

main();
