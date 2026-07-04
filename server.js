/*
 * Web AR — Node.js server
 * -----------------------
 * เสิร์ฟหน้าเว็บ AR ด้วย <model-viewer> (รองรับทั้ง iOS Quick Look และ Android Scene Viewer)
 *
 * AR บนมือถือบังคับ secure context:
 *   - localhost           -> ใช้ http ได้ (เทสบนเครื่องเดียวกัน)
 *   - เปิดบนมือถือจริง     -> ต้องเป็น HTTPS
 *
 * รันแบบ HTTPS (self-signed) สำหรับทดสอบบนมือถือ:
 *     npm install
 *     node server.js --https
 * แล้วเปิด  https://<IP-เครื่องคุณ>:5000  บนมือถือ
 * (ถ้าเตือนใบรับรองไม่ปลอดภัย ให้กด Advanced -> Proceed)
 *
 * หรือใช้ ngrok แทน HTTPS:
 *     node server.js
 *     ngrok http 5000
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- อ่าน argument ----------
const argv = process.argv.slice(2);
const useHttps = argv.includes('--https');
const portIdx = argv.indexOf('--port');
const PORT = portIdx !== -1 && argv[portIdx + 1] ? parseInt(argv[portIdx + 1], 10) : 5000;

const ROOT = __dirname;
const TEMPLATES = path.join(ROOT, 'templates');
const STATIC = path.join(ROOT, 'static');

// ---------- MIME types ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.usdz': 'model/vnd.usdz+zip',
  '.bin': 'application/octet-stream',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store', // ปิด cache เพื่อให้แก้ไฟล์แล้วเห็นผลทันทีตอน dev
    });
    res.end(data);
  });
}

// กัน path traversal: บังคับให้อยู่ในโฟลเดอร์ที่อนุญาต
function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
}

// ---------- router ----------
function handler(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // หน้าเมนูหลัก: 2 ตัวเลือก
  if (url === '/' || url === '/index.html') {
    return sendFile(res, path.join(TEMPLATES, 'index.html'));
  }

  // หน้า AR: model-viewer (iOS Quick Look + Android Scene Viewer)
  if (url === '/ar' || url === '/ar.html') {
    return sendFile(res, path.join(TEMPLATES, 'mv.html'));
  }

  // หน้าว่าง (เผื่อใส่เนื้อหาภายหลัง)
  if (url === '/page2' || url === '/page2.html') {
    return sendFile(res, path.join(TEMPLATES, 'page2.html'));
  }

  // ไฟล์ static: /static/...
  if (url.startsWith('/static/')) {
    const filePath = safeJoin(STATIC, url.slice('/static/'.length));
    if (!filePath) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    return sendFile(res, filePath);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

// ---------- หา local IP ----------
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// ---------- พิมพ์ QR ลง terminal ----------
function printQr(url) {
  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(url, { small: true }, (qr) => {
      process.stdout.write(qr);
      console.log(`  ^ สแกน QR นี้ด้วยกล้องมือถือ -> ${url}`);
    });
  } catch (e) {
    console.log('  (รัน `npm install` เพื่อแสดง QR code ให้สแกน)');
  }
}

// ---------- start ----------
const ip = getLocalIp();
const scheme = useHttps ? 'https' : 'http';
const phoneUrl = `${scheme}://${ip}:${PORT}`;

let server;
if (useHttps) {
  let pems;
  try {
    const selfsigned = require('selfsigned');
    pems = selfsigned.generate(
      [{ name: 'commonName', value: ip }],
      { days: 365, keySize: 2048 }
    );
  } catch (e) {
    console.error('ต้องติดตั้ง dependency ก่อน:  npm install');
    process.exit(1);
  }
  server = https.createServer({ key: pems.private, cert: pems.cert }, handler);
} else {
  server = http.createServer(handler);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(56));
  console.log(`  เปิดบนเครื่องนี้ : ${scheme}://localhost:${PORT}`);
  console.log(`  เปิดบนมือถือ    : ${phoneUrl}`);
  if (!useHttps) {
    console.log('  * มือถือต้องใช้ HTTPS -> รันใหม่ด้วย:  node server.js --https');
  }
  console.log('='.repeat(56));
  console.log('  ** มือถือต้องอยู่ WiFi เดียวกับเครื่องนี้ **');
  printQr(phoneUrl);
  console.log('='.repeat(56));
});
