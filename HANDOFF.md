# HANDOFF

## จุดปัจจุบัน
เว็บต้นแบบครบ 8 หน้าจอ (Home, Calibrate, วิ่งหนี, ด่านประตู, สรุปรอบ, บอลลูน, กบ, แดชบอร์ด) ทำงานกับ **สัญญาณจำลอง** เท่านั้น
ผลตรวจล่าสุด: typecheck ผ่าน · tests 44/44 · lint 0 error · build ผ่าน · console สะอาดหลัง reload · ไม่มี horizontal overflow ที่ 360px
รายละเอียดสิ่งที่ตรวจและแก้: `PROGRESS.md` · งานค้าง: `TODO.md` · เหตุผลการออกแบบ: `DECISIONS.md` · ข้อกำหนด: `PROJECT_BRIEF.md`

## ตำแหน่ง
- โฟลเดอร์โปรเจกต์: `D:\nasal-trainer-web` (ย้ายมาจากโฟลเดอร์ชั่วคราวของเซสชัน Claude เมื่อ 4 พ.ย. 2569) · git repo branch `master` (commit แรก = สถานะในเอกสารนี้)
- ไวร์เฟรมอ้างอิง: รูปแนบในแชต 2 รูป · แคนวาส `https://claude.ai/artifact/J6U1UhshXtkDD17eX4NTqi` เปิดไม่ได้ในเซสชันนี้ (ไม่ได้ตรวจกับต้นฉบับโดยตรง)
- brief: `C:\Users\TCcomputer\Documents\Codex\2026-11-04\1-ai-2-esp32-nasalance-nasometer\outputs\claude-overnight-web-prompt.txt`

## เริ่มระบบ
```bash
npm install
npm run dev          # http://localhost:5173/#/home  และ  http://localhost:5173/#/dashboard
```
ใน Claude desktop: `.claude/launch.json` มีชื่อ `web` (npm run dev --port 5173 --strictPort)

## วิธีตรวจ
```bash
npm run typecheck && npm test && npm run lint && npm run build
```
ตรวจด้วยมือ (ประมาณ 5 นาที):
1. Home → “ปรับเครื่องก่อนเล่น” → ขั้น 2: เปิด “มีเสียง” รอ 3 วินาที → ต่อไป → ขั้น 3: ลากแถบเป็น 45% → ต่อไป → เห็น “แยกกันได้”
2. “เริ่มเล่น” → เลือก “เป็นช่วง ๆ” → ครบ 6 ครั้ง → “ไปด่านประตู” → ลากแถบเป็น 45% → ประตูเปิด → “ผ่านด่าน → สรุปรอบ”
3. บอลลูน: ลาก 80% + “มีเสียง” → ครบ 3 ลูก; ลองสลับ “ไม่มีเสียง” กลางทาง เวลาต้องหยุดแต่ไม่รีเซ็ต
4. กบ: “กดค้างเพื่อพูด” ค้างนาน = 1 ก้าว; ลาก 50% แล้วพูด = splash ไม่ลดก้าว
5. แดชบอร์ด: แก้เกณฑ์เป็น 75 → บันทึก → กลับฝั่งเด็กเห็น “เกณฑ์ออกปาก 75%”; ลอง 101 ต้องขึ้นข้อความผิดพลาด
6. “ตัวเลือกทดสอบเพิ่ม” → “ตัดการเชื่อมต่อ” ในเกมใดก็ได้ → ต้องขึ้น “อุปกรณ์หลุด (จำลอง)” และไม่นับคะแนน

หมายเหตุการตรวจใน Claude Browser pane: ถ้า pane ถูกซ่อน เบราว์เซอร์ลดเฟรมเหลือ ~2 fps เกมจะช้าลง (logic ยังถูก) — เปิด pane ให้เห็นก่อนวัดเวลา

## โครงไฟล์หลัก
- `src/signal/` — `SignalSource`, `MockSignalSource`, `SignalProcessor`, โครง `WebSocketSignalSource`
- `src/logic/` — `segmenter`, `latch`, `runner`, `gate`, `balloon`, `frog`, `scoring` + `logic.test.ts`
- `src/data/` — `plan` (ค่าเริ่มต้น/validation), `store` (localStorage), `seed`, `analytics` (รายสัปดาห์/กฎแจ้งเตือน), `rounds` + `data.test.ts`
- `src/screens/` — 8 หน้าจอ + `useGameRuntime` (loop/พัก/รีสตาร์ต)
- `src/components/` — Meter, DemoPanel, BarChart, GameParts (HUD/โจทย์/พัก), Art (SVG), Chrome (view switch/disclaimer)
- `src/styles/` — tokens, base, kid, dashboard

## งานถัดไปที่ชัดเจน
1. แตก branch ใหม่จาก `master` สำหรับงานถัดไป แล้วรัน `npm install` + `npm run typecheck && npm test` ก่อนเริ่มแก้
2. ผูก ESP32 ผ่าน `WebSocketSignalSource` (รูปแบบข้อความ `{"nasalPercent":28.5,"speechDetected":true}` หรือ `28.5,1`) และเพิ่มตัวเลือกแหล่งสัญญาณใน UI
3. วัด latency จริงและปรับค่า segmenter กับเสียงจริง
4. ให้นักแก้ไขการพูดรีวิวคำในหน้าจอเด็ก กฎแจ้งเตือน และค่าเริ่มต้น 70/40
5. ทดสอบ screen reader และ reduced-motion

## สิ่งที่ห้ามรายงานว่าเสร็จ
- การเชื่อมต่อ ESP32 จริง / latency end-to-end / ความแม่นยำเทียบ Nasometer / การทดสอบกับเด็กจริง
- การยืนยันตัวตนหรือการควบคุมสิทธิ์ (สลับมุมมองเด็ก/ครูเป็นเดโมเท่านั้น) / การปฏิบัติตาม PDPA
