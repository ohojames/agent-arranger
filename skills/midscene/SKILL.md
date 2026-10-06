---
name: midscene
description: Drive a browser by describing what to do in plain language, using an AI model that looks at the screen. Use when the user invokes /midscene, wants UI automation without CSS selectors, needs to test a UI that changes shape often, or wants to assert on what a screen looks like.
---

# Midscene — Natural-Language UI Automation

Reference: https://github.com/web-infra-dev/midscene

## ก่อนเริ่ม — ตรวจให้ครบ

1. มี API key ของโมเดลที่มองภาพได้ใน environment หรือยัง ถ้าไม่มีให้บอกผู้ใช้
   ห้ามเขียน key ลงไฟล์
2. งานนี้ควรใช้ `/playwright` แทนหรือไม่ — ถ้าเป็น flow ที่ต้องผ่านทุกครั้งใน CI
   **ให้ใช้ Playwright** Midscene ช้า เสียเงินต่อครั้ง และไม่ deterministic
3. ห้ามวนลูปเรียก `ai()` กับข้อมูลหลายร้อยแถว ทุกครั้งคือการเรียกโมเดล

**เวลารายงานผลต้องบอกว่า assertion นั้นตัดสินโดยโมเดล** มันเป็นหลักฐาน
แต่ไม่ใช่หลักฐานชั้นเดียวกับการเทียบข้อความตรง ๆ และให้อ่าน `midscene_run/`
ก่อนสรุปว่าแอปพัง เพราะอาจเป็นโมเดลอ่านหน้าจอผิด

The model looks at a screenshot and acts on what it sees, so the instruction is
"คลิกปุ่มบันทึกความต้องการ" rather than a selector. That makes it resilient to
markup changes and useful on a UI that is still moving — and slower, and not
deterministic, which is the trade being made.

## Choosing this over Playwright

| Use Midscene | Use `/playwright` |
|---|---|
| Layout changes every few days | Flow is stable and must never regress |
| Assertion is visual: "ตารางแสดงครบ 6 คอลัมน์" | Assertion is exact text or a value |
| Exploring or reproducing a bug by hand | Running in CI on every push |

A suite that must gate a deploy should be Playwright. Midscene is for the cases
where writing selectors costs more than it saves.

## Setup

```bash
npm i -D @midscene/web
```

Needs a vision-capable model. Set the key in the environment, never in a file:

```
OPENAI_API_KEY=...          # or the provider Midscene is configured for
MIDSCENE_MODEL_NAME=...
```

Midscene writes a run report to `midscene_run/` — screenshots plus what the
model decided at each step. Read that first when something goes wrong; it shows
whether the model misread the screen or the app actually misbehaved.

## Use with Playwright's driver

```ts
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { test as base } from '@playwright/test';

const test = base.extend(PlaywrightAiFixture());

test('เพิ่มความต้องการใหม่ได้', async ({ page, ai, aiAssert }) => {
    await page.goto('/dashboard/projects/abc/rtm');
    await ai('คลิกปุ่มเพิ่มความต้องการ');
    await ai('กรอกชื่อความต้องการว่า "ทดสอบด้วย AI" แล้วกดบันทึก');
    await aiAssert('ตารางความต้องการมีแถวที่ชื่อ "ทดสอบด้วย AI"');
});
```

`ai()` acts. `aiQuery()` extracts data. `aiAssert()` checks and throws.

## Writing instructions the model follows

- **One action per call.** "กรอกฟอร์มแล้วบันทึกแล้วตรวจผล" gives the model three
  chances to go wrong in one step and no way to tell you which.
- **Say what is on screen**, not what is in the code. The model cannot see
  `data-testid`.
- **Assert separately from acting.** An `ai()` that "checks" something returns
  nothing you can fail a build on.

## Cost and honesty

Every call is a model call — it costs money and takes seconds. Do not put this
in a loop over 200 rows. And when reporting results, say that the assertion was
made by a model: it is evidence, but it is not the same evidence as a string
comparison.
