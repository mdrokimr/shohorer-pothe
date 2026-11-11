// যানবাহনের ক্ষতি: ধোঁয়া → আগুন → বিস্ফোরণ (GTA V-এর মতো)
import { rand, pick, clamp } from './utils.js';

// আগুন ধরার পর বিস্ফোরণ: ৩–৫ সেকেন্ড
const BURN_TIME = { bike: 3.2, rickshaw: 3.0, cng: 3.6, autorickshaw: 3.2, van: 3.2, car: 4.0, police: 4.2, ambulance: 4.2, pickup: 4.2, leguna: 4.5, bus: 5.0, truck: 5.0 };
const HOOD_Y = { bike: 0.8, rickshaw: 1.0, cng: 1.2, car: 1.0, police: 1.0, ambulance: 1.6, bus: 2.2, truck: 2.4 };
const BLAST_R = 9.5;

// ধাক্কার জোর (মি/সে) থেকে ক্ষতি
// GTA V-এর মতো শক্ত: ৬০-৭০ কিমি/ঘণ্টায় দেয়ালে প্রায় ৮-১০ বার মারলে তবে আগুন
export function crashDmg(impact) { return Math.max(0, impact - 6) * 0.85; }

export class Wrecks {
  constructor(g) {
    this.g = g;
    this.puffT = 0;
    this.fireNear = 0;
    this.fireHurtT = 0;
    this.sputT = 0;
  }
  update(dt) {
    const g = this.g, P = g.player, fx = g.vfx;
    this.puffT -= dt;
    this.sputT = Math.max(0, this.sputT - dt);
    const puff = this.puffT <= 0;
    if (puff) this.puffT = 0.08;
    let fireNear = 0, fireAt = null, fireD = 1e9;
    // রাস্তার গাড়িতে আগুন লাগলে চালক নেমে পালায়
    for (const c of g.traffic.cars) if (!c.dead && c.v.hp <= 0) g.traffic.burnCar(c, g);
    for (const v of g.allVehicles()) {
      if (v.sink) { if (v.sink.splash) { v.sink.splash = false; this.splash(v); } continue; }
      const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z);
      // উল্টো হয়ে পড়ে থাকলে তেল চুইয়ে আগুন ধরে
      if (!v.burnt && !v.tumble && v.hp > 0 && !['bike', 'rickshaw', 'autorickshaw', 'van'].includes(v.type) && Math.abs(Math.abs(v.roll) - Math.PI) < 0.1) v.damage(10 * dt);
      if (v.burnt) {
        v.burn += dt;
        if (puff && d < 120 && v.burn < 30 && Math.random() < 0.25) { const h = v.toWorld(0, 0); fx.emit('dark', h.x, v.y + 1.2, h.z, 0x262626, { scale: 0.8 }); }
        continue;
      }
      if (v.hp <= 0) {
        v.burn += dt;
        if (d < 30) fireNear = Math.max(fireNear, 1 - d / 30);
        if (d < fireD) { fireD = d; fireAt = v; }
        if (puff && d < 140) {
          const h = v.toWorld(rand(-0.4, 0.4), -v.spec.len * 0.28 + rand(-0.4, 0.8));
          const y = v.y + (HOOD_Y[v.type] || 1) + (v.roll ? 0.2 : 0);
          fx.emit('fire', h.x, y, h.z, 0xffc040, { scale: 1.3, c1: 0xff3a10 });
          if (Math.random() < 0.6) fx.emit('fire', h.x, y + 0.2, h.z, 0xff9a20, { scale: 1, c1: 0xb01800 });
          if (Math.random() < 0.5) fx.emit('dark', h.x, y + 0.8, h.z, 0x1a1a1a, { scale: 1.2 });
        }
        if (!v.firePanic) {
          v.firePanic = true;
          g.traffic.panic(v.x, v.z, 25, g);
          // আগুন ধরলে খেলোয়াড়কে জোর করে নামানো
          if (v === P.vehicle && (P.state === 'drive' || P.state === 'enter')) {
            g.ui.toast('আগুন! জোর করে নামছেন!', 'bad');
            try { P.exit(g); } catch (e) { /* নামা ব্যর্থ হলেও আগুন চলবে */ }
          } else if (v === P.vehicle) g.ui.toast(`আগুন! ${g.mobile ? 'নামা বোতাম' : 'F'} চেপে এখনই নামুন!`, 'bad');
        }
        // ভিতরে বসে থাকলে পোড়া (নামা ব্যর্থ হলে)
        if (v === P.vehicle && P.state === 'drive') {
          this.fireHurtT -= dt;
          if (this.fireHurtT <= 0) { this.fireHurtT = 0.5; g.damagePlayer(6, 'fire'); }
        } else if (P.state === 'foot' && d < 2.2) {
          this.fireHurtT -= dt;
          if (this.fireHurtT <= 0) { this.fireHurtT = 0.6; g.damagePlayer(5, 'fire'); }
        }
        if (v.burn > (BURN_TIME[v.type] || 4)) this.explode(v);
        continue;
      }
      if (d > 120 || !puff) continue;
      const f = v.hp / v.maxHp;
      const h = v.toWorld(0, -v.spec.len * 0.3);
      const y = v.y + (HOOD_Y[v.type] || 1);
      // <25%: কালো ধোঁয়া + ইঞ্জিন স্পটার; <50%: সাদা ধোঁয়া
      if (f < 0.25) {
        fx.emit('dark', h.x, y, h.z, 0x2c2c2c, { vx: -v.fwd().x * v.speed * 0.3, vz: -v.fwd().z * v.speed * 0.3, scale: 1.15 });
        if (v === P.vehicle && this.sputT <= 0 && Math.random() < 0.35) {
          this.sputT = 0.22 + Math.random() * 0.25;
          g.sound.noise(0.09, 0.07, 'bandpass', 900, 280, 2);
          g.sound.tone('sawtooth', 70 + Math.random() * 40, 0.07, 0.05, 40);
        }
      } else if (f < 0.5) {
        if (Math.random() < 0.55) fx.emit('smoke', h.x, y, h.z, 0xc8c8c8, { vx: -v.fwd().x * v.speed * 0.3, vz: -v.fwd().z * v.speed * 0.3, scale: 0.9 });
      }
    }
    this.fireNear = fireNear;
    // সবচেয়ে কাছের আগুনে কমলা আলো কাঁপে
    if (fireAt && fireD < 60) { fx.fireLight = clamp(1 - fireD / 60, 0, 1); if (fx.lightT <= 0) fx.light.position.set(fireAt.x, fireAt.y + 2, fireAt.z); }
    else fx.fireLight = 0;
  }

  splash(v) {
    const g = this.g;
    for (let i = 0; i < 16; i++) g.vfx.emit('debris', v.x, 0.3, v.z, 0xdfeff5, { scale: 0.7 });
    g.sound.noise(0.8, 0.3, 'lowpass', 1800, 200);
  }
  explode(v) {
    const g = this.g, P = g.player;
    const byP = v.lastBy === 'player';
    v.hp = -1;
    v.burn = 0;
    v.speed = 0;
    v.wrecked = true;
    v.setBurnt(true);
    if (v.siren) v.siren = false;
    // হালকা লাফিয়ে ওঠে
    if (v.type !== 'bus' && v.type !== 'truck' && !v.tumble) v.tumble = { vx: rand(-1.4, 1.4), vz: rand(-1.4, 1.4), vy: v.type === 'bike' ? 4.5 : 6.2, wr: rand(-1.8, 1.8), wp: rand(-1.0, 1.0), wy: rand(-0.8, 0.8) };
    g.vfx.explode(v.x, v.y, v.z);
    if (g.world.glass) g.world.glass.blast(v.x, v.z, 12, g);
    const dc = Math.hypot(v.x - g.camPos.x, v.z - g.camPos.z);
    g.sound.boom(clamp(1 - dc / 160, 0.12, 1));
    g.shake = Math.max(g.shake || 0, clamp(1.5 - dc / 32, 0, 1.2));
    const from = { x: v.x, z: v.z };
    // আপনি
    const dp = Math.hypot(P.pos.x - v.x, P.pos.z - v.z);
    if (P.state === 'drive' && P.vehicle === v) g.damagePlayer(999, 'explode');
    else if (dp < BLAST_R && P.state !== 'dead') {
      const k = 1 - dp / BLAST_R;
      g.damagePlayer(22 + k * 100, 'explode', from);
      if (P.state === 'foot') { const l = dp || 1; P.knock(((P.pos.x - v.x) / l) * (3.5 + k * 7), ((P.pos.z - v.z) / l) * (3.5 + k * 7), 3.2 + k * 3.2, 2.5); }
    }
    // পথচারী
    for (const p of [...g.traffic.peds]) {
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      if (d < BLAST_R) g.traffic.damagePed(p, 35 + (1 - d / BLAST_R) * 160, 'explode', from, g);
    }
    for (const c of g.law.footCops()) {
      const d = Math.hypot(c.x - v.x, c.z - v.z);
      if (d < BLAST_R) g.law.damageCop(c, 35 + (1 - d / BLAST_R) * 160, 'explode', from);
    }
    // আশেপাশের গাড়ি: জোরে ছিটকে / উল্টে
    for (const o of g.allVehicles()) {
      if (o === v || o.burnt) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d > 12) continue;
      o.damage((1 - d / 12) * 90, v.lastBy);
      if (o.breakGlass) o.breakGlass(d < 7 ? 2 : 1, g, (o.x - v.x) / (d || 1), (o.z - v.z) / (d || 1));
      if (d < 7 && !o.tumble && o.type !== 'bus' && o.type !== 'truck') {
        const l = d || 1, px = (o.x - v.x) / l, pz = (o.z - v.z) / l;
        const power = 11 * (1 - d / 7);
        const car = g.traffic.cars.find((c) => c.v === o);
        if (o === P.vehicle) g.flipVehicle(o, px, pz, power, true);
        else if (car) g.traffic.flipCar(car, px, pz, power, g);
        else o.flip(px, pz, power);
      } else if (d < 12 && !o.tumble) {
        // ভারী বাসের কাছে: ধাক্কায় গতি দেওয়া
        const l = d || 1;
        o.speed += ((o.x - v.x) / l * o.fwd().x + (o.z - v.z) / l * o.fwd().z) * (4 * (1 - d / 12));
      }
    }
    g.traffic.panic(v.x, v.z, 60, g);
    if (byP) g.law.offense('explode', v.x, v.z);
  }
}
