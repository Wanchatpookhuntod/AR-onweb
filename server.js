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
const WORLD_AR = path.join(ROOT, 'world-ar');

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
  if (url === '/' || url === '/index.html' || url === '/menu.html') {
    return sendFile(res, path.join(TEMPLATES, 'menu.html'));
  }

  // หน้า AR: model-viewer (iOS Quick Look + Android Scene Viewer)
  if (url === '/ar' || url === '/ar.html') {
    return sendFile(res, path.join(TEMPLATES, 'mv.html'));
  }

  // รายการโมเดล: สแกน static/models/ หาไฟล์ .glb แล้วจับคู่ .usdz ชื่อเดียวกัน
  // เพิ่มโมเดลใหม่แค่วางไฟล์ลงโฟลเดอร์ ไม่ต้องแก้โค้ด
  if (url === '/api/models') {
    const dir = path.join(STATIC, 'models');
    fs.readdir(dir, (err, files) => {
      if (err) files = [];
      const models = files
        .filter(f => f.toLowerCase().endsWith('.glb'))
        .sort()
        .map(f => {
          const name = f.slice(0, -4);
          const usdz = files.find(u => u.toLowerCase() === (name + '.usdz').toLowerCase());
          return {
            name,
            glb: `/static/models/${f}`,
            usdz: usdz ? `/static/models/${usdz}` : null, // null = iPhone เข้า AR ไม่ได้
          };
        });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(models));
    });
    return;
  }

  // หน้า taksin: World AR "ตามรอยพระเจ้าตาก" (GPS + เข็มทิศ)
  // redirect ให้ลงท้ายด้วย / เพื่อให้ relative path (css/, js/, assets/) ใน index.html ทำงาน
  if (url === '/world-ar' || url === '/world-ar.html') {
    res.writeHead(302, { Location: '/world-ar/' });
    res.end();
    return;
  }
  if (url.startsWith('/world-ar/')) {
    const rel = url.slice('/world-ar/'.length) || 'index.html';
    const filePath = safeJoin(WORLD_AR, rel);
    if (!filePath) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    return sendFile(res, filePath);
  }

  // Alias assets for shared UI images used by /ar page
  if (url.startsWith('/assets/')) {
    const assetsBase = path.join(WORLD_AR, 'assets');
    const filePath = safeJoin(assetsBase, url.slice('/assets/'.length));
    if (!filePath) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    return sendFile(res, filePath);
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
const HTTPS_PORT = PORT + 1; // HTTP=5001, HTTPS=5002 (or --port offset)

// HTTP server: localhost → serve normally, IP → redirect to HTTPS
const httpServer = http.createServer((req, res) => {
  const host = req.headers.host || '';
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocalhost) {
    // Redirect non-localhost HTTP → HTTPS (port HTTPS_PORT)
    const httpsUrl = `https://${ip}:${HTTPS_PORT}${req.url}`;
    res.writeHead(301, { Location: httpsUrl });
    res.end();
    return;
  }
  handler(req, res);
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(56));
  console.log(`  HTTP  (localhost) : http://localhost:${PORT}`);
  console.log(`  เปิดบนเครื่องนี้ : http://localhost:${PORT}`);
  console.log('='.repeat(56));
});

// Always start HTTPS server (works on mobile/IP)
let pems;
try {
  const selfsigned = require('selfsigned');
  pems = selfsigned.generate(
    [{ name: 'commonName', value: ip }],
    { days: 365, keySize: 2048 }
  );
  const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, handler);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`  HTTPS (มือถือ)   : https://${ip}:${HTTPS_PORT}`);
    console.log('='.repeat(56));
    console.log('  ** มือถือต้องอยู่ WiFi เดียวกัน **');
    console.log('  ** กด Advanced → Proceed เมื่อเตือน cert **');
    printQr(`https://${ip}:${HTTPS_PORT}`);
    console.log('='.repeat(56));
  });
} catch (e) {
  console.log('  (รัน npm install เพื่อเปิด HTTPS สำหรับมือถือ)');
  console.log('='.repeat(56));
}
