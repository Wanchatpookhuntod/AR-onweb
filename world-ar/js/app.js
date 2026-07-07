// ═══ SPOTS ═══ (โหลดจาก assets/src/location.json — ไม่ฝังพิกัดไว้ในโค้ด)
let SPOTS = [];
const ICON_DIR = 'assets/src/icon-place/';           // ไอคอนแยกตามชื่อ id ของแต่ละสถานที่
const iconOf = id => `${ICON_DIR}${id}.png`;
const spotIcons = {};                                // id -> Image (สำหรับวาดบน canvas เข็มทิศ)
const VFX_CYCLE = ['golden', 'shrine', 'royal', 'lantern', 'khmer', 'forest', 'lotus'];
// VFX เฉพาะของแต่ละสถานที่ — ผูกตาม id ให้มีเอกลักษณ์ต่างกัน
const SPOT_VFX = {
  san_phra_kan: 'shrine',                        // ศาลพระกาฬ — ควันธูป/ประกายไฟแดง
  wat_phra_si_rattana_mahathat: 'golden',        // วัดพระศรีรัตนมหาธาตุ — แสงทองพระธาตุ
  somdet_phra_narai_national_museum: 'royal',    // พระราชวังนารายณ์ — รัศมีม่วงหลวง+ประกายทอง
  ban_wichayen: 'lantern',                       // บ้านวิชาเยนทร์ — โคมไฟอำพันยุโรป
  phra_prang_sam_yot: 'khmer',                   // พระปรางค์สามยอด — เสาแสงขอมสามยอด
  wat_pa_tham_sophon: 'forest',                  // วัดป่าธรรมโสภณ — หิ่งห้อย/ใบไม้ป่า
  wat_tong_pu: 'lotus',                          // วัดตองปุ — กลีบบัวชมพู
};
const VFX_LABELS = {
  golden: "✦ SACRED LIGHT", shrine: "🔥 SPIRIT EMBERS", royal: "♛ ROYAL RADIANCE",
  lantern: "🏮 LANTERN GLOW", khmer: "◈ KHMER SPIRES", forest: "🍃 FOREST SPIRITS",
  lotus: "🪷 LOTUS BLOOM", sacred: "◈ RELIC AURA", battle: "⚔ BATTLE FIRE",
};
// สีประจำเอฟเฟกต์ — ใช้กับเลเยอร์แสงศักดิ์สิทธิ์ (god-rays/บลูม/ดาวประกาย)
const VFX_TINT = {
  golden: [255, 210, 90], shrine: [255, 95, 40], royal: [190, 130, 255],
  lantern: [255, 185, 95], khmer: [240, 155, 75], forest: [140, 245, 130],
  lotus: [255, 155, 210], sacred: [255, 250, 220], battle: [255, 85, 30],
};
const AIM_DEG = 22, UNLOCK_M = 200;
const VIEW_M = 1000;    // ระยะการมองเห็น spot (1 กม) — เกินระยะนี้ไม่แสดง/เล็ง/effect
const RADIUS_M = 300;   // รัศมีของสถานที่ — อยู่ในระยะนี้ถือว่า "อยู่ในสถานที่นั้น"
const ROAM_CYCLE_SECS = 9;  // ปลดล็อคครบ 7 → หมุนเวียน VFX ของทั้ง 7 ทุก ~9 วิ (roaming reward)
const REVEAL_DELAY_MS = 10000;  // หลังปลดล็อคสถานที่สุดท้าย → รอ 10 วิ ก่อนขึ้นป้ายฉลอง
const REVEAL_POPUP_MS = 7000;   // ป้ายฉลองแสดง ~7 วิ แล้วสถานะ unlock (effect ตลอด) จึงเริ่ม

// โหลดสถานที่จากไฟล์ JSON แล้ว map เป็นรูปแบบที่แอปใช้
const spotsReady = fetch('assets/src/location.json')
  .then(r => r.json())
  .then(data => {
    SPOTS = data.map((s, i) => ({
      id: s.id, name: s.name, desc: s.desc || '',
      lat: s.lat, lng: s.lng,
      icon: iconOf(s.id),                            // ไอคอนเฉพาะของสถานที่ (icon-place/<id>.png)
      vfx: SPOT_VFX[s.id] || VFX_CYCLE[i % VFX_CYCLE.length],  // VFX เฉพาะตาม id
    }));
    // preload รูปไอคอนไว้ก่อน สำหรับวาดบนแถบเข็มทิศ
    SPOTS.forEach(s => { const im = new Image(); im.src = s.icon; spotIcons[s.id] = im; });
    return SPOTS;
  })
  .catch(e => { console.error('โหลด location.json ไม่สำเร็จ:', e); return SPOTS; });

// ═══ STATE ═══
let userLat = null, userLng = null, rawH = 0, smoothH = 0;
let aimedSpot = null, activeVFX = null, vfxFade = 0;
let insideSpotId = null;   // id ของสถานที่ที่ผู้ใช้ "อยู่ใน" รัศมี (RADIUS_M) — ถ้ามี จะแสดงเฉพาะที่นั่น
let unlocked = loadUnlocked(), toastTimer = null, T = 0;
// สถานะ reveal ป้ายฉลอง "ครบทั้ง 7" — เก็บเวลาที่ปลดล็อคครบไว้ กันรีเซ็ตตอนรีโหลด
let allUnlockedAt = parseInt(localStorage.getItem('allUnlockedAt') || '0', 10) || null;
let revealPopupShown = localStorage.getItem('revealPopupShown') === '1';
let ps = [], ss = [], sparks = [];   // sparks = สะเก็ดไฟ (ใช้เฉพาะ vfxShrine)
let auraStars = [];                   // ดาวประกายของเลเยอร์แสงศักดิ์สิทธิ์ (grandAura)
let headingOffset = parseInt(localStorage.getItem('headingOffset') || '0', 10);
let hBuf = [], compassAccuracy = 1;
let hwAccuracy = -1;              // iOS ฮาร์ดแวร์: 0-1 (-1 = ไม่รู้)
let prevRawH = null, turnRate = 0; // ความเร็วหมุน — แยก motion ออกจาก noise
let screenAngle = 0;             // มุมหมุนหน้าจอ — ชดเชย portrait/landscape
let compassUnreliable = false;   // Android fallback ที่ไม่ใช่ทิศเหนือจริง

// ═══ PERSIST UNLOCKED ═══ (เก็บได้หลายสถานที่ ไม่ต้อง login)
function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem('unlockedSpots')) || {}; }
  catch (e) { return {}; }
}
function saveUnlocked() {
  try { localStorage.setItem('unlockedSpots', JSON.stringify(unlocked)); }
  catch (e) {}
}
// ปลดล็อคครบทุกสถานที่หรือยัง (ครบ 7 พระบรมธาตุ)
function allSpotsUnlocked() {
  return SPOTS.length > 0 && SPOTS.every(s => unlocked[s.id]);
}

// ═══ CANVAS ═══
const cv = document.getElementById('vfx');
const ctx = cv.getContext('2d');
function resizeCV() { cv.width = innerWidth; cv.height = innerHeight; spawnParticles(); }

