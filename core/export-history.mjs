#!/usr/bin/env node
// Keep every chat readable after /clear: convert each session transcript (.jsonl) of a project
// into Markdown under <project>/.claude/history/ — every user message plus Claude's text replies.
// Tool calls are listed by name only. A file is rewritten only when its transcript is newer.
//
// CLI: node export-history.mjs <transcripts-dir> <out-dir>   → prints JSON per exported session
// Called by pre-compact.mjs before every compaction and by load-handoff.mjs on every SessionStart.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const textOf = (c) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';

export function transcriptToMarkdown(jsonlText, id) {
  const parts = [];
  let users = 0;
  let lastRole = '';
  let first = '';
  for (const line of jsonlText.split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain || e.isMeta) continue;
    const ts = (e.timestamp || '').replace('T', ' ').slice(0, 16);
    // a message typed while Claude was still working is stored as a queued_command attachment
    const queued = e.type === 'attachment' && e.attachment?.type === 'queued_command' && e.attachment.origin?.kind === 'human';
    if (queued && typeof e.attachment.prompt === 'string' && e.attachment.prompt.trim()) {
      first ||= ts;
      users++;
      lastRole = 'user';
      parts.push(`\n---\n\n### 🧑 ผู้ใช้ (พิมพ์ระหว่างที่ Claude ทำงาน) — ${ts}\n\n${e.attachment.prompt.trim()}\n`);
      continue;
    }
    if (e.type === 'system' && e.subtype === 'compact_boundary') {
      const how = e.compactMetadata?.trigger === 'manual' ? 'สั่งด้วย /compact' : 'อัตโนมัติ';
      parts.push(`\n---\n\n> 🗜️ ${ts} — ระบบย่อ context ${how} (ข้อความข้างบนยังอยู่ครบในไฟล์นี้)\n`);
      lastRole = '';
      continue;
    }
    if (!e.message || e.isCompactSummary) continue; // the summary is written by Claude Code, not typed
    if (e.type === 'user') {
      const c = e.message.content;
      if (Array.isArray(c) && c.length && c.every((b) => b.type === 'tool_result')) continue;
      let t = textOf(c).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
      if (/^<(local-command|task-notification|agent-message)/.test(t)) continue; // machine-sent, not typed
      const cmd = t.match(/<command-name>(.*?)<\/command-name>/);
      const args = t.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1].trim();
      if (cmd) t = `\`${cmd[1]}\`` + (args ? ` ${args}` : '');
      if (!t) continue;
      first ||= ts;
      users++;
      lastRole = 'user';
      parts.push(`\n---\n\n### 🧑 ผู้ใช้ — ${ts}\n\n${t}\n`);
    } else if (e.type === 'assistant') {
      const c = e.message.content || [];
      const t = textOf(c).trim();
      const tools = Array.isArray(c) ? c.filter((b) => b.type === 'tool_use').map((b) => b.name) : [];
      if (t) {
        if (lastRole !== 'assistant') parts.push(`\n### 🤖 Claude — ${ts}\n`);
        parts.push(`\n${t}\n`);
        lastRole = 'assistant';
      }
      if (tools.length) parts.push(`\n> เครื่องมือ: ${tools.join(', ')}\n`);
    }
  }
  const header = `# ประวัติแชท — session ${id}\n\nข้อความผู้ใช้ ${users} ข้อความ · สร้างจาก transcript อัตโนมัติ ห้ามแก้ด้วยมือ\n`;
  return { markdown: header + parts.join(''), users, first };
}

// The text of the newest compact summary in a transcript, or null when the session was never compacted.
export function latestCompactSummary(jsonlText) {
  let found = null;
  for (const line of jsonlText.split('\n')) {
    if (!line.includes('"isCompactSummary":true')) continue;
    try {
      const e = JSON.parse(line);
      found = { text: textOf(e.message?.content).trim(), ts: e.timestamp || '' };
    } catch {}
  }
  return found;
}

export function exportHistory(transcriptsDir, outDir) {
  const results = [];
  let files;
  try { files = fs.readdirSync(transcriptsDir).filter((f) => f.endsWith('.jsonl')); } catch { return results; }
  fs.mkdirSync(outDir, { recursive: true });
  const existing = fs.readdirSync(outDir);
  for (const f of files) {
    const id = f.slice(0, -'.jsonl'.length);
    const src = path.join(transcriptsDir, f);
    const srcTime = fs.statSync(src).mtimeMs;
    const prev = existing.find((n) => n.endsWith(`_${id}.md`));
    if (prev && fs.statSync(path.join(outDir, prev)).mtimeMs >= srcTime) continue;
    const { markdown, users, first } = transcriptToMarkdown(fs.readFileSync(src, 'utf8'), id);
    if (!users) continue;
    const name = `${first.slice(0, 10) || 'undated'}_${id}.md`;
    if (prev && prev !== name) fs.rmSync(path.join(outDir, prev));
    fs.writeFileSync(path.join(outDir, name), markdown, 'utf8');
    results.push({ file: path.join(outDir, name), users });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , dir, out] = process.argv;
  if (!dir || !out) {
    console.error('usage: node export-history.mjs <transcripts-dir> <out-dir>');
    process.exit(2);
  }
  console.log(JSON.stringify(exportHistory(dir, out)));
}
