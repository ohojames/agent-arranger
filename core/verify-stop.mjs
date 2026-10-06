#!/usr/bin/env node
// Stop hook — กันการบอกว่า "เสร็จ" ทั้งที่ยัง typecheck ไม่ผ่าน
//
// โหมด baseline: โปรเจกต์ที่มี type error ค้างอยู่เดิม จะถูกจดไว้เป็นเส้นฐานครั้งแรก
// หลังจากนั้น hook จะบล็อกเฉพาะ error ที่ "เพิ่งเกิดใหม่" เท่านั้น
//
// ใช้มือ:  node verify-stop.mjs --rebaseline   (จดเส้นฐานใหม่ในโปรเจกต์ปัจจุบัน)
//          node verify-stop.mjs --status       (ดูว่าเส้นฐานมีกี่รายการ)
// ปิด:     ตั้ง AGENT_ARRANGER_STOP_TYPECHECK=0

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readStdinJson, gitInfo } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.join(HERE, '..', 'baselines');

const argv = process.argv.slice(2);
const manual = argv.includes('--rebaseline') || argv.includes('--status');
const input = manual ? {} : readStdinJson();

if (!manual) {
  if (input.stop_hook_active) process.exit(0); // กัน loop
  if (process.env.AGENT_ARRANGER_STOP_TYPECHECK === '0') process.exit(0);
}

const cwd = input.cwd || process.cwd();
const root = gitInfo(cwd)?.root || cwd;
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function baselineFile() {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const h = crypto.createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 12);
  return path.join(BASELINE_DIR, `${path.basename(root)}-${h}.json`);
}

function bail(msg) {
  if (manual) process.stdout.write(msg + '\n');
  process.exit(0);
}

if (!fs.existsSync(path.join(root, 'tsconfig.json'))) bail('ข้าม: ไม่ใช่โปรเจกต์ TypeScript');
if (!fs.existsSync(tsc)) bail('ข้าม: ไม่พบ typescript ใน node_modules');

// hook mode: รันเฉพาะเมื่อมีไฟล์ .ts/.tsx ค้างอยู่ใน working tree
if (!manual) {
  let changed = [];
  try {
    changed = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
      .filter((f) => /\.(ts|tsx)$/.test(f));
  } catch {
    process.exit(0);
  }
  if (!changed.length) process.exit(0);

  // ถ้าสถานะไฟล์ไม่เปลี่ยนจากรอบที่ตรวจผ่านไปแล้ว ไม่ต้องรันซ้ำ
  const sig = crypto
    .createHash('sha1')
    .update(
      changed
        .map((f) => {
          try {
            return f + ':' + fs.statSync(path.join(root, f)).mtimeMs;
          } catch {
            return f + ':missing';
          }
        })
        .join('|')
    )
    .digest('hex');
  const cacheFile = path.join(
    os.tmpdir(),
    'agent-arranger-tsc-' + crypto.createHash('sha1').update(root).digest('hex').slice(0, 12) + '.txt'
  );
  try {
    if (fs.readFileSync(cacheFile, 'utf8').trim() === sig) process.exit(0);
  } catch {
    /* ยังไม่เคยตรวจ */
  }
  globalThis.__cacheFile = cacheFile;
  globalThis.__sig = sig;
}

function runTsc() {
  // `--incremental false` is not optional. A tsconfig with `incremental: true`
  // makes tsc report only the files it re-checked, so the error count shrinks on
  // every repeat run and a gate built on that number can never fail.
  // It also leaves the project's own tsconfig.tsbuildinfo untouched.
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '--incremental', 'false'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
      windowsHide: true,
    });
    return [];
  } catch (e) {
    return parse(((e.stdout || '') + (e.stderr || '')).trim());
  }
}

const ERR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

function parse(out) {
  const errors = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(ERR_RE);
    if (m) {
      errors.push({
        file: m[1].replace(/\\/g, '/'),
        line: Number(m[2]),
        code: m[4],
        message: m[5],
        display: line,
      });
    } else if (line.trim() && errors.length && /^\s/.test(line)) {
      errors[errors.length - 1].display += '\n' + line;
    }
  }
  return errors;
}

// ลายเซ็นไม่รวมเลขบรรทัด เพื่อให้ error เดิมที่เลื่อนบรรทัดยังนับเป็นตัวเดิม
const sigOf = (e) => `${e.file}|${e.code}|${e.message.slice(0, 200)}`;

const bfile = baselineFile();

if (argv.includes('--status')) {
  if (!fs.existsSync(bfile)) {
    process.stdout.write(`ยังไม่มีเส้นฐานสำหรับ ${root}\n`);
  } else {
    const b = JSON.parse(fs.readFileSync(bfile, 'utf8'));
    process.stdout.write(`เส้นฐานของ ${root}\n  จดไว้เมื่อ : ${b.createdAt}\n  error เดิม : ${b.signatures.length} รายการ\n  ไฟล์       : ${bfile}\n`);
  }
  process.exit(0);
}

const errors = runTsc();

if (argv.includes('--rebaseline')) {
  fs.writeFileSync(
    bfile,
    JSON.stringify({ root, createdAt: new Date().toISOString(), signatures: [...new Set(errors.map(sigOf))] }, null, 1)
  );
  process.stdout.write(`จดเส้นฐานใหม่แล้ว: error เดิม ${new Set(errors.map(sigOf)).size} รายการ\n  ${bfile}\n`);
  process.exit(0);
}

// ยังไม่มีเส้นฐาน -> จดครั้งแรก แล้วปล่อยผ่าน
if (!fs.existsSync(bfile)) {
  fs.writeFileSync(
    bfile,
    JSON.stringify({ root, createdAt: new Date().toISOString(), signatures: [...new Set(errors.map(sigOf))] }, null, 1)
  );
  process.exit(0);
}

const baseline = new Set(JSON.parse(fs.readFileSync(bfile, 'utf8')).signatures);
const fresh = errors.filter((e) => !baseline.has(sigOf(e)));

if (!fresh.length) {
  if (globalThis.__cacheFile) {
    try {
      fs.writeFileSync(globalThis.__cacheFile, globalThis.__sig);
    } catch {
      /* ไม่สำคัญ */
    }
  }
  process.exit(0);
}

const shown = fresh.slice(0, 25);
process.stderr.write(
  [
    `ยังบอกว่าเสร็จไม่ได้ — มี type error ใหม่ ${fresh.length} จุดที่ไม่ได้อยู่ในเส้นฐานเดิม`,
    '',
    shown.map((e) => e.display).join('\n'),
    fresh.length > shown.length ? `\n... อีก ${fresh.length - shown.length} จุด` : '',
    '',
    'แก้ให้หมดก่อน แล้วค่อยสรุปผล',
    'ถ้ามั่นใจว่าไม่ได้เกิดจากสิ่งที่เพิ่งแก้ ให้บอกผู้ใช้ตรงๆ อย่าเงียบ',
  ].join('\n')
);
process.exit(2);
