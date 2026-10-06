#!/usr/bin/env node
// git pre-commit — ด่านที่จับได้แม้ตอนคุณ commit เอง ไม่ใช่แค่ตอน AI ทำงาน
// ต้องเร็ว (< 2 วินาที) ไม่งั้นคนจะข้ามมัน — typecheck เต็มอยู่ที่ Stop hook และ deploy gate
//
// ข้ามได้ด้วย: git commit --no-verify

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACM']).split(/\r?\n/).filter(Boolean);
if (!staged.length) process.exit(0);

const problems = [];

// ── 1. ความลับที่หลุดเข้า commit ──
const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'OpenAI/OpenRouter key'],
  [/\bsk_live_[A-Za-z0-9]{20,}/, 'Stripe live key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bpostgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/, 'Postgres URL ที่มีรหัสผ่าน'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, 'JWT'],
  [/SERVICE_ROLE_KEY\s*=\s*["']?ey/, 'Supabase service role key'],
];

const ENV_OK = /(^|\/)(\.env\.example|\.env\.sample)$/;
const diff = git(['diff', '--cached', '-U0']);
for (const line of diff.split(/\r?\n/)) {
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  for (const [re, what] of SECRETS) {
    if (re.test(line)) {
      problems.push(`ความลับหลุดเข้า commit: ${what}`);
      break;
    }
  }
}

// ── 2. ไฟล์ .env ที่ไม่ควร commit ──
for (const f of staged) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !ENV_OK.test(f)) {
    problems.push(`ห้าม commit ไฟล์ environment: ${f}`);
  }
}

// ── 3. กฎการออกแบบ (เฉพาะเมื่อแตะไฟล์หน้าจอ) ──
if (staged.some((f) => /\.(tsx|jsx)$/.test(f))) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'design-lint.mjs')], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  if (r.status === 2) {
    problems.push((r.stderr || '').trim());
  }
}

if (!problems.length) process.exit(0);

process.stderr.write(
  ['', 'pre-commit บล็อกไว้', '', ...problems.map((p) => '  ' + p.replace(/\n/g, '\n  ')), '', 'ถ้าจำเป็นต้องข้ามจริงๆ: git commit --no-verify', ''].join('\n')
);
process.exit(1);
