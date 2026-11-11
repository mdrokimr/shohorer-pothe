// আসল ঢাকার রাস্তার মতো: ভাঙা পিচ, ফাটল, তালি দেওয়া অংশ, গর্ত আর জমা পানি (গাড়ি ঝাঁকি খায়),
// আর রাস্তা মেরামতের কাজ: খোঁড়া গর্ত, মাটি-ইট-বালির স্তূপ, পাইপ, লাল-সাদা ব্যারিকেড, কোন, রোলার, কাজের লোক, সাবধান বোর্ড
import * as THREE from 'three';
import { lam, addBox, addCyl, mergeStatic } from './lib3d.js';
import { Tris } from './world.js';
import { Atlas } from './art.js';
import { FONT } from './textures.js';
import { makeRig, setPose } from './rig.js';
import { pick, rand, clamp } from './utils.js';

// ---------- আঁকা ছবি ----------
function rough(c, cx, cy, r, n, j) {
  c.beginPath();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (1 - j + Math.random() * j * 2); c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); }
  c.closePath();
}
function gravel(c, x0, y0, w, h, n, cols) {
  for (let i = 0; i < n; i++) { c.fillStyle = pick(cols); const s = 1 + Math.random() * 3; c.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, s, s); }
}
const GRAV = ['#6b6259', '#8a8076', '#4a443e', '#9b8f82', '#b0623a'];
// ফাটল ধরা পিচ (মাকড়সার জালের মতো)
function crackArt(c, w, h) {
  c.clearRect(0, 0, w, h);
  c.strokeStyle = 'rgba(18,16,14,0.85)'; c.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = w * (0.15 + Math.random() * 0.7), y = h * (0.2 + Math.random() * 0.6);
    c.lineWidth = 1.5 + Math.random() * 2; c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < 9; i++) { x += rand(-22, 22); y += rand(-12, 12); c.lineTo(clamp(x, 4, w - 4), clamp(y, 4, h - 4)); }
    c.stroke();
  }
  // ছোট ছোট উঠে যাওয়া টুকরো
  for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(30,27,24,0.7)'; rough(c, w * (0.2 + Math.random() * 0.6), h * (0.25 + Math.random() * 0.5), 6 + Math.random() * 8, 8, 0.4); c.fill(); }
}
// কিনারায় ভেঙে যাওয়া পিচ: নিচের ইট-খোয়া বেরিয়ে আছে
function edgeArt(c, w, h) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(122,98,72,0.95)';
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x += 12) c.lineTo(x, h * (0.25 + Math.sin(x * 0.05) * 0.12 + Math.random() * 0.25));
  c.lineTo(w, h); c.closePath(); c.fill();
  gravel(c, 0, h * 0.4, w, h * 0.6, 260, GRAV);
  c.strokeStyle = 'rgba(15,13,12,0.8)'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(0, h * 0.35);
  for (let x = 0; x <= w; x += 12) c.lineTo(x, h * (0.22 + Math.sin(x * 0.05) * 0.12 + Math.random() * 0.2));
  c.stroke();
}
// তালি দেওয়া নতুন পিচ (একটু কালো, চারপাশে দাগ)
function patchArt(c, w, h) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(28,28,30,0.92)';
  c.beginPath(); c.moveTo(w * 0.06, h * 0.12); c.lineTo(w * 0.94, h * 0.08); c.lineTo(w * 0.9, h * 0.9); c.lineTo(w * 0.1, h * 0.94); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(12,12,12,0.9)'; c.lineWidth = 3; c.stroke();
  gravel(c, w * 0.1, h * 0.12, w * 0.8, h * 0.76, 90, ['#3a3a3c', '#202022', '#4a4a4c']);
}
// গর্ত: ভিতরে অন্ধকার, ধারে ভাঙা পিচ, খোয়া; পানি থাকলে আকাশের আলো
function holeArt(c, w, h, water) {
  c.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44;
  c.fillStyle = 'rgba(70,62,54,0.9)'; rough(c, cx, cy, r, 18, 0.18); c.fill();
  gravel(c, cx - r, cy - r * 0.8, r * 2, r * 1.6, 120, GRAV);
  const g = c.createRadialGradient(cx, cy, 2, cx, cy, r * 0.8);
  if (water) { g.addColorStop(0, 'rgba(78,96,112,0.95)'); g.addColorStop(0.8, 'rgba(62,74,80,0.95)'); g.addColorStop(1, 'rgba(60,55,48,0.9)'); }
  else { g.addColorStop(0, 'rgba(10,9,8,0.95)'); g.addColorStop(0.75, 'rgba(32,28,24,0.95)'); g.addColorStop(1, 'rgba(60,54,46,0.8)'); }
  c.fillStyle = g; rough(c, cx, cy, r * 0.75, 14, 0.15); c.fill();
  if (water) { c.fillStyle = 'rgba(220,235,255,0.35)'; c.beginPath(); c.ellipse(cx - r * 0.2, cy - r * 0.15, r * 0.3, r * 0.08, -0.3, 0, 7); c.fill(); }
  c.strokeStyle = 'rgba(15,13,12,0.85)'; c.lineWidth = 2; rough(c, cx, cy, r * 0.98, 18, 0.12); c.stroke();
}
// খোঁড়া জায়গা: ভেজা মাটি, কাদা
function pitArt(c, w, h) {
  c.fillStyle = '#5b4330'; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0.0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(w * 0.08, h * 0.15, w * 0.84, h * 0.7);
  gravel(c, 0, 0, w, h, 300, ['#7a5a3e', '#3e2c1e', '#8d6e50', '#b0623a']);
  c.fillStyle = 'rgba(90,110,120,0.55)'; c.beginPath(); c.ellipse(w * 0.6, h * 0.55, w * 0.12, h * 0.12, 0, 0, 7); c.fill();
}
function stripeArt(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  for (let x = -h; x < w + h; x += 40) { c.fillStyle = '#d01818'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 20, 0); c.lineTo(x + 20 - h, h); c.lineTo(x - h, h); c.fill(); }
}
function noticeArt(c, w, h, t1, t2) {
  c.fillStyle = '#ffd400'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#111'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
  // সাবধান ত্রিভুজ
  c.fillStyle = '#d01818'; c.beginPath(); c.moveTo(h * 0.5, h * 0.18); c.lineTo(h * 0.86, h * 0.8); c.lineTo(h * 0.14, h * 0.8); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(h * 0.5, h * 0.32); c.lineTo(h * 0.73, h * 0.72); c.lineTo(h * 0.27, h * 0.72); c.fill();
  c.fillStyle = '#111'; c.fillRect(h * 0.47, h * 0.42, h * 0.06, h * 0.18); c.fillRect(h * 0.47, h * 0.63, h * 0.06, h * 0.05);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const fit = (t, y, s, col) => { let z = s; c.font = `700 ${z}px ${FONT}`; while (c.measureText(t).width > w - h - 20 && z > 10) { z -= 2; c.font = `700 ${z}px ${FONT}`; } c.fillStyle = col; c.fillText(t, (w + h) / 2, y); };
  fit(t1, h * 0.38, h * 0.26, '#111');
  fit(t2, h * 0.72, h * 0.17, '#b71c1c');
}

