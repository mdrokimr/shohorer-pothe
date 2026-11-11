// মিশন: মামুন ভাইয়ের গল্পের ৭টা মিশন (একটা শেষ হলে পরেরটা খোলে) আর বারবার খেলা যায় এমন পার্শ্ব মিশন
// ধরন: সময়ে ডেলিভারি, চোর ধরা, গ্যাংয়ের সাথে মারামারি, গাড়ি চুরি করে গ্যারেজে, রেস (চেকপয়েন্ট), দোকান/ব্যাংক লুট, পুলিশ এড়িয়ে পালানো
// শুরু: ম্যাপে হলুদ ★ (গল্প) বা নীল ◆ (পার্শ্ব) চিহ্নে গিয়ে বোতাম, অথবা ফোনের "মিশন" অংশ থেকে
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { makeRig } from './rig.js';
import { bn } from './utils.js';
import { bnGroup } from './ui.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const BOSS = 'মামুন ভাই';

// গল্প: প্রতিটা মিশন কয়েকটা ধাপ
const STORY = [
  { name: 'প্রথম কাজ', intro: 'নতুন আসছো? দেখি কেমন পারো। আমার বাইকটা নাও, একটা প্যাকেট পৌঁছাতে হবে, দেরি করবা না!', pay: 1500,
    steps: [{ k: 'vehicle', type: 'bike', text: 'মামুন ভাইয়ের বাইকে উঠুন' }, { k: 'goto', far: [250, 450], text: 'প্যাকেট আনতে যান' }, { k: 'deliver', far: [350, 600], time: 1.0, text: 'প্যাকেট পৌঁছে দিন' }] },
  { name: 'চোর ধরো', intro: 'আমার দোকান থেকে টাকা নিয়া এক চোর বাইকে পালাইতেছে! ধরো ওরে, দরকার হলে চাকায় গুলি করো!', pay: 2500,
    steps: [{ k: 'thief', text: 'চোরকে ধরুন: ধাক্কা দিন বা চাকায় গুলি করুন' }] },
  { name: 'গ্যাং সামলাও', intro: 'পল্লবীর দিকে কয়েকটা পোলাপান আমার লোকদের জ্বালাইতেছে। গিয়া একটু শিক্ষা দিয়া আসো।', pay: 3000,
    steps: [{ k: 'goto', far: [200, 400], text: 'গ্যাংয়ের আড্ডায় যান' }, { k: 'fight', n: 3, text: 'গ্যাংয়ের তিনজনকে কাবু করুন' }] },
  { name: 'গাড়ি তুলে আনো', intro: 'একটা লাল গাড়ি পার্ক করা আছে, মালিক আমার টাকা মারছে। গাড়িটা গ্যারেজে আনো, বেশি ভাঙবা না।', pay: 4000,
    steps: [{ k: 'steal', type: 'car', far: [250, 450], text: 'লাল গাড়িটা চুরি করুন' }, { k: 'garage', far: [300, 550], minHp: 0.4, text: 'গ্যারেজে আনুন (গাড়ি বেশি ভাঙবেন না)' }] },
  { name: 'রাস্তার রেস', intro: 'পারভেজ বলে ওর চেয়ে জোরে কেউ চালাইতে পারে না। দেখাও তো ওরে! সব চেকপয়েন্ট সময়ের মধ্যে।', pay: 5000,
    steps: [{ k: 'vehicle', type: 'car', text: 'রেসের গাড়িতে উঠুন' }, { k: 'race', n: 6, text: 'সব চেকপয়েন্ট পার হন' }] },
  { name: 'দোকান লুট', intro: 'এবার একটু ঝুঁকির কাজ। যেকোনো দোকানের ক্যাশ খালি করো, তারপর পুলিশের হাত থেকে পালাও।', pay: 6000,
    steps: [{ k: 'shoprob', text: 'যেকোনো দোকানে ডাকাতি করুন (পিস্তল তাক করে দোকানদারকে)' }, { k: 'escape', text: 'পুলিশকে ফাঁকি দিন' }] },
  { name: 'বড় দান', intro: 'শেষ কাজ, বড় কাজ। ব্যাংক! ভল্টের টাকা নিয়া পালাও, তারপর আমি তোমারে মিরপুরের বড় ভাই বানাব।', pay: 15000,
    steps: [{ k: 'heist', text: 'ব্যাংকে ডাকাতি করুন (পিস্তল লাগবে)' }, { k: 'escape', text: 'পুলিশকে ফাঁকি দিন' }, { k: 'goto', far: [150, 300], text: 'মামুন ভাইয়ের গোপন আস্তানায় যান' }] },
];
// পার্শ্ব মিশন (প্রতিবার নতুন জায়গা)
const SIDE = [
  { name: 'জরুরি ডেলিভারি', pay: [900, 1600], steps: [{ k: 'goto', far: [120, 250], text: 'জিনিস তুলুন' }, { k: 'deliver', far: [300, 550], time: 0.9, text: 'সময়ের মধ্যে পৌঁছে দিন' }] },
  { name: 'ছিনতাইকারী ধরো', pay: [1500, 2400], steps: [{ k: 'thief', text: 'ছিনতাইকারীকে ধরুন' }] },
  { name: 'মাস্তান সামলাও', pay: [1400, 2200], steps: [{ k: 'goto', far: [150, 320], text: 'মাস্তানদের কাছে যান' }, { k: 'fight', n: 2, text: 'দুই মাস্তানকে কাবু করুন' }] },
  { name: 'গাড়ি চুরি', pay: [2000, 3200], steps: [{ k: 'steal', type: 'car', far: [200, 400], text: 'চিহ্নিত গাড়িটা চুরি করুন' }, { k: 'garage', far: [250, 450], minHp: 0.3, text: 'গ্যারেজে আনুন' }] },
  { name: 'টাইম রেস', pay: [1800, 2800], steps: [{ k: 'race', n: 5, text: 'সব চেকপয়েন্ট পার হন' }] },
];

