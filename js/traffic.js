// রাস্তার অন্য গাড়ি আর ফুটপাতের মানুষ (বাম দিক দিয়ে চলে)
import * as THREE from 'three';
let CASH_GEO = null, CASH_MAT = null;
const RUNNERS = new Set(['rickshaw', 'van', 'bike', 'cng', 'autorickshaw', 'easybike']);
import { Vehicle, SPECS } from './vehicles.js';
import { OPEN, HEAVY } from './morevehicles.js';
import { makeRig, setPose, POLICE_LOOK } from './rig.js';
import { pick, rand, clamp, damp } from './utils.js';
import { FOOT } from './mapgen.js';

// রাগী মানুষের কথা
const LINES = {
  hit: ['চোখ কি পকেটে রাখছেন?!', 'মাইরা ফেলবেন নাকি?!', 'থামেন! পুলিশ ডাকতেছি!', 'আপনার নামে মামলা করব!', 'এইটা কি রাস্তা না রেসের মাঠ?'],
  bump: ['এই! দেইখা চালান!', 'আরে ভাই, গায়ে লাগাইলেন কেন?', 'চোখ নাই নাকি?'],
  driver: ['আমার গাড়ি উল্টায় দিলেন!', 'এই গাড়ির দাম কে দিবে?!', 'নামেন! লাইসেন্স দেখান!', 'মামলা দিমু, দাঁড়ান!'],
  rider: ['আমার হাত-পা ভাঙলেন!', 'থামেন! পুলিশ!', 'এইভাবে কেউ চালায়?!'],
  passenger: ['আমি আর এই গাড়িতে নাই!', 'ভাড়া দিমু না! জানে বাঁচছি!'],
  crowd: ['ধর! ধর!', 'ভিডিও কর!', 'নাম্বার প্লেট দেখছো?', 'পুলিশ ডাকো!', 'পালাইতেছে!', 'হায় হায়!'],
  fight: ['আমারে মারলি?! দাঁড়া!', 'আয়, দেখি কত শক্তি!', 'মাইর খাবি আজকে!'],
  flee: ['বাঁচাও!', 'পালাও! পালাও!', 'গুলি! গুলি!', 'আল্লাহ গো!', 'মাইরা ফেলবে!'],
  shot: ['আহ! গুলি লাগছে!', 'বাঁচাও! কেউ হাসপাতালে নাও!'],
  dead: ['হায় আল্লাহ! মইরা গেছে!', 'অ্যাম্বুলেন্স ডাকো!', 'খুন! খুন!', 'পুলিশ! পুলিশ!'],
  jacked: ['আমার গাড়ি! চোর! চোর!', 'এই! নামেন আমার গাড়ি থেকে!', 'ছিনতাইকারী! ধর!', 'পুলিশ! আমার গাড়ি নিয়া গেল!'],
  busPass: ['আল্লাহ! বাস ছিনতাই!', 'নামেন সবাই! নামেন!', 'ড্রাইভার কই গেল?!'],
  fire: ['আগুন! আগুন!', 'সরেন! ফাটবে!', 'ফায়ার সার্ভিস ডাকো!'],
};
const WHO = { fire: 'চালক', jacked: 'গাড়ির মালিক', busPass: 'বাসের যাত্রী', hit: 'পথচারী', bump: 'পথচারী', driver: 'চালক', rider: 'চালক', passenger: 'যাত্রী', crowd: 'লোকজন', fight: 'পথচারী', flee: 'পথচারী', shot: 'পথচারী', dead: 'লোকজন' };
// ফুটপাতের সাধারণ কথা (রাস্তার মানুষের সাউন্ড)
const STREET = [
  'অ্যাই রিকশা!', 'ভাই কত ভাড়া?', 'এই জ্যাম দেখেন!', 'বৃষ্টি আসতেছে মনে হয়',
  'ও পাশে যান, ও পাশে!', 'মোবাইল চার্জ কম', 'চা খাইয়া আসি', 'বাস কোথায় থামে?',
  'এই বাইকওয়ালা আস্তে!', 'ফুটপাতে হাঁটেন ভাই', 'গরম কত যে!', 'আজকে অফিসে দেরি',
  'পান-সিগারেট আছে?', 'টাকা ভাঙবেন?', 'এই দিক দিয়ে শর্টকাট', 'হর্ন বাজান কেন?',
];

const CRUISE = { car: 14, cng: 10, rickshaw: 3.8, bike: 15, bus: 10, police: 13, easybike: 8.5, autorickshaw: 6.5, leguna: 11, truck: 10, pickup: 13, van: 3.4 };
const MIX = ['car', 'car', 'car', 'cng', 'cng', 'rickshaw', 'rickshaw', 'bike', 'bike', 'bus', 'bus', 'easybike', 'easybike', 'autorickshaw', 'autorickshaw', 'leguna', 'truck', 'pickup', 'van'];
const SLOW = new Set(['rickshaw', 'cng', 'easybike', 'autorickshaw', 'van', 'leguna']);

function angDamp(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// সরানো জিনিসের জ্যামিতি/ম্যাটেরিয়াল ছেড়ে দেওয়া (মেমরি লিক রোধ)
// সাবধান: lam()/boxGeo() ক্যাশ শেয়ারড — সেগুলো কখনো dispose নয়; শুধু own/BufferGeometry
export function disposeTree(o) {
  if (!o) return;
  o.traverse((m) => {
    if (!m.isMesh && !m.isSkinnedMesh) return;
    m.frustumCulled = true;
    const g = m.geometry;
    if (g && !m.userData.shared && !g.userData?.shared && g.type === 'BufferGeometry') g.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (!mat || !mat.userData?.own) continue; // clone করা নিজস্ব ম্যাটই
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
        const t = mat[k];
        if (t && t.dispose && t.userData?.own) t.dispose();
      }
      mat.dispose();
    }
  });
}
const AI_INTERVAL = 0.14; // দূরের AI ~140ms-এ একবার
const AI_NEAR = 85;
const AI_FAR = 150;

export class Traffic {
  constructor(scene, map, world) {
    this.scene = scene;
    this.map = map;
    this.world = world;
    this.cars = [];
    this.peds = [];
    this.maxCars = 22;
    this.maxPeds = 18;
    this.patrolMax = 2;
    this.noPatrol = false;
  }

  // একটা রাস্তার অংশে লেন: a→b দিকে চললে বাম পাশে
  lane(seg, forward, type) {
    const d = forward ? seg.dir : { x: -seg.dir.x, z: -seg.dir.z };
    const n = { x: d.z, z: -d.x }; // বাম দিক
    let off;
    const slow = SLOW.has(type);
    if (seg.oneway) {
      // একমুখী: পুরো রাস্তা এক দিকে, ধীর যানবাহন বাম কিনারায়
      off = slow ? seg.width / 2 - 1.3 : Math.min(seg.width / 2 - 1.3, seg.width * 0.12 + 0.6);
    } else if (seg.width >= 12) off = slow ? seg.width / 2 - 1.4 : seg.width * 0.2;
    else off = Math.max(0.9, Math.min(seg.width / 4 + 0.3, seg.width / 2 - 0.9));
    // রাস্তার কাজ চললে সেই পাশের গাড়ি ব্যারিকেড থেকে সরে চলে
    if (seg.work && !seg.oneway && seg.work.side === (forward ? 1 : -1)) off = Math.min(off, seg.width / 2 - seg.work.depth - 1.15);
    return { d, n, off };
  }
  crossHalf(nodeId) {
    return this.world.nodeW[nodeId].r;
  }
  // মানুষ কোথায় হাঁটে: প্রধান সড়কে ফুটপাতে, গলিতে রাস্তার কিনারা ঘেঁষে
  pedOff(s) { return s.main ? s.width / 2 + FOOT / 2 : Math.max(0.6, s.width / 2 - 0.5); }
  // একমুখী রাস্তায় উল্টো দিকে যাওয়া যাবে না
  canGo(seg, fromNode) { return !seg.oneway || seg.a === fromNode; }
  // লেনের শেষ বিন্দু (মোড়ের একটু আগে)
  laneEnd(car) {
    const s = car.seg;
    const toId = car.fwd ? s.b : s.a;
    const n = this.map.nodes[toId];
    const L = this.lane(s, car.fwd, car.v.type);
    const back = this.crossHalf(toId) + (this.crossHalf(toId) ? 1.5 : -0.5);
    return { x: n.x - L.d.x * back + L.n.x * L.off, z: n.z - L.d.z * back + L.n.z * L.off };
  }

