// যানবাহন: মডেল আর চালানোর ফিজিক্স (সামনের দিক -Z, চাকা মাটিতে y = 0)
import * as THREE from 'three';
import { lam, bas, addBox, addCyl, addPlane, texMat, dyn, mergeStatic, setShadows } from './lib3d.js';
import { paintTex } from './textures.js';
import { dentArray } from './dent.js';
import { canvasTex } from './lib3d.js';
import { bn } from './utils.js';
import { art, LIVERY } from './vehicleart.js';
import { VM, attachModel } from './vmodels.js';
import { FOOT } from './mapgen.js';

// ঢাকার বাস: আসলের মতো শোনায় এমন মজার নাম, আসল এলাকার রুট
// ঢাকার বাসের নাম (মিরপুরের রুটে চলা পরিচিত কোম্পানি) আর রুট
const BUS_CO = ['বিকাশ পরিবহন', 'শিকড় পরিবহন', 'বিহঙ্গ পরিবহন', 'প্রজাপতি পরিবহন', 'পরিস্থান পরিবহন', 'আলিফ পরিবহন', 'দিশারী পরিবহন', 'বসুমতি পরিবহন', 'মিডলাইন পরিবহন', 'তানজিল পরিবহন', 'অছিম পরিবহন', 'রাজধানী পরিবহন', 'ভিআইপি পরিবহন', 'ট্রান্স সিলভা', 'আয়াত পরিবহন', 'নূর-এ-মক্কা', 'ঠিকানা এক্সপ্রেস', 'বিআরটিসি'];
const BUS_ROUTE = [['মিরপুর ১২', 'মতিঝিল'], ['মিরপুর ১০', 'গুলিস্তান'], ['মিরপুর ১', 'সদরঘাট'], ['মিরপুর ১৪', 'যাত্রাবাড়ী'], ['পল্লবী', 'আজিমপুর'], ['গাবতলী', 'মতিঝিল'], ['মিরপুর ১০', 'উত্তরা'], ['মিরপুর ২', 'বাড্ডা'], ['কালশী', 'মতিঝিল'], ['মিরপুর ১১', 'মোহাম্মদপুর']];
// সিএনজি আর রিকশার পিছনের লেখা
export const CNG_BACK = ['মায়ের দোয়া', 'বাবার দোয়া', 'চাচা আসছি', 'ধীরে চলুন, বাড়িতে কেউ অপেক্ষায়', 'মিটার নষ্ট, মন ভালো', 'জ্যাম আমার বন্ধু', 'পিছনে তাকাইয়েন না', 'ওভারটেক করলে খবর আছে', 'হর্ন দিন, রাস্তা না', 'যাবেন না? থাক!', '১০০ টাকা কম হবে না', 'আল্লাহ ভরসা'];
export const RICK_BACK = ['আল্লাহ ভরসা', 'যাবেন? চলেন!', 'সাবধানে বসুন', 'ভাড়া ঠিক তো?', 'মায়ের দোয়া', 'বাবার দোয়া', 'হর্ন দিবেন না, ঘুমাই', 'ধাক্কা দিলে খবর আছে', 'ভাংতি নাই', 'চালক ক্লান্ত, ভাড়া বেশি', 'পিছনে তাকাইয়া লাভ নাই', 'জীবন একটাই, রিকশাও একটা', 'চলে আমার রিকশা হাওয়ার বেগে'];
const PLATE_SERIES = ['গ', 'খ', 'ঘ', 'চ', 'ঠ', 'হ'];
function plateText() {
  const n = () => bn(Math.floor(10 + Math.random() * 89));
  return [`ঢাকা মেট্রো-${pick(PLATE_SERIES)}`, `${n()}-${bn(Math.floor(1000 + Math.random() * 8999))}`];
}
// নম্বর প্লেট: পিছনে (+z) মুখ করা
export function plate(g, x, y, z, w = 0.5, kind = 'plain') {
  const [a, b] = kind === 'police' ? ['পুলিশ', `${bn(Math.floor(10 + Math.random() * 89))}-${bn(Math.floor(1000 + Math.random() * 8999))}`] : plateText();
  addPlane(g, w, w * 0.32, texMat(paintTex(a, b, '#f6f6f2', '#111111', 256, 82)), x, y, z, 0);
}
import { pick, clamp, damp, rand } from './utils.js';

// seat = চালকের বসার জায়গা (কোমর), door = নামার জায়গা (ডান পাশে, বাংলাদেশে চালক ডানে বসে)
export const SPECS = {
  car: {
    name: 'প্রাইভেট কার', max: 33.3, accel: 8, brake: 11, rev: 5, turn: 1.25, len: 4.3, wid: 1.8, r: 0.95,
    circles: [-1.35, 0, 1.35], seat: { x: 0.38, y: 0.42, z: 0.25 }, pose: 'drive', door: { x: 1.7, z: 0.2 },
    pass: { x: -0.38, y: 0.42, z: 0.25 }, passPose: 'sit', engine: 'car', fare: 1.4,
  },
  cng: {
    name: 'সিএনজি', max: 19.4, accel: 5.8, brake: 8.2, rev: 3, turn: 1.85, len: 2.6, wid: 1.4, r: 0.75,
    circles: [-0.75, 0.6], seat: { x: 0, y: 0.62, z: -0.45 }, pose: 'drive', door: { x: 1.3, z: -0.45 },
    pass: { x: 0, y: 0.64, z: 0.62 }, passPose: 'sit', engine: 'cng', fare: 1.1,
  },
  bike: {
    name: 'মোটরবাইক', max: 36.1, accel: 10.5, brake: 12, rev: 2, turn: 1.9, len: 1.9, wid: 0.7, r: 0.45,
    circles: [-0.5, 0.5], seat: { x: 0, y: 0.78, z: 0.15 }, pose: 'bike', door: { x: 1.0, z: 0 },
    pass: { x: 0, y: 0.82, z: 0.62 }, passPose: 'bike', engine: 'bike', fare: 0.9,
  },
  rickshaw: {
    name: 'রিকশা', max: 6, accel: 1.6, brake: 5.5, rev: 1, turn: 1.95, len: 2.4, wid: 1.2, r: 0.65,
    circles: [-0.6, 0.55], seat: { x: 0, y: 1.0, z: -0.4 }, pose: 'pedal', door: { x: 1.1, z: -0.3 },
    pass: { x: 0, y: 1.2, z: 0.55 }, passPose: 'sit', engine: 'rickshaw', fare: 0.8,
  },
  police: {
    name: 'পুলিশের গাড়ি', max: 37, accel: 9.5, brake: 13, rev: 6, turn: 1.35, len: 4.3, wid: 1.8, r: 0.95,
    circles: [-1.35, 0, 1.35], seat: { x: 0.38, y: 0.42, z: 0.25 }, pose: 'drive', door: { x: 1.7, z: 0.2 },
    pass: null, engine: 'car', fare: 0,
  },
  ambulance: {
    name: 'অ্যাম্বুলেন্স', max: 26, accel: 6.5, brake: 11, rev: 4, turn: 1.15, len: 5.2, wid: 2.0, r: 1.05,
    circles: [-1.7, 0, 1.7], seat: { x: 0.45, y: 0.6, z: -1.2 }, pose: 'drive', door: { x: 1.8, z: -1.2 },
    pass: null, engine: 'car', fare: 0,
  },
  bus: {
    name: 'বাস', max: 18.5, accel: 2.8, brake: 5.5, rev: 0.8, turn: 0.72, len: 10, wid: 2.5, r: 1.3,
    circles: [-3.6, -1.2, 1.2, 3.6], seat: { x: 0.8, y: 1.3, z: -4.2 }, pose: 'drive', door: { x: 2, z: -3.5 },
    pass: null, engine: 'bus', fare: 0,
  },
};

// GTA V-এর মতো: গাড়ি সামনে-পিছনে ধাক্কায় উল্টায় না, দুমড়ে যায় (স্বাস্থ্য কমে)।
// উল্টায় শুধু খুব জোরে পাশ থেকে ধাক্কা খেলে, বাসের ধাক্কায়, বা খুব জোরে তীক্ষ্ণ বাঁক নিলে।
// বাইক-রিকশা জোরে ধাক্কায় কাত হয়ে পড়ে, চালক ছিটকে যায়।
VM.specs = SPECS;
export const THROW = { bike: 8, rickshaw: 5 }; // দেয়ালে এর বেশি জোরে লাগলে (মি/সে)
export const SIDE_FLIP = { bike: 6, rickshaw: 3.6, cng: 10.5, car: 25, police: 27, ambulance: 23, bus: 999 }; // পাশের ধাক্কা (মি/সে)
export const TURN_FLIP = { cng: 10.2, rickshaw: 3.6, ambulance: 23, car: 29.5, police: 31 }; // সিএনজি/রিকশা: তীক্ষ্ণ বাঁকে সহজে উল্টে
// কতটা মার সইতে পারে
export const HP = { bike: 60, rickshaw: 45, cng: 80, car: 100, police: 130, ambulance: 130, bus: 240 };
const BURNT = new THREE.MeshLambertMaterial({ color: 0x1e1c1a });
// প্রাইভেট কারের রং: সাদা-রুপালি বেশি হলেও লাল, নীল, সবুজ, হলুদ, কমলা, মেরুন, বেগুনি সবই আছে
const CAR_COLS = [0xf4f4f4, 0xc9ced6, 0x2c2c2c, 0xc62828, 0x1e4fa8, 0x8b1e1e, 0x2e7d32, 0xf2b705, 0xe8681a, 0x5aa7d8, 0x6a3fa0, 0x1d2a44, 0xb8a27a, 0x7a7a72, 0xd81b60, 0x00897b];
// স্টিয়ারিংয়ের মাপ: r ব্যাসার্ধ, dy/dz কোমরের (সিট) থেকে উপরে/সামনে, tilt খাড়া থেকে কতটা হেলানো
const STEER = {
  car: { r: 0.18, dy: 0.42, dz: -0.46, tilt: 0.45 }, police: { r: 0.18, dy: 0.42, dz: -0.46, tilt: 0.45 },
  ambulance: { r: 0.19, dy: 0.44, dz: -0.5, tilt: 0.6 }, bus: { r: 0.24, dy: 0.4, dz: -0.5, tilt: 1.05 }, dd: { r: 0.24, dy: 0.4, dz: -0.5, tilt: 1.05 },
};
let STEER_M = null;
let BUILD_DD = false; // পরের বাসটা দোতলা কিনা (হালকা মডেলের রং-নাম ঠিক করতে)
const PAINT = new Map(); // ভাগ করা উপাদান → গাড়ির চকচকে কপি
// রাতে হেডলাইটের আলো রাস্তায় (সব গাড়ির জন্য একটাই উপাদান, sky.js আলো বাড়ায়-কমায়)
export const HEAD_BEAM = new THREE.MeshBasicMaterial({
  map: canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,236,190,0.55)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // দুই পাশে মিলিয়ে যাওয়া
    const sd = g.createLinearGradient(0, 0, w, 0);
    sd.addColorStop(0, 'rgba(0,0,0,1)'); sd.addColorStop(0.3, 'rgba(0,0,0,0)'); sd.addColorStop(0.7, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = sd; g.fillRect(0, 0, w, h);
  }),
  transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
});
HEAD_BEAM.visible = false;
const beamGeo = {};
// টোল কতটা গভীর হতে পারে (মি)
const MAX_DENT = { bike: 0.12, rickshaw: 0.22, cng: 0.32, car: 0.42, police: 0.42, ambulance: 0.45, bus: 0.6 };
// ভারী যানবাহন হালকাটাকে বেশি ঠেলে
// ভর: বাস/ট্রাক ভারী → সহজে থামে না, ছোট গাড়ি ছিটকে যায়; সিএনজি/রিকশা হালকা → উল্টে যায়
export const MASS = { bike: 1, rickshaw: 1.05, cng: 2.1, car: 4, police: 4.2, ambulance: 5.5, bus: 16 };
// উল্টালে মাটিতে বসানোর জন্য যানবাহনের উচ্চতা
export const TOP_H = { bike: 1.15, rickshaw: 2.0, cng: 1.75, car: 1.5, police: 1.7, ambulance: 2.6, bus: 3.0 };

