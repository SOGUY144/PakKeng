# [ชื่อเกม] — เว็บต้นแบบเกมฝึกพูด (เดโม)

เครื่องมือฝึกเสริมที่บ้าน ภายใต้คำแนะนำของนักแก้ไขการพูด
ต้นแบบนี้ยังไม่ได้ตรวจสอบเทียบกับ Nasometer ใช้ดูแนวโน้มจากการฝึกเท่านั้น ไม่ใช้วินิจฉัย

ค่าทั้งหมดในเดโมมาจาก **สัญญาณจำลอง** (MockSignalSource) — ยังไม่ได้ต่อ ESP32 จริง

## เริ่มใช้งาน
```bash
npm install
npm run dev
```
เปิด
- ฝั่งเด็ก: http://localhost:5173/#/home
- แดชบอร์ดนักแก้ไขการพูด: http://localhost:5173/#/dashboard

## ตรวจงาน
```bash
npm run typecheck   # tsc strict
npm test            # vitest (logic เกม, ข้อมูล, กฎแจ้งเตือน, validation)
npm run lint        # oxlint
npm run build       # สร้างไฟล์ใน dist/
```

## 8 หน้าจอ (hash route)
`#/home` · `#/calibrate` · `#/runner` · `#/gate` · `#/result` · `#/balloon` · `#/frog` · `#/dashboard`

## เครื่องมือเดโม (อยู่ใต้หน้าเกม / ด้านขวาบนจอกว้าง)
- แถบเลื่อน “ค่าออกปาก (จำลอง)” 0–100% (ออกจมูก = 100 − ออกปาก)
- เสียงพูด: ไม่มีเสียง / มีเสียง / เป็นช่วง ๆ และปุ่ม “กดค้างเพื่อพูด” (หรือกด Space ค้าง)
- ตัวเลือกทดสอบเพิ่ม: ค่อย ๆ เปลี่ยน, แกว่งใกล้เกณฑ์, ตัด/ต่อการเชื่อมต่อ, รีเซ็ต

เอกสารประกอบ: `PROJECT_BRIEF.md`, `DECISIONS.md`, `PROGRESS.md`, `TODO.md`, `HANDOFF.md`, `NEXT_PROMPT.txt`
ภาพหน้าจอจากเบราว์เซอร์จริง: `docs/screenshots/`
