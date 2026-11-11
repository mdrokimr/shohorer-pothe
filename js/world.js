// আসল ম্যাপের ডেটা (OpenStreetMap) থেকে 3D শহর: বাঁকা রাস্তা, নানা আকারের বিল্ডিং, মেট্রো রেল; আর ধাক্কার হিসাব
import * as THREE from 'three';
import { Glass } from './glass.js';
import { TreeModels } from './trees.js';
import { lam, texMat, addBox, addCyl, mergeStatic, planeGeo, canvasTex, twoFace } from './lib3d.js';
import { signTex } from './textures.js';
import { Atlas, pillarArt, PILLAR_THEMES, shopOpen, shopType } from './art.js';
import { FOOT, inPoly, polyEdge } from './mapgen.js';

// অনেক ত্রিভুজ এক জ্যামিতিতে; মুখ ঠিক দিকে রাখতে প্রতিটা ত্রিভুজের কাঙ্ক্ষিত দিক দেওয়া হয়
export class Tris {
  constructor() { this.pos = []; this.uv = []; this.nor = []; }
  tri(a, b, c, ua, ub, uc, n) {
    // a,b,c: [x,y,z]; n: যে দিকে মুখ চাই
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    this.pos.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
    this.nor.push(...n, ...n, ...n);
  }
  quad(a, b, c, d, ua, ub, uc, ud, n) { this.tri(a, b, c, ua, ub, uc, n); this.tri(a, c, d, ua, uc, ud, n); }
  // উপর থেকে দেখা ফিতা: a থেকে b, চওড়া w
  strip(ax, az, bx, bz, w, y, vLen = 8, uScale = 1) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.01) return;
    const nx = (-dz / L) * w / 2, nz = (dx / L) * w / 2;
    const v = L / vLen;
    this.quad([ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], [ax + nx, y, az + nz], [0, 0], [0, v], [uScale, v], [uScale, 0], [0, 1, 0]);
  }
  disc(x, z, r, y, seg = 12, uvS = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      this.tri([x, y, z], p0, p1, [x / uvS, z / uvS], [p0[0] / uvS, p0[2] / uvS], [p1[0] / uvS, p1[2] / uvS], [0, 1, 0]);
    }
  }
  // সমতল বহুভুজ (পার্ক, পুকুর, ছাদ)
  poly(p, y, uvS = 10) {
    for (const [i, j, k] of triangulate(p)) {
      const A = p[i], B = p[j], C = p[k];
      this.tri([A[0], y, A[1]], [B[0], y, B[1]], [C[0], y, C[1]], [A[0] / uvS, A[1] / uvS], [B[0] / uvS, B[1] / uvS], [C[0] / uvS, C[1] / uvS], [0, 1, 0]);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = true;
    return m;
  }
}
function triangulate(p) {
  try {
    const r = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    if (Array.isArray(r) && r.length) return r;
  } catch (e) { /* নিচে সহজ পদ্ধতি */ }
  const out = [];
  for (let i = 1; i + 1 < p.length; i++) out.push([0, i, i + 1]);
  return out;
}
const bboxOf = (p) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1 };
};