// পিছনের বাতির উচ্চতা
const LAMP_Y = { car: 0.82, police: 0.74, cng: 0.72, bike: 0.8, bus: 0.95, truck: 0.95, ambulance: 0.95, pickup: 0.85, van: 0, easybike: 0.7, leguna: 0.8, autorickshaw: 0.7 };
const LAMP_GEO = new THREE.PlaneGeometry(1, 1);
// খোলা/চলন্ত দরজা: থেমে থাকা গাড়িরও প্রতি ফ্রেমে নড়ে (main থেকে tickDoors)
const DOORS = new Set();
export function tickDoors(dt) {
  for (const v of DOORS) { v.updateDoor(dt); if (v.door.a === v.door.target) DOORS.delete(v); }
  tickParts(dt);
}
// ধাক্কায় খুলে পড়া অংশ (দরজা, বাম্পার): ছিটকে পড়ে, রাস্তায় কিছুক্ষণ পড়ে থাকে
const PARTS = [];
function tickParts(dt) {
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const p = PARTS[i], o = p.o;
    p.life -= dt;
    if (p.life <= 0) { if (o.parent) o.parent.remove(o); PARTS.splice(i, 1); continue; }
    if (p.rest) continue;
    p.vy -= 15 * dt;
    o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt;
    o.rotation.x += p.wx * dt; o.rotation.z += p.wz * dt;
    if (o.position.y < p.h) {
      o.position.y = p.h;
      if (p.vy < -2) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.wx *= 0.4; p.wz *= 0.4; }
      else { p.rest = true; o.rotation.x = Math.round(o.rotation.x / (Math.PI / 2)) * (Math.PI / 2); o.rotation.z = Math.round(o.rotation.z / (Math.PI / 2)) * (Math.PI / 2); }
    }
  }
}
function throwPart(scene, o, vx, vy, vz, h) {
  scene.add(o);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.noDent = true; } });
  PARTS.push({ o, vx, vy, vz, wx: rand(-5, 5), wz: rand(-5, 5), h, life: 40, rest: false });
  while (PARTS.length > 30) { const q = PARTS.shift(); if (q.o.parent) q.o.parent.remove(q.o); }
}
// দরজা: নিচ-উপর উচ্চতা, লম্বা, সিটের কত সামনে কব্জা, রং (না দিলে গাড়ির রং)
const DOOR = {
  car: { y0: 0.34, y1: 1.4, len: 1.08, fwd: 0.55 },
  police: { y0: 0.33, y1: 1.42, len: 1.15, fwd: 0.55, color: 0xf4f4f4 },
  ambulance: { y0: 0.5, y1: 1.95, len: 0.95, fwd: 0.5, color: 0xf2f2f2 },
  pickup: { y0: 0.5, y1: 1.7, len: 1.05, fwd: 0.55 },
  truck: { y0: 1.0, y1: 2.45, len: 0.95, fwd: 0.5, color: 0x1f5fae },
};
const OPEN_SWAY = new Set(['bike', 'rickshaw', 'van']); // এগুলোর হেলা আলাদা
const SOFT = { bus: 1.4, truck: 1.3, cng: 1.3, ambulance: 1.2, leguna: 1.3, easybike: 1.2, autorickshaw: 1.2 }; // নরম স্প্রিং
let GLOW_M = null, CRACK = null;
function crackTex() {
  if (CRACK) return CRACK;
  CRACK = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7f8c90'; g.lineWidth = 1.4;
    for (let c = 0; c < 3; c++) {
      const cx = 40 + Math.random() * 176, cy = 40 + Math.random() * 176;
      for (let i = 0; i < 11; i++) { const a = Math.random() * 6.28, r = 40 + Math.random() * 110; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.5 + (Math.random() - 0.5) * 12, cy + Math.sin(a) * r * 0.5); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
      for (const rr of [14, 30, 52]) { g.beginPath(); g.arc(cx, cy, rr + Math.random() * 6, 0, 6.28); g.stroke(); }
    }
  });
  return CRACK;
}
// চাকার জায়গা টুকে রাখা (পাংচারের জন্য)
let CAP = null;
// আসল চাকার মতো: গোল কাঁধের টায়ার (লেদ), ভিতরে অ্যালয় রিম (৫ স্পোক) বা পাতলা চাকায় তারের স্পোক
const WGEO = new Map();
let TIRE_M = null, ALLOY_M = null, WIRE_M = null;
function rimTex(wire) {
  return canvasTex(128, 128, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    if (wire) {
      g.strokeStyle = '#c9ced3'; g.lineWidth = 1.2;
      for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 8, c + Math.sin(a) * 8); g.lineTo(c + Math.cos(a + 0.35) * 60, c + Math.sin(a + 0.35) * 60); g.stroke(); }
      g.lineWidth = 5; g.beginPath(); g.arc(c, c, 60, 0, 6.29); g.stroke();
      g.fillStyle = '#9aa0a6'; g.beginPath(); g.arc(c, c, 9, 0, 6.29); g.fill();
      return;
    }
    const gr = g.createRadialGradient(c, c, 4, c, c, 62); gr.addColorStop(0, '#e2e6ea'); gr.addColorStop(0.75, '#a9afb5'); gr.addColorStop(1, '#6d737a');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, 62, 0, 6.29); g.fill();
    // স্পোকের ফাঁক (ভিতরে অন্ধকার, পিছনে ব্রেক)
    g.fillStyle = '#1b1b1d';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.63;
      g.beginPath(); g.moveTo(c + Math.cos(a - 0.16) * 20, c + Math.sin(a - 0.16) * 20);
      g.arc(c, c, 54, a - 0.42, a + 0.42); g.lineTo(c + Math.cos(a + 0.16) * 20, c + Math.sin(a + 0.16) * 20); g.closePath(); g.fill();
    }
    g.strokeStyle = '#5b6168'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 61, 0, 6.29); g.stroke();
    g.fillStyle = '#c3c8cd'; g.beginPath(); g.arc(c, c, 13, 0, 6.29); g.fill();
    g.fillStyle = '#474c52'; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * 9, c + Math.sin(a) * 9, 2.2, 0, 6.29); g.fill(); }
  });
}
function wheelParts(r, w) {
  const key = r.toFixed(3) + ':' + w.toFixed(3);
  if (WGEO.has(key)) return WGEO.get(key);
  // টায়ারের প্রোফাইল (অক্ষ Y বরাবর, পরে ঘোরানো): রিমের কিনারা → কাঁধ গোল → ট্রেড → অন্য পাশ
  const ri = r * 0.64, pts = [];
  const sh = Math.min(w * 0.32, r * 0.18);
  pts.push(new THREE.Vector2(ri, -w / 2));
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.sin(a) * sh, -w / 2 + sh - Math.cos(a) * sh)); }
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(ri, w / 2));
  const tire = new THREE.LatheGeometry(pts, 22);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CircleGeometry(ri * 1.02, 22);
  const o = { tire, rim, ri };
  WGEO.set(key, o);
  return o;
}
export function wheel(g, r, w, x, y, z, list, dynWheel) {
  if (CAP) CAP.push({ x, y, z, r });
  if (!TIRE_M) {
    TIRE_M = lam(0x1d1d1f); TIRE_M.side = THREE.DoubleSide;
    ALLOY_M = new THREE.MeshLambertMaterial({ map: rimTex(false) });
    WIRE_M = new THREE.MeshLambertMaterial({ map: rimTex(true) });
  }
  const W = wheelParts(r, w), rimM = w < 0.09 ? WIRE_M : ALLOY_M;
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.add(new THREE.Mesh(W.tire, TIRE_M));
  // দুই পাশে রিমের মুখ (বাইরের দিকে তাকিয়ে)
  for (const sd of [-1, 1]) {
    const f = new THREE.Mesh(W.rim, rimM);
    f.position.x = sd * (w / 2 - 0.004);
    f.rotation.y = sd * Math.PI / 2;
    grp.add(f);
  }
  if (dynWheel) {
    g.add(dyn(grp));
    list.push(grp);
  } else {
    g.add(grp);
  }
}
// রিকশা আর্ট: হুডের নকশা, পিছনের আঁকা ছবি, ঝালর, হাতলে প্লাস্টিকের ফুল (রিকশা আর ব্যাটারি রিকশা দুটোতেই)
export function rickArt(g, hi) {
  for (const s of [-1, 1]) {
    art(g, 'hood', hi, 0.85, 0.9, s * 0.595, 1.78, 0.72, s * Math.PI / 2);
    art(g, 'hood', hi, 0.75, 0.4, s * 0.556, 0.98, 0.5, s * Math.PI / 2);
    art(g, 'bloom', 0, 0.17, 0.17, s * 0.3, 1.22, -0.95, 0);
  }
  art(g, 'hood', hi, 1.18, 0.9, 0, 1.78, 1.148, 0);
  art(g, 'rick', null, 1.0, 0.5, 0, 0.95, 0.955, 0);
  art(g, 'fringe', null, 1.18, 0.26, 0, 2.1, 0.29, 0);
  art(g, 'fringe', null, 1.05, 0.2, 0, 1.06, 0.115, 0);
}
const glass = () => { const m = new THREE.MeshLambertMaterial({ color: 0x9fc3e0, transparent: true, opacity: 0.35, depthWrite: false }); m.userData.glass = true; return m; };

