// নিজের গ্যারেজ: শহরে কয়েকটা শাটারওয়ালা গ্যারেজ। গাড়ি-বাইক সামনে থামিয়ে "গ্যারেজে রাখুন" (G),
// পরে হেঁটে গিয়ে শাটারের সামনে F চাপলে রাখা গাড়ির তালিকা থেকে বের করা। সব গ্যারেজ একই খাতায় (খেলা বন্ধ করলেও থাকে)
import * as THREE from 'three';
import { canvasTex, lam } from './lib3d.js';
import { Vehicle } from './vehicles.js';
import { bn, store, pick } from './utils.js';
import { usesFuel } from './fuel.js';

const SLOTS = 5;
const ALLOWED = new Set(['car', 'police', 'bike', 'cng', 'pickup', 'leguna', 'ambulance', 'easybike', 'autorickshaw', 'rickshaw', 'van']);
const NAMES = ['আপনার গ্যারেজ (মিরপুর-১০)', 'আপনার গ্যারেজ (পাড়ার গলি)', 'আপনার গ্যারেজ (বড় রাস্তা)'];

function shutterTex() {
  return canvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9aa1a6'); g.addColorStop(1, '#6f767b');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, y, w, 2); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, y + 3, w, 1); }
    c.fillStyle = '#3d4246'; c.fillRect(w / 2 - 18, h - 26, 36, 10); // তালা
    c.fillStyle = 'rgba(40,40,40,0.55)'; c.font = '700 26px "Hind Siliguri", sans-serif'; c.textAlign = 'center';
    c.fillText('গাড়ি রাখা নিষেধ*', w / 2, 60); c.font = '600 14px sans-serif'; c.fillText('*মালিক ছাড়া', w / 2, 80);
  });
}
function boardTex() {
  return canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#ffc107'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1a1a'; c.fillRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#ffc107'; c.font = '800 60px "Anek Bangla", "Hind Siliguri", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('🔧 নিজের গ্যারেজ', w / 2, h / 2 + 2);
  });
}

