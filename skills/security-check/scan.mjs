#!/usr/bin/env node
// Dependency-free security scanner used by the security-check and pentest skills.
//
//   node scan.mjs secrets [--diff]        secrets in tracked files (or only changed files)
//   node scan.mjs deps                    npm / pnpm / composer audit, summarised
//   node scan.mjs web --url <url> [--allow-remote]
//                                         passive checks on a running app: headers, cookies, CORS, exposed paths
//
// Prints a short summary; full JSON (values redacted) goes to <cwd>/.security-reports/.
// Exit: 0 = no high/critical, 1 = high/critical found, 2 = usage error or refused target.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const cwd = process.cwd();
const RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// ---------- secrets ----------
const PATTERNS = [
  ['github-token', 'high', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['openrouter-key', 'high', /\bsk-or-v1-[a-f0-9]{48,}\b/],
  ['anthropic-key', 'high', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai-key', 'high', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['google-api-key', 'high', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['aws-access-key', 'high', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack-token', 'high', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private-key', 'high', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['discord-webhook', 'high', /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/],
  ['db-url-password', 'high', /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/'"]+:([^@\s'"]+)@/],
  ['jwt', 'medium', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['hardcoded-credential', 'low', /\b(?:password|passwd|secret|api_?key|access_?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i],
];
const PLACEHOLDER = /x{4,}|your[_-]|example|changeme|placeholder|dummy|<[^>]+>|\[[A-Z_]+\]|\$\{|\*{4,}|redacted|replace[_-]?me/i;
// A credential for a database on this machine (tests, docker compose) is worth knowing about, not a leak.
const LOCAL_DB_HOST = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|db|postgres|mysql|redis)(:\d+)?[/?"'\s]|@(localhost|127\.0\.0\.1)$/i;
const SKIP_DIR = /(^|\/)(node_modules|vendor|\.git|dist|build|\.next|\.turbo|coverage|\.security-reports)\//;
const SKIP_FILE = /(\.lock|-lock\.json|-lock\.yaml|\.min\.js|\.map|\.(png|jpe?g|gif|ico|pdf|zip|woff2?|ttf|exe|dll|mp4|svg))$/i;

const redact = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…(${s.length} chars)`);

function listFiles(diffOnly) {
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    if (diffOnly) {
      let changed = '';
      try { changed = git('diff', '--name-only', 'HEAD'); } catch { changed = git('diff', '--name-only', '--cached'); }
      return [...new Set((changed + git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean))];
    }
    return [...new Set((git('ls-files') + git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean))];
  } catch {
    if (diffOnly) throw new Error('--diff needs a git repository');
    const out = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(cwd, d), { withFileTypes: true })) { const r = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) { if (!SKIP_DIR.test(r + '/')) walk(r); } else out.push(r); } };
    walk('');
    return out;
  }
}

function isTracked(rel) {
  try { execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd, stdio: 'ignore' }); return true; } catch { return false; }
}

function scanSecrets() {
  const findings = [];
  for (const rel of listFiles(flag('--diff'))) {
    if (SKIP_DIR.test(rel) || SKIP_FILE.test(rel)) continue;
    const abs = path.join(cwd, rel);
    let st; try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 1_000_000) continue;
    const base = path.basename(rel);
    if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base) && isTracked(rel)) {
      findings.push({ id: 'env-file-tracked', severity: 'high', file: rel, line: 0, evidence: 'whole file is tracked by git' });
    }
    const text = fs.readFileSync(abs, 'utf8');
    if (text.includes('\u0000')) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      for (const [id, severity, re] of PATTERNS) {
        const m = line.match(re);
        if (!m) continue;
        const value = m[1] ?? m[0];
        if (PLACEHOLDER.test(value) || PLACEHOLDER.test(m[0])) continue;
        const local = id === 'db-url-password' && LOCAL_DB_HOST.test(line);
        findings.push({ id, severity: local ? 'low' : severity, file: rel, line: i + 1, evidence: redact(value) + (local ? ' (local database)' : '') });
        break; // one finding per line, strongest pattern first
      }
    });
  }
  return findings;
}

// ---------- deps ----------
function npmCli(args) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
}
function corepack(args) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
}

function scanDeps() {
  const findings = [];
  const notes = [];
  const fromNpmJson = (tool, out) => {
    let j; try { j = JSON.parse(out); } catch { notes.push(`${tool}: could not parse output — ran but result unknown`); return; }
    if (j.error) { notes.push(`${tool}: ${j.error.summary ?? j.error.code ?? 'error'}`); return; }
    for (const [name, v] of Object.entries(j.vulnerabilities ?? {})) {
      const via = (v.via ?? []).find((x) => typeof x === 'object');
      findings.push({ id: `vulnerable-dependency:${name}`, severity: v.severity === 'moderate' ? 'medium' : v.severity, file: tool, line: 0, evidence: `${via?.title ?? 'see advisory'}${v.fixAvailable ? ' · fix available' : ''}` });
    }
    for (const a of Object.values(j.advisories ?? {})) {
      findings.push({ id: `vulnerable-dependency:${a.module_name}`, severity: a.severity === 'moderate' ? 'medium' : a.severity, file: tool, line: 0, evidence: `${a.title}${a.patched_versions ? ` · patched ${a.patched_versions}` : ''}` });
    }
  };
  let ran = false;
  const prod = flag('--prod') ? ['--prod'] : [];
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) { ran = true; fromNpmJson('npm audit', npmCli(['audit', '--json', ...(prod.length ? ['--omit=dev'] : [])]).stdout); }
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) { ran = true; fromNpmJson('pnpm audit', corepack(['pnpm', 'audit', '--json', ...prod]).stdout); }
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) notes.push('yarn.lock found — yarn audit not supported by this script; run it manually');
  if (fs.existsSync(path.join(cwd, 'composer.lock'))) {
    ran = true;
    const r = spawnSync('composer', ['audit', '--format=json', '--locked'], { cwd, encoding: 'utf8', shell: true });
    let j; try { j = JSON.parse(r.stdout); } catch { notes.push(`composer audit: not available or failed (${(r.stderr || '').split('\n')[0] || 'no output'})`); }
    for (const [pkg, list] of Object.entries(j?.advisories ?? {})) for (const a of Object.values(list)) {
      findings.push({ id: `vulnerable-dependency:${pkg}`, severity: (a.severity ?? 'high').toLowerCase(), file: 'composer audit', line: 0, evidence: `${a.title ?? a.cve ?? 'advisory'}` });
    }
  }
  if (!ran) notes.push('no package-lock.json / pnpm-lock.yaml / composer.lock in this folder — nothing audited');
  // One package often carries many advisories; the package count is the number to fix.
  const worst = {};
  for (const f of findings) { const p = f.id.split(':')[1]; if (!worst[p] || RANK[f.severity] > RANK[worst[p]]) worst[p] = f.severity; }
  const byWorst = {};
  for (const s of Object.values(worst)) byWorst[s] = (byWorst[s] ?? 0) + 1;
  if (findings.length) notes.unshift(`${findings.length} advisories across ${Object.keys(worst).length} packages${prod.length ? ' (runtime only)' : ' (incl. dev tools; add --prod for runtime only)'} — packages by worst severity: ${['critical', 'high', 'medium', 'low'].map((s) => `${s} ${byWorst[s] ?? 0}`).join(' · ')}`);
  return { findings, notes };
}

// ---------- web (passive) ----------
function isLocal(u) {
  const h = u.hostname.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.test') || h === 'host.docker.internal' || h === '::1' ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function scanWeb(target) {
  const findings = [];
  const add = (id, severity, evidence) => findings.push({ id, severity, file: target.origin, line: 0, evidence });
  // dev servers compile each route on first hit, so allow a generous per-request timeout
  const get = (p, headers = {}) => fetch(new URL(p, target), { redirect: 'manual', headers, signal: AbortSignal.timeout(120_000) });
  const home = await get(target.pathname, { Origin: 'https://evil.example' });
  const h = home.headers;
  const html = (h.get('content-type') ?? '').includes('html');
  if (html && !h.get('content-security-policy')) add('missing-csp', 'medium', 'no Content-Security-Policy');
  if (h.get('x-content-type-options') !== 'nosniff') add('missing-x-content-type-options', 'low', 'X-Content-Type-Options is not nosniff');
  if (html && !h.get('x-frame-options') && !/frame-ancestors/.test(h.get('content-security-policy') ?? '')) add('missing-clickjacking-protection', 'medium', 'no X-Frame-Options or CSP frame-ancestors');
  if (!h.get('referrer-policy')) add('missing-referrer-policy', 'low', 'no Referrer-Policy');
  if (target.protocol === 'https:' && !h.get('strict-transport-security')) add('missing-hsts', 'medium', 'no Strict-Transport-Security');
  for (const name of ['x-powered-by', 'server']) { const v = h.get(name); if (v && /\d|express|php|nginx|apache|next/i.test(v)) add('tech-disclosure', 'low', `${name}: ${v}`); }
  for (const c of h.getSetCookie?.() ?? []) {
    const name = c.split('=')[0];
    if (!/;\s*httponly/i.test(c)) add('cookie-no-httponly', 'medium', `cookie ${name}`);
    if (!/;\s*samesite/i.test(c)) add('cookie-no-samesite', 'low', `cookie ${name}`);
    if (target.protocol === 'https:' && !/;\s*secure/i.test(c)) add('cookie-no-secure', 'medium', `cookie ${name}`);
  }
  const acao = h.get('access-control-allow-origin');
  if (acao === 'https://evil.example') add('cors-reflects-origin', h.get('access-control-allow-credentials') === 'true' ? 'high' : 'medium', `reflects Origin${h.get('access-control-allow-credentials') === 'true' ? ' with credentials' : ''}`);
  else if (acao === '*' && h.get('access-control-allow-credentials') === 'true') add('cors-wildcard-credentials', 'high', '* with credentials');

  // Exposed paths — compare with a random path to ignore SPA catch-all pages.
  const baseline = await get(`/__nope_${Date.now()}`);
  const baselineBody = baseline.status === 200 ? await baseline.text() : null;
  for (const p of ['/.env', '/.env.local', '/.git/config', '/.git/HEAD', '/phpinfo.php', '/server-status', '/.DS_Store', '/backup.sql', '/storage/logs/laravel.log', '/api/debug']) {
    const r = await get(p);
    if (r.status !== 200) continue;
    const body = await r.text();
    if (baselineBody !== null && body === baselineBody) continue;
    add(`exposed-path:${p}`, /env|git|sql|log|phpinfo/.test(p) ? 'high' : 'medium', `HTTP 200, ${body.length} bytes`);
  }
  return findings;
}

// ---------- output ----------
function report(kind, findings, notes = []) {
  const dir = path.join(cwd, '.security-reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.json`);
  fs.writeFileSync(file, JSON.stringify({ kind, cwd, findings, notes }, null, 1));
  const ex = path.join(cwd, '.git', 'info', 'exclude');
  if (fs.existsSync(path.dirname(ex))) {
    const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
    if (!cur.includes('.security-reports/')) fs.appendFileSync(ex, `${cur.endsWith('\n') || !cur ? '' : '\n'}.security-reports/\n`);
  }
  const count = {};
  for (const f of findings) count[f.severity] = (count[f.severity] ?? 0) + 1;
  console.log(`## ${kind}: ${findings.length} finding(s) — ${['critical', 'high', 'medium', 'low'].map((s) => `${s} ${count[s] ?? 0}`).join(' · ')}`);
  const top = [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]).slice(0, 40);
  if (top.length) {
    console.log('| severity | id | where | evidence |\n|---|---|---|---|');
    for (const f of top) console.log(`| ${f.severity} | ${f.id} | ${f.file}${f.line ? `:${f.line}` : ''} | ${f.evidence} |`);
    if (findings.length > top.length) console.log(`… ${findings.length - top.length} more in the report file`);
  }
  for (const n of notes) console.log(`note: ${n}`);
  console.log(`report: ${path.relative(cwd, file)}`);
  return findings.some((f) => RANK[f.severity] >= RANK.high) ? 1 : 0;
}

try {
  if (mode === 'secrets') process.exitCode = report('secrets', scanSecrets());
  else if (mode === 'deps') { const { findings, notes } = scanDeps(); process.exitCode = report('deps', findings, notes); }
  else if (mode === 'web') {
    const raw = opt('--url');
    if (!raw) throw Object.assign(new Error('web needs --url'), { usage: true });
    const target = new URL(raw);
    if (!isLocal(target) && !flag('--allow-remote')) {
      console.log(`REFUSED: ${target.hostname} is not a local target. Only scan apps you own; remote targets need the user's explicit yes in chat, then --allow-remote.`);
      process.exitCode = 2;
    } else process.exitCode = report('web', await scanWeb(target));
  } else {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exitCode = 2;
}
