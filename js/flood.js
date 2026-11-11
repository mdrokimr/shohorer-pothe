// বৃষ্টি আর জলাবদ্ধতা: ঢাকার মতো, জোরে বৃষ্টি নামলে নিচু রাস্তায় পানি জমে (বৃষ্টি থামলে আস্তে আস্তে নামে)
// পানিতে গাড়ি আস্তে চলে, চাকা থেকে ছিটা ওঠে, জোরে ঢুকলে ইঞ্জিন বন্ধ হয়ে যেতে পারে; ফুটপাতের মানুষের হাতে ছাতা
import * as THREE from 'three';
import { canvasTex } from './lib3d.js';
import { rand, pick, clamp } from './utils.js';

const MOBILE = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
// যেগুলো পানিতে সহজে বন্ধ হয় না (উঁচু চাকা বা প্যাডেল)
const HIGH = new Set(['bus', 'truck', 'rickshaw', 'van', 'pickup']);
const SLOW = { bike: 0.68, cng: 0.62, autorickshaw: 0.6, easybike: 0.6, car: 0.55, police: 0.5, ambulance: 0.5, leguna: 0.5, bus: 0.32, truck: 0.3, pickup: 0.4, rickshaw: 0.3, van: 0.3 };

function edgeTex() {
  // কিনারা নরম: আয়তক্ষেত্র না দেখিয়ে ছড়ানো ডোবার মতো
  return canvasTex(128, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.62, '#fff'); g.addColorStop(1, '#000');
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.save(); c.scale(1, h / w); c.fillStyle = g; c.fillRect(0, 0, w, w); c.restore();
  });
}
function rippleTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7a7058'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() * 16;
      c.strokeStyle = `rgba(220,215,200,${0.1 + Math.random() * 0.25})`; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); c.stroke();
    }
  }, true);
}
let UMB = null;
function umbrellaParts() {
  if (UMB) return UMB;
  UMB = {
    cap: new THREE.ConeGeometry(0.58, 0.28, 8, 1, true),
    pole: new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5),
    mats: [0x111111, 0x1a237e, 0x6d1b2b, 0x263238, 0x1b5e20, 0x4a148c].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })),
    poleMat: new THREE.MeshLambertMaterial({ color: 0x8d8d8d }),
  };
  return UMB;
}

