// বিল্ডিংয়ের ভিতর: হাসপাতাল, থানা, রেস্টুরেন্ট, অস্ত্রের দোকান, অফিস।
// GTA V-এর মতো আলাদা ঘর: দরজায় F চাপলে ভিতরে, ভিতরে মানুষ কাজ করছে, কাউন্টারে কথা বলা যায়
import * as THREE from 'three';
import { makeRig, setPose, giveGun } from './rig.js';
import { planeGeo, texMat } from './lib3d.js';
import { signTex } from './textures.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';
import { Concourse } from './concourse.js';

const BASE_X = 9000; // ঘরগুলো শহর থেকে অনেক দূরে, ক্যামেরায় শহর দেখা যায় না
const WALL_H = 4.2;
const mats = new Map();
const M = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, emissive: 0x262626 })); return mats.get(c); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const FOOD = [
  { name: 'চা', price: 20, hp: 10 }, { name: 'সিঙ্গারা', price: 30, hp: 15 },
  { name: 'বিরিয়ানি', price: 180, hp: 60 }, { name: 'কাচ্চি স্পেশাল', price: 350, hp: 100 },
];
const ORDERS = ['চা', 'সিঙ্গারা', 'বিরিয়ানি', 'কোক'];
const ORDER_LINES = { 'চা': ['মামা, এক কাপ চা দেন', 'কড়া লিকার চা, চিনি কম'], 'সিঙ্গারা': ['দুইটা সিঙ্গারা দেন', 'সিঙ্গারা গরম আছে?'], 'বিরিয়ানি': ['এক প্লেট বিরিয়ানি', 'বিরিয়ানি, মাংস বেশি দিয়েন'], 'কোক': ['একটা ঠান্ডা কোক', 'কোক আছে? ঠান্ডা দেন'] };

