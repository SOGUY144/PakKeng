# HANDOFF

## จุดปัจจุบัน
**ล่าสุด (5 พ.ย. 2569 ช่วง 22 น., branch `feat/call-friend`):** เพิ่มหน้าอธิบายหลักการแบบมีภาพเคลื่อนไหว `public/how-it-works.html`
(ลิงก์อยู่ท้ายหน้า Home และแดชบอร์ด, commit `5a74dac`), deploy รุ่นนี้ขึ้น https://nasal-trainer-web.vercel.app แล้ว,
และเขียน `README.md` ใหม่เป็นรายละเอียดโปรเจกต์ (commit `3cec7af`)

**ก่อนหน้า (5 พ.ย. 2569 02:20 น., branch `feat/call-friend`, commit `30a11f8`):** ปรับทั้งแอปให้ 4 เกมเล่นต่างกันจริง (เรียกเพื่อน · เลือกทางวิ่ง · พาบอลลูนไปส่ง · เปิดประตู)
พร้อมเลย์เอาต์มือถือ / iPad แนวตั้ง-แนวนอน / คอม — สรุป วิธีเปิด และผลทดสอบทั้งหมดอยู่ใน **`docs/OVERNIGHT_HANDOFF.md`** (อ่านก่อนไฟล์นี้)

**ล่าสุด (5 พ.ย. 2569, branch `feat/call-friend`, อยู่ใน commit `30a11f8`):** กบข้ามบึงถูกปรับเป็น **ด่านเรียกเพื่อน** ตามหลักฐานใน skill `cleft-speech-game`
— ฟังคำ (ไม่ฟังไมค์ระหว่างเล่น) → “ลองเรียกเพื่อนดูสิ” → เพื่อนหันมาตอบ “ได้ยินแล้ว” เมื่อได้ยินเสียงที่สัญญาณใช้ได้ (ไม่ได้ตัดสินว่าออกเสียงถูก),
ฟังซ้ำ/ลองใหม่/ข้าม/พัก, เสียงเบา-ล้น-ไมค์ช่องหาย-หลุด = “ขอลองฟังใหม่” ไม่หักดาว, มุมผู้ดูแลมีตารางรายคำ (ไม่มีกติกา “ยิ่งต่ำยิ่งดี”),
ส่วนรับข้อมูลแยกจากเกม (โหมดสาธิต / WebSocket) — การออกแบบและหลักฐาน: `DECISIONS.md` หัวข้อ “ด่านเรียกเพื่อน”, รูปแบบข้อมูล ESP32: `docs/DEVICE_PROTOCOL.md`
**งานคืน 5 พ.ย. (เส้นตาย 07:00 น.):** หน้าเลือก “วันนี้อยากไปหาใครก่อน?”, บึงเป็นตัวเกม (ตลิ่ง/แถบรูปเพื่อน), เพื่อน 3D 5 ตัว (`models/Friends.tsx`),
ทาง “ลองฉาก 3D”, จบรอบรวมที่ตลิ่ง — ผลทดสอบ หลักฐาน และวิธีลองหนึ่งนาที: **`docs/OVERNIGHT_HANDOFF.md`**

เว็บต้นแบบครบ 8 หน้าจอ ฉากเกม (วิ่งหนี, ด่านประตู, บอลลูน, กบ) เป็น **3D** ด้วย three.js + React Three Fiber, ทำงานกับ **สัญญาณจำลอง** เท่านั้น
Home ใช้ภาพที่เรนเดอร์จากโมเดล 3D จริง, หน้าสรุปรอบมีฉากฉลอง 3D, Calibrate และแดชบอร์ดคงแบบเดิม (ไม่เติมฉาก 3D)
ภาพ 2D เดิมยังอยู่เป็นทางเลือกสำรอง (WebGL ใช้ไม่ได้/หลุด หรือเลือก “2D” ในเครื่องมือเดโม)
ผลตรวจล่าสุด: typecheck ผ่าน · tests 46/46 · lint 0 error / 58 warning · build ผ่าน · เดิน flow ครบในเบราว์เซอร์ (รายละเอียด `PROGRESS.md`)

