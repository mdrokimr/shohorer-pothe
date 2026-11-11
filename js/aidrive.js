// পুলিশ আর অ্যাম্বুলেন্সের চালক: GPS ধরে লক্ষ্যের দিকে, আটকে গেলে পিছিয়ে আবার চেষ্টা
import { THROW } from './vehicles.js';
import { crashDmg } from './wreck.js';
import { clamp } from './utils.js';

export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// u: { v, route, routeT, stuckT, revT, revSteer }
// opt: { stopD, max, leave }
export function aiDrive(g, u, tx, tz, dt, opt = {}) {
  const v = u.v;
  const dist = Math.hypot(tx - v.x, tz - v.z);
  let ax, az, thr = 0;
  if (opt.leave) {
    // সামনের রাস্তা ধরে চলে যাওয়া
    const nr = g.world.nearestRoad(v.x, v.z);
    const f = v.fwd();
    const sg = nr.seg.dir.x * f.x + nr.seg.dir.z * f.z >= 0 ? 1 : -1;
    ax = nr.px + nr.seg.dir.x * sg * 25 + nr.seg.dir.z * sg * 2.4;
    az = nr.pz + nr.seg.dir.z * sg * 25 - nr.seg.dir.x * sg * 2.4;
    thr = v.speed < 11 ? 0.7 : 0;
  } else if (dist < 28) {
    ax = tx; az = tz;
  } else {
    u.routeT = (u.routeT || 0) - dt;
    if (u.routeT <= 0 || !u.route) { u.routeT = 1; u.route = g.nav.route(v.x, v.z, tx, tz); }
    // রাস্তার মাঝখান (ডিভাইডার) নয়, বাম লেন ধরে
    let pt = null, prev = { x: v.x, z: v.z };
    for (const q of u.route) { if (Math.hypot(q.x - v.x, q.z - v.z) > 9) { pt = q; break; } prev = q; }
    if (!pt) pt = { x: tx, z: tz };
    ax = pt.x; az = pt.z;
    const ex = pt.x - prev.x, ez = pt.z - prev.z, el = Math.hypot(ex, ez);
    if (el > 1) {
      // গাড়ি যে পাশে আছে সে পাশেই থাকে (ডিভাইডার পার হতে চায় না)
      const side = (v.x - prev.x) * (ez / el) + (v.z - prev.z) * (-ex / el) >= -0.5 ? 1 : -1;
      const nw = g.world.nearestRoad(pt.x, pt.z);
      const off = Math.min(3, (nw ? nw.seg.width : 6) * 0.22); // সরু গলিতে কম সরে
      ax += (ez / el) * off * side; az += (-ex / el) * off * side;
    }
  }
  const want = Math.atan2(-(ax - v.x), -(az - v.z));
  const diff = angDiff(v.yaw, want);
  let steer = clamp(-diff * 2.4, -1, 1);
  if (!opt.leave) {
    const stopD = opt.stopD ?? 7, max = opt.max ?? 25;
    if (dist < stopD) thr = v.speed > 0.8 ? -1 : 0;
    else {
      const ws = dist < 28 ? clamp((dist - stopD) * 1.0, 2.5, max) : Math.abs(diff) > 0.9 ? 8 : max;
      thr = v.speed < ws ? 1 : -0.5;
    }
  }
  // ৩ সেকেন্ডে লক্ষ্যের দিকে না এগোলে (দেয়ালে ঘষা খাচ্ছে) পিছিয়ে আবার চেষ্টা
  if (!opt.leave) {
    u.progT = (u.progT || 0) + dt;
    if (u.progT > 3) {
      if (u.lastD !== undefined && u.lastD - dist < 3 && dist > (opt.stopD ?? 7) + 6 && !(u.revT > 0)) { u.revT = 1.4; u.revSteer = -(steer >= 0 ? 1 : -1); }
      u.lastD = dist; u.progT = 0;
    }
  }
  if (u.revT > 0) { u.revT -= dt; thr = -1; steer = u.revSteer; }
  else if (thr > 0 && Math.abs(v.speed) < 1) {
    u.stuckT = (u.stuckT || 0) + dt;
    if (u.stuckT > 1.3) { u.stuckT = 0; u.revT = 1.2; u.revSteer = steer >= 0 ? 1 : -1; }
  } else u.stuckT = 0;
  const impact = v.drive(dt, { throttle: thr, steer, handbrake: false }, g.world);
  // দেয়ালে ধাক্কা: গাড়ি দুমড়ায়, উল্টায় না
  if (impact > 2.5) { v.damage(crashDmg(impact) * 0.6); v.crashDent(impact * 0.8); }
  if (THROW[v.type] && impact > THROW[v.type]) v.flip(-v.fwd().x, -v.fwd().z, impact);
  separate(g, v);
  v.sync(dt);
  return dist;
}

// অন্য যানবাহনের ভিতর ঢুকে না যাওয়া
export function separate(g, v) {
  for (const o of g.allVehicles()) {
    if (o === v || Math.hypot(o.x - v.x, o.z - v.z) > 9) continue;
    const mine = o === g.player.vehicle ? 0.5 : 1;
    for (const a of v.circles()) for (const b of o.circles()) {
      const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), r = a.r + b.r;
      if (d >= r || d < 1e-4) continue;
      v.x += (dx / d) * (r - d) * mine;
      v.z += (dz / d) * (r - d) * mine;
      if (o.ai && !o.tumble) o.stun = Math.max(o.stun || 0, 0.8);
    }
  }
}
