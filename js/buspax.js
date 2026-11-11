// বাসের যাত্রী (ঢাকার মতো): বসা, দাঁড়িয়ে হাতল ধরা, ভিড়ে দরজায় ঝোলা, হেল্পার দরজায় ঝুলে ডাকে
// হালকা: প্রতি বাসের সব যাত্রী মিলে একটা মেশ (রং ভার্টেক্সে), ঝোলা লোকেরা আলাদা মেশে (বেশি দোলে)
// শুধু কাছের বাসে (আসল মডেল দেখা গেলে) দেখা যায়
import * as THREE from 'three';
import { pick, rand } from './utils.js';
import { REAL } from './realrig.js';
import { vurl, VMANAGER, loadGLTF } from './ver.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SKIN = ['#8d5524', '#a0673a', '#c68642', '#b07040', '#7a4a26', '#9c6b43'];
const SHIRT = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#f5f5f5', '#6d4c41', '#8e24aa', '#00897b', '#ff7043', '#3949ab', '#c0ca33', '#5d4037', '#90a4ae', '#d81b60'];
const PANT = ['#263238', '#37474f', '#1a237e', '#4e342e', '#212121', '#455a64', '#3e2723'];
const LUNGI = ['#2e7d32', '#1565c0', '#6a1b9a', '#795548'];
const FEM = ['#ad1457', '#6a1b9a', '#00838f', '#ef6c00', '#1b5e20', '#c62828', '#212121', '#4527a0'];
const HAIR = '#141210';
const HELPER = [
  'উঠেন উঠেন, খালি গাড়ি!', 'সিট আছে, সিট আছে!', 'ওস্তাদ, বাঁয়ে চাপান!', 'আস্তে, লেডিস!',
  'পিছে যান, পিছে যান!', 'ভাড়া দেন, ভাড়া!', 'ওস্তাদ, ডাইনে প্লাস্টিক!', 'নামেন নামেন, জলদি!',
  'উস্তাদ, বামে প্লাস্টিক!', 'ওস্তাদ, বাঁয়ে প্লাস্টিক!', 'গেটলক! গেটলক!', 'ওস্তাদ, যান!',
  'সামনে ফাঁকা, চাপান!', 'ভাড়া খুচরা রাখেন!', 'এই ভাই, হাত ধরেন!', 'নামেন নামেন, স্টপেজ!',
  'লেডিস আগে, লেডিস!', 'ওস্তাদ, ব্রেক!', 'পিছনে সরেন, জায়গা নাই!', 'টিকিট কাটছেন? উঠেন!',
];

// ---------- ছোট জ্যামিতি: দুই বিন্দুর মাঝে চারকোনা অঙ্গ, মাথা আটকোনা ----------
function hex(c) { return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]; }
class Bag {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // a থেকে b পর্যন্ত চারকোনা অঙ্গ (চওড়া wa → wb)
  limb(a, b, wa, wb, col) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1; d[0] /= L; d[1] /= L; d[2] /= L;
    let r = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]]; const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const ring = (p, w) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([s, t]) => [p[0] + (u[0] * s + v[0] * t) * w / 2, p[1] + (u[1] * s + v[1] * t) * w / 2, p[2] + (u[2] * s + v[2] * t) * w / 2]);
    const A = ring(a, wa), B = ring(b, wb);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(A[i], A[j], B[j], B[i], col); }
    this.quad(A[3], A[2], A[1], A[0], col); this.quad(B[0], B[1], B[2], B[3], col);
  }
  head(c, r, skin, hair, scarf) {
    const N = 8, top = [c[0], c[1] + r * 1.15, c[2]], bot = [c[0], c[1] - r * 1.1, c[2]];
    const ring = (y, rr) => Array.from({ length: N }, (_, i) => [c[0] + Math.cos(i / N * 6.283) * rr, c[1] + y, c[2] + Math.sin(i / N * 6.283) * rr]);
    const R1 = ring(r * 0.45, r * 0.95), R0 = ring(-r * 0.5, r * 0.85);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      this.quad(R0[i], R0[j], R1[j], R1[i], scarf || skin);
      this.tri(R1[i], R1[j], top, scarf || hair);
      this.tri(R0[j], R0[i], bot, skin);
    }
  }
}

