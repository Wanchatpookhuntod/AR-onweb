# Web AR — Cloud Run container
FROM node:20-slim

WORKDIR /app

# ติดตั้ง dependency ก่อน (ใช้ layer cache) — ต้องมี package-lock.json
COPY package*.json ./
RUN npm ci --omit=dev

# คัดลอกซอร์สที่เหลือ
COPY . .

ENV NODE_ENV=production
# Cloud Run กำหนด PORT ให้เอง (ค่าเริ่มต้น 8080) แล้ว server.js อ่านจาก process.env.PORT
EXPOSE 8080

CMD ["node", "server.js"]
