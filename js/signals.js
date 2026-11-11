// ট্রাফিক সিগন্যাল: বড় মোড়ে লাল-হলুদ-সবুজ বাতি, স্টপ লাইন, মাঝে ছাতাওয়ালা ট্রাফিক বক্স
// গাড়িগুলো লাল বাতিতে থামে, পিছনে লাইন লেগে জ্যাম; রিকশা-সিএনজি মাঝে মাঝে সিগন্যাল ভাঙে (দেশি ভাইব)
import * as THREE from 'three';
import { lam, canvasTex, mergeStatic } from './lib3d.js';
import { makeRig, setPose, POLICE_LOOK } from './rig.js';

const GREEN_A = 15, GREEN_B = 12, YELLOW = 3, ALLRED = 1.5;
const CYCLE = GREEN_A + YELLOW + ALLRED + GREEN_B + YELLOW + ALLRED;
const ON = { r: 0xff2a1a, y: 0xffb300, g: 0x2bd64a }, OFF = { r: 0x3a0d0b, y: 0x3a2a08, g: 0x0d3014 };

function umbrellaTex() {
  return canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#d32f2f'; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
  });
}

export class Signals {
  constructor(g) {
    this.g = g;
    this.list = [];
    this.byNode = new Map();
    this.t = 0;
    const M = g.map, W = g.world;
    const cand = [];
    for (let id = 0; id < M.nodes.length; id++) {
      const n = M.nodes[id];
      if (!n || !n.links || n.links.length < 3) continue;
      const segs = n.links.map((l) => M.segments[l.seg]);
      const mains = segs.filter((s) => s.main).length;
      if (mains < 2) continue;
      if (segs.some((s) => s.len < 14)) continue;
      cand.push({ id, n, segs, score: mains * 10 + segs.reduce((a, s) => a + s.width, 0) });
    }
    cand.sort((a, b) => b.score - a.score);
    for (const c of cand) {
      if (this.list.length >= 40) break;
      if (this.list.some((j) => Math.hypot(j.x - c.n.x, j.z - c.n.z) < 55)) continue;
      this.addJunction(c.id, c.n, c.segs, W);
    }
    this.buildMeshes(g.scene, W);
  }
  addJunction(id, n, segs, W) {
    const links = n.links.map((l) => {
      const s = this.g.map.segments[l.seg];
      const o = s.a === id ? s.dir : { x: -s.dir.x, z: -s.dir.z }; // মোড় থেকে বাইরের দিক
      return { seg: s.id, s, o, ang: Math.atan2(o.z, o.x) };
    });
    // দুই দলে ভাগ: একই সোজা রাস্তার দুই দিক এক দলে
    const ref = links.find((l) => l.s.main) || links[0];
    for (const l of links) {
      let d = Math.abs(l.ang - ref.ang) % Math.PI; d = Math.min(d, Math.PI - d);
      l.grp = d < Math.PI / 4 ? 0 : 1;
    }
    const j = { id, x: n.x, z: n.z, r: W.nodeW[id] ? W.nodeW[id].r : 6, links, off: Math.random() * CYCLE, phase: '', lamps: [] };
    this.list.push(j);
    this.byNode.set(id, j);
  }
  // এই মুহূর্তে দলের বাতি
  groupState(j, grp) {
    const t = (this.t + j.off) % CYCLE;
    if (t < GREEN_A) return grp === 0 ? 'g' : 'r';
    if (t < GREEN_A + YELLOW) return grp === 0 ? 'y' : 'r';
    if (t < GREEN_A + YELLOW + ALLRED) return 'r';
    const t2 = t - (GREEN_A + YELLOW + ALLRED);
    if (t2 < GREEN_B) return grp === 1 ? 'g' : 'r';
    if (t2 < GREEN_B + YELLOW) return grp === 1 ? 'y' : 'r';
    return 'r';
  }
  // মোড়ে ঢুকতে চাওয়া গাড়ির জন্য বাতি (মোড় না হলে null)
  stateFor(nodeId, segId) {
    const j = this.byNode.get(nodeId);
    if (!j) return null;
    const l = j.links.find((q) => q.seg === segId);
    return l ? this.groupState(j, l.grp) : null;
  }
  buildMeshes(scene, W) {
    const S = new THREE.Group();
    this.poles = [];
    const pole = lam(0x3d4247), box = lam(0x1b1d20), white = lam(0xf2f2f2), yel = lam(0xf2c230);
    const lampPos = [];
    for (const j of this.list) {
      for (const l of j.links) {
        const w = l.s.width;
        const back = j.r + 1.6;
        const din = { x: -l.o.x, z: -l.o.z }; // ঢোকার দিক
        const nl = { x: din.z, z: -din.x }; // ঢোকার পথে বাম দিক (বাংলাদেশে গাড়ি বাম দিক দিয়ে চলে)
        // খুঁটি ফুটপাতে: রাস্তার ভিতরে (বা পাশের আরেক রাস্তায়) পড়লে একটু সরিয়ে দেখা; কোথাও না হলে এই খুঁটি বাদ
        let px = 0, pz = 0, found = false;
        for (const bk of [back, back + 1.5, back + 3, back - 0.8]) {
          for (const sd of [w / 2 + 0.45, w / 2 + 0.9, w / 2 + 1.5]) {
            const x = j.x + l.o.x * bk + nl.x * sd, z = j.z + l.o.z * bk + nl.z * sd;
            if (W && ((W.onRoad && W.onRoad(x, z, 0.25)) || (W.blocked && W.blocked(x, 1, z)))) continue;
            px = x; pz = z; found = true; break;
          }
          if (found) break;
        }
        // খুঁটি, বাহু আর বাতির বাক্স (বাক্সের মুখ আসা গাড়ির দিকে)
        const ry = Math.atan2(l.o.x, l.o.z);
        // খুঁটি-বাহু-বাক্স: আলাদা ইনস্ট্যান্স (ধাক্কায় এই খুঁটিটাই পড়ে যায়)
        const ax = px - nl.x * 0.8, az = pz - nl.z * 0.8;
        const hx = px - nl.x * 1.5, hz = pz - nl.z * 1.5;
        const P = { j, l, x: px, z: pz, parts: [], lamps: [], down: false, ang: 0 };
        if (found) P.parts.push(['pole', px, 1.8 + 0.16, pz, 0], ['arm', ax, 3.55, az, Math.atan2(nl.x, nl.z)], ['head', hx, 3.0, hz, ry], ['head2', px + l.o.x * 0.05, 2.35, pz + l.o.z * 0.05, ry]);
        if (found) this.poles.push(P);
        // সাদা স্টপ লাইন (নিজের লেনে)
        if (!l.s.oneway || true) {
          const half = l.s.oneway ? w - 0.6 : w / 2 - 0.3;
          const sl = new THREE.Mesh(new THREE.PlaneGeometry(half, 0.4), white);
          sl.rotation.x = -Math.PI / 2; sl.rotation.z = -ry;
          const cx = j.x + l.o.x * (back - 0.3) + nl.x * (l.s.oneway ? 0 : half / 2 + 0.15), cz = j.z + l.o.z * (back - 0.3) + nl.z * (l.s.oneway ? 0 : half / 2 + 0.15);
          sl.position.set(cx, 0.075, cz); S.add(sl);
        }
        // বাতিগুলো: উপরে লাল, মাঝে হলুদ, নিচে সবুজ (উপরের বাক্স আর খুঁটির ছোট বাক্স দুটোতেই)
        if (found) for (const [bx, bz, y0, sc] of [[hx, hz, 3.0, 1], [px + l.o.x * 0.05, pz + l.o.z * 0.05, 2.35, 0.9]]) {
          ['r', 'y', 'g'].forEach((c, k) => {
            lampPos.push({ j, grp: l.grp, c, x: bx + l.o.x * 0.14, y: y0 + (1 - k) * 0.3 * sc, z: bz + l.o.z * 0.14, ry, sc, pole: this.poles[this.poles.length - 1] });
          });
        }
      }
      // বড় মোড়ের মাঝে ছাতাওয়ালা ট্রাফিক বক্স (ঢাকার চেনা দৃশ্য)
      if (j.r >= 7) {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.45, 12), yel); pod.position.set(j.x, 0.3, j.z); S.add(pod);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.12, 12), lam(0x222222)); ring.position.set(j.x, 0.1, j.z); S.add(ring);
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), pole); up.position.set(j.x, 1.8, j.z); S.add(up);
        const um = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.55, 8, 1, true), new THREE.MeshLambertMaterial({ map: umbrellaTex(), side: THREE.DoubleSide }));
        um.position.set(j.x, 3.05, j.z); S.add(um);
        j.box = { x: j.x, z: j.z };
      }
    }
    scene.add(S);
    mergeStatic(S, true, false);
    // খুঁটির অংশ: ধরন অনুযায়ী একটা করে InstancedMesh
    const GEO = { pole: [new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), pole], arm: [new THREE.BoxGeometry(0.08, 0.08, 1.6), pole], head: [new THREE.BoxGeometry(0.36, 1.0, 0.26), box], head2: [new THREE.BoxGeometry(0.3, 0.95, 0.22), box] };
    this.pim = {};
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (const k of Object.keys(GEO)) {
      const n = this.poles.length;
      const im = new THREE.InstancedMesh(GEO[k][0], GEO[k][1], Math.max(1, n));
      im.castShadow = true; im.userData.noShadow = false;
      this.pim[k] = im; scene.add(im);
    }
    this.poles.forEach((P, i) => {
      P.i = i; P.base = {};
      for (const [k, x, y, z, ry] of P.parts) {
        mm.compose(vv.set(x, y, z), qq.setFromAxisAngle(up, ry), one);
        P.base[k] = mm.clone();
        this.pim[k].setMatrixAt(i, mm);
      }
    });
    for (const k in this.pim) { this.pim[k].instanceMatrix.needsUpdate = true; this.pim[k].computeBoundingSphere(); }
    W.signalPoles = this.list.length;
    // সব বাতি এক InstancedMesh-এ (রং বদলায় বাতি বদলালে)
    const geo = new THREE.CircleGeometry(0.105, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, lampPos.length));
    im.frustumCulled = false; im.userData.noShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
    const col = new THREE.Color();
    lampPos.forEach((L, i) => {
      e.set(0, L.ry, 0); q.setFromEuler(e);
      m4.compose(v.set(L.x, L.y, L.z), q, s3.set(L.sc, L.sc, L.sc));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHex(OFF[L.c]));
      L.j.lamps.push({ i, grp: L.grp, c: L.c, pole: L.pole });
      if (L.pole) L.pole.lamps.push({ i, m: m4.clone() });
    });
    scene.add(im);
    this.im = im;
    this.col = col;
    // বাতির আভা (রাতে দূর থেকেও চোখে পড়ে)
    this.glowM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  update(dt) {
    this.t += dt;
    if (!this.im) return;
    let dirty = false;
    for (const j of this.list) {
      const ph = this.groupState(j, 0) + this.groupState(j, 1);
      if (ph === j.phase) continue;
      j.phase = ph;
      for (const L of j.lamps) {
        const st = this.groupState(j, L.grp);
        this.im.setColorAt(L.i, this.col.setHex(L.pole && L.pole.down ? 0x111111 : st === L.c ? ON[L.c] : OFF[L.c]));
      }
      dirty = true;
    }
    if (dirty && this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    this.checkPlayer(dt);
    try { this.updatePoles(dt); } catch (e) { console.warn('signal poles', e && e.message); }
    try { this.updatePolice(dt); } catch (e) { /* পুলিশ না থাকলেও সিগন্যাল চলে */ }
  }
  // ধাক্কায় খুঁটি ভাঙা: জোরে চলা গাড়ির গায়ে লাগলে খুঁটি গোড়া থেকে উল্টো দিকে কাত হয়ে পড়ে, বাতি নিভে যায়
  updatePoles(dt) {
    if (!this.poles || !this.pim) return;
    const g = this.g;
    let vs = null, dirty = false;
    const mm = new THREE.Matrix4(), T = new THREE.Matrix4(), Ti = new THREE.Matrix4(), R = new THREE.Matrix4(), ax = new THREE.Vector3();
    for (const P of this.poles) {
      if (P.down) {
        if (P.ang < 1.48) {
          P.w = (P.w || 0.6) + dt * 9; // মাধ্যাকর্ষণে দ্রুত হয়
          P.ang = Math.min(1.48, P.ang + P.w * dt);
          T.makeTranslation(P.x, 0.16, P.z); Ti.makeTranslation(-P.x, -0.16, -P.z);
          R.makeRotationAxis(ax.set(P.ax, 0, P.az), P.ang);
          const F = T.clone().multiply(R).multiply(Ti);
          for (const k in P.base) { mm.copy(F).multiply(P.base[k]); this.pim[k].setMatrixAt(P.i, mm); }
          for (const L of P.lamps) { mm.copy(F).multiply(L.m); this.im.setMatrixAt(L.i, mm); }
          dirty = true;
          if (P.ang >= 1.48 && g.sound) g.sound.crash(0.25);
        }
        continue;
      }
      vs = vs || g.allVehicles();
      for (const v of vs) {
        if (Math.abs(v.speed || 0) < 3 || v.air || v.boat || (v.y || 0) > 1.5 || !v.spec) continue;
        if (Math.abs(v.x - P.x) > 8 || Math.abs(v.z - P.z) > 8) continue;
        const r = (v.spec.r || 0.9) + 0.12;
        const hit = (v.spec.circles || [0]).some((c) => { const p = v.toWorld ? v.toWorld(0, c) : { x: v.x, z: v.z }; return Math.hypot(p.x - P.x, p.z - P.z) < r; });
        if (!hit) continue;
        // পড়ার দিক: গাড়ির চলার দিকে; ঘোরার অক্ষ তার লম্ব
        const f = v.fwd(), sg = Math.sign(v.speed) || 1;
        P.ax = f.z * sg; P.az = -f.x * sg; P.down = true; P.ang = 0; P.w = 0.4 + Math.abs(v.speed) * 0.08;
        v.speed *= 0.7;
        if (v.damage) v.damage(4, v === (g.player && g.player.vehicle) ? 'player' : null);
        if (g.sound) g.sound.crash(Math.min(0.7, Math.abs(v.speed) * 0.05));
        if (v === (g.player && g.player.vehicle)) { g.shake = Math.max(g.shake || 0, 0.25); g.ui.toast('সিগন্যালের খুঁটি ভেঙে ফেললেন!', 'bad'); }
        P.j.phase = ''; // বাতির রং নতুন করে (পড়া খুঁটির বাতি নেভানো)
        break;
      }
    }
    if (dirty) { for (const k in this.pim) this.pim[k].instanceMatrix.needsUpdate = true; this.im.instanceMatrix.needsUpdate = true; }
  }
  // মোড়ের ট্রাফিক পুলিশ: ছাতার নিচের বাক্সে, শুধু কাছের ৩টা মোড়ে (চরিত্র ভারী); লাল দিকে থামার হাত, সবুজ দিকে "আসুন", বাতি বদলালে বাঁশি
  updatePolice(dt) {
    const g = this.g, P = g.player;
    if (!P || !P.pos) return;
    this.cops = this.cops || [];
    const near = this.list.filter((j) => Math.hypot(j.x - P.pos.x, j.z - P.pos.z) < 120)
      .sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z)).slice(0, 4);
    for (const c of [...this.cops]) if (!near.includes(c.j)) { g.scene.remove(c.rig.root); this.cops.splice(this.cops.indexOf(c), 1); c.j.cop = null; }
    for (const j of near) {
      if (!j.cop && j.copGone && (g.time || 0) < j.copGone) continue;
      if (!j.cop) {
        const rig = makeRig({ ...POLICE_LOOK });
        // বক্স থাকলে ছাতার নিচে, না থাকলে দুই রাস্তার মাঝের কোণে ফুটপাতের কিনারায়
        let px = j.x, pz = j.z, py = 0.52;
        if (!j.box) {
          // দুই রাস্তার মাঝের কোণ (যে জোড়া সবচেয়ে আড়াআড়ি আগে); রাস্তার বাইরে ফুটপাতের কিনারা না পাওয়া পর্যন্ত বাইরে সরে
          const W = this.g.world, pairs = [];
          for (let a = 0; a < j.links.length; a++) for (let b = a + 1; b < j.links.length; b++) { const A = j.links[a], B = j.links[b]; pairs.push([A, B, Math.abs(A.o.x * B.o.x + A.o.z * B.o.z)]); }
          pairs.sort((p1, p2) => p1[2] - p2[2]);
          py = 0.16;
          for (const [A, B] of pairs) {
            let cx = A.o.x + B.o.x, cz = A.o.z + B.o.z; const cl = Math.hypot(cx, cz); if (cl < 0.3) continue; cx /= cl; cz /= cl;
            let ok = false;
            for (let e2 = 0.8; e2 <= 6; e2 += 0.5) { px = j.x + cx * (j.r + e2); pz = j.z + cz * (j.r + e2); if (!(W.onRoad && W.onRoad(px, pz, 0.2)) && !(W.blocked && W.blocked(px, 1, pz))) { ok = true; break; } }
            if (ok) break;
          }
        }
        rig.root.position.set(px, py, pz);
        g.scene.add(rig.root);
        j.cop = { j, rig, yaw: 0, last: '' };
        this.cops.push(j.cop);
      }
      const c = j.cop;
      // কোন দল লাল: সেদিকের রাস্তার দিকে মুখ (রিগের সামনে −z)
      const redGrp = this.groupState(j, 0) === 'r' ? 0 : 1;
      const l = j.links.find((q) => q.grp === redGrp) || j.links[0];
      const want = Math.atan2(-l.o.x, -l.o.z); // রিগের সামনে (−z) যেন লাল রাস্তার দিকে (o) থাকে
      let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      c.yaw += d * Math.min(1, dt * 2.5);
      c.rig.root.rotation.y = c.yaw;
      setPose(c.rig, 'traffic', dt, 0, 6);
      if (j.phase !== c.last) {
        if (c.last && Math.hypot(j.x - P.pos.x, j.z - P.pos.z) < 45 && g.sound && g.sound.whistle) g.sound.whistle();
        c.last = j.phase;
      }
    }
  }
  // পুলিশকে মারলে/গাড়িচাপা দিলে: মোড় থেকে সরিয়ে পথচারীর মতো (ছিটকে পড়া, মারা যাওয়া); তিন মিনিট নতুন কেউ আসে না
  takeCop(c) {
    const i = (this.cops || []).indexOf(c);
    if (i >= 0) this.cops.splice(i, 1);
    if (c.j) { c.j.cop = null; c.j.copGone = (this.g.time || 0) + 180; }
  }
  // আপনি লাল বাতিতে মোড়ে ঢুকলে (পুলিশ দেখলে মামলা)
  checkPlayer(dt) {
    const g = this.g, P = g.player;
    if (this.cd > 0) this.cd -= dt;
    if (P.state !== 'drive' || !P.vehicle || P.vehicle.air || Math.abs(P.vehicle.speed) < 4 || this.cd > 0) return;
    const v = P.vehicle, f = v.fwd(), sg = Math.sign(v.speed);
    for (const j of this.list) {
      const d = Math.hypot(v.x - j.x, v.z - j.z);
      if (d > j.r + 1 || d < j.r - 2.5) continue;
      // কোন রাস্তা দিয়ে ঢুকছেন: যার বাইরের দিক গাড়ির চলার উল্টো
      let best = null, bd = 0.3;
      for (const l of j.links) { const dot = -(l.o.x * f.x + l.o.z * f.z) * sg; if (dot > bd) { bd = dot; best = l; } }
      const rx = v.x - j.x, rz = v.z - j.z;
      if (!best || rx * best.o.x + rz * best.o.z < 0) continue; // বের হচ্ছেন, ঢুকছেন না
      if (this.groupState(j, best.grp) === 'r') {
        this.cd = 6;
        g.law.offense('redlight', v.x, v.z);
        g.ui.toast('লাল বাতিতে মোড় পার হলেন!', 'bad');
      }
      return;
    }
  }
  // ম্যাপে চিহ্ন
  markers() { return this.list.map((j) => ({ x: j.x, z: j.z, color: '#2e7d32', label: '🚦', r: 5, noClamp: false })); }
}
