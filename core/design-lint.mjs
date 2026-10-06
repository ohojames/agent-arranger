#!/usr/bin/env node
// ทำให้ "สวย" กลายเป็นเรื่องที่ตรวจด้วยเครื่องได้ แบบเดียวกับ tsc
//
// สแกนคลาส Tailwind ในไฟล์ .tsx/.jsx แล้วรายงานค่าที่อยู่นอกบันไดในกฎข้อ 5.1
// โหมด baseline: ของเดิมที่ผิดอยู่แล้วถูกจดไว้ครั้งแรก หลังจากนั้นบล็อกเฉพาะของใหม่
//
//   node design-lint.mjs [dir]           ตรวจ (exit 2 ถ้ามีของใหม่)
//   node design-lint.mjs --report        แสดงทั้งหมดแยกตามชนิด ไม่สนเส้นฐาน
//   node design-lint.mjs --rebaseline    จดเส้นฐานใหม่
//   node design-lint.mjs --status        ดูว่าเส้นฐานมีกี่รายการ
//
// ปิดได้ด้วย AGENT_ARRANGER_DESIGN_LINT=0

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.join(HERE, '..', 'baselines');

// ── บันไดค่าที่อนุญาต (กฎข้อ 5.1) ──
// ครึ่งขั้น (0.5 = 2px, 1.5 = 6px, 2.5 = 10px) อนุญาต เพราะเป็นการปรับละเอียด
// ภายใน component ที่มีเหตุผลรองรับ ส่วน 5 7 9 10 11 ไม่มี — มันคือการเดาเอา
const SPACE_OK = new Set([
  '0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '6', '8', '12', '16',
  'px', 'auto', 'full',
]);
const SPACE_PREFIX = 'p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y';
const TEXT_SIZE_OK = new Set(['xs', 'sm', 'base', 'lg', '2xl']);
const WEIGHT_OK = new Set(['normal', 'medium', 'semibold']);
const GRAY_OK = new Set(['text-gray-900', 'text-gray-500', 'border-gray-200', 'bg-gray-50', 'bg-white', 'text-white']);

const RULES = [
  {
    id: 'spacing',
    why: 'ระยะห่างใช้ได้แค่ 0 1 2 3 4 6 8 12 16',
    re: new RegExp(`^(?:${SPACE_PREFIX})-(.+)$`),
    bad: (m) => !SPACE_OK.has(m[1]),
  },
  {
    id: 'text-size',
    why: 'ขนาดตัวอักษรใช้ได้แค่ xs sm base lg 2xl',
    re: /^text-(md|xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[.+\])$/,
    bad: (m) => !TEXT_SIZE_OK.has(m[1]),
  },
  {
    id: 'font-weight',
    why: 'น้ำหนักตัวอักษรใช้ได้แค่ normal medium semibold',
    re: /^font-(thin|extralight|light|bold|extrabold|black|hairline)$/,
    bad: (m) => !WEIGHT_OK.has(m[1]),
  },
  {
    id: 'gray',
    why: 'เทาใช้ได้ 4 ระดับ: text-gray-900 / text-gray-500 / border-gray-200 / bg-gray-50',
    re: /^(?:text|bg|border)-(?:gray|slate|zinc|neutral|stone)-\d{2,3}$/,
    bad: (m) => !GRAY_OK.has(m[0]),
  },
  {
    id: 'shadow',
    why: 'เงาใช้ได้แค่ shadow-sm',
    re: /^shadow-(md|lg|xl|2xl)$/,
    bad: () => true,
  },
  {
    id: 'radius',
    why: 'ความโค้งใช้ rounded-md (หรือ rounded-full สำหรับ avatar/badge)',
    re: /^rounded-(none|sm|xl|2xl|3xl)$/,
    bad: () => true,
  },
];

