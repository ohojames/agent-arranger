#!/usr/bin/env node
// agent-arranger uninstaller — puts back everything install.mjs changed, using ~/.agent-arranger/manifest.json
//
//   node uninstall.mjs               remove agent-arranger completely
//   node uninstall.mjs --keep-data   keep learned lessons, baselines and config in ~/.agent-arranger

import fs from 'node:fs';
import path from 'node:path';
import { HOME, DEST, MARK, readJson, writeJson, loadManifest, manifestFile, removeBlock, copyDir, findClaude, run, tools } from './setup/common.mjs';
import { publishLessons } from './core/lib.mjs';

const keepData = process.argv.includes('--keep-data');
if (!fs.existsSync(manifestFile())) {
  console.log('ไม่พบการติดตั้ง agent-arranger ในเครื่องนี้ — ไม่มีอะไรต้องถอน');
  process.exit(0);
}
const m = loadManifest();
const done = [];

// Remove now-empty folders — only ones install.mjs created, never a folder the user already had.
const created = new Set(m.createdDirs || []);
function prune(dir) {
  while (created.has(dir) && fs.existsSync(dir) && !fs.readdirSync(dir).length) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}
const isEmptyJson = (j) => j && typeof j === 'object' && !Object.keys(j).length;
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : Array.isArray(v) ? v.map(sortKeys) : v);

// 1. Plugins and marketplaces we installed through the CLI
const claude = findClaude();
for (const id of m.plugins) {
  const r = claude ? run(claude, ['plugin', 'uninstall', id, '--scope', 'user']) : { ok: false };
  done.push(`plugin ${id}: ${r.ok ? 'ถอนแล้ว' : 'ถอนไม่ได้ — ถอนเองด้วย /plugin ในแอป'}`);
}
for (const name of m.marketplaces) if (claude) run(claude, ['plugin', 'marketplace', 'remove', name]);

// 2. Skills: remove ours, restore anything that was there before
const t = tools();
for (const [id, list] of Object.entries(m.skills)) {
  for (const { name, backedUp } of list) {
    const target = path.join(t[id].skills, name);
    fs.rmSync(target, { recursive: true, force: true });
    if (backedUp) copyDir(path.join(DEST, 'backups', 'skills', id, name), target);
  }
  done.push(`skills (${id}): ถอน ${list.length} ตัว, คืนของเดิม ${list.filter((s) => s.backedUp).length} ตัว`);
}

// 3. Rules blocks (lessons first — they sit beside the rules block)
for (const f of publishLessons([])) done.push(`บทเรียน: ${f}`);
for (const tool of Object.values(t)) if (removeBlock(tool.rules)) done.push(`กฎ: ${tool.rules}`);

// 4. Claude hooks (recognised by MARK) and every key we set, restored to its original value
const sf = path.join(HOME, '.claude', 'settings.json');
const s = readJson(sf);
if (s?.hooks) {
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].filter((g) => !JSON.stringify(g).includes(MARK));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  writeJson(sf, s);
  done.push('Claude hooks: ถอนแล้ว');
}
// restore in reverse so parent objects are handled after their children
for (const id of Object.keys(m.settings).reverse()) {
  const [file, keyPath] = id.split('::');
  const keys = keyPath.split('.');
  const prev = m.settings[id];
  const j = readJson(file, {});
  const parents = [j];
  let o = j;
  for (const k of keys.slice(0, -1)) {
    o = o[k] ??= {};
    parents.push(o);
  }
  if (prev.absent) delete o[keys.at(-1)];
  else o[keys.at(-1)] = prev.v;
  // drop containers we created that are now empty (e.g. enabledPlugins: {})
  for (let i = keys.length - 2; i >= 0; i--) if (isEmptyJson(parents[i + 1])) delete parents[i][keys[i]];
  writeJson(file, j);
}
if (Object.keys(m.settings).length) done.push(`ค่าตั้ง: คืนค่าเดิม ${Object.keys(m.settings).length} รายการ`);

// 5. Files that existed: if the content is back to the original, restore the original bytes (formatting).
//    Files and folders that did not exist before: delete if we left them empty.
for (const [file, info] of Object.entries(m.files)) {
  if (info.existed && info.backup && fs.existsSync(file) && fs.existsSync(info.backup)) {
    const now = fs.readFileSync(file, 'utf8');
    const orig = fs.readFileSync(info.backup, 'utf8');
    const back = now === orig || now.trim() === orig.trim() || (readJson(file) && sameJson(readJson(file), readJson(info.backup)));
    if (back) fs.copyFileSync(info.backup, file);
    continue;
  }
  if (info.existed || !fs.existsSync(file)) continue;
  if (info.dir) { prune(file); continue; }
  if (info.owned) { fs.rmSync(file); prune(path.dirname(file)); continue; }
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text || isEmptyJson(readJson(file))) {
    fs.rmSync(file);
    prune(path.dirname(file));
  }
}

// 6. The toolkit itself
if (keepData) {
  for (const d of ['core', 'rules', 'skills', 'skills-optional', 'knowledge', 'setup', 'node_modules', 'backups']) fs.rmSync(path.join(DEST, d), { recursive: true, force: true });
  for (const f of ['manifest.json', 'package.json', 'package-lock.json', 'doctor.mjs']) fs.rmSync(path.join(DEST, f), { force: true });
  done.push(`เก็บข้อมูลไว้ที่ ${DEST} (learning, baselines, config)`);
} else {
  fs.rmSync(DEST, { recursive: true, force: true });
  done.push(`ลบ ${DEST}`);
}

console.log('agent-arranger — ถอนการติดตั้งแล้ว\n');
for (const d of done) console.log('  ' + d);
console.log('\nเปิดแอป AI ใหม่หนึ่งครั้งเพื่อให้ค่าเดิมกลับมามีผล');