## ตำแหน่ง
- โฟลเดอร์โปรเจกต์: `D:\nasal-trainer-web` · git: `master` = commit แรก (รุ่น 2D), งาน 3D อยู่บน branch `feat/3d-games`,
  งานล่าสุด (4 เกม) อยู่บน `feat/call-friend` ที่แตกจาก `feat/3d-games` (ยังไม่ merge เข้า `master`)
- GitHub (repo หลักตั้งแต่ 5 พ.ย. 2569): https://github.com/SOGUY144/PakKeng (**public**) · push ครบ 3 branch · default branch = `feat/call-friend`
  · บัญชี `Gupalmza` เขียนได้แต่ไม่ใช่ admin — ตั้งค่า repo, เพิ่มคนร่วมงาน, เปลี่ยน default branch ต้องใช้บัญชีเจ้าของ `SOGUY144`
  · repo เก่า `Gupalmza/nasal-trainer-web` (private) เลิกใช้แล้ว ถอดออกจาก remote ของเครื่องนี้ แต่ยังไม่ได้ลบบน GitHub
- เว็บที่ deploy: https://nasal-trainer-web.vercel.app (รุ่น 4 เกม + หน้าอธิบายหลักการ `/how-it-works.html` จาก commit `5a74dac`, deploy 5 พ.ย. 2569,
  ใครมีลิงก์ก็เปิดได้, ข้อมูลจำลองทั้งหมด) — วิธี deploy ใหม่ดูหัวข้อ “Deploy (Vercel)” · ก่อนหน้านี้เป็นรุ่น 3D จาก commit `a78b1b0` (4 พ.ย.)
- เอกสาร: `PROJECT_BRIEF.md` (ข้อกำหนด รวมคำสั่งเพิ่มเติมเรื่อง 3D) · `DECISIONS.md` · `PROGRESS.md` · `TODO.md` · `ASSETS.md` (โมเดล/ภาพ/license)
- brief หลัก: `C:\Users\TCcomputer\Documents\Codex\2026-11-04\1-ai-2-esp32-nasalance-nasometer\outputs\claude-overnight-web-prompt.txt`

## เริ่มระบบ
```bash
npm install
npm run dev          # http://localhost:5173/#/home  และ  http://localhost:5173/#/dashboard
```
- ใน Claude desktop: `.claude/launch.json` มีชื่อ `web` (npm run dev --port 5173 --strictPort) ใช้ได้เมื่อเปิดเซสชันใหม่ในโฟลเดอร์นี้
- หมายเหตุเซสชันที่ทำงานนี้: ระบบ preview ของแอปยังผูกกับโฟลเดอร์ชั่วคราวเดิม จึงรัน Vite จาก `D:\nasal-trainer-web` เป็นงานเบื้องหลังของเซสชันแทน (หยุดเมื่อเซสชันจบ)

## Deploy (Vercel)
- Vercel project `gupalmzas-projects/nasal-trainer-web` deploy ด้วย Vercel CLI จากเครื่องนี้ — **ยังไม่ได้เชื่อมกับ GitHub**
  (บัญชี GitHub ยังไม่ได้ติดตั้ง Vercel GitHub App) ดังนั้น push แล้วเว็บไม่อัปเดตเอง
- deploy ใหม่ (รันในโฟลเดอร์โปรเจกต์; ถ้า CLI ยังไม่ได้ล็อกอิน ให้รัน `npx vercel@65.2.0 login` แล้วกด Allow Access ในเบราว์เซอร์):
  `npx vercel@65.2.0 deploy --prod --scope gupalmzas-projects`
- เครื่องนี้ npx ที่ใช้ cache `D:\npm-cache` ล้มด้วย `ECOMPROMISED Lock compromised` → ใน Git Bash ใส่ `npm_config_cache="C:/Users/TCcomputer/AppData/Local/npm-cache"` นำหน้าคำสั่ง
- ให้ deploy อัตโนมัติทุก push: เจ้าของ repo (`SOGUY144`) ติดตั้ง Vercel GitHub App แบบเลือกเฉพาะ `PakKeng` แล้วรัน `npx vercel@65.2.0 git connect --scope gupalmzas-projects`
- URL เฉพาะของแต่ละ deployment (`nasal-trainer-<id>-gupalmzas-projects.vercel.app`) ต้องล็อกอิน Vercel; โดเมนหลักเปิดได้ทุกคน · `.vercel/` อยู่ใน `.gitignore`

