#!/usr/bin/env node
// Checks that every piece agent-arranger installed is present and actually runs.
//   node doctor.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HOME, DEST, BEGIN, MARK, PLUGINS, CLAUDE_HOOKS, tools, readJson, loadConfig, loadManifest, manifestFile } from './setup/common.mjs';

let pass = 0;
let fail = 0;
const rows = [];
function check(name, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r === true || (r && r.ok !== false);
    detail = typeof r === 'object' && r?.detail ? r.detail : '';
  } catch (e) {
    detail = e.message.split('\n')[0];
  }
  ok ? pass++ : fail++;
  rows.push([ok ? 'ผ่าน  ' : 'ไม่ผ่าน', name, detail]);
}

if (!fs.existsSync(manifestFile())) {
  console.log('ยังไม่ได้ติดตั้ง — รัน: node install.mjs');
  process.exit(1);
}
const m = loadManifest();
const cfg = loadConfig();
const t = tools();

for (const [id, list] of Object.entries(m.skills)) {
  const tool = t[id];
  check(`${tool.name}: กฎ`, () => ({ ok: fs.readFileSync(tool.rules, 'utf8').includes(BEGIN), detail: tool.rules }));
  check(`${tool.name}: skills`, () => {
    const missing = list.filter((s) => !fs.existsSync(path.join(tool.skills, s.name, 'SKILL.md')));
    return { ok: !missing.length, detail: `${list.length - missing.length}/${list.length}` + (missing.length ? ` ขาด: ${missing.map((s) => s.name).join(', ')}` : '') };
  });
}

if (m.skills.claude) {
  const s = readJson(path.join(HOME, '.claude', 'settings.json'), {});
  const want = CLAUDE_HOOKS.filter(([, , , , on]) => on(cfg));
  check('Claude: hooks ลงทะเบียนครบ', () => {
    const got = want.filter(([ev, , script]) => JSON.stringify(s.hooks?.[ev] || []).includes(`${MARK}/core/${script}`));
    return { ok: got.length === want.length, detail: `${got.length}/${want.length}` };
  });
  const runHook = (script, payload) =>
    spawnSync(process.execPath, [path.join(DEST, 'core', script)], { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  check('Claude: hook ฉีดบริบท + กฎตามงาน', () => {
    const r = runHook('route-prompt.mjs', { prompt: 'แก้บั๊กปุ่มในหน้า dashboard', cwd: process.cwd() });
    return { ok: r.status === 0 && r.stdout.includes('<project-context>') && r.stdout.includes('<active-rules>'), detail: `exit ${r.status}` };
  });
  check('Claude: hook ตอนเริ่ม session', () => {
    const r = runHook('load-handoff.mjs', { source: 'startup', cwd: process.cwd() });
    return { ok: r.status === 0, detail: `exit ${r.status}` };
  });
  check('Claude: hook ก่อนย่อ context', () => {
    const r = runHook('pre-compact.mjs', { trigger: 'auto', cwd: process.cwd() });
    return { ok: r.status === 0, detail: `exit ${r.status}` };
  });
  check('Claude: ย่อ context อัตโนมัติ', () => ({ ok: s.autoCompactWindow === cfg.autoCompactWindow, detail: String(s.autoCompactWindow) }));
  check('Claude: เก็บ log', () => ({ ok: s.cleanupPeriodDays === cfg.cleanupPeriodDays, detail: `${s.cleanupPeriodDays} วัน` }));
  const installed = Object.keys(readJson(path.join(HOME, '.claude', 'plugins', 'installed_plugins.json'), {})?.plugins || {});
  for (const p of PLUGINS) {
    check(`Claude: plugin ${p.id}`, () => {
      if (installed.includes(p.id)) return { ok: true, detail: 'ติดตั้งแล้ว' };
      const declared = s.enabledPlugins?.[p.id] === true;
      return { ok: false, detail: declared ? 'ประกาศไว้แล้ว รอ Claude ติดตั้งตอนเปิดครั้งถัดไป' : 'ไม่มี' };
    });
  }
}

for (const tool of Object.values(t).filter((x) => x.mcp && m.skills[Object.keys(t).find((k) => t[k] === x)])) {
  check(`${tool.name}: MCP`, () => {
    const servers = readJson(tool.mcp.file, {})?.[tool.mcp.key] || {};
    const ok = tool.mcp.servers.filter((n) => {
      const c = servers[n];
      if (!c) return false;
      const target = c.command === 'node' ? c.args[0] : c.command;
      return fs.existsSync(target);
    });
    const miss = tool.mcp.servers.filter((n) => !ok.includes(n));
    return { ok: !miss.length, detail: `${ok.length}/${tool.mcp.servers.length}` + (miss.length ? ` ขาด: ${miss.join(', ')}` : '') };
  });
}

const w = Math.max(...rows.map((r) => r[1].length));
for (const [s, n, d] of rows) console.log(`${s}  ${n.padEnd(w)}  ${d}`);
console.log(`\nผ่าน ${pass} / ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
