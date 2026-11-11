// হেলিকপ্টার, বিমান আর স্পিডবোট: মডেল আর চালানোর হিসাব (GTA V-এর মতো সহজ নিয়ন্ত্রণ)
// হেলিকপ্টার: Space উপরে, Shift নিচে, W/S সামনে-পিছে ঝোঁকা, A/D ঘোরা
// বিমান: W/S ইঞ্জিন কম-বেশি, A/D কাত হয়ে ঘোরা (মাটিতে চাকা ঘোরানো), Space নাক উপরে, Shift নাক নিচে
// স্পিডবোট: গাড়ির মতো, শুধু পানিতে
import * as THREE from 'three';
import { Vehicle, SPECS, BUILDERS, HP, MASS, TOP_H } from './vehicles.js';
import { lam, bas, addBox, addCyl, dyn } from './lib3d.js';
import { clamp, damp } from './utils.js';
import { crashDmg } from './wreck.js';

const G = 9.8;
const glass = () => lam(0x22384c);

Object.assign(SPECS, {
  heli: { name: 'হেলিকপ্টার', max: 45, accel: 0, brake: 0, rev: 0, turn: 1.3, len: 9, wid: 2.2, r: 1.2, circles: [-1.2, 1.2], seat: { x: 0.45, y: 0.9, z: -1.0 }, pose: 'drive', door: { x: 2.0, z: -0.8 }, pass: { x: -0.45, y: 0.9, z: -1.0 }, passPose: 'sit', engine: 'heli', fare: 0, air: 'heli' },
  plane: { name: 'বিমান', max: 75, accel: 0, brake: 0, rev: 0, turn: 0.5, len: 11, wid: 12, r: 1.3, circles: [-3.4, 0, 3.4], seat: { x: 0, y: 1.25, z: -2.1 }, pose: 'drive', door: { x: 2.2, z: -1.5 }, pass: { x: 0, y: 1.25, z: -0.8 }, passPose: 'sit', engine: 'plane', fare: 0, air: 'plane' },
  boat: { name: 'স্পিডবোট', max: 24, accel: 6.5, brake: 6, rev: 4, turn: 1.15, len: 6, wid: 2.3, r: 1.1, circles: [-1.6, 1.4], seat: { x: 0.4, y: 0.75, z: 0.4 }, pose: 'drive', door: { x: 2.4, z: 0.4 }, pass: { x: -0.4, y: 0.75, z: 0.9 }, passPose: 'sit', engine: 'boat', fare: 0, water: true },
});
SPECS.heli_police = { ...SPECS.heli, name: 'পুলিশের হেলিকপ্টার' };
SPECS.heli_med = { ...SPECS.heli, name: 'এয়ার অ্যাম্বুলেন্স' };
Object.assign(HP, { heli: 140, heli_police: 160, heli_med: 140, plane: 180, boat: 110 });
Object.assign(MASS, { heli: 5, heli_police: 5, heli_med: 5, plane: 8, boat: 3 });
Object.assign(TOP_H, { heli: 3.2, heli_police: 3.2, heli_med: 3.2, plane: 3.6, boat: 1.6 });

