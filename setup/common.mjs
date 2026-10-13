// Shared by install.mjs, uninstall.mjs and doctor.mjs.
// Everything is resolved from os.homedir(), so tests run against a throwaway HOME/USERPROFILE.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrangerHome, DEFAULT_CONFIG } from '../core/lib.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = os.homedir();
export const DEST = arrangerHome();
export const IS_WIN = process.platform === 'win32';
export const BEGIN = '<!-- BEGIN agent-arranger -->';
export const END = '<!-- END agent-arranger -->';
export const MARK = '.agent-arranger'; // every hook command we register contains this

// ---------- what gets installed ----------

export const PLUGINS = [
  { id: 'superpowers@superpowers-dev', marketplace: 'superpowers-dev', source: 'obra/superpowers' },
  { id: 'document-skills@anthropic-agent-skills', marketplace: 'anthropic-agent-skills', source: 'anthropics/skills' },
];

export const MCP = {
  // up-to-date library docs, so the AI does not write removed APIs
  context7: { kind: 'npm', entry: ['@upstash', 'context7-mcp', 'dist', 'index.js'], args: [] },
  // open the real page, screenshot, read the console
  'chrome-devtools': { kind: 'npm', entry: ['chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js'], args: ['--isolated'] },
};

/** Claude Code hooks: [event, matcher|null, script, timeout, enabled(cfg)] */
export const CLAUDE_HOOKS = [
  ['SessionStart', null, 'load-handoff.mjs', 15, () => true],
  ['PreCompact', null, 'pre-compact.mjs', 30, () => true],
  ['UserPromptSubmit', null, 'route-prompt.mjs', 20, () => true],
  ['PreToolUse', 'Bash', 'guard-account.mjs', 20, (c) => c.guardAccount],
  ['Stop', null, 'verify-stop.mjs', 320, () => true],
  ['Stop', null, 'design-lint.mjs', 120, (c) => c.designRules],
  ['Stop', null, 'bg-status.mjs', 30, () => true],
];

/** Each AI tool: where its global rules, skills and MCP config live. */
export function tools() {
  return {
    claude: {
      name: 'Claude Code',
      present: () => fs.existsSync(path.join(HOME, '.claude')) || Boolean(findClaude()),
      rules: path.join(HOME, '.claude', 'CLAUDE.md'),
      skills: path.join(HOME, '.claude', 'skills'),
      mcp: { file: path.join(HOME, '.claude.json'), key: 'mcpServers', servers: Object.keys(MCP) },
    },
    codex: {
      name: 'Codex CLI / ChatGPT desktop (Codex)',
      present: () => fs.existsSync(path.join(HOME, '.codex')),
      rules: path.join(HOME, '.codex', 'AGENTS.md'),
      skills: path.join(HOME, '.agents', 'skills'),
    },
    antigravity: {
      name: 'Google Antigravity',
      present: () => fs.existsSync(path.join(HOME, '.gemini')),
      rules: path.join(HOME, '.gemini', 'GEMINI.md'),
      // Antigravity reads at most 24 KB per rules file, so the UI rules get a file of their own
      designRulesFile: path.join(HOME, '.gemini', 'config', 'rules', 'agent-arranger-design.md'),
      skills: path.join(HOME, '.gemini', 'config', 'skills'),
      // Antigravity ships its own browser tool, so chrome-devtools is not added there
      mcp: { file: path.join(HOME, '.gemini', 'config', 'mcp_config.json'), key: 'mcpServers', servers: ['context7'] },
    },
    zcode: {
      name: 'ZCode',
      present: () => fs.existsSync(path.join(HOME, '.zcode')),
      rules: path.join(HOME, '.zcode', 'AGENTS.md'),
      skills: path.join(HOME, '.zcode', 'skills'),
    },
  };
}

// ---------- config / manifest ----------

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function loadConfig() {
  return { ...DEFAULT_CONFIG, ...readJson(path.join(DEST, 'config.json'), {}) };
}

export const manifestFile = () => path.join(DEST, 'manifest.json');

export function loadManifest() {
  return readJson(manifestFile(), { files: {}, skills: {}, settings: {}, mcp: {}, plugins: [], marketplaces: [] });
}

// ---------- rules ----------

export function rulesBody(cfg) {
  const dir = path.join(DEST, 'rules');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && (cfg.designRules || f !== '20-design.md')).sort();
  const parts = [
    '# agent-arranger — กฎการทำงานกลาง',
    '',
    'ติดตั้งโดย agent-arranger อย่าแก้ในบล็อกนี้ — แก้ที่ repo แล้วรัน `node install.mjs` ใหม่',
    'กฎที่ผู้ใช้สั่งตรงๆ ในบทสนทนา มาก่อนกฎในไฟล์นี้เสมอ',
  ];
  for (const f of files) parts.push('', '---', '', fs.readFileSync(path.join(dir, f), 'utf8').trim());
  return parts.join('\n');
}

/** Insert or replace our managed block; text outside the markers is never touched. */
export function writeBlock(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const block = `${BEGIN}\n${body}\n${END}`;
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const i = cur.indexOf(BEGIN);
  const j = cur.indexOf(END);
  const out = i !== -1 && j > i
    ? cur.slice(0, i) + block + cur.slice(j + END.length)
    : (cur.trimEnd() ? cur.trimEnd() + '\n\n' : '') + block + '\n';
  fs.writeFileSync(file, out);
}

export function removeBlock(file) {
  if (!fs.existsSync(file)) return false;
  const cur = fs.readFileSync(file, 'utf8');
  const i = cur.indexOf(BEGIN);
  const j = cur.indexOf(END);
  if (i === -1 || j < i) return false;
  const out = (cur.slice(0, i).trimEnd() + '\n' + cur.slice(j + END.length).replace(/^\n+/, '\n')).replace(/^\n+$/, '');
  fs.writeFileSync(file, out.trim() ? out.replace(/\n+$/, '\n') : '');
  return true;
}

// ---------- files ----------

export function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}

export function dirHash(dir) {
  const h = crypto.createHash('sha1');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(path.relative(dir, p).replace(/\\/g, '/') + '\0').update(fs.readFileSync(p));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return h.digest('hex');
}

// ---------- external programs ----------

/** The claude CLI: on PATH, the native installer location, or the copy bundled with the desktop app. */
export function findClaude() {
  const exe = IS_WIN ? 'claude.exe' : 'claude';
  const candidates = [path.join(HOME, '.local', 'bin', exe)];
  const bundles = IS_WIN
    ? [path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Claude', 'claude-code')]
    : [path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude-code')];
  for (const b of bundles) {
    let versions = [];
    try { versions = fs.readdirSync(b).sort(compareVersions).reverse(); } catch {}
    for (const v of versions) {
      let subs = [];
      try { subs = fs.readdirSync(path.join(b, v)); } catch {}
      for (const s of subs) candidates.push(path.join(b, v, s, exe));
      candidates.push(path.join(b, v, exe));
    }
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const onPath = which('claude');
  return onPath || null;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export function which(name) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean)?.trim() || null : null;
}

/** Run a command; npm shims on Windows need a shell. Never prints secrets — none are passed. */
export function run(cmd, args, opts = {}) {
  const shell = IS_WIN && !/\.exe$/i.test(cmd);
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell, timeout: 600_000, ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), status: r.status };
}

export const slash = (p) => p.replace(/\\/g, '/');
