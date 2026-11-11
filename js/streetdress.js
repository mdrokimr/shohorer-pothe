// ঢাকার রাস্তার সাজ: বিদ্যুতের খুঁটি আর তারের জট, রাস্তার উপরে পতাকার মালা-পোস্টারের সারি-কাপড়ের ব্যানার,
// ল্যাম্পপোস্টে ফেস্টুন, দেয়ালে পোস্টার, দোকানের সাইনবোর্ড, ছাদে বিলবোর্ড, ফুটপাতের চায়ের দোকান-ফলের ভ্যান-ময়লা,
// জেব্রা ক্রসিং আর রাস্তার গর্ত-পানি। সব ছবি এক অ্যাটলাসে, সব মেশ জোড়া লাগানো: অল্প draw call।
import * as THREE from 'three';
import { lam, addBox, addCyl, mergeStatic, canvasTex, planeGeo } from './lib3d.js';
import { isFood } from './townlife.js';
import { Tris } from './world.js';
import { FOOT } from './mapgen.js';
import { Atlas, signboard, electionPoster, adPoster, greetPoster, tuitionPoster, tinSign, clothBanner, billboard, BANNER_N, BILL_N, FOLK, roadSign, signBack, signBackInfo } from './art.js';

const SHOPS = [
  ['মায়ের দোয়া ভ্যারাইটিজ স্টোর', 'চাল · ডাল · তেল · সাবান'], ['বিসমিল্লাহ হোটেল এন্ড রেস্টুরেন্ট', 'সকালের নাস্তা · দুপুরের খাবার'],
  ['নিউ জননী ফার্মেসি', 'সকল প্রকার ঔষধ পাওয়া যায়'], ['ভাই ভাই হার্ডওয়্যার', 'রড · সিমেন্ট · পাইপ'],
  ['সততা টেইলার্স', 'জেন্টস ও লেডিস'], ['রহমানিয়া মিষ্টি ঘর', 'রসগোল্লা · দই · চমচম'],
  ['ঝটপট ফটোকপি', 'প্রিন্ট · স্ক্যান · লেমিনেটিং'], ['লাকি হেয়ার কাটিং সেলুন', 'এসি আছে (মাঝে মাঝে)'],
  ['নূর অপটিক্স', 'চশমা · ফ্রেম · চোখ পরীক্ষা'], ['আল্লাহর দান ক্রোকারিজ', 'হাঁড়ি · পাতিল · কাপ'],
  ['স্মার্ট মোবাইল সার্ভিসিং', 'ফ্লেক্সিলোড · মোবাইল ব্যাংকিং'], ['চাঁদপুর ফিশ ফ্রাই', 'ইলিশ ভাজা · ভর্তা'],
  ['দেশী ঘরোয়া খাবার', 'ভাত · মাছ · মাংস · ডাল'], ['মডার্ন ইলেকট্রিক', 'ফ্যান · লাইট · তার'],
  ['গাজী কম্পিউটার', 'ল্যাপটপ · প্রিন্টার · সার্ভিসিং'], ['মাদার কেয়ার ডায়াগনস্টিক', '২৪ ঘণ্টা খোলা'],
  ['ঢাকা বিরিয়ানি হাউস', 'কাচ্চি · তেহারি · বোরহানি'], ['আলিফ জুয়েলার্স', 'সোনা · রূপা · গহনা'],
  ['শাপলা ক্লথ স্টোর', 'থান কাপড় · শাড়ি · লুঙ্গি'], ['নিউ মডেল জুতা ঘর', 'টেকসই জুতা · স্যান্ডেল'],
  ['বন্ধু টি স্টল', 'চা · বিস্কুট · পান'], ['জনতা স্টোর', 'নিত্যপ্রয়োজনীয় সব পাওয়া যায়'],
];
const UPPER = [
  ['আলোর দিশা কোচিং সেন্টার', 'এসএসসি · এইচএসসি · ভর্তি চলছে'], ['ডাঃ ব্যস্ত চেম্বার', 'মেডিসিন ও শিশু রোগ · সন্ধ্যা ৬-৯টা'],
  ['আইডিয়াল ড্রাইভিং স্কুল', 'হাতে-কলমে প্রশিক্ষণ'], ['ঝিলমিল বিউটি পার্লার', 'বিয়ের সাজ · মেহেদি'],
  ['ক্লাউড আইটি ট্রেনিং', 'গ্রাফিক্স · ওয়েব · ফ্রিল্যান্সিং'], ['সুখী দাম্পত্য কাজী অফিস', 'নিকাহ রেজিস্ট্রার'],
];