// ---------- মডেল ----------
function heliModel(body, stripe, label) {
  return () => {
    const g = new THREE.Group();
    const bm = lam(body), sm = lam(stripe);
    addBox(g, 1.9, 1.7, 3.6, bm, 0, 1.45, -0.6);
    addBox(g, 1.7, 1.1, 1.3, glass(), 0, 1.75, -2.75);
    addBox(g, 1.95, 0.25, 3.62, sm, 0, 1.05, -0.6);
    addBox(g, 0.35, 0.4, 4.6, bm, 0, 1.75, 3.3);
    addBox(g, 0.12, 1.3, 0.9, sm, 0, 2.3, 5.4);
    addBox(g, 1.4, 0.1, 0.5, bm, 0, 1.8, 5.2);
    for (const x of [-0.85, 0.85]) {
      addBox(g, 0.1, 0.1, 3.4, lam(0x333333), x, 0.12, -0.6);
      addBox(g, 0.08, 0.55, 0.08, lam(0x333333), x, 0.4, -1.6);
      addBox(g, 0.08, 0.55, 0.08, lam(0x333333), x, 0.4, 0.5);
    }
    addCyl(g, 0.1, 0.1, 0.5, lam(0x333333), 0, 2.5, -0.6, 8);
    if (label) addBox(g, 1.96, 0.5, 0.5, bas(0xffffff), 0, 1.6, 0.4); // সাদা জায়গা (রেড ক্রস/পুলিশ)
    if (label === 'med') { addBox(g, 1.98, 0.36, 0.1, bas(0xd01818), 0, 1.6, 0.4); addBox(g, 1.98, 0.1, 0.36, bas(0xd01818), 0, 1.6, 0.4); }
    // প্রপেলার (ঘোরে)
    const rotor = new THREE.Group();
    rotor.position.set(0, 2.78, -0.6);
    for (const a of [0, Math.PI / 2]) { const b = addBox(rotor, 0.28, 0.05, 10.5, lam(0x222222)); b.rotation.y = a; }
    g.add(dyn(rotor));
    const tail = new THREE.Group();
    tail.position.set(0.25, 2.3, 5.5);
    for (const a of [0, Math.PI / 2]) { const b = addBox(tail, 0.04, 1.5, 0.12, lam(0x222222)); b.rotation.x = a; }
    g.add(dyn(tail));
    g.userData.rotors = [rotor, tail];
    return { g, wheels: [], color: body };
  };
}
BUILDERS.heli = heliModel(0xe07020, 0x202020);
BUILDERS.heli_police = heliModel(0x1a3f8a, 0xffffff, 'police');
BUILDERS.heli_med = heliModel(0xf2f2f2, 0xd01818, 'med');
BUILDERS.plane = () => {
  const g = new THREE.Group();
  const w = lam(0xf4f4f4), b = lam(0x1c6e3c), r = lam(0xc62828);
  addCyl(g, 0.85, 0.75, 9, w, 0, 1.6, 0, 14).rotation.x = Math.PI / 2;
  addCyl(g, 0.75, 0.25, 1.4, w, 0, 1.6, -5.1, 14).rotation.x = -Math.PI / 2;
  addBox(g, 1.3, 0.55, 1.4, glass(), 0, 2.25, -2.6);
  addBox(g, 12, 0.18, 1.8, w, 0, 2.1, -0.6);
  addBox(g, 12.02, 0.2, 0.4, b, 0, 2.1, -1.35);
  addBox(g, 4.2, 0.14, 1.1, w, 0, 1.8, 4.1);
  addBox(g, 0.14, 1.8, 1.3, r, 0, 2.6, 4.2);
  addBox(g, 1.72, 0.25, 9.02, b, 0, 1.25, 0);
  // চাকা
  for (const [x, z] of [[-1.3, 0.2], [1.3, 0.2], [0, -3.8]]) {
    addBox(g, 0.08, 0.9, 0.08, lam(0x333333), x, 0.7, z);
    addCyl(g, 0.3, 0.3, 0.2, lam(0x161616), x, 0.3, z, 10).rotation.z = Math.PI / 2;
  }
  const prop = new THREE.Group();
  prop.position.set(0, 1.6, -5.85);
  for (const a of [0, Math.PI / 2]) { const p = addBox(prop, 2.6, 0.18, 0.05, lam(0x222222)); p.rotation.z = a; }
  g.add(dyn(prop));
  g.userData.rotors = [null, null, prop];
  return { g, wheels: [], color: 0xf4f4f4 };
};
BUILDERS.boat = () => {
  const g = new THREE.Group();
  const hull = lam(0xffffff), st = lam(0x1565c0);
  addBox(g, 2.2, 0.8, 4.6, hull, 0, 0.45, 0.5);
  const bow = addBox(g, 1.55, 0.8, 1.55, hull, 0, 0.45, -1.9);
  bow.rotation.y = Math.PI / 4;
  addBox(g, 2.24, 0.18, 4.62, st, 0, 0.62, 0.5);
  addBox(g, 1.6, 0.5, 0.9, glass(), 0, 1.1, -0.3);
  addBox(g, 1.8, 0.35, 1.6, lam(0x8a6a44), 0, 0.95, 1.2);
  addBox(g, 0.5, 0.8, 0.5, lam(0x222222), 0, 0.6, 2.95);
  return { g, wheels: [], color: 0xffffff };
};

