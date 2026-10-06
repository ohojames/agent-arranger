# agent-arranger

ติดตั้งกฎการทำงาน, skills, hooks และ MCP ชุดเดียวกันให้ AI ทุกตัวในเครื่อง ด้วยคำสั่งเดียว
One command to give every AI coding tool on your machine the same rules, skills, hooks and MCP servers.

[ภาษาไทย](#ภาษาไทย) · [English](#english)

---

## ภาษาไทย

### ติดตั้ง

ต้องมี [Node.js 18+](https://nodejs.org) และ git

```bash
git clone https://github.com/ohojames/agent-arranger.git
```

```bash
node agent-arranger/install.mjs
```

เสร็จแล้วปิดแล้วเปิดแอป AI ใหม่หนึ่งครั้ง ตัวติดตั้งจะหาเองว่าเครื่องมี AI ตัวไหนบ้าง และติดตั้งเฉพาะตัวที่มี

### ได้อะไรบ้าง

| | Claude Code | Codex / ChatGPT (โหมด Codex) | Antigravity | ZCode |
|---|---|---|---|---|
| กฎการทำงาน (ตรวจก่อนรายงาน, แก้ให้ครบทุกจุด, รูปแบบรายงาน, ออกแบบหน้าจอ) | ✅ | ✅ | ✅ | ✅ |
| 43 skills (+ `docx` ผ่าน plugin) | ✅ | ✅ | ✅ | ✅ |
| hooks: ฉีดกฎตามงาน, ตรวจ typecheck ก่อนบอกเสร็จ, ตรวจดีไซน์, เก็บบทเรียน | ✅ | — | — | — |
| ย่อ context อัตโนมัติที่ 300k ในแชทเดิม + เก็บประวัติแชทครบใน `.claude/history/` | ✅ | — | — | — |
| plugins: superpowers, document-skills | ✅ | — | — | — |
| MCP: context7, chrome-devtools | ✅ | — | context7 | — |

ช่องที่เป็น — คือ AI ตัวนั้นยังไม่รองรับกลไกนี้ กฎในไฟล์จะบอกให้ AI ทำตามเองแทน

บันทึกส่งต่องาน (`.claude/handoff.md` สำหรับแชทใหม่ / AI ตัวอื่น / เพื่อนร่วมทีม) เขียนเฉพาะตอนสั่ง `/ai-proceed` เท่านั้น ไม่มีระบบอัตโนมัติไปเขียนทับ

### ตั้งค่า

แก้ `~/.agent-arranger/config.json` แล้วรัน `node install.mjs` ซ้ำ

| ค่า | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `designRules` | `true` | กฎหน้าจอ (Tailwind) + ตัวตรวจดีไซน์ ปิดได้ถ้าทีมไม่ใช้ Tailwind |
| `guardAccount` | `false` | กันการ push ด้วยบัญชี GitHub ผิด (สำหรับคนที่มีหลายบัญชี) ระบุบัญชีต่อ repo ใน `~/.agent-arranger/accounts.json` |
| `autoCompactWindow` | `300000` | ย่อ context เมื่อใกล้ค่านี้ (100000–1000000) |
| `cleanupPeriodDays` | `3650` | เก็บ log แชทของ Claude กี่วัน |

### คำสั่งอื่น

| ทำอะไร | คำสั่ง |
|---|---|
| ตรวจว่าทุกชิ้นทำงาน | `node doctor.mjs` |
| อัปเดต | `git pull` แล้ว `node install.mjs` |
| ถอนการติดตั้ง (คืนไฟล์เดิมทุกไฟล์) | `node uninstall.mjs` |
| ติดตั้ง git pre-commit (ตรวจดีไซน์ก่อน commit) ในโปรเจกต์ | `node ~/.agent-arranger/core/install-git-hooks.mjs --project <โฟลเดอร์>` |
| ติดตั้งโดยไม่ดาวน์โหลดอะไร | `node install.mjs --offline` |

### ความปลอดภัยของไฟล์เดิม

- ตัวติดตั้งแตะเฉพาะส่วนของตัวเอง: บล็อก `<!-- BEGIN agent-arranger -->` ในไฟล์กฎ, hook ที่ชี้ไป `~/.agent-arranger`, คีย์ที่ระบุในตารางข้างบน
- ทุกไฟล์ที่แก้ถูกสำรองไว้ใน `~/.agent-arranger/backups/` และ `uninstall.mjs` คืนค่าเดิมให้ (มี test ยืนยันว่าคืนได้ตรงทุกไบต์)
- skill ชื่อซ้ำกับที่คุณมีอยู่จะถูกสำรองไว้ก่อน แล้วคืนให้ตอนถอน

---

## English

### Install

Requires [Node.js 18+](https://nodejs.org) and git.

```bash
git clone https://github.com/ohojames/agent-arranger.git
```

```bash
node agent-arranger/install.mjs
```

Restart your AI app once. The installer detects which tools you have (Claude Code, Codex / ChatGPT desktop in Codex mode, Google Antigravity, ZCode) and installs only for those.

### What you get

- **All tools:** shared working rules and 43 skills (plus `docx` through the document-skills plugin).
- **Claude Code (full set):** hooks that inject task-specific rules, block "done" while typecheck fails, lint UI against the design scale and learn from repeated corrections; automatic context compaction at 300k tokens in the same chat with the full chat history kept in `.claude/history/`; the superpowers and document-skills plugins; MCP servers context7 and chrome-devtools.
- **Antigravity:** MCP context7 (it has its own browser tool).
- The hand-off note `.claude/handoff.md` (for a new chat, another AI tool or a teammate) is written only when you run `/ai-proceed` — never automatically.

### Configure

Edit `~/.agent-arranger/config.json`, then run `node install.mjs` again: `designRules` (default `true`), `guardAccount` (`false`), `autoCompactWindow` (`300000`), `cleanupPeriodDays` (`3650`).

### Other commands

`node doctor.mjs` (health check) · `git pull && node install.mjs` (update) · `node uninstall.mjs` (restore every file) · `node install.mjs --offline` (no downloads).

### Your existing files

The installer only touches its own marked block, hooks pointing at `~/.agent-arranger`, and the settings listed above. Every file it changes is backed up and `uninstall.mjs` restores it — a test checks the machine comes back byte-for-byte.

### Licence

MIT for the toolkit. Skills keep their authors' licences — see [THIRD_PARTY.md](THIRD_PARTY.md).
