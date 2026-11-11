// আরও যানবাহন: ইজিবাইক, ব্যাটারি রিকশা, লেগুনা, ট্রাক, পিকআপ, ভ্যানগাড়ি
import { SPECS, BUILDERS, HP, MASS, TOP_H, THROW, SIDE_FLIP, TURN_FLIP, wheel, plate, CNG_BACK, RICK_BACK } from './vehicles.js';
import * as THREE from 'three';
import { lam, bas, addBox, addPlane, texMat } from './lib3d.js';
import { paintTex } from './textures.js';
import { pick } from './utils.js';
import { art } from './vehicleart.js';
import { rickArt } from './vehicles.js';

// গতি মি/সে: ইজিবাইক ৪০, ব্যাটারি রিকশা ৩০, লেগুনা ৬০, ট্রাক ৭০, পিকআপ ১০০, ভ্যান ২০ কিমি/ঘণ্টা
Object.assign(SPECS, {
  easybike: {
    name: 'ইজিবাইক', max: 11.1, accel: 4, brake: 8, rev: 2, turn: 1.6, len: 3.0, wid: 1.3, r: 0.7,
    circles: [-0.8, 0.8], seat: { x: 0, y: 0.85, z: -0.75 }, pose: 'bike', door: { x: 1.1, z: -0.7 },
    pass: { x: 0.3, y: 0.8, z: 0.7 }, passPose: 'sit', engine: 'easybike', fare: 0.9,
  },
  autorickshaw: {
    name: 'ব্যাটারি রিকশা', max: 8.3, accel: 3, brake: 6, rev: 1, turn: 1.7, len: 2.4, wid: 1.2, r: 0.65,
    circles: [-0.6, 0.55], seat: { x: 0, y: 1.0, z: -0.4 }, pose: 'bike', door: { x: 1.1, z: -0.3 },
    pass: { x: 0, y: 1.2, z: 0.55 }, passPose: 'sit', engine: 'autorickshaw', fare: 0.85,
  },
  leguna: {
    name: 'লেগুনা', max: 16.7, accel: 4.5, brake: 8, rev: 2.5, turn: 1.2, len: 4.3, wid: 1.7, r: 0.9,
    circles: [-1.3, 0, 1.3], seat: { x: 0.38, y: 0.6, z: -1.35 }, pose: 'drive', door: { x: 1.5, z: -1.3 },
    pass: { x: -0.38, y: 0.6, z: -1.35 }, passPose: 'sit', engine: 'leguna', fare: 1.1,
  },
  truck: {
    name: 'ট্রাক', max: 18, accel: 2.4, brake: 4.8, rev: 1.2, turn: 0.68, len: 7.6, wid: 2.4, r: 1.25,
    circles: [-2.6, -0.9, 0.9, 2.6], seat: { x: 0.5, y: 1.35, z: -2.85 }, pose: 'drive', door: { x: 2.0, z: -2.8 },
    pass: { x: -0.5, y: 1.35, z: -2.85 }, passPose: 'sit', engine: 'truck', fare: 0.6,
  },
  pickup: {
    name: 'পিকআপ', max: 27.8, accel: 6.5, brake: 10, rev: 4, turn: 1.15, len: 4.9, wid: 1.85, r: 0.98,
    circles: [-1.55, 0, 1.55], seat: { x: 0.38, y: 0.55, z: -0.75 }, pose: 'drive', door: { x: 1.75, z: -0.7 },
    pass: { x: -0.38, y: 0.55, z: -0.75 }, passPose: 'sit', engine: 'pickup', fare: 1.2,
  },
  van: {
    name: 'ভ্যানগাড়ি', max: 5.6, accel: 1.4, brake: 6, rev: 1, turn: 1.6, len: 2.8, wid: 1.3, r: 0.7,
    circles: [-0.7, 0.7], seat: { x: 0, y: 1.0, z: -0.75 }, pose: 'pedal', door: { x: 1.1, z: -0.7 },
    pass: { x: 0, y: 1.05, z: 0.6 }, passPose: 'sit', engine: 'van', fare: 0.6,
  },
});
Object.assign(HP, { easybike: 70, autorickshaw: 45, leguna: 110, truck: 260, pickup: 120, van: 40 });
Object.assign(MASS, { easybike: 2.2, autorickshaw: 1.25, leguna: 4.5, truck: 22, pickup: 5, van: 1.35 });
Object.assign(TOP_H, { easybike: 2.0, autorickshaw: 2.1, leguna: 2.1, truck: 3.4, pickup: 1.8, van: 1.2 });
Object.assign(THROW, { autorickshaw: 6.5, van: 6 });
Object.assign(SIDE_FLIP, { easybike: 10, autorickshaw: 4.2, leguna: 18, truck: 999, pickup: 24, van: 4.2 });
Object.assign(TURN_FLIP, { easybike: 9.2, autorickshaw: 5.5, leguna: 15.5, truck: 999 });
// খোলা যানবাহন: ধাক্কায় চালক ছিটকে পড়ে, নিজে তুলে সোজা করা যায়
export const OPEN = new Set(['bike', 'rickshaw', 'autorickshaw', 'van']);
// ভারী যানবাহন: পাশ থেকে ধাক্কায় ছোট গাড়ি উল্টে দেয়
export const HEAVY = new Set(['bus', 'truck']);

