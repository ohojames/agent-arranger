#!/usr/bin/env node
// How often did aa's Stop hooks stop the agent from finishing too early? Read-only: counts the
// hook feedback Claude Code already wrote into its local transcripts. Nothing leaves the machine.
//
//   node stats.mjs                 summary
//   node stats.mjs --json          same numbers as JSON
//   node stats.mjs --dir <path>    transcripts folder (default ~/.claude/projects)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const HOOKS = [
  { name: 'verify-stop', what: 'said done while typecheck or tests were failing', match: (t) => /verify-stop\.mjs"?\]:/.test(t) },
  // bg-status blocks with a JSON decision, so Claude Code shows its reason without the command prefix
  { name: 'bg-status', what: 'reported done while background work was still running', match: (t) => /bg-status\.mjs"?\]:/.test(t) || /^Stop hook feedback:\n(?:\[[^\]]*\]: )?session นี้ยังมีงานรันอยู่ \d+ งาน/.test(t) },
  { name: 'design-lint', what: 'finished UI work that broke the design rules', match: (t) => /design-lint\.mjs"?\]:/.test(t) },
];

const argv = process.argv.slice(2);
const dirArg = argv.indexOf('--dir');
const root = dirArg === -1 ? path.join(os.homedir(), '.claude', 'projects') : argv[dirArg + 1];
if (!root || root.startsWith('--')) {
  console.error('--dir needs a folder, e.g. --dir ~/.claude/projects');
  process.exit(2);
}

// transcripts carry UTC timestamps; a day is the user's local day
const localDay = (ts) => {
  const d = new Date(ts || '');
  return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function collect(dir) {
  const counts = Object.fromEntries(HOOKS.map((h) => [h.name, 0]));
  const seen = new Set(); // a resumed session copies earlier lines into a new file
  const lastActive = new Map(); // sessionId → last day seen
  const blockedSessions = new Set();
  const skipped = [];
  let total = 0; // stops; one row can carry feedback from two hooks
  let first = null;
  let last = null;
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).flatMap((p) => {
        const sub = path.join(dir, p);
        return fs.statSync(sub, { throwIfNoEntry: false })?.isDirectory() ? fs.readdirSync(sub).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(sub, f)) : [];
      })
    : [];
  for (const file of files) {
    // streamed: one transcript can be larger than the longest string Node can hold
    try {
      for await (const line of readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })) {
        if (!line.includes('Stop hook feedback') && !line.includes('"sessionId"')) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const day = localDay(row.timestamp);
        if (row.sessionId && day > (lastActive.get(row.sessionId) || '')) lastActive.set(row.sessionId, day);
        const text = row.message?.content;
        if (row.type !== 'user' || !row.isMeta || typeof text !== 'string' || !text.startsWith('Stop hook feedback:')) continue;
        if (row.uuid && seen.has(row.uuid)) continue;
        if (row.uuid) seen.add(row.uuid);
        const hit = HOOKS.filter((h) => h.match(text));
        if (!hit.length) continue; // the user's own prompt hooks, not aa's
        for (const h of hit) counts[h.name]++;
        total++;
        blockedSessions.add(row.sessionId);
        if (day && (!first || day < first)) first = day;
        if (day && (!last || day > last)) last = day;
      }
    } catch {
      skipped.push(file);
    }
  }
  // sessions that ended before the first block most likely ran before aa was installed
  const sessions = [...lastActive.values()].filter((day) => !first || day >= first).length;
  return { counts, total, sessions, blockedSessions: blockedSessions.size, first, last, skipped };
}

const r = await collect(root);
if (argv.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
} else if (!r.sessions) {
  console.log(`No Claude Code transcripts found in ${root}. Use aa for a few sessions, then run this again.`);
} else if (!r.total) {
  console.log(`aa has not had to stop the agent yet in ${r.sessions} sessions.`);
} else {
  console.log(`aa stopped the agent ${r.total} times in ${r.blockedSessions} of ${r.sessions} sessions since ${r.first} (last ${r.last})`);
  for (const h of HOOKS) console.log(`  ${h.name.padEnd(12)} ${String(r.counts[h.name]).padStart(5)}  ${h.what}`);
}
if (r.skipped.length && !argv.includes('--json')) console.log(`Could not read ${r.skipped.length} transcript(s): ${r.skipped.join(', ')}`);
