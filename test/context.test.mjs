// node --test ~/.agent-arranger/test/  — context-size notice, count-proof rule, handoff loader
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');
// isolate the learning log so tests never write into the real one
const hook = (file, input) => spawnSync(process.execPath, [path.join(BIN, file)], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, AGENT_ARRANGER_LEARNING_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'learn-')) } });

function transcript(contextTokens) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'));
  const f = path.join(dir, 't.jsonl');
  const usage = { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: contextTokens - 1010, output_tokens: 50 };
  fs.writeFileSync(f, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage: { input_tokens: 5, cache_read_input_tokens: 999 } } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }),
  ].join('\n') + '\n');
  return { dir, f };
}

test('contextTokens reads the last assistant usage', async () => {
  const { contextTokens } = await import(pathToFileURL(path.join(BIN, 'lib.mjs')).href);
  assert.equal(contextTokens(transcript(350_000).f), 350_000);
  assert.equal(contextTokens(path.join(os.tmpdir(), 'missing.jsonl')), 0);
});

test('route-prompt: warns only when auto-compact (300k) clearly did not run, never offers /handoff', () => {
  const stuck = transcript(400_000);
  const out = hook('route-prompt.mjs', { prompt: 'ทำต่อ', cwd: stuck.dir, transcript_path: stuck.f }).stdout;
  assert.match(out, /<context-size>400k/);
  assert.match(out, /autoCompactWindow/);
  assert.doesNotMatch(out, /handoff/);
  const near = transcript(350_000); // auto-compact fires as usage approaches the window — not stuck yet
  assert.doesNotMatch(hook('route-prompt.mjs', { prompt: 'ทำต่อ', cwd: near.dir, transcript_path: near.f }).stdout, /context-size/);
});

test('route-prompt: already compacted but still large → the allowed 1M ceiling, not a settings alarm', () => {
  const big = transcript(500_000);
  fs.appendFileSync(big.f, JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } }) + '\n');
  const out = hook('route-prompt.mjs', { prompt: 'ทำต่อ', cwd: big.dir, transcript_path: big.f }).stdout;
  assert.match(out, /<context-size>500k/);
  assert.match(out, /1M/);
  assert.doesNotMatch(out, /autoCompactWindow/);
});

test('route-prompt: count-proof rule for changing a value everywhere', () => {
  const { dir, f } = transcript(10_000);
  const out = hook('route-prompt.mjs', { prompt: 'เปลี่ยนสีตัวอักษรหัวตารางเป็นสีน้ำเงินทุกหน้า', cwd: dir, transcript_path: f }).stdout;
  assert.match(out, /ก่อน → หลัง/);
});

test('load-handoff: loads after /clear, skips stale file at startup, silent when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ho-'));
  assert.equal(hook('load-handoff.mjs', { source: 'clear', cwd: dir }).stdout.trim(), '');
  const file = path.join(dir, '.claude', 'handoff.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# Handoff\nเป้าหมาย: ทดสอบ\n');
  const cleared = hook('load-handoff.mjs', { source: 'clear', cwd: dir });
  assert.equal(cleared.status, 0);
  assert.match(cleared.stdout, /<handoff[^>]*>[\s\S]*เป้าหมาย: ทดสอบ[\s\S]*<\/handoff>/);
  const old = new Date(Date.now() - 20 * 864e5);
  fs.utimesSync(file, old, old);
  assert.equal(hook('load-handoff.mjs', { source: 'startup', cwd: dir }).stdout.trim(), '');
  assert.doesNotMatch(hook('load-handoff.mjs', { source: 'compact', cwd: dir }).stdout, /เป้าหมาย: ทดสอบ/, 'after compact the summary is already in context');
});

