---
name: swe-agent
description: Run SWE-agent style autonomous software engineering workflows for resolving issues, systematic bug localization, reproducer creation, patch generation, and test verification. Use when the user invokes /swe-agent or asks to reproduce and fix a bug systematically.
---

# SWE-agent Autonomous Software Engineering Workflow

pipeline แก้บั๊กอย่างเป็นระบบตามแนว **SWE-agent/SWE-agent**:
reproduce → localize → patch เล็กที่สุด → verify

## 5-Step SWE Pipeline

1. **Issue Analysis & Environment Setup**
   - อ่าน bug report ให้จบ แยกให้ออกว่า "คาดหวังอะไร" กับ "เกิดอะไรขึ้นจริง"
   - ดู test / log / stack trace ที่มีอยู่ก่อน

2. **Reproducer Creation**
   - สร้างสคริปต์หรือ test เล็กที่สุดที่ **fail ได้จริง** เพราะบั๊กนี้
   - รันให้เห็นว่ามัน fail **ก่อน** แตะโค้ด — ถ้า reproduce ไม่ได้ ให้บอก user อย่าเดาแล้วแก้
   - ถ้าบั๊กอยู่ใน write path ของฐานข้อมูลจริง ให้ reproduce ใน transaction แล้ว rollback

3. **Systematic Localization**
   - ไล่จาก entrypoint → controller → service → data layer ด้วย ripgrep และการอ่านเฉพาะช่วง
   - ชี้ให้ได้ว่าบรรทัดไหน หรือ contract ข้อไหนที่ถูกละเมิด

4. **Minimal Patch**
   - แก้ให้เล็กและตรงที่สุด ไม่ refactor นอกขอบเขตบั๊ก
   - ถ้าเจอปัญหาอื่นระหว่างทาง ให้ **บันทึกไว้รายงาน** ไม่ใช่แก้พ่วงไปเงียบ ๆ

5. **Verification & Regression Gate**
   - รัน reproducer ซ้ำ ต้องผ่าน
   - รัน test ที่เกี่ยวข้อง ยืนยันว่าไม่มี regression
   - **quote ผลจริง** ในรายงาน

## คำสั่งตรวจตาม stack

| เจอที่ root | reproduce / verify |
|---|---|
| `artisan` | `php artisan tinker --execute="..."` สำหรับ logic, `curl` + status code สำหรับ HTTP, `php -l` สำหรับ syntax |
| `tsconfig.json` + vitest/jest | เขียน test case ที่ fail แล้ว `npx vitest run <file>` |
| `pytest.ini` / `pyproject.toml` | `pytest -k <case>` |
| ไม่มี test framework | เขียนสคริปต์ standalone แล้วรันตรง |

## ตัวอย่าง: DOT (Laravel + SQL Server)

- reproduce logic ฝั่ง server ได้ด้วยสคริปต์ที่ bootstrap Laravel แล้วเรียก model ตรง ๆ
- **ฐานข้อมูลเป็นของจริง** — ทดสอบ write ต้องครอบด้วย
  `DB::beginTransaction()` … `DB::rollBack()` และเทียบ snapshot ก่อน/หลังเพื่อพิสูจน์ว่าไม่มีอะไรค้าง
- หน้า backoffice ต้องมี session ถึงจะ render — `curl` เปล่า ๆ จะได้ 302 ไม่ใช่ 200
  ถ้าจะพิสูจน์ว่า view render ได้ ให้ render view ตรงด้วยข้อมูลจริงแทน
- PHP full path:
  `C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe`

## ข้อห้าม

- ห้ามแก้โดยยังไม่เคยเห็นบั๊กเกิดจริง
- ห้ามรายงานว่าแก้แล้วโดยไม่ได้รัน reproducer ซ้ำ