export class Missions {
  constructor(g) {
    this.g = g;
    this.story = this.load();
    this.active = null;
    this.side = [];
    // মামুন ভাইয়ের ঠিকানা: শুরুর জায়গার কাছে রাস্তার পাশে
    const sp = g.map.spawn || { x: 0, z: 0 };
    this.bossAt = this.roadPoint(sp.x, sp.z, 30, 70) || { x: sp.x + 20, z: sp.z };
    this.makeSide();
    this.buildMarkers();
    this.el = document.createElement('div');
    this.el.className = 'mission-obj hidden';
    (document.getElementById('hud') || document.body).appendChild(this.el);
  }
  load() { try { return +(localStorage.getItem('sp_story') || 0) || 0; } catch (e) { return 0; } }
  saveStory() { try { localStorage.setItem('sp_story', String(this.story)); } catch (e) { /* ঠিক আছে */ } }
  // কোনো বিন্দু থেকে min-max দূরে রাস্তার উপর একটা জায়গা
  roadPoint(x, z, min, max, mainOnly) {
    const S = this.g.map.segments;
    for (let i = 0; i < 80; i++) {
      const s = S[Math.floor(Math.random() * S.length)];
      if (!s || s.len < 20 || s.type === 'service' || (mainOnly && !s.main) || s.width < 5) continue;
      const t = rand(6, s.len - 6), px = s.ax + s.dir.x * t, pz = s.az + s.dir.z * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < min || d > max) continue;
      const n = { x: s.dir.z, z: -s.dir.x }, off = s.width / 2 - 1.2; // রাস্তার বাম কিনারা ঘেঁষে
      return { x: px + n.x * off, z: pz + n.z * off, yaw: Math.atan2(-s.dir.x, -s.dir.z), seg: s };
    }
    return null;
  }
  makeSide() {
    const P = this.g.player.pos;
    while (this.side.length < 3) {
      const def = SIDE[Math.floor(Math.random() * SIDE.length)];
      if (this.side.some((q) => q.def === def)) continue;
      const at = this.roadPoint(P.x, P.z, 120, 450);
      if (!at) break;
      this.side.push({ def, at, pay: Math.round(rand(def.pay[0], def.pay[1]) / 50) * 50 });
    }
  }
  // ম্যাপের উপর আলোর স্তম্ভ (GTA-র মতো): হলুদ = গল্প, নীল = পার্শ্ব, সবুজ = লক্ষ্য
  buildMarkers() {
    const geo = new THREE.CylinderGeometry(1.2, 1.2, 4, 18, 1, true);
    const mk = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beams = [];
    for (const c of [0xffc107, 0x42a5f5, 0x42a5f5, 0x42a5f5, 0x4caf50]) {
      const m = new THREE.Mesh(geo, mk(c)); m.position.y = 2; m.visible = false; m.userData.noShadow = true;
      this.g.scene.add(m); this.beams.push(m);
    }
    // রেসের চেকপয়েন্ট: বড় হলুদ রিং
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.25, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.85 }));
    this.ring.visible = false; this.g.scene.add(this.ring);
  }
  placeBeams() {
    const B = this.beams, A = this.active;
    const st = !A && this.story < STORY.length ? this.bossAt : null;
    B[0].visible = !!st; if (st) B[0].position.set(st.x, 2, st.z);
    for (let i = 0; i < 3; i++) { const q = !A && this.side[i]; B[1 + i].visible = !!q; if (q) B[1 + i].position.set(q.at.x, 2, q.at.z); }
    const t = A && A.tgt;
    B[4].visible = !!(t && !A.raceRing); if (t) B[4].position.set(t.x, 2, t.z);
  }
  // কাছের মিশন চিহ্ন (বোতাম চাপলে শুরু)
  near() {
    if (this.active || this.g.inside) return null;
    const P = this.g.player, p = P.state === 'drive' ? { x: P.vehicle.x, z: P.vehicle.z } : P.pos;
    if (P.state !== 'foot' && P.state !== 'drive') return null;
    if (this.story < STORY.length && Math.hypot(p.x - this.bossAt.x, p.z - this.bossAt.z) < 3.5) return { story: true };
    for (const q of this.side) if (Math.hypot(p.x - q.at.x, p.z - q.at.z) < 3.5) return { side: q };
    return null;
  }
  prompt(n, key) { return n.story ? `${key}: গল্পের মিশন "${STORY[this.story].name}"` : `${key}: মিশন "${n.side.def.name}" (৳${bnGroup(n.side.pay)})`; }
  startNear(n) { if (n.story) this.startStory(); else this.startSide(n.side); }
  startStory() {
    if (this.active || this.story >= STORY.length) return false;
    const def = STORY[this.story];
    this.begin(def, def.pay, true);
    this.g.ui.toast(`📱 ${BOSS}: ${def.intro}`, 'good');
    return true;
  }
  startSide(q) {
    if (this.active) return false;
    this.side.splice(this.side.indexOf(q), 1);
    this.begin(q.def, q.pay, false);
    return true;
  }
  begin(def, pay, story) {
    const g = this.g;
    if (g.work && g.work.job) g.work.cancel('');
    if (g.jobs && g.jobs.active) g.cancelJob();
    this.active = { def, pay, story, i: -1, t: 0, spawned: [], cleanup: [] };
    g.sound.ping();
    this.next();
  }
  // পরের ধাপ
  next() {
    const A = this.active, g = this.g, P = g.player;
    A.i++;
    A.tgt = null; A.timer = null; A.raceRing = false; this.ring.visible = false;
    g.setMark(null);
    if (A.i >= A.def.steps.length) { this.complete(); return; }
    const s = A.step = A.def.steps[A.i];
    const here = P.state === 'drive' ? { x: P.vehicle.x, z: P.vehicle.z } : P.pos;
    const pt = (far) => this.roadPoint(here.x, here.z, far[0], far[1]) || this.roadPoint(here.x, here.z, 60, 900);
    switch (s.k) {
      case 'vehicle': {
        const at = this.roadPoint(here.x, here.z, 6, 25) || { x: here.x + 5, z: here.z, yaw: 0 };
        const v = this.spawnVehicle(s.type, at, s.type === 'car' ? 0xd32f2f : undefined);
        A.mv = v; A.tgt = { x: v.x, z: v.z };
        break;
      }
      case 'goto': A.tgt = pt(s.far); break;
      case 'deliver': {
        A.tgt = pt(s.far);
        const d = Math.hypot(A.tgt.x - here.x, A.tgt.z - here.z);
        A.timer = Math.round((d / 9 + 18) * s.time);
        break;
      }
      case 'garage': A.tgt = pt(s.far); A.garage = true; break;
      case 'steal': {
        const at = pt(s.far);
        A.mv = this.spawnVehicle(s.type, at, 0xc62828);
        A.tgt = { x: at.x, z: at.z };
        break;
      }
      case 'thief': this.spawnThief(here); break;
      case 'fight': A.gang = null; A.tgt = { x: here.x, z: here.z }; this.spawnGang(s.n, here); break;
      case 'race': {
        // নেভিগেশনের পথ ধরে চেকপয়েন্ট
        const end = this.roadPoint(here.x, here.z, 450, 800, true) || pt([400, 800]);
        const r = g.nav.route(here.x, here.z, end.x, end.z) || [];
        const pts = [];
        let acc = 0;
        for (let k = 1; k < r.length; k++) { acc += Math.hypot(r[k].x - r[k - 1].x, r[k].z - r[k - 1].z); if (acc > 70) { pts.push(r[k]); acc = 0; } }
        if (!pts.length || Math.hypot(pts[pts.length - 1].x - end.x, pts[pts.length - 1].z - end.z) > 20) pts.push(end);
        A.cps = pts.slice(0, Math.max(3, s.n)); A.cp = 0;
        const total = A.cps.reduce((a, p, k) => a + Math.hypot(p.x - (k ? A.cps[k - 1].x : here.x), p.z - (k ? A.cps[k - 1].z : here.z)), 0);
        A.timer = Math.round(total / 12.5 + 12);
        A.tgt = A.cps[0]; A.raceRing = true;
        break;
      }
      case 'shoprob': A.rob0 = g.robbery ? (g.robbery.count || 0) : 0; break;
      case 'heist': A.heist0 = g.life ? (g.life.bankRobbed || -1) : -1; A.tgt = this.bankDoor(); break;
      case 'escape':
        if (g.law.stars === 0) g.law.offense('warrant');
        break;
    }
    if (A.tgt && s.k !== 'race') g.setMark(A.tgt.x, A.tgt.z);
    else if (s.k === 'race') g.setMark(A.cps[0].x, A.cps[0].z);
    this.say(s.text);
  }
  bankDoor() {
    const d = this.g.interiors.doors.find((x) => x.kind === 'bank');
    return d ? (d.b.entry || d.b.door) : null;
  }
  say(t) { this.g.ui.toast(`🎯 ${t}`, ''); }
  spawnVehicle(type, at, color) {
    const g = this.g;
    const v = new Vehicle(g.scene, type, { x: at.x, z: at.z, yaw: at.yaw || 0, color });
    v.mission = true;
    g.vehicles.push(v);
    this.active.spawned.push(v);
    return v;
  }
  spawnThief(here) {
    const g = this.g, T = g.traffic, A = this.active;
    let c = null;
    for (let k = 0; k < 10 && !c; k++) {
      const at = this.roadPoint(here.x, here.z, 40, 90);
      if (!at) continue;
      const v = new Vehicle(g.scene, 'bike', { ai: true, x: at.x, z: at.z, yaw: at.yaw });
      const d = makeRig({ shirt: 0x212121, pants: 0x263238, cap: 0x111111 });
      v.g.add(d.root); d.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
      const s = at.seg, fwd = Math.random() < 0.5 || !!s.oneway;
      c = { v, seg: s, fwd, cruise: 15, rig: d, honk: 99, along: 0, stuck: 0, bypass: 0, dead: false, keep: true, thief: true, runRed: true };
      v.yaw = Math.atan2(-(fwd ? s.dir.x : -s.dir.x), -(fwd ? s.dir.z : -s.dir.z));
      v.speed = 10;
      T.cars.push(c);
    }
    A.thief = c; A.catchT = 0;
  }
  spawnGang(n, here) {
    const g = this.g, T = g.traffic, A = this.active;
    A.gang = [];
    A.gangSpawn = { n, x: here.x, z: here.z };
  }
  realizeGang() {
    const g = this.g, T = g.traffic, A = this.active, P = g.player;
    const { n } = A.gangSpawn;
    const looks = [{ shirt: 0x111111, pants: 0x1a237e, cap: 0xb71c1c }, { shirt: 0x7f0000, pants: 0x212121 }, { shirt: 0x263238, pants: 0x3e2723, cap: 0x111111 }];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = P.pos.x + Math.cos(a) * 6, z = P.pos.z + Math.sin(a) * 6;
      const rig = makeRig({ ...looks[k % looks.length], real: true });
      g.scene.add(rig.root);
      const p = T.adoptPerson(rig, x, z, Math.atan2(-(P.pos.x - x), -(P.pos.z - z)), { mode: 'fight', t: 9999, said: 0, hitCd: 1 + k * 0.4, wind: 0, kind: 'fight', chaseCar: true });
      p.gang = true; p.health = 70;
      A.gang.push(p);
    }
    A.gangSpawn = null;
    g.ui.toast('"কী রে, কী চাস?" মাস্তানেরা তেড়ে আসছে!', 'bad');
  }
  // GPS-এর লক্ষ্য
  target() {
    const A = this.active;
    if (!A) return null;
    if (A.step && A.step.k === 'thief' && A.thief) return { x: A.thief.v.x, z: A.thief.v.z };
    if (A.step && A.step.k === 'race') return A.cps[A.cp];
    if (A.step && A.step.k === 'vehicle' && A.mv) return { x: A.mv.x, z: A.mv.z };
    return A.tgt;
  }
  fail(why) {
    const A = this.active; if (!A) return;
    this.g.ui.toast(`❌ মিশন ব্যর্থ: ${why}`, 'bad');
    this.end(false);
  }
  complete() {
    const A = this.active, g = this.g;
    g.money += A.pay; g.sound.money();
    if (A.story) {
      this.story++; this.saveStory();
      const last = this.story >= STORY.length;
      g.ui.toast(`✅ মিশন সফল: "${A.def.name}" · ৳${bnGroup(A.pay)}${last ? ' · গল্প শেষ! আপনি এখন মিরপুরের বড় ভাই 👑' : ` · ${BOSS}: "সাবাশ! পরের কাজের জন্য আমার কাছে আসো"`}`, 'money');
    } else g.ui.toast(`✅ মিশন সফল: "${A.def.name}" · ৳${bnGroup(A.pay)}`, 'money');
    g.save();
    this.end(true);
  }
  end(ok) {
    const A = this.active, g = this.g;
    if (!A) return;
    // মিশনের জিনিস সরানো (চড়ে থাকা যানবাহন ছাড়া)
    for (const v of A.spawned) {
      if (g.player.vehicle === v) { v.mission = false; continue; }
      const i = g.vehicles.indexOf(v); if (i >= 0) g.vehicles.splice(i, 1);
      g.scene.remove(v.g);
    }
    if (A.thief) { const T = g.traffic; if (T.cars.includes(A.thief)) T.removeCar(A.thief); }
    if (A.gang) for (const p of A.gang) { p.gang = false; if (p.react && p.react.mode === 'fight') p.react.t = 1; }
    this.active = null;
    this.ring.visible = false;
    g.setMark(null);
    this.el.classList.add('hidden');
    this.makeSide();
  }
  cancel() { if (this.active) { this.g.ui.toast('মিশন বাতিল করলেন', ''); this.end(false); } }
  update(dt) {
    const A = this.active, g = this.g, P = g.player;
    this.placeBeams();
    if (!A) return;
    A.t += dt;
    if (P.state === 'dead' || g.state === 'wasted') { this.fail('আপনি আহত হয়ে হাসপাতালে'); return; }
    if (g.state === 'busted') { this.fail('পুলিশে ধরা পড়লেন'); return; }
    const s = A.step;
    const pos = P.state === 'drive' ? { x: P.vehicle.x, z: P.vehicle.z } : P.pos;
    const dist = (t) => (t ? Math.hypot(pos.x - t.x, pos.z - t.z) : 1e9);
    if (A.timer !== null && A.timer !== undefined) { A.timer -= dt; if (A.timer <= 0) { this.fail('সময় শেষ'); return; } }
    if (A.mv && A.mv.hp <= 0 && (s.k === 'deliver' || s.k === 'garage' || s.k === 'vehicle' || s.k === 'steal')) { this.fail('মিশনের গাড়ি ধ্বংস হয়ে গেছে'); return; }
    let txt = s.text;
    switch (s.k) {
      case 'vehicle': if (P.state === 'drive' && P.vehicle === A.mv) this.next(); break;
      case 'goto': if (dist(A.tgt) < 6) this.next(); txt += ` · ${bn(Math.round(dist(A.tgt)))} মি`; break;
      case 'deliver': if (dist(A.tgt) < 6) this.next(); txt += ` · ${bn(Math.round(dist(A.tgt)))} মি`; break;
      case 'steal': if (P.state === 'drive' && P.vehicle === A.mv) { g.law.offense('steal', A.mv.x, A.mv.z); this.next(); } break;
      case 'garage':
        if (P.state !== 'drive' || P.vehicle !== A.mv) txt = 'চুরি করা গাড়িতে ফিরে যান';
        else if (dist(A.tgt) < 7) { if (A.mv.hp / A.mv.maxHp < s.minHp) { this.fail('গাড়ি বেশি ভেঙে গেছে, গ্যারেজ নেবে না'); return; } this.next(); }
        else txt += ` · ক্ষতি ${bn(Math.round((1 - A.mv.hp / A.mv.maxHp) * 100))}%`;
        break;
      case 'thief': {
        const c = A.thief;
        if (!c) { this.fail('চোর পালিয়ে গেছে'); return; }
        const d = Math.hypot(pos.x - c.v.x, pos.z - c.v.z);
        if (d > 400) { this.fail('চোর হারিয়ে গেছে'); return; }
        // কাছে গিয়ে থামিয়ে দিলে (ধাক্কা/পাংচার/গতি কম) ধরা
        if (d < 5 && (c.v.speed < 4 || c.v.flats || c.v.hp < c.v.maxHp * 0.6)) A.catchT += dt; else A.catchT = Math.max(0, A.catchT - dt);
        if (c.v.flats || c.v.hp < c.v.maxHp * 0.6) c.cruise = 4;
        if (A.catchT > 1.2 || c.dead) { g.ui.toast('চোর ধরা পড়ল! টাকার ব্যাগ উদ্ধার', 'good'); this.next(); return; }
        txt += ` · ${bn(Math.round(d))} মি দূরে`;
        break;
      }
      case 'fight': {
        if (A.gangSpawn) { if (dist(A.tgt) < 30) this.realizeGang(); txt = 'আড্ডার জায়গায় যান'; break; }
        const left = A.gang.filter((p) => g.traffic.peds.includes(p) && !p.koed && !(p.react && (p.react.mode === 'down' || p.react.mode === 'dead'))).length;
        // মাস্তানেরা মারামারি চালিয়ে যায়
        for (const p of A.gang) if (g.traffic.peds.includes(p) && !p.koed && p.react && p.react.mode !== 'fight' && p.react.mode !== 'down' && p.react.mode !== 'dead' && p.react.mode !== 'fly') g.traffic.setReact(p, { mode: 'fight', t: 9999, said: 1, hitCd: 1, wind: 0, kind: 'fight', chaseCar: true });
        if (left === 0) { g.ui.toast('মাস্তানেরা কাবু!', 'good'); this.next(); return; }
        txt += ` · বাকি ${bn(left)} জন`;
        break;
      }
      case 'race': {
        if (P.state !== 'drive') txt = 'যানবাহনে উঠে চেকপয়েন্টে যান';
        const cp = A.cps[A.cp];
        this.ring.visible = true; this.ring.position.set(cp.x, 3.4, cp.z);
        const nx = A.cps[A.cp + 1] || cp; this.ring.rotation.y = Math.atan2(nx.x - cp.x, nx.z - cp.z) + Math.PI / 2;
        if (P.state === 'drive' && dist(cp) < 7) {
          A.cp++; g.sound.ping();
          if (A.cp >= A.cps.length) { this.next(); return; }
          g.setMark(A.cps[A.cp].x, A.cps[A.cp].z);
        }
        txt = `চেকপয়েন্ট ${bn(A.cp + 1)}/${bn(A.cps.length)}`;
        break;
      }
      case 'shoprob': if (g.robbery && (g.robbery.count || 0) > A.rob0) this.next(); break;
      case 'heist': if (g.life && (g.life.bankRobbed || -1) > A.heist0) this.next(); break;
      case 'escape': if (g.law.stars === 0 && A.t > 2) { g.ui.toast('পুলিশকে ফাঁকি দিলেন!', 'good'); this.next(); return; } txt += ` · ${'★'.repeat(g.law.stars)}`; break;
    }
    if (!this.active) return;
    const tm = A.timer != null ? ` · ⏱ ${bn(Math.floor(A.timer / 60))}:${String(Math.floor(A.timer % 60)).padStart(2, '0').replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d])}` : '';
    this.el.classList.remove('hidden');
    this.el.textContent = `${A.def.name}: ${txt}${tm}`;
  }
  // ফোনের তালিকা
  list() {
    const out = [];
    if (this.active) return [{ active: true, name: this.active.def.name, sub: this.active.step ? this.active.step.text : '' }];
    if (this.story < STORY.length) out.push({ story: true, name: `★ ${STORY[this.story].name}`, sub: `গল্প ${bn(this.story + 1)}/${bn(STORY.length)} · ${BOSS}`, pay: STORY[this.story].pay });
    else out.push({ done: true, name: '👑 গল্প শেষ', sub: 'সব গল্পের মিশন শেষ করেছেন' });
    for (const q of this.side) out.push({ side: q, name: `◆ ${q.def.name}`, sub: 'পার্শ্ব মিশন', pay: q.pay });
    return out;
  }
  markers() {
    const m = [];
    if (!this.active && this.story < STORY.length) m.push({ x: this.bossAt.x, z: this.bossAt.z, color: '#ffb300', label: '★', r: 9, noClamp: false, name: `মিশন: ${STORY[this.story].name}` });
    if (!this.active) for (const q of this.side) m.push({ x: q.at.x, z: q.at.z, color: '#1e88e5', label: '◆', r: 7, name: q.def.name });
    return m;
  }
}
