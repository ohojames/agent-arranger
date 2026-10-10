import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeThai } from './thai-decode.mjs';
import { reconcile } from './reconcile.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-mig-'));
const cli = (script, ...args) => spawnSync(process.execPath, [path.join(DIR, script), ...args], { encoding: 'utf8' });

test('TIS-620 bytes stored in a latin1 column decode to Thai', () => {
  const r = decodeThai(Buffer.from([0xca, 0xc1, 0xaa, 0xd2, 0xc2]));
  assert.equal(r.text, 'สมชาย');
  assert.equal(r.enc, 'tis620');
  assert.deepEqual(r.problems, []);
});

test('rows already written as UTF-8 are kept as UTF-8', () => {
  const r = decodeThai(Buffer.from('ใจดี', 'utf8'));
  assert.equal(r.text, 'ใจดี');
  assert.equal(r.enc, 'utf8');
});

test('bytes TIS-620 does not define are reported, not silently replaced', () => {
  // Node maps 0xDB to U+F8C1 and 0x81 to U+0081 without throwing, even with fatal:true
  assert.match(decodeThai(Buffer.from([0xca, 0xdb])).problems.join(), /private-use/);
  assert.match(decodeThai(Buffer.from([0xca, 0x81])).problems.join(), /control/);
});

test('text that was already mis-decoded (mojibake) is reported', () => {
  assert.match(decodeThai(Buffer.from('ÊÁªÒÂ', 'utf8')).problems.join(), /mojibake/);
});

const base = () => ({
  source: { rows: 1200, nonNull: { fname: 1050, sex: 1050, birth: 1000, raw_extra: 1200, old_flag: 30 } },
  target: { rows: 1190, nonNull: { first_name: 1042, gender: 1042, birth_date: 994, 'payload.raw_extra': 1190 } },
  rejected: { rows: 10, nonNull: { fname: 8, sex: 8, birth: 6, raw_extra: 10 } },
  map: { fname: 'first_name', sex: 'gender', birth: 'birth_date', raw_extra: 'payload.raw_extra' },
  unmapped: { old_flag: 'always 1 in the old app, no meaning (confirmed by the user)' },
});

test('every source row and every non-null source value is accounted for → GREEN', () => {
  const r = reconcile(base());
  assert.equal(r.ok, true, JSON.stringify(r.rows));
  assert.equal(r.rows.find((x) => x.source === 'fname').pct, '99.24');
});

test('a value lost in transform turns the column RED even when row counts match', () => {
  const c = base();
  c.target.nonNull.birth_date = 900; // e.g. dates silently set to null
  const r = reconcile(c);
  assert.equal(r.ok, false);
  assert.equal(r.rows.find((x) => x.source === 'birth').status, 'RED');
});

test('a loss the user accepted is GREEN only with a count and a reason', () => {
  const c = base();
  c.target.nonNull.birth_date = 991;
  c.map.birth = { to: 'birth_date', lost: 3, reason: "'0000-00-00' in the old system" };
  assert.equal(reconcile(c).ok, true);
  c.map.birth = { to: 'birth_date', lost: 3 };
  assert.equal(reconcile(c).ok, false, 'no reason → RED');
});

test('rows missing between source and target+rejected are RED', () => {
  const c = base();
  c.target.rows = 1040; // e.g. payload-only rows were skipped
  assert.equal(reconcile(c).rows.find((x) => x.source === '(rows)').status, 'RED');
});

test('a source column with values but no mapping and no reason is RED', () => {
  const c = base();
  delete c.unmapped.old_flag;
  assert.equal(reconcile(c).rows.find((x) => x.source === 'old_flag').status, 'RED');
});

test('CLI exits 1 on RED and prints the table', () => {
  const f = path.join(tmp, 'bad.json');
  const c = base();
  c.target.nonNull.gender = 1;
  fs.writeFileSync(f, JSON.stringify(c));
  const r = cli('reconcile.mjs', f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /sex\s.*RED/);
  const g = path.join(tmp, 'good.json');
  fs.writeFileSync(g, JSON.stringify(base()));
  assert.equal(cli('reconcile.mjs', g).status, 0);
});

test('thai-decode CLI converts a windows-874 file and exits 1 when a line has problems', () => {
  const src = path.join(tmp, 'in.csv');
  const out = path.join(tmp, 'out.csv');
  fs.writeFileSync(src, Buffer.from([0xca, 0xc1, 0xaa, 0xd2, 0xc2, 0x0a, 0xca, 0xdb, 0x0a]));
  const r = cli('thai-decode.mjs', src, out);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 2/);
  assert.equal(fs.readFileSync(out, 'utf8').split('\n')[0], 'สมชาย');
});