// ═══ MATH ═══
function hav(a, b, c, d) {
  const R = 6371000, dL = (c - a) * Math.PI / 180, dG = (d - b) * Math.PI / 180;
  const x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bear(a, b, c, d) {
  const dG = (d - b) * Math.PI / 180;
  const y = Math.sin(dG) * Math.cos(c * Math.PI / 180);
  const x = Math.cos(a * Math.PI / 180) * Math.sin(c * Math.PI / 180) - Math.sin(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.cos(dG);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function adiff(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
function sAngle(c, t, a) { let d = t - c; if (d > 180) d -= 360; if (d < -180) d += 360; return c + d * a; }

// ═══ PARTICLES ═══
function mkP(W, H) {
  const z = Math.random();
  return {
    x: Math.random() * W,
    y: z < 0.5 ? H * 0.6 + Math.random() * H * 0.5 : Math.random() * H,
    vx: (Math.random() - .5) * .9, vy: -(0.3 + Math.random() * 1.5),
    size: 1.5 + Math.random() * 3.5,
    life: z > 0.5 ? Math.random() * .4 : 0, maxLife: .5 + Math.random() * .5,
    type: Math.floor(Math.random() * 3), phase: Math.random() * Math.PI * 2
  };
}
function mkS(W, H) {
  return {
    x: Math.random() * W, y: H * .25 + Math.random() * H * .55,
    vx: (Math.random() - .5) * .3, vy: -(0.08 + Math.random() * .22),
    size: 40 + Math.random() * 90, life: Math.random() * .3,
    opacity: .025 + Math.random() * .06, phase: Math.random() * Math.PI * 2
  };
}
function spawnParticles() {
  const W = cv.width, H = cv.height;
  ps = Array.from({ length: 160 }, () => mkP(W, H));
  ss = Array.from({ length: 50 }, () => mkS(W, H));
}

// ═══ START ═══
let selectedSpot = null;

async function startApp() {
  const err = document.getElementById('perr');
  if (err) err.style.display = 'none';
  
  try {
    const video = document.getElementById('video');
    if (!video) throw new Error('Video element not found');
    
    // Check mediaDevices availability (requires HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!isSecure) {
        const errEl = document.getElementById('perr');
        if (errEl) {
          errEl.innerHTML = '❌ ต้องใช้ HTTPS เพื่อเปิดกล้อง<br><small>กรุณาเข้าผ่าน https:// หรือ localhost</small>';
          errEl.style.display = 'block';
        }
        return;
      }
      throw new Error('mediaDevices API not supported in this browser');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
    );
    video.srcObject = stream;
    await video.play();
    
    // ข้ามหน้าปรับเข็มทิศ → เข้า AR โดยตรง
    const perm = document.getElementById('perm');
    const hud = document.getElementById('hud');
    if (perm) perm.style.display = 'none';
    if (hud) hud.style.display = 'block';

    await spotsReady;               // ให้แน่ใจว่าโหลดสถานที่จาก location.json เสร็จก่อน
    resizeCV();
    window.addEventListener('resize', resizeCV);
    startGPS();
    startCompass();
    buildChips();
    loop();
    showToast('World AR พร้อมแล้ว', 'หันกล้องหา spot');
  } catch (e) {
    const errEl = document.getElementById('perr');
    let msg = '';
    if (e.name === 'NotAllowedError') msg = '❌ กรุณาอนุญาตการเข้าถึงกล้อง';
    else if (e.name === 'NotFoundError') msg = '❌ ไม่พบกล้องในอุปกรณ์นี้';
    else if (e.name === 'NotReadableError') msg = '❌ กล้องถูกใช้งานโดยแอปอื่น';
    else if (e.name === 'SecurityError') msg = '❌ ต้องใช้ HTTPS สำหรับกล้อง';
    else msg = '❌ ' + e.name + ': ' + e.message;
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    console.error('startApp error:', e.name, e.message, e);
  }
}

// ═══ MODEL SELECTION ═══
function buildModelGrid() {
  const grid = document.getElementById('model-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SPOTS.forEach(spot => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.dataset.id = spot.id;
    card.innerHTML = `
      <div class="model-card-icon"><img src="${spot.icon}" alt=""></div>
      <div class="model-card-name">${spot.name}</div>
      <div class="model-card-desc">${spot.desc}</div>
    `;
    card.onclick = () => selectModel(spot.id);
    grid.appendChild(card);
  });
}

function selectModel(spotId) {
  selectedSpot = spotId;
  const spot = SPOTS.find(s => s.id === spotId);
  if (spot) {
    const spotEl = document.getElementById('cal-intro-spot');
    if (spotEl) spotEl.textContent = spot.name;
  }
  const modelSelect = document.getElementById('model-select');
  const calIntro = document.getElementById('cal-intro');
  if (modelSelect) modelSelect.style.display = 'none';
  if (calIntro) calIntro.style.display = 'flex';
}

function backToIntro() {
  const modelSelect = document.getElementById('model-select');
  const perm = document.getElementById('perm');
  if (modelSelect) modelSelect.style.display = 'none';
  if (perm) perm.style.display = 'flex';
}

// ═══ START AR AFTER CALIBRATION ═══
function startARAfterCal() {
  const calIntro = document.getElementById('cal-intro');
  const hud = document.getElementById('hud');
  if (calIntro) calIntro.style.display = 'none';
  if (hud) hud.style.display = 'block';
  buildChips();
  loop();
  showToast('⚔️', 'World AR พร้อมแล้ว', 'หันกล้องหา spot');
}

// ═══ GPS ═══
let gpsStarted = false;
function startGPS() {
  if (gpsStarted) return;         // preload แล้ว ไม่เริ่มซ้ำ
  gpsStarted = true;
  if (!navigator.geolocation) { setDemo(); return; }
  navigator.geolocation.watchPosition(pos => {
    userLat = pos.coords.latitude; userLng = pos.coords.longitude;
    const dot = document.getElementById('gps-dot');
    if (dot) { dot.style.animation = 'none'; dot.style.background = '#4CAF50'; dot.style.boxShadow = '0 0 5px #4CAF50'; }
    const txt = document.getElementById('gps-txt');
    if (txt) txt.textContent = 'GPS OK';
    const coord = document.getElementById('coord-txt');
    if (coord) coord.textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
    updateChips();
  }, () => setDemo(), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
}
function setDemo() {
  userLat = 14.7998; userLng = 100.6133;
  document.getElementById('gps-txt').textContent = 'Demo';
  document.getElementById('coord-txt').textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
  updateChips();
}

// ═══ COMPASS ═══
function readScreenAngle() {
  screenAngle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (window.orientation || 0);
}
function startCompass() {
  readScreenAngle();
  addEventListener('orientationchange', readScreenAngle);

  const handleIOS = e => {
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
      // webkitCompassHeading = ทิศจริงที่ขอบบนเครื่องชี้ (CW) — ชดเชยการหมุนจอ
      rawH = (e.webkitCompassHeading + screenAngle + headingOffset + 720) % 360;
      // เก็บความแม่นยำฮาร์ดแวร์แยกไว้ ไม่ให้ถูก variance เขียนทับ
      hwAccuracy = e.webkitCompassAccuracy >= 0
        ? Math.max(0, 1 - e.webkitCompassAccuracy / 45)
        : -1;
    }
  };
  const handleAbsolute = e => {
    if (e.alpha !== null)
      rawH = ((360 - e.alpha) + screenAngle + headingOffset + 720) % 360;
  };

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    // iOS — requires permission prompt
    DeviceOrientationEvent.requestPermission()
      .then(s => { if (s === 'granted') addEventListener('deviceorientation', handleIOS); })
      .catch(() => {});
  } else {
    // Android — deviceorientationabsolute ให้ทิศเหนือจริง (magnetic north)
    // ถ้าไม่รองรับจึง fallback ไป deviceorientation
    let gotAbsolute = false;
    addEventListener('deviceorientationabsolute', e => {
      gotAbsolute = true;
      handleAbsolute(e);
    });
    setTimeout(() => {
      if (gotAbsolute) return;
      // fallback: deviceorientation ธรรมดาจะอ้างอิงทิศเหนือจริงก็ต่อเมื่อ e.absolute === true
      // ถ้าไม่ absolute ทิศจะเพี้ยน — เตือนผู้ใช้ให้ปรับ offset เอง
      addEventListener('deviceorientation', e => {
        compassUnreliable = !e.absolute;
        handleAbsolute(e);
      });
    }, 500);
  }
}