// ---------- হেলিকপ্টার ----------
export class Heli extends Vehicle {
  constructor(scene, type, opts = {}) {
    super(scene, type, opts);
    this.y = opts.y || 0;
    this.vy = 0; this.vx = 0; this.vz = 0;
    this.rotor = 0; // ০-১, প্রপেলার কত জোরে
    this.tilt = 0; this.bank = 0;
    this.home = { x: this.x, z: this.z, y: this.y, yaw: this.yaw };
    this.air = true;
    this.sync(0);
  }
  get airborne() { return this.y > this.ground + 0.3; }
  flip() { return false; }
  drive(dt, inp, world) {
    if (this.sink) { this.updateSink(dt); return 0; }
    this.ground = world.roofAt(this.x, this.z);
    const on = this.driver && this.hp > 0;
    this.rotor = damp(this.rotor, on ? 1 : 0, on ? 0.8 : 0.4, dt);
    const lift = this.rotor > 0.85;
    // ঝোঁকা: সামনে গেলে নাক নিচে
    this.tilt = damp(this.tilt, on ? -inp.throttle * 0.3 : 0, 3, dt);
    this.bank = damp(this.bank, on && this.airborne ? -inp.steer * 0.25 : 0, 3, dt);
    let impact = 0;
    if (lift) {
      const want = (inp.up ? 9 : 0) - (inp.down ? 8 : 0);
      this.vy = damp(this.vy, want, 2.5, dt);
      if (this.airborne) {
        const f = this.fwd();
        const target = -this.tilt / 0.3 * this.spec.max;
        this.fs = damp(this.fs || 0, target, 0.9, dt);
        this.vx = damp(this.vx, f.x * this.fs, 2, dt);
        this.vz = damp(this.vz, f.z * this.fs, 2, dt);
        this.yaw -= inp.steer * this.spec.turn * dt;
      }
    } else {
      // প্রপেলার থেমে গেলে নিচে পড়ে
      this.vy -= G * dt * (1 - this.rotor);
      this.vx = damp(this.vx, 0, 0.5, dt); this.vz = damp(this.vz, 0, 0.5, dt);
    }
    if (this.hp <= 0) { this.vy -= G * dt; this.yaw += dt * 2.5; }
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.y = Math.min(this.y, 320);
    // মাটি বা ছাদে নামা
    this.ground = world.roofAt(this.x, this.z);
    if (this.y <= this.ground) {
      const fall = -this.vy, hs = Math.hypot(this.vx, this.vz);
      this.y = this.ground;
      if (fall > 7 || hs > 14) { impact = Math.max(fall, hs); this.damage(crashDmg(impact) * 3); }
      this.vy = Math.max(0, this.vy);
      this.vx = damp(this.vx, 0, 6, dt); this.vz = damp(this.vz, 0, 6, dt);
      this.fs = 0;
      if (this.ground === 0) this.checkWater(world); // নদীতে নামলে ডুবে যায়
    }
    // বিল্ডিংয়ে ধাক্কা (পাশ থেকে)
    for (const c of this.spec.circles) {
      const p = this.toWorld(0, c), o = { x: p.x, z: p.z };
      const hit = world.collide(o, this.spec.r, this.y + 0.3, true);
      if (hit) {
        this.x += o.x - p.x; this.z += o.z - p.z;
        const hs = Math.hypot(this.vx, this.vz);
        if (hs > 4) { impact = Math.max(impact, hs); this.damage(crashDmg(hs) * 2.5); }
        this.vx *= -0.3; this.vz *= -0.3; this.speed *= 0.2;
      }
    }
    this.speed = Math.hypot(this.vx, this.vz) * Math.sign(this.speed || 1);
    return impact;
  }
  sync(dt) {
    if (this.sink) { super.sync(dt); return; }
    this.lod();
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(this.tilt + (this.pitch || 0), this.yaw, this.bank + (this.roll || 0));
    const R = this.g.userData.rotors;
    if (R && R[0]) { R[0].rotation.y += this.rotor * 28 * (dt || 0); R[1].rotation.x += this.rotor * 40 * (dt || 0); }
    if (this.beam) this.beam.visible = false;
  }
  updateTumble() { this.tumble = null; return true; }
  repair() {
    super.repair();
    this.vx = this.vz = this.vy = 0; this.tilt = this.bank = 0;
  }
  reset() {
    this.repair();
    this.x = this.home.x; this.z = this.home.z; this.y = this.home.y; this.yaw = this.home.yaw;
    this.sync(0);
  }
}

