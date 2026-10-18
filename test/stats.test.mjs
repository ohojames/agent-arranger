// node --test test/stats.test.mjs: aa stats counts Stop-hook blocks from Claude Code transcripts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const STATS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'stats.mjs');
const run = (...args) => spawnSync(process.execPath, [STATS, ...args], { encoding: 'utf8' });

const feedback = (uuid, sessionId, text) =>
  JSON.stringify({ type: 'user', isMeta: true, uuid, sessionId, timestamp: '2026-10-12T08:00:00Z', message: { role: 'user', content: `Stop hook feedback:\n${text}` } });

test('counts each aa hook once per block and ignores the rest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'));
  fs.mkdirSync(path.join(dir, 'proj-a'));
  fs.mkdirSync(path.join(dir, 'proj-b'));
  const verify = feedback('u1', 's1', '[node "C:/Users/x/.agent-arranger/core/verify-stop.mjs"]: type error 1');
  fs.writeFileSync(path.join(dir, 'proj-a', 's1.jsonl'), [
    JSON.stringify({ type: 'user', uuid: 'u0', sessionId: 's1', timestamp: '2026-10-12T07:00:00Z', message: { role: 'user', content: 'fix the bug' } }),
    verify,
    feedback('u2', 's1', 'session นี้ยังมีงานรันอยู่ 2 งาน แต่รายงานไม่ได้บอก:'),
    feedback('u3', 's1', '[node "/home/x/.agent-arranger/core/design-lint.mjs"]: 3 violations'),
    feedback('u4', 's1', '[finish the plan without stopping]: not verified'), // the user's own prompt hook
    'not json',
  ].join('\n'));
  // a resumed session repeats an earlier line
  fs.writeFileSync(path.join(dir, 'proj-b', 's2.jsonl'), [verify.replace('"sessionId":"s1"', '"sessionId":"s2"'), JSON.stringify({ type: 'user', uuid: 'u5', sessionId: 's2', message: { role: 'user', content: 'hi' } })].join('\n'));
  // a session that ended before the first block ran before aa was installed: not in the denominator
  fs.writeFileSync(path.join(dir, 'proj-b', 's3.jsonl'), JSON.stringify({ type: 'user', uuid: 'u6', sessionId: 's3', timestamp: '2026-10-01T08:00:00Z', message: { role: 'user', content: 'old' } }));

  const r = JSON.parse(run('--dir', dir, '--json').stdout);
  assert.deepEqual(r.counts, { 'verify-stop': 1, 'bg-status': 1, 'design-lint': 1 });
  assert.equal(r.total, 3);
  assert.equal(r.sessions, 2);
  assert.equal(r.blockedSessions, 1);
  assert.equal(r.first, '2026-10-12');
  assert.match(run('--dir', dir).stdout, /aa stopped the agent 3 times in 1 of 2 sessions since 2026-10-12/);
});

test('says what to do when there are no transcripts yet', () => {
  const out = run('--dir', path.join(os.tmpdir(), 'no-such-dir-aa-stats')).stdout;
  assert.match(out, /No Claude Code transcripts found/);
});

test('a row two hooks share is one stop, a quoted bg-status line is not a block, days are local', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'));
  fs.mkdirSync(path.join(dir, 'proj'));
  const late = (uuid, text) => feedback(uuid, 's1', text).replace('2026-10-12T08:00:00Z', '2026-10-12T20:00:00Z');
  fs.writeFileSync(path.join(dir, 'proj', 's1.jsonl'), [
    late('u1', '[node "/x/core/verify-stop.mjs"]: tsc failed\n[node "/x/core/design-lint.mjs"]: 2 violations'),
    late('u2', '[my own hook]: the agent wrote "session นี้ยังมีงานรันอยู่ 2 งาน" in its plan'),
  ].join('\n'));
  const r = JSON.parse(spawnSync(process.execPath, [STATS, '--dir', dir, '--json'], { encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Bangkok' } }).stdout);
  assert.deepEqual(r.counts, { 'verify-stop': 1, 'bg-status': 0, 'design-lint': 1 });
  assert.equal(r.total, 1);
  assert.equal(r.first, '2026-10-13'); // 20:00 UTC is 03:00 the next day in Bangkok
});

test('transcripts with no blocks, and --dir without a path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'));
  fs.mkdirSync(path.join(dir, 'proj'));
  fs.writeFileSync(path.join(dir, 'proj', 's1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u1', sessionId: 's1', timestamp: '2026-10-12T08:00:00Z', message: { role: 'user', content: 'hi' } }));
  assert.match(run('--dir', dir).stdout, /has not had to stop the agent yet in 1 sessions/);
  const bad = run('--dir');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--dir needs a folder/);
});