export class Flood {
  constructor(g) {
    this.g = g; this.spots = []; this.t = 0; this.wasRain = false; this.umbs = new Set();
    try { this.place(); } catch (e) { console.warn('flood', e); }
  }
  place() {
    const g = this.g, M = g.map;
    const edge = edgeTex(), rip = rippleTex();
    rip.wrapS = rip.wrapT = THREE.RepeatWrapping;
    this.rip = rip;
    const max = MOBILE ? 7 : 10;
    // স্থির এলোমেলো (প্রতিবার একই রাস্তায় পানি জমে, আসল শহরের মতো)
    let seed = 7;
    const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const segs = M.segments.filter((s) => s.len > 46 && s.width >= 5 && !s.bridge && !s.elevated).sort((a, b) => (a.id * 7919 % 1009) - (b.id * 7919 % 1009));
    const sp = M.spawn;
    for (const s of segs) {
      if (this.spots.length >= max) break;
      const t = 20 + R() * (s.len - 40);
      const cx = s.ax + s.dir.x * t, cz = s.az + s.dir.z * t;
      if (this.spots.some((q) => Math.hypot(q.x - cx, q.z - cz) < 150)) continue;
      if (Math.hypot(cx - sp.x, cz - sp.z) < 40) continue; // শুরুর জায়গায় না
      if (g.world.isWater && g.world.isWater(cx, cz)) continue;
      const L = Math.min(34, s.len - 24, 16 + R() * 18), Wd = s.width + 0.2;
      const mat = new (THREE.MeshStandardMaterial || THREE.MeshLambertMaterial)({ color: 0x8a8068, map: rip, alphaMap: edge, transparent: true, opacity: 0, roughness: 0.08, metalness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, Wd), mat);
      mesh.rotation.x = -Math.PI / 2;
      const grp = new THREE.Group();
      grp.position.set(cx, 0.08, cz);
      grp.rotation.y = Math.atan2(-s.dir.z, s.dir.x);
      grp.add(mesh);
      mesh.userData.noShadow = true; mesh.receiveShadow = false; mesh.renderOrder = 2;
      grp.visible = false;
      g.scene.add(grp);
      this.spots.push({ s, x: cx, z: cz, L, W: Wd, dx: s.dir.x, dz: s.dir.z, grp, mat, level: 0, deep: 0.55 + R() * 0.45, named: s.name });
    }
  }
  // এই জায়গায় পানি কত গভীর (০-১)
  depthAt(x, z) {
    for (const p of this.spots) {
      if (p.level < 0.02) continue;
      const rx = x - p.x, rz = z - p.z;
      const a = rx * p.dx + rz * p.dz, b = rx * p.dz - rz * p.dx;
      const ea = 1 - Math.abs(a) / (p.L / 2), eb = 1 - Math.abs(b) / (p.W / 2);
      if (ea <= 0 || eb <= 0) continue;
      return p.level * p.deep * clamp(Math.min(ea * 3.5, eb * 2.5 + 0.35), 0, 1);
    }
    return 0;
  }
  markers() {
    return this.spots.filter((p) => p.level > 0.3).map((p) => ({ x: p.x, z: p.z, color: '#4a6fa5', label: '💧', r: 6, noClamp: true, name: 'পানি জমেছে' }));
  }
  splash(v, n, k) {
    const vfx = this.g.vfx; if (!vfx) return;
    const f = v.fwd ? v.fwd() : { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, back = rand(-0.4, 0.3) * v.spec.len;
      const x = v.x + f.z * side * v.spec.wid * 0.5 + f.x * back, z = v.z - f.x * side * v.spec.wid * 0.5 + f.z * back;
      vfx.emit('spray', x, 0.25, z, 0xc9c2ae, { vx: f.z * side * 2 * k - f.x * v.speed * 0.15, vz: -f.x * side * 2 * k - f.z * v.speed * 0.15, scale: 0.8 + k });
    }
  }
  update(dt) {
    const g = this.g, sky = g.sky, P = g.player;
    if (!sky) return;
    this.t += dt;
    const rain = sky.rain || 0;
    // বৃষ্টি শুরু: জানানো
    if (rain > 0.45 && !this.wasRain) {
      this.wasRain = true;
      g.ui.toast('ঝুম বৃষ্টি নামছে! নিচু রাস্তায় পানি জমবে, রাইডের ভাড়া বেশি', '');
    } else if (rain < 0.15 && this.wasRain) this.wasRain = false;
    // পানি জমা আর নামা
    const fill = rain > 0.4 ? dt * rain / 40 : -dt / 140;
    this.rip.offset.x += dt * 0.02; this.rip.offset.y += dt * 0.013;
    for (const p of this.spots) {
      p.level = clamp(p.level + fill, 0, 1);
      const vis = p.level > 0.02;
      if (vis !== p.grp.visible) p.grp.visible = vis;
      if (!vis) continue;
      p.mat.opacity = Math.min(0.88, p.level * 1.3);
      p.grp.position.y = 0.075 + p.level * p.deep * 0.08;
    }
    // নিজের যানবাহন
    const v = P.state === 'drive' ? P.vehicle : null;
    if (v && !v.spec.air && !v.boat) {
      const d = this.depthAt(v.x, v.z);
      v.wadeLim = d > 0 ? 1 - (SLOW[v.type] ?? 0.5) * d : 1;
      if (v.stall > 0) {
        v.stall -= dt;
        if (v.stall <= 0) g.ui.toast('ইঞ্জিন আবার চালু হলো', 'good');
      }
      const sp = Math.abs(v.speed);
      if (d > 0.08 && sp > 1.5) {
        v._spT = (v._spT || 0) - dt;
        if (v._spT <= 0) { v._spT = 0.06; this.splash(v, Math.min(4, 1 + Math.floor(sp / 5)), d); }
      }
      // জোরে গভীর পানিতে ঢুকলে ইঞ্জিন বন্ধ
      if (!v._inW && d > 0.45 && sp > 8.5 && !HIGH.has(v.type) && !(v.stall > 0)) {
        if (Math.random() < 0.45) { v.stall = rand(3, 5); g.ui.toast('পানিতে জোরে ঢুকে ইঞ্জিন বন্ধ হয়ে গেল! একটু অপেক্ষা করুন', 'bad'); g.sound.thud && g.sound.thud(0.3); }
        else g.ui.toast('সাবধান! পানি জমা রাস্তা, আস্তে চালান', '');
      }
      v._inW = d > 0.2;
    } else if (P.vehicle) { P.vehicle.wadeLim = 1; }
    // রাস্তার গাড়ি: পানিতে আস্তে, ছিটা ওঠে; ফুটপাতে আপনি থাকলে ভিজিয়ে দেয়
    const T = g.traffic;
    if (T) {
      for (const c of T.cars) {
        const cv = c.v;
        if (c.dead) continue;
        if (Math.hypot(cv.x - P.pos.x, cv.z - P.pos.z) > 90) { if (cv.wadeLim < 1) cv.wadeLim = 1; continue; }
        const d = this.depthAt(cv.x, cv.z);
        cv.wadeLim = d > 0 ? 1 - (SLOW[cv.type] ?? 0.5) * d : 1;
        if (d <= 0.05) continue;
        const cap = Math.max(2, (cv.spec.max || 10) * (1 - (SLOW[cv.type] ?? 0.5) * d));
        if (Math.abs(cv.speed) > cap) cv.speed = Math.sign(cv.speed) * (Math.abs(cv.speed) - Math.min(Math.abs(cv.speed) - cap, dt * 6));
        const sp = Math.abs(cv.speed);
        if (sp > 2 && Math.random() < dt * 6) this.splash(cv, 2, d);
        if (P.state === 'foot' && sp > 4.5 && d > 0.2 && Math.hypot(cv.x - P.pos.x, cv.z - P.pos.z) < 3.4 && this.t - (this.wetT || -99) > 12) {
          this.wetT = this.t;
          this.splash(cv, 6, 1);
          g.ui.toast(pick(['গাড়িটা কাদাপানি ছিটিয়ে আপনাকে ভিজিয়ে দিল!', 'ধুর! পুরো জামা কাদায় মাখামাখি!', 'চোখে দেখেন না? পানি ছিটায় চলে গেল!']), 'bad');
        }
      }
    }
    this.umbrellas(rain);
  }
  // বৃষ্টিতে ফুটপাতের অনেকের হাতে ছাতা
  umbrellas(rain) {
    const T = this.g.traffic; if (!T || !T.peds) return;
    const U = umbrellaParts(), P = this.g.player.pos;
    const want = rain > 0.3;
    for (const p of T.peds) {
      if (!p.rig) continue;
      if (p.umbRoll === undefined) p.umbRoll = Math.random();
      const busy = p.react && p.react.mode;
      const on = want && !busy && p.umbRoll < 0.65 && Math.hypot(p.x - P.x, p.z - P.z) < 90;
      if (on && !p.umb) {
        const grp = new THREE.Group();
        const cap = new THREE.Mesh(U.cap, pick(U.mats)); cap.position.y = 2.02; grp.add(cap);
        const pole = new THREE.Mesh(U.pole, U.poleMat); pole.position.y = 1.55; grp.add(pole);
        grp.position.set(0.16, 0, -0.18);
        cap.castShadow = true;
        p.rig.root.add(grp);
        p.umb = grp; this.umbs.add(p);
      } else if (!on && p.umb) {
        if (p.umb.parent) p.umb.parent.remove(p.umb);
        p.umb = null; this.umbs.delete(p);
      }
    }
    // তালিকা থেকে সরে যাওয়া মানুষের ছাতার হিসাব
    if (this.umbs.size > 200) for (const p of this.umbs) if (!T.peds.includes(p)) this.umbs.delete(p);
  }
}