// অন্য ফাইল থেকে নতুন যানবাহনের মডেল (হেলিকপ্টার, বিমান, স্পিডবোট)
export const BUILDERS = {};
function build(type, dynWheels) {
  CAP = [];
  const m = build0(type, dynWheels);
  m.tires = CAP; CAP = null;
  return m;
}
function build0(type, dynWheels) {
  if (BUILDERS[type]) return BUILDERS[type](dynWheels);
  const g = new THREE.Group();
  const wheels = [];
  let color = 0;
  if (type === 'car' || type === 'police') {
    color = type === 'police' ? 0xf2f2f2 : pick(CAR_COLS);
    const body = lam(color);
    addBox(g, 1.8, 0.55, 4.3, body, 0, 0.6, 0);
    addBox(g, 1.82, 0.12, 4.32, lam(0x222222), 0, 0.38, 0);
    addBox(g, 1.62, 0.08, 2.1, body, 0, 1.45, 0.25); // ছাদ
    for (const [x, z] of [[-0.78, -0.82], [0.78, -0.82], [-0.78, 1.28], [0.78, 1.28], [-0.78, 0.25], [0.78, 0.25]]) addBox(g, 0.07, 0.55, 0.08, body, x, 1.15, z);
    const gl = glass();
    const w1 = addBox(g, 1.55, 0.55, 0.05, gl, 0, 1.15, -0.84); w1.rotation.x = -0.35;
    addBox(g, 1.55, 0.5, 0.05, gl, 0, 1.15, 1.32);
    addBox(g, 0.04, 0.5, 2.0, gl, -0.8, 1.15, 0.25);
    addBox(g, 0.04, 0.5, 2.0, gl, 0.8, 1.15, 0.25);
    addBox(g, 1.5, 0.08, 0.6, lam(0x1a1a1a), 0, 0.92, -0.55); // ড্যাশবোর্ড
    const sw = addCyl(g, 0.17, 0.17, 0.04, lam(0x111111), 0.38, 1.0, -0.38, 12); sw.rotation.x = 1.1; // স্টিয়ারিং
    addBox(g, 0.6, 0.12, 0.55, lam(0x5a4a3a), 0.38, 0.62, 0.3);
    addBox(g, 0.6, 0.12, 0.55, lam(0x5a4a3a), -0.38, 0.62, 0.3);
    addBox(g, 1.6, 0.12, 0.6, lam(0x5a4a3a), 0, 0.62, 1.1);
    for (const x of [-0.62, 0.62]) { addBox(g, 0.32, 0.14, 0.05, bas(0xfff6d6), x, 0.68, -2.16); addBox(g, 0.28, 0.12, 0.05, bas(0xd01818), x, 0.7, 2.16); }
    plate(g, 0, 0.55, 2.175, 0.5, type === 'police' ? 'police' : 'plain'); // নম্বর প্লেট
    // আয়না, দরজার দাগ আর হাতল, গ্রিল
    const blk = lam(0x1a1a1a), chrome = lam(0x9a9fa6);
    for (const s of [-1, 1]) {
      addBox(g, 0.2, 0.12, 0.07, blk, s * 0.99, 1.0, -0.72);
      for (const z of [-0.75, 0.3]) addBox(g, 0.02, 0.48, 0.02, blk, s * 0.905, 0.62, z);
      for (const z of [-0.35, 0.65]) addBox(g, 0.03, 0.03, 0.14, chrome, s * 0.915, 0.76, z);
    }
    addBox(g, 0.85, 0.16, 0.04, blk, 0, 0.66, -2.16);
    for (let i = 0; i < 3; i++) addBox(g, 0.8, 0.02, 0.045, chrome, 0, 0.61 + i * 0.05, -2.165);
    for (const [x, z] of [[-0.86, -1.35], [0.86, -1.35], [-0.86, 1.35], [0.86, 1.35]]) wheel(g, 0.33, 0.22, x, 0.33, z, wheels, dynWheels);
    if (type === 'police') {
      addBox(g, 1.84, 0.16, 4.2, lam(0x1a3f8a), 0, 0.72, 0); // নীল দাগ
      for (const s of [-1, 1]) addPlane(g, 1.4, 0.3, texMat(paintTex('পুলিশ', null, null, '#ffffff', 256, 56), { transparent: true }), s * 0.925, 0.95, 0.2, s * Math.PI / 2);
      addBox(g, 1.0, 0.1, 0.3, lam(0x222222), 0, 1.53, 0.2);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0x550000 }));
      red.position.set(-0.25, 1.64, 0.2);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0x000055 }));
      blue.position.set(0.25, 1.64, 0.2);
      g.add(dyn(red), dyn(blue));
      g.userData.lights = [red, blue];
      g.userData.lightCol = [[0xff2020, 0x550000], [0x2050ff, 0x000055]];
    }
  } else if (type === 'cng') {
    color = 0x1e8c3a;
    const body = lam(color), cage = lam(0x0f4a22);
    addBox(g, 1.3, 0.25, 2.4, lam(0x1b1d22), 0, 0.42, 0.05);
    addBox(g, 1.4, 0.5, 1.5, body, 0, 0.8, 0.45);
    addBox(g, 0.95, 0.75, 0.55, body, 0, 0.9, -0.95);
    addBox(g, 1.46, 0.1, 2.3, cage, 0, 1.95, 0.1);
    for (const [x, z] of [[-0.7, -0.75], [0.7, -0.75], [-0.7, 1.15], [0.7, 1.15], [-0.7, 0.2], [0.7, 0.2]]) addBox(g, 0.05, 0.9, 0.05, cage, x, 1.5, z);
    for (const y of [1.3, 1.65]) { addBox(g, 0.03, 0.03, 1.9, cage, -0.7, y, 0.2); addBox(g, 0.03, 0.03, 1.9, cage, 0.7, y, 0.2); }
    addBox(g, 1.1, 0.7, 0.05, glass(), 0, 1.5, -0.95);
    addBox(g, 0.6, 0.12, 0.4, lam(0x5a2a22), 0, 0.68, -0.45);
    addBox(g, 1.2, 0.14, 0.5, lam(0x5a2a22), 0, 0.72, 0.65);
    addBox(g, 0.7, 0.04, 0.04, lam(0x999999), 0, 1.15, -0.78); // হ্যান্ডেল
    addBox(g, 0.26, 0.14, 0.05, bas(0xfff6d6), 0, 0.95, -1.24);
    // পিছনের মজার লেখা আর নম্বর প্লেট
    addPlane(g, 1.3, 0.34, texMat(paintTex(pick(CNG_BACK), null, '#f2d230', '#7a0f0f', 512, 132)), 0, 1.25, 1.205, 0);
    // আয়না, পিছনের বাতি, ছাদের সামনে ঝালর, পাশে রঙিন দাগ
    for (const s of [-1, 1]) {
      addBox(g, 0.03, 0.3, 0.03, lam(0x1a1a1a), s * 0.55, 1.3, -1.0);
      addBox(g, 0.16, 0.11, 0.05, lam(0x1a1a1a), s * 0.62, 1.47, -1.0);
      addBox(g, 0.12, 0.1, 0.04, bas(0xd01818), s * 0.55, 0.8, 1.21);
      art(g, 'decal', null, 1.4, 0.22, s * 0.705, 0.82, 0.45, s * Math.PI / 2);
    }
    art(g, 'fringe', null, 1.3, 0.22, 0, 1.79, -0.74, 0);
    plate(g, 0, 0.72, 1.205, 0.46);
    wheel(g, 0.28, 0.16, 0, 0.28, -1.0, wheels, dynWheels);
    wheel(g, 0.28, 0.16, -0.66, 0.28, 0.95, wheels, dynWheels);
    wheel(g, 0.28, 0.16, 0.66, 0.28, 0.95, wheels, dynWheels);
  } else if (type === 'bike') {
    color = pick([0xc0161c, 0x111111, 0x1f4fa8, 0xd8d8d8]);
    addBox(g, 0.24, 0.32, 1.35, lam(color), 0, 0.68, 0);
    addBox(g, 0.34, 0.24, 0.5, lam(color), 0, 0.88, -0.25);
    addBox(g, 0.3, 0.1, 0.75, lam(0x111111), 0, 0.88, 0.32);
    addBox(g, 0.72, 0.04, 0.04, lam(0x999999), 0, 1.12, -0.6);
    const fork = addBox(g, 0.06, 0.6, 0.06, lam(0x888888), 0, 0.72, -0.68); fork.rotation.x = 0.35;
    addBox(g, 0.18, 0.14, 0.06, bas(0xfff6d6), 0, 1.0, -0.82);
    addBox(g, 0.14, 0.08, 0.04, bas(0xd01818), 0, 0.82, 0.72);
    wheel(g, 0.32, 0.1, 0, 0.32, -0.72, wheels, dynWheels);
    wheel(g, 0.32, 0.1, 0, 0.32, 0.72, wheels, dynWheels);
  } else if (type === 'rickshaw') {
    color = pick([0xf2c230, 0xe85d1a, 0x22a6b3, 0xd81b60]);
    const hood = pick([0xc0161c, 0x1f4fa8, 0x0f7a3d, 0x6b1f7a]);
    addBox(g, 1.15, 0.12, 0.85, lam(0x2a2a2a), 0, 0.72, 0.5);
    addBox(g, 1.1, 0.4, 0.75, lam(color), 0, 0.98, 0.5);
    addBox(g, 1.05, 0.12, 0.6, lam(0x7a1f3a), 0, 1.22, 0.5);
    addBox(g, 1.18, 0.9, 0.85, lam(hood), 0, 1.78, 0.72);
    addBox(g, 1.2, 0.1, 0.9, lam(color), 0, 2.27, 0.72);
    addBox(g, 1.0, 0.45, 0.05, lam(color), 0, 0.85, 0.92);
    rickArt(g, Math.floor(Math.random() * 5));
    addBox(g, 0.08, 0.08, 1.3, lam(0x333333), 0, 0.72, -0.3);
    addBox(g, 0.28, 0.08, 0.3, lam(0x5a2a22), 0, 1.0, -0.4); // চালকের সিট
    addBox(g, 0.55, 0.04, 0.04, lam(0x999999), 0, 1.15, -0.95);
    wheel(g, 0.36, 0.08, 0, 0.36, -0.95, wheels, dynWheels);
    wheel(g, 0.38, 0.08, -0.56, 0.38, 0.55, wheels, dynWheels);
    wheel(g, 0.38, 0.08, 0.56, 0.38, 0.55, wheels, dynWheels);
  } else if (type === 'ambulance') {
    color = 0xf4f4f4;
    addBox(g, 2.0, 0.4, 5.2, lam(0x2a2a2a), 0, 0.55, 0);
    addBox(g, 2.0, 1.25, 1.6, lam(color), 0, 1.2, -1.75);
    addBox(g, 2.02, 0.55, 1.2, lam(0x1a2430), 0, 1.45, -2.0); // সামনের কাচ
    addBox(g, 2.04, 1.95, 3.5, lam(color), 0, 1.6, 0.8);
    addBox(g, 2.06, 0.25, 5.0, lam(0xc62828), 0, 1.05, 0.1); // লাল দাগ
    for (const s of [-1, 1]) {
      // দুই পাশে লাল যোগ চিহ্ন
      addBox(g, 0.04, 0.7, 0.22, lam(0xc62828), s * 1.04, 1.85, 0.9);
      addBox(g, 0.04, 0.22, 0.7, lam(0xc62828), s * 1.04, 1.85, 0.9);
    }
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: 0x550000 }));
    r1.position.set(-0.4, 2.66, -0.7);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: 0x555555 }));
    r2.position.set(0.4, 2.66, -0.7);
    g.add(dyn(r1), dyn(r2));
    g.userData.lights = [r1, r2];
    g.userData.lightCol = [[0xff2020, 0x550000], [0xffffff, 0x555555]];
    for (const [x, z] of [[-0.92, -1.7], [0.92, -1.7], [-0.92, 1.8], [0.92, 1.8]]) wheel(g, 0.38, 0.24, x, 0.38, z, wheels, false);
  } else if (type === 'bus') {
    // রং: চার ভাগের এক ভাগ গোলাপি বাস (ঢাকার মতো), বাকিগুলো অন্য রঙে
    const li = BUILD_DD || Math.random() < 0.25 ? LIVERY.length - 1 : Math.floor(Math.random() * (LIVERY.length - 1));
    color = parseInt(LIVERY[li][0].slice(1), 16);
    g.userData.livery = li;
    addBox(g, 2.5, 0.45, 10, lam(0x1a1a1a), 0, 0.65, 0);
    addBox(g, 2.5, 2.4, 10, lam(color), 0, 2.05, 0);
    addBox(g, 2.54, 0.85, 8.6, lam(0x1a2430), 0, 2.4, 0.3);
    addBox(g, 2.3, 1.0, 0.06, lam(0x1a2430), 0, 2.4, -5.02);
    // ঢাকাই বাসের রঙ: দুই পাশে, সামনে, পিছনে
    for (const s of [-1, 1]) art(g, 'bus', li, 9.7, 1.12, s * 1.257, 1.41, 0, s * Math.PI / 2);
    art(g, 'bus', li, 2.45, 1.12, 0, 1.41, -5.006, Math.PI);
    art(g, 'bus', li, 2.45, 1.12, 0, 1.41, 5.006, 0);
    // জানালার খুঁটি, দরজা (বাম পাশে), আয়না, বাতি, গ্রিল, স্টিকার
    const blk = lam(0x1a1a1a);
    for (let z = -4.1; z < 4.7; z += 1.15) addBox(g, 2.56, 0.85, 0.09, lam(color), 0, 2.4, z);
    for (const [z0, z1] of [[-4.75, -3.75], [2.6, 3.6]]) {
      for (const z of [z0, z1]) addBox(g, 0.03, 2.0, 0.05, blk, -1.264, 1.85, z);
      addBox(g, 0.03, 0.05, z1 - z0, blk, -1.264, 2.85, (z0 + z1) / 2);
      addBox(g, 0.03, 1.9, 0.03, blk, -1.264, 1.85, (z0 + z1) / 2);
    }
    for (const s of [-1, 1]) {
      addBox(g, 0.5, 0.05, 0.05, blk, s * 1.45, 2.65, -4.95);
      addBox(g, 0.08, 0.42, 0.26, blk, s * 1.7, 2.42, -4.95);
      addBox(g, 0.36, 0.2, 0.05, bas(0xfff6d6), s * 0.85, 1.0, -5.03);
      addBox(g, 0.3, 0.2, 0.05, bas(0xd01818), s * 0.95, 1.0, 5.03);
    }
    addBox(g, 1.3, 0.34, 0.04, blk, 0, 1.0, -5.03);
    art(g, 'stick', 0, 1.1, 0.27, 0, 2.72, -5.05, Math.PI);
    art(g, 'stick', 1, 0.9, 0.22, -1.275, 2.14, -3.0, -Math.PI / 2);
    art(g, 'stick', 2, 0.9, 0.22, 1.275, 2.14, -3.4, Math.PI / 2);
    art(g, 'stick', 3, 0.9, 0.22, 0, 2.55, 5.05, 0);
    // কোম্পানির নাম আর রুট দুই পাশে, সামনে-পিছনে গন্তব্য
    const co = li === LIVERY.length - 1 ? 'পিংক বাস' : pick(BUS_CO), rt = pick(BUS_ROUTE); // গোলাপি বাসে (দোতলাসহ) 'পিংক বাস'
    const side = texMat(paintTex(`${co}  ·  ${rt[0]} — ${rt[1]}`, null, null, '#ffffff', 1536, 102), { transparent: true });
    addPlane(g, 7.2, 0.48, side, 1.262, 1.72, 0.3, Math.PI / 2);
    addPlane(g, 7.2, 0.48, side, -1.262, 1.72, 0.3, -Math.PI / 2);
    addPlane(g, 2.0, 0.34, texMat(paintTex(`${rt[0]} — ${rt[1]}`, null, '#111111', '#ffb627', 512, 88)), 0, 3.05, -5.04, Math.PI);
    addPlane(g, 2.0, 0.34, texMat(paintTex(co, null, '#111111', '#ffffff', 512, 88)), 0, 3.05, 5.04, 0);
    plate(g, 0, 0.75, 5.03, 0.6);
    g.userData.busName = co; g.userData.busRoute = rt;
    for (const [x, z] of [[-1.15, -3.4], [1.15, -3.4], [-1.15, 3.2], [1.15, 3.2]]) wheel(g, 0.5, 0.3, x, 0.5, z, wheels, false);
  }
  return { g, wheels, color };
}

