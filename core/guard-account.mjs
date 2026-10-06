#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) — บล็อกคำสั่งที่ออกนอกเครื่อง เมื่อบัญชีไม่ตรงกับเจ้าของ repo
// exit 2 = ปฏิเสธคำสั่ง และส่งข้อความใน stderr กลับให้โมเดลอ่าน

import path from 'node:path';
import { config, readStdinJson, projectContext } from './lib.mjs';

if (!config().guardAccount) process.exit(0); // opt-in: set guardAccount in ~/.agent-arranger/config.json

const input = readStdinJson();
const cmd = String(input?.tool_input?.command || '');

// hook ได้ cwd ของ session มา ไม่ใช่โฟลเดอร์ที่คำสั่งจะไปรันจริง
// `cd <repo อื่น> && git push` จึงต้องถูกตรวจกับ repo ปลายทาง ไม่ใช่ repo ที่เปิดอยู่
function effectiveCwd(command, sessionCwd) {
  const m = command.match(/(?:^|[\s;&|(])cd\s+("([^"]+)"|'([^']+)'|([^\s;&|)]+))/);
  if (!m) return sessionCwd;
  const target = m[2] ?? m[3] ?? m[4];
  if (!target || target === '-') return sessionCwd;
  return path.isAbsolute(target) ? target : path.resolve(sessionCwd, target);
}

const cwd = effectiveCwd(cmd, input.cwd || process.cwd());

// คำสั่งที่กระทบบัญชีภายนอก
const OUTBOUND = /(^|[\s;&|(])(git\s+push|git\s+remote\s+add|gh\s+(pr|repo|release|api)|vercel|supabase|npx\s+vercel|npx\s+supabase)\b/;

if (!OUTBOUND.test(cmd)) process.exit(0);

// คำสั่งอ่านอย่างเดียว ปล่อยผ่าน
if (/\b(gh\s+(auth\s+status|api\s+repos)|vercel\s+(env\s+ls|ls|whoami|inspect)|supabase\s+(projects\s+list|status))\b/.test(cmd)) {
  process.exit(0);
}

const ctx = projectContext(cwd);

if (ctx.mismatch) {
  process.stderr.write(
    [
      'บล็อกไว้: บัญชี gh ไม่ตรงกับที่ repo นี้ต้องใช้',
      '',
      `  repo           : ${ctx.git.owner}/${ctx.git.repo}`,
      `  บัญชีที่ต้องใช้ : ${ctx.expected}`,
      `  gh ที่ active  : ${ctx.gh.active}`,
      `  บัญชีที่มี      : ${ctx.gh.accounts.join(', ')}`,
      '',
      'รันคำสั่งนี้ก่อน แล้วค่อยลองใหม่:',
      `  gh auth switch --hostname github.com --user ${ctx.expected}`,
      '',
      'ถ้าตั้งใจใช้บัญชีอื่นจริงๆ ให้ถามผู้ใช้ยืนยันก่อน',
    ].join('\n')
  );
  process.exit(2);
}

if (/\bgit\s+push\b/.test(cmd) && !ctx.gh.active) {
  process.stderr.write('บล็อกไว้: หาบัญชี gh ที่ active ไม่เจอ ให้รัน `gh auth status` ตรวจก่อน push');
  process.exit(2);
}

process.exit(0);
