# Web AR — model-viewer

AR ในเบราว์เซอร์ด้วย **`<model-viewer>`**: แตะวางโมเดล 3D ในโลกจริง รองรับทั้ง iOS และ Android

## ฟีเจอร์
- วางโมเดลบนพื้นจริง (markerless) — ระบบจัดการ plane detection / preview ให้ในตัว
- **iOS** → AR Quick Look (ไฟล์ `.usdz`)
- **Android** → Scene Viewer / WebXR (ไฟล์ `.glb`)
- หมุน + ย่อ/ขยายโมเดลได้ (รองรับโดย AR viewer ของ OS)
- โหลด model-viewer จากไฟล์ในเครื่อง — รันได้แม้ CDN ล่ม

## ความต้องการของอุปกรณ์
- **iOS 12+ Safari** หรือ **Android 8+ Chrome**
- ต้องเปิดผ่าน **HTTPS** หรือ `localhost`

## ติดตั้ง
```bash
npm install
```

## รัน

**ทดสอบบนมือถือจริง (HTTPS self-signed):**
```bash
node server.js --https
# หรือ: npm run https
```
เปิดบนมือถือ: `https://<IP-เครื่องคุณ>:5000`
(Chrome เตือนใบรับรอง → Advanced → Proceed)

**หรือใช้ ngrok (แนะนำ ใบรับรองถูกต้อง):**
```bash
node server.js
ngrok http 5000
```
เปิด URL `https://...ngrok...` ที่ ngrok ให้มาบนมือถือ

> เปลี่ยนพอร์ต: `node server.js --https --port 5001`

## วิธีใช้
1. เปิดหน้าเว็บ รอโมเดลโหลดเสร็จ
2. กด **🚀 เริ่ม AR** → อนุญาตกล้อง
3. ส่องกล้องไปที่พื้น/โต๊ะ แล้วแตะวางโมเดล
4. เดินรอบดู / ใช้สองนิ้วย่อ-ขยาย-หมุนได้

## โครงสร้าง
```
.
├── server.js               # Node.js server (เสิร์ฟหน้าเว็บ + HTTPS + QR)
├── package.json
├── templates/
│   ├── menu.html           # เมนูหลัก (/)
│   └── mv.html             # หน้า AR (/ar — model-viewer)
├── world-ar/               # หน้า /world-ar — "ตามรอยพระเจ้าตาก" World AR (GPS + เข็มทิศ)
│   ├── index.html
│   ├── css/  js/  assets/
└── static/
    ├── model-viewer.min.js
    └── models/             # Astronaut.glb (Android) + Astronaut.usdz (iOS)
```

## แก้ปัญหา
| อาการ | สาเหตุ |
|------|--------|
| ปุ่ม AR กดไม่ได้ / ค้าง "กำลังโหลด" | โมเดลยังโหลดไม่เสร็จ หรืออุปกรณ์ไม่รองรับ AR |
| เปิดแล้วจอดำ/error | เปิดผ่าน http บนมือถือ — ต้องเป็น HTTPS |
| iPhone กด AR ไม่ขึ้น | ต้องใช้ Safari (Chrome บน iOS ไม่รองรับ) และมีไฟล์ `.usdz` |
| โมเดลไม่ขึ้นบน Android | ตรวจไฟล์ `.glb` / อัปเดต Google Play Services for AR (ARCore) |
