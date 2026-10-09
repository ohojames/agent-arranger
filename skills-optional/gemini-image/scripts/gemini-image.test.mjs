import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRequest, generate, parseArgs, validate } from './gemini-image.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gemini-image.mjs');

test('defaults to Nano Banana 2.1, 16:9, 1K, store:false', () => {
  const a = parseArgs(['--prompt', 'x', '--out', 'a.jpg']);
  validate(a);
  const r = buildRequest(a, []);
  assert.equal(r.model, 'gemini-nano-banana-2.1');
  assert.deepEqual(r.response_format, { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '1K' });
  assert.equal(r.store, false);
});

test('reference images become image inputs after the prompt', () => {
  const a = parseArgs(['--prompt', 'x', '--out', 'a.png', '--ref', 'h.png', '--ref', 's.jpg']);
  const r = buildRequest(a, [{ mime: 'image/png', data: 'AA' }, { mime: 'image/jpeg', data: 'BB' }]);
  assert.deepEqual(r.input.map((i) => i.type), ['text', 'image', 'image']);
  assert.equal(r.response_format.mime_type, 'image/png');
});

test('rejects retired models, bad aspect and too many references', () => {
  assert.throws(() => validate(parseArgs(['--prompt', 'x', '--out', 'a.jpg', '--model', 'gemini-3.1-flash-image-preview'])), /Unsupported model/);
  assert.throws(() => validate(parseArgs(['--prompt', 'x', '--out', 'a.jpg', '--aspect', '7:3'])), /aspect/);
  const many = Array.from({ length: 15 }, (_, i) => ['--ref', `r${i}.png`]).flat();
  assert.throws(() => validate(parseArgs(['--prompt', 'x', '--out', 'a.jpg', ...many])), /14/);
});

test('returns the last image and keeps the key out of URL and errors', async () => {
  const ref = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gimg-')), 'h.png');
  fs.writeFileSync(ref, Buffer.from([1, 2, 3]));
  let sent;
  const ok = async (url, init) => {
    sent = { url, init };
    return { ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'here' }, { type: 'image', data: Buffer.from('IMG').toString('base64') }] }] }) };
  };
  const out = await generate({ ...parseArgs(['--prompt', 'x', '--out', 'a.jpg']), ref: [ref] }, 'SECRET', ok);
  assert.equal(out.toString(), 'IMG');
  assert.equal(JSON.parse(sent.init.body).input[1].data, Buffer.from([1, 2, 3]).toString('base64'));
  assert.ok(!sent.url.includes('SECRET'));
  const bad = async () => ({ ok: false, status: 403, text: async () => 'denied SECRET' });
  await assert.rejects(generate(parseArgs(['--prompt', 'x', '--out', 'a.jpg']), 'SECRET', bad), (e) => !e.message.includes('SECRET'));
});

test('explains a refusal when no image comes back', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'cannot draw that' }] }] }) });
  await assert.rejects(generate(parseArgs(['--prompt', 'x', '--out', 'a.jpg']), 'K', fake), /no image.*cannot draw that/);
});

test('CLI stops with a clear message when GEMINI_API_KEY is missing', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--prompt', 'x', '--out', 'a.jpg'], { env, stdio: 'pipe' }), (e) => /GEMINI_API_KEY/.test(e.stderr.toString()));
});