// ---------- একজন মানুষ: ভঙ্গি অনুযায়ী জোড়ের জায়গা (মুখ −z দিকে, পায়ের নিচে y=0) ----------
function person(bag, pose, o, ox, oy, oz, rotY = 0) {
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const P = (x, y, z) => [ox + x * cs + z * sn, oy + y, oz - x * sn + z * cs];
  const skin = hex(o.skin), top = hex(o.top), bot = hex(o.bot), hair = hex(HAIR), scarf = o.scarf ? hex(o.scarf) : null;
  const h = o.h;
  let hip, neck, hd, sh, el, ha, kn, ft;
  if (pose === 'sit') {
    hip = [0, 0.45, 0.05]; neck = [0, 0.98, 0.08]; hd = [0, 1.13, 0.06];
    kn = [[-0.1, 0.48, -0.36], [0.1, 0.48, -0.36]]; ft = [[-0.1, 0.02, -0.42], [0.1, 0.02, -0.42]];
    sh = [[-0.18, 0.93, 0.08], [0.18, 0.93, 0.08]]; el = [[-0.22, 0.68, -0.05], [0.22, 0.68, -0.05]]; ha = [[-0.12, 0.55, -0.25], [0.12, 0.55, -0.25]];
  } else if (pose === 'hang') {
    // দরজায় ঝোলা: −x দিকে বাইরে ঝুঁকে, এক হাত উপরে দরজার হাতলে, এক পা পা-দানিতে, আরেক পা ঝুলে
    hip = [-0.22, 0.88, 0]; neck = [-0.36, 1.4, 0]; hd = [-0.4, 1.56, 0];
    kn = [[-0.12, 0.45, -0.08], [-0.32, 0.5, 0.12]]; ft = [[0, 0.02, -0.06], [-0.4, 0.12, 0.3]];
    sh = [[-0.36, 1.36, -0.18], [-0.34, 1.36, 0.18]]; el = [[-0.2, 1.6, -0.18], [-0.5, 1.12, 0.3]]; ha = [[0.02, 1.88, -0.16], [-0.6, 0.9, 0.36]];
  } else { // দাঁড়িয়ে, এক হাত উপরে হাতলে
    hip = [0, 0.92, 0]; neck = [0, 1.45, 0]; hd = [0, 1.6, 0];
    kn = [[-0.1, 0.48, -0.02], [0.1, 0.48, 0.02]]; ft = [[-0.11, 0.02, -0.03], [0.11, 0.02, 0.04]];
    sh = [[-0.19, 1.4, 0], [0.19, 1.4, 0]]; el = [[-0.24, 1.15, 0.02], [0.25, 1.6, 0.02]]; ha = [[-0.22, 0.92, -0.04], [0.2, 1.78, 0]]; // হাতল ছাদের নিচে (একতলা বাস ভিতরে ~১.৯ মি)
    if (o.bothDown) { el[1] = [0.24, 1.15, 0.02]; ha[1] = [0.2, 0.92, -0.05]; }
  }
  const S = (q) => P(q[0] * h, q[1] * h, q[2] * h);
  // শরীর, কাঁধ, মাথা
  bag.limb(S(hip), S(neck), 0.3 * h, 0.36 * h, top);
  bag.head(S(hd), 0.105 * h, skin, hair, scarf);
  for (let i = 0; i < 2; i++) {
    bag.limb(S(sh[i]), S(el[i]), 0.1 * h, 0.085 * h, o.long ? top : top);
    bag.limb(S(el[i]), S(ha[i]), 0.08 * h, 0.07 * h, o.long ? top : skin);
    const hp = [hip[0] + (i ? 0.09 : -0.09), hip[1], hip[2]];
    bag.limb(S(hp), S(kn[i]), 0.15 * h, 0.12 * h, bot);
    bag.limb(S(kn[i]), S(ft[i]), 0.11 * h, 0.09 * h, o.dress ? bot : bot);
  }
}

function look() {
  const f = Math.random() < 0.3;
  if (f) {
    const c = pick(FEM), borka = Math.random() < 0.35;
    return { skin: pick(SKIN), top: borka ? '#1b1b1f' : c, bot: borka ? '#1b1b1f' : pick([c, '#f5f5f5', '#212121']), scarf: borka ? '#1b1b1f' : Math.random() < 0.5 ? pick(FEM) : null, h: rand(0.92, 0.98), long: true, dress: true };
  }
  return { skin: pick(SKIN), top: pick(SHIRT), bot: Math.random() < 0.2 ? pick(LUNGI) : pick(PANT), scarf: Math.random() < 0.08 ? '#f5f5f5' : null, h: rand(0.97, 1.05), bothDown: Math.random() < 0.3 };
}

