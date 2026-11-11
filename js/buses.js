// বাস কাউন্টার: বড় রাস্তার পাশে ছাউনি, টিকিট ঘর, অপেক্ষারত যাত্রী। রাস্তার বাস এসে থামে, হেলপার ডাকে।
// কাউন্টারে টিকিট কেটে যাত্রী হয়ে বাসে চড়া যায়; ইজিবাইক স্ট্যান্ড থেকে শেয়ারের যাত্রী
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { makeRig, setPose } from './rig.js';
import { lam, addBox, planeGeo, texMat, twoFace } from './lib3d.js';
import { signTex } from './textures.js';
import { FOOT } from './mapgen.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';
import { aiDrive } from './aidrive.js';

const AREAS = { n: ['মিরপুর ১১', 'পল্লবী', 'মিরপুর ১২'], s: ['কাজীপাড়া', 'শেওড়াপাড়া', 'আগারগাঁও'], w: ['মিরপুর ১', 'মিরপুর ২', 'স্টেডিয়াম'], e: ['মিরপুর ১৪', 'কচুক্ষেত', 'ভাষানটেক'] };
const HELPER = [
  'মিরপুর-মতিঝিল! উঠেন উঠেন!', 'ফার্মগেট! কারওয়ান বাজার! খালি গাড়ি!', 'ওস্তাদ, বাঁয়ে প্লাস্টিক!',
  'উস্তাদ, বামে প্লাস্টিক!', 'ওস্তাদ, ডাইনে প্লাস্টিক!', 'আস্তে নামেন, ডান পা আগে!',
  'সিট আছে, সিট আছে! গেটলক!', 'ভাড়া খুচরা রাখেন!', 'ওস্তাদ, যান!', 'গেটলক! গেটলক!',
  'লেডিস সিট খালি!', 'পিছে চাপান, পিছে!', 'ভাড়া দেন ভাই, ভাড়া!', 'এই স্টপেজ, নামেন!',
];
const WAIT = ['বাস আসে না কেন?', 'আধা ঘণ্টা দাঁড়ায়ে আছি!', 'এইটা কি সিটিং?', 'ভাই, মতিঝিল যাবে?', 'হেল্পার কোথায়?', 'আরে বাস আসতেছে!', 'ভাড়া কত এখন?'];