## วิธีตรวจ
```bash
npm run typecheck && npm test && npm run lint && npm run build
```
ตรวจด้วยมือ (≈10 นาที) — ที่เครื่องมือเดโม → “ตัวเลือกทดสอบเพิ่ม” มี **ภาพฉากเกม** (อัตโนมัติ/3D สูง/3D ประหยัด/2D + ตัวนับ fps, draw calls, สามเหลี่ยม) และ **ภาพเคลื่อนไหว** (ตามเครื่อง/ลดลง/เต็ม)
> เครื่องที่ใช้พัฒนาตั้งค่า “ลดการเคลื่อนไหว” ของระบบไว้: “ตามเครื่อง” จึงได้แบบนุ่ม (กบกระโดดต่ำลง ประตูเปิดช้าลง ไม่มีฉากหลังเลื่อน ประกายน้อยลง) — เลือก “เต็ม” เพื่อดูภาพเคลื่อนไหวเต็มรูปแบบ
1. Home → “เริ่มเล่น” → เลือก “เป็นช่วง ๆ” ลากแถบ 82% → กระต่ายวิ่งเร็ว ฝุ่นน้ำเงิน เพื่อนเมฆถอย แถบระยะน้ำเงินยาวขึ้น → ครบ 6 คำ → “ไปด่านประตู”
2. ประตู: ลากแถบ 45% (ออกจมูก 55%) → ประกายส้มลอยไปที่ตรา ลูกปัดติดทีละเม็ด → 100% บานเปิด แสงอุ่นด้านหลัง → “ผ่านด่าน → สรุปรอบ” (มีฉากฉลอง)
3. บอลลูน: 82% + “มีเสียง” → บอลลูนขึ้นเข้าโซน (เสาน้ำเงินเหนือวงแหวน) สะสม 3 ลูก; 60% → ต่ำกว่าวงแหวน ไม่นับเวลา
4. กบข้ามบึง (ด่านเรียกเพื่อน) บนจอ 390: แตะเพื่อนในหน้า “วันนี้อยากไปหาใครก่อน?” → กด “ฟังคำ” → “ฟังนะ… เกมยังไม่ฟังไมค์ระหว่างเล่นเสียง” → “เรียกเพื่อนเลย”;
   **รับเสียงได้:** “กดค้างเพื่อพูด” ~0.6 วินาที → “กำลังฟัง…” → เพื่อนหันมา + ฟอง “ได้ยินแล้ว!” เหนือหัว + ดาว +1 → “ไปหาเพื่อนตัวต่อไป”;
   **ไม่มีเสียง:** ไม่กดอะไร 8 วินาที → “ยังไม่ได้ยินเลย” (ไม่นับครั้ง ไม่หักดาว);
   **อุปกรณ์หลุด:** ตัวเลือกทดสอบเพิ่ม → ตัดการเชื่อมต่อระหว่างกดค้าง → “อุปกรณ์หลุด · ขอลองฟังใหม่อีกครั้งนะ” ฉากจาง มุมผู้ดูแลบอกวิธีแก้ ตาราง “ใช้ไม่ได้: หลุดกลางคัน 1” → เชื่อมต่อ → เรียกใหม่ได้;
   เพิ่มเติม: ความดังเสียง “เบาเกินไป/ดังจนล้น”, ช่องไมค์ “ไมค์บน (จมูก) หลุด”, “จำลองเสียงลำโพงรั่วเข้าไมค์” (กดฟังคำแล้วตารางต้องไม่เพิ่มครั้งที่ลอง)