test('load-handoff: exports every earlier chat to .claude/history after /clear, last turn included', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  const line = (type, content, ts) => JSON.stringify({ type, timestamp: ts, message: { role: type, content } });
  fs.writeFileSync(path.join(tdir, 'old-session.jsonl'), [
    line('user', 'สั่งงานข้อแรก', '2026-10-04T02:00:00Z'),
    line('assistant', [{ type: 'text', text: 'รับทราบ' }, { type: 'tool_use', name: 'Bash' }], '2026-10-04T02:01:00Z'),
    line('user', [{ type: 'tool_result', content: 'noise' }], '2026-10-04T02:01:30Z'),
    line('user', '<task-notification><task-id>x</task-id>noise</task-notification>', '2026-10-04T02:01:35Z'),
    JSON.stringify({ type: 'attachment', timestamp: '2026-10-04T02:01:40Z', attachment: { type: 'queued_command', prompt: 'พิมพ์แทรกระหว่างทำงาน', origin: { kind: 'human' } } }),
    JSON.stringify({ type: 'attachment', timestamp: '2026-10-04T02:01:45Z', attachment: { type: 'queued_command', prompt: 'task-notification', origin: { kind: 'task' } } }),
    line('user', '<command-name>/handoff</command-name>\n<command-args>แล้วทำต่อ</command-args>', '2026-10-04T02:02:00Z'),
    line('assistant', [{ type: 'text', text: 'คำตอบสุดท้ายก่อนล้าง' }], '2026-10-04T02:03:00Z'),
  ].join('\n') + '\n');
  const newT = path.join(tdir, 'new-session.jsonl');
  fs.writeFileSync(newT, '');
  assert.equal(hook('load-handoff.mjs', { source: 'clear', cwd, transcript_path: newT }).status, 0);
  const out = path.join(cwd, '.claude', 'history', '2026-10-04_old-session.md');
  const md = fs.readFileSync(out, 'utf8');
  assert.equal(md.match(/### 🧑 ผู้ใช้/g).length, 3);
  assert.ok(!md.includes('task-notification'), 'only human-typed queued messages');
  for (const s of ['สั่งงานข้อแรก', 'พิมพ์แทรกระหว่างทำงาน', '`/handoff` แล้วทำต่อ', 'คำตอบสุดท้ายก่อนล้าง', 'เครื่องมือ: Bash']) assert.ok(md.includes(s), s);
  assert.ok(!md.includes('noise'));
  assert.equal(fs.readdirSync(path.dirname(out)).length, 1, 'empty session is not exported');
});

// A compacted session: the summary Claude Code inserts is stored as a user entry flagged isCompactSummary.
function compactedSession(summary) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  const f = path.join(tdir, 'sess.jsonl');
  const line = (type, content, ts, extra = {}) => JSON.stringify({ type, timestamp: ts, ...extra, message: { role: type, content } });
  fs.writeFileSync(f, [
    line('user', 'งานก่อนย่อ', '2026-10-06T01:00:00Z'),
    line('assistant', [{ type: 'text', text: 'ทำแล้ว' }], '2026-10-06T01:01:00Z'),
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-10-06T01:02:00Z', compactMetadata: { trigger: 'auto', preTokens: 301000 } }),
    line('user', summary, '2026-10-06T01:02:00Z', { isCompactSummary: true }),
    line('user', 'งานหลังย่อ', '2026-10-06T01:03:00Z'),
  ].join('\n') + '\n');
  return { cwd, f };
}
const SUMMARY = 'This session is being continued from a previous conversation.\n\nSummary:\n1. Primary Request: x\n\n## Handoff\n## เป้าหมาย\nทดสอบย่อ\n## ค้างอยู่ / ขั้นถัดไป\n1. ทำต่อ\n';

test('export-history: a compact summary is not a user message; the compaction point is marked', () => {
  const { cwd, f } = compactedSession(SUMMARY);
  hook('load-handoff.mjs', { source: 'startup', cwd, transcript_path: path.join(path.dirname(f), 'next.jsonl') });
  const md = fs.readFileSync(path.join(cwd, '.claude', 'history', '2026-10-06_sess.md'), 'utf8');
  assert.equal(md.match(/### 🧑 ผู้ใช้/g).length, 2);
  assert.ok(!md.includes('This session is being continued'));
  assert.match(md, /ย่อ context อัตโนมัติ/);
  assert.ok(md.indexOf('งานก่อนย่อ') < md.indexOf('ย่อ context') && md.indexOf('ย่อ context') < md.indexOf('งานหลังย่อ'));
});

test('pre-compact: exports the running session before it is summarized', () => {
  const { cwd, f } = compactedSession(SUMMARY);
  const r = hook('pre-compact.mjs', { hook_event_name: 'PreCompact', trigger: 'auto', cwd, transcript_path: f });
  assert.equal(r.status, 0);
  assert.match(fs.readFileSync(path.join(cwd, '.claude', 'history', '2026-10-06_sess.md'), 'utf8'), /งานหลังย่อ/);
});

test('load-handoff after compact: never writes handoff.md (only /ai-proceed does), still exports history', () => {
  const { cwd, f } = compactedSession(SUMMARY);
  const note = path.join(cwd, '.claude', 'handoff.md');
  const r = hook('load-handoff.mjs', { source: 'compact', cwd, transcript_path: f });
  assert.equal(r.status, 0);
  assert.ok(!fs.existsSync(note), 'no note written by the hook');
  assert.ok(!fs.existsSync(path.join(cwd, '.claude', 'history', 'handoff')), 'nothing archived');
  assert.match(fs.readFileSync(path.join(cwd, '.claude', 'history', '2026-10-06_sess.md'), 'utf8'), /งานหลังย่อ/);
  // an existing note is left exactly as it was
  fs.writeFileSync(note, '# Handoff จาก ai-proceed\n');
  hook('load-handoff.mjs', { source: 'compact', cwd, transcript_path: f });
  assert.equal(fs.readFileSync(note, 'utf8'), '# Handoff จาก ai-proceed\n');
  assert.doesNotMatch(r.stdout, /ทดสอบย่อ/, 'summary is already in context');
});
