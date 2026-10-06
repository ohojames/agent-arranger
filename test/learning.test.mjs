// node --test ~/.agent-arranger/test/  — correction capture + approved lessons injected by intent
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');
const learningDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
const env = (dir) => ({ ...process.env, AGENT_ARRANGER_LEARNING_DIR: dir });
const prompt = (dir, text) => spawnSync(process.execPath, [path.join(BIN, 'route-prompt.mjs')], { input: JSON.stringify({ prompt: text, cwd: os.tmpdir() }), encoding: 'utf8', env: env(dir) }).stdout;
const lessons = (dir, ...args) => spawnSync(process.execPath, [path.join(BIN, 'lessons.mjs'), ...args], { encoding: 'utf8', env: env(dir) });

test('a repeated correction is logged and the agent is asked to propose a lesson', () => {
  const dir = learningDir();
  const out = prompt(dir, 'ทำไมไม่เปลี่ยนสีตัวอักษรให้ครบทุกจุดวะ บอกไปแล้ว');
  assert.match(out, /<repeat-correction>/);
  const log = fs.readFileSync(path.join(dir, 'corrections.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.length, 1);
  assert.equal(log[0].topic, 'สี/สไตล์');
  assert.ok(log[0].snippet.length <= 200);
  assert.doesNotMatch(prompt(dir, 'ช่วยสรุปเอกสารนี้ให้หน่อย'), /<repeat-correction>/);
  // an instruction is not a complaint; relayed agent/system messages are not the user
  assert.doesNotMatch(prompt(dir, 'เปลี่ยนสีตัวอักษรหัวตารางเป็นสีน้ำเงินทุกหน้า'), /<repeat-correction>/);
  assert.doesNotMatch(prompt(dir, 'Another Claude session sent a message: งานยังไม่ครบ'), /<repeat-correction>/);
  assert.doesNotMatch(prompt(dir, '[SYSTEM NOTIFICATION - NOT USER INPUT] task ยังไม่แก้'), /<repeat-correction>/);
  assert.equal(fs.readFileSync(path.join(dir, 'corrections.jsonl'), 'utf8').trim().split('\n').length, 1);
});

test('approved lessons are injected only for matching intents, capped per turn', () => {
  const dir = learningDir();
  assert.equal(lessons(dir, 'add', '--tags', 'ui', 'สีต้องมาจาก token กลางเท่านั้น').status, 0);
  assert.equal(lessons(dir, 'add', '--tags', 'db', 'ห้ามรัน migration บน UAT โดยไม่ถาม').status, 0);
  for (let i = 0; i < 7; i++) lessons(dir, 'add', '--tags', 'ui', `ui lesson ${i}`);
  const ui = prompt(dir, 'ปรับหน้าจอ dashboard');
  assert.match(ui, /<lessons>/);
  assert.match(ui, /token กลาง/);
  assert.doesNotMatch(ui, /migration บน UAT/);
  assert.ok((ui.match(/^- \[L\d+\]/gm) ?? []).length <= 5, 'at most 5 lessons per turn');
  assert.match(ui, /\+3 บทเรียนที่ไม่ได้แสดง/, 'overflow is announced, never dropped silently');
  assert.doesNotMatch(prompt(dir, 'สวัสดี'), /<lessons>/);
});

test('lessons list/remove and the weekly report', () => {
  const dir = learningDir();
  lessons(dir, 'add', '--tags', 'ui', 'บทเรียน A');
  assert.match(lessons(dir, 'list').stdout, /L1 .*บทเรียน A/);
  assert.equal(lessons(dir, 'remove', 'L1').status, 0);
  assert.doesNotMatch(lessons(dir, 'list').stdout, /บทเรียน A/);
  prompt(dir, 'ทำไมไม่แก้ให้ครบทุกหน้า');
  assert.match(lessons(dir, 'report').stdout, /corrections/);
  assert.equal(lessons(dir, 'add', '--tags', 'nope', 'x').status, 2, 'unknown tag is refused');
});
