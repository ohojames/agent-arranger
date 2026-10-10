#!/usr/bin/env node
// agent-arranger installer — one command:  node install.mjs
//
//   node install.mjs                 install / update for every AI tool found on this machine
//   node install.mjs --only claude   limit to some tools (claude,codex,antigravity,zcode)
//   node install.mjs --offline       skip downloads (MCP packages, plugins) — says so in the summary
//   node install.mjs --with a,b      also install skills from skills-optional/ (or --with all, or --with media for
//                                    video/image/voice, --with migration for legacy data migration); remembered in config.json
//
// Safe to run again: it replaces its own pieces and records what it changed in ~/.agent-arranger/manifest.json
// so uninstall.mjs can put every file back.

import fs from 'node:fs';
import path from 'node:path';
import {
  REPO, HOME, DEST, MARK, PLUGINS, MCP, CLAUDE_HOOKS, tools, readJson, writeJson, loadConfig, loadManifest,
  manifestFile, rulesBody, writeBlock, copyDir, findClaude, run, slash,
} from './setup/common.mjs';
import { DEFAULT_CONFIG, lessonFiles, publishLessons, readLessons } from './core/lib.mjs';

const argv = process.argv.slice(2);
const offline = argv.includes('--offline');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const withSkills = argv.includes('--with') ? argv[argv.indexOf('--with') + 1].split(',') : null;

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`ต้องใช้ Node.js 18 ขึ้นไป (เครื่องนี้ ${process.version}) — ติดตั้งจาก https://nodejs.org แล้วรันใหม่`);
  process.exit(1);
}

const report = []; // [area, result, detail]
const note = (area, result, detail = '') => report.push([area, result, detail]);

// 1. Stage the toolkit in ~/.agent-arranger (state files survive updates)
fs.mkdirSync(DEST, { recursive: true });
for (const d of ['core', 'rules', 'skills', 'skills-optional']) copyDir(path.join(REPO, d), path.join(DEST, d));
fs.copyFileSync(path.join(REPO, 'package.json'), path.join(DEST, 'package.json'));
if (!fs.existsSync(path.join(DEST, 'config.json'))) writeJson(path.join(DEST, 'config.json'), DEFAULT_CONFIG);
const cfg = loadConfig();
const m = loadManifest();
m.version = readJson(path.join(REPO, 'package.json')).version;
m.installedAt = new Date().toISOString();
note('ไฟล์หลัก', 'ติดตั้งแล้ว', slash(DEST));

// Remember the original state of anything we touch, once, so uninstall can restore it.
// Record a file's original state once: a byte copy (so uninstall can restore formatting too) and every
// folder we are about to create (so uninstall removes only those, never a folder the user already had).
function track(file, dir = false) {
  if (file in m.files) return;
  const existed = fs.existsSync(file);
  m.files[file] = { existed, ...(dir ? { dir } : {}) };
  if (existed && !dir) {
    const copy = path.join(DEST, 'backups', 'files', String(Object.keys(m.files).length));
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(file, copy);
    m.files[file].backup = copy;
  }
  m.createdDirs ??= [];
  for (let d = dir ? file : path.dirname(file); d.startsWith(HOME) && d !== HOME && !fs.existsSync(d); d = path.dirname(d)) {
    if (!m.createdDirs.includes(d)) m.createdDirs.push(d);
  }
}
function remember(file, keys) {
  track(file);
  const id = `${file}::${keys.join('.')}`;
  if (id in m.settings) return;
  let cur = readJson(file, {});
  for (const k of keys) cur = cur?.[k];
  m.settings[id] = cur === undefined ? { absent: true } : { v: cur };
}
function setKey(file, keys, value) {
  remember(file, keys);
  const j = readJson(file, {});
  let o = j;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  writeJson(file, j);
}