export class Garage {
  constructor(g) {
    this.g = g; this.list = [];
    this.stored = this.load();
    try { this.place(); } catch (e) { console.warn('garage', e); }
  }
  load() { try { const a = JSON.parse(store('sp_garage') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  save() { store('sp_garage', JSON.stringify(this.stored)); }
  place() {
    const g = this.g, M = g.map, W = g.world, D = g.dress;
    const sp = M.spawn, Bo = M.bounds, B = [Bo.x0, Bo.x1, Bo.z0, Bo.z1];
    const busy = new Set(((g.property && g.property.homes) || []).map((h) => h.b));
    const targets = [{ x: sp.x, z: sp.z }];
    // আরও দুইটা: শুরুর জায়গা থেকে দূরে, দুই দিকে
    const cx = (B[0] + B[1]) / 2, cz = (B[2] + B[3]) / 2;
    targets.push({ x: cx + (sp.x > cx ? -1 : 1) * 380, z: cz - 120 }, { x: sp.x + (sp.x > cx ? -1 : 1) * 200, z: cz + 260 });
    const fuelNear = (x, z) => g.fuel && g.fuel.stations.some((s) => Math.hypot(s.bx - x, s.bz - z) < 30);
    for (let i = 0; i < targets.length; i++) {
      const T = targets[i];
      const cands = M.buildings.filter((b) => b.door && !b.name && !b.landmark && !b.civic && !busy.has(b) && b.area > 70 && b.area < 900)
        .map((b) => [Math.hypot(b.door.x - T.x, b.door.z - T.z), b]).filter((q) => q[0] < 420).sort((a, b) => a[0] - b[0]);
      for (const [, b] of cands) {
        const s = M.segments[b.seg];
        if (!s || s.width < 5.5 || s.len < 24) continue;
        const fx = -b.face.x, fz = -b.face.z; // রাস্তা থেকে বিল্ডিংয়ের দিকে
        // শাটার: দরজা থেকে বিল্ডিংয়ের দেয়াল পর্যন্ত
        let wd = -1;
        for (let d = 0.6; d < 6; d += 0.2) if (W.blocked(b.door.x + fx * d, 1, b.door.z + fz * d)) { wd = d; break; }
        if (wd < 0) continue;
        const bx = b.door.x - fx * 2.4, bz = b.door.z - fz * 2.4; // গাড়ি থামার জায়গা: কিনারার লেন
        if (!W.onRoad(bx, bz, 0) || (W.otherRoad && W.otherRoad(bx, bz, s, 1)) || fuelNear(bx, bz)) continue;
        if (this.list.some((q) => Math.hypot(q.bx - bx, q.bz - bz) < 150)) continue;
        if (D && !D.free(b.door.x, b.door.z, 0.8)) continue;
        const wx = b.door.x + fx * (wd - 0.06), wz = b.door.z + fz * (wd - 0.06);
        const G = { name: NAMES[this.list.length] || 'আপনার গ্যারেজ', b, s, fx, fz, wx, wz, bx, bz, dx: b.door.x, dz: b.door.z };
        if (D) D.mark(b.door.x, b.door.z, 2);
        this.build(G);
        this.list.push(G);
        break;
      }
    }
  }
  build(G) {
    const grp = new THREE.Group();
    grp.position.set(G.wx, 0, G.wz);
    grp.rotation.y = Math.atan2(-G.fx, -G.fz); // গ্রুপের +z = রাস্তার দিকে
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.noDent = true; grp.add(m); return m; };
    add(new THREE.PlaneGeometry(3.4, 2.7), new THREE.MeshLambertMaterial({ map: shutterTex() }), 0, 1.5, 0.02);
    add(new THREE.BoxGeometry(3.8, 0.35, 0.3), lam(0x5a5f63), 0, 3.0, 0.1); // শাটারের বাক্স
    for (const x of [-1.8, 1.8]) add(new THREE.BoxGeometry(0.16, 2.9, 0.16), lam(0x4a4f53), x, 1.45, 0.08);
    add(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshLambertMaterial({ map: boardTex() }), 0, 3.55, 0.18);
    // মেঝেতে হলুদ দাগ (গাড়ি রাখার জায়গা বোঝাতে)
    const stripe = new THREE.MeshBasicMaterial({ color: 0xffc107 });
    for (const x of [-1.6, 1.6]) { const m = add(new THREE.PlaneGeometry(0.12, 1.8), stripe, x, 0.18, 1.0); m.rotation.x = -Math.PI / 2; }
    this.g.scene.add(grp);
    G.grp = grp;
  }
  markers() { return this.list.map((G) => ({ x: G.bx, z: G.bz, color: '#ff8f00', label: '🔧', r: 7, noClamp: true, name: `${G.name} · ${bn(this.stored.length)}/${bn(SLOTS)}` })); }
  // ড্রাইভের সময় গ্যারেজের সামনে থামলে
  action() {
    const g = this.g, P = g.player, v = P.vehicle;
    if (P.state !== 'drive' || !v || Math.abs(v.speed) > 1) return null;
    const G = this.list.find((q) => Math.hypot(v.x - q.bx, v.z - q.bz) < 6);
    if (!G) return null;
    return { label: 'গ্যারেজে রাখুন', text: `${v.spec.name} গ্যারেজে রাখুন (${bn(this.stored.length)}/${bn(SLOTS)} জায়গা ভরা)`, run: () => this.storeVeh(v, G) };
  }
  storeVeh(v, G) {
    const g = this.g, P = g.player;
    if (!ALLOWED.has(v.type) || v.dd) { g.ui.toast(`${v.spec.name} এই গ্যারেজে ঢুকবে না`, 'bad'); return; }
    if (g.law && g.law.stars > 0) { g.ui.toast('পুলিশ পিছনে! আগে পালান, তারপর গ্যারেজে রাখুন', 'bad'); return; }
    if (v.wrecked || v.burnt || v.hp <= 0) { g.ui.toast('ভাঙা গাড়ি রাখা যাবে না, আগে মেরামত করুন', 'bad'); return; }
    if (v.passenger || (g.jobs && g.jobs.active && g.jobs.active.type === 'ride')) { g.ui.toast('যাত্রী নিয়ে গ্যারেজে রাখা যাবে না', 'bad'); return; }
    if (g.missions && g.missions.active && g.missions.active.mv === v) { g.ui.toast('মিশনের গাড়ি গ্যারেজে রাখা যাবে না', 'bad'); return; }
    if (g.work && g.work.job) { g.ui.toast('কাজের গাড়ি গ্যারেজে রাখা যাবে না', 'bad'); return; }
    if (this.stored.length >= SLOTS) { g.ui.toast(`গ্যারেজ ভরা (${bn(SLOTS)}টা)। আগে একটা বের করুন`, 'bad'); return; }
    this.stored.push({ type: v.type, color: v.color, hp: Math.round(v.hp), fuel: usesFuel(v) && v.fuel !== undefined ? +v.fuel.toFixed(3) : null, name: v.spec.name, stolen: !!v.stolen });
    this.save();
    g.sound.door();
    P.exit(g);
    // গ্যারেজের সামনে ফুটপাতে নামানো
    P.place(G.dx, G.dz, Math.atan2(G.fx, G.fz));
    g.scene.remove(v.g);
    const i = g.vehicles.indexOf(v); if (i >= 0) g.vehicles.splice(i, 1);
    if (g.traffic && g.traffic.cars) { const c = g.traffic.cars.find((q) => q.v === v); if (c) c.dead = true; }
    g.ui.toast(`${v.spec.name} গ্যারেজে রাখলেন${v.stolen ? ' (চুরির গাড়ি এখন আপনার!)' : ''}`, 'good');
    g.updateTouchMode && g.updateTouchMode();
  }
  // হেঁটে শাটারের সামনে
  near() {
    const P = this.g.player;
    if (P.state !== 'foot') return null;
    return this.list.find((G) => Math.hypot(P.pos.x - G.dx, P.pos.z - G.dz) < 2.6) || null;
  }
  prompt(G, key) { return `${key}: গ্যারেজ খুলুন (${bn(this.stored.length)}টা যানবাহন রাখা)`; }
  open(G) {
    const g = this.g;
    if (!this.stored.length) { g.ui.toast('গ্যারেজ খালি। গাড়ি চালিয়ে এনে সামনে থামিয়ে "গ্যারেজে রাখুন" চাপুন', ''); return; }
    const items = this.stored.map((s, i) => ({
      label: `${s.name}${s.stolen ? ' (চুরির)' : ''}`,
      note: `অবস্থা ${bn(Math.round(Math.min(100, s.hp / (s.type === 'bike' ? 60 : 100) * 100)))}%${s.fuel !== null ? ` · তেল ${bn(Math.round(s.fuel * 100))}%` : ''} · বের করুন`,
      act: () => this.take(G, i),
    }));
    g.interiors.dialog(G.name, `রাখা আছে ${bn(this.stored.length)}/${bn(SLOTS)}টা। কোনটা বের করবেন?`, items);
  }
  take(G, i) {
    const g = this.g, s = this.stored[i];
    if (!s) return;
    // সামনের লেনে কিছু থাকলে
    const busy = g.vehicles.some((v) => Math.hypot(v.x - G.bx, v.z - G.bz) < 3.5) || (g.traffic && g.traffic.cars.some((c) => Math.hypot(c.v.x - G.bx, c.v.z - G.bz) < 3.5));
    if (busy) { g.ui.toast('গ্যারেজের সামনে গাড়ি দাঁড়িয়ে, একটু পরে চেষ্টা করুন', 'bad'); return; }
    const S = G.s;
    // বাম দিকে চলার লেন: গ্যারেজ রাস্তার যে পাশে, সেই পাশের দিক ধরে মুখ
    const lat = (G.bx - S.ax) * S.dir.z - (G.bz - S.az) * S.dir.x;
    const dir = lat >= 0 ? 1 : -1;
    const yaw = Math.atan2(-S.dir.x * dir, -S.dir.z * dir);
    let v;
    try { v = new Vehicle(g.scene, s.type, { x: G.bx, z: G.bz, yaw, dynWheels: true, owned: true, color: s.color }); } catch (e) { g.ui.toast('গাড়ি বের করা গেল না', 'bad'); return; }
    if (s.hp) v.hp = Math.min(v.maxHp, s.hp);
    if (s.fuel !== null && s.fuel !== undefined) v.fuel = s.fuel;
    g.vehicles.push(v);
    this.stored.splice(i, 1);
    this.save();
    g.sound.door();
    g.ui.toast(`${s.name} বের করলেন। ${g.player.state === 'foot' ? 'উঠে চালান!' : ''}`, 'good');
    if (g.say && pick) { /* শুধু শব্দ */ }
  }
}
