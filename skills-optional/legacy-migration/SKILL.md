---
name: legacy-migration
description: Use when moving data from an old system (MySQL/MariaDB, SQL Server, MS Access, Excel/CSV, old PHP apps) into a new database such as Supabase/Postgres, ย้ายข้อมูลจากระบบเดิม, นำเข้าข้อมูลเก่า, or when reporting how complete a migration is. Also when Thai text from a legacy system shows as 'ÊÁªÒÂ', ???? or boxes.
---

# Legacy migration

Every source row and every non-null source value must end up in exactly one place: the target, the reject
table, or a loss the user accepted with a reason. Prove it per column before saying anything about completeness.

## Steps

Copy `scripts/*.mjs` into the project's migration folder and import them from there.

1. **Profile the source** (read only): `COUNT(*)` and a non-empty count for every column, top values of code
   columns (type/status/sex), and `HEX(col)` of a few text values. Old PHP apps store `''`, `0` and
   `0000-00-00` instead of NULL: count with the same emptiness rule the transform uses
   (`COUNT(NULLIF(TRIM(col),''))`), or reconcile reports losses that are not real.
2. **Thai text**: read text columns as bytes (`HEX(col)` works through any client, phpMyAdmin included;
   SQL Server `CONVERT(varbinary(max), col)`), never through the driver's charset. Decode with `decodeThai()`
   (files: `node thai-decode.mjs in.csv out.csv`). Any reported value is a reject, never a silent replace.
3. **Code values**: cross-tab each code against an independent signal *before* writing (sex × title
   นาย/นาง/นางสาว, person type × ID format). "The old code says 1 = male" is a guess until the cross-tab agrees.
   Mostly disagreeing → the mapping is reversed: stop. A few disagreeing → reject those rows.
   Repeat the cross-tab on the target after loading.
4. **Dates**: convert `DATETIME` as a string (`CAST(col AS CHAR)`), not through a JS `Date` — no timezone
   shift. Years > 2400 are Buddhist Era: reject and ask, never subtract 543 silently.
5. **Load** with a new migration file for any schema change: a unique index on `legacy_id` and a reject table
   (`reason text`, `src jsonb` holding the source values so it can be counted per column, RLS on with no policy —
   it holds personal data). Stage in a temp table, then `INSERT … ON CONFLICT (legacy_id) DO UPDATE`.
   Before the first run, `count(legacy_id)` on the target must be 0 — existing rows with a `legacy_id` would be
   overwritten.
6. **Reconcile**: count the same columns on the target (`WHERE legacy_id IS NOT NULL`) and the reject table, fill
   `counts.json` (format in the script header; a loss the user accepted goes in `map` as `{ to, lost, reason }`) and run `node reconcile.mjs counts.json`. Exit 1 = not done.
7. **Report** the reconcile table. Row completeness divides by *all* source rows; column completeness is
   target ÷ source non-null for that column. Rows that hold only a payload stay in both denominators — their
   null columns are already absent from the column count, so nothing needs excluding.

## The target table already has rows

Leave them. Never `DELETE`/`TRUNCATE` the real table, not even after a backup and not when the user says
"ล้างแล้วใส่ใหม่ได้เลย". Upsert by `legacy_id`, count the old rows separately (`legacy_id IS NULL`), and list
them in the report as a decision for the user. Removing them is a separate task with its own approval.

## Red flags — stop

| Thought | Reality |
|---|---|
| "Exclude payload-only rows, they can't have a birth date" | That is a data-quality figure. Label it as such; migration completeness keeps every row. |
| "Mismatched rows target vs staging = 0, so it's complete" | Staging is after the transform. Values lost in the transform only show against the source. |
| "Backup + guard + DELETE in one transaction is safe" | Still a bulk delete of a real table. Upsert. |
| "99.17% loaded" with no column table | Not a completeness report. Run reconcile. |

Tests: `node --test <this skill's folder>/scripts/legacy-migration.test.mjs`
