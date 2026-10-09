#!/usr/bin/env node
// Thai/any-language voiceover with Gemini TTS -> one WAV per line + captions.srt + timeline.json
//
//   node gemini-tts.mjs --text "สวัสดีครับ" --out out/
//   node gemini-tts.mjs --script lines.txt --voice Sulafat --style "warm, calm narrator" --out out/
//
// Key: env GEMINI_API_KEY only. Requests send store:false so Google keeps no copy of the interaction.

import fs from 'node:fs/promises';
import path from 'node:path';

export const MODEL = 'gemini-3.8-flash-tts';
const LITE = 'gemini-3.8-flash-lite-tts';
const THAI = /[฀-๿]/;

export function parseArgs(argv) {
  const a = { voice: 'Kore', model: MODEL, out: 'tts-out' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    a[k] = argv[++i];
  }
  return a;
}

export function checkModel(model, lines) {
  if (![MODEL, LITE].includes(model)) throw new Error(`Unsupported model ${model}; use ${MODEL}`);
  if (model === LITE && lines.some((l) => THAI.test(l))) {
    throw new Error(`${LITE} has no Thai support; use ${MODEL}`);
  }
}

/** Seconds of audio in a PCM WAV buffer, read from its header */
export function wavSeconds(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let byteRate = 0;
  for (let p = 12; p + 8 <= buf.length; ) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(p + 16);
    if (id === 'data') return Math.min(size, buf.length - p - 8) / byteRate;
    p += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

const ts = (s) => {
  const ms = Math.round(s * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

export function buildCaptions(items) {
  let t = 0;
  const timeline = items.map(({ file, text, seconds }) => {
    const row = { file, text, start: +t.toFixed(3), end: +(t + seconds).toFixed(3) };
    t += seconds;
    return row;
  });
  const srt = timeline.map((r, i) => `${i + 1}\n${ts(r.start)} --> ${ts(r.end)}\n${r.text}\n`).join('\n');
  return { timeline, srt };
}

export async function synthesize({ text, voice, style, model }, key, fetchImpl = fetch) {
  const content = { type: 'text', text };
  // Style goes in speech_metadata only: put in front of the text it is read aloud
  if (style) content.annotations = [{ type: 'speech_metadata', style }];
  const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      input: [{ type: 'user_input', content: [content] }],
      response_format: { type: 'audio', mime_type: 'audio/wav' },
      generation_config: { speech_config: [{ voice }] },
      store: false,
    }),
  });
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}: ${(await res.text()).split(key).join('[redacted]')}`);
  const body = await res.json();
  const audio = (body.steps ?? []).filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? []).find((c) => c.type === 'audio');
  if (!audio?.data) throw new Error(`Gemini TTS returned no audio (status ${body.status ?? 'missing'})`);
  return Buffer.from(audio.data, 'base64');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Set the GEMINI_API_KEY environment variable (never pass the key as an argument)');
  const lines = a.script
    ? (await fs.readFile(a.script, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [a.text].filter(Boolean);
  if (!lines.length) throw new Error('Give --text "..." or --script lines.txt');
  checkModel(a.model, lines);
  await fs.mkdir(a.out, { recursive: true });
  const items = [];
  for (const [i, text] of lines.entries()) {
    const wav = await synthesize({ text, voice: a.voice, style: a.style, model: a.model }, key);
    const file = `${String(i + 1).padStart(3, '0')}.wav`;
    await fs.writeFile(path.join(a.out, file), wav);
    items.push({ file, text, seconds: wavSeconds(wav) });
    console.log(`${file}  ${wavSeconds(wav).toFixed(2)}s  ${text.slice(0, 40)}`);
  }
  const { timeline, srt } = buildCaptions(items);
  await fs.writeFile(path.join(a.out, 'captions.srt'), srt);
  await fs.writeFile(path.join(a.out, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log(`done: ${items.length} line(s), ${timeline.at(-1).end}s total -> ${path.resolve(a.out)}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  main().catch((e) => {
    console.error(String(e.message ?? e).split(process.env.GEMINI_API_KEY || '\0').join('[redacted]'));
    process.exit(1);
  });
}
