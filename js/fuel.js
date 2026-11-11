// জ্বালানি আর পেট্রোল পাম্প: নিজে চালানো গাড়ি-বাইক-সিএনজিতে তেল/গ্যাস কমে; শেষ হলে খুব আস্তে চলে (ঠেলে নেওয়ার মতো)
// পাম্প বসানো আসল ম্যাপের ফিলিং স্টেশনের জায়গায় (OSM), নাম বানানো। পাম্পের সামনে থামলে "তেল ভরুন"
import * as THREE from 'three';
import { canvasTex, lam } from './lib3d.js';
import { makeRig, setPose } from './rig.js';
import { bn, rand, pick } from './utils.js';
import { bnGroup } from './ui.js';

// জ্বালানির ধরন আর দাম (প্রতি লিটার/ঘনমিটার, নভেম্বর ২০২৬-এর সরকারি দামের কাছাকাছি)
export const FUELS = {
  octane: { name: 'অকটেন', unit: 'লিটার', price: 165 },
  diesel: { name: 'ডিজেল', unit: 'লিটার', price: 135 },
  cng: { name: 'সিএনজি গ্যাস', unit: 'ঘনমিটার', price: 43 },
};
// কোন যানবাহনে কী জ্বালানি, ট্যাংক কত, এক ট্যাংকে কত মিটার যায় (খেলার মাপে ছোট শহর, তাই দূরত্ব কম)
const TANK = {
  car: { f: 'octane', cap: 40, range: 7000 },
  police: { f: 'octane', cap: 45, range: 6500 },
  bike: { f: 'octane', cap: 10, range: 9000 },
  cng: { f: 'cng', cap: 8, range: 6000 },
  leguna: { f: 'cng', cap: 12, range: 6000 },
  truck: { f: 'diesel', cap: 120, range: 6000 },
  pickup: { f: 'diesel', cap: 60, range: 6500 },
};
export const usesFuel = (v) => !!(v && TANK[v.type] && !v.spec.air && !v.boat);
export function fuelOf(v) {
  if (!usesFuel(v)) return null;
  if (v.fuel === undefined) v.fuel = v.owned ? rand(0.55, 0.95) : rand(0.3, 0.85);
  return v.fuel;
}
const NAMES = ['শাপলা ফিলিং স্টেশন', 'দোয়েল সিএনজি স্টেশন', 'কাঁঠালতলা পেট্রোল পাম্প', 'নদী-নালা ফিলিং স্টেশন', 'লাল-সবুজ সিএনজি', 'মিরপুর এনার্জি পয়েন্ট', 'জ্যামমুক্ত ফিলিং স্টেশন', 'ভরসা পেট্রোল পাম্প', 'ফুলটাংকি সিএনজি'];
const LINES = ['মামা, কত টাকার দিমু?', 'ফুল করমু?', 'ইঞ্জিন বন্ধ করেন, মামা!', 'আজকে লাইন কম, ভাগ্য ভালো!', 'গ্যাসের চাপ কম, একটু টাইম লাগবো'];

function fasciaTex(name) {
  return canvasTex(1024, 96, (c, w, h) => {
    c.fillStyle = '#0b7a3e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffd400'; c.fillRect(0, h - 12, w, 12);
    c.fillStyle = '#ffffff'; c.font = '800 54px "Anek Bangla", "Hind Siliguri", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⛽ ' + name, w / 2, h / 2 - 4);
  });
}
function priceTex(name) {
  return canvasTex(256, 320, (c, w, h) => {
    c.fillStyle = '#0b7a3e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.fillRect(10, 70, w - 20, h - 80);
    c.fillStyle = '#ffd400'; c.font = '800 34px "Anek Bangla", "Hind Siliguri", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(name.split(' ')[0], w / 2, 36);
    c.textAlign = 'left';
    let y = 112;
    for (const k of ['octane', 'diesel', 'cng']) {
      const F = FUELS[k];
      c.fillStyle = '#1a1a1a'; c.font = '700 28px "Hind Siliguri", sans-serif'; c.fillText(F.name.replace(' গ্যাস', ''), 24, y);
      c.fillStyle = '#c62828'; c.font = '800 40px "Anek Bangla", sans-serif'; c.textAlign = 'right'; c.fillText('৳' + bn(F.price), w - 22, y + 2); c.textAlign = 'left';
      y += 74;
    }
  });
}
function pumpTex() {
  return canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0b7a3e'; c.fillRect(0, 0, w, 40); c.fillRect(0, h - 50, w, 50);
    c.fillStyle = '#111'; c.fillRect(16, 60, w - 32, 56);
    c.fillStyle = '#ff5a2a'; c.font = '700 30px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('000.00', w / 2, 88);
    c.fillStyle = '#ffd400'; c.fillRect(20, 140, w - 40, 30);
    c.fillStyle = '#333'; c.font = '700 20px sans-serif'; c.fillText('OCTANE', w / 2, 156);
  });
}

