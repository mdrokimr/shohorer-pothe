// ঢাকার রাস্তার রঙিন শিল্প: রিকশা-ট্রাকের আঁকা, দোকানের সাইনবোর্ড, পোস্টার, ব্যানার, বিলবোর্ড।
// সব ছবি এখানে কোডে আঁকা (নিজস্ব নকশা)। অনেক ছবি এক ক্যানভাসে (অ্যাটলাস) রাখি, যেন অল্প draw call-এ চলে।
import * as THREE from 'three';
import { FONT, fitText } from './textures.js';
import { freeAfterUpload } from './utils.js';

// ---------- অ্যাটলাস: সারি ধরে ছোট ছোট ঘর ----------
export class Atlas {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.cv = document.createElement('canvas');
    this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext('2d');
    this.x = 0; this.y = 0; this.row = 0;
    this.tex = null;
  }
  add(w, h, draw) {
    const P = 4;
    if (this.x + w + P > this.W) { this.x = 0; this.y += this.row + P; this.row = 0; }
    if (this.y + h > this.H) { this.full = true; console.warn('atlas full'); this.x = 0; this.y = 0; this.row = 0; } // ভরে গেলে (হওয়ার কথা না)
    const x = this.x, y = this.y, c = this.ctx;
    c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip();
    try { draw(c, w, h); } catch (e) { /* আঁকায় ভুল হলেও খেলা চলুক */ }
    c.restore();
    this.x += w + P; this.row = Math.max(this.row, h);
    const W = this.W, H = this.H;
    // CanvasTexture উল্টো (flipY) থাকে: v নিচ থেকে
    return { u0: (x + 1) / W, u1: (x + w - 1) / W, v0: 1 - (y + h - 1) / H, v1: 1 - (y + 1) / H, aspect: w / h };
  }
  texture() {
    if (!this.tex) {
      const t = new THREE.CanvasTexture(this.cv);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.tex = freeAfterUpload(t); // অ্যাটলাস একবারই আঁকা হয়
    }
    return this.tex;
  }
}

// অ্যাটলাসের একটা ঘর দিয়ে সমতল (PlaneGeometry-এর uv বদলে)
export function cellPlane(w, h, c) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) ? c.u1 : c.u0, uv.getY(i) ? c.v1 : c.v0);
  }
  return g;
}

// ---------- আঁকার ছোট সরঞ্জাম ----------
const R = (a, b) => a + Math.random() * (b - a);
const P = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const FOLK = ['#e8202a', '#ffd400', '#1a9e3f', '#1d63c8', '#ff7a00', '#e0157a', '#7b2fbf', '#00a8a8', '#ffffff'];

function txt(c, s, x, y, maxW, size, color, weight = 700, align = 'center', stroke = null) {
  c.textAlign = align; c.textBaseline = 'middle';
  if (stroke) { c.lineJoin = 'round'; c.strokeStyle = stroke; c.lineWidth = Math.max(3, size * 0.16); c.font = `${weight} ${size}px ${FONT}`; let sz = size; while (c.measureText(s).width > maxW && sz > 10) { sz -= 2; c.font = `${weight} ${sz}px ${FONT}`; } c.strokeText(s, x, y); }
  c.fillStyle = color;
  fitText(c, s, x, y, maxW, size, weight);
}
function flower(c, x, y, r, petals, col, mid) {
  c.fillStyle = col;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.24, a, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = mid; c.beginPath(); c.arc(x, y, r * 0.28, 0, Math.PI * 2); c.fill();
}
function leaf(c, x, y, r, a, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, r, r * 0.35, a, 0, Math.PI * 2); c.fill(); }
// নকশি পাড়: রঙিন বিন্দু আর ত্রিভুজ
function border(c, w, h, cols, t = 10) {
  c.fillStyle = cols[0]; c.fillRect(0, 0, w, t); c.fillRect(0, h - t, w, t); c.fillRect(0, 0, t, h); c.fillRect(w - t, 0, t, h);
  c.fillStyle = cols[1];
  for (let x = t; x < w - t; x += t * 1.6) { c.beginPath(); c.moveTo(x, t); c.lineTo(x + t * 0.8, t); c.lineTo(x + t * 0.4, t * 1.8); c.fill(); c.beginPath(); c.moveTo(x, h - t); c.lineTo(x + t * 0.8, h - t); c.lineTo(x + t * 0.4, h - t * 1.8); c.fill(); }
  c.fillStyle = cols[2] || '#fff';
  for (let x = t / 2; x < w; x += t * 1.6) { c.beginPath(); c.arc(x, t / 2, t * 0.22, 0, 7); c.arc(x, h - t / 2, t * 0.22, 0, 7); c.fill(); }
}
// কাগজের মতো হালকা দানা আর পুরনো ভাব
function grime(c, w, h, a = 0.06) {
  for (let i = 0; i < (w * h) / 900; i++) { c.fillStyle = `rgba(0,0,0,${R(0, a)})`; c.fillRect(R(0, w), R(0, h), R(1, 4), R(1, 4)); }
}
function sky(c, w, h, top, bot) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, w, h); }

// ---------- রিকশা আর্ট (পিছনের পাটাতনের ছবি) ----------
const RICK_SCENES = ['village', 'birds', 'flowers', 'city', 'peacock', 'boat'];
export function rickshawArt(c, w, h, scene, text) {
  scene = scene || P(RICK_SCENES);
  if (scene === 'village' || scene === 'boat') {
    sky(c, w, h * 0.62, '#ff9a3c', '#ffe08a');
    c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(w * 0.7, h * 0.36, h * 0.13, 0, 7); c.fill();
    c.fillStyle = '#2f8fd8'; c.fillRect(0, h * 0.58, w, h * 0.42);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = h * (0.64 + i * 0.05); c.beginPath(); c.moveTo(R(0, w * 0.4), y); c.lineTo(R(w * 0.5, w), y); c.stroke(); }
    // নারকেল গাছ আর কুঁড়েঘর
    c.fillStyle = '#5b3a1e'; c.fillRect(w * 0.12, h * 0.25, w * 0.025, h * 0.36);
    for (let i = 0; i < 6; i++) leaf(c, w * 0.13 + Math.cos(i) * w * 0.06, h * 0.25 + Math.sin(i * 2) * h * 0.03, w * 0.07, i * 1.05, '#1a8a3a');
    c.fillStyle = '#b5652a'; c.fillRect(w * 0.22, h * 0.42, w * 0.14, h * 0.16);
    c.fillStyle = '#d9a441'; c.beginPath(); c.moveTo(w * 0.2, h * 0.43); c.lineTo(w * 0.29, h * 0.3); c.lineTo(w * 0.38, h * 0.43); c.fill();
    // পালতোলা নৌকা
    const bx = scene === 'boat' ? w * 0.45 : w * 0.55;
    c.fillStyle = '#3b2210'; c.beginPath(); c.moveTo(bx - w * 0.12, h * 0.7); c.quadraticCurveTo(bx, h * 0.8, bx + w * 0.12, h * 0.7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(bx, h * 0.7); c.lineTo(bx, h * 0.38); c.lineTo(bx + w * 0.1, h * 0.66); c.fill();
    c.fillStyle = '#e8202a'; c.beginPath(); c.moveTo(bx - 2, h * 0.7); c.lineTo(bx - 2, h * 0.42); c.lineTo(bx - w * 0.08, h * 0.66); c.fill();
  } else if (scene === 'birds' || scene === 'peacock') {
    sky(c, w, h, '#0e7a6a', '#1fb39a');
    for (let i = 0; i < 9; i++) flower(c, R(0, w), R(h * 0.55, h), R(8, 16), 6, P(FOLK), '#ffd400');
    // দুটো পাখি মুখোমুখি
    for (const s of [-1, 1]) {
      const x = w / 2 + s * w * 0.2, y = h * 0.42;
      c.save(); c.translate(x, y); c.scale(-s, 1);
      if (scene === 'peacock') {
        for (let i = 0; i < 7; i++) { const a = -0.6 + i * 0.2; c.fillStyle = i % 2 ? '#1d63c8' : '#1a9e3f'; c.beginPath(); c.ellipse(Math.cos(a + Math.PI) * 30, Math.sin(a + Math.PI) * 30 - 6, 22, 8, a, 0, 7); c.fill(); c.fillStyle = '#ffd400'; c.beginPath(); c.arc(Math.cos(a + Math.PI) * 44, Math.sin(a + Math.PI) * 44 - 6, 4, 0, 7); c.fill(); }
      }
      c.fillStyle = scene === 'peacock' ? '#1d4fb8' : P(['#e8202a', '#ff7a00', '#e0157a']);
      c.beginPath(); c.ellipse(0, 0, 26, 14, -0.2, 0, 7); c.fill();
      c.beginPath(); c.arc(20, -14, 9, 0, 7); c.fill();
      c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(28, -15); c.lineTo(38, -12); c.lineTo(28, -10); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(22, -16, 2.5, 0, 7); c.fill();
      c.fillStyle = P(['#ffd400', '#00a8a8', '#ffffff']); c.beginPath(); c.ellipse(-6, -2, 16, 7, -0.5, 0, 7); c.fill();
      c.restore();
    }
  } else if (scene === 'flowers') {
    sky(c, w, h, '#2a1060', '#7b2fbf');
    for (let i = 0; i < 14; i++) leaf(c, R(0, w), R(0, h), R(10, 20), R(0, 3), '#1a9e3f');
    for (let i = 0; i < 10; i++) flower(c, R(w * 0.08, w * 0.92), R(h * 0.15, h * 0.8), R(14, 26), 8, P(['#e8202a', '#ffd400', '#ff7a00', '#e0157a', '#ffffff']), '#ffd400');
  } else {
    // শহর: উঁচু দালান, রাতের আকাশ, চাঁদ
    sky(c, w, h, '#101a4a', '#3a56b0');
    c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(w * 0.82, h * 0.22, h * 0.1, 0, 7); c.fill();
    c.fillStyle = '#101a4a'; c.beginPath(); c.arc(w * 0.85, h * 0.2, h * 0.09, 0, 7); c.fill();
    for (let x = 0; x < w; x += R(18, 34)) {
      const bh = R(h * 0.25, h * 0.7), bw = R(16, 30);
      c.fillStyle = P(['#e8202a', '#1a9e3f', '#ff7a00', '#7b2fbf', '#00a8a8']); c.fillRect(x, h - bh, bw, bh);
      c.fillStyle = '#ffe680';
      for (let y = h - bh + 6; y < h - 6; y += 9) for (let wx = x + 3; wx < x + bw - 4; wx += 7) if (Math.random() < 0.6) c.fillRect(wx, y, 3, 4);
    }
  }
  border(c, w, h, [P(['#e8202a', '#1d63c8', '#1a9e3f']), '#ffd400', '#ffffff'], Math.max(8, h * 0.06));
  if (text) {
    c.fillStyle = 'rgba(0,0,0,0.0)';
    txt(c, text, w / 2, h * 0.88, w * 0.8, h * 0.12, '#ffffff', 700, 'center', '#c0161c');
  }
}
// রিকশার হুডের নকশা: ঝকঝকে রঙে চক্র, ফুল, ডোরা
export function hoodArt(c, w, h, base) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const cols = FOLK.filter((x) => x !== base);
  for (let y = 0; y < h; y += h / 6) { c.fillStyle = P(cols); c.fillRect(0, y, w, h / 30); }
  for (let i = 0; i < 6; i++) {
    const x = (i % 3 + 0.5) * w / 3, y = (Math.floor(i / 3) + 0.5) * h / 2;
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, h * 0.16, 0, 7); c.stroke();
    flower(c, x, y, h * 0.13, 8, P(cols), '#ffffff');
  }
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, h * 0.12); // চকচকে রেক্সিনের আলো
}
// ঝালর আর সিটের নকশা: সরু রঙিন ডোরা
export function stripesArt(c, w, h, cols) {
  const n = 14;
  for (let i = 0; i < n; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect((i * w) / n, 0, w / n + 1, h); }
  for (let i = 0; i < n; i++) { c.fillStyle = '#ffffff'; c.fillRect((i * w) / n, h * 0.82, 2, h * 0.18); }
}

