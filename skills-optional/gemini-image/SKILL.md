---
name: gemini-image
description: Generate or edit images with Gemini (Nano Banana 2.1 / Pro) for video scenes, B-roll stills, thumbnails, illustrations, infographics and characters that stay consistent across scenes. Use when the user asks to create, draw or edit an image, ทำภาพ, สร้างรูป, ภาพประกอบ, thumbnail, หรือภาพสำหรับวิดีโอ.
---

# Gemini image

```bash
node <this skill's folder>/scripts/gemini-image.mjs --prompt "<scene>" --aspect 16:9 --size 1K --out scenes/01.jpg
```

- Model `gemini-nano-banana-2.1` (default). `--model gemini-3-pro-image` only when the user asks for top quality
  (≈4× the price). `--size 2K|4K` only when needed.
- `--aspect`: 16:9 video · 9:16 Reels/TikTok/Shorts · 1:1 post · 4:5 feed. Thumbnails: 16:9.
- **Consistent characters / style**: make one reference image first, then pass it on every scene with
  `--ref hero.png` (up to 14 refs; ≤4 characters + 10 objects stay consistent). Do not rely on chat memory.
- **Edit an image**: pass it as `--ref` and describe only the change.
- Prompt in English, describe subject, setting, lighting, lens/style, mood. Name the style explicitly:
  photo, flat illustration, 3D render, watercolor, isometric infographic, etc.
- **Never ask the model to draw Thai text** — Thai is not a supported image language and comes out garbled.
  Leave clean space for text and add Thai titles/captions afterwards as an HTML overlay (HyperFrames) or in the editor.

## Rules

- Key comes from env `GEMINI_API_KEY` only. Never pass it as an argument, write it to a file, or print it.
- Images need a paid key (no free tier): ≈ $0.034 per 1K image, $0.05 2K, $0.11 4K. Before generating more
  than a few images, tell the user the count and estimated cost.
- Prompt and reference images are sent to Google (`store:false`). Ask before sending client photos or faces.
- Every image carries a SynthID watermark — say so if the client forbids AI marks.
- Open the saved file and look at it before reporting it done.

Tests: `node --test <this skill's folder>/scripts/gemini-image.test.mjs`