  spawnCar(px, pz) {
    const segs = this.map.segments;
    for (let tries = 0; tries < 20; tries++) {
      const s = pick(segs);
      if (s.len < 12 || s.type === 'service') continue;
      const fwd = s.oneway ? true : Math.random() < 0.5;
      const t = rand(4, s.len - 4);
      // টহল পুলিশের গাড়ি (১-২টা)
      const patrols = this.cars.filter((c) => c.v.type === 'police' && !c.dead).length;
      let type = !this.noPatrol && patrols < this.patrolMax && Math.random() < 0.25 ? 'police' : pick(MIX);
      if (!s.main && (HEAVY.has(type) || type === 'leguna' || (type === 'police' && s.width < 6))) type = s.width < 6 ? pick(['rickshaw', 'autorickshaw', 'van']) : pick(['car', 'easybike']); // সরু গলিতে বাস-ট্রাক না
      const L = this.lane(s, fwd, type);
      const along = fwd ? t : s.len - t;
      const x = s.ax + s.dir.x * t + L.n.x * L.off, z = s.az + s.dir.z * t + L.n.z * L.off;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < 70 || dist > 260) continue;
      if (this.cars.some((c) => Math.hypot(c.v.x - x, c.v.z - z) < 14)) continue;
      const v = new Vehicle(this.scene, type, { ai: true, x, z, yaw: Math.atan2(-L.d.x, -L.d.z) });
      // চালক
      const d = type === 'police'
        ? makeRig({ ...POLICE_LOOK })
        : makeRig({ helmet: type === 'bike' ? 0x222222 : undefined, kurta: type === 'rickshaw' || type === 'van' || type === 'autorickshaw' });
      v.g.add(d.root);
      d.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
      v.g.traverse((m) => { if (m.isMesh || m.isSkinnedMesh) { m.frustumCulled = true; if (!m.userData.noShadow) m.castShadow = false; } });
      d.root.traverse((m) => { if (m.isMesh || m.isSkinnedMesh) { m.frustumCulled = true; m.castShadow = false; } });
      const car = { v, seg: s, fwd, cruise: CRUISE[type] * rand(0.85, 1.1), rig: d, honk: rand(1, 3), along, stuck: 0, bypass: 0, dead: false, _cast: false };
      v.speed = car.cruise * 0.6;
      this.cars.push(car);
      return car;
    }
    return null;
  }

  spawnPed(px, pz) {
    const segs = this.map.segments;
    for (let tries = 0; tries < 20; tries++) {
      const s = pick(segs);
      const side = Math.random() < 0.5 ? -1 : 1;
      if (s.len < 4) continue;
      const t = rand(1, s.len - 1);
      const off = side * (this.pedOff(s) + rand(-0.4, 0.4));
      const x = s.ax + s.dir.x * t - s.dir.z * off, z = s.az + s.dir.z * t + s.dir.x * off;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < 30 || dist > 140) continue;
      if (this.map.lakeDist(x, z) < 0 && !s.bridges.length) continue;
      const female = Math.random() < 0.35;
      const rig = makeRig({ real: true, female, orna: female ? pick([0xffd54f, 0xf48fb1, 0x80cbc4]) : undefined, skirt: female ? pick([0xc2185b, 0x00897b, 0x5e35b1, 0xef6c00]) : undefined, kurta: !female && Math.random() < 0.3, cap: !female && Math.random() < 0.2 ? 0xffffff : undefined });
      this.scene.add(rig.root);
      rig.root.traverse((m) => { if (m.isMesh || m.isSkinnedMesh) { m.frustumCulled = true; m.castShadow = false; m.receiveShadow = false; } });
      this.peds.push({ rig, seg: s, t, off, dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), x, z, yaw: 0, dodge: 0, health: 100, _cast: false });
      return;
    }
  }

  removeCar(c) {
    this.scene.remove(c.v.g);
    if (c.rig) {
      if (c.rig.root.parent) c.rig.root.parent.remove(c.rig.root);
      if (c.rig.dispose) c.rig.dispose();
      else disposeTree(c.rig.root);
    }
    disposeTree(c.v.g);
    this.cars.splice(this.cars.indexOf(c), 1);
  }
  // কাছের গাড়িতেই ছায়া (দূরের castShadow বন্ধ = ড্র কল সাশ্রয়)
  setCarShadow(c, on) {
    if (c._cast === on) return;
    c._cast = on;
    c.v.g.traverse((m) => { if ((m.isMesh || m.isSkinnedMesh) && !m.userData.noShadow) m.castShadow = on; });
  }
  setPedShadow(p, on) {
    if (p._cast === on) return;
    p._cast = on;
    p.rig.root.traverse((m) => { if (m.isMesh || m.isSkinnedMesh) m.castShadow = on; });
  }

  // কাউকে (চালক, যাত্রী) ফুটপাতের মানুষের দলে নেওয়া
  adoptPerson(rig, x, z, yaw, react) {
    if (rig.root.parent) rig.root.parent.remove(rig.root);
    this.scene.add(rig.root);
    rig.root.rotation.order = 'YXZ';
    rig.root.rotation.set(0, yaw, 0);
    const nr = this.world.nearestRoad(x, z);
    const s = nr.seg;
    const side = nr.lat >= 0 ? -1 : 1;
    const p = {
      rig, seg: s, t: clamp(nr.t, 0, s.len), off: side * this.pedOff(s), dir: Math.random() < 0.5 ? 1 : -1,
      speed: rand(1.1, 1.5), x, z, yaw, dodge: 0, react: null, health: 100,
    };
    this.setReact(p, react);
    this.peds.push(p);
    return p;
  }
  setReact(p, r) {
    p.rig.root.rotation.order = 'YXZ';
    p.react = Object.assign({ t: 0, y: 0.16, vx: 0, vz: 0, vy: 0, spin: 0, said: 0 }, r);
  }
  // পথচারীকে ধাক্কা
  hitPed(p, v, g) {
    const sp = Math.abs(v.speed);
    const f = v.fwd(), sg = Math.sign(v.speed) || 1;
    let ax = p.x - v.x, az = p.z - v.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l; az /= l;
    p.hitCd = g.time;
    p.crossing = false;
    if (sp > 6.5) {
      // গতি যত বেশি, আঘাত তত বেশি; ১৪ মি/সে (৫০ কিমি/ঘণ্টা) এর বেশি হলে প্রায় নিশ্চিত মৃত্যু। আহত বা মারা গেলে তবেই মামলা
      p.health -= sp * 7.5 + rand(-8, 8);
      const die = p.health <= 0;
      this.setReact(p, { mode: 'fly', vx: f.x * sg * sp * 0.55 + ax * 2, vz: f.z * sg * sp * 0.55 + az * 2, vy: 1.8 + sp * 0.12, kind: 'hit', die });
      v.speed *= 0.75;
      g.sound.thud(1);
      g.shake = Math.max(g.shake || 0, 0.25);
      g.law.offense(die ? (p.trafficCop ? 'killTCop' : 'kill') : (p.trafficCop ? 'runTCop' : 'ped'), p.x, p.z);
      if (die) { this.panic(p.x, p.z, 35, g, p); return; }
    } else {
      // হালকা ধাক্কা: শুধু বকা দেয়, মামলা হয় না
      p.x += ax * 0.7; p.z += az * 0.7;
      this.setReact(p, { mode: 'angry', t: 5, kind: 'bump' });
      v.speed *= 0.6;
      g.sound.thud(0.4);
      return;
    }
    this.crowd(p, g);
  }
  // ট্রাফিকের বাইরের মানুষ (অন্য সিস্টেমের): { x, z, rig, yaw, take() }
  bystanders(g) {
    const out = [];
    const L = g.life;
    if (L && !g.inside) for (const kind of ['keeper', 'cust', 'guard', 'walker']) {
      const pool = L.pool[kind];
      for (const o of pool) if (o.used && o.x !== undefined) out.push({ x: o.x, z: o.z, rig: o.rig, yaw: o.rig.root.rotation.y, take: () => { const i = pool.indexOf(o); if (i >= 0) pool.splice(i, 1); } });
    }
    // মোড়ের ট্রাফিক পুলিশ: মারা যায়, গাড়িচাপা পড়ে (কিছুক্ষণ সেই মোড়ে নতুন পুলিশ আসে না)
    const S = g.signals;
    if (S && S.cops && !g.inside) for (const c of S.cops) {
      const r = c.rig.root;
      out.push({ x: r.position.x, z: r.position.z, rig: c.rig, yaw: r.rotation.y, cop: true, take: () => S.takeCop(c) });
    }
    const rk = g.robbery && !g.inside && g.robbery.bystander();
    if (rk) out.push(rk);
    if (g.works) for (const o of g.works.people) out.push({ x: o.x, z: o.z, rig: o.rig, yaw: o.rig.root.rotation.y, take: () => g.works.takePerson(o) });
    const B = g.buses;
    if (B) for (const pl of [...(B.counters || []), ...(B.stands || [])]) for (const r of pl.rigs || []) {
      const x = r._x ?? r.root.position.x, z = r._z ?? r.root.position.z;
      out.push({ x, z, rig: r, yaw: r.root.rotation.y, take: () => { const i = pl.rigs.indexOf(r); if (i >= 0) pl.rigs.splice(i, 1); pl.want = Math.max(0, (pl.want ?? 3) - 1); } });
    }
    return out;
  }
  removePed(p) {
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
    this.scene.remove(p.rig.root);
    disposeTree(p.rig.root);
    if (p.rig.dispose) p.rig.dispose();
    if (p.decal && this.g) this.g.combat.removeDecal(p.decal);
    if (p.body) p.body.gone = true;
  }
  // ঘুষি, লাথি, গুলি বা বিস্ফোরণ লাগলে. opts: { knock (ছিটকে পড়ে), trip (পায়ে লাথিতে পড়ে যায়) }
  damagePed(p, dmg, kind, from, g, opts = {}) {
    if (p.react && p.react.mode === 'dead') return;
    const byP = from === g.player.pos;
    let ax = p.x - from.x, az = p.z - from.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l; az /= l;
    const melee = kind === 'punch' || kind === 'kick';
    const r0 = p.react;
    p.crossing = false;
    // মাটিতে পড়ে থাকা লোককে লাথি: উঠতে দেরি হয়, বেশি মারলে জ্ঞান হারায়
    if (melee && r0 && (r0.mode === 'down' || r0.mode === 'fly')) {
      p.health -= dmg;
      r0.t = Math.max(r0.t || 0, 1.4);
      // GTA V-এর মতো: পড়ে থাকা লোককে বেশি মারলে মারা যায়
      if (p.health <= 0) {
        if (r0.mode === 'fly') r0.die = true;
        else this.kill(p, g);
        if (byP) g.law.offense(p.trafficCop ? 'killTCop' : 'kill', p.x, p.z);
        this.panic(p.x, p.z, 30, g, p);
        return;
      }
      if (byP) g.law.offense('assault', p.x, p.z);
      this.crowd(p, g);
      return;
    }
    p.health -= dmg;
    if (p.health <= 0) {
      if (melee && !p.koed) {
        // প্রথমবার: জ্ঞান হারিয়ে পড়ে যায়, পরে উঠে পালায়। আবার মারলে মারা যেতে পারে
        p.koed = true;
        p.health = 40;
        // অজ্ঞান হলে পকেটের টাকা পড়ে যায় (একবারই)
        if (byP && !p.dropped && Math.random() < 0.65) { p.dropped = true; this.dropCash(p.x, p.z, Math.round(rand(20, 300) / 10) * 10, g); }
        this.setReact(p, { mode: 'fly', vx: ax * 2.5, vz: az * 2.5, vy: 1.5, y: 0.16, kind: 'flee', ko: true, fx: from.x, fz: from.z });
        if (byP) g.law.offense('assault', p.x, p.z);
        this.crowd(p, g);
        return;
      }
      const big = kind === 'explode';
      this.setReact(p, { mode: 'fly', vx: ax * (big ? 6 : 1.5), vz: az * (big ? 6 : 1.5), vy: big ? 5 : 1.2, y: 0.16, kind: 'hit', die: true });
      if (byP) g.law.offense('kill', p.x, p.z);
      this.panic(p.x, p.z, 35, g, p);
      return;
    }
    if (melee) {
      const fighting = r0 && r0.mode === 'fight';
      if (opts.knock || opts.trip) {
        // ছিটকে বা পা পিছলে পড়ে যায়; উঠে আবার মারতে আসে বা পালায়
        const k = opts.trip ? 0.8 : 2.4;
        this.setReact(p, { mode: 'fly', vx: ax * k, vz: az * k, vy: opts.trip ? 2 : 1.6, y: 0.16, kind: 'fight', after: fighting || Math.random() < 0.5 ? 'fight' : 'flee', fx: from.x, fz: from.z, said: 1 });
      } else if (fighting) {
        // মার খেয়ে টলে যায়, আক্রমণ থেমে যায়
        p.x += ax * 0.35; p.z += az * 0.35;
        r0.flinch = 0.4; r0.wind = 0; r0.hitCd = Math.max(r0.hitCd, 0.55);
      } else {
        p.x += ax * 0.4; p.z += az * 0.4;
        // কেউ পাল্টা মারে, কেউ পালায়
        if (Math.random() < 0.5) this.setReact(p, { mode: 'fight', t: 14, kind: 'fight', flinch: 0.3, hitCd: 0.8 });
        else this.setReact(p, { mode: 'flee', t: rand(7, 10), kind: 'flee', flinch: 0.3, fx: from.x, fz: from.z });
      }
      if (byP) g.law.offense('assault', p.x, p.z);
      this.crowd(p, g);
    } else {
      // গুলি বা বিস্ফোরণে আহত: পড়ে যায়, তারপর খুঁড়িয়ে পালায়
      p.injured = true;
      const big = kind === 'explode';
      this.setReact(p, { mode: 'fly', vx: ax * (big ? 5 : 1.2), vz: az * (big ? 5 : 1.2), vy: big ? 4 : 1, y: 0.16, kind: 'shot', after: 'flee', fx: from.x, fz: from.z });
    }
  }
  // ভয়ে চারদিকে দৌড়
  panic(x, z, R, g, src = null) {
    let shouts = 0;
    for (const q of this.peds) {
      if (q === src) continue;
      const m = q.react && q.react.mode;
      if (m === 'dead' || m === 'fly' || m === 'down' || m === 'fight' || m === 'flee') continue;
      if (Math.hypot(q.x - x, q.z - z) > R) continue;
      this.setReact(q, { mode: 'flee', t: rand(6, 10), kind: src ? 'dead' : 'flee', fx: x, fz: z, shout: shouts < 2, delay: rand(0, 0.4) });
      shouts++;
    }
    // দোকানদার, ক্রেতা, দারোয়ান, বাস কাউন্টারের যাত্রী, মজুর: সবাই দৌড়ে পালায়
    let n = 0;
    for (const b of this.bystanders(g)) {
      if (b.cop || Math.hypot(b.x - x, b.z - z) > R) continue; // ট্রাফিক পুলিশ পালায় না
      b.take();
      this.adoptPerson(b.rig, b.x, b.z, b.yaw || 0, { mode: 'flee', t: rand(7, 11), kind: src ? 'dead' : 'flee', fx: x, fz: z, shout: shouts < 3, delay: rand(0, 0.5) });
      shouts++; n++;
    }
    // কিছুক্ষণ দোকানের সামনে কেউ দাঁড়ায় না
    if (g.life && Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < 120) g.life.scaredUntil = g.time + 30;
  }
  // আশেপাশের লোকজন জড়ো হয়ে চিৎকার
  crowd(src, g) {
    let shouts = 0;
    for (const q of this.peds) {
      if (q === src || q.react) continue;
      if (Math.hypot(q.x - src.x, q.z - src.z) > 30) continue;
      this.setReact(q, { mode: 'crowd', t: rand(5, 8), kind: 'crowd', delay: rand(0.2, 1.2), shout: shouts < 2 });
      shouts++;
    }
  }
  updateReact(p, dt, g) {
    const r = p.react, P = g.player;
    const root = p.rig.root;
    const face = () => { p.yaw = angDamp(p.yaw, Math.atan2(-(P.pos.x - p.x), -(P.pos.z - p.z)), 6, dt); };
    const speak = () => g.say(root, r.who || WHO[r.kind] || 'লোকজন', pick(LINES[r.kind] || LINES.crowd), 2.4);
    if (r.mode === 'fly') {
      r.vy -= 15 * dt;
      p.x += r.vx * dt; p.z += r.vz * dt; r.y += r.vy * dt;
      const o = { x: p.x, z: p.z };
      if (this.world.collide(o, 0.3, 0.5)) { p.x = o.x; p.z = o.z; r.vx *= -0.2; r.vz *= -0.2; }
      r.spin = Math.min(Math.PI / 2, r.spin + dt * 7);
      if (r.y <= 0.14 && r.vy < 0) {
        r.y = 0.14; r.spin = Math.PI / 2;
        if (r.die) this.kill(p, g);
        else { r.mode = 'down'; r.t = r.ko ? rand(4, 6) : rand(1.8, 2.6); }
      }
      setPose(p.rig, 'down', dt, 0, 10);
    } else if (r.mode === 'down') {
      r.vx = damp(r.vx, 0, 5, dt); r.vz = damp(r.vz, 0, 5, dt);
      p.x += r.vx * dt; p.z += r.vz * dt;
      r.t -= dt;
      setPose(p.rig, 'down', dt, 0, 10);
      if (r.t <= 0) {
        r.spin = 0; r.y = 0.16;
        if (p.health < 50) p.injured = true;
        if (p.injured) p.speed = 0.6; // খুঁড়িয়ে হাঁটা
        if (r.kind === 'jacked') {
          // ছিনতাইয়ের পরে: কেউ মারতে আসে, কেউ গাড়ির পিছে দৌড়ায়, কেউ পালায়
          const k = Math.random();
          if (k < 0.35) Object.assign(r, { mode: 'fight', t: 14, said: 0, hitCd: 0.6, chaseCar: true });
          else if (k < 0.65) Object.assign(r, { mode: 'fight', t: 7, said: 0, hitCd: 0.6, chaseCar: true });
          else Object.assign(r, { mode: 'flee', t: rand(6, 9), shout: true, said: 0, fx: P.pos.x, fz: P.pos.z });
        } else if (r.after === 'fight' && !r.ko && P.state === 'foot') {
          Object.assign(r, { mode: 'fight', t: 12, said: 1, hitCd: 0.7, wind: 0 });
        } else if (r.kind === 'shot' || r.ko || r.after === 'flee') {
          const k = r.kind === 'shot' ? 'shot' : 'flee';
          Object.assign(r, { mode: 'flee', t: rand(7, 10), kind: k, shout: true, said: 0, fx: r.fx ?? P.pos.x, fz: r.fz ?? P.pos.z });
        } else { r.mode = 'angry'; r.t = 6; }
      }
    } else if (r.mode === 'dead') {
      // মৃতদেহ, অ্যাম্বুলেন্স এসে নিয়ে যাবে
      r.t += dt;
      setPose(p.rig, 'down', dt, 0, 10);
    } else if (r.mode === 'flee') {
      r.t -= dt;
      if (r.delay > 0) { r.delay -= dt; setPose(p.rig, 'idle', dt, 0, 8); }
      else {
        if (r.shout && !r.said) { r.said = 1; speak(); }
        let dx = p.x - r.fx, dz = p.z - r.fz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const sp = p.injured ? 1.6 : 5.2;
        p.x += dx * sp * dt; p.z += dz * sp * dt;
        const o = { x: p.x, z: p.z };
        if (this.world.collide(o, 0.3, 0.3)) {
          // দেয়ালে আটকালে পাশ দিয়ে
          p.x = o.x + dz * sp * dt; p.z = o.z - dx * sp * dt;
        }
        p.yaw = angDamp(p.yaw, Math.atan2(-dx, -dz), 8, dt);
        setPose(p.rig, r.flinch > 0 ? 'flinch' : p.injured ? 'walk' : 'run', dt, sp, 10);
      }
      if (r.flinch > 0) r.flinch -= dt;
      if (r.t <= 0) p.react = null;
    } else if (r.mode === 'fight') {
      // পাল্টা মারামারি: কাছে এসে মুঠি তোলে, একটু থেমে (দেখে ব্লক করা যায়) ঘুষি বা লাথি মারে
      r.t -= dt; r.hitCd -= dt;
      if (r.flinch > 0) r.flinch -= dt;
      if (!r.said) { r.said = 1; speak(); }
      const dx = P.pos.x - p.x, dz = P.pos.z - p.z, d = Math.hypot(dx, dz);
      face();
      let pose = d < 3.5 ? 'guard' : 'angry', sp = 0;
      if (P.state === 'foot' || P.state === 'enter' || P.state === 'fall' || r.chaseCar) {
        const keep = r.atk === 'kick' ? 1.45 : 1.05;
        if (d > keep + 0.1 && !(r.wind > 0) && !(r.flinch > 0)) { sp = d > 4 ? 4.6 : 2; const st = Math.min(d - keep, sp * dt); p.x += (dx / d) * st; p.z += (dz / d) * st; pose = sp > 3 ? 'run' : 'walk'; }
        if (r.wind > 0) {
          r.wind -= dt;
          pose = 'guard';
          if (r.wind <= 0) {
            const reach = r.atk === 'kick' ? 2.0 : 1.55;
            r.act = r.atk === 'kick' ? 0.42 : 0.3;
            r.actPose = r.atk === 'kick' ? pick(['kick', 'lowkick']) : pick(['jab', 'cross', 'hook']);
            g.sound.whoosh();
            if (d < reach && P.state === 'foot') {
              g.damagePlayer(r.atk === 'kick' ? 9 : 6, r.atk === 'kick' ? 'kick' : 'punch', p);
              g.sound.thud(r.atk === 'kick' ? 0.7 : 0.5);
            }
          }
        } else if (d < 2.0 && r.hitCd <= 0 && P.state === 'foot' && !(r.flinch > 0)) {
          r.atk = Math.random() < 0.35 ? 'kick' : 'punch';
          r.wind = 0.3; r.hitCd = rand(1.0, 1.5);
        }
      }
      const o = { x: p.x, z: p.z };
      this.world.collide(o, 0.3, 0.3); p.x = o.x; p.z = o.z;
      if (r.act > 0) { r.act -= dt; pose = r.actPose || 'punch'; }
      if (r.flinch > 0) pose = 'stagger';
      setPose(p.rig, pose, dt, sp, pose === 'jab' || pose === 'cross' || pose === 'hook' || pose === 'kick' || pose === 'lowkick' ? 22 : 12);
      if (r.t <= 0 || d > (r.chaseCar ? 60 : 30) || (P.state === 'drive' && !r.chaseCar) || P.state === 'dead') p.react = null;
    } else if (r.mode === 'angry') {
      r.t -= dt;
      face();
      if (r.said === 0 || (r.said === 1 && r.t < 3)) { r.said++; speak(); }
      setPose(p.rig, 'angry', dt, 0, 8);
      if (r.t <= 0) p.react = null;
    } else if (r.mode === 'crowd') {
      r.t -= dt;
      face();
      if (r.delay > 0) { r.delay -= dt; setPose(p.rig, 'idle', dt, 0, 8); }
      else {
        if (r.shout && !r.said) { r.said = 1; speak(); }
        setPose(p.rig, r.t % 3 < 1.5 ? 'cheer' : 'angry', dt, 0, 8);
      }
      if (r.t <= 0) p.react = null;
    }
    root.position.set(p.x, r.y, p.z);
    root.rotation.set(-r.spin, p.yaw, 0);
  }
  // মৃত্যু: রক্তের দাগ, লোকজনের চিৎকার, অ্যাম্বুলেন্স
  kill(p, g) {
    const r = p.react;
    r.mode = 'dead'; r.t = 0; r.y = 0.14; r.spin = Math.PI / 2;
    p.health = 0;
    p.decal = g.combat.blood(p.x, p.z, rand(0.8, 1.1));
    // পকেটে টাকা থাকলে মাটিতে পড়ে (কাছে গেলে তোলা যায়)
    if (!p.dropped && Math.random() < 0.7) p.dropped = true, this.dropCash(p.x, p.z, Math.round(rand(20, p.rich ? 1500 : 450) / 10) * 10, g);
    const body = { x: p.x, z: p.z, remove: () => this.removePed(p) };
    p.body = body;
    g.medic.request(body);
    // কাছের কেউ একজন চিৎকার করে
    const w = this.peds.find((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 30 && !(q.react && q.react.mode === 'dead'));
    if (w) g.say(w.rig.root, 'লোকজন', pick(LINES.dead), 2.6);
  }
  // রাস্তার গাড়ি উল্টানো
  flipCar(c, pushX, pushZ, power, g) {
    const v = c.v;
    const sp = v.speed;
    if (!v.flip(pushX, pushZ, power)) return false;
    c.dead = true;
    c.stun = 0;
    if (OPEN.has(v.type) && c.rig) {
      // চালক ছিটকে পড়ে
      const p = v.toWorld(v.spec.seat.x, v.spec.seat.z);
      const f = v.fwd();
      this.adoptPerson(c.rig, p.x, p.z, v.yaw, { mode: 'fly', vx: f.x * sp * 0.5 + pushX * power * 0.3, vz: f.z * sp * 0.5 + pushZ * power * 0.3, vy: 3, y: 0.8, kind: 'rider' });
      c.rig = null;
    }
    return true;
  }
  // আগুন লাগা গাড়ি: থেমে যায়, চালক নেমে চিৎকার করে পালায়
  burnCar(c, g) {
    const v = c.v;
    c.dead = true;
    v.stun = 0;
    if (c.rig) {
      const p = v.toWorld(v.spec.door.x + 0.6, v.spec.door.z);
      this.adoptPerson(c.rig, p.x, p.z, v.yaw, { mode: 'flee', t: rand(6, 9), kind: 'fire', shout: true, fx: v.x, fz: v.z, delay: 0.3 });
      c.rig = null;
    }
  }
  updateDead(c, dt, g) {
    const v = c.v;
    if (v.sink) {
      v.updateSink(dt);
      // চালক সাঁতরে পাড়ে উঠে যায়
      if (c.rig && v.sink.t > 1.5) { const s = this.world.shoreNear(v.x, v.z); this.adoptPerson(c.rig, s.x, s.z, v.yaw, { mode: 'angry', t: 6, kind: 'driver' }); c.rig = null; }
      v.sync(dt);
      return;
    }
    if (v.tumble) {
      if (v.updateTumble(dt, this.world) && c.rig) c.exitT = 0.9;
    } else if (c.rig && c.exitT !== undefined) {
      c.exitT -= dt;
      if (c.exitT <= 0) {
        // চালক বের হয়ে বকা দেয়
        const p = v.toWorld(v.spec.door.x + 0.6, v.spec.door.z);
        this.adoptPerson(c.rig, p.x, p.z, v.yaw, { mode: 'angry', t: 7, kind: 'driver' });
        c.rig = null;
      }
    }
    if (c.rig && !v.tumble) setPose(c.rig, 'sit', dt, 0, 8);
    if (!v.tumble && Math.abs(v.speed) > 0.05) { v.speed = damp(v.speed, 0, 2.5, dt); const f = v.fwd(); v.x += f.x * v.speed * dt; v.z += f.z * v.speed * dt; }
    v.sync(dt);
  }

  dropCash(x, z, amt, g) {
    if (!CASH_GEO) { CASH_GEO = new THREE.BoxGeometry(0.34, 0.06, 0.18); CASH_MAT = new THREE.MeshLambertMaterial({ color: 0x5fae5a, emissive: 0x1d4a1a }); }
    const m = new THREE.Mesh(CASH_GEO, CASH_MAT);
    m.position.set(x + rand(-0.4, 0.4), 0.2, z + rand(-0.4, 0.4));
    g.scene.add(m);
    this.cash = this.cash || [];
    this.cash.push({ m, amt, t: 0 });
    if (this.cash.length > 30) { const o = this.cash.shift(); g.scene.remove(o.m); }
  }
  updateCash(dt, g) {
    if (!this.cash || !this.cash.length) return;
    const P = g.player;
    for (let i = this.cash.length - 1; i >= 0; i--) {
      const c = this.cash[i];
      c.t += dt;
      c.m.rotation.y += dt * 2.5; c.m.position.y = 0.22 + Math.sin(c.t * 3) * 0.05;
      const d = Math.hypot(c.m.position.x - P.pos.x, c.m.position.z - P.pos.z);
      if (P.state === 'foot' && d < 1.1) {
        g.money += c.amt; g.sound.money(); g.ui.toast(`টাকা কুড়িয়ে পেলেন ৳${c.amt}`, 'money'); g.save();
        g.scene.remove(c.m); this.cash.splice(i, 1);
      } else if (c.t > 150) { g.scene.remove(c.m); this.cash.splice(i, 1); }
    }
  }
  update(dt, g) {
    const P = g.player;
    const px = P.pos.x, pz = P.pos.z;
    // দূরের AI থ্রটল: প্রতি ফ্রেমে নয়, ~140ms-এ একবার
    this._aiAcc = (this._aiAcc || 0) + dt;
    const aiPulse = this._aiAcc >= AI_INTERVAL;
    if (aiPulse) this._aiAcc = 0;
    this.updateCash(dt, g);
    // রাস্তার মানুষের কথাবার্তা (কাছের পথচারী)
    this.streetChatT = (this.streetChatT ?? rand(2, 5)) - dt;
    if (this.streetChatT <= 0) {
      this.streetChatT = rand(3.5, 8);
      let best = null, bd = 14;
      for (const p of this.peds) {
        if (p.react || p.bridgePath) continue;
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && g.say) {
        g.say(best.rig.root, 'পথচারী', pick(STREET), 2.0);
        if (g.sound.crowdMurmur) g.sound.crowdMurmur(0.4, bd);
      }
    }
    while (this.cars.length < this.maxCars && this.spawnCar(px, pz)) { /* ভরে দাও */ }
    while (this.peds.length < this.maxPeds) { const n = this.peds.length; this.spawnPed(px, pz); if (this.peds.length === n) break; }

    // কলিজন/অবস্ট্যাকল শুধু খেলোয়াড়ের কাছের (~AI_FAR) যানবাহন
    const obstacles = [];
    for (const c of this.cars) {
      if (Math.hypot(c.v.x - px, c.v.z - pz) > AI_FAR + 20) continue;
      obstacles.push({ x: c.v.x, z: c.v.z, self: c, r: c.dead ? c.v.spec.len / 2 + 0.5 : undefined });
    }
    for (const v of g.vehicles) {
      if (v.y > 2 || v.boat || Math.hypot(v.x - px, v.z - pz) > AI_FAR + 20) continue;
      obstacles.push({ x: v.x, z: v.z, self: v, r: v.spec.len / 2 });
    }
    if (g.law) for (const u of g.law.units) {
      if (Math.hypot(u.v.x - px, u.v.z - pz) > AI_FAR + 20) continue;
      obstacles.push({ x: u.v.x, z: u.v.z, self: u.v, r: 2.2 });
    }
    if (P.state !== 'drive' && P.state !== 'ride') obstacles.push({ x: px, z: pz, player: true });
    // মিছিল/অবরোধ — যানজটের বাধা
    if (g.life && g.life.blockBodies) for (const b of g.life.blockBodies()) obstacles.push(b);
    this.ensureBridgeWalkers(px, pz);
    for (const p of this.peds) {
      if (!p.crossing && !p.react) continue;
      if (Math.hypot(p.x - px, p.z - pz) > AI_FAR) continue;
      const lying = p.react && (p.react.mode === 'dead' || p.react.mode === 'down');
      obstacles.push({ x: p.x, z: p.z, ped: !lying });
    }

    // আপনার যানবাহন পথচারীর গায়ে লাগলে
    const pv = P.state === 'drive' ? P.vehicle : null;
    if (pv && !pv.tumble && !(pv.y > 1.5) && Math.abs(pv.speed) > 1.2) {
      // আগের ফ্রেমের জায়গা থেকে এখন পর্যন্ত পুরো পথটা দেখি (জোরে চললে বা ফ্রেম কম হলে মানুষের ভিতর দিয়ে চলে যেত)
      const cs = pv.circles();
      const mx = this._pv === pv ? pv.x - this._pvx : 0, mz = this._pv === pv ? pv.z - this._pvz : 0;
      const mv = Math.hypot(mx, mz), steps = mv > 6 ? 0 : Math.ceil(mv / 0.4);
      const hits = (x, z) => {
        for (const c of cs) {
          if (Math.hypot(c.x - x, c.z - z) < c.r + 0.4) return true;
          for (let k = 1; k <= steps; k++) { const t = k / (steps + 1); if (Math.hypot(c.x - mx * t - x, c.z - mz * t - z) < c.r + 0.4) return true; }
        }
        return false;
      };
      for (const p of this.peds) {
        if (p.react && (p.react.mode === 'fly' || p.react.mode === 'down' || p.react.mode === 'dead')) continue;
        if (p.hitCd && g.time - p.hitCd < 1.5) continue;
        if (Math.hypot(p.x - pv.x, p.z - pv.z) > 12 + mv) continue;
        if (hits(p.x, p.z)) this.hitPed(p, pv, g);
      }
      // দোকানের সামনের লোক, দারোয়ান, বাস কাউন্টারের যাত্রী: ধাক্কা খেলে পথচারীর মতোই ছিটকে পড়ে
      for (const b of this.bystanders(g)) {
        if (Math.hypot(b.x - pv.x, b.z - pv.z) > 12 + mv || !hits(b.x, b.z)) continue;
        b.take();
        const p = this.adoptPerson(b.rig, b.x, b.z, b.yaw || 0, { mode: 'angry', t: 0.2, kind: 'bump' });
        if (b.cop) p.trafficCop = true;
        this.hitPed(p, pv, g);
      }
    }
    this._pv = pv; if (pv) { this._pvx = pv.x; this._pvz = pv.z; }

    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      const v = c.v;
      const dist = Math.hypot(v.x - px, v.z - pz);
      if (dist > 300 && !c.keep) { this.removeCar(c); continue; }
      if (c.dead) { this.updateDead(c, dt, g); continue; }
      this.setCarShadow(c, dist < 70);
      // >150m: ফিজিক্স/AI বন্ধ, শুধু আস্তে এগোয় + বিরল sync (ফ্রিজ/ল্যাগ কমায়)
      if (dist > AI_FAR && !c.keep) {
        if (Math.abs(v.speed) > 0.05) {
          const f = v.fwd();
          v.x += f.x * v.speed * dt;
          v.z += f.z * v.speed * dt;
        }
        if (aiPulse) { v.sync(AI_INTERVAL); setPose(c.rig, v.spec.pose || 'drive', AI_INTERVAL, v.speed, 4); }
        continue;
      }
      // 85–150m: প্রতি ফ্রেমে শুধু চলা; ভারী AI শুধু aiPulse-এ
      if (dist > AI_NEAR && !aiPulse) {
        const f = v.fwd();
        v.x += f.x * v.speed * dt;
        v.z += f.z * v.speed * dt;
        v.sync(dt);
        continue;
      }
      // লক্ষ্য বিন্দু
      const end = this.laneEnd(c);
      const toEnd = (end.x - v.x) * (c.fwd ? c.seg.dir.x : -c.seg.dir.x) + (end.z - v.z) * (c.fwd ? c.seg.dir.z : -c.seg.dir.z);
      // লাল বাতিতে স্টপ লাইনে দাঁড়িয়ে থাকা (পরের রাস্তা বাছাই হয় সবুজ হলে)
      const sig = g.signals && !c.runRed ? g.signals.stateFor(c.fwd ? c.seg.b : c.seg.a, c.seg.id) : null;
      const holdRed = sig === 'r' || (sig === 'y' && v.speed < 3);
      if (toEnd < 2 && !holdRed) {
        // মোড়ে এসে পরের রাস্তা বাছাই
        const nodeId = c.fwd ? c.seg.b : c.seg.a;
        const node = this.map.nodes[nodeId];
        const big = HEAVY.has(c.v.type);
        let opts = node.links.filter((l) => l.seg !== c.seg.id && this.canGo(this.map.segments[l.seg], nodeId) && (!big || this.map.segments[l.seg].main));
        if (!opts.length) opts = node.links.filter((l) => l.seg !== c.seg.id && this.canGo(this.map.segments[l.seg], nodeId));
        // সোজা যাওয়ার প্রবণতা বেশি (বাঁকা রাস্তার বিন্দুতে অদ্ভুত মোড় না নেয়)
        const cd = c.fwd ? c.seg.dir : { x: -c.seg.dir.x, z: -c.seg.dir.z };
        const wsc = (l) => { const s = this.map.segments[l.seg]; const d = s.a === nodeId ? s.dir : { x: -s.dir.x, z: -s.dir.z }; return 0.35 + Math.max(0, d.x * cd.x + d.z * cd.z) * 2; };
        let l = node.links[0];
        if (opts.length) {
          const tot = opts.reduce((a, o) => a + wsc(o), 0);
          let r = Math.random() * tot;
          for (const o of opts) { r -= wsc(o); if (r <= 0) { l = o; break; } }
          if (r > 0) l = opts[opts.length - 1];
        } else {
          l = node.links.find((o) => o.seg === c.seg.id) || node.links[0]; // কানাগলি: ঘুরে ফেরা
        }
        const ns = this.map.segments[l.seg];
        c.seg = ns;
        c.fwd = ns.a === nodeId;
        // রিকশা, ভ্যান, বাইক, সিএনজি: মাঝে মাঝে লাল বাতি মানে না
        c.runRed = RUNNERS.has(v.type) && Math.random() < 0.3;
        c.jam = 0;
      }
      const tgt = this.laneEnd(c);
      // মোড় পার হওয়ার সময় সামনে একটু এগিয়ে তাক করা
      const L = this.lane(c.seg, c.fwd, v.type);
      const ahead = { x: v.x + L.d.x * 10, z: v.z + L.d.z * 10 };
      const sx = c.seg.ax, sz = c.seg.az;
      const along = (ahead.x - sx) * c.seg.dir.x + (ahead.z - sz) * c.seg.dir.z;
      // সামনে উল্টানো গাড়ি বা দাঁড়ানো কিছু থাকলে পাশ কাটিয়ে যাওয়া
      const off = L.off - (c.bypass > 0 ? 3.4 : 0);
      if (c.bypass > 0) c.bypass -= dt;
      const laneX = sx + c.seg.dir.x * along + L.n.x * off, laneZ = sz + c.seg.dir.z * along + L.n.z * off;
      const aimX = Math.hypot(tgt.x - v.x, tgt.z - v.z) < 12 ? tgt.x : laneX;
      const aimZ = Math.hypot(tgt.x - v.x, tgt.z - v.z) < 12 ? tgt.z : laneZ;
      const want = Math.atan2(-(aimX - v.x), -(aimZ - v.z));
      const turn = Math.abs(angDiff(v.yaw, want));
      v.yaw = angDamp(v.yaw, want, v.type === 'bus' ? 2 : 3.2, dt);
      // সামনে কিছু থাকলে থামো
      const f = v.fwd();
      let gap = 99, blockedByPlayer = false, blk = null;
      for (const o of obstacles) {
        if (o.self === c || o.self === v) continue;
        const rx = o.x - v.x, rz = o.z - v.z;
        const al = rx * f.x + rz * f.z;
        if (al <= 0 || al > 16) continue;
        const lat = Math.abs(rx * f.z - rz * f.x);
        if (lat > v.spec.wid / 2 + 1.2) continue;
        const gp = al - v.spec.len / 2 - (o.r || 1.2);
        if (gp < gap) { gap = gp; blk = o; blockedByPlayer = !!o.player || o.self === P.vehicle; }
      }
      if (v.speed < 0.6 && gap < 5 && blk && !blk.player && !blk.ped) c.stuck += dt;
      else c.stuck = Math.max(0, c.stuck - dt);
      if (c.stuck > 2.5 && !(c.bypass > 0)) { c.bypass = 4.5; c.stuck = 0; }
      let target = c.cruise * (turn > 0.5 ? 0.45 : 1);
      if (gap < 1.5) target = 0;
      else if (gap < 10) target = Math.min(target, (gap - 1.5) * 1.1);
      // সামনের মোড়ে সিগন্যাল: লাল/হলুদ হলে স্টপ লাইনে থামা (হলুদে খুব কাছে থাকলে পার হয়ে যায়)
      if (g.signals) {
        const st = g.signals.stateFor(c.fwd ? c.seg.b : c.seg.a, c.seg.id);
        if (st && st !== 'g' && !c.runRed) {
          const dx = c.fwd ? c.seg.dir.x : -c.seg.dir.x, dz = c.fwd ? c.seg.dir.z : -c.seg.dir.z;
          const te = (tgt.x - v.x) * dx + (tgt.z - v.z) * dz;
          const committed = st === 'y' && te < Math.max(4, v.speed * 0.9);
          if (te > -0.5 && te < 45 && !committed) { target = Math.min(target, te < 1 ? 0 : Math.sqrt(2 * 3.2 * (te - 1))); c.redStop = true; } else c.redStop = false;
        } else c.redStop = false;
      }
      if (v.type === 'bus' && g.buses) target = g.buses.busTarget(c, v, target, dt);
      // মিছিল / অবরোধ সামনে থাকলে জোর যানজট
      const evtHalt = g.life && g.life.roadHaltAhead ? g.life.roadHaltAhead(c.seg, v.x, v.z, c.fwd) : null;
      if (evtHalt) { target = 0; c.bypass = 0; }
      if (v.stun > 0) { v.stun -= dt; target = 0; }
      if (v.flats) target = Math.min(target, Math.max(1.5, 7 - v.flats * 2)); // পাংচার চাকায় ধীরে
      v.speed = damp(v.speed, target, gap < 4 || evtHalt || (c.redStop && target < v.speed) ? 8 : 2, dt);
      // জ্যামে আটকে থাকলে হর্ন (ঢাকার মতো, পরপর না) — মিছিল/অবরোধে আরও আক্রমণাত্মক
      if (v.speed < 0.6 && (gap < 5 || c.redStop || evtHalt) && !blockedByPlayer) {
        c.jam = (c.jam || 0) + dt * (evtHalt ? 1.8 : 1);
        const dp = Math.hypot(v.x - px, v.z - pz);
        const jamNeed = evtHalt ? 1.2 : 3;
        const rate = evtHalt ? (0.45 + Math.min(0.4, c.jam * 0.03)) : (0.12 + Math.min(0.25, c.jam * 0.01));
        if (c.jam > jamNeed && dp < (evtHalt ? 95 : 70) && Math.random() < dt * rate && (this.honkCd = (this.honkCd || 0)) <= g.time) {
          this.honkCd = g.time + (evtHalt ? 0.28 : 0.55);
          c.hp ??= rand(0.85, 1.2);
          const st = (v.type === 'bus' || v.type === 'truck') && Math.random() < (evtHalt ? 0.55 : 0.35) ? 'long' : v.type === 'car' && Math.random() < 0.5 ? 'double' : '';
          g.sound.horn(v.type, evtHalt ? 0.55 : 0.35, dp, c.hp, st);
        }
      } else c.jam = 0;
      // রিকশা চলতে চলতে টুংটাং (খেলোয়াড়ের কাছে)
      if (v.type === 'rickshaw' && v.speed > 0.8) {
        c.bellT = (c.bellT ?? rand(2, 8)) - dt;
        if (c.bellT <= 0) { c.bellT = rand(4, 10); const dp = Math.hypot(v.x - px, v.z - pz); if (dp < 35 && g.sound.bell) g.sound.bell(0.6, dp); }
      }
      if (v.speed < 0.5 && gap < 6 && blockedByPlayer) {
        c.honk -= dt;
        if (c.honk <= 0) { c.honk = rand(1.5, 3.5); c.hp ??= rand(0.85, 1.2); g.sound.horn(v.type, 0.5, Math.hypot(v.x - px, v.z - pz), c.hp, v.type === 'bus' && Math.random() < 0.5 ? 'long' : 'double'); }
      }
      v.x += f.x * v.speed * dt;
      v.z += f.z * v.speed * dt;
      v.sync(dt);
      const pose = v.spec.pose || 'drive';
      c.rig.bike = v.type === 'bike' ? { steer: v.steerEff || 0, speed: v.speed, stop: Math.abs(v.speed) < 0.7 } : null;
      setPose(c.rig, pose, dt, v.speed, 8);
    }

    // ফুটপাতের মানুষ
    // সবার শরীর (একজন আরেকজনের ভিতর দিয়ে যেন না যায়): শুধু কাছের পথচারী
    const bodies = this._bodies = [];
    for (const q of this.peds) {
      if (q.react && (q.react.mode === 'fly' || q.react.mode === 'down' || q.react.mode === 'dead')) continue;
      if (Math.hypot(q.x - px, q.z - pz) > AI_NEAR + 25) continue;
      bodies.push({ x: q.x, z: q.z, p: q });
    }
    if (P.state === 'foot' && !g.inside) bodies.push({ x: P.pos.x, z: P.pos.z, player: true });
    for (const b of this.bystanders(g)) {
      if (Math.hypot(b.x - px, b.z - pz) > AI_NEAR + 25) continue;
      bodies.push({ x: b.x, z: b.z });
    }
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k];
      const pd = Math.hypot(p.x - px, p.z - pz);
      if (pd > AI_FAR) {
        this.removePed(p);
        continue;
      }
      this.setPedShadow(p, pd < 55);
      if (p.bridgePath) { this.updateBridgePed(p, dt, g); continue; }
      // দূরের পথচারী: ভারী বডি-কলিজন/পাথ AI বাদ, শুধু হাঁটা + বিরল পোজ
      if (pd > AI_NEAR && !p.react) {
        if (aiPulse || pd < AI_NEAR + 20) {
          const sp = p.speed;
          p.t += p.dir * sp * (aiPulse ? AI_INTERVAL : dt);
          const edge = Math.min(2, p.seg.len / 2 - 0.01);
          if ((p.dir < 0 && p.t < edge) || (p.dir > 0 && p.t > p.seg.len - edge)) {
            p.dir *= -1; // সস্তা: মোড় বাছাই না করে উল্টো হাঁটা
            p.t = clamp(p.t, edge, p.seg.len - edge);
          }
          const s = p.seg;
          p.x = s.ax + s.dir.x * p.t - s.dir.z * p.off;
          p.z = s.az + s.dir.z * p.t + s.dir.x * p.off;
          p.yaw = Math.atan2(-s.dir.x * p.dir, -s.dir.z * p.dir);
          const wy = this.world.walkY ? this.world.walkY(p.x, p.z, 1.2) : null;
          p.rig.root.position.set(p.x, wy != null ? wy : 0.16, p.z);
          p.rig.root.rotation.set(0, p.yaw, 0);
          if (aiPulse) setPose(p.rig, 'walk', AI_INTERVAL, sp, 6);
        }
        continue;
      }
      if (p.react) { this.updateReact(p, dt, g); continue; }
      // কাছে গাড়ি এলে সরে দাঁড়ায়
      let near = false;
      if (P.vehicle && Math.abs(P.vehicle.speed) > 3 && Math.hypot(P.vehicle.x - p.x, P.vehicle.z - p.z) < 5) near = true;
      if (near && p.dodge <= 0) p.dodge = 1.2;
      if (p.dodge > 0) p.dodge -= dt;
      // সামনে কেউ থাকলে পাশ কাটিয়ে যায় (না পারলে ধীরে), মুখোমুখি হলে দুজনেই নিজের বাঁ দিকে সরে
      const fx0 = p.seg.dir.x * p.dir, fz0 = p.seg.dir.z * p.dir;
      let avT = 0, slow = 1;
      for (const b of bodies) {
        if (b.p === p) continue;
        const rx = b.x - p.x, rz = b.z - p.z;
        const along = rx * fx0 + rz * fz0;
        if (along <= 0 || along > 2.4) continue;
        const lat = rx * fz0 - rz * fx0; // + = বাঁ দিকে
        if (Math.abs(lat) > 0.75) continue;
        avT = lat > 0.05 ? -0.8 : 0.8;
        if (along < 0.9) slow = Math.min(slow, along / 0.9 * 0.6);
      }
      p.av = damp(p.av || 0, avT, 3, dt);
      const sp = p.dodge > 0 ? 0 : p.speed * slow;
      p.t += p.dir * sp * dt;
      const edge = Math.min(2, p.seg.len / 2 - 0.01);
      if ((p.dir < 0 && p.t < edge) || (p.dir > 0 && p.t > p.seg.len - edge)) {
        // রাস্তার পরের অংশে: সোজা যাওয়ার প্রবণতা, একই পাশ ধরে
        const nodeId = p.dir < 0 ? p.seg.a : p.seg.b;
        const node = this.map.nodes[nodeId];
        const cd = { x: p.seg.dir.x * p.dir, z: p.seg.dir.z * p.dir };
        let best = null, bs = -9;
        for (const l of node.links) {
          if (l.seg === p.seg.id && node.links.length > 1) continue;
          const s2 = this.map.segments[l.seg];
          const d2 = s2.a === nodeId ? s2.dir : { x: -s2.dir.x, z: -s2.dir.z };
          const sc = d2.x * cd.x + d2.z * cd.z + Math.random() * (node.links.length >= 3 ? 1.6 : 0.2);
          if (sc > bs) { bs = sc; best = l; }
        }
        const ns = this.map.segments[(best || node.links[0]).seg];
        const startA = ns.a === nodeId;
        const side = Math.sign(p.off || 1) * p.dir; // হাঁটার দিকের কোন পাশে
        p.seg = ns;
        p.dir = startA ? 1 : -1;
        p.t = startA ? Math.min(0.3, ns.len / 2) : Math.max(ns.len - 0.3, ns.len / 2);
        // মোড়ে মাঝে মাঝে রাস্তা পার হয়ে অন্য পাশে
        const flip = node.links.length >= 3 && Math.random() < 0.25 ? -1 : 1;
        p.off = side * p.dir * flip * (this.pedOff(ns) + rand(-0.4, 0.4));
      }
      const s = p.seg;
      const nx = s.ax + s.dir.x * p.t - s.dir.z * p.off, nz = s.az + s.dir.z * p.t + s.dir.x * p.off;
      const dodgeOff = (p.dodge > 0 ? Math.sign(p.off) * 0.8 : 0) - (p.av || 0) * p.dir;
      const gx = nx - s.dir.z * dodgeOff, gz = nz + s.dir.x * dodgeOff;
      const gd = Math.hypot(gx - p.x, gz - p.z);
      let want = Math.atan2(-s.dir.x * p.dir, -s.dir.z * p.dir), moving = sp;
      if (gd > 1.2) {
        // ফুটপাত থেকে দূরে (ঝামেলার পরে): হেঁটে ফিরে যাওয়া
        p.t -= p.dir * sp * dt;
        const st = Math.min(gd, 1.5 * dt);
        p.x += ((gx - p.x) / gd) * st;
        p.z += ((gz - p.z) / gd) * st;
        want = Math.atan2(-(gx - p.x), -(gz - p.z));
        moving = 1.5;
        p.crossing = true;
      } else {
        p.crossing = false;
        p.x = damp(p.x, gx, 8, dt);
        p.z = damp(p.z, gz, 8, dt);
      }
      // ধাক্কা: কারো সাথে গায়ে গা লেগে গেলে সরে যায় (আপনাকেও ঠেলে)
      for (const b of bodies) {
        if (b.p === p) continue;
        const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), R = 0.62;
        if (d < R && d > 1e-4) {
          const push = (R - d) / d;
          if (b.player) { p.x += dx * push * 0.5; p.z += dz * push * 0.5; P.pos.x -= dx * push * 0.5; P.pos.z -= dz * push * 0.5; b.x = P.pos.x; b.z = P.pos.z; }
          else if (b.p) { p.x += dx * push * 0.5; p.z += dz * push * 0.5; b.p.x -= dx * push * 0.5; b.p.z -= dz * push * 0.5; }
          else { p.x += dx * push; p.z += dz * push; }
        }
      }
      if (moving > 0 && slow < 0.99) moving *= slow;
      p.yaw = angDamp(p.yaw, want, 6, dt);
      const wy = this.world.walkY ? this.world.walkY(p.x, p.z, 1.2) : null;
      p.rig.root.position.set(p.x, wy != null ? wy : 0.16, p.z);
      p.rig.root.rotation.set(0, p.yaw, 0);
      setPose(p.rig, moving > 0 ? 'walk' : 'idle', dt, moving, 10);
    }
  }

  // পদচারী সেতুতে হাঁটা NPC
  ensureBridgeWalkers(px, pz) {
    const obs = this.world.overbridges;
    if (!obs || !obs.length) return;
    const have = this.peds.filter((p) => p.bridgePath).length;
    if (have >= 4) return;
    const near = obs.filter((b) => { const d = Math.hypot(b.cx - px, b.cz - pz); return d > 25 && d < 130; });
    if (!near.length) return;
    const b = pick(near);
    const female = Math.random() < 0.4;
    const rig = makeRig({ real: true, female, orna: female ? pick([0xffd54f, 0xf48fb1]) : undefined, skirt: female ? pick([0xc2185b, 0x00897b]) : undefined });
    this.scene.add(rig.root);
    rig.root.traverse((m) => { if (m.isMesh || m.isSkinnedMesh) { m.frustumCulled = true; m.castShadow = false; } });
    const path = b.path, start = Math.random() < 0.5;
    const i0 = start ? 0 : path.length - 1;
    this.peds.push({
      rig, x: path[i0].x, z: path[i0].z, yaw: 0, dodge: 0, health: 100, _cast: false,
      bridgePath: path, bridgeI: i0, bridgeDir: start ? 1 : -1, speed: rand(1.0, 1.4),
      seg: b.seg, t: b.t, off: 0, dir: 1,
    });
  }
  updateBridgePed(p, dt, g) {
    const path = p.bridgePath;
    let i = p.bridgeI, dir = p.bridgeDir;
    const tgt = path[clamp(i + dir, 0, path.length - 1)];
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.35) {
      i += dir;
      if (i <= 0 || i >= path.length - 1) dir *= -1;
      p.bridgeI = clamp(i, 0, path.length - 1);
      p.bridgeDir = dir;
    } else {
      const st = Math.min(d, p.speed * dt);
      p.x += (dx / d) * st; p.z += (dz / d) * st;
      p.yaw = Math.atan2(-dx, -dz);
    }
    const pt = path[p.bridgeI];
    const y = pt && pt.y != null ? pt.y : (this.world.walkY(p.x, p.z, 2) ?? 0.16);
    p.rig.root.position.set(p.x, y, p.z);
    p.rig.root.rotation.set(0, p.yaw, 0);
    setPose(p.rig, 'walk', dt, p.speed, 8);
  }
}
