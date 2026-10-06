#!/usr/bin/env node
// ติดตั้ง git pre-commit hook ลงโปรเจกต์
//
//   node install-git-hooks.mjs                  โปรเจกต์ปัจจุบัน
//   node install-git-hooks.mjs --project <dir>
//   node install-git-hooks.mjs --scan <dir>     ทุก repo ใต้ <dir>
//   node install-git-hooks.mjs --list <dir>     ดูว่า repo ไหนติดตั้งแล้ว

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARK = '# agent-arranger pre-commit';
const BODY = `#!/bin/sh
${MARK}
exec node "${path.join(HERE, 'pre-commit.mjs').replace(/\\/g, '/')}"
`;

function install(dir) {
  const hooksDir = path.join(dir, '.git', 'hooks');
  if (!fs.existsSync(path.join(dir, '.git'))) return 'ไม่ใช่ git repo';
  fs.mkdirSync(hooksDir, { recursive: true });
  const f = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(f)) {
    const cur = fs.readFileSync(f, 'utf8');
    if (!cur.includes(MARK)) {
      // มี hook ของโปรเจกต์อยู่แล้ว ห้ามเขียนทับ
      return 'ข้าม: มี pre-commit ของโปรเจกต์อยู่แล้ว';
    }
  }
  fs.writeFileSync(f, BODY);
  try {
    fs.chmodSync(f, 0o755);
  } catch {
    /* Windows ไม่ต้องใช้ */
  }
  return 'ติดตั้งแล้ว';
}

const SKIP = new Set(['node_modules', '.next', 'dist', 'build', 'out', 'coverage', 'vendor', '.turbo']);
function findRepos(root, depth, acc = []) {
  if (depth < 0) return acc;
  let e;
  try {
    e = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  if (e.some((x) => x.isDirectory() && x.name === '.git')) {
    acc.push(root);
    return acc;
  }
  for (const x of e) {
    if (x.isDirectory() && !SKIP.has(x.name) && !x.name.startsWith('.')) findRepos(path.join(root, x.name), depth - 1, acc);
  }
  return acc;
}

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};

const scan = flag('--scan');
const list = flag('--list');

if (list) {
  for (const r of findRepos(path.resolve(list), 3)) {
    const f = path.join(r, '.git', 'hooks', 'pre-commit');
    const ok = fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(MARK);
    console.log(`${ok ? 'ติดตั้งแล้ว' : 'ยังไม่มี   '}  ${r}`);
  }
  process.exit(0);
}

if (scan) {
  const repos = findRepos(path.resolve(scan), 3);
  console.log(`พบ ${repos.length} repo ใต้ ${scan}`);
  const tally = {};
  for (const r of repos) {
    const res = install(r);
    tally[res] = (tally[res] || 0) + 1;
    if (res !== 'ติดตั้งแล้ว') console.log(`  ${res}: ${r}`);
  }
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v} repo`);
  process.exit(0);
}

const dir = path.resolve(flag('--project') || process.cwd());
console.log(`${install(dir)}  ${dir}`);
