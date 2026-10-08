---
name: verify-merge-main
description: Run full quality gates before merging to main — branch divergence check, typecheck/lint/build or PHP syntax gates, and a smoke check. Use when the user invokes /verify-merge-main.
---

# `verify-merge-main` — Pre-Merge to Main Quality Gate

เมื่อ user ขอ `/verify-merge-main` หรือขอตรวจก่อน merge เข้า `main`
ให้ทำตามนี้ **โดยไม่ merge / push / สร้าง PR อัตโนมัติ**

## Workflow

1. **หา base branch จริงก่อน** — อย่าสมมติว่าเป็น `main`
   ```bash
   git remote show origin | sed -n 's/.*HEAD branch: //p'
   ```
   แล้ว `git fetch origin <base>` และรายงานว่า branch ปัจจุบัน ahead/behind เท่าไร
   (`git rev-list --left-right --count origin/<base>...HEAD`)

2. **ดูขอบเขตการเปลี่ยนแปลง**
   ```bash
   git diff --stat origin/<base>...HEAD
   ```
   ใช้ตัดสินว่าต้องรัน gate หนักแค่ไหน และต้อง smoke หน้าไหน

3. **Quality gates ตาม stack**

   | เจอที่ root | gate |
   |---|---|
   | `tsconfig.json` | `npx tsc --noEmit` → `npm run lint` → `npm run build` |
   | `artisan` | `php -l` ทุกไฟล์ที่แก้ → `php artisan view:clear` → build asset ถ้าแตะ `resources/js\|css` → smoke ด้วย curl |
   | `composer.json` (ไม่มี artisan) | `php -l` + script ที่ประกาศไว้ |
   | `go.mod` / `Cargo.toml` | `go build ./... && go vet ./...` / `cargo check && cargo clippy` |

   gate ที่โปรเจกต์ไม่มี → ข้ามแล้วระบุเหตุผล ห้ามแกล้งรัน

4. **Test suite** — ถ้ามี ให้รันเต็มชุด (ต่างจาก `/verify-push` ที่รันเฉพาะที่เกี่ยวข้อง)

5. **Smoke** — ถ้าแก้หน้า user-facing
   - ตรวจว่า dev server รันอยู่แล้วไหมก่อน อย่า boot ซ้ำ
   - ยิง URL จริงแล้วอ่าน status code
   - **ห้ามเปิด browser preview อัตโนมัติ**

6. **ตรวจว่าไม่มีอะไรหลุดเข้า commit**
   ```bash
   git diff --name-only origin/<base>...HEAD
   ```
   มองหา `.env*`, `.bak`, สคริปต์ทดสอบชั่วคราว, dump ข้อมูล, credential

7. **รายงานเป็นตาราง** — ขั้นตอน / คำสั่งที่รันจริง / ผล / หมายเหตุ

   **Verdict:**
   - **พร้อม merge** — gate ที่ required ผ่านครบ
   - **ยังไม่พร้อม** — รายการที่ fail + ขั้นตอนแก้

## ตัวอย่าง: DOT

- base branch คือ `main`, branch งานคือ `dev-emtester`
- ไม่มี `tsconfig.json` / `npm run lint` — gate จริงคือ `php -l` + compile blade + smoke `localhost:8000`
- PHP full path:
  `C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe`
- ถ้าการเปลี่ยนแปลงแตะ write path ของฐานข้อมูล ให้เทียบ snapshot ตารางก่อน/หลังด้วย
  เพราะ `.env` ชี้ฐานจริง
- repo นี้เคยมีสคริปต์ ad-hoc และ dump ข้อมูลหลุดเข้า commit — ตรวจข้อ 6 ให้ละเอียด

## ข้อห้าม

- ห้าม `git push`, `git merge`, สร้าง/merge PR เว้นแต่ user สั่ง
- ห้าม deploy
- ห้ามสรุปว่า "พร้อม merge" โดยที่ยังมี gate ที่ required ไม่ได้รัน

## ความสัมพันธ์กับ skill อื่น

| ช่วง | Skill |
|------|-------|
| แก้โค้ด inner loop | `/code` / `/aider` / `/ponytail` |
| ก่อน push branch | `/verify-push` |
| ก่อน merge เข้า base | `/verify-merge-main` |
| push ขึ้น remote | skill push ของโปรเจกต์นั้น (เช่น `/pushgithub` ใน DOT) |
