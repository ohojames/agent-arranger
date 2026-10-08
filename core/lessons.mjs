#!/usr/bin/env node
// Lessons learned from repeated corrections. route-prompt injects a lesson only when the prompt's
// intent matches one of its tags, so lessons cost tokens only where they apply.
//
//   node lessons.mjs add --tags ui,change-all "<rule: condition → what to do → how to check>"
//   node lessons.mjs list
//   node lessons.mjs remove L3
//   node lessons.mjs report            corrections per week and topic — is the problem going away?
//
// Add a lesson only after the user approved its wording in chat.

import fs from 'node:fs';
import path from 'node:path';
import { LESSON_TAGS, learningDir, publishLessons, readLessons, writeLessons } from './lib.mjs';

const published = (files) => files.length && console.log(`ส่งให้เครื่องมือที่ไม่มี hook แล้ว: ${files.join(', ')}`);

const MAX_LESSONS = 40;
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'add') {
  const i = rest.indexOf('--tags');
  const tags = i === -1 ? ['any'] : rest[i + 1].split(',').map((t) => t.trim());
  const text = rest.filter((_, k) => k !== i && k !== i + 1).join(' ').trim();
  const bad = tags.filter((t) => !LESSON_TAGS.includes(t));
  if (!text || bad.length) {
    console.error(`usage: add --tags <${LESSON_TAGS.join('|')}> "<rule>"${bad.length ? ` — unknown tag: ${bad.join(',')}` : ''}`);
    process.exit(2);
  }
  const list = readLessons();
  if (list.length >= MAX_LESSONS) {
    console.error(`already ${MAX_LESSONS} lessons — remove or merge one first (node lessons.mjs list)`);
    process.exit(2);
  }
  const id = `L${Math.max(0, ...list.map((l) => Number(l.id.slice(1)))) + 1}`;
  list.push({ id, tags, text, created: new Date().toISOString().slice(0, 10) });
  writeLessons(list);
  console.log(`added ${id} [${tags.join(',')}] ${text}`);
  published(publishLessons(list));
} else if (cmd === 'list') {
  for (const l of readLessons()) console.log(`${l.id} [${l.tags.join(',')}] ${l.text}  (${l.created})`);
} else if (cmd === 'remove') {
  const list = readLessons();
  const next = list.filter((l) => l.id !== rest[0]);
  if (next.length === list.length) { console.error(`no lesson ${rest[0]}`); process.exit(2); }
  writeLessons(next);
  console.log(`removed ${rest[0]}`);
  published(publishLessons(next));
} else if (cmd === 'report') {
  let rows = [];
  try {
    rows = fs.readFileSync(path.join(learningDir(), 'corrections.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { /* nothing logged yet */ }
  const week = (ts) => { const d = new Date(ts); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const table = {};
  for (const r of rows) ((table[week(r.ts)] ??= {})[r.topic] = (table[week(r.ts)][r.topic] ?? 0) + 1);
  console.log(`${rows.length} corrections logged · ${readLessons().length} lessons active`);
  for (const [w, topics] of Object.entries(table).sort()) console.log(`week of ${w}: ${Object.entries(topics).map(([t, n]) => `${t} ${n}`).join(' · ')}`);
} else {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
  process.exit(2);
}