// ---------- বিমান ----------
export class Plane extends Vehicle {
  constructor(scene, type, opts = {}) {
    super(scene, type, opts);
    this.y = 0; this.vy = 0; this.power = 0; this.pitchA = 0; this.bank = 0;
    this.home = { x: this.x, z: this.z, y: 0, yaw: this.yaw };
    this.air = true;
    this.sync(0);
  }
  get airborne() { return this.y > 0.3; }
  flip() { return false; }
  drive(dt, inp, world) {
    if (this.sink) { this.updateSink(dt); return 0; }
    const on = this.driver && this.hp > 0;
    this.power = clamp(this.power + (on ? inp.throttle : -1) * dt * 0.45, 0, 1);
    const S = this.spec;
    // গতি: ইঞ্জিনের জোর, বাতাসের বাধা; উপরে উঠতে গতি কমে
    const thrust = this.power * 9;
    const drag = this.speed * this.speed * 0.0016 + (this.airborne ? 0 : 0.6);
    this.speed = Math.max(0, this.speed + (thrust - drag * 9 / 9 - Math.sin(this.pitchA) * G * 0.6) * dt);
    // মাটিতে S = ব্রেক (ইঞ্জিন কমার অপেক্ষা না করেই)
    if (!this.airborne && on && inp.throttle < -0.1) this.speed = damp(this.speed, 0, 1.4, dt);
    if (!this.airborne && !on) this.speed = damp(this.speed, 0, 0.5, dt);
    this.speed = Math.min(this.speed, S.max);
    let impact = 0;
    if (!this.airborne) {
      // রানওয়েতে: চাকা ঘুরিয়ে চলা, যথেষ্ট গতিতে Space চাপলে ওড়ে
      this.yaw -= (on ? inp.steer : 0) * 0.6 * clamp(this.speed / 6, 0, 1) * (this.speed > 40 ? 0.4 : 1) * dt;
      this.pitchA = damp(this.pitchA, on && inp.up && this.speed > 32 ? 0.22 : 0, 2, dt);
      this.bank = damp(this.bank, 0, 4, dt);
    } else {
      // নামা: Shift বা S (জয়স্টিক নিচে) ধরে রাখলে নিয়ন্ত্রিত হারে নামে, মাটির যত কাছে তত আস্তে; ছেড়ে দিলে সোজা উড়ে
      const down = on && (inp.down || inp.throttle < -0.1);
      const sp = Math.max(this.speed, 8), stallV = clamp((28 - this.speed) / 14, 0, 1) * 6;
      const sinFor = (vs) => clamp((vs + stallV) / sp, -0.43, 0.5);
      if (on && inp.up) this.pitchA = clamp(this.pitchA + 0.7 * dt, -0.45, 0.6);
      else if (down) this.pitchA = damp(this.pitchA, Math.asin(sinFor(-clamp(this.y * 0.28, 2.2, 22))), 1.6, dt);
      else this.pitchA = damp(this.pitchA, 0, 0.9, dt);
      // মাটির কাছে জোরে নামতে থাকলে নিজে থেকে নাক তুলে আস্তে নামে (ফ্লেয়ার)
      if (on && this.y < 14 && this.vy < -3.5) this.pitchA = damp(this.pitchA, Math.asin(sinFor(-2.5)), 4, dt);
      this.bank = damp(this.bank, on ? -inp.steer * 0.7 : 0, 2.2, dt);
      this.yaw += this.bank * 0.75 * dt * clamp(this.speed / 30, 0.3, 1.2);
    }
    // উঁচু-নিচু: গতি কম হলে (স্টল) নেমে যায়
    const stall = clamp((28 - this.speed) / 14, 0, 1);
    this.vy = Math.sin(this.pitchA) * this.speed - stall * (this.airborne ? 6 : 0);
    if (this.hp <= 0) { this.vy -= 12; this.bank += dt; }
    const f = this.fwd();
    const hs = this.speed * Math.cos(this.pitchA);
    this.x += f.x * hs * dt; this.z += f.z * hs * dt; this.y += this.vy * dt;
    this.y = Math.min(this.y, 600);
    // নামা: আস্তে আর সোজা হয়ে নামলে ঠিক আছে, না হলে দুর্ঘটনা
    if (this.y <= 0) {
      // খুব জোরে বা কাত হয়ে পড়লে ধ্বংস, একটু জোরে হলে শুধু ক্ষতি
      const wreck = this.vy < -9 || Math.abs(this.bank) > 0.7 || this.pitchA < -0.38;
      if (this.airborne || this.vy < -0.5) {
        if (wreck) { impact = 30; this.damage(999); }
        else if (this.vy < -4) { impact = 8; this.damage(this.maxHp * 0.2); }
      }
      this.y = 0; this.vy = 0;
      if (this.pitchA < 0) this.pitchA = 0;
      this.bank = 0;
      if (this.checkWater(world)) return impact;
    }
    const roof = world.roofAt(this.x, this.z);
    for (const c of S.circles) {
      const p = this.toWorld(0, c), o = { x: p.x, z: p.z };
      if (world.collide(o, S.r, this.y + 0.2, true) || this.y < roof - 0.5) {
        if (this.speed > 6) { impact = this.speed; this.damage(this.speed > 18 ? 999 : crashDmg(this.speed) * 3); }
        this.x += o.x - p.x; this.z += o.z - p.z;
        this.speed *= 0.2;
        break;
      }
    }
    return impact;
  }
  sync(dt) {
    if (this.sink) { super.sync(dt); return; }
    this.lod();
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(this.pitchA + (this.pitch || 0), this.yaw, this.bank + (this.roll || 0));
    const R = this.g.userData.rotors;
    if (R && R[2]) R[2].rotation.z += (0.2 + this.power) * 40 * (dt || 0);
    if (this.beam) this.beam.visible = false;
  }
  updateTumble() { this.tumble = null; return true; }
  repair() { super.repair(); this.power = 0; this.pitchA = 0; this.bank = 0; this.vy = 0; }
  reset() { this.repair(); this.x = this.home.x; this.z = this.home.z; this.y = 0; this.yaw = this.home.yaw; this.sync(0); }
}