// ---------- ট্রাক আর্ট (বডির পাশে) ----------
export function truckArt(c, w, h, base) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  // কাঠের তক্তার দাগ
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = h / 5; y < h; y += h / 5) c.fillRect(0, y, w, 2);
  // মাঝে মাঝে রঙিন প্যানেল: ফুলদানি, পাখি, চোখ
  const panels = Math.round(w / h * 0.9);
  for (let i = 0; i < panels; i++) {
    const x0 = (i + 0.1) * (w / panels), pw = (w / panels) * 0.8, y0 = h * 0.12, ph = h * 0.76;
    c.fillStyle = P(['#ffd400', '#ffffff', '#00a8a8', '#ff7a00']);
    c.beginPath(); c.moveTo(x0, y0 + ph); c.lineTo(x0, y0 + ph * 0.3); c.quadraticCurveTo(x0 + pw / 2, y0 - ph * 0.15, x0 + pw, y0 + ph * 0.3); c.lineTo(x0 + pw, y0 + ph); c.fill();
    const cx = x0 + pw / 2, cy = y0 + ph * 0.58;
    const kind = i % 3;
    if (kind === 0) { for (let k = 0; k < 5; k++) flower(c, cx + R(-pw * 0.3, pw * 0.3), cy + R(-ph * 0.3, ph * 0.15), R(8, 14), 6, P(FOLK), '#ffd400'); c.fillStyle = '#7b2fbf'; c.fillRect(cx - 10, cy + ph * 0.15, 20, ph * 0.22); }
    else if (kind === 1) { c.fillStyle = P(['#e8202a', '#1d63c8', '#1a9e3f']); c.beginPath(); c.ellipse(cx, cy, pw * 0.22, ph * 0.13, 0, 0, 7); c.fill(); c.beginPath(); c.arc(cx + pw * 0.18, cy - ph * 0.12, ph * 0.08, 0, 7); c.fill(); c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(cx + pw * 0.24, cy - ph * 0.13); c.lineTo(cx + pw * 0.34, cy - ph * 0.1); c.lineTo(cx + pw * 0.24, cy - ph * 0.07); c.fill(); }
    else { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(cx, cy, pw * 0.3, ph * 0.16, 0, 0, 7); c.fill(); c.fillStyle = '#1d63c8'; c.beginPath(); c.arc(cx, cy, ph * 0.12, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(cx, cy, ph * 0.06, 0, 7); c.fill(); }
  }
  border(c, w, h, ['#e8202a', '#ffd400', '#ffffff'], h * 0.07);
  grime(c, w, h, 0.08);
}
// ট্রাকের কেবিনের মাথার নকশা-বোর্ড
export function truckCrown(c, w, h, text) {
  sky(c, w, h, '#ffd400', '#ff7a00');
  for (let i = 0; i < 7; i++) flower(c, (i + 0.5) * w / 7, h * 0.5, h * 0.28, 7, P(['#e8202a', '#1a9e3f', '#1d63c8', '#e0157a']), '#ffffff');
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(w * 0.18, h * 0.22, w * 0.64, h * 0.56);
  txt(c, text, w / 2, h * 0.52, w * 0.6, h * 0.42, '#c0161c');
  border(c, w, h, ['#1a9e3f', '#ffffff', '#e8202a'], h * 0.09);
}
// বাসের গায়ের রঙ: দুই রঙের ঢেউ আর তীর
export function busLivery(c, w, h, base, accent, accent2) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  c.fillStyle = accent;
  c.beginPath(); c.moveTo(0, h * 0.62); c.bezierCurveTo(w * 0.3, h * 0.35, w * 0.55, h * 0.95, w, h * 0.45); c.lineTo(w, h * 0.7); c.bezierCurveTo(w * 0.55, h * 1.15, w * 0.3, h * 0.55, 0, h * 0.85); c.fill();
  c.fillStyle = accent2;
  c.beginPath(); c.moveTo(0, h * 0.9); c.bezierCurveTo(w * 0.35, h * 0.6, w * 0.6, h * 1.1, w, h * 0.78); c.lineTo(w, h); c.lineTo(0, h); c.fill();
  // ধুলা আর ঘষার দাগ
  for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(255,255,255,${R(0.05, 0.18)})`; c.lineWidth = R(1, 3); const x = R(0, w), y = R(h * 0.2, h); c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(10, 60), y + R(-3, 3)); c.stroke(); }
  grime(c, w, h, 0.1);
  const g = c.createLinearGradient(0, h * 0.75, 0, h); g.addColorStop(0, 'rgba(60,40,20,0)'); g.addColorStop(1, 'rgba(60,40,20,0.35)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
}
// গায়ে লেখা স্টিকার (সিটিং সার্ভিস, গেইট লক ইত্যাদি)
export function sticker(c, w, h, text, bg, fg) {
  c.fillStyle = bg; c.beginPath(); c.roundRect ? c.roundRect(2, 2, w - 4, h - 4, h * 0.25) : c.rect(2, 2, w - 4, h - 4); c.fill();
  txt(c, text, w / 2, h / 2 + 2, w - 16, h * 0.6, fg);
}

// ---------- দোকানের সাইনবোর্ড ----------
const SIGN_STY = [
  ['#c0161c', '#ffe14d', '#ffffff'], ['#0b6b3a', '#ffffff', '#ffd400'], ['#11408f', '#ffffff', '#ffd400'], ['#ffd400', '#c0161c', '#1b1b1b'],
  ['#ffffff', '#c0161c', '#11408f'], ['#5a1f7a', '#ffe680', '#ffffff'], ['#e85d1a', '#ffffff', '#1b1b1b'], ['#111111', '#ffd400', '#ff4d4d'],
  ['#00897b', '#ffffff', '#ffe14d'], ['#e0157a', '#ffffff', '#ffe14d'],
];
export function signboard(c, w, h, name, sub, i) {
  const [bg, fg, ac] = SIGN_STY[i % SIGN_STY.length];
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, shade(bg, -0.25)); c.fillStyle = g; c.fillRect(0, 0, w, h);
  // বাঁয়ে গোল লোগো, ডানে ফোন নম্বর
  c.fillStyle = ac; c.beginPath(); c.arc(h * 0.5, h * 0.5, h * 0.34, 0, 7); c.fill();
  c.fillStyle = bg; c.beginPath(); c.arc(h * 0.5, h * 0.5, h * 0.24, 0, 7); c.fill();
  txt(c, name.slice(0, 1), h * 0.5, h * 0.53, h * 0.4, h * 0.34, ac);
  txt(c, name, w * 0.53, h * 0.4, w - h * 1.3, h * 0.46, fg, 700, 'center', lum(bg) < 0.55 ? 'rgba(0,0,0,0.35)' : null);
  txt(c, sub, w * 0.53, h * 0.8, w - h * 1.3, h * 0.19, ac, 600);
  c.strokeStyle = ac; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10);
  grime(c, w, h, 0.07);
}
export function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ---------- পোস্টার: নির্বাচনী (বানানো প্রার্থী), বিজ্ঞাপন, শুভেচ্ছা ----------
function cartoonFace(c, x, y, r, skin, hair, beard) {
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x - r * 1.6, y + r * 2.4); c.quadraticCurveTo(x, y + r * 0.9, x + r * 1.6, y + r * 2.4); c.fill(); // পাঞ্জাবি
  c.fillStyle = skin; c.beginPath(); c.ellipse(x, y, r * 0.8, r, 0, 0, 7); c.fill();
  c.fillStyle = hair; c.beginPath(); c.ellipse(x, y - r * 0.6, r * 0.85, r * 0.5, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#1b1b1b'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.05, r * 0.08, 0, 7); c.arc(x + r * 0.3, y - r * 0.05, r * 0.08, 0, 7); c.fill();
  if (beard) { c.fillStyle = hair; c.beginPath(); c.ellipse(x, y + r * 0.62, r * 0.55, r * 0.42, 0, 0, Math.PI); c.fill(); }
  else { c.fillStyle = hair; c.fillRect(x - r * 0.32, y + r * 0.3, r * 0.64, r * 0.1); }
  c.strokeStyle = '#7a3b2a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y + r * 0.42, r * 0.22, 0.2, Math.PI - 0.2); c.stroke();
}
function symbol(c, kind, x, y, s) {
  c.save(); c.translate(x, y); c.fillStyle = '#1b1b1b'; c.strokeStyle = '#1b1b1b'; c.lineWidth = s * 0.08;
  if (kind === 'কেটলি') { c.beginPath(); c.ellipse(0, s * 0.1, s * 0.42, s * 0.34, 0, 0, 7); c.fill(); c.fillRect(-s * 0.15, -s * 0.4, s * 0.3, s * 0.12); c.beginPath(); c.moveTo(s * 0.38, 0); c.lineTo(s * 0.7, -s * 0.25); c.stroke(); c.beginPath(); c.arc(-s * 0.45, 0, s * 0.18, 1.6, 4.7); c.stroke(); }
  else if (kind === 'ছাতা') { c.beginPath(); c.arc(0, 0, s * 0.5, Math.PI, 0); c.fill(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, s * 0.5); c.arc(-s * 0.1, s * 0.5, s * 0.1, 0, Math.PI); c.stroke(); }
  else if (kind === 'চায়ের কাপ') { c.fillRect(-s * 0.35, -s * 0.2, s * 0.6, s * 0.5); c.beginPath(); c.arc(s * 0.3, s * 0.05, s * 0.14, -1.6, 1.6); c.stroke(); c.fillRect(-s * 0.5, s * 0.32, s * 0.9, s * 0.06); }
  else if (kind === 'ঘড়ি') { c.beginPath(); c.arc(0, 0, s * 0.42, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.3); c.moveTo(0, 0); c.lineTo(s * 0.2, 0); c.stroke(); }
  else { c.beginPath(); c.arc(0, 0, s * 0.42, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-s * 0.2, -s * 0.3); c.lineTo(s * 0.2, s * 0.3); c.stroke(); }
  c.restore();
}
const CAND = [
  ['জনাব জ্যামুল হক', 'কেটলি', 'রাস্তা হবে মসৃণ, ভোট দিন কেটলিতে'],
  ['আলহাজ্ব ফুটপাত মিয়া', 'ছাতা', 'রোদে-বৃষ্টিতে আপনার পাশে'],
  ['মোছাঃ চায়না বেগম', 'চায়ের কাপ', 'এক কাপ চায়ে এক ভোট'],
  ['ইঞ্জিঃ সময়মত আলী', 'ঘড়ি', 'জ্যাম হবে ইতিহাস'],
];
export function electionPoster(c, w, h, i) {
  const [name, sym, slogan] = CAND[i % CAND.length];
  c.fillStyle = '#fbf6e8'; c.fillRect(0, 0, w, h);
  c.fillStyle = ['#1a9e3f', '#c0161c', '#1d63c8', '#7b2fbf'][i % 4]; c.fillRect(0, 0, w, h * 0.13);
  txt(c, 'ওয়ার্ড কাউন্সিলর পদপ্রার্থী', w / 2, h * 0.066, w * 0.9, h * 0.07, '#ffffff');
  c.fillStyle = '#dfe9f2'; c.beginPath(); c.arc(w / 2, h * 0.37, w * 0.3, 0, 7); c.fill();
  cartoonFace(c, w / 2, h * 0.34, w * 0.14, ['#c68a5a', '#b5794a', '#d9a273'][i % 3], '#1b1b1b', i % 2 === 0);
  txt(c, name, w / 2, h * 0.66, w * 0.9, h * 0.08, '#1b1b1b');
  c.fillStyle = '#fff'; c.fillRect(w * 0.1, h * 0.72, w * 0.8, h * 0.17); c.strokeStyle = '#1b1b1b'; c.lineWidth = 2; c.strokeRect(w * 0.1, h * 0.72, w * 0.8, h * 0.17);
  symbol(c, sym, w * 0.25, h * 0.805, h * 0.12);
  txt(c, `মার্কা: ${sym}`, w * 0.6, h * 0.805, w * 0.5, h * 0.06, '#c0161c');
  txt(c, slogan, w / 2, h * 0.94, w * 0.9, h * 0.05, '#1b1b1b', 600);
  grime(c, w, h, 0.05);
}
const ADS = [
  ['জ্যাম শেষ কোচিং', 'মেডিকেল-বুয়েট ভর্তি', 'গ্যারান্টি*', '#1d63c8'],
  ['টু-লেট', '২ বেড · ১ বাথ · গ্যাস নাই', '০১৭xx-xxxxxx', '#c0161c'],
  ['৭ দিনে ইংরেজি', 'না পারলে আরও ৭ দিন', 'ভর্তি চলিতেছে', '#1a9e3f'],
  ['হারানো বিজ্ঞপ্তি', 'জ্যামে আমার ধৈর্য হারিয়েছে', 'পাইলে ফেরত দিন', '#7b2fbf'],
  ['মশার কয়েল সুপার', 'মশা পালাবে, আপনি না', 'নতুন এসেছে', '#ff7a00'],
  ['বাসা বদল সার্ভিস', 'পিকআপ · লেবার · প্যাকিং', 'সারা ঢাকা', '#00897b'],
  ['ফ্রি চক্ষু শিবির', 'শুক্রবার সকাল ৯টা', 'মহল্লার মাঠে', '#e0157a'],
  ['গরম গরম চা', 'দুধ চা ৳১০ · রং চা ৳৮', 'বিস্কুট ফ্রি নাই', '#5a3a1e'],
];
export function adPoster(c, w, h, i) {
  const [a, b, d, col] = ADS[i % ADS.length];
  sky(c, w, h, col, shade(col, -0.35));
  c.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(R(0, w), R(0, h), R(10, 40), 0, 7); c.fill(); }
  txt(c, a, w / 2, h * 0.25, w * 0.9, h * 0.15, '#ffe14d', 700, 'center', 'rgba(0,0,0,0.4)');
  c.fillStyle = '#ffffff'; c.fillRect(w * 0.06, h * 0.42, w * 0.88, h * 0.22);
  txt(c, b, w / 2, h * 0.53, w * 0.84, h * 0.08, '#1b1b1b');
  // তারা-আকৃতির দাম/লেখা
  c.save(); c.translate(w / 2, h * 0.8); c.fillStyle = '#ffd400'; c.beginPath();
  for (let k = 0; k < 24; k++) { const r = k % 2 ? h * 0.1 : h * 0.14, an = (k / 24) * Math.PI * 2; c.lineTo(Math.cos(an) * r * 1.8, Math.sin(an) * r); }
  c.fill(); c.restore();
  txt(c, d, w / 2, h * 0.8, w * 0.6, h * 0.065, '#c0161c');
  grime(c, w, h, 0.05);
}
// টিউশন / কোচিং পোস্টার (দেয়ালে আঠা)
const TUIT = [
  ['অঙ্ক + ইংরেজি', 'বাসায় এসে পড়ানো', '০১৭xx-xxxxxx'],
  ['এসএসসি সাজেশন', 'সব সাবজেক্ট · নোট সহ', 'ভর্তি চলছে'],
  ['HSC ফিজিক্স', 'রাটার বদলে বুঝে পড়ুন', 'ব্যাচ সীমিত'],
  ['আইসিটি ল্যাব', 'কম্পিউটার বেসিক', 'মাসিক ৳৮০০'],
];
export function tuitionPoster(c, w, h, i) {
  const [a, b, d] = TUIT[i % TUIT.length];
  c.fillStyle = '#fff8e7'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#c0161c'; c.fillRect(0, 0, w, h * 0.16);
  txt(c, 'ভর্তি চলিতেছে', w / 2, h * 0.08, w * 0.9, h * 0.07, '#ffd400');
  txt(c, a, w / 2, h * 0.38, w * 0.9, h * 0.12, '#1b1b1b', 700, 'center', 'rgba(0,0,0,0.15)');
  txt(c, b, w / 2, h * 0.58, w * 0.88, h * 0.07, '#333');
  c.fillStyle = '#1d63c8'; c.fillRect(w * 0.08, h * 0.72, w * 0.84, h * 0.18);
  txt(c, d, w / 2, h * 0.81, w * 0.8, h * 0.07, '#fff');
  grime(c, w, h, 0.07);
}
// বাংলা টিনের সাইনবোর্ড (দোকানের পাশের খালি দেয়াল)
const TIN = [
  ['পান · সিগারেট', 'ঠান্ডা পানি'], ['মোবাইল লোড', 'বিকাশ · নগদ'], ['চা · নাস্তা', 'সকাল ৬টা থেকে'],
  ['ডাক্তার চেম্বার', 'সন্ধ্যা ৭–৯'], ['দর্জি · সেলাই', '২৪ ঘণ্টায় ডেলিভারি'], ['কী-রিং · সিল', 'নাম খোদাই'],
];
export function tinSign(c, w, h, i) {
  const [a, b] = TIN[i % TIN.length];
  const bg = ['#1e6f9f', '#2e7d32', '#6a1b9a', '#bf360c', '#37474f', '#00695c'][i % 6];
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, 0, w, h * 0.08);
  c.strokeStyle = '#cfd8dc'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
  txt(c, a, w / 2, h * 0.4, w * 0.88, h * 0.2, '#ffd400', 700, 'center', 'rgba(0,0,0,0.35)');
  txt(c, b, w / 2, h * 0.7, w * 0.88, h * 0.14, '#ffffff');
  grime(c, w, h, 0.06);
}
const GREET = [
  ['ঈদ মোবারক', 'সবাইকে ঈদের শুভেচ্ছা', 'eid'],
  ['শুভ বিজয় দিবস', '১৬ ডিসেম্বর', 'flag'],
  ['শুভ নববর্ষ', 'পহেলা বৈশাখ ১৪৩৩', 'boishakh'],
  ['শারদীয় শুভেচ্ছা', 'দুর্গোৎসব', 'puja'],
  ['মহান একুশে', 'আন্তর্জাতিক মাতৃভাষা দিবস', 'flag'],
];
export function greetPoster(c, w, h, i) {
  const [a, b, kind] = GREET[i % GREET.length];
  if (kind === 'eid') {
    sky(c, w, h, '#0b2a5a', '#145a8a');
    c.fillStyle = '#ffd400'; c.beginPath(); c.arc(w * 0.5, h * 0.32, h * 0.15, 0, 7); c.fill();
    c.fillStyle = '#0b2a5a'; c.beginPath(); c.arc(w * 0.57, h * 0.29, h * 0.14, 0, 7); c.fill();
    for (let k = 0; k < 14; k++) { c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(R(0, w), R(0, h * 0.55), R(1, 3), 0, 7); c.fill(); }
  } else if (kind === 'flag') {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#006a4e'; c.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.42);
    c.fillStyle = '#f42a41'; c.beginPath(); c.arc(w * 0.46, h * 0.33, h * 0.12, 0, 7); c.fill();
  } else if (kind === 'boishakh') {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8202a'; c.fillRect(0, 0, w, h * 0.1); c.fillRect(0, h * 0.9, w, h * 0.1);
    c.fillStyle = '#ffd400'; c.beginPath(); c.arc(w / 2, h * 0.34, h * 0.16, 0, 7); c.fill();
    for (let k = 0; k < 12; k++) { const an = (k / 12) * Math.PI * 2; c.strokeStyle = '#e8202a'; c.lineWidth = 4; c.beginPath(); c.moveTo(w / 2 + Math.cos(an) * h * 0.18, h * 0.34 + Math.sin(an) * h * 0.18); c.lineTo(w / 2 + Math.cos(an) * h * 0.25, h * 0.34 + Math.sin(an) * h * 0.25); c.stroke(); }
  } else {
    sky(c, w, h, '#ffeb99', '#ff9a3c');
    for (let k = 0; k < 8; k++) flower(c, R(0, w), R(0, h * 0.6), R(10, 18), 8, P(['#e8202a', '#ffffff', '#ff7a00']), '#ffd400');
  }
  const dark = kind === 'eid';
  txt(c, a, w / 2, h * 0.68, w * 0.9, h * 0.12, dark ? '#ffd400' : '#c0161c', 700, 'center', dark ? null : '#ffffff');
  txt(c, b, w / 2, h * 0.8, w * 0.9, h * 0.06, dark ? '#ffffff' : '#1b1b1b', 600);
  txt(c, 'শুভেচ্ছান্তে: মিরপুর এলাকাবাসী', w / 2, h * 0.9, w * 0.9, h * 0.045, dark ? '#cfe3ff' : '#555555', 600);
}
// রাস্তার উপরে টাঙানো কাপড়ের ব্যানার
const BANNERS = [
  ['মিরপুর এলাকাবাসীর পক্ষ থেকে সবাইকে ঈদের শুভেচ্ছা', '#1a9e3f', '#ffffff'],
  ['রাস্তা সংস্কারের কাজ চলিতেছে · সাময়িক অসুবিধার জন্য আমরা দুঃখিত', '#ffd400', '#c0161c'],
  ['আন্তঃমহল্লা ফুটবল টুর্নামেন্ট · ফাইনাল শুক্রবার বিকেল ৪টা', '#1d63c8', '#ffffff'],
  ['ফ্রি রক্তের গ্রুপ নির্ণয় ক্যাম্প · আসুন, জানুন, রক্ত দিন', '#c0161c', '#ffffff'],
  ['শুভ বিজয় দিবস · মহান মুক্তিযুদ্ধের শহীদদের প্রতি শ্রদ্ধা', '#006a4e', '#ffffff'],
  ['হর্ন বাজানো নিষেধ · এখানে স্কুল আছে', '#ffffff', '#c0161c'],
  ['ময়লা নির্দিষ্ট জায়গায় ফেলুন · পরিচ্ছন্ন মিরপুর গড়ুন', '#00897b', '#ffffff'],
  ['শুভ নববর্ষ ১৪৩৩ · এসো হে বৈশাখ', '#e8202a', '#ffd400'],
];
export const BANNER_N = BANNERS.length;
export function clothBanner(c, w, h, i) {
  const [t, bg, fg] = BANNERS[i % BANNERS.length];
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  // কাপড়ের ভাঁজ
  for (let x = 0; x < w; x += 40) { const g = c.createLinearGradient(x, 0, x + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0.0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x, 0, 40, h); }
  c.fillStyle = fg; c.fillRect(0, 6, w, 4); c.fillRect(0, h - 10, w, 4);
  txt(c, t, w / 2, h / 2 + 3, w - 50, h * 0.5, fg);
}
// ছাদের বড় বিলবোর্ড (বানানো পণ্য)
const BILL = [
  ['ঝিলিক টুথপেস্ট', 'হাসি হোক ঝকঝকে', '#1d63c8', '#ffffff', 'tube'],
  ['ঠান্ডা মাথা এসি', 'ঢাকার গরমে উত্তর মেরু', '#00a8d8', '#ffffff', 'snow'],
  ['টাকাটুক', 'এক চাপে টাকা পাঠান', '#e0157a', '#ffffff', 'phone'],
  ['নীড় হাউজিং', 'মিরপুরে স্বপ্নের ফ্ল্যাট · সহজ কিস্তি', '#1a9e3f', '#ffffff', 'house'],
  ['ঝালমুড়ি চিপস', 'ঝাল বেশি, দাম কম', '#ff7a00', '#ffe14d', 'chips'],
  ['ঝুমঝুম সাবান', 'এক ধোয়াতেই ঝকঝকে', '#7b2fbf', '#ffffff', 'soap'],
  ['ফুরফুরে চা', 'এক কাপে সকাল শুরু', '#8d3b12', '#ffe9b0', 'tea'],
  ['ঝড় ডেটা', '৩০ জিবি · ৩০ দিন · ঝড়ের গতি', '#0b3d91', '#ffd400', 'phone'],
  ['মেধাবী কোচিং', 'ভর্তি চলছে · মিরপুর ১০', '#c62828', '#ffffff', 'book'],
  ['সুখী নুডুলস', '২ মিনিটে মজা', '#f9a825', '#7a1a00', 'bowl'],
  ['দ্রুত কুরিয়ার', 'আজ পাঠান, আজই পৌঁছায়', '#00695c', '#ffffff', 'box'],
  ['শান্তি রং', 'দেয়াল হাসবে বছরের পর বছর', '#ad1457', '#ffffff', 'house'],
];
export const BILL_N = BILL.length;
export function billboard(c, w, h, i) {
  const [a, b, bg, fg, kind] = BILL[i % BILL.length];
  sky(c, w, h, shade(bg, 0.15), shade(bg, -0.3));
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(w * 0.75, h * 0.5, h * 0.62, 0, 7); c.fill();
  const x = w * 0.76, y = h * 0.52, s = h * 0.32;
  c.save(); c.translate(x, y);
  if (kind === 'tube') { c.fillStyle = '#ffffff'; c.fillRect(-s * 1.2, -s * 0.3, s * 2, s * 0.6); c.fillStyle = '#c0161c'; c.fillRect(-s * 1.2, -s * 0.3, s * 0.7, s * 0.6); c.fillStyle = '#ddd'; c.fillRect(s * 0.8, -s * 0.15, s * 0.3, s * 0.3); }
  else if (kind === 'snow') { c.strokeStyle = '#ffffff'; c.lineWidth = 8; for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(an) * s, Math.sin(an) * s); c.stroke(); } }
  else if (kind === 'phone') { c.fillStyle = '#1b1b1b'; c.fillRect(-s * 0.45, -s * 0.9, s * 0.9, s * 1.8); c.fillStyle = '#ffd400'; c.fillRect(-s * 0.38, -s * 0.75, s * 0.76, s * 1.4); txt(c, '৳', 0, 0, s, s * 0.8, '#e0157a'); }
  else if (kind === 'house') { c.fillStyle = '#ffffff'; c.fillRect(-s * 0.7, -s * 0.2, s * 1.4, s); c.fillStyle = '#c0161c'; c.beginPath(); c.moveTo(-s * 0.9, -s * 0.2); c.lineTo(0, -s * 0.9); c.lineTo(s * 0.9, -s * 0.2); c.fill(); c.fillStyle = '#1d63c8'; c.fillRect(-s * 0.15, s * 0.3, s * 0.3, s * 0.5); }
  else if (kind === 'chips') { c.fillStyle = '#c0161c'; c.beginPath(); c.moveTo(-s * 0.6, -s * 0.9); c.lineTo(s * 0.6, -s * 0.9); c.lineTo(s * 0.5, s * 0.9); c.lineTo(-s * 0.5, s * 0.9); c.fill(); c.fillStyle = '#ffd400'; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(R(-s * 0.3, s * 0.3), R(-s * 0.4, s * 0.4), s * 0.15, s * 0.1, R(0, 3), 0, 7); c.fill(); } }
  else if (kind === 'tea') { c.fillStyle = '#ffffff'; c.fillRect(-s * 0.5, -s * 0.3, s * 0.8, s * 0.9); c.strokeStyle = '#ffffff'; c.lineWidth = s * 0.12; c.beginPath(); c.arc(s * 0.38, s * 0.15, s * 0.22, -1.5, 1.5); c.stroke(); c.fillStyle = '#8d3b12'; c.fillRect(-s * 0.42, -s * 0.22, s * 0.64, s * 0.16); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.2, -s * 0.45); c.quadraticCurveTo(k * s * 0.2 + s * 0.15, -s * 0.7, k * s * 0.2, -s * 0.95); c.stroke(); } }
  else if (kind === 'book') { c.fillStyle = '#ffffff'; c.fillRect(-s * 0.9, -s * 0.5, s * 0.85, s * 1.1); c.fillRect(s * 0.05, -s * 0.5, s * 0.85, s * 1.1); c.fillStyle = '#c62828'; for (let k = 0; k < 4; k++) { c.fillRect(-s * 0.75, -s * 0.3 + k * s * 0.22, s * 0.6, s * 0.06); c.fillRect(s * 0.2, -s * 0.3 + k * s * 0.22, s * 0.6, s * 0.06); } }
  else if (kind === 'bowl') { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, s * 0.85, 0, Math.PI); c.fill(); c.strokeStyle = '#ffd54f'; c.lineWidth = 5; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(-s * 0.6 + k * s * 0.2, 0); c.quadraticCurveTo(-s * 0.5 + k * s * 0.2, -s * 0.4, -s * 0.6 + k * s * 0.2, -s * 0.7); c.stroke(); } }
  else if (kind === 'box') { c.fillStyle = '#d7a86e'; c.fillRect(-s * 0.8, -s * 0.5, s * 1.6, s * 1.1); c.fillStyle = '#8d6e43'; c.fillRect(-s * 0.8, -s * 0.5, s * 1.6, s * 0.18); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(s * 0.9, -s * 0.9); c.lineTo(s * 1.1, -s * 0.6); c.lineTo(s * 0.7, -s * 0.6); c.fill(); }
  else { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, s * 0.9, s * 0.55, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(123,47,191,0.5)'; for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(R(-s, s), R(-s, s * 0.6), R(4, 12), 0, 7); c.fill(); } }
  c.restore();
  txt(c, a, w * 0.34, h * 0.36, w * 0.6, h * 0.24, fg, 700, 'center', 'rgba(0,0,0,0.35)');
  txt(c, b, w * 0.34, h * 0.68, w * 0.6, h * 0.11, fg, 600);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 12, w, 12);
}

// ================= মেট্রো পিলারের দেয়ালচিত্র (লম্বা ছবি, নিচ থেকে উপরে) =================
export const PILLAR_THEMES = ['alpona', 'kantha', 'rickshaw', 'country', 'city'];
function band(c, w, y, h, cols) { const n = 8; for (let i = 0; i < n; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect((i * w) / n, y, w / n + 1, h); } }
function alponaMotif(c, x, y, r, col) {
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, r * 0.06);
  for (const k of [1, 0.72, 0.45]) { c.beginPath(); c.arc(x, y, r * k, 0, 7); c.stroke(); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, r * 0.16, r * 0.07, a, 0, 7); c.fill(); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, r * 0.16, r * 0.06, a, 0, 7); c.fill(); }
  c.beginPath(); c.arc(x, y, r * 0.12, 0, 7); c.fill();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08, r * 0.03, 0, 7); c.fill(); }
}
function stitch(c, pts, col, w = 3) { c.strokeStyle = col; c.lineWidth = w; c.setLineDash([7, 5]); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.setLineDash([]); }
function stitchFlower(c, x, y, r, col) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const pts = []; for (let k = 0; k <= 12; k++) { const t = (k / 12) * Math.PI; pts.push([x + Math.cos(a) * Math.sin(t) * r + Math.cos(a + 1.57) * Math.sin(t * 2) * r * 0.18, y + Math.sin(a) * Math.sin(t) * r + Math.sin(a + 1.57) * Math.sin(t * 2) * r * 0.18]); } stitch(c, pts, col); }
  stitch(c, [...Array(17)].map((_, k) => [x + Math.cos(k / 16 * 6.283) * r * 0.25, y + Math.sin(k / 16 * 6.283) * r * 0.25]), col);
}
function tiger(c, x, y, s) {
  c.fillStyle = '#e8891a'; c.beginPath(); c.ellipse(x, y, s, s * 0.42, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(x + s * 0.95, y - s * 0.2, s * 0.36, 0, 7); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + s * 1.08, y - s * 0.12, s * 0.16, 0, 7); c.fill();
  c.fillStyle = '#1b1b1b';
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x + i * s * 0.25, y - s * 0.4); c.quadraticCurveTo(x + i * s * 0.25 + s * 0.1, y, x + i * s * 0.25 - s * 0.02, y + s * 0.3); c.lineWidth = s * 0.07; c.strokeStyle = '#1b1b1b'; c.stroke(); }
  c.beginPath(); c.arc(x + s * 1.02, y - s * 0.28, s * 0.05, 0, 7); c.fill();
  c.fillStyle = '#e8891a'; for (const dx of [0.75, 1.15]) { c.beginPath(); c.arc(x + s * dx, y - s * 0.5, s * 0.1, 0, 7); c.fill(); }
  c.strokeStyle = '#e8891a'; c.lineWidth = s * 0.12; c.beginPath(); c.moveTo(x - s * 0.95, y - s * 0.1); c.quadraticCurveTo(x - s * 1.4, y - s * 0.6, x - s * 1.25, y - s * 0.9); c.stroke();
  for (const dx of [-0.6, -0.25, 0.3, 0.65]) { c.fillStyle = '#e8891a'; c.fillRect(x + dx * s - s * 0.08, y + s * 0.2, s * 0.16, s * 0.5); }
}
export function pillarArt(c, w, h, theme, seed = 0) {
  const R = (a, b) => a + Math.random() * (b - a);
  if (theme === 'alpona') {
    c.fillStyle = ['#a63a22', '#8e2a18', '#b5532a'][seed % 3]; c.fillRect(0, 0, w, h);
    for (let y = w * 0.7; y < h - w * 0.4; y += w * 1.25) alponaMotif(c, w / 2, y, w * 0.4, '#fbf3e4');
    c.fillStyle = '#fbf3e4'; for (let y = 0; y < h; y += 14) { c.beginPath(); c.arc(8, y, 3, 0, 7); c.arc(w - 8, y, 3, 0, 7); c.fill(); }
  } else if (theme === 'kantha') {
    c.fillStyle = ['#f3e7cf', '#efe1c0', '#f6ecd8'][seed % 3]; c.fillRect(0, 0, w, h);
    const cols = ['#c0161c', '#1d4f8c', '#1a7a3a', '#d68a00'];
    for (let y = w * 0.6, i = 0; y < h - w * 0.3; y += w * 0.95, i++) {
      if (i % 3 === 1) {
        // মাছ
        const col = cols[(i + seed) % 4];
        stitch(c, [[w * 0.18, y], [w * 0.45, y - w * 0.2], [w * 0.75, y], [w * 0.45, y + w * 0.2], [w * 0.18, y], [w * 0.08, y - w * 0.12], [w * 0.08, y + w * 0.12], [w * 0.18, y]], col);
      } else stitchFlower(c, w / 2, y, w * 0.32, cols[(i + seed) % 4]);
    }
    for (const x of [10, w - 10]) stitch(c, [[x, 0], [x, h]], '#c0161c', 4);
    for (let y = 0; y < h; y += 40) stitch(c, [[16, y], [w - 16, y + 20]], 'rgba(29,79,140,0.25)', 2);
  } else if (theme === 'rickshaw') {
    const panels = Math.floor(h / (w * 1.1));
    for (let i = 0; i < panels; i++) {
      const y0 = i * (h / panels), ph = h / panels;
      const g = c.createLinearGradient(0, y0, 0, y0 + ph); const bgs = [['#0e7a6a', '#1fb39a'], ['#2a1060', '#7b2fbf'], ['#c0161c', '#ff7a00'], ['#1d4f8c', '#3fa0e0']][(i + seed) % 4];
      g.addColorStop(0, bgs[0]); g.addColorStop(1, bgs[1]); c.fillStyle = g; c.fillRect(0, y0, w, ph);
      if ((i + seed) % 3 === 0) {
        for (let k = 0; k < 7; k++) flower(c, R(20, w - 20), R(y0 + 20, y0 + ph - 20), R(12, 22), 7, P(FOLK), '#ffd400');
      } else if ((i + seed) % 3 === 1) {
        // ময়ূর
        const cx = w / 2, cy = y0 + ph * 0.55;
        for (let k = 0; k < 9; k++) { const a = -Math.PI * 0.9 + k * 0.22; c.fillStyle = k % 2 ? '#1d63c8' : '#1a9e3f'; c.beginPath(); c.ellipse(cx + Math.cos(a) * w * 0.25, cy + Math.sin(a) * w * 0.25, w * 0.16, w * 0.05, a, 0, 7); c.fill(); c.fillStyle = '#ffd400'; c.beginPath(); c.arc(cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * w * 0.38, 5, 0, 7); c.fill(); }
        c.fillStyle = '#1d4fb8'; c.beginPath(); c.ellipse(cx, cy, w * 0.11, w * 0.2, 0, 0, 7); c.fill(); c.beginPath(); c.arc(cx, cy - w * 0.25, w * 0.07, 0, 7); c.fill();
      } else {
        for (const s of [-1, 1]) { c.fillStyle = P(['#e8202a', '#ffd400', '#ffffff']); c.beginPath(); c.ellipse(w / 2 + s * w * 0.2, y0 + ph * 0.5, w * 0.16, w * 0.09, 0, 0, 7); c.fill(); c.beginPath(); c.arc(w / 2 + s * w * 0.08, y0 + ph * 0.42, w * 0.06, 0, 7); c.fill(); }
      }
      c.fillStyle = '#ffd400'; c.fillRect(0, y0, w, 6); c.fillStyle = '#ffffff'; for (let x = 4; x < w; x += 14) { c.beginPath(); c.arc(x, y0 + 3, 2.5, 0, 7); c.fill(); }
    }
  } else if (theme === 'country') {
    // উপর থেকে: আকাশ-সূর্য-দোয়েল, সুন্দরবনে বাঘ, নদীতে নৌকা আর শাপলা
    sky(c, w, h * 0.35, '#5aa9e6', '#bfe3f7');
    c.fillStyle = '#ffd54a'; c.beginPath(); c.arc(w * 0.68, h * 0.1, w * 0.17, 0, 7); c.fill();
    c.strokeStyle = '#5d3a1a'; c.lineWidth = 8; c.beginPath(); c.moveTo(0, h * 0.24); c.quadraticCurveTo(w * 0.5, h * 0.21, w, h * 0.26); c.stroke();
    // দোয়েল: কালো-সাদা
    c.fillStyle = '#111'; c.beginPath(); c.ellipse(w * 0.45, h * 0.205, w * 0.13, w * 0.07, -0.2, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.56, h * 0.19, w * 0.05, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(w * 0.44, h * 0.21, w * 0.08, w * 0.025, -0.2, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(w * 0.33, h * 0.2); c.lineTo(w * 0.18, h * 0.17); c.lineTo(w * 0.2, h * 0.2); c.fill();
    // সুন্দরবন
    c.fillStyle = '#1f5a2a'; c.fillRect(0, h * 0.35, w, h * 0.3);
    for (let i = 0; i < 14; i++) { const x = R(0, w), y = R(h * 0.34, h * 0.6); c.fillStyle = P(['#2e7d32', '#1b5e20', '#388e3c']); c.beginPath(); c.moveTo(x, y - 40); c.lineTo(x - 22, y + 10); c.lineTo(x + 22, y + 10); c.fill(); c.fillStyle = '#4e342e'; c.fillRect(x - 2, y + 10, 4, 14); }
    tiger(c, w * 0.45, h * 0.56, w * 0.24);
    // নদী, নৌকা, শাপলা
    c.fillStyle = '#2f8fd8'; c.fillRect(0, h * 0.65, w, h * 0.35);
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2; for (let i = 0; i < 16; i++) { const y = R(h * 0.66, h); c.beginPath(); c.moveTo(R(0, w * 0.5), y); c.lineTo(R(w * 0.5, w), y); c.stroke(); }
    const by = h * 0.74;
    c.fillStyle = '#3b2210'; c.beginPath(); c.moveTo(w * 0.15, by); c.quadraticCurveTo(w * 0.5, by + 30, w * 0.85, by); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w * 0.5, by); c.lineTo(w * 0.5, by - 90); c.lineTo(w * 0.78, by - 8); c.fill();
    c.fillStyle = '#e8202a'; c.beginPath(); c.moveTo(w * 0.48, by); c.lineTo(w * 0.48, by - 80); c.lineTo(w * 0.25, by - 10); c.fill();
    for (let i = 0; i < 6; i++) { const x = R(20, w - 20), y = R(h * 0.84, h * 0.96); c.fillStyle = '#2e7d32'; c.beginPath(); c.ellipse(x, y + 6, 16, 6, 0, 0, 7); c.fill(); flower(c, x, y, 11, 8, '#f8bbd0', '#ffd400'); }
  } else {
    // শহরের দেয়ালচিত্র: আকাশরেখা, মেট্রো, রিকশা, বাস, ক্রিকেট, গ্রাফিতি
    sky(c, w, h, ['#ff7a00', '#7b2fbf', '#00a8a8'][seed % 3], '#1b1b3a');
    for (let x = 0; x < w; x += R(18, 30)) { const bh = R(h * 0.08, h * 0.2), bw = R(14, 26); c.fillStyle = P(['#e8202a', '#1a9e3f', '#ffd400', '#1d63c8', '#e0157a']); c.fillRect(x, h * 0.3 - bh, bw, bh); c.fillStyle = '#fff6b0'; for (let y = h * 0.3 - bh + 6; y < h * 0.3 - 4; y += 9) c.fillRect(x + 4, y, 3, 4); }
    // মেট্রো ট্রেন উড়াল লাইনে
    c.fillStyle = '#bdb8ae'; c.fillRect(0, h * 0.34, w, 10);
    c.fillStyle = '#ffffff'; c.fillRect(6, h * 0.31, w - 12, 24); c.fillStyle = '#1f7a3d'; c.fillRect(6, h * 0.31 + 16, w - 12, 4); c.fillStyle = '#c62828'; c.fillRect(6, h * 0.31 + 20, w - 12, 2);
    c.fillStyle = '#18242e'; for (let x = 12; x < w - 16; x += 18) c.fillRect(x, h * 0.31 + 4, 12, 9);
    // গ্রাফিতি লেখা
    c.save(); c.translate(w / 2, h * 0.47); c.rotate(-0.5 * Math.PI);
    c.font = `900 ${w * 0.42}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const word = ['ঢাকা', 'মিরপুর', 'শহর', 'চলো'][seed % 4];
    c.strokeStyle = '#111'; c.lineWidth = 12; c.strokeText(word, 0, 0); c.fillStyle = P(['#ffd400', '#3ddc84', '#ff4fa3', '#4fc3f7']); c.fillText(word, 0, 0);
    c.restore();
    // রিকশা
    const ry = h * 0.66;
    c.strokeStyle = '#111'; c.lineWidth = 4; for (const [x, r] of [[w * 0.25, 16], [w * 0.7, 18]]) { c.beginPath(); c.arc(x, ry, r, 0, 7); c.stroke(); }
    c.fillStyle = '#c0161c'; c.beginPath(); c.moveTo(w * 0.55, ry - 20); c.quadraticCurveTo(w * 0.7, ry - 70, w * 0.85, ry - 20); c.fill();
    c.fillStyle = '#ffd400'; c.fillRect(w * 0.5, ry - 22, w * 0.4, 10); c.strokeStyle = '#555'; c.beginPath(); c.moveTo(w * 0.25, ry); c.lineTo(w * 0.55, ry - 12); c.stroke();
    // বাস
    c.fillStyle = '#1e7a3c'; c.fillRect(w * 0.08, h * 0.75, w * 0.84, 46); c.fillStyle = '#ffd400'; c.fillRect(w * 0.08, h * 0.75 + 30, w * 0.84, 6);
    c.fillStyle = '#18242e'; for (let x = w * 0.12; x < w * 0.85; x += 22) c.fillRect(x, h * 0.75 + 6, 16, 14);
    c.fillStyle = '#111'; for (const x of [w * 0.25, w * 0.75]) { c.beginPath(); c.arc(x, h * 0.75 + 48, 9, 0, 7); c.fill(); }
    // ক্রিকেট ব্যাট আর বল
    c.save(); c.translate(w * 0.4, h * 0.88); c.rotate(-0.6); c.fillStyle = '#e0c48a'; c.fillRect(-10, -50, 20, 70); c.fillStyle = '#5d4037'; c.fillRect(-4, -78, 8, 30); c.restore();
    c.fillStyle = '#c62828'; c.beginPath(); c.arc(w * 0.72, h * 0.86, 11, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(w * 0.72, h * 0.86, 7, 0.5, 2.6); c.stroke();
    for (let i = 0; i < 30; i++) { c.fillStyle = `hsla(${R(0, 360)},90%,60%,0.7)`; c.beginPath(); c.arc(R(0, w), R(h * 0.9, h), R(1, 4), 0, 7); c.fill(); }
  }
  // নিচে আর উপরে রঙিন পাড়
  band(c, w, h - 70, 70, ['#c0161c', '#ffd400', '#1a9e3f', '#1d63c8']);
  c.fillStyle = '#111'; c.fillRect(0, h - 72, w, 4);
  band(c, w, 0, 26, ['#ffd400', '#c0161c']);
}

