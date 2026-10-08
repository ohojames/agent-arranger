---
name: ai-proceed
description: Use when the user types /ai-proceed, or says "จัดการให้จบ", "ทำให้เลย", "ดำเนินการต่อเอง" or similar without naming any skill — they want the agent to choose the skills itself and carry the task to a verified result.
---

# ai-proceed — one command, right-sized process

The user does not remember skill names. Pick the route from the task's size, announce it, stay inside the overhead budget, and finish with evidence. Global rules (CLAUDE.md) still apply in full; this skill decides only *which* skills and *how much* process. While this skill is active, its route replaces the superpowers "1% rule" for choosing skills — the user chose this command for that purpose.

## 1. Size the task (first match wins)

| Size | Predicate |
|---|---|
| **DOC** | Output is a deck, document, spreadsheet, diagram or research note — not code |
| **SHIP** | Prompt asks *only* to push, merge, release or deploy existing work |
| **BUG** | Something that used to work is failing (error, 500, wrong number, missing data) |
| **L** | New module/flow, OR new tables, OR 3+ pages, OR schema + permission change together, OR 3+ independent work units |
| **M** | Touches a field across add/edit/view, a DB column, an RLS policy or permission, a shared component, one new page on existing data, or 3+ files |
| **S** | Everything else: ≤2 files, wording/style/config, intent unambiguous |

Work **and** deploy in one prompt ("แก้แล้ว deploy เลย"): size the work, run its route, then append the SHIP route. Announce as `<size>+SHIP`.

Size from the prompt first (provisional). After the first look at the code, if the size changed, print a new announce line and continue — but wait for the user when the new size is L or SHIP, or the overhead estimate passes 50k.

## 2. Announce — the first line of your reply, always

```
งานขนาด: <DOC|SHIP|BUG|S|M|L>[+SHIP] · เส้นทาง: <skill → skill → …> · งบส่วนเพิ่ม: ~<N>k token
```

Print your own estimate for this task, not the table value.

## 3. Route

| Size | Route | Typical overhead |
|---|---|---:|
| S | `code` → verification-before-completion | ~3k |
| BUG | systematic-debugging → reproduce (failing test; or a failing check such as curl / log / SQL when the cause is env, RLS or data) → `code` → verification-before-completion | ~10k |
| M | open questions in **one** message (max 5; none → skip and list defaults under "สมมติฐาน") → inline plan ≤8 lines, no plan file → `code` → verification-before-completion | ~10k |
| L | brainstorming (questions batched) → writing-plans → executing-plans → requesting-code-review → verification-before-completion | ~35k |
| SHIP | verify-push → the deploy checklist in the global rules ("Before deploying" / section 2) → **stop and ask** before the final push/deploy command | ~8k |
| DOC | one entry skill: deck → `slide-design` (the sub-skill it delegates to is allowed); Word/Excel/PDF → `docx`/`xlsx`/`pdf`; diagram → `diagram-design`; research → `research` | ~10k |

- Load only skills on the route. Any other skill needs a one-line reason (e.g. `supabase` because the bug is in RLS).
- Duplicate names (`docx` vs `document-skills:docx`): use the unprefixed one; fall back to the prefixed one if missing.
- L has at most two planning gates: (1) batched questions + estimate, (2) design/plan approval. Outward-command stops (§5) are separate and always apply.

## 3b. Security layer (skill `security-check`, levels defined there)

| Route | Add |
|---|---|
| S, BUG, M, L | level **diff** before verification |
| M, L, BUG touching login, permission/RLS, user input, upload, payment or API | level **change** |
| SHIP (and `+SHIP`) | level **gate** before the stop — high/critical findings go into the stop question |

Overhead: diff ~1k, change ~8k, gate ~3k. Write the added level into the announce line's route.

## 4. Overhead budget: 50k tokens

Overhead = skill loading + questions + plans + subagents + reviews. The work itself (reading, editing, required checks and screenshots) is not overhead.

- Count **every** dispatched subagent at 20k, including the code reviewer.
- subagent-driven-development only when the plan has 3+ independent tasks **and** total overhead stays under 50k; otherwise executing-plans in this session.
- Estimate over 50k → stop at gate 1, show the estimate and a cheaper option (e.g. split into phases).

## 5. Ask, don't assume

Choices the user owns — vendor (email, payment), approver roles, data source, period ("ไตรมาสนี้"), target project or account — go into the batched questions. Proceeding on a default → list it under "สมมติฐาน".

Outward commands always stop for a yes: push, deploy, and applying a migration or data change to any non-local database. A BUG or M task that needs one of these ends with the SHIP stop.

## 6. Finish

Report in the global short format (rules §6: **ผล** line → one table → questions → not done; 12 lines max). Under the table add one line: `ใช้: <skills actually used> · งบส่วนเพิ่มจริง: ~<N>k`.
When the task changed one value in many places (colour, class, label, field name), the table's evidence column shows the search count `ก่อน N → หลัง 0` (or each remaining hit with its reason). No count, no "ครบ".
If the turn carried a `<context-size>` notice, the last line of the report says auto-compact did not run and to check `autoCompactWindow` — never clear the session.
If a route skill is not installed in this tool (Antigravity, Cursor), follow its intent inline and say so in the report.

## 7. Handoff note — written only here

No hook writes `.claude/handoff.md`; this skill is its only writer. After the report:

1. Path: `<repo root, or cwd>/.claude/handoff.md`. If it exists, copy it to `.claude/history/handoff/<YYYY-MM-DD-HH-mm-ss>.md` first.
2. Write ≤60 lines, facts only, these sections: `เป้าหมาย` · `ทำแล้ว (หลักฐาน)` (item + check → result) · `การตัดสินใจ` · `ผู้ใช้สั่งไว้` (every correction, verbatim-short) · `ค้างอยู่ / ขั้นถัดไป` · `ไฟล์ที่เกี่ยวข้อง` · `กับดัก`. Keep items from the old note that are still open; no diffs or tool output.
3. Claude Code: export the chat — `node "<home>/.agent-arranger/core/export-history.mjs" "<folder in <home>/.claude/projects/ holding this session's .jsonl>" "<root>/.claude/history"` (`<home>` = the user's home folder as an absolute path).
4. Git repo → make sure `.claude/` is in `.git/info/exclude`.
5. Add one line to the report: `บันทึก handoff: <path> (<N> บรรทัด)`. Never clear or restart the session — context is shrunk by auto-compact.

## Common mistakes

| Mistake | Fix |
|---|---|
| Brainstorming + spec doc for a one-field change | That is M: one question message, inline plan |
| Asking questions one per turn | Batch them in one message |
| Picking a vendor, period or library silently | Put it in the questions or under "สมมติฐาน" |
| Treating "deploy" as approval for the final command | SHIP always stops before the outward command |
| Running a migration on a remote DB inside an M task | Outward command: stop and ask |
| Inventing a unit test for an env/RLS failure | Reproduce with a failing check |
| Loading 2–3 overlapping slide/doc skills | DOC uses one entry skill |
| Announcing the table's budget for a big task | Print your own estimate |