5. แดชบอร์ด: แก้เกณฑ์ออกปากเป็น 80 → บันทึก → บอลลูนวงแหวนสูงขึ้น ป้าย “≥ 80%”
6. “ตัดการเชื่อมต่อ” → ฉากหยุด สีจาง ป้าย “หยุดไว้ก่อน”; พัก → canvas หยุดวาด; เริ่มรอบใหม่ → ไม่มี canvas ซ้อน
7. ทางสำรอง: ใน console `document.querySelector('.stage3d canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` → 2D + ข้อความ + ปุ่ม “ลองเปิด 3D อีกครั้ง”

## โครงไฟล์ 3D (สำหรับแก้ต่อ)
- `src/three/gfx.ts` — ตรวจ WebGL, ระดับคุณภาพ, ลดระดับเองเมื่อช้า, ค่าที่ผู้ทดสอบเลือก, สถิติ (อยู่ใน bundle หลัก ห้าม import three)
- `src/three/World3D.tsx` → lazy `WorldCanvas.tsx` (Canvas, PerfProbe, context-lost → 2D) → `worlds/*World.tsx`
- `src/three/kit.ts` + `KitProvider.tsx` — วัสดุ “ดินปั้น”/geometry/texture ร่วม ต่อ canvas และ dispose ตอนปิดฉาก (ฉากใช้ `dispose={null}` ที่ root)
- `src/three/models/` — Bunny, CloudPal, Frog, Balloon, Gate, Accessories + `drives.ts` (ค่าที่ world เขียนให้โมเดลทุกเฟรม)
- `src/three/shapes.ts` — ของประกอบฉากรวมเป็น geometry เดียวพร้อมสี vertex (ใช้กับ `Field`/`ScrollField` ใน `parts.tsx` = InstancedMesh)
- `src/three/worlds/` — RunnerWorld, GateWorld, BalloonWorld, FrogWorld, Showcase (ฉากฉลอง + ฉากสำหรับเรนเดอร์ภาพนิ่ง)
- `src/three/RenderStudio.tsx` + plugin ใน `vite.config.ts` — `/?studio` (dev เท่านั้น) สร้าง `public/renders/*.webp` ใหม่หลังแก้โมเดล
- `src/lib/motion.ts` — ลดการเคลื่อนไหว (ระบบ หรือค่าจากเครื่องมือเดโม) → `<html data-motion>`
- หลักสำคัญ: ฉาก **อ่าน** สถานะจาก `gameRef`/`frameRef` เท่านั้น ไม่สร้างคะแนน/ก้าวเอง; การเปลี่ยนภาพใช้ `damp()` (ไม่มี camera shake);
  เพิ่มของประกอบฉากใหม่ = เพิ่มฟังก์ชันใน `shapes.ts` (ใช้ `colored([...])`) แล้ววางด้วย `Field`/`ScrollField`

## งานถัดไปที่ชัดเจน
1. ทดสอบฉาก 3D บนมือถือจริง (ระดับกลาง) แล้วปรับเกณฑ์เลือกระดับใน `gfx.ts` ตามตัวเลขจริง
2. ผูก ESP32 ผ่าน `WebSocketSignalSource` (`{"nasalPercent":28.5,"speechDetected":true}` หรือ `28.5,1`) + ตัวเลือกแหล่งสัญญาณใน UI
3. วัด latency จริง (เสียง → ฉาก 3D) และปรับค่า segmenter กับเสียงจริง
4. ให้นักแก้ไขการพูดรีวิวคำ กฎแจ้งเตือน ค่าเริ่มต้น 70/40 และความเร็วตัวไล่
5. ลด lint warnings ของฉาก 3D (สถานะจำลองไป `useRef`) และพิจารณา preload chunk 3D

## สิ่งที่ห้ามรายงานว่าเสร็จ
- การเชื่อมต่อ ESP32 จริง / latency end-to-end / ความแม่นยำเทียบ Nasometer / การทดสอบกับเด็กจริง
- ประสิทธิภาพบนมือถือจริง (ยังวัดได้แค่เดสก์ท็อป 120 Hz + จำลองขนาดจอ) / 60 fps ทุกเครื่อง
- การยืนยันตัวตนหรือการควบคุมสิทธิ์ (สลับมุมมองเด็ก/ครูเป็นเดโมเท่านั้น) / การปฏิบัติตาม PDPA
