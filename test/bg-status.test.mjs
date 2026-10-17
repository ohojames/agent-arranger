// node --test test/  — Stop hook that makes the report say what is still running
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'bg-status.mjs');
const NOW = '2026-10-12T10:00:00.000Z';

const user = (text) => ({ type: 'user', timestamp: NOW, message: { role: 'user', content: text } });
const say = (text) => ({ type: 'assistant', timestamp: NOW, message: { role: 'assistant', content: [{ type: 'text', text }] } });
const call = (id, name, input) => ({ type: 'assistant', timestamp: NOW, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, timestamp = NOW) => ({ type: 'user', timestamp, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] } });
const notify = (taskId, status) => user(`<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n</task-notification>`);

const bashBg = [
  call('t1', 'Bash', { command: 'npm run build', description: 'Build the app', run_in_background: true }),
  result('t1', 'Command running in background with ID: bx1. Output is being written to: C:\\tmp\\bx1.output'),
];
const devServer = [
  call('t2', 'mcp__Claude_Browser__preview_start', { name: 'web' }),
  result('t2', '{\n  "serverId": "srv-1",\n  "port": 3000,\n  "name": "web"\n}\nServer started successfully on port 3000.'),
];

function run(lines, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
  const f = path.join(dir, 't.jsonl');
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ transcript_path: f, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, AGENT_ARRANGER_NOW: NOW },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test('blocks when a background command is running and the report does not say so', () => {
  const out = run([user('build it'), ...bashBg, say('**ผล:** เสร็จแล้ว')]);
  assert.equal(out?.decision, 'block');
  assert.match(out.reason, /Build the app/);
  assert.match(out.reason, /มีงานที่กำลังรันอยู่\?/);
});

test('passes once the background command has finished', () => {
  assert.equal(run([user('build it'), ...bashBg, notify('bx1', 'completed'), say('**ผล:** เสร็จแล้ว')]), null);
});

test('passes when the report already lists what is running', () => {
  assert.equal(run([user('build it'), ...bashBg, say('**ผล:** กำลัง build\n\n**Skills ที่ใช้:** ไม่ได้ใช้\n\n**มีงานที่กำลังรันอยู่?:** มี (build ของแอป)')]), null);
});

test('blocks when the report claims nothing is running but something is', () => {
  const out = run([user('build it'), ...bashBg, say('**ผล:** เสร็จ\n\n**มีงานที่กำลังรันอยู่?:** ไม่มี')]);
  assert.equal(out?.decision, 'block');
});

test('a stopped task no longer counts', () => {
  const stop = [call('t3', 'TaskStop', { task_id: 'bx1' }), result('t3', '{"message":"Successfully stopped task: bx1 (npm run build)"}')];
  assert.equal(run([user('x'), ...bashBg, ...stop, say('**ผล:** หยุดแล้ว')]), null);
});

test('a dev server counts until preview_stop', () => {
  assert.equal(run([user('x'), ...devServer, say('**ผล:** ok')])?.decision, 'block');
  const stop = [call('t4', 'mcp__Claude_Browser__preview_stop', { serverId: 'srv-1' }), result('t4', 'stopped')];
  assert.equal(run([user('x'), ...devServer, ...stop, say('**ผล:** ok')]), null);
});

test('background agents, monitors and workflows are tracked by task id', () => {
  const agent = [call('a1', 'Agent', { description: 'Research skills', prompt: 'p' }), result('a1', [{ type: 'text', text: 'Async agent launched successfully.\nagentId: ag42 (internal ID)' }])];
  const mon = [call('m1', 'Monitor', { description: 'watch log', command: 'tail -f x' }), result('m1', 'Monitor started (task mon7, expires in 3m)')];
  const wf = [call('w1', 'Workflow', { script: 'export const meta = {}' }), result('w1', 'Workflow launched in background. Task ID: wf9 | Summary: Review')];
  const out = run([user('x'), ...agent, ...mon, ...wf, say('**ผล:** ok')]);
  assert.match(out.reason, /Research skills/);
  assert.match(out.reason, /watch log/);
  assert.match(out.reason, /Review/);
  assert.equal(run([user('x'), ...agent, ...mon, ...wf, notify('ag42', 'completed'), notify('mon7', 'killed'), notify('wf9', 'failed'), say('**ผล:** ok')]), null);
});

test('a future wakeup counts, a past one does not', () => {
  const wake = (ts) => [call('s1', 'ScheduleWakeup', { delaySeconds: 600, prompt: 'check' }), result('s1', 'Next wakeup scheduled for 10:10:00 (in 600s).', ts)];
  assert.equal(run([user('x'), ...wake('2026-10-12T09:55:00.000Z'), say('**ผล:** ok')])?.decision, 'block');
  assert.equal(run([user('x'), ...wake('2026-10-12T09:00:00.000Z'), say('**ผล:** ok')]), null);
});

test('text that only quotes a launch message is not a task', () => {
  const quoted = [call('q1', 'Bash', { command: 'grep x', description: 'Grep transcripts' }), result('q1', 'sample: Monitor started (task zz1, expires in 3m)')];
  assert.equal(run([user('x'), ...quoted, say('**ผล:** ok')]), null);
});

test('tasks from before the session process restarted are gone', () => {
  const resume = { type: 'attachment', timestamp: NOW, attachment: { type: 'hook_success', hookName: 'SessionStart:resume', hookEvent: 'SessionStart' } };
  const compact = { ...resume, attachment: { ...resume.attachment, hookName: 'SessionStart:compact' } };
  assert.equal(run([user('x'), ...bashBg, resume, say('**ผล:** ok')]), null);
  assert.equal(run([user('x'), ...bashBg, compact, say('**ผล:** ok')])?.decision, 'block');
});

test('a monitor ends at its expiry notice or expiry time', () => {
  const mon = (ts) => [call('m2', 'Monitor', { description: 'watch', command: 'tail -f x' }), result('m2', 'Monitor started (task mon8, expires in 30m unless the source ends first)', ts)];
  const expired = user('<task-notification>\n<task-id>mon8</task-id>\n<event>[Monitor expired after 30m with 3 events delivered.]</event>\n</task-notification>');
  assert.equal(run([user('x'), ...mon('2026-10-12T09:50:00.000Z'), say('**ผล:** ok')])?.decision, 'block');
  assert.equal(run([user('x'), ...mon('2026-10-12T09:50:00.000Z'), expired, say('**ผล:** ok')]), null);
  assert.equal(run([user('x'), ...mon('2026-10-12T09:00:00.000Z'), say('**ผล:** ok')]), null);
});

test('never blocks twice in a row', () => {
  assert.equal(run([user('x'), ...bashBg, say('**ผล:** ok')], { stop_hook_active: true }), null);
});
