# agent-arranger

Every stage has to prove it is done.

AI coding agents say "done" too early. aa installs one set of rules, skills and hooks into every AI coding tool on your machine (Claude Code, Codex, Google Antigravity, ZCode). In Claude Code, the hooks refuse to let the agent finish until it shows proof.

[English](#english) | [ภาษาไทย](#ภาษาไทย)

## What it caught

On the author's machine, across 55 Claude Code sessions from 2026-10-06 to 2026-10-18, aa stopped the agent 45 times in 11 sessions:

| Hook | Times | The agent was about to |
|---|---:|---|
| `bg-status` (removed 2026-10-21) | 32 | report done while background work was still running |
| `design-lint` | 12 | finish UI work that broke the project's design rules |
| `verify-stop` | 1 | say done while typecheck was failing |

That is one developer's history, not a benchmark. To count your own after a few days of use:

```bash
node ~/.agent-arranger/core/stats.mjs
```

It reads Claude Code's local transcripts and sends nothing anywhere.

## English

### Install

Requires [Node.js 18+](https://nodejs.org).

```bash
npx github:ohojames/agent-arranger
```

Or clone the repo and run `node agent-arranger/install.mjs`. Restart your AI app once afterwards. The installer detects which tools you have and installs only for those.

### From analysis to handover

Ask for a whole project ("take this from requirements to a demo deck") and `/ai-proceed` runs seven stages. A stage counts as done only after its exit check has run.

| Stage | Exit check |
|---|---|
| Analyze | every requirement has acceptance criteria, no open questions |
| Plan | every requirement maps to a plan task, and each task names its check |
| Dev | typecheck and build pass |
| Test | every acceptance criterion has a test that was run |
| Doc | every command, URL and screenshot in the document was run or taken from the real system |
| Presentation | every slide was rendered and looked at |
| Video (optional) | the rendered file plays, see [knowledge/video-stage.md](knowledge/video-stage.md) |

The agent stops for your approval after analyze and after plan. It always stops before a push, a deploy or a change to a remote database.

### What you get

| | Claude Code | Codex | Antigravity | ZCode |
|---|---|---|---|---|
| Shared working rules: verify before reporting, change every paired screen, short reports | ✅ | ✅ | ✅ | ✅ |
| 24 core skills, 32 optional ones (`--with <name>`) | ✅ | ✅ | ✅ | ✅ |
| Hooks that block an early "done" (typecheck, design rules) | ✅ | rules only | rules only | rules only |
| Lessons: a correction you repeat becomes a draft rule. You approve it, and every tool gets it | ✅ | ✅ | ✅ | ✅ |
| Guard against pushing with the wrong GitHub account (`guardAccount`) | ✅ | | | |
| Auto-compact at 300k in the same chat, chat history kept in `.claude/history/` | ✅ | | | |
| Plugins superpowers and document-skills, MCP context7 and chrome-devtools | ✅ | | context7 | |

Where a tool has no hook mechanism, the rules ask the agent to run the same checks itself.

### Commands

| Do | Command |
|---|---|
| Health check | `node ~/.agent-arranger/doctor.mjs` |
| What the hooks caught | `node ~/.agent-arranger/core/stats.mjs` |
| Uninstall and restore every file | `npx -p github:ohojames/agent-arranger agent-arranger-uninstall`, or `node uninstall.mjs` in a clone |
| Install without downloads | add `--offline` |
| Optional skills | add `--with supabase,vitest`, `--with media` (video), `--with migration` or `--with all` |

Settings live in `~/.agent-arranger/config.json`: `designRules` (default `true`), `guardAccount` (`false`), `autoCompactWindow` (`300000`), `cleanupPeriodDays` (`3650`), `optionalSkills` (`[]`). Run the installer again after editing.

### Your existing files

The installer only touches its own marked block in each rules file, hooks pointing at `~/.agent-arranger`, and the settings above. Every file it changes is backed up first, and uninstall puts it back. A test checks that the restored files match byte for byte.

### Credits

Most skills here were written by other people. aa collects them, sets them up for each tool and adds the rules and hooks around them. The source and licence of every skill are listed in [THIRD_PARTY.md](THIRD_PARTY.md), which is still being completed. The toolkit itself is MIT.

---

## ภาษาไทย

aa ติดตั้งกฎการทำงาน skills และ hooks ชุดเดียวกันให้ AI ทุกตัวในเครื่อง ใน Claude Code มี hook ที่ไม่ยอมให้ AI บอกว่าเสร็จจนกว่าจะแสดงหลักฐาน

### ติดตั้ง

ต้องมี [Node.js 18+](https://nodejs.org)

```bash
npx github:ohojames/agent-arranger
```

หรือ clone repo แล้วรัน `node agent-arranger/install.mjs` เสร็จแล้วปิดแล้วเปิดแอป AI ใหม่หนึ่งครั้ง ตัวติดตั้งจะหาเองว่าเครื่องมี AI ตัวไหนบ้าง และติดตั้งเฉพาะตัวที่มี

### ทำทั้งโปรเจกต์

สั่ง `/ai-proceed` พร้อมบอกว่าให้ทำทั้งโปรเจกต์ AI จะทำ 7 ขั้น ได้แก่ analyze, plan, dev, test, doc, presentation และ video (ถ้าติดตั้งชุดเสริม)
แต่ละขั้นนับว่าเสร็จเมื่อรันเงื่อนไขผ่านของขั้นนั้นแล้วเท่านั้น และจะหยุดให้อนุมัติหลัง analyze กับหลัง plan

### ได้อะไรบ้าง

| | Claude Code | Codex | Antigravity | ZCode |
|---|---|---|---|---|
| กฎการทำงาน (ตรวจก่อนรายงาน, แก้ให้ครบทุกจุด, รูปแบบรายงาน, ออกแบบหน้าจอ) | ✅ | ✅ | ✅ | ✅ |
| skill หลัก 24 ตัว และ skill เสริม 32 ตัว (`--with <ชื่อ>`) | ✅ | ✅ | ✅ | ✅ |
| hook ที่บล็อกการบอกว่าเสร็จก่อนเวลา (typecheck, กฎดีไซน์) | ✅ | ใช้กฎแทน | ใช้กฎแทน | ใช้กฎแทน |
| บทเรียนจากคำตำหนิที่ผู้ใช้อนุมัติแล้ว ใช้ได้ทุกเครื่องมือ | ✅ | ✅ | ✅ | ✅ |
| กัน push ด้วยบัญชี GitHub ผิด (`guardAccount`) | ✅ | | | |
| ย่อ context อัตโนมัติที่ 300k ในแชทเดิม และเก็บประวัติแชทใน `.claude/history/` | ✅ | | | |
| plugins superpowers, document-skills และ MCP context7, chrome-devtools | ✅ | | context7 | |

### คำสั่งอื่น

| ทำอะไร | คำสั่ง |
|---|---|
| ตรวจว่าทุกชิ้นทำงาน | `node ~/.agent-arranger/doctor.mjs` |
| ดูว่า hook บล็อกไปกี่ครั้ง | `node ~/.agent-arranger/core/stats.mjs` |
| ถอนการติดตั้ง (คืนไฟล์เดิมทุกไฟล์) | `npx -p github:ohojames/agent-arranger agent-arranger-uninstall` |
| ติดตั้ง git pre-commit (ตรวจดีไซน์ก่อน commit) ในโปรเจกต์ | `node ~/.agent-arranger/core/install-git-hooks.mjs --project <โฟลเดอร์>` |
| ติดตั้งโดยไม่ดาวน์โหลดอะไร | เติม `--offline` |
| เพิ่ม skill เสริม (จำไว้ใน config) | เติม `--with supabase,vitest` หรือ `--with all` |
| ชุดทำวิดีโอ ภาพ และเสียงพากย์ (HyperFrames และ Gemini ใช้ key จาก env `GEMINI_API_KEY`) | เติม `--with media` |
| ชุดย้ายข้อมูลจากระบบเดิมเข้า Postgres/Supabase (ถอดภาษาไทย TIS-620, กระทบยอดรายคอลัมน์) | เติม `--with migration` |

ตั้งค่าที่ `~/.agent-arranger/config.json` แล้วรันตัวติดตั้งซ้ำ ค่าที่มีคือ `designRules`, `guardAccount` (กัน push ด้วยบัญชี GitHub ผิด ระบุบัญชีต่อ repo ใน `~/.agent-arranger/accounts.json`), `autoCompactWindow`, `cleanupPeriodDays` และ `optionalSkills`

### ความปลอดภัยของไฟล์เดิม

ตัวติดตั้งแตะเฉพาะบล็อก `<!-- BEGIN agent-arranger -->` ในไฟล์กฎ, hook ที่ชี้ไป `~/.agent-arranger` และค่าที่ระบุข้างบน
ทุกไฟล์ที่แก้ถูกสำรองไว้ใน `~/.agent-arranger/backups/` และการถอนการติดตั้งจะคืนให้ มี test ยืนยันว่าไฟล์ที่คืนตรงทุกไบต์
skill ชื่อซ้ำกับที่คุณมีอยู่จะถูกสำรองไว้ก่อน แล้วคืนให้ตอนถอน

บันทึกส่งต่องาน `.claude/handoff.md` เขียนเฉพาะตอนสั่ง `/ai-proceed` เท่านั้น

### เครดิต

skill ส่วนใหญ่ในชุดนี้เป็นผลงานของคนอื่น aa รวบรวม ตั้งค่าให้แต่ละเครื่องมือ และเพิ่มกฎกับ hook รอบๆ ที่มาและสัญญาอนุญาตของทุก skill อยู่ใน [THIRD_PARTY.md](THIRD_PARTY.md) (กำลังเติมให้ครบ) ส่วนตัวชุดเครื่องมือเป็น MIT
