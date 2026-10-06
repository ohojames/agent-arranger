import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where install.mjs puts the toolkit and its local state (config, learning, baselines). */
export function arrangerHome() {
  return process.env.AGENT_ARRANGER_HOME || path.join(os.homedir(), '.agent-arranger');
}

export const DEFAULT_CONFIG = {
  designRules: true, // UI rules (Tailwind scale) + design-lint Stop hook
  guardAccount: false, // block outbound git/gh when the active gh account is not the repo's
  autoCompactWindow: 300000,
  cleanupPeriodDays: 3650,
};

export function config() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(path.join(arrangerHome(), 'config.json'), 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Context size of the conversation = input of the last assistant turn in the transcript (0 if unknown). */
export function contextTokens(transcriptPath) {
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 1 << 20); // the last turn is near the end; avoid reading huge transcripts
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      try {
        const j = JSON.parse(lines[i]);
        const u = j.type === 'assistant' && j.message?.usage;
        if (u) return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      } catch {
        // the first line of the window may be cut mid-record
      }
    }
    return 0;
  } catch {
    return 0;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ---------- learning from repeated corrections ----------
// Patterns came from 63 real correction prompts in our transcripts (2026-10-04 analysis).
// "ทุกหน้า"/"ทุกจุด" alone are instructions, not complaints, so they are not in the pattern.
export const CORRECTION_RE = /ไม่ครบ|อีกแล้ว|บอกแล้ว|บอกไปแล้ว|เคยบอก|เคยแจ้ง|ยังไม่(ได้)?(แก้|เปลี่ยน)|ทำไม(มึง|คุณ)?(ยัง)?ไม่|ผิดอีก|ตกหล่น|ลืม/;
// Relayed subagent reports and harness notifications also arrive through UserPromptSubmit.
export const NOT_FROM_USER_RE = /^\s*(Another Claude session sent a message|\[SYSTEM NOTIFICATION|<task-notification>|<agent-message)/;
export const LESSON_TAGS = ['ship', 'fix', 'build', 'ui', 'db', 'change-all', 'any'];

export function correctionTopic(text) {
  if (/สี|color|ฟอนต์|ตัวอักษร|สไตล์|style/i.test(text)) return 'สี/สไตล์';
  if (/ฟิลด์|field|หน้าเพิ่ม|หน้าแก้ไข|หน้าดู|ฟอร์ม|form/i.test(text)) return 'ฟิลด์/ฟอร์มไม่ครบทุกหน้า';
  if (/ทดสอบ|test|เช็ค|ตรวจ|verify/i.test(text)) return 'ไม่ได้ทดสอบ/ตรวจ';
  if (/รายงาน|report|format|รูปแบบ/i.test(text)) return 'ลืมรูปแบบที่สั่งไว้';
  return 'อื่นๆ';
}

export function learningDir() {
  return process.env.AGENT_ARRANGER_LEARNING_DIR || path.join(arrangerHome(), 'learning');
}

export function readLessons() {
  try {
    return JSON.parse(fs.readFileSync(path.join(learningDir(), 'lessons.json'), 'utf8'));
  } catch {
    return [];
  }
}

export function writeLessons(list) {
  fs.mkdirSync(learningDir(), { recursive: true });
  fs.writeFileSync(path.join(learningDir(), 'lessons.json'), JSON.stringify(list, null, 1) + '\n');
}

/** Written by the ai-proceed skill only, read by load-handoff: <repo root or cwd>/.claude/handoff.md */
export function handoffFile(cwd) {
  const root = run('git', ['rev-parse', '--show-toplevel'], cwd) || cwd;
  return path.join(root, '.claude', 'handoff.md');
}

export function historyDir(cwd) {
  return path.join(path.dirname(handoffFile(cwd)), 'history');
}

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
      windowsHide: true,
    }).trim();
  } catch {
    return '';
  }
}

const CACHE = path.join(os.tmpdir(), 'agent-arranger-gh.json');
const CACHE_TTL_MS = 120_000;