// 2. Rules + skills for each AI tool present
const all = tools();
const chosen = Object.entries(all).filter(([id, t]) => (!only || only.includes(id)) && t.present());
if (!chosen.length) {
  console.error('ไม่พบ AI tool ที่รองรับในเครื่องนี้ (Claude Code, Codex, Antigravity, ZCode) — ติดตั้ง tool ก่อนแล้วรันใหม่');
  process.exit(1);
}
// Skills nobody used in practice live in skills-optional/ and are installed only when asked for
const optional = fs.readdirSync(path.join(DEST, 'skills-optional'));
// Named sets for --with: one word instead of a list of skills that only work together
const GROUPS = {
  media: ['hyperframes', 'hyperframes-core', 'hyperframes-cli', 'hyperframes-audio', 'media-use', 'embedded-captions',
    'faceless-explainer', 'general-video', 'gemini-api-dev', 'gemini-image', 'gemini-tts'],
  migration: ['legacy-migration', 'postgres-database-migration', 'sqlserver-to-postgresql-playbook', 'data-migration'],
};
if (withSkills) {
  const asked = withSkills.includes('all') ? optional : withSkills.flatMap((n) => GROUPS[n] || [n]);
  const unknown = asked.filter((n) => !optional.includes(n));
  if (unknown.length) {
    console.error(`ไม่มี skill เสริมชื่อ: ${unknown.join(', ')} — ที่มี: ${Object.keys(GROUPS).join(', ')}, ${optional.join(', ')}`);
    process.exit(1);
  }
  cfg.optionalSkills = [...new Set([...(cfg.optionalSkills || []), ...asked])];
  writeJson(path.join(DEST, 'config.json'), { ...readJson(path.join(DEST, 'config.json'), {}), optionalSkills: cfg.optionalSkills });
}
const extra = (cfg.optionalSkills || []).filter((n) => optional.includes(n));
const skillSrc = (name) => path.join(DEST, extra.includes(name) ? 'skills-optional' : 'skills', name);
const skillNames = [...fs.readdirSync(path.join(DEST, 'skills')), ...extra];
for (const [id, t] of chosen) {
  track(t.rules);
  if (t.designRulesFile) {
    writeBlock(t.rules, rulesBody({ ...cfg, designRules: false }));
    if (cfg.designRules) {
      track(t.designRulesFile);
      m.files[t.designRulesFile].owned = true;
      fs.mkdirSync(path.dirname(t.designRulesFile), { recursive: true });
      fs.writeFileSync(t.designRulesFile, `---\ntrigger: always_on\n---\n\n${fs.readFileSync(path.join(DEST, 'rules', '20-design.md'), 'utf8')}`);
    }
  } else {
    writeBlock(t.rules, rulesBody(cfg));
  }
  track(t.skills, true);

  const owned = new Set((m.skills[id] || []).map((s) => s.name));
  const list = m.skills[id] || [];
  for (const name of skillNames) {
    const target = path.join(t.skills, name);
    if (!owned.has(name)) {
      const backedUp = fs.existsSync(target);
      if (backedUp) copyDir(target, path.join(DEST, 'backups', 'skills', id, name));
      list.push({ name, backedUp });
    }
    copyDir(skillSrc(name), target);
  }
  // skills an earlier install put here but no longer in the set: remove, give back what the user had
  const dropped = list.filter((s) => !skillNames.includes(s.name));
  for (const { name, backedUp } of dropped) {
    const target = path.join(t.skills, name);
    fs.rmSync(target, { recursive: true, force: true });
    if (backedUp) {
      const backup = path.join(DEST, 'backups', 'skills', id, name);
      copyDir(backup, target);
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
  m.skills[id] = list.filter((s) => skillNames.includes(s.name));
  note(t.name, 'กฎ + skills', `${skillNames.length} skills → ${slash(t.skills)}` + (dropped.length ? ` (ถอนตัวที่ไม่อยู่ในชุดแล้ว ${dropped.length})` : ''));
}
// Approved lessons for tools without a prompt hook (the rules block above was just rewritten)
if (chosen.some(([id]) => id === 'antigravity')) {
  track(lessonFiles().antigravity);
  m.files[lessonFiles().antigravity].owned = true;
}
const lessonCount = readLessons().length;
if (lessonCount) note('บทเรียน', `${lessonCount} ข้อ`, `ส่งให้ ${publishLessons().length} ไฟล์`);

// 3. Claude Code: hooks, settings, plugins
const claudeChosen = chosen.some(([id]) => id === 'claude');
if (claudeChosen) {
  const sf = path.join(HOME, '.claude', 'settings.json');
  // our hooks are recognised by MARK in their command, so other hooks are never touched
  track(sf);
  const s = readJson(sf, {});
  s.hooks ??= {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].filter((g) => !JSON.stringify(g).includes(MARK));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  let n = 0;
  for (const [ev, matcher, script, timeout, enabled] of CLAUDE_HOOKS) {
    if (!enabled(cfg)) continue;
    const group = { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: `node "${slash(path.join(DEST, 'core', script))}"`, timeout }] };
    (s.hooks[ev] ??= []).push(group);
    n++;
  }
  writeJson(sf, s);
  setKey(sf, ['autoCompactWindow'], cfg.autoCompactWindow);
  setKey(sf, ['cleanupPeriodDays'], cfg.cleanupPeriodDays);
  // HyperFrames sends usage data unless told not to
  if (extra.includes('hyperframes')) setKey(sf, ['env', 'HYPERFRAMES_NO_TELEMETRY'], '1');
  note('Claude hooks', `${n} ตัว`, `ย่อ context อัตโนมัติที่ ${cfg.autoCompactWindow.toLocaleString()} · เก็บ log ${cfg.cleanupPeriodDays} วัน`);

  const claude = findClaude();
  const installedFile = path.join(HOME, '.claude', 'plugins', 'installed_plugins.json');
  const installed = () => Object.keys(readJson(installedFile, {})?.plugins || {});
  for (const p of PLUGINS) {
    if (installed().includes(p.id)) { note(`plugin ${p.id}`, 'มีอยู่แล้ว'); continue; }
    if (!offline && claude) {
      const known = Object.keys(readJson(path.join(HOME, '.claude', 'plugins', 'known_marketplaces.json'), {}));
      if (!known.includes(p.marketplace)) {
        const r = run(claude, ['plugin', 'marketplace', 'add', p.source, '--scope', 'user']);
        if (r.ok) m.marketplaces.push(p.marketplace);
      }
      const r = run(claude, ['plugin', 'install', p.id, '--scope', 'user']);
      if (r.ok && installed().includes(p.id)) {
        m.plugins.push(p.id);
        note(`plugin ${p.id}`, 'ติดตั้งแล้ว');
        continue;
      }
      note(`plugin ${p.id}`, 'ติดตั้งผ่าน CLI ไม่สำเร็จ → ใช้ทางสำรอง', r.out.split('\n').at(-1).slice(0, 120));
    }
    // Fallback: declare it; Claude Code offers to install it on the next start.
    setKey(sf, ['extraKnownMarketplaces', p.marketplace], { source: { source: 'github', repo: p.source } });
    setKey(sf, ['enabledPlugins', p.id], true);
    if (offline || !claude) note(`plugin ${p.id}`, 'ประกาศไว้ใน settings', offline ? '--offline: Claude จะติดตั้งตอนเปิดครั้งถัดไป' : 'ไม่พบคำสั่ง claude: Claude จะติดตั้งตอนเปิดครั้งถัดไป');
  }
}

