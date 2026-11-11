// ফুটপাতের হকার: ঝালমুড়ি, ফুচকা, ডাব, চায়ের টং — কিনে খাওয়া যায় (স্বাস্থ্য বাড়ে), গাড়ির ধাক্কায় দোকান ভেঙে ছিটকে পড়ে
// অক্ষত দোকান = একটা মেশ (রং ভার্টেক্সে); ভাঙলে তখনই আলাদা টুকরো হয়ে উড়ে যায়, কিছুক্ষণ পরে নতুন দোকান বসে
import * as THREE from 'three';
import { makeRig, setPose } from './rig.js';
import { pick, rand, clamp, bn } from './utils.js';
import { FOOT } from './mapgen.js';

const MOBILE = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const VC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const KINDS = {
  muri: { name: 'ঝালমুড়ি', price: 20, hp: 12, line: ['ঝালমুড়ি! ঝাল বেশি না কম?', 'মামা, সরিষার তেল দিমু?', 'বিশ টাকা, বিশ টাকা! মুড়ি নেন!', 'দেখে নে বাইচ্চা নেন, ঝালমুড়ি!'], eat: 'ঝালমুড়ি খেলেন, ঝালে চোখে পানি!' },
  fuchka: { name: 'ফুচকা', price: 50, hp: 18, line: ['ফুচকা! টক বেশি দিমু?', 'আপা-ভাই, গরম গরম চটপটি!', 'পাঁচটা ৫০, নেন নেন!', 'চটপটি! ফুচকা! আসেন!'], eat: 'ফুচকা খেলেন, টকে মন ভালো!' },
  dab: { name: 'ডাব', price: 80, hp: 25, line: ['ডাব! ঠান্ডা ডাব!', 'মিষ্টি পানি, খাইয়া দেখেন!', 'ডাব ৮০ টাকা, কাটমু?', 'গরমে ডাব ছাড়া চলে? আসেন!'], eat: 'ডাবের পানি খেলেন, শরীর ঠান্ডা!' },
  tea: { name: 'চা', price: 10, hp: 8, line: ['চা হইবো, দুধ চা না রং চা?', 'মামা, বিস্কুট দিমু?', 'দশ টাকার চা, গরম গরম!', 'চা-সিঙ্গারা আছে, বসেন!'], eat: 'এক কাপ গরম চা খেলেন!' },
};
const CRY = ['আমার দোকান! হায় হায়!', 'ওরে বাবা রে! সব শেষ!', 'চোখে দেখেন না নাকি?!', 'ধর ধর! পালাইতেছে!'];