const glassM = () => lam(0x1a2430);

BUILDERS.easybike = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  const color = pick([0x2e9e4f, 0x1e88c8, 0xe0a020, 0x8e44ad]);
  const roof = pick([0xf2c230, 0xffffff, 0x2e9e4f]);
  addBox(g, 1.25, 0.22, 2.9, lam(0x2a2a2a), 0, 0.45, 0.05);
  addBox(g, 1.2, 0.85, 0.85, lam(color), 0, 0.95, -1.05); // সামনের অংশ
  addBox(g, 1.1, 0.55, 0.05, glassM(), 0, 1.6, -1.42);
  addBox(g, 0.05, 0.5, 1.9, lam(color), -0.62, 0.82, 0.55);
  addBox(g, 0.05, 0.5, 1.9, lam(color), 0.62, 0.82, 0.55);
  for (const z of [0.15, 1.15]) {
    addBox(g, 1.1, 0.12, 0.42, lam(0x6d2a1f), 0, 0.75, z); // মুখোমুখি বসার বেঞ্চ
    addBox(g, 1.1, 0.4, 0.06, lam(0x6d2a1f), 0, 0.98, z === 0.15 ? -0.08 : 1.38);
  }
  for (const [x, z] of [[-0.6, -1.4], [0.6, -1.4], [-0.6, 1.45], [0.6, 1.45]]) addBox(g, 0.05, 1.3, 0.05, lam(0x888888), x, 1.45, z);
  addBox(g, 1.35, 0.07, 3.05, lam(roof), 0, 2.1, 0);
  addBox(g, 0.5, 0.05, 0.05, lam(0x999999), 0, 1.2, -1.2);
  addBox(g, 0.18, 0.12, 0.05, bas(0xfff6d6), 0, 1.15, -1.48);
  addPlane(g, 1.0, 0.28, texMat(paintTex(pick(CNG_BACK), null, '#ffffff', '#c0161c', 384, 110)), 0, 0.82, 1.52, 0);
  // পাশে রঙিন লেখা, সামনে ফুলের ছবি, ছাদে ঝালর, আয়না
  for (const s of [-1, 1]) { art(g, 'decal', null, 1.9, 0.34, s * 0.656, 0.82, 0.55, s * Math.PI / 2); addBox(g, 0.16, 0.1, 0.05, lam(0x1a1a1a), s * 0.72, 1.48, -1.32); }
  art(g, 'rick', 2, 1.15, 0.42, 0, 0.78, -1.482, Math.PI);
  art(g, 'fringe', null, 1.35, 0.24, 0, 1.95, -1.52, 0);
  wheel(g, 0.3, 0.12, 0, 0.3, -1.2, wheels, dyn);
  wheel(g, 0.3, 0.12, -0.6, 0.3, 1.0, wheels, dyn);
  wheel(g, 0.3, 0.12, 0.6, 0.3, 1.0, wheels, dyn);
  return { g, wheels, color };
};
BUILDERS.autorickshaw = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  const color = pick([0x1e88c8, 0xe85d1a, 0x22a6b3, 0xd81b60]);
  const hood = pick([0x1f4fa8, 0x0f7a3d, 0xc0161c]);
  addBox(g, 1.15, 0.12, 0.85, lam(0x2a2a2a), 0, 0.72, 0.5);
  addBox(g, 0.85, 0.3, 0.55, lam(0x111111), 0, 0.5, 0.5); // ব্যাটারি
  addBox(g, 1.1, 0.4, 0.75, lam(color), 0, 0.98, 0.5);
  addBox(g, 1.05, 0.12, 0.6, lam(0x2a3f7a), 0, 1.22, 0.5);
  addBox(g, 1.18, 0.9, 0.85, lam(hood), 0, 1.78, 0.72);
  addBox(g, 1.2, 0.1, 0.9, lam(color), 0, 2.27, 0.72);
  addBox(g, 0.08, 0.08, 1.3, lam(0x333333), 0, 0.72, -0.3);
  addBox(g, 0.3, 0.1, 0.32, lam(0x222222), 0, 1.0, -0.4);
  addBox(g, 0.6, 0.04, 0.04, lam(0x999999), 0, 1.15, -0.95);
  addBox(g, 0.14, 0.1, 0.05, bas(0xfff6d6), 0, 1.05, -1.05);
  addBox(g, 1.0, 0.45, 0.05, lam(color), 0, 0.85, 0.92);
  rickArt(g, Math.floor(Math.random() * 5));
  wheel(g, 0.33, 0.08, 0, 0.33, -0.95, wheels, dyn);
  wheel(g, 0.36, 0.08, -0.56, 0.36, 0.55, wheels, dyn);
  wheel(g, 0.36, 0.08, 0.56, 0.36, 0.55, wheels, dyn);
  return { g, wheels, color };
};
BUILDERS.leguna = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  const color = pick([0xf2f2f2, 0x3aa5a0, 0xd8c39a]);
  addBox(g, 1.7, 0.35, 4.3, lam(0x2a2a2a), 0, 0.55, 0);
  addBox(g, 1.65, 1.3, 1.3, lam(color), 0, 1.25, -1.45);
  addBox(g, 1.55, 0.55, 0.05, glassM(), 0, 1.55, -2.11);
  addBox(g, 1.7, 1.55, 2.85, lam(color), 0, 1.45, 0.65);
  addBox(g, 1.72, 0.35, 2.5, glassM(), 0, 1.75, 0.6); // পাশের জানালা
  addBox(g, 1.74, 0.12, 4.3, lam(0x2e7d32), 0, 0.95, 0); // সবুজ দাগ
  for (const s of [-1, 1]) { art(g, 'decal', null, 2.7, 0.36, s * 0.856, 1.12, 0.65, s * Math.PI / 2); addBox(g, 0.16, 0.12, 0.05, lam(0x1a1a1a), s * 0.95, 1.6, -1.95); }
  art(g, 'fringe', null, 1.55, 0.22, 0, 1.82, -2.14, 0);
  for (const [x, z, c] of [[-0.4, 0.3, 0x8d6e63], [0.35, 0.8, 0x1d63c8], [0, 1.0, 0xd7c49e]]) addBox(g, 0.55, 0.32, 0.5, lam(c), x, 2.46, z); // ছাদে মাল
  addBox(g, 1.6, 0.06, 1.0, lam(0x555555), 0, 2.27, 0.6); // ছাদের তাক
  addBox(g, 0.6, 0.06, 0.4, lam(0x777777), 0.4, 0.42, 2.25); // পিছনের পাদানি
  for (const x of [-0.55, 0.55]) addBox(g, 0.28, 0.12, 0.05, bas(0xfff6d6), x, 0.95, -2.13);
  addPlane(g, 1.4, 0.3, texMat(paintTex('মিরপুর ১০ — ফার্মগেট', null, '#111111', '#ffb627', 512, 100)), 0, 2.0, -2.14, Math.PI);
  plate(g, 0, 0.6, 2.16, 0.55);
  for (const [x, z] of [[-0.8, -1.35], [0.8, -1.35], [-0.8, 1.35], [0.8, 1.35]]) wheel(g, 0.35, 0.22, x, 0.35, z, wheels, dyn);
  return { g, wheels, color };
};
BUILDERS.truck = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  const cab = pick([0xc62828, 0xf2c230, 0x1565c0, 0x2e7d32]);
  const bed = pick([0x8a5a2b, 0xd84315, 0x6a1b9a]);
  addBox(g, 2.3, 0.4, 7.4, lam(0x222222), 0, 0.75, 0);
  addBox(g, 2.3, 1.9, 1.8, lam(cab), 0, 1.85, -2.8);
  addBox(g, 2.1, 0.75, 0.05, glassM(), 0, 2.3, -3.71);
  addBox(g, 2.32, 0.25, 1.82, lam(0xf2f2f2), 0, 2.85, -2.8); // মাথার উপর রঙিন পটি
  // ট্রাক আর্ট: দুই পাশ আর পিছনের ডালায় আঁকা, কেবিনের মাথায় নকশা-বোর্ড, দরজায় ফুল, আয়না
  const ti = Math.floor(Math.random() * 4);
  for (const s of [-1, 1]) {
    art(g, 'truck', ti, 5.1, 1.4, s * 1.226, 1.8, 0.85, s * Math.PI / 2);
    art(g, 'rick', 2, 1.2, 0.7, s * 1.156, 1.6, -2.8, s * Math.PI / 2);
    addBox(g, 0.06, 0.5, 0.06, lam(0x1a1a1a), s * 1.3, 2.25, -3.55);
    addBox(g, 0.1, 0.45, 0.28, lam(0x1a1a1a), s * 1.36, 2.3, -3.6);
  }
  art(g, 'truck', ti, 2.36, 1.4, 0, 1.8, 3.426, 0);
  art(g, 'crown', null, 2.3, 0.44, 0, 3.03, -3.72, Math.PI);
  addBox(g, 2.4, 0.15, 5.1, lam(bed), 0, 1.05, 0.85);
  for (const s of [-1, 1]) addBox(g, 0.08, 1.4, 5.1, lam(bed), s * 1.18, 1.8, 0.85);
  addBox(g, 2.4, 1.4, 0.08, lam(bed), 0, 1.8, 3.38);
  addBox(g, 2.42, 0.18, 5.12, lam(0xf2c230), 0, 2.45, 0.85); // কিনারায় হলুদ দাগ
  addPlane(g, 2.1, 0.55, texMat(paintTex('হর্ন দিন', 'ধীরে চলুন · আল্লাহর নামে চলিলাম', '#ffd400', '#c0161c', 512, 140)), 0, 1.75, 3.435, 0);
  for (const x of [-0.85, 0.85]) addBox(g, 0.3, 0.15, 0.05, bas(0xfff6d6), x, 1.25, -3.72);
  plate(g, 0, 0.95, 3.44, 0.6);
  for (const z of [-2.6, 1.6, 2.7]) for (const x of [-1.05, 1.05]) wheel(g, 0.5, 0.32, x, 0.5, z, wheels, dyn);
  return { g, wheels, color: cab };
};
BUILDERS.pickup = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  const color = pick([0xf4f4f4, 0x9e9e9e, 0x1b5e20, 0x263238]);
  addBox(g, 1.85, 0.6, 4.8, lam(color), 0, 0.75, 0);
  addBox(g, 1.8, 0.75, 1.9, lam(color), 0, 1.4, -0.75);
  addBox(g, 1.7, 0.6, 0.05, glassM(), 0, 1.45, -1.71);
  addBox(g, 1.82, 0.5, 1.6, glassM(), 0, 1.5, -0.7);
  for (const s of [-1, 1]) addBox(g, 0.08, 0.45, 2.1, lam(color), s * 0.9, 1.25, 1.3);
  addBox(g, 1.85, 0.45, 0.08, lam(color), 0, 1.25, 2.38);
  addBox(g, 0.9, 0.5, 0.8, lam(0x8d6e63), -0.3, 1.25, 1.2); // পিছনে মাল
  for (const s of [-1, 1]) addBox(g, 0.18, 0.12, 0.06, lam(0x1a1a1a), s * 1.0, 1.55, -1.45);
  addBox(g, 1.0, 0.22, 0.04, lam(0x1a1a1a), 0, 0.85, -2.42);
  for (const x of [-0.6, 0.6]) { addBox(g, 0.32, 0.12, 0.05, bas(0xfff6d6), x, 0.9, -2.42); addBox(g, 0.25, 0.12, 0.05, bas(0xd01818), x, 0.95, 2.42); }
  plate(g, 0, 0.6, 2.43, 0.55);
  for (const [x, z] of [[-0.85, -1.55], [0.85, -1.55], [-0.85, 1.55], [0.85, 1.55]]) wheel(g, 0.38, 0.25, x, 0.38, z, wheels, dyn);
  return { g, wheels, color };
};
BUILDERS.van = (dyn) => {
  const g = new THREE.Group(), wheels = [];
  addBox(g, 1.3, 0.08, 1.7, lam(0x8a5a2b), 0, 0.78, 0.5); // কাঠের পাটাতন
  addBox(g, 0.08, 0.08, 1.4, lam(0x333333), 0, 0.72, -0.55);
  addBox(g, 0.28, 0.08, 0.3, lam(0x5a2a22), 0, 1.0, -0.75);
  addBox(g, 0.55, 0.04, 0.04, lam(0x999999), 0, 1.15, -1.25);
  // উপরে বস্তা আর ঝুড়ি
  for (const [x, z, c] of [[-0.3, 0.2, 0xd7c49e], [0.3, 0.3, 0xcbb68a], [0, 0.9, 0xb5a07a]]) addBox(g, 0.55, 0.45, 0.5, lam(c), x, 1.05, z);
  wheel(g, 0.36, 0.08, 0, 0.36, -1.25, wheels, dyn);
  wheel(g, 0.38, 0.08, -0.62, 0.38, 0.55, wheels, dyn);
  wheel(g, 0.38, 0.08, 0.62, 0.38, 0.55, wheels, dyn);
  return { g, wheels, color: 0x8a5a2b };
};
