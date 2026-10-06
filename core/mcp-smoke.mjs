#!/usr/bin/env node
// ทดสอบว่า MCP server สตาร์ตได้จริงและตอบ initialize + tools/list
// ใช้:  node mcp-smoke.mjs <command> [args...]

import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('ใช้: node mcp-smoke.mjs <command> [args...]');
  process.exit(1);
}

const child = spawn(cmd, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  shell: false,
});

let buf = '';
let stderr = '';
const seen = new Map();
let done = false;

const timer = setTimeout(() => finish('หมดเวลา 90 วินาที'), 90_000);

child.stderr.on('data', (d) => (stderr += d.toString()));
child.on('error', (e) => finish('spawn ไม่ได้: ' + e.message));
child.on('exit', (code) => finish('process จบก่อน (exit ' + code + ')'));

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith('{')) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 1) {
      seen.set('initialize', msg.result?.serverInfo || msg.error || {});
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    }
    if (msg.id === 2) {
      seen.set('tools', (msg.result?.tools || []).map((t) => t.name));
      finish(null);
    }
  }
});

function send(o) {
  child.stdin.write(JSON.stringify(o) + '\n');
}

function finish(err) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try {
    child.kill();
  } catch {
    /* ปิดไปแล้ว */
  }
  const info = seen.get('initialize');
  const tools = seen.get('tools');
  if (tools) {
    console.log(`OK  ${info?.name || '?'} v${info?.version || '?'}  — tools ${tools.length} ตัว`);
    console.log('    ' + tools.slice(0, 12).join(', ') + (tools.length > 12 ? ' ...' : ''));
    process.exit(0);
  }
  console.log('FAIL ' + (err || 'ไม่ได้รับ tools/list'));
  if (info) console.log('     initialize: ' + JSON.stringify(info));
  if (stderr.trim()) console.log('     stderr: ' + stderr.trim().split('\n').slice(-6).join('\n     '));
  process.exit(1);
}

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'agent-arranger-smoke', version: '1.0.0' },
  },
});
