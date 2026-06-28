# Web AR — Plane Detection (three.js + Flask)

AR ในเบราว์เซอร์ด้วย **WebXR**: ตรวจจับพื้นผิว/ระนาบ (plane detection) แล้วแตะวางวัตถุ 3D

## ฟีเจอร์
- `hit-test` — แสดงวงแหวน (reticle) เกาะตามพื้น/โต๊ะที่ตรวจเจอ
- `plane-detection` — วาดโพลิกอนของระนาบที่ตรวจเจอเป็นสีฟ้าโปร่งแสง
- แตะหน้าจอเพื่อวางวัตถุ (โคนสีต่าง ๆ) ลงบนระนาบ
- three.js โหลดผ่าน CDN (importmap) — ไม่ต้อง build

## ความต้องการของอุปกรณ์
- **Android + Chrome + ARCore** (iOS Safari ยังไม่รองรับ WebXR AR)
- ต้องเปิดผ่าน **HTTPS** หรือ `localhost`

## ติดตั้ง
```bash
cd webar
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## รัน

**ทดสอบบนมือถือจริง (HTTPS self-signed):**
```bash
python app.py --https
```
เปิดบนมือถือ: `https://<IP-เครื่องคุณ>:5000`
(Chrome เตือนใบรับรอง → Advanced → Proceed)

**หรือใช้ ngrok (แนะนำ ใบรับรองถูกต้อง):**
```bash
python app.py
ngrok http 5000
```
เปิด URL `https://...ngrok...` ที่ ngrok ให้มาบนมือถือ

## วิธีใช้
1. กด **เริ่ม AR** → อนุญาตกล้อง
2. เลื่อนกล้องส่องพื้น/โต๊ะช้า ๆ ให้ ARCore จับระนาบ
3. เห็นวงแหวนสีฟ้า → **แตะหน้าจอ** เพื่อวางวัตถุ

## โครงสร้าง
```
webar/
├── app.py                  # Flask server (เสิร์ฟหน้าเว็บ + HTTPS)
├── requirements.txt
├── templates/
│   └── index.html          # โค้ด WebXR + three.js ทั้งหมด
└── static/                 # (ว่าง — เผื่อใส่โมเดล .glb ภายหลัง)
```

## แก้ปัญหา
| อาการ | สาเหตุ |
|------|--------|
| ปุ่ม "เริ่ม AR" กดไม่ได้ | อุปกรณ์/เบราว์เซอร์ไม่รองรับ immersive-ar |
| "ไม่รองรับ WebXR" | เปิดบน iOS หรือเดสก์ท็อป — ต้องใช้ Android Chrome |
| เข้าได้แต่ขึ้นจอดำ/error | เปิดผ่าน http บนมือถือ — ต้องเป็น HTTPS |
| ไม่เห็นโพลิกอนระนาบ | อุปกรณ์ไม่รองรับ `plane-detection` (hit-test ยังใช้ได้ปกติ) |
