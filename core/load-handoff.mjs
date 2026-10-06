#!/usr/bin/env node
// SessionStart hook.
// - Every start: export this project's chats to .claude/history/ so nothing typed is ever lost.
// - After auto-compact (or /compact): copy the summary's "## Handoff" section into .claude/handoff.md,
//   archiving the previous note under .claude/history/handoff/. Nothing is printed — the summary is
//   already in context. The note exists for a NEW chat, another AI tool, or a teammate.
// - New chat / resume: load .claude/handoff.md if it is recent; a stale note would mislead.

import fs from 'node:fs';
import path from 'node:path';
import { readStdinJson, handoffFile, historyDir } from './lib.mjs';
import { exportHistory, latestCompactSummary } from './export-history.mjs';

const MAX_AGE_DAYS = 14;
const MAX_CHARS = 12_000;

const input = readStdinJson();
const cwd = input.cwd || process.cwd();
const file = handoffFile(cwd);

if (input.transcript_path) {
  try {
    exportHistory(path.dirname(input.transcript_path), historyDir(cwd));
  } catch (err) {
    process.stdout.write(`<history-export-failed>${err.message}</history-export-failed>\n`);
  }
}

if (input.source === 'compact') {
  try {
    writeNoteFromSummary(input.transcript_path);
  } catch (err) {
    process.stdout.write(`<handoff-write-failed>${err.message}</handoff-write-failed>\n`);
  }
  process.exit(0);
}

try {
  const st = fs.statSync(file);
  const ageDays = (Date.now() - st.mtimeMs) / 864e5;
  if (input.source === 'clear' || ageDays <= MAX_AGE_DAYS) {
    const text = fs.readFileSync(file, 'utf8').slice(0, MAX_CHARS);
    const updated = new Date(st.mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
    process.stdout.write(
      `<handoff file="${file}" updated="${updated}">\n${text.trim()}\n</handoff>\n` +
        'บันทึกนี้มาจากการย่อ context ครั้งล่าสุดของโปรเจกต์นี้ — ใช้เป็นจุดเริ่ม แต่ตรวจสถานะจริงของโค้ด/git ก่อนเชื่อ\n'
    );
  }
} catch {
  // no handoff note for this project — nothing to load
}
process.exit(0);

function writeNoteFromSummary(transcriptPath) {
  if (!transcriptPath) return;
  const summary = latestCompactSummary(fs.readFileSync(transcriptPath, 'utf8'));
  if (!summary?.text) return;
  const stamp = `<!-- compact-summary: ${summary.ts} -->`;
  let old = '';
  try { old = fs.readFileSync(file, 'utf8'); } catch {}
  if (old.includes(stamp)) return; // this summary was already written

  const i = summary.text.search(/^## Handoff\s*$/m);
  const body = i >= 0
    ? summary.text.slice(i).replace(/^## Handoff\s*\n/, '').trim()
    : `> ไม่พบหัวข้อ ## Handoff ในสรุป — เก็บสรุปทั้งก้อนแทน\n\n${summary.text}`;
  const when = summary.ts.replace('T', ' ').slice(0, 16);

  if (old) {
    const dir = path.join(historyDir(cwd), 'handoff');
    fs.mkdirSync(dir, { recursive: true });
    const t = new Date(fs.statSync(file).mtimeMs).toISOString().slice(0, 19).replace(/[T:]/g, '-');
    fs.writeFileSync(path.join(dir, `${t}.md`), old, 'utf8');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${stamp}\n# Handoff — ${path.basename(path.dirname(path.dirname(file)))} — ${when}\n\n${body}\n`, 'utf8');
}