// ---------- বাসের ভিতরের নকশা (আসল মডেলের মাপে) ----------
// floor = মেঝের উচ্চতা; z0..z1 আসনের সারি; doors = বাম পাশের দরজা (z), half = অর্ধেক চওড়া
const LAYOUT = {
  bus: { decks: [{ floor: 0.9, z0: -2.6, z1: 4.2 }], doors: [-4.25, 3.1], half: 1.27, seatX: [-0.95, -0.55, 0.55, 0.95] },
  dd: { decks: [{ floor: 0.42, z0: -3.2, z1: 4.4 }, { floor: 2.55, z0: -4.6, z1: 4.6 }], doors: [-4.2, -0.66], wheels: [-2.98, 1.7, 3.29], half: 1.3, seatX: [-0.95, -0.55, 0.55, 0.95] },
};

function build(v) {
  const L = v.dd ? LAYOUT.dd : LAYOUT.bus;
  // ভিড়: চার ভাগের এক ভাগ ফাঁকা-মতো, অর্ধেক ভরা, বাকিগুলো ঠাসা (দরজায় ঝোলে)
  const r = Math.random(), level = r < 0.25 ? 0 : r < 0.7 ? 1 : 2;
  const people = []; // { pose, o, x, y, z, rot, out }
  L.decks.forEach((dk, di) => {
    for (let z = dk.z0; z <= dk.z1; z += 0.82) {
      for (const x of L.seatX) {
        if (x < 0 && L.doors.some((d) => Math.abs(z - d) < 0.7)) continue; // দরজার সামনে আসন নেই
        if (L.wheels && di === 0 && L.wheels.some((w) => Math.abs(z - w) < 0.75)) continue; // নিচু মেঝেতে চাকার খোলের উপর আসন নেই
        if (level === 0 && Math.random() < 0.55) continue;
        people.push({ pose: 'sit', o: look(), x, y: dk.floor, z, rot: 0, deck: di });
      }
    }
    // মাঝের পথে দাঁড়ানো
    const nStand = level === 0 ? 0 : level === 1 ? Math.floor(rand(4, 9)) : Math.floor(rand(12, 20));
    for (let i = 0; i < (di === 0 ? nStand : Math.floor(nStand * 0.4)); i++) {
      people.push({ pose: 'stand', o: look(), x: rand(-0.22, 0.22), y: dk.floor, z: rand(dk.z0 - 0.4, dk.z1), rot: rand(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI), deck: di });
    }
  });
  // দরজায় ঝোলা (নিচের তলার দরজা), হেল্পার সামনের দরজায়
  const step = v.dd ? L.decks[0].floor - 0.02 : L.decks[0].floor - 0.38; // দোতলা নিচু মেঝের: পা-দানি নেই
  const hang = level === 2 ? Math.floor(rand(2, 5)) : 0;
  const helper = Math.random() < 0.8;
  const slots = [];
  for (const off of [-0.25, 0.25, 0]) for (const d of L.doors) slots.push(d + off); // দুই দরজায় পালা করে
  let k = 0;
  if (helper) { people.push({ pose: 'hang', o: { ...look(), top: pick(['#455a64', '#5d4037', '#1565c0']), bot: '#263238', h: 1 }, x: -L.half + 0.05, y: step, z: L.doors[0], rot: 0, out: true, helper: true }); k = 1; }
  for (let i = 0; i < hang; i++) people.push({ pose: 'hang', o: look(), x: -L.half + 0.05 + rand(-0.04, 0.06), y: step, z: slots[(k + i) % slots.length] + rand(-0.08, 0.08), rot: 0, out: true });
  const grp = new THREE.Group(); grp.name = 'buspax';
  const inG = new THREE.Group(), hangG = new THREE.Group();
  hangG.position.set(-L.half, step, 0); // দরজার রেখা ঘিরে দোলে
  const hangIn = new THREE.Group(); hangIn.position.set(L.half, -step, 0); hangG.add(hangIn);
  grp.add(inG, hangG);
  const real = PAX.geo && REAL.ready && (REAL.bodyMat || REAL.variants.length);
  if (real) realPeople(people, inG, hangIn, v.dd);
  else boxPeople(people, inG, hangIn);
  return { grp, inG, hangG, level, helper, real, people, ph: Math.random() * 6, sayT: rand(3, 10) };
}

const tagMesh = (m) => { m.userData.noShadow = true; m.userData.noDent = true; m.castShadow = false; m.frustumCulled = true; return m; };
// হালকা যাত্রী (আসল মডেল না পেলে)
function boxPeople(people, inG, hangIn) {
  const inner = new Bag(), outer = new Bag();
  for (const p of people) person(p.out ? outer : inner, p.pose, p.o, p.x, p.y, p.z, p.rot);
  for (const [bag, parent] of [[inner, inG], [outer, hangIn]]) {
    if (!bag.p.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bag.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bag.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(bag.c, 3));
    parent.add(tagMesh(new THREE.Mesh(g, MAT)));
  }
}

