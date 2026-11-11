// মেট্রোরেল (ঢাকা মেট্রোর মতো): উড়াল লাইনে দুই দিকে চলন্ত ট্রেন, তিনটা আধুনিক স্টেশন (মিরপুর ১১, মিরপুর ১০, কাজীপাড়া),
// কাচের প্ল্যাটফর্ম দরজা, লিফট টাওয়ার; টিকিট কেটে যাত্রী হয়ে চড়া, নিজে চালানো, মেট্রো চালকের চাকরি
import * as THREE from 'three';
import { lam, bas, addBox, addCyl, mergeStatic, planeGeo, texMat, canvasTex, twoFace } from './lib3d.js';
import { signTex, paintTex } from './textures.js';
import { makeRig, setPose } from './rig.js';
import { FOOT } from './mapgen.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';
import { FONT } from './textures.js';

let _gapGeo = null;
const boxGapGeo = () => (_gapGeo || (_gapGeo = new THREE.BoxGeometry(0.02, 2.15, 1.4)));

const CAR_LEN = 18, GAP = 1, CARS = 3;
const TRAIN_LEN = CARS * CAR_LEN + (CARS - 1) * GAP;
const MAX_V = 22, ACC = 1.1, DEC = 1.3;
const PLAT_Y = 11.1, CAR_Y = 10.6;
const DWELL = 10, MIN_DWELL = 9;
const NAMES = ['মিরপুর ১১', 'মিরপুর ১০', 'কাজীপাড়া'];
const BODY_Y = CAR_Y + 0.75, BODY_H = 2.9, BODY_W = 2.9; // কামরার নিচ, উচ্চতা, চওড়া
const DOOR_Z = [-6.3, -2.1, 2.1, 6.3];
const WIRE_Y = 15.35; // উপরের বিদ্যুতের তার
const TERM = { A: 'কাজীপাড়া', B: 'মিরপুর ১১' };
const EN = ['Mirpur 11', 'Mirpur 10', 'Kazipara'];

function poly(points) {
  const segs = [];
  let acc = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    segs.push({ ax, az, bx, bz, L, s0: acc, dx: (bx - ax) / L, dz: (bz - az) / L });
    acc += L;
  }
  return { segs, len: acc };
}
function along(P, s) {
  s = clamp(s, 0, P.len);
  let g = P.segs[P.segs.length - 1];
  for (const q of P.segs) if (s <= q.s0 + q.L) { g = q; break; }
  const t = s - g.s0;
  return { x: g.ax + g.dx * t, z: g.az + g.dz * t, dx: g.dx, dz: g.dz };
}
function project(P, x, z) {
  let best = null;
  for (const g of P.segs) {
    const t = clamp((x - g.ax) * g.dx + (z - g.az) * g.dz, 0, g.L);
    const px = g.ax + g.dx * t, pz = g.az + g.dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: g.s0 + t };
  }
  return best;
}

export class Metro {
  constructor(g) {
    this.g = g;
    const R = g.map.rail;
    this.ok = R && R.length >= 2;
    this.trains = []; this.stations = []; this.stops = []; this.ride = null; this.drive = null; this.ticket = null;
    if (!this.ok) return;
    // দক্ষিণের শেষ মাথার বাঁকা অংশ (ডিপো) বাদ
    let A = R[0], B = R[1];
    if (A[0][1] > A[A.length - 1][1]) [A, B] = [B, A]; // A: উত্তর থেকে দক্ষিণ
    // শেষের ছোট বাঁকা টুকরা (ডিপোর দিকে) থাকলে বাদ
    const n = A.length;
    if (n > 2 && Math.hypot(A[n - 1][0] - A[n - 2][0], A[n - 1][1] - A[n - 2][1]) < 40) A = A.slice(0, -1);
    this.A = poly(A); this.B = poly(B);
    this.L = this.A.len + this.B.len;
    this.buildStations();
    this.buildTrack();
    this.buildTrains();
    this.hum = 0;
    this.clock = 0;
    this.buildTimetable();
    this.buildDisplays();
    // শুরুতেই ট্রেনগুলো সময়সূচিতে বসাতে কিছুক্ষণ আগে থেকে চালিয়ে রাখা
    for (let t = 0; t < this.LOOP * 2; t += 0.25) { this.clock += 0.25; for (const tr of this.trains) { this.updateTrain(tr, 0.25, true); tr.s = ((tr.s % this.L) + this.L) % this.L; } }
    for (const tr of this.trains) this.place(tr);
  }
  // পুরো লুপে (A তারপর B) s থেকে অবস্থান
  at(s) {
    s = ((s % this.L) + this.L) % this.L;
    return s < this.A.len ? along(this.A, s) : along(this.B, s - this.A.len);
  }
  ahead(from, to) { return (((to - from) % this.L) + this.L) % this.L; }

