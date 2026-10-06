---
name: verify-push
description: Run quality gates before pushing — typecheck/lint/build for JS projects, syntax and smoke checks for PHP projects. Use when the user invokes /verify-push or asks to check before pushing.
---

# `verify-push` — Pre-Push Quality Gate

เมื่อ user ขอ `/verify-push` หรือขอตรวจก่อน push ให้ทำตามนี้ **โดยไม่ push อัตโนมัติ**

## Workflow

1. **ตรวจ branch และการเปลี่ยนแปลง**
   ```bash
   git branch --show-current
   ```
   แล้ว `git status --short` และ `git diff --stat` เพื่อรู้ว่าอะไรถูกแตะบ้าง

2. **เลือก gate ตาม stack — อย่าสั่งจากความเคยชิน**

   | เจอที่ root | gate ตามลำดับ |
   |---|---|
   | `tsconfig.json` | `npx tsc --noEmit` → `npm run lint` → `npm run build` |
   | `artisan` | `php -l` ทุกไฟล์ PHP ที่แก้ → `php artisan view:clear` (ถ้าแก้ blade) → build asset ถ้าแก้ `resources/js\|css` → smoke หน้าเว็บด้วย curl |
   | `composer.json` (ไม่มี artisan) | `php -l` + script ที่ประกาศใน `composer.json` |
   | `package.json` เท่านั้น | อ่าน `scripts` แล้วรันเฉพาะที่มีจริง |
   | `go.mod` / `Cargo.toml` | `go build ./... && go vet ./...` / `cargo check && cargo clippy` |

   ถ้า gate ไหนไม่มีอยู่จริงในโปรเจกต์ ให้ **ข้ามแล้วระบุในรายงานว่าข้ามเพราะไม่มี** ห้ามแกล้งรัน

3. **มี test ไหม** — ถ้ามี ให้รัน test ที่เกี่ยวกับไฟล์ที่แก้ อย่างน้อยชุดที่เกี่ยวข้อง

4. **ถ้า fail** — แก้แล้ว rerun เฉพาะ gate ที่พัง
   ห้ามรายงานว่าพร้อม push จนกว่า gate ที่ required จะผ่าน

5. **รายงานผลเป็นตาราง** — ขั้นตอน / คำสั่งที่รันจริง / ผล (pass, fail, skip + เหตุผล)
   - ผ่าน → แจ้งว่า **พร้อม push**
   - ไม่ผ่าน → สรุป error + ไฟล์ที่เกี่ยวข้อง

## ตัวอย่าง: DOT (Laravel 10 + Blade + Vue 3 + laravel-mix)

ไม่มี `tsconfig.json` และไม่มี `npm run lint` — `npx tsc --noEmit` ใช้ไม่ได้

```bash
git status --short
```

gate จริงของ DOT:
1. `php -l <ไฟล์ .php ที่แก้ทุกไฟล์>` — ใช้ full path
   `C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe`
2. แก้ `.blade.php` → `php artisan view:clear` แล้ว compile ตรวจด้วย `Blade::compileString` + `php -l`
3. แก้ `resources/js` หรือ `resources/css` → `npm run dev` (laravel-mix ไม่ใช่ vite)
4. smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000` และ `/admin`
   หน้า backoffice ที่ต้องล็อกอินจะได้ **302** ถ้าไม่มี session — 302 ไม่ได้แปลว่าพัง แต่ก็ไม่ได้พิสูจน์ว่า render ได้

## ข้อห้าม

- ห้าม `git push` ใน skill นี้ เว้นแต่ user สั่งชัด
- ห้าม commit ไฟล์ชั่วคราว / `.bak` / `.env*` / สคริปต์ทดสอบ
- ห้ามเขียนว่า pass ถ้าไม่ได้รันคำสั่งนั้นจริง
