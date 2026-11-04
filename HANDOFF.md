# HANDOFF

## จุดปัจจุบัน
เว็บต้นแบบครบ 8 หน้าจอ ฉากเกม (วิ่งหนี, ด่านประตู, บอลลูน, กบ) เป็น **3D** ด้วย three.js + React Three Fiber, ทำงานกับ **สัญญาณจำลอง** เท่านั้น
Home ใช้ภาพที่เรนเดอร์จากโมเดล 3D จริง, หน้าสรุปรอบมีฉากฉลอง 3D, Calibrate และแดชบอร์ดคงแบบเดิม (ไม่เติมฉาก 3D)
ภาพ 2D เดิมยังอยู่เป็นทางเลือกสำรอง (WebGL ใช้ไม่ได้/หลุด หรือเลือก “2D” ในเครื่องมือเดโม)
ผลตรวจล่าสุด: typecheck ผ่าน · tests 46/46 · lint 0 error / 58 warning · build ผ่าน · เดิน flow ครบในเบราว์เซอร์ (รายละเอียด `PROGRESS.md`)

## ตำแหน่ง
- โฟลเดอร์โปรเจกต์: `D:\nasal-trainer-web` · git: `master` = commit แรก (รุ่น 2D), งาน 3D commit แล้วบน branch `feat/3d-games`
  (ยังไม่ merge เข้า `master`)
- GitHub: https://github.com/Gupalmza/nasal-trainer-web (**private**) · push ทั้ง 2 branch แล้ว · default branch ตั้งเป็น `feat/3d-games` ไว้ก่อน (รุ่น 3D เป็นรุ่นหลัก)
- เว็บที่ deploy: https://nasal-trainer-web.vercel.app (รุ่น 3D จาก commit `a78b1b0`, ใครมีลิงก์ก็เปิดได้, ข้อมูลจำลองทั้งหมด) — วิธี deploy ใหม่ดูหัวข้อ “Deploy (Vercel)”
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
- ให้ deploy อัตโนมัติทุก push: ติดตั้ง Vercel GitHub App แบบเลือกเฉพาะ repo นี้ แล้วรัน `npx vercel@65.2.0 git connect --scope gupalmzas-projects`
- URL เฉพาะของแต่ละ deployment (`nasal-trainer-<id>-gupalmzas-projects.vercel.app`) ต้องล็อกอิน Vercel; โดเมนหลักเปิดได้ทุกคน · `.vercel/` อยู่ใน `.gitignore`

## วิธีตรวจ
```bash
npm run typecheck && npm test && npm run lint && npm run build
```
ตรวจด้วยมือ (≈10 นาที) — ที่เครื่องมือเดโม → “ตัวเลือกทดสอบเพิ่ม” มี **ภาพฉากเกม** (อัตโนมัติ/3D สูง/3D ประหยัด/2D + ตัวนับ fps, draw calls, สามเหลี่ยม) และ **ภาพเคลื่อนไหว** (ตามเครื่อง/ลดลง/เต็ม)
> เครื่องที่ใช้พัฒนาตั้งค่า “ลดการเคลื่อนไหว” ของระบบไว้: ถ้าเลือก “ตามเครื่อง” ฉากจะไม่เลื่อนและไม่มีประกาย — เลือก “เต็ม” เพื่อดูภาพเคลื่อนไหวครบ
1. Home → “เริ่มเล่น” → เลือก “เป็นช่วง ๆ” ลากแถบ 82% → กระต่ายวิ่งเร็ว ฝุ่นน้ำเงิน เพื่อนเมฆถอย แถบระยะน้ำเงินยาวขึ้น → ครบ 6 คำ → “ไปด่านประตู”
2. ประตู: ลากแถบ 45% (ออกจมูก 55%) → ประกายส้มลอยไปที่ตรา ลูกปัดติดทีละเม็ด → 100% บานเปิด แสงอุ่นด้านหลัง → “ผ่านด่าน → สรุปรอบ” (มีฉากฉลอง)
3. บอลลูน: 82% + “มีเสียง” → บอลลูนขึ้นเข้าโซน (เสาน้ำเงินเหนือวงแหวน) สะสม 3 ลูก; 60% → ต่ำกว่าวงแหวน ไม่นับเวลา
4. กบ: “กดค้างเพื่อพูด”/Space ค้าง 3 วินาที = 1 ก้าว; ลาก 50% แล้วพูด = กระโดดตกน้ำตื้น น้ำกระเซ็น แล้วกลับใบเดิม ก้าวไม่ลด
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
