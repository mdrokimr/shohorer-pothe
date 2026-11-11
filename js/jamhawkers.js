// জ্যামের ফেরিওয়ালা: লাল বাতিতে গাড়ি থামলে সারির ফাঁকে হেঁটে পানি, পপকর্ন, ফুল, বাদাম বিক্রি করে; জানালার পাশে দাঁড়িয়ে ডাকে
// সবুজ হলে দৌড়ে মোড়ের কোণে সরে যায়। শুধু খেলোয়াড়ের কাছের মোড়ে (সর্বোচ্চ ৪ জন)
import * as THREE from 'three';
import { makeRig, setPose } from './rig.js';
import { pick, rand } from './utils.js';
import { lam } from './lib3d.js';

const MOBILE = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const GOODS = {
  water: { lines: ['পানি! ঠান্ডা পানি!', 'মামা, পানি লাগবো? বিশ টাকা!', 'ঠান্ডা পানি, ঠান্ডা কোক!', 'দেখে নে বাইচ্চা নেন, পানি ২০!'], price: 20, hp: 6, buy: 'ঠান্ডা পানি খেলেন' },
  popcorn: { lines: ['পপকর্ন! গরম পপকর্ন!', 'দশ টাকা, দশ টাকা!', 'আপা, বাচ্চার জন্য নেন!', 'জানালায় নেন, গরম গরম!'], price: 10, hp: 4, buy: 'পপকর্ন খেলেন' },
  flower: { lines: ['বেলি ফুল নিবেন? ভাবীর জন্য!', 'ফুল! গোলাপ, রজনীগন্ধা!', 'একটা মালা নেন, ভাইজান!', '৩০ টাকা মালা, নেন নেন!'], price: 30, hp: 0, buy: 'বেলি ফুলের মালা কিনলেন, গন্ধে গাড়ি ভরে গেল' },
  nuts: { lines: ['বাদাম! বুট-বাদাম!', 'চানাচুর, চানাচুর!', 'ঝালমুড়ি, মামা!', 'দেখে নে বাইচ্চা নেন, ১৫ টাকা!'], price: 15, hp: 5, buy: 'বাদাম খেলেন' },
  paper: { lines: ['আজকের পত্রিকা!', 'গরম খবর, গরম খবর!', 'পত্রিকা, দশ টাকা!', 'খবর পড়েন, দশ টাকা!'], price: 10, hp: 0, buy: 'পত্রিকা কিনলেন' },
};
const KINDS = Object.keys(GOODS);

// হাতে ধরা জিনিস (বুকের সামনে)
function prop(kind) {
  const g = new THREE.Group();
  const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, lam(col)); m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; };
  if (kind === 'water') { add(new THREE.BoxGeometry(0.34, 0.06, 0.24), 0x1565c0, 0, 0, 0); for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), 0xbfe6ff, -0.11 + (i % 3) * 0.11, 0.12, -0.05 + Math.floor(i / 3) * 0.1); }
  else if (kind === 'popcorn') { for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.08, 0.14, 0.05), [0xe53935, 0xfdd835, 0x1e88e5][i % 3], -0.16 + i * 0.08, 0.02, 0); add(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), 0x8a5a2b, 0, -0.18, 0.02); }
  else if (kind === 'flower') { for (let i = 0; i < 7; i++) { const t = add(new THREE.TorusGeometry(0.07, 0.016, 4, 10), i % 2 ? 0xffffff : 0xfff3c4, -0.15 + i * 0.05, -0.05 - (i % 3) * 0.04, 0); t.rotation.y = 1.4; } }
  else if (kind === 'nuts') { add(new THREE.CylinderGeometry(0.17, 0.12, 0.12, 10), 0xb0b8bd, 0, 0, 0); add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10), 0xc8913a, 0, 0.06, 0); }
  else { add(new THREE.BoxGeometry(0.3, 0.06, 0.22), 0xeeeeee, 0, 0, 0); add(new THREE.BoxGeometry(0.28, 0.005, 0.2), 0x333333, 0, 0.032, 0); }
  return g;
}