export class StreetDress {
  constructor(g) {
    this.g = g;
    const W = g.world, M = g.map;
    this.W = W; this.M = M;
    this.occ = new Map(); // নিজের বসানো জিনিস (একটার উপর আরেকটা না)
    for (const [x, z] of W.lampList || []) this.mark(x, z, 0.6);
    for (const [x, z] of W.treeList || []) this.mark(x, z, 0.8);
    // আগে থেকে থাকা জিনিসের সামনে কিছু বসবে না: পার্ক করা গাড়ি, বাস কাউন্টার, মেট্রো গেট, দোকান-অফিসের দরজা
    for (const p of M.parked || []) this.mark(p.x, p.z, 2.6);
    for (const c of (g.buses && g.buses.counters) || []) { this.mark(c.shel.x, c.shel.z, 4.5); if (c.booth) this.mark(c.booth.x, c.booth.z, 1.5); }
    for (const c of (g.buses && g.buses.stands) || []) if (c.x !== undefined) this.mark(c.x, c.z, 4);
    for (const st of (g.metro && g.metro.stations) || []) for (const gt of st.gates || []) this.mark(gt.x, gt.z, 4);
    for (const d of (g.interiors && g.interiors.doors) || []) { const p = d.b ? d.b.door : d; if (p && p.x !== undefined) this.mark(p.x, p.z, 2.2); if (d.b && d.b.entry) this.mark(d.b.entry.x, d.b.entry.z, 2.0); }
    for (const k of (g.work && g.work.kiosks && g.work.kiosks()) || []) this.mark(k.x, k.z, 2);
    this.buildAtlas();
    this.signs = new Tris();   // রাতে জ্বলে
    this.cloth = new Tris();   // পোস্টার, ব্যানার, ফেস্টুন (জ্বলে না)
    this.flags = { pos: [], col: [], nor: [] };
    this.wires = [];
    this.props = new THREE.Group();
    this.poles = [];
    this.count = { poles: 0, spans: 0, flags: 0, posterLines: 0, banners: 0, festoons: 0, signs: 0, bills: 0, stalls: 0, zebra: 0 };
    try { this.buildPolesAndWires(); } catch (e) { console.warn('poles', e); }
    try { this.buildFestoons(); } catch (e) { console.warn('festoons', e); }
    try { this.buildFronts(); } catch (e) { console.warn('fronts', e); }
    try { this.buildStalls(); } catch (e) { console.warn('stalls', e); }
    try { this.buildRoadBills(); } catch (e) { console.warn('road bills', e); }
    try { this.buildMarks(); } catch (e) { console.warn('marks', e); }
    try { this.buildSigns(); } catch (e) { console.warn('signs', e); }
    this.finish();
  }
  // ---------- জায়গা দখল ----------
  key(x, z) { return Math.floor(x / 4) + ',' + Math.floor(z / 4); }
  mark(x, z, r) { const k = this.key(x, z); let l = this.occ.get(k); if (!l) this.occ.set(k, (l = [])); l.push([x, z, r]); }
  free(x, z, r) {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = this.occ.get(cx + a + ',' + (cz + b));
      if (l) for (const [px, pz, pr] of l) if (Math.hypot(px - x, pz - z) < pr + r) return false;
    }
    return !this.W.blocked(x, 1, z) && this.M.lakeDist(x, z) > 2;
  }
  // ---------- অ্যাটলাস ----------
  buildAtlas() {
    const A = (this.atlas = new Atlas(2048, 3072));
    this.cells = { sign: [], upper: [], elec: [], ad: [], greet: [], tuition: [], tin: [], banner: [], bill: [] };
    SHOPS.forEach(([n, s], i) => this.cells.sign.push(A.add(508, 127, (c, w, h) => signboard(c, w, h, n, s, i))));
    UPPER.forEach(([n, s], i) => this.cells.upper.push(A.add(508, 127, (c, w, h) => signboard(c, w, h, n, s, i + 3))));
    for (let i = 0; i < 4; i++) this.cells.elec.push(A.add(160, 240, (c, w, h) => electionPoster(c, w, h, i)));
    for (let i = 0; i < 8; i++) this.cells.ad.push(A.add(160, 240, (c, w, h) => adPoster(c, w, h, i)));
    for (let i = 0; i < 5; i++) this.cells.greet.push(A.add(160, 240, (c, w, h) => greetPoster(c, w, h, i)));
    for (let i = 0; i < 4; i++) this.cells.tuition.push(A.add(160, 240, (c, w, h) => tuitionPoster(c, w, h, i)));
    for (let i = 0; i < 6; i++) this.cells.tin.push(A.add(280, 100, (c, w, h) => tinSign(c, w, h, i)));
    for (let i = 0; i < BANNER_N; i++) this.cells.banner.push(A.add(1000, 110, (c, w, h) => clothBanner(c, w, h, i)));
    for (let i = 0; i < BILL_N; i++) this.cells.bill.push(A.add(640, 256, (c, w, h) => billboard(c, w, h, i)));
    const tex = A.texture();
    this.signMat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000 });
    this.clothMat = new THREE.MeshLambertMaterial({ map: tex });
  }
  poster() {
    const r = Math.random();
    const L = r < 0.32 ? this.cells.elec : r < 0.55 ? this.cells.tuition : r < 0.82 ? this.cells.ad : this.cells.greet;
    return L[Math.floor(Math.random() * L.length)];
  }
  // সমতল ছবি: কেন্দ্র (x,y,z), আড়াআড়ি দিক (ax,az), মুখের দিক (nx,nz), চওড়া w, উঁচু h; দুই পিঠ হলে উল্টো দিকেও
  card(q, c, x, y, z, ax, az, nx, nz, w, h, two = false, back = null, tilt = 0) {
    // লেখা যেন উল্টো না হয়: সামনে দাঁড়ানো লোকের ডান হাতের দিকেই ছবির ডান দিক (আগে অর্ধেক জায়গায় আয়নার মতো উল্টো হত)
    { const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L; ax = nz; az = -nx; }
    const hw = w / 2, hh = h / 2;
    const P = (s, t) => [x + ax * s * hw + nx * t * tilt, y + t * hh, z + az * s * hw + nz * t * tilt];
    q.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v1], [nx, 0, nz]);
    if (two) {
      const b = back || c, o = 0.012;
      const Q = (s, t) => [x - nx * o - ax * s * hw + nx * t * tilt, y + t * hh, z - nz * o - az * s * hw + nz * t * tilt];
      q.quad(Q(-1, -1), Q(1, -1), Q(1, 1), Q(-1, 1), [b.u0, b.v0], [b.u1, b.v0], [b.u1, b.v1], [b.u0, b.v1], [-nx, 0, -nz]);
    }
  }
  // ঝুলন্ত তার: a থেকে b, মাঝে ঝুলে পড়া
  sag(a, b, drop, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - drop * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    for (let i = 0; i < n; i++) this.wires.push(...out[i], ...out[i + 1]);
    return out;
  }
  // ---------- বিদ্যুতের খুঁটি আর তারের জট ----------
  buildPolesAndWires() {
    const M = this.M, W = this.W;
    const box = new THREE.Group();
    const grey = lam(0x8f8a80), dark = lam(0x3a3c3e), tr = lam(0x6f7a72);
    this.poleMeta = [];
    for (const s of M.segments) {
      if (!s.main || s.len < 30) continue;
      const nx = -s.dir.z, nz = s.dir.x;
      for (const side of [-1, 1]) {
        const off = side * (s.width / 2 + FOOT - 0.22);
        for (let t = 6 + (side > 0 ? 17 : 0); t < s.len - 4; t += 34) {
          let placed = null;
          for (const dt of [0, 3, -3, 6]) {
            const tt = t + dt;
            if (tt < 3 || tt > s.len - 3) continue;
            const x = s.ax + s.dir.x * tt + nx * off, z = s.az + s.dir.z * tt + nz * off;
            if (this.free(x, z, 0.5) && !W.onRoad(x, z, 0.3) && !W.otherRoad(x, z, s, 0.5) && !W.sideBlocked(s, tt, side * (s.width / 2 + 0.3))) { placed = { x, z, t: tt }; break; }
          }
          if (!placed) continue;
          const { x, z } = placed;
          this.mark(x, z, 0.6);
          this.poles.push([x, z]);
          W.addBox(x - 0.14, x + 0.14, z - 0.14, z + 0.14, 9, 'pole');
          // ক্রস-আর্ম আর ইনসুলেটর
          const arm = addBox(box, 0.12, 0.12, 1.6, dark, x, 8.3, z); arm.rotation.y = Math.atan2(s.dir.x, s.dir.z) + Math.PI / 2;
          const arm2 = addBox(box, 0.1, 0.1, 1.2, dark, x, 7.4, z); arm2.rotation.y = arm.rotation.y;
          if (Math.random() < 0.28) {
            // ট্রান্সফর্মার
            addBox(box, 0.75, 1.1, 0.6, tr, x - nx * side * 0.55, 5.6, z - nz * side * 0.55);
            for (const k of [-0.2, 0.2]) addCyl(box, 0.06, 0.06, 0.35, lam(0x8a6a3a), x - nx * side * 0.55 + s.dir.x * k, 6.35, z - nz * side * 0.55 + s.dir.z * k, 6);
          }
          // খুঁটিতে প্যাঁচানো ইন্টারনেট/টিভির তারের গোছা (ঢাকার সিগনেচার)
          if (Math.random() < 0.72) {
            const cy = 5.6 + Math.random() * 1.6, r = 0.4 + Math.random() * 0.45;
            for (let k = 0; k < 3 + (Math.random() * 2) | 0; k++) {
              let prev = null;
              for (let i = 0; i <= 16; i++) {
                const a = (i / 16) * Math.PI * 2 + k * 0.4;
                const p = [x + s.dir.x * Math.cos(a) * r + nx * side * -0.25, cy + k * 0.18 - Math.abs(Math.sin(a)) * r * 0.85, z + s.dir.z * Math.cos(a) * r + nz * side * -0.25];
                if (prev) this.wires.push(...prev, ...p);
                prev = p;
              }
            }
          }
          // ডিশ অ্যান্টেনা (খুঁটি বা কাছের বাড়ির দিকে)
          if (Math.random() < 0.4) {
            const dx = -nx * side * (0.35 + Math.random() * 0.2), dz = -nz * side * (0.35 + Math.random() * 0.2);
            const dish = addCyl(box, 0.42, 0.42, 0.06, lam(0xc8ccd0), x + dx, 6.8 + Math.random() * 0.8, z + dz, 10);
            dish.rotation.x = 0.85; dish.rotation.y = Math.atan2(s.dir.x, s.dir.z);
            addCyl(box, 0.03, 0.03, 0.55, lam(0x555555), x + dx, 6.5, z + dz, 5);
          }
          // বাড়িতে যাওয়া ঝুলন্ত তার (একাধিক)
          if (Math.random() < 0.75) {
            const nDrop = 1 + (Math.random() * 3) | 0;
            for (let d = 0; d < nDrop; d++) {
              const bx = x - nx * side * (2.5 + Math.random() * 5) + s.dir.x * (Math.random() * 8 - 4);
              const bz = z - nz * side * (2.5 + Math.random() * 5) + s.dir.z * (Math.random() * 8 - 4);
              if (W.blocked(bx, 2, bz)) this.sag([x, 6.8 + d * 0.25, z], [bx, 3.2 + Math.random() * 2.5, bz], 0.45 + Math.random() * 0.7, 7);
            }
          }
          this.poleMeta.push({ x, z, s, side });
          this.count.poles++;
        }
      }
    }
    // পাশাপাশি খুঁটি জোড়া (রাস্তার একই পাশে, মাঝে রাস্তা বা বাড়ি নেই): ৫-৯টা তার, একেকটা একেক রকম ঝোলা
    const PM = this.poleMeta, grid = new Map(), gk = (x, z) => Math.floor(x / 40) + ',' + Math.floor(z / 40);
    PM.forEach((p, i) => { const k = gk(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    const done = new Set();
    PM.forEach((a, i) => {
      const cand = [];
      const cx = Math.floor(a.x / 40), cz = Math.floor(a.z / 40);
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const j of grid.get(cx + u + ',' + (cz + v)) || []) {
        if (j === i) continue;
        const b = PM[j], d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d < 10 || d > 62) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if (W.onRoad(mx, mz, -0.4) || W.blocked(mx, 3, mz)) continue;
        cand.push([d, j]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      for (const [, j] of cand.slice(0, 2)) {
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (done.has(key)) continue;
        done.add(key);
        const b = PM[j], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
        const n = 8 + Math.floor(Math.random() * 7); // ঘন ঝুলন্ত কেবল
        for (let k = 0; k < n; k++) {
          const lo = (k % 5 - 2) * 0.38, y = 5.9 + (k % 6) * 0.42 + Math.random() * 0.2;
          this.sag([a.x + lo * nx, y, a.z + lo * nz], [b.x + lo * nx + (Math.random() - 0.5) * 0.4, y - Math.random() * 0.3, b.z + lo * nz], 0.55 + Math.random() * 1.6, 9);
        }
        this.count.spans++;
      }
      // রাস্তার উপর দিয়ে আড়াআড়ি: পতাকার মালা, পোস্টারের সারি, কাপড়ের ব্যানার
      if (a.side < 0 && a.s.width >= 7 && Math.random() < 0.4) this.acrossRoad(a.s, a, -a.s.dir.z, a.s.dir.x);
    });
    // মোড়ে আড়াআড়ি তারের জট: কাছাকাছি খুঁটি জোড়া
    for (let i = 0; i < this.poles.length; i++) {
      const [x, z] = this.poles[i];
      for (let j = i + 1; j < Math.min(this.poles.length, i + 40); j++) {
        const [x2, z2] = this.poles[j], d = Math.hypot(x2 - x, z2 - z);
        if (d > 8 && d < 32 && Math.random() < 0.18) for (let k = 0; k < 5; k++) this.sag([x, 6.4 + k * 0.35, z], [x2, 6.2 + k * 0.35, z2], 0.8 + Math.random() * 1.2);
      }
    }
    // খুঁটিগুলো একসাথে (InstancedMesh)
    const pg = new THREE.CylinderGeometry(0.11, 0.17, 9, 6); pg.translate(0, 4.5, 0);
    const inst = new THREE.InstancedMesh(pg, grey, Math.max(1, this.poles.length));
    const m = new THREE.Matrix4();
    this.poles.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); inst.setMatrixAt(i, m); });
    inst.count = this.poles.length;
    inst.castShadow = true;
    this.g.scene.add(inst);
    this.props.add(box);
  }
  acrossRoad(s, a, nx, nz) {
    const w = s.width + FOOT * 2 - 0.44;
    const A = [a.x, 0, a.z], B = [a.x + nx * w, 0, a.z + nz * w];
    if (!this.free(B[0], B[2], 0.3) && this.W.blocked(B[0], 1, B[2])) return;
    const r = Math.random();
    if (r < 0.45) {
      // রঙিন ত্রিভুজ পতাকার মালা (২-৩ সারি)
      const rows = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < rows; k++) {
        const y = 6.2 + k * 0.5, pts = this.sag([A[0] + s.dir.x * k * 1.2, y, A[2] + s.dir.z * k * 1.2], [B[0] - s.dir.x * k * 1.2, y, B[2] - s.dir.z * k * 1.2], 0.9 + Math.random() * 0.5, 24);
        for (let i = 0; i + 1 < pts.length; i++) {
          const p = pts[i], q = pts[i + 1];
          const col = new THREE.Color(FOLK[(i + k) % (FOLK.length - 1)]);
          const mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2, my = (p[1] + q[1]) / 2 - 0.42;
          this.flag(p, q, [mx, my, mz], col, s.dir);
        }
        this.count.flags++;
      }
    } else if (r < 0.8) {
      // নির্বাচনী পোস্টারের সারি: দড়িতে ঝোলানো লেমিনেট পোস্টার
      for (let k = 0; k < 2; k++) {
        const y = 6.0 + k * 0.9, pts = this.sag([A[0] + s.dir.x * k * 2, y, A[2] + s.dir.z * k * 2], [B[0] + s.dir.x * k * 2, y, B[2] + s.dir.z * k * 2], 0.7, Math.max(8, Math.round(w / 0.8)));
        for (let i = 1; i + 1 < pts.length; i++) {
          const p = pts[i], c = this.poster();
          this.card(this.cloth, c, p[0], p[1] - 0.34, p[2], nx, nz, s.dir.x, s.dir.z, 0.42, 0.62, true, this.poster(), 0.03);
        }
        this.count.posterLines++;
      }
    } else if (this.count.banners < 40) {
      // কাপড়ের ব্যানার, দুই পাশে বাঁশের খুঁটি
      const bw = Math.min(w - 1, 9.5), cx = (A[0] + B[0]) / 2, cz = (A[2] + B[2]) / 2;
      const c = this.cells.banner[Math.floor(Math.random() * this.cells.banner.length)];
      this.card(this.cloth, c, cx, 5.0, cz, nx, nz, s.dir.x, s.dir.z, bw, bw / 9.14, true, c);
      for (const sg of [-1, 1]) {
        const px = cx + nx * sg * (bw / 2 + 0.1), pz = cz + nz * sg * (bw / 2 + 0.1);
        addCyl(this.props, 0.05, 0.06, 6.2, lam(0xb08a4a), px, 3.1, pz, 5);
      }
      this.wires.push(A[0], 5.6, A[2], cx - nx * bw / 2, 5.55, cz - nz * bw / 2, B[0], 5.6, B[2], cx + nx * bw / 2, 5.55, cz + nz * bw / 2);
      this.count.banners++;
    }
  }
  flag(p, q, tip, col, dir) {
    const F = this.flags;
    F.pos.push(...p, ...q, ...tip);
    for (let i = 0; i < 3; i++) { F.col.push(col.r, col.g, col.b); F.nor.push(dir.x, 0, dir.z); }
  }
  // ---------- ল্যাম্পপোস্টে পিভিসি ফেস্টুন ----------
  buildFestoons() {
    for (const [x, z, ry] of this.W.lampList || []) {
      if (Math.random() > 0.55) continue;
      if (!this.W.onRoad(x, z, FOOT + 0.5) || !this.W.onRoad(x, z, FOOT + 0.5).main) continue;
      const ax = Math.sin(ry), az = Math.cos(ry); // বাতির হাত যেদিকে (রাস্তার দিকে)
      const nx = az, nz = -ax; // রাস্তার লম্বালম্বি
      const n = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const y = 3.0 + k * 1.15;
        this.card(this.cloth, this.poster(), x + ax * 0.42, y, z + az * 0.42, ax, az, nx, nz, 0.7, 1.05, true, this.poster());
        this.count.festoons++;
      }
    }
  }
  // ---------- দোকানের সাইনবোর্ড, শাটার, ছাউনি, দেয়ালের পোস্টার, ছাদের বিলবোর্ড ----------
  frontEdge(b) {
    const p = b.p;
    let best = null, bs = -9;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ex = p[i][0] - p[j][0], ez = p[i][1] - p[j][1], L = Math.hypot(ex, ez);
      if (L < 3) continue;
      let nx = ez / L, nz = -ex / L;
      const mx = (p[i][0] + p[j][0]) / 2, mz = (p[i][1] + p[j][1]) / 2;
      if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
      const sc = nx * b.face.x + nz * b.face.z + Math.min(L, 12) * 0.02;
      if (sc > bs) { bs = sc; best = { ax: p[j][0], az: p[j][1], dx: ex / L, dz: ez / L, mx, mz, nx, nz, L }; }
    }
    return bs > 0.45 ? best : null;
  }
  buildFronts() {
    const M = this.M;
    const awn = [0x1565c0, 0x2e7d32, 0xef6c00, 0xc62828, 0xf2c230, 0x6a1b9a].map((c) => lam(c));
    const wall = new Tris();
    let bills = 0;
    for (const b of M.buildings) {
      if (!b.main || b.landmark || b.kind === 'civic') continue;
      const e = this.frontEdge(b);
      if (!e) continue;
      const ry = Math.atan2(e.nx, e.nz);
      // মাঝখানে নামের সাইনবোর্ড আগেই আছে (world.js), তার দুই পাশে ছোট দোকান; নাম না থাকলে মাঝেও
      const midW = b.name ? Math.min(e.L - 1, 7) : 0;
      const slots = [];
      if (!b.name) slots.push([e.L / 2, Math.min(e.L - 1, 6.5)]);
      const sideW = (e.L - midW) / 2;
      if (sideW > 3.0) for (const sg of [-1, 1]) slots.push([e.L / 2 + sg * (midW / 2 + sideW / 2), Math.min(sideW - 0.6, 4.5)]);
      for (const [t, sw] of slots) {
        if (sw < 2.2) continue;
        const cx = e.ax + e.dx * t, cz = e.az + e.dz * t;
        const si = Math.floor(Math.random() * this.cells.sign.length), c = this.cells.sign[si];
        this.card(this.signs, c, cx + e.nx * 0.09, 3.4, cz + e.nz * 0.09, e.dx, e.dz, e.nx, e.nz, sw, sw / 4);
        // খোলা দোকান: ভিতরটা দেখা যায়, সামনে দাঁড়িয়ে F চাপলে ঢোকা যায়
        const name = SHOPS[si][0], seed = (b.color + Math.round(t) * 7) % 97;
        const food = isFood(name);
        const fr = new THREE.Mesh(planeGeo(sw, 2.5), this.W.openMat(food ? 'rest' : 'shop', seed));
        fr.position.set(cx + e.nx * 0.05, 1.25, cz + e.nz * 0.05); fr.rotation.y = ry; fr.userData.noShadow = true;
        this.props.add(fr);
        if (this.g.life) {
          const ex = cx + e.nx * 0.9, ez = cz + e.nz * 0.9;
          const pb = { name, kind: 'shop', side: true, x: cx, z: cz, h: b.h, p: b.p, color: seed, face: { x: e.nx, z: e.nz }, door: { x: ex, z: ez }, entry: { x: ex, z: ez, nx: e.nx, nz: e.nz, w: sw } };
          this.g.life.addFront(pb);
          this.mark(ex, ez, 1.8);
          this.count.doors = (this.count.doors || 0) + 1;
        }
        const aw = addBox(this.props, sw + 0.3, 0.07, 1.3, awn[(b.color + Math.round(t) * 3) % awn.length], cx + e.nx * 0.68, 2.72, cz + e.nz * 0.68); aw.rotation.y = ry;
        this.count.signs++;
      }
      // খালি দেয়ালে পোস্টার + টিনের সাইন (টিউশন/রাজনীতি/পান)
      if (Math.random() < 0.85) {
        const n = 3 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) {
          const tt = 0.35 + Math.random() * (e.L - 0.7);
          this.card(wall, this.poster(), e.ax + e.dx * tt + e.nx * 0.1, 1.05 + Math.random() * 1.4, e.az + e.dz * tt + e.nz * 0.1, e.dx, e.dz, e.nx, e.nz, 0.42, 0.62);
        }
        if (this.cells.tin.length && Math.random() < 0.55) {
          const tt = 0.5 + Math.random() * (e.L - 1);
          const c = this.cells.tin[Math.floor(Math.random() * this.cells.tin.length)];
          this.card(this.signs, c, e.ax + e.dx * tt + e.nx * 0.11, 2.1 + Math.random() * 0.6, e.az + e.dz * tt + e.nz * 0.11, e.dx, e.dz, e.nx, e.nz, 1.15, 0.42);
        }
      }
      // উপরের তলার সাইনবোর্ড (কোচিং, চেম্বার...)
      if (b.h > 9 && Math.random() < 0.35) {
        const c = this.cells.upper[Math.floor(Math.random() * this.cells.upper.length)], sw = Math.min(e.L - 1, 6);
        if (sw > 2.5) this.card(this.signs, c, e.mx + e.nx * 0.09, 6.7 + Math.floor(Math.random() * 2) * 3.1, e.mz + e.nz * 0.09, e.dx, e.dz, e.nx, e.nz, sw, sw / 4);
      }
      // ছাদে বিলবোর্ড
      if (bills < 45 && b.h > 9 && b.h < 40 && b.area > 110 && Math.random() < 0.24) {
        const c = this.cells.bill[bills % this.cells.bill.length];
        const bw = Math.min(e.L * 0.9, 10), bh = bw / 2.5;
        const x = e.mx - e.nx * 1.2, z = e.mz - e.nz * 1.2, y = b.h + 1.6 + bh / 2;
        this.card(this.signs, c, x, y, z, e.dx, e.dz, e.nx, e.nz, bw, bh);
        const back = addBox(this.props, bw, bh, 0.15, lam(0x4a4f55), x - e.nx * 0.09, y, z - e.nz * 0.09); back.rotation.y = ry;
        for (const sg of [-0.35, 0.35]) addBox(this.props, 0.2, 1.8, 0.2, lam(0x4a4f55), x + e.dx * bw * sg - e.nx * 0.3, b.h + 0.9, z + e.dz * bw * sg - e.nz * 0.3);
        const walk = addBox(this.props, bw, 0.08, 0.7, lam(0x555a60), x + e.nx * 0.3, y - bh / 2 - 0.05, z + e.nz * 0.3); walk.rotation.y = ry;
        bills++;
        this.count.bills++;
      }
    }
    this.wallPosters = wall;
  }
  // ---------- ফুটপাতের দোকান, ফলের ভ্যান, ময়লা ----------
  // টং দোকানে ঝোলানো বয়াম + কলা
  dressTong(grp, wood, steel) {
    for (let i = 0; i < 5; i++) {
      const jx = -0.45 + i * 0.22, jy = 1.55 + (i % 2) * 0.08;
      addCyl(grp, 0.01, 0.01, 0.28, steel, jx, jy + 0.2, 0.35, 4); // সুতো
      addCyl(grp, 0.07, 0.08, 0.2, lam(FOLK_HEX[i % FOLK_HEX.length]), jx, jy, 0.35, 8); // বয়াম
    }
    for (let i = 0; i < 4; i++) {
      const ban = addCyl(grp, 0.04, 0.055, 0.28, lam(0xffd54f), 0.35 + i * 0.06, 1.72, -0.15 - i * 0.02, 6);
      ban.rotation.z = 0.5 + i * 0.12; ban.rotation.x = 0.3;
    }
    addCyl(grp, 0.02, 0.02, 0.2, wood, 0.48, 1.85, -0.1, 4);
  }
  buildStalls() {
    const M = this.M, W = this.W, G = this.props;
    const wood = lam(0x8a5a2b), tin = lam(0x9aa3a8), dark = lam(0x2a2a2a), red = lam(0xc62828), steel = lam(0xb8bcc0);
    const fruitCols = [0xffa000, 0xe53935, 0x7cb342, 0xfdd835, 0x8e24aa].map((c) => lam(c));
    const trash = [lam(0x3e4a2e), lam(0x5a4a3a), lam(0x6d6d6d), lam(0x8a7a4a)];
    const stallBoard = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#ffd400'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0161c'; c.font = `700 34px "Hind Siliguri", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('গরম চা ৳১০', w / 2, h / 2 + 2); });
    const boardMat = new THREE.MeshLambertMaterial({ map: stallBoard });
    const placeTong = (x, z, ry, side) => {
      if (!this.free(x, z, 1.1) || W.onRoad(x, z, 0.2)) return false;
      this.mark(x, z, 1.2);
      const grp = new THREE.Group(); grp.position.set(x, 0.16, z); grp.rotation.y = ry + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      addBox(grp, 1.4, 0.95, 0.9, wood, 0, 0.48, 0);
      addBox(grp, 1.6, 0.05, 1.3, tin, 0, 2.05, 0.1);
      for (const sx of [-0.72, 0.72]) addBox(grp, 0.05, 1.1, 0.05, wood, sx, 1.5, -0.4);
      addCyl(grp, 0.16, 0.2, 0.28, steel, -0.35, 1.1, 0, 10);
      addCyl(grp, 0.03, 0.03, 0.2, steel, -0.18, 1.18, 0, 4);
      for (let i = 0; i < 4; i++) addCyl(grp, 0.08, 0.08, 0.22, lam(FOLK_HEX[i % FOLK_HEX.length]), 0.1 + i * 0.17, 1.07, -0.1, 8);
      addBox(grp, 1.6, 0.08, 0.35, wood, 0, 0.42, 1.0);
      for (const sx of [-0.7, 0.7]) addBox(grp, 0.06, 0.4, 0.3, wood, sx, 0.2, 1.0);
      this.dressTong(grp, wood, steel);
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), boardMat); bd.position.set(0, 1.85, 0.46); grp.add(bd);
      W.addBox(x - 0.8, x + 0.8, z - 0.8, z + 0.8, 1.2, 'stall');
      G.add(grp); this.count.stalls++; return true;
    };
    // মোড়/ইন্টারসেকশনে টং দোকান অগ্রাধিকার
    M.nodes.forEach((n, i) => {
      if (n.links.length < 3 || Math.random() > 0.55) return;
      const r = (W.nodeW && W.nodeW[i] && W.nodeW[i].r) || 6;
      const l = n.links[Math.floor(Math.random() * n.links.length)];
      const s = M.segments[l.seg];
      if (!s.main) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      const nx = -s.dir.z, nz = s.dir.x, t = Math.min(s.len - 4, r + 3 + Math.random() * 4);
      const along = s.a === n.id ? t : s.len - t;
      const x = s.ax + s.dir.x * along + nx * side * (s.width / 2 + FOOT - 0.85);
      const z = s.az + s.dir.z * along + nz * side * (s.width / 2 + FOOT - 0.85);
      placeTong(x, z, Math.atan2(s.dir.x, s.dir.z), side);
    });
    for (const s of M.segments) {
      if (!s.main || s.len < 25) continue;
      const nx = -s.dir.z, nz = s.dir.x, ry = Math.atan2(s.dir.x, s.dir.z);
      for (let t = 12; t < s.len - 8; t += 22) {
        if (Math.random() > 0.42) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = side * (s.width / 2 + FOOT - 0.85);
        const x = s.ax + s.dir.x * t + nx * off, z = s.az + s.dir.z * t + nz * off;
        if (!this.free(x, z, 1.1) || W.onRoad(x, z, 0.2) || W.otherRoad(x, z, s, 1.2) || W.sideBlocked(s, t, side * (s.width / 2 + 0.3))) continue;
        const r = Math.random();
        if (r < 0.42) { placeTong(x, z, ry, side); continue; } // টং: ঝোলানো বয়াম + কলা
        this.mark(x, z, 1.2);
        const grp = new THREE.Group(); grp.position.set(x, 0.16, z); grp.rotation.y = ry + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (r < 0.66) {
          // ফলের ভ্যান: রঙিন ফলের স্তূপ
          addBox(grp, 1.2, 0.08, 1.6, wood, 0, 0.75, 0);
          for (const [wx, wz] of [[-0.55, 0.55], [0.55, 0.55], [0, -0.75]]) { const w = addCyl(grp, 0.32, 0.32, 0.06, dark, wx, 0.33, wz, 10); w.rotation.z = Math.PI / 2; }
          for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(FRUIT_G, fruitCols[i % fruitCols.length]); m.position.set((Math.random() - 0.5) * 1.0, 0.86 + Math.random() * 0.2, (Math.random() - 0.5) * 1.4); grp.add(m); }
          addBox(grp, 0.05, 1.3, 0.05, wood, 0.55, 1.4, 0.75);
          addBox(grp, 1.0, 0.03, 1.0, red, 0.3, 2.05, 0.3); // রঙিন ছাতা
          W.addBox(x - 0.75, x + 0.75, z - 0.75, z + 0.75, 1.0, 'stall');
        } else if (r < 0.86) {
          // ময়লার স্তূপ
          for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(TRASH_G, trash[i % trash.length]); m.position.set((Math.random() - 0.5) * 1.2, 0.12, (Math.random() - 0.5) * 1.0); m.scale.set(0.5 + Math.random() * 0.6, 0.35 + Math.random() * 0.4, 0.5 + Math.random() * 0.6); m.rotation.y = Math.random() * 6; grp.add(m); }
        } else {
          // পান-সিগারেটের ছোট টং দোকান
          addBox(grp, 0.9, 1.1, 0.7, lam(0x1e6f9f), 0, 0.55, 0);
          addBox(grp, 1.0, 0.05, 0.85, tin, 0, 1.75, 0.1);
          for (const sx of [-0.45, 0.45]) addBox(grp, 0.04, 0.65, 0.04, wood, sx, 1.42, -0.3);
          for (let i = 0; i < 6; i++) addBox(grp, 0.12, 0.08, 0.05, lam(FOLK_HEX[i % FOLK_HEX.length]), -0.3 + i * 0.12, 1.2, 0.36);
          W.addBox(x - 0.55, x + 0.55, z - 0.55, z + 0.55, 1.3, 'stall');
        }
        G.add(grp);
        this.count.stalls++;
      }
    }
  }
  // ---------- রাস্তার পাশের বড় বিলবোর্ড: উঁচু খুঁটি, V আকারে দুই বোর্ড (দুই দিকের গাড়ি দেখে), মাথায় বাতি ----------
  buildRoadBills() {
    const M = this.M, W = this.W, G = this.props;
    const steel = lam(0x5d646b), dark = lam(0x2f3438), lampHead = lam(0x9aa2a8);
    const TH = 22 * Math.PI / 180, BW = 7.5, BH = 3, Y = 9.4;
    let n = 0, k = 0;
    for (const s of M.segments) {
      if (!s.main || s.len < 70) continue;
      const nx = -s.dir.z, nz = s.dir.x, ux = s.dir.x, uz = s.dir.z;
      for (let t = 30; t < s.len - 25; t += 95 + Math.random() * 60) {
        if (n >= 40) return;
        if (Math.random() > 0.6) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = side * (s.width / 2 + 0.55); // ফুটপাতে, কার্বের কাছে (ঢাকার মতো)
        const x = s.ax + ux * t + nx * off, z = s.az + uz * t + nz * off;
        if (!this.free(x, z, 1.5) || W.onRoad(x, z, 0.1) || W.otherRoad(x, z, s, 3)) continue;
        const inx = -nx * side, inz = -nz * side; // রাস্তার দিকে
        // দুই বাহু: খুঁটি (রাস্তার কাছে) থেকে রাস্তা বরাবর দুই দিকে, রাস্তা থেকে একটু দূরে হেলে
        const arms = [1, -1].map((sg) => { const ax = ux * sg * Math.cos(TH) - inx * Math.sin(TH), az = uz * sg * Math.cos(TH) - inz * Math.sin(TH); return [ax, az]; });
        let ok = true;
        for (const [ax, az] of arms) for (const f of [0.5, 1]) if (W.blocked(x + ax * BW * f, Y, z + az * BW * f)) ok = false; // উঁচুতে, তাই শুধু দালান দেখা
        if (!ok) continue;
        this.mark(x, z, 1.5);
        addCyl(G, 0.26, 0.34, Y - BH / 2, steel, x, (Y - BH / 2) / 2, z, 10);
        W.addBox(x - 0.32, x + 0.32, z - 0.32, z + 0.32, Y, 'pole');
        for (const [ax, az] of arms) {
          let fx = -az, fz = ax; if (fx * inx + fz * inz < 0) { fx = -fx; fz = -fz; } // মুখ রাস্তার দিকে
          const cx = x + ax * BW / 2, cz = z + az * BW / 2, ry = Math.atan2(fx, fz);
          this.card(this.signs, this.cells.bill[k++ % this.cells.bill.length], cx + fx * 0.09, Y, cz + fz * 0.09, ax, az, fx, fz, BW, BH);
          const back = addBox(G, BW, BH + 0.2, 0.16, dark, cx, Y, cz); back.rotation.y = ry;
          const walk = addBox(G, BW, 0.07, 0.8, steel, cx + fx * 0.45, Y - BH / 2 - 0.12, cz + fz * 0.45); walk.rotation.y = ry;
          const beam = addBox(G, BW, 0.18, 0.18, steel, cx - fx * 0.2, Y - BH / 2 - 0.1, cz - fz * 0.2); beam.rotation.y = ry;
          // উপরে তিনটা বাতি, সামনে ঝুঁকে
          for (const f of [-0.33, 0, 0.33]) {
            const lx = cx + ax * BW * f + fx * 0.75, lz = cz + az * BW * f + fz * 0.75;
            const arm = addBox(G, 0.06, 0.06, 0.8, steel, cx + ax * BW * f + fx * 0.38, Y + BH / 2 + 0.25, cz + az * BW * f + fz * 0.38); arm.rotation.y = ry;
            const hd = addBox(G, 0.3, 0.12, 0.2, lampHead, lx, Y + BH / 2 + 0.22, lz); hd.rotation.y = ry;
          }
        }
        n++; this.count.bills++; this.count.roadBills = (this.count.roadBills || 0) + 1;
      }
    }
  }
  // ---------- জেব্রা ক্রসিং, রাস্তার গর্ত আর পানি ----------
  buildMarks() {
    const M = this.M, W = this.W;
    const zeb = new Tris();
    M.nodes.forEach((n, i) => {
      if (n.links.length < 3) return;
      const r = (W.nodeW && W.nodeW[i] && W.nodeW[i].r) || 6;
      for (const l of n.links) {
        const s = M.segments[l.seg];
        if (!s.main || s.len < r + 8) continue;
        const sg = s.a === n.id ? 1 : -1, d = sg > 0 ? s.dir : { x: -s.dir.x, z: -s.dir.z };
        const t = r + 1.6, x = n.x + d.x * t, z = n.z + d.z * t;
        const nx = -d.z, nz = d.x, hw = s.width / 2 - 0.3;
        const P = (lat, lon) => [x + nx * lat + d.x * lon, 0.078, z + nz * lat + d.z * lon];
        zeb.quad(P(-hw, -1.5), P(hw, -1.5), P(hw, 1.5), P(-hw, 1.5), [0, 0], [s.width / 2, 0], [s.width / 2, 1], [0, 1], [0, 1, 0]);
        this.count.zebra++;
      }
    });
    // গর্ত, ভাঙা পিচ আর রাস্তার কাজ: roadworks.js
    const zt = this.g.T && this.g.T.zebra ? this.g.T.zebra : null;
    if (zt) {
      const zt2 = zt.clone(); zt2.wrapS = THREE.RepeatWrapping; zt2.needsUpdate = true;
      const zm = new THREE.MeshLambertMaterial({ map: zt2, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      if (zeb.pos.length) { const m = zeb.mesh(zm); m.receiveShadow = true; m.renderOrder = 1; this.g.scene.add(m); }
    }
  }
  // ---------- "সামনে স্কুল", "সামনে আদালত"... বোর্ড, গতিরোধক, স্কুলের সামনে জেব্রা ----------
  buildSigns() {
    const g = this.g, M = this.M, W = this.W;
    const DEF = {
      school: ['সামনে স্কুল', 'গতি কমান'], madrasa: ['সামনে মাদ্রাসা', 'গতি কমান'], court: ['সামনে আদালত', 'হর্ন বাজাবেন না'],
      thana: ['সামনে থানা', 'সাবধানে চলুন'], hospital: ['সামনে হাসপাতাল', 'হর্ন বাজাবেন না'], metro: ['সামনে মেট্রো স্টেশন', '১৫০ মিটার', true],
      bus: ['সামনে বাস স্টপেজ', 'বাম লেনে থামুন', true], junction: ['সামনে মোড়', 'সাবধানে চলুন'], bump: ['সামনে গতিরোধক', 'আস্তে চালান'],
      zebra: ['সামনে জেব্রা ক্রসিং', 'পথচারীকে আগে যেতে দিন'],
    };
    const SA = (this.signAtlas = new Atlas(1024, 1024));
    this.signCells = {};
    for (const [k, [a, b, info]] of Object.entries(DEF)) this.signCells[k] = { c: SA.add(200, 250, (c, w, h) => roadSign(c, w, h, k, a, b, !!info)), info: !!info };
    this.signBack = SA.add(200, 250, signBack);
    this.signBackI = SA.add(200, 250, signBackInfo);
    const tex = SA.texture();
    this.roadSignMat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000, alphaTest: 0.5 });
    this.signQ = new Tris();
    this.bumps = [];
    this.count.roadSigns = 0;
    const poleM = lam(0x9aa0a6);
    // এক জায়গায় বোর্ড: (x,z) বিন্দুর আগে dist মিটারে, চলার দিক T-এর বাম পাশের ফুটপাতে, আসা গাড়ির দিকে মুখ
    const place = (kind, px, pz, dist, T0) => {
      const ns = M.nearestSeg(px, pz);
      if (!ns || ns.d > 30) return;
      const dirs = T0 ? [T0] : [ns.seg.dir, { x: -ns.seg.dir.x, z: -ns.seg.dir.z }];
      for (const T of dirs) {
        for (const extra of [0, 4, -4, 8]) {
          const qx = ns.px - T.x * (dist + extra), qz = ns.pz - T.z * (dist + extra);
          const n2 = M.nearestSeg(qx, qz);
          if (!n2 || n2.d > 12) continue;
          const s2 = n2.seg, dot = s2.dir.x * T.x + s2.dir.z * T.z;
          if (Math.abs(dot) < 0.6) continue;
          const T2 = dot > 0 ? s2.dir : { x: -s2.dir.x, z: -s2.dir.z };
          const Lx = T2.z, Lz = -T2.x;
          const off = s2.width / 2 + (s2.main ? FOOT - 0.45 : 0.45);
          const x = n2.px + Lx * off, z = n2.pz + Lz * off;
          if (!this.free(x, z, 0.45) || W.otherRoad(x, z, s2, 0.3) || W.onRoad(x, z, 0.1)) continue;
          const y0 = s2.main ? 0.16 : 0;
          addCyl(this.props, 0.045, 0.055, 2.9, poleM, x, y0 + 1.45, z, 6);
          const cell = this.signCells[kind];
          this.card(this.signQ, cell.c, x, y0 + 2.55, z, 0, 0, -T2.x, -T2.z, 0.66, 0.825, true, cell.info ? this.signBackI : this.signBack);
          this.mark(x, z, 1.2);
          (this.signList || (this.signList = [])).push([kind, x, z, -T2.x, -T2.z]);
          W.addBox(x - 0.07, x + 0.07, z - 0.07, z + 0.07, 3, 'pole');
          this.count.roadSigns++;
          break;
        }
      }
    };
    // স্কুল-মাদ্রাসা, আদালত, থানা, হাসপাতাল (একই প্রতিষ্ঠানের কাছাকাছি ভবন একবারই)
    const targets = [];
    for (const b of M.civic || []) if (['school', 'madrasa', 'court'].includes(b.civic)) targets.push([b.civic, b]);
    if (M.places.thana) targets.push(['thana', M.places.thana]);
    if (M.places.hospital) targets.push(['hospital', M.places.hospital]);
    const done = [];
    const zeb = new Tris();
    for (const [kind, b] of targets) {
      if (done.some(([k, x, z]) => k === kind && Math.hypot(x - b.door.x, z - b.door.z) < 70)) continue;
      done.push([kind, b.door.x, b.door.z]);
      place(kind, b.door.x, b.door.z, 48);
      // স্কুল, মাদ্রাসা, হাসপাতালের সামনে গতিরোধক আর (স্কুলে) জেব্রা
      if (kind === 'school' || kind === 'madrasa' || kind === 'hospital') {
        const ns = M.nearestSeg(b.door.x, b.door.z);
        if (ns && ns.d < 20 && ns.t > 8 && ns.t < ns.seg.len - 8) {
          const s2 = ns.seg, nx = -s2.dir.z, nz = s2.dir.x;
          for (const o of [-9, 9]) this.bumps.push({ x: ns.px + s2.dir.x * o, z: ns.pz + s2.dir.z * o, dx: s2.dir.x, dz: s2.dir.z, w: s2.width });
          if (kind !== 'hospital') {
            const hw = s2.width / 2 - 0.2, P = (lat, lon) => [ns.px + nx * lat + s2.dir.x * lon, 0.079, ns.pz + nz * lat + s2.dir.z * lon];
            zeb.quad(P(-hw, -1.5), P(hw, -1.5), P(hw, 1.5), P(-hw, 1.5), [0, 0], [s2.width / 2, 0], [s2.width / 2, 1], [0, 1], [0, 1, 0]);
          }
          place('bump', ns.px, ns.pz, 26);
        }
      }
    }
    // মেট্রো স্টেশন (ফুটপাতের গেট থেকে ১৫০ মি আগে)
    for (const st of (g.metro && g.metro.stations) || []) { const gt = (st.gates || [])[0]; if (gt) place('metro', gt.x, gt.z, 150); }
    // বাস কাউন্টার: চলার দিকেই
    for (const c of (g.buses && g.buses.counters) || []) place('bus', c.stop.x, c.stop.z, 55, c.d);
    // বড় মোড়: পালা করে "সামনে মোড়" আর "সামনে জেব্রা ক্রসিং"
    let jn = 0;
    M.nodes.forEach((n, i) => {
      if (n.links.length < 3 || jn > 70) return;
      const r = (W.nodeW && W.nodeW[i].r) || 6;
      for (const l of n.links) {
        const sg = M.segments[l.seg];
        if (!sg.main || sg.len < r + 45) continue;
        const towards = sg.a === n.id ? { x: -sg.dir.x, z: -sg.dir.z } : sg.dir;
        place(jn % 2 ? 'zebra' : 'junction', n.x, n.z, r + 38, towards);
        jn++;
      }
    });
    // গতিরোধকের চেহারা: হলুদ-কালো ডোরা, একটু উঁচু
    if (this.bumps.length) {
      const bq = new Tris();
      for (const b of this.bumps) {
        const nx = -b.dz, nz = b.dx, hw = b.w / 2;
        const P = (lat, lon, y) => [b.x + nx * lat + b.dx * lon, y, b.z + nz * lat + b.dz * lon];
        bq.quad(P(-hw, -0.25, 0.13), P(hw, -0.25, 0.13), P(hw, 0.25, 0.13), P(-hw, 0.25, 0.13), [0, 0], [b.w, 0], [b.w, 1], [0, 1], [0, 1, 0]);
        for (const sg of [-1, 1]) bq.quad(P(-hw, sg * 0.25, 0.13), P(hw, sg * 0.25, 0.13), P(hw, sg * 0.6, 0.065), P(-hw, sg * 0.6, 0.065), [0, 0], [b.w, 0], [b.w, 0.5], [0, 0.5], [b.dx * sg, 0.6, b.dz * sg]);
      }
      const bt = canvasTex(64, 16, (c) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#1b1b1b' : '#f2c230'; c.fillRect(i * 16, 0, 16, 16); } }, true);
      const m = bq.mesh(new THREE.MeshLambertMaterial({ map: bt }));
      m.receiveShadow = true;
      this.g.scene.add(m);
    }
    if (zeb.pos.length && this.g.T && this.g.T.zebra) {
      const zt2 = this.g.T.zebra.clone(); zt2.wrapS = THREE.RepeatWrapping; zt2.needsUpdate = true;
      const m = zeb.mesh(new THREE.MeshLambertMaterial({ map: zt2, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.renderOrder = 1;
      this.g.scene.add(m);
    }
    if (this.signQ.pos.length) { const m = this.signQ.mesh(this.roadSignMat); m.castShadow = true; m.receiveShadow = true; this.g.scene.add(m); }
  }
  // গতিরোধকে জোরে উঠলে ঝাঁকুনি
  bumpCheck(dt) {
    const g = this.g, v = g.player.state === 'drive' ? g.player.vehicle : null;
    this.bumpCool = Math.max(0, (this.bumpCool || 0) - dt);
    if (!v || !this.bumps || this.bumpCool > 0 || (v.y || 0) > 0.6 || v.type === 'plane' || v.type === 'boat' || /heli/.test(v.type)) return;
    for (const b of this.bumps) {
      const ax = v.x - b.x, az = v.z - b.z;
      if (Math.abs(ax) > 12 || Math.abs(az) > 12) continue;
      const lon = ax * b.dx + az * b.dz, lat = ax * -b.dz + az * b.dx;
      if (Math.abs(lon) > 0.7 || Math.abs(lat) > b.w / 2) continue;
      const sp = Math.abs(v.speed);
      this.bumpCool = 0.8;
      if (sp > 5) {
        g.shake = Math.max(g.shake || 0, Math.min(0.6, sp * 0.03));
        g.sound.thud(Math.min(0.6, sp * 0.03));
        v.speed *= sp > 11 ? 0.6 : 0.8;
        if (sp > 13) { v.damage(4, 'player'); if (!this.bumpWarn) { this.bumpWarn = true; g.ui.toast('গতিরোধকে জোরে উঠলেন! আস্তে চালান', 'bad'); } }
      }
      return;
    }
  }
  // ---------- সব জোড়া লাগিয়ে দৃশ্যে ----------
  finish() {
    const sc = this.g.scene;
    if (this.signs.pos.length) { const m = this.signs.mesh(this.signMat); m.receiveShadow = true; sc.add(m); }
    if (this.wallPosters) {
      const W = this.wallPosters, C = this.cloth;
      for (let i = 0; i < W.pos.length; i++) C.pos.push(W.pos[i]);
      for (let i = 0; i < W.uv.length; i++) C.uv.push(W.uv[i]);
      for (let i = 0; i < W.nor.length; i++) C.nor.push(W.nor[i]);
    }
    if (this.cloth.pos.length) { const m = this.cloth.mesh(this.clothMat); m.receiveShadow = true; m.castShadow = true; sc.add(m); }
    const F = this.flags;
    if (F.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(F.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(F.col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(F.nor, 3));
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.castShadow = true;
      sc.add(m);
    }
    if (this.wires.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15171a }));
      sc.add(l);
    }
    sc.add(this.props);
    mergeStatic(this.props, true, true);
  }
  // রাতে সাইনবোর্ড-বিলবোর্ডে আলো
  update() {
    const n = this.g.sky ? this.g.sky.night : 0;
    if (Math.abs((this.nk ?? -1) - n) > 0.02) { this.nk = n; this.signMat.emissive.setRGB(n * 0.7, n * 0.7, n * 0.66); if (this.roadSignMat) this.roadSignMat.emissive.setRGB(n * 0.35, n * 0.35, n * 0.35); }
    this.bumpCheck(1 / 60);
  }
}
const FOLK_HEX = [0xe8202a, 0xffd400, 0x1a9e3f, 0x1d63c8, 0xff7a00, 0xe0157a];
const FRUIT_G = new THREE.SphereGeometry(0.1, 6, 5);
const TRASH_G = new THREE.IcosahedronGeometry(0.4, 0);