  // ---------- স্টেশন ----------
  buildStations() {
    const g = this.g;
    const st0 = g.map.pois.find((q) => q.k === 'station');
    const s10 = st0 ? project(this.A, st0.x, st0.z).s : this.A.len * 0.3;
    const sAs = [Math.min(60, s10 - 120), s10, this.A.len - 60];
    sAs.forEach((sA, i) => {
      const a = along(this.A, sA);
      const pb = project(this.B, a.x, a.z);
      const b = along(this.B, pb.s);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = a.x - b.x, nz = a.z - b.z;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; // A লাইনের বাইরের দিক
      const st = { name: NAMES[i], i, x: mx, z: mz, dx: a.dx, dz: a.dz, nx, nz, sA, sB: pb.s, rigs: { A: [], B: [] } };
      this.buildStation(st);
      this.stations.push(st);
      this.stops.push({ st, line: 'A', s: sA + TRAIN_LEN / 2 }, { st, line: 'B', s: this.A.len + pb.s + TRAIN_LEN / 2 });
    });
  }
  // স্টেশনের লোকাল বিন্দু (lat: A দিকে ধনাত্মক, lon: সামনে) থেকে দুনিয়া
  P(st, lat, lon) { return { x: st.x + st.nx * lat + st.dx * lon, z: st.z + st.nz * lat + st.dz * lon }; }
  buildStation(st) {
    const g = this.g, W = g.world;
    const grp = new THREE.Group();
    grp.position.set(st.x, 0, st.z);
    // local x = A দিক, local z = সামনে
    grp.rotation.y = Math.atan2(st.dx, st.dz);
    const sx = Math.sign(st.nx * st.dz - st.nz * st.dx) || 1; // local +x কি A দিকে
    const X = (lat) => lat * sx;
    const white = lam(0xf2f2f2), grey = lam(0x9ea7ad), green = lam(0x1f7a3d), red = lam(0xc62828);
    for (const side of [1, -1]) {
      addBox(grp, 4.2, 0.9, 70, lam(0xd7d2c8), X(side * 5.7), PLAT_Y - 0.45, 0); // প্ল্যাটফর্ম
      addBox(grp, 0.35, 0.02, 70, lam(0xf2c230), X(side * 4.1), PLAT_Y + 0.01, 0); // হলুদ দাগ
      addBox(grp, 0.12, 0.25, 70, lam(0x37474f), X(side * 3.65), PLAT_Y + 2.15, 0); // কাচের দরজার উপরের ফ্রেম
      for (let z = -33; z <= 33; z += 11) addBox(grp, 0.6, 7, 0.6, grey, X(side * 8.3), PLAT_Y + 3, z); // খুঁটি
    }
    // বেঞ্চ: প্ল্যাটফর্মের পিছনের দিকে
    for (const side of [1, -1]) for (const z of [-25, -8, 9, 26]) {
      addBox(grp, 0.55, 0.08, 2.4, lam(0x90a4ae), X(side * 7.05), PLAT_Y + 0.46, z);
      addBox(grp, 0.06, 0.5, 2.4, lam(0x90a4ae), X(side * 7.33), PLAT_Y + 0.75, z);
      for (const dz of [-1, 1]) addBox(grp, 0.4, 0.42, 0.08, lam(0x455a64), X(side * 7.05), PLAT_Y + 0.21, z + dz);
    }
    addBox(grp, 17.6, 0.45, 76, white, 0, 17.4, 0); // ছাদ
    // নিচের কনকোর্স তলা (টিকিট কাউন্টার, রাস্তার উপরে): সাদা-ধূসর বাক্স, কাচের সারি, সবুজ-লাল দাগ
    addBox(grp, 17.2, 0.5, 52, lam(0xe8e6e0), 0, 5.85, 0);
    addBox(grp, 17.2, 0.6, 52, lam(0xe8e6e0), 0, 8.55, 0);
    for (const side of [1, -1]) {
      addBox(grp, 0.3, 2.3, 52, lam(0x7fa7bf), X(side * 8.5), 7.1, 0); // কাচের দেয়াল (নীলচে)
      for (let z = -24; z <= 24; z += 3) addBox(grp, 0.34, 2.3, 0.14, lam(0xd0d4d6), X(side * 8.5), 7.1, z);
      addBox(grp, 0.36, 0.22, 52, green, X(side * 8.55), 8.35, 0);
      addBox(grp, 0.36, 0.1, 52, red, X(side * 8.55), 8.15, 0);
    }
    for (const z of [-26, 26]) addBox(grp, 17.2, 2.8, 0.3, lam(0xd8d6d0), 0, 7.1, z);
    for (const side of [1, -1]) { addBox(grp, 0.4, 0.9, 76, green, X(side * 8.8), 17.1, 0); addBox(grp, 0.42, 0.18, 76, red, X(side * 8.8), 16.6, 0); }
    for (const lat of [-5.5, 0, 5.5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 70), bas(0xfffbe8)); s.position.set(X(lat), 17.15, 0); grp.add(s); }
    // কাচ: প্ল্যাটফর্মের দরজা আর বাইরের দেয়াল (স্বচ্ছ)
    const glass = new THREE.MeshLambertMaterial({ color: 0xbfe3f0, transparent: true, opacity: 0.28, depthWrite: false });
    for (const side of [1, -1]) {
      for (const lat of [3.65, 7.75]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, lat > 5 ? 3.2 : 2.0, 70), glass); m.position.set(X(side * lat), PLAT_Y + (lat > 5 ? 1.6 : 1.0), 0); m.userData.noShadow = true; grp.add(m); }
      for (const z of [-12, 14]) {
        const sg = twoFace(new THREE.Mesh(planeGeo(4.2, 0.8), texMat(signTex(`${st.name} স্টেশন`, 'road'), { side: THREE.DoubleSide })));
        sg.position.set(X(side * 5.7), 15.2, z);
        sg.rotation.y = Math.PI / 2;
        grp.add(sg);
      }
    }
    // বাইরে থেকে দেখা বড় নাম
    for (const side of [1, -1]) {
      const sg = new THREE.Mesh(planeGeo(12, 1.6), texMat(signTex(`${st.name} মেট্রো স্টেশন`, 'road')));
      sg.position.set(X(side * 9.05), 16.4, 0);
      sg.rotation.y = side * sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(sg);
    }
    g.scene.add(grp);
    mergeStatic(grp, true, true);
    st.rotY = grp.rotation.y; st.sx = sx;
    // হাঁটার প্ল্যাটফর্ম আর দেয়াল (পড়ে যাওয়া যায় না)
    for (const side of [1, -1]) {
      const q = (l0, l1, a0, a1) => [this.P(st, side * l0, a0), this.P(st, side * l1, a0), this.P(st, side * l1, a1), this.P(st, side * l0, a1)].map((p) => [p.x, p.z]);
      W.addPoly(q(3.6, 7.8, -35, 35), PLAT_Y, 'platform').deck = true;
      for (const [l0, l1, a0, a1] of [[3.45, 3.75, -35, 35], [7.65, 7.95, -35, 35], [3.6, 7.8, -35.4, -35], [3.6, 7.8, 35, 35.4]]) W.addPoly(q(l0, l1, a0, a1), PLAT_Y + 3, 'glass').y0 = PLAT_Y - 0.5;
    }
    // লিফট টাওয়ার আর মাটির প্রবেশপথ: রাস্তার বাইরে খালি জায়গায়
    let ent = null;
    for (const side of [1, -1]) {
      for (let lat = 9; lat < 40; lat += 1) {
        const p = this.P(st, side * lat, 28);
        if (!W.onRoad(p.x, p.z, FOOT) && !W.blocked(p.x, 1, p.z) && !W.blocked(p.x + 2, 1, p.z) && !W.blocked(p.x - 2, 1, p.z)) { ent = { ...p, side, lat }; break; }
      }
      if (ent) break;
    }
    if (!ent) { const p = this.P(st, 12, 28); ent = { ...p, side: 1, lat: 12 }; }
    st.ent = ent;
    const tw = new THREE.Group();
    addBox(tw, 3, PLAT_Y + 3, 3, lam(0x37474f), 0, (PLAT_Y + 3) / 2, 0);
    addBox(tw, 3.05, PLAT_Y + 2, 2.2, lam(0x4fc3f7), 0, (PLAT_Y + 2) / 2 + 0.5, 0); // কাচের লিফট
    addBox(tw, 3.1, 0.6, 3.1, green, 0, PLAT_Y + 3, 0);
    tw.position.set(ent.x, 0, ent.z);
    g.scene.add(tw);
    mergeStatic(tw, true, true);
    W.addBox(ent.x - 1.5, ent.x + 1.5, ent.z - 1.5, ent.z + 1.5, PLAT_Y + 3, 'tower');
    // টাওয়ার থেকে প্ল্যাটফর্ম পর্যন্ত কাচের সেতু
    const from = this.P(st, ent.side * 7.9, 28);
    const bl = Math.hypot(ent.x - from.x, ent.z - from.z);
    if (bl > 1) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, bl), new THREE.MeshLambertMaterial({ color: 0x9fd3e6, transparent: true, opacity: 0.55 }));
      br.position.set((ent.x + from.x) / 2, PLAT_Y + 1.3, (ent.z + from.z) / 2);
      br.rotation.y = Math.atan2(ent.x - from.x, ent.z - from.z);
      g.scene.add(br);
    }
    const sign = twoFace(new THREE.Mesh(planeGeo(4, 0.8), texMat(signTex(`মেট্রো ${st.name}`, 'road'), { side: THREE.DoubleSide })));
    sign.position.set(ent.x, 3.6, ent.z);
    sign.rotation.y = Math.atan2(st.dx, st.dz);
    g.scene.add(sign);
    // মাটির দরজা: টাওয়ারের রাস্তার দিকে
    const door = this.P(st, ent.side * (ent.lat - 2.4), 28);
    st.door = door;
    this.buildGates(st);
  }
  // ফুটপাতে সিঁড়ির গেট: রাস্তার দুই পাশে, বড় সবুজ "M", মাটিতে সবুজ আলো
  buildGates(st) {
    const g = this.g, W = g.world;
    st.gates = []; st.gateDoors = [];
    if (!this.mTex) this.mTex = canvasTex(128, 128, (c) => { c.fillStyle = '#1f7a3d'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffffff'; c.font = '900 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 64, 70); });
    if (!this.glowM) this.glowM = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const side of [1, -1]) {
      let gp = null;
      for (const lon of [16, -16, 30, -30]) {
        for (let lat = 4; lat < 45 && !gp; lat += 0.5) {
          const p = this.P(st, side * lat, lon);
          if (!W.onRoad(p.x, p.z, 0.2) && W.onRoad(p.x, p.z, FOOT + 0.4) && !W.blocked(p.x, 1, p.z)) {
            const q = this.P(st, side * lat, lon + 3), q2 = this.P(st, side * lat, lon - 3);
            if (!W.blocked(q.x, 1, q.z) && !W.blocked(q2.x, 1, q2.z)) gp = { ...p, lon };
          }
        }
        if (gp) break;
      }
      if (!gp) continue;
      const grp = new THREE.Group();
      grp.position.set(gp.x, 0.16, gp.z);
      grp.rotation.y = Math.atan2(st.dx, st.dz); // লোকাল z = লাইনের দিক
      addCyl(grp, 0.09, 0.09, 3.6, lam(0x90a4ae), 1.7, 1.8, -2.6, 8);
      const m = twoFace(new THREE.Mesh(planeGeo(1.2, 1.2), texMat(this.mTex, { transparent: true, side: THREE.DoubleSide })));
      m.position.set(1.7, 3.9, -2.6); grp.add(m);
      // হেঁটে ওঠা যায় এমন সিঁড়ি: ফুটপাত থেকে কনকোর্সের তলা পর্যন্ত, উপরে চাতাল আর কাচের সেতু
      this.buildStair(st, gp, side);
      g.scene.add(grp);
      // দরজা: ছাউনির সামনে
      const door = { x: gp.x - st.dx * 3.2, z: gp.z - st.dz * 3.2 };
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), this.glowM);
      glow.rotation.x = -Math.PI / 2; glow.position.set(door.x, 0.2, door.z); glow.userData.noShadow = true;
      g.scene.add(glow);
      st.gates.push(door);
      const dd = { b: { door, face: { x: -st.dx, z: -st.dz }, name: `${st.name} মেট্রো স্টেশন` }, kind: 'metro', name: `${st.name} মেট্রো স্টেশন`, st };
      st.gateDoors.push(dd);
      if (g.interiors) g.interiors.doors.push(dd);
    }
  }

  buildStair(st, gp, side) {
    const g = this.g, W = g.world;
    const Y0 = 0.16, Y1 = 6.1, RUN = 10.6, N = 18, HW = 1.2;
    // স্টেশনের নিজের সোজা অক্ষ: d = লাইনের দিক, n = তার লম্ব (A দিকে)
    const dx = st.dx, dz = st.dz, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
    let nx = uz, nz = -ux; if (nx * st.nx + nz * st.nz < 0) { nx = -nx; nz = -nz; }
    const L2W = (lat, lon) => ({ x: st.x + nx * lat + ux * lon, z: st.z + nz * lat + uz * lon });
    const glat = (gp.x - st.x) * nx + (gp.z - st.z) * nz, glon = (gp.x - st.x) * ux + (gp.z - st.z) * uz;
    const sg = Math.sign(glat) || side;
    // সিঁড়ির পুরো জায়গা (নিচ থেকে চাতাল পর্যন্ত) রাস্তায় বা দালানে পড়লে চলবে না: বাইরের দিকে / লাইন বরাবর সরিয়ে খোঁজা
    // (উপরের সেতু ৬ মিটার উঁচুতে, তাই সেটা রাস্তার উপর দিয়ে যেতে পারে)
    // পয়েন্ট গোনা: রাস্তায় পড়া বিন্দু = ১, দালান/টাওয়ারে বা সেতু দালানের ভিতরে = ১০০ (কখনোই না)
    const cost = (la, lb, d, lim) => {
      let c = 0;
      for (let t = 0; t <= RUN + 2.6 + 0.01; t += 0.8) {
        for (const off of [-HW - 0.25, 0, HW + 0.25]) {
          const p = L2W(la + off, lb + d * t);
          if (W.blocked(p.x, 1, p.z) || W.collide({ x: p.x, z: p.z }, 0.45, 1)) c += 100; // দালান, লিফটের টাওয়ার, খুঁটি
          else if (W.onRoad(p.x, p.z, 0.25)) c += 1;
          if (c > lim) return c;
        }
      }
      // উপরের সেতু (কনকোর্স পর্যন্ত) কোনো দালানের ভিতর দিয়ে যাবে না; রাস্তার উপর দিয়ে যেতে পারে
      const lb2 = lb + d * (RUN + 1.3), s2 = Math.sign(la);
      for (let q = 8.8; q < Math.abs(la); q += 0.8) {
        for (const off of [-1.1, 1.1]) {
          const p = L2W(s2 * q, lb2 + off);
          if (W.collide({ x: p.x, z: p.z }, 0.3, Y1 + 0.5)) { c += 100; if (c > lim) return c; }
        }
      }
      return c;
    };
    let best = null, dir0 = glon > 0 ? -1 : 1;
    const SHIFTS = [0]; for (let k = 3; k <= 42; k += 3) SHIFTS.push(k, -k);
    search: for (let a = Math.max(Math.abs(glat), 10.4); a < 42; a += 0.5) {
      for (const sh of SHIFTS) {
        for (const d of [dir0, -dir0]) {
          const c = cost(sg * a, glon + sh, d, best ? best.c : 99);
          // কাছের জায়গা ভালো: দূরত্বেও একটু খরচ
          if (!best || c + a * 0.02 < best.c + best.a * 0.02) best = { c, a, lat: sg * a, lonB: glon + sh, dir: d };
          if (c === 0) break search;
        }
      }
    }
    const lat = best && best.c < 100 ? best.lat : sg * Math.max(Math.abs(glat), 10.4);
    const lonB = best && best.c < 100 ? best.lonB : glon, dir = best && best.c < 100 ? best.dir : dir0;
    const lonT = lonB + dir * RUN, lonL = lonT + dir * 1.3;
    const grp = new THREE.Group();
    const o = L2W(lat, lonB);
    grp.position.set(o.x, 0, o.z);
    grp.rotation.y = Math.atan2(ux, uz); // লোকাল z = +lon, লোকাল x = ±lat
    const xs = (nx * Math.cos(grp.rotation.y) - nz * Math.sin(grp.rotation.y)) > 0 ? 1 : -1; // লোকাল +x কি +lat
    const LX = (dlat) => dlat * xs; // lat-এর পার্থক্য → লোকাল x
    const conc = lam(0xb9b4aa), stepM = lam(0x8d9499), edge = lam(0xf2c230), green = lam(0x1f7a3d), white = lam(0xf2f2f2);
    const glassM = new THREE.MeshLambertMaterial({ color: 0x9fd3e6, transparent: true, opacity: 0.38 });
    const rise = (Y1 - Y0) / N, tread = RUN / N;
    // ধাপ: নিচে ভরাট কংক্রিট, উপরে ধূসর ধাপ আর হলুদ কিনারা
    for (let k = 0; k < N; k++) {
      const h = Y0 + rise * (k + 1), z = dir * (k + 0.5) * tread;
      addBox(grp, HW * 2, h - 0.06, tread, conc, 0, (h - 0.06) / 2, z);
      addBox(grp, HW * 2, 0.06, tread, stepM, 0, h - 0.03, z);
      addBox(grp, HW * 2, 0.065, 0.05, edge, 0, h - 0.03, z - dir * (tread / 2 - 0.03));
    }
    const SL = Math.hypot(RUN, Y1 - Y0), ang = Math.atan2(Y1 - Y0, RUN);
    const slope = (w, h, x, yOff, mat) => {
      const b = addBox(grp, w, h, SL, mat, x, (Y0 + Y1) / 2 + yOff, dir * RUN / 2);
      b.rotation.x = -dir * ang;
      return b;
    };
    for (const sx2 of [-1, 1]) {
      slope(0.05, 1.05, sx2 * (HW + 0.03), 0.55, glassM); // কাচের পাশ
      slope(0.07, 0.07, sx2 * (HW + 0.03), 1.1, lam(0xc0c6ca)); // হাতল
      slope(0.1, 0.25, sx2 * (HW + 0.03), 0.1, lam(0x6f8fa6));
    }
    slope(HW * 2 + 0.5, 0.14, 0, 2.75, white); // ছাদ
    slope(HW * 2 + 0.55, 0.06, 0, 2.66, green);
    for (const t of [0.15, 0.5, 0.85]) { // ছাদের খুঁটি
      const z = dir * RUN * t, y = Y0 + (Y1 - Y0) * t;
      for (const sx2 of [-1, 1]) addBox(grp, 0.08, 2.7, 0.08, lam(0x90a4ae), sx2 * (HW + 0.12), y + 1.35, z);
    }
    // উপরের চাতাল আর কনকোর্স পর্যন্ত সেতু
    addBox(grp, HW * 2 + 0.2, 0.3, 2.6, stepM, 0, Y1 - 0.15, dir * (RUN + 1.3));
    addBox(grp, 0.6, Y1 - 0.3, 0.6, conc, 0, (Y1 - 0.3) / 2, dir * (RUN + 1.3));
    const inward = -sg; // কনকোর্সের দিকে
    const Lb = Math.max(0, Math.abs(lat) - HW - 8.6);
    if (Lb > 0.05) {
      const cx = LX(inward * (HW + Lb / 2));
      addBox(grp, Lb, 0.3, 2.6, stepM, cx, Y1 - 0.15, dir * (RUN + 1.3));
      for (const dz2 of [-1.27, 1.27]) addBox(grp, Lb, 1.05, 0.05, glassM, cx, Y1 + 0.52, dir * (RUN + 1.3) + dz2);
      addBox(grp, Lb, 0.14, 3.0, white, cx, Y1 + 2.75, dir * (RUN + 1.3));
    }
    // চাতালের বাইরের দুই দিকে কাচ, মাথায় ছাদ
    addBox(grp, HW * 2 + 0.2, 1.05, 0.05, glassM, 0, Y1 + 0.52, dir * (RUN + 2.58));
    addBox(grp, 0.05, 1.05, 2.6, glassM, LX(sg * (HW + 0.08)), Y1 + 0.52, dir * (RUN + 1.3));
    addBox(grp, HW * 2 + 0.5, 0.14, 3.0, white, 0, Y1 + 2.75, dir * (RUN + 1.3));
    // কনকোর্সের কাচের দরজা, উপরে লেখা
    const de = L2W(sg * 8.6, lonL);
    const doorM = new THREE.Mesh(planeGeo(2.2, 2.4), new THREE.MeshLambertMaterial({ color: 0x7fc4dd, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    doorM.position.set(de.x, Y1 + 1.2, de.z); doorM.rotation.y = Math.atan2(nx * sg, nz * sg);
    doorM.userData.noShadow = true; g.scene.add(doorM);
    const ds = twoFace(new THREE.Mesh(planeGeo(2.4, 0.5), texMat(signTex('প্রবেশ · টিকিট', 'road'), { side: THREE.DoubleSide })));
    ds.position.set(de.x + nx * sg * 0.05, Y1 + 2.65, de.z + nz * sg * 0.05); ds.rotation.y = doorM.rotation.y; g.scene.add(ds);
    const nm = twoFace(new THREE.Mesh(planeGeo(2.5, 0.55), texMat(signTex(`মেট্রো ${st.name}`, 'road'), { side: THREE.DoubleSide })));
    nm.position.set(0, Y0 + 2.45, -dir * 0.1); nm.rotation.y = dir > 0 ? Math.PI : 0; grp.add(nm);
    g.scene.add(grp);
    mergeStatic(grp, true, true);
    // হাঁটার তল (খেলোয়াড়ের পায়ের নিচে)
    const lat0 = Math.min(lat - HW, lat + HW), lat1 = Math.max(lat - HW, lat + HW);
    const latIn = sg > 0 ? [8.6, lat + HW] : [lat - HW, -8.6];
    const lonA = Math.min(lonT, lonT + dir * 2.6), lonZ = Math.max(lonT, lonT + dir * 2.6);
    W.walks = W.walks || [];
    W.walks.push({ st: { x: st.x, z: st.z, nx, nz, ux, uz }, kind: 'ramp', lat0, lat1, lonB, dir, run: RUN, y0: Y0, y1: Y1 });
    W.walks.push({ st: { x: st.x, z: st.z, nx, nz, ux, uz }, kind: 'rect', lat0: Math.min(...latIn), lat1: Math.max(...latIn), lon0: lonA, lon1: lonZ, y: Y1 });
    // রেলিং (পড়ে যাওয়া যায় না): দুই পাশে টুকরো টুকরো, চাতালের বাইরের দিক, কনকোর্সের দরজা
    const rect = (la0, la1, lo0, lo1, h, y0) => {
      const pts = [L2W(la0, lo0), L2W(la1, lo0), L2W(la1, lo1), L2W(la0, lo1)].map((p) => [p.x, p.z]);
      const b = W.addPoly(pts, h, 'rail'); b.y0 = y0; return b;
    };
    const SEG = 6;
    for (let k = 0; k < SEG; k++) {
      const a0 = lonB + dir * RUN * k / SEG, a1 = lonB + dir * RUN * (k + 1) / SEG;
      const hTop = Y0 + (Y1 - Y0) * (k + 1) / SEG;
      for (const la of [lat0 - 0.12, lat1]) rect(la, la + 0.12, Math.min(a0, a1), Math.max(a0, a1), hTop + 1.1, 0);
    }
    // সিঁড়ির নিচে ভরাট: মাটি থেকে ভিতরে ঢোকা যায় না (উপরে হাঁটা লোক এর উপরে)
    for (let k = 1; k < SEG; k++) {
      const a0 = lonB + dir * RUN * k / SEG, a1 = lonB + dir * RUN * (k + 1) / SEG;
      rect(lat0, lat1, Math.min(a0, a1), Math.max(a0, a1), Y0 + (Y1 - Y0) * k / SEG - 0.2, 0);
    }
    const LI0 = Math.min(...latIn), LI1 = Math.max(...latIn);
    const far = lonT + dir * 2.6;
    rect(LI0 - 0.12, LI1 + 0.12, Math.min(far, far + dir * 0.12), Math.max(far, far + dir * 0.12), Y1 + 1.1, Y1 - 0.4); // চাতালের মাথা
    const outer = sg > 0 ? lat1 : lat0 - 0.12;
    rect(outer, outer + 0.12, lonA, lonZ, Y1 + 1.1, Y1 - 0.4); // বাইরের পাশ
    if (Lb > 0.05) { // সেতুর সিঁড়ির দিকের পাশ (সিঁড়ির মুখ খোলা)
      const b0 = sg > 0 ? 8.6 : lat + HW, b1 = sg > 0 ? lat - HW : -8.6;
      rect(b0, b1, Math.min(lonT, lonT - dir * 0.12), Math.max(lonT, lonT - dir * 0.12), Y1 + 1.1, Y1 - 0.4);
    }
    rect(sg > 0 ? 8.45 : -8.6, sg > 0 ? 8.6 : -8.45, lonA, lonZ, Y1 + 2.6, Y1 - 0.4); // কাচের দরজা
    // উপরের দরজা: এখানে দাঁড়িয়ে F চাপলে কনকোর্সে
    const door = L2W(sg * 9.3, lonL);
    const dd = { b: { door, face: { x: nx * sg, z: nz * sg }, name: `${st.name} মেট্রো স্টেশন` }, kind: 'metro', name: `${st.name} মেট্রো স্টেশন`, st, y: Y1 };
    st.gateDoors.push(dd);
    if (g.interiors) g.interiors.doors.push(dd);
  }

  // ---------- ট্রেন ----------
  // ঢাকা মেট্রোর মতো কামরা: গোল ছাদ, জানালার সারি আর ফ্রেম, দরজার দাগ, চাকার বগি, ছাদে এসি আর প্যান্টোগ্রাফ, দুই মাথায় গোল নাকের কেবিন
  // ভিতরের জিনিসের ম্যাটেরিয়াল (রাতে কামরার আলোয় উজ্জ্বল)
  inMat(color) {
    this.inMatC = this.inMatC || {};
    if (!this.inMatC[color]) { const m = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 }); this.inMatC[color] = m; (this.inMats = this.inMats || []).push(m); }
    return this.inMatC[color];
  }
  // যাত্রী: বেঞ্চে বসা আর খুঁটি ধরে দাঁড়ানো; সব বাক্স এক মেশে, রং ভার্টেক্সে (এক ড্র-কলে)
  paxIn(st, B, W, HL, runs) {
    const SK = [0x8d5a3b, 0xa06a45, 0x7a4b2e, 0xb07b55], SH = [0xffffff, 0x1565c0, 0xc62828, 0x2e7d32, 0xf2c230, 0x6a1b9a, 0x37474f, 0xef6c00, 0xe0157a];
    const PA = [0x1d2a3a, 0x37474f, 0x5d4037, 0x1b1b1b];
    const L = [];
    const bx = (w, h, d, c, x, y, z) => L.push([w, h, d, x, y, z, c]);
    const person = (x, z, sit, sd) => {
      const fem = Math.random() < 0.4, burqa = fem && Math.random() < 0.3;
      const shirt = burqa ? 0x151515 : pick(SH), skin = pick(SK), hair = burqa ? 0x151515 : fem ? pick([0x151515, 0x3e2723]) : 0x1a1a1a;
      const pants = fem ? (burqa ? 0x151515 : pick([0xc2185b, 0x00897b, 0x5e35b1, 0xef6c00])) : pick(PA);
      if (sit) {
        const ix = -sd; // মুখ কামরার মাঝের দিকে
        bx(0.42, 0.14, 0.36, pants, x + ix * 0.15, B + 0.57, z);
        bx(0.14, 0.45, 0.32, pants, x + ix * 0.38, B + 0.25, z);
        bx(0.26, 0.56, 0.42, shirt, x - ix * 0.02, B + 0.88, z);
        bx(0.2, 0.22, 0.2, skin, x, B + 1.29, z);
        bx(0.22, fem ? 0.2 : 0.07, 0.22, hair, x - ix * (fem ? 0.02 : 0), fem ? B + 1.33 : B + 1.42, z);
        if (Math.random() < 0.35) bx(0.1, 0.16, 0.07, 0x111111, x + ix * 0.22, B + 1.0, z); // মোবাইল
      } else {
        bx(0.34, 0.86, 0.22, pants, x, B + 0.53, z);
        bx(0.42, 0.62, 0.26, shirt, x, B + 1.27, z);
        bx(0.2, 0.22, 0.2, skin, x, B + 1.7, z);
        bx(0.22, fem ? 0.2 : 0.07, 0.22, hair, x, fem ? B + 1.74 : B + 1.83, z);
        bx(0.08, 0.5, 0.08, shirt, x + (x > 0 ? 0.2 : -0.2), B + 1.8, z);
      }
    };
    for (const sd of [-1, 1]) for (const [z0, z1] of runs) {
      for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.55) if (Math.random() < 0.45) person(sd * (W / 2 - 0.4), z, true, sd);
    }
    for (const z of DOOR_Z) for (let i = 0; i < 2; i++) if (Math.random() < 0.55) person(rand(-0.6, 0.6), z + rand(-0.6, 0.6), false, 1);
    if (!L.length) return;
    // বাক্সগুলো থেকে জ্যামিতি
    const n = L.length * 36, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const F = [[[1, 0, 0], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, 0, 0], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
      [[0, 1, 0], [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[0, -1, 0], [-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
      [[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    const tc = new THREE.Color();
    let k = 0;
    for (const [w, h, d, x, y, z, c] of L) {
      tc.setHex(c); // setHex নিজেই লিনিয়ারে বদলায়
      for (const [nm, ...q] of F) for (const i of [0, 1, 2, 0, 2, 3]) {
        const v = q[i];
        pos[k * 3] = x + v[0] * w / 2; pos[k * 3 + 1] = y + v[1] * h / 2; pos[k * 3 + 2] = z + v[2] * d / 2;
        nor[k * 3] = nm[0]; nor[k * 3 + 1] = nm[1]; nor[k * 3 + 2] = nm[2];
        col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b;
        k++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    if (!this.paxM) { this.paxM = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 }); }
    const m = new THREE.Mesh(geo, this.paxM);
    m.userData.noMerge = true; m.userData.noShadow = true;
    st.add(m);
  }
  carModel(front, rear, panto) {
    const grp = new THREE.Group(), st = new THREE.Group();
    grp.add(st);
    if (!this.trainMats) {
      // হালকা নীলচে স্বচ্ছ কাচ: বাইরে থেকে ভিতরের যাত্রী দেখা যায়
      this.winM = new THREE.MeshLambertMaterial({ color: 0x9fc3e0, transparent: true, opacity: 0.28, depthWrite: false, emissive: 0x000000 });
      this.lightM = new THREE.MeshLambertMaterial({ color: 0xf4f7f2, emissive: 0x404040 });
      this.inMats = [];
      this.gapM = new THREE.MeshBasicMaterial({ color: 0x2a3338 });
      const own = (c) => new THREE.MeshLambertMaterial({ color: c }); // নিজের ম্যাটেরিয়াল: অন্য কোড রং বদলাতে পারে না
      this.trainMats = { body: own(0xf4f6f6), dark: own(0x1d2730), under: own(0x30363b), metal: own(0x8e989f), seam: own(0x9aa6ad), green: own(0x006a4e), red: own(0xd21034), floor: this.inMat(0x6b7075), ceil: this.inMat(0xe8ecea), seat: this.inMat(0x2e6da4) };
      // গন্তব্যের এলইডি
      this.destTex = canvasTex(256, 48, (c) => { c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, 256, 48); c.fillStyle = '#ffb547'; c.font = '700 26px "Hind Siliguri", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('এমআরটি লাইন ৬', 128, 25); });
    }
    const M = this.trainMats, B = BODY_Y, H = BODY_H, W = BODY_W, HL = CAR_LEN / 2;
    // ফাঁপা কামরা: মেঝে, নিচের আর উপরের দেয়াল, ছাদ, দুই মাথার দেয়াল; মাঝে কাচের জানালা দিয়ে ভিতরের যাত্রী দেখা যায়
    const WB = 1.05, WT = 2.35; // জানালার নিচ আর উপর (কামরার মেঝে থেকে)
    addBox(st, W, 0.1, CAR_LEN, M.floor, 0, B + 0.05, 0);
    addBox(st, W, 0.06, CAR_LEN, M.ceil, 0, B + H - 0.03, 0);
    for (const sd of [-1, 1]) {
      addBox(st, 0.08, WB, CAR_LEN, M.body, sd * (W / 2 - 0.04), B + WB / 2, 0);
      addBox(st, 0.08, H - WT, CAR_LEN, M.body, sd * (W / 2 - 0.04), B + (WT + H) / 2, 0);
      // জানালার মাঝের খুঁটি
      for (let z = -HL + 1.2; z <= HL - 1.2; z += 1.05) {
        if (DOOR_Z.some((d) => Math.abs(z - d) < 0.95)) continue;
        addBox(st, 0.1, WT - WB, 0.12, M.body, sd * (W / 2 - 0.03), B + (WB + WT) / 2, z);
      }
      // ঢাকা মেট্রোর রং (জাতীয় পতাকার সবুজ-লাল): জানালার নিচে চওড়া গাঢ় সবুজ ফিতা, তার নিচে লাল, জানালার উপরে সরু সবুজ (দরজায় ফাঁক থাকে না, দরজাতেও আঁকা)
      addBox(st, 0.03, 0.42, CAR_LEN, M.green, sd * (W / 2 + 0.01), B + WB - 0.27, 0);
      addBox(st, 0.03, 0.14, CAR_LEN, M.red, sd * (W / 2 + 0.01), B + WB - 0.56, 0);
      addBox(st, 0.03, 0.08, CAR_LEN, M.green, sd * (W / 2 + 0.01), B + WT + 0.1, 0);
    }
    for (const sg of [-1, 1]) addBox(st, W, H, 0.08, M.body, 0, B + H / 2, sg * (HL - 0.04));
    const rg = new THREE.CylinderGeometry(W / 2, W / 2, CAR_LEN, 16, 1, false, Math.PI / 2, Math.PI);
    rg.rotateX(Math.PI / 2); rg.scale(1, 0.32, 1);
    const roof = new THREE.Mesh(rg, M.body); roof.position.y = B + H; st.add(roof);
    // দরজা: ফ্রেমের দাগ, দুই পাল্লার মাঝের দাগ (পাল্লার উপরের অর্ধেক কাচ)
    for (const z of DOOR_Z) for (const sd of [-1, 1]) {
      const x = sd * (W / 2 + 0.03);
      addBox(st, 0.02, 2.25, 0.07, M.seam, x, B + 1.12, z - 0.72);
      addBox(st, 0.02, 2.25, 0.07, M.seam, x, B + 1.12, z + 0.72);
      addBox(st, 0.02, 0.07, 1.5, M.seam, x, B + 2.25, z);
      addBox(st, 0.02, 2.2, 0.03, M.dark, x, B + 1.12, z);
    }
    // ভিতর: লম্বা বেঞ্চ, হাতল, খুঁটি, ছাদের বাতি, যাত্রী
    const runs = [[-HL + 0.5, DOOR_Z[0] - 0.85], [DOOR_Z[0] + 0.85, DOOR_Z[1] - 0.85], [DOOR_Z[1] + 0.85, DOOR_Z[2] - 0.85], [DOOR_Z[2] + 0.85, DOOR_Z[3] - 0.85], [DOOR_Z[3] + 0.85, HL - 0.5]];
    for (const sd of [-1, 1]) {
      for (const [z0, z1] of runs) {
        addBox(st, 0.5, 0.1, z1 - z0, M.seat, sd * (W / 2 - 0.33), B + 0.45, (z0 + z1) / 2);
        addBox(st, 0.45, 0.35, z1 - z0, M.metal, sd * (W / 2 - 0.33), B + 0.22, (z0 + z1) / 2);
        addBox(st, 0.08, 0.5, z1 - z0, M.seat, sd * (W / 2 - 0.1), B + 0.75, (z0 + z1) / 2);
      }
      addBox(st, 0.04, 0.04, CAR_LEN - 1, M.metal, sd * 0.75, B + 2.05, 0);
      addBox(st, 0.26, 0.04, CAR_LEN - 1.4, this.lightM, sd * 0.5, B + H - 0.08, 0);
    }
    for (const z of DOOR_Z) addBox(st, 0.05, H - 0.1, 0.05, M.metal, 0, B + H / 2, z);
    this.paxIn(st, B, W, HL, runs);
    // বগি আর চাকা
    for (const zb of [-HL + 3.2, HL - 3.2]) {
      addBox(st, 2.1, 0.42, 2.9, M.under, 0, CAR_Y + 0.5, zb);
      for (const x of [-0.75, 0.75]) for (const dz of [-0.95, 0.95]) {
        const w = addCyl(st, 0.42, 0.42, 0.14, M.dark, x, CAR_Y + 0.37, zb + dz, 10);
        w.rotation.z = Math.PI / 2;
      }
      addBox(st, 2.3, 0.18, 0.5, M.metal, 0, CAR_Y + 0.62, zb);
    }
    // নিচের যন্ত্রপাতি আর ছাদের এসি
    addBox(st, 2.5, 0.5, CAR_LEN - 9, M.under, 0, B - 0.25, 0);
    for (const z of [-HL + 2.6, HL - 2.6]) addBox(st, 1.7, 0.32, 2.6, M.metal, 0, B + H + 0.5, z);
    if (panto) {
      addBox(st, 1.2, 0.18, 1.6, M.dark, 0, B + H + 0.52, 0);
      const arm1 = addBox(st, 0.07, 0.07, 0.75, M.metal, 0, WIRE_Y - 0.4, -0.25); arm1.rotation.x = 0.9;
      const arm2 = addBox(st, 0.07, 0.07, 0.6, M.metal, 0, WIRE_Y - 0.3, -0.15); arm2.rotation.x = -0.9;
      addBox(st, 1.7, 0.05, 0.12, M.dark, 0, WIRE_Y - 0.05, -0.05);
    }
    // কামরার মাঝের সংযোগ (বেলো)
    if (!rear) addBox(st, 2.3, 2.6, GAP + 0.3, M.dark, 0, B + 1.4, HL + GAP / 2);
    // দুই মাথার কেবিন: গোল নাক, বাঁকা কাচ, বাতি
    const cab = (sg, head) => {
      const ng = new THREE.SphereGeometry(1, 22, 14, sg < 0 ? Math.PI : 0, Math.PI);
      ng.scale(W / 2, H / 2 + 0.12, 1.75);
      const nose = new THREE.Mesh(ng, M.body); nose.position.set(0, B + H / 2 + 0.05, sg * HL); st.add(nose);
      const wg = new THREE.SphereGeometry(1.012, 22, 8, (sg < 0 ? Math.PI * 1.5 : Math.PI * 0.5) - 0.95, 1.9, 0.42, 0.66);
      wg.scale(W / 2, H / 2 + 0.12, 1.75);
      const ws = new THREE.Mesh(wg, M.dark); ws.position.copy(nose.position); st.add(ws);
      const sgM = addBox(st, W + 0.06, 0.42, 0.6, M.green, 0, B + WB - 0.27, sg * (HL + 0.2));
      addBox(st, W + 0.06, 0.14, 0.6, M.red, 0, B + WB - 0.56, sg * (HL + 0.2));
      // সামনের মুখে সবুজ-লাল ভি আকার
      for (const [y, h, m] of [[B + WB - 0.27, 0.42, M.green], [B + WB - 0.56, 0.14, M.red]]) {
        const f = addBox(st, W * 0.86, h, 0.06, m, 0, y, sg * (HL + 1.55));
        f.userData.k = 0;
      }
      sgM.userData.k = 0;
      for (const x of [-0.85, 0.85]) addBox(st, 0.36, 0.14, 0.08, bas(head ? 0xfff4d6 : 0xd01818), x, B + 0.6, sg * (HL + 1.42));
      if (head) {
        const d = new THREE.Mesh(planeGeo(1.4, 0.26), texMat(this.destTex));
        d.position.set(0, B + H - 0.02, sg * (HL + 0.98)); d.rotation.y = sg < 0 ? Math.PI : 0; d.rotation.x = sg < 0 ? -0.5 : 0.5;
        st.add(d);
      }
    };
    if (front) cab(-1, true);
    if (rear) cab(1, false);
    mergeStatic(grp, true, false);
    for (const sd of [-1, 1]) {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, CAR_LEN - 1.0), this.winM);
      gl.position.set(sd * (W / 2 + 0.005), B + 1.7, 0);
      gl.userData.noShadow = true; gl.renderOrder = 2;
      grp.add(gl);
    }
    // দরজা খোলার অংশ: মাঝখান থেকে চওড়া হওয়া অন্ধকার ফাঁক (দুই পাল্লা সরে যাওয়ার মতো)
    grp.userData.gaps = { '-1': [], '1': [] };
    for (const z of DOOR_Z) for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(boxGapGeo(), this.gapM);
      m.position.set(sd * (W / 2 + 0.045), B + 1.12, z);
      m.visible = false; m.userData.dyn = true; m.userData.noShadow = true;
      grp.add(m);
      grp.userData.gaps[sd].push(m);
    }
    this.g.scene.add(grp);
    return grp;
  }
  buildTrains() {
    for (let k = 0; k < 3; k++) {
      const cars = [];
      for (let c = 0; c < CARS; c++) cars.push(this.carModel(c === 0, c === CARS - 1, c === 1));
      const tr = { k, s: k * this.L / 3 + 30, speed: 0, dwell: 0, lastStop: null, dwellStop: null, cars, player: false, doorT: 0, doorSide: 1, doorOpen: false, hold: 0 };
      this.trains.push(tr);
      this.place(tr);
    }
  }
  place(tr) {
    tr.cars.forEach((m, c) => {
      const s = tr.s - CAR_LEN / 2 - c * (CAR_LEN + GAP);
      const p = this.at(s);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = Math.atan2(-p.dx, -p.dz);
    });
  }
  carPos(tr, c = 1) { return this.at(tr.s - CAR_LEN / 2 - c * (CAR_LEN + GAP)); }
  // সামনের স্টেশন (এইমাত্র যেটা ছেড়েছে সেটা বাদ)
  nextStop(tr) {
    let best = null, bd = 1e9;
    for (const st of this.stops) {
      const d = this.ahead(tr.s, st.s);
      if (st === tr.lastStop && (d < 5 || d > this.L - 50)) continue;
      if (d < bd) { bd = d; best = st; }
    }
    return { st: best, d: bd };
  }
  gapAhead(tr) {
    let gap = 1e9;
    for (const o of this.trains) if (o !== tr) gap = Math.min(gap, this.ahead(tr.s, o.s - TRAIN_LEN));
    return gap;
  }
  updateTrain(tr, dt, warm = false) {
    if (tr.dwell > 0) {
      tr.dwell -= dt;
      tr.dwellT = (tr.dwellT || 0) + dt;
      if (tr.dwell <= 0) { tr.lastStop = tr.dwellStop; tr.dwellStop = null; if (!warm) this.onDepart(tr); }
      return;
    }
    const ns = this.nextStop(tr);
    let vt = Math.min(MAX_V, Math.sqrt(2 * DEC * Math.max(0, ns.d - 0.3)));
    const gap = this.gapAhead(tr);
    if (gap < 140) vt = Math.min(vt, Math.sqrt(2 * DEC * Math.max(0, gap - 45)));
    tr.speed = tr.speed < vt ? Math.min(vt, tr.speed + ACC * dt) : Math.max(vt, tr.speed - DEC * 2 * dt);
    tr.s += tr.speed * dt;
    if (ns.st && ns.d < 0.8 && tr.speed < 0.6) this.arrive(tr, ns.st, warm);
  }
  arrive(tr, stop, warm = false) {
    tr.speed = 0; tr.s = stop.s;
    // সময়সূচি: পরের নির্ধারিত ছাড়ার সময় পর্যন্ত দাঁড়ায় (কমপক্ষে MIN_DWELL)
    // আগে পৌঁছালে নির্ধারিত সময় পর্যন্ত দাঁড়ায়, দেরিতে এলে কম সময় থেমেই ছাড়ে
    const H = this.HEAD, t = this.clock + MIN_DWELL;
    const dep = stop.depOff + Math.round((t - stop.depOff) / H) * H;
    tr.dwell = clamp(dep - this.clock, MIN_DWELL, MIN_DWELL + 30);
    tr.dwellStop = stop; tr.dwellT = 0;
    tr.doorSide = this.platformSide(stop);
    if (warm) return;
    const r = stop.st.rigs[stop.line];
    for (let k = 0; k < 2 && r.length; k++) this.g.scene.remove(r.pop().root);
    this.onArrive(tr, stop);
  }
  // প্ল্যাটফর্ম কামরার কোন পাশে (কামরার লোকাল x: +১ ডান, −১ বাম, সামনে তাকিয়ে)
  platformSide(stop) {
    const st = stop.st, sgn = stop.line === 'A' ? 1 : -1;
    const p = this.at(stop.s - CAR_LEN / 2), th = Math.atan2(-p.dx, -p.dz);
    return Math.sign(Math.cos(th) * st.nx * sgn - Math.sin(th) * st.nz * sgn) || 1;
  }
  // ---------- সময়সূচি ----------
  buildTimetable() {
    const order = [...this.stops].sort((a, b) => a.s - b.s);
    const legT = (d) => {
      let s = 0, v = 0, t = 0;
      const dt = 0.1;
      while (t < 600) {
        const rem = d - s;
        if (rem < 0.8 && v < 0.6) break;
        const vt = Math.min(MAX_V, Math.sqrt(2 * DEC * Math.max(0, rem - 0.3)));
        v = v < vt ? Math.min(vt, v + ACC * dt) : Math.max(vt, v - DEC * 2 * dt);
        s += v * dt; t += dt;
      }
      return t;
    };
    const legs = order.map((st, j) => legT(this.ahead(st.s, order[(j + 1) % order.length].s)));
    const cycle = legs.reduce((a, b) => a + b, 0) + order.length * MIN_DWELL;
    this.HEAD = Math.ceil(cycle / this.trains.length / 5) * 5 + 5; // প্রতি স্টেশনে কত সেকেন্ড পরপর ট্রেন
    this.LOOP = this.HEAD * this.trains.length;
    let dep = 0;
    order.forEach((st, j) => { st.depOff = ((dep % this.HEAD) + this.HEAD) % this.HEAD; dep += legs[j] + MIN_DWELL; });
  }
  nextDep(stop, t) { const H = this.HEAD; return stop.depOff + Math.ceil((t - stop.depOff) / H) * H; }
  // এই প্ল্যাটফর্মে পরের ট্রেন কত সেকেন্ড পরে
  eta(stop) {
    const here = this.trains.find((t) => t.dwellStop === stop);
    if (here) return { here: true, left: Math.max(0, here.dwell) };
    return { here: false, left: Math.max(0, this.nextDep(stop, this.clock + 1) - MIN_DWELL - this.clock) };
  }
  // ---------- দরজা ----------
  updateDoors(tr, dt) {
    const g = this.g;
    let want = false;
    if (tr.player) want = tr.hold > 0 && tr.speed < 0.2;
    else want = tr.dwell > 0 && (tr.dwellT || 0) > 1.2 && tr.dwell > 3.2;
    if (tr.hold > 0) tr.hold -= dt;
    if (want !== tr.doorOpen) {
      tr.doorOpen = want;
      const p = this.carPos(tr, 1), near = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z) < 90 || (this.ride && this.ride.train === tr) || (this.drive && this.drive.tr === tr);
      if (near) { if (want) g.sound.door(); else g.sound.chime('door'); }
    }
    const k = clamp(tr.doorT + (want ? dt : -dt) / 1.1, 0, 1);
    tr.doorT = k;
    for (const car of tr.cars) {
      const G = car.userData.gaps;
      if (!G) continue;
      for (const sd of ['-1', '1']) for (const m of G[sd]) {
        const on = k > 0.01 && +sd === tr.doorSide;
        m.visible = on;
        if (on) m.scale.z = k;
      }
    }
  }
  // ---------- ঘোষণা ----------
  announce(text, speak = true) {
    const g = this.g;
    g.ui.announce(text);
    g.sound.chime();
    if (speak) g.sound.speak(text);
  }
  riding(tr) { return (this.ride && this.ride.train === tr && this.ride.stage === 'go') || (this.drive && this.drive.tr === tr); }
  onDepart(tr) {
    tr.annFor = null;
    if (!this.riding(tr)) return;
    const ns = this.nextStop(tr).st;
    if (!ns) return;
    const mine = this.ride && this.ride.to === ns.st;
    this.announce(`পরবর্তী স্টেশন ${ns.st.name}${mine ? ' · আপনার গন্তব্য' : ''}। Next station ${EN[ns.st.i]}`);
  }
  onArrive(tr, stop) {
    if (!this.riding(tr)) return;
    const end = stop.st.i === (stop.line === 'A' ? 2 : 0);
    this.announce(`${stop.st.name} স্টেশন। দরজা ${tr.doorSide > 0 ? 'ডান' : 'বাম'} দিকে খুলবে${end ? '। এটি শেষ স্টেশন, সবাই নেমে যান' : ''}`);
  }
  // ---------- প্ল্যাটফর্মের ডিজিটাল বোর্ড ----------
  buildDisplays() {
    this.boards = [];
    for (const st of this.stations) {
      for (const line of ['A', 'B']) {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 128;
        const tex = new THREE.CanvasTexture(cv);
        if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        const stop = this.stops.find((x) => x.st === st && x.line === line);
        const side = line === 'A' ? 1 : -1;
        for (const lon of [-14, 18]) {
          const p = this.P(st, side * 5.7, lon);
          const grp = new THREE.Group();
          grp.position.set(p.x, PLAT_Y + 2.95, p.z);
          grp.rotation.y = st.rotY;
          addBox(grp, 2.7, 0.78, 0.12, lam(0x263238), 0, 0, 0);
          for (const x of [-1, 1]) addBox(grp, 0.04, 2.6, 0.04, lam(0x607d8b), x, 1.6, 0);
          for (const z of [-0.07, 0.07]) { const m = new THREE.Mesh(planeGeo(2.56, 0.64), mat); m.position.z = z; if (z < 0) m.rotation.y = Math.PI; grp.add(m); }
          this.g.scene.add(grp);
        }
        this.boards.push({ st, line, stop, cv, tex, last: '' });
      }
    }
    this.boardT = 0;
  }
  drawBoards() {
    const P = this.g.player;
    for (const b of this.boards) {
      if (Math.hypot(b.st.x - P.pos.x, b.st.z - P.pos.z) > 220) continue;
      const e = this.eta(b.stop);
      const fmt = (s) => (s >= 60 ? `${bn(Math.ceil(s / 60))} মিনিট` : `${bn(Math.max(1, Math.ceil(s)))} সেকেন্ড`);
      const l1 = `${TERM[b.line]} গামী`;
      const l2 = e.here ? (e.left > 3.2 ? `ট্রেন প্ল্যাটফর্মে · ছাড়বে ${fmt(e.left)}` : 'দরজা বন্ধ হচ্ছে') : e.left < 15 ? 'ট্রেন আসছে · হলুদ দাগের পিছনে দাঁড়ান' : `পরের ট্রেন ${fmt(e.left)}`;
      const l3 = `পরেরটি ${fmt(e.left + this.HEAD)} · প্রতি ${fmt(this.HEAD)} পরপর`;
      const key = l1 + l2 + l3 + (this.g.sky ? this.g.sky.label : '');
      if (key === b.last) continue;
      b.last = key;
      const c = b.cv.getContext('2d');
      c.fillStyle = '#050505'; c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#1f7a3d'; c.fillRect(0, 0, 512, 36);
      c.fillStyle = '#ffffff'; c.font = `700 22px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillText(l1, 12, 19);
      c.textAlign = 'right'; c.fillText(this.g.sky ? this.g.sky.label.replace(/[^\d০-৯:]/g, '') : '', 500, 19);
      c.textAlign = 'left'; c.fillStyle = '#ffb547'; c.font = `700 30px ${FONT}`;
      c.fillText(l2, 12, 68);
      c.fillStyle = '#c98a2e'; c.font = `600 20px ${FONT}`;
      c.fillText(l3, 12, 107);
      b.tex.needsUpdate = true;
    }
  }
  // ---------- লাইন: স্লিপার, কিনারার দেয়াল, বিদ্যুতের খুঁটি আর তার ----------
  buildTrack() {
    const g = this.g;
    const grp = new THREE.Group();
    const mast = lam(0x7d878d), wireM = lam(0x2a2a2a), wall = lam(0xc9c4ba);
    const sleepers = [];
    for (const [P, O] of [[this.A, this.B], [this.B, this.A]]) {
      let next = 0;
      for (const q of P.segs) {
        const ry = Math.atan2(q.dx, q.dz);
        for (let t = 0; t < q.L; t += 0.75) sleepers.push([q.ax + q.dx * t, q.az + q.dz * t, ry]);
        // অন্য লাইনের উল্টো দিক = বাইরের দিক
        const mx = (q.ax + q.bx) / 2, mz = (q.az + q.bz) / 2, pr = project(O, mx, mz);
        const o = along(O, pr.s);
        let nx = q.dz, nz = -q.dx;
        if ((o.x - mx) * nx + (o.z - mz) * nz > 0) { nx = -nx; nz = -nz; }
        // কিনারার নিচু দেয়াল
        const w = addBox(grp, 0.25, 0.9, q.L, wall, mx + nx * 4.05, 10.7, mz + nz * 4.05); w.rotation.y = ry;
        // উপরের তার (যোগাযোগের তার আর তার উপরের বাহক তার)
        for (const y of [WIRE_Y, WIRE_Y + 0.75]) { const c = addBox(grp, 0.035, 0.035, q.L, wireM, mx, y, mz); c.rotation.y = ry; }
        // খুঁটি: প্রতি ~৪৫ মি
        for (; next < q.s0 + q.L; next += 45) {
          const t = next - q.s0;
          if (t < 0) continue;
          const x = q.ax + q.dx * t, z = q.az + q.dz * t;
          if (this.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 40)) continue; // স্টেশনের ছাদের নিচে না
          addCyl(grp, 0.13, 0.16, 6.2, mast, x + nx * 2.6, 10.25 + 3.1, z + nz * 2.6, 8);
          const arm = addBox(grp, 2.9, 0.12, 0.12, mast, x + nx * 1.3, WIRE_Y + 0.85, z + nz * 1.3);
          arm.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
          addBox(grp, 0.05, 0.75, 0.05, wireM, x, WIRE_Y + 0.38, z);
        }
      }
    }
    g.scene.add(grp);
    mergeStatic(grp, true, false);
    const sg = new THREE.BoxGeometry(2.5, 0.12, 0.26);
    const inst = new THREE.InstancedMesh(sg, lam(0x8d8a84), Math.max(1, sleepers.length));
    const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    sleepers.forEach(([x, z, ry], i) => { qt.setFromAxisAngle(up, ry); mtx.compose(pos.set(x, 10.31, z), qt, sc); inst.setMatrixAt(i, mtx); });
    inst.count = sleepers.length;
    inst.receiveShadow = true;
    g.scene.add(inst);
  }

  // ---------- প্রতি ফ্রেম ----------
  update(dt) {
    if (!this.ok) return;
    const g = this.g, P = g.player;
    this.clock += dt;
    for (const tr of this.trains) {
      if (tr.player) this.updateDrive(tr, dt);
      else this.updateTrain(tr, dt);
      tr.s = ((tr.s % this.L) + this.L) % this.L;
      this.place(tr);
      this.updateDoors(tr, dt);
    }
    // রাতে কামরার ভিতরের আলো জানালায়
    const nt = g.sky ? g.sky.night : 0;
    if (this.winM && Math.abs((this.winK ?? -1) - nt) > 0.02) {
      this.winK = nt;
      this.winM.emissive.setRGB(nt * 0.08, nt * 0.08, nt * 0.07);
      this.lightM.emissive.setRGB(0.25 + nt * 0.75, 0.25 + nt * 0.75, 0.25 + nt * 0.7);
      for (const m of this.inMats) m.emissive.copy(m.color).multiplyScalar(nt * 0.55);
      if (this.paxM) this.paxM.emissive.setRGB(nt * 0.3, nt * 0.28, nt * 0.25);
    }
    // প্ল্যাটফর্মের বোর্ড (প্রতি সেকেন্ডে)
    this.boardT -= dt;
    if (this.boardT <= 0) { this.boardT = 1; this.drawBoards(); }
    // প্ল্যাটফর্মে দাঁড়িয়ে থাকলে ট্রেন আসার ঘোষণা
    const pl = this.onPlatform();
    if (pl) {
      const stop = this.stops.find((x) => x.st === pl.st && x.line === pl.line);
      for (const tr of this.trains) {
        if (tr.player || tr.dwell > 0 || tr.annFor === stop) continue;
        const ns = this.nextStop(tr);
        if (ns.st === stop && ns.d < 260) { tr.annFor = stop; this.announce(`${TERM[stop.line]} গামী ট্রেন প্ল্যাটফর্মে আসছে। অনুগ্রহ করে হলুদ দাগের পিছনে দাঁড়ান`); }
      }
    }
    // প্ল্যাটফর্মে অপেক্ষারত যাত্রী (কাছে গেলে)
    for (const st of this.stations) {
      const near = Math.hypot(st.x - P.pos.x, st.z - P.pos.z) < 160;
      for (const line of ['A', 'B']) {
        const r = st.rigs[line];
        if (near && r.length < 4 && Math.random() < 0.02) {
          const side = line === 'A' ? 1 : -1;
          const p = this.P(st, side * rand(4.8, 7), rand(-28, 28));
          const rig = makeRig({ female: Math.random() < 0.4, skirt: pick([0xc2185b, 0x00897b, undefined]) });
          rig.root.position.set(p.x, PLAT_Y + 0.16, p.z);
          rig.root.rotation.set(0, Math.atan2(st.nx * side, st.nz * side), 0);
          g.scene.add(rig.root);
          r.push(rig);
        }
        if (!near) while (r.length) g.scene.remove(r.pop().root);
        for (const rig of r) setPose(rig, 'idle', dt, 0, 4);
      }
    }
    // কাছের ট্রেনের শব্দ
    let lvl = 0;
    for (const tr of this.trains) { const p = this.carPos(tr); lvl = Math.max(lvl, clamp(1 - Math.hypot(p.x - P.pos.x, p.z - P.pos.z) / 140, 0, 1) * clamp(tr.speed / 10, 0.15, 1)); }
    if (P.state === 'ride' && (this.ride || this.drive)) lvl = 0.6;
    this.hum = lvl;
    if (this.ride) this.updateRide(dt);
  }
  // ---------- প্রবেশপথ ----------
  nearEntrance() {
    const P = this.g.player;
    if (!this.ok || P.state !== 'foot' || P.y > 2) return null;
    return this.stations.find((s) => Math.hypot(s.door.x - P.pos.x, s.door.z - P.pos.z) < 3.4) || null;
  }
  // প্ল্যাটফর্মে কোন স্টেশনে, কোন পাশে
  onPlatform() {
    const P = this.g.player;
    if (!this.ok || P.y < PLAT_Y - 0.6) return null;
    for (const st of this.stations) {
      const rx = P.pos.x - st.x, rz = P.pos.z - st.z;
      const lat = rx * st.nx + rz * st.nz, lon = rx * st.dx + rz * st.dz;
      if (Math.abs(lon) < 36 && Math.abs(lat) > 3 && Math.abs(lat) < 8.5) return { st, line: lat > 0 ? 'A' : 'B', lon };
    }
    return null;
  }
  towerDialog(st) {
    const g = this.g;
    const others = this.stations.filter((s) => s !== st);
    g.interiors.dialog(`${st.name} মেট্রো স্টেশন`, '"এমআরটি পাস নাকি একক যাত্রার টিকিট?"', [
      ...others.map((o) => ({ label: `টিকিট: ${o.name}`, price: Math.abs(o.i - st.i) === 1 ? 20 : 30, act: () => this.buy(st, o, Math.abs(o.i - st.i) === 1 ? 20 : 30) })),
      { label: 'প্ল্যাটফর্মে যান (শুধু দেখতে)', act: () => this.toPlatform(st, 'A') },
      { label: 'নিজে মেট্রো চালান', act: () => this.startDrive(st, false) },
      { label: 'মেট্রো চালকের চাকরি', note: 'প্রতি স্টেশনে ঠিক দাগে থামুন', act: () => this.startDrive(st, true) },
    ]);
  }
  toPlatform(st, line, lon = 22) {
    const g = this.g, P = g.player;
    const side = line === 'A' ? 1 : -1;
    const p = this.P(st, side * 6.2, lon);
    P.place(p.x, p.z, Math.atan2(st.nx * side, st.nz * side) + Math.PI);
    P.y = PLAT_Y + 0.02; P.vy = 0;
    g.camYaw = P.yaw;
    g.sound.door();
  }
  exitPlatform(st) {
    const g = this.g, P = g.player;
    P.place(st.door.x, st.door.z, P.yaw);
    P.y = 0; P.vy = 0;
    g.sound.door();
  }
  buy(st, to, fare) {
    const g = this.g;
    if (g.law.stars > 0) { g.ui.toast('পুলিশ খুঁজছে! গেটে আটকাবে', 'bad'); return; }
    if (!g.spend(fare, 'টিকিট')) return;
    g.sound.money();
    this.startRide(st, to, to.i > st.i ? 'A' : 'B');
  }
  // প্ল্যাটফর্মে গিয়ে ট্রেনের অপেক্ষা
  startRide(st, to, line) {
    const g = this.g;
    const stopFrom = this.stops.find((s) => s.st === st && s.line === line);
    const stopTo = this.stops.find((s) => s.st === to && s.line === line);
    this.ride = { from: st, to, line, stopFrom, stopTo, stage: 'wait', t: 0 };
    this.toPlatform(st, line);
    g.ui.toast(`${to.name} যাওয়ার প্ল্যাটফর্মে অপেক্ষা করুন, ট্রেন আসছে`, 'good');
  }
  // কনকোর্সের স্টাফ রুম
  ticketStaff(st) {
    this.g.interiors.dialog('মেট্রো স্টাফ রুম', '"চালকের সিটে বসবেন? আগে প্রশিক্ষণ নিছেন তো?"', [
      { label: 'নিজে মেট্রো চালান', act: () => { this.g.interiors.exitTo(() => this.startDrive(st, false)); } },
      { label: 'মেট্রো চালকের চাকরি', note: 'প্রতি স্টেশনে ঠিক দাগে থামুন', act: () => { this.g.interiors.exitTo(() => this.startDrive(st, true)); } },
    ]);
  }
  updateRide(dt) {
    const g = this.g, R = this.ride, P = g.player;
    R.t += dt;
    if (R.stage === 'wait') {
      const tr = this.trains.find((t) => t.dwellStop === R.stopFrom && !t.player && t.doorT > 0.5);
      const pl = this.onPlatform();
      if (tr && pl && pl.st === R.from) {
        P.state = 'ride'; P.rig.root.visible = false;
        R.train = tr; R.stage = 'go';
        g.sound.door();
        g.ui.toast(`মেট্রোতে উঠলেন। পরের স্টেশন... ${R.to.name} · ${g.mobile ? 'ওঠা বোতাম' : 'F'}: তাড়াতাড়ি`, 'good');
      }
      if (R.t > 240 && !pl) this.ride = null;
    } else if (R.stage === 'go') {
      const p = this.carPos(R.train, 1);
      P.pos.x = p.x; P.pos.z = p.z; P.y = PLAT_Y; P.yaw = Math.atan2(-p.dx, -p.dz);
      if (R.train.dwellStop === R.stopTo && R.train.doorT > 0.6) this.alight();
    }
  }
  alight() {
    const g = this.g, R = this.ride, P = g.player;
    P.state = 'foot'; P.rig.root.visible = true;
    this.toPlatform(R.to, R.line, 0);
    g.ui.toast(`${R.to.name} স্টেশনে নামলেন। F চেপে নিচে কনকোর্সে, সেখান থেকে বাইরে`, 'good');
    this.ride = null;
  }
  skip() {
    const R = this.ride;
    if (R && R.stage === 'go') {
      const tr = R.train;
      tr.s = R.stopTo.s; tr.speed = 0; tr.dwell = DWELL; tr.dwellStop = R.stopTo; tr.dwellT = 2; tr.doorSide = this.platformSide(R.stopTo); tr.doorT = 1;
      this.place(tr);
      this.alight();
      return true;
    }
    if (this.drive) { this.exitDrive(); return true; }
    return false;
  }
  // ---------- নিজে চালানো ----------
  startDrive(st, job) {
    const g = this.g, P = g.player;
    if (g.law.stars > 0) { g.ui.toast('পুলিশ খুঁজছে! এখন না', 'bad'); return; }
    const stop = this.stops.find((s) => s.st === st && s.line === 'A' && st.i < 2) || this.stops.find((s) => s.st === st);
    // স্টেশনে যে ট্রেন কম দূরে, সেটা আপনার
    const tr = this.trains.reduce((a, t) => (this.ahead(t.s, stop.s) < this.ahead(a.s, stop.s) ? t : a), this.trains[0]);
    tr.player = true; tr.s = stop.s; tr.speed = 0; tr.dwell = 0; tr.dwellStop = null; tr.lastStop = stop;
    for (const o of this.trains) if (o !== tr && this.ahead(o.s, tr.s) < TRAIN_LEN + 60) o.s = tr.s - TRAIN_LEN - 120;
    this.place(tr);
    P.state = 'ride'; P.rig.root.visible = false;
    this.drive = { tr, job, t: 0, doors: 0, served: stop, targets: [], idx: 0, pay: 0 };
    if (job) {
      const order = [...this.stops].sort((a, b) => this.ahead(stop.s, a.s) - this.ahead(stop.s, b.s)).filter((s) => s !== stop);
      this.drive.targets = order.slice(0, 4);
    }
    g.ui.toast(job ? `চাকরি শুরু: ${this.drive.targets.map((s) => s.st.name).join(' → ')}। W গতি, S ব্রেক, প্ল্যাটফর্মের সবুজ দাগে থামুন` : 'মেট্রো চালাচ্ছেন: W গতি, S ব্রেক, Space জরুরি ব্রেক। স্টেশনে থামলে দরজা খোলে, থেমে F চেপে নামুন', 'good');
  }
  updateDrive(tr, dt) {
    const g = this.g, D = this.drive, I = g.input;
    if (!D) { tr.player = false; return; }
    D.t += dt;
    const ax = I.axis();
    if (g.state === 'play') {
      if (ax.y > 0.1 && tr.doorT > 0.05) { tr.hold = 0; } // আগে দরজা বন্ধ, তারপর চলা
      else if (ax.y > 0.1) { if (tr.wasStopped && D.served) { tr.wasStopped = false; tr.lastStop = D.served; this.onDepart(tr); } tr.speed = Math.min(MAX_V + 3, tr.speed + ACC * 1.1 * ax.y * dt); }
      else if (ax.y < -0.1) tr.speed = Math.max(0, tr.speed - 2.2 * -ax.y * dt);
      else tr.speed = Math.max(0, tr.speed - 0.08 * dt);
      if (I.get('space')) tr.speed = Math.max(0, tr.speed - 5 * dt);
    }
    // সামনের ট্রেনে ধাক্কা না লাগে
    const gap = this.gapAhead(tr);
    if (gap < 25) tr.speed = Math.min(tr.speed, Math.max(0, gap - 10) * 0.3);
    tr.s += tr.speed * dt;
    // থামলে কাছের স্টেশনে দরজা খোলে
    const near = this.stops.find((s) => Math.min(this.ahead(tr.s, s.s), this.ahead(s.s, tr.s)) < 12);
    if (tr.speed < 0.15 && near) tr.wasStopped = true;
    if (tr.speed < 0.15 && near && near !== D.served) {
      D.doors += dt;
      if (D.doors > 1) { D.served = near; D.doors = 0; this.doorsOpen(tr, near); }
    } else D.doors = 0;
    // চাকরি: স্টেশন পার হয়ে গেলে
    if (D.job && D.targets[D.idx]) {
      const tg = D.targets[D.idx];
      const past = this.ahead(tg.s, tr.s);
      if (past > 15 && past < 200 && D.served !== tg) {
        g.ui.toast(`${tg.st.name} পার হয়ে গেলেন! যাত্রীরা রাগ করছে (−৳৫০)`, 'bad');
        g.charge(50); D.idx++; D.served = tg;
        this.checkJobEnd();
      }
    }
    P0(g, tr, this);
  }
  doorsOpen(tr, stop) {
    const g = this.g, D = this.drive;
    const off = this.ahead(stop.s, tr.s) < 200 ? this.ahead(stop.s, tr.s) : -this.ahead(tr.s, stop.s);
    tr.doorSide = this.platformSide(stop); tr.hold = 7;
    this.onArrive(tr, stop);
    const r = stop.st.rigs[stop.line];
    for (let k = 0; k < 3 && r.length; k++) g.scene.remove(r.pop().root);
    if (D.job && D.targets[D.idx] === stop) {
      const pay = 150 + Math.round(Math.max(0, 8 - Math.abs(off)) * 20);
      g.money += pay; g.save(); g.sound.money();
      D.pay += pay;
      g.ui.toast(`${stop.st.name}: ${Math.abs(off) < 2 ? 'একদম দাগে থামলেন!' : `দাগ থেকে ${bn(Math.round(Math.abs(off)))} মি দূরে`} +৳${bnGroup(pay)}`, 'money');
      D.idx++;
      this.checkJobEnd();
    } else g.ui.toast(`${stop.st.name}: দরজা খুলল`, '');
  }
  checkJobEnd() {
    const g = this.g, D = this.drive;
    if (D.job && D.idx >= D.targets.length) {
      g.money += 300; g.save(); g.sound.money();
      g.ui.toast(`চাকরির শিফট শেষ! বোনাস ৳৩০০ (মোট ৳${bnGroup(D.pay + 300)})। থেমে F চেপে নামুন`, 'money');
      D.job = false;
    }
  }
  exitDrive() {
    const g = this.g, D = this.drive, tr = D.tr;
    if (tr.speed > 0.3) { g.ui.toast('আগে থামুন', 'bad'); return; }
    const near = this.stops.find((s) => Math.min(this.ahead(tr.s, s.s), this.ahead(s.s, tr.s)) < 40);
    if (!near) { g.ui.toast('স্টেশনে থেমে তারপর নামুন', 'bad'); return; }
    tr.player = false; tr.lastStop = near; tr.dwell = 4; tr.dwellStop = near;
    this.drive = null;
    const P = g.player;
    P.state = 'foot'; P.rig.root.visible = true;
    this.toPlatform(near.st, near.line, 0);
  }
  hud() {
    const D = this.drive;
    if (!D) return null;
    const tr = D.tr;
    const tg = D.job ? D.targets[D.idx] : this.nextStop(tr).st;
    const d = tg ? this.ahead(tr.s, tg.s) : 0;
    return { type: D.job ? 'মেট্রো চালক' : 'মেট্রো চালাচ্ছেন', text: `${tg ? `পরের: ${tg.st.name} · ${d > 1000 ? '' : bn(Math.round(d)) + ' মি'}` : ''} · ${bn(Math.round(tr.speed * 3.6))} কিমি/ঘ`, left: null };
  }
  endAll() {
    if (this.drive) { this.drive.tr.player = false; this.drive = null; }
    this.ride = null;
  }
  // মিনি-ম্যাপের জন্য
  markers() { return this.ok ? this.trains.map((t) => this.carPos(t, 1)) : []; }
  gateList() { return this.ok ? this.stations.flatMap((s) => s.gates.map((d) => ({ ...d, st: s }))) : []; }
}
// চালানোর সময় আপনার অবস্থান ট্রেনের সামনের কামরায়
function P0(g, tr, M) {
  const P = g.player, p = M.carPos(tr, 0);
  P.pos.x = p.x; P.pos.z = p.z; P.y = PLAT_Y; P.yaw = Math.atan2(-p.dx, -p.dz);
}
