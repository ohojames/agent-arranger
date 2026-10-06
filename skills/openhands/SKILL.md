---
name: openhands
description: Execute OpenHands-style event-driven agentic software development, handling complex multi-file tasks, tool chaining, multi-agent delegation, and autonomous problem solving. Use when the user invokes /openhands or asks for autonomous multi-file execution.
---

# OpenHands Autonomous Agentic Engineering Workflow

รูปแบบการทำงานแบบ event-driven หลายไฟล์ ตามแนวของ **OpenHands/OpenHands** (เดิม OpenDevin)

## Key Execution Principles

1. **Observation → Action → Analysis Loop**
   - ทุกครั้งที่ได้ผลจาก tool (Observation) ให้วิเคราะห์ก่อนลงมือขั้นถัดไป
   - แยกให้ชัดว่าอะไรคือ "รู้แล้ว" อะไรยังเป็น "สมมติฐาน"

2. **Sandbox & Service Orchestration**
   - จัดการ background task และ dev server ให้สะอาด
   - **ตรวจก่อนเสมอว่าเซิร์ฟเวอร์รันอยู่แล้วหรือไม่** อย่า boot ซ้ำ
   - ยืนยันด้วย HTTP status จริง ไม่ใช่จากการที่สั่ง start ไป
   - ห้ามเปิด browser preview เองโดยไม่ได้ขอ

3. **Task Decomposition**
   - ตัดงานใหญ่เป็นก้อนย่อยที่ตรวจผลได้ทีละก้อน
   - แตก subagent เฉพาะเมื่อ user เปิดทางให้ใช้ agent — ไม่ใช่โดยอัตโนมัติ

4. **Empirical Verification**
   - จบงานได้เมื่อมีหลักฐานรันจริง: build ผ่าน, test เขียว, HTTP 200
   - ถ้าเลี่ยงไปใช้ทางลัด (mock, cache, ข้าม gate) **ต้องบอกในรายงาน**

## รู้จัก stack ก่อน

| เจอที่ root | stack | ตรวจด้วย |
|---|---|---|
| `artisan` | Laravel | `php -l`, `php artisan view:clear`, `curl` หน้าเว็บจริง |
| `tsconfig.json` | TypeScript | `npx tsc --noEmit` แล้วค่อย build |
| `package.json` | JS | อ่าน `scripts` เลือกเฉพาะที่มี |
| `docker-compose.yml` | มี container | `docker compose ps` ก่อน แล้วค่อยตัดสินใจ start |

## Standard Workflow

1. **Initialize** — สำรวจ layout, service ที่รันอยู่, script ใน `package.json` / `composer.json`, และโครงสร้างข้อมูล
2. **Deconstruct** — แปลงคำสั่ง user เป็นเฟสที่เรียงลำดับได้
3. **Execute & Observe** — แก้แบบ surgical เก็บ log และ traceback ไว้ประกอบ
4. **Verify** — รัน quality gate ที่ตรงกับ stack แล้ว quote ผลจริง
5. **Finalize** — สรุปเป็นภาษาคน บอกด้วยว่าอะไรที่ยังค้าง

## ตัวอย่าง: DOT (Laravel 10 + Blade + Vue 3 + SQL Server)

- local server: `http://localhost:8000` (frontend), `http://localhost:8000/admin` (backoffice) — ใช้ `/runlocal`
- ตรวจว่ารันอยู่แล้วก่อน: `netstat -ano | grep ":8000"` แล้วดูว่า process เป็น `artisan serve` ของ DOT จริงไหม
- อีเมลเข้า queue (`QUEUE_CONNECTION=database`) — flow ที่ส่งเมลต้องรัน `artisan queue:work` แยกอีกตัว
- PHP full path:
  `C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe`
- **`.env` ชี้ฐานข้อมูลจริง** — งานที่บันทึกข้อมูลต้องเตือน user หรือทดสอบใน transaction แล้ว rollback

## ข้อห้าม

- ห้ามเปลี่ยน port เงียบ ๆ เมื่อ bind ไม่ได้ — บอก user ก่อน
- ห้ามสรุปว่าเสร็จโดยไม่มีหลักฐานรันจริง
