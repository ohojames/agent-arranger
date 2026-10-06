#!/usr/bin/env node
// Maintainer check: does the repo carry everything a reference machine runs in Claude Code?
// Run it on the machine whose setup the team should get:   node tools/parity.mjs
// Exit 1 when something on the machine is missing from the repo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO, PLUGINS, MCP, CLAUDE_HOOKS, readJson, dirHash } from '../setup/common.mjs';

const HOME = os.homedir();
// Shipped another way, with the reason — anything not here and not in the repo counts as missing.
const COVERED = {
  docx: 'licence is proprietary — the same skill arrives with the document-skills plugin',
};
// Settings that are personal UI preferences, not tooling.
const PERSONAL_SETTINGS = new Set(['skipWorkflowUsageWarning', 'agentPushNotifEnabled', 'switchModelsOnFlag', 'theme', 'model']);

const rows = [];
let missing = 0;
function row(kind, onMachine, inRepo, gaps, note = '') {
  missing += gaps.length;
  rows.push([kind, String(onMachine), String(inRepo), gaps.length ? `ขาด: ${gaps.join(', ')}` : note || 'ครบ']);
}

const machineSkills = fs.readdirSync(path.join(HOME, '.claude', 'skills')).filter((n) => fs.existsSync(path.join(HOME, '.claude', 'skills', n, 'SKILL.md')));
const repoSkills = fs.readdirSync(path.join(REPO, 'skills'));
const skillGaps = machineSkills.filter((n) => !repoSkills.includes(n) && !COVERED[n]);
row('skills', machineSkills.length, repoSkills.length, skillGaps, Object.keys(COVERED).map((k) => `${k}: ${COVERED[k]}`).join('; '));
const drift = machineSkills.filter((n) => repoSkills.includes(n) && dirHash(path.join(HOME, '.claude', 'skills', n)) !== dirHash(path.join(REPO, 'skills', n)));

const machinePlugins = Object.keys(readJson(path.join(HOME, '.claude', 'plugins', 'installed_plugins.json'), {})?.plugins || {});
row('plugins', machinePlugins.length, PLUGINS.length, machinePlugins.filter((id) => !PLUGINS.some((p) => p.id === id)));

const machineMcp = Object.keys(readJson(path.join(HOME, '.claude.json'), {})?.mcpServers || {});
row('MCP servers', machineMcp.length, Object.keys(MCP).length, machineMcp.filter((n) => !(n in MCP)));

const settings = readJson(path.join(HOME, '.claude', 'settings.json'), {});
const hookScripts = [...JSON.stringify(settings.hooks || {}).matchAll(/([\w-]+)\.mjs/g)].map((x) => x[1] + '.mjs');
const repoHooks = CLAUDE_HOOKS.map((h) => h[2]);
const uniqHooks = [...new Set(hookScripts)];
row('hooks', uniqHooks.length, repoHooks.length, uniqHooks.filter((s) => !repoHooks.includes(s)));

const handled = new Set(['hooks', 'enabledPlugins', 'extraKnownMarketplaces', 'autoCompactWindow', 'cleanupPeriodDays']);
const keys = Object.keys(settings);
const personal = keys.filter((k) => PERSONAL_SETTINGS.has(k));
row('settings', keys.length, handled.size, keys.filter((k) => !handled.has(k) && !PERSONAL_SETTINGS.has(k)), personal.length ? `ค่าส่วนตัวไม่ย้าย: ${personal.join(', ')}` : '');

const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length), 12));
console.log(`${'ชนิด'.padEnd(w[0])}  ${'เครื่องนี้'.padEnd(w[1])}  ${'ใน repo'.padEnd(w[2])}  ผล`);
for (const r of rows) console.log(`${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`);
if (drift.length) console.log(`\nskill ที่เนื้อหาต่างจาก repo (${drift.length}): ${drift.join(', ')}`);
console.log(missing ? `\nไม่ครบ: ขาด ${missing} รายการ` : '\nครบ 100%');
process.exit(missing ? 1 : 0);