export class Vehicle {
  constructor(scene, type, opts = {}) {
    this.type = type;
    this.spec = SPECS[type];
    // গোলাপি দোতলা বাস: বাসের তিন ভাগের এক ভাগ; লম্বা, নিচু মেঝে, চালক সামনের কাচের পিছনে ডানে
    this.dd = type === 'bus' && (opts.dd ?? Math.random() < 0.35);
    BUILD_DD = this.dd;
    if (this.dd) this.spec = { ...SPECS.bus, name: 'দোতলা বাস', len: 10.6, max: 17.5, accel: 3.0, circles: [-3.8, -1.3, 1.3, 3.8], seat: { x: 0.62, y: 0.86, z: -4.45 }, door: { x: 2, z: -3.9 } };
    const m = build(type, !!opts.dynWheels);
    this.g = m.g;
    this.wheels = m.wheels;
    this.color = opts.color || m.color;
    if (this.dd) { // দূর থেকে দেখার হালকা মডেলে উপরের তলা
      const pink = lam(0xe8508a);
      addBox(this.g, 2.5, 1.75, 10, pink, 0, 4.12, 0);
      addBox(this.g, 2.54, 0.8, 9.4, lam(0x1a2430), 0, 4.2, 0.1);
      addBox(this.g, 2.5, 0.12, 10, lam(0xf2f2f2), 0, 3.28, 0);
    }
    setShadows(this.g, true, false);
    mergeStatic(this.g, true, false);
    this.procKids = [...this.g.children]; // হাতে-বানানো মডেলের অংশ (আসল মডেল এলে দূরে শুধু এগুলো)
    this.addSteer();
    this.tires = (m.tires || []).map((t) => ({ ...t, flat: false }));
    this.flats = 0; this.pull = 0;
    // সামনে রাস্তায় হেডলাইটের আলো
    const bw = { bike: 2.4, rickshaw: 0, van: 0, autorickshaw: 2.2, easybike: 2.6, bus: 4.4, truck: 4.4 }[type] ?? 3.6;
    if (bw) {
      if (!beamGeo[type]) { const pg = new THREE.PlaneGeometry(bw, 10); pg.rotateX(-Math.PI / 2); beamGeo[type] = pg; }
      const bm = new THREE.Mesh(beamGeo[type], HEAD_BEAM);
      bm.position.set(0, 0.07, -SPECS[type].len / 2 - 5);
      bm.userData.noShadow = true; bm.userData.noDent = true;
      bm.castShadow = false; bm.receiveShadow = false;
      bm.renderOrder = 1;
      this.g.add(bm);
      this.beam = bm;
    }
    scene.add(this.g);
    this.x = opts.x ?? 0; this.z = opts.z ?? 0; this.yaw = opts.yaw ?? 0;
    this.speed = 0; this.steer = 0; this.lean = 0; this.spin = 0;
    this.driver = null; this.passenger = null;
    this.ai = !!opts.ai;
    this.owned = !!opts.owned;
    this.stun = 0;
    this.g.rotation.order = 'YXZ';
    this.y = 0; this.roll = 0; this.pitch = 0;
    this.tumble = null;
    this.wrecked = false;
    this.lights = this.g.userData.lights || null;
    this.lightCol = this.g.userData.lightCol || null;
    this.maxHp = HP[type] || 100;
    this.hp = this.maxHp;
    // উঁচু মানের গ্রাফিক্সে গাড়ির রঙে হালকা চকচকে ভাব
    // (রাস্তা-দালানের সাথে ভাগ করা উপাদানে চিহ্ন দিলে সেগুলোও কাচের মতো চকচক করত, তাই গাড়ির নিজের কপিতে)
    this.g.traverse((o) => {
      const m = o.material;
      if (!m || Array.isArray(m) || !m.isMeshLambertMaterial || m.userData.glass || m.userData.paint) return;
      if (!PAINT.has(m)) { const c = m.clone(); c.userData = { ...m.userData, paint: true }; PAINT.set(m, c); }
      o.material = PAINT.get(m);
    });
    this.burn = 0; // আগুন কতক্ষণ জ্বলছে
    this.burnt = false;
    if (type === 'cng') this.backText = pick(CNG_BACK);
    if (type === 'rickshaw') this.backText = pick(RICK_BACK);
    this.addLamps();
    attachModel(this);
    this.sync(0);
  }
  // পিছনের লাল বাতি (ব্রেকে উজ্জ্বল), সামনে-পিছনে হলুদ ইন্ডিকেটর (মোড় নিলে জ্বলে-নেভে)
  addLamps() {
    if (!LAMP_Y[this.type] || this.air || this.spec.air || this.spec.water) return;
    const mk = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    this.lampM = { tail: mk(0x5a0606), indL: mk(0x5a3a06), indR: mk(0x5a3a06) };
    if (!GLOW_M) GLOW_M = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.lampMeshes = []; this.glow = [];
    this.placeLamps();
  }
  // স্টিয়ারিং হুইল: চালকের সামনে, কাচ দিয়ে দেখা যায়; মোড় নিলে ঘোরে (মডেলগুলোতে নিজের স্টিয়ারিং নেই)
  addSteer() {
    const S = STEER[this.dd ? 'dd' : this.type];
    if (!S) return;
    if (!STEER_M) STEER_M = lam(0x1c1c1e);
    const outer = new THREE.Group(), inner = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(S.r, 0.022, 6, 20), STEER_M);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), STEER_M); hub.rotation.x = Math.PI / 2;
    inner.add(rim, hub);
    for (const a of [0, 2.2, -2.2]) { // তিনটা স্পোক
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, S.r, 0.018), STEER_M);
      sp.position.set(Math.sin(a) * S.r / 2, -Math.cos(a) * S.r / 2, 0); sp.rotation.z = a; inner.add(sp);
    }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6), STEER_M); // স্টিয়ারিংয়ের দণ্ড, ড্যাশবোর্ডের দিকে
    col.rotation.x = Math.PI / 2; col.position.z = -0.17;
    outer.add(inner, col);
    for (const o of [rim, hub, col, ...inner.children]) { o.userData.noShadow = true; o.userData.noDent = true; o.castShadow = false; }
    outer.rotation.x = -S.tilt; // উপরের দিক চালকের দিকে হেলানো
    this.g.add(outer);
    this.steerW = { outer, inner, S, a: 0 };
    this.placeSteer();
  }
  placeSteer() {
    if (!this.steerW) return;
    const { outer, S } = this.steerW, st = this.spec.seat;
    outer.position.set(st.x, st.y + S.dy, st.z + S.dz);
  }
  // বাতির জায়গা: আসল মডেলে মডেলের নিজের বাতির জায়গায় (রং দেখে খুঁজে রাখা), না হলে আগের হিসাবে
  placeLamps() {
    if (!this.lampM) return;
    for (const q of [...this.lampMeshes, ...this.glow]) this.g.remove(q);
    this.lampMeshes = []; this.glow = [];
    const add = (w, h, m, x, y, z, back) => {
      const q = new THREE.Mesh(LAMP_GEO, m); q.scale.set(w, h, 1); q.position.set(x, y, z + (back ? 0.012 : -0.012));
      q.userData.noShadow = true; q.userData.noDent = true; this.g.add(q); this.lampMeshes.push(q); return q;
    };
    const glow = (x, y, z, w, h) => { const gm = new THREE.Mesh(LAMP_GEO, GLOW_M); gm.scale.set(w, h, 1); gm.position.set(x, y, z + 0.05); gm.userData.noShadow = true; gm.userData.noDent = true; gm.visible = false; this.g.add(gm); this.glow.push(gm); };
    const Lm = this.mLamps;
    const T = this.mTailMats && this.mTailMats.length && this.model; // মডেলের নিজের লাল কাচ জ্বলে
    this.indQ = [];
    if (Lm && ((Lm.tail && Lm.tail.length) || T)) {
      if (!T) for (const t of Lm.tail) { add(t.w, t.h, this.lampM.tail, t.x, t.y, t.z, true); glow(t.x, t.y, t.z, t.w * 1.1 + 0.03, t.h * 1.3 + 0.03); }
      // পিছনের ইন্ডিকেটর: মডেলে থাকলে সেখানে, না হলে লাল বাতির পাশে বাইরের দিকে
      const own = T ? (Lm.indB || []) : (Lm.indB || []).filter((q) => !Lm.tail.some((t) => Math.abs(t.x - q.x) < 0.15 && Math.abs(t.y - q.y) < 0.15)); // লাল বাতির উপরে পড়লে বাদ
      const ib = own.length || T ? own : Lm.tail.map((t) => ({ x: t.x + (Math.sign(t.x) || 1) * (t.w / 2 + 0.05), y: t.y, z: t.z - 0.01, w: 0.08, h: Math.min(0.1, t.h + 0.03) }));
      if (this.type === 'bike' && ib.length === 1) { const t = ib[0]; ib.splice(0, 1, { ...t, x: -0.13, y: t.y + 0.05, w: 0.06, h: 0.05 }, { ...t, x: 0.13, y: t.y + 0.05, w: 0.06, h: 0.05 }); }
      for (const t of ib) this.indQ.push([add(t.w, t.h, t.x < 0 ? this.lampM.indL : this.lampM.indR, t.x, t.y, t.z, true), t.x < 0]);
      for (const t of Lm.indF || []) this.indQ.push([add(t.w, t.h, t.x < 0 ? this.lampM.indL : this.lampM.indR, t.x, t.y, t.z, false), t.x < 0]);
      if (!T) this.indQ = []; // পুরনো ধরনে ইন্ডিকেটর সবসময় দেখা যায় (নিভলে গাঢ়)
      return;
    }
    // হাতে-বানানো মডেল
    const L = this.spec.len / 2 + 0.02, W = this.spec.wid / 2, y = LAMP_Y[this.type];
    if (this.type === 'bike') { add(0.12, 0.06, this.lampM.tail, 0, y, L, true); glow(0, y, L, 0.22, 0.12); }
    else for (const sd of [-1, 1]) { add(0.2, 0.1, this.lampM.tail, sd * (W - 0.2), y, L, true); glow(sd * (W - 0.2), y, L, 0.3, 0.16); }
    for (const sd of [-1, 1]) {
      const m = sd < 0 ? this.lampM.indL : this.lampM.indR, x = this.type === 'bike' ? sd * 0.14 : sd * (W - 0.05);
      add(0.07, 0.06, m, x, y, L, true); add(0.07, 0.06, m, x, y - 0.08, -L, false);
    }
  }
  updateLamps(dt) {
    if (!this.lampM || !dt) return;
    const sp = this.speed, acc = (sp - (this._lsp ?? sp)) / dt;
    this._lsp = sp;
    const dy = Math.atan2(Math.sin(this.yaw - (this._lyaw ?? this.yaw)), Math.cos(this.yaw - (this._lyaw ?? this.yaw))) / dt;
    this._lyaw = this.yaw;
    const dead = this.hp <= 0 || this.burnt;
    // ব্রেক: গতি জোরে কমছে, হ্যান্ডব্রেক, বা থেমে থাকা চালক-সহ গাড়ি (পা ব্রেকে)
    const braking = !dead && (this.hb || (Math.abs(sp) > 0.4 && acc * Math.sign(sp) < -1.6) || (this.driver && Math.abs(sp) < 0.3 && this.brakeHold));
    this._bk = braking ? 0.35 : Math.max(0, (this._bk || 0) - dt);
    const brk = this._bk > 0;
    this.lampM.tail.color.setHex(brk ? 0xff1a10 : 0x6a0808);
    if (this.mTailMats) for (const m of this.mTailMats) m.emissive.setHex(dead ? 0 : brk ? 0xff1608 : 0x3a0303);
    for (const gm of this.glow) gm.visible = brk && this.lodNear !== false;
    // ইন্ডিকেটর: মোড় নিলে ০.৮ সেকেন্ড ধরে; নষ্ট হলে দুই পাশে (হ্যাজার্ড)
    if (Math.abs(sp) > 0.8 && Math.abs(dy) > 0.22) { this._ind = dy < 0 ? 1 : -1; this._indT = 0.8; }
    else this._indT = Math.max(0, (this._indT || 0) - dt);
    const blink = Math.floor(performance.now() / 380) % 2 === 0;
    const l = (dead && this.hp > -1) || (this._indT > 0 && this._ind < 0), r = (dead && this.hp > -1) || (this._indT > 0 && this._ind > 0);
    this.lampM.indL.color.setHex(l && blink ? 0xffa000 : 0x4a3008);
    this.lampM.indR.color.setHex(r && blink ? 0xffa000 : 0x4a3008);
    // মডেলের কাচের উপর বসানো ইন্ডিকেটর: শুধু জ্বলার সময় দেখা যায় (নিভলে কাচই দেখা যায়)
    if (this.indQ) for (const [q, left] of this.indQ) q.visible = blink && (left ? l : r);
  }
  // গাড়ির কাচ: প্রথমে ফাটে, আরও আঘাতে ভেঙে ঝরে পড়ে
  breakGlass(level, g, dx = 0, dz = 0) {
    if (!this.mGlass || !this.mGlass.length) return false;
    const was = this.glassLv || 0;
    const lv = Math.max(was, level);
    if (lv === was) return false;
    this.glassLv = lv;
    for (const m of this.mGlass) {
      const mat = m.material;
      if (lv === 1) { mat.map = crackTex(); mat.opacity = 0.62; mat.color.setHex(0xd8e6ea); mat.needsUpdate = true; }
      else m.visible = false;
    }
    if (g && g.world && g.world.glass) {
      const G = g.world.glass, n = lv === 2 ? 26 : 6;
      for (let i = 0; i < n; i++) {
        const p = this.toWorld((Math.random() - 0.5) * this.spec.wid, (Math.random() - 0.5) * this.spec.len * 0.6);
        G.spawn(p.x, 0.9 + Math.random() * 0.6, p.z, dx * 1.5 + (Math.random() - 0.5) * 2, Math.random() * 1.5, dz * 1.5 + (Math.random() - 0.5) * 2);
      }
      const d = Math.hypot(this.x - g.player.pos.x, this.z - g.player.pos.z), v = Math.max(0.08, 1 - d / 60);
      if (!g.sound.sfx('glass', (lv === 2 ? 0.6 : 0.3) * v)) { g.sound.noise(lv === 2 ? 0.4 : 0.15, (lv === 2 ? 0.3 : 0.15) * v, 'highpass', 5000, 2500, 0.8); for (let i = 0; i < (lv === 2 ? 5 : 2); i++) g.sound.tone('sine', 2800 + Math.random() * 3000, 0.07, 0.04 * v, null, Math.random() * 0.3); }
    }
    return true;
  }
  fixGlass() {
    if (!this.mGlass) return;
    for (const m of this.mGlass) { const b = m.material.userData.base; if (b) { m.material.map = b.map; m.material.opacity = b.opacity; m.material.color.setHex(b.color); m.material.needsUpdate = true; } m.visible = true; }
    this.glassLv = 0;
  }
  // দরজা খোলা-বন্ধ (ওঠা-নামার সময়): কব্জা সামনের দিকে, পিছনের দিক বাইরে ঘোরে
  setDoor(open, side) {
    const D = DOOR[this.type];
    if (!D) return;
    if (!this.door) this.buildDoor(D);
    const sd = side || Math.sign(this.spec.door.x) || 1;
    if (this.lost && this.lost['door' + sd]) { if (!open) { this.door.target = 0; DOORS.add(this); } return; } // দরজা খুলে পড়ে গেছে: খোলার কিছু নেই
    if (open && sd !== this.door.side) { this.door.side = sd; this.placeDoor(); }
    this.door.target = open ? 1 : 0;
    DOORS.add(this);
  }
  buildDoor(D) {
    const grp = new THREE.Group(), pv = new THREE.Group();
    const col = D.color ?? (this.color || 0x8a8f94);
    const paint = new THREE.MeshLambertMaterial({ color: col });
    const h = D.y1 - D.y0, low = h * 0.56;
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.06, low, D.len), paint); pnl.position.set(0, D.y0 + low / 2, D.len / 2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, h - low - 0.06, D.len * 0.9), new THREE.MeshLambertMaterial({ color: 0x24343c, transparent: true, opacity: 0.5 }));
    win.position.set(0, D.y0 + low + (h - low) / 2, D.len * 0.47);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, D.len * 0.92), paint); frame.position.set(0, D.y1 - 0.03, D.len * 0.47);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.16), lam(0xb0b5ba)); handle.position.set(0.04, D.y0 + low - 0.1, D.len * 0.8);
    // ভিতরের দিক (খুললে দেখা যায়): গাঢ় প্লাস্টিক
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.02, low * 0.9, D.len * 0.94), lam(0x2c2c2e)); inner.position.set(-0.04, D.y0 + low / 2, D.len / 2);
    pv.add(pnl, win, frame, handle, inner);
    for (const m of pv.children) { m.userData.noDent = true; m.castShadow = true; }
    grp.add(pv);
    // দরজা খুললে গাড়ির গায়ে ফাঁকা জায়গা (ভিতরটা অন্ধকার, নিচে সিটের রং)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.02, h - 0.04, D.len - 0.04), lam(0x151517));
    hole.position.set(0, D.y0 + h / 2, D.len / 2);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.025, low * 0.45, D.len * 0.6), lam(0x3a2f28));
    seat.position.set(0, D.y0 + low * 0.55, D.len * 0.62);
    grp.add(hole, seat);
    grp.visible = false;
    this.g.add(grp);
    this.door = { grp, pv, D, a: 0, target: 0, side: Math.sign(this.spec.door.x) || 1, handle, inner, hole, seat };
    this.placeDoor();
  }
  placeDoor() {
    const d = this.door, D = d.D, ext = this.mExt;
    const W = (ext ? ext[0] : this.spec.wid) / 2 + 0.01;
    const z0 = this.spec.seat.z - D.fwd;
    d.grp.position.set(d.side * W, 0, z0);
    d.handle.position.x = d.side * 0.04; d.inner.position.x = -d.side * 0.04;
    d.hole.position.x = d.side * 0.005; d.seat.position.x = d.side * 0.012;
  }
  updateDoor(dt) {
    const d = this.door;
    if (!d || !dt) return;
    const was = d.a;
    d.a += Math.sign(d.target - d.a) * Math.min(Math.abs(d.target - d.a), dt / (d.target ? 0.32 : 0.28));
    d.grp.visible = d.a > 0.01;
    d.pv.rotation.y = d.side * d.a * 1.15; // প্রায় ৬৫°
    if (was > 0.02 && d.a <= 0.01 && d.target === 0 && this.onDoorShut) this.onDoorShut();
  }
  // কাছে আসল মডেল, দূরে হালকা মডেল
  setLod(near) {
    if (!this.model || this.lodNear === near) return;
    this.lodNear = near;
    this.model.visible = near;
    for (const c of this.procKids) if (c !== this.beam) c.visible = !near;
  }
  // গুলি চাকায় লাগল কিনা (hx,hy,hz = গুলি লাগার বিন্দু); লাগলে পাংচার
  shootTire(hx, hy, hz, g) {
    if (!this.tires.length || this.burnt) return false;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dx = hx - this.x, dz = hz - this.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    let best = -1, bd = 1e9;
    this.tires.forEach((t, i) => {
      if (hy - (this.y || 0) > t.y + t.r + 0.12) return;
      const ax = Math.abs(lx - t.x), az = Math.abs(lz - t.z);
      const side = t.x === 0 ? ax < 0.5 : Math.sign(lx) === Math.sign(t.x) && Math.abs(lx) > Math.abs(t.x) - 0.35 && ax < 0.55;
      if (side && az < t.r + 0.22 && az < bd) { bd = az; best = i; }
    });
    if (best < 0) return false;
    return this.puncture(best, g);
  }
  puncture(i, g) {
    const t = this.tires[i];
    if (!t || t.flat) return false;
    t.flat = true;
    this.flats = this.tires.filter((q) => q.flat).length;
    // কোন দিকে টানে: ডান পাশের চাকা বসলে ডানে (সামনের চাকা বেশি)
    this.pull = this.tires.reduce((a, q) => a + (q.flat ? Math.sign(q.x) * (q.z < 0 ? 1.4 : 0.7) : 0), 0);
    if (g && g.sound) {
      const d = Math.hypot(this.x - g.player.pos.x, this.z - g.player.pos.z), v = Math.max(0.06, 1 - d / 60);
      if (!g.sound.sfx('tire_pop', 0.8 * v)) {
        g.sound.noise(0.09, 0.5 * v, 'lowpass', 1800, 300); // ফট
        g.sound.noise(1.3, 0.12 * v, 'highpass', 4200, 2600, 0.7, 0.08); // হিসস
      }
    }
    if (g && g.vfx) g.vfx.emit && g.vfx.emit('debris', this.toWorld(t.x, t.z).x, 0.2, this.toWorld(t.x, t.z).z, 0x222222, { scale: 0.4 });
    // আসল মডেলের চাকা চ্যাপ্টা
    if (this.mWheels) {
      let w = null, wd = 0.8;
      for (const m of this.mWheels) { const d = Math.hypot(m.position.x - t.x, m.position.z - t.z); if (d < wd) { wd = d; w = m; } }
      if (w) { w.scale.y = (w.userData.s0 ?? 1) * 0.8; w.userData.flat = true; } // মডেলের নিজের স্কেলের অনুপাতে
    }
    return true;
  }
  // ক্ষতি: ধাক্কা, গুলি, বিস্ফোরণ। by = 'player' হলে দোষ আপনার
  damage(n, by) {
    if (this.burnt || n <= 0) return;
    this.hp = Math.max(-1, this.hp - n);
    if (by) this.lastBy = by;
    if (this.hp <= 0) this.wrecked = true; // ইঞ্জিন শেষ
  }
  // ধাক্কার জায়গায় টোল. wx,wz: দুনিয়ায় ধাক্কার বিন্দু; ix,iz: গাড়ির ভিতরের দিক; amount ∝ ক্র্যাশ ভেলোসিটি
  dent(wx, wz, ix, iz, amount) {
    if (amount <= 0.008 || this.burnt) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dx = wx - this.x, dz = wz - this.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    try { this.hitParts(lx, lz, amount / 0.016 + 3); } catch (e) { /* অংশ ভাঙা না গেলেও টোল হয় */ }
    let ldx = ix * c - iz * s, ldz = ix * s + iz * c;
    const l = Math.hypot(ldx, ldz) || 1; ldx /= l; ldz /= l;
    const maxD = (MAX_DENT[this.type] || 0.4) * (1 + amount * 0.8);
    const R = 0.85 + amount * 2.8;
    const soft = Math.min(0.55, amount * 1.15); // ভেলোসিটি অনুযায়ী গভীর ক্রাশ
    if (!this._dentV) { this._dentV = new THREE.Vector3(); this._dentV2 = new THREE.Vector3(); }
    const inv = this._dentM || (this._dentM = new THREE.Matrix4());
    this.g.updateWorldMatrix(true, false);
    this.g.traverse((m) => {
      if (!m.isMesh || m.userData.noDent || !m.geometry?.attributes?.position) return;
      const geo = m.geometry, pa = geo.attributes.position;
      if (!pa?.array?.length) return;
      if (!geo.userData.orig) geo.userData.orig = pa.array.slice();
      // ইমপ্যাক্ট পয়েন্ট → মেশ লোকাল (নেস্টেড মডেলেও সঠিক)
      inv.copy(m.matrixWorld).invert();
      const lp = this._dentV.set(wx, (this.y || 0) + 0.75, wz).applyMatrix4(inv);
      const d1 = this._dentV2.set(wx + ix, (this.y || 0) + 0.75, wz + iz).applyMatrix4(inv);
      let mx = d1.x - lp.x, mz = d1.z - lp.z;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      if (dentArray(pa.array, geo.userData.orig, lp.x, lp.z, mx, mz, soft, R, maxD)) {
        pa.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        this.dented = true;
      }
    });
  }
  // ধাক্কার জায়গা (গাড়ির ভিতরের হিসাবে: x ডানে, z পিছনে) → সামনে/পিছনে/বাম/ডান
  regionOf(lx, lz) {
    const ax = lx / (this.spec.wid / 2), az = lz / (this.spec.len / 2);
    return Math.abs(az) > Math.abs(ax) * 1.1 ? (az < 0 ? 'front' : 'rear') : (lx < 0 ? 'left' : 'right');
  }
  // কাচগুলো কোন দিকের: মডেলের প্রতিটা কাচের মাঝখান দেখে (একটাই জোড়া কাচ হলে 'all')
  glassMap() {
    if (this._gmap && this._gmapN === this.mGlass.length) return this._gmap;
    const out = new Map(), inv = new THREE.Matrix4(), box = new THREE.Box3(), cen = new THREE.Vector3(), size = new THREE.Vector3();
    this.g.updateMatrixWorld(true);
    inv.copy(this.g.matrixWorld).invert();
    for (const m of this.mGlass) {
      try {
        box.setFromObject(m); box.applyMatrix4(inv); box.getCenter(cen); box.getSize(size);
        // গ্রুপের ভিতরে: x ডানে, z পিছনে (toWorld-এর মতো)
        const big = size.x > this.spec.wid * 0.75 && size.z > this.spec.len * 0.5;
        out.set(m, big ? 'all' : this.regionOf(cen.x, cen.z));
      } catch (e) { out.set(m, 'all'); }
    }
    this._gmap = out; this._gmapN = this.mGlass.length;
    return out;
  }
  // এক দিকের কাচ: ১ = ফাটল, ২ = ভেঙে ঝরে পড়া
  breakGlassAt(region, level, g) {
    if (!this.mGlass || !this.mGlass.length) return false;
    const map = this.glassMap();
    this.glassSide = this.glassSide || {};
    let any = false;
    for (const m of this.mGlass) {
      const r = map.get(m);
      if (region !== 'all' && r !== region) continue;
      if (r === 'all' && level < 2 && region !== 'all') { if ((this.glassSide.all || 0) >= 1) continue; }
      const was = m.userData.gl || 0;
      if (was >= level) continue;
      m.userData.gl = level; any = true;
      if (level === 1) { m.material.map = crackTex(); m.material.opacity = 0.62; m.material.color.setHex(0xd8e6ea); m.material.needsUpdate = true; }
      else m.visible = false;
    }
    if (!any) return false;
    this.glassLv = Math.max(this.glassLv || 0, level);
    if (g && g.world && g.world.glass) {
      const G = g.world.glass, n = level === 2 ? (region === 'all' ? 26 : 12) : 4;
      const lx = region === 'left' ? -0.5 : region === 'right' ? 0.5 : 0, lz = region === 'front' ? -0.25 : region === 'rear' ? 0.3 : 0;
      for (let i = 0; i < n; i++) {
        const p = this.toWorld((lx || (Math.random() - 0.5)) * this.spec.wid, (lz + (Math.random() - 0.5) * 0.3) * this.spec.len);
        G.spawn(p.x, 0.9 + Math.random() * 0.5, p.z, (Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5);
      }
      const d = Math.hypot(this.x - g.player.pos.x, this.z - g.player.pos.z), v = Math.max(0.08, 1 - d / 60);
      if (!g.sound.sfx('glass', (level === 2 ? 0.5 : 0.25) * v)) g.sound.noise(level === 2 ? 0.35 : 0.12, (level === 2 ? 0.25 : 0.12) * v, 'highpass', 5000, 2500, 0.8);
    }
    return true;
  }
  // জোরে ধাক্কা: যে দিকে লাগল সেদিকের কাচ ফাটে/ভাঙে, দরজা-বাম্পার খুলে ছিটকে পড়ে, বনেট উঠে যায়
  hitParts(lx, lz, impact) {
    if (impact < 5 || this.burnt || this.spec.air || this.boat) return;
    const g = VM.world && VM.world.game;
    const R = this.regionOf(lx, lz);
    if (impact > 16) this.breakGlassAt(R, 2, g) && impact > 20 && this.breakGlassAt('all', 2, g);
    else if (impact > 9) this.breakGlassAt(R, 2, g);
    else this.breakGlassAt(R, 1, g);
    const D = DOOR[this.type];
    if (!D || !g) return;
    this.lost = this.lost || {};
    const scene = g.scene, f = this.fwd(), rx = -f.z, rz = f.x; // ডান দিক (দুনিয়ায়)
    const col = D.color ?? (this.color || 0x8a8f94);
    const paint = new THREE.MeshLambertMaterial({ color: col });
    const ext = this.mExt, W = (ext ? ext[0] : this.spec.wid), L = (ext ? ext[2] : this.spec.len) || this.spec.len, H = (ext ? ext[1] : D.y1 + 0.2);
    const ry = this.yaw;
    // দরজা: পাশ থেকে জোরে (চালকের দরজার কাছাকাছি)
    if ((R === 'left' || R === 'right') && impact > 11) {
      const sd = R === 'right' ? 1 : -1, key = 'door' + sd;
      if (!this.lost[key] && Math.abs(lz - (this.spec.seat.z - D.fwd + D.len / 2)) < D.len) {
        this.lost[key] = true;
        if (this.door && this.door.side === sd) { this.door.target = 0; this.door.a = 0; this.door.grp.visible = false; }
        // উড়ে যাওয়া দরজা
        const h = D.y1 - D.y0, low = h * 0.56;
        const part = new THREE.Group();
        const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.06, low, D.len), paint); pnl.position.y = -h / 2 + low / 2;
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - low, 0.06), paint); fr.position.set(0, low / 2, -D.len / 2 + 0.03);
        part.add(pnl, fr);
        const p0 = this.toWorld(sd * (W / 2 + 0.1), this.spec.seat.z - D.fwd + D.len / 2);
        part.position.set(p0.x, D.y0 + h / 2, p0.z); part.rotation.y = ry;
        const k = Math.min(1.4, impact / 14);
        throwPart(scene, part, rx * sd * 3 * k + f.x * this.speed * 0.4, 2 + impact * 0.12, rz * sd * 3 * k + f.z * this.speed * 0.4, 0.1);
        // গাড়ির গায়ে দরজার জায়গায় ফাঁকা (ভিতরটা অন্ধকার, সিট দেখা যায়)
        const gap = new THREE.Group();
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.02, h - 0.04, D.len - 0.04), lam(0x151517)); hole.position.set(0, D.y0 + h / 2, D.len / 2);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.03, low * 0.45, D.len * 0.6), lam(0x3a2f28)); seat.position.set(sd * 0.01, D.y0 + low * 0.55, D.len * 0.62);
        gap.add(hole, seat);
        gap.position.set(sd * (W / 2 + 0.012), 0, this.spec.seat.z - D.fwd);
        gap.userData.dmgPart = true; hole.userData.noDent = seat.userData.noDent = true;
        this.g.add(gap);
      }
    }
    // বাম্পার: সামনে/পিছনে জোরে
    if ((R === 'front' || R === 'rear') && impact > 9) {
      const key = 'bump' + R;
      if (!this.lost[key]) {
        this.lost[key] = true;
        const sg = R === 'front' ? -1 : 1;
        const part = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.26, 0.16), paint);
        const p0 = this.toWorld(0, sg * (L / 2 + 0.05));
        part.position.set(p0.x, 0.42, p0.z); part.rotation.y = ry;
        throwPart(scene, part, -f.x * sg * 2 + f.x * this.speed * 0.5 + rand(-1, 1), 1.5 + impact * 0.08, -f.z * sg * 2 + f.z * this.speed * 0.5 + rand(-1, 1), 0.08);
      }
    }
    // বনেট: সামনে খুব জোরে লাগলে দুমড়ে উপরে উঠে যায়
    if (R === 'front' && impact > 13 && !this.lost.bonnet && this.type !== 'truck') {
      this.lost.bonnet = true;
      const bon = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.04, L * 0.26), paint);
      const pv = new THREE.Group(); pv.position.set(0, H * 0.6, -L / 2 + L * 0.3);
      bon.position.set(0, 0, -L * 0.13);
      pv.rotation.x = 0.55; pv.add(bon);
      pv.userData.dmgPart = true; bon.userData.noDent = true; bon.castShadow = true;
      this.g.add(pv);
      if (g.vfx) for (let i = 0; i < 6; i++) { const p = this.toWorld(0, -L * 0.35); g.vfx.emit('smoke', p.x, H * 0.7, p.z, 0xdedede, { scale: 0.7 }); }
    }
  }
  // মেকানিক সারালে: খুলে পড়া অংশ আবার লাগানো
  fixParts() {
    for (const m of [...this.g.children]) if (m.userData.dmgPart) this.g.remove(m);
    this.lost = null;
    if (this.mGlass) for (const m of this.mGlass) m.userData.gl = 0;
  }
  // দেয়ালে ধাক্কার পরে: শেষ ধাক্কার জায়গায় টোল (ভেলোসিটি অনুযায়ী গভীর)
  crashDent(impact) {
    const h = this.lastHit;
    if (!h || impact < 3.5) return;
    this.dent(h.x, h.z, h.nx, h.nz, Math.min(0.48, (impact - 2.5) * 0.022));
  }
  undent() {
    if (!this.dented) return;
    for (const m of this.g.children) {
      const geo = m.isMesh && m.geometry;
      if (!geo || !geo.userData || !geo.userData.orig) continue;
      geo.attributes.position.array.set(geo.userData.orig);
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    }
    this.dented = false;
  }
  get dmgFrac() { return clamp(this.hp / this.maxHp, 0, 1); }
  // পুড়ে কালো
  setBurnt(on) {
    this.burnt = on;
    this.g.traverse((m) => {
      if (!m.isMesh || m === this.beam) return;
      if (on) { if (!m.userData.mat0) m.userData.mat0 = m.material; m.material = BURNT; }
      else if (m.userData.mat0) { m.material = m.userData.mat0; m.userData.mat0 = null; }
    });
  }
  // উল্টে যাওয়া শুরু: dir = কোন দিকে ঠেলা খেয়েছে
  flip(pushX, pushZ, power) {
    if (this.type === 'bus' || this.tumble) return false;
    const f = this.fwd();
    this.tumble = {
      vx: f.x * this.speed * 0.5 + pushX * power * 0.35,
      vz: f.z * this.speed * 0.5 + pushZ * power * 0.35,
      vy: 2.5 + Math.min(power, 20) * 0.22,
      wr: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.min(power, 20) * 0.35),
      wp: (Math.random() - 0.5) * 3,
      wy: (Math.random() - 0.5) * 2,
    };
    this.speed = 0;
    return true;
  }
  updateTumble(dt, world) {
    const t = this.tumble;
    if (!t) return false;
    t.vy -= 15 * dt;
    this.x += t.vx * dt;
    this.z += t.vz * dt;
    this.y += t.vy * dt;
    this.roll += t.wr * dt;
    this.pitch += t.wp * dt;
    this.yaw += t.wy * dt;
    for (const c of this.spec.circles) {
      const p = this.toWorld(0, c), o = { x: p.x, z: p.z };
      if (world.collide(o, this.spec.r, 0.3, true)) { this.x += o.x - p.x; this.z += o.z - p.z; t.vx *= -0.3; t.vz *= -0.3; }
    }
    if (this.y <= 0 && t.vy < 0) {
      this.y = 0;
      if (t.vy < -2.5) {
        t.vy *= -0.3; t.wr *= 0.55; t.wp *= 0.5; t.vx *= 0.6; t.vz *= 0.6; t.wy *= 0.5;
      } else {
        // থেমে যাওয়া: সোজা, কাত, বা উল্টো হয়ে
        const q = Math.PI / 2;
        this.roll = Math.round(Math.atan2(Math.sin(this.roll), Math.cos(this.roll)) / q) * q;
        if (Math.abs(this.roll) < 0.01) this.roll = 0;
        this.pitch = 0;
        this.tumble = null;
        this.wrecked = this.roll !== 0 || this.hp <= 0 || this.burnt;
        this.checkWater(world);
        return true; // থেমেছে
      }
    }
    return false;
  }
  // পানিতে পড়া (GTA V-এর মতো): কিছুক্ষণ ভাসে, ইঞ্জিন বন্ধ, তারপর ধীরে ডুবে যায়
  checkWater(world) {
    if (this.sink || this.boat || !world.map.water.length) return false;
    if (world.map.lakeDist(this.x, this.z) < -0.6 && !world.deckAt(this.x, this.z) && !world.onRoad(this.x, this.z, 0)) {
      this.sink = { t: 0, splash: true };
      this.speed *= 0.4; this.tumble = null; this.roll = 0;
      this.wrecked = true;
      return true;
    }
    return false;
  }
  updateSink(dt) {
    const s = this.sink;
    s.t += dt;
    const f = this.fwd();
    this.speed = damp(this.speed, 0, 1.2, dt);
    this.x += f.x * this.speed * dt; this.z += f.z * this.speed * dt;
    const target = s.t < 3 ? -0.35 + Math.sin(s.t * 2) * 0.06 : -0.35 - (s.t - 3) * 0.55;
    this.y = Math.max(-6, damp(this.y || 0, target, 2, dt));
    this.pitch = damp(this.pitch || 0, 0.22, 0.8, dt);
    this.wrecked = true;
  }
  // মেকানিক: সোজা করে দেওয়া
  repair() {
    this.sink = null;
    this.roll = 0; this.pitch = 0; this.y = 0;
    this.tumble = null; this.wrecked = false; this.speed = 0;
    this.hp = this.maxHp; this.burn = 0; this.upT = 0;
    if (this.burnt) this.setBurnt(false);
    this.undent();
    for (const t of this.tires) t.flat = false;
    this.fixGlass();
    this.fixParts();
    this.flats = 0; this.pull = 0;
    if (this.mWheels) for (const w of this.mWheels) { w.scale.y = w.userData.s0 ?? 1; w.userData.flat = false; }
  }
  fwd() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  // গাড়ির লোকাল বিন্দু (x ডানে, z পিছনে) থেকে দুনিয়ার বিন্দু
  toWorld(lx, lz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
  circles() {
    return this.spec.circles.map((c) => ({ ...this.toWorld(0, c), r: this.spec.r }));
  }
  // খেলোয়াড় চালালে; inp = { throttle(-1..1), steer(-1..1), handbrake }
  drive(dt, inp, world) {
    if (this.sink) { this.updateSink(dt); return 0; }
    const S = this.spec;
    let sp = this.speed;
    // ভর: বাস/ট্রাক ধীরে তোলে/থামে; হালকা যান তীক্ষ্ণ বাঁকে অস্থির
    const mass = MASS[this.type] || 4;
    const mK = Math.sqrt(mass / 4); // 1 ≈ কার, বাস ≈ 2+
    const tippy = mass < 2.4; // সিএনজি/রিকশা/বাইক
    // ইঞ্জিন নষ্ট হলে চলে না; খুব খারাপ অবস্থায় জোরে চলে না
    // তেল শেষ (fuelLim), পানিতে (wadeLim), পানিতে ইঞ্জিন বন্ধ (stall): গ্যাস কম কাজ করে
    const lim = (this.fuelLim ?? 1) * (this.wadeLim ?? 1) * (this.stall > 0 ? 0 : 1);
    this._th = damp(this._th || 0, this.hp <= 0 ? 0 : inp.throttle * lim, Math.sign(inp.throttle) !== Math.sign(this._th || 0) ? 14 : 6, dt);
    const th = Math.abs(this._th) < 0.02 ? 0 : this._th;
    const maxS = S.max * (this.hp < this.maxHp * 0.25 ? 0.55 : this.hp < this.maxHp * 0.5 ? 0.85 : 1) * (this.flats ? Math.max(0.35, 1 - this.flats * 0.22) : 1);
    const maxW = maxS * Math.max(0.12, lim);
    if (lim < 1 && Math.abs(sp) > maxW) sp = damp(sp, Math.sign(sp) * maxW, 1.6, dt);
    const acc = S.accel / mK, brk = S.brake / mK;
    if (th > 0.05) {
      if (sp < -0.3) sp += brk * dt;
      else sp += acc * th * (1 - Math.max(0, sp) / maxW) * dt;
    } else if (th < -0.05) {
      if (sp > 0.3) sp -= brk * -th * dt;
      else sp = Math.max(-S.rev, sp - acc * 0.6 * -th * dt);
    } else {
      // ভারী যান ধীরে থামে (কম কোস্টিং ড্র্যাগ / mK)
      const coast = (0.25 / mK + Math.abs(sp) * 0.025 / mK) * dt;
      sp = Math.abs(sp) <= coast ? 0 : sp - Math.sign(sp) * coast;
    }
    this.hb = !!inp.handbrake;
    if (inp.handbrake) sp = damp(sp, 0, 1.4 + 1.2 / mK, dt);
    this.steer = damp(this.steer, inp.steer, tippy ? 7.5 : 5.2, dt);
    const grip = clamp(Math.abs(sp) / 4, 0, 1) * (1 - (tippy ? 0.55 : 0.4) * clamp(Math.abs(sp) / S.max, 0, 1)) * (1 - 0.15 * (world.wet || 0));
    const turnMul = tippy && Math.abs(sp) > 8 && Math.abs(this.steer) > 0.7 ? 1.25 : 1; // হালকা: উচ্চগতির বাঁকে অতিরিক্ত ঘোরে → উল্টে যাওয়ার ঝুঁকি
    this.yaw -= this.steer * S.turn * grip * turnMul * Math.sign(sp || 1) * (inp.handbrake ? 1.55 : 1) * dt;
    // পাংচার চাকা: গাড়ি এক দিকে টানে, একটু কাঁপে
    if (this.pull) this.yaw -= this.pull * clamp(sp / 12, -1, 1) * 0.08 * dt;
    if (this.flats && Math.abs(sp) > 3) { this._wob = (this._wob || 0) + dt * 14; this.yaw += Math.sin(this._wob) * 0.12 * this.flats * dt; }
    this.speed = sp;
    const f = this.fwd();
    this._px = this.x; this._pz = this.z;
    this.x += f.x * sp * dt;
    this.z += f.z * sp * dt;
    return this.collide(world);
  }
  // দেয়াল/গাছে ধাক্কা; ফেরত দেয় ধাক্কার জোর (মি/সে)
  collide(world) {
    let impact = 0;
    if (world.glass && world.glass.panes.length) world.glass.impact(this, world.game);
    for (const c of this.spec.circles) {
      const p = this.toWorld(0, c);
      const o = { x: p.x, z: p.z };
      if (this._px !== undefined) { o.px = p.x - (this.x - this._px); o.pz = p.z - (this.z - this._pz); }
      const hit = world.collide(o, this.spec.r, 0.5, true);
      // ল্যাম্পপোস্ট, গাছ, বোর্ড: জোরে লাগলে (২০+ কিমি/ঘণ্টা, বা বাস-ট্রাক) ভেঙে পড়ে, গাড়ি আটকায় না
      if (hit && hit.box && hit.box.brk && (Math.abs(this.speed) > 5.5 || (MASS[this.type] || 4) >= 10)) {
        const f = this.fwd(), sg = Math.sign(this.speed) || 1;
        if (world.breakBox(hit.box, f.x * sg, f.z * sg)) { this.speed *= 0.85; this.damage(2); }
        continue;
      }
      if (hit) {
        this.x += o.x - p.x;
        this.z += o.z - p.z;
        this.lastHit = { x: o.x - hit.nx * this.spec.r, z: o.z - hit.nz * this.spec.r, nx: hit.nx, nz: hit.nz };
        const f = this.fwd();
        const vn = (f.x * hit.nx + f.z * hit.nz) * this.speed;
        if (vn < 0) {
          impact = Math.max(impact, -vn);
          // কাচ ভাঙা এখন ধাক্কার দিক দেখে (hitParts, টোলের সাথে)
          if (-vn > 2.5) this.speed *= 0.25;
          else this.speed *= 0.9;
        }
      }
    }
    this._px = undefined;
    this.checkWater(world);
    return impact;
  }
  // চাকার নিচের তল: রাস্তার পিচ (৬ সেমি), ফুটপাত (১৬ সেমি), না হলে মাটি; চাকা যেন ভিতরে না ঢোকে
  surfY() {
    const W = VM.world;
    if (!W || !W.onRoad) return 0;
    this._gk = ((this._gk || 0) + 1) % 4;
    if (this._gk && this._gy !== undefined && Math.abs(this.x - this._gx) + Math.abs(this.z - this._gz) < 0.6) return this._gyS;
    this._gx = this.x; this._gz = this.z;
    const r = W.onRoad(this.x, this.z, FOOT);
    let y = 0.01;
    if (r) { const lat = Math.abs((this.x - r.ax) * r.dir.z - (this.z - r.az) * r.dir.x); y = lat > r.width / 2 ? 0.17 : 0.07; }
    this._gy = y;
    this._gyS = this._gyS === undefined ? y : this._gyS + (y - this._gyS) * 0.5;
    return this._gyS;
  }
  lod() {
    if (!this.model) return;
    const c = VM.cam;
    if (!c) { this.setLod(true); return; }
    const d = Math.hypot(this.x - c.x, this.z - c.z), n = VM.near;
    if (this.lodNear !== true && d < n) this.setLod(true);
    else if (this.lodNear !== false && d > n * 1.2) this.setLod(false);
  }
  sync(dt) {
    this.lod();
    if (this.sink) {
      this.g.position.set(this.x, this.y, this.z);
      this.g.rotation.set(this.pitch || 0, this.yaw, this.roll || 0);
      if (this.beam) this.beam.visible = false;
      return;
    }
    if (this.beam) this.beam.visible = !this.roll && !this.tumble && this.hp > 0;
    if (this.tumble || this.roll || this.pitch) {
      // ভরকেন্দ্রের চারপাশে ঘোরা, যেন মাটির নিচে না ঢোকে
      // কাত হলে পাশের অর্ধেক চওড়া, উল্টো হলে পুরো উচ্চতা মাটির উপরে তোলা
      const H = TOP_H[this.type] || 1.5, hw = this.spec.wid / 2;
      const sr = Math.sin(this.roll), cr = Math.cos(this.roll);
      const ox = sr * H / 2;
      const lift = Math.abs(sr) * hw + Math.max(0, -cr) * H + Math.abs(Math.sin(this.pitch)) * this.spec.len * 0.3;
      this.g.position.set(this.x + ox * Math.cos(this.yaw), this.y + lift, this.z - ox * Math.sin(this.yaw));
      this.g.rotation.set(this.pitch, this.yaw, this.roll);
      return;
    }
    this.g.position.set(this.x, this.surfY(), this.z);
    this.g.rotation.y = this.yaw;
    // পাংচার: যে কোণের চাকা বসেছে সেদিকে গাড়ি নিচু
    let rl = 0, pt = 0;
    if (this.flats) {
      for (const t of this.tires) if (t.flat) { rl -= Math.sign(t.x) * 0.045; pt += Math.sign(t.z) * (this.type === 'bike' ? 0.05 : 0.03); }
      this.g.position.y -= 0.035 * Math.min(2, this.flats);
    }
    // গাড়ির ভার সরে যাওয়া (GTA-র মতো): জোরে টানলে নাক উঠে, ব্রেকে নাক নিচে, বাঁকে বাইরের দিকে হেলে
    if (dt && !OPEN_SWAY.has(this.type)) {
      const acc = (this.speed - (this._swS ?? this.speed)) / dt; this._swS = this.speed;
      const dy = Math.atan2(Math.sin(this.yaw - (this._swY ?? this.yaw)), Math.cos(this.yaw - (this._swY ?? this.yaw))) / dt; this._swY = this.yaw;
      const soft = SOFT[this.type] || 1;
      this.swP = damp(this.swP || 0, clamp(acc * 0.0045 * soft, -0.045, 0.035), 5, dt);
      this.swR = damp(this.swR || 0, clamp(-dy * this.speed * 0.0042 * soft, -0.06, 0.06), 5, dt);
    }
    this.g.rotation.x = pt + (this.swP || 0);
    if (this.type !== 'bike') this.g.rotation.z = rl + (this.swR || 0);
    if (this.lights) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      const L = this.lightCol;
      this.lights[0].material.color.setHex(this.siren && on ? L[0][0] : L[0][1]);
      this.lights[1].material.color.setHex(this.siren && !on ? L[1][0] : L[1][1]);
    }
    if (this.steerW && dt) {
      const yr = Math.atan2(Math.sin(this.yaw - (this._syaw ?? this.yaw)), Math.cos(this.yaw - (this._syaw ?? this.yaw))) / dt;
      this._syaw = this.yaw;
      this._syr = damp(this._syr || 0, yr, 6, dt);
      const st = this.steer || clamp(-this._syr * 0.9, -1, 1);
      const W = this.steerW; W.a = damp(W.a, -st * (W.S.r > 0.2 ? 3 : 2.4), 8, dt); // ডানে মোড় = ঘড়ির কাঁটার দিকে
      W.inner.rotation.z = W.a;
    }
    if (this.type === 'bike') {
      // মোড় কতটা: খেলোয়াড়ের হ্যান্ডেল, না হলে (রাস্তার বাইক) ঘোরার হার থেকে; চালক এটা দেখে শরীর হেলায়
      const yr = dt ? Math.atan2(Math.sin(this.yaw - (this._byaw ?? this.yaw)), Math.cos(this.yaw - (this._byaw ?? this.yaw))) / dt : 0;
      this._byaw = this.yaw;
      this.yawRate = damp(this.yawRate || 0, yr, 8, dt || 0.016);
      this.steerEff = this.steer || clamp(-this.yawRate * 0.8, -1, 1);
      let target = -this.steerEff * clamp(this.speed / 12, 0, 1) * 0.45;
      // থেমে থাকলে চালক বাম পা মাটিতে দেয়, বাইক সেদিকে একটু কাত
      if ((this.driver || this.ai) && Math.abs(this.speed) < 0.7 && !this.wrecked) target = 0.08;
      this.lean = damp(this.lean, target, 6, dt);
      this.g.rotation.z = this.lean;
    }
    if (this.wheels.length || this.mWheels) {
      this.spin += (this.speed / 0.33) * dt;
      for (const w of this.wheels) w.rotation.x = -this.spin;
      if (this.mWheels && this.lodNear) for (const w of this.mWheels) w.rotation.x = -this.spin;
    }
    this.updateLamps(dt);
    if (this.mSiren) {
      const on = this.siren && Math.floor(performance.now() / 180) % 2 === 0;
      this.mSiren.emissive.setHex(!this.siren ? 0 : on ? 0xff2a2a : 0x2a4dff);
    }
  }
}
