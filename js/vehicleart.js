// যানবাহনের সাজ: রিকশা-ট্রাকের আঁকা ছবি, বাসের রঙ, ঝালর, স্টিকার। সব এক অ্যাটলাসে, এক ম্যাটেরিয়ালে।
import * as THREE from 'three';
import { Atlas, cellPlane, rickshawArt, hoodArt, truckArt, truckCrown, busLivery, sticker, FOLK, shade } from './art.js';
import { FONT } from './textures.js';

let A = null, MAT = null;
const C = {};
const HOODS = ['#c0161c', '#1d63c8', '#0f7a3d', '#6b1f7a', '#e0157a'];
export const LIVERY = [['#b32020', '#ffd400', '#1b1b1b'], ['#1e7a3c', '#ffffff', '#ffd400'], ['#1c4e9a', '#ff7a00', '#ffffff'], ['#d9d4c6', '#c0161c', '#1d63c8'], ['#6a1b9a', '#ffd400', '#00a8a8'], ['#ff7a00', '#1b1b1b', '#ffffff'], ['#e8508a', '#a3175a', '#ffffff']]; // শেষেরটা গোলাপি বাস
const TRUCK = ['#1a9e3f', '#c0161c', '#1d63c8', '#ff7a00'];
const STICK = [['সিটিং সার্ভিস', '#ffd400', '#c0161c'], ['গেইট লক', '#c0161c', '#ffffff'], ['মহিলা আসন ৯টি', '#ffffff', '#1d63c8'], ['ধূমপান নিষেধ', '#ffffff', '#c0161c'], ['লোকাল', '#1b1b1b', '#ffd400'], ['ওভারটেকিং নিষেধ', '#ffd400', '#1b1b1b']];
const CROWN = ['আল্লাহর দান', 'মায়ের দোয়া', 'সোনার বাংলা', 'বাবার দোয়া'];
const DECAL = [['যাত্রী সেবাই আমাদের লক্ষ্য', '#1a9e3f', '#ffffff'], ['ধীরে চলুন · নিরাপদে থাকুন', '#c0161c', '#ffffff'], ['মিরপুর লাইন', '#1d63c8', '#ffd400'], ['জীবনের চেয়ে সময় বড় নয়', '#ff7a00', '#1b1b1b']];

function init() {
  if (A) return;
  A = new Atlas(2048, 2048);
  C.bus = LIVERY.map(([a, b, c]) => A.add(1000, 200, (g, w, h) => busLivery(g, w, h, a, b, c)));
  C.truck = TRUCK.map((b) => A.add(1000, 200, (g, w, h) => truckArt(g, w, h, b)));
  C.rick = ['village', 'birds', 'flowers', 'city', 'peacock', 'boat', 'flowers', 'birds'].map((sc, i) => A.add(384, 192, (g, w, h) => rickshawArt(g, w, h, sc, ['আল্লাহ ভরসা', 'মায়ের দোয়া', 'যাবেন? চলেন!', 'সাবধানে বসুন', 'ভাড়া ঠিক তো?', null, 'বাবার দোয়া', null][i])));
  C.hood = HOODS.map((b) => A.add(256, 192, (g, w, h) => hoodArt(g, w, h, b)));
  C.crown = CROWN.map((t) => A.add(512, 96, (g, w, h) => truckCrown(g, w, h, t)));
  C.stick = STICK.map(([t, b, f]) => A.add(256, 64, (g, w, h) => sticker(g, w, h, t, b, f)));
  C.decal = DECAL.map(([t, b, f]) => A.add(512, 80, (g, w, h) => {
    g.fillStyle = b; g.fillRect(0, h * 0.18, w, h * 0.64);
    g.fillStyle = shade(b, 0.35); g.fillRect(0, h * 0.18, w, h * 0.08); g.fillRect(0, h * 0.74, w, h * 0.08);
    g.fillStyle = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${h * 0.4}px ${FONT}`;
    let s = h * 0.4; while (g.measureText(t).width > w - 30 && s > 10) { s -= 2; g.font = `700 ${s}px ${FONT}`; }
    g.fillText(t, w / 2, h / 2 + 2);
  }));
  // ঝালর: স্বচ্ছ ফাঁকে রঙিন সুতা, নিচে পুঁতি
  C.fringe = [0, 1, 2].map((k) => A.add(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = FOLK[k]; g.fillRect(0, 0, w, h * 0.22);
    for (let x = 3; x < w; x += 8) {
      const col = FOLK[(x / 8 + k) % (FOLK.length - 1) | 0];
      g.fillStyle = col; g.fillRect(x, h * 0.2, 3, h * (0.55 + ((x * 7) % 5) * 0.06));
      g.beginPath(); g.arc(x + 1.5, h * (0.8 + ((x * 7) % 5) * 0.03), 3.2, 0, 7); g.fill();
    }
  }));
  // হাতলের প্লাস্টিকের ফুল
  C.bloom = A.add(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillStyle = FOLK[i % 6]; g.beginPath(); g.ellipse(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 12, 7, a, 0, 7); g.fill(); }
    g.fillStyle = '#ffd400'; g.beginPath(); g.arc(32, 32, 8, 0, 7); g.fill();
  });
  const tex = A.texture();
  MAT = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
}
const pickI = (n) => Math.floor(Math.random() * n);
// গাড়ির গায়ে ছবি: (x,y,z) কেন্দ্র, ry ঘোরা
export function art(g, kind, i, w, h, x, y, z, ry = 0, rx = 0) {
  init();
  const L = C[kind];
  const cell = Array.isArray(L) ? L[(i ?? pickI(L.length)) % L.length] : L;
  const m = new THREE.Mesh(cellPlane(w, h, cell), MAT);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  m.userData.noShadow = true;
  g.add(m);
  return m;
}
export const artCount = (kind) => { init(); return C[kind].length; };
export const vehAtlas = () => { init(); return A; };
