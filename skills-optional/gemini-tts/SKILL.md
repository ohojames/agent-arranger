---
name: gemini-tts
description: Generate a natural human-sounding voiceover (Thai or other languages) with Gemini TTS and get one WAV per line plus captions.srt and timeline.json ready for a video. Use when the user asks for narration, voiceover, เสียงพากย์, พากย์เสียง, อ่านบท, or audio for a video that is not part of a HyperFrames project (inside HyperFrames use /media-use with provider gemini).
---

# Gemini TTS voiceover

```bash
node <this skill's folder>/scripts/gemini-tts.mjs --script lines.txt --voice Sulafat --style "warm, calm Thai narrator, natural pauses" --out voice/
```

- One line of `lines.txt` = one caption = one WAV (`001.wav`, `002.wav` …). The script also writes
  `captions.srt` and `timeline.json` (start/end per line, read from the WAV length — no Whisper needed).
- Short text: `--text "..."` instead of `--script`.
- Model `gemini-3.8-flash-tts` (default). **Never `gemini-3.8-flash-lite-tts` for Thai** — it has no Thai; the script refuses.
- Voices (prebuilt): Kore (firm), Puck (upbeat), Charon (informative), Leda (youthful), Achernar (soft),
  Sulafat (warm), Vindemiatrix (gentle). Try 2–3 on one line and let the user pick before doing the whole script.
- Put delivery direction in `--style` only. Never prepend instructions to the text — the model reads them aloud
  or translates the script. In-text tags such as `<short pause>` `<laugh>` are fine.
- Output is WAV 24 kHz mono. MP3 needs ffmpeg: `ffmpeg -i in.wav -c:a libmp3lame -q:a 2 out.mp3`.

## Rules

- Key comes from env `GEMINI_API_KEY` only. Never pass it as an argument, write it to a file, or print it.
- The script text is sent to Google (with `store:false`). Ask before sending client-confidential scripts.
- Each call costs money on a paid key (≈ $0.0023 per 10 s of audio; doubles from 2027-01-01). Generate a
  one-line sample first, then the full script.
- Check the result by listening to one file and reading `timeline.json`; report total seconds.

Tests: `node --test <this skill's folder>/scripts/gemini-tts.test.mjs`