export class Fuel {
  constructor(g) {
    this.g = g; this.stations = []; this.fill = null; this.warned = new WeakSet();
    try { this.place(); } catch (e) { console.warn('fuel stations', e); }
  }
  place() {
    const g = this.g, M = g.map, W = g.world, D = g.dress;
    const pts = [];
    for (const q of (M.pois || []).filter((p) => p.k === 'fuel')) if (!pts.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 60)) pts.push(q);
    // ম্যাপে পাম্প কম পড়লে শহরের চার কোণের দিকে আরও (প্রধান সড়কে)
    const Bo = M.bounds, B = [Bo.x0, Bo.x1, Bo.z0, Bo.z1], cx = (B[0] + B[1]) / 2, cz = (B[2] + B[3]) / 2, qx = (B[1] - B[0]) / 4, qz = (B[3] - B[2]) / 4;
    const extra = [[cx - qx, cz - qz], [cx + qx, cz - qz], [cx - qx, cz + qz], [cx + qx, cz + qz], [cx, cz]].map(([x, z]) => ({ x, z, n: '', extra: true }));
    const names = [...NAMES];
    // কাছের রাস্তার ফুটপাতে পাম্পের জায়গা খোঁজা: দ্বীপের জায়গা পুরো খালি, খুঁটির জায়গায় বিল্ডিং না
    const find = (x, z, maxR, mainOnly) => {
      let best = null;
      for (const s of M.segments) {
        if (s.width < 5.5 || s.len < 26 || s.oneway || (mainOnly && !s.main)) continue;
        const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
        if (Math.hypot(mx - x, mz - z) > maxR + s.len / 2) continue;
        for (let t = 10; t <= s.len - 10; t += 4) {
          for (const side of [1, -1]) {
            const nx = s.dir.z * side, nz = -s.dir.x * side;
            const ex = s.ax + s.dir.x * t + nx * (s.width / 2), ez = s.az + s.dir.z * t + nz * (s.width / 2);
            if (ex < B[0] + 40 || ex > B[1] - 40 || ez < B[2] + 40 || ez > B[3] - 40) continue;
            const d = Math.hypot(ex - x, ez - z);
            if (d > maxR || (best && d >= best.d)) continue;
            const at = (a, b) => [ex + s.dir.x * a + nx * b, ez + s.dir.z * a + nz * b];
            if (this.stations.some((q) => Math.hypot(q.ex - ex, q.ez - ez) < 120)) continue;
            const isl = [at(0, 1), at(-1.4, 1), at(1.4, 1)], post = [at(-3.2, 2), at(3.2, 2), at(6, 2)];
            if (isl.some(([px, pz]) => W.blocked(px, 1, pz) || (W.otherRoad && W.otherRoad(px, pz, s, 1)) || (D && !D.free(px, pz, 0.6)))) continue;
            if (post.some(([px, pz]) => W.blocked(px, 1, pz) || (W.otherRoad && W.otherRoad(px, pz, s, 0.5)))) continue;
            // গাড়ি থামার জায়গায় আরেক রাস্তা না (মোড়ের মুখে নয়)
            const [bx, bz] = at(0, -1.4);
            if (W.otherRoad && W.otherRoad(bx, bz, s, 2)) continue;
            best = { d, s, side, nx, nz, t, ex, ez, at };
          }
        }
      }
      return best;
    };
    for (const q of [...pts, ...extra]) {
      if (q.extra && this.stations.length >= 7) break;
      const ok = find(q.x, q.z, q.extra ? 220 : 160, !!q.extra);
      if (!ok) continue;
      const name = names.length ? names.shift() : pick(NAMES);
      const st = { name, ...ok };
      const [bx, bz] = ok.at(0, -1.4); st.bx = bx; st.bz = bz; // গাড়ি থামার জায়গা (কিনারার লেন)
      if (D) for (const [a, b] of [[0, 1], [-3, 2], [3, 2], [6, 2], [0, 2]]) { const [x, z] = ok.at(a, b); D.mark(x, z, 2); }
      this.build(st);
      this.stations.push(st);
    }
  }
  build(st) {
    const g = this.g, W = g.world;
    const grp = new THREE.Group();
    grp.position.set(st.ex, 0, st.ez);
    // গ্রুপের +z = রাস্তা থেকে পাম্পের দিকে; গ্রুপের x = −side × রাস্তার দিক
    grp.rotation.y = Math.atan2(st.nx, st.nz);
    const sideFix = grp, ax = -st.side; // রাস্তার দিকের a → গ্রুপের x = ax·a
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.userData.noDent = true; sideFix.add(m); return m; };
    // পাম্পের দ্বীপ, দুটো মেশিন
    add(new THREE.BoxGeometry(3.2, 0.22, 0.8), lam(0xb0b0aa), 0, 0.27, 1.0);
    add(new THREE.BoxGeometry(3.3, 0.06, 0.9), lam(0xffd400), 0, 0.39, 1.0);
    const pm = new THREE.MeshLambertMaterial({ map: pumpTex() });
    for (const a of [-0.85, 0.85]) {
      const p = add(new THREE.BoxGeometry(0.55, 1.5, 0.4), [lam(0xe8e8e8), lam(0xe8e8e8), lam(0x0b7a3e), lam(0x0b7a3e), pm, pm], a, 1.17, 1.0);
      p.rotation.y = 0;
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), lam(0x222222), a + 0.3, 1.1, 0.8).rotation.z = 0.25; // নল
    }
    // ছাউনি: দুই খুঁটি পাম্পের পিছনে, ছাদ কিনারার লেনের উপর পর্যন্ত
    for (const a of [-3.2, 3.2]) add(new THREE.BoxGeometry(0.3, 4.7, 0.3), lam(0xf2f2f2), a, 2.35, 2.0);
    add(new THREE.BoxGeometry(9, 0.35, 5), lam(0xf5f5f5), 0, 4.75, 0.1);
    const fz = new THREE.MeshLambertMaterial({ map: fasciaTex(st.name) });
    const fas = add(new THREE.BoxGeometry(9.1, 0.7, 5.1), [lam(0x0b7a3e), lam(0x0b7a3e), lam(0xf5f5f5), lam(0xdddddd), fz, fz], 0, 4.45, 0.1);
    fas.castShadow = false;
    // নিচে আলো (রাতে)
    const lt = add(new THREE.PlaneGeometry(8, 4.4), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), 0, 4.09, 0.1);
    lt.rotation.x = Math.PI / 2; lt.castShadow = false;
    // দামের বোর্ড, খুঁটিতে (রাস্তার দুই দিক থেকেই দেখা যায়)
    add(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 8), lam(0x777777), 6 * ax, 2.1, 2.0);
    const pmat = new THREE.MeshLambertMaterial({ map: priceTex(st.name) });
    for (const r of [1, -1]) { const pb = add(new THREE.PlaneGeometry(1.5, 1.9), pmat, 6 * ax + r * 0.02, 4.6, 2.0); pb.rotation.y = r * Math.PI / 2; }
    g.scene.add(grp);
    st.grp = grp;
    // ধাক্কা: দ্বীপ আর খুঁটি
    const box = (a, b, r) => { const [x, z] = st.at(a, b); W.addBox(x - r, x + r, z - r, z + r, 2, 'wall'); };
    box(-0.9, 1.0, 0.45); box(0.9, 1.0, 0.45); box(-3.2, 2.0, 0.2); box(3.2, 2.0, 0.2); box(6, 2.0, 0.12);
    // পাম্পের লোক
    const [mx, mz] = st.at(0.2, 0.35);
    st.man = makeRig({ shirt: 0x0b7a3e, cap: 0x0b7a3e, pants: 0x263238 });
    st.man.root.position.set(mx, 0.16, mz);
    st.man.root.rotation.y = Math.atan2(st.nx, st.nz); // রাস্তার দিকে মুখ (রিগের সামনে −z)
    g.scene.add(st.man.root);
    st.sayT = 0;
  }
  markers() { return this.stations.map((s) => ({ x: s.bx, z: s.bz, color: '#0b7a3e', label: '⛽', r: 7, noClamp: true, name: s.name })); }
  nearestStation(x, z) {
    let best = null, bd = 1e9;
    for (const s of this.stations) { const d = Math.hypot(s.bx - x, s.bz - z); if (d < bd) { bd = d; best = s; } }
    return best ? { st: best, d: bd } : null;
  }
  // পাম্পের সামনে থেমে থাকা নিজের যানবাহন
  bayFor(v) {
    if (!v || !usesFuel(v)) return null;
    for (const s of this.stations) if (Math.hypot(v.x - s.bx, v.z - s.bz) < 5.5) return s;
    return null;
  }
  cost(v) {
    const T = TANK[v.type], F = FUELS[T.f];
    const need = Math.max(0, 1 - fuelOf(v)) * T.cap;
    return { T, F, need, money: Math.ceil(need * F.price / 5) * 5 };
  }
  // ড্রাইভের সময়ের কাজের বোতাম (G)
  action() {
    const g = this.g, P = g.player, v = P.vehicle;
    if (P.state !== 'drive' || this.fill) return null;
    const st = this.bayFor(v);
    if (!st || Math.abs(v.speed) > 1) return null;
    const c = this.cost(v);
    if (c.need < 0.3) return { label: 'ট্যাংক ভরা', text: 'ট্যাংক ভরা আছে', run: () => g.ui.toast('ট্যাংক ভরাই আছে, মামা!', '') };
    return { label: 'তেল ভরুন', text: `${c.F.name} ভরুন: ${bn(c.need.toFixed(1))} ${c.F.unit}, ৳${bnGroup(c.money)}`, run: () => this.startFill(v, st) };
  }
  startFill(v, st) {
    const g = this.g;
    const c = this.cost(v);
    // টাকা কম থাকলে যতটুকু পারা যায় (বাকির সীমা পর্যন্ত)
    let money = c.money, liters = c.need;
    if (!g.canPay(money)) {
      const can = Math.max(0, Math.floor((g.money + 2000) / 5) * 5);
      if (can < c.F.price) { g.ui.toast('তেল কেনার টাকা নেই!', 'bad'); return; }
      money = can; liters = can / c.F.price;
    }
    if (!g.spend(money, 'তেল')) return;
    g.save();
    this.fill = { v, st, from: v.fuel, to: Math.min(1, v.fuel + liters / c.T.cap), t: 0, dur: 2.2 + liters / c.T.cap * 2.5, money, liters, F: c.F };
    g.say(st.man.root, 'পাম্পের লোক', pick(LINES), 2);
    g.sound.click();
  }
  update(dt) {
    const g = this.g, P = g.player, v = P.state === 'drive' ? P.vehicle : null;
    // খরচ: চলা দূরত্ব অনুযায়ী, একটু চালু থাকা অবস্থায়ও
    if (v && usesFuel(v) && !v.wrecked) {
      const T = TANK[v.type];
      fuelOf(v);
      if (!this.fill) v.fuel = Math.max(0, v.fuel - (Math.abs(v.speed) * dt) / T.range - dt * 0.00003);
      v.fuelLim = v.fuel <= 0 ? 0.13 : 1;
      if (v.fuel < 0.15 && v.fuel > 0 && !this.warned.has(v)) {
        this.warned.add(v);
        const n = this.nearestStation(v.x, v.z);
        g.ui.toast(`তেল প্রায় শেষ! ${n ? `সবচেয়ে কাছের পাম্প ${bn(Math.round(n.d))} মিটার (মিনি-ম্যাপে ⛽)` : ''}`, 'bad');
        g.sound.ping();
      }
      if (v.fuel <= 0 && !v.emptyTold) { v.emptyTold = true; g.ui.toast('তেল শেষ! গাড়ি খুব আস্তে চলবে, পাম্পে নিয়ে যান', 'bad'); }
      if (v.fuel > 0.2) { this.warned.delete(v); v.emptyTold = false; }
    }
    // তেল ভরা চলছে
    const f = this.fill;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.v.fuel = f.from + (f.to - f.from) * k;
      if (f.v.speed) f.v.speed = 0;
      setPose(f.st.man, 'idle', dt, 0);
      if (k >= 1 || P.vehicle !== f.v) {
        g.ui.toast(`${f.F.name} নিলেন ${bn(f.liters.toFixed(1))} ${f.F.unit} (−৳${bnGroup(f.money)})`, 'money');
        g.say(f.st.man.root, 'পাম্পের লোক', pick(['হইছে মামা, ঢাকনা লাগায় দিছি!', 'ধন্যবাদ, আবার আইসেন!', 'ফুল, মামা!']), 2);
        g.sound.money();
        f.v.fuelLim = 1;
        this.fill = null;
      }
    }
    // পাম্পের লোক: কাছে এলে ডাকে
    for (const s of this.stations) {
      const d = Math.hypot(s.bx - P.pos.x, s.bz - P.pos.z);
      if (d > 60) continue;
      if (!f || f.st !== s) setPose(s.man, d < 10 ? 'wave' : 'idle', dt, 0);
      s.sayT -= dt;
      if (d < 9 && s.sayT <= 0 && v && usesFuel(v) && Math.abs(v.speed) < 2) { s.sayT = 14; g.say(s.man.root, 'পাম্পের লোক', 'আসেন মামা, তেল লাগবো?', 2); }
    }
    this.hud(v);
  }
  // স্পিডোমিটারের নিচে জ্বালানির দাগ
  hud(v) {
    const el = this.el || (this.el = document.getElementById('fuelGauge'));
    if (!el) return;
    const on = !!(v && usesFuel(v));
    if (on !== this.hudOn) { this.hudOn = on; el.classList.toggle('hidden', !on); }
    if (!on) return;
    const pct = Math.round(v.fuel * 100);
    if (pct !== this.hudPct) {
      this.hudPct = pct;
      const b = el.querySelector('b'); if (b) b.style.width = pct + '%';
      el.classList.toggle('low', pct < 15);
      const s = el.querySelector('span'); if (s) s.textContent = `⛽ ${bn(pct)}%`;
    }
  }
}
