import { vurl } from './ver.js';
// আসল ম্যাপ: OpenStreetMap থেকে বানানো data/map.json পড়ে গেমের ম্যাপ (মিরপুর ১০, মিরপুর ২, সেনপাড়া)
// data/map.json বানায় tools/osm2game.py। একক মিটার; x = পূর্ব, z = দক্ষিণ (উত্তর = -z)
// গেমের বাকি অংশ যে গঠন চায়: { nodes, segments, buildings, parks, water, places, spawn, parked, lakeDist, bounds }

import { extendMap } from './mapext.js';

export const FOOT = 2.5; // রাস্তার কিনারা থেকে হাঁটার জায়গা
const bn = (v) => String(v).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// দোকান-রেস্টুরেন্টের মজার নাম (আসল ব্যবসার নাম নয়)
const REST = ['ভাই ভাই বিরিয়ানি', 'কাচ্চি ঘর', 'চায়ের আড্ডা', 'ফুচকা কর্নার', 'গরম গরম পরোটা', 'মিরপুর কাবাব ঘর', 'পিৎজা প্লাস', 'মামার হোটেল', 'নান-কাবাব', 'স্টেডিয়াম ক্যাফে', 'তেহারি হাউস', 'মিষ্টিমুখ', 'বেনারসি চা', 'হালিম হাউস', 'চিকেন ফ্রাই কর্নার', 'খিচুড়ি বিলাস'];
const SHOP = ['ফার্মেসি', 'মোবাইল সার্ভিসিং', 'জুতার দোকান', 'সুপার শপ', 'বই ঘর', 'টেইলার্স', 'ইলেকট্রনিক্স', 'সেলুন', 'চশমা ঘর', 'কাপড়ের দোকান', 'বেনারসি শাড়ি ঘর', 'মুদি দোকান', 'হার্ডওয়্যার', 'ফটোকপি', 'বিকাশ এজেন্ট'];
const TYPE_NAME = { residential: 'গলি', living_street: 'সরু গলি', service: 'ভিতরের রাস্তা', unclassified: 'রাস্তা', tertiary: 'সংযোগ সড়ক', primary: 'প্রধান সড়ক', primary_link: 'সংযোগ' };
const AREA = 'মিরপুর';

export async function loadMap(url = 'data/map.json') {
  const r = await fetch(vurl(url));
  if (!r.ok) throw new Error('ম্যাপ ফাইল পাওয়া যায়নি: ' + url);
  return buildMap(extendMap(await r.json()));
}

// বহুভুজের সাহায্যকারী
export function inPoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// বহুভুজের কিনারা থেকে দূরত্ব, আর সবচেয়ে কাছের কিনারার বাইরের দিক
export function polyEdge(p, x, z) {
  let best = { d: 1e9, nx: 0, nz: 0, px: 0, pz: 0 };
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const ax = p[j][0], az = p[j][1], bx = p[i][0], bz = p[i][1];
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const px = ax + ex * t, pz = az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, px, pz, ex, ez };
  }
  return best;
}
function bbox(p) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
}
function polyArea(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
}

