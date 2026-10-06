---
name: playwright
description: Write, run, and debug Playwright end-to-end browser tests across Chromium, Firefox and WebKit. Use when the user invokes /playwright, asks for E2E or browser tests, wants to automate a login or user flow, or needs to reproduce a UI bug in a real browser.
---

# Playwright — End-to-End Browser Testing

Reference: https://github.com/microsoft/playwright

## ก่อนเริ่ม — ตรวจให้ครบ

1. `npx playwright --version` — ยังไม่ติดตั้งให้ติดตั้งก่อน อย่าเขียนเทสต์ทิ้งไว้เฉย ๆ
2. มี `playwright.config.ts` อยู่แล้วหรือไม่ — ถ้ามี ห้ามสร้างไฟล์ config ซ้อน
3. เซิร์ฟเวอร์ที่จะทดสอบรันอยู่จริงหรือไม่ ตรวจด้วย `curl -o /dev/null -w '%{http_code}'`
   ก่อนรันเทสต์ ไม่ใช่ให้เทสต์ล้มแล้วค่อยรู้
4. เทสต์ที่ต้องล็อกอิน ต้องมี `E2E_EMAIL` / `E2E_PASSWORD` ใน environment
   ถ้าไม่มี ให้บอกผู้ใช้ อย่าใส่รหัสผ่านลงไฟล์เทสต์เด็ดขาด

**ต้องรันจริงก่อนรายงาน** เขียนเทสต์เสร็จแล้วยังไม่ได้รัน ห้ามบอกว่าเสร็จ
รายงานด้วยจำนวนผ่าน/ไม่ผ่าน และข้อความ assertion ที่ล้มแบบคำต่อคำ

Drive a real browser to prove a user flow works. Use this when the thing under
test is what a person sees and clicks — not for logic that a unit test covers
faster.

## Setup

```bash
npm init playwright@latest
```

Already installed? Check `playwright.config.ts` before adding another config.
On Windows the browsers download to `%USERPROFILE%\AppData\Local\ms-playwright`;
`npx playwright install` fetches them, `--with-deps` is Linux-only.

## Running

```bash
npx playwright test                      # every project in the config
npx playwright test tests/login.spec.ts  # one file
npx playwright test --headed --debug     # watch it, step through it
npx playwright test --ui                 # time-travel runner, best for triage
npx playwright show-report               # after a run
```

## Writing tests that do not flake

Flake almost always comes from waiting on the wrong thing. Apply these in order:

1. **Locate by what the user perceives**, not by DOM shape.
   `getByRole('button', { name: 'บันทึก' })` survives a refactor;
   `.css-1x2y3z > div:nth-child(3)` does not.
2. **Never `waitForTimeout`.** Playwright auto-waits for actionability. If you
   need a condition, assert it: `await expect(row).toBeVisible()`.
3. **Assert on state, not on having clicked.** The click is the action; the
   assertion is what the click produced.
4. **Isolate data.** A test that depends on rows another test created will fail
   the moment the order changes. Create what you need in a fixture and clean up.

```ts
import { test, expect } from '@playwright/test';

test('บันทึกความต้องการใหม่แล้วขึ้นในตาราง', async ({ page }) => {
    await page.goto('/dashboard/projects/abc/rtm');
    await page.getByRole('button', { name: 'เพิ่มความต้องการ' }).click();
    await page.getByLabel('ชื่อ/รายละเอียดความต้องการ').fill('ทดสอบ E2E');
    await page.getByRole('button', { name: 'บันทึก' }).click();

    await expect(page.getByRole('row', { name: /ทดสอบ E2E/ })).toBeVisible();
});
```

## Authenticated flows

Sign in once, reuse the storage state — do not log in in every test.

```ts
// tests/auth.setup.ts
setup('authenticate', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('อีเมล').fill(process.env.E2E_EMAIL!);
    await page.getByLabel('รหัสผ่าน').fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await page.waitForURL('**/dashboard');
    await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

Credentials come from the environment. Never commit them, and never put a real
password in a test file.

## Debugging a failure

- `--trace on` then `npx playwright show-trace` — the DOM at every step
- `await page.pause()` — opens the inspector mid-test
- Screenshots and video are config options, not something to hand-roll

## Reporting back

State what passed, what failed, and the assertion that failed — with the actual
versus expected value. A run that "mostly passed" is a failed run.