// ================= রাস্তার সতর্ক/তথ্য বোর্ড =================
function picto(c, kind, x, y, s, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = s * 0.08; c.lineCap = 'round';
  const person = (px, py, k) => { c.beginPath(); c.arc(px, py - s * 0.32 * k, s * 0.09 * k, 0, 7); c.fill(); c.beginPath(); c.moveTo(px, py - s * 0.22 * k); c.lineTo(px, py + s * 0.05 * k); c.moveTo(px, py + s * 0.05 * k); c.lineTo(px - s * 0.1 * k, py + s * 0.3 * k); c.moveTo(px, py + s * 0.05 * k); c.lineTo(px + s * 0.1 * k, py + s * 0.3 * k); c.moveTo(px - s * 0.12 * k, py - s * 0.1 * k); c.lineTo(px + s * 0.12 * k, py - s * 0.12 * k); c.stroke(); };
  if (kind === 'school') { person(-s * 0.16, 0, 1); person(s * 0.18, s * 0.06, 0.8); c.fillRect(s * 0.24, -s * 0.12, s * 0.12, s * 0.14); }
  else if (kind === 'madrasa') { c.beginPath(); c.arc(0, s * 0.02, s * 0.28, Math.PI, 0); c.fill(); c.fillRect(-s * 0.28, s * 0.02, s * 0.56, s * 0.28); c.beginPath(); c.moveTo(0, -s * 0.26); c.lineTo(0, -s * 0.42); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, s * 0.2, s * 0.08, Math.PI, 0); c.fill(); c.fillRect(-s * 0.08, s * 0.2, s * 0.16, s * 0.1); }
  else if (kind === 'court') { c.beginPath(); c.moveTo(0, -s * 0.38); c.lineTo(0, s * 0.3); c.moveTo(-s * 0.32, -s * 0.24); c.lineTo(s * 0.32, -s * 0.24); c.moveTo(-s * 0.2, s * 0.3); c.lineTo(s * 0.2, s * 0.3); c.stroke(); for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * s * 0.32, -s * 0.24); c.lineTo(sx * s * 0.44, s * 0.04); c.lineTo(sx * s * 0.2, s * 0.04); c.closePath(); c.stroke(); c.beginPath(); c.arc(sx * s * 0.32, s * 0.04, s * 0.12, 0, Math.PI); c.fill(); } }
  else if (kind === 'thana') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? s * 0.16 : s * 0.38; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); }
  else if (kind === 'hospital') { c.fillRect(-s * 0.1, -s * 0.34, s * 0.2, s * 0.68); c.fillRect(-s * 0.34, -s * 0.1, s * 0.68, s * 0.2); }
  else if (kind === 'metro') { c.font = `900 ${s * 0.8}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 0, s * 0.04); }
  else if (kind === 'bus') { c.fillRect(-s * 0.36, -s * 0.28, s * 0.72, s * 0.48); c.fillStyle = '#1d4f8c'; c.fillRect(-s * 0.3, -s * 0.22, s * 0.6, s * 0.18); c.fillStyle = col; for (const sx of [-0.22, 0.22]) { c.beginPath(); c.arc(sx * s, s * 0.24, s * 0.08, 0, 7); c.fill(); } }
  else if (kind === 'junction') { c.lineWidth = s * 0.14; c.beginPath(); c.moveTo(0, s * 0.38); c.lineTo(0, -s * 0.38); c.moveTo(-s * 0.32, 0); c.lineTo(s * 0.32, 0); c.stroke(); }
  else if (kind === 'bump') { c.beginPath(); c.moveTo(-s * 0.42, s * 0.22); c.lineTo(-s * 0.2, s * 0.22); c.quadraticCurveTo(0, -s * 0.22, s * 0.2, s * 0.22); c.lineTo(s * 0.42, s * 0.22); c.lineTo(s * 0.42, s * 0.3); c.lineTo(-s * 0.42, s * 0.3); c.fill(); }
  else if (kind === 'zebra') { for (let i = 0; i < 5; i++) c.fillRect(-s * 0.4 + i * s * 0.17, s * 0.16, s * 0.1, s * 0.18); person(0, -s * 0.06, 0.85); }
  c.restore();
}
// warn = লাল পাড়ের সাদা ত্রিভুজ, info = নীল চতুর্ভুজ; নিচে লেখার প্লেট
export function roadSign(c, w, h, kind, t1, t2, info) {
  c.clearRect(0, 0, w, h);
  const top = h * 0.62, cx = w / 2;
  if (info) {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect ? c.roundRect(w * 0.12, 6, w * 0.76, top - 12, 18) : c.rect(w * 0.12, 6, w * 0.76, top - 12); c.fill();
    c.fillStyle = '#1d4f8c'; c.beginPath(); c.roundRect ? c.roundRect(w * 0.15, 10, w * 0.7, top - 20, 14) : c.rect(w * 0.15, 10, w * 0.7, top - 20); c.fill();
    picto(c, kind, cx, top * 0.5, top * 0.62, '#ffffff');
  } else {
    const tri = (pad, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx, 6 + pad); c.lineTo(w - 10 - pad * 1.2, top - 6 - pad * 0.6); c.lineTo(10 + pad * 1.2, top - 6 - pad * 0.6); c.closePath(); c.fill(); };
    tri(0, '#ffffff'); tri(6, '#d01818'); tri(26, '#ffffff');
    picto(c, kind, cx, top * 0.6, top * 0.48, '#111111');
  }
  // লেখার প্লেট
  c.fillStyle = info ? '#1d4f8c' : '#ffffff';
  c.fillRect(8, top + 2, w - 16, h - top - 6);
  c.strokeStyle = info ? '#ffffff' : '#111111'; c.lineWidth = 4; c.strokeRect(12, top + 6, w - 24, h - top - 14);
  txt(c, t1, cx, top + (h - top) * 0.36, w - 36, (h - top) * 0.34, info ? '#ffffff' : '#111111');
  if (t2) txt(c, t2, cx, top + (h - top) * 0.72, w - 36, (h - top) * 0.24, info ? '#ffd400' : '#c0161c', 600);
}
export function signBack(c, w, h) { c.clearRect(0, 0, w, h); c.fillStyle = '#8a9096'; const top = h * 0.62; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w - 10, top - 6); c.lineTo(10, top - 6); c.closePath(); c.fill(); c.fillRect(8, top + 2, w - 16, h - top - 6); }
export function signBackInfo(c, w, h) { c.clearRect(0, 0, w, h); c.fillStyle = '#8a9096'; c.fillRect(w * 0.12, 6, w * 0.76, h * 0.62 - 12); c.fillRect(8, h * 0.62 + 2, w - 16, h * 0.38 - 6); }

// ---------- খোলা দোকানের সামনেটা (দরজা দিয়ে ভিতরটা দেখা যায়) ----------
// kind: 'shop' (তাকে মাল), 'rest' (টেবিল-চেয়ার), 'glass' (কাচের দরজা: অফিস, ব্যাংক, হাসপাতাল), 'gate' (স্কুল-মাদ্রাসা-আদালতের খোলা ফটক), 'dark' (অস্ত্রের দোকান)
// দোকানের নাম থেকে ধরন (townlife.js-ও এটাই ব্যবহার করে, যাতে বাইরের কাচের ভিতরের ছবি আর ঢোকার পরের ঘর মেলে)
const SHOP_TYPES = [
  [/ফার্মেসি|ঔষধ|ডায়াগনস্টিক|কেয়ার/, 'pharmacy'], [/মোবাইল|বিকাশ|টেলিকম|ফ্লেক্সি/, 'mobile'],
  [/জুতা|কাপড়|শাড়ি|টেইলার্স|চশমা|ক্লথ|অপটিক্স|জুয়েলার্স/, 'cloth'], [/বই|ফটোকপি|লাইব্রেরি|কম্পিউটার|প্রিন্ট/, 'book'],
  [/ইলেকট্রনিক্স|হার্ডওয়্যার|ইলেকট্রিক/, 'electronics'], [/সেলুন|পার্লার|হেয়ার/, 'salon'], [/মিষ্টি|সুইট/, 'sweets'],
  [/মোটরস|শোরুম/, 'motor'], [/মুদি|সুপার|স্টোর|বাজার|মার্কেট|ভ্যারাইটিজ|দোকান|ক্রোকারিজ|টি স্টল|চা/, 'grocery'],
];
export function shopType(name) {
  for (const [re, t] of SHOP_TYPES) if (re.test(name || '')) return t;
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ['grocery', 'sweets', 'grocery', 'cloth', 'mobile'][Math.abs(h) % 5];
}
// কাচের ভিতরের দোকান: ধরন অনুযায়ী মাল (ওষুধের তাক, ঝোলানো জামা, মোবাইলের শোকেস, মিষ্টির ট্রে...)
function shopGoods(c, w, h, type, top, R) {
  const rect = (col, x, y, ww, hh) => { c.fillStyle = col; c.fillRect(w * x, h * y, w * ww, h * hh); };
  const counter = (col, glass) => {
    rect(col, 0.18, 0.72, 0.64, 0.28);
    if (glass) { rect('rgba(200,230,255,0.45)', 0.18, 0.6, 0.64, 0.12); rect('rgba(255,255,255,0.5)', 0.18, 0.6, 0.64, 0.012); }
  };
  if (type === 'pharmacy') {
    rect('#f4f7f8', 0.04, top / h, 0.92, 1);
    for (let r = 0; r < 4; r++) {
      const y = top / h + 0.08 + r * 0.15;
      rect('#dfe5e8', 0.06, y + 0.11, 0.88, 0.02);
      for (let x = 0.07; x < 0.92;) { const bw = 0.03 + R() * 0.025; rect(['#ffffff', '#90caf9', '#a5d6a7', '#ef9a9a', '#fff59d', '#ce93d8'][R() * 6 | 0], x, y + 0.11 - (0.05 + R() * 0.04), bw - 0.004, 0.05 + R() * 0.04); x += bw; }
    }
    rect('#2e7d32', 0.44, top / h + 0.01, 0.12, 0.06); rect('#ffffff', 0.485, top / h + 0.02, 0.03, 0.04); rect('#ffffff', 0.47, top / h + 0.032, 0.06, 0.016);
    counter('#eceff1', true);
  } else if (type === 'cloth') {
    rect('#efe3d0', 0.04, top / h, 0.92, 1);
    for (const ry of [0.25, 0.5]) {
      rect('#8d8d8d', 0.06, ry, 0.88, 0.012);
      for (let x = 0.08; x < 0.9; x += 0.055) {
        c.fillStyle = FOLK[R() * 9 | 0];
        c.beginPath(); c.moveTo(w * x, h * (ry + 0.02)); c.lineTo(w * (x + 0.045), h * (ry + 0.02)); c.lineTo(w * (x + 0.05), h * (ry + 0.2)); c.lineTo(w * (x - 0.005), h * (ry + 0.2)); c.fill();
      }
    }
    // পুতুল (ম্যানিকিন) শাড়ি পরা
    c.fillStyle = '#e0c3a0'; c.beginPath(); c.arc(w * 0.88, h * 0.5, h * 0.035, 0, 7); c.fill();
    c.fillStyle = '#c2185b'; c.beginPath(); c.moveTo(w * 0.85, h * 0.54); c.lineTo(w * 0.91, h * 0.54); c.lineTo(w * 0.94, h * 0.98); c.lineTo(w * 0.82, h * 0.98); c.fill();
    counter('#6d4c41', false);
  } else if (type === 'mobile') {
    rect('#e8eef3', 0.04, top / h, 0.92, 1);
    for (let i = 0; i < 4; i++) { rect('#1b1b1b', 0.1 + i * 0.21, top / h + 0.06, 0.15, 0.3); rect(['#1e88e5', '#e53935', '#43a047', '#8e24aa'][i], 0.115 + i * 0.21, top / h + 0.08, 0.12, 0.24); }
    rect('#e0157a', 0.06, top / h + 0.4, 0.88, 0.06); c.fillStyle = '#fff'; c.font = `700 ${h * 0.045}px ${FONT}`; c.textAlign = 'center'; c.fillText('রিচার্জ · বিকাশ · নতুন সেট', w * 0.5, h * (top / h + 0.445));
    counter('#cfd8dc', true);
    for (let i = 0; i < 7; i++) rect('#111', 0.22 + i * 0.08, 0.63, 0.04, 0.07);
  } else if (type === 'sweets') {
    rect('#fff3e0', 0.04, top / h, 0.92, 1);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      const x = 0.1 + i * 0.17, y = top / h + 0.12 + r * 0.22;
      rect('#b0bec5', x, y + 0.08, 0.14, 0.02);
      const col = ['#fffde7', '#8d5524', '#ffcc80', '#ffffff', '#e65100'][(i + r * 2) % 5];
      for (let k = 0; k < 4; k++) { c.fillStyle = col; c.beginPath(); c.arc(w * (x + 0.02 + k * 0.035), h * (y + 0.06), h * 0.025, 0, 7); c.fill(); }
    }
    counter('#cfd8dc', true);
    for (let i = 0; i < 6; i++) { c.fillStyle = ['#fffde7', '#8d5524', '#ffcc80'][i % 3]; c.beginPath(); c.arc(w * (0.25 + i * 0.09), h * 0.67, h * 0.03, 0, 7); c.fill(); }
  } else if (type === 'book') {
    rect('#d7c4a8', 0.04, top / h, 0.92, 1);
    for (let r = 0; r < 4; r++) { const y = top / h + 0.08 + r * 0.15; rect('#6d4c41', 0.06, y + 0.12, 0.88, 0.02); for (let x = 0.07; x < 0.92;) { const bw = 0.012 + R() * 0.014; rect(FOLK[R() * 8 | 0], x, y + 0.12 - (0.08 + R() * 0.035), bw - 0.002, 0.08 + R() * 0.035); x += bw; } }
    counter('#5d4037', false);
    rect('#eceff1', 0.6, 0.62, 0.16, 0.1); // ফটোকপি মেশিন
  } else if (type === 'electronics') {
    rect('#dfe3e6', 0.04, top / h, 0.92, 1);
    for (let i = 0; i < 3; i++) { rect('#111', 0.1 + i * 0.28, top / h + 0.08, 0.22, 0.16); rect('#2b5f8a', 0.11 + i * 0.28, top / h + 0.09, 0.2, 0.14); }
    for (let i = 0; i < 4; i++) { c.strokeStyle = '#555'; c.lineWidth = 2; c.beginPath(); c.arc(w * (0.15 + i * 0.22), h * 0.5, h * 0.06, 0, 7); c.stroke(); rect('#777', 0.145 + i * 0.22, 0.56, 0.01, 0.12); }
    counter('#9e9e9e', false);
    for (let i = 0; i < 3; i++) { c.fillStyle = ['#c62828', '#1b1b1b', '#1565c0'][i]; c.beginPath(); c.arc(w * (0.32 + i * 0.16), h * 0.69, h * 0.045, Math.PI, 0); c.fill(); } // হেলমেট
  } else if (type === 'salon') {
    rect('#f2f2f2', 0.04, top / h, 0.92, 1);
    for (let i = 0; i < 3; i++) { rect('#9fc7d6', 0.1 + i * 0.29, top / h + 0.08, 0.2, 0.3); rect('rgba(255,255,255,0.5)', 0.12 + i * 0.29, top / h + 0.1, 0.04, 0.26); rect('#333', 0.13 + i * 0.29, 0.68, 0.14, 0.18); rect('#c62828', 0.135 + i * 0.29, 0.6, 0.13, 0.1); }
  } else if (type === 'motor') {
    rect('#eeeeee', 0.04, top / h, 0.92, 1);
    for (let i = 0; i < 2; i++) { const x = 0.18 + i * 0.4; c.fillStyle = '#111'; c.beginPath(); c.arc(w * x, h * 0.85, h * 0.07, 0, 7); c.arc(w * (x + 0.2), h * 0.85, h * 0.07, 0, 7); c.fill(); rect(i ? '#1b1b1b' : '#c62828', x, 0.66, 0.2, 0.1); }
  } else return false;
  return true;
}
export function shopOpen(c, w, h, kind, seed = 0, type = null) {
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const top = h * 0.13; // গুটানো শাটার
  // চারপাশের ফ্রেম (দেয়াল)
  c.fillStyle = '#8b8378'; c.fillRect(0, 0, w, h);
  if (kind === 'gate') {
    // ভিতরের উঠান: আকাশ, সবুজ গাছ, হালকা মাঠ, দূরে স্কুলঘর
    const sky = c.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#bfe0f5'); sky.addColorStop(1, '#e8f3f8');
    c.fillStyle = sky; c.fillRect(w * 0.12, 0, w * 0.76, h * 0.55);
    c.fillStyle = '#e6d3a8'; c.fillRect(w * 0.12, h * 0.55, w * 0.76, h * 0.45);
    c.fillStyle = '#f2ead8'; c.fillRect(w * 0.3, h * 0.26, w * 0.4, h * 0.3);
    c.fillStyle = '#c0161c'; c.fillRect(w * 0.3, h * 0.24, w * 0.4, h * 0.04);
    for (let i = 0; i < 6; i++) { c.fillStyle = '#5d7ea8'; c.fillRect(w * (0.33 + i * 0.062), h * 0.32, w * 0.035, h * 0.1); }
    for (const x of [0.18, 0.78]) { c.fillStyle = '#2e7d32'; c.beginPath(); c.arc(w * x, h * 0.3, h * 0.17, 0, 7); c.fill(); c.fillStyle = '#5d4037'; c.fillRect(w * x - 3, h * 0.4, 6, h * 0.18); }
    c.fillStyle = '#d6c08f'; c.beginPath(); c.moveTo(w * 0.42, h * 0.56); c.lineTo(w * 0.58, h * 0.56); c.lineTo(w * 0.7, h); c.lineTo(w * 0.3, h); c.fill();
    // ইটের থাম
    for (const x0 of [0, w * 0.88]) {
      c.fillStyle = '#b5532f'; c.fillRect(x0, 0, w * 0.12, h);
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
      for (let y = 6; y < h; y += 10) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w * 0.12, y); c.stroke(); }
    }
    // খোলা লোহার ফটকের পাল্লা (দুই পাশে ভাঁজ করা)
    c.strokeStyle = '#1f4e3d'; c.lineWidth = 3;
    for (const [a, b] of [[w * 0.12, w * 0.24], [w * 0.76, w * 0.88]]) {
      c.strokeRect(a, h * 0.18, b - a, h * 0.8);
      for (let x = a + 6; x < b; x += 7) { c.beginPath(); c.moveTo(x, h * 0.18); c.lineTo(x, h * 0.98); c.stroke(); }
      for (let x = a + 6; x < b; x += 7) { c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(x - 3, h * 0.18); c.lineTo(x, h * 0.12); c.lineTo(x + 3, h * 0.18); c.fill(); }
    }
    return;
  }
  // ভিতর: অন্ধকার থেকে আলো
  const inside = c.createLinearGradient(0, top, 0, h);
  if (kind === 'glass') { inside.addColorStop(0, '#dfe8ee'); inside.addColorStop(1, '#a9b8c2'); }
  else if (kind === 'dark') { inside.addColorStop(0, '#3a3532'); inside.addColorStop(1, '#1d1a18'); }
  else { inside.addColorStop(0, '#fff3d0'); inside.addColorStop(0.5, '#c79a5e'); inside.addColorStop(1, '#5e4630'); }
  c.fillStyle = inside; c.fillRect(w * 0.04, top, w * 0.92, h - top);
  if (kind === 'glass') {
    // রিসেপশন, গাছ, দেয়ালে ছবি
    c.fillStyle = '#eceff1'; c.fillRect(w * 0.35, h * 0.62, w * 0.3, h * 0.2);
    c.fillStyle = '#546e7a'; c.fillRect(w * 0.35, h * 0.6, w * 0.3, h * 0.03);
    c.fillStyle = '#2e7d32'; c.beginPath(); c.arc(w * 0.15, h * 0.62, h * 0.09, 0, 7); c.fill();
    c.fillStyle = '#6d4c41'; c.fillRect(w * 0.13, h * 0.68, w * 0.04, h * 0.14);
    c.fillStyle = '#90a4ae'; c.fillRect(w * 0.7, h * 0.3, w * 0.14, h * 0.16);
    // কাচের দুই পাল্লা, অ্যালুমিনিয়াম ফ্রেম, প্রতিফলন
    c.fillStyle = 'rgba(150,200,230,0.28)'; c.fillRect(w * 0.04, top, w * 0.92, h - top);
    c.strokeStyle = '#cfd8dc'; c.lineWidth = 5;
    c.strokeRect(w * 0.04, top, w * 0.92, h - top);
    c.beginPath(); c.moveTo(w * 0.5, top); c.lineTo(w * 0.5, h); c.stroke();
    c.beginPath(); c.moveTo(w * 0.27, top); c.lineTo(w * 0.27, h); c.moveTo(w * 0.73, top); c.lineTo(w * 0.73, h); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (const x of [0.1, 0.36, 0.56, 0.8]) { c.beginPath(); c.moveTo(w * x, top); c.lineTo(w * (x + 0.06), top); c.lineTo(w * (x - 0.02), h); c.lineTo(w * (x - 0.08), h); c.fill(); }
    c.fillStyle = '#b0bec5'; c.fillRect(w * 0.46, h * 0.5, w * 0.025, h * 0.18); c.fillRect(w * 0.515, h * 0.5, w * 0.025, h * 0.18);
    c.fillStyle = '#c0161c'; c.font = `700 ${h * 0.07}px ${FONT}`; c.textAlign = 'center'; c.fillText('ধাক্কা দিন', w * 0.385, h * 0.45); c.fillText('টানুন', w * 0.615, h * 0.45);
  } else if (kind === 'rest') {
    // মেনু বোর্ড, টেবিল-চেয়ার, কাউন্টারে খাবার
    c.fillStyle = '#263238'; c.fillRect(w * 0.3, top + h * 0.06, w * 0.4, h * 0.2);
    c.fillStyle = '#fff59d'; c.font = `700 ${h * 0.06}px ${FONT}`; c.textAlign = 'center';
    c.fillText('ভাত · মাছ · মাংস · ডাল', w * 0.5, top + h * 0.15); c.fillText('চা · পরোটা · ডিম', w * 0.5, top + h * 0.23);
    for (const x of [0.2, 0.5, 0.8]) {
      c.fillStyle = '#6d4c41'; c.fillRect(w * (x - 0.09), h * 0.62, w * 0.18, h * 0.05);
      c.fillRect(w * (x - 0.08), h * 0.67, w * 0.015, h * 0.2); c.fillRect(w * (x + 0.065), h * 0.67, w * 0.015, h * 0.2);
      c.fillStyle = FOLK[(seed + x * 10) % 8 | 0]; c.fillRect(w * (x - 0.13), h * 0.6, w * 0.03, h * 0.27); c.fillRect(w * (x + 0.1), h * 0.6, w * 0.03, h * 0.27);
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(w * x, h * 0.61, w * 0.03, h * 0.015, 0, 0, 7); c.fill();
    }
  } else if (kind === 'shop' && type && type !== 'grocery' && shopGoods(c, w, h, type, top, R)) {
    // ধরন অনুযায়ী মাল আঁকা হয়েছে
  } else {
    // তাক ভর্তি রঙিন মাল
    const shelfC = kind === 'dark' ? '#4e342e' : '#8a6a4a';
    for (let r = 0; r < 4; r++) {
      const y = top + h * (0.08 + r * 0.17);
      c.fillStyle = shelfC; c.fillRect(w * 0.06, y + h * 0.13, w * 0.88, h * 0.025);
      for (let x = w * 0.07; x < w * 0.92;) {
        const bw = w * (0.025 + R() * 0.04), bh = h * (0.06 + R() * 0.07);
        c.fillStyle = kind === 'dark' ? ['#111', '#333', '#5d4037', '#222'][R() * 4 | 0] : FOLK[R() * 8 | 0];
        c.fillRect(x, y + h * 0.13 - bh, bw - 2, bh);
        if (R() < 0.5) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x + 2, y + h * 0.13 - bh * 0.7, bw - 6, bh * 0.15); }
        x += bw;
      }
    }
    // ঝুলন্ত চিপসের প্যাকেট
    if (kind !== 'dark') for (let i = 0; i < 2; i++) {
      const x0 = i ? w * 0.86 : w * 0.06;
      for (let k = 0; k < 4; k++) { c.fillStyle = FOLK[(k + i * 3 + seed) % 8]; c.fillRect(x0, top + h * (0.05 + k * 0.1), w * 0.07, h * 0.085); }
    }
    // সামনে কাউন্টার, তার ওপর কাচের বয়াম
    c.fillStyle = kind === 'dark' ? '#3e2723' : '#6d4c41'; c.fillRect(w * 0.22, h * 0.72, w * 0.56, h * 0.28);
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(w * 0.22, h * 0.72, w * 0.56, h * 0.03);
    if (kind !== 'dark') for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(200,230,255,0.6)'; c.fillRect(w * (0.25 + i * 0.085), h * 0.62, w * 0.06, h * 0.1);
      c.fillStyle = FOLK[(i + seed) % 8]; c.fillRect(w * (0.255 + i * 0.085), h * 0.66, w * 0.05, h * 0.055);
    }
  }
  // ঝুলন্ত বাল্ব
  if (kind !== 'glass') {
    c.strokeStyle = '#222'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(w * 0.5, top); c.lineTo(w * 0.5, top + h * 0.08); c.stroke();
    const g = c.createRadialGradient(w * 0.5, top + h * 0.1, 1, w * 0.5, top + h * 0.1, h * 0.3);
    g.addColorStop(0, 'rgba(255,250,210,0.95)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g; c.fillRect(w * 0.2, top, w * 0.6, h * 0.45);
  }
  // গুটানো শাটার (উপরে)
  c.fillStyle = '#7d8a90'; c.fillRect(0, 0, w, top);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 3; y < top; y += 5) c.fillRect(0, y, w, 1.5);
  c.fillStyle = '#5a666c'; c.fillRect(0, top - 3, w, 3);
  // দুই পাশের দেয়ালের ধার
  c.fillStyle = '#8b8378'; c.fillRect(0, top, w * 0.04, h - top); c.fillRect(w * 0.96, top, w * 0.04, h - top);
}