export function buildMap(d) {
  const R = rng(2026);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const [X0, X1, Z0, Z1] = d.bounds;
  const bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
  // রাস্তা ম্যাপের কিনারার বাইরে গেলে সীমানা বাড়ানো (না হলে রাস্তার মাঝে অদৃশ্য দেয়াল)
  for (const [x, z] of d.nodes) {
    bounds.x0 = Math.min(bounds.x0, x - 30); bounds.x1 = Math.max(bounds.x1, x + 30);
    bounds.z0 = Math.min(bounds.z0, z - 30); bounds.z1 = Math.max(bounds.z1, z + 30);
  }

  // ---------- রাস্তার জাল ----------
  const nodes = d.nodes.map(([x, z], i) => ({ id: i, x, z, links: [] }));
  const segments = [];
  for (const r of d.roads) {
    const name = r.n || TYPE_NAME[r.t] || 'রাস্তা';
    let ids = r.ids;
    if (r.o === -1) ids = [...ids].reverse(); // একমুখী: সবসময় a থেকে b
    for (let i = 0; i + 1 < ids.length; i++) {
      const A = nodes[ids[i]], B = nodes[ids[i + 1]];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      if (len < 0.05) continue;
      const s = {
        id: segments.length, a: A.id, b: B.id, ax: A.x, az: A.z, bx: B.x, bz: B.z, len,
        dir: { x: (B.x - A.x) / len, z: (B.z - A.z) / len },
        width: r.w, main: !!r.m, name, type: r.t, oneway: r.o ? 1 : 0, bridges: [],
      };
      segments.push(s);
      A.links.push({ to: B.id, seg: s.id });
      B.links.push({ to: A.id, seg: s.id });
    }
  }
  // দ্রুত খোঁজার জন্য রাস্তার গ্রিড
  const CELL = 40;
  const segGrid = new Map();
  for (const s of segments) {
    const m = s.width / 2 + 4;
    const gx0 = Math.floor((Math.min(s.ax, s.bx) - m) / CELL), gx1 = Math.floor((Math.max(s.ax, s.bx) + m) / CELL);
    const gz0 = Math.floor((Math.min(s.az, s.bz) - m) / CELL), gz1 = Math.floor((Math.max(s.az, s.bz) + m) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const k = gx + ',' + gz;
      if (!segGrid.has(k)) segGrid.set(k, []);
      segGrid.get(k).push(s);
    }
  }
  // (x,z) এর কাছের রাস্তা: { seg, t, d, px, pz, lat }
  function nearestSeg(x, z, filter) {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let best = null;
    for (let ring = 0; ring < 30; ring++) {
      for (let ix = gx - ring; ix <= gx + ring; ix++) for (let iz = gz - ring; iz <= gz + ring; iz++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iz - gz)) !== ring) continue;
        const l = segGrid.get(ix + ',' + iz);
        if (!l) continue;
        for (const s of l) {
          if (filter && !filter(s)) continue;
          const t = Math.max(0, Math.min(s.len, (x - s.ax) * s.dir.x + (z - s.az) * s.dir.z));
          const px = s.ax + s.dir.x * t, pz = s.az + s.dir.z * t;
          const dd = Math.hypot(x - px, z - pz);
          if (!best || dd < best.d) best = { seg: s, t, d: dd, px, pz, lat: (x - px) * s.dir.z - (z - pz) * s.dir.x };
        }
      }
      // এই রিং পর্যন্ত যা পাওয়া গেছে তার চেয়ে কাছে আর কিছু থাকতে পারে না
      if (best && best.d < ring * CELL) break;
    }
    return best;
  }
  function segsNear(x, z) { return segGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }

  // ---------- পানি আর পার্ক ----------
  const water = d.water.map((w) => ({ p: w.p, b: bbox(w.p), name: w.n }));
  const parks = d.parks.map((w) => ({ p: w.p, b: bbox(w.p), name: w.n, kind: w.k }));
  // পানির কিনারা থেকে দূরত্ব (ভিতরে হলে ঋণাত্মক)
  function lakeDist(x, z) {
    let best = 1e9;
    for (const w of water) {
      if (x < w.b.x0 - 60 || x > w.b.x1 + 60 || z < w.b.z0 - 60 || z > w.b.z1 + 60) continue;
      const e = polyEdge(w.p, x, z).d;
      best = Math.min(best, inPoly(w.p, x, z) ? -e : e);
    }
    return best;
  }

  // ---------- বিল্ডিং ----------
  // রাস্তার জায়গা ফাঁকা রাখা: কোন বিন্দু রাস্তার কত ভিতরে, আর কোন দিকে ঠেলে বের করতে হবে
  const clear = (s) => s.width / 2 + (s.main ? FOOT : 0.5);
  // মোড় আর বাঁকের গোল অংশ: রাস্তার সাথে ফুটপাতের জায়গাও ফাঁকা
  const nodeR = nodes.map((n) => (n.links.length >= 2 ? Math.max(...n.links.map((l) => clear(segments[l.seg]))) : 0));
  function roadPush(x, z, cx, cz) {
    let best = null;
    for (const s of segsNear(x, z)) {
      const t = (x - s.ax) * s.dir.x + (z - s.az) * s.dir.z;
      if (t < 0 || t > s.len) continue;
      const lat = (x - s.ax) * s.dir.z - (z - s.az) * s.dir.x;
      const C = clear(s);
      if (Math.abs(lat) >= C) continue;
      // কেন্দ্র যেদিকে, সেদিকে ঠেলা (রাস্তার ওপারে নয়)
      const side = Math.abs(lat) > 0.05 ? Math.sign(lat) : Math.sign((cx - s.ax) * s.dir.z - (cz - s.az) * s.dir.x) || 1;
      const need = C - Math.abs(lat);
      if (!best || need > best.need) best = { need, nx: s.dir.z * side, nz: -s.dir.x * side };
    }
    // বাঁক আর মোড়ের গোল অংশ
    for (const s of segsNear(x, z)) {
      for (const id of [s.a, s.b]) {
        const n = nodes[id], r = nodeR[id];
        if (!r) continue;
        const dx = x - n.x, dz = z - n.z, dd = Math.hypot(dx, dz);
        if (dd >= r || dd < 1e-3) continue;
        if (!best || r - dd > best.need) best = { need: r - dd, nx: dx / dd, nz: dz / dd };
      }
    }
    return best;
  }
  const buildings = [];
  let houseNo = 1, dropped = 0, trimmed = 0;
  for (const b of d.buildings) {
    let p = b.p;
    if (polyArea(p) < 0) p = [...p].reverse(); // ঘড়ির কাঁটার উল্টো দিকে (উপর থেকে, z দক্ষিণে)
    const area0 = Math.abs(polyArea(p));
    if (area0 < 6) continue;
    let ox = 0, oz = 0;
    for (const [x, z] of p) { ox += x; oz += z; }
    ox /= p.length; oz /= p.length;
    // বিল্ডিংয়ের মাঝখানই রাস্তায় হলে বাদ
    if (roadPush(ox, oz, ox, oz)) { dropped++; continue; }
    // রাস্তায় ঢুকে থাকা অংশটুকু রাস্তার কিনারা বরাবর কেটে বাদ (পাশের বাড়ির দিকে সরে না, আকারও জট পাকায় না)
    const clip = (q, px, pz, nx, nz) => {
      const out = [], side = (v) => (v[0] - px) * nx + (v[1] - pz) * nz;
      for (let i = 0; i < q.length; i++) {
        const A = q[i], B = q[(i + 1) % q.length], sa = side(A), sb = side(B);
        if (sa >= 0) out.push(A);
        if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      return out;
    };
    let moved = false;
    const mx = ox, mz = oz;
    for (let it = 0; it < 10 && p.length >= 3; it++) {
      // সবচেয়ে গভীর বিন্দু খুঁজে সেখানে কাটা
      let best = null;
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length];
        const n = Math.min(80, Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]))));
        for (let k = 0; k < n; k++) {
          const x = A[0] + ((B[0] - A[0]) * k) / n, z = A[1] + ((B[1] - A[1]) * k) / n;
          const r = roadPush(x, z, mx, mz);
          if (r && (!best || r.need > best.need)) best = { ...r, x, z };
        }
      }
      if (!best) break;
      moved = true;
      const m = best.need + 0.08;
      p = clip(p, best.x + best.nx * m, best.z + best.nz * m, best.nx, best.nz);
    }
    const area = Math.abs(polyArea(p));
    if (moved) {
      trimmed++;
      if (p.length < 3 || area < 8 || area < area0 * 0.35) { dropped++; continue; }
    }
    let cx = 0, cz = 0;
    for (const [x, z] of p) { cx += x; cz += z; }
    cx /= p.length; cz /= p.length;
    const nr = nearestSeg(cx, cz);
    if (!nr) continue;
    const nearMain = nearestSeg(cx, cz, (s) => s.main);
    const mainD = nearMain ? nearMain.d : 1e9;
    // উচ্চতা: লেখা থাকলে সেটা, না থাকলে আকার আর জায়গা দেখে আন্দাজ
    let floors;
    const k = b.k || 'yes';
    if (b.h) floors = b.h / 3.1;
    else if (b.l) floors = b.l;
    else if (area < 35) floors = 1 + Math.floor(R() * 2); // টিনশেড, ছোট ঘর
    else if (k === 'house') floors = 2 + Math.floor(R() * 3);
    else if (k === 'place_of_worship' || k === 'mosque') floors = 2 + Math.floor(R() * 2);
    else if (k === 'school' || k === 'college') floors = 3 + Math.floor(R() * 3);
    else if (k === 'hospital') floors = 6 + Math.floor(R() * 5);
    else if (k === 'marketplace' || k === 'industrial' || k === 'shed' || k === 'roof') floors = 1 + Math.floor(R() * 3);
    else if (k === 'commercial' || k === 'retail') floors = mainD < 40 ? 8 + Math.floor(R() * 7) : 4 + Math.floor(R() * 4);
    else if (area < 90) floors = 3 + Math.floor(R() * 3);
    else if (area < 260) floors = 5 + Math.floor(R() * 3);
    else floors = 6 + Math.floor(R() * 4);
    if (!b.l && !b.h && mainD < 30 && floors >= 3) floors += 2 + Math.floor(R() * 4); // প্রধান সড়কের পাশে উঁচু
    const h = b.h || floors * 3.1 + 0.4;
    // দরজা: সবচেয়ে কাছের রাস্তার কিনারায়
    const s = nr.seg;
    let fx = cx - nr.px, fz = cz - nr.pz;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const edge = s.width / 2 + 1.0;
    const door = { x: nr.px + fx * edge, z: nr.pz + fz * edge };
    const bb = bbox(p);
    const kind = mainD < 26 || (nr.d < 14 && R() < 0.25) ? 'shop' : 'home';
    buildings.push({
      p, area, x: cx, z: cz, w: bb.x1 - bb.x0, d: bb.z1 - bb.z0, b: bb, h, floors: Math.round(h / 3.1),
      door, doorD: nr.d, face: { x: -fx, z: -fz }, road: s.name, seg: s.id, main: mainD < 26,
      kind, osmKind: k, landmark: b.n || null, color: Math.floor(R() * 1000),
      name: null, addr: `বাসা ${bn(houseNo++)}, ${s.name}, ${AREA}`,
    });
  }
  const bnear = (x, z, f, maxD = 40) => {
    let best = null, bd = maxD;
    for (const b of buildings) {
      if (f && !f(b)) continue;
      const dd = Math.hypot(b.x - x, b.z - z);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best;
  };

  // ---------- বিশেষ জায়গা ----------
  const pois = d.pois;
  const poi = (k, re) => pois.filter((q) => q.k === k && (!re || re.test(q.n || '')));
  const used = new Set();
  const claim = (b, kind, name) => { if (!b) return null; b.kind = kind; b.name = name; used.add(b); return b; };
  // থানা: মিরপুর-১০ পুলিশ বক্সের কাছে, প্রধান সড়কের পাশের বড় বিল্ডিং
  const pb = poi('police')[0] || { x: -420, z: -180 };
  const thana = claim(bnear(pb.x, pb.z, (b) => b.area > 120 && b.doorD < 20 && segments[b.seg].main, 250) || bnear(pb.x, pb.z, (b) => b.area > 80 && segments[b.seg].width >= 6, 400) || bnear(pb.x, pb.z, null, 400), 'thana', 'মিরপুর সেন্ট্রাল থানা');
  // হাসপাতাল: আসল একটা হাসপাতালের জায়গায়, বানানো নামে
  const hp = poi('hospital', /popular|পপুলার/i)[0] || poi('hospital')[0] || { x: 0, z: 0 };
  const hospital = claim(bnear(hp.x, hp.z, (b) => !used.has(b) && b.area > 120, 80) || bnear(hp.x, hp.z, (b) => !used.has(b), 300), 'hospital', 'মিরপুর জেনারেল হাসপাতাল');
  if (hospital) hospital.h = Math.max(hospital.h, 26);
  // অস্ত্রের দোকান: সেনপাড়ার গলিতে
  const gunshop = claim(
    buildings.find((b) => !used.has(b) && /senpara|সেনপাড়া/i.test(b.road) && b.doorD < 12 && b.area < 200)
    || buildings.find((b) => !used.has(b) && !b.main && b.doorD < 10),
    'gunshop', 'অস্ত্রের দোকান',
  );
  // রেস্টুরেন্ট: আসল খাবারের দোকানের জায়গায়, মজার নামে
  const restaurants = [];
  const restNames = [...REST];
  for (const q of pois.filter((x) => x.k === 'restaurant' || x.k === 'fast_food' || x.k === 'cafe')) {
    const b = bnear(q.x, q.z, (x) => !used.has(x) && x.doorD < 25, 25);
    if (!b) continue;
    const nm = restNames.length ? restNames.splice(Math.floor(R() * restNames.length), 1)[0] : `${pick(REST)} ${bn(restaurants.length + 1)}`;
    restaurants.push(claim(b, 'rest', nm));
    if (restaurants.length >= 24) break;
  }
  // কুরিয়ার পয়েন্ট: প্রধান সড়কের পাশে ৩টা
  const couriers = [];
  for (const b of buildings) {
    if (couriers.length >= 3) break;
    if (used.has(b) || !b.main || b.area < 80) continue;
    if (couriers.some((c) => Math.hypot(c.x - b.x, c.z - b.z) < 350)) continue;
    couriers.push(claim(b, 'courier', 'কুরিয়ার পয়েন্ট'));
  }
  // অফিস ভবন: প্রধান সড়কের পাশের উঁচু বড় বিল্ডিং (লিফটে ছাদে হেলিপ্যাড)
  const offices = [];
  const OFFICE = ['জ্যাম সিটি টাওয়ার', 'ফাইল চাপা কর্পোরেট হাউস', 'ডেডলাইন ট্রেড সেন্টার'];
  for (const b of [...buildings].sort((a, c) => c.h * c.area - a.h * a.area)) {
    if (offices.length >= 3) break;
    if (used.has(b) || !b.main || b.h < 24 || b.area < 250 || b.doorD > 14) continue;
    if (offices.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 300)) continue;
    offices.push(claim(b, 'office', OFFICE[offices.length]));
  }
  for (const b of buildings) if (b.kind === 'shop' && !b.name) b.name = pick(SHOP);
  const homes = buildings.filter((b) => b.kind === 'home' && b.doorD < 16 && b.area > 40);
  for (const b of buildings) if (b.landmark && !b.name) b.name = b.landmark;

  // থানার সামনে রাস্তার কিনারায় দুইটা পুলিশের গাড়ি
  const thanaCars = [];
  if (thana) {
    const s = segments[thana.seg];
    const nr = nearestSeg(thana.door.x, thana.door.z);
    const side = nr.lat >= 0 ? 1 : -1; // থানা রাস্তার কোন পাশে
    const nx = s.dir.z * side, nz = -s.dir.x * side;
    for (const k of [-7, 7]) {
      const t = Math.max(3, Math.min(s.len - 3, nr.t + k));
      const off = s.width / 2 - 1.2;
      thanaCars.push({ x: s.ax + s.dir.x * t + nx * off, z: s.az + s.dir.z * t + nz * off, yaw: Math.atan2(-s.dir.x, -s.dir.z) });
    }
    thana.face = { x: -nx, z: -nz };
  }

  // ---------- শুরুর জায়গা আর নিজের যানবাহন ----------
  // মিরপুর-১০ গোলচত্বরের কাছে একটা দুইমুখী গলি
  const st = pois.find((q) => q.k === 'station') || { x: 0, z: 0 };
  let ss = null, sd = 1e9;
  for (const s of segments) {
    if (s.main || s.oneway || s.len < 48 || s.width < 6 || s.type !== 'residential') continue;
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    const dd = Math.hypot(mx - (st.x + 120), mz - (st.z + 60));
    if (dd < sd) { sd = dd; ss = s; }
  }
  if (!ss) ss = segments.reduce((a, s) => (s.len > a.len ? s : a), segments[0]);
  const yaw = Math.atan2(-ss.dir.x, -ss.dir.z);
  const lx = ss.dir.z, lz = -ss.dir.x; // বাম দিক
  const at = (t, off) => ({ x: ss.ax + ss.dir.x * t + lx * off, z: ss.az + ss.dir.z * t + lz * off });
  const eo = ss.width / 2 - 0.9;
  // সামনে বাইক, যেন চালু করেই অন্যটার গায়ে না লাগে
  const parked = [
    { type: 'bike', ...at(Math.min(ss.len - 4, 42), eo), yaw },
    { type: 'rickshaw', ...at(33, eo), yaw },
    { type: 'cng', ...at(23, eo), yaw },
    { type: 'car', ...at(11, eo), yaw },
  ];
  const sp = at(14, -(ss.width / 2 + 0.2));
  const spawn = { x: sp.x, z: sp.z, yaw };

  return {
    kind: 'osm', stats: { dropped, trimmed }, bounds, nodes, segments, nearestSeg, segsNear, water, parks, lakeDist, lake: null,
    buildings, rail: d.rail || [], pois, attribution: d.attribution,
    places: { restaurants, homes, couriers, thana, hospital, gunshop, thanaCars, offices },
    extras: d.extras || null,
    spawn, parked,
  };
}