const ROOM_COL = { shop: [0xd8cdb8, 0xf3ecdc], school: [0xb9a98f, 0xf2efe2], madrasa: [0x9fb59a, 0xf4f1e6], court: [0x7a5c42, 0xe9e1cf], bank: [0xd9dde0, 0xf5f6f7], power: [0xc9c3b4, 0xe7e3d6], post: [0xc5b8a0, 0xf0d9b5] };
export class Room {
  constructor(game, kind, idx, W, D) {
    this.g = game; this.kind = kind; this.W = W; this.D = D;
    this.X = BASE_X + idx * 140; this.Z = 0;
    this.grp = new THREE.Group();
    this.grp.position.set(this.X, 0, this.Z);
    game.scene.add(this.grp);
    this.spots = [];
    this.npcs = [];
    // মেঝে, ছাদ, চার দেয়াল (দক্ষিণের দেয়ালে দরজা)
    const rc = ROOM_COL[kind];
    this.box(W, 0.1, D, rc ? rc[0] : kind === 'hospital' ? 0xe8ecef : kind === 'thana' ? 0xb9b1a0 : kind === 'rest' ? 0xc9a77c : kind === 'gun' ? 0x6b6258 : 0xd6d2c8, 0, -0.05, 0);
    this.box(W, 0.1, D, 0xf0efe9, 0, WALL_H, 0);
    const wc = rc ? rc[1] : kind === 'hospital' ? 0xf4f6f6 : kind === 'thana' ? 0xd8cfae : kind === 'rest' ? 0xf1dcb4 : kind === 'gun' ? 0x4d4640 : 0xe4e8ea;
    this.box(W, WALL_H, 0.3, wc, 0, WALL_H / 2, -D / 2, true);
    this.box(0.3, WALL_H, D, wc, -W / 2, WALL_H / 2, 0, true);
    this.box(0.3, WALL_H, D, wc, W / 2, WALL_H / 2, 0, true);
    this.box(W / 2 - 1.2, WALL_H, 0.3, wc, -W / 4 - 0.6, WALL_H / 2, D / 2, true);
    this.box(W / 2 - 1.2, WALL_H, 0.3, wc, W / 4 + 0.6, WALL_H / 2, D / 2, true);
    this.box(2.4, WALL_H - 2.6, 0.3, wc, 0, 2.6 + (WALL_H - 2.6) / 2, D / 2);
    this.box(2.4, 2.6, 0.08, 0x3a2a1c, 0, 1.3, D / 2 + 0.2, true); // দরজা (বন্ধ, বাইরে দেখা যায় না)
    // ছাদের টিউবলাইট
    for (let x = -W / 2 + 3; x < W / 2 - 1; x += 5) this.box(1.4, 0.08, 0.2, 0xfffbe8, x, WALL_H - 0.06, 0, false, true);
    this.spawn = { x: 0, z: D / 2 - 1.6 };
    this.spots.push({ x: 0, z: D / 2 - 1.0, r: 1.5, label: 'বের হন', act: 'exit' });
  }
  // বাক্স: local x,y,z = মাঝখান; solid = ধাক্কা লাগে
  box(w, h, d, color, x, y, z, solid = false, glow = false) {
    const m = new THREE.Mesh(BOX, glow ? new THREE.MeshBasicMaterial({ color }) : M(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = false;
    this.grp.add(m);
    if (solid) this.g.world.addBox(this.X + x - w / 2, this.X + x + w / 2, this.Z + z - d / 2, this.Z + z + d / 2, y + h / 2, 'room');
    return m;
  }
  sign(text, style, x, y, z, w = 6) {
    const p = new THREE.Mesh(planeGeo(w, w / 4), texMat(signTex(text, style)));
    p.position.set(x, y, z);
    this.grp.add(p);
    return p;
  }
  // মানুষ: pose, মুখ কোন দিকে (yaw), বসা হলে seat উচ্চতা
  person(opts, x, z, yaw, pose = 'idle', seat = 0, extra = {}) {
    const rig = makeRig(opts);
    rig.root.position.set(x, seat ? seat - 0.95 + 0.08 : 0.16, z);
    rig.root.rotation.set(0, yaw, 0);
    this.grp.add(rig.root);
    const n = { rig, x, z, yaw, pose, pose0: pose, y0: rig.root.position.y, walk0: extra.walk, ...extra };
    if (extra.lying) { rig.root.rotation.order = 'YXZ'; rig.root.rotation.set(-Math.PI / 2, yaw, 0); rig.root.position.y = seat; }
    n.y0 = rig.root.position.y;
    this.npcs.push(n);
    return n;
  }
  reset() {
    for (const n of this.npcs) {
      n.dead = false; n.hp = 100; n.pose = n.pose0; n.rig.busy = false; if (n.walk0) n.walk = n.walk0;
      const r = n.rig.root;
      if (n.lying) { r.rotation.order = 'YXZ'; r.rotation.set(-Math.PI / 2, n.yaw, 0); } else r.rotation.set(0, n.yaw, 0);
      r.position.y = n.y0;
    }
    this.scared = false;
  }
  update(dt, t) {
    for (const n of this.npcs) {
      if (n.dead) continue;
      if (n.walk) {
        // এদিক-ওদিক হাঁটা
        const k = Math.sin(t * n.walk.speed + n.walk.ph);
        const x = n.walk.x0 + (n.walk.x1 - n.walk.x0) * (k * 0.5 + 0.5);
        const dir = Math.cos(t * n.walk.speed + n.walk.ph) >= 0 ? 1 : -1;
        n.rig.root.position.x = x;
        n.rig.root.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        setPose(n.rig, Math.abs(Math.cos(t * n.walk.speed + n.walk.ph)) > 0.15 ? 'walk' : 'idle', dt, 1.2, 8);
      } else if (!n.rig.busy) setPose(n.rig, n.pose, dt, 0, 6);
    }
  }
}

export class Interiors {
  constructor(g) {
    this.g = g;
    this.inside = null;
    this.rooms = {};
    this.t = 0;
    const pl = g.map.places;
    // কোন দরজা কোন ঘরে
    this.doors = [];
    const addDoor = (b, kind) => { if (b && b.door) this.doors.push({ b, kind, name: b.name }); };
    addDoor(pl.hospital, 'hospital');
    addDoor(pl.thana, 'thana');
    addDoor(pl.gunshop, 'gun');
    for (const b of pl.restaurants || []) addDoor(b, 'rest');
    for (const b of pl.offices || []) addDoor(b, 'office');
    this.build();
    this.bindDialog();
  }
  build() {
    const g = this.g;
    // হাসপাতাল
    let r = (this.rooms.hospital = new Room(g, 'hospital', 0, 22, 16));
    r.box(6, 1.1, 0.9, 0xffffff, 0, 0.55, -1.2, true);
    r.box(6.1, 0.08, 1.0, 0x2e7d9a, 0, 1.12, -1.2);
    r.person({ female: true, skirt: 0xffffff, orna: 0x80cbc4 }, -1, -2.3, Math.PI, 'phone');
    r.person({ female: true, skirt: 0xffffff, orna: 0xffffff }, 1.5, -2.3, Math.PI, 'idle');
    for (const x of [-8, -4, 4, 8]) {
      r.box(1.3, 0.6, 2.3, 0xffffff, x, 0.3, -6.4, true);
      r.box(1.3, 0.12, 0.6, 0xbfe3f0, x, 0.65, -7.2);
      if (x !== 4) r.person({ shirt: pick([0x6fa8dc, 0xe6b8af, 0xd9ead3]) }, x, -6.2, Math.PI / 2, 'down', 0.85, { lying: true });
    }
    r.person({ shirt: 0xffffff, pants: 0x34495e }, 0, -4.5, 0, 'walk', 0, { walk: { x0: -8, x1: 8, speed: 0.25, ph: 0 } });
    for (let i = 0; i < 4; i++) { r.box(3, 0.45, 0.6, 0x5d6d7e, -7 + i * 4.5, 0.22, 4.2, true); if (i % 2 === 0) r.person({ shirt: pick([0xc0392b, 0x16a085, 0x8e44ad]) }, -7.5 + i * 4.5, 4.2, Math.PI, 'sit', 0.45); }
    r.sign(g.map.places.hospital ? g.map.places.hospital.name : 'হাসপাতাল', 'hospital', 0, 3.2, -7.8, 8);
    r.box(0.1, 2.6, 1.6, 0x9aa3ad, 10.85, 1.3, 2);
    r.spots.push({ x: 0, z: 0, r: 1.8, label: 'রিসেপশনে কথা বলুন', act: 'hospital' });
    r.spots.push({ x: 10, z: 2, r: 1.6, label: 'লিফটে ছাদে যান (হেলিপ্যাড)', act: 'roof' });

    // থানা
    r = (this.rooms.thana = new Room(g, 'thana', 1, 22, 16));
    const cop = { shirt: 0x34507a, pants: 0x1c2333, cap: 0x1c2b4a };
    r.box(5, 1.1, 0.9, 0x5a3e26, 0, 0.55, -1, true);
    r.person(cop, 0, -2.1, Math.PI, 'idle');
    for (const [x, z] of [[-7, -4], [-3, -5.5], [6, 1.5]]) {
      r.box(2, 0.75, 1, 0x6e4b2a, x, 0.37, z, true);
      r.person(cop, x, z - 1.0, 0, 'drive', 0.5);
    }
    // হাজতখানা: শিক
    for (let x = 4; x <= 10.5; x += 0.5) r.box(0.06, WALL_H, 0.06, 0x222222, x, WALL_H / 2, -3, true);
    r.box(0.06, WALL_H, 4.6, 0x222222, 4, WALL_H / 2, -5.4, true);
    r.person({ shirt: 0x7f6000, kurta: true }, 7, -6, 0, 'angry');
    r.person({ shirt: 0x444444 }, 9, -6.8, 0, 'sit', 0.45);
    r.sign(g.map.places.thana ? g.map.places.thana.name : 'থানা', 'police', -4, 3.2, -7.8, 8);
    r.box(0.1, 2.6, 1.6, 0x9aa3ad, 10.85, 1.3, 4);
    r.spots.push({ x: 0, z: 0.2, r: 1.8, label: 'ডিউটি অফিসারের সাথে কথা বলুন', act: 'thana' });
    r.spots.push({ x: 10, z: 4, r: 1.6, label: 'সিঁড়ি দিয়ে ছাদে (পুলিশের হেলিকপ্টার)', act: 'roof' });

    // রেস্টুরেন্ট
    r = (this.rooms.rest = new Room(g, 'rest', 2, 16, 12));
    r.box(6, 1.05, 0.8, 0x8b5a2b, 0, 0.52, -3, true);
    r.box(6.1, 0.06, 0.9, 0xd7ccc8, 0, 1.07, -3);
    this.cashier = r.person({ shirt: 0xc62828, cap: 0xffffff }, 0, -3.9, Math.PI, 'idle');
    r.keeper = this.cashier;
    r.person({ shirt: 0xffffff, cap: 0xffffff }, 3, -5.1, Math.PI, 'swing');
    r.box(4, 1, 0.8, 0x5d4037, 3, 0.5, -5.6, true); // চুলা
    for (const [x, z] of [[-5, 0], [-1.5, 1.5], [2.5, 1], [5.5, -0.5]]) {
      r.box(1.2, 0.75, 1.2, 0x6d4c41, x, 0.37, z, true);
      if (Math.random() < 0.8) r.person({ shirt: pick([0x1565c0, 0x2e7d32, 0x6a1b9a, 0xef6c00]), female: Math.random() < 0.3 }, x, z + 1.0, 0, 'sit', 0.45);
    }
    this.restSign = r.sign('রেস্টুরেন্ট', null, 0, 3.2, -5.8, 6);
    r.spots.push({ x: 0, z: -2, r: 1.6, label: 'কাউন্টার: খাবার কিনুন / কাজ করুন', act: 'rest' });

    // অস্ত্রের দোকান + গুলি ছোড়ার জায়গা
    r = (this.rooms.gun = new Room(g, 'gun', 3, 18, 14));
    r.box(5, 1.1, 0.8, 0x3e2723, -4, 0.55, -2.5, true);
    const dealer = r.person({ shirt: 0x263238, pants: 0x111111 }, -4, -3.5, Math.PI, 'idle');
    giveGun(dealer.rig, true);
    for (const x of [-7, -4, -1]) r.box(2.4, 1.6, 0.2, 0x5d4037, x, 2.2, -6.85);
    for (let i = 0; i < 9; i++) r.box(0.6, 0.15, 0.08, 0x111111, -8 + i * 0.9, 2 + (i % 2) * 0.4, -6.7);
    // গুলির লেন: ডান পাশে, দেয়ালের দিকে টার্গেট
    r.box(0.15, 1.1, 8, 0x795548, 3, 0.55, -2, true);
    this.targets = [];
    for (const [x, z] of [[5, -6.3], [7, -6.3], [6, -5]]) {
      const tm = r.box(0.7, 1.1, 0.06, 0xf5f5f5, x, 1.4, z);
      const bull = r.box(0.3, 0.3, 0.07, 0xc62828, x, 1.5, z);
      this.targets.push({ x: r.X + x, z: r.Z + z, y: 1.4, m: tm, bull, down: 0 });
    }
    r.sign('অস্ত্রের দোকান', 'gun', -4, 3.2, -6.8, 6);
    r.spots.push({ x: -4, z: -1.4, r: 1.6, label: 'কাউন্টারে কিনুন', act: 'gun' });
    r.spots.push({ x: 6, z: 2, r: 2, label: 'গুলির লেন: পিস্তল তাক করে টার্গেটে গুলি করুন', act: 'range' });

    // অফিস
    r = (this.rooms.office = new Room(g, 'office', 4, 22, 16));
    r.box(4, 1.1, 0.9, 0xeceff1, 0, 0.55, 3, true);
    r.person({ female: true, skirt: 0x37474f, orna: 0xb0bec5 }, 0, 2, 0, 'phone');
    for (const x of [-8, -4, 4, 8]) for (const z of [-5.5, -2]) {
      r.box(1.8, 0.75, 0.9, 0x90a4ae, x, 0.37, z, true);
      r.box(0.6, 0.4, 0.05, 0x111111, x, 0.97, z - 0.2);
      r.person({ shirt: pick([0xffffff, 0xbbdefb, 0xc8e6c9, 0xf8bbd0]), pants: 0x263238, female: Math.random() < 0.35 }, x, z + 0.9, 0, Math.random() < 0.7 ? 'drive' : 'phone', 0.5);
    }
    r.box(0.5, 1.2, 0.5, 0x4fc3f7, -10, 0.6, 6.5, true);
    r.box(0.1, 2.6, 1.6, 0x9aa3ad, 10.85, 1.3, 4);
    this.officeSign = r.sign('অফিস', 'road', 0, 3.2, -7.8, 7);
    r.spots.push({ x: 0, z: 4.2, r: 1.6, label: 'রিসেপশনে কথা বলুন', act: 'office' });

    // মেট্রো স্টেশনের কনকোর্স
    this.concourse = new Concourse(this, Room);
    this.rooms.metro = this.concourse.room;
    r.spots.push({ x: 10, z: 4, r: 1.6, label: 'লিফটে ছাদে যান (হেলিপ্যাড)', act: 'roof' });
  }

  // ---------- দরজা ----------
  nearDoor() {
    const P = this.g.player;
    if (P.state !== 'foot') return null;
    // আগে দোকানের দরজার মুখ (b.entry), না থাকলে রাস্তার কিনারার দরজা; সবচেয়ে কাছেরটা
    let best = null, bd = 1e9;
    for (const d of this.doors) {
      if (Math.abs(P.y - (d.y || 0)) > 1) continue; // উঁচু দরজা (মেট্রোর সিঁড়ির মাথা) শুধু উপরে দাঁড়ালে
      const e = d.b.entry;
      if (e) { const k = Math.hypot(e.x - P.pos.x, e.z - P.pos.z); if (k < Math.max(2.2, (e.w || 0) / 2 + 0.6) && k < bd) { bd = k; best = d; } }
      const k2 = Math.hypot(d.b.door.x - P.pos.x, d.b.door.z - P.pos.z);
      if (k2 < 2.6 && k2 + 0.5 < bd) { bd = k2 + 0.5; best = d; }
    }
    return best;
  }
  enter(d) {
    const g = this.g, P = g.player;
    if (g.law.stars > 0 && !d.fromPlatform) { g.ui.toast('পুলিশ খুঁজছে! এখন ভিতরে ঢোকা যাবে না', 'bad'); return; }
    const r = this.rooms[d.kind];
    if (!r) return;
    if (d.kind === 'rest') this.restSign.material = texMat(signTex(d.name, null));
    if (d.kind === 'office') this.officeSign.material = texMat(signTex(d.name, 'road'));
    // অনেকক্ষণ পরে এলে নতুন লোক (মারা যাওয়া বা ভয় পাওয়া মানুষ আগের মতো)
    if ((r.scared || r.npcs.some((n) => n.dead)) && g.time - (r.crimeT || 0) > 90) r.reset();
    this.inside = { room: r, door: d };
    g.inside = this.inside;
    P.place(r.X + r.spawn.x, r.Z + r.spawn.z, 0);
    P.y = 0;
    g.camYaw = 0;
    g.camPos.set(r.X + r.spawn.x, 2, r.Z + r.spawn.z + 3);
    g.sound.door();
    g.ui.toast(`${d.name}`, '');
    if (d.kind === 'rest' || d.kind === 'gun') g.robbery.setInside(d, this.cashierFor(d.kind, r));
    if (d.kind === 'metro') this.concourse.onEnter(d.st, d.fromPlatform);
    if (r.onEnter) r.onEnter(d);
  }
  // প্ল্যাটফর্ম থেকে নিচে কনকোর্সে
  enterMetroFromPlatform(st) {
    const d = st.gateDoors && st.gateDoors[0];
    if (d) this.enter({ ...d, fromPlatform: true });
  }
  // ঘর থেকে বের হয়ে অন্য কোথাও (প্ল্যাটফর্মে) যাওয়া
  exitTo(fn) {
    const g = this.g;
    this.leaveQueue();
    this.inside = null;
    g.inside = null;
    g.robbery.setInside(null);
    fn();
  }
  leaveQueue() {
    if (this.inQueue) { this.concourse.queue = this.concourse.queue.filter((q) => !q.player); this.inQueue = false; }
  }
  cashierFor(kind, r) {
    if (kind === 'rest') return { x: r.X + this.cashier.x, z: r.Z + this.cashier.z, rig: this.cashier.rig };
    return null;
  }
  exit(toRoof = false) {
    const g = this.g, P = g.player;
    const d = this.inside.door;
    this.leaveQueue();
    this.inside = null;
    g.inside = null;
    g.robbery.setInside(null);
    if (toRoof) {
      const b = d.b;
      P.place(b.x + 2.5, b.z + 2.5, 0);
      P.y = b.h + 0.02;
      g.ui.toast('ছাদে এলেন। নিচে নামতে কিনারার কাছে F', '');
    } else {
      const e = d.b.entry;
      if (e) P.place(e.x + e.nx * 0.6, e.z + e.nz * 0.6, Math.atan2(-e.nx, -e.nz));
      else { const f = d.b.face; P.place(d.b.door.x + f.x * 1.2, d.b.door.z + f.z * 1.2, Math.atan2(-f.x, -f.z)); }
      P.y = d.y || 0;
    }
    g.camYaw = P.yaw;
    g.camPos.set(P.pos.x - Math.sin(P.yaw) * -4, P.y + 2.5, P.pos.z - Math.cos(P.yaw) * -4);
    g.sound.door();
  }
  // ভিতরে কাছের কাজের জায়গা
  nearSpot() {
    if (!this.inside) return null;
    const r = this.inside.room, P = this.g.player;
    let best = null, bd = 1e9;
    for (const s of r.spots) {
      const d = Math.hypot(r.X + s.x - P.pos.x, r.Z + s.z - P.pos.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  update(dt) {
    this.t += dt;
    for (const t of this.targets) if (t.down > 0) { t.down -= dt; const up = t.down <= 0; t.m.rotation.x = up ? 0 : -1.4; t.bull.rotation.x = t.m.rotation.x; }
    if (!this.inside) return '';
    this.inside.room.update(dt, this.t);
    if (this.inside.room.kind === 'metro') this.concourse.update(dt);
    if (!this.inside) return '';
    if (this.inside.room.kind === 'metro') { const gp = this.concourse.gatePrompt(); if (gp) return gp; }
    const s = this.nearSpot();
    const key = this.g.mobile ? 'ওঠা বোতাম' : 'F';
    if (!s) return '';
    if (s.act === 'range') return s.label;
    if (this.inside.room.kind === 'metro') { const t = this.concourse.prompt(s); if (t) return t; }
    return `${key}: ${s.label}`;
  }
  use() {
    const s = this.nearSpot();
    if (!s) return false;
    const g = this.g, d = this.inside.door;
    if (['mq', 'mtm', 'escL', 'escR', 'staff'].includes(s.act)) { this.concourse.use(s); return true; }
    const rm = this.inside.room;
    if ((s.fn || s.act) && s.act !== 'exit' && s.act !== 'roof' && rm.npcs.length) {
      // দোকানদার মারা গেলে বা সবাই ভয়ে হাত তুলে থাকলে কেনাবেচা-কাজ বন্ধ
      if (rm.keeper && rm.keeper.dead) { g.ui.toast('দোকানদার নেই… এখানে আর কেনাবেচা হবে না', 'bad'); return true; }
      if (rm.scared) { g.ui.toast('সবাই ভয়ে কাঁপছে, কেউ কথা বলছে না!', 'bad'); return true; }
    }
    if (s.fn) { s.fn(d, rm); return true; }
    if (s.act === 'exit') this.exit();
    else if (s.act === 'roof') this.exit(true);
    else if (s.act === 'gun') g.openShop();
    else if (s.act === 'hospital') this.dialog('রিসেপশন', '"আসসালামু আলাইকুম, কী সাহায্য করতে পারি?"', [
      { label: 'চিকিৎসা নিন (স্বাস্থ্য পুরো)', price: 200, act: () => this.heal(200) },
      { label: 'অ্যাম্বুলেন্স চালকের চাকরি', act: () => { this.exit(); g.work.start('ambulance'); } },
    ]);
    else if (s.act === 'thana') this.dialog('ডিউটি অফিসার', '"কী ব্যাপার? জিডি করবেন নাকি চাকরি?"', [
      { label: 'পুলিশের চাকরি: অপরাধী ধরা', act: () => { this.exit(); g.work.start('police'); } },
      { label: 'হারানো যানবাহন ফেরত চাই', act: () => { g.resetVehicles(); g.ui.toast('আপনার যানবাহন শুরুর গলিতে রাখা হয়েছে', 'good'); } },
    ]);
    else if (s.act === 'rest') this.dialog(d.name, '"কী খাবেন মামা?"', [
      ...FOOD.map((f) => ({ label: `${f.name} (+${bn(f.hp)} স্বাস্থ্য)`, price: f.price, act: () => this.eat(f) })),
      { label: 'দোকানে কাজ করুন (এক শিফট)', act: () => this.startShift(d) },
    ]);
    else if (s.act === 'office') this.dialog('রিসেপশন', '"স্যার, অ্যাপয়েন্টমেন্ট আছে? না থাকলে ছাদে হেলিকপ্টার দেখে আসতে পারেন।"', [
      { label: 'লিফটে ছাদে যান', act: () => this.exit(true) },
    ]);
    return true;
  }
  heal(price) {
    const g = this.g;
    if (!g.spend(price, 'চিকিৎসা')) return;
    g.player.health = 100; g.sound.money();
    g.ui.toast(`চিকিৎসা হলো: −৳${bnGroup(price)}`, 'money');
  }
  eat(f) {
    const g = this.g;
    if (!g.spend(f.price, f.name)) return;
    g.player.health = Math.min(100, g.player.health + f.hp); g.sound.money();
    g.ui.toast(`${f.name} খেলেন: −৳${bnGroup(f.price)}`, 'money');
  }
  // গুলির লেন: টার্গেটের দিকে তাক করে গুলি
  shot(ray) {
    if (!this.inside || this.inside.room.kind !== 'gun' || !ray) return;
    for (const t of this.targets) {
      if (t.down > 0) continue;
      const dx = t.x - ray.o.x, dy = t.y - ray.o.y, dz = t.z - ray.o.z;
      const s = dx * ray.d.x + dy * ray.d.y + dz * ray.d.z;
      if (s < 0) continue;
      const px = ray.o.x + ray.d.x * s - t.x, py = ray.o.y + ray.d.y * s - t.y, pz = ray.o.z + ray.d.z * s - t.z;
      const miss = Math.hypot(px, py, pz);
      if (miss < 0.45) {
        t.down = 2.5;
        this.score = (this.score || 0) + (miss < 0.15 ? 10 : 5);
        this.g.ui.toast(miss < 0.15 ? `মাঝখানে! স্কোর ${bn(this.score)}` : `লেগেছে! স্কোর ${bn(this.score)}`, 'good');
        this.g.sound.thud(0.3);
        return;
      }
    }
  }

  // ---------- কথা বলার কার্ড ----------
  bindDialog() {
    this.el = document.getElementById('dialog');
    document.getElementById('dlgClose').onclick = () => this.closeDialog();
  }
  dialog(title, sub, items) {
    const g = this.g;
    this.items = items;
    document.getElementById('dlgTitle').textContent = title;
    document.getElementById('dlgSub').textContent = sub;
    const box = document.getElementById('dlgItems');
    box.innerHTML = '';
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `<div><b>${bn(i + 1)}. ${it.label}</b>${it.note ? `<small>${it.note}</small>` : ''}</div>`;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small';
      b.textContent = it.price ? `৳${bnGroup(it.price)}` : 'বেছে নিন';
      b.onclick = () => this.pick(i);
      row.appendChild(b);
      box.appendChild(row);
    });
    if (g.state === 'play') {
      g.state = 'dialog';
      g.input.clear();
      if (document.exitPointerLock && g.input.locked) document.exitPointerLock();
      g.ui.prompt('');
      this.el.classList.remove('hidden');
      g.applyTouch();
    }
  }
  pick(i) {
    const it = this.items && this.items[i];
    if (!it) return;
    const keep = it.keep;
    if (!keep) this.closeDialog();
    it.act();
  }
  closeDialog() {
    const g = this.g;
    if (this.shift) { this.endShift(); }
    this.el.classList.add('hidden');
    if (g.state === 'dialog') { g.state = 'play'; g.applyTouch(); }
  }
  // ---------- দোকানে কাজ: খদ্দেরের অর্ডার মিলিয়ে দেওয়া ----------
  startShift(d) {
    this.shift = { n: 0, ok: 0, pay: 0, name: d.name, total: 8 };
    setTimeout(() => this.nextCustomer(), 50);
  }
  nextCustomer() {
    const S = this.shift;
    if (!S) return;
    if (S.n >= S.total) { this.endShift(); return; }
    S.n++;
    const want = pick(ORDERS);
    S.want = want;
    S.t0 = performance.now();
    const line = pick(ORDER_LINES[want]);
    this.dialog(`শিফট: খদ্দের ${bn(S.n)}/${bn(S.total)}`, `"${line}" · ঠিক দিলে ৳৬০ · এখন পর্যন্ত ৳${bnGroup(S.pay)}`, ORDERS.map((o) => ({
      label: o, keep: true, act: () => this.serve(o),
    })));
    this.g.say(this.cashier.rig.root, 'খদ্দের', line, 2);
  }
  serve(o) {
    const S = this.shift, g = this.g;
    if (!S) return;
    const fast = performance.now() - S.t0 < 4000;
    if (o === S.want) { S.ok++; S.pay += fast ? 80 : 60; g.sound.money(); }
    else g.sound.hurt();
    this.nextCustomer();
  }
  endShift() {
    const S = this.shift, g = this.g;
    this.shift = null;
    if (!S) return;
    g.money += S.pay; g.save();
    this.el.classList.add('hidden');
    if (g.state === 'dialog') { g.state = 'play'; g.applyTouch(); }
    g.ui.toast(`শিফট শেষ: ${bn(S.ok)}/${bn(S.n)} জন খুশি, মজুরি ৳${bnGroup(S.pay)}`, S.pay ? 'money' : 'bad');
  }
  // ঘরের ভিতরে ক্যামেরা দেয়ালের বাইরে যেন না যায়
  clampCam(c) {
    if (!this.inside) return;
    const r = this.inside.room;
    c.x = clamp(c.x, r.X - r.W / 2 + 0.4, r.X + r.W / 2 - 0.4);
    c.z = clamp(c.z, r.Z - r.D / 2 + 0.4, r.Z + r.D / 2 - 0.4);
    c.y = clamp(c.y, 0.6, WALL_H - 0.3);
  }
}
