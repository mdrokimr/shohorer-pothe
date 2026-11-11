// অ্যাম্বুলেন্স: রাস্তায় কেউ মারা গেলে সাইরেন বাজিয়ে এসে নিয়ে যায়
import { Vehicle } from './vehicles.js';
import { makeRig, setPose } from './rig.js';
import { pick, rand } from './utils.js';
import { aiDrive } from './aidrive.js';

export class Medic {
  constructor(g) {
    this.g = g;
    this.bodies = []; // { x, z, remove(), taken, amb }
    this.units = [];
    this.sirenLvl = 0;
    this.spawnT = 0;
  }
  request(body) {
    body.taken = false;
    body.t = 0;
    this.bodies.push(body);
  }
  spawn(body) {
    const g = this.g, segs = g.map.segments;
    for (let tries = 0; tries < 30; tries++) {
      const s = pick(segs);
      if (s.len < 14) continue;
      const t = rand(5, s.len - 5);
      const d = Math.random() < 0.5 ? s.dir : { x: -s.dir.x, z: -s.dir.z };
      if (s.width < 6) continue; // সরু গলিতে না
      const lo = Math.min(2.4, s.width * 0.22);
      const x = s.ax + s.dir.x * t + d.z * lo, z = s.az + s.dir.z * t - d.x * lo;
      const dist = Math.hypot(x - body.x, z - body.z);
      const dp = Math.hypot(x - g.player.pos.x, z - g.player.pos.z);
      if (dist < 90 || dist > 190 || dp < 60) continue;
      if (g.allVehicles().some((o) => Math.hypot(o.x - x, o.z - z) < 8)) continue;
      const v = new Vehicle(g.scene, 'ambulance', { ai: true, x, z, yaw: Math.atan2(-d.x, -d.z) });
      v.siren = true;
      const drv = makeRig({ shirt: 0xf2f2f2, pants: 0x2a3a5a });
      v.g.add(drv.root);
      drv.root.position.set(v.spec.seat.x, v.spec.seat.y - 0.95, v.spec.seat.z);
      const u = { v, drv, body, mode: 'go', t: 0, life: 0 };
      body.amb = u;
      this.units.push(u);
      return u;
    }
    return null;
  }
  remove(u) {
    this.g.scene.remove(u.v.g);
    this.units.splice(this.units.indexOf(u), 1);
  }
  update(dt) {
    const g = this.g, P = g.player;
    // বেশি দূরের লাশ (ম্যাপ থেকে সরে গেছে) বাদ
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.t += dt;
      if (b.gone) { this.bodies.splice(i, 1); if (b.amb && b.amb.mode === 'go') b.amb.mode = 'leave'; }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.units.filter((u) => u.mode !== 'leave').length < 2) {
      const b = this.bodies.find((x) => !x.amb && x.t > 4);
      if (b) { this.spawnT = 3; this.spawn(b); }
    }
    let near = 1e9;
    for (const u of [...this.units]) {
      u.life += dt;
      const v = u.v;
      const dp = Math.hypot(v.x - P.pos.x, v.z - P.pos.z);
      if (u.mode === 'go') {
        near = Math.min(near, dp);
        if (v.tumble) { v.updateTumble(dt, g.world); v.sync(dt); continue; }
        if (v.wrecked) { u.mode = 'leave'; u.body.amb = null; continue; }
        const d = aiDrive(g, u, u.body.x, u.body.z, dt, { stopD: 6, max: 18 });
        // কাছে এসে থামলে, বা গলিতে ঢুকতে না পারলে কাছাকাছি থেকেই স্ট্রেচার নিয়ে যায়
        if ((d < 8.5 && Math.abs(v.speed) < 0.8) || (u.life > 40 && d < 45)) { u.mode = 'load'; u.t = d < 8.5 ? 2.6 : 5; g.sound.door(); }
        if (u.life > 90) { u.mode = 'leave'; u.body.amb = null; u.body.t = 0; }
      } else if (u.mode === 'load') {
        near = Math.min(near, dp);
        v.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.world);
        v.sync(dt);
        u.t -= dt;
        if (u.t <= 0) {
          // লাশ তুলে নেওয়া
          const b = u.body;
          if (!b.gone) { b.remove(); b.gone = true; }
          g.sound.door();
          u.mode = 'leave';
          u.life = 0;
          v.siren = false;
        }
      } else {
        if (v.tumble) { v.updateTumble(dt, g.world); v.sync(dt); }
        else if (!v.wrecked) aiDrive(g, u, 0, 0, dt, { leave: true });
        if (dp > 160 || u.life > 35) this.remove(u);
        continue;
      }
      setPose(u.drv, 'drive', dt, 0, 8);
    }
    this.sirenLvl = near < 1e8 ? Math.max(0.1, 1 - near / 170) * 0.8 : 0;
  }
  clear() {
    for (const u of [...this.units]) this.remove(u);
  }
}