// ═══ COMPASS ACCURACY ═══
function updateAccuracy() {
  // ความเร็วการหมุน (°/เฟรม) — แยก "ผู้ใช้หมุนเครื่อง" ออกจาก "เซนเซอร์สั่น"
  if (prevRawH !== null) turnRate = turnRate * 0.8 + Math.abs(adiff(prevRawH, rawH)) * 0.2;
  prevRawH = rawH;
  const turning = turnRate > 1.2; // ~>72°/วิ = กำลังหมุนหาสปอตปกติ

  hBuf.push(rawH);
  if (hBuf.length > 20) hBuf.shift();
  if (hBuf.length >= 8 && !turning) {
    // circular mean resultant length — 1=เสถียร 0=สั่น
    const sx = hBuf.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0);
    const cx = hBuf.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0);
    const stability = Math.sqrt(sx * sx + cx * cx) / hBuf.length;
    // รวมกับความแม่นยำฮาร์ดแวร์ iOS (ถ้ามี) — ไม่ให้ตัวใดเขียนทับอีกตัว
    const target = hwAccuracy >= 0 ? Math.min(stability, hwAccuracy) : stability;
    compassAccuracy = compassAccuracy * 0.7 + target * 0.3; // เปลี่ยนแบบนุ่มนวล
  }
  // ขณะหมุน: คงค่าเดิม ไม่เตือน calibration ผิดพลาด
  const ok = compassAccuracy >= 0.75 && !compassUnreliable;
  const btn = document.getElementById('cal-btn');
  if (btn) btn.classList.toggle('warn', !ok && !turning);

  // อัปเดต accuracy bar ใน panel
  const bar = document.getElementById('cal-acc-fill');
  if (bar) {
    const pct = compassUnreliable ? Math.min(compassAccuracy, 0.4) : compassAccuracy;
    bar.style.width = `${Math.round(pct * 100)}%`;
    bar.style.background = pct > 0.85 ? '#4CAF50' : pct > 0.65 ? '#FFC107' : '#F44336';
  }
  const calH = document.getElementById('cal-heading');
  if (calH) calH.textContent = `${Math.round(smoothH)}°`;

  // feedback ระหว่างหมุนเลข 8 — ผูกกับค่าความเสถียรจริง
  const hint = document.getElementById('cal-fig8-hint');
  const phone = document.getElementById('cal-phone');
  if (hint) {
    if (compassUnreliable) {
      hint.innerHTML = '⚠ เซนเซอร์ไม่ให้ทิศเหนือจริง<br>ปรับ offset ด้วยมือ';
      hint.style.color = '#F44336';
    } else if (compassAccuracy > 0.85) {
      hint.innerHTML = '✓ เซนเซอร์เสถียรแล้ว';
      hint.style.color = '#7CCF80';
    } else if (compassAccuracy > 0.65) {
      hint.innerHTML = 'เกือบเสถียรแล้ว…<br>หมุนเลข 8 ต่ออีกนิด';
      hint.style.color = '#E0C060';
    } else {
      hint.innerHTML = 'กำลัง calibrate…<br>หมุนโทรศัพท์เป็นรูปเลข 8';
      hint.style.color = '#E08080';
    }
  }
  if (phone) phone.classList.toggle('stable', compassAccuracy > 0.85 && !compassUnreliable);
}

// ═══ CALIBRATION ═══
function openCal() {
  const panel = document.getElementById('cal-panel');
  panel.style.display = 'flex';
  document.getElementById('cal-offset-val').textContent = fmtOffset(headingOffset);
}
function closeCal() {
  document.getElementById('cal-panel').style.display = 'none';
}
function adjustOffset(delta) {
  headingOffset += delta;
  if (headingOffset > 180) headingOffset -= 360;
  if (headingOffset < -180) headingOffset += 360;
  localStorage.setItem('headingOffset', headingOffset);
  document.getElementById('cal-offset-val').textContent = fmtOffset(headingOffset);
}
function resetOffset() {
  headingOffset = 0;
  localStorage.setItem('headingOffset', 0);
  document.getElementById('cal-offset-val').textContent = '0°';
}
function fmtOffset(v) { return `${v > 0 ? '+' : ''}${v}°`; }

// ═══ COMPASS HUD ═══
function drawCompass() {
  const c = document.getElementById('cmp-cv');
  const x = c.getContext('2d');
  const W = 360, H = 72;
  const SP = 0.6; // px ต่อองศา — สเกลแถบเข็มทิศ
  x.clearRect(0, 0, W, H);

  // ── พื้นหลังดำ (วาดก่อน เพื่อให้ไอคอน/สเกลอยู่บนสุด) ──
  const bgG = x.createLinearGradient(0, 0, W, 0);
  bgG.addColorStop(0, 'rgba(4,2,1,.9)'); bgG.addColorStop(.2, 'rgba(4,2,1,.6)');
  bgG.addColorStop(.8, 'rgba(4,2,1,.6)'); bgG.addColorStop(1, 'rgba(4,2,1,.9)');
  x.fillStyle = bgG; x.fillRect(0, 0, W, H);

  const baseDeg = Math.round(smoothH);
  for (let d = -180; d <= 180; d++) {
    const deg = (baseDeg + d + 360) % 360;
    const px = W / 2 + (d - (smoothH - baseDeg)) * SP;
    if (px < 0 || px > W) continue;
    const maj = deg % 45 === 0, mid = deg % 15 === 0, minr = deg % 5 === 0;
    if (maj || mid || minr) {
      const th = maj ? 16 : mid ? 12 : 8;
      const al = maj ? .7 : mid ? .4 : .4;
      x.strokeStyle = `rgba(201,168,76,${al})`; x.lineWidth = maj ? 1.8 : mid ? 1.2 : 1;
      // ขีดล่าง
      x.beginPath(); x.moveTo(px, H - th); x.lineTo(px, H); x.stroke();
      // ขีดบน (สะท้อน)
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, th); x.stroke();
    }
  }
  if (userLat) {
    // คำนวณตำแหน่ง spot ที่มองเห็น แล้วเรียงซ้าย→ขวา
    const vis = [];
    SPOTS.forEach(s => {
      if (insideSpotId && s.id !== insideSpotId) return;   // อยู่ในสถานที่ → ไม่แสดงที่อื่น
      const dist = hav(userLat, userLng, s.lat, s.lng);
      if (dist > VIEW_M) return;                            // เกินระยะมองเห็น 1km → ไม่แสดง
      const b = bear(userLat, userLng, s.lat, s.lng);
      const px = W / 2 + adiff(smoothH, b) * SP;
      if (px < 8 || px > W - 8) return;
      vis.push({ s, px, dist, isHot: aimedSpot === s.id });
    });
    vis.sort((a, b) => a.px - b.px);
    // ระยะที่ใกล้ที่สุด — ตัวที่ใกล้สุดจะทึบเต็ม ที่เหลือจางลงตามระยะ
    const minDist = vis.length ? Math.min(...vis.map(v => v.dist)) : 0;

    let lastIconPx = -Infinity;   // กันไอคอนซ้อนกัน (ทิศใกล้กัน)
    vis.forEach(v => {
      const { px, isHot } = v;
      // ตัวที่ใกล้สุด (หรือกำลังเล็ง) = ทึบเต็ม, ที่เหลือจางเท่ากันหมดที่ .6
      const distAlpha = (isHot || v.dist <= minDist + 1) ? 1 : 0.6;
      // วงกลมตำแหน่งสถานที่ (ด้านบน) — วาดทุกตัว
      x.globalAlpha = distAlpha;
      x.beginPath(); x.arc(px, 8, isHot ? 5 : 3.5, 0, Math.PI * 2);
      x.fillStyle = isHot ? '#F0D080' : 'rgba(201,168,76,.7)'; x.fill();
      // ไอคอนสถานที่ — ข้ามถ้าซ้อนกับตัวก่อนหน้า (เว้นแต่ตัวที่กำลังเล็ง)
      const tooClose = (px - lastIconPx) < 22;
      if (tooClose && !isHot) { x.globalAlpha = 1; return; }
      lastIconPx = px;
      x.globalAlpha = distAlpha;
      const img = spotIcons[v.s.id];
      if (img && img.complete && img.naturalWidth) {
        const sz = isHot ? 30 : 26;
        x.drawImage(img, px - sz / 2, 36 - sz / 2, sz, sz);
      } else {
        // fallback ระหว่างรูปยังโหลดไม่เสร็จ — จุดกลม
        x.beginPath(); x.arc(px, 36, isHot ? 6 : 5, 0, Math.PI * 2);
        x.fillStyle = isHot ? '#F0D080' : 'rgba(201,168,76,.7)'; x.fill();
      }
      x.globalAlpha = 1;
    });
  }
  // ── fade เฉพาะขอบ (กลางโปร่งใส ไม่ทับไอคอน) ──
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(4,2,1,.9)'); g.addColorStop(.18, 'rgba(4,2,1,0)');
  g.addColorStop(.82, 'rgba(4,2,1,0)'); g.addColorStop(1, 'rgba(4,2,1,.9)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

// ═══ CALIBRATION INTRO COMPASS ═══
function drawCalIntroCompass() {
  const c = document.getElementById('cal-intro-compass');
  if (!c) return;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  
  x.clearRect(0, 0, W, H);
  
  // Background
  const bg = x.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.hypot(W,H)/2);
  bg.addColorStop(0, 'rgba(20,15,10,.2)');
  bg.addColorStop(1, 'rgba(5,3,1,.3)');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  
  const cX = W / 2, cY = H / 2;
  const radius = Math.min(W, H) / 2.2;
  
  // Cardinal directions
  const dirs = [
    { angle: 0, label: 'N', color: 'rgba(255,80,80,.9)' },
    { angle: 90, label: 'E', color: 'rgba(201,168,76,.65)' },
    { angle: 180, label: 'S', color: 'rgba(201,168,76,.65)' },
    { angle: 270, label: 'W', color: 'rgba(201,168,76,.65)' }
  ];
  
  dirs.forEach(d => {
    const angle = (smoothH - d.angle) * Math.PI / 180;
    const x1 = cX + Math.sin(angle) * radius;
    const y1 = cY - Math.cos(angle) * radius;
    const x2 = cX + Math.sin(angle) * (radius - 20);
    const y2 = cY - Math.cos(angle) * (radius - 20);
    
    x.beginPath();
    x.moveTo(x1, y1);
    x.lineTo(x2, y2);
    x.strokeStyle = d.color;
    x.lineWidth = 2.5;
    x.stroke();
    
    const lx = cX + Math.sin(angle) * (radius - 45);
    const ly = cY - Math.cos(angle) * (radius - 45);
    x.fillStyle = d.color;
    x.font = 'bold 16px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(d.label, lx, ly);
  });
  
  // Tick marks
  for (let i = 0; i < 360; i += 15) {
    const angle = (smoothH - i) * Math.PI / 180;
    const major = i % 45 === 0;
    const len = major ? 12 : 6;
    const x1 = cX + Math.sin(angle) * radius;
    const y1 = cY - Math.cos(angle) * radius;
    const x2 = cX + Math.sin(angle) * (radius - len);
    const y2 = cY - Math.cos(angle) * (radius - len);
    
    x.beginPath();
    x.moveTo(x1, y1);
    x.lineTo(x2, y2);
    x.strokeStyle = major ? 'rgba(201,168,76,.6)' : 'rgba(201,168,76,.25)';
    x.lineWidth = major ? 1.5 : 0.8;
    x.stroke();
  }
  
  // Center circle with current heading
  x.beginPath();
  x.arc(cX, cY, 18, 0, Math.PI * 2);
  x.fillStyle = 'rgba(201,168,76,.15)';
  x.fill();
  x.strokeStyle = '#F0D080';
  x.lineWidth = 2;
  x.stroke();
  
  x.fillStyle = '#F0D080';
  x.font = 'bold 14px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(Math.round(smoothH) + '°', cX, cY);
  
  // Update accuracy bar
  const accFill = document.getElementById('cal-intro-acc-fill');
  if (accFill) {
    const pct = compassUnreliable ? Math.min(compassAccuracy, 0.4) : compassAccuracy;
    accFill.style.width = Math.round(pct * 100) + '%';
    accFill.style.background = pct > 0.85 ? '#4CAF50' : pct > 0.65 ? '#FFC107' : '#F44336';
  }
  
  // Update phone animation state
  const phone = document.getElementById('cal-intro-phone');
  if (phone) phone.classList.toggle('stable', compassAccuracy > 0.85 && !compassUnreliable);
}