const DATE_RE = /\.toLocaleDateString\s*\(|\.toLocaleString\s*\(\s*['"]th/;

function walk(dir, out = []) {
  const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage', '.serena']);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** ดึงเฉพาะเนื้อใน string literal — ลดโอกาสจับคำที่ไม่ใช่คลาส */
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

function scan(root) {
  const found = [];
  for (const file of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);

    lines.forEach((line, i) => {
      // วันที่: ต้องผ่าน formatDate กลาง ไม่เรียก toLocaleDateString ตรงๆ
      if (DATE_RE.test(line) && !rel.includes('lib/utils')) {
        found.push({ rel, line: i + 1, token: 'toLocaleDateString', rule: 'date', why: 'วันที่ต้องเรนเดอร์ผ่าน formatDate / formatDateTime' });
      }
      for (const sm of line.matchAll(STRING_RE)) {
        for (const raw of sm[2].split(/\s+/)) {
          const token = raw.replace(/^(?:hover|focus|active|disabled|group-hover|sm|md|lg|xl|2xl|dark|first|last|odd|even):/g, '');
          if (!token || token.length > 40) continue;
          for (const r of RULES) {
            const m = token.match(r.re);
            if (m && r.bad(m)) {
              found.push({ rel, line: i + 1, token, rule: r.id, why: r.why });
              break;
            }
          }
        }
      }
    });
  }
  return found;
}

// ลายเซ็นไม่รวมเลขบรรทัด เพื่อให้โค้ดที่เลื่อนบรรทัดไม่นับเป็นของใหม่
const sigOf = (v) => `${v.rel}|${v.rule}|${v.token}`;

const argv = process.argv.slice(2);
const root = path.resolve(argv.find((a) => !a.startsWith('--')) || process.cwd());

function baselineFile() {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const h = crypto.createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 12);
  return path.join(BASELINE_DIR, `design-${path.basename(root)}-${h}.json`);
}

if (!fs.existsSync(path.join(root, 'src'))) {
  process.exit(0); // ไม่ใช่โปรเจกต์ที่มี src ก็ไม่ต้องตรวจ
}

const bfile = baselineFile();

if (argv.includes('--status')) {
  if (!fs.existsSync(bfile)) console.log(`ยังไม่มีเส้นฐาน design สำหรับ ${root}`);
  else {
    const b = JSON.parse(fs.readFileSync(bfile, 'utf8'));
    console.log(`เส้นฐาน design ของ ${root}\n  จดไว้เมื่อ : ${b.createdAt}\n  ของเดิม   : ${b.signatures.length} รายการ`);
  }
  process.exit(0);
}

const found = scan(root);

if (argv.includes('--report')) {
  const byRule = {};
  for (const v of found) (byRule[v.rule] ||= []).push(v);
  console.log(`พบทั้งหมด ${found.length} จุด ใน ${new Set(found.map((v) => v.rel)).size} ไฟล์\n`);
  for (const [rule, vs] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
    const tokens = {};
    for (const v of vs) tokens[v.token] = (tokens[v.token] || 0) + 1;
    const top = Object.entries(tokens).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t}×${n}`);
    console.log(`${String(vs.length).padStart(4)}  ${rule.padEnd(12)} ${top.join('  ')}`);
    console.log(`      ${vs[0].why}`);
  }
  process.exit(0);
}

if (argv.includes('--rebaseline') || !fs.existsSync(bfile)) {
  const sigs = [...new Set(found.map(sigOf))];
  fs.writeFileSync(bfile, JSON.stringify({ root, createdAt: new Date().toISOString(), signatures: sigs }, null, 1));
  console.log(`จดเส้นฐาน design แล้ว: ของเดิม ${sigs.length} รายการ`);
  process.exit(0);
}

if (process.env.AGENT_ARRANGER_DESIGN_LINT === '0' || !config().designRules) process.exit(0);

const baseline = new Set(JSON.parse(fs.readFileSync(bfile, 'utf8')).signatures);
const fresh = found.filter((v) => !baseline.has(sigOf(v)));

if (!fresh.length) process.exit(0);

const shown = fresh.slice(0, 20);
process.stderr.write(
  [
    `ผิดกฎการออกแบบ ${fresh.length} จุดที่ไม่ได้อยู่ในเส้นฐานเดิม`,
    '',
    ...shown.map((v) => `${v.rel}:${v.line}  ${v.token}  — ${v.why}`),
    fresh.length > shown.length ? `... อีก ${fresh.length - shown.length} จุด` : '',
    '',
    'แก้ให้อยู่ในบันไดค่าก่อน (กฎข้อ 5.1) แล้วค่อยสรุปผล',
  ].filter((l) => l !== '').join('\n')
);
process.exit(2);
