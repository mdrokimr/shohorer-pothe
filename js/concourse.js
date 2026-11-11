// মেট্রো স্টেশনের ভিতর (কনকোর্স): টিকিট কাউন্টারে লোকজনের লাইন, টিকিট মেশিন, ফেয়ার গেট, চলন্ত সিঁড়ি
import * as THREE from 'three';
import { makeRig, setPose } from './rig.js';
import { planeGeo, texMat, canvasTex } from './lib3d.js';
import { signTex } from './textures.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';

const LANES = [-3, -1, 1, 3];
const GATE_Z = -4;
const QX = -8.5, QZ0 = -0.2, QSTEP = 0.9;
const ESC_X = 7, ESC_Z0 = -5.2, ESC_Z1 = -9.7, ESC_TOP = 4.1;
const SERVE = 4.5;
const GUARD_X0 = -2.5, GUARD_X1 = 9.5, GUARD_Z = -2.2, GUARD_V = 5.3, FINE = 100;
const CLERK = ['কোথায় যাবেন?', 'খুচরা দেন প্লিজ।', 'পরের জন আসেন!'];

export class Concourse {
  constructor(I, Room) {
    this.I = I; this.g = I.g;
    const r = (this.room = new Room(this.g, 'metro', 5, 26, 20));
    this.build(r);
    this.queue = [];
    this.walkers = [];
    this.serveT = SERVE;
    this.spawnT = 0;
    this.downT = 6;
    this.lanes = LANES.map((x) => ({ x, open: 0, flap: null, box: null }));
    this.buildGates(r);
    // নিরাপত্তাকর্মী: গেটের সামনে টহল দেয়, টিকিট ছাড়া কেউ টপকালে বাঁশি বাজিয়ে ধাওয়া করে
    const gr = makeRig({ shirt: 0x5d4037, pants: 0x3e2723, cap: 0x3e2723 });
    gr.root.position.set(GUARD_X0, 0.16, GUARD_Z);
    r.grp.add(gr.root);
    this.guard = { rig: gr, x: GUARD_X0, z: GUARD_Z, yaw: -Math.PI / 2, dir: 1, look: 0, chase: null, cool: 0 };
    this.vault = null;
    for (let k = 0; k < 4; k++) this.queue.push({ rig: this.person(QX, QZ0 + k * QSTEP, 0) });
  }
  build(r) {
    const W = 0x1f7a3d;
    // টিকিট কাউন্টার আর ক্লার্ক
    r.box(3.2, 1.1, 0.8, 0xeceff1, QX, 0.55, -1.2, true);
    r.box(3.2, 1.2, 0.05, 0x9fd3e6, QX, 1.75, -1.2);
    r.box(3.4, 0.5, 0.1, W, QX, 2.65, -1.25);
    for (const x of [QX - 0.8, QX + 0.8]) r.person({ shirt: 0x1f7a3d, pants: 0x263238, female: x < QX }, x, -2.1, Math.PI, 'phone');
    r.sign('টিকিট কাউন্টার', 'road', QX, 3.4, -1.3, 3.4);
    // টিকিট মেশিন
    for (const z of [1, 3, 5]) { r.box(0.8, 1.7, 0.7, 0x37474f, 11.6, 0.85, z, true); r.box(0.06, 0.5, 0.45, 0x4fc3f7, 11.18, 1.25, z); }
    r.sign('টিকিট মেশিন · এমআরটি পাস রিচার্জ', 'road', 11.0, 2.6, 3, 4).rotation.y = -Math.PI / 2;
    // গেটের সারি: মাঝের বাক্স আর দুই পাশে কাচের বেড়া
    for (const x of [-2, 0, 2]) r.box(1.1, 1.05, 1.4, 0xb0bec5, x, 0.52, GATE_Z, true);
    r.box(9.6, 1.1, 0.12, 0x9fd3e6, -8.25, 0.55, GATE_Z, true);
    r.box(9.6, 1.1, 0.12, 0x9fd3e6, 8.25, 0.55, GATE_Z, true);
    for (const x of [-3.55, 3.55]) r.box(0.12, 1.05, 1.4, 0xb0bec5, x, 0.52, GATE_Z, true);
    r.sign('প্রবেশ: কার্ড/টিকিট ছোঁয়ান', 'road', 0, 3.2, GATE_Z, 5);
    // নিরাপত্তাকর্মী আর ব্যাগ স্ক্যানার
    r.box(1.0, 0.9, 1.6, 0x607d8b, 6.8, 0.45, -2.2, true);
    // চলন্ত সিঁড়ি: দুই পাশে, উপরে উঠে যায়
    const ang = Math.atan2(ESC_TOP, ESC_Z0 - ESC_Z1), len = Math.hypot(ESC_TOP, ESC_Z0 - ESC_Z1);
    this.stepTex = canvasTex(32, 64, (gc) => { gc.fillStyle = '#5f6b72'; gc.fillRect(0, 0, 32, 64); gc.fillStyle = '#3a4248'; for (let y = 0; y < 64; y += 8) gc.fillRect(0, y, 32, 3); }, true);
    this.stepTex.repeat.set(1, 6);
    const stepM = new THREE.MeshLambertMaterial({ map: this.stepTex, emissive: 0x222222 });
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, len), stepM);
      m.position.set(sx * ESC_X, ESC_TOP / 2, (ESC_Z0 + ESC_Z1) / 2);
      m.rotation.x = ang;
      r.grp.add(m);
      for (const ox of [-0.75, 0.75]) { const rail = r.box(0.12, 1.0, len, 0x263238, sx * ESC_X + ox, ESC_TOP / 2 + 0.6, (ESC_Z0 + ESC_Z1) / 2); rail.rotation.x = ang; }
      r.g.world.addBox(r.X + sx * ESC_X - 0.9, r.X + sx * ESC_X + 0.9, r.Z + ESC_Z1 - 0.2, r.Z + ESC_Z0 - 1.4, 4, 'room');
    }
    this.signL = r.sign('প্ল্যাটফর্ম', 'road', -ESC_X, 3.5, ESC_Z0 + 0.4, 3.6);
    this.signR = r.sign('প্ল্যাটফর্ম', 'road', ESC_X, 3.5, ESC_Z0 + 0.4, 3.6);
    this.nameSign = r.sign('মেট্রো স্টেশন', 'road', 0, 3.4, -9.8, 8);
    r.box(0.08, 2.4, 1.4, 0x546e7a, 0, 1.2, -9.85);
    // লাইনের ম্যাপ বোর্ড
    r.sign('মিরপুর ১১ ━ মিরপুর ১০ ━ কাজীপাড়া ━ … মতিঝিল', 'road', -12.85, 2.4, 6, 6).rotation.y = Math.PI / 2;
    r.spots.push(
      { x: QX, z: 2.4, r: 3.4, label: 'লাইনে দাঁড়িয়ে টিকিট কিনুন', act: 'mq' },
      { x: 10.6, z: 3, r: 2.3, label: 'টিকিট মেশিন', act: 'mtm' },
      { x: -ESC_X, z: ESC_Z0 - 0.4, r: 1.5, label: 'চলন্ত সিঁড়িতে প্ল্যাটফর্মে', act: 'escL' },
      { x: ESC_X, z: ESC_Z0 - 0.4, r: 1.5, label: 'চলন্ত সিঁড়িতে প্ল্যাটফর্মে', act: 'escR' },
      { x: 0, z: -8.9, r: 1.6, label: 'স্টাফ রুম: মেট্রো চালান / চালকের চাকরি', act: 'staff' },
    );
  }
  buildGates(r) {
    const W = this.g.world;
    for (const L of this.lanes) {
      L.flap = r.box(0.8, 0.6, 0.06, 0xd32f2f, L.x, 0.75, GATE_Z);
      L.box = W.addBox(r.X + L.x - 0.45, r.X + L.x + 0.45, r.Z + GATE_Z - 0.12, r.Z + GATE_Z + 0.12, 1.1, 'room');
    }
  }
  person(x, z, yaw) {
    const female = Math.random() < 0.4;
    const rig = makeRig({ female, skirt: female ? pick([0xc2185b, 0x00897b, 0x5e35b1]) : undefined, kurta: !female && Math.random() < 0.3 });
    rig.root.position.set(x, 0.16, z);
    rig.root.rotation.set(0, yaw, 0);
    this.room.grp.add(rig.root);
    return rig;
  }
  walk(rig, path, done) { this.walkers.push({ rig, path, i: 0, done }); }
  // কোন সিঁড়ি কোন দিকের প্ল্যাটফর্মে
  lineFor(side, st) {
    if (side < 0) return st.i === 2 ? 'B' : 'A'; // বাঁয়ে: কাজীপাড়ার দিকে
    return st.i === 0 ? 'A' : 'B'; // ডানে: মিরপুর ১১-এর দিকে
  }
  onEnter(st, fromPlatform) {
    const P = this.g.player, r = this.room;
    this.st = st;
    this.guard.chase = null; this.vault = null;
    this.nameSign.material = texMat(signTex(`${st.name} মেট্রো স্টেশন`, 'road'));
    const name = (line) => (line === 'A' ? 'কাজীপাড়ার দিকে' : 'মিরপুর ১১-এর দিকে');
    this.signL.material = texMat(signTex(`প্ল্যাটফর্ম: ${name(this.lineFor(-1, st))}`, 'road'));
    this.signR.material = texMat(signTex(`প্ল্যাটফর্ম: ${name(this.lineFor(1, st))}`, 'road'));
    if (fromPlatform) { P.place(r.X - 1, r.Z - 6.5, Math.PI); P.y = 0; this.g.camYaw = Math.PI; }
  }
  // ---------- প্রতি ফ্রেম ----------
  update(dt) {
    const g = this.g, P = g.player, r = this.room;
    this.stepTex.offset.y = (this.stepTex.offset.y + dt * 0.6) % 1;
    // কাউন্টারে সামনের জন টিকিট নিয়ে গেটের দিকে
    this.serveT -= dt;
    if (this.serveT <= 0 && this.queue.length) {
      this.serveT = SERVE;
      const q = this.queue.shift();
      if (q.player) {
        this.I.inQueue = false;
        g.say(this.room.npcs[0].rig.root, 'কাউন্টার', pick(CLERK), 2);
        this.ticketDialog(false);
      } else {
        const lane = pick(this.lanes), side = Math.random() < 0.5 ? -1 : 1;
        this.walk(q.rig, [[lane.x, GATE_Z + 1.2], [lane.x, GATE_Z - 1.2, lane], [side * ESC_X, ESC_Z0 + 0.2], [side * ESC_X, ESC_Z1, null, ESC_TOP]], () => r.grp.remove(q.rig.root));
      }
    }
    // নতুন যাত্রী দরজা দিয়ে এসে লাইনের শেষে
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.queue.length + this.walkers.filter((w) => w.joining).length < 6) {
      this.spawnT = rand(3, 6);
      const rig = this.person(rand(-1, 1), r.D / 2 - 1.2, 0);
      const w = { rig, path: [[QX + 1.2, 6.5], [QX, QZ0 + (this.queue.length + 1) * QSTEP]], i: 0, joining: true, done: () => { this.queue.push({ rig }); } };
      this.walkers.push(w);
    }
    // উপর থেকে নেমে বের হয়ে যাওয়া যাত্রী
    this.downT -= dt;
    if (this.downT <= 0) {
      this.downT = rand(5, 9);
      const side = Math.random() < 0.5 ? -1 : 1, lane = pick(this.lanes);
      const rig = this.person(side * ESC_X, ESC_Z1, 0);
      rig.root.position.y = ESC_TOP;
      this.walk(rig, [[side * ESC_X, ESC_Z0 + 0.2, null, 0], [lane.x, GATE_Z - 1.2], [lane.x, GATE_Z + 1.2, lane], [rand(-1, 1), r.D / 2 - 0.8]], () => r.grp.remove(rig.root));
    }
    // হাঁটা
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i], p = w.path[w.i], root = w.rig.root;
      const dx = p[0] - root.position.x, dz = p[1] - root.position.z, d = Math.hypot(dx, dz);
      const ty = p[3] !== undefined ? p[3] : null;
      const sp = ty !== null ? 0.9 : 1.3;
      if (p[2]) p[2].open = 1.2; // গেটের দরজা খোলে
      if (d < 0.1) {
        w.i++;
        if (w.i >= w.path.length) { this.walkers.splice(i, 1); w.done && w.done(); continue; }
      } else {
        const st = Math.min(d, sp * dt);
        root.position.x += (dx / d) * st; root.position.z += (dz / d) * st;
        if (ty !== null) root.position.y += (ty - root.position.y) * Math.min(1, st / Math.max(0.01, d));
        root.rotation.y = Math.atan2(-dx, -dz);
      }
      setPose(w.rig, ty !== null && Math.abs(ty - root.position.y) > 0.2 ? 'idle' : 'walk', dt, 1.2, 8);
    }
    // লাইনের লোকজন এগিয়ে আসে
    this.queue.forEach((q, k) => {
      const tz = QZ0 + k * QSTEP;
      if (q.player) {
        const tx = r.X + QX, tzw = r.Z + tz;
        P.pos.x += (tx - P.pos.x) * Math.min(1, dt * 4); P.pos.z += (tzw - P.pos.z) * Math.min(1, dt * 4);
        P.yaw = 0;
        return;
      }
      const root = q.rig.root;
      root.position.z += (tz - root.position.z) * Math.min(1, dt * 2);
      root.position.x += (QX - root.position.x) * Math.min(1, dt * 2);
      root.rotation.y = 0;
      setPose(q.rig, Math.abs(tz - root.position.z) > 0.05 ? 'walk' : 'idle', dt, 0.8, 6);
    });
    // নড়াচড়া করলে লাইন ছেড়ে দেওয়া
    if (this.I.inQueue) {
      const ax = g.input.axis();
      if (Math.hypot(ax.x, ax.y) > 0.3) { this.queue = this.queue.filter((q) => !q.player); this.I.inQueue = false; g.ui.toast('লাইন ছেড়ে দিলেন', ''); }
    }
    // ফেয়ার গেট: আপনার কাছে টিকিট বা পাস থাকলে খোলে; ভিতর থেকে বের হতে সবসময় খোলে
    const lx = P.pos.x - r.X, lz = P.pos.z - r.Z;
    for (const L of this.lanes) {
      const near = Math.abs(lx - L.x) < 0.5 && Math.abs(lz - GATE_Z) < 1.1;
      if (near && L.open <= 0) {
        const outward = lz < GATE_Z;
        const M = g.metro;
        if (outward || M.ticket || (g.mrtPass || 0) >= 20) {
          if (!outward && !M.ticket) { g.mrtPass -= 20; M.ticket = { st: this.st, to: null }; g.ui.toast(`পাস থেকে ৳২০ কাটা হলো (বাকি ৳${bnGroup(g.mrtPass)})`, ''); g.save(); }
          L.open = 2.2; g.sound.beep(1400, 0.05, 1);
        } else if (!this.denyT || g.time - this.denyT > 2) { this.denyT = g.time; g.sound.beep(300, 0.06, 2); g.ui.toast('টিকিট নেই! আগে কাউন্টার বা মেশিন থেকে কিনুন', 'bad'); }
      }
      L.open = Math.max(0, L.open - dt);
      const isOpen = L.open > 0;
      L.box.h = isOpen ? -1 : 1.1;
      L.flap.rotation.y = isOpen ? Math.PI / 2 : 0;
    }
    this.updateVault(dt);
    this.updateGuard(dt);
  }
  // ---------- গেট টপকানো ----------
  laneNear() {
    const P = this.g.player, r = this.room;
    const lx = P.pos.x - r.X, lz = P.pos.z - r.Z;
    return this.lanes.find((L) => Math.abs(lx - L.x) < 0.6 && lz > GATE_Z && lz < GATE_Z + 1.6) || null;
  }
  paid() { const M = this.g.metro; return !!M.ticket || (this.g.mrtPass || 0) >= 20; }
  gatePrompt() {
    const P = this.g.player;
    if (P.state !== 'foot' || this.vault) return null;
    if (this.guard.chase) return 'নিরাপত্তাকর্মী ধাওয়া করছে! চলন্ত সিঁড়িতে উঠে পড়ুন';
    const L = this.laneNear();
    if (!L || L.open > 0 || this.paid()) return null;
    return `${this.g.mobile ? 'লাফ বোতাম' : 'Space'}: গেট টপকে যান (টিকিট ছাড়া, ধরা পড়লে ৳${bn(FINE)} জরিমানা)`;
  }
  tryVault() {
    const P = this.g.player;
    if (P.state !== 'foot' || this.vault || P.y > 0.2) return false;
    const L = this.laneNear();
    if (!L || L.open > 0) return false;
    const r = this.room;
    this.vault = { t: 0, L, x0: P.pos.x, z0: P.pos.z, x1: r.X + L.x, z1: r.Z + GATE_Z - 1.1, free: !this.paid() };
    P.state = 'vault';
    P.yaw = 0;
    L.box.h = -1;
    this.g.sound.step();
    return true;
  }
  updateVault(dt) {
    const V = this.vault;
    if (!V) return;
    const P = this.g.player, T = 0.8;
    V.t += dt;
    const k = Math.min(1, V.t / T), e = k * k * (3 - 2 * k);
    P.pos.x = V.x0 + (V.x1 - V.x0) * e;
    P.pos.z = V.z0 + (V.z1 - V.z0) * e;
    P.y = Math.sin(Math.PI * k) * 1.25;
    V.L.box.h = -1;
    setPose(P.rig, k < 0.85 ? 'air' : 'run', dt, 3, 14);
    P.rig.root.position.set(P.pos.x, P.y, P.pos.z);
    // হাত রেখে পা তুলে পার হওয়ার মতো একটু কাত
    P.rig.root.rotation.set(-0.35 * Math.sin(Math.PI * k), P.yaw, 0.5 * Math.sin(Math.PI * k));
    if (V.free && !V.checked && k > 0.4) { V.checked = true; if (this.guardSees()) this.alarm(); }
    if (k >= 1) {
      P.y = 0; P.speed = 3; P.state = 'foot';
      P.rig.root.rotation.set(0, P.yaw, 0);
      this.vault = null;
      this.g.sound.step();
      if (V.free && !this.guard.chase) this.g.ui.toast('কেউ দেখেনি! টিকিট ছাড়াই ভিতরে, এবার চলন্ত সিঁড়িতে', 'good');
    }
  }
  guardSees() {
    const G = this.guard, P = this.g.player, r = this.room;
    const dx = P.pos.x - r.X - G.x, dz = P.pos.z - r.Z - G.z, d = Math.hypot(dx, dz);
    if (d < 2.8) return true;
    if (d > 11) return false;
    // মুখ যে দিকে, তার ৬৫° এর মধ্যে
    const want = Math.atan2(-dx, -dz), a = Math.atan2(Math.sin(want - G.yaw), Math.cos(want - G.yaw));
    return Math.abs(a) < 1.15;
  }
  alarm() {
    const g = this.g, G = this.guard;
    G.chase = { t: 0, via: this.vault ? this.vault.L : this.lanes[2], passed: false, blow: 0 };
    g.sound.whistle();
    g.say(G.rig.root, 'নিরাপত্তাকর্মী', pick(['এই! থামেন! টিকিট কই?', 'দাঁড়ান! গেট টপকাইলেন ক্যান?', 'ধর ধর! টিকিট ছাড়া!']), 2.5);
    g.ui.toast('নিরাপত্তাকর্মী দেখে ফেলেছে! বাঁশি বাজাচ্ছে, পালান!', 'bad');
  }
  guardStep(tx, tz, v, dt) {
    const G = this.guard, dx = tx - G.x, dz = tz - G.z, d = Math.hypot(dx, dz);
    if (d > 0.01) { const st = Math.min(d, v * dt); G.x += (dx / d) * st; G.z += (dz / d) * st; G.yaw = Math.atan2(-dx, -dz); }
    return d;
  }
  updateGuard(dt) {
    const g = this.g, G = this.guard, P = g.player, r = this.room;
    const C = G.chase;
    G.rig.root.position.set(G.x, 0.16, G.z);
    G.rig.root.rotation.y = G.yaw;
    if (!C) {
      // টহল: এপাশ-ওপাশ হাঁটে, মাঝে মাঝে থেমে গেটের দিকে তাকায়
      G.cool -= dt;
      if (G.look > 0) {
        G.look -= dt;
        G.yaw += Math.atan2(Math.sin(-G.yaw), Math.cos(-G.yaw)) * Math.min(1, dt * 4);
        setPose(G.rig, 'idle', dt, 0, 6);
        return;
      }
      const d = this.guardStep(G.dir > 0 ? GUARD_X1 : GUARD_X0, GUARD_Z, 1.1, dt);
      if (d < 0.15) { G.dir *= -1; G.look = rand(2.5, 5); return; }
      setPose(G.rig, 'walk', dt, 1.1, 8);
      if (G.cool <= 0 && Math.random() < dt * 0.12) { G.look = rand(2, 4); G.cool = 6; }
      return;
    }
    // ধাওয়া: আগে গেটের ভিতর দিয়ে, তারপর সোজা আপনার দিকে
    C.t += dt;
    C.blow -= dt;
    if (C.blow <= 0) { C.blow = 2.2; g.sound.whistle(); }
    const px = P.pos.x - r.X, pz = P.pos.z - r.Z;
    if (!C.passed) {
      if (G.z < GATE_Z - 0.6) C.passed = true;
      const atLane = Math.abs(G.x - C.via.x) < 0.3;
      C.via.open = Math.max(C.via.open, 0.5); // নিজের চাবি দিয়ে গেট খোলে
      this.guardStep(C.via.x, atLane ? GATE_Z - 1 : GATE_Z + 0.9, GUARD_V, dt);
    } else this.guardStep(px, pz, GUARD_V, dt);
    setPose(G.rig, 'run', dt, GUARD_V, 12);
    const pd = Math.hypot(px - G.x, pz - G.z);
    if (C.passed && pd < 1.0 && P.state === 'foot') {
      const paid = g.charge(FINE);
      G.chase = null; G.dir = 1;
      g.sound.whistle();
      g.say(G.rig.root, 'নিরাপত্তাকর্মী', 'ধরছি! জরিমানা দেন, তারপর টিকিট কাইটা আসেন।', 3);
      g.ui.toast(`ধরা পড়লেন! জরিমানা ৳${bn(paid)}${g.money < 0 ? ` (বাকি ৳${bnGroup(-g.money)})` : ''}। গেটের বাইরে বের করে দিল`, 'bad');
      P.place(r.X + C.via.x, r.Z + GATE_Z + 2.2, Math.PI);
      P.y = 0; P.speed = 0;
      G.x = C.via.x + 1.2; G.z = GATE_Z + 1.4;
      this.caught = (this.caught || 0) + 1;
      return;
    }
    if (C.t > 30) { G.chase = null; g.ui.toast('নিরাপত্তাকর্মী হাঁপিয়ে ধাওয়া ছেড়ে দিল', 'good'); }
  }
  // প্ল্যাটফর্মে উঠে গেলে ধাওয়া শেষ
  escaped() {
    const G = this.guard;
    if (G.chase) {
      G.chase = null;
      G.x = GUARD_X0; G.z = GUARD_Z;
      this.g.ui.toast('নিরাপত্তাকর্মীকে ফাঁকি দিয়ে প্ল্যাটফর্মে উঠে গেলেন!', 'good');
    }
    if (this.vault) { this.vault = null; this.g.player.state = 'foot'; }
  }
  prompt(s) {
    if (s.act === 'mq' && this.I.inQueue) return `লাইনে দাঁড়িয়ে আছেন (${bn(this.queue.findIndex((q) => q.player) + 1)} নম্বরে)… নড়লে লাইন ছেড়ে দেবেন`;
    if (s.act === 'mq' && this.g.metro.ticket) return `টিকিট আছে: ${this.g.metro.ticket.to ? this.g.metro.ticket.to.name : 'পাস'} · গেট পার হয়ে চলন্ত সিঁড়িতে যান`;
    return null;
  }
  use(s) {
    const g = this.g, M = g.metro;
    if (s.act === 'mq') {
      if (this.I.inQueue) return;
      if (!this.queue.length) { this.ticketDialog(false); return; }
      this.queue.push({ player: true });
      this.I.inQueue = true;
      g.ui.toast(`লাইনে দাঁড়ালেন, সামনে ${bn(this.queue.length - 1)} জন`, '');
    } else if (s.act === 'mtm') this.ticketDialog(true);
    else if (s.act === 'staff') M.ticketStaff(this.st);
    else if (s.act === 'escL' || s.act === 'escR') {
      const side = s.act === 'escL' ? -1 : 1;
      const line = this.lineFor(side, this.st);
      const t = M.ticket;
      let to = t && t.to;
      const dirOk = (dest) => (line === 'A' ? dest.i > this.st.i : dest.i < this.st.i);
      if (to && !dirOk(to)) { g.ui.toast(`এই সিঁড়ি ${to.name}-এর উল্টো দিকের প্ল্যাটফর্মে যায়`, 'bad'); return; }
      if (!to) to = M.stations.find((x) => x.i === this.st.i + (line === 'A' ? 1 : -1)) || null;
      this.escaped();
      this.I.exitTo(() => { M.ticket = null; if (to) M.startRide(this.st, to, line); else M.toPlatform(this.st, line); });
    }
  }
  ticketDialog(machine) {
    const g = this.g, M = g.metro, st = this.st;
    const others = M.stations.filter((x) => x !== st);
    const items = others.map((o) => {
      const fare = Math.abs(o.i - st.i) === 1 ? 20 : 30;
      return { label: `${machine ? 'একক যাত্রা' : 'টিকিট'}: ${o.name}`, price: fare, act: () => this.buyTicket(o, fare) };
    });
    if (machine) items.push({ label: `এমআরটি পাস রিচার্জ (এখন ৳${bnGroup(g.mrtPass || 0)})`, price: 200, act: () => { if (!g.spend(200, 'পাস রিচার্জ')) return; g.mrtPass = (g.mrtPass || 0) + 200; g.save(); g.sound.money(); g.ui.toast(`পাসে এখন ৳${bnGroup(g.mrtPass)}`, 'money'); } });
    this.I.dialog(machine ? 'টিকিট মেশিন' : 'টিকিট কাউন্টার', machine ? 'স্ক্রিনে গন্তব্য বেছে নিন' : '"কোথায় যাবেন? ভাড়া খুচরা দিলে ভালো।"', items);
  }
  buyTicket(to, fare) {
    const g = this.g;
    if (!g.spend(fare, 'টিকিট')) return;
    g.sound.money();
    g.metro.ticket = { st: this.st, to };
    g.ui.toast(`টিকিট কিনলেন: ${to.name} (৳${bn(fare)})। গেটে ছুঁইয়ে চলন্ত সিঁড়িতে যান`, 'money');
  }
}
