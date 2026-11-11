// আইন-কানুন: অপরাধের তারকা, রাস্তার পুলিশ, থানা, তাড়া, লাঠি আর গুলি, ধরা পড়লে মামলা-জরিমানা-আটক
import { Vehicle } from './vehicles.js';
import { makeRig, setPose, giveGun, POLICE_LOOK } from './rig.js';
import { bn, rand, pick, clamp } from './utils.js';
import { bnGroup } from './ui.js';
import { aiDrive, angDiff } from './aidrive.js';

const STAR_HEAT = [30, 80, 150, 240];
export const FINE = [0, 500, 1500, 3000, 6000];
const HOURS = [0, 2, 6, 12, 24];
// GTA V-এর মতো: পুলিশ নিজে দেখলে (মাঝে দেয়াল না থাকলে) তবেই মামলা। গুলি-বিস্ফোরণের শব্দ কাছের পুলিশ শুনতে পায়।
// auto = পুলিশ না দেখলেও খবর যায় (দোকানের অ্যালার্ম, পুলিশের গাড়ির ট্র্যাকার)
// heat: ৩০+ = ১★, ৮০+ = ২★, ১৫০+ = ৩★, ২৪০+ = ৪★
const OFF = {
  ped: { heat: 45, name: 'পথচারীকে গাড়িচাপা' },
  bump: { heat: 0, name: 'পথচারীকে ধাক্কা' },
  crash: { heat: 35, name: 'বেপরোয়া গাড়ি চালানো' },
  flip: { heat: 45, name: 'অন্যের গাড়ি উল্টে দেওয়া' },
  police: { heat: 50, name: 'পুলিশের গাড়িতে ধাক্কা' },
  assault: { heat: 40, name: 'মারধর' },
  explode: { heat: 85, name: 'গাড়িতে আগুন, বিস্ফোরণ', heard: true },
  redlight: { heat: 14, name: 'সিগন্যাল ভাঙা' },
  bankRob: { heat: 210, name: 'ব্যাংক ডাকাতি', auto: 'ব্যাংকের অ্যালার্ম বাজছে! পুলিশ আসছে' },
  rob: { heat: 85, name: 'দোকানে ডাকাতি', auto: 'দোকানদার অ্যালার্ম বাজিয়েছে! পুলিশ আসছে' },
  glass: { heat: 30, name: 'কাচ ভাঙচুর', heard: true },
  shoot: { heat: 45, name: 'প্রকাশ্যে গুলি', heard: true },
  kill: { heat: 90, name: 'মানুষ হত্যা' },
  killIn: { heat: 90, name: 'মানুষ হত্যা', auto: 'ভিতরের লোকজন পুলিশে খবর দিয়েছে! পুলিশ আসছে' },
  shootIn: { heat: 45, name: 'ঘরের ভিতরে গুলি', auto: 'ভিতরের লোকজন পুলিশে ফোন করেছে! পুলিশ আসছে' },
  assaultIn: { heat: 40, name: 'মারধর', auto: 'ভিতরের লোকজন পুলিশে খবর দিয়েছে! পুলিশ আসছে' },
  assaultCop: { heat: 85, name: 'পুলিশকে মারধর' },
  shootCop: { heat: 160, name: 'পুলিশকে গুলি' },
  killCop: { heat: 250, name: 'পুলিশ হত্যা' },
  // মোড়ের ট্রাফিক পুলিশ: নিজেই ওয়্যারলেসে খবর দেয় (বা আশেপাশের লোক)
  assaultTCop: { heat: 85, name: 'ট্রাফিক পুলিশকে মারধর', auto: 'ট্রাফিক পুলিশ ওয়্যারলেসে খবর দিয়েছে! পুলিশ আসছে' },
  shootTCop: { heat: 160, name: 'ট্রাফিক পুলিশকে গুলি', auto: 'মোড়ে গুলি! ওয়্যারলেসে খবর গেছে, পুলিশ আসছে' },
  runTCop: { heat: 60, name: 'ট্রাফিক পুলিশকে গাড়িচাপা', auto: 'ট্রাফিক পুলিশকে ধাক্কা! পুলিশ আসছে' },
  killTCop: { heat: 250, name: 'ট্রাফিক পুলিশ হত্যা', auto: 'ট্রাফিক পুলিশ মারা গেছে! পুরো এলাকায় পুলিশ' },
  steal: { heat: 40, name: 'গাড়ি ছিনতাই' },
  warrant: { heat: 45, name: 'পুরোনো মামলার ওয়ারেন্ট' },
  stealCop: { heat: 160, name: 'পুলিশের গাড়ি চুরি', auto: 'পুলিশের গাড়ির ট্র্যাকার চালু! পুলিশ আসছে' },
};
const HEAR = 120; // গুলি-বিস্ফোরণের শব্দ কত দূর থেকে শোনে
const COP = ['থামেন! আপনার নামে মামলা আছে!', 'হাত তোলেন!', 'পালায়ে যাবেন কই?', 'দাঁড়ান বলতেছি!'];
const COP_GUN = ['অস্ত্র ফেলেন!', 'গুলি করব কিন্তু!', 'ব্যাকআপ পাঠাও!'];
const SEE = 75, WITNESS = 50;
// রাস্তার বড় মোড়গুলো (ট্রাফিক পুলিশ)
const POSTS = 5;

