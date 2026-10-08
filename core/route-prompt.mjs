#!/usr/bin/env node
// UserPromptSubmit hook — ฉีดบริบทโปรเจกต์ + กฎที่ตรงกับสิ่งที่ผู้ใช้เพิ่งพิมพ์
// ผลลัพธ์ทาง stdout จะถูกเติมเข้า context ของเทิร์นนั้น ผู้ใช้จึงไม่ต้องพิมพ์คำสั่งอะไรเลย

import fs from 'node:fs';
import path from 'node:path';
import { config, readStdinJson, projectContext, renderContextBlock, contextTokens, CORRECTION_RE, NOT_FROM_USER_RE, correctionTopic, learningDir, readLessons } from './lib.mjs';

const MAX_LESSONS_PER_TURN = 5;

// Above this the correction rate in our own transcripts was ~3x the 100k–300k band (2026-10-04 analysis).
const CONTEXT_LIMIT = Number(process.env.AGENT_ARRANGER_CONTEXT_LIMIT || config().autoCompactWindow);

const input = readStdinJson();
const prompt = String(input.prompt || '');
const cwd = input.cwd || process.cwd();

const INTENTS = [
  {
    id: 'ship',
    re: /\bpush\b|\bdeploy\b|\bcommit\b|\bmerge\b|\brelease\b|ขึ้น\s*prod|production|ปล่อยขึ้น|ส่งขึ้น/i,
    rules: [
      'ก่อน push/deploy: ตรวจ <project-context> ว่าบัญชีตรงกับเจ้าของ repo — ถ้า MISMATCH ให้สลับบัญชีก่อน',
      'ต้องรัน typecheck และ build ให้ผ่านก่อน แล้วยกผลรันมาแปะในรายงาน',
      'เทียบ environment variable ของปลายทางกับของเครื่องก่อนเสมอ',
      'ส่ง production URL ที่เสถียรให้ผู้ใช้ ไม่ใช่ preview URL',
    ],
  },
  {
    id: 'fix',
    re: /แก้|บั๊|บัค|พัง|ไม่ทำงาน|เพี้ยน|ผิดพลาด|error|\bbug\b|\bfix\b|\bbroken\b|ไม่ขึ้น|หาย/i,
    rules: [
      'นี่คืองานแก้บั๊ก: หาสาเหตุที่แท้จริงก่อน ห้ามเดาแล้วแก้ทันที',
      'เขียน test ที่ reproduce บั๊กให้ fail ก่อน แล้วค่อยแก้ให้ผ่าน',
      'ไล่ตารางข้อ 3.2 ให้ครบ — แก้ field ต้องดูทั้งหน้าเพิ่ม หน้าแก้ไข หน้าดู ตาราง ตัวกรอง export PDF type และ API',
      'รายงานว่าแต่ละจุดในตารางนั้น แตะหรือไม่แตะ เพราะอะไร',
    ],
  },
  {
    id: 'build',
    re: /เพิ่ม|สร้าง|ทำให้|ออกแบบ|ฟีเจอร์|\badd\b|\bcreate\b|\bbuild\b|\bimplement\b|\bfeature\b|\bnew\b/i,
    rules: [
      'นี่คืองานสร้างของใหม่: เขียนสมมติฐานและแผนสั้นๆ พร้อมวิธีตรวจของแต่ละขั้น ก่อนแตะโค้ด',
      'ถ้าตีความได้หลายแบบ ให้เสนอทุกแบบ อย่าเลือกเองเงียบๆ',
      'ใช้ component ที่มีอยู่แล้วในโปรเจกต์ ห้ามสร้างใหม่ซ้ำ',
    ],
  },
  {
    id: 'ui',
    re: /\bui\b|\bux\b|หน้าจอ|หน้าเว็บ|ปุ่ม|สวย|ดีไซน์|design|layout|\bcss\b|tailwind|สี|ฟอร์ม|\bform\b|ตาราง|\btable\b|dialog|modal|responsive|มือถือ|mobile|\bpage\b|component/i,
    rules: [
      'งานนี้แตะหน้าจอ: บังคับใช้กฎข้อ 5 ทุกข้อ (บันไดระยะห่าง/ตัวอักษร/เทา 4 ระดับ, พระเอกหนึ่งเดียว, ที่ว่างระหว่างกลุ่มมากกว่าภายในกลุ่ม)',
      'ห้ามบอกว่าเสร็จโดยไม่ได้เปิดดูของจริง — รัน dev server แล้วเปิดด้วย chrome-devtools MCP แคปที่ 1280 และ 375 แล้วไล่เช็กกับกฎ',
      'ถ้าเปิดดูไม่ได้ ให้บอกตรงๆ ว่าไม่ได้ดู',
    ],
  },
  {
    id: 'change-all',
    re: /ทุกจุด|ทุกหน้า|ทุกที่|ทั้งระบบ|ทั้งหมด|ให้ครบ|ไม่ครบ|เปลี่ยน.{0,12}(สี|ฟอนต์|ตัวอักษร|ข้อความ|ชื่อ|ไอคอน)|everywhere|all pages|\brename\b/i,
    rules: [
      'เปลี่ยนค่าเดียวกันหลายจุด: ก่อนแก้ ค้นค่าเดิม (class/hex/ข้อความ/ชื่อ) ทั้งโปรเจกต์ แล้วแปะจำนวน "ก่อน → หลัง" ในรายงาน — หลังแก้ต้องเหลือ 0 หรืออธิบายทุกจุดที่เหลือ ห้ามบอกว่าครบถ้าไม่มีตัวเลขนี้',
    ],
  },
  {
    id: 'db',
    re: /database|ฐานข้อมูล|supabase|migration|schema|\bsql\b|\bquery\b|ตารางข้อมูล|\brls\b|postgres/i,
    rules: [
      'งานนี้แตะฐานข้อมูล: ห้าม truncate/delete/ล้างตารางจริงเด็ดขาด ทำได้เฉพาะ insert/update ทีละรายการ',
      'เปลี่ยนข้อมูลแล้วต้องอ่านแถวกลับมาเทียบกับที่ตั้งใจ แล้วแสดงแถวนั้นในรายงาน',
      'ตอบหนึ่งหน้าจอด้วย query เดียว (CTE / window + FILTER / json_agg) การยิงหลาย query ขนานกันช้ากว่า',
    ],
  },
];

