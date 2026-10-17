#!/usr/bin/env node
// Stop hook — a report must say what this session still has running in the background
//
// Reads the session transcript, finds work started this session that has not finished
// (background commands, agents, monitors, workflows, dev servers, wakeups, cron jobs, terminal tabs)
// and blocks the stop when the final reply does not list it under "**มีงานที่กำลังรันอยู่?:**".
// ปิด: ตั้ง AGENT_ARRANGER_STOP_BGSTATUS=0

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readStdinJson } from './lib.mjs';

// Only lines containing one of these can start or end a tracked task — skip JSON.parse for the rest.
const MARKERS = [
  'running in background with ID', 'agentId:', 'Monitor started (task', 'Workflow launched in background',
  '<task-id>', 'Successfully stopped task', 'serverId', 'Next wakeup scheduled', '"stop":true',
  'Scheduled recurring job', 'CronDelete', 'Started in new terminal tab', 'stop_terminal_tab', 'SessionStart:',
];
// A new session process (app restart, resume, clear) kills everything the old one ran; compaction does not.
const PROCESS_START = /"hookName":"SessionStart:(startup|resume|clear)"/;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000 };

const textOf = (content) =>
  typeof content === 'string' ? content : (content || []).map((b) => b.text || '').join('\n');

export function runningTasks(lines, now = Date.now()) {
  const calls = new Map(); // tool_use id → { name, input }
  const tasks = new Map(); // key → label
  const stoppedTasks = new Set();
  const expiresAt = new Map(); // monitor task id → ms
  let wakeup = null;

  for (const line of lines) {
    if (!MARKERS.some((m) => line.includes(m)) && !line.includes('"tool_use"')) continue;
    if (PROCESS_START.test(line)) {
      tasks.clear();
      wakeup = null;
      continue;
    }

    // Completion notices may sit in user, queue-operation or attachment lines; match the raw text.
    for (const [, block] of line.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
      const id = block.match(/<task-id>([\w-]+)<\/task-id>/)?.[1];
      const status = block.match(/<status>(\w+)<\/status>/)?.[1];
      if (id && ((status && status !== 'running') || /Monitor (expired|stopped|ended)/.test(block))) stoppedTasks.add(id);
    }

    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = o.message?.content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type === 'tool_use') {
        calls.set(b.id, { name: b.name, input: b.input || {} });
        if (b.name === 'ScheduleWakeup' && b.input?.stop) wakeup = null;
        if (b.name === 'CronDelete') tasks.delete(`cron:${b.input?.id || b.input?.job_id}`);
        if (b.name === 'mcp__Claude_Browser__preview_stop') tasks.delete(`server:${b.input?.serverId}`);
        if (b.name === 'mcp__terminal__stop_terminal_tab') tasks.delete(`tab:${b.input?.tab_id}`);
        continue;
      }
      if (b.type !== 'tool_result' || !calls.has(b.tool_use_id)) continue;
      const { name, input } = calls.get(b.tool_use_id);
      const text = textOf(b.content);
      const label = input.description || (input.command || '').slice(0, 80);
      let m;
      if ((name === 'Bash' || name === 'PowerShell') && (m = text.match(/running in background with ID: ([\w-]+)/))) tasks.set(`task:${m[1]}`, `คำสั่งเบื้องหลัง: ${label}`);
      else if (name === 'Agent' && (m = text.match(/agentId: ([\w-]+)/))) tasks.set(`task:${m[1]}`, `subagent: ${input.description || 'agent'}`);
      else if (name === 'Monitor' && (m = text.match(/Monitor started \(task ([\w-]+)(?:, expires in (\d+)([smh]))?/))) {
        tasks.set(`task:${m[1]}`, `monitor: ${label}`);
        if (m[2]) expiresAt.set(m[1], Date.parse(o.timestamp) + Number(m[2]) * UNIT_MS[m[3]]);
      } else if (name === 'Workflow' && (m = text.match(/Workflow launched in background\. Task ID: ([\w-]+)(?: \| Summary: ([^|\n]+))?/))) tasks.set(`task:${m[1]}`, `workflow: ${(m[2] || 'workflow').trim()}`);
      else if (name === 'TaskStop' && (m = text.match(/Successfully stopped task: ([\w-]+)/))) stoppedTasks.add(m[1]);
      else if (name === 'mcp__Claude_Browser__preview_start' && (m = text.match(/"serverId": "([\w-]+)"/))) {
        tasks.set(`server:${m[1]}`, `dev server: ${input.name || m[1]}${(m = text.match(/"port": (\d+)/)) ? ` (port ${m[1]})` : ''}`);
      } else if (name === 'ScheduleWakeup' && (m = text.match(/Next wakeup scheduled for ([\d:]+) \(in (\d+)s\)/))) {
        const at = Date.parse(o.timestamp) + Number(m[2]) * 1000;
        wakeup = { at, label: `นัดปลุกตัวเองเวลา ${m[1]}` };
      } else if (name === 'CronCreate' && (m = text.match(/Scheduled recurring job ([\w-]+)/))) tasks.set(`cron:${m[1]}`, `งานตั้งเวลาซ้ำ: ${(input.prompt || '').slice(0, 60)}`);
      else if (name === 'mcp__terminal__run_in_terminal' && (m = text.match(/Started in new terminal tab "([\w-]+)"/))) tasks.set(`tab:${m[1]}`, `แท็บเทอร์มินัล ${m[1]}: ${input.title || label} (ตรวจไม่ได้ว่าคำสั่งจบหรือยัง)`);
    }
  }

  const ended = (id) => stoppedTasks.has(id) || (expiresAt.has(id) && expiresAt.get(id) <= now);
  const out = [...tasks].filter(([k]) => !(k.startsWith('task:') && ended(k.slice(5)))).map(([, v]) => v);
  if (wakeup && wakeup.at > now) out.push(wakeup.label);
  return out;
}