// ═══ AIM CHECK ═══
function checkAim() {
  if (!userLat) return;

  // สถานที่ที่ผู้ใช้ "อยู่ใน" — สปอตที่ใกล้สุดและอยู่ในรัศมี RADIUS_M (300m)
  // ถ้ามี: จะแสดงเฉพาะที่นั่น ไม่แสดง effect/การมองเห็นของที่อื่นเลย
  let insideSpot = null, insideDist = RADIUS_M;
  SPOTS.forEach(s => {
    const dist = hav(userLat, userLng, s.lat, s.lng);
    if (dist < insideDist) { insideDist = dist; insideSpot = s; }
  });
  insideSpotId = insideSpot ? insideSpot.id : null;

  // สปอตที่กำลังเล็ง (อยู่ในมุม AIM_DEG + ในระยะมองเห็น VIEW_M เท่านั้น)
  // ถ้าอยู่ในสถานที่แล้ว — เล็งได้เฉพาะสถานที่นั้น
  let found = null, minD = AIM_DEG;
  SPOTS.forEach(s => {
    if (insideSpot && s.id !== insideSpot.id) return;   // อยู่ในสถานที่: ที่อื่นไม่แสดง
    const dist = hav(userLat, userLng, s.lat, s.lng);
    if (dist > VIEW_M) return;                          // เกินระยะมองเห็น 1km
    const b = bear(userLat, userLng, s.lat, s.lng);
    const d = Math.abs(adiff(smoothH, b));
    if (d < minD) { minD = d; found = s; }
  });

  // ปลดล็อค: ต้องเล็งเจอ + อยู่ในระยะ
  if (found) {
    const dist = hav(userLat, userLng, found.lat, found.lng);
    if (dist < UNLOCK_M && !unlocked[found.id]) {
      unlocked[found.id] = true;
      saveUnlocked();
      showToast(found.icon, found.name, 'พลังปลดล็อคแล้ว!');
    }
  }

  // สปอตที่จะแสดง VFX:
  //  1) อยู่ในสถานที่ → แสดงของสถานที่นั้นเสมอ (ทับที่อื่นทั้งหมด)
  //  2) กำลังเล็งสปอต (ในระยะมองเห็น)  หรือ
  //  3) ไม่ได้เล็ง — สปอตที่ปลดล็อคแล้วและอยู่ในระยะ (ใกล้สุด)
  let active = found;
  if (insideSpot) {
    active = insideSpot;
  } else if (!active) {
    let bestD = UNLOCK_M;
    SPOTS.forEach(s => {
      if (!unlocked[s.id]) return;
      const dist = hav(userLat, userLng, s.lat, s.lng);
      if (dist < bestD) { bestD = dist; active = s; }
    });
  }

  // ── ปลดล็อคครบทั้ง 7 พระบรมธาตุ: หน่วง 30 วิ → ป้ายฉลอง 7 วิ → สถานะ unlock จึงแสดง ──
  if (allSpotsUnlocked() && !allUnlockedAt) {
    allUnlockedAt = Date.now();
    try { localStorage.setItem('allUnlockedAt', allUnlockedAt); } catch (e) {}
  }
  let revealDone = false;
  if (allUnlockedAt) {
    const el = Date.now() - allUnlockedAt;
    if (el >= REVEAL_DELAY_MS && !revealPopupShown) {       // ครบ 30 วิ → ขึ้นป้ายฉลอง
      revealPopupShown = true;
      try { localStorage.setItem('revealPopupShown', '1'); } catch (e) {}
      showRevealPopup();
    }
    revealDone = el >= REVEAL_DELAY_MS + REVEAL_POPUP_MS;    // หลังป้าย 7 วิ → effect แสดงตลอด
  }

  // 4) เมื่อ revealDone → effect แสดงตลอด ไม่ว่าอยู่ที่ไหน
  //    หมุนเวียนโชว์ VFX ของทั้ง 7 สถานที่ทีละอัน (เฉพาะตอนไม่ได้อยู่ใน/เล็ง/ใกล้สปอตใด)
  let roaming = false;
  if (!active && revealDone) {
    const cvfx = VFX_CYCLE[Math.floor(T / ROAM_CYCLE_SECS) % VFX_CYCLE.length];
    active = SPOTS.find(s => s.vfx === cvfx) || null;
    roaming = !!active;
  }

  const aimEl = document.getElementById('aim');
  const pop = document.getElementById('popup');
  // เป้าเล็ง + ป้ายกลางจอ แสดงเฉพาะตอนเล็งสปอตที่ "ยังไม่ปลดล็อค"
  const showAim = !!found && !unlocked[found.id];
  aimEl.style.display = showAim ? '' : 'none';
  aimEl.classList.toggle('hot', showAim);
  pop.classList.toggle('show', showAim);

  if (roaming) {
    // โหมดครบ 7 — fade ตัวเดิมออกก่อนแล้วค่อยสลับ VFX ถัดไป ให้เปลี่ยนลื่นไม่กระตุก
    const changing = activeVFX && activeVFX !== active.vfx;
    const dispVfx = changing ? activeVFX : active.vfx;             // ระหว่าง fade ยังโชว์ตัวเดิม
    const dispSpot = SPOTS.find(s => s.vfx === dispVfx) || active;
    aimedSpot = dispSpot.id;
    const popImg = document.querySelector('#pop-icon img');
    if (popImg && popImg.getAttribute('src') !== dispSpot.icon) popImg.src = dispSpot.icon;
    document.getElementById('pop-name').textContent = dispSpot.name;
    document.getElementById('pop-dist').textContent = '✦ ครบทั้ง ๗';
    document.getElementById('b-name').textContent = dispSpot.name;
    document.getElementById('b-desc').textContent = dispSpot.desc;
    document.getElementById('vfx-tag').textContent = VFX_LABELS[dispVfx] || '';

    if (changing) {
      vfxFade = Math.max(0, vfxFade - .04);
      if (vfxFade <= 0.02) { activeVFX = active.vfx; spawnParticles(); }
    } else {
      activeVFX = active.vfx;
      vfxFade = Math.min(1, vfxFade + .04);
    }
  } else if (active) {
    aimedSpot = active.id;
    const dist = hav(userLat, userLng, active.lat, active.lng);
    const popImg = document.querySelector('#pop-icon img');
    if (popImg && popImg.getAttribute('src') !== active.icon) popImg.src = active.icon;
    document.getElementById('pop-name').textContent = active.name;
    document.getElementById('pop-dist').textContent = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;
    document.getElementById('b-name').textContent = active.name;
    document.getElementById('b-desc').textContent = active.desc;
    document.getElementById('vfx-tag').textContent = VFX_LABELS[active.vfx] || '';

    if (activeVFX !== active.vfx) { activeVFX = active.vfx; spawnParticles(); }
    vfxFade = Math.min(1, vfxFade + .04);
  } else {
    aimedSpot = null;
    vfxFade = Math.max(0, vfxFade - .025);
    if (vfxFade === 0) { activeVFX = null; document.getElementById('vfx-tag').textContent = '◌ SEARCHING...'; }
  }
  document.querySelectorAll('.chip').forEach(c => {
    const id = c.dataset.id;
    const isActive = id === aimedSpot;
    // แสดง chip ถ้า "ปลดล็อคแล้ว" (ค้างไว้เป็นรายการ) หรือกำลัง active
    c.classList.toggle('hot', isActive);
    c.classList.toggle('done', !!unlocked[id]);
    c.style.display = (unlocked[id] || isActive) ? '' : 'none';
  });
}

