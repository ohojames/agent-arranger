// node --test test/  — builds a throwaway project with planted fake secrets, then checks scan.mjs.
// Fake secrets are assembled at runtime so this file itself never contains one.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan.mjs');
const run = (args, cwd) => spawnSync(process.execPath, [SCAN, ...args], { cwd, encoding: 'utf8' });

const fakeGh = 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const fakeGoogle = 'AI' + 'za' + 'SyD3fakeFAKEfake0123456789abcdefghi';
const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEfake\n-----END RSA PRIVATE KEY-----';

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seccheck-'));
  fs.writeFileSync(path.join(dir, 'config.js'), `export const token = "${fakeGh}";\nconst maps = '${fakeGoogle}';\n`);
  fs.writeFileSync(path.join(dir, 'key.pem'), pem);
  fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=postgres://admin:S3cretPass@db.example.com:5432/app\n');
  fs.writeFileSync(path.join(dir, '.env.example'), 'DATABASE_URL=postgres://user:your_password@localhost:5432/app\n');
  fs.writeFileSync(path.join(dir, 'clean.js'), 'export const ok = process.env.API_KEY;\n');
  // false positives seen on a real project: bracket placeholder, and a local test database
  fs.writeFileSync(path.join(dir, 'bracket.example.txt'), 'POSTGRES_URL="postgres://postgres.[USERNAME]:[PASSWORD]@pooler.example.com:6543/postgres"\n');
  fs.writeFileSync(path.join(dir, 'vitest.config.ts'), 'const url = "postgresql://postgres:postgres@localhost:55432/app";\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

test('secrets: finds planted secrets, ignores placeholders, never prints values', () => {
  const dir = makeProject();
  const r = run(['secrets'], dir);
  assert.equal(r.status, 1, 'high findings must exit 1');
  for (const kind of ['github-token', 'google-api-key', 'private-key', 'db-url-password', 'env-file-tracked']) {
    assert.match(r.stdout, new RegExp(kind), `missing ${kind}`);
  }
  assert.doesNotMatch(r.stdout, /\.env\.example/, 'placeholder in .env.example must be ignored');
  assert.doesNotMatch(r.stdout, /clean\.js/);
  assert.doesNotMatch(r.stdout, /bracket\.example\.txt/, '[PASSWORD] placeholder must be ignored');
  assert.match(r.stdout, /\| low \| db-url-password \| vitest\.config\.ts/, 'localhost DB credential is low, not high');
  for (const secret of [fakeGh, fakeGoogle, 'S3cretPass', 'MIIEfake']) assert.ok(!r.stdout.includes(secret), `leaked ${secret.slice(0, 6)}…`);
  const reports = path.join(dir, '.security-reports');
  assert.ok(fs.existsSync(reports), 'writes a report folder');
  for (const f of fs.readdirSync(reports)) assert.ok(!fs.readFileSync(path.join(reports, f), 'utf8').includes(fakeGh), 'report must be redacted');
  assert.match(fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8'), /\.security-reports\//);
});

test('secrets --diff: only changed files', () => {
  const dir = makeProject();
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'new.js'), 'const a = 1;\n');
  const r = run(['secrets', '--diff'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /github-token/);
});

test('web: refuses non-local targets without --allow-remote', () => {
  const r = run(['web', '--url', 'https://example.com'], os.tmpdir());
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /not a local target/i);
});

test('web: flags missing headers, weak cookies, reflected CORS, exposed .env', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/.env') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('SECRET=1'); }
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sid=abc; Path=/', 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-allow-credentials': 'true', 'x-powered-by': 'Express' });
      return res.end('<html>home</html>');
    }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/`;
  // async spawn: spawnSync would block this process's event loop and the test server could never answer
  const r = await new Promise((ok) => {
    const p = spawn(process.execPath, [SCAN, 'web', '--url', url], { cwd: os.tmpdir() });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stdout += d));
    p.on('close', (status) => ok({ status, stdout }));
  });
  server.close();
  for (const id of ['missing-csp', 'missing-x-content-type-options', 'cookie-no-httponly', 'cors-reflects-origin', 'exposed-path:/.env', 'tech-disclosure']) {
    assert.match(r.stdout, new RegExp(id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), `missing ${id}\n${r.stdout}`);
  }
  assert.equal(r.status, 1);
});
