// সব টেক্সচার ক্যানভাসে আঁকা
import * as THREE from 'three';
import { canvasTex } from './lib3d.js';
import { pick, rand, freeAfterUpload } from './utils.js';

export const FONT = '"Hind Siliguri", "Noto Sans Bengali", "Nirmala UI", sans-serif';

function grain(g, w, h, amt) {
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}
export function fitText(g, text, x, y, maxW, size, weight = 700) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = `${weight} ${s}px ${FONT}`; }
  g.fillText(text, x, y);
}

// রাস্তা: টাইলের চওড়া = রাস্তার চওড়া, দৈর্ঘ্য ১৬ মি (u = আড়াআড়ি, v = লম্বালম্বি)
function road(lanes, main) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = main ? '#3a3a3e' : '#45454a';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 28);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.6 ? '20,20,20' : '90,88,82'},${rand(0.1, 0.25)})`;
      g.beginPath();
      g.ellipse(rand(0, w), rand(0, h), rand(6, 30), rand(4, 18), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(235,235,215,0.75)';
    g.fillRect(6, 0, 4, h);
    g.fillRect(w - 10, 0, 4, h);
    if (main) {
      g.fillStyle = 'rgba(240,200,40,0.85)';
      g.fillRect(w / 2 - 5, 0, 3, h);
      g.fillRect(w / 2 + 2, 0, 3, h);
      g.fillStyle = 'rgba(235,235,215,0.7)';
      for (let y = 0; y < h; y += 64) { g.fillRect(w * 0.25 - 2, y + 8, 4, 30); g.fillRect(w * 0.75 - 2, y + 8, 4, 30); }
    } else {
      g.fillStyle = 'rgba(235,235,215,0.7)';
      for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y + 8, 4, 30);
    }
  }, true);
}
function plainAsphalt() {
  // পুরোনো ঢাকার পিচ: দানা, তালি, ফাটল, ছোট গর্তের ছাপ
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#585a5e';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 34);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.55 ? '38,39,42' : '115,116,118'},${rand(0.06, 0.18)})`;
      g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(10, 48), rand(8, 32), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(48,49,52,${rand(0.28, 0.45)})`; g.fillRect(rand(0, w - 70), rand(0, h - 50), rand(28, 72), rand(18, 48)); }
    // ফাটল
    g.strokeStyle = 'rgba(20,20,22,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const x = rand(10, w - 10), y = rand(10, h - 10);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x + rand(-28, 28), y + rand(-8, 40));
      g.stroke();
    }
    // গর্তের গাঢ় দাগ
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(25,25,28,${rand(0.35, 0.55)})`;
      g.beginPath(); g.ellipse(rand(20, w - 20), rand(20, h - 20), rand(6, 16), rand(4, 11), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
  }, true);
}
function zebra() {
  return canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(240,240,230,0.85)';
    for (let x = 4; x < w; x += 16) g.fillRect(x, 0, 8, h);
  });
}
function paving() {
  // ইট বসানো ফুটপাত: লাল-পোড়ামাটি, ধূসর আর বেলে ইট, মাঝে চুন-সুরকির দাগ; লম্বা ইটের সারি একটু সরে সরে
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8377';
    g.fillRect(0, 0, w, h);
    const RED = ['#b4553d', '#a64a34', '#c0654a', '#9c4431', '#b85f47'], GREY = ['#8e8b86', '#a19d97', '#7f7c78'], SAND = ['#cfb38e', '#c2a27b'];
    const bw = 32, bh = 16;
    for (let r = 0; r < h / bh; r++) {
      const band = Math.floor(r / 3) % 4; // সারির দল: লাল, লাল, ধূসর, বেলে মেশানো
      for (let k = -1; k < w / bw + 1; k++) {
        const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
        const pal = band === 2 ? (Math.random() < 0.7 ? GREY : RED) : band === 3 ? (Math.random() < 0.5 ? SAND : RED) : (Math.random() < 0.85 ? RED : GREY);
        g.fillStyle = pick(pal);
        g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1.5, y + 1.5, bw - 3, 2);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 1.5, y + bh - 3.5, bw - 3, 2);
      }
    }
    grain(g, w, h, 18);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(50,40,30,${rand(0.05, 0.14)})`; g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(8, 30), rand(6, 20), rand(0, 3), 0, Math.PI * 2); g.fill(); }
  }, true);
}
function grass() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f7f3a';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 30);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,60,20' : '140,130,70'},${rand(0.08, 0.2)})`;
      g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(8, 40), rand(6, 26), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
  }, true);
}
function dirtLot() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8574';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 30);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(60,55,45,${rand(0.08, 0.2)})`;
      g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(10, 50), rand(8, 30), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
  }, true);
}
function water() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3f6f6a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(200,230,230,${rand(0.08, 0.25)})`;
      g.lineWidth = rand(1, 2.5);
      const x = rand(0, w), y = rand(0, h), l = rand(10, 40);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
    }
  }, true);
}
// রাতে জ্বলা জানালা: দেয়ালের টেক্সচারের জানালার জায়গায় আলো (কিছু জ্বলে, কিছু নেভা)
function windowGlow(kind) {
  return canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      if (kind === 'glass') {
        for (let x = 4; x < w - 8; x += 42) {
          if (Math.random() < 0.45) continue;
          g.fillStyle = pick(['#c8d8ff', '#ffe9b0', '#f4f4ff']);
          g.fillRect(x + 3, 18 + r * 96, 39, 66);
        }
        continue;
      }
      for (let k = 0; k < 4; k++) {
        if (Math.random() < 0.42) continue;
        const x = 10 + k * 64, y = 24 + r * 96;
        g.fillStyle = pick(['#ffd98a', '#ffe6b0', '#e8f4ff', '#fff1c4', '#ffc070']); // টিউবলাইট আর হলুদ বাতি
        g.fillRect(x, y, 44, 50);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        for (let gx = x + 5; gx < x + 44; gx += 8) g.fillRect(gx, y, 2, 50); // গ্রিল
      }
    }
  }, true);
}
// বিল্ডিংয়ের দেয়াল: এক টাইল ৮ মি × ১২ মি (৪ তলা)
function facade(wall, kind) {
  const t = facadeTex(wall, kind);
  t.userData.glow = windowGlow(kind);
  return t;
}
function facadeTex(wall, kind) {
  return canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 14);
    for (let i = 0; i < 6; i++) {
      const x = rand(0, w);
      const gr = g.createLinearGradient(x, 0, x, rand(80, h));
      gr.addColorStop(0, 'rgba(40,40,35,0.2)');
      gr.addColorStop(1, 'rgba(40,40,35,0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, rand(3, 10), h);
    }
    for (let r = 0; r < 4; r++) {
      if (kind === 'glass') {
        g.fillStyle = pick(['#30485e', '#3a556b', '#2b3f52']);
        g.fillRect(4, 18 + r * 96, w - 8, 66);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(4, 18 + r * 96, w - 8, 10);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (let x = 4; x < w; x += 42) g.fillRect(x, 18 + r * 96, 3, 66);
        continue;
      }
      for (let k = 0; k < 4; k++) {
        const x = 10 + k * 64, y = 24 + r * 96;
        g.fillStyle = pick(['#26303a', '#2f3a45', '#3a4650', '#4d5d6a']);
        g.fillRect(x, y, 44, 50);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x, y, 44, 8);
        if (Math.random() < 0.35) {
          g.fillStyle = pick(['rgba(160,40,60,0.85)', 'rgba(40,110,80,0.85)', 'rgba(230,200,120,0.85)', 'rgba(220,220,220,0.85)']);
          g.fillRect(x, y, 44 * rand(0.3, 0.6), 50);
        }
        g.fillStyle = 'rgba(15,15,15,0.7)';
        for (let gx = x + 5; gx < x + 44; gx += 8) g.fillRect(gx, y, 2, 50);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x - 6, y + 56, 56, 6);
        if (Math.random() < 0.2) {
          g.fillStyle = pick(['#d64545', '#3b78c4', '#f2c230', '#e8e8e8']);
          g.fillRect(x + rand(0, 22), y + 52, 14, 16);
        }
        if (Math.random() < 0.15) {
          g.fillStyle = '#e8e8e8';
          g.fillRect(x + 30, y + 30, 14, 12); // এসি
        }
      }
    }
  }, true);
}
function roof() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8d877c';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 30);
  }, true);
}

const SIGN_STYLES = [
  ['#0b6b3a', '#ffffff'], ['#b3171f', '#fff3c4'], ['#11408f', '#ffffff'], ['#f2c230', '#2a1405'],
  ['#ffffff', '#c0161c'], ['#5a1f7a', '#ffe680'], ['#e85d1a', '#ffffff'], ['#1b1b1b', '#ffd400'],
];
const signCache = new Map();
export function signTex(text, style) {
  const key = text + '|' + style;
  if (signCache.has(key)) return signCache.get(key);
  let hsh = 0;
  for (let i = 0; i < text.length; i++) hsh = (hsh * 31 + text.charCodeAt(i)) | 0;
  const [bg, fg] = style === 'road' ? ['#0d6b3c', '#ffffff'] : style === 'police' ? ['#14306b', '#ffffff'] : style === 'hospital' ? ['#ffffff', '#c62828'] : style === 'gun' ? ['#1b1b1b', '#ffb627'] : SIGN_STYLES[Math.abs(hsh) % SIGN_STYLES.length];
  const t = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.globalAlpha = 0.6;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.globalAlpha = 1;
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, text, w / 2, h / 2 + 4, w - 40, 64);
  });
  signCache.set(key, t);
  return t;
}
// যানবাহনের গায়ের লেখা: বাসের নাম-রুট, সিএনজির পিছনের কথা, নম্বর প্লেট
const paintCache = new Map();
export function paintTex(text, sub, bg, fg, w = 512, h = 128) {
  const key = [text, sub, bg, fg, w, h].join('|');
  if (paintCache.has(key)) return paintCache.get(key);
  const t = canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (sub) {
      fitText(g, text, w / 2, h * 0.36, w - 24, h * 0.42);
      fitText(g, sub, w / 2, h * 0.76, w - 24, h * 0.3);
    } else fitText(g, text, w / 2, h / 2 + 3, w - 24, h * 0.62);
  });
  freeAfterUpload(t);
  paintCache.set(key, t);
  return t;
}
function beam() {
  return canvasTex(32, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
function blob() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

export function buildTextures() {
  const walls = ['#d9cdb4', '#c2cdb6', '#d4b4a2', '#b4bcc4', '#e2d8c0', '#a9b8a4', '#d8bc94'];
  return {
    roadLocal: road(2, false),
    roadMain: road(4, true),
    asphalt: plainAsphalt(),
    zebra: zebra(),
    paving: paving(),
    grass: grass(),
    lot: dirtLot(),
    water: water(),
    facades: walls.map((c) => facade(c, 'res')),
    glass: [facade('#5a6672', 'glass'), facade('#6d7a86', 'glass')],
    roof: roof(),
    beam: beam(),
    // কার্ব: লাল-সাদা ডোরা; ডিভাইডার: কালো-সাদা
    curb: canvasTex(64, 8, (g) => { g.fillStyle = '#c62828'; g.fillRect(0, 0, 32, 8); g.fillStyle = '#f2f0ea'; g.fillRect(32, 0, 32, 8); }, true),
    curbBW: canvasTex(64, 8, (g) => { g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, 32, 8); g.fillStyle = '#efeee8'; g.fillRect(32, 0, 32, 8); }, true),
    medTop: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d9d4c8'; g.fillRect(0, 0, w, h); grain(g, w, h, 14); }, true),
    curbGray: canvasTex(64, 8, (g, w, h) => { g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, w, h); grain(g, w, h, 18); }, true),
    blob: blob(),
    // গ্রিটি ডেকাল (InstancedMesh-এ ব্যবহার)
    pothole: canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(18,18,20,0.85)'; g.beginPath(); g.ellipse(32, 34, 22, 14, 0.2, 0, 7); g.fill();
      g.fillStyle = 'rgba(55,52,48,0.7)'; g.beginPath(); g.ellipse(30, 30, 14, 9, -0.3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(10,10,10,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 28); g.quadraticCurveTo(40, 18, 52, 36); g.stroke();
    }),
    paan: canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `rgba(${140 + i * 8},${20 + i * 4},${35},${0.55 - i * 0.07})`;
        g.beginPath(); g.ellipse(28 + i * 3, 30 + i * 2, 10 - i, 7 - i * 0.6, i * 0.4, 0, 7); g.fill();
      }
    }),
    moss: canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(${30 + Math.random() * 40},${80 + Math.random() * 50},${25},${rand(0.25, 0.55)})`;
        g.beginPath(); g.ellipse(rand(4, 60), rand(20, 60), rand(4, 12), rand(3, 8), rand(0, 3), 0, 7); g.fill();
      }
      for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(60,45,30,${rand(0.15, 0.35)})`; g.beginPath(); g.ellipse(rand(0, 64), rand(40, 64), rand(6, 14), rand(3, 7), 0, 0, 7); g.fill(); }
    }),
  };
}