// 4. MCP servers
const mcpTargets = chosen.filter(([, t]) => t.mcp);
if (mcpTargets.length) {
  if (offline) {
    note('MCP', 'ข้ามการดาวน์โหลด (--offline)', 'ลงทะเบียนเฉพาะตัวที่มีไฟล์อยู่แล้ว');
  } else {
    const r = run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: DEST });
    note('MCP npm', r.ok ? 'ติดตั้งแล้ว' : 'ไม่สำเร็จ', r.ok ? 'context7, chrome-devtools' : r.out.split('\n').at(-1).slice(0, 120));
  }
  for (const [, t] of mcpTargets) {
    const added = [];
    for (const name of t.mcp.servers) {
      const def = MCP[name];
      const js = path.join(DEST, 'node_modules', ...def.entry);
      if (!fs.existsSync(js)) continue;
      setKey(t.mcp.file, [t.mcp.key, name], { command: 'node', args: [js, ...def.args] });
      added.push(name);
    }
    const missing = t.mcp.servers.filter((x) => !added.includes(x));
    note(`MCP → ${t.name}`, added.length ? added.join(', ') : 'ไม่มี', missing.length ? `ยังไม่มี: ${missing.join(', ')}` : '');
  }
}

writeJson(manifestFile(), m);

// 5. Summary
const notFound = Object.entries(all).filter(([id, t]) => (!only || only.includes(id)) && !t.present()).map(([, t]) => t.name);
const w = Math.max(...report.map((r) => r[0].length));
console.log('\nagent-arranger — ผลการติดตั้ง\n');
for (const [a, r, d] of report) console.log(`  ${a.padEnd(w)}  ${r}${d ? '  · ' + d : ''}`);
if (notFound.length) console.log(`\n  ไม่พบในเครื่อง (ข้าม): ${notFound.join(', ')}`);
console.log(`\nตรวจทั้งระบบ:  node "${slash(path.join(REPO, 'doctor.mjs'))}"`);
console.log('เปิดแอป AI ใหม่หนึ่งครั้งเพื่อให้ค่าใหม่มีผล');
