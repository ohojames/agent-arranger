#!/usr/bin/env node
// Per-column reconciliation of a legacy migration: every source row and every non-null source value
// must land in the target, in the reject table, or in a loss the user accepted with a reason.
//
//   node reconcile.mjs <counts.json>   prints one line per column; exit 1 when any line is RED
//
// counts.json:
//   source   { rows, nonNull: { <source col>: n } }        COUNT(*) and COUNT(col) on the legacy table
//   target   { rows, nonNull: { <target col>: n } }        same, migrated rows only (WHERE legacy_id IS NOT NULL)
//   rejected { rows, nonNull: { <source col>: n } }        same, on the reject table
//   map      { <source col>: "<target col>" | { to, lost, reason } }
//   unmapped { <source col>: "<why it is not migrated>" }

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function reconcile({ source, target, rejected = { rows: 0, nonNull: {} }, map = {}, unmapped = {} }) {
  const rows = [];
  const rowDiff = source.rows - target.rows - rejected.rows;
  rows.push({
    source: '(rows)', target: '(rows)', sourceN: source.rows, targetN: target.rows, rejectedN: rejected.rows, lost: 0,
    diff: rowDiff, status: rowDiff === 0 ? 'GREEN' : 'RED', note: rowDiff ? 'rows neither loaded nor rejected' : '',
  });
  for (const [col, sourceN] of Object.entries(source.nonNull)) {
    const m = map[col];
    const rejectedN = rejected.nonNull?.[col] ?? 0;
    if (m == null) {
      const reason = unmapped[col];
      const red = sourceN > 0 && !reason;
      rows.push({ source: col, target: '-', sourceN, targetN: null, rejectedN, lost: sourceN, diff: 0,
        status: red ? 'RED' : 'GREEN', note: reason || (sourceN ? 'has values but no mapping and no reason' : 'empty in source') });
      continue;
    }
    const to = typeof m === 'string' ? m : m.to;
    const lost = typeof m === 'string' ? 0 : m.lost ?? 0;
    const reason = typeof m === 'string' ? '' : m.reason ?? '';
    const targetN = target.nonNull[to];
    if (targetN == null) {
      rows.push({ source: col, target: to, sourceN, targetN: null, rejectedN, lost, diff: null, status: 'RED', note: 'target column not counted' });
      continue;
    }
    const diff = sourceN - targetN - rejectedN - lost;
    const notes = [];
    if (diff) notes.push(diff > 0 ? `${diff} values lost` : `${-diff} more values than source`);
    if (lost && !reason) notes.push('accepted loss needs a reason');
    if (lost && reason) notes.push(`accepted loss: ${reason}`);
    rows.push({
      source: col, target: to, sourceN, targetN, rejectedN, lost, diff,
      pct: sourceN ? ((targetN / sourceN) * 100).toFixed(2) : '-',
      status: diff === 0 && (!lost || reason) ? 'GREEN' : 'RED', note: notes.join('; '),
    });
  }
  for (const to of Object.keys(target.nonNull)) {
    if (!Object.values(map).some((m) => (typeof m === 'string' ? m : m.to) === to)) {
      rows.push({ source: '-', target: to, sourceN: null, targetN: target.nonNull[to], rejectedN: 0, lost: 0, diff: null,
        status: 'GREEN', note: 'target-only column (not from source)' });
    }
  }
  return { ok: rows.every((r) => r.status === 'GREEN'), rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node reconcile.mjs <counts.json>');
    process.exit(2);
  }
  const { ok, rows } = reconcile(JSON.parse(fs.readFileSync(file, 'utf8')));
  const cols = ['source', 'target', 'sourceN', 'targetN', 'rejectedN', 'lost', 'pct', 'status', 'note'];
  const cell = (r, c) => String(r[c] ?? '');
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r, c).length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => cell(r, c).padEnd(w[i])).join('  '));
  console.log(ok ? '\nGREEN: every source row and value is accounted for' : `\nRED: ${rows.filter((r) => r.status === 'RED').length} line(s) — fix before reporting completeness`);
  process.exit(ok ? 0 : 1);
}
