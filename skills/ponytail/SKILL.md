---
name: ponytail
description: Perform a senior developer code review to eliminate bloat and YAGNI violations; also apply Fast Loop rules to speed up AI iteration without sacrificing correctness. Use when the user invokes /ponytail or asks to simplify/unbloat code.
---

# Ponytail Code Simplification Review

รีวิวโค้ดแบบ senior dev เพื่อตัดส่วนเกิน แพ็กเกจที่ไม่จำเป็น และของที่ยังไม่มีใครขอ (YAGNI)

## Instructions

1. อ่านโค้ดเป้าหมาย (ถ้าไฟล์ใหญ่ให้อ่านแบบ surgical ตาม `/token-saver`)
2. หาส่วนที่ทำได้ด้วยความสามารถพื้นฐานของภาษา/แพลตฟอร์มอยู่แล้ว
3. เสนอ diff หรือ refactor ให้เลย
4. **ห้ามพัง** type, contract ของ API, data flow, หรือ event binding ที่มีอยู่

## สิ่งที่นับว่าเป็น bloat

- fallback ที่ไม่มี code path ไหนไปถึง
- ตัวแปร/บล็อกที่คำนวณแล้วถูกทิ้ง
- โค้ดชุดเดียวกัน copy-paste ซ้ำหลายที่ (ยุบเป็น helper)
- abstraction ที่มีผู้ใช้รายเดียว
- comment ที่บอกสิ่งที่โค้ดบอกอยู่แล้ว

## สิ่งที่ **ไม่ใช่** bloat — ห้ามตัด

- guard clause ที่ป้องกันข้อมูลเสียหาย
- การ validate ฝั่งเซิร์ฟเวอร์ แม้จะมีฝั่ง client อยู่แล้ว
- โค้ดที่ดูซ้ำแต่เงื่อนไขต่างกันจริง — อ่านให้จบก่อนยุบ

---

## Fast Loop (Iteration Speed)

ใช้แทน pipeline เต็มเมื่องานเล็กและขอบเขตชัด

### เข้าเงื่อนไข Fast Loop
- แก้ UI อย่างเดียว (label, การซ่อน/แสดง, layout) ในคอมโพเนนต์ที่มีอยู่
- แก้ข้อความ/คำผิด
- แก้บั๊กฟิลด์เดียวที่รู้ path แล้ว

### Fast Loop ยังต้องทำ
- `Grep` หา symbol ที่กระทบก่อนเสมอ
- ตรวจแบบ scoped — ตรวจเฉพาะไฟล์ที่แก้ ไม่ต้อง build ทั้งโปรเจกต์ทุกครั้ง
  เว้นแต่การเปลี่ยนแปลงกระทบ routing / SSR / asset bundle
- **อย่า restart dev server ถ้ามันรันอยู่แล้ว** — ตรวจ port ก่อน

### คำสั่งตรวจตาม stack

| เจอที่ root | ตรวจแบบเบา |
|---|---|
| `artisan` | `php -l <ไฟล์>` ; แก้ blade → `php artisan view:clear` แล้ว curl หน้านั้น |
| `tsconfig.json` | `npx tsc --noEmit` |
| `package.json` | script ที่มีอยู่จริงเท่านั้น |

### อ่านไฟล์ใหญ่ (> 800 บรรทัด)
- `Grep` หาตำแหน่งก่อน แล้ว Read ด้วย offset/limit — ดู `/token-saver`

## ตัวอย่าง: DOT

- Blade หลายไฟล์ยาว 700-5,000 บรรทัด และมี handler ที่ copy-paste ซ้ำสองสาขา
  แก้จุดหนึ่งแล้ว **ต้องตรวจว่าอีกสาขาต้องแก้ด้วยไหม**
- Model บางตัวมี logic ก้อนเดียวกันซ้ำ 4 ชุด — ถ้าจะยุบ ต้องยุบพร้อมกันทุกชุด ไม่งั้นพฤติกรรมแตก
- ระวังคลาสที่ดูเหมือนแค่ style แต่ JS ใช้จริง (`divControl`, `required`, `DocList_ID`)
