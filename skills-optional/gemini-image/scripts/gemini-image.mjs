#!/usr/bin/env node
// Image generation / editing with Gemini (Nano Banana) for video scenes, thumbnails and infographics
//
//   node gemini-image.mjs --prompt "..." --aspect 16:9 --out scene-01.jpg
//   node gemini-image.mjs --prompt "same character, now at the beach" --ref hero.png --ref style.jpg --out scene-02.jpg
//
// Key: env GEMINI_API_KEY only. Requests send store:false.

import fs from 'node:fs/promises';
import path from 'node:path';

export const MODEL = 'gemini-nano-banana-2.1';
const MODELS = [MODEL, 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'];
const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export function parseArgs(argv) {
  const a = { model: MODEL, aspect: '16:9', size: '1K', ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (k === 'ref') a.ref.push(argv[++i]);
    else a[k] = argv[++i];
  }
  return a;
}

export function validate(a) {
  if (!a.prompt) throw new Error('Give --prompt "..."');
  if (!a.out) throw new Error('Give --out <file.jpg|file.png>');
  if (!MODELS.includes(a.model)) throw new Error(`Unsupported model ${a.model}; use one of ${MODELS.join(', ')}`);
  if (!ASPECTS.includes(a.aspect)) throw new Error(`--aspect must be one of ${ASPECTS.join(' ')}`);
  if (!['1K', '2K', '4K'].includes(a.size)) throw new Error('--size must be 1K, 2K or 4K');
  if (a.ref.length > 14) throw new Error('At most 14 reference images');
  for (const r of a.ref) if (!MIME[path.extname(r).toLowerCase()]) throw new Error(`Unsupported reference image type: ${r}`);
}

export function buildRequest(a, refs) {
  return {
    model: a.model,
    input: [{ type: 'text', text: a.prompt }, ...refs.map((r) => ({ type: 'image', mime_type: r.mime, data: r.data }))],
    response_format: {
      type: 'image',
      mime_type: path.extname(a.out).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
      aspect_ratio: a.aspect,
      image_size: a.size,
    },
    store: false,
  };
}

export async function generate(a, key, fetchImpl = fetch) {
  const refs = await Promise.all(
    a.ref.map(async (r) => ({ mime: MIME[path.extname(r).toLowerCase()], data: (await fs.readFile(r)).toString('base64') })),
  );
  const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify(buildRequest(a, refs)),
  });
  if (!res.ok) throw new Error(`Gemini image HTTP ${res.status}: ${(await res.text()).split(key).join('[redacted]')}`);
  const body = await res.json();
  const parts = (body.steps ?? []).filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? []);
  const img = parts.filter((c) => c.type === 'image' && c.data).at(-1);
  if (!img) {
    const text = parts.filter((c) => c.type === 'text').map((c) => c.text).join(' ').slice(0, 300);
    throw new Error(`Gemini returned no image (status ${body.status ?? 'missing'})${text ? ': ' + text : ''}`);
  }
  return Buffer.from(img.data, 'base64');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  validate(a);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Set the GEMINI_API_KEY environment variable (never pass the key as an argument)');
  const buf = await generate(a, key);
  await fs.mkdir(path.dirname(path.resolve(a.out)), { recursive: true });
  await fs.writeFile(a.out, buf);
  console.log(`saved ${path.resolve(a.out)} (${Math.round(buf.length / 1024)} KB, ${a.model}, ${a.aspect}, ${a.size}) — contains a SynthID watermark`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  main().catch((e) => {
    console.error(String(e.message ?? e).split(process.env.GEMINI_API_KEY || '\0').join('[redacted]'));
    process.exit(1);
  });
}
