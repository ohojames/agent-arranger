// node --test test/evidence.test.mjs: evidence.mjs builds the review page linked from the report
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const EVIDENCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'evidence.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [EVIDENCE, ...args], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(dir, 'total.js'), 'export const total = (a, b) => a - b;\n');
  fs.writeFileSync(path.join(dir, 'other.js'), 'export const x = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(dir, 'total.js'), 'export const total = (a, b) => a + b;\n');
  fs.writeFileSync(path.join(dir, 'other.js'), 'export const x = 2; // someone else\n');
  fs.writeFileSync(path.join(dir, 'new.js'), 'export const added = true;\n');
  return dir;
}

test('UI bug: page holds both images, the page URL and only the listed files in the diff', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'b.png'), PNG);
  fs.writeFileSync(path.join(dir, 'a.jpg'), PNG);
  const r = run(dir, '--title', 'ยอดรวมผิด <total>', '--url', 'http://localhost:3000/quote/7', '--before', 'b.png', '--after', 'a.jpg', '--files', 'total.js,new.js');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const html = fs.readFileSync(path.join(dir, out.html), 'utf8');
  assert.match(out.dir, /^\.claude\/evidence\/\d{4}-\d{2}-\d{2}-\d{4}-/);
  assert.ok(fs.existsSync(path.join(dir, out.dir, 'before.png')));
  assert.ok(fs.existsSync(path.join(dir, out.dir, 'after.jpg')));
  assert.deepEqual([...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]), ['before.png', 'after.jpg']);
  assert.match(html, /href="http:\/\/localhost:3000\/quote\/7"/);
  assert.match(html, /ยอดรวมผิด &lt;total&gt;/, 'title is escaped');
  assert.match(html, /a \+ b/);
  assert.match(html, /export const added = true/, 'untracked file listed in --files is shown as added');
  assert.doesNotMatch(html, /someone else/, 'files not listed stay out of the page');
  assert.equal(out.report, `ตรวจ: [ภาพหลังแก้](${out.dir}/after.jpg) [หน้าหลักฐาน](${out.html}) [เปิดหน้าจริง](http://localhost:3000/quote/7)`);
});

test('bug without a screen: before and after check output are on the page, marked for the screenshot', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'fail.txt'), 'not ok 1 total adds\n# fail 1\n');
  fs.writeFileSync(path.join(dir, 'pass.txt'), 'ok 1 total adds\n# pass 1\n');
  const r = run(dir, '--title', 'total subtracts', '--check-before', 'fail.txt', '--check-after', 'pass.txt', '--files', 'total.js');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const html = fs.readFileSync(path.join(dir, out.html), 'utf8');
  assert.equal([...html.matchAll(/<img /g)].length, 0);
  assert.match(html, /id="check-before"[\s\S]*not ok 1 total adds/);
  assert.match(html, /id="check-after"[\s\S]*# pass 1/);
  assert.match(html, /data-mark/, 'the after check and the diff carry a built-in frame');
  assert.equal(out.report, `ตรวจ: [หน้าหลักฐาน](${out.html})`);
});

test('two runs in the same minute get separate folders', () => {
  const dir = repo();
  const a = JSON.parse(run(dir, '--title', 'x', '--files', 'total.js').stdout);
  const b = JSON.parse(run(dir, '--title', 'x', '--files', 'total.js').stdout);
  assert.notEqual(a.dir, b.dir);
});

test('missing image or title fails loudly instead of writing a half page', () => {
  const dir = repo();
  const r = run(dir, '--title', 'x', '--after', 'nope.png');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.png/);
  assert.equal(run(dir).status, 2);
  assert.ok(!fs.existsSync(path.join(dir, '.claude', 'evidence')) || fs.readdirSync(path.join(dir, '.claude', 'evidence')).length === 0);
});
