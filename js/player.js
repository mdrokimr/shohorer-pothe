// আপনি: হাঁটা, দৌড়, লাফ, যানবাহনে ওঠা-নামা
import { makeRig, setPose } from './rig.js';
import { REAL, makeRealRig, makeVariant } from './realrig.js';
import { damp, clamp } from './utils.js';
import { FOOT } from './mapgen.js';
// সিট থেকে গাড়ির মেঝে কত উঁচু (কোমর): পা এর বেশি নামলে গাড়ির নিচ দিয়ে বের হয়ে যায়
const SEAT_H = { car: 0.31, police: 0.3, cng: 0.3, ambulance: 0.34, bus: 0.42, truck: 0.38, leguna: 0.32, pickup: 0.32 };
const OPEN_V = new Set(['bike', 'rickshaw', 'autorickshaw', 'van', 'easybike']); // খোলা যানবাহন: দরজা নেই, তাড়াতাড়ি ওঠা-নামা

const PLAYER_GAIT = { arm: 1, stride: 1, lean: 0.01, bounce: 1, swag: 0.9, rate: 1, head: 0 };
function angDamp(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.baseLook = { shirt: 0x2f6fb5, pants: 0x2b2b33, skin: 0x8d5a3b, hair: 0x120d09, seed: 0.4242, age: 'adult', build: 'avg', hairStyle: 'side', height: 0.97, gait: PLAYER_GAIT };
    this.rig = makeRig(this.baseLook);
    this.rig.root.rotation.order = 'YXZ';
    scene.add(this.rig.root);
    this.pos = { x: 0, z: 0 };
    this.y = 0; this.vy = 0; this.yaw = 0; this.speed = 0;
    this.state = 'foot'; // foot | enter | drive | fall | dead | swim | ride
    this.breath = 1;
    this.health = 100;
    this.vehicle = null;
    this.t = 0;
    this.stepAcc = 0;
  }
  // নতুন জামা-টুপি-চশমা: চরিত্র নতুন করে বানানো, অবস্থান একই
  setOutfit(o) {
    this.outfit = o || null;
    let r;
    if (this.realOn && REAL.ready) {
      // আসল মডেল: কেনা জামা-প্যান্টের রং টেক্সচারে বসে (টুপি-চশমা এই মডেলে দেখা যায় না)
      const v = o && (o.shirt !== undefined || o.pants !== undefined) ? makeVariant({ shirt: o.shirt, pants: o.pants }) : null;
      r = makeRealRig({ variant: v, gait: PLAYER_GAIT, idle: 'Idle' });
    } else r = makeRig({ ...this.baseLook, ...(o || {}) });
    this.swapRig(r);
  }
  // চরিত্র বদলানো: অবস্থান, ঘোরা, কোথায় বসানো (রাস্তা/গাড়ি) সব একই থাকে
  swapRig(r) {
    const old = this.rig;
    r.root.rotation.order = 'YXZ';
    r.root.position.copy(old.root.position);
    r.root.rotation.copy(old.root.rotation);
    r.root.visible = old.root.visible;
    const par = old.root.parent || this.scene;
    par.remove(old.root);
    par.add(r.root);
    if (old.gun) { old.gun.parent && old.gun.parent.remove(old.gun); }
    if (old.dispose) old.dispose();
    this.rig = r;
  }
  // আসল মডেল লোড হলে আপনার চরিত্র সেটা হয়ে যায়
  useReal() {
    if (!REAL.ready) return;
    this.realOn = true;
    this.setOutfit(this.outfit);
  }
  place(x, z, yaw) {
    this.pos.x = x; this.pos.z = z; this.yaw = yaw;
    this.rig.root.position.set(x, 0, z);
  }
  groundY(world) {
    // মেট্রোর সিঁড়ি-চাতাল
    const wy = world.walkY ? world.walkY(this.pos.x, this.pos.z, this.y) : null;
    if (wy !== null) return wy;
    // ছাদের উপর থাকলে ছাদ
    const roof = world.roofAt(this.pos.x, this.pos.z);
    if (roof > 0 && this.y > roof - 0.7) return roof + 0.02;
    const deck = world.deckAt ? world.deckAt(this.pos.x, this.pos.z) : 0;
    if (deck) return deck;
    // ফুটপাতের উপর একটু উঁচু
    const r = world.onRoad(this.pos.x, this.pos.z, FOOT);
    if (!r) return 0;
    const lat = Math.abs((this.pos.x - r.ax) * r.dir.z - (this.pos.z - r.az) * r.dir.x);
    return lat > r.width / 2 ? 0.16 : 0.04;
  }
  updateFoot(dt, inp, camYaw, g, aim = false) {
    const ax = inp.axis();
    const run = inp.get('run');
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    let target = 0;
    let aimMove = null;
    if (aim) {
      // নিশানা: ক্যামেরার দিকে মুখ, পাশে-পিছে হেঁটে চলা
      this.yaw = angDamp(this.yaw, camYaw, 20, dt);
      if (mag > 0.1) {
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        aimMove = { x: (fx * ax.y + rx * ax.x) / mag, z: (fz * ax.y + rz * ax.x) / mag };
        target = 1.8 * mag;
      }
    } else if (mag > 0.1 && this.blocking) {
      // ব্লক করে ধীরে সরে যাওয়া, মুখ একই দিকে
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      this.aimDir = { x: (fx * ax.y + rx * ax.x) / mag, z: (fz * ax.y + rz * ax.x) / mag };
      target = 1.0 * mag;
    } else if (mag > 0.1) {
      // ক্যামেরার দিক অনুযায়ী চলা
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x;
      const want = Math.atan2(-dx, -dz);
      this.yaw = angDamp(this.yaw, want, 10, dt);
      target = (run || (inp.joy.active && mag > 0.92) ? 5.8 : 1.9) * mag;
    }
    this.speed = damp(this.speed, target, 8, dt);
    if (this.blocking && !aim) {
      const d = mag > 0.1 && this.aimDir ? this.aimDir : { x: 0, z: 0 };
      this.pos.x += d.x * this.speed * dt;
      this.pos.z += d.z * this.speed * dt;
    } else if (aim) {
      if (aimMove) { this.aimDir = aimMove; }
      const d = this.aimDir || { x: 0, z: 0 };
      this.pos.x += d.x * this.speed * dt;
      this.pos.z += d.z * this.speed * dt;
    } else {
      this.pos.x += -Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += -Math.cos(this.yaw) * this.speed * dt;
    }
    // লাফ
    const gy = this.groundY(g.world);
    if (this.y > gy || this.vy > 0) {
      this.vy -= 15 * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        // উঁচু থেকে পড়লে আঘাত
        if (this.vy < -13 && g.damagePlayer && !g.world.swimAt(this.pos.x, this.pos.z)) g.damagePlayer((-this.vy - 13) * 7, 'fall');
        this.y = gy; this.vy = 0;
      }
    } else this.y = damp(this.y, gy, 15, dt);
    // দেয়াল আর যানবাহনে ধাক্কা
    g.world.collide(this.pos, 0.35, this.y, false, true);
    // গভীর পানিতে নামলে সাঁতার
    if (g.world.swimAt(this.pos.x, this.pos.z) && this.y < 1) { this.startSwim(g); return; }
    for (const v of g.allVehicles()) {
      if (Math.abs((v.y || 0) - this.y) > 2) continue;
      for (const c of v.circles()) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
        if (d < r && d > 1e-4) { this.pos.x += (dx / d) * (r - d); this.pos.z += (dz / d) * (r - d); }
      }
    }
    // মানুষের ভিতর দিয়ে হাঁটা যায় না: দোকানদার, ক্রেতা, পথচারী, মজুর
    if (g.traffic && !g.inside) {
      const list = g.traffic.bystanders(g);
      for (const q of g.traffic.peds) if (!(q.react && (q.react.mode === 'fly' || q.react.mode === 'down' || q.react.mode === 'dead'))) list.push(q);
      for (const b of list) {
        const dx = this.pos.x - b.x, dz = this.pos.z - b.z, d = Math.hypot(dx, dz), r = 0.6;
        if (d < r && d > 1e-4) { this.pos.x += (dx / d) * (r - d); this.pos.z += (dz / d) * (r - d); }
      }
    }
    const air = this.y > gy + 0.15;
    let pose = air ? 'air' : this.speed > 3.2 ? 'run' : this.speed > 0.3 ? 'walk' : 'idle';
    const C = g.combat;
    const melee = C && C.moveT > 0 && C.move;
    if (melee) pose = C.move;
    else if (this.blocking) pose = 'block';
    else if (aim || (C && C.shootT > 0)) pose = this.speed > 0.3 ? 'aimWalk' : 'aim';
    else if (C && C.fightT > 0 && this.speed < 0.3 && !air) pose = 'guard';
    if (this.rig.real) {
      const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }, ad = this.aimDir || fwd;
      this.rig.flags = { shoot: !!(C && C.shootT > 0.35), back: aim && this.speed > 0.3 && ad.x * fwd.x + ad.z * fwd.z < -0.3 };
    }
    setPose(this.rig, pose, dt, this.speed, melee ? 24 : this.blocking ? 18 : 10);
    this.rig.root.position.set(this.pos.x, this.y, this.pos.z);
    this.rig.root.rotation.set(0, this.yaw, 0);
    if (!air && this.speed > 0.5) {
      this.stepAcc += dt * this.speed;
      if (this.stepAcc > (this.speed > 3 ? 1.6 : 0.8)) { this.stepAcc = 0; g.sound.step(); }
    }
  }
  // ---------- সাঁতার (GTA V-এর মতো) ----------
  startSwim(g) {
    this.state = 'swim';
    this.vy = 0;
    this.y = Math.min(this.y, -0.1);
    this.swimSpeed = this.speed * 0.5;
    g.vfx && [...Array(10)].forEach(() => g.vfx.emit('splash', this.pos.x, 0.1, this.pos.z, 0xe8f4f8, { scale: 3 }));
    g.sound.noise(0.5, 0.2, 'lowpass', 2000, 300);
  }
  // W/A/S/D সাঁতার, Shift জোরে, Space ধরে ডুব; ডুবে থাকলে দম কমে
  updateSwim(dt, inp, camYaw, g) {
    const ax = inp.axis();
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    let target = 0;
    if (mag > 0.1) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x;
      this.yaw = angDamp(this.yaw, Math.atan2(-dx, -dz), 5, dt);
      target = (inp.get('run') ? 2.9 : 1.5) * mag;
    }
    this.swimSpeed = damp(this.swimSpeed || 0, target, 3, dt);
    this.speed = this.swimSpeed;
    this.pos.x += -Math.sin(this.yaw) * this.swimSpeed * dt;
    this.pos.z += -Math.cos(this.yaw) * this.swimSpeed * dt;
    g.world.collide(this.pos, 0.35, this.y, false, true);
    const dive = inp.get('space');
    this.y = damp(this.y, dive ? -3.2 : -0.15, dive ? 1.2 : 2.2, dt);
    // দম
    const under = this.y < -0.9;
    this.breath = clamp(this.breath + (under ? -dt / 20 : dt / 3), 0, 1);
    if (this.breath <= 0) {
      this.drownT = (this.drownT || 0) - dt;
      if (this.drownT <= 0) { this.drownT = 1; g.damagePlayer(12, 'drown'); }
    }
    // জেটিতে বা পাড়ে উঠে আসা
    if (!g.world.swimAt(this.pos.x, this.pos.z)) {
      this.state = 'foot';
      this.y = this.groundY(g.world);
      this.breath = Math.max(this.breath, 0.6);
      return;
    }
    const stroke = this.swimSpeed > 0.2;
    setPose(this.rig, stroke ? 'swim' : 'tread', dt, this.swimSpeed, 8);
    this.rig.root.position.set(this.pos.x, this.y - (stroke ? 0.35 : 0.9), this.pos.z);
    this.rig.root.rotation.set(stroke ? -1.25 : -0.2, this.yaw, 0);
    if (stroke) { this.stepAcc += dt; if (this.stepAcc > 0.7) { this.stepAcc = 0; g.sound.noise(0.18, 0.05, 'bandpass', 900, 500, 2); } }
  }
  jump(g) {
    if (this.state !== 'foot') return;
    if (this.y <= this.groundY(g.world) + 0.02) this.vy = 5.2;
  }
  // যানবাহনে ওঠা শুরু
  enter(v, jack = false) {
    this.state = 'enter';
    this.vehicle = v;
    this.t = 0;
    this.jack = jack ? { t: 0, pulled: false } : null;
    this.from = { x: this.pos.x, z: this.pos.z };
    // যে পাশে দাঁড়িয়ে, সেই পাশের দরজা দিয়ে ওঠা (পরে ভিতরে সরে চালকের সিটে); ছিনতাইয়ে চালকের পাশ
    const o = v.toWorld(0, 0), r = v.toWorld(1, 0);
    const lx = (this.pos.x - o.x) * (r.x - o.x) + (this.pos.z - o.z) * (r.z - o.z);
    const ds = Math.sign(v.spec.door.x) || 1;
    this.enterSide = jack || v.spec.air || v.boat || Math.abs(lx) < 0.3 ? ds : Math.sign(lx);
    this.doorX = Math.abs(v.spec.door.x) * this.enterSide;
    const door = v.toWorld(this.doorX, v.spec.door.z);
    this.door = door;
  }
  exit(g) {
    const v = this.vehicle;
    this.inT = null; this.outT = null;
    // ডান পাশে জায়গা না থাকলে বাম পাশে নামা
    let p = v.toWorld(v.spec.door.x, v.spec.door.z);
    const test = { x: p.x, z: p.z };
    const hit = g.world.collide(test, 0.35);
    if (hit) p = v.toWorld(-v.spec.door.x, v.spec.door.z);
    v.g.remove(this.rig.root);
    this.scene.add(this.rig.root);
    this.place(p.x, p.z, v.yaw);
    this.y = v.y || 0; // ছাদের হেলিকপ্টার থেকে নামলে ছাদেই
    this.vy = 0;
    this.state = 'foot';
    v.driver = null;
    v.speed = 0;
    this.vehicle = null;
  }
  // বাইক/রিকশা উল্টালে ছিটকে পড়া
  throwOff(g, vx, vz, vy) {
    const v = this.vehicle;
    const p = v.toWorld(v.spec.seat.x, v.spec.seat.z);
    v.g.remove(this.rig.root);
    this.scene.add(this.rig.root);
    v.driver = null;
    this.vehicle = null;
    this.place(p.x, p.z, v.yaw);
    this.y = 0.7;
    this.state = 'fall';
    this.fall = { vx, vz, vy, spin: 0, t: 0, down: false };
  }
  updateFall(dt, g) {
    const F = this.fall;
    if (!F.down) {
      F.vy -= 15 * dt;
      this.pos.x += F.vx * dt;
      this.pos.z += F.vz * dt;
      this.y += F.vy * dt;
      F.spin = Math.min(Math.PI / 2, F.spin + dt * 6);
      if (g.world.collide(this.pos, 0.35, 0.5)) { F.vx *= -0.2; F.vz *= -0.2; }
      if (this.y <= 0.14 && F.vy < 0) { this.y = 0.14; F.down = true; F.t = F.dead ? 1e9 : F.t || 1.7; F.spin = Math.PI / 2; }
    } else {
      F.vx = damp(F.vx, 0, 5, dt);
      F.vz = damp(F.vz, 0, 5, dt);
      this.pos.x += F.vx * dt;
      this.pos.z += F.vz * dt;
      g.world.collide(this.pos, 0.35, 0.3);
      F.t -= dt;
      if (F.t <= 0) {
        // উঠে দাঁড়ানো
        this.state = 'foot';
        this.y = this.groundY(g.world);
        this.speed = 0;
        this.fall = null;
        this.rig.root.rotation.set(0, this.yaw, 0);
        return;
      }
    }
    setPose(this.rig, 'down', dt, 0, 10);
    this.rig.root.position.set(this.pos.x, this.y, this.pos.z);
    this.rig.root.rotation.set(-F.spin, this.yaw, 0);
  }
  // গাড়ির ধাক্কা বা মারামারিতে পড়ে যাওয়া
  knock(vx, vz, vy, downT = 1.7) {
    this.state = 'fall';
    this.y = Math.max(this.y, 0.3);
    this.fall = { vx, vz, vy, spin: 0, t: downT, down: false };
  }
  // মারা যাওয়া/জ্ঞান হারানো
  die(g) {
    if (this.state === 'drive' || this.state === 'enter' || this.state === 'exit') {
      const v = this.vehicle;
      if (this.state !== 'enter' || this.inT) this.exit(g);
      else { this.state = 'foot'; if (v) v.driver = null; this.vehicle = null; }
      this.inT = null; this.outT = null;
    }
    if (this.state !== 'fall') this.knock(0, 0, 1);
    this.fall.dead = true;
    if (this.fall.down) this.fall.t = 1e9;
    this.state = 'dead';
  }
  updateEnter(dt, g) {
    this.t += dt;
    const v = this.vehicle;
    const J = this.jack;
    // ১) দরজা পর্যন্ত হেঁটে (দূরে হলে দৌড়ে) যাওয়া: আসল গতিতে, পিছলে নয়
    if (!this.inT) {
      const dX = this.doorX ?? v.spec.door.x;
      this.door = v.toWorld(dX * 0.62, v.spec.door.z); // চলন্ত গাড়ির দরজা সরে
      const dx = this.door.x - this.pos.x, dz = this.door.z - this.pos.z, d = Math.hypot(dx, dz);
      const sp = d > 4 ? 5.2 : 3.0;
      const want = d > 0.25 ? Math.atan2(-dx, -dz) : Math.atan2(-(v.x - this.pos.x), -(v.z - this.pos.z));
      this.yaw = angDamp(this.yaw, want, 12, dt);
      if (d > 0.12 && this.t < 3) {
        const st = Math.min(d, sp * dt);
        this.pos.x += (dx / d) * st; this.pos.z += (dz / d) * st;
        setPose(this.rig, sp > 4 ? 'run' : 'walk', dt, sp);
        this.rig.root.position.set(this.pos.x, this.y || 0, this.pos.z);
        this.rig.root.rotation.set(0, this.yaw, 0);
        return;
      }
      // ছিনতাই: দরজায় পৌঁছে চালককে টেনে নামানো
      if (J && !J.pulled) {
        J.t += dt;
        setPose(this.rig, J.t < 0.25 ? 'punch' : 'swing', dt, 0, 16);
        this.rig.root.position.set(this.pos.x, this.y || 0, this.pos.z);
        this.rig.root.rotation.set(0, this.yaw, 0);
        if (J.t > 0.55) { J.pulled = true; g.onJackPull(v); }
        return;
      }
      // ২) দরজা খুলে ভিতরে ঢোকা: গাড়ির ভিতরের জায়গায় আস্তে আস্তে সিটে
      this.jack = null;
      this.scene.remove(this.rig.root);
      v.g.add(this.rig.root);
      this.inT = { t: 0, side: this.enterSide || Math.sign(v.spec.door.x) || 1 };
      if (v.setDoor) v.setDoor(true, this.inT.side); // যে পাশ দিয়ে উঠছেন সেই দরজা খোলে
      g.sound.door();
    }
    const I = this.inT, s = v.spec.seat;
    I.t += dt;
    const hasDoor = !!v.door, wait = hasDoor ? 0.22 : 0; // দরজা খোলা পর্যন্ত অপেক্ষা
    const D = OPEN_V.has(v.type) ? 0.32 : Math.sign(I.side) !== Math.sign(s.x) && s.x ? 0.95 : 0.55, u = clamp((I.t - wait) / D, 0, 1), e = u * u * (3 - 2 * u);
    this.rig.look.seatH = SEAT_H[v.type] ?? 0.32;
    const ox = Math.abs(v.spec.door.x) * I.side * 0.62, oz = v.spec.door.z;
    // উল্টো পাশ দিয়ে উঠলে: আগে পাশের সিটে বসে, তারপর সরে চালকের সিটে (একটু বেশি সময়)
    const far = Math.sign(s.x) !== 0 && Math.sign(ox) !== Math.sign(s.x) && !OPEN_V.has(v.type);
    const midX = far ? -s.x * 0.9 : s.x;
    const e1 = far ? clamp(e / 0.6, 0, 1) : e, e2 = far ? clamp((e - 0.6) / 0.4, 0, 1) : 0;
    const x = (ox + (midX - ox) * e1) + (s.x - midX) * e2, z = oz + (s.z - oz) * e;
    const lift = Math.sin(Math.min(1, u * 1.4) * Math.PI / 2); // পা তুলে বসা
    const y0 = (this.y || 0) - (v.g.position.y || 0); // মাটি (গাড়ির ভিতরের হিসাবে)
    this.rig.root.position.set(x, y0 + ((s.y - 0.95) - y0) * lift, z);
    // মুখ: গাড়ির দিকে থেকে সামনের দিকে
    this.rig.root.rotation.set(0, (1 - Math.min(1, e * (far ? 1.6 : 1))) * (I.side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    setPose(this.rig, u < 0.5 ? 'walk' : v.spec.pose, dt, u < 0.5 ? 1 : 0, 14);
    this.pos.x = v.x; this.pos.z = v.z;
    if (u >= 1) {
      this.rig.root.position.set(s.x, s.y - 0.95, s.z);
      this.rig.root.rotation.set(0, 0, 0);
      this.inT = null;
      v.driver = this;
      this.state = 'drive';
      if (v.door) { v.setDoor(false); v.onDoorShut = () => { g.sound.door(); v.onDoorShut = null; }; } // বসে দরজা টেনে বন্ধ
    }
  }
  // আস্তে নামা: সিট থেকে দরজার পাশে, তারপর রাস্তায়
  exitSmooth(g) {
    const v = this.vehicle;
    if (!v || v.air || v.boat) { this.exit(g); return; }
    let side = 1;
    const p = v.toWorld(v.spec.door.x, v.spec.door.z);
    if (g.world.collide({ x: p.x, z: p.z }, 0.35)) side = -1;
    this.state = 'exit';
    this.outT = { t: 0, side };
    v.speed = 0;
    if (v.setDoor) v.setDoor(true, side * (Math.sign(v.spec.door.x) || 1));
  }
  updateExit(dt, g) {
    const v = this.vehicle, O = this.outT;
    if (!v || !O) { this.state = 'foot'; return; }
    O.t += dt;
    v.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.world); v.sync(dt);
    const wait = v.door ? 0.2 : 0;
    const D = OPEN_V.has(v.type) ? 0.3 : 0.5, u = clamp((O.t - wait) / D, 0, 1), e = u * u * (3 - 2 * u);
    const s = v.spec.seat, dx = v.spec.door.x * O.side * 0.62, dz = v.spec.door.z;
    this.rig.root.position.set(s.x + (dx - s.x) * e, (s.y - 0.95) * (1 - e), s.z + (dz - s.z) * e);
    this.rig.root.rotation.set(0, e * (O.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
    setPose(this.rig, u > 0.5 ? 'idle' : 'sit', dt, 0, 12);
    if (u >= 1) {
      if (v.door) { v.setDoor(false); v.onDoorShut = () => { g.sound.door(); v.onDoorShut = null; }; }
      this.exit(g);
      this.yaw = v.yaw + (O.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.rig.root.rotation.set(0, this.yaw, 0);
      this.outT = null;
    }
  }
  updateDrive(dt, inp, g) {
    const v = this.vehicle;
    const ax = inp.axis();
    const impact = v.drive(dt, { throttle: ax.y, steer: ax.x, handbrake: inp.get('space'), up: inp.get('space'), down: inp.get('run') }, g.world);
    v.sync(dt);
    this.pos.x = v.x; this.pos.z = v.z; this.yaw = v.yaw;
    this.rig.bike = v.type === 'bike' ? { steer: v.steerEff ?? v.steer, speed: v.speed, stop: Math.abs(v.speed) < 0.7 } : null;
    this.rig.look.seatH = SEAT_H[v.type] ?? 0.32;
    setPose(this.rig, v.spec.pose, dt, Math.abs(v.speed));
    // স্টিয়ারিংয়ে হাত একটু ঘোরে
    if (v.type !== 'bike') this.rig.spine.rotation.z = -v.steer * 0.08;
    if (this.rig.apply) this.rig.apply();
    return { impact, throttle: Math.max(0, ax.y) };
  }
}