export class RoadWorks {
  constructor(g) {
    this.g = g;
    this.M = g.map; this.W = g.world;
    this.holes = [];
    this.zones = [];
    this.people = [];
    this.count = { holes: 0, broken: 0, zones: 0 };
    const A = (this.atlas = new Atlas(1024, 1024));
    this.cell = {
      crack: [0, 1, 2].map(() => A.add(256, 128, crackArt)),
      edge: [0, 1].map(() => A.add(256, 96, edgeArt)),
      patch: [0, 1].map(() => A.add(192, 128, patchArt)),
      hole: [0, 1, 2].map(() => A.add(128, 128, (c, w, h) => holeArt(c, w, h, false))),
      water: [0, 1].map(() => A.add(128, 128, (c, w, h) => holeArt(c, w, h, true))),
      pit: A.add(256, 128, pitArt),
      stripe: A.add(256, 32, stripeArt),
      notice: A.add(512, 128, (c, w, h) => noticeArt(c, w, h, 'সামনে রাস্তার কাজ চলছে', 'ধীরে চলুন · সাময়িক অসুবিধার জন্য দুঃখিত')),
      notice2: A.add(512, 128, (c, w, h) => noticeArt(c, w, h, 'রাস্তা মেরামত চলিতেছে', 'বাম লেন বন্ধ · সাবধানে চলুন')),
    };
    const tex = A.texture();
    this.decalMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.boardMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    this.blinkM = new THREE.MeshBasicMaterial({ color: 0xff8a00 });
    this.dec = new Tris();
    this.boards = new Tris();
    this.stat = new THREE.Group();
    try { this.buildZones(); } catch (e) { console.warn('roadworks zones', e); }
    try { this.buildDamage(); } catch (e) { console.warn('roadworks damage', e); }
    this.finish();
    // গর্তের খোঁজ দ্রুত করার গ্রিড
    this.grid = new Map();
    for (const h of this.holes) { const k = Math.floor(h.x / 20) + ',' + Math.floor(h.z / 20); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(h); }
    this.t = 0;
  }
  // রাস্তার ফ্রেমে বিন্দু: t = লম্বায়, lat = বাম দিকে (চলার দিকে a→b)
  at(s, t, lat) { const Lx = s.dir.z, Lz = -s.dir.x; return [s.ax + s.dir.x * t + Lx * lat, s.az + s.dir.z * t + Lz * lat]; }
  // রাস্তার ওপর আঁকা ছবি: কেন্দ্র (t,lat), লম্বায় len, চওড়ায় wid
  decal(s, t, lat, len, wid, c, y = 0.079) {
    const P = (a, b) => { const [x, z] = this.at(s, t + a, lat + b); return [x, y, z]; };
    const hl = len / 2, hw = wid / 2;
    this.dec.quad(P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw), [c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v1], [0, 1, 0]);
  }
  freeAt(x, z, r) { const D = this.g.dress; return D ? D.free(x, z, r) : !this.W.blocked(x, 1, z); }
  nearJunction(s, t, pad) {
    const nw = this.W.nodeW || [];
    const ra = (nw[s.a] && nw[s.a].r) || 6, rb = (nw[s.b] && nw[s.b].r) || 6;
    return t < ra + pad || t > s.len - rb - pad;
  }

  // ---------- গর্ত, ফাটল, ভাঙা কিনারা, তালি ----------
  buildDamage() {
    for (const s of this.M.segments) {
      if (s.len < 14 || s.bridge) continue;
      const hw = s.width / 2;
      const busy = s.main ? 0.22 : 0.32;
      for (let t = 8 + Math.random() * 20; t < s.len - 6; t += 22 + Math.random() * 20) {
        const r = Math.random();
        if (s.work && t > s.work.t0 - 4 && t < s.work.t1 + 4) continue;
        if (r < busy) {
          // গর্ত (কখনো কয়েকটা একসাথে)
          const n = Math.random() < 0.3 ? 2 + (Math.random() * 2 | 0) : 1;
          const lat0 = rand(-hw + 0.8, hw - 0.8);
          for (let i = 0; i < n; i++) {
            const tt = t + rand(-1.5, 1.5), lat = clamp(lat0 + rand(-1, 1), -hw + 0.6, hw - 0.6);
            const rr = rand(0.35, i ? 0.6 : 0.95), water = Math.random() < 0.35;
            const [x, z] = this.at(s, tt, lat);
            const c = water ? pick(this.cell.water) : pick(this.cell.hole);
            this.decal(s, tt, lat, rr * 2.3, rr * 2.3, c, 0.08);
            this.holes.push({ x, z, r: rr, water });
            this.count.holes++;
          }
        } else if (r < busy + 0.16) {
          this.decal(s, t, rand(-hw + 1.2, hw - 1.2), rand(2.4, 4.2), rand(1.4, 2.2), pick(this.cell.crack));
          this.count.broken++;
        } else if (r < busy + 0.26) {
          // কিনারা ভেঙে খোয়া বেরিয়ে আছে (ছবির নিচের দিক কিনারার দিকে)
          const sd = Math.random() < 0.5 ? 1 : -1, wid = rand(0.9, 1.5), len = rand(3, 6);
          const lat = sd * (hw - wid / 2);
          const c = pick(this.cell.edge);
          const cc = sd > 0 ? { u0: c.u0, u1: c.u1, v0: c.v1, v1: c.v0 } : c; // খোয়ার দিক কিনারায়
          this.decal(s, t, lat, len, wid, cc);
          this.count.broken++;
        } else if (r < busy + 0.34) {
          this.decal(s, t, rand(-hw + 1.4, hw - 1.4), rand(2, 3.6), rand(1.4, 2.4), pick(this.cell.patch), 0.078);
          this.count.broken++;
        }
      }
    }
  }

  // ---------- রাস্তা মেরামতের কাজ ----------
  buildZones() {
    const M = this.M, W = this.W;
    const cands = M.segments.filter((s) => s.main && !s.oneway && !s.bridge && s.width >= 8 && s.len >= 55).sort(() => Math.random() - 0.5);
    const yellow = lam(0xf2b705), dark = lam(0x2b2b2b), dirt = lam(0x6d4c35), brick = lam(0xb5532f), sand = lam(0xd8c08a), conc = lam(0x9e9a92), orange = lam(0xff6d00), white = lam(0xf2f2f2), wood = lam(0x8d6e4a);
    for (const s of cands) {
      if (this.zones.length >= 10) break;
      const Lz = rand(11, 16), D = clamp(s.width * 0.2, 1.5, 2.2);
      const t0 = rand(18, s.len - 18 - Lz);
      if (!(t0 > 0) || this.nearJunction(s, t0, 10) || this.nearJunction(s, t0 + Lz, 10)) continue;
      const side = Math.random() < 0.5 ? 1 : -1, hw = s.width / 2;
      const latC = side * (hw - D / 2);
      const [cx, cz] = this.at(s, t0 + Lz / 2, latC);
      if (this.zones.some((z) => Math.hypot(z.x - cx, z.z - cz) < 170)) continue;
      let ok = true;
      for (let k = 0; k <= Lz; k += 3) { const [x, z] = this.at(s, t0 + k, latC); if (!this.freeAt(x, z, D / 2)) { ok = false; break; } }
      if (!ok) continue;
      const zone = { s, t0, t1: t0 + Lz, side, depth: D, x: cx, z: cz, workers: [], spots: [], made: false };
      s.work = { side, depth: D + 0.3, t0, t1: t0 + Lz };
      this.zones.push(zone);
      this.count.zones++;
      const P = (t, lat, y = 0) => { const [x, z] = this.at(s, t, lat); return [x, y, z]; };
      const yaw = Math.atan2(s.dir.x, s.dir.z); // বাক্সের z-অক্ষ রাস্তার দিকে
      const box = (w, h, d, m, t, lat, y) => { const [x, , z] = P(t, lat); const b = addBox(this.stat, w, h, d, m, x, y, z); b.rotation.y = yaw; return b; };
      const inner = side * (hw - D); // লেনের দিকের কিনারা
      // খোঁড়া গর্ত (মাঝখানে) আর পাশে মাটি
      this.decal(s, t0 + Lz / 2, latC, Lz - 3, D - 0.5, this.cell.pit, 0.081);
      for (let k = 0; k < 3; k++) {
        const [x, , z] = P(t0 + 2 + Math.random() * (Lz - 4), latC + side * rand(-0.2, 0.4));
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.5, 0.8), 0), dirt);
        m.position.set(x, 0.15, z); m.scale.set(1.4, 0.55, 1.1); m.rotation.y = Math.random() * 6; this.stat.add(m);
      }
      // ইটের স্তূপ, বালি, পাইপ
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(0.9, 0.22, 0.45, brick, t0 + 1.4 + j * 0.5, latC + side * (0.25 - i * 0.24), 0.14 + i * 0.22);
      { const [x, , z] = P(t0 + Lz - 1.6, latC); const m = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 9), sand); m.position.set(x, 0.4, z); this.stat.add(m); }
      if (Math.random() < 0.7) for (let i = 0; i < 2; i++) {
        const [x, , z] = P(t0 + Lz / 2 + (i - 0.5) * 2.2, latC + side * 0.1);
        const p = addCyl(this.stat, 0.4, 0.4, 2.0, conc, x, 0.48, z, 12); p.rotation.set(0, yaw + Math.PI / 2, Math.PI / 2, 'YXZ'); // রাস্তা বরাবর শোয়ানো
      }
      // লাল-সাদা ব্যারিকেড: লেনের দিকে লম্বা, দুই মাথায় আড়াআড়ি
      const bar = (ta, la, tb, lb) => {
        const [ax, , az] = P(ta, la), [bx, , bz] = P(tb, lb);
        const L = Math.hypot(bx - ax, bz - az), nx = (bz - az) / L, nz = -(bx - ax) / L, c = this.cell.stripe;
        for (const y of [0.55, 0.95]) {
          const q = (u, v) => [ax + (bx - ax) * u, y + v * 0.13, az + (bz - az) * u];
          this.boards.quad(q(0, -1), q(1, -1), q(1, 1), q(0, 1), [c.u0, c.v0], [c.u0 + (c.u1 - c.u0) * Math.min(1, L / 3), c.v0], [c.u0 + (c.u1 - c.u0) * Math.min(1, L / 3), c.v1], [c.u0, c.v1], [nx, 0, nz]);
        }
        for (let u = 0; u <= L + 0.01; u += Math.min(L, 2.4)) { const x = ax + (bx - ax) * (u / L), z = az + (bz - az) * (u / L); addBox(this.stat, 0.07, 1.1, 0.07, white, x, 0.55, z); }
      };
      bar(t0, inner, t0 + Lz, inner);
      bar(t0, inner, t0, side * (hw - 0.15));
      bar(t0 + Lz, inner, t0 + Lz, side * (hw - 0.15));
      // মিটমিটে বাতি (ব্যারিকেডের মাথায়)
      for (const t of [t0, t0 + Lz / 2, t0 + Lz]) { const [x, , z] = P(t, inner); addBox(this.stat, 0.14, 0.14, 0.14, this.blinkM, x, 1.2, z); }
      // কোন: সামনের দিকে (যেদিক থেকে গাড়ি আসে) ঢালু করে
      const fromT = side > 0 ? -1 : 1; // বাম পাশে কাজ হলে গাড়ি a→b দিকে আসে, মানে t কম দিক থেকে
      const tStart = side > 0 ? t0 : t0 + Lz;
      for (let i = 1; i <= 5; i++) {
        const tt = tStart + fromT * i * 1.8, lat = side * (hw - (D * (1 - i / 6)) - 0.2);
        const [x, , z] = P(tt, lat);
        const cone = addCyl(this.stat, 0.04, 0.2, 0.6, orange, x, 0.3, z, 8);
        cone.userData.k = 1;
        addBox(this.stat, 0.36, 0.04, 0.36, dark, x, 0.02, z);
        addCyl(this.stat, 0.105, 0.14, 0.12, white, x, 0.33, z, 8);
      }
      // সাবধান বোর্ড: আসা গাড়ির দিকে মুখ করে, কাজের ২০ মিটার আগে কিনারায়; আর জায়গার মাঝে বড় বোর্ড
      const notice = (t, lat, w, h, c, face) => {
        const [x, , z] = P(t, lat);
        const fx = s.dir.x * face, fz = s.dir.z * face; // বোর্ডের মুখ
        const ax = fz, az = -fx; // যে দেখছে তার ডান দিক
        const q = (u, v) => [x + ax * u * w / 2, 1.4 + v * h / 2, z + az * u * w / 2];
        this.boards.quad(q(-1, -1), q(1, -1), q(1, 1), q(-1, 1), [c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v1], [fx, 0, fz]);
        for (const u of [-0.8, 0.8]) addBox(this.stat, 0.06, 1.4, 0.06, wood, x - ax * u * w / 2, 0.7, z - az * u * w / 2);
      };
      notice(tStart + fromT * 18, side * (hw - 0.4), 2.4, 0.6, this.cell.notice, fromT);
      notice(tStart + fromT * 0.5, side * (hw - D / 2), 2.0, 0.5, this.cell.notice2, fromT);
      // রোলার মেশিন (কখনো)
      if (Math.random() < 0.55) {
        const tt = side > 0 ? t0 + Lz - 3.2 : t0 + 3.2, la = latC;
        box(1.1, 0.9, 2.0, yellow, tt, la, 0.95);
        box(1.15, 0.12, 2.1, dark, tt, la, 1.45);
        box(0.9, 0.08, 1.0, yellow, tt, la, 2.3);
        for (const u of [-0.4, 0.4]) box(0.06, 0.8, 0.06, dark, tt + 0.4, la + u, 1.9);
        const [dx, , dz] = P(tt + 1.4 * fromT * -1, la), drum = addCyl(this.stat, 0.55, 0.55, 1.2, conc, dx, 0.55, dz, 14); drum.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
        const [wx, , wz] = P(tt - 1.0 * fromT * -1, la), wh = addCyl(this.stat, 0.45, 0.45, 1.2, dark, wx, 0.45, wz, 12); wh.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
      }
      // ধাক্কা লাগার জায়গা (মানুষ-গাড়ি দুটোই আটকায়)
      const poly = [P(t0, inner), P(t0 + Lz, inner), P(t0 + Lz, side * hw), P(t0, side * hw)].map((p) => [p[0], p[2]]);
      W.addPoly(poly, 1.2, 'works');
      // কাজের লোকের জায়গা (কাছে গেলে বানানো হয়)
      for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) {
        const tt = t0 + 2 + Math.random() * (Lz - 4), [x, , z] = P(tt, latC + side * rand(-0.3, 0.2));
        zone.spots.push({ x, z, yaw: Math.atan2(side * s.dir.z, -side * s.dir.x) + rand(-0.8, 0.8), pose: Math.random() < 0.65 ? 'swing' : 'idle' });
      }
      if (this.g.dress) this.g.dress.mark(cx, cz, Lz / 2);
    }
  }
  finish() {
    const sc = this.g.scene;
    if (this.dec.pos.length) { const m = this.dec.mesh(this.decalMat); m.receiveShadow = true; m.renderOrder = 1; m.userData.noShadow = true; sc.add(m); }
    if (this.boards.pos.length) { const m = this.boards.mesh(this.boardMat); m.castShadow = true; sc.add(m); }
    mergeStatic(this.stat, true, true);
    // মিটমিটে বাতি আলাদা রাখি (রং বদলায়) — একই ম্যাটেরিয়াল, মার্জ হলেও রং বদলানো যায়
    sc.add(this.stat);
  }
  // কাজের লোক: কাছে গেলে বানাও, দূরে গেলে সরাও
  workersFor(z, near) {
    const g = this.g;
    if (near && !z.made) {
      z.made = true;
      for (const sp of z.spots) {
        const rig = makeRig({ shirt: 0xff6d00, pants: pick([0x37474f, 0x5d4037, 0x1d2a3a]), helmet: 0xffd400 });
        rig.root.position.set(sp.x, 0.06, sp.z); rig.root.rotation.set(0, sp.yaw, 0);
        // কোদাল
        const sh = addBox(rig.root, 0.04, 0.04, 1.1, lam(0x6d4c41), 0.25, 0.9, -0.3); sh.rotation.x = -0.9;
        g.scene.add(rig.root);
        const o = { rig, x: sp.x, z: sp.z, pose: sp.pose, zone: z, used: true };
        z.workers.push(o); this.people.push(o);
      }
    } else if (!near && z.made) {
      z.made = false;
      for (const o of z.workers) { g.scene.remove(o.rig.root); const i = this.people.indexOf(o); if (i >= 0) this.people.splice(i, 1); }
      z.workers = [];
    }
  }
  // ধাক্কা খেয়ে ট্রাফিকের মানুষ হয়ে গেলে
  takePerson(o) {
    const i = this.people.indexOf(o); if (i >= 0) this.people.splice(i, 1);
    const k = o.zone.workers.indexOf(o); if (k >= 0) o.zone.workers.splice(k, 1);
    const s = o.zone.spots.find((p) => Math.abs(p.x - o.x) < 0.01 && Math.abs(p.z - o.z) < 0.01);
    if (s) o.zone.spots.splice(o.zone.spots.indexOf(s), 1);
  }
  update(dt) {
    const g = this.g, P = g.player.pos;
    this.t += dt;
    // মিটমিটে বাতি
    const on = Math.sin(this.t * 6) > 0;
    this.blinkM.color.setHex(on ? 0xffa000 : 0x5a2a00);
    this.zt = (this.zt || 0) - dt;
    if (this.zt <= 0) { this.zt = 1; for (const z of this.zones) this.workersFor(z, !g.inside && Math.hypot(z.x - P.x, z.z - P.z) < 110); }
    for (const o of this.people) setPose(o.rig, o.pose, dt, o.pose === 'swing' ? 1 : 0, 6);
    this.holeCheck(dt);
  }
  // গর্তে চাকা পড়লে ঝাঁকি
  holeCheck(dt) {
    const g = this.g, v = g.player.state === 'drive' ? g.player.vehicle : null;
    this.holeCool = Math.max(0, (this.holeCool || 0) - dt);
    if (!v || this.holeCool > 0 || (v.y || 0) > 0.5 || v.type === 'plane' || v.type === 'boat' || v.boat || /heli/.test(v.type)) return;
    const sp = Math.abs(v.speed);
    if (sp < 2) return;
    const cs = v.circles();
    const k = Math.floor(v.x / 20), kz = Math.floor(v.z / 20);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const h of this.grid.get(k + a + ',' + (kz + b)) || []) {
      if (!cs.some((c) => Math.hypot(c.x - h.x, c.z - h.z) < h.r + c.r * 0.6)) continue;
      this.holeCool = 0.45;
      const two = /bike|cycle|rickshaw|easy|van/.test(v.type);
      const j = Math.min(0.45, sp * 0.022 * (two ? 1.5 : 1) * (h.r / 0.7));
      g.shake = Math.max(g.shake || 0, j);
      g.sound.thud(Math.min(0.5, j));
      v.speed *= two ? 0.82 : 0.9;
      if (h.water && g.vfx && g.vfx.splash) g.vfx.splash(h.x, 0.1, h.z);
      if (sp > 15) { v.damage(two ? 3 : 2, 'player'); if (!this.warned) { this.warned = true; g.ui.toast('রাস্তায় গর্ত! জোরে চালালে গাড়ির ক্ষতি হয়', 'bad'); } }
      return;
    }
  }
}
