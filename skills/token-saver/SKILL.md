---
name: token-saver
description: >-
  Minimize token usage when working on large files. Use when the user invokes
  /token-saver, when the task touches files over 800 lines, or when the user
  asks to save tokens / ประหยัด token.
---

# Token Saver — Surgical Read & Edit Rules

เป้าหมาย: ลด input token เทียบกับการ `Read` ไฟล์ใหญ่ทั้งไฟล์ โดยผลลัพธ์เหมือนเดิม

## When to apply

| เงื่อนไข | ใช้ token-saver |
|---------|----------------|
| ไฟล์เป้าหมาย > 800 บรรทัด | ใช่ |
| ไฟล์ < 400 บรรทัด | ไม่ — Read ทั้งไฟล์ถูกกว่าและปลอดภัยกว่า |
| User พิมพ์ `/token-saver` หรือ "ประหยัด token" | ใช่ |
| ต้องเข้าใจโครงสร้างทั้งไฟล์เพื่อตัดสินใจ | ไม่ — อ่านให้ครบ |

## หาไฟล์ใหญ่ของโปรเจกต์ก่อน

อย่าเดา — หาไฟล์ที่ยาวจริงในโปรเจกต์นี้:

```bash
git ls-files | xargs wc -l 2>/dev/null | sort -rn | head -20
```

แล้วจำไว้ว่าไฟล์ไหนต้องอ่านแบบ surgical เสมอ

## ขั้นตอนทำงาน

### Step 1 — Grep หา symbol ก่อนเสมอ

ใช้ `Grep` tool (ไม่ใช่ `rg` ผ่าน shell) ตั้ง `output_mode: "content"` และใส่ `head_limit`
ถ้า pattern อาจ match เยอะ

### Step 2 — คำนวณ offset/limit จากเลขบรรทัดที่ได้

ถ้า Grep บอกว่า function อยู่บรรทัด 2172 → `offset: 2170`, `limit: 80`

### Step 3 — Read เฉพาะส่วนที่จะแก้

**กฎเหล็ก:** limit รวมไม่เกิน ~300 บรรทัดต่อการ Read หนึ่งครั้ง

### Step 4 — แก้ด้วย Edit/StrReplace ไม่ใช่ Write ทับทั้งไฟล์

หลายจุดในไฟล์เดียว → เรียง Edit หลายครั้ง หรือ `replace_all` เมื่อ pattern ปลอดภัยจริง

### Step 5 — ตรวจผลด้วย Grep ไม่ใช่ Read ทั้งไฟล์

## Anti-patterns

| อย่าทำ | ทำแทน |
|--------|-------|
| `Read` ไฟล์ใหญ่ทั้งไฟล์โดยไม่มี offset/limit | `Read` พร้อม offset/limit |
| `Write` ทั้งไฟล์เพื่อแก้จุดเดียว | `Edit` |
| อ่านไฟล์ "เผื่อต้องใช้" | Grep ก่อน ค่อย Read |
| ข้ามการตรวจสอบเพื่อประหยัด token | รัน gate เสมอ |
| ยิง subagent เพื่ออ่านไฟล์ที่ Grep ก็พอ | Grep ตรง ๆ |

## บน Windows

- heredoc (`<<'EOF'`) **กลืน backslash** — `\d` ในสคริปต์จะเหลือ `d`
  regex และ Windows path ต้องเขียนด้วย Edit/Write tool ไม่ใช่ pipe ผ่าน bash
- `npx` / `npm` เป็น `.cmd` shim spawn ตรงไม่ได้ — เรียก JS entry point ผ่าน `node`
- ไฟล์ต้นฉบับอาจเป็น UTF-16 — อ่านแบบระวังแล้ว normalise เป็น UTF-8

## อย่าประหยัดผิดที่

- ห้ามเดาโค้ดเพราะ "ไม่อยากอ่าน"
- ห้ามข้ามการ verify
- ถ้าไฟล์เล็ก การ Grep แล้ว Read เป็นช่วง ๆ หลายรอบ **แพงกว่า** อ่านรวดเดียว
