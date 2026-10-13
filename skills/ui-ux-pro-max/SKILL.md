---
name: ui-ux-pro-max
description: Run the UI/UX Pro Max design intelligence to audit and refine the UI/UX of the current page or component. Use whenever a task changes a page, dialog or component (add, edit, restyle, polish), when the user invokes /ui-ux-pro-max, or asks to upgrade a screen to premium visual quality.
---

# UI/UX Pro Max Refinement

ยกระดับหน้าจอหรือคอมโพเนนต์ที่ระบุให้ได้มาตรฐาน premium — hierarchy, spacing, contrast,
hover/focus state, empty state, responsive, micro-interaction — **โดยไม่ทำลายภาษาภาพเดิมของโปรเจกต์**

## กฎข้อแรก: อ่านภาษาภาพของโปรเจกต์ก่อนแตะอะไร

อย่านำ design system จากที่อื่นมาทับ ให้สำรวจก่อนว่าโปรเจกต์นี้ใช้อะไรอยู่:

1. ดูว่ามี `tailwind.config.*`, ไฟล์ CSS token, หรือ theme ไหม
2. เปิดไฟล์เพื่อนบ้าน 1-2 ไฟล์ในโฟลเดอร์เดียวกัน ดู class / inline style ที่ใช้จริง
3. ถ้าไฟล์ใช้ inline style อยู่แล้ว **อย่าเปลี่ยนไปใช้ utility class** และกลับกัน

| เจอที่ root | ภาษาภาพ | ข้อควรระวัง |
|---|---|---|
| `tailwind.config.*` | Tailwind utility | ใช้ token ที่ประกาศไว้ ไม่ hardcode hex |
| `.blade.php` + Bootstrap | Bootstrap grid + custom CSS | ยึด `row`/`col-md-*` เดิม อย่าเปลี่ยนเป็น flex เอง |
| `.vue` / `.tsx` แบบมี CSS module | scoped style | แก้ในไฟล์เดียวกัน อย่าไปแตะ global |
| `.phtml` / template engine เก่า | server-rendered + jQuery | ห้าม migrate ไป React/Tailwind เว้นแต่ user สั่ง |

## Instructions

1. เปิดไฟล์ UI ที่ user ระบุ (หรือ active document)
2. ไล่รายการสิ่งที่ควรปรับ — hierarchy, spacing, contrast, hover/focus, empty state, ข้อความ error
3. แก้แบบ surgical — ห้ามพัง import, form binding, event handler, หรือ server/client boundary
4. **เปิดดูหน้าจริงก่อนรายงาน** ตามกฎ 5.7 — รัน dev server (ถ้ายังไม่รัน) แคปที่ 1280 และ 375 เช็ก console
   ถ้าเปิดดูไม่ได้ ให้บอกตรงๆ ว่าไม่ได้ดู
5. รายงานว่าเปลี่ยนอะไรไปบ้าง และอะไรที่จงใจไม่แตะ

## ตัวอย่าง: DOT (Laravel Blade + Bootstrap 4 + jQuery, Vue 3 เฉพาะบางหน้า)

ภาษาภาพจริงของ backoffice DOT — ยึดตามนี้ อย่านำ Tailwind/indigo เข้ามา:

- **Typography**: ฟอนต์ `'K2D'` (ไทย) คลาสขนาด `k2d-14` / `k2d-15` / `k2d-16` / `k2d-18`
- **Layout**: Bootstrap 4 `form-group row` + `col-md-3` (label ชิดขวา) / `col-md-9` (control)
- **Label บังคับกรอก**: `control-label with-icon labelRequest col-md-3 text-right`
  ไม่บังคับใช้ `k2d-15` แทน `labelRequest` — ไม่งั้น jquery.validate จะบังคับกรอก
- **Wrapper ของ input**: ต้องมี `divControl` ครอบ เพราะ error ของ jquery.validate ถูก append ไปที่นั่น
- **Card**: `card-header bg-primary` + `<i class="fa fa-info-circle">` + `<span class="h5 k2d-18">`
- **ปุ่ม**: `btn btn-primary custom` (หลัก), `btn btn-info custom` (รอง), `btn btn-secondary custom` (ยกเลิก)
- **ปุ่มแนบไฟล์**: `background-color: #17a2b8`
- **ข้อความช่วยเหลือใต้ฟิลด์**: `<font class="k2d-14" style="color: cornflowerblue;">`
- **กล่องยืนยันสีเหลือง**: `background-color: #FFD403`
- **ไอคอน**: Font Awesome 6 (`fa-solid`, `fa-regular`)
- **Dialog**: SweetAlert2 (`Swal.fire`) ไม่ใช่ `alert()`
- Frontend build เป็น **laravel-mix** — แก้ `resources/js` / `resources/css` แล้วต้อง `npm run dev`
  แก้ `.blade.php` อย่างเดียวไม่ต้อง build แต่ต้อง `php artisan view:clear`

## ข้อห้าม

- ห้าม migrate หน้าไปยัง framework อื่นเพื่อ "ให้สวยขึ้น"
- ห้ามเปลี่ยน `name` ของ input หรือ `id` ที่ JS อ้างถึง — ฟอร์มจะพังเงียบ ๆ
- ห้ามลบคลาสที่ดูไม่มีผลทางสายตา (เช่น `divControl`, `required`) โดยไม่ตรวจว่า JS ใช้อยู่ไหม