// Text the assistant wrote since the user's last prompt (tool results do not count as prompts).
export function finalReply(lines) {
  const parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    const c = o.message?.content;
    if (o.type === 'user' && (typeof c === 'string' || (Array.isArray(c) && !c.some((b) => b.type === 'tool_result')))) break;
    if (o.type === 'assistant' && Array.isArray(c)) parts.unshift(textOf(c.filter((b) => b.type === 'text')));
  }
  return parts.join('\n');
}

function main() {
  const input = readStdinJson();
  if (input.stop_hook_active || process.env.AGENT_ARRANGER_STOP_BGSTATUS === '0') return;
  if (!input.transcript_path || !fs.existsSync(input.transcript_path)) return;

  const lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n');
  const now = process.env.AGENT_ARRANGER_NOW ? Date.parse(process.env.AGENT_ARRANGER_NOW) : Date.now();
  const running = runningTasks(lines, now);
  if (!running.length) return;

  const reply = finalReply(lines);
  // "ยังรันอยู่:" is the older label, still accepted
  const m = reply.match(/(?:ยัง|กำลัง)รันอยู่\??:?\**\s*:?\s*(.*)/);
  if (m && !/^ไม่มี/.test(m[1].trim())) return;

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      `session นี้ยังมีงานรันอยู่ ${running.length} งาน แต่รายงานไม่ได้บอก:\n` +
      running.map((r) => `- ${r}`).join('\n') +
      '\nเขียนบรรทัด `**มีงานที่กำลังรันอยู่?:** มี (<งาน>, <งาน>)` เป็นบรรทัดสุดท้ายของรายงาน ' +
      'บอกว่ารายงานนี้ยังไม่ใช่ผลสุดท้ายหรือไม่ และจะแจ้งเมื่อไร ถ้างานไหนจบแล้วจริงให้ตรวจแล้วบอกว่าจบ ' +
      'ส่งเฉพาะบรรทัดนั้น ไม่ต้องเขียนรายงานซ้ำ',
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
