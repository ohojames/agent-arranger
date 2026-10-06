#!/usr/bin/env node
// SessionStart hook.
// - Every start: export this project's chats to .claude/history/ so nothing typed is ever lost.
// - After auto-compact (or /compact): nothing else — the summary is already in context.
//   .claude/handoff.md is written only by the ai-proceed skill, never by a hook (user's choice, 2026-10-06).
// - New chat / resume: load .claude/handoff.md if it is recent; a stale note would mislead.

import fs from 'node:fs';
import path from 'node:path';
import { readStdinJson, handoffFile, historyDir } from './lib.mjs';
import { exportHistory } from './export-history.mjs';

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

if (input.source === 'compact') process.exit(0);

try {
  const st = fs.statSync(file);
  const ageDays = (Date.now() - st.mtimeMs) / 864e5;
  if (input.source === 'clear' || ageDays <= MAX_AGE_DAYS) {
    const text = fs.readFileSync(file, 'utf8').slice(0, MAX_CHARS);
    const updated = new Date(st.mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
    process.stdout.write(
      `<handoff file="${file}" updated="${updated}">\n${text.trim()}\n</handoff>\n` +
        'บันทึกนี้เขียนโดย /ai-proceed ครั้งล่าสุดของโปรเจกต์นี้ — ใช้เป็นจุดเริ่ม แต่ตรวจสถานะจริงของโค้ด/git ก่อนเชื่อ\n'
    );
  }
} catch {
  // no handoff note for this project — nothing to load
}
process.exit(0);