// ═══ VFX RENDERERS ═══
function drawVFX(t) {
  const W = cv.width, H = cv.height, fade = vfxFade;
  ctx.clearRect(0, 0, W, H);
  if (fade <= 0 || !activeVFX) return;

  if (activeVFX === 'golden') vfxGolden(t, W, H, fade);
  else if (activeVFX === 'sacred') vfxSacred(t, W, H, fade);
  else if (activeVFX === 'battle') vfxBattle(t, W, H, fade);
  else if (activeVFX === 'lotus')  vfxLotus(t, W, H, fade);
  else if (activeVFX === 'shrine') vfxShrine(t, W, H, fade);
  else if (activeVFX === 'royal')  vfxRoyal(t, W, H, fade);
  else if (activeVFX === 'lantern') vfxLantern(t, W, H, fade);
  else if (activeVFX === 'khmer')  vfxKhmer(t, W, H, fade);
  else if (activeVFX === 'forest') vfxForest(t, W, H, fade);

  // เลเยอร์แสงศักดิ์สิทธิ์ร่วม — ทำให้ทุกเอฟเฟกต์ดูอลังการขึ้น
  grandAura(t, W, H, fade, VFX_TINT[activeVFX] || [255, 210, 90]);

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .18, W / 2, H / 2, H * .85);
  vg.addColorStop(0, 'rgba(5,3,1,0)'); vg.addColorStop(1, `rgba(5,3,1,${.55 * fade})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (fade > .5) drawFrame(t, W, H, fade);
}

// ═══ เลเยอร์แสงศักดิ์สิทธิ์ร่วม (cinematic) ═══
// god-rays หมุน + บลูมเต้นจังหวะ + ดาวประกาย ใช้ additive ให้ฟุ้งสว่างอลังการ
function grandAura(t, W, H, fade, col) {
  const [r, g, b] = col;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 1) ลำแสงหมุนออกจากบนกลางจอ (volumetric god-rays)
  const cx = W / 2, cy = -H * 0.05, rays = 16, len = H * 1.4;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + t * 0.12;
    const flick = 0.4 + 0.6 * Math.sin(t * 1.3 + i * 1.7);
    const wdt = 0.05 + 0.03 * Math.sin(t * 0.7 + i);
    const al = 0.05 * Math.max(0, flick) * fade;
    if (al <= 0.002) continue;
    const gr = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    gr.addColorStop(0, `rgba(${r},${g},${b},${al})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - wdt) * len, cy + Math.sin(a - wdt) * len);
    ctx.lineTo(cx + Math.cos(a + wdt) * len, cy + Math.sin(a + wdt) * len);
    ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
  }

  // 2) แสงบลูมกลางจอเต้นเป็นจังหวะ
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.6);
  const br = H * (0.36 + 0.05 * Math.sin(t * 1.6));
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, br);
  bg.addColorStop(0, `rgba(${r},${g},${b},${0.11 * pulse * fade})`);
  bg.addColorStop(0.5, `rgba(${r},${g},${b},${0.04 * pulse * fade})`);
  bg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(W / 2, H * 0.4, br, 0, Math.PI * 2); ctx.fill();

  // 3) ดาวประกายกระพริบทั่วจอ (มีประกายเส้นบวก)
  if (!auraStars.length)
    auraStars = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random() * 0.75,
      ph: Math.random() * 6.28, sz: 0.6 + Math.random() * 1.8,
    }));
  auraStars.forEach(s => {
    const tw = Math.sin(t * 2 + s.ph);
    if (tw <= 0) return;
    const al = tw * 0.85 * fade;
    const px = s.x * W, py = s.y * H, sz = s.sz * (1 + tw);
    const gr = ctx.createRadialGradient(px, py, 0, px, py, sz * 4);
    gr.addColorStop(0, `rgba(${r},${g},${b},${al})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, sz * 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${al * 0.7})`; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px - sz * 3.2, py); ctx.lineTo(px + sz * 3.2, py);
    ctx.moveTo(px, py - sz * 3.2); ctx.lineTo(px, py + sz * 3.2);
    ctx.stroke();
  });

  ctx.restore();
}

