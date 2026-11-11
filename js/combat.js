// মারামারি আর গুলি: লক্ষ্য খোঁজা, গুলির পথ (রে), আলোর ঝলক, গুলির রেখা, রক্তের দাগ
import * as THREE from 'three';
import { rand, clamp, pick } from './utils.js';
import { angDiff } from './aidrive.js';
import { setPose } from './rig.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 8, 6);
const DISC = new THREE.CircleGeometry(1, 18);
const TRACER = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, depthWrite: false });
const FLASH = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.95, depthWrite: false });
const SPARK = new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.9, depthWrite: false });
const BLOOD = new THREE.MeshBasicMaterial({ color: 0x5c0c0c, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

export const PUNCH_DMG = 34;
export const KICK_DMG = 46;
export const BULLET_DMG = 50;
// ঘুষির কম্বো: জ্যাব → ক্রস → হুক (পরপর চাপলে), প্রতিটা আগেরটার চেয়ে জোরে
const COMBO = [
  { move: 'jab', dmg: 20, reach: 1.6, cd: 0.28, t: 0.24 },
  { move: 'cross', dmg: 28, reach: 1.7, cd: 0.32, t: 0.28 },
  { move: 'hook', dmg: 40, reach: 1.6, cd: 0.55, t: 0.36, knock: true },
];
const COMBO_WINDOW = 0.75;
// লাথি: একবার পায়ে নিচু লাথি (ফেলে দিতে পারে), একবার সামনে জোরে লাথি; পড়ে থাকলে মাড়ানো
const LOW_KICK = { move: 'lowkick', dmg: 24, reach: 1.9, cd: 0.5, t: 0.34, trip: 0.4 };
const FRONT_KICK = { move: 'kick', dmg: 42, reach: 2.0, cd: 0.7, t: 0.42, push: 1.1 };
const STOMP = { move: 'stomp', dmg: 30, reach: 1.7, cd: 0.6, t: 0.4 };
const VEH_BULLET = 6;
const RANGE = 80;

export class Combat {
  constructor(g) {
    this.g = g;
    this.fx = [];
    this.decals = [];
    this.cd = 0;
    this.punchT = 0;
    this.kickT = 0;
    this.shootT = 0;
    this.noiseCd = 0;
    this.combo = 0;
    this.comboT = 0;
    this.kickAlt = 0;
    this.move = null;
    this.moveT = 0;
    this.fightT = 0; // সম্প্রতি মারামারি করেছেন (দাঁড়ানোর ভঙ্গি)
  }

  // গুলি লাগতে পারে এমন সব কিছু
  targets(opts = {}) {
    const g = this.g, out = [];
    for (const p of g.traffic.peds) {
      const m = p.react && p.react.mode;
      if (m === 'dead') continue;
      const lying = m === 'down' || m === 'fly';
      out.push({ kind: 'ped', ref: p, x: p.x, z: p.z, y0: 0, h: lying ? 0.45 : 1.85, r: lying ? 0.6 : 0.36 });
    }
    for (const c of g.law.footCops()) out.push({ kind: 'cop', ref: c, x: c.x, z: c.z, y0: 0, h: 1.85, r: 0.36 });
    // দোকানদার, ক্রেতা, দারোয়ান, বাস কাউন্টারের যাত্রী, মজুর (বাইরে)
    if (!g.inside) for (const b of g.traffic.bystanders(g)) out.push({ kind: 'by', ref: b, x: b.x, z: b.z, y0: 0, h: 1.85, r: 0.36 });
    // ঘরের ভিতরের মানুষ (দোকানদার, শিক্ষক, ক্যাশিয়ার...)
    const rm = g.inside && g.inside.room;
    if (rm && rm.kind !== 'metro') for (const n of rm.npcs) {
      if (n.dead || n.noHit) continue;
      const x = rm.X + (n.walk ? n.rig.root.position.x : n.x), z = rm.Z + n.z;
      out.push({ kind: 'npc', ref: n, room: rm, x, z, y0: 0, h: n.lying ? 0.6 : 1.85, r: 0.36 });
    }
    if (opts.player) {
      const P = g.player;
      out.push({ kind: 'player', ref: P, x: P.pos.x, z: P.pos.z, y0: P.state === 'drive' ? 0.3 : P.y, h: P.state === 'fall' ? 0.45 : 1.85, r: 0.4 });
    }
    if (opts.vehicles) {
      for (const v of g.allVehicles()) {
        if (v === opts.skipV) continue;
        for (const c of v.circles()) out.push({ kind: 'veh', ref: v, x: c.x, z: c.z, y0: 0, h: v.type === 'bus' ? 3 : 1.5, r: c.r });
      }
    }
    return out;
  }

  // রে বনাম খাড়া সিলিন্ডার
  static cyl(o, d, t) {
    const px = o.x - t.x, pz = o.z - t.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-6) return null;
    const b = 2 * (px * d.x + pz * d.z), c = px * px + pz * pz - t.r * t.r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    for (const s of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (s < 0) continue;
      const y = o.y + d.y * s;
      if (y >= t.y0 && y <= t.y0 + t.h) return s;
    }
    return null;
  }

  // প্রথম কিসে লাগে: লক্ষ্য, দেয়াল, মাটি
  ray(o, d, maxT, list, minT = 0) {
    let best = { t: maxT, tg: null, wall: false };
    for (const tg of list) {
      const s = Combat.cyl(o, d, tg);
      if (s !== null && s > minT && s < best.t) best = { t: s, tg, wall: false };
    }
    if (d.y < -1e-4) {
      const s = -o.y / d.y;
      if (s > minT && s < best.t) best = { t: s, tg: null, wall: true };
    }
    const W = this.g.world;
    for (let s = Math.max(0.3, minT); s < best.t; s += 0.45) {
      if (W.blocked(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s)) { best = { t: s, tg: null, wall: true }; break; }
    }
    best.x = o.x + d.x * best.t; best.y = o.y + d.y * best.t; best.z = o.z + d.z * best.t;
    return best;
  }
  clearShot(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    const W = this.g.world;
    for (let s = 0.5; s < L - 0.5; s += 0.5) if (W.blocked(a.x + dx * s / L, a.y + dy * s / L, a.z + dz * s / L)) return false;
    return true;
  }

  // ---------- ইফেক্ট ----------
  addFx(mesh, life, grow) {
    this.g.scene.add(mesh);
    mesh.userData.noShadow = true;
    this.fx.push({ m: mesh, life, grow });
  }
  tracer(a, b) {
    this.g.vfx.bulletTracer(a, b);
  }
  flash(p) {
    this.g.vfx.muzzleFlash(p.x, p.y, p.z);
  }
  spark(p) {
    const m = new THREE.Mesh(SPH, SPARK);
    m.scale.setScalar(0.07);
    m.position.set(p.x, p.y, p.z);
    this.addFx(m, 0.12);
  }
  // মাটিতে রক্তের পুল (স্প্ল্যাটার আলাদা bloodHit)
  blood(x, z, size = 0.9) {
    if (size >= 0.7) this.g.vfx.bloodHit(x, 0.9, z, null, 5);
    return this.g.vfx.bloodPool(x, z, size);
  }
  removeDecal(m) {
    this.g.vfx.removePool(m);
  }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.kickT = Math.max(0, this.kickT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    this.noiseCd = Math.max(0, this.noiseCd - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    this.moveT = Math.max(0, this.moveT - dt);
    this.fightT = Math.max(0, this.fightT - dt);
    if (this.moveT <= 0) this.move = null;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) { this.g.scene.remove(f.m); this.fx.splice(i, 1); }
    }
  }

  // ---------- আঘাত ----------
  hit(tg, dmg, kind, from, opts) {
    const g = this.g;
    if (tg.kind === 'ped') g.traffic.damagePed(tg.ref, dmg, kind, from, g, opts);
    else if (tg.kind === 'by') {
      // অন্য সিস্টেমের মানুষ: পথচারী বানিয়ে তারপর আঘাত (পড়ে যায়, পালায়, পাল্টা মারে, মারা যায়)
      const b = tg.ref;
      b.take();
      const p = g.traffic.adoptPerson(b.rig, b.x, b.z, b.yaw || 0, { mode: 'angry', t: 0.1, kind: 'fight' });
      if (b.cop) { p.trafficCop = true; if (from === g.player.pos) g.law.offense(kind === 'bullet' ? 'shootTCop' : 'assaultTCop', b.x, b.z); }
      g.traffic.damagePed(p, dmg, kind, from, g, opts);
    } else if (tg.kind === 'npc') this.hitNpc(tg, dmg, kind);
    else if (tg.kind === 'cop') g.law.damageCop(tg.ref, dmg, kind, from);
    else if (tg.kind === 'player') g.damagePlayer(dmg, kind, from);
    else if (tg.kind === 'veh') {
      const v = tg.ref;
      const byP = from === g.player.pos;
      v.damage(kind === 'bullet' ? VEH_BULLET : dmg * 0.2, byP ? 'player' : undefined);
      if (v.hp <= 0 && !v.burnt) v.burn += 0.4; // জ্বলন্ত গাড়িতে গুলি করলে তাড়াতাড়ি ফাটে
      if (v.ai) v.stun = Math.max(v.stun || 0, 2);
      if (v.type === 'police' && from === g.player.pos) g.law.offense('shootCop');
    }
  }

  // ঘরের ভিতরের মানুষকে মারা/গুলি: মরে পড়ে যায়, বাকিরা ভয়ে হাত তোলে, ভিতরের লোক পুলিশে খবর দেয়
  hitNpc(tg, dmg, kind) {
    const g = this.g, n = tg.ref, rm = tg.room;
    n.hp = (n.hp ?? 100) - dmg;
    rm.crimeT = g.time;
    const bullet = kind === 'bullet';
    if (n.hp <= 0) {
      n.dead = true; n.walk = null; n.rig.busy = true;
      const r = n.rig.root;
      r.rotation.order = 'YXZ'; r.rotation.set(-Math.PI / 2, n.yaw + rand(-0.4, 0.4), 0);
      r.position.y = 0.15;
      setPose(n.rig, 'down', 1, 0, 30);
      this.blood(tg.x, tg.z, rand(0.9, 1.25));
      g.sound.thud(0.6);
      g.sound.ensureSpatial(g.camera);
      g.sound.panicScream(tg.x, 1.5, tg.z);
      this.scareRoom(rm, n);
      g.law.offense('killIn');
      return;
    }
    // আহত: ভয়ে হাত তোলে, চিৎকার
    n.pose = 'surrender'; n.walk = null; n.rig.busy = false;
    g.say(n.rig.root, 'লোকজন', pick(bullet ? ['আল্লাহ গো! গুলি করবেন না!', 'বাঁচাও! বাঁচাও!'] : ['মারেন কেন ভাই?!', 'ওরে বাবা রে!', 'কেউ পুলিশ ডাকেন!']), 2.2);
    this.scareRoom(rm, n);
    g.law.offense(bullet ? 'shootIn' : 'assaultIn');
  }
  scareRoom(rm, src) {
    for (const o of rm.npcs) if (o !== src && !o.dead) { o.pose = 'surrender'; o.walk = null; o.rig.busy = false; }
    rm.scared = true;
  }

  // ---------- খেলোয়াড়ের আক্রমণ ----------
  // সামনের সবচেয়ে কাছের লক্ষ্য; lying = মাটিতে পড়ে থাকাদেরও ধরবে কিনা
  meleeTarget(reach, lying = false) {
    const P = this.g.player;
    let best = null, bs = 1e9;
    for (const tg of this.targets()) {
      if (tg.h < 1 && !lying) continue;
      if (lying && tg.h >= 1) continue;
      const dx = tg.x - P.pos.x, dz = tg.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const a = Math.abs(angDiff(P.yaw, Math.atan2(-dx, -dz)));
      const score = d + a * 1.2;
      if ((a < 1.1 || d < 1.0) && score < bs) { bs = score; best = tg; }
    }
    return best;
  }
  strike(M, kind, best) {
    const g = this.g, P = g.player;
    this.cd = M.cd;
    this.move = M.move;
    this.moveT = M.t;
    this.fightT = 4;
    g.sound.whoosh();
    if (Math.random() < 0.3) g.sound.voiceId('player_punch_01');
    if (!best) return false;
    P.yaw = Math.atan2(-(best.x - P.pos.x), -(best.z - P.pos.z));
    const dx = best.x - P.pos.x, dz = best.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    const heavy = M.knock || M.push || M.move === 'stomp';
    g.sound.ensureSpatial(g.camera);
    g.sound.punchHit(best.x, 1.3, best.z, heavy ? 0.85 : 0.5);
    g.shake = Math.max(g.shake || 0, heavy ? 0.12 : 0.05);
    // সামনে জোরে লাথি: একটু দূরে ছিটকে যায়
    if (M.push && best.kind === 'ped' && best.ref && !(best.ref.react && best.ref.react.mode === 'down')) { best.ref.x += (dx / d) * M.push; best.ref.z += (dz / d) * M.push; }
    if (M.push && best.kind === 'cop') { best.ref.x += (dx / d) * M.push * 0.6; best.ref.z += (dz / d) * M.push * 0.6; }
    const trip = M.trip && Math.random() < M.trip;
    this.hit(best, M.dmg, kind, P.pos, { knock: !!M.knock || (M.push && Math.random() < 0.35), trip, move: M.move });
    // নাক-মুখ থেকে রক্তের ছিটা, মাঝে মাঝে মাটিতে দাগ
    if (best.kind === 'ped' || best.kind === 'cop' || best.kind === 'by' || best.kind === 'npc') {
      const y = best.h < 1 ? 0.3 : M.move === 'lowkick' ? 0.6 : 1.55;
      g.vfx.bloodHit(best.x, y, best.z, { x: dx / d, z: dz / d }, heavy ? 9 : 5);
      if (Math.random() < (heavy ? 0.6 : 0.3)) this.blood(best.x + (dx / d) * 0.4, best.z + (dz / d) * 0.4, rand(0.15, 0.3));
    }
    return true;
  }
  // মোবাইলের এক বোতাম: কাছে থাকলে ঘুষির কম্বো, শেষে লাথি; একটু দূরে থাকলে লাথি (লম্বা পা); পড়ে থাকলে মাড়ানো
  auto() {
    const P = this.g.player;
    if (P.state !== 'foot' || this.cd > 0) return;
    const dist = (t) => Math.hypot(t.x - P.pos.x, t.z - P.pos.z);
    const down = this.meleeTarget(STOMP.reach, true), up = this.meleeTarget(FRONT_KICK.reach);
    if (down && (!up || dist(down) < dist(up))) { this.kick(); return; }
    if (up) {
      if (dist(up) > 1.3) { this.kick(); return; }
      const next = this.comboT > 0 ? (this.combo + 1) % COMBO.length : 0;
      if (this.comboT > 0 && next === 0) { this.kick(); return; } // কম্বোর শেষে জোরে লাথি
    }
    this.punch();
  }
  // বাম ক্লিক: পরপর চাপলে জ্যাব → ক্রস → হুক
  punch() {
    const g = this.g, P = g.player;
    if (P.state !== 'foot' || this.cd > 0) return;
    this.combo = this.comboT > 0 ? (this.combo + 1) % COMBO.length : 0;
    const M = COMBO[this.combo];
    this.comboT = M.cd + COMBO_WINDOW;
    this.punchT = M.t;
    this.strike(M, 'punch', this.meleeTarget(M.reach + 0.1));
  }
  // ডান ক্লিক: নিচু লাথি আর সামনে লাথি পালা করে; কেউ পড়ে থাকলে মাড়ানো
  kick() {
    const g = this.g, P = g.player;
    if (P.state !== 'foot' || this.cd > 0) return;
    const down = this.meleeTarget(STOMP.reach, true);
    const up = this.meleeTarget(FRONT_KICK.reach);
    if (down && (!up || Math.hypot(down.x - P.pos.x, down.z - P.pos.z) < Math.hypot(up.x - P.pos.x, up.z - P.pos.z))) {
      this.kickT = STOMP.t;
      this.strike(STOMP, 'kick', down);
      return;
    }
    const M = this.kickAlt++ % 2 === 0 ? LOW_KICK : FRONT_KICK;
    this.kickT = M.t;
    this.strike(M, 'kick', up && Math.hypot(up.x - P.pos.x, up.z - P.pos.z) <= M.reach ? up : null);
  }

  // খেলোয়াড়ের গুলি। aimRay দিলে ক্যামেরার মাঝ বরাবর, না দিলে কাছের লক্ষ্যে নিজে নিজে তাক
  shoot(aimRay) {
    const g = this.g, P = g.player;
    if (P.state !== 'foot' || this.cd > 0) return false;
    if (!g.arms.pistol) { g.ui.toast('পিস্তল নেই। অস্ত্রের দোকান থেকে কিনুন', 'bad'); this.cd = 0.6; return false; }
    if (g.arms.ammo <= 0) { g.ui.toast('গুলি শেষ! দোকান থেকে কিনুন', 'bad'); g.sound.click(); this.cd = 0.4; return false; }
    this.cd = 0.3;
    this.shootT = 0.6;
    g.arms.ammo--;
    const list = this.targets({ vehicles: true });
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let aimPt = null;
    if (aimRay) {
      const hit = this.ray(aimRay.o, aimRay.d, RANGE, list, aimRay.skip);
      aimPt = { x: hit.x, y: hit.y, z: hit.z };
      P.yaw = Math.atan2(-(aimPt.x - P.pos.x), -(aimPt.z - P.pos.z));
    } else {
      // নিজে নিজে তাক: সামনে ৩০ মিটারের মধ্যে
      let best = null, bs = 1e9;
      for (const tg of list) {
        if (tg.kind === 'veh' || tg.h < 1) continue;
        const dx = tg.x - P.pos.x, dz = tg.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 30 || d < 0.3) continue;
        const a = Math.abs(angDiff(P.yaw, Math.atan2(-dx, -dz)));
        if (a > 0.6) continue;
        if (!this.clearShot({ x: P.pos.x, y: P.y + 1.4, z: P.pos.z }, { x: tg.x, y: 1.2, z: tg.z })) continue;
        const sc = d * (1 + a * 3);
        if (sc < bs) { bs = sc; best = tg; }
      }
      if (best) {
        aimPt = { x: best.x, y: best.y0 + best.h * 0.65, z: best.z };
        P.yaw = Math.atan2(-(best.x - P.pos.x), -(best.z - P.pos.z));
      } else aimPt = { x: P.pos.x + fx * RANGE, y: P.y + 1.4, z: P.pos.z + fz * RANGE };
    }
    // নল থেকে লক্ষ্য পর্যন্ত আসল গুলির পথ
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const m = { x: P.pos.x + rx * 0.28 - Math.sin(P.yaw) * 0.55, y: P.y + 1.42, z: P.pos.z + rz * 0.28 - Math.cos(P.yaw) * 0.55 };
    let dx = aimPt.x - m.x, dy = aimPt.y - m.y, dz = aimPt.z - m.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    const d = { x: dx / L, y: dy / L, z: dz / L };
    const hit = this.ray(m, d, RANGE, list);
    this.flash(m);
    this.tracer(m, hit);
    g.sound.ensureSpatial(g.camera);
    g.sound.gunshotAt(m.x, m.y, m.z, 1);
    // পথে কাচ থাকলে ভেঙে যায় (গুলি থামে না)
    if (g.world.glass) g.world.glass.shoot(m, d, hit.t, g, true);
    if (hit.tg) {
      if (hit.tg.kind !== 'veh') {
        g.vfx.bloodHit(hit.x, hit.y, hit.z, d, 10);
        this.blood(hit.x, hit.z, 0.45);
      }
      this.hit(hit.tg, BULLET_DMG, 'bullet', P.pos);
      // চাকায় লাগলে পাংচার
      if (hit.tg.kind === 'veh' && hit.tg.ref.shootTire && hit.tg.ref.shootTire(hit.x, hit.y, hit.z, g)) {
        if (hit.tg.ref.ai) hit.tg.ref.stun = Math.max(hit.tg.ref.stun || 0, 3);
      } else if (hit.tg.kind === 'veh' && hit.y > 0.85 && hit.tg.ref.breakGlass) {
        // জানালার উচ্চতায় গুলি: প্রথমে কাচ ফাটে, পরের গুলিতে ভেঙে পড়ে
        hit.tg.ref.breakGlass((hit.tg.ref.glassLv || 0) + 1, g, d.x, d.z);
      }
    }
    if (!hit.tg || hit.tg.kind === 'veh') this.spark(hit);
    this.gunfire(P.pos.x, P.pos.z, true);
    return true;
  }
  // গুলির শব্দে লোকজন পালায়, পুলিশ খবর পায়
  gunfire(x, z, byPlayer) {
    const g = this.g;
    // ঘরের ভিতরে গুলি: সবাই ভয়ে হাত তোলে, পুলিশে খবর যায় (অস্ত্রের দোকানের গুলির লেন বাদে)
    if (g.inside) {
      const rm = g.inside.room;
      if (byPlayer && rm.kind !== 'gun' && rm.kind !== 'metro' && rm.npcs.some((o) => !o.dead)) {
        if (!rm.scared) { const w = rm.npcs.find((o) => !o.dead); if (w) g.say(w.rig.root, 'লোকজন', pick(['গুলি! সবাই মাথা নিচু করেন!', 'বাঁচাও! কেউ পুলিশ ডাকেন!']), 2.2); }
        this.scareRoom(rm, null); rm.crimeT = g.time;
        if (this.noiseCd <= 0) { this.noiseCd = 3; g.law.offense('shootIn'); }
      }
      return;
    }
    g.traffic.panic(x, z, 45, g);
    g.sound.ensureSpatial(g.camera);
    g.sound.panicScream(x, 1.6, z);
    if (byPlayer && this.noiseCd <= 0) { this.noiseCd = 3; g.law.offense('shoot', x, z); }
  }

  // পুলিশের গুলি খেলোয়াড়ের দিকে
  npcShoot(from, chance, dmg) {
    const g = this.g, P = g.player;
    const tgt = { x: P.pos.x, y: (P.state === 'drive' ? 0.9 : P.state === 'fall' ? 0.25 : P.y + 1.2), z: P.pos.z };
    const m = { x: from.x, y: from.y, z: from.z };
    const ok = this.clearShot(m, tgt);
    const dist = Math.hypot(tgt.x - m.x, tgt.z - m.z);
    this.flash(m);
    g.sound.ensureSpatial(g.camera);
    g.sound.gunshotAt(m.x, m.y, m.z, clamp(1 - dist / 90, 0.15, 0.9));
    if (ok && Math.random() < chance) {
      this.tracer(m, tgt);
      if (P.state !== 'drive') { g.vfx.bloodHit(tgt.x, tgt.y, tgt.z, null, 8); this.blood(tgt.x, tgt.z, 0.35); }
      else if (P.vehicle) { P.vehicle.damage(5); if (P.vehicle.breakGlass && Math.random() < 0.35) P.vehicle.breakGlass((P.vehicle.glassLv || 0) + 1, this.g, 0, 0); }
      g.damagePlayer(dmg, 'bullet', from);
      return true;
    }
    // ফসকে গেল: পাশ দিয়ে চলে যায়
    const miss = { x: tgt.x + rand(-1.6, 1.6), y: tgt.y + rand(-0.6, 1.0), z: tgt.z + rand(-1.6, 1.6) };
    const L = Math.hypot(miss.x - m.x, miss.y - m.y, miss.z - m.z) || 1;
    const d = { x: (miss.x - m.x) / L, y: (miss.y - m.y) / L, z: (miss.z - m.z) / L };
    const hit = this.ray(m, d, L + 15, []);
    if (this.g.world.glass) this.g.world.glass.shoot(m, d, hit.t, this.g, false);
    this.tracer(m, hit);
    this.spark(hit);
    return false;
  }
}