export class JamHawkers {
  constructor(g) { this.g = g; this.list = []; this.t = 0; }
  // খেলোয়াড়ের কাছের যে মোড়ে লালে গাড়ি দাঁড়িয়ে
  update(dt) {
    const g = this.g, P = g.player, S = g.signals, T = g.traffic;
    if (!P || !S || !T) return;
    this.t += dt;
    const max = MOBILE ? 2 : 4;
    // লালে থামা গাড়ি, খেলোয়াড়ের ৬০ মিটারের মধ্যে
    const stopped = T.cars.filter((c) => c.redStop && Math.abs(c.v.speed) < 0.5 && Math.hypot(c.v.x - P.pos.x, c.v.z - P.pos.z) < 60);
    if (this.list.length < max && stopped.length >= 2 && Math.random() < dt * 0.6) this.spawn(pick(stopped));
    for (const h of [...this.list]) this.step(h, dt, stopped);
  }
  spawn(c) {
    const g = this.g, v = c.v;
    // গাড়ির পাশের ফাঁক থেকে শুরু
    const yaw = v.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw); // গাড়ির ডান দিক (সামনে −z)
    const side = Math.random() < 0.5 ? 1 : -1;
    const kind = pick(KINDS);
    const rig = makeRig({ kurta: Math.random() < 0.3, cap: Math.random() < 0.3 ? 0x8d6e63 : undefined, shirt: pick([0x6d4c41, 0x546e7a, 0x8d6e63, 0xef6c00, 0x2e7d32, 0x37474f]), pants: Math.random() < 0.4 ? pick([0x2e7d32, 0x1565c0, 0x6a1b9a]) : undefined });
    const p = prop(kind); p.position.set(0, 0.32, -0.32); (rig.spine || rig.root).add(p);
    const x = v.x + rx * side * 1.5, z = v.z + rz * side * 1.5;
    rig.root.position.set(x, 0.16, z);
    g.scene.add(rig.root);
    this.list.push({ rig, kind, x, z, target: c, side, mode: 'go', wait: 0, sayT: rand(1, 3), yaw: 0, life: 0 });
  }
  remove(h) { this.g.scene.remove(h.rig.root); this.list.splice(this.list.indexOf(h), 1); }
  step(h, dt, stopped) {
    const g = this.g, P = g.player;
    h.life += dt;
    const dPlayer = Math.hypot(h.x - P.pos.x, h.z - P.pos.z);
    if (dPlayer > 110 || h.life > 120) { this.remove(h); return; }
    let tx = h.x, tz = h.z, sp = 0;
    const c = h.target, ok = c && stopped.includes(c);
    if (h.mode !== 'leave' && !ok) {
      // গাড়ি চলতে শুরু করেছে: অন্য থামা গাড়ি, না পেলে রাস্তা থেকে সরে যাও
      const next = stopped.filter((q) => Math.hypot(q.v.x - h.x, q.v.z - h.z) < 30).sort((a, b) => Math.hypot(a.v.x - h.x, a.v.z - h.z) - Math.hypot(b.v.x - h.x, b.v.z - h.z))[0];
      if (next) { h.target = next; h.mode = 'go'; } else { h.mode = 'leave'; const nr = g.world.nearestRoad(h.x, h.z); if (nr) { const s = nr.seg, nx = -s.dir.z, nz = s.dir.x, sd = Math.sign((h.x - nr.px) * nx + (h.z - nr.pz) * nz) || 1; h.lx = nr.px + nx * sd * (s.width / 2 + 1.2); h.lz = nr.pz + nz * sd * (s.width / 2 + 1.2); } else { h.lx = h.x; h.lz = h.z; } }
    }
    if (h.mode === 'leave') {
      tx = h.lx; tz = h.lz; sp = 2.2; // দৌড়ে ফুটপাতে
      if (Math.hypot(tx - h.x, tz - h.z) < 0.4) { sp = 0; if (dPlayer > 40 || h.life > 60) { this.remove(h); return; } }
    } else if (h.target) {
      const v = h.target.v, rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
      const half = (v.mExt ? v.mExt[0] / 2 : 1) + 0.45;
      tx = v.x + rx * h.side * half; tz = v.z + rz * h.side * half; // জানালার পাশে
      const d = Math.hypot(tx - h.x, tz - h.z);
      if (h.mode === 'go') { sp = 1.05; if (d < 0.35) { h.mode = 'sell'; h.wait = rand(2.5, 5); } }
      else if (h.mode === 'sell') {
        h.wait -= dt;
        // জানালার দিকে মুখ
        h.face = Math.atan2(-(v.x - h.x), -(v.z - h.z));
        h.sayT -= dt;
        const playerCar = P.state === 'drive' && P.vehicle === v;
        if (h.sayT <= 0 && dPlayer < 18) { h.sayT = rand(3, 6); g.say(h.rig.root, 'ফেরিওয়ালা', pick(GOODS[h.kind].lines), 2.2); }
        if (playerCar && !h.offered) { h.offered = true; g.ui.toast(`ফেরিওয়ালা জানালায়: ${GOODS[h.kind].lines[0]} (হর্ন দিলে কিনবেন, ৳${GOODS[h.kind].price})`, ''); }
        if (h.wait <= 0) {
          // পরের থামা গাড়ি (একই দিকের সারিতে)
          const cand = stopped.filter((q) => q !== v && Math.hypot(q.v.x - h.x, q.v.z - h.z) < 14);
          if (cand.length) { h.target = pick(cand); h.mode = 'go'; h.side = Math.random() < 0.5 ? 1 : -1; } else h.wait = rand(1, 2);
        }
      }
    }
    const dx = tx - h.x, dz = tz - h.z, dl = Math.hypot(dx, dz);
    if (sp > 0 && dl > 0.05) {
      const k = Math.min(dl, sp * dt) / dl;
      h.x += dx * k; h.z += dz * k;
      h.face = Math.atan2(-dx, -dz);
    }
    if (h.face !== undefined) { let d = h.face - h.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); h.yaw += d * Math.min(1, dt * 6); }
    h.rig.root.position.set(h.x, 0.16, h.z); h.rig.root.rotation.y = h.yaw;
    const moving = sp > 0 && dl > 0.05;
    setPose(h.rig, moving ? (sp > 1.5 ? 'run' : 'walk') : h.mode === 'sell' && Math.sin(this.t * 1.3 + h.life) > 0.6 ? 'wave' : 'idle', dt, moving ? sp : 0);
    // হাত সামনে, জিনিস ধরে (হাঁটলেও)
    if (h.rig.aL && !(h.mode === 'sell' && Math.sin(this.t * 1.3 + h.life) > 0.6)) { h.rig.aL.sh.rotation.x = 0.85; h.rig.aL.el.rotation.x = 1.0; h.rig.aR.sh.rotation.x = 0.85; h.rig.aR.el.rotation.x = 1.0; if (h.rig.apply) h.rig.apply(); }
  }
  // খেলোয়াড় গাড়িতে হর্ন দিলে জানালার ফেরিওয়ালার থেকে কেনা
  honk() {
    const g = this.g, P = g.player;
    if (P.state !== 'drive' || !P.vehicle) return false;
    const h = this.list.find((q) => q.mode === 'sell' && q.target && q.target.v === P.vehicle && !q.sold);
    if (!h) return false;
    const G = GOODS[h.kind];
    if (g.spend && !g.spend(G.price, G.buy)) return false;
    h.sold = true;
    if (G.hp && P.health !== undefined) P.health = Math.min(100, P.health + G.hp);
    g.ui.toast(`${G.buy} (৳${G.price})`, 'money');
    g.say(h.rig.root, 'ফেরিওয়ালা', pick(['আল্লাহ ভরসা, ভালো থাকেন!', 'ধন্যবাদ মামা!', 'আবার দেখা হবে!']), 2);
    h.wait = 0.5;
    return true;
  }
}