function vfxGolden(t, W, H, fade) {
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i - 3.5) * .14, len = H * 1.4;
    const a = (0.02 + .015 * Math.sin(t * .55 + i * 1.1)) * fade;
    const g = ctx.createLinearGradient(W / 2, 0, W / 2 + Math.cos(angle) * len, Math.sin(angle) * len);
    g.addColorStop(0, `rgba(255,220,80,${a * 4})`);
    g.addColorStop(.5, `rgba(220,160,50,${a})`);
    g.addColorStop(1, 'rgba(180,120,30,0)');
    ctx.beginPath();
    const sp = 18 + i * 8;
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2 + Math.cos(angle) * len - sp, Math.sin(angle) * len);
    ctx.lineTo(W / 2 + Math.cos(angle) * len + sp, Math.sin(angle) * len);
    ctx.fillStyle = g; ctx.fill();
  }
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t + p.phase) * .3; p.y += p.vy; p.life += .0045;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .95 * fade;
    const pu = 1 + .35 * Math.sin(t * 2.2 + p.phase);
    if (p.type === 0) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * .9 + p.phase);
      const s = p.size * pu;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .55, 0); ctx.lineTo(0, s); ctx.lineTo(-s * .55, 0); ctx.closePath();
      ctx.fillStyle = `rgba(255,215,80,${al})`; ctx.fill(); ctx.restore();
    } else if (p.type === 1) {
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * pu * 5);
      gr.addColorStop(0, `rgba(255,230,100,${al})`); gr.addColorStop(1, 'rgba(180,120,30,0)');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * pu * 5, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = al * .8;
      ctx.fillStyle = '#FFE066'; ctx.font = `${p.size * 3.5}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 0, 0); ctx.restore();
    }
  });
  const hg = ctx.createLinearGradient(0, H * .6, 0, H);
  hg.addColorStop(0, 'rgba(160,90,10,0)'); hg.addColorStop(1, `rgba(160,70,5,${(.08 + .03 * Math.sin(t * .7)) * fade})`);
  ctx.fillStyle = hg; ctx.fillRect(0, H * .6, W, H * .4);
}

function vfxSacred(t, W, H, fade) {
  const hx = W / 2, hy = H * .27, hr = 80 + 25 * Math.sin(t * .85);
  for (let r = 5; r > 0; r--) {
    const gr = ctx.createRadialGradient(hx, hy, hr * r * .2, hx, hy, hr * r);
    gr.addColorStop(0, 'rgba(255,255,240,0)');
    gr.addColorStop(.7, `rgba(255,255,215,${.07 / r * fade})`);
    gr.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.beginPath(); ctx.arc(hx, hy, hr * r, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  }
  ps.forEach((p, i) => {
    p.x += p.vx * .5 + Math.sin(t * .7 + p.phase) * .2; p.y += p.vy * .55; p.life += .003;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .8 * fade;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
    gr.addColorStop(0, `rgba(255,255,248,${al})`); gr.addColorStop(1, 'rgba(230,225,200,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  for (let j = 0; j < 4; j++) {
    const my = H * .45 + j * 85;
    const mg = ctx.createLinearGradient(0, my, 0, my + 130);
    mg.addColorStop(0, 'rgba(210,200,180,0)');
    mg.addColorStop(.5, `rgba(210,200,180,${(.045 + .012 * Math.sin(t + j * .9)) * fade})`);
    mg.addColorStop(1, 'rgba(210,200,180,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, my, W, 130);
  }
}

function vfxBattle(t, W, H, fade) {
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t * 2.8 + p.phase) * .55; p.y += p.vy * 1.7; p.life += .008;
    if (p.y < -40 || p.life > p.maxLife) {
      ps[i] = { ...mkP(W, H), x: W * .1 + Math.random() * W * .8, y: H * .55 + Math.random() * H * .45, vy: -(1.2 + Math.random() * 2.8) };
      return;
    }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .92 * fade;
    const tc = p.life / p.maxLife;
    const r = 255, g = Math.floor(200 * (1 - tc * .85)), b = Math.floor(40 * (1 - tc));
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4.5);
    gr.addColorStop(0, `rgba(${r},${g},${b},${al})`);
    gr.addColorStop(.6, `rgba(${r},${Math.floor(g * .4)},0,${al * .3})`);
    gr.addColorStop(1, 'rgba(140,25,0,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4.5, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  const fl = (.1 + .06 * Math.sin(t * 12 + Math.random() * .4)) * fade;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .15, W / 2, H / 2, H * 1.2);
  vg.addColorStop(0, 'rgba(100,10,5,0)'); vg.addColorStop(1, `rgba(100,10,5,${fl})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * .35 + s.phase) * .3; s.y += s.vy; s.life += .002;
    if (s.y < -150 || s.life > 1) { ss[i] = mkS(W, H); return; }
    const a = s.opacity * Math.sin(s.life * Math.PI) * fade;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    gr.addColorStop(0, `rgba(75,50,35,${a})`); gr.addColorStop(1, 'rgba(75,50,35,0)');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
}

// สะเก็ดไฟ — พุ่งกระจายจากฐาน มีหางลากสั้นๆ
function mkSpark(W, H) {
  const ang = -Math.PI / 2 + (Math.random() - .5) * 2.2;   // พุ่งขึ้นแบบกระจายกว้าง
  const sp = 3 + Math.random() * 6;
  return {
    x: Math.random() * W,                                  // กระจายทั่วความกว้างจอ
    y: H * .55 + Math.random() * H * .45,                  // ปล่อยจากครึ่งล่างทั้งแถบ
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    life: 0, maxLife: .5 + Math.random() * .7,
    len: 6 + Math.random() * 12,
  };
}