// ---------- অংশ: [আকার, রং, অবস্থান, ঘোরা] — অক্ষত থাকতে জোড়া, ভাঙলে আলাদা ----------
const C = (h) => new THREE.Color(h);
function box(w, h, d, col, x, y, z, ry = 0) { return { g: new THREE.BoxGeometry(w, h, d), col, p: [x, y, z], r: [0, ry, 0] }; }
function cyl(r0, r1, h, col, x, y, z, seg = 10, rx = 0, rz = 0) { return { g: new THREE.CylinderGeometry(r0, r1, h, seg), col, p: [x, y, z], r: [rx, 0, rz] }; }
function ball(r, col, x, y, z) { return { g: new THREE.SphereGeometry(r, 7, 5), col, p: [x, y, z], r: [0, 0, 0] }; }
function wheelPair(parts, z, r = 0.3) { for (const x of [-0.62, 0.62]) parts.push(cyl(r, r, 0.07, 0x222222, x, r, z, 12, 0, Math.PI / 2)); }
function design(kind) {
  const P = [], wood = 0x8a5a2b, steel = 0xb8bcc0, tin = 0x9aa3a8;
  if (kind === 'muri') {
    // কাঠের ঠেলাগাড়ি, উপরে কাচের বাক্সে মুড়ি, টিনের পাত্র, লাল কাপড়
    P.push(box(1.3, 0.08, 0.8, wood, 0, 0.82, 0)); wheelPair(P, 0); P.push(box(0.06, 0.85, 0.06, wood, 0, 0.4, -0.38));
    P.push(box(0.8, 0.5, 0.5, 0xdff2f7, -0.15, 1.12, 0)); P.push(box(0.76, 0.3, 0.46, 0xe8c27a, -0.15, 1.02, 0));
    P.push(cyl(0.18, 0.15, 0.22, steel, 0.42, 0.97, 0.1)); P.push(cyl(0.1, 0.1, 0.18, 0xf2c230, 0.42, 0.97, -0.22));
    P.push(box(1.32, 0.12, 0.82, 0xc62828, 0, 0.73, 0)); P.push(box(0.04, 0.9, 0.04, wood, 0.6, 1.3, 0.36)); P.push(box(0.7, 0.03, 0.6, 0xffd400, 0.35, 1.76, 0.2));
  } else if (kind === 'fuchka') {
    // ফুচকার গাড়ি: বড় কাচের বাক্সে ফুচকা, পাশে টক-পানির হাঁড়ি, ছাতা
    P.push(box(1.4, 0.08, 0.85, wood, 0, 0.8, 0)); wheelPair(P, 0.1);
    P.push(box(0.9, 0.55, 0.55, 0xe8f4f8, -0.1, 1.12, 0)); for (let i = 0; i < 10; i++) P.push(ball(0.07, 0xd9a441, -0.45 + (i % 5) * 0.17, 0.98 + Math.floor(i / 5) * 0.13, -0.05 + (i % 2) * 0.1));
    P.push(cyl(0.2, 0.16, 0.3, 0x5d4037, 0.5, 1.0, 0)); P.push(cyl(0.12, 0.12, 0.16, steel, 0.5, 1.2, 0.25));
    P.push(box(0.04, 1.3, 0.04, wood, 0.55, 1.45, -0.35)); P.push(cyl(0.02, 0.85, 0.25, 0x1565c0, 0.55, 2.15, -0.35, 8));
  } else if (kind === 'dab') {
    // ডাবের ভ্যান: সবুজ ডাবের স্তূপ, দা
    P.push(box(1.2, 0.08, 1.5, wood, 0, 0.72, 0)); wheelPair(P, 0.5, 0.32); P.push(cyl(0.32, 0.32, 0.06, 0x222222, 0, 0.32, -0.7, 12, 0, Math.PI / 2));
    for (let i = 0; i < 16; i++) P.push(ball(0.15, i % 4 ? 0x5d8a2a : 0x7aa33a, -0.4 + (i % 4) * 0.27, 0.86 + Math.floor(i / 8) * 0.2, -0.45 + (Math.floor(i / 4) % 2) * 0.32 + (i > 7 ? 0.15 : 0)));
    P.push(box(0.05, 0.03, 0.3, steel, 0.5, 0.8, 0.6));
  } else {
    // চায়ের টং: কাঠের বাক্স, টিনের ছাউনি, কেটলি, বয়াম, বেঞ্চ
    P.push(box(1.3, 0.95, 0.8, wood, 0, 0.48, 0)); P.push(box(1.5, 0.05, 1.2, tin, 0, 2.0, 0.1));
    for (const sx of [-0.68, 0.68]) P.push(box(0.05, 1.05, 0.05, wood, sx, 1.47, -0.36));
    P.push(cyl(0.15, 0.19, 0.27, steel, -0.35, 1.09, 0)); for (let i = 0; i < 4; i++) P.push(cyl(0.07, 0.07, 0.2, [0xe8202a, 0xffd400, 0x1a9e3f, 0x1d63c8][i], 0.1 + i * 0.16, 1.06, -0.1, 8));
    P.push(box(1.5, 0.07, 0.33, wood, 0, 0.42, 0.95)); for (const sx of [-0.65, 0.65]) P.push(box(0.06, 0.4, 0.28, wood, sx, 0.2, 0.95));
  }
  return P;
}
// অংশগুলো জোড়া: একটা জ্যামিতি, রং ভার্টেক্সে
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    m.compose(v.set(...p.p), q.setFromEuler(e.set(...p.r)), s);
    const nm = new THREE.Matrix3().getNormalMatrix(m), c = C(p.col);
    const P = g.attributes.position, N = g.attributes.normal, t = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      t.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(t.x, t.y, t.z);
      t.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(t.x, t.y, t.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const TALK = ['মামা, আরেক কাপ দেন!', 'আজকে জ্যাম অনেক বেশি', 'বৃষ্টি নামবো মনে হয়', 'চিনি একটু কম দিয়েন', 'খেলা দেখছিলা কালকে?', 'অফিসে দেরি হইয়া গেল'];
let STEAM_TEX = null;
function puffTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DEB_MATS = new Map();
const debMat = (c) => { if (!DEB_MATS.has(c)) DEB_MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return DEB_MATS.get(c); };

export class Hawkers {
  constructor(g) {
    this.g = g; this.list = []; this.debris = []; this.t = 0;
    try { this.place(); } catch (e) { console.warn('hawkers', e); }
  }
  place() {
    const g = this.g, M = g.map, W = g.world, D = g.dress;
    const max = MOBILE ? 22 : 36, kinds = ['muri', 'fuchka', 'dab', 'tea', 'muri', 'tea'];
    const segs = M.segments.filter((s) => s.main && s.len > 30).sort(() => Math.random() - 0.5);
    for (const s of segs) {
      if (this.list.length >= max) break;
      const nx = -s.dir.z, nz = s.dir.x;
      for (let tries = 0; tries < 3 && this.list.length < max; tries++) {
        const t = rand(8, s.len - 8), side = Math.random() < 0.5 ? -1 : 1;
        const off = side * (s.width / 2 + Math.min(FOOT - 0.9, 1.1));
        const x = s.ax + s.dir.x * t + nx * off, z = s.az + s.dir.z * t + nz * off;
        if ((D && !D.free(x, z, 1.6)) || W.onRoad(x, z, 0.15) || (W.otherRoad && W.otherRoad(x, z, s, 1.5)) || W.blocked(x, 1, z)) continue;
        if (this.list.some((h) => Math.hypot(h.x - x, h.z - z) < 25)) continue;
        if (D) D.mark(x, z, 1.6);
        const face = Math.atan2(-nx * side, -nz * side); // সামনে রাস্তার দিকে
        this.list.push({ kind: kinds[this.list.length % kinds.length], x, z, ry: face, side, broken: false, respawn: 0 });
        break;
      }
    }
    for (const h of this.list) { try { this.build(h); } catch (e) { h.dead = true; console.warn('hawker build', e && e.message); } }
    this.list = this.list.filter((h) => !h.dead && h.mesh);
  }
  build(h) {
    const g = this.g;
    h.parts = design(h.kind);
    h.mesh = new THREE.Mesh(mergeParts(h.parts), VC_MAT);
    h.mesh.position.set(h.x, 0.16, h.z); h.mesh.rotation.y = h.ry;
    h.mesh.castShadow = true; h.mesh.userData.noDent = true;
    g.scene.add(h.mesh);
    // বিক্রেতা: দোকানের পিছনে (রাস্তার উল্টো দিকে) দাঁড়িয়ে
    const back = 0.75;
    h.vx = h.x - Math.sin(h.ry) * back; h.vz = h.z - Math.cos(h.ry) * back;
    h.vendor = makeRig({ kurta: Math.random() < 0.5, cap: Math.random() < 0.4 ? 0xffffff : undefined, shirt: pick([0x6d4c41, 0x546e7a, 0x8d6e63, 0x37474f, 0x1565c0]) });
    h.vendor.root.position.set(h.vx, 0.16, h.vz); h.vendor.root.rotation.y = h.ry + Math.PI; // দোকান-রাস্তার দিকে মুখ (রিগের সামনে −z)
    g.scene.add(h.vendor.root);
    // চায়ের টং: বেঞ্চে ১-২ জন খদ্দের চা খায়, কেটলি থেকে ধোঁয়া ওঠে
    if (h.kind === 'tea') {
      const c = Math.cos(h.ry), sn = Math.sin(h.ry), W = (lx, lz) => [h.x + lx * c + lz * sn, h.z - lx * sn + lz * c];
      h.cust = [];
      for (const lx of (Math.random() < 0.5 ? [-0.4, 0.4] : [Math.random() < 0.5 ? -0.4 : 0.4])) {
        const r = makeRig({ kurta: Math.random() < 0.4, ...(Math.random() < 0.3 ? { style: 'lungi' } : {}), cap: Math.random() < 0.2 ? 0xffffff : undefined, shirt: pick([0xf5f5f5, 0x90a4ae, 0x6d4c41, 0x1565c0, 0x2e7d32, 0x8d6e63]) });
        const [x, z] = W(lx, 0.98);
        r.root.position.set(x, 0.16, z); r.root.rotation.y = h.ry; // দোকানের দিকে মুখ
        g.scene.add(r.root);
        h.cust.push(r);
      }
      const [kx, kz] = W(-0.35, 0);
      h.steam = { x: kx, z: kz, y: 1.4, puffs: [] };
    }
    h.broken = false; h.sayT = rand(4, 12); h.flee = 0;
  }
  // খেলোয়াড়ের কাছের দোকান (কেনার জন্য)
  near() {
    const P = this.g.player;
    if (P.state !== 'foot') return null;
    let best = null, bd = 2.4;
    for (const h of this.list) { if (h.broken) continue; const d = Math.hypot(h.x - P.pos.x, h.z - P.pos.z); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  prompt(h, key) { const K = KINDS[h.kind]; return `${key}: ${K.name} কিনুন (৳${bn(K.price)}) · স্বাস্থ্য +${bn(K.hp)}`; }
  buy(h) {
    const g = this.g, K = KINDS[h.kind], P = g.player;
    if (g.money < K.price) { g.ui.toast(`${K.name} কিনতে ৳${bn(K.price)} লাগবে`, 'bad'); return; }
    g.money -= K.price; g.save && g.save();
    P.health = Math.min(100, (P.health || 0) + K.hp);
    g.sound && g.sound.money && g.sound.money();
    g.ui.toast(`${K.eat} (−৳${bn(K.price)}, স্বাস্থ্য +${bn(K.hp)})`, 'money');
    if (g.say && h.vendor) g.say(h.vendor.root, `${K.name}ওয়ালা`, pick(['খাইয়া দোয়া দিয়েন!', 'আবার আইসেন মামা!', 'ধন্যবাদ, আবার আসবেন!']), 2);
  }
  // গাড়ির ধাক্কায় দোকান ভাঙা: টুকরোগুলো গাড়ির গতির দিকে ছিটকে পড়ে
  clearTea(h) {
    for (const r of h.cust || []) this.g.scene.remove(r.root);
    for (const p of (h.steam && h.steam.puffs) || []) this.g.scene.remove(p.s);
    h.cust = null; h.steam = null;
  }
  // কেটলির ধোঁয়া: কয়েকটা নরম সাদা ছোপ উপরে উঠে মিলিয়ে যায়
  steamStep(h, dt) {
    const S = h.steam, g = this.g;
    if (!STEAM_TEX) STEAM_TEX = puffTex();
    S.t = (S.t || 0) - dt;
    if (S.t <= 0 && S.puffs.length < 5) {
      S.t = rand(0.35, 0.7);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: STEAM_TEX, transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.position.set(S.x + rand(-0.03, 0.03), S.y, S.z + rand(-0.03, 0.03)); sp.scale.setScalar(0.12);
      g.scene.add(sp); S.puffs.push({ s: sp, life: 0 });
    }
    for (const p of [...S.puffs]) {
      p.life += dt;
      p.s.position.y += dt * 0.35; p.s.position.x += Math.sin(p.life * 2 + p.s.id) * dt * 0.05;
      p.s.scale.setScalar(0.12 + p.life * 0.35); p.s.material.opacity = Math.max(0, 0.5 - p.life * 0.28);
      if (p.life > 1.8) { g.scene.remove(p.s); p.s.material.dispose(); S.puffs.splice(S.puffs.indexOf(p), 1); }
    }
  }
  smash(h, v) {
    const g = this.g;
    // খদ্দেররা লাফিয়ে উঠে দৌড়
    for (const r of h.cust || []) { r.flee = 3; }
    h.broken = true; h.respawn = rand(90, 150);
    g.scene.remove(h.mesh); h.mesh.geometry.dispose();
    const sp = Math.abs(v.speed), f = v.fwd ? v.fwd() : { x: 0, z: 0 }, dir = Math.sign(v.speed) || 1;
    const c = Math.cos(h.ry), s = Math.sin(h.ry);
    for (const p of h.parts) {
      if (this.debris.length > 220) break;
      const m = new THREE.Mesh(p.g, debMat(p.col));
      const lx = p.p[0], ly = p.p[1], lz = p.p[2];
      m.position.set(h.x + lx * c + lz * s, 0.16 + ly, h.z - lx * s + lz * c);
      m.rotation.set(p.r[0], h.ry + p.r[1], p.r[2]); m.castShadow = true;
      g.scene.add(m);
      const k = rand(0.35, 0.8) * sp;
      this.debris.push({ m, vx: f.x * dir * k + rand(-1.5, 1.5), vy: rand(1.5, 3.5) + sp * 0.12, vz: f.z * dir * k + rand(-1.5, 1.5), wx: rand(-6, 6), wz: rand(-6, 6), life: rand(18, 28), rest: false });
    }
    g.sound && (g.sound.crash ? g.sound.crash(Math.min(0.6, sp * 0.04)) : null);
    if (h.kind === 'muri' || h.kind === 'fuchka') g.sound && g.sound.sfx && g.sound.sfx('glass', 0.4);
    g.shake = Math.max(g.shake || 0, 0.15);
    v.speed *= 0.82;
    if (v.damage) v.damage(3, v === (g.player && g.player.vehicle) ? 'player' : null);
    // বিক্রেতা লাফিয়ে সরে চিৎকার করে
    h.flee = 3.5;
    if (g.say && h.vendor) g.say(h.vendor.root, `${KINDS[h.kind].name}ওয়ালা`, pick(CRY), 2.6);
    if (v === (g.player && g.player.vehicle) && g.ui) g.ui.toast(`${KINDS[h.kind].name}ওয়ালার দোকান উড়িয়ে দিলেন!`, 'bad');
  }
  update(dt) {
    const g = this.g; this.t += dt;
    const P = g.player, px = P.pos.x, pz = P.pos.z;
    let vs = null;
    for (const h of this.list) {
      const d = Math.hypot(h.x - px, h.z - pz);
      if (h.broken) {
        if (h.vendor) {
          if (h.flee > 0) { // সরে গিয়ে দাঁড়িয়ে হাত তুলে চিৎকার
            h.flee -= dt;
            const r = h.vendor.root; r.position.x += Math.sin(h.ry + Math.PI) * dt * 2.2; r.position.z += Math.cos(h.ry + Math.PI) * dt * 2.2;
            setPose(h.vendor, 'run', dt, 4, 10);
          } else setPose(h.vendor, d < 40 ? 'angry' : 'idle', dt, 0, 8);
        }
        for (const r of h.cust || []) {
          if (r.flee > 0) { r.flee -= dt; r.root.rotation.y = h.ry + Math.PI; r.root.position.x += Math.sin(h.ry) * dt * 3; r.root.position.z += Math.cos(h.ry) * dt * 3; setPose(r, 'run', dt, 4, 10); }
          else setPose(r, 'angry', dt, 0, 8);
        }
        h.respawn -= dt;
        if (h.respawn <= 0 && d > 90) { if (h.vendor) { g.scene.remove(h.vendor.root); if (h.vendor.dispose) h.vendor.dispose(); } this.clearTea(h); this.build(h); }
        continue;
      }
      const vis = d < 120; h.mesh.visible = vis;
      if (h.vendor) {
        h.vendor.root.visible = d < 55;
        if (h.vendor.root.visible) {
          setPose(h.vendor, 'idle', dt, 0, 6);
          if (h.cust) for (const r of h.cust) { r.root.visible = true; setPose(r, 'sit', dt, 0, 6); }
          if (h.steam && d < 40) { try { this.steamStep(h, dt); } catch (e) { h.steam = null; } } // ধোঁয়া না হলেও দোকান চলে
          // খদ্দেরের আড্ডা
          if (h.cust && h.cust.length && d < 14 && Math.random() < dt * 0.06 && g.say) g.say(pick(h.cust).root, 'খদ্দের', pick(TALK), 2.4);
          // ডাক: কাছে এলে ঘন ঘন (ফুটপাতের হকার)
          h.sayT -= dt;
          if (h.sayT <= 0) {
            h.sayT = rand(4.5, 9);
            if (d < 14 && P.state === 'foot' && g.say) {
              g.say(h.vendor.root, `${KINDS[h.kind].name}ওয়ালা`, pick(KINDS[h.kind].line), 2.2);
              if (g.sound.crowdMurmur) g.sound.crowdMurmur(0.3, d);
            }
          }
        }
      }
      if (d > 140) continue;
      // খেলোয়াড় হেঁটে দোকানের ভিতর দিয়ে যায় না
      if (P.state === 'foot' && d < 0.95) { const k = (0.95 - d) / (d || 1); P.pos.x += (px - h.x) * k; P.pos.z += (pz - h.z) * k; }
      // গাড়ির ধাক্কা
      vs = vs || g.allVehicles();
      for (const v of vs) {
        if (Math.abs(v.speed || 0) < 2.2 || v.air || v.boat || (v.y || 0) > 1) continue;
        const dv = Math.hypot(v.x - h.x, v.z - h.z);
        if (dv > 8) continue;
        const circ = v.circles ? v.circles() : [{ x: v.x, z: v.z, r: 1 }];
        if (circ.some((c) => Math.hypot(c.x - h.x, c.z - h.z) < c.r + 0.75)) { this.smash(h, v); break; }
      }
    }
    // টুকরোর পড়া, লাফানো, থামা
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const b = this.debris[i];
      b.life -= dt;
      if (b.life <= 0) { g.scene.remove(b.m); this.debris.splice(i, 1); continue; }
      if (b.rest) continue;
      b.vy -= 9.8 * dt;
      b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
      b.m.rotation.x += b.wx * dt; b.m.rotation.z += b.wz * dt;
      if (b.m.position.y < 0.2) {
        b.m.position.y = 0.2; b.vy *= -0.3; b.vx *= 0.6; b.vz *= 0.6; b.wx *= 0.5; b.wz *= 0.5;
        if (Math.abs(b.vy) < 0.6 && Math.hypot(b.vx, b.vz) < 0.4) b.rest = true;
      }
    }
  }
}