const _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3(), _qt = new THREE.Quaternion(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class World {
  constructor(scene, T, map) {
    this.scene = scene;
    this.T = T;
    this.map = map;
    this.cell = 32;
    this.grid = new Map();
    this.boxes = [];
    this.glass = new Glass();
    this.build();
    this.glass.build(scene);
  }

  // ---------------- ধাক্কার জন্য বাক্স আর বহুভুজ ----------------
  insert(item, x0, x1, z0, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = i + ',' + j;
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(item);
      }
    }
  }
  addBox(x0, x1, z0, z1, h = 10, kind = 'wall') {
    const b = { x0, x1, z0, z1, h, kind };
    this.boxes.push(b);
    this.insert(b, x0, x1, z0, z1);
    return b;
  }
  addPoly(p, h, kind = 'building') {
    const bb = bboxOf(p);
    const item = { poly: p, h, kind, ...bb };
    this.insert(item, bb.x0, bb.x1, bb.z0, bb.z1);
    return item;
  }
  // বৃত্ত (x,z,r) কোনো কিছুতে ঢুকলে বের করে দেয়; ফেরত: ধাক্কার দিক বা null
  // veh = যানবাহন কিনা: রাস্তার মাঝের নিচু ডিভাইডার শুধু যানবাহন আটকায়, মানুষ পার হতে পারে
  collide(o, r, y = 0, veh = false, noWater = false) {
    const c = this.cell;
    let hit = null;
    const seen = new Set();
    for (let i = Math.floor((o.x - r) / c); i <= Math.floor((o.x + r) / c); i++) {
      for (let j = Math.floor((o.z - r) / c); j <= Math.floor((o.z + r) / c); j++) {
        const l = this.grid.get(i + ',' + j);
        if (!l) continue;
        for (const b of l) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (y > b.h || (b.low && !veh) || b.deck || (b.y0 && y < b.y0)) continue;
          if (o.x < b.x0 - r || o.x > b.x1 + r || o.z < b.z0 - r || o.z > b.z1 + r) continue;
          if (b.poly) {
            // বিল্ডিংয়ের বহুভুজ
            let e = polyEdge(b.poly, o.x, o.z);
            const ins = inPoly(b.poly, o.x, o.z);
            // জোরে চলে সরু ডিভাইডারের ভিতরে ঢুকে গেলে: যেদিক থেকে এসেছে সেদিকেই ফেরত (আগে উল্টো পাশে লাফিয়ে যেত)
            if (ins && o.px !== undefined && !inPoly(b.poly, o.px, o.pz)) {
              const e2 = polyEdge(b.poly, o.px, o.pz);
              let nx = o.px - e2.px, nz = o.pz - e2.pz, nl = Math.hypot(nx, nz);
              if (nl < 1e-4) { nx = o.px - o.x; nz = o.pz - o.z; nl = Math.hypot(nx, nz) || 1; }
              nx /= nl; nz /= nl;
              const depth = (e2.px - o.x) * nx + (e2.pz - o.z) * nz;
              o.x += nx * (depth + r); o.z += nz * (depth + r);
              hit = { nx, nz, kind: b.kind };
              continue;
            }
            if (!ins && e.d >= r) continue;
            let dx = o.x - e.px, dz = o.z - e.pz;
            let dl = Math.hypot(dx, dz);
            if (dl < 1e-4) { dx = e.ez; dz = -e.ex; dl = Math.hypot(dx, dz) || 1; }
            dx /= dl; dz /= dl;
            if (ins) { dx = -dx; dz = -dz; }
            const push = ins ? e.d + r : r - e.d;
            o.x += dx * push; o.z += dz * push;
            hit = { nx: dx, nz: dz, kind: b.kind };
            continue;
          }
          const qx = Math.max(b.x0, Math.min(o.x, b.x1)), qz = Math.max(b.z0, Math.min(o.z, b.z1));
          let dx = o.x - qx, dz = o.z - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          if (d < 1e-4) {
            const ex = [o.x - b.x0, b.x1 - o.x, o.z - b.z0, b.z1 - o.z];
            const m = Math.min(...ex);
            if (m === ex[0]) { dx = -1; dz = 0; } else if (m === ex[1]) { dx = 1; dz = 0; } else if (m === ex[2]) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
            o.x += dx * (m + r); o.z += dz * (m + r);
            hit = { nx: dx, nz: dz, kind: b.kind, box: b };
            continue;
          }
          dx /= d; dz /= d;
          o.x += dx * (r - d); o.z += dz * (r - d);
          hit = { nx: dx, nz: dz, kind: b.kind, box: b };
        }
      }
    }
    // পুকুরের পানি
    // পানি: মানুষকে পাড়ে ঠেলে দেয়; যানবাহন আর আপনি (সাঁতার) পানিতে নামতে পারেন
    if (this.map.water.length && !veh && !noWater && this.isWater(o.x, o.z)) {
      const e = 0.5;
      const gx = this.map.lakeDist(o.x + e, o.z) - this.map.lakeDist(o.x - e, o.z);
      const gz = this.map.lakeDist(o.x, o.z + e) - this.map.lakeDist(o.x, o.z - e);
      const gl = Math.hypot(gx, gz) || 1;
      for (let k = 0; k < 8 && this.isWater(o.x, o.z); k++) { o.x += (gx / gl) * 0.4; o.z += (gz / gl) * 0.4; }
      hit = { nx: gx / gl, nz: gz / gl, kind: 'water' };
    }
    const B = this.map.bounds;
    // ভিতরের ঘরগুলো (x > ৫০০০) সীমানার বাইরে; আকাশের যানবাহন সীমানার অনেক বাইরেও যেতে পারে
    if (o.x < 5000 && !(veh && y > 3) && (o.x < B.x0 + r || o.x > B.x1 - r || o.z < B.z0 + r || o.z > B.z1 - r)) {
      o.x = Math.max(B.x0 + r, Math.min(B.x1 - r, o.x));
      o.z = Math.max(B.z0 + r, Math.min(B.z1 - r, o.z));
      hit = hit || { nx: 0, nz: 0, kind: 'edge' };
    }
    return hit;
  }
  // ক্যামেরার জন্য: বিন্দুটা কোনো বিল্ডিংয়ের ভিতরে কিনা
  blocked(x, y, z) {
    const l = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell));
    if (!l) return false;
    for (const b of l) {
      if (!b.poly || b.low || b.deck || b.y0 || y > b.h + 0.6) continue;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (inPoly(b.poly, x, z)) return true;
    }
    return false;
  }
  isWater(x, z) {
    return this.map.lakeDist(x, z) < 0 && !this.onRoad(x, z, FOOT) && !this.deckAt(x, z);
  }
  // সাঁতারের মতো গভীর পানি
  swimAt(x, z) { return this.map.water.length && this.map.lakeDist(x, z) < -0.8 && !this.deckAt(x, z) && !this.onRoad(x, z, 0); }
  // পানি থেকে সবচেয়ে কাছের পাড়
  shoreNear(x, z) {
    const L = this.map.lakeDist;
    for (let k = 0; k < 120 && L(x, z) < 1.2; k++) {
      const e = 0.5, gx = L(x + e, z) - L(x - e, z), gz = L(x, z + e) - L(x, z - e), gl = Math.hypot(gx, gz) || 1;
      x += (gx / gl) * 1; z += (gz / gl) * 1;
    }
    return { x, z };
  }
  // ঘাটের জেটির উপর কিনা (হাঁটা যায়)
  deckAt(x, z) {
    const E = this.map.extras;
    if (E) for (const g of E.ghats) { const p = g.pier; if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return 0.57; }
    for (const b of this.waterBridges || []) {
      const s = b.seg, t = (x - s.ax) * s.dir.x + (z - s.az) * s.dir.z;
      if (t < b.t0 || t > b.t1) continue;
      if (Math.abs((x - s.ax) * s.dir.z - (z - s.az) * s.dir.x) < b.halfW) return b.y;
    }
    return 0;
  }
  nearestRoad(x, z) { return this.map.nearestSeg(x, z); }
  // হাঁটার উঁচু তল (মেট্রোর সিঁড়ি, চাতাল, সেতু): পায়ের নিচে থাকলে তার উচ্চতা, না হলে null
  walkY(x, z, y) {
    if (!this.walks) return null;
    let best = null;
    for (const w of this.walks) {
      const S = w.st, rx = x - S.x, rz = z - S.z;
      const lat = rx * S.nx + rz * S.nz, lon = rx * S.ux + rz * S.uz;
      if (lat < w.lat0 || lat > w.lat1) continue;
      let h;
      if (w.kind === 'ramp') {
        const a = (lon - w.lonB) * w.dir;
        if (a < -0.05 || a > w.run + 0.05) continue;
        h = w.y0 + Math.max(0, Math.min(1, a / w.run)) * (w.y1 - w.y0);
      } else {
        if (lon < w.lon0 || lon > w.lon1) continue;
        h = w.y;
      }
      if (y > h - 0.9 && (best === null || h > best)) best = h;
    }
    return best;
  }
  // মাটিতে দাগ (রক্ত, পোড়া) কত উঁচুতে: ফুটপাতে হলে ফুটপাতের উপরে, না হলে রাস্তার উপরে
  decalY(x, z) {
    for (const s of this.map.segsNear(x, z)) {
      if (!s.main) continue;
      const t = (x - s.ax) * s.dir.x + (z - s.az) * s.dir.z;
      if (t < 0 || t > s.len) continue;
      const lat = Math.abs((x - s.ax) * s.dir.z - (z - s.az) * s.dir.x);
      if (lat > s.width / 2 && lat < s.width / 2 + FOOT) return 0.18;
    }
    return 0.09;
  }
  // এই রাস্তার এক পাশের বিন্দু অন্য কোনো রাস্তা বা মোড়ের উপর পড়ছে কি না
  // (দুই ভাগের রাস্তায় এক ভাগের ফুটপাত-কার্ব অন্য ভাগের উপর পড়ত, মোড়ে খুঁটি রাস্তায় বসত)
  sideBlocked(s, t, lat, margin = 0.05) {
    const x = s.ax + s.dir.x * t - s.dir.z * lat, z = s.az + s.dir.z * t + s.dir.x * lat;
    return this.otherRoad(x, z, s, margin);
  }
  otherRoad(x, z, own, margin = 0.05) {
    for (const o of this.map.segsNear(x, z)) {
      if (o !== own) {
        const tt = (x - o.ax) * o.dir.x + (z - o.az) * o.dir.z;
        if (tt >= 0 && tt <= o.len && Math.abs((x - o.ax) * o.dir.z - (z - o.az) * o.dir.x) < o.width / 2 + margin) return true;
      }
      for (const id of [o.a, o.b]) {
        const r = this.nodeW ? this.nodeW[id].r : 0, n = this.map.nodes[id];
        if (r && Math.hypot(x - n.x, z - n.z) < r + margin) return true;
      }
    }
    return false;
  }
  // t0..t1 এর মধ্যে যেসব অংশে সব lat বিন্দু খালি, সেই টুকরোগুলো
  freeRuns(s, t0, t1, lats, step = 1) {
    const out = [];
    const n = Math.max(1, Math.ceil((t1 - t0) / step));
    let a = null, last = t0;
    for (let k = 0; k <= n; k++) {
      const tt = Math.min(t0 + k * step, t1);
      const ok = lats.every((l) => !this.sideBlocked(s, tt, l));
      if (ok && a === null) a = tt;
      if (!ok && a !== null) { if (last - a > 1.2) out.push([a, last]); a = null; }
      if (ok) last = tt;
    }
    if (a !== null && last - a > 1.2) out.push([a, last]);
    return out;
  }
  onRoad(x, z, extra = 0) {
    for (const s of this.map.segsNear(x, z)) {
      const t = (x - s.ax) * s.dir.x + (z - s.az) * s.dir.z;
      if (t < -s.width / 2 || t > s.len + s.width / 2) continue;
      const lat = Math.abs((x - s.ax) * s.dir.z - (z - s.az) * s.dir.x);
      if (lat < s.width / 2 + extra) return s;
    }
    return null;
  }

  // ---------------- শহর বানানো ----------------
  build() {
    const M = this.map, T = this.T, scene = this.scene;
    const S = new THREE.Group();
    scene.add(S);
    this.static = S;
    const B = M.bounds;
    const W = B.x1 - B.x0 + 400, H = B.z1 - B.z0 + 400;
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;

    // মাটি
    T.lot.repeat.set(W / 24, H / 24);
    const ground = new THREE.Mesh(planeGeo(W, H), new THREE.MeshLambertMaterial({ map: T.lot }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0, cz);
    ground.receiveShadow = true;
    scene.add(ground);
    const far = new THREE.Mesh(planeGeo(6000, 6000), lam(0x6f7a52));
    far.rotation.x = -Math.PI / 2;
    far.position.set(cx, -0.05, cz);
    scene.add(far);

    // মোড়ের মাপ: তিন বা বেশি রাস্তা মিললে মোড়
    this.nodeW = M.nodes.map((n) => {
      let w = 0;
      for (const l of n.links) w = Math.max(w, M.segments[l.seg].width);
      const r = n.links.length >= 3 ? w / 2 + 1 : 0;
      return { r, wx: r * 2, wz: r * 2, w };
    });

    // ---------- রাস্তা ----------
    const road = new Tris(), line = new Tris(), foot = new Tris();
    const curb = new Tris(), curbG = new Tris(), drain = new Tris(), med = new Tris(), medTop = new Tris();
    for (const s of M.segments) {
      road.strip(s.ax, s.az, s.bx, s.bz, s.width, 0.06, 8, s.width / 8);
      const nx = -s.dir.z, nz = s.dir.x;
      const ra = this.nodeW[s.a].r, rb = this.nodeW[s.b].r;
      const dead = (id) => M.nodes[id].links.length < 2;
      // দুইমুখী বড় রাস্তার মাঝে উঁচু ডিভাইডার (মোড়ে আর রাস্তার শেষে ফাঁক)
      const hasMed = s.main && !s.oneway && s.width >= 9;
      if (s.main) {
        // কিনারার সাদা দাগ আর দুইমুখী রাস্তার মাঝের দাগ
        for (const side of [-1, 1]) {
          const o = side * (s.width / 2 - 0.35);
          line.strip(s.ax + nx * o, s.az + nz * o, s.bx + nx * o, s.bz + nz * o, 0.14, 0.075, 50);
        }
        if (!s.oneway && !hasMed) {
          for (let t = 1; t + 3 < s.len; t += 7) line.strip(s.ax + s.dir.x * t, s.az + s.dir.z * t, s.ax + s.dir.x * (t + 3), s.az + s.dir.z * (t + 3), 0.16, 0.075, 50);
        }
        // ফুটপাত, মোড়ের কাছে কেটে
        const t0 = ra ? ra + FOOT : 0, t1 = s.len - (rb ? rb + FOOT : 0);
        if (t1 - t0 > 1.5) {
          for (const side of [-1, 1]) {
            const o = side * (s.width / 2 + FOOT / 2);
            // অন্য রাস্তার উপর পড়া অংশ বাদ
            for (const [ta, tb] of this.freeRuns(s, t0, t1, [side * (s.width / 2 + 0.3), side * (s.width / 2 + FOOT - 0.3)])) {
              foot.strip(s.ax + s.dir.x * ta + nx * o, s.az + s.dir.z * ta + nz * o, s.ax + s.dir.x * tb + nx * o, s.az + s.dir.z * tb + nz * o, FOOT, 0.16, 2.6, FOOT / 2.6);
              (this.footRuns || (this.footRuns = [])).push({ s, side, ta, tb });
            }
          }
        }
      }
      // দুই পাশে উঁচু কার্ব: বড় রাস্তায় হলুদ-কালো, গলিতে নিচু ধূসর। মোড়ে ফাঁক, বাঁকে চলতে থাকে
      const gap = s.main ? FOOT : 0.3;
      const c0 = ra ? ra + gap : 0, c1 = s.len - (rb ? rb + gap : 0);
      if (c1 - c0 > 0.8) for (const side of [-1, 1]) {
        for (const [ta, tb] of this.freeRuns(s, c0, c1, [side * (s.width / 2 + 0.15)])) this.curbStrip(s.main ? curb : curbG, s, ta, tb, side * (s.width / 2), side, s.main ? 0.3 : 0.24, s.main ? 0.2 : 0.13, !s.main);
      }
      if (hasMed) {
        const m0 = ra ? ra + 1.5 : dead(s.a) ? 7 : 0, m1 = s.len - (rb ? rb + 1.5 : dead(s.b) ? 7 : 0);
        if (m1 - m0 > 2) {
          const hw = s.width >= 11 ? 0.8 : 0.55; // চওড়া সাজানো ডিভাইডার
          this.curbStrip(med, s, m0, m1, -hw, 1, hw * 2, 0.32, true, true);
          // উপরে হালকা সিমেন্টের পাত (কিনারায় হলুদ-কালো দাগ থাকে)
          { const P3 = (t, o) => [s.ax + s.dir.x * t + nx * o, 0.325, s.az + s.dir.z * t + nz * o]; const e = hw - 0.17;
            medTop.quad(P3(m0 + 0.17, -e), P3(m1 - 0.17, -e), P3(m1 - 0.17, e), P3(m0 + 0.17, e), [0, 0], [(m1 - m0) / 2, 0], [(m1 - m0) / 2, 1], [0, 1], [0, 1, 0]); }
          (this.medRuns || (this.medRuns = [])).push({ s, m0, m1, hw });
          const P = (t, o) => [s.ax + s.dir.x * t + nx * o, s.az + s.dir.z * t + nz * o];
          this.addPoly([P(m0, -hw), P(m1, -hw), P(m1, hw), P(m0, hw)], 0.6, 'median').low = true;
        }
      }
      // গলিতে কিনারা ঘেঁষে ড্রেনের ঢাকনা
      if (!s.main && s.len > 8) {
        let k = 0;
        for (let t = Math.max(4, c0 + 2); t + 1 < c1 - 2; t += 9, k++) {
          const o = (k % 2 ? 1 : -1) * (s.width / 2 - 0.5);
          drain.strip(s.ax + s.dir.x * t + nx * o, s.az + s.dir.z * t + nz * o, s.ax + s.dir.x * (t + 0.9) + nx * o, s.az + s.dir.z * (t + 0.9) + nz * o, 0.55, 0.07, 1);
        }
      }
    }
    // বাঁক আর মোড়ের ফাঁক ভরাট
    M.nodes.forEach((n, i) => { const w = this.nodeW[i].w; if (w && n.links.length >= 2) road.disc(n.x, n.z, n.links.length >= 3 ? this.nodeW[i].r : w / 2, 0.064, n.links.length >= 3 ? 20 : 14); });
    // মোড় আর বাঁকের কোণে ফুটপাত ভরাট (আগে ফাঁকা মাটি দেখা যেত)
    this.buildCorners(foot);
    T.asphalt.wrapS = T.asphalt.wrapT = THREE.RepeatWrapping;
    const rm = road.mesh(texMat(T.asphalt));
    rm.receiveShadow = true;
    this.roadMat = rm.material;
    scene.add(rm);
    scene.add(line.mesh(lam(0xeeeeee)));
    const fm = foot.mesh(texMat(T.paving));
    fm.receiveShadow = true;
    scene.add(fm);
    for (const [q, tex] of [[curb, T.curb], [med, T.curbBW || T.curb], [curbG, T.curbGray], [medTop, T.medTop]]) {
      if (!q.pos.length) continue;
      const m = q.mesh(texMat(tex));
      m.receiveShadow = true;
      m.frustumCulled = true;
      scene.add(m);
    }
    if (drain.pos.length) scene.add(drain.mesh(lam(0x2e2f31)));
    this.buildStreetGrit(scene, T); // গর্ত, পানের দাগ, শ্যাওলা — InstancedMesh

    // ---------- পার্ক, মাঠ, পুকুর ----------
    const grass = new Tris(), pond = new Tris();
    // পার্ক আর পুকুর রাস্তার নিচে, যেন রাস্তা ঢেকে না যায়
    for (const p of M.parks) grass.poly(p.p, 0.03, 8);
    for (const w of M.water) pond.poly(w.p, 0.04, 12);
    if (grass.pos.length) { const g = grass.mesh(texMat(T.grass)); g.receiveShadow = true; scene.add(g); }
    if (pond.pos.length) scene.add(pond.mesh(texMat(T.water)));

    this.buildBuildings(S);
    this.buildExtras(S);
    this.buildRail(S);
    this.buildDetails(S);
    this.buildMedianGreen(S);
    this.buildFootOverbridges(S); // পদচারী সেতু (মোড়)
    this.buildWaterBridges(S); // জলের উপর সেতু
    mergeStatic(S, true, true);
  }

  // মোড়/বাঁকের দুই রাস্তার মাঝের কোণে ফুটপাতের টুকরা
  buildCorners(foot) {
    const M = this.map;
    const dedupe = (p) => p.filter((q, i) => { const r = p[(i + p.length - 1) % p.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.05; });
    M.nodes.forEach((n, i) => {
      if (n.links.length < 2) return;
      const L = n.links.map((l) => {
        const s = M.segments[l.seg], d = s.a === n.id ? s.dir : { x: -s.dir.x, z: -s.dir.z };
        return { s, d, ang: Math.atan2(d.z, d.x) };
      });
      if (!L.some((o) => o.s.main)) return;
      L.sort((a, b) => a.ang - b.ang);
      const r = this.nodeW[i].r;
      let maxDa = 0;
      const arc = (p, q, ccw) => {
        // p থেকে q পর্যন্ত নোডের চারপাশে (ccw = কোণ বাড়ার দিকে) মাঝের বিন্দু
        const ap = Math.atan2(p[1] - n.z, p[0] - n.x), aq = Math.atan2(q[1] - n.z, q[0] - n.x);
        const rp = Math.hypot(p[0] - n.x, p[1] - n.z), rq = Math.hypot(q[0] - n.x, q[1] - n.z);
        let da = aq - ap;
        if (ccw) { while (da <= 0) da += Math.PI * 2; } else { while (da >= 0) da -= Math.PI * 2; }
        if (Math.abs(da) > maxDa) return null; // ঘুরে পুরো চক্কর হয়ে গেলে (আগে রাস্তার উপর গোল চাকতি হত)
        const out = [], k = Math.ceil(Math.abs(da) / 0.22);
        for (let j = 1; j < k; j++) { const a = ap + (da * j) / k, rr = rp + ((rq - rp) * j) / k; out.push([n.x + Math.cos(a) * rr, n.z + Math.sin(a) * rr]); }
        return out;
      };
      for (let k = 0; k < L.length; k++) {
        const A = L[k], B = L[(k + 1) % L.length];
        let span = B.ang - A.ang;
        if (k === L.length - 1) span += Math.PI * 2;
        if (span < 0.08 || span > Math.PI * 2 - 0.08) continue;
        const t0 = (o) => (r ? r + (o.s.main ? FOOT : 0.4) : 0);
        const fw = (o) => (o.s.main ? FOOT : 1.4);
        const nA = { x: -A.d.z, z: A.d.x }, nB = { x: B.d.z, z: -B.d.x };
        maxDa = span + 0.5;
        const E = (o, nn, t, off) => [n.x + o.d.x * t + nn.x * (o.s.width / 2 + off), n.z + o.d.z * t + nn.z * (o.s.width / 2 + off)];
        const a0 = E(A, nA, t0(A), 0), a1 = E(A, nA, t0(A), fw(A)), b1 = E(B, nB, t0(B), fw(B)), b0 = E(B, nB, t0(B), 0);
        const oa = arc(a1, b1, true);
        if (!oa) continue;
        let pol = [a0, a1, ...oa, b1, b0];
        const cr = A.d.x * B.d.z - A.d.z * B.d.x;
        if (span < Math.PI * 0.94 && Math.abs(cr) > 1e-3) {
          // সাধারণ কোণ: দুই রাস্তার কিনারা যেখানে মেলে
          const vx = b0[0] - a0[0], vz = b0[1] - a0[1];
          const t = (vx * B.d.z - vz * B.d.x) / cr, u = (vx * A.d.z - vz * A.d.x) / cr;
          if (t > 0.05 || u > 0.05 || t < -40 || u < -40) continue; // কিনারা পরে মেলে: ফুটপাত নিজেরাই মিলে গেছে
          pol.push([a0[0] + A.d.x * t, a0[1] + A.d.z * t]);
        } else {
          // সোজা বা বাইরের দিকের বাঁক: রাস্তার কিনারা ধরে নোডের পাশ দিয়ে
          const a00 = E(A, nA, 0, 0), b00 = E(B, nB, 0, 0);
          const ia = arc(b00, a00, false);
          if (!ia) continue;
          pol.push(b00, ...ia, a00);
        }
        pol = dedupe(pol);
        // কোনো কোণা কোনো রাস্তার ভিতরে ঢুকে গেলে বা টুকরো অস্বাভাবিক বড় হলে বাদ
        const inRoad = pol.some(([x, z]) => this.onRoad(x, z, -0.35) || Math.hypot(x - n.x, z - n.z) > 30 || (r && Math.hypot(x - n.x, z - n.z) < r - 0.35));
        let area2 = 0;
        for (let k2 = 0, j2 = pol.length - 1; k2 < pol.length; j2 = k2++) area2 += (pol[j2][0] - pol[k2][0]) * (pol[j2][1] + pol[k2][1]);
        if (pol.length >= 3 && !inRoad && Math.abs(area2) / 2 < 60) foot.poly(pol, 0.166, 4);
      }
    });
  }
  // কার্ব: lat0 থেকে বাইরের দিকে cw চওড়া, h উঁচু। ভিতরের (রাস্তার দিকের) খাড়া মুখ, উপরের মুখ, চাইলে বাইরের মুখও
  inMedian(x, z) {
    for (const { s, m0, m1, hw } of this.medRuns || []) {
      const dx = x - s.ax, dz = z - s.az, t = dx * s.dir.x + dz * s.dir.z;
      if (t < m0 + 1 || t > m1 - 1) continue;
      if (Math.abs(dx * -s.dir.z + dz * s.dir.x) < hw - 0.1 && hw >= 0.75) return true;
    }
    return false;
  }
  // ডিভাইডারে সবুজ: সারি করে ছাঁটা ঝোপ, দুই মাথায় গোল টবে কলাগাছ (মেট্রোর খুঁটির জায়গা বাদ)
  buildMedianGreen(S) {
    const runs = this.medRuns || [];
    const pil = this.pillarPos || [];
    const nearPillar = (x, z) => pil.some((p) => Math.abs(p[0] - x) < 2.2 && Math.abs(p[1] - z) < 2.2);
    const spots = [];
    const ends = [];
    for (const { s, m0, m1, hw } of runs) {
      const nx = -s.dir.z, nz = s.dir.x;
      for (let t = m0 + 1.4; t < m1 - 1.4; t += 2.4) {
        const x = s.ax + s.dir.x * t, z = s.az + s.dir.z * t;
        if (!nearPillar(x, z)) spots.push([x, z, hw]);
      }
      if (m1 - m0 > 12) for (const t of [m0 + 0.9, m1 - 0.9]) { const x = s.ax + s.dir.x * t, z = s.az + s.dir.z * t; if (!nearPillar(x, z)) ends.push([x, z, Math.atan2(s.dir.x, s.dir.z), hw]); }
      void nx; void nz;
    }
    // কিনারার পিলারের গোড়ায় সাজানো আইল্যান্ড: হলুদ-কালো কার্ব, সিমেন্টের উপরিভাগ, দুই পাশে ঝোপ
    const curbM = lam(0xe3bf1c), curbK = lam(0x222222), topM = lam(0xd9d4c8);
    for (const [x, z, ry] of this.pillarIslands || []) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      addBox(g, 2.2, 0.3, 7, topM, 0, 0.15, 0);
      for (let k = 0; k < 7; k++) for (const sx of [-1.12, 1.12]) addBox(g, 0.08, 0.32, 1, k % 2 ? curbK : curbM, sx, 0.16, -3 + k);
      S.add(g);
      const fx = Math.sin(ry), fz = Math.cos(ry);
      for (const d of [-2.4, -1.4, 1.4, 2.4]) spots.push([x + fx * d, z + fz * d, 0.9]);
    }
    if (!spots.length) return;
    // ঝোপ: একটাই জ্যামিতি, ইনস্ট্যান্স করে (হাজার হাজার হলেও হালকা)
    const geo = new THREE.DodecahedronGeometry(0.42, 0);
    geo.scale(1, 0.62, 1); geo.translate(0, 0.25, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    spots.forEach(([x, z, hw], i) => {
      const k = Math.min(1.25, hw * 1.3) * (0.85 + Math.random() * 0.3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      m4.compose(ps.set(x, 0.3, z), q, sc.set(k, k * (0.8 + Math.random() * 0.4), k));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHSL(0.29 + Math.random() * 0.05, 0.45, 0.28 + Math.random() * 0.1));
    });
    im.castShadow = false; im.receiveShadow = false; // ছোট ঝোপ: শ্যাডো বাদ (ড্র কল সাশ্রয়)
    im.frustumCulled = true;
    im.userData.dyn = true;
    this.scene.add(im);
    // কলাগাছ: গোল টব, কাণ্ড, ছড়ানো পাতা
    const pot = lam(0xd9d4c8), trunk = lam(0x7d8a3a), leaf = new THREE.MeshLambertMaterial({ color: 0x5aa83a, side: THREE.DoubleSide, flatShading: true });
    const leafGeo = new THREE.PlaneGeometry(0.42, 1.5, 1, 3);
    { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.75; p.setZ(i, -y * y * 0.18); } leafGeo.translate(0, 0.75, 0); leafGeo.computeVertexNormals(); }
    for (const [x, z, ry, hw] of ends) {
      const g = new THREE.Group(); g.position.set(x, 0.32, z); g.rotation.y = ry;
      addCyl(g, Math.min(0.62, hw - 0.05), Math.min(0.55, hw - 0.1), 0.35, pot, 0, 0.17, 0, 12);
      addCyl(g, 0.12, 0.16, 1.6, trunk, 0, 1.0, 0, 7);
      for (let i = 0; i < 6; i++) {
        const l = new THREE.Mesh(leafGeo, leaf);
        l.position.y = 1.7; l.rotation.set(-0.9 - Math.random() * 0.4, (i / 6) * Math.PI * 2 + Math.random() * 0.3, 0, 'YXZ');
        g.add(l);
      }
      S.add(g);
    }
  }

  // ঢাকার রাস্তার গ্রিট: পথহোল, পানের লাল দাগ, দেয়ালের নিচে শ্যাওলা/ময়লা (সব Instanced)
  buildStreetGrit(scene, T) {
    const M = this.map;
    const mk = (tex, color, opacity) => new THREE.MeshLambertMaterial({
      map: tex || null, color: color || 0xffffff, transparent: true, opacity: opacity ?? 0.9,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    const place = (im, list, y) => {
      if (!list.length) return;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      list.forEach(([x, z, sc, ry], i) => {
        q.setFromAxisAngle(up, ry || Math.random() * 6.28);
        m4.compose(p.set(x, y, z), q, s.set(sc, 1, sc * (0.7 + Math.random() * 0.5)));
        im.setMatrixAt(i, m4);
      });
      im.count = list.length; im.frustumCulled = true; im.castShadow = false; im.receiveShadow = false;
      im.userData.noShadow = true; scene.add(im);
    };
    // পথহোল: মেইন রোডে ছড়িয়ে
    const holes = [];
    for (const s of M.segments) {
      if (!s.main || s.len < 20) continue;
      for (let t = 8; t < s.len - 8; t += 18 + Math.random() * 22) {
        if (Math.random() > 0.45) continue;
        const lat = (Math.random() - 0.5) * (s.width * 0.55);
        holes.push([s.ax + s.dir.x * t - s.dir.z * lat, s.az + s.dir.z * t + s.dir.x * lat, 0.55 + Math.random() * 0.7, Math.random() * 6]);
      }
    }
    if (holes.length && T.pothole) {
      const geo = new THREE.CircleGeometry(1, 10); geo.rotateX(-Math.PI / 2);
      place(new THREE.InstancedMesh(geo, mk(T.pothole, 0xffffff, 0.92), holes.length), holes, 0.072);
    }
    // পানের দাগ: মোড়ের কোণে
    const paan = [];
    M.nodes.forEach((n, i) => {
      if (n.links.length < 3 || Math.random() > 0.55) return;
      const r = (this.nodeW[i]?.r || 5) + FOOT * 0.4;
      for (let k = 0; k < 2 + (Math.random() * 3) | 0; k++) {
        const a = Math.random() * Math.PI * 2;
        paan.push([n.x + Math.cos(a) * r * (0.7 + Math.random() * 0.4), n.z + Math.sin(a) * r * (0.7 + Math.random() * 0.4), 0.25 + Math.random() * 0.35, a]);
      }
    });
    if (paan.length && T.paan) {
      const geo = new THREE.CircleGeometry(1, 8); geo.rotateX(-Math.PI / 2);
      place(new THREE.InstancedMesh(geo, mk(T.paan, 0xffffff, 0.85), paan.length), paan, 0.168);
    }
    // দেয়ালের নিচে শ্যাওলা/ময়লা: বিল্ডিংয়ের কিনারায় উল্লম্ব প্যাচ
    const moss = [];
    for (const b of M.buildings) {
      if (!b.main || b.area < 40 || Math.random() > 0.4) continue;
      const p = b.p;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if (Math.random() > 0.35) continue;
        const mx = (p[i][0] + p[j][0]) / 2, mz = (p[i][1] + p[j][1]) / 2;
        const ex = p[i][0] - p[j][0], ez = p[i][1] - p[j][1], L = Math.hypot(ex, ez) || 1;
        let nx = ez / L, nz = -ex / L;
        if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
        moss.push([mx + nx * 0.08, mz + nz * 0.08, 0.55 + Math.random() * 0.5, Math.atan2(nx, nz)]);
      }
    }
    if (moss.length && T.moss) {
      const geo = new THREE.PlaneGeometry(1.4, 0.85);
      const im = new THREE.InstancedMesh(geo, mk(T.moss, 0xffffff, 0.75), moss.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      const eul = new THREE.Euler(0, 0, 0, 'YXZ');
      moss.forEach(([x, z, s, ry], i) => {
        eul.set(0, ry, 0); q.setFromEuler(eul);
        m4.compose(p.set(x, 0.42, z), q, sc.set(s, s * 0.9, 1));
        im.setMatrixAt(i, m4);
      });
      im.count = moss.length; im.frustumCulled = true; im.castShadow = false; im.userData.noShadow = true;
      scene.add(im);
    }
  }
  curbStrip(q, s, t0, t1, lat0, side, cw, h, outer, both = false) {
    const nx = -s.dir.z, nz = s.dir.x;
    const o0 = lat0, o1 = lat0 + side * cw;
    const P = (t, o, y) => [s.ax + s.dir.x * t + nx * o, y, s.az + s.dir.z * t + nz * o];
    const v0 = t0 / 2, v1 = t1 / 2; // প্রতি ২ মিটারে এক রঙের দাগ
    q.quad(P(t0, o0, h), P(t1, o0, h), P(t1, o1, h), P(t0, o1, h), [v0, 0], [v1, 0], [v1, 1], [v0, 1], [0, 1, 0]);
    q.quad(P(t0, o0, 0.015), P(t1, o0, 0.015), P(t1, o0, h), P(t0, o0, h), [v0, 0], [v1, 0], [v1, 1], [v0, 1], [-side * nx, 0, -side * nz]);
    if (outer) q.quad(P(t0, o1, 0.015), P(t1, o1, 0.015), P(t1, o1, h), P(t0, o1, h), [v0, 0], [v1, 0], [v1, 1], [v0, 1], [side * nx, 0, side * nz]);
    if (both) {
      // ডিভাইডারের দুই মাথা
      for (const [t, sg] of [[t0, -1], [t1, 1]]) q.quad(P(t, o0, 0.015), P(t, o1, 0.015), P(t, o1, h), P(t, o0, h), [0, 0], [0.5, 0], [0.5, 1], [0, 1], [s.dir.x * sg, 0, s.dir.z * sg]);
    }
  }

  buildBuildings(S) {
    const T = this.T, M = this.map;
    const walls = T.facades.map(() => new Tris());
    const glassW = T.glass.map(() => new Tris());
    const roof = new Tris();
    for (const b of M.buildings) {
      const p = b.p;
      const glass = b.main && (b.h > 45 || (b.h > 30 && b.color % 5 === 0)); // কাচের টাওয়ার অল্প কয়েকটা (মিরপুরে বেশিরভাগ দেয়াল-জানালার দালান)
      const q = glass ? glassW[(b.color + Math.floor(b.color / 5)) % glassW.length] : walls[b.color % walls.length];
      // বাইরের দিক কোনটা: বেশিরভাগ কিনারা যেদিকে কেন্দ্র থেকে দূরে
      let vote = 0;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const ex = p[i][0] - p[j][0], ez = p[i][1] - p[j][1];
        const mx = (p[i][0] + p[j][0]) / 2 - b.x, mz = (p[i][1] + p[j][1]) / 2 - b.z;
        vote += ez * mx - ex * mz;
      }
      const sg = vote >= 0 ? 1 : -1;
      let u = 0;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const A = p[j], C = p[i];
        const ex = C[0] - A[0], ez = C[1] - A[1], L = Math.hypot(ex, ez);
        if (L < 0.05) continue;
        const n = [(ez / L) * sg, 0, (-ex / L) * sg];
        const u1 = u + L / 8;
        q.quad([A[0], 0, A[1]], [C[0], 0, C[1]], [C[0], b.h, C[1]], [A[0], b.h, A[1]], [u, 0], [u1, 0], [u1, b.h / 12], [u, b.h / 12], n);
        u = u1;
      }
      roof.poly(p, b.h, 6);
      this.addPoly(p, b.h, 'building');
      // ছাদে পানির ট্যাংক
      if (b.area > 60 && b.color % 3 !== 0) addCyl(S, 0.8, 0.8, 1.5, lam(0x1b1c1e), b.x, b.h + 0.75, b.z, 10);
      if (b.name && (b.kind !== 'home')) this.shopFront(S, b);
    }
    // রাতে জানালায় আলো: emissiveMap-এ জানালার নকশা, রাতে emissive রং বাড়ে
    this.nightMats = [...(this.frontMats || [])];
    const nightMat = (tex) => {
      const m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex.userData.glow || null, emissive: 0x000000 });
      this.nightMats.push(m);
      return m;
    };
    this.glassMats = [];
    walls.forEach((q, i) => { if (q.pos.length) { const m = q.mesh(nightMat(T.facades[i])); m.castShadow = m.receiveShadow = true; m.frustumCulled = true; this.scene.add(m); } });
    glassW.forEach((q, i) => { if (q.pos.length) { const m = q.mesh(nightMat(T.glass[i])); this.glassMats.push(m.material); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = true; this.scene.add(m); } });
    const rm = roof.mesh(lam(0xb5ad9c));
    rm.receiveShadow = true; rm.castShadow = false; rm.frustumCulled = true;
    this.scene.add(rm);
  }
  // নিচতলার সাইনবোর্ড, শাটার আর ছাউনি: রাস্তার দিকের কিনারায়
  shopFront(S, b) {
    const p = b.p;
    let best = null, bs = -2;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ex = p[i][0] - p[j][0], ez = p[i][1] - p[j][1], L = Math.hypot(ex, ez);
      if (L < 3) continue;
      let nx = ez / L, nz = -ex / L;
      const mx = (p[i][0] + p[j][0]) / 2, mz = (p[i][1] + p[j][1]) / 2;
      if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
      // রাস্তার দিকে (দরজার দিকে) মুখ করা কিনারা
      const s = nx * (b.door.x - mx) + nz * (b.door.z - mz) > 0 ? (nx * -b.face.x + nz * -b.face.z) + L * 0.02 : -1;
      if (s > bs) { bs = s; best = { mx, mz, nx, nz, L }; }
    }
    if (!best) return;
    const { mx, mz, nx, nz, L } = best;
    const ry = Math.atan2(nx, nz);
    const sw = Math.min(L - 1, 7);
    const style = b.kind === 'thana' ? 'police' : b.kind === 'hospital' ? 'hospital' : b.kind === 'gunshop' ? 'gun' : undefined;
    const sign = new THREE.Mesh(planeGeo(sw, 1.1), texMat(signTex(b.name, style)));
    sign.position.set(mx + nx * 0.08, 3.4, mz + nz * 0.08);
    sign.rotation.y = ry;
    sign.userData.noShadow = true;
    S.add(sign);
    if (b.kind === 'home') return;
    // খোলা দরজা: ভিতরটা দেখা যায়; এখানে দাঁড়িয়ে F চাপলে ঢোকা যায়
    const C = b.civic;
    const kind = C === 'school' || C === 'madrasa' || C === 'court' ? 'gate'
      : C === 'bank' || C === 'power' || C === 'post' || ['office', 'hospital', 'thana'].includes(b.kind) ? 'glass'
      : b.kind === 'rest' ? 'rest' : b.kind === 'gunshop' ? 'dark' : 'shop';
    const dw = kind === 'glass' ? Math.min(sw, 4.4) : kind === 'gate' ? Math.min(sw, 5.5) : sw;
    const dh = kind === 'gate' ? 2.9 : 2.6;
    const stype = kind === 'shop' ? (b.civic === 'motor' ? 'motor' : shopType(b.name)) : null;
    const front = new THREE.Mesh(planeGeo(dw, dh), this.openMat(kind, b.color, stype));
    front.position.set(mx + nx * 0.06, dh / 2, mz + nz * 0.06);
    front.rotation.y = ry;
    front.userData.noShadow = true;
    S.add(front);
    b.entry = { x: mx + nx * 0.9, z: mz + nz * 0.9, nx, nz, w: dw };
    // ভাঙা যায় এমন কাচ: অফিস/ব্যাংকের কাচের সামনের অংশ (দরজার দুই পাশে), দোকানের পাশে কাচের শোকেস
    const tx = nz, tz = -nx;
    if (kind === 'glass') {
      const door = 1.7, pw = (dw - door) / 2;
      if (pw > 0.5) for (const sd of [-1, 1]) {
        const o = sd * (door / 2 + pw / 2);
        this.glass.add(mx + tx * o + nx * 0.16, mz + tz * o + nz * 0.16, nx, nz, pw, 2.45, 0.08, 'office');
      }
      this.glass.add(mx + nx * 0.16, mz + nz * 0.16, nx, nz, door, 0.5, 2.5, 'office'); // দরজার উপরের কাচ
    } else if (kind === 'shop' || kind === 'rest') {
      // পুরো সামনে কাচ (মাঝে খোলা দরজা): বাইরে থেকে ভিতরের তাক-মাল আর দোকানদার-ক্রেতা দেখা যায়
      const G = 0.34, door = dw >= 2.6 ? 1.1 : 0, side = (dw - door) / 2;
      const pane = (o, pw) => { const n = Math.max(1, Math.round(pw / 1.7)), q = pw / n; for (let k = 0; k < n; k++) { const oo = o - pw / 2 + q * (k + 0.5); this.glass.add(mx + tx * oo + nx * G, mz + tz * oo + nz * G, nx, nz, q, 2.4, 0.06, 'shop'); } };
      if (door) { pane(-(door / 2 + side / 2), side); pane(door / 2 + side / 2, side); } else pane(0, dw);
      // কাচ আর দোকানের মাঝের জায়গা: মানুষ বা গাড়ি ঢুকতে পারে না
      const hw = dw / 2;
      this.addPoly([[mx - tx * hw, mz - tz * hw], [mx + tx * hw, mz + tz * hw], [mx + tx * hw + nx * G, mz + tz * hw + nz * G], [mx - tx * hw + nx * G, mz - tz * hw + nz * G]], 2.5, 'wall');
      // ভিতরের মানুষের জায়গা (কাছে গেলে shopfolk.js বসায়)
      (this.shopSlots = this.shopSlots || []).push({ x: mx + nx * 0.17, z: mz + nz * 0.17, nx, nz, tx, tz, w: dw, door, type: kind === 'rest' ? 'rest' : stype, b });
    }
    if (b.landmark && kind === 'shop') return;
    const awCol = b.kind === 'rest' ? 0xc62828 : b.kind === 'thana' ? 0x1a3f8a : b.kind === 'hospital' ? 0xc62828 : b.kind === 'gunshop' ? 0x2b2b2b : C === 'bank' ? 0x2e7d32 : C === 'court' ? 0x5d4037 : [0x1565c0, 0x2e7d32, 0xef6c00][b.color % 3];
    if (kind === 'gate') return;
    const aw = addBox(S, (kind === 'glass' ? dw : sw) + 0.4, 0.08, 1.4, lam(awCol), mx + nx * 0.7, 2.75, mz + nz * 0.7);
    aw.rotation.y = ry;
  }
  // খোলা দোকানের ছবির ম্যাটেরিয়াল (রাতে ভিতরে আলো জ্বলে)
  openMat(kind, seed = 0, type = null) {
    const k = kind === 'shop' ? 'shop' + (type || '') + (seed % 2) : kind;
    this.openMats = this.openMats || {};
    if (!this.openMats[k]) {
      const tex = canvasTex(kind === 'gate' ? 384 : 320, 160, (c, w, h) => shopOpen(c, w, h, kind, seed % 2, type));
      const m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000 });
      this.openMats[k] = m;
      (this.frontMats = this.frontMats || []).push(m);
      if (this.nightMats && !this.nightMats.includes(m)) this.nightMats.push(m);
    }
    return this.openMats[k];
  }

  // বিমানবন্দর (রানওয়ে, অ্যাপ্রন), ঘাটের জেটি, ছাদের হেলিপ্যাড
  buildExtras(S) {
    const E = this.map.extras;
    if (!E) return;
    const tarmac = new Tris(), paint = new Tris(), wood = new Tris();
    const R = E.runway, A = E.apron, T = E.taxiway;
    tarmac.strip(R.x0, R.z, R.x1, R.z, R.w, 0.05, 8, R.w / 8);
    tarmac.quad([A.x0, 0.05, A.z0], [A.x1, 0.05, A.z0], [A.x1, 0.05, A.z1], [A.x0, 0.05, A.z1], [0, 0], [8, 0], [8, 1], [0, 1], [0, 1, 0]);
    tarmac.strip(T.x, T.z0, T.x, T.z1, 18, 0.05, 8, 2);
    // রানওয়ের মাঝের দাগ, কিনারা, দুই মাথার মোটা দাগ
    for (let x = R.x0 + 40; x < R.x1 - 40; x += 30) paint.strip(x, R.z, x + 15, R.z, 0.9, 0.07, 50);
    for (const sd of [-1, 1]) paint.strip(R.x0, R.z + sd * (R.w / 2 - 1.2), R.x1, R.z + sd * (R.w / 2 - 1.2), 0.6, 0.07, 50);
    for (const x0 of [R.x0 + 6, R.x1 - 36]) for (let k = -4; k <= 4; k++) if (k) paint.strip(x0, R.z + k * 4.2, x0 + 30, R.z + k * 4.2, 1.8, 0.07, 50);
    paint.strip(T.x, T.z0, T.x, T.z1, 0.4, 0.07, 50);
    // হেলিপ্যাড: মাটিতে আর ছাদে
    this.helipads = [];
    const pad = (x, z, y) => {
      paint.disc(x, z, 6, y + 0.06, 24, 1000);
      this.helipads.push({ x, z, y });
    };
    pad(E.heliSpot.x, E.heliSpot.z, 0.02);
    const pl = this.map.places;
    for (const b of [pl.hospital, pl.thana, ...(pl.offices || [])]) if (b && b.area > 150) pad(b.x, b.z, b.h);
    // জেটি
    for (const g of E.ghats) {
      const p = g.pier;
      wood.quad([p.x0, 0.55, p.z0], [p.x1, 0.55, p.z0], [p.x1, 0.55, p.z1], [p.x0, 0.55, p.z1], [0, 0], [4, 0], [4, 1], [0, 1], [0, 1, 0]);
      for (let x = p.x0 + 1; x < p.x1; x += 5) for (const z of [p.z0 + 0.4, p.z1 - 0.4]) addBox(S, 0.3, 1.6, 0.3, lam(0x4a3420), x, -0.2, z);
    }
    const tm = tarmac.mesh(lam(0x55585c));
    tm.receiveShadow = true;
    this.scene.add(tm, paint.mesh(lam(0xf2f2f2)));
    if (wood.pos.length) { const wm = wood.mesh(lam(0x7a5634)); wm.receiveShadow = true; this.scene.add(wm); }
    // হেলিপ্যাডের H
    const heliTex = canvasTex(128, 128, (g) => {
      g.strokeStyle = '#f2c230'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f2c230'; g.fillRect(36, 28, 14, 72); g.fillRect(78, 28, 14, 72); g.fillRect(36, 57, 56, 14);
    });
    for (const h of this.helipads) {
      const hm = new THREE.Mesh(planeGeo(9, 9), texMat(heliTex, { transparent: true }));
      hm.rotation.x = -Math.PI / 2;
      hm.position.set(h.x, h.y + 0.09, h.z);
      hm.userData.noShadow = true;
      this.scene.add(hm);
    }
  }
  // কোনো বিন্দুর নিচে ছাদ থাকলে তার উচ্চতা (হেলিকপ্টার নামা, ছাদে হাঁটা)
  roofAt(x, z) {
    const l = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell));
    let h = 0;
    if (!l) return 0;
    for (const b of l) {
      if (!b.poly || b.low || b.y0 || b.h <= h) continue;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (inPoly(b.poly, x, z)) h = b.h;
    }
    return h;
  }

  // মেট্রো রেলের উড়াল লাইন আর মিরপুর-১০ স্টেশন
  buildRail(S) {
    const M = this.map;
    const deckM = lam(0xbdb8ae), railM = lam(0x555a60);
    const pillars = [];
    for (const line of M.rail) {
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) continue;
        const ry = Math.atan2(bx - ax, bz - az);
        const deck = addBox(S, 8.5, 1.3, L + 0.4, deckM, (ax + bx) / 2, 9.6, (az + bz) / 2);
        deck.rotation.y = ry;
        for (const o of [-0.75, 0.75]) { // আসল মাপের রেল (১.৪৩৫ মি গেজ); নিচের স্লিপার metro.js বানায়
          const r = addBox(S, 0.09, 0.2, L, railM, (ax + bx) / 2 + Math.cos(ry) * o, 10.45, (az + bz) / 2 - Math.sin(ry) * o);
          r.rotation.y = ry;
        }
        for (let t = 0; t < L; t += 26) {
          const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
          // পিলার: রাস্তার মাঝের ডিভাইডারে (থাকলে); একমুখী রাস্তার উপর লাইন হলে রাস্তার কিনারা ঘেঁষে সাজানো আইল্যান্ডে
          let px = x, pz = z;
          if (this.onRoad(x, z, 0.6) && !this.inMedian(x, z)) {
            const r = M.nearestSeg(x, z);
            if (!r) continue;
            const nx = -r.seg.dir.z, nz = r.seg.dir.x;
            let best = null;
            for (const sg of [1, -1]) {
              const cx = r.px + nx * sg * (r.seg.width / 2 + 1.25), cz = r.pz + nz * sg * (r.seg.width / 2 + 1.25);
              const d = Math.hypot(cx - x, cz - z);
              if (d < 4.6 && !this.onRoad(cx, cz, 0.9) && !this.blocked(cx, 1, cz) && (!best || d < best.d)) best = { x: cx, z: cz, d };
            }
            if (!best) continue;
            px = best.x; pz = best.z;
            (this.pillarIslands || (this.pillarIslands = [])).push([px, pz, Math.atan2(r.seg.dir.x, r.seg.dir.z)]);
          }
          pillars.push([px, pz]);
          this.addBox(px - 0.8, px + 0.8, pz - 0.8, pz + 0.8, 9, 'pillar');
        }
      }
    }
    this.pillarPos = pillars;
    this.buildPillarArt(S, pillars);
    // স্টেশন আর ট্রেন metro.js বানায়
  }

  buildDetails(S) {
    const M = this.map;
    // গাছ আর ল্যাম্পপোস্ট: প্রধান সড়কের ফুটপাতে, আর পার্কে
    const trees = [], lamps = [];
    const free = (x, z, r = 1) => !this.onRoad(x, z, 0.3) && !this.blocked(x, 1, z) && !this.blocked(x + r, 1, z) && !this.blocked(x - r, 1, z) && M.lakeDist(x, z) > 2;
    for (const s of M.segments) {
      if (!s.main) continue;
      const nx = -s.dir.z, nz = s.dir.x;
      for (let t = 8; t < s.len - 8; t += 24) {
        for (const side of [-1, 1]) {
          const off = side * (s.width / 2 + FOOT - 0.5);
          const x = s.ax + s.dir.x * t + nx * off, z = s.az + s.dir.z * t + nz * off;
          if (!free(x, z, 0.5) || this.sideBlocked(s, t, off, 0.6) || this.sideBlocked(s, t, side * (s.width / 2 + 0.3))) continue;
          if (side === 1) lamps.push([x, z, Math.atan2(nx * side, nz * side)]);
          else if (Math.random() < 0.5) trees.push([x, z, 0.8 + Math.random() * 0.5]);
        }
      }
    }
    // গলিতেও মাঝে মাঝে বাতির খুঁটি
    for (const s of M.segments) {
      if (s.main || s.len < 20) continue;
      const nx = -s.dir.z, nz = s.dir.x;
      for (let t = 10; t < s.len - 6; t += 32) {
        const side = (Math.floor(t / 32) + s.id) % 2 ? 1 : -1;
        const off = side * (s.width / 2 + 0.35);
        const x = s.ax + s.dir.x * t + nx * off, z = s.az + s.dir.z * t + nz * off;
        if (this.onRoad(x, z, 0.2) || this.otherRoad(x, z, s, 0.4) || this.blocked(x, 1, z) || this.blocked(x + side * nx * 0.3, 1, z + side * nz * 0.3)) continue;
        lamps.push([x, z, Math.atan2(nx * side, nz * side)]);
      }
    }
    for (const p of M.parks) {
      const b = p.b, area = (b.x1 - b.x0) * (b.z1 - b.z0);
      const n = Math.min(40, Math.floor(area / 250));
      for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
        const x = b.x0 + Math.random() * (b.x1 - b.x0), z = b.z0 + Math.random() * (b.z1 - b.z0);
        if (!inPoly(p.p, x, z) || polyEdge(p.p, x, z).d > 7) continue; // কিনারা ঘেঁষে, মাঝখানে খোলা মাঠ
        if (!free(x, z)) continue;
        trees.push([x, z, 0.9 + Math.random() * 0.6]);
        k++;
      }
    }
    const trunkG = new THREE.CylinderGeometry(0.18, 0.26, 3, 6);
    trunkG.translate(0, 1.5, 0);
    const leafG = new THREE.IcosahedronGeometry(2.2, 0);
    leafG.translate(0, 4.4, 0);
    const trunk = new THREE.InstancedMesh(trunkG, lam(0x5a3e26), Math.max(1, trees.length));
    const leaf = new THREE.InstancedMesh(leafG, lam(0x3f6e2c), Math.max(1, trees.length));
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const col = new THREE.Color();
    this.treeMats = [];
    this.treeModels = new TreeModels(this); // আসল গাছ পরে লোড হয়
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(up, Math.random() * 6);
      sc.set(s, s * (0.9 + Math.random() * 0.3), s);
      pos.set(x, 0, z);
      mtx.compose(pos, q, sc);
      trunk.setMatrixAt(i, mtx);
      leaf.setMatrixAt(i, mtx);
      this.treeMats[i] = mtx.clone();
      leaf.setColorAt(i, col.setHSL(0.24 + Math.random() * 0.08, 0.45, 0.24 + Math.random() * 0.1));
      const box = this.addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 3, 'tree');
      box.brk = { kind: 'tree', x, z, q: q.clone(), sc: sc.clone(), idx: i, box };
    });
    trunk.count = leaf.count = trees.length;
    for (const m of [trunk, leaf]) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = true; this.scene.add(m); }
    const poleG = new THREE.CylinderGeometry(0.08, 0.12, 8, 6);
    poleG.translate(0, 4, 0);
    const armG = new THREE.BoxGeometry(0.1, 0.1, 2.2);
    armG.translate(0, 7.9, -1.1);
    const lampP = new THREE.InstancedMesh(poleG, lam(0x6a6e72), Math.max(1, lamps.length));
    const lampA = new THREE.InstancedMesh(armG, lam(0x6a6e72), Math.max(1, lamps.length));
    lamps.forEach(([x, z, ry], i) => {
      q.setFromAxisAngle(up, ry);
      pos.set(x, 0, z);
      sc.set(1, 1, 1);
      mtx.compose(pos, q, sc);
      lampP.setMatrixAt(i, mtx);
      lampA.setMatrixAt(i, mtx);
      const box = this.addBox(x - 0.15, x + 0.15, z - 0.15, z + 0.15, 8, 'pole');
      box.brk = { kind: 'lamp', x, z, ry, idx: i, box };
    });
    lampP.count = lampA.count = lamps.length;
    this.lampList = lamps; this.treeList = trees; // রাস্তার সাজ (streetdress.js) এগুলো এড়িয়ে বসে
    for (const m of [lampP, lampA]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = true; this.scene.add(m); } // ছোট খুঁটি: শ্যাডো বাদ
    // বাতির মাথা (রাতে জ্বলে) আর নিচে আলোর বৃত্ত
    const headG = new THREE.BoxGeometry(0.34, 0.12, 0.62);
    headG.translate(0, 7.82, -2.05);
    const poolG = new THREE.CircleGeometry(5.5, 20);
    poolG.rotateX(-Math.PI / 2);
    poolG.translate(0, 0.1, -2.05);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x8a8d90 });
    this.poolMat = new THREE.MeshBasicMaterial({ color: 0xffc66a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const heads = new THREE.InstancedMesh(headG, this.lampMat, Math.max(1, lamps.length));
    const pools = (this.lampPools = new THREE.InstancedMesh(poolG, this.poolMat, Math.max(1, lamps.length)));
    lamps.forEach(([x, z, ry], i) => {
      q.setFromAxisAngle(up, ry);
      pos.set(x, 0, z);
      sc.set(1, 1, 1);
      mtx.compose(pos, q, sc);
      heads.setMatrixAt(i, mtx);
      pools.setMatrixAt(i, mtx);
    });
    heads.count = pools.count = lamps.length;
    pools.visible = false;
    pools.userData.noShadow = true;
    this.scene.add(heads); // আলোর বৃত্ত (pools) দৃশ্যে যোগ হয় না
    this.lampCount = lamps.length;
    this.inst = { trunk, leaf, lampP, lampA, heads, pools };

    // বড় মোড়ে রাস্তার নামের সবুজ বোর্ড
    let boards = 0;
    M.nodes.forEach((n, i) => {
      if (boards > 40 || n.links.length < 3) return;
      const segs = n.links.map((l) => M.segments[l.seg]);
      if (!segs.some((s) => s.main)) return;
      const names = [...new Set(segs.filter((s) => !/গলি|রাস্তা|সংযোগ/.test(s.name)).map((s) => s.name))];
      if (!names.length) return;
      const r = this.nodeW[i].r + FOOT * 0.6;
      // দুই রাস্তার মাঝের কোণে খুঁটি
      const s0 = segs[0], s1 = segs[1];
      const d0 = s0.a === n.id ? s0.dir : { x: -s0.dir.x, z: -s0.dir.z };
      const d1 = s1.a === n.id ? s1.dir : { x: -s1.dir.x, z: -s1.dir.z };
      let bx = d0.x + d1.x, bz = d0.z + d1.z;
      const bl = Math.hypot(bx, bz) || 1;
      const x = n.x + (bx / bl) * r * 1.4, z = n.z + (bz / bl) * r * 1.4;
      if (this.onRoad(x, z, 0.2) || this.blocked(x, 1, z)) return;
      boards++;
      // খুঁটিসহ বোর্ড আলাদা দল: ধাক্কায় পড়ে যায়
      const grp = new THREE.Group();
      grp.userData.dyn = true;
      grp.position.set(x, 0, z);
      S.add(grp);
      addCyl(grp, 0.06, 0.06, 3.4, lam(0x777777), 0, 1.7, 0, 6);
      names.slice(0, 2).forEach((name, k) => {
        const seg = segs.find((s) => s.name === name);
        const p = twoFace(new THREE.Mesh(planeGeo(2.6, 0.6), texMat(signTex(name, 'road'), { side: THREE.DoubleSide })));
        p.position.set(0, 3.0 + k * 0.7, 0);
        p.rotation.y = Math.atan2(seg.dir.x, seg.dir.z) + Math.PI / 2;
        p.userData.noShadow = true;
        grp.add(p);
      });
      this.addBreakable(grp, x, z, 0.15, 3.4);
    });
  }

  // ---------- পদচারী সেতু: বড় মোড়ে সিঁড়ি + চাতাল (walkY / NPC path) ----------
  buildFootOverbridges(S) {
    const M = this.map, Y0 = 0.16, Y1 = 5.05, RUN = 5.8, DW = 1.2;
    this.walks = this.walks || [];
    this.overbridges = [];
    const steel = lam(0x6a727a), deckM = lam(0xb0a89a), railM = lam(0x3a4048), stepM = lam(0x9a9488);
    let n = 0;
    for (const node of M.nodes) {
      if (n >= 9 || node.links.length < 3) continue;
      const mains = node.links.map((l) => M.segments[l.seg]).filter((s) => s.main && s.width >= 8 && s.len > 28);
      if (!mains.length) continue;
      const s = mains.sort((a, b) => b.width - a.width)[0];
      const fromA = s.a === node.id;
      const tMid = fromA ? Math.min(16, s.len * 0.4) : Math.max(s.len - 16, s.len * 0.6);
      const cx = s.ax + s.dir.x * tMid, cz = s.az + s.dir.z * tMid;
      if (M.lakeDist(cx, cz) < 2) continue;
      const half = s.width / 2 + FOOT;
      const ux = -s.dir.z, uz = s.dir.x; // রাস্তা পার
      const st = { x: cx, z: cz, nx: s.dir.x, nz: s.dir.z, ux, uz };
      this.walks.push({ st, kind: 'ramp', lat0: -DW, lat1: DW, lonB: -(half + RUN), dir: 1, run: RUN, y0: Y0, y1: Y1 });
      this.walks.push({ st, kind: 'rect', lat0: -DW, lat1: DW, lon0: -half, lon1: half, y: Y1 });
      this.walks.push({ st, kind: 'ramp', lat0: -DW, lat1: DW, lonB: half + RUN, dir: -1, run: RUN, y0: Y0, y1: Y1 });
      const P = (lat, lon, y) => [cx + s.dir.x * lat + ux * lon, y, cz + s.dir.z * lat + uz * lon];
      const yaw = Math.atan2(s.dir.x, s.dir.z);
      // চাতাল
      const deck = addBox(S, DW * 2 + 0.3, 0.22, half * 2 + 0.4, deckM, cx, Y1, cz);
      deck.rotation.y = yaw;
      // সিঁড়ির ধাপ দুই পাশে
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const lon = side * (half + (i + 0.5) * (RUN / 8));
          const y = Y0 + ((7 - i) / 7) * (Y1 - Y0);
          const [x, , z] = P(0, lon, 0);
          const step = addBox(S, DW * 2, 0.18, RUN / 8 + 0.05, stepM, x, y, z);
          step.rotation.y = yaw;
        }
        // পিলার ফুটপাতে
        const [px, , pz] = P(0, side * (half + 0.6), 0);
        addCyl(S, 0.22, 0.22, Y1, steel, px, Y1 / 2, pz, 8);
        this.addBox(px - 0.35, px + 0.35, pz - 0.35, pz + 0.35, Y1 + 0.3, 'pillar');
      }
      // রেলিং
      for (const lat of [-DW, DW]) for (const lon of [-half, half]) {
        const [x, , z] = P(lat, lon * 0.92, 0);
        addBox(S, 0.06, 0.9, Math.abs(lon) < 1 ? half * 1.6 : 0.06, railM, x, Y1 + 0.55, z);
      }
      for (const side of [-1, 1]) {
        const midLon = side * (half + RUN * 0.5);
        for (const lat of [-DW, DW]) {
          const [x, , z] = P(lat, midLon, 0);
          addBox(S, 0.05, 0.85, RUN * 0.9, railM, x, Y1 * 0.55 + 0.4, z).rotation.y = yaw;
        }
      }
      // সাইন
      const [sx, , sz] = P(0, -(half + RUN * 0.35), 0);
      const sn = twoFace(new THREE.Mesh(planeGeo(2.2, 0.45), texMat(signTex('পদচারী সেতু', 'road'), { side: THREE.DoubleSide })));
      sn.position.set(sx, Y1 * 0.55 + 1.1, sz); sn.rotation.y = yaw + Math.PI / 2; sn.userData.noShadow = true; this.scene.add(sn);
      // NPC পথ (সিঁড়ি → চাতাল → নামানো)
      const path = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, lon = -(half + RUN) + u * RUN, y = Y0 + u * (Y1 - Y0);
        const [x, , z] = P(0, lon, 0); path.push({ x, z, y });
      }
      for (let i = 1; i <= 6; i++) { const lon = -half + (i / 6) * half * 2; const [x, , z] = P(0, lon, 0); path.push({ x, z, y: Y1 }); }
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, lon = half + u * RUN, y = Y1 - u * (Y1 - Y0);
        const [x, , z] = P(0, lon, 0); path.push({ x, z, y });
      }
      this.overbridges.push({ cx, cz, seg: s, t: tMid, path, y1: Y1 });
      // হাতরেল কলিজন (পড়ে না যাওয়া)
      const railH = Y1 + 1.0;
      for (const side of [-1, 1]) {
        const pts = [P(-DW - 0.15, side * half, 0), P(DW + 0.15, side * half, 0), P(DW + 0.15, side * (half + 0.2), 0), P(-DW - 0.15, side * (half + 0.2), 0)].map((p) => [p[0], p[2]]);
        const b = this.addPoly(pts, railH, 'rail'); b.y0 = Y1 - 0.2;
      }
      n++;
    }
  }

  // ---------- জলের উপর সেতু (সেতু) ----------
  buildWaterBridges(S) {
    const M = this.map;
    this.waterBridges = [];
    if (!M.water.length) return;
    const deckM = lam(0xa8a094), railM = lam(0x44505a), pierM = lam(0x8a8478);
    let n = 0;
    for (const s of M.segments) {
      if (n >= 5 || !s.main || s.len < 22) continue;
      let t0 = null, t1 = null;
      for (let t = 0; t <= s.len; t += 2.5) {
        const wet = M.lakeDist(s.ax + s.dir.x * t, s.az + s.dir.z * t) < -0.4;
        if (wet && t0 === null) t0 = Math.max(0, t - 3);
        if (!wet && t0 !== null) { t1 = Math.min(s.len, t + 3); break; }
      }
      if (t0 !== null && t1 === null) t1 = s.len;
      if (t0 === null || t1 - t0 < 10) continue;
      if (M.lakeDist(s.ax + s.dir.x * (t0 - 1), s.az + s.dir.z * (t0 - 1)) < -1) continue;
      if (M.lakeDist(s.ax + s.dir.x * (t1 + 1), s.az + s.dir.z * (t1 + 1)) < -1) continue;
      const L = t1 - t0, mx = s.ax + s.dir.x * ((t0 + t1) / 2), mz = s.az + s.dir.z * ((t0 + t1) / 2);
      const yaw = Math.atan2(s.dir.x, s.dir.z), hw = s.width / 2 + 0.35, Y = 0.92;
      const deck = addBox(S, hw * 2 + 0.6, 0.35, L + 1.2, deckM, mx, Y, mz);
      deck.rotation.y = yaw;
      for (let t = t0 + 4; t < t1; t += 8) {
        const x = s.ax + s.dir.x * t, z = s.az + s.dir.z * t;
        addCyl(S, 0.45, 0.55, Y + 1.2, pierM, x, Y * 0.15, z, 8);
      }
      for (const side of [-1, 1]) {
        const lx = -s.dir.z * side * (hw + 0.05), lz = s.dir.x * side * (hw + 0.05);
        const rail = addBox(S, 0.1, 0.85, L + 0.6, railM, mx + lx, Y + 0.7, mz + lz);
        rail.rotation.y = yaw;
      }
      const sn = twoFace(new THREE.Mesh(planeGeo(2.0, 0.5), texMat(signTex('সেতু', 'road'), { side: THREE.DoubleSide })));
      sn.position.set(mx - s.dir.z * (hw + 0.2), Y + 1.35, mz + s.dir.x * (hw + 0.2));
      sn.rotation.y = yaw; sn.userData.noShadow = true; this.scene.add(sn);
      s.bridge = true;
      s.bridges.push({ t0, t1 });
      this.waterBridges.push({ seg: s, t0, t1, y: Y + 0.18, halfW: hw + 0.2 });
      n++;
    }
  }

  update(dt, t) {
    if (this.T.water) this.T.water.offset.set(t * 0.01, t * 0.02);
  }
  // ---------- ভাঙা যায় এমন জিনিস: ল্যাম্পপোস্ট, গাছ, বোর্ড, বাস কাউন্টারের ছাউনি ----------
  addBreakable(obj, x, z, half, h) {
    const box = this.addBox(x - half, x + half, z - half, z + half, h, 'pole');
    box.brk = { kind: 'obj', obj, x, z, q0: obj.quaternion.clone(), box };
    return box;
  }
  // গাড়ির ধাক্কায় ভাঙা: dx,dz = কোন দিকে পড়বে
  breakBox(box, dx, dz) {
    const it = box.brk;
    if (!it || it.broken) return false;
    const l = Math.hypot(dx, dz) || 1;
    it.broken = true; it.t = 0; it.fall = 0; it.dir = { x: dx / l, z: dz / l };
    box.hOrig = box.h; box.h = -1; // আর আটকায় না
    for (const l of it.links || []) { l.hOrig = l.h; l.h = -1; }
    (this.fallen || (this.fallen = [])).push(it);
    if (this.onBreak) this.onBreak(it);
    return true;
  }
  poseBreak(it, ang) {
    const up = _up, qt = _qt.setFromAxisAngle(_ax.set(it.dir ? it.dir.z : 0, 0, it.dir ? -it.dir.x : 0), ang);
    if (it.kind === 'obj') { it.obj.quaternion.copy(qt).multiply(it.q0); return; }
    const I = this.inst;
    if (it.kind === 'tree') {
      _q.copy(qt).multiply(it.q);
      _m.compose(_p.set(it.x, 0, it.z), _q, it.sc);
      if (this.treeMats) this.treeMats[it.idx].copy(_m);
      if (this.treeModels && this.treeModels.pose(it.idx)) return; // কাছের আসল গাছ
      I.trunk.setMatrixAt(it.idx, _m); I.leaf.setMatrixAt(it.idx, _m);
      I.trunk.instanceMatrix.needsUpdate = I.leaf.instanceMatrix.needsUpdate = true;
    } else {
      _q.copy(qt).multiply(_q2.setFromAxisAngle(up, it.ry));
      _m.compose(_p.set(it.x, 0, it.z), _q, _s.set(1, 1, 1));
      for (const k of ['lampP', 'lampA', 'heads']) { I[k].setMatrixAt(it.idx, _m); I[k].instanceMatrix.needsUpdate = true; }
      _m.compose(_p, _q2, _s.setScalar(ang > 0 ? 0 : 1)); // ভাঙা বাতির নিচে আলো নেই
      I.pools.setMatrixAt(it.idx, _m); I.pools.instanceMatrix.needsUpdate = true;
    }
  }
  // পড়ে যাওয়ার অ্যানিমেশন; অনেকক্ষণ পরে, দূরে থাকলে আবার নতুন
  updateBreak(dt, px, pz) {
    this.glass.update(dt, px, pz);
    if (this.treeModels) this.treeModels.update(dt, px, pz);
    if (!this.fallen || !this.fallen.length) return;
    for (let i = this.fallen.length - 1; i >= 0; i--) {
      const it = this.fallen[i];
      it.t += dt;
      if (it.fall < 1) {
        it.fall = Math.min(1, it.fall + dt * 2.2);
        const e = it.fall * it.fall;
        this.poseBreak(it, e * (it.kind === 'lamp' ? 1.42 : 1.5));
      } else if (it.t > 90 && Math.hypot(it.x - px, it.z - pz) > 80) {
        it.broken = false; it.box.h = it.box.hOrig;
        for (const l of it.links || []) l.h = l.hOrig;
        this.poseBreak(it, 0);
        this.fallen.splice(i, 1);
      }
    }
  }
  // ভেজা রাস্তা: একটু কালচে, চাকা একটু পিছলায়
  setWet(k) {
    this.wet = k;
    if (this.roadMat && Math.abs((this.wetK ?? -1) - k) > 0.01) { this.wetK = k; this.roadMat.color.setScalar(1 - 0.32 * k); }
  }
  // রাত (০ = দিন, ১ = পুরো রাত): জানালা, রাস্তার বাতি
  // পিলারে দেয়ালচিত্র: আলপনা, নকশি কাঁথা, রিকশা আর্ট, দেশের ছবি, শহরের গ্রাফিতি; প্রতি পিলার আলাদা, চার পাশে
  buildPillarArt(S, pillars) {
    const A = new Atlas(2048, 2048), cells = {};
    for (const th of PILLAR_THEMES) { cells[th] = []; for (let k = 0; k < 4; k++) cells[th].push(A.add(196, 1016, (c, w, h) => pillarArt(c, w, h, th, k))); }
    const tex = A.texture();
    this.pillarMat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000 });
    this.upMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    const q = new Tris(), H = 0.8, Y1 = 9;
    pillars.forEach(([x, z], i) => {
      const th = PILLAR_THEMES[(i + Math.floor(Math.abs(x * 0.013 + z * 0.007))) % PILLAR_THEMES.length];
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([nx, nz], f) => {
        const c = cells[th][(f + i) % 4], rx = nz, rz = -nx; // দেখার লোকের ডান দিক
        const P = (sg, y) => [x + nx * H + rx * sg * H, y, z + nz * H + rz * sg * H];
        q.quad(P(-1, 0), P(1, 0), P(1, Y1), P(-1, Y1), [c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v1], [nx, 0, nz]);
        // নিচে আলো (রাতে জ্বলে)
        if (f % 2 === 0) addBox(S, 0.34, 0.14, 0.2, this.upMat, x + nx * (H + 0.35), 0.12, z + nz * (H + 0.35));
      });
    });
    if (q.pos.length) { const m = q.mesh(this.pillarMat); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
    this.pillarCount = pillars.length;
  }
  setNight(k) {
    if (Math.abs((this.nightK ?? -1) - k) < 0.01) return;
    this.nightK = k;
    const w = Math.min(1, k * 1.2);
    for (const m of this.nightMats) m.emissive.setRGB(w * 0.95, w * 0.9, w * 0.8);
    const c0 = new THREE.Color(0x8a8d90), c1 = new THREE.Color(0xfff0b0);
    this.lampMat.color.copy(c0.lerp(c1, Math.min(1, k * 1.5)));
    // রাস্তায় হলুদ আলোর বৃত্ত আর আঁকা হয় না (আসল রাস্তার মতো শুধু বাতিটা জ্বলে)
    this.lampPools.visible = false;
    if (this.pillarMat) { this.pillarMat.emissive.setRGB(k * 0.5, k * 0.46, k * 0.4); this.upMat.color.setRGB(0.23 + k * 0.77, 0.23 + k * 0.7, 0.23 + k * 0.5); }
  }
}