// ═══ ศาลพระกาฬ — ควันธูปแดง + ประกายไฟ + สะเก็ดไฟ ═══
function vfxShrine(t, W, H, fade) {
  // ควันธูปสีแดงเข้มลอยขึ้นจากกลางล่าง
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * .4 + s.phase) * .4; s.y += s.vy * .8; s.life += .0025;
    if (s.y < -160 || s.life > 1) {
      ss[i] = { ...mkS(W, H), x: W * .5 + (Math.random() - .5) * W * .35, y: H * .82 + Math.random() * H * .15, vy: -(0.3 + Math.random() * .6) };
      return;
    }
    const a = s.opacity * Math.sin(s.life * Math.PI) * fade * 1.3;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    gr.addColorStop(0, `rgba(120,32,22,${a})`); gr.addColorStop(1, 'rgba(70,14,10,0)');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  // ประกายไฟ (embers) ลอยขึ้น กระพริบ
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t * 1.5 + p.phase) * .5; p.y += p.vy * 1.2; p.life += .006;
    if (p.y < -30 || p.life > p.maxLife) {
      ps[i] = { ...mkP(W, H), y: H * .6 + Math.random() * H * .45, vy: -(0.6 + Math.random() * 1.7) };
      return;
    }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .9 * fade;
    const fl = 0.6 + 0.4 * Math.sin(t * 8 + p.phase);
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
    gr.addColorStop(0, `rgba(255,${140 + Math.floor(70 * fl)},60,${al})`);
    gr.addColorStop(.6, `rgba(220,60,20,${al * .4})`);
    gr.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  // สะเก็ดไฟพุ่งกระจาย — หัวสว่าง หางลากสั้น ตกด้วยแรงโน้มถ่วง
  if (!sparks.length) sparks = Array.from({ length: 110 }, () => mkSpark(W, H));
  sparks.forEach((k, i) => {
    k.vy += 0.12;                     // แรงโน้มถ่วงดึงลง
    k.vx *= 0.99;
    k.x += k.vx; k.y += k.vy; k.life += 0.02;
    if (k.life > k.maxLife || k.y > H + 20) { sparks[i] = mkSpark(W, H); return; }
    const al = (1 - k.life / k.maxLife) * fade;
    const sp = Math.hypot(k.vx, k.vy) || 1;
    const tx = k.x - (k.vx / sp) * k.len, ty = k.y - (k.vy / sp) * k.len;
    const g = ctx.createLinearGradient(k.x, k.y, tx, ty);
    g.addColorStop(0, `rgba(255,240,190,${al})`);
    g.addColorStop(.5, `rgba(255,160,50,${al * .6})`);
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath(); ctx.arc(k.x, k.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,248,220,${al})`; ctx.fill();
  });

  // แสงเรืองแดงเข้มขอบล่าง
  const hg = ctx.createLinearGradient(0, H * .5, 0, H);
  hg.addColorStop(0, 'rgba(80,10,5,0)'); hg.addColorStop(1, `rgba(130,22,12,${(.12 + .04 * Math.sin(t * .9)) * fade})`);
  ctx.fillStyle = hg; ctx.fillRect(0, H * .5, W, H * .5);
}

// ═══ พระราชวังนารายณ์ — รัศมีม่วงหลวง + ประกายทองรูปดาว ═══
function vfxRoyal(t, W, H, fade) {
  const bg = ctx.createRadialGradient(W / 2, H * .35, H * .05, W / 2, H * .35, H * .95);
  bg.addColorStop(0, `rgba(120,70,190,${.10 * fade})`);
  bg.addColorStop(.5, `rgba(70,40,130,${.06 * fade})`);
  bg.addColorStop(1, 'rgba(30,15,60,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // เสาแสงทองส่องลงจากด้านบน
  for (let i = 0; i < 5; i++) {
    const cx = W * (0.2 + i * 0.15), a = (0.03 + 0.02 * Math.sin(t * .7 + i)) * fade;
    const g = ctx.createLinearGradient(cx, 0, cx, H * .9);
    g.addColorStop(0, `rgba(255,225,140,${a * 3})`);
    g.addColorStop(1, 'rgba(200,150,60,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 25, 0, 50, H * .9);
  }
  // ประกายทองรูปดาวสี่แฉก (royal sparkle)
  ps.forEach((p, i) => {
    p.x += p.vx * .6 + Math.sin(t * .8 + p.phase) * .3; p.y += p.vy * .5; p.life += .004;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .95 * fade;
    const tw = 0.5 + 0.5 * Math.sin(t * 3 + p.phase);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * .4 + p.phase);
    ctx.globalAlpha = al * tw; ctx.fillStyle = '#FFE59A';
    const s = p.size * 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -s * 3); ctx.lineTo(s * .5, -s * .5); ctx.lineTo(s * 3, 0); ctx.lineTo(s * .5, s * .5);
    ctx.lineTo(0, s * 3); ctx.lineTo(-s * .5, s * .5); ctx.lineTo(-s * 3, 0); ctx.lineTo(-s * .5, -s * .5);
    ctx.closePath(); ctx.fill(); ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// ═══ บ้านวิชาเยนทร์ — โคมไฟ/หิ่งห้อยอำพันยุโรป ═══
function vfxLantern(t, W, H, fade) {
  const bg = ctx.createRadialGradient(W / 2, H * .5, H * .1, W / 2, H * .5, H);
  bg.addColorStop(0, `rgba(90,60,25,${.05 * fade})`);
  bg.addColorStop(1, 'rgba(40,25,10,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // ดวงไฟอำพันลอยขึ้นช้าๆ แกว่งไปมา กระพริบเหมือนเปลวเทียน
  ps.forEach((p, i) => {
    p.x += p.vx * .5 + Math.sin(t * .6 + p.phase) * .6; p.y += p.vy * .4; p.life += .0025;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = { ...mkP(W, H), y: H * .5 + Math.random() * H * .5 }; return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * fade;
    const glow = 0.55 + 0.45 * Math.sin(t * 2.5 + p.phase);
    const r = p.size * 4;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255,220,140,${al * glow})`);
    gr.addColorStop(.4, `rgba(255,170,70,${al * glow * .5})`);
    gr.addColorStop(1, 'rgba(180,100,30,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * .8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,245,210,${al * glow})`; ctx.fill();
  });
}