/** ชื่อบัญชี gh ที่ active อยู่ อ่านผ่าน `gh auth status` เท่านั้น (token ถูกปิดบังไว้แล้ว) */
export function activeGhAccount() {
  try {
    const st = fs.statSync(CACHE);
    if (Date.now() - st.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    }
  } catch {
    /* ไม่มี cache ก็อ่านใหม่ */
  }

  const out = run('gh', ['auth', 'status'], process.cwd());
  const accounts = [...out.matchAll(/Logged in to \S+ account (\S+)/g)].map((m) => m[1]);
  let active = null;
  const blocks = out.split(/Logged in to \S+ account /).slice(1);
  blocks.forEach((b, i) => {
    if (/Active account:\s*true/.test(b)) active = accounts[i];
  });

  const result = { active, accounts };
  try {
    fs.writeFileSync(CACHE, JSON.stringify(result));
  } catch {
    /* cache เขียนไม่ได้ก็ไม่เป็นไร */
  }
  return result;
}

export function gitInfo(cwd) {
  const root = run('git', ['rev-parse', '--show-toplevel'], cwd);
  if (!root) return null;
  const url = run('git', ['remote', 'get-url', 'origin'], cwd);
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return {
    root,
    url,
    branch,
    owner: m ? m[1] : null,
    repo: m ? m[2] : null,
  };
}

/** อ่านเฉพาะ NEXT_PUBLIC_SUPABASE_URL ซึ่งเป็นค่าสาธารณะ ไม่แตะ key ใดๆ */
export function supabaseRef(root) {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    try {
      const line = fs
        .readFileSync(p, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
      if (!line) continue;
      const host = line.slice('NEXT_PUBLIC_SUPABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      const m = host.match(/https?:\/\/([a-z0-9-]+)\.supabase\./i);
      if (m) return m[1];
    } catch {
      /* ไม่มีไฟล์ก็ข้าม */
    }
  }
  return null;
}

export function vercelProject(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
    return j.projectName || j.projectId || null;
  } catch {
    return null;
  }
}

export function isTypeScriptProject(root) {
  return fs.existsSync(path.join(root, 'tsconfig.json'));
}

/**
 * บัญชี gh ที่ต้องใช้กับ repo นี้
 * ค่าเริ่มต้นคือชื่อ owner ซึ่งถูกเฉพาะ repo ส่วนตัว
 * repo ที่เราเข้าในฐานะ collaborator ชื่อ owner ไม่ใช่บัญชีเรา ต้อง map ใน ~/.agent-arranger/accounts.json
 */
export function expectedGhAccount(git) {
  if (!git?.owner) return null;
  try {
    const p = path.join(arrangerHome(), 'accounts.json');
    const map = JSON.parse(fs.readFileSync(p, 'utf8'))?.github || {};
    return map[`${git.owner}/${git.repo}`] || map[`${git.owner}/*`] || git.owner;
  } catch {
    return git.owner;
  }
}

/** รวมข้อมูลบริบทของโปรเจกต์ที่ cwd อยู่ */
export function projectContext(cwd) {
  const git = gitInfo(cwd);
  const root = git?.root || cwd;
  const gh = activeGhAccount();
  const expected = expectedGhAccount(git);
  return {
    root,
    git,
    gh,
    expected,
    supabase: supabaseRef(root),
    vercel: vercelProject(root),
    ts: isTypeScriptProject(root),
    // Off unless enabled: for a collaborator the repo owner is not their account, so a default-on check would block them.
    mismatch: Boolean(config().guardAccount && expected && gh.active && expected !== gh.active),
  };
}

export function renderContextBlock(ctx) {
  const lines = ['<project-context>'];
  if (ctx.git?.owner) {
    lines.push(`repo           : ${ctx.git.owner}/${ctx.git.repo} (branch ${ctx.git.branch})`);
  } else {
    lines.push('repo           : ไม่ใช่ git repo ของ GitHub');
  }
  lines.push(`gh account ที่ active : ${ctx.gh.active || 'ไม่พบ'}`);
  if (ctx.gh.accounts.length > 1) {
    lines.push(`gh account ที่มีในเครื่อง : ${ctx.gh.accounts.join(', ')}`);
  }
  if (ctx.supabase) lines.push(`supabase ref   : ${ctx.supabase}`);
  if (ctx.vercel) lines.push(`vercel project : ${ctx.vercel}`);
  if (ctx.mismatch) {
    lines.push('');
    lines.push(`!! MISMATCH !! repo นี้ต้องใช้บัญชี ${ctx.expected} แต่ gh active คือ ${ctx.gh.active}`);
    lines.push(`   ห้าม push / gh pr / deploy จนกว่าจะรัน:`);
    lines.push(`   gh auth switch --hostname github.com --user ${ctx.expected}`);
  }
  lines.push('</project-context>');
  return lines.join('\n');
}
