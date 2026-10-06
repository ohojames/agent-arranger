# Compact instructions

When compacting the conversation (auto-compact or `/compact`), keep the usual summary sections,
then end the summary with a section that starts with the exact line `## Handoff`
(≤60 lines, Thai, facts only — no diffs or tool output), with these subsections:

### เป้าหมาย — one line: what the user is trying to achieve
### ทำแล้ว (หลักฐาน) — each finished item + the check that proved it (command → result)
### การตัดสินใจ — decision → why (only ones a later session could get wrong)
### ผู้ใช้สั่งไว้ — every correction and preference from the user, verbatim-short
### ค้างอยู่ / ขั้นถัดไป — ordered; first item = what to do next
### ไฟล์ที่เกี่ยวข้อง — path:line — why it matters
### กับดัก — gotchas found (env, accounts, flaky tests)

A hook copies this section to `.claude/handoff.md` so a new chat, another AI tool or a teammate can
continue. The full chat stays readable in `.claude/history/`. Never clear a session to save context.