// ---------- আসল চরিত্র: আগে থেকে ভঙ্গি বসানো স্থির মেশ (assets/pax.gltf.json), জামার রং পথচারীদের সাজের মতো ----------
const PAX = { geo: null, loading: false };
export async function loadPax() {
  if (PAX.loading) return; PAX.loading = true;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gl = await loadGLTF(new GLTFLoader(VMANAGER), vurl('assets/pax.gltf.json'));
    const geo = {};
    gl.scene.updateMatrixWorld(true);
    gl.scene.traverse((o) => {
      if (!o.isMesh) return;
      const pose = (o.parent && o.parent.name ? o.parent.name : o.name).replace(/^pax_/, '').replace(/_\d+$/, '');
      const key = ['sit', 'stand', 'hang'].find((k) => (o.name + ' ' + (o.parent ? o.parent.name : '')).includes(k)) || pose;
      // ছোট করা (int16) মানগুলো সাধারণ সংখ্যায়, নোডের মাপসহ
      const src = o.geometry, n = src.attributes.position.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
      const v3 = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < n; i++) {
        v3.fromBufferAttribute(src.attributes.position, i).applyMatrix4(o.matrixWorld); P[i * 3] = v3.x; P[i * 3 + 1] = v3.y; P[i * 3 + 2] = v3.z;
        v3.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(nm).normalize(); N[i * 3] = v3.x; N[i * 3 + 1] = v3.y; N[i * 3 + 2] = v3.z;
        U[i * 2] = src.attributes.uv.getX(i); U[i * 2 + 1] = src.attributes.uv.getY(i);
      }
      const I = Array.from(src.index.array);
      (geo[key] = geo[key] || {})[o.material.name === 'hair' ? 'hair' : 'body'] = { P, N, U, I };
    });
    if (geo.sit && geo.stand && geo.hang) PAX.geo = geo;
  } catch (e) { console.warn('pax', e && e.message); }
}
function hairMat() {
  if (REAL.hairMat !== undefined) return REAL.hairMat;
  REAL.hairMat = null;
  if (REAL.gltf) REAL.gltf.scene.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'hair') REAL.hairMat = o.material; });
  return REAL.hairMat;
}
function realPeople(people, inG, hangIn, dd) {
  // সংখ্যা সীমিত (ফোনেও চলবে): আগে ঝোলা লোক, তারপর দাঁড়ানো (জানালায় দেখা যায়), তারপর বসা
  const cap = dd ? 40 : 26;
  const order = [...people.filter((p) => p.out), ...people.filter((p) => !p.out && p.pose === 'stand'), ...people.filter((p) => p.pose === 'sit').sort(() => Math.random() - 0.5)];
  const keep = order.slice(0, cap);
  const vars = REAL.variants.length ? [...REAL.variants].sort(() => Math.random() - 0.5).slice(0, 3) : [REAL.bodyMat];
  const hm = hairMat();
  const bins = new Map(); // (ভিতরে/বাইরে, সাজ) → জোড়া জ্যামিতি
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3();
  const push = (key, part, mat) => { if (!bins.has(key)) bins.set(key, { P: [], N: [], U: [], I: [], mat }); return bins.get(key); };
  keep.forEach((p, i) => {
    const G = PAX.geo[p.pose];
    let s = p.helper ? 1 : rand(0.93, 1.03);
    if (!dd && p.pose === 'stand') s = Math.min(s, 0.9); // একতলা বাসে হাতল-ধরা হাত ছাদের নিচে
    const y = p.pose === 'sit' ? p.y - 0.05 : p.y; // বসলে কোমর আসনের উপর, পা মেঝের ঠিক উপরে (নিচে বেরোয় না)
    const x = p.pose === 'hang' ? p.x + 0.06 : p.x;
    m4.compose(pos.set(x, y, p.z), q.setFromAxisAngle(up, p.rot), sc.set(s, s, s));
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    for (const part of ['body', 'hair']) {
      const src = G[part]; if (!src) continue;
      const mat = part === 'hair' ? hm : vars[i % vars.length];
      if (!mat) continue;
      const B = push((p.out ? 'o' : 'i') + part + (part === 'body' ? i % vars.length : ''), part, mat);
      const base = B.P.length / 3;
      for (let k = 0; k < src.P.length; k += 3) {
        v3.set(src.P[k], src.P[k + 1], src.P[k + 2]).applyMatrix4(m4); B.P.push(v3.x, v3.y, v3.z);
        v3.set(src.N[k], src.N[k + 1], src.N[k + 2]).applyMatrix3(nm).normalize(); B.N.push(v3.x, v3.y, v3.z);
      }
      for (let k = 0; k < src.U.length; k++) B.U.push(src.U[k]);
      for (let k = 0; k < src.I.length; k++) B.I.push(src.I[k] + base);
    }
  });
  for (const [key, B] of bins) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.U, 2));
    g.setIndex(B.P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.I, 1) : new THREE.Uint16BufferAttribute(B.I, 1));
    g.computeBoundingSphere();
    (key[0] === 'o' ? hangIn : inG).add(tagMesh(new THREE.Mesh(g, B.mat)));
  }
}

