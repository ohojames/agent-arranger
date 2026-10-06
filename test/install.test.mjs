// install → reinstall → uninstall against a throwaway HOME; the user's own files must come back byte-identical.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aa-home-'));
const env = { ...process.env, HOME, USERPROFILE: HOME, APPDATA: path.join(HOME, 'AppData', 'Roaming') };
delete env.AGENT_ARRANGER_HOME;
// keep the host's own tools (claude on PATH) out of the test machine
env.PATH = [path.dirname(process.execPath), path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), '/usr/bin', '/bin'].join(path.delimiter);
for (const k of Object.keys(env)) if (k.toLowerCase() === 'path' && k !== 'PATH') delete env[k];
const node = (script, ...args) => spawnSync(process.execPath, [path.join(REPO, script), ...args], { env, encoding: 'utf8', cwd: HOME });
const p = (...x) => path.join(HOME, ...x);
const json = (...x) => JSON.parse(fs.readFileSync(p(...x), 'utf8'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(p(rel)), { recursive: true }); fs.writeFileSync(p(rel), text); };

function snapshot() {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { out[path.relative(HOME, f) + '/'] = 'dir'; walk(f); }
      else out[path.relative(HOME, f)] = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    }
  };
  walk(HOME);
  return out;
}

// The user's machine before install
put('.claude/CLAUDE.md', '# my own rules\nkeep me\n');
put('.claude/settings.json', JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }, null, 2) + '\n');
put('.claude/skills/vitest/SKILL.md', '---\nname: vitest\ndescription: my custom copy\n---\n');
put('.claude.json', JSON.stringify({ numStartups: 3, mcpServers: { other: { command: 'x' } } }) + '\n');
put('.gemini/GEMINI.md', 'gemini notes\n');
fs.mkdirSync(p('.codex'));
const before = snapshot();

test('install adds everything for each tool found, keeps the user’s own content', () => {
  // an MCP package already downloaded by an earlier online install
  put('.agent-arranger/node_modules/@upstash/context7-mcp/dist/index.js', '');
  const r = node('install.mjs', '--offline');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /ข้ามการดาวน์โหลด \(--offline\)/, 'offline is reported, not silent');

  const md = fs.readFileSync(p('.claude/CLAUDE.md'), 'utf8');
  assert.ok(md.startsWith('# my own rules\nkeep me\n'));
  assert.match(md, /<!-- BEGIN agent-arranger -->[\s\S]*Compact instructions[\s\S]*<!-- END agent-arranger -->/);

  const s = json('.claude/settings.json');
  assert.equal(s.theme, 'dark');
  assert.equal(s.autoCompactWindow, 300000);
  assert.equal(s.cleanupPeriodDays, 3650);
  assert.ok(JSON.stringify(s.hooks.Stop).includes('echo mine'));
  for (const ev of ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'Stop']) assert.ok(JSON.stringify(s.hooks[ev]).includes('.agent-arranger/core/'), ev);
  assert.equal(s.hooks.PreToolUse, undefined, 'guardAccount is opt-in');
  assert.equal(s.enabledPlugins['superpowers@superpowers-dev'], true);
  assert.equal(s.extraKnownMarketplaces['anthropic-agent-skills'].source.repo, 'anthropics/skills');

  const shipped = fs.readdirSync(path.join(REPO, 'skills'));
  for (const dir of ['.claude/skills', '.agents/skills', '.gemini/config/skills']) {
    for (const n of shipped) assert.ok(fs.existsSync(p(dir, n, 'SKILL.md')), `${dir}/${n}`);
  }
  assert.doesNotMatch(fs.readFileSync(p('.claude/skills/vitest/SKILL.md'), 'utf8'), /my custom copy/);
  assert.match(fs.readFileSync(p('.codex/AGENTS.md'), 'utf8'), /BEGIN agent-arranger/);
  const gemini = fs.readFileSync(p('.gemini/GEMINI.md'), 'utf8');
  assert.match(gemini, /^gemini notes\n/);
  assert.ok(Buffer.byteLength(gemini) < 24 * 1024, `Antigravity reads ≤24 KB per rules file (got ${Buffer.byteLength(gemini)})`);
  assert.match(fs.readFileSync(p('.gemini/config/rules/agent-arranger-design.md'), 'utf8'), /^---\ntrigger: always_on/);
  assert.ok(!fs.existsSync(p('.zcode')), 'tools that are not installed are skipped');
  const mcp = json('.claude.json').mcpServers;
  assert.equal(mcp.other.command, 'x');
  assert.match(mcp.context7.args[0], /context7-mcp[\\/]dist[\\/]index\.js$/);
  assert.equal(mcp['chrome-devtools'], undefined, 'missing binaries are not registered');
  assert.match(r.stdout, /ยังไม่มี: chrome-devtools/, 'missing MCP servers are reported');
  assert.ok(json('.gemini/config/mcp_config.json').mcpServers.context7);
});

test('installed hooks run from ~/.agent-arranger', () => {
  const r = spawnSync(process.execPath, [p('.agent-arranger/core/route-prompt.mjs')], {
    env, encoding: 'utf8', input: JSON.stringify({ prompt: 'แก้บั๊กในหน้า login', cwd: HOME }),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /<active-rules>/);
});

test('running install again does not duplicate hooks or lose the original backup', () => {
  const r = node('install.mjs', '--offline');
  assert.equal(r.status, 0, r.stderr);
  const stop = json('.claude/settings.json').hooks.Stop;
  assert.equal(stop.filter((g) => JSON.stringify(g).includes('.agent-arranger')).length, 2);
  assert.equal(stop.length, 3);
  assert.match(fs.readFileSync(p('.agent-arranger/backups/skills/claude/vitest/SKILL.md'), 'utf8'), /my custom copy/);
});

test('uninstall restores the machine byte-for-byte', () => {
  const r = node('uninstall.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(), before);
});