export class Buses {
  constructor(g) {
    this.g = g;
    this.counters = this.place();
    this.stands = this.placeStands();
    this.build();
    this.ride = null;
    this.waitT = 0;
  }
  // ---------- কাউন্টারের জায়গা ----------
  place() {
    const g = this.g, M = g.map, W = g.world, T = g.traffic;
    const st = M.pois.find((q) => q.k === 'station') || { x: 0, z: 0 };
    const out = [];
    const segs = M.segments.filter((s) => s.main && s.len >= 50 && s.width >= 7).sort((a, b) => b.len - a.len);
    for (const s of segs) {
      if (out.length >= 10) break;
      for (const fwd of s.oneway ? [true] : [true, false]) {
        const t = s.len / 2 + (fwd ? -6 : 6);
        const d = fwd ? s.dir : { x: -s.dir.x, z: -s.dir.z };
        const n = { x: d.z, z: -d.x }; // চলার দিকের বাম পাশ
        const mx = s.ax + s.dir.x * t, mz = s.az + s.dir.z * t;
        const L = T.lane(s, fwd, 'bus');
        const shel = { x: mx + n.x * (s.width / 2 + FOOT / 2), z: mz + n.z * (s.width / 2 + FOOT / 2) };
        if (W.blocked(shel.x, 1, shel.z) || W.blocked(shel.x + d.x * 2, 1, shel.z + d.z * 2) || W.blocked(shel.x - d.x * 2, 1, shel.z - d.z * 2)) continue;
        if (out.some((c) => Math.hypot(c.shel.x - shel.x, c.shel.z - shel.z) < 240)) continue;
        out.push({ seg: s, fwd, d, n, stop: { x: mx + L.n.x * L.off, z: mz + L.n.z * L.off }, shel, rigs: [], name: '' });
        break;
      }
    }
    // নাম: মিরপুর ১০-এর কাছেরটা "মিরপুর ১০", বাকিগুলো দিক অনুযায়ী
    const used = {};
    out.sort((a, b) => Math.hypot(a.shel.x - st.x, a.shel.z - st.z) - Math.hypot(b.shel.x - st.x, b.shel.z - st.z));
    out.forEach((c, i) => {
      if (i === 0) { c.name = 'মিরপুর ১০ গোলচত্বর'; return; }
      const dx = c.shel.x - st.x, dz = c.shel.z - st.z;
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
      used[k] = (used[k] || 0) + 1;
      c.name = AREAS[k][(used[k] - 1) % 3] + (used[k] > 3 ? ` ${bn(used[k])}` : '');
    });
    return out;
  }
  // ইজিবাইক স্ট্যান্ড: প্রথম দুই কাউন্টারের একটু সামনে
  placeStands() {
    return this.counters.slice(0, 2).map((c, i) => ({
      x: c.shel.x + c.d.x * 14, z: c.shel.z + c.d.z * 14, c, name: i ? `${c.name} ইজিবাইক স্ট্যান্ড` : 'মিরপুর ১০ ইজিবাইক স্ট্যান্ড', rigs: [],
      spot: { x: c.stop.x + c.d.x * 16, z: c.stop.z + c.d.z * 16, yaw: Math.atan2(-c.d.x, -c.d.z) },
    }));
  }
  build() {
    const g = this.g, W = g.world;
    for (const c of this.counters) {
      const grp = new THREE.Group();
      grp.position.set(c.shel.x, 0.16, c.shel.z);
      grp.rotation.y = Math.atan2(c.n.x, c.n.z); // ছাউনির পিছন রাস্তার উল্টো দিকে
      const roof = lam(pick([0x1565c0, 0xc62828, 0x2e7d32]));
      addBox(grp, 4.2, 0.12, 1.7, roof, 0, 2.6, 0.1);
      for (const x of [-1.9, 1.9]) addBox(grp, 0.08, 2.6, 0.08, lam(0x777777), x, 1.3, 0.8);
      addBox(grp, 4.2, 2.4, 0.06, lam(0xb0bec5), 0, 1.4, 0.9); // পিছনের দেয়াল
      addBox(grp, 3.2, 0.1, 0.45, lam(0x5d4037), 0, 0.5, 0.55); // বেঞ্চ
      addBox(grp, 1.2, 2.2, 1.1, lam(0xeeeeee), 2.9, 1.1, 0.3); // টিকিট ঘর
      addBox(grp, 0.9, 0.5, 0.05, lam(0x1a2430), 2.9, 1.45, -0.26);
      const sign = twoFace(new THREE.Mesh(planeGeo(4, 0.8), texMat(signTex(`${c.name} কাউন্টার`, 'road'), { side: THREE.DoubleSide })));
      sign.position.set(0, 3.1, 0.1);
      sign.rotation.y = Math.PI;
      grp.add(sign);
      g.scene.add(grp);
      // ধাক্কায় ছাউনি ভেঙে পড়ে
      const shelBox = W.addBreakable(grp, c.shel.x, c.shel.z, 1.0, 2.6);
      // টিকিট ঘর: দলের লোকাল (2.9, 0.3) থেকে দুনিয়ার অবস্থান; ছাউনি পড়ে গেলে এর বাক্সও আর আটকায় না
      const th = grp.rotation.y, cs = Math.cos(th), sn = Math.sin(th);
      const bx = c.shel.x + 2.9 * cs + 0.3 * sn, bz = c.shel.z - 2.9 * sn + 0.3 * cs;
      const booth = W.addBox(bx - 0.6, bx + 0.6, bz - 0.6, bz + 0.6, 2.2, 'booth');
      shelBox.brk.links = [booth];
      c.booth = { x: bx - c.n.x * 1.2, z: bz - c.n.z * 1.2 };
    }
    for (const s of this.stands) {
      addBox(g.scene, 0.08, 2.8, 0.08, lam(0x777777), s.x, 1.4, s.z);
      const sign = twoFace(new THREE.Mesh(planeGeo(2.6, 0.6), texMat(signTex(s.name, null), { side: THREE.DoubleSide })));
      sign.position.set(s.x, 2.6, s.z);
      sign.rotation.y = Math.atan2(s.c.d.x, s.c.d.z) + Math.PI / 2;
      g.scene.add(sign);
    }
  }
  // ---------- অপেক্ষারত যাত্রী (কাছে গেলে দেখা যায়) ----------
  fillRigs(place, n, near) {
    const g = this.g;
    if (near && place.rigs.length < n) {
      const female = Math.random() < 0.35;
      const r = makeRig({ female, skirt: female ? pick([0xc2185b, 0x00897b, 0x5e35b1]) : undefined, kurta: !female && Math.random() < 0.4 });
      const base = place.shel || place;
      const d = place.d || (place.c && place.c.d) || { x: 1, z: 0 };
      const along = rand(-1.6, 1.6), back = rand(0, 0.6);
      const nn = place.n || (place.c && place.c.n) || { x: 0, z: 1 };
      r._x = base.x + d.x * along + nn.x * back; r._z = base.z + d.z * along + nn.z * back;
      r.root.position.set(r._x, 0.16, r._z);
      r.root.rotation.set(0, Math.atan2(nn.x, nn.z), 0);
      r.phone = Math.random() < 0.3;
      g.scene.add(r.root);
      place.rigs.push(r);
    }
    if (!near && place.rigs.length) { while (place.rigs.length) g.scene.remove(place.rigs.pop().root); place.want = undefined; }
  }
  takeRigs(place, n) {
    let k = 0;
    while (place.rigs.length && k < n) { this.g.scene.remove(place.rigs.pop().root); k++; }
    return k;
  }
  update(dt) {
    const g = this.g, P = g.player.pos;
    this.waitT -= dt;
    for (const c of this.counters) {
      const near = Math.hypot(c.shel.x - P.x, c.shel.z - P.z) < 150;
      this.fillRigs(c, c.want ?? (c.want = 2 + Math.floor(Math.random() * 4)), near);
      for (const r of c.rigs) setPose(r, r.phone ? 'phone' : 'idle', dt, 0, 4);
      if (near && this.waitT <= 0 && c.rigs.length && Math.hypot(c.shel.x - P.x, c.shel.z - P.z) < 18) { this.waitT = rand(10, 18); g.say(pick(c.rigs).root, 'যাত্রী', pick(WAIT), 2.2); }
    }
    for (const s of this.stands) {
      this.fillRigs(s, s.want ?? (s.want = 3), Math.hypot(s.x - P.x, s.z - P.z) < 120);
      for (const r of s.rigs) setPose(r, 'idle', dt, 0, 4);
    }
    if (this.ride) this.updateRide(dt);
  }
  // রাস্তার বাস: সামনে নিজের দিকের কাউন্টার এলে থেমে যাত্রী তোলে
  busTarget(c, v, target, dt) {
    if (c.dwell > 0) {
      c.dwell -= dt;
      if (c.dwell <= 0) { c.lastStop = c.stopAt; c.stopAt = null; }
      return 0;
    }
    const f = v.fwd();
    if (!c.stopAt) {
      for (const k of this.counters) {
        if (k === c.lastStop) continue;
        const rx = k.stop.x - v.x, rz = k.stop.z - v.z;
        const al = rx * f.x + rz * f.z, lat = Math.abs(rx * f.z - rz * f.x);
        if (al > 3 && al < 28 && lat < 3.5 && f.x * k.d.x + f.z * k.d.z > 0.7) { c.stopAt = k; break; }
      }
    }
    const k = c.stopAt;
    if (!k) return target;
    const al = (k.stop.x - v.x) * f.x + (k.stop.z - v.z) * f.z;
    if (al < -6) { c.lastStop = k; c.stopAt = null; return target; }
    if (al < 1.5 && Math.abs(v.speed) < 0.8) {
      // থেমে যাত্রী ওঠা-নামা, হেলপারের ডাক
      c.dwell = rand(3.5, 5.5);
      const took = this.takeRigs(k, 1 + Math.floor(Math.random() * 3));
      k.want = Math.max(1, (k.want || 3) - took + Math.floor(Math.random() * 2));
      const P = this.g.player.pos;
      if (Math.hypot(v.x - P.x, v.z - P.z) < 40 && c.rig) {
        this.g.say(c.rig.root, 'হেলপার', pick(HELPER), 2.4);
        if (this.g.sound.slap) this.g.sound.slap(Math.hypot(v.x - P.x, v.z - P.z));
      }
      return 0;
    }
    return Math.min(target, Math.max(0, (al - 1) * 0.7));
  }
  nearCounter() {
    const P = this.g.player;
    if (P.state !== 'foot' || P.y > 1) return null;
    return this.counters.find((c) => Math.hypot(c.shel.x - P.pos.x, c.shel.z - P.pos.z) < 3.4) || null;
  }
  nearStand() {
    const P = this.g.player;
    if (P.state !== 'foot' || P.y > 1) return null;
    return this.stands.find((s) => Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 3.2) || null;
  }
  ticket(c) {
    const g = this.g;
    const others = this.counters.filter((x) => x !== c).sort((a, b) => Math.hypot(a.shel.x - c.shel.x, a.shel.z - c.shel.z) - Math.hypot(b.shel.x - c.shel.x, b.shel.z - c.shel.z)).slice(0, 3);
    const fare = (x) => Math.round((15 + Math.hypot(x.shel.x - c.shel.x, x.shel.z - c.shel.z) / 25) / 5) * 5;
    g.interiors.dialog(`${c.name} বাস কাউন্টার`, '"কই যাইবেন? টিকিট নেন, বাস এখনই আসতেছে।"', [
      ...others.map((x) => ({ label: `যাত্রী হয়ে বাসে: ${x.name}`, price: fare(x), act: () => this.startRide(c, x, fare(x)) })),
      { label: 'বাস চালকের চাকরি (রুটের কাউন্টারে থেমে যাত্রী তোলা)', act: () => g.work.start('bus', { from: c }) },
    ]);
  }
  // ---------- যাত্রী হয়ে বাসে চড়া ----------
  startRide(from, to, fare) {
    const g = this.g;
    if (g.law.stars > 0) { g.ui.toast('পুলিশ খুঁজছে! এখন বাসে ওঠা যাবে না', 'bad'); return; }
    if (!g.spend(fare, 'বাস ভাড়া')) return;
    g.sound.money();
    // বাস আসে রাস্তার পিছন দিক থেকে
    const s = from.seg;
    const back = from.fwd ? -1 : 1;
    let x = from.stop.x + s.dir.x * back * 60, z = from.stop.z + s.dir.z * back * 60;
    const nr = g.world.nearestRoad(x, z);
    if (nr) { const L = g.traffic.lane(nr.seg, from.fwd, 'bus'); x = nr.px + L.n.x * L.off; z = nr.pz + L.n.z * L.off; }
    const v = new Vehicle(g.scene, 'bus', { ai: true, x, z, yaw: Math.atan2(-from.d.x, -from.d.z) });
    const drv = makeRig({ shirt: 0x6d4c41 });
    v.g.add(drv.root);
    drv.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
    this.ride = { v, drv, from, to, stage: 'come', t: 0, u: { v } };
    g.ui.toast(`টিকিট কাটলেন (৳${bnGroup(fare)})। বাস আসছে, কাউন্টারে দাঁড়ান`, 'money');
  }
  vehicles() { return this.ride ? [this.ride.v] : []; }
  updateRide(dt) {
    const g = this.g, R = this.ride, P = g.player, v = R.v;
    R.t += dt;
    setPose(R.drv, 'drive', dt, 0, 8);
    if (R.stage === 'come') {
      const d = aiDrive(g, R.u, R.from.stop.x, R.from.stop.z, dt, { stopD: 2.5, max: 11 });
      if ((d < 4 && Math.abs(v.speed) < 0.8) || R.t > 45) {
        if (R.t > 45) { v.x = R.from.stop.x; v.z = R.from.stop.z; v.yaw = Math.atan2(-R.from.d.x, -R.from.d.z); v.speed = 0; v.sync(0); }
        if (P.state === 'foot' && Math.hypot(P.pos.x - v.x, P.pos.z - v.z) < 14) {
          g.say(R.drv.root, 'হেলপার', `${R.to.name}! ${R.to.name}! উঠেন!`, 2.2);
          P.state = 'ride'; P.rideV = v;
          P.rig.root.visible = false;
          R.stage = 'go'; R.t = 0; R.u = { v };
          g.sound.door();
          g.ui.toast(`বাসে উঠলেন। ${R.to.name} যাচ্ছে · ${g.mobile ? 'ওঠা বোতাম' : 'F'}: তাড়াতাড়ি পৌঁছান`, 'good');
        } else if (R.t > 60) { this.endRide(false); g.ui.toast('বাস চলে গেল!', 'bad'); }
      }
    } else if (R.stage === 'go') {
      const d = aiDrive(g, R.u, R.to.stop.x, R.to.stop.z, dt, { stopD: 3, max: 14 });
      P.pos.x = v.x; P.pos.z = v.z; P.yaw = v.yaw;
      if ((d < 5 && Math.abs(v.speed) < 1) || R.t > 150) this.arrive();
    } else if (R.stage === 'leave') aiDrive(g, R.u, 0, 0, dt, { leave: true });
  }
  skipRide() {
    const R = this.ride;
    if (!R || R.stage !== 'go') return;
    const v = R.v;
    v.x = R.to.stop.x; v.z = R.to.stop.z; v.yaw = Math.atan2(-R.to.d.x, -R.to.d.z); v.speed = 0; v.sync(0);
    this.g.time += 30;
    this.arrive();
  }
  arrive() {
    const g = this.g, R = this.ride, P = g.player;
    P.state = 'foot'; P.rideV = null;
    P.rig.root.visible = true;
    P.place(R.to.shel.x - R.to.n.x * 0.4, R.to.shel.z - R.to.n.z * 0.4, Math.atan2(-R.to.d.x, -R.to.d.z));
    P.y = 0;
    g.camYaw = P.yaw;
    g.sound.door();
    g.ui.toast(`${R.to.name}-এ নামলেন`, 'good');
    R.stage = 'leave'; R.t = 0;
    setTimeout(() => this.endRide(true), 6000);
  }
  endRide() {
    const R = this.ride;
    if (!R) return;
    const P = this.g.player;
    if (P.state === 'ride') { P.state = 'foot'; P.rig.root.visible = true; }
    this.g.scene.remove(R.v.g);
    this.ride = null;
  }
}