function newCop() {
  const rig = makeRig({ ...POLICE_LOOK, skin: pick([0x8d5a3b, 0xa06a45, 0x7a4b2e]) }); // বাংলাদেশ পুলিশের পোশাক
  rig.root.rotation.order = 'YXZ';
  return { rig, x: 0, z: 0, yaw: 0, health: 100, dead: false, cd: rand(0.5, 1.5), act: 0, actPose: null, spin: 0, losT: 0, los: false, unit: null, officer: null };
}

export class Law {
  constructor(g) {
    this.g = g;
    this.heat = 0;
    this.record = []; // না মেটানো মামলা (আদালতে মেটানো যায়)
    this.warrantT = 0;
    this.units = [];
    this.offenses = {};
    this.unseen = 0;
    this.calm = 0;
    this.bust = 0;
    this.spawnT = 0;
    this.sayT = 0;
    this.caseNo = 0;
    this.spotted = false;
    this.sirenLvl = 0;
    this.seenToastT = -99;
    // ট্রাফিক পুলিশ আর থানার পাহারাদার
    this.officers = [];
    // বড় মোড় বাছাই: প্রধান সড়কের মোড়, একটা থেকে আরেকটা দূরে
    const M = g.map;
    const cand = M.nodes.filter((n) => n.links.length >= 3 && n.links.some((l) => M.segments[l.seg].main));
    const st = M.pois.find((q) => q.k === 'station') || { x: 0, z: 0 };
    const chosen = [];
    if (cand.length) chosen.push(cand.reduce((a, n) => (Math.hypot(n.x - st.x, n.z - st.z) < Math.hypot(a.x - st.x, a.z - st.z) ? n : a)));
    while (chosen.length < POSTS && chosen.length < cand.length) {
      let best = null, bd = -1;
      for (const n of cand) {
        const d = Math.min(...chosen.map((c) => Math.hypot(c.x - n.x, c.z - n.z)));
        if (d > bd) { bd = d; best = n; }
      }
      if (bd < 120) break;
      chosen.push(best);
    }
    for (const n of chosen) {
      // দুই রাস্তার মাঝের কোণে, রাস্তা আর বিল্ডিংয়ের বাইরে
      const r = g.world.nodeW[n.id].r + 1.8;
      const dirs = n.links.map((l) => { const s = M.segments[l.seg]; return s.a === n.id ? s.dir : { x: -s.dir.x, z: -s.dir.z }; });
      let spot = null;
      for (let i = 0; i < dirs.length && !spot; i++) for (let j = i + 1; j < dirs.length && !spot; j++) {
        let bx = dirs[i].x + dirs[j].x, bz = dirs[i].z + dirs[j].z;
        const bl = Math.hypot(bx, bz);
        if (bl < 0.2) continue;
        for (const k of [1.2, 1.6, 2.2]) {
          const x = n.x + (bx / bl) * r * k, z = n.z + (bz / bl) * r * k;
          if (!g.world.onRoad(x, z, 0.2) && !g.world.blocked(x, 1, z)) { spot = { x, z }; break; }
        }
      }
      if (!spot) continue;
      this.addOfficer({ x: spot.x, z: spot.z, yaw: Math.atan2(-(n.x - spot.x), -(n.z - spot.z)) }, false);
    }
    const T = g.map.places.thana;
    if (T) {
      const f = T.face;
      this.addOfficer({ x: T.door.x + f.z * 2.2, z: T.door.z - f.x * 2.2, yaw: Math.atan2(-f.x, -f.z) }, true);
    }
    // থানার উঠানে রাখা পুলিশের গাড়ি
    this.parked = [];
    this.fillParked();
  }
  addOfficer(home, guard) {
    const c = newCop();
    const o = { cop: c, home, guard, state: 'post', waveT: rand(0, 8), deadT: 0 };
    c.officer = o;
    c.x = home.x; c.z = home.z; c.yaw = home.yaw;
    this.g.scene.add(c.rig.root);
    this.officers.push(o);
    this.placeCop(c, 'idle', 0);
    return o;
  }
  fillParked() {
    const spots = this.g.map.places.thanaCars || [];
    for (const p of spots) {
      if (this.parked.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 2)) continue;
      if (this.g.allVehicles && this.g.law && this.g.allVehicles().some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 3)) continue;
      this.parked.push(new Vehicle(this.g.scene, 'police', { ai: true, x: p.x, z: p.z, yaw: p.yaw }));
    }
  }
  // সংঘর্ষের জন্য সব পুলিশের গাড়ি
  vehicles() { return [...this.units.map((u) => u.v), ...this.parked]; }
  // পায়ে থাকা জীবিত পুলিশ (গুলি-ঘুষি লাগতে পারে)
  footCops() {
    const out = [];
    for (const o of this.officers) if (!o.cop.dead) out.push(o.cop);
    for (const u of this.units) if (u.out && !u.cop.dead) out.push(u.cop);
    return out;
  }

  get stars() {
    let s = 0;
    for (const h of STAR_HEAT) if (this.heat >= h) s++;
    return s;
  }
  // কাছে কোনো পুলিশ আছে কি না (নিজের চোখে দেখা)
  // পুলিশ দেখল কিনা: কাছে, আর মাঝে বিল্ডিং নেই
  witness(x, z) {
    const C = this.g.combat;
    const can = (px, pz, r) => Math.hypot(px - x, pz - z) < r && (Math.hypot(px - x, pz - z) < 10 || C.clearShot({ x: px, y: 1.6, z: pz }, { x, y: 1.3, z }));
    for (const c of this.footCops()) if (can(c.x, c.z, WITNESS)) return true;
    for (const u of this.units) if (u.mode !== 'dead' && can(u.v.x, u.v.z, WITNESS)) return true;
    for (const c of this.g.traffic.cars) if (c.v.type === 'police' && !c.dead && can(c.v.x, c.v.z, WITNESS)) return true;
    return false;
  }
  // শব্দ শুনল কিনা (দেয়াল লাগে না)
  hears(x, z) {
    for (const c of this.footCops()) if (Math.hypot(c.x - x, c.z - z) < HEAR) return true;
    for (const u of this.units) if (u.mode !== 'dead' && Math.hypot(u.v.x - x, u.v.z - z) < HEAR) return true;
    for (const c of this.g.traffic.cars) if (c.v.type === 'police' && !c.dead && Math.hypot(c.v.x - x, c.v.z - z) < HEAR) return true;
    return false;
  }
  offense(kind, x, z) {
    const g = this.g, o = OFF[kind];
    if (!o || !o.heat || g.state !== 'play') return;
    const P = g.player;
    // ঘরের ভিতরে হলে খোঁজা শুরু হয় দরজার বাইরে থেকে
    const dr = g.inside && g.inside.door && g.inside.door.b && g.inside.door.b.door;
    if (x === undefined && dr) { x = dr.x; z = dr.z; }
    x = x ?? P.pos.x; z = z ?? P.pos.z;
    const seen = this.witness(x, z);
    const heard = !seen && o.heard && this.hears(x, z);
    // কেউ (পুলিশ) দেখেনি, শোনেনি: কোনো মামলা নেই
    if (!seen && !heard && !o.auto) return;
    const before = this.stars;
    this.heat = Math.min(this.heat + o.heat, 400);
    this.offenses[kind] = (this.offenses[kind] || 0) + 1;
    this.calm = 0;
    if (seen) { this.spotted = true; this.unseen = 0; }
    this.search = { x, z };
    const s = this.stars;
    if (s > before) {
      this.unseen = 0;
      if (before === 0 && !seen) this.spotted = false;
      if (seen && g.time - this.seenToastT > 4) { this.seenToastT = g.time; g.ui.toast('পুলিশ দেখে ফেলেছে!', 'bad'); }
      else if (heard && before === 0) g.ui.toast('কাছের পুলিশ শব্দ শুনেছে! আসছে', 'bad');
      else if (o.auto && before === 0) g.ui.toast(o.auto, 'bad');
      else if (before > 0) g.ui.toast('আরও পুলিশ আসছে!', 'bad');
      g.sound.whistle();
    }
  }

  // গাড়ি নিয়ে নেওয়ার পরে বাইরে থাকা পুলিশ পায়ে হেঁটে তাড়া করে
  adoptCop(c) {
    const o = { cop: c, home: { x: c.x, z: c.z, yaw: c.yaw }, guard: false, state: 'chase', waveT: 0, deadT: 0, temp: true };
    c.unit = null;
    c.officer = o;
    this.officers.push(o);
  }

  // ---------- পুলিশের গাড়ি নামানো ----------
  makeUnit(v, cop) {
    v.siren = true;
    v.ai = true;
    if (cop.rig.root.parent !== v.g) {
      if (cop.rig.root.parent) cop.rig.root.parent.remove(cop.rig.root);
      v.g.add(cop.rig.root);
    }
    cop.rig.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
    cop.rig.root.rotation.set(0, 0, 0);
    const u = { v, cop, mode: 'chase', route: null, routeT: 0, stuckT: 0, revT: 0, revSteer: 1, out: false, life: 0 };
    cop.unit = u;
    this.units.push(u);
    return u;
  }
  spawnUnit() {
    const g = this.g, P = g.player;
    // থানা কাছে থাকলে উঠানের গাড়ি নিয়ে বের হয়
    const T = g.map.places.thana;
    if (T && this.parked.length) {
      const d = Math.hypot(T.door.x - P.pos.x, T.door.z - P.pos.z);
      // একসাথে একটাই বের হয়, যেন উঠানে আটকে না যায়
      const busy = this.units.some((u) => Math.hypot(u.v.x - T.door.x, u.v.z - T.door.z) < 25);
      if (d > 45 && d < 280 && !busy) {
        const v = this.parked.shift();
        return this.makeUnit(v, newCop());
      }
    }
    const segs = g.map.segments;
    for (let tries = 0; tries < 30; tries++) {
      const s = pick(segs);
      if (s.len < 14) continue;
      const t = rand(5, s.len - 5);
      const d = Math.random() < 0.5 ? s.dir : { x: -s.dir.x, z: -s.dir.z };
      if (s.width < 6) continue; // সরু গলিতে না
      const lo = Math.min(2.4, s.width * 0.22);
      const x = s.ax + s.dir.x * t + d.z * lo, z = s.az + s.dir.z * t - d.x * lo;
      const dist = Math.hypot(x - P.pos.x, z - P.pos.z);
      if (dist < 70 || dist > 170) continue;
      if (g.map.lakeDist(x, z) < 2 && !s.bridges.length) continue;
      if (g.allVehicles().some((o) => Math.hypot(o.x - x, o.z - z) < 8)) continue;
      const v = new Vehicle(g.scene, 'police', { ai: true, x, z, yaw: Math.atan2(-d.x, -d.z) });
      return this.makeUnit(v, newCop());
    }
    return null;
  }
  // রাস্তার টহল গাড়ি তাড়ায় যোগ দেয়
  convertPatrol() {
    const g = this.g, P = g.player, T = g.traffic;
    for (const c of [...T.cars]) {
      if (c.v.type !== 'police' || c.dead) continue;
      if (Math.hypot(c.v.x - P.pos.x, c.v.z - P.pos.z) > 170) continue;
      T.cars.splice(T.cars.indexOf(c), 1);
      const cop = newCop();
      // টহল গাড়ির চালককে পুলিশ বানানো
      g.scene.remove(cop.rig.root);
      if (c.rig) { c.rig.root.parent && c.rig.root.parent.remove(c.rig.root); }
      this.makeUnit(c.v, cop);
    }
  }
  removeUnit(u) {
    this.g.scene.remove(u.v.g);
    if (u.out) this.g.scene.remove(u.cop.rig.root);
    this.units.splice(this.units.indexOf(u), 1);
  }

  update(dt) {
    const g = this.g, P = g.player;
    const stars = this.stars;
    this.calm += dt;
    if (stars === 0 && this.heat > 0 && this.calm > 15) this.heat = Math.max(0, this.heat - dt * 2);
    if (stars > 0) this.convertPatrol();
    // পুরোনো মামলা থাকলে কাছের পুলিশ মাঝে মাঝে চিনে ফেলে
    this.warrantT -= dt;
    if (stars === 0 && this.record.length && this.warrantT <= 0 && g.state === 'play' && !g.inside && P.state === 'foot') {
      this.warrantT = 3;
      if (this.witness(P.pos.x, P.pos.z) && Math.random() < 0.1 + this.record.length * 0.03) {
        g.ui.toast('পুলিশ চিনে ফেলেছে: আপনার নামে পুরোনো মামলা আছে! আদালতে মিটিয়ে নিন', 'bad');
        this.offense('warrant');
      }
    }
    const chasing = this.units.filter((u) => u.mode === 'chase');
    this.spawnT -= dt;
    if (chasing.length < stars && this.spawnT <= 0) { this.spawnT = 2.5; this.spawnUnit(); }
    // থানার উঠান আবার ভরা
    const T = g.map.places.thana;
    if (T && this.parked.length < (g.map.places.thanaCars || []).length && Math.hypot(T.door.x - P.pos.x, T.door.z - P.pos.z) > 220) this.fillParked();
    for (const v of this.parked) { if (v.tumble) v.updateTumble(dt, g.world); v.sync(dt); }

    let seen = false, nearest = 1e9, close = false;
    // দেখতে পাওয়া: কাছে থাকলে, আর মাঝে বিল্ডিং না থাকলে (প্রতি ০.২ সেকেন্ডে একবার হিসাব)
    this.losT = (this.losT || 0) - dt;
    const checkLos = this.losT <= 0;
    if (checkLos) this.losT = 0.2;
    const sees = (x, z, d) => {
      if (d >= SEE) return false;
      if (d < 14) return true;
      if (!checkLos) return this.lastSeen;
      return g.combat.clearShot({ x, y: 1.6, z }, { x: P.pos.x, y: 1.5, z: P.pos.z });
    };
    const onFoot = P.state !== 'drive';
    const slow = P.state !== 'dead' && P.state !== 'swim' && (onFoot || Math.abs(P.vehicle.speed) < 2) && !(P.vehicle && (P.vehicle.y || 0) > 3);
    for (const u of [...this.units]) {
      u.life += dt;
      const ux = u.out ? u.cop.x : u.v.x, uz = u.out ? u.cop.z : u.v.z;
      const d = Math.hypot(ux - P.pos.x, uz - P.pos.z);
      const dv = Math.hypot(u.v.x - P.pos.x, u.v.z - P.pos.z);
      if (u.mode === 'leave' || u.mode === 'dead') {
        if (dv > 160 || (u.mode === 'leave' && u.life > 30)) { this.removeUnit(u); continue; }
      } else {
        if (dv > 280) { this.removeUnit(u); continue; }
        if (!seen && sees(ux, uz, d)) seen = true;
        nearest = Math.min(nearest, d);
      }
      this.updateUnit(u, dt);
      if (u.mode === 'chase' && slow && ((u.out && !u.cop.dead && d < 2.4) || (!u.out && !onFoot && dv < 9.5))) close = true;
    }
    for (const o of [...this.officers]) {
      // সাময়িক পুলিশ (গাড়ি হারানো) দূরে গেলে সরানো
      if (o.temp && (o.state === 'post' || o.cop.dead) && Math.hypot(o.cop.x - P.pos.x, o.cop.z - P.pos.z) > 150) {
        g.scene.remove(o.cop.rig.root);
        this.officers.splice(this.officers.indexOf(o), 1);
        continue;
      }
      this.updateOfficer(o, dt);
      const c = o.cop;
      if (c.dead || o.state !== 'chase') continue;
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (!seen && sees(c.x, c.z, d)) seen = true;
      nearest = Math.min(nearest, d);
      if (slow && onFoot && d < 2.4) close = true;
    }
    // GTA V-এর মতো খোঁজার এলাকা: পুলিশ দেখলে বৃত্ত আপনার সাথে চলে; না দেখলে শেষ দেখা জায়গায় থেমে থাকে।
    // বৃত্তের বাইরে গিয়ে লুকিয়ে থাকলে তারকা মুছে যায়; ভিতরে থাকলে পুলিশ খুঁজতেই থাকে
    if (checkLos) this.lastSeen = seen;
    if (stars > 0) {
      this.searchR = 55 + stars * 22;
      if (seen || !this.search) this.search = { x: P.pos.x, z: P.pos.z };
      if (seen) { this.unseen = 0; this.spotted = true; this.outToast = false; }
      else {
        const out = Math.hypot(P.pos.x - this.search.x, P.pos.z - this.search.z) > this.searchR;
        this.inside = !out;
        this.unseen += dt * (out ? 1 : 0.12) * (this.spotted ? 1 : 0.5);
        if (out && !this.outToast) { this.outToast = true; g.ui.toast('খোঁজার এলাকার বাইরে! লুকিয়ে থাকুন…', ''); }
      }
      if (this.unseen > 5 + stars * 2) this.lose();
    } else this.search = null;
    if (stars > 0 && close) {
      this.bust = Math.min(1, this.bust + dt / 2.2);
      this.sayT -= dt;
      if (this.sayT <= 0) {
        this.sayT = 3;
        const c = this.footCops().sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
        const u = this.units.find((x) => x.mode === 'chase');
        const who = c && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 12 ? c.rig.root : u && u.cop.rig.root;
        if (who) g.say(who, 'পুলিশ', pick(COP), 2.4);
        g.sound.whistle();
      }
      if (this.bust >= 1) this.busted();
    } else this.bust = Math.max(0, this.bust - dt * 0.5);
    this.sirenLvl = this.units.some((u) => u.mode === 'chase') ? clamp(1 - nearest / 160, 0.15, 1) : 0;
  }

  lose() {
    // পালিয়ে গেলেও মামলা খাতায় থেকে যায়: আদালতে জরিমানা দিয়ে মেটাতে হয়, নইলে পুলিশ চিনে ফেলতে পারে
    const kinds = Object.keys(this.offenses).filter((k) => OFF[k] && OFF[k].heat > 0 && k !== 'warrant');
    if (kinds.length) {
      const fine = Math.round((150 + kinds.reduce((a, k) => a + OFF[k].heat * this.offenses[k], 0) * 3) / 50) * 50;
      this.record.push({ names: kinds.map((k) => OFF[k].name), fine: Math.min(fine, 3000) });
      if (this.record.length > 8) this.record.shift();
    }
    this.heat = 0;
    this.search = null;
    this.offenses = {};
    this.unseen = 0;
    this.bust = 0;
    for (const u of this.units) if (u.mode === 'chase') { u.mode = 'leave'; u.v.siren = false; u.life = 0; }
    this.g.ui.toast(this.record.length ? 'পুলিশকে ফাঁকি দিলেন! মামলা খাতায় রইল: GPS আদালতে নিয়ে যাবে (ম্যাপে ⚖)' : 'পুলিশকে ফাঁকি দিলেন!', 'good');
  }

  // ---------- পুলিশের চলাফেরা ----------
  placeCop(c, pose, dt, speed = 0) {
    if (pose) setPose(c.rig, pose, dt, speed, 10);
    c.rig.root.position.set(c.x, 0.1, c.z);
    c.rig.root.rotation.set(0, c.yaw, 0);
  }
  moveCop(c, tx, tz, speed, dt, stop = 1.2) {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > stop && speed > 0) {
      const st = Math.min(d - stop, speed * dt);
      c.x += (dx / d) * st;
      c.z += (dz / d) * st;
    }
    const o = { x: c.x, z: c.z };
    this.g.world.collide(o, 0.35, 0.2);
    c.x = o.x; c.z = o.z;
    for (const w of this.g.allVehicles()) for (const k of w.circles()) {
      const ex = c.x - k.x, ez = c.z - k.z, e = Math.hypot(ex, ez), r = k.r + 0.35;
      if (e < r && e > 1e-4) { c.x += (ex / e) * (r - e); c.z += (ez / e) * (r - e); }
    }
    return d;
  }
  // মৃত পুলিশ মাটিতে
  updateBody(c, dt) {
    c.spin = Math.min(Math.PI / 2, c.spin + dt * 6);
    setPose(c.rig, 'down', dt, 0, 10);
    c.rig.root.position.set(c.x, 0.14, c.z);
    c.rig.root.rotation.set(-c.spin, c.yaw, 0);
  }
  // পায়ে হেঁটে তাড়া: ১-২ তারকায় লাঠি, ৩ থেকে গুলি
  footChase(c, dt) {
    const g = this.g, P = g.player;
    const st = this.stars;
    const armed = st >= 3;
    giveGun(c.rig, armed);
    c.cd -= dt; c.act -= dt; c.losT -= dt;
    const tx = P.pos.x, tz = P.pos.z;
    const d = Math.hypot(tx - c.x, tz - c.z);
    const face = Math.atan2(-(tx - c.x), -(tz - c.z));
    if (c.losT <= 0) {
      c.losT = 0.3;
      c.los = d < 40 && g.combat.clearShot({ x: c.x, y: 1.5, z: c.z }, { x: tx, y: 1.3, z: tz });
    }
    const onFoot = P.state !== 'drive';
    let pose, speed = 0;
    if (P.state === 'dead') {
      pose = 'idle';
    } else if (armed && c.los && d < 32) {
      speed = d > 14 ? 5 : 0;
      c.yaw = face;
      if (c.cd <= 0) {
        c.cd = rand(0.9, 1.5);
        const moving = P.state === 'drive' ? Math.abs(P.vehicle.speed) : P.speed;
        let chance = clamp(0.5 - d * 0.01, 0.15, 0.5);
        if (moving > 8) chance *= 0.4; else if (moving > 3) chance *= 0.7;
        const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
        g.combat.npcShoot({ x: c.x + rx * 0.25 - Math.sin(c.yaw) * 0.5, y: 1.42, z: c.z + rz * 0.25 - Math.cos(c.yaw) * 0.5 }, chance, P.state === 'drive' ? 5 : 9);
        if (Math.random() < 0.15) g.say(c.rig.root, 'পুলিশ', pick(COP_GUN), 2);
      }
      pose = speed ? 'aimWalk' : 'aim';
    } else {
      speed = d > 6 ? 5.4 : d > 1.3 ? 2.4 : 0;
      if (!armed && onFoot && d < 1.7 && c.cd <= 0) {
        // লাঠির বাড়ি
        c.cd = 1.2; c.act = 0.4; c.actPose = 'swing';
        g.damagePlayer(8, 'baton', c);
        g.sound.thud(0.6);
      }
      if (speed > 0) c.yaw = face;
      pose = speed > 3 ? 'run' : speed > 0 ? 'walk' : 'angry';
    }
    if (c.act > 0 && c.actPose) pose = c.actPose;
    this.moveCop(c, tx, tz, speed, dt, armed ? 0 : 1.2);
    this.placeCop(c, pose, dt, speed);
  }
  copOut(u) {
    const v = u.v, g = this.g, c = u.cop;
    const p = v.toWorld(v.spec.door.x + 0.4, v.spec.door.z);
    v.g.remove(c.rig.root);
    g.scene.add(c.rig.root);
    u.out = true;
    c.x = p.x; c.z = p.z; c.yaw = v.yaw;
    g.sound.door();
  }
  copIn(u) {
    const v = u.v, c = u.cop;
    this.g.scene.remove(c.rig.root);
    v.g.add(c.rig.root);
    c.rig.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
    c.rig.root.rotation.set(0, 0, 0);
    giveGun(c.rig, false);
    u.out = false;
    this.g.sound.door();
  }
  updateUnit(u, dt) {
    const g = this.g, P = g.player, v = u.v, c = u.cop;
    if (v.tumble) { v.updateTumble(dt, g.world); v.sync(dt); return; }
    if (u.mode === 'dead') {
      if (!v.wrecked) v.drive(dt, { throttle: v.speed > 0.3 ? -1 : 0, steer: 0, handbrake: true }, g.world);
      v.sync(dt);
      if (u.out) this.updateBody(c, dt);
      return;
    }
    const st = this.stars;
    const onFoot = P.state !== 'drive';
    const dist = Math.hypot(P.pos.x - v.x, P.pos.z - v.z);
    if (u.mode === 'chase' && !u.out) {
      const exitD = st >= 3 ? 30 : 15;
      const stopped = onFoot || (st >= 3 && Math.abs(P.vehicle.speed) < 4);
      if (v.wrecked || (dist < exitD && stopped && Math.abs(v.speed) < 3)) this.copOut(u);
    }
    if (u.out) {
      const back = u.mode === 'leave' || (!onFoot && !v.wrecked && (st < 3 || Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > 35));
      if (back) {
        const door = v.toWorld(v.spec.door.x + 0.4, v.spec.door.z);
        const d = this.moveCop(c, door.x, door.z, 5.5, dt, 0.3);
        c.yaw = Math.atan2(-(door.x - c.x), -(door.z - c.z));
        this.placeCop(c, 'run', dt, 5.5);
        if (d < 0.8 && !v.wrecked) this.copIn(u);
      } else this.footChase(c, dt);
      if (!v.wrecked) v.drive(dt, { throttle: v.speed > 0.3 ? -1 : 0, steer: 0, handbrake: true }, g.world);
      v.sync(dt);
      return;
    }
    if (v.wrecked) { v.sync(dt); return; }
    let tx = P.pos.x, tz = P.pos.z;
    if (u.mode === 'chase' && this.search && this.unseen > 1.5) {
      // আপনাকে দেখতে পাচ্ছে না: এলাকার ভিতরে এদিক-ওদিক খোঁজে
      u.searchT = (u.searchT || 0) - dt;
      if (!u.searchPt || u.searchT <= 0 || Math.hypot(u.searchPt.x - v.x, u.searchPt.z - v.z) < 14) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.searchR * 0.8;
        const nr = g.world.nearestRoad(this.search.x + Math.cos(a) * r, this.search.z + Math.sin(a) * r);
        u.searchPt = { x: nr.px, z: nr.pz };
        u.searchT = 10;
      }
      tx = u.searchPt.x; tz = u.searchPt.z;
    }
    aiDrive(g, u, tx, tz, dt, { stopD: onFoot && tx === P.pos.x ? 8 : 7, leave: u.mode === 'leave' });
    setPose(c.rig, 'drive', dt, 0, 8);
  }
  updateOfficer(o, dt) {
    const g = this.g, P = g.player, c = o.cop;
    if (c.dead) {
      this.updateBody(c, dt);
      o.deadT += dt;
      // অনেকক্ষণ পরে নতুন পুলিশ (খেলোয়াড় দূরে থাকলে)
      if (!o.temp && o.deadT > 60 && Math.hypot(P.pos.x - o.home.x, P.pos.z - o.home.z) > 90) {
        if (c.body && !c.body.gone) { c.body.gone = true; c.body.remove(); }
        g.scene.remove(c.rig.root);
        const n = newCop();
        n.officer = o; n.x = o.home.x; n.z = o.home.z; n.yaw = o.home.yaw;
        g.scene.add(n.rig.root);
        o.cop = n; o.state = 'post'; o.deadT = 0;
      }
      return;
    }
    const st = this.stars;
    const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
    if (st > 0 && d < 110 && (d < 70 || o.state === 'chase')) {
      o.state = 'chase';
      this.footChase(c, dt);
      return;
    }
    if (o.state === 'chase') o.state = 'return';
    giveGun(c.rig, false);
    if (o.state === 'return') {
      const h = this.moveCop(c, o.home.x, o.home.z, 1.6, dt, 0.2);
      c.yaw = Math.atan2(-(o.home.x - c.x), -(o.home.z - c.z));
      this.placeCop(c, 'walk', dt, 1.6);
      if (h < 0.4) o.state = 'post';
      return;
    }
    // দাঁড়িয়ে ডিউটি: মাঝে মাঝে হাত দেখিয়ে গাড়ি থামানো
    const prevW = o.waveT % 9;
    o.waveT += dt;
    // হাত দেখানো শুরু হলে কাছে থাকলে ডাক
    if (!o.guard && prevW > o.waveT % 9 && d < 30) g.sound.voiceId('traffic_cop_01', false, d);
    c.yaw = o.home.yaw;
    this.placeCop(c, !o.guard && o.waveT % 9 < 2 ? 'wave' : 'idle', dt);
  }

  // খেলোয়াড় পুলিশকে মারলে বা গুলি করলে
  damageCop(c, dmg, kind, from) {
    const g = this.g;
    if (c.dead) return;
    const byP = from === g.player.pos;
    c.health -= dmg;
    if (c.health <= 0) {
      c.dead = true; c.spin = 0;
      giveGun(c.rig, false);
      if (c.unit) c.unit.mode = 'dead';
      if (c.officer) { c.officer.state = 'dead'; c.officer.deadT = 0; }
      g.combat.blood(c.x, c.z, 1.0);
      const body = { x: c.x, z: c.z, remove: () => g.scene.remove(c.rig.root) };
      c.body = body;
      g.medic.request(body);
      g.traffic.panic(c.x, c.z, 30, g);
      if (byP) this.offense('killCop', c.x, c.z);
    } else {
      c.act = 0.3; c.actPose = 'flinch';
      if (byP) this.offense(kind === 'bullet' ? 'shootCop' : 'assaultCop', c.x, c.z);
    }
  }

  // ---------- ধরা পড়া: মামলা, জরিমানা, থানায় আটক ----------
  busted() {
    const g = this.g, P = g.player;
    const s = Math.max(1, this.stars);
    const fine = FINE[s];
    const paid = g.charge(fine);
    g.rating = Math.max(1, g.rating - 0.3);
    g.save();
    if (P.state === 'drive' || P.state === 'exit' || (P.state === 'enter' && P.inT)) P.exit(g);
    g.jobs.abort('', 0);
    g.sound.whistle();
    g.sound.voiceId('busted_01');
    this.sirenLvl = 0;
    this.caseNo = Math.floor(rand(100, 999));
    const lines = Object.entries(this.offenses).map(([k, n]) => `${OFF[k].name}${n > 1 ? ` × ${bn(n)}` : ''}`);
    g.showBusted({
      caseText: `মিরপুর সেন্ট্রাল থানা · মামলা নং ${bn(this.caseNo)}/${bn(2026)}`,
      offenses: lines.length ? lines : ['ট্রাফিক আইন ভঙ্গ'],
      stars: s,
      fine: `৳${bnGroup(fine)}`,
      paid: paid < fine ? `বাকির সীমায় ধরল ৳${bnGroup(paid)}, বাকিটা মওকুফ` : (g.money < 0 ? `বাকিতে দিলেন, এখন বাকি ৳${bnGroup(-g.money)}` : ''),
      hours: `থানায় আটক: ${bn(HOURS[s])} ঘণ্টা`,
    });
  }
  // ছাড়া পাওয়া বা হাসপাতাল থেকে ফেরা: সব তাড়া বন্ধ
  release() {
    for (const u of [...this.units]) this.removeUnit(u);
    this.heat = 0;
    this.offenses = {};
    this.unseen = 0;
    this.bust = 0;
    this.calm = 0;
    this.spotted = false;
    this.search = null;
    this.sirenLvl = 0;
    for (const o of this.officers) {
      if (o.cop.dead) continue;
      o.state = 'post';
      o.cop.x = o.home.x; o.cop.z = o.home.z;
      giveGun(o.cop.rig, false);
      this.placeCop(o.cop, 'idle', 0);
    }
  }
}
