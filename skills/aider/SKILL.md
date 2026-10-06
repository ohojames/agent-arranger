---
name: aider
description: Apply Aider-inspired git-centric editing, repo mapping, precise diff editing, auto-commit messages, and surgical code modification workflows. Use when the user invokes /aider or asks for surgical, git-centric pair-programming edits.
---

# Aider-Inspired AI Pair Programming Workflow

เทคนิคการแก้โค้ดแบบ git-centric จาก **Aider-AI/aider**: map repo ก่อนแก้, แก้แบบ diff ที่แม่นยำ,
แล้วปิดท้ายด้วย feedback loop ของ lint/test

## Core Principles

1. **Repo-Map Context Awareness**
   - ก่อนแก้ ให้ map symbol / class / function signature ในไฟล์ที่เกี่ยวข้องก่อน
   - อย่าอ่านไฟล์ monolith ทั้งไฟล์ถ้าจะแก้แค่ไม่กี่เมธอด (ดู `/token-saver`)

2. **Search / Replace Block Edits**
   - แก้ให้เล็กและตรงจุด ใช้ exact string match
   - รักษา indentation, docstring, และรูปแบบเดิมไว้เป๊ะ

3. **Git-Centric Workflow**
   - เก็บ git state ให้สะอาด แยกงานเป็นก้อนที่ atomic
   - เตรียม conventional commit message ให้ แต่ **ห้าม commit เว้นแต่ user สั่ง**

4. **Lint & Test Auto-Fix Loop**
   - รันการตรวจสอบหลังแก้เสมอ
   - เมื่อ error ให้อ่าน stack trace แล้วแก้ที่ root cause อย่าย้อนโค้ดส่วนอื่นทิ้ง

## รู้จัก stack ก่อนสั่งคำสั่งตรวจสอบ

ห้ามสั่งคำสั่งตรวจสอบจากความเคยชิน — ดูว่า repo นี้เป็นอะไรก่อน

| เจอที่ root | stack | คำสั่งตรวจสอบ |
|---|---|---|
| `artisan` | Laravel (PHP) | `php -l <ไฟล์ที่แก้>` และถ้าแก้ view ให้ `php artisan view:clear` |
| `tsconfig.json` | TypeScript | `npx tsc --noEmit` |
| `package.json` (ไม่มี tsconfig) | JS | อ่าน `scripts` แล้วเลือกเฉพาะที่มีอยู่จริง |
| `composer.json` (ไม่มี artisan) | PHP อื่น | `php -l` + script ใน `composer.json` |
| `go.mod` / `Cargo.toml` / `pyproject.toml` | Go / Rust / Python | `go build ./...` / `cargo check` / เครื่องมือที่ประกาศไว้ |

สั่ง `npx tsc --noEmit` กับโปรเจกต์ที่ไม่มี `tsconfig.json` จะ fail แล้วรายงานผิด

## Execution Workflow

1. **Context Gathering** — หาไฟล์ที่กระทบ, import, และ caller site ด้วย ripgrep หรือ symbol definition
2. **Surgical Edit** — ใช้ StrReplace/Edit ไม่ใช่ Write ทับทั้งไฟล์
3. **Automated Verification** — รันคำสั่งตามตารางข้างบน แล้ว **quote ผลจริง** ไม่ใช่บอกว่า "น่าจะผ่าน"
4. **Git** — เฉพาะเมื่อ user สั่ง

## ตัวอย่าง: DOT (Laravel 10 + Blade + Vue 3 + laravel-mix + SQL Server)

- PHP ไม่อยู่ใน PATH — เรียกด้วย full path:
  `C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe`
- asset เป็น **laravel-mix** (`npm run dev`) ไม่ใช่ vite — รันเฉพาะเมื่อแก้ `resources/js` / `resources/css`
- แก้ `.blade.php` แล้วต้อง `php artisan view:clear`; แก้ `.env` หรือ `config/` ต้อง `php artisan config:clear`
- ไม่มี migration ของตารางธุรกิจ — schema อยู่ใน SQL Server ต้องเขียน **T-SQL** เท่านั้น
- `.env` ชี้ฐานข้อมูลจริง — การทดสอบที่เขียนข้อมูลต้องทำใน transaction แล้ว rollback หรือเตือน user ก่อน

## ข้อห้าม

- ห้ามรายงานว่าเสร็จจากการที่เขียนโค้ดไปแล้ว — ต้องรันคำสั่งตรวจสอบและอ้างผลจริง
- ห้าม commit / push เว้นแต่ user สั่ง