const ctx = projectContext(cwd);
const matched = INTENTS.filter((i) => i.re.test(prompt));

const out = [renderContextBlock(ctx)];

if (matched.length) {
  out.push('');
  out.push('<active-rules>');
  for (const m of matched) {
    for (const r of m.rules) out.push(`- ${r}`);
  }
  out.push('</active-rules>');
}

// Approved lessons whose tags match this prompt's intent (or 'any').
const intentIds = new Set([...matched.map((m) => m.id), 'any']);
const relevant = readLessons().filter((l) => l.tags.some((t) => intentIds.has(t)));
if (relevant.length) {
  out.push('');
  out.push('<lessons>');
  for (const l of relevant.slice(0, MAX_LESSONS_PER_TURN)) out.push(`- [${l.id}] ${l.text}`);
  if (relevant.length > MAX_LESSONS_PER_TURN) out.push(`(+${relevant.length - MAX_LESSONS_PER_TURN} บทเรียนที่ไม่ได้แสดง — ดูด้วย node ~/.agent-arranger/core/lessons.mjs list ถ้างานนี้เกี่ยว)`);
  out.push('</lessons>');
}

const used = contextTokens(input.transcript_path);

// A repeated correction: log it, and have the agent turn it into a lesson proposal after fixing.
if (CORRECTION_RE.test(prompt) && !NOT_FROM_USER_RE.test(prompt)) {
  try {
    fs.mkdirSync(learningDir(), { recursive: true });
    fs.appendFileSync(
      path.join(learningDir(), 'corrections.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), cwd, topic: correctionTopic(prompt), contextK: Math.round(used / 1000), snippet: prompt.replace(/\s+/g, ' ').slice(0, 200) }) + '\n'
    );
  } catch {
    // logging must never block the prompt
  }
  out.push('');
  out.push(
    '<repeat-correction>ผู้ใช้กำลังสั่งแก้เรื่องที่ควรถูกตั้งแต่แรก: แก้ให้ถูกและพิสูจน์ด้วยผลรันก่อน ' +
      'แล้วท้ายรายงานเสนอ "บทเรียนกันซ้ำ" 1 บรรทัด รูปแบบ: เมื่อ <เงื่อนไข> → ต้อง <ทำอะไร> → ตรวจด้วย <อะไร> พร้อม tag ' +
      '(ship|fix|build|ui|db|change-all|any) — บันทึกด้วย `node ~/.agent-arranger/core/lessons.mjs add --tags <tag> "<บทเรียน>"` หลังผู้ใช้อนุมัติเท่านั้น</repeat-correction>'
  );
}
// Claude Code auto-compacts as usage approaches autoCompactWindow (= CONTEXT_LIMIT in ~/.claude/settings.json).
// Well past it: if the session was compacted, context refilled faster than compaction helps — Claude Code's
// rapid-refill breaker then lets it grow to the model's 1M window, which the user allowed (2026-10-06).
// Never compacted means auto-compact is not running — say so instead of carrying on silently.
if (used > CONTEXT_LIMIT * 1.2) {
  const k = Math.round(used / 1000);
  let compacted = false;
  try { compacted = fs.readFileSync(input.transcript_path, 'utf8').includes('"subtype":"compact_boundary"'); } catch {}
  out.push('');
  out.push(compacted
    ? `<context-size>${k}k — ย่อแล้วแต่ context เต็มกลับเร็ว ระบบใช้เพดาน 1M ต่อ (ผู้ใช้อนุญาตแล้ว): ท้ายรายงานแจ้งผู้ใช้หนึ่งบรรทัดว่า ` +
        `context ${k}k ใช้เพดาน 1M อยู่ — ถ้าเกิดจากอ่านไฟล์/ผลลัพธ์ใหญ่ ให้แบ่งอ่านทีละส่วน</context-size>`
    : `<context-size>${k}k — เกิน ${CONTEXT_LIMIT / 1000}k แต่ยังไม่ถูกย่ออัตโนมัติ: ท้ายรายงานแจ้งผู้ใช้หนึ่งบรรทัดว่า ` +
        'การย่อ context อัตโนมัติอาจไม่ทำงาน ให้ตรวจ autoCompactWindow ใน ~/.claude/settings.json และ /config (Auto-compact ต้องเปิด)</context-size>');
}

out.push('');
out.push(
  '<always>รายงานแบบเลขาฯ CEO: คัดทิ้งก่อนเขียน รายงานเฉพาะ ข่าวร้าย / ยังไม่ได้ทำหรือไม่ได้ตรวจ / ผู้ใช้ต้องทำหรือตัดสินใจ / ' +
    'สิ่งที่จะเข้าใจผิดถ้าไม่บอก ห้ามรายงานไฟล์ที่แก้ จำนวนไฟล์ ผลเทสต์ทีละชุด commit skill ที่ใช้ ' +
    'รูปแบบ: บรรทัด **ผล** (+หลักฐานชิ้นเดียว) → bullet ไม่เกิน 3 ข้อ → หัวข้อ **เรื่องที่ต้องตัดสินใจ** + ตาราง ' +
    '(ข้อ | เรื่อง | ตัวเลือก | ผลกระทบ/ความเสี่ยง | แนะนำ) ไม่เกิน 3 แถว เฉพาะเมื่อมี ' +
    'ไม่เล่ากระบวนการ ตอบภาษาไทย โค้ดเป็นอังกฤษ ห้ามพูดว่าเสร็จโดยไม่มีผลรัน และห้าม fallback เงียบๆ</always>'
);

process.stdout.write(out.join('\n') + '\n');
process.exit(0);