// ---------- স্পিডবোট ----------
export class Boat extends Vehicle {
  constructor(scene, type, opts = {}) {
    super(scene, type, opts);
    this.home = { x: this.x, z: this.z, y: 0, yaw: this.yaw };
    this.t = Math.random() * 6;
    this.boat = true;
    this.sync(0);
  }
  flip() { return false; }
  // শুধু পানিতে: পাড়ে লাগলে ধাক্কা
  collide(world) {
    let impact = 0;
    const L = world.map.lakeDist;
    for (const c of this.spec.circles) {
      const p = this.toWorld(0, c);
      const d = L(p.x, p.z);
      if (d > -this.spec.r) {
        const e = 0.5;
        const gx = L(p.x + e, p.z) - L(p.x - e, p.z), gz = L(p.x, p.z + e) - L(p.x, p.z - e);
        const gl = Math.hypot(gx, gz) || 1;
        const push = d + this.spec.r;
        this.x -= (gx / gl) * push; this.z -= (gz / gl) * push;
        const f = this.fwd();
        const vn = -(f.x * gx / gl + f.z * gz / gl) * this.speed;
        if (vn < 0) { impact = Math.max(impact, -vn); this.speed *= 0.3; }
        this.lastHit = { x: p.x, z: p.z, nx: -gx / gl, nz: -gz / gl };
      }
    }
    return impact;
  }
  sync(dt) {
    this.t += dt || 0;
    const bob = Math.sin(this.t * 2.2) * 0.07;
    const pitchUp = -clamp(this.speed / this.spec.max, 0, 1) * 0.12;
    this.g.position.set(this.x, 0.05 + bob, this.z);
    this.g.rotation.set(pitchUp + Math.sin(this.t * 1.7) * 0.02, this.yaw, -this.steer * clamp(this.speed / 15, 0, 1) * 0.12);
    if (this.beam) this.beam.visible = this.hp > 0;
  }
  updateTumble() { this.tumble = null; return true; }
  reset() { this.repair(); this.x = this.home.x; this.z = this.home.z; this.yaw = this.home.yaw; this.speed = 0; this.sync(0); }
}

export function makeCraft(scene, type, opts) {
  if (type === 'plane') return new Plane(scene, type, opts);
  if (type === 'boat') return new Boat(scene, type, opts);
  return new Heli(scene, type, opts);
}
