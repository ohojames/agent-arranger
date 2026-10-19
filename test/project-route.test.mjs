// node --test test/project-route.test.mjs  — ai-proceed's PROJECT route: every stage has real skills and a checkable exit
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PLUGINS } from '../setup/common.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
// skills that come from the plugins the installer adds, not from skills/
const FROM_PLUGINS = { 'superpowers@superpowers-dev': ['writing-plans', 'verification-before-completion'], 'document-skills@anthropic-agent-skills': ['docx', 'pdf'] };
const STAGES = ['analyze', 'plan', 'dev', 'test', 'doc', 'presentation', 'video'];

test('PROJECT is sized first and stops for approval after analyze and plan', () => {
  const s = read('skills/ai-proceed/SKILL.md');
  const sizes = [...s.matchAll(/^\| \*\*([A-Z]+)\*\* \|/gm)].map((m) => m[1]);
  assert.equal(sizes[0], 'PROJECT', 'a whole project also contains docs and bugs, so it must match before DOC/BUG');
  assert.match(s, /stop for approval after \*\*analyze\*\* and after \*\*plan\*\*/);
});

test('a bug fix is captured before and after, within a 2-minute budget, and never skipped silently', () => {
  const s = read('skills/ai-proceed/SKILL.md');
  const bug = s.match(/^\| BUG \| (.+) \|/m)?.[1] || '';
  assert.match(bug, /reproduce.*capture before \(§3d\).*`code`.*capture after \(§3d\).*verification/);
  const section = s.split('## 3d. Change evidence')[1]?.split('\n## ')[0] || '';
  assert.match(section, /\*\*2 minutes\*\*/);
  assert.match(section, /ไม่ได้ capture เพราะ/);
  assert.match(section, /BUG without a screen.*required/);
  for (const f of ['core/mark.js', 'core/evidence.mjs', 'knowledge/change-evidence.md']) {
    assert.ok(section.includes(f), `${f} is referenced`);
    assert.ok(fs.existsSync(path.join(REPO, f)), `${f} exists`);
  }
  assert.match(read('rules/30-report.md'), /`ตรวจ:` ที่ `evidence\.mjs`.*ไม่ได้ capture เพราะ/);
});

test('ai-proceed starts on its own for change requests but writes the handoff only when called by name', () => {
  const s = read('skills/ai-proceed/SKILL.md');
  const description = s.match(/^description: (.+)$/m)[1];
  assert.match(description, /every request that changes or creates something/);
  assert.match(description, /Skip it for questions/);
  assert.match(s.split('## 7. Handoff')[1], /only when the user called this skill by name/);
});

test('every PROJECT stage names installed skills and an exit check', () => {
  const s = read('skills/ai-proceed/SKILL.md');
  const section = s.split('## 3c. PROJECT stages')[1]?.split('\n## ')[0];
  assert.ok(section, 'section 3c exists');
  const rows = [...section.matchAll(/^\| (\w+) \| (.+?) \| (.+?) \|$/gm)].filter((m) => STAGES.includes(m[1]));
  assert.deepEqual(rows.map((m) => m[1]), STAGES);
  const local = fs.readdirSync(path.join(REPO, 'skills'));
  const plugin = Object.entries(FROM_PLUGINS).filter(([id]) => PLUGINS.some((p) => p.id === id)).flatMap(([, names]) => names);
  for (const [, stage, skills, exit] of rows) {
    for (const [, name] of skills.matchAll(/`([\w-]+)`/g)) {
      assert.ok(local.includes(name) || plugin.includes(name), `${stage}: skill ${name} is not installed by aa`);
    }
    assert.ok(exit.trim().length > 10, `${stage}: exit check is missing`);
  }
  assert.match(section, /knowledge\/video-stage\.md/);
  assert.ok(fs.existsSync(path.join(REPO, 'knowledge', 'video-stage.md')));
});
