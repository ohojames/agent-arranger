#!/usr/bin/env node
// PreCompact hook — before Claude Code summarizes the context (auto at autoCompactWindow, or /compact),
// export the project's chats to .claude/history/ so the full conversation stays readable.
// Never blocks compaction: a failure is reported, not raised.

import path from 'node:path';
import { readStdinJson, historyDir } from './lib.mjs';
import { exportHistory } from './export-history.mjs';

const input = readStdinJson();
if (input.transcript_path) {
  try {
    exportHistory(path.dirname(input.transcript_path), historyDir(input.cwd || process.cwd()));
  } catch (err) {
    process.stderr.write(`history export failed before compact: ${err.message}\n`);
  }
}
process.exit(0);
