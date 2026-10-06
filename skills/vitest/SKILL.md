---
name: vitest
description: Write and run Vitest unit tests with native TypeScript support, watch mode, coverage and mocking. Use when the user invokes /vitest, asks for unit tests, wants a fast test loop, or needs to cover a pure function, hook or module.
---

# Vitest — Fast Unit Testing

Reference: https://github.com/vitest-dev/vitest

## ก่อนเริ่ม — ตรวจให้ครบ

1. โปรเจกต์มี Vitest แล้วหรือยัง ถ้ามี Jest อยู่แล้วให้ถามก่อน อย่าติดตั้งซ้อนสองตัว
2. ทดสอบ component ต้องตั้ง `environment: 'jsdom'` ก่อน ไม่งั้นจะล้มด้วย
   ข้อความที่ชี้ไปผิดทาง
3. แก้บั๊ก — **เขียนเทสต์ที่ล้มก่อน** แล้วค่อยแก้ ถ้าเทสต์ผ่านตั้งแต่ยังไม่แก้
   แปลว่าเทสต์นั้นไม่ได้ครอบบั๊ก

**ต้องรัน `npx vitest run` จริงก่อนรายงาน** และรายงานตัวเลขผ่าน/ไม่ผ่านตามจริง
ถ้ามีเทสต์ถูก skip ให้บอกว่าตัวไหนและเพราะอะไร

Test logic in isolation, in milliseconds. Reach for this when the thing under
test is a function, a reducer, a parser, a hook — anything that does not need a
real browser. Use `/playwright` when it does.

## Setup

```bash
npm i -D vitest @vitest/coverage-v8
```

TypeScript needs no extra step — Vitest reads `tsconfig.json` directly. For
React components add `@testing-library/react jsdom` and set
`environment: 'jsdom'` in the config.

## Running

```bash
npx vitest                    # watch, the loop to work in
npx vitest run                # once, what CI runs
npx vitest run --coverage
npx vitest run src/lib/rtm    # one path
npx vitest --ui               # browsable results
```

## What earns a test

Cover the thing that breaks quietly:

- **Boundaries** — empty input, one item, the maximum, a null in the middle
- **Rules with a reason** — a Thai date parse, a coverage calculation, a key
  derivation. Anything where being wrong looks plausible
- **Bugs already found** — write the failing test first, then fix it. That test
  is the only thing stopping the bug returning

Do not test that a getter returns what was just set, and do not chase a coverage
number by testing framework code.

## Shape of a good test

```ts
import { describe, expect, it } from 'vitest';
import { storageKeyFor } from '@/lib/iso-files';

describe('storageKeyFor', () => {
    it('gives the same key for a Windows and a POSIX path', () => {
        expect(storageKeyFor('a\b\c.docx')).toBe(storageKeyFor('a/b/c.docx'));
    });

    it('normalises Thai so a decomposed name still resolves', () => {
        const composed = 'เอกสาร.docx'.normalize('NFC');
        const decomposed = 'เอกสาร.docx'.normalize('NFD');
        expect(storageKeyFor(decomposed)).toBe(storageKeyFor(composed));
    });
});
```

The test name states the behaviour, not the method. `it('returns hex')` tells a
future reader nothing; `it('gives the same key for a Windows and a POSIX path')`
tells them what would break.

## Mocking

```ts
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ from: () => ({ select: async () => ({ data: [] }) }) }),
}));
vi.useFakeTimers();          // remember vi.useRealTimers() after
vi.spyOn(console, 'error').mockImplementation(() => {});
```

Mock the edge of your system — the network, the clock, the filesystem. Mocking
the thing you are testing proves nothing.

## Reporting back

Give the pass/fail counts and the failing assertion verbatim. If a test was
skipped, say which and why.
