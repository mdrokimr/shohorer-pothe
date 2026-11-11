// চাকরি: অ্যাম্বুলেন্স চালক, পুলিশ (অপরাধী ধরা), পাইলট (বিমান, হেলিকপ্টার ট্যুর), নৌকা চালক (ঘাট থেকে ঘাট)
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { makeRig, setPose } from './rig.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';
import { aiDrive } from './aidrive.js';

const NAMES = { bus: 'বাস চালক', share: 'ইজিবাইক শেয়ার', ambulance: 'অ্যাম্বুলেন্স চালক', police: 'পুলিশ: অপরাধী ধরা', plane: 'পাইলট: যাত্রী ফ্লাইট', heli: 'হেলিকপ্টার ট্যুর', boat: 'নৌকা: ঘাট থেকে ঘাট' };
const RING = new THREE.TorusGeometry(7, 0.55, 8, 28);

export class Work {
  constructor(g) {
    this.g = g;
    this.job = null;
    // লক্ষ্যের আলোর খুঁটি
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 50, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.marker.visible = false;
    this.marker.userData.noShadow = true;
    g.scene.add(this.marker);
    this.rings = [];
  }
  vehicles() { const j = this.job; return j && j.suspect && !j.suspect.gone ? [j.suspect.v] : []; }
  target() {
    const j = this.job;
    if (!j || !j.tgt) return null;
    return j.tgt;
  }
  // রাস্তার কোনো বিন্দু: কেন্দ্র থেকে min-max দূরে
  roadPoint(cx, cz, min, max, wide = 5) {
    const segs = this.g.map.segments;
    for (let i = 0; i < 80; i++) {
      const s = pick(segs);
      if (s.len < 12 || s.width < wide) continue;
      const t = rand(4, s.len - 4);
      const x = s.ax + s.dir.x * t, z = s.az + s.dir.z * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < min || d > max) continue;
      return { x, z, s, t, yaw: Math.atan2(-s.dir.x, -s.dir.z) };
    }
    return null;
  }
  spawnAt(type, b) {
    const g = this.g;
    const nr = g.world.nearestRoad(b.door.x, b.door.z);
    const s = nr.seg, side = nr.lat >= 0 ? 1 : -1;
    const off = s.width / 2 - 1.3;
    const x = nr.px + s.dir.z * side * off, z = nr.pz - s.dir.x * side * off;
    const v = new Vehicle(g.scene, type, { x, z, yaw: Math.atan2(-s.dir.x, -s.dir.z), dynWheels: true, owned: true });
    v.stolen = true; // কাজ শেষে দূরে গেলে সরে যায়
    g.vehicles.push(v);
    return v;
  }
  spawnPoint(type, x, z, yaw) {
    const g = this.g;
    const v = new Vehicle(g.scene, type, { x, z, yaw, dynWheels: true, owned: true });
    v.stolen = true;
    g.vehicles.push(v);
    return v;
  }
  start(kind, extra = {}) {
    const g = this.g, pl = g.map.places;
    if (this.job) this.cancel('');
    if (g.jobs.active) g.jobs.cancel();
    const j = (this.job = { kind, stage: 'getin', t: 0, limit: 0, pay: 0, n: 0 });
    if (kind === 'ambulance') { j.veh = this.spawnAt('ambulance', pl.hospital); j.veh.siren = true; g.ui.toast('হাসপাতালের সামনে অ্যাম্বুলেন্স রাখা আছে, উঠুন', 'good'); }
    else if (kind === 'bus') {
      const c = (j.from = extra.from);
      j.veh = this.spawnPoint('bus', c.stop.x - c.d.x * 6, c.stop.z - c.d.z * 6, Math.atan2(-c.d.x, -c.d.z));
      // রুট: কাছের পরের ৪টা কাউন্টার
      const B = g.buses.counters, stops = [];
      let cur = c;
      for (let k = 0; k < 4; k++) {
        const nx = B.filter((x) => x !== c && !stops.includes(x)).sort((a, b) => Math.hypot(a.shel.x - cur.shel.x, a.shel.z - cur.shel.z) - Math.hypot(b.shel.x - cur.shel.x, b.shel.z - cur.shel.z))[0];
        if (!nx) break;
        stops.push(nx); cur = nx;
      }
      j.stops = stops;
      g.ui.toast(`কাউন্টারের সামনে বাস। রুট: ${stops.map((s) => s.name).join(' → ')}`, 'good');
    } else if (kind === 'share') {
      const s = (j.stand = extra.stand);
      j.veh = this.spawnPoint('easybike', s.spot.x, s.spot.z, s.spot.yaw);
      g.ui.toast('স্ট্যান্ডে ইজিবাইক রাখা আছে, উঠুন', 'good');
    }
    else if (kind === 'police') { j.veh = this.spawnAt('police', pl.thana); g.ui.toast('থানার সামনে পুলিশের গাড়ি, উঠুন (H সাইরেন)', 'good'); }
    else if (kind === 'plane') { j.veh = g.craft.plane; j.veh.reset(); g.ui.toast('অ্যাপ্রনে বিমান। উঠে W দিয়ে ইঞ্জিন চালু, রানওয়েতে জোরে চালিয়ে Space চেপে উড়ুন', 'good'); }
    else if (kind === 'heli') { j.veh = g.craft.heliAir; j.veh.reset(); g.ui.toast('হেলিপ্যাডে হেলিকপ্টার। উঠে Space চেপে উড়ুন', 'good'); }
    else if (kind === 'boat') {
      j.from = extra.from; j.to = extra.to;
      j.veh = j.from.boatV; j.veh.reset();
      g.ui.toast('জেটির পাশে স্পিডবোট, উঠুন', 'good');
      // জেটিতে অপেক্ষারত যাত্রী
      j.pass = [];
      for (let i = 0; i < 3; i++) {
        const r = makeRig({ female: i === 1, skirt: i === 1 ? 0x00897b : undefined, kurta: i !== 1 });
        r.root.position.set(j.from.pier.x0 + 6 + i * 1.2, 0.71, j.from.z + rand(-1.5, 1.5));
        r.root.rotation.y = Math.PI / 2;
        g.scene.add(r.root);
        j.pass.push(r);
      }
    }
    j.tgt = { x: j.veh.x, z: j.veh.z };
    g.sound.ping();
  }
  cancel(msg = 'চাকরি বাতিল') {
    const j = this.job;
    if (!j) return;
    if (j.patient) this.g.scene.remove(j.patient.root);
    if (j.suspect && !j.suspect.gone) this.removeSuspect(j.suspect);
    for (const p of j.pass || []) this.g.scene.remove(p.root);
    this.clearRings();
    this.marker.visible = false;
    this.job = null;
    if (msg) this.g.ui.toast(msg, 'bad');
  }
  finishOne(amount, text) {
    const g = this.g, j = this.job;
    g.money += amount; g.save(); g.sound.money();
    j.pay += amount; j.n++;
    g.ui.toast(`${text}: +৳${bnGroup(amount)} (মোট ৳${bnGroup(j.pay)})`, 'money');
  }
  setMarker(x, z, y = 0, color = 0xff4040) {
    this.marker.visible = true;
    this.marker.position.set(x, y + 25, z);
    this.marker.material.color.setHex(color);
  }
  // ---------- আকাশে আংটি ----------
  makeRings(pts) {
    this.clearRings();
    pts.forEach((p, i) => {
      const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(p.x, p.y, p.z);
      const nx = pts[i + 1] || pts[i - 1] || { x: p.x + 1, y: p.y, z: p.z };
      m.lookAt(nx.x, nx.y, nx.z);
      m.userData.noShadow = true;
      this.g.scene.add(m);
      this.rings.push(m);
    });
    this.ringI = 0;
    this.showRings();
  }
  showRings() { this.rings.forEach((m, i) => { m.visible = i >= this.ringI && i <= this.ringI + 1; m.material.opacity = i === this.ringI ? 0.9 : 0.3; }); }
  clearRings() { for (const m of this.rings) this.g.scene.remove(m); this.rings = []; }

  // ---------- পুলিশের কাজের অপরাধী ----------
  spawnSuspect() {
    const g = this.g, P = g.player;
    const p = this.roadPoint(P.pos.x, P.pos.z, 140, 300, 6);
    if (!p) return null;
    const v = new Vehicle(g.scene, pick(['car', 'car', 'cng', 'bike']), { ai: true, x: p.x, z: p.z, yaw: p.yaw });
    const rig = makeRig({ shirt: 0x111111, cap: 0x8b0000 });
    v.g.add(rig.root);
    rig.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
    return { v, rig, route: null, routeT: 0, stuckT: 0, revT: 0, dest: null, catchT: 0, gone: false };
  }
  removeSuspect(s) { s.gone = true; this.g.scene.remove(s.v.g); }
  driveSuspect(s, dt) {
    const g = this.g, v = s.v, P = g.player;
    if (v.tumble) { v.updateTumble(dt, g.world); v.sync(dt); return; }
    if (v.wrecked || v.hp <= 0) { v.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.world); v.sync(dt); return; }
    if (v.stun > 0) { v.stun -= dt; v.drive(dt, { throttle: v.speed > 0.5 ? -1 : 0, steer: 0, handbrake: true }, g.world); v.sync(dt); setPose(s.rig, 'drive', dt, 0, 8); return; }
    // আপনার থেকে দূরের দিকে পালানো
    if (!s.dest || Math.hypot(s.dest.x - v.x, s.dest.z - v.z) < 25) {
      let best = null, bd = -1;
      for (let i = 0; i < 12; i++) {
        const q = this.roadPoint(v.x, v.z, 150, 380, 5);
        if (!q) continue;
        const d = Math.hypot(q.x - P.pos.x, q.z - P.pos.z);
        if (d > bd) { bd = d; best = q; }
      }
      s.dest = best || { x: v.x, z: v.z };
    }
    aiDrive(g, s, s.dest.x, s.dest.z, dt, { stopD: 4, max: v.type === 'bike' ? 26 : 22 });
    setPose(s.rig, v.type === 'bike' ? 'bike' : 'drive', dt, v.speed, 8);
  }

  // ---------- বাইরের কাউন্টার: বিমানবন্দর আর ঘাট ----------
  kiosks() {
    const E = this.g.map.extras;
    if (!E) return [];
    const out = [{ x: E.terminal.x, z: E.terminal.z, kind: 'airport', label: 'ফ্লাইট ডেস্ক: পাইলটের কাজ' }];
    for (const gh of E.ghats) out.push({ x: gh.booth.x + 5, z: gh.booth.z, kind: 'ghat', gh, label: `${gh.name}: টিকিট কাউন্টার` });
    return out;
  }
  nearKiosk() {
    const P = this.g.player;
    if (P.state !== 'foot' || P.y > 1) return null;
    return this.kiosks().find((k) => Math.hypot(k.x - P.pos.x, k.z - P.pos.z) < 3.2) || null;
  }
  useKiosk(k) {
    const g = this.g, I = g.interiors;
    if (k.kind === 'airport') I.dialog('ফ্লাইট ডেস্ক', '"ক্যাপ্টেন সাহেব, আজকে কোন ডিউটি?"', [
      { label: 'বিমানে যাত্রী ফ্লাইট (আকাশের আংটি পার হয়ে রানওয়েতে নামুন)', note: 'পারিশ্রমিক ৳১,৫০০', act: () => this.start('plane') },
      { label: 'হেলিকপ্টারে শহর ঘোরানো (হাসপাতালের ছাদে নামুন)', note: 'পারিশ্রমিক ৳৯০০', act: () => this.start('heli') },
    ]);
    else {
      const other = g.map.extras.ghats.find((x) => x !== k.gh);
      I.dialog(k.gh.name, `"${other.name} যাইবেন? যাত্রী উঠাইয়া নিয়া যান।"`, [
        { label: `স্পিডবোটে যাত্রী নিয়ে ${other.name}`, note: 'পারিশ্রমিক ৳৫০০', act: () => this.start('boat', { from: k.gh, to: other }) },
      ]);
    }
  }
  // ---------- প্রতি ফ্রেম ----------
  update(dt) {
    const g = this.g, P = g.player, j = this.job;
    if (!j) return;
    j.t += dt;
    const inV = P.state === 'drive' && P.vehicle === j.veh;
    const V = j.veh;
    if (V && (V.burnt || (V.hp <= 0 && !V.air))) { this.cancel('যানবাহন নষ্ট হয়ে গেছে, চাকরি শেষ'); return; }
    if (j.stage === 'getin') {
      this.setMarker(V.x, V.z, V.y || 0, 0x3ddc84);
      j.tgt = { x: V.x, z: V.z };
      if (inV) this.begin();
      return;
    }
    if (!inV && P.state !== 'enter') {
      j.out = (j.out || 0) + dt;
      if (j.out > 30) { this.cancel('অনেকক্ষণ যানবাহনের বাইরে, চাকরি বাতিল'); return; }
    } else j.out = 0;
    if (j.limit) { j.left = j.limit - (j.t - j.t0); if (j.left <= 0) { this.timeUp(); return; } }
    if (j.kind === 'ambulance') this.updAmb(dt, inV);
    else if (j.kind === 'police') this.updPolice(dt, inV);
    else if (j.kind === 'plane' || j.kind === 'heli') this.updFlight(dt, inV);
    else if (j.kind === 'boat') this.updBoat(dt, inV);
    else if (j.kind === 'bus') this.updBus(dt, inV);
    else if (j.kind === 'share') this.updShare(dt, inV);
  }
  // বাস চালক: রুটের কাউন্টারে থেমে যাত্রী তোলা-নামানো
  nextStop() {
    const j = this.job, s = j.stops[j.idx];
    j.tgt = { x: s.stop.x, z: s.stop.z };
    j.t0 = j.t;
    j.limit = Math.round(Math.hypot(s.stop.x - j.veh.x, s.stop.z - j.veh.z) / 6 + 45);
    j.dwell = 0;
  }
  updBus(dt, inV) {
    const g = this.g, j = this.job, V = j.veh, s = j.stops[j.idx];
    if (!s) { this.cancel(''); return; }
    this.setMarker(s.stop.x, s.stop.z, 0, 0x3ddc84);
    if (j.dwell > 0) {
      j.dwell -= dt;
      j.t0 += dt; // থামার সময় ঘড়ি চলে না
      if (j.dwell <= 0) {
        j.idx++;
        if (j.idx >= j.stops.length) { this.finishOne(300, 'রুট শেষ, মালিকের বোনাস'); this.cancel(''); return; }
        this.nextStop();
      }
      return;
    }
    if (inV && Math.hypot(s.stop.x - V.x, s.stop.z - V.z) < 11 && Math.abs(V.speed) < 1.5) {
      const on = g.buses.takeRigs(s, 2 + Math.floor(Math.random() * 3));
      const off = Math.floor(Math.random() * 4);
      j.dwell = 3;
      g.sound.door();
      g.say(g.player.rig.root, 'হেলপার', pick([`${s.name}! ${s.name}!`, 'নামেন, তাড়াতাড়ি নামেন!', 'উঠেন উঠেন, সিট আছে!']), 2);
      this.finishOne((on + off) * 25 + 20, `${s.name}: ${bn(on)} জন উঠল, ${bn(off)} জন নামল`);
    }
  }
  // ইজিবাইক শেয়ার: স্ট্যান্ড থেকে তিনজন, একেকজনকে একেক জায়গায়
  updShare(dt, inV) {
    const g = this.g, j = this.job, V = j.veh;
    if (j.stage === 'pick') {
      this.setMarker(j.tgt.x, j.tgt.z, 0, 0x3ddc84);
      if (inV && Math.hypot(j.tgt.x - V.x, j.tgt.z - V.z) < 10 && Math.abs(V.speed) < 1.5) {
        g.buses.takeRigs(j.stand, 3);
        g.sound.door();
        j.drops = [];
        for (let i = 0; i < 3; i++) { const p = this.roadPoint(j.stand.x, j.stand.z, 120, 450, 4.4); if (p) j.drops.push({ x: p.x, z: p.z, who: pick(['মামা', 'আপা', 'চাচা', 'ভাই']) }); }
        j.stage = 'drop';
        j.t0 = j.t; j.limit = 240;
        g.ui.toast('তিনজন যাত্রী উঠল। একেকজনকে তার জায়গায় নামান', 'good');
      }
      return;
    }
    if (!j.drops.length) { this.cancel(''); return; }
    // সবচেয়ে কাছের যাত্রীর জায়গা
    j.drops.sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
    const dp = j.drops[0];
    j.tgt = { x: dp.x, z: dp.z };
    this.setMarker(dp.x, dp.z, 0, 0x3ddc84);
    if (inV && Math.hypot(dp.x - V.x, dp.z - V.z) < 9 && Math.abs(V.speed) < 1.5) {
      j.drops.shift();
      g.sound.door();
      this.finishOne(60 + Math.round(Math.max(0, j.left) / 4), `${dp.who} নামলেন`);
      if (!j.drops.length) this.cancel('');
    }
  }
  begin() {
    const j = this.job, g = this.g;
    if (j.kind === 'bus') { j.stage = 'route'; j.idx = 0; this.nextStop(); }
    else if (j.kind === 'share') { j.stage = 'pick'; j.tgt = { x: j.stand.spot.x, z: j.stand.spot.z }; g.ui.toast('স্ট্যান্ডে থামুন, যাত্রী উঠবে', 'good'); }
    else if (j.kind === 'ambulance') this.newPatient();
    else if (j.kind === 'police') this.newSuspect();
    else if (j.kind === 'plane') {
      const R = g.map.extras.runway;
      j.stage = 'fly';
      this.makeRings([
        { x: R.x1 - 60, y: 40, z: R.z }, { x: 650, y: 80, z: -250 }, { x: 350, y: 110, z: 330 },
        { x: -350, y: 100, z: 380 }, { x: -780, y: 80, z: -150 }, { x: -700, y: 45, z: R.z }, { x: R.x0 + 120, y: 14, z: R.z },
      ]);
      g.ui.toast('আংটিগুলোর ভিতর দিয়ে উড়ুন, শেষে রানওয়েতে নামুন', 'good');
    } else if (j.kind === 'heli') {
      j.stage = 'fly';
      const pl = g.map.places, st = g.map.pois.find((q) => q.k === 'station') || { x: 0, z: 0 };
      const stad = g.map.parks.find((p) => p.kind === 'stadium');
      const sc = stad ? { x: (stad.b.x0 + stad.b.x1) / 2, z: (stad.b.z0 + stad.b.z1) / 2 } : { x: -300, z: 200 };
      const H = pl.hospital;
      this.makeRings([{ x: 100, y: 40, z: -560 }, { x: st.x, y: 45, z: st.z }, { x: sc.x, y: 40, z: sc.z }, { x: H.x, y: H.h + 25, z: H.z + 40 }]);
      j.pad = { x: H.x, z: H.z, y: H.h };
      g.ui.toast('যাত্রীদের শহর দেখান: আংটি পার হয়ে হাসপাতালের ছাদের হেলিপ্যাডে নামুন', 'good');
    } else if (j.kind === 'boat') {
      j.stage = 'board';
      j.tgt = { x: j.from.pier.x0 + 8, z: j.from.z + 8 };
      g.ui.toast('জেটির পাশে আস্তে এসে থামুন, যাত্রী উঠবে', 'good');
    }
  }
  timeUp() {
    const j = this.job;
    const msg = { ambulance: j.stage === 'back' ? 'দেরি হয়ে গেল, রোগী বাঁচল না' : 'সময়মতো পৌঁছানো গেল না', police: 'অপরাধী পালিয়ে গেছে', boat: 'যাত্রীরা রাগ করে নেমে গেল' }[j.kind] || 'সময় শেষ';
    this.cancel(`${msg}। চাকরি শেষ, মোট আয় ৳${bnGroup(j.pay)}`);
  }
  // অ্যাম্বুলেন্স
  newPatient() {
    const g = this.g, j = this.job, H = g.map.places.hospital;
    const p = this.roadPoint(H.door.x, H.door.z, 150, 520, 4.4);
    if (!p) { this.cancel('রোগী পাওয়া গেল না'); return; }
    const off = p.s.width / 2 + 0.6;
    const x = p.x + p.s.dir.z * off, z = p.z - p.s.dir.x * off;
    const r = makeRig({ shirt: pick([0x8e24aa, 0x00897b, 0xfdd835]) });
    r.root.rotation.order = 'YXZ';
    r.root.rotation.set(-Math.PI / 2, rand(0, 6), 0);
    r.root.position.set(x, 0.14, z);
    setPose(r, 'down', 1, 0, 50);
    g.scene.add(r.root);
    j.patient = r;
    j.stage = 'go';
    j.tgt = { x, z };
    j.t0 = j.t;
    j.limit = Math.round(Math.hypot(x - g.player.pos.x, z - g.player.pos.z) / 8 + 35);
    g.ui.toast('রোগী আছে! সাইরেন বাজিয়ে দ্রুত যান', 'bad');
  }
  updAmb(dt, inV) {
    const g = this.g, j = this.job, V = j.veh, H = g.map.places.hospital;
    this.setMarker(j.tgt.x, j.tgt.z, 0, j.stage === 'go' ? 0xff4040 : 0x3ddc84);
    const d = Math.hypot(j.tgt.x - V.x, j.tgt.z - V.z);
    if (j.stage === 'go' && inV && d < 10 && Math.abs(V.speed) < 2) {
      g.scene.remove(j.patient.root); j.patient = null;
      g.sound.door();
      j.stage = 'back';
      j.tgt = { x: H.door.x, z: H.door.z };
      j.t0 = j.t;
      j.limit = Math.round(Math.hypot(H.door.x - V.x, H.door.z - V.z) / 8 + 35);
      g.ui.toast('রোগী তোলা হলো। হাসপাতালে নিয়ে যান!', 'good');
    } else if (j.stage === 'back' && inV && d < 14 && Math.abs(V.speed) < 2) {
      this.finishOne(250 + Math.round(Math.max(0, j.left) * 6), 'রোগী হাসপাতালে পৌঁছাল');
      this.newPatient();
    }
  }
  // পুলিশ
  newSuspect() {
    const g = this.g, j = this.job;
    const s = this.spawnSuspect();
    if (!s) { this.cancel('অপরাধী পাওয়া গেল না'); return; }
    j.suspect = s;
    j.stage = 'chase';
    j.t0 = j.t;
    j.limit = 180;
    g.ui.toast('ওয়্যারলেস: "চোরাই গাড়ি নিয়ে এক ছিনতাইকারী পালাচ্ছে! ধরুন!"', 'bad');
  }
  updPolice(dt, inV) {
    const g = this.g, j = this.job, s = j.suspect, P = g.player;
    if (!s) return;
    this.driveSuspect(s, dt);
    const v = s.v;
    j.tgt = { x: v.x, z: v.z };
    this.setMarker(v.x, v.z, 0, 0xff2020);
    const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z);
    if (d > 450) { this.timeUp(); return; }
    if (v.burnt) { this.finishOne(250, 'অপরাধী শেষ'); this.removeSuspect(s); this.newSuspect(); return; }
    // কাছে আর অপরাধীর গাড়ি থেমে গেছে (আটকে দিলে বা গাড়ি নষ্ট হলে): গ্রেফতার
    if (d < 9 && Math.abs(v.speed) < 2.5) s.catchT += dt; else s.catchT = Math.max(0, s.catchT - dt * 0.5);
    if (s.catchT > 1.3) {
      g.say(s.rig.root, 'অপরাধী', pick(['ঠিক আছে! ঠিক আছে! ধরা দিলাম!', 'আমি কিছু করি নাই স্যার!', 'মাইরেন না!']), 2.4);
      this.finishOne(600 + Math.round(Math.max(0, j.left) * 3), 'অপরাধী গ্রেফতার');
      this.removeSuspect(s);
      j.suspect = null;
      setTimeout(() => { if (this.job === j) this.newSuspect(); }, 2500);
    }
  }
  // বিমান আর হেলিকপ্টার
  updFlight(dt, inV) {
    const g = this.g, j = this.job, V = j.veh;
    const r = this.rings[this.ringI];
    if (j.stage === 'fly' && r) {
      j.tgt = { x: r.position.x, z: r.position.z };
      this.marker.visible = false;
      if (inV && Math.hypot(r.position.x - V.x, r.position.y - (V.y + 1.5), r.position.z - V.z) < 9) {
        g.sound.ping();
        this.ringI++;
        this.showRings();
        if (this.ringI >= this.rings.length) {
          j.stage = 'land';
          g.ui.toast(j.kind === 'plane' ? 'এবার রানওয়েতে নেমে থামুন' : 'হাসপাতালের ছাদের হেলিপ্যাডে নামুন', 'good');
        }
      }
    } else if (j.stage === 'land') {
      if (j.kind === 'plane') {
        const R = g.map.extras.runway;
        j.tgt = { x: (R.x0 + R.x1) / 2, z: R.z };
        if (inV && !V.airborne && V.speed < 3 && V.hp > 0 && Math.abs(V.z - R.z) < R.w && V.x > R.x0 && V.x < R.x1) {
          this.finishOne(1500, 'নিরাপদে নামলেন');
          this.cancel('');
        }
      } else {
        j.tgt = { x: j.pad.x, z: j.pad.z };
        this.setMarker(j.pad.x, j.pad.z, j.pad.y, 0x3ddc84);
        if (inV && Math.abs(V.y - j.pad.y) < 0.5 && Math.hypot(V.x - j.pad.x, V.z - j.pad.z) < 12 && Math.abs(V.speed) < 3) {
          this.finishOne(900, 'যাত্রীরা খুশি');
          this.cancel('');
        }
      }
    }
    if (V.hp <= 0 && V.burnt) this.cancel('দুর্ঘটনা! চাকরি শেষ');
  }
  // নৌকা
  updBoat(dt, inV) {
    const g = this.g, j = this.job, V = j.veh;
    const dockX = (gh) => gh.pier.x0 + 8;
    if (j.stage === 'board') {
      j.tgt = { x: dockX(j.from), z: j.from.z + 8 };
      this.setMarker(j.tgt.x, j.tgt.z, 0, 0x3ddc84);
      if (inV && Math.hypot(V.x - j.tgt.x, V.z - j.tgt.z) < 12 && Math.abs(V.speed) < 2) {
        for (const p of j.pass) g.scene.remove(p.root);
        j.pass = [];
        g.sound.door();
        j.stage = 'go';
        j.t0 = j.t;
        j.limit = 120;
        g.ui.toast(`যাত্রী উঠেছে। ${j.to.name}-এ নিয়ে যান`, 'good');
      }
    } else if (j.stage === 'go') {
      j.tgt = { x: dockX(j.to), z: j.to.z + 8 };
      this.setMarker(j.tgt.x, j.tgt.z, 0, 0x3ddc84);
      if (inV && Math.hypot(V.x - j.tgt.x, V.z - j.tgt.z) < 14 && Math.abs(V.speed) < 2) {
        this.finishOne(500 + Math.round(Math.max(0, j.left) * 3), `${j.to.name}-এ পৌঁছালেন`);
        this.cancel('');
      }
    }
  }
  hud() {
    const j = this.job;
    if (!j) return null;
    const txt = j.stage === 'getin' ? `${j.veh.spec.name}-এ উঠুন`
      : j.kind === 'bus' ? `কাউন্টার ${bn(j.idx + 1)}/${bn(j.stops.length)}: ${j.stops[j.idx] ? j.stops[j.idx].name : ''}`
      : j.kind === 'share' ? (j.stage === 'pick' ? 'স্ট্যান্ডে থামুন' : `যাত্রী নামান (বাকি ${bn(j.drops.length)} জন)`)
      : j.kind === 'ambulance' ? (j.stage === 'go' ? 'রোগীর কাছে যান' : 'হাসপাতালে নিয়ে যান')
      : j.kind === 'police' ? 'অপরাধীর গাড়ি আটকে থামান (কাছে গিয়ে)'
      : j.kind === 'boat' ? (j.stage === 'board' ? `${j.from.name}-এর জেটিতে থামুন` : `${j.to.name}-এ যান`)
      : j.stage === 'fly' ? `আংটি ${bn(this.ringI + 1)}/${bn(this.rings.length)}` : 'নামুন';
    return { type: NAMES[j.kind] || 'চাকরি', text: txt, left: j.limit && j.stage !== 'getin' ? Math.max(0, j.left ?? j.limit) : null };
  }
}