// ═══ พระปรางค์สามยอด — เสาแสงขอมสามยอด + ฝุ่นหินโบราณ ═══
function vfxKhmer(t, W, H, fade) {
  const cols = [W * 0.3, W * 0.5, W * 0.7];
  cols.forEach((cx, i) => {
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.1 + i * 2.1);
    const w = (i === 1 ? 46 : 36);              // ยอดกลางใหญ่สุด
    const g = ctx.createLinearGradient(cx, H, cx, 0);
    g.addColorStop(0, `rgba(210,120,50,${.28 * pulse * fade})`);
    g.addColorStop(.5, `rgba(230,160,80,${.12 * pulse * fade})`);
    g.addColorStop(1, 'rgba(180,90,40,0)');
    ctx.beginPath();
    ctx.moveTo(cx - w, H); ctx.lineTo(cx - w * .15, H * .08);
    ctx.lineTo(cx + w * .15, H * .08); ctx.lineTo(cx + w, H);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    const tip = ctx.createRadialGradient(cx, H * .1, 0, cx, H * .1, 40);
    tip.addColorStop(0, `rgba(255,210,130,${.5 * pulse * fade})`);
    tip.addColorStop(1, 'rgba(230,150,70,0)');
    ctx.beginPath(); ctx.arc(cx, H * .1, 40, 0, Math.PI * 2); ctx.fillStyle = tip; ctx.fill();
  });
  // ฝุ่นหินโบราณลอย
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t * .5 + p.phase) * .3; p.y += p.vy * .7; p.life += .004;
    if (p.y < -30 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .7 * fade;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
    gr.addColorStop(0, `rgba(220,170,110,${al})`); gr.addColorStop(1, 'rgba(150,100,60,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
}

// ═══ วัดป่าธรรมโสภณ — หิ่งห้อยเขียว + ใบไม้ปลิว ═══
function vfxForest(t, W, H, fade) {
  const bg = ctx.createRadialGradient(W / 2, H * .5, H * .05, W / 2, H * .5, H * .9);
  bg.addColorStop(0, `rgba(60,140,70,${.06 * fade})`);
  bg.addColorStop(.6, `rgba(30,90,50,${.04 * fade})`);
  bg.addColorStop(1, 'rgba(15,50,30,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // หิ่งห้อยเขียวอมเหลือง กระพริบเป็นจังหวะ
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t * 1.1 + p.phase) * .7; p.y += p.vy * .4 + Math.cos(t * .8 + p.phase) * .3; p.life += .004;
    if (p.y < -30 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * fade;
    const blink = Math.max(0, Math.sin(t * 3 + p.phase));
    const r = p.size * 3;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(190,255,140,${al * blink})`);
    gr.addColorStop(.5, `rgba(120,220,90,${al * blink * .4})`);
    gr.addColorStop(1, 'rgba(60,150,50,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  // ใบไม้ปลิวลงจากด้านบน (ใช้ ss)
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * .6 + s.phase) * .8; s.y += Math.abs(s.vy) * .6 + .3; s.life += .003;
    if (s.y > H + 40 || s.life > 1) { ss[i] = { ...mkS(W, H), y: -20 - Math.random() * 60 }; return; }
    const a = Math.min(.5, s.opacity * 4) * Math.sin(s.life * Math.PI) * fade;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(t * .6 + s.phase);
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.ellipse(0, 0, s.size * .12, s.size * .06, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4E9A4E'; ctx.fill(); ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// วาดกลีบบัวหนึ่งกลีบ (รูปทรงรี-แหลม เหมือนกลีบบัว/ซากุระ)
function drawPetal(ctx, x, y, rx, ry, angle, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  // กลีบบัว: โค้งด้านล่างกว้าง ปลายแหลมด้านบน
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo( rx * 1.1,  -ry * 0.5,  rx,  ry * 0.6,  0,  ry);
  ctx.bezierCurveTo(-rx,         ry * 0.6, -rx * 1.1, -ry * 0.5,  0, -ry);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // เส้นกลางกลีบ (ลายเส้นบาง)
  ctx.beginPath();
  ctx.moveTo(0, -ry * 0.9);
  ctx.lineTo(0,  ry * 0.8);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function mkLotus(W, H) {
  const colors = [
    'rgba(255,182,215,1)', // ชมพูอ่อน
    'rgba(240,160,200,1)', // ชมพูกลาง
    'rgba(255,210,230,1)', // ชมพูซีด
    'rgba(220,130,180,1)', // ม่วงชมพู
    'rgba(255,240,248,1)', // ขาวชมพู
  ];
  return {
    x: Math.random() * W,
    y: -20 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.8,
    vy: 0.6 + Math.random() * 1.0,
    rx: 5 + Math.random() * 7,
    ry: 9 + Math.random() * 10,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.04,
    swing: (Math.random() - 0.5) * 0.012,
    phase: Math.random() * Math.PI * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 0.5 + Math.random() * 0.5,
    life: 0,
  };
}

function vfxLotus(t, W, H, fade) {
  // พื้นหลังรัศมีสีชมพูอ่อน
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, H * 0.05, W / 2, H * 0.4, H * 0.9);
  bg.addColorStop(0, `rgba(255,200,230,${0.08 * fade})`);
  bg.addColorStop(0.5, `rgba(220,140,190,${0.05 * fade})`);
  bg.addColorStop(1, 'rgba(180,80,140,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // reinit เป็นกลีบบัวถ้า ps[] ยังเป็น particle แบบเดิม
  if (!ps.length || ps[0].rx === undefined) {
    ps = Array.from({ length: 80 }, () => { const p = mkLotus(W, H); p.y = Math.random() * H; return p; });
  }

  ps.forEach((p, i) => {
    p.angle += p.spin;
    p.vx    += p.swing * Math.sin(t * 0.9 + p.phase);
    p.x     += p.vx + Math.sin(t * 0.6 + p.phase) * 0.4;
    p.y     += p.vy;
    p.life  += 0.004;

    if (p.y > H + 30) { ps[i] = mkLotus(W, H); return; }

    const al = Math.min(1, p.life * 8) * p.alpha * fade;
    drawPetal(ctx, p.x, p.y, p.rx, p.ry, p.angle, p.color, al);
  });

  // ประกายแสงลอยขึ้น (shimmer)
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * 0.5 + s.phase) * 0.3; s.y += s.vy; s.life += 0.003;
    if (s.y < -80 || s.life > 1) { ss[i] = mkS(W, H); return; }
    const a = s.opacity * Math.sin(s.life * Math.PI) * fade * 0.6;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    gr.addColorStop(0, `rgba(255,200,230,${a})`); gr.addColorStop(1, 'rgba(220,140,190,0)');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
}

function drawFrame(t, W, H, fade) {
  const pu = .55 + .45 * Math.sin(t * 1.3), sz = 68, pad = 18;
  ctx.save();
  ctx.strokeStyle = `rgba(201,168,76,${.8 * pu * fade})`; ctx.lineWidth = 2.2; ctx.lineCap = 'square';
  [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x, y + dy * sz); ctx.lineTo(x, y); ctx.lineTo(x + dx * sz, y); ctx.stroke();
  });
  ctx.strokeStyle = `rgba(240,208,100,${.28 * pu * fade})`; ctx.lineWidth = .8;
  [[pad + 12, pad + 12, 1, 1], [W - pad - 12, pad + 12, -1, 1], [pad + 12, H - pad - 12, 1, -1], [W - pad - 12, H - pad - 12, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 36); ctx.lineTo(x, y); ctx.lineTo(x + dx * 36, y); ctx.stroke();
  });
  ctx.fillStyle = `rgba(240,208,100,${pu * fade})`;
  [[pad, pad], [W - pad, pad], [pad, H - pad], [W - pad, H - pad]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// ═══ CHIPS ═══
function buildChips() {
  const el = document.getElementById('b-chips');
  SPOTS.forEach(s => {
    el.innerHTML += `<div class="chip" data-id="${s.id}" style="display:none"><div class="cd"></div><img class="chip-icon" src="${s.icon}" alt=""> ${s.name}<span id="cd-${s.id}" style="margin-left:4px;font-size:9px;opacity:.5">---</span></div>`;
  });
}
function updateChips() {
  if (!userLat) return;
  SPOTS.forEach(s => {
    const d = hav(userLat, userLng, s.lat, s.lng);
    const el = document.getElementById(`cd-${s.id}`);
    if (el) el.textContent = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
  });
}

// ═══ TOAST ═══
function showToast(icon, title, sub) {
  const ic = document.getElementById('t-icon');
  if (icon && /\.(png|svg|jpg|webp)$|assets\//.test(icon)) ic.innerHTML = `<img src="${icon}" alt="">`;
  else ic.textContent = icon;
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-sub').textContent = sub;
  const el = document.getElementById('toast');
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ═══ REVEAL POPUP ═══ (ป้ายฉลองปลดล็อคครบทั้ง 7 — แสดง ~7 วิ แล้วซ่อน)
let revealTimer = null;
function showRevealPopup() {
  const el = document.getElementById('reveal');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => el.classList.remove('show'), REVEAL_POPUP_MS);
}

// ═══ PHOTO CAPTURE ═══ (รวมภาพกล้อง + ชั้น VFX + ลายน้ำ)
let lastPhotoBlob = null;

function capturePhoto() {
  const video = document.getElementById('video');
  const W = innerWidth, H = innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const out = document.createElement('canvas');
  out.width = W * dpr; out.height = H * dpr;
  const o = out.getContext('2d');
  o.scale(dpr, dpr);

  // 1) ภาพจากกล้อง — จัดแบบ cover ให้ตรงกับที่เห็นบนจอ
  if (video && video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    o.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    o.fillStyle = '#050301'; o.fillRect(0, 0, W, H);
  }

  // 2) ชั้น VFX (canvas เต็มจอ) ทับลงไป
  o.drawImage(cv, 0, 0, W, H);

  // 3) ลายน้ำ ชื่องาน + สถานที่ที่กำลังเล็ง
  o.save();
  o.textBaseline = 'alphabetic';
  o.shadowColor = 'rgba(0,0,0,.6)'; o.shadowBlur = 8;
  o.textAlign = 'left';
  o.fillStyle = 'rgba(240,208,128,.96)';
  o.font = `600 ${Math.round(W * 0.05)}px "DM Serif Display", serif`;
  o.fillText('ตามรอยพระเจ้าตาก', W * 0.05, H * 0.94);
  const spot = SPOTS.find(s => s.id === aimedSpot);
  if (spot) {
    o.fillStyle = 'rgba(255,255,255,.92)';
    o.font = `${Math.round(W * 0.033)}px sans-serif`;
    o.fillText('◈ ' + spot.name, W * 0.05, H * 0.975);
  }
  o.restore();

  // แฟลช + สร้างไฟล์
  flashScreen();
  out.toBlob(blob => {
    if (!blob) return;
    lastPhotoBlob = blob;
    const img = document.getElementById('photo-img');
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    document.getElementById('photo-preview').classList.add('show');
  }, 'image/jpeg', 0.92);
}

function flashScreen() {
  const f = document.getElementById('flash');
  if (!f) return;
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 200);
}

function photoFileName() { return `taksin-ar-${Date.now()}.jpg`; }

function savePhoto() {
  if (!lastPhotoBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastPhotoBlob);
  a.download = photoFileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function sharePhoto() {
  if (!lastPhotoBlob) return;
  const file = new File([lastPhotoBlob], photoFileName(), { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'ตามรอยพระเจ้าตาก' }); }
    catch (e) { /* ผู้ใช้ยกเลิก */ }
  } else {
    savePhoto();   // เบราว์เซอร์ไม่รองรับแชร์ไฟล์ → บันทึกแทน
  }
}

function closePhoto() {
  document.getElementById('photo-preview').classList.remove('show');
}

// ═══ MAIN LOOP ═══
function loop() {
  T += .016;
  // smoothing แบบ adaptive — ห่างมากตามเร็ว (ไม่หน่วง), ใกล้แล้วตามช้า (นิ่ง)
  const d = Math.abs(adiff(smoothH, rawH));
  const k = d > 30 ? 0.30 : d > 10 ? 0.16 : 0.07;
  smoothH = sAngle(smoothH, rawH, k);
  updateAccuracy();
  
  // If calibration intro is showing, draw calibration compass instead of main AR
  if (document.getElementById('cal-intro').style.display !== 'none') {
    drawCalIntroCompass();
  } else {
    checkAim();
    drawCompass();
    drawVFX(T);
  }
  requestAnimationFrame(loop);
}

// ═══ PRELOAD ═══
// เริ่มจับ GPS ตั้งแต่โหลดหน้า เพื่อให้ได้พิกัดพร้อมก่อนเข้า AR
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGPS);
} else {
  startGPS();
}
