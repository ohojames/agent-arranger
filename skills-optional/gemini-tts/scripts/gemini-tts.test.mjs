import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCaptions, checkModel, synthesize, wavSeconds } from './gemini-tts.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gemini-tts.mjs');

function wav(seconds, rate = 24000) {
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('reads WAV length from the header', () => {
  assert.equal(wavSeconds(wav(2.5)), 2.5);
});

test('captions follow each other line by line', () => {
  const { timeline, srt } = buildCaptions([
    { file: '001.wav', text: 'หนึ่ง', seconds: 1.5 },
    { file: '002.wav', text: 'สอง', seconds: 2 },
  ]);
  assert.deepEqual(timeline.map((r) => [r.start, r.end]), [[0, 1.5], [1.5, 3.5]]);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nหนึ่ง\n\n2\n00:00:01,500 --> 00:00:03,500\nสอง\n$/);
});

test('refuses the lite model for Thai text', () => {
  assert.throws(() => checkModel('gemini-3.8-flash-lite-tts', ['สวัสดี']), /no Thai/);
  assert.doesNotThrow(() => checkModel('gemini-3.8-flash-tts', ['สวัสดี']));
});

test('style goes to speech_metadata, request has store:false, key stays in the header', async () => {
  let sent;
  const fake = async (url, init) => {
    sent = { url, init };
    return { ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'audio', data: wav(1).toString('base64') }] }] }) };
  };
  const out = await synthesize({ text: 'สวัสดี', voice: 'Kore', style: 'warm', model: 'gemini-3.8-flash-tts' }, 'SECRET', fake);
  const body = JSON.parse(sent.init.body);
  assert.equal(body.store, false);
  assert.equal(body.input[0].content[0].text, 'สวัสดี');
  assert.deepEqual(body.input[0].content[0].annotations, [{ type: 'speech_metadata', style: 'warm' }]);
  assert.equal(sent.init.headers['x-goog-api-key'], 'SECRET');
  assert.ok(!sent.url.includes('SECRET'));
  assert.equal(wavSeconds(out), 1);
});

test('HTTP errors never echo the key', async () => {
  const fake = async () => ({ ok: false, status: 400, text: async () => 'bad key SECRET' });
  await assert.rejects(synthesize({ text: 'x', voice: 'Kore', model: 'gemini-3.8-flash-tts' }, 'SECRET', fake), (e) => !e.message.includes('SECRET') && /\[redacted\]/.test(e.message));
});

test('CLI stops with a clear message when GEMINI_API_KEY is missing', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--text', 'x'], { env, stdio: 'pipe' }), (e) => /GEMINI_API_KEY/.test(e.stderr.toString()));
});
