# Video stage (optional)

The last stage of the PROJECT route in `skills/ai-proceed`. It is not in the core set: most projects do not need a video, and the voice and image steps are paid. This note is what to read when a project does need one.

## What already exists in this repo

All of these live in `skills-optional/` and are installed together as the `media` set:

| Skill | Use it for | Cost |
|---|---|---|
| `hyperframes`, `hyperframes-core`, `hyperframes-cli`, `hyperframes-audio` | Build the video as HTML scenes and render it to MP4 | Renders on your machine |
| `general-video`, `faceless-explainer` | Scene planning for a product demo or an explainer with no footage | None by itself |
| `embedded-captions` | Captions burned into the video | None by itself |
| `media-use` | Pick music, sound effects, images and voice for a HyperFrames project | Depends on the source it resolves to |
| `gemini-tts` | Voiceover, one WAV per line plus `captions.srt` | Paid, Google Gemini API |
| `gemini-image` | Stills, thumbnails, illustrations | Paid, Google Gemini API |
| `gemini-api-dev` | Reference for calling the Gemini API | None by itself |

## Install

```bash
npx github:ohojames/agent-arranger --with media
```

Or run `node install.mjs --with media` in a clone of the repo. The Gemini skills read the key from the `GEMINI_API_KEY` environment variable only. Never put the key in a file or a command line.

## How the stage runs

1. Inputs come from earlier stages: the slide deck and the docs in `docs/project/`, and screenshots taken from the running system.
2. Write the script first and get it approved. Voice and image calls cost money per request, so state how many calls and ask before generating.
3. Build the scenes with HyperFrames, add voice and captions, then render.

## Exit check

The stage is done when the rendered file plays:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 out.mp4
```

The output must be a duration above zero, and its length should match the script within a few seconds. If the media set is not installed, report the stage as skipped. Do not report it as done.

## Extending

A new video tool belongs in `skills-optional/` and in the `media` group in `install.mjs`, and it must have the same exit check. Credit its source in `THIRD_PARTY.md`.
