import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

test('ai-proceed routes video, image and voiceover work to the media skills', () => {
  const s = read('skills/ai-proceed/SKILL.md');
  assert.match(s, /\*\*DOC\*\*.*video.*image.*voiceover/);
  assert.match(s, /video → `hyperframes`/);
  assert.match(s, /image → `gemini-image`/);
  assert.match(s, /voiceover → `gemini-tts`/);
  assert.match(s, /--with media/, 'a machine without the media set is told how to add it');
});

test('gemini-image and gemini-tts ship as optional skills with portable script paths', () => {
  for (const name of ['gemini-image', 'gemini-tts']) {
    const md = read(`skills-optional/${name}/SKILL.md`);
    assert.match(md, new RegExp(`^name: ${name}$`, 'm'));
    assert.doesNotMatch(md, /~\/\.claude\/skills/, 'path must work in every tool, not only Claude');
    assert.ok(fs.existsSync(path.join(REPO, `skills-optional/${name}/scripts/${name}.mjs`)));
  }
});