export class BusPax {
  constructor(g) { this.g = g; this.t = 0; setTimeout(() => loadPax(), 1500); }
  update(dt) {
    const g = this.g;
    this.t += dt;
    let buses;
    try { buses = g.allVehicles().filter((v) => v.type === 'bus'); } catch (e) { return; }
    for (const v of buses) {
      // খেলোয়াড় বা ছিনতাইকারী চালালে যাত্রী নেমে গেছে
      const taken = v.driver && v.driver === g.player;
      if (!v.pax && !taken && !v.burnt) { try { v.pax = build(v); v.g.add(v.pax.grp); } catch (e) { v.pax = { grp: null }; } }
      let X = v.pax;
      // আসল মডেল পরে লোড হলে আগের হালকা যাত্রী বদলে আসলগুলো
      if (X && X.grp && !X.real && PAX.geo && REAL.ready && (v.lodNear !== false)) {
        v.g.remove(X.grp); X.grp.traverse((o) => o.geometry && o.geometry.dispose());
        try { v.pax = X = build(v); v.g.add(X.grp); } catch (e) { v.pax = X = { grp: null }; }
      }
      if (!X || !X.grp) continue;
      if (taken || v.burnt || v.hp <= 0) { v.g.remove(X.grp); X.grp.traverse((o) => o.geometry && o.geometry.dispose()); X.grp = null; continue; }
      X.grp.visible = v.lodNear !== false;
      if (!X.grp.visible) continue;
      // বাস চললে যাত্রীরা একটু দোলে; ঝোলা লোকেরা বেশি, ব্রেকে সামনে হেলে
      const sp = Math.abs(v.speed || 0), w = Math.min(1, sp / 8);
      const acc = ((v.speed || 0) - (X.lsp ?? v.speed ?? 0)) / Math.max(dt, 1e-3); X.lsp = v.speed || 0;
      X.pitch = (X.pitch || 0) + ((Math.max(-0.08, Math.min(0.08, -acc * 0.012))) - (X.pitch || 0)) * Math.min(1, dt * 4);
      X.inG.rotation.z = Math.sin(this.t * 2.1 + X.ph) * 0.012 * w;
      if (X.hangG) {
        X.hangG.rotation.z = 0.04 + Math.abs(Math.sin(this.t * 2.6 + X.ph)) * 0.08 * w; // বাইরে (−x) ঝুঁকে দোলে
        X.hangG.rotation.x = X.pitch;
      }
      // হেল্পারের ডাক: ধীর গতিতে ঘন ঘন; চলতে চলতেও মাঝে মাঝে থাপ+ডাক
      if (X.helper && g.say) {
        X.sayT -= dt;
        if (X.sayT <= 0) {
          const d = Math.hypot(v.x - g.player.pos.x, v.z - g.player.pos.z);
          const slow = sp < 5.5;
          X.sayT = slow ? rand(3.5, 7.5) : rand(9, 16);
          if (d < (slow ? 28 : 18)) {
            const rt = v.g.userData.busRoute;
            const line = Math.random() < 0.4 && rt
              ? `${rt[1]}! ${rt[1]}! উঠেন উঠেন!`
              : Math.random() < 0.25 && slow ? pick(['উস্তাদ, বামে প্লাস্টিক!', 'ওস্তাদ, ডাইনে প্লাস্টিক!', 'ওস্তাদ, যান!', 'গেটলক! গেটলক!']) : pick(HELPER);
            g.say(v.g, 'হেল্পার', line, 2.4);
            if (g.sound.slap && (slow || Math.random() < 0.55)) setTimeout(() => g.sound.slap(d), 700 + Math.random() * 400);
            if (g.sound.crowdMurmur && d < 20) g.sound.crowdMurmur(0.35, d);
          }
        }
      }
    }
  }
}
