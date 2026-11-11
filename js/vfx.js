// ধোঁয়া, আগুন, বিস্ফোরণ, পোড়া দাগ আর বৃষ্টি: একই কণার ভাণ্ডার থেকে
import * as THREE from 'three';
import { rand } from './utils.js';

const GEO = new THREE.IcosahedronGeometry(1, 0);
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const DISC = new THREE.CircleGeometry(1, 16);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 8, 6);
const SCORCH = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const BLOOD_DECAL = new THREE.MeshBasicMaterial({ color: 0x4a0808, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
const MAX = 220;

const KINDS = {
  smoke: { life: 2.4, s0: 0.35, s1: 1.7, o0: 0.5, vy: 1.5, spread: 0.4 },
  dark: { life: 2.8, s0: 0.45, s1: 2.2, o0: 0.65, vy: 1.8, spread: 0.5 },
  fire: { life: 0.7, s0: 0.55, s1: 0.12, o0: 0.95, vy: 2.6, spread: 0.6, add: true },
  blast: { life: 0.5, s0: 0.8, s1: 6.5, o0: 1, vy: 0.5, spread: 0, add: true },
  debris: { life: 1.6, s0: 0.22, s1: 0.18, o0: 1, vy: 7, spread: 6, grav: true, cube: true },
  blood: { life: 1.05, s0: 0.07, s1: 0.025, o0: 0.98, vy: 3.2, spread: 2.2, grav: true },
  splash: { life: 0.25, s0: 0.05, s1: 0.18, o0: 0.5, vy: 0.6, spread: 0.3 },
  spray: { life: 0.7, s0: 0.11, s1: 0.06, o0: 0.75, vy: 3.2, spread: 1.4, grav: true }, // জমা পানিতে চাকার ছিটা
  muzzle: { life: 0.05, s0: 0.22, s1: 0.02, o0: 1, vy: 0.2, spread: 0.05, add: true },
};

export class Vfx {
  constructor(scene) {
    this.scene = scene;
    this.pool = { sph: [], cube: [] };
    this.live = [];
    this.scorch = [];
    this.pools = []; // রক্তের গুচ্ছ (blood pool decals)
    this.fx = []; // মাজল ফ্ল্যাশ / ট্রেসার
    // বিস্ফোরণের ঝলকানি: একটাই আলো আগে থেকে রাখা (পরে যোগ করলে সব শেডার নতুন করে বানাতে হয়)
    this.light = new THREE.PointLight(0xff9a40, 0, 45, 1.4);
    this.light.position.set(0, -50, 0);
    scene.add(this.light);
    this.lightT = 0;
  }
  take(cube) {
    const pool = cube ? this.pool.cube : this.pool.sph;
    let m = pool.pop();
    if (!m) {
      m = new THREE.Mesh(cube ? CUBE : GEO, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.userData.noShadow = true;
      m.userData.cube = cube;
    }
    this.scene.add(m);
    return m;
  }
  emit(kind, x, y, z, color, opts = {}) {
    if (this.live.length >= MAX) return;
    const K = KINDS[kind];
    const m = this.take(!!K.cube);
    m.material.color.setHex(color);
    m.material.blending = K.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.position.set(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2));
    m.rotation.set(rand(0, 6), rand(0, 6), 0);
    const sc = opts.scale || 1;
    this.live.push({
      m, K, t: 0, life: K.life * rand(0.8, 1.2), sc,
      vx: rand(-K.spread, K.spread) + (opts.vx || 0), vz: rand(-K.spread, K.spread) + (opts.vz || 0),
      vy: K.vy * rand(0.7, 1.3) * (K.grav ? sc : 1), c0: color, c1: opts.c1,
    });
  }
  // এক জায়গা থেকে বিস্ফোরণ
  explode(x, y, z) {
    this.emit('blast', x, y + 0.8, z, 0xffc060);
    this.emit('blast', x, y + 1.2, z, 0xff6a20, { scale: 0.8 });
    for (let i = 0; i < 14; i++) this.emit('fire', x + rand(-1.5, 1.5), y + rand(0.3, 1.8), z + rand(-1.5, 1.5), 0xffa030, { scale: 2.2, c1: 0xff3010 });
    for (let i = 0; i < 10; i++) this.emit('debris', x, y + 1, z, i % 3 ? 0x1c1c1c : 0x6a6a6a);
    for (let i = 0; i < 8; i++) this.emit('dark', x + rand(-1, 1), y + 1.5, z + rand(-1, 1), 0x202020, { scale: 1.6 });
    this.light.position.set(x, y + 3, z);
    this.lightT = 0.6;
    this.burnMark(x, z, 3.2);
  }
  burnMark(x, z, r) {
    const m = new THREE.Mesh(DISC, SCORCH);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, (this.world ? this.world.decalY(x, z) : 0.09) + (this.scorch.length % 20) * 0.002, z);
    m.scale.setScalar(r);
    m.userData.noShadow = true;
    this.scene.add(m);
    this.scorch.push(m);
    if (this.scorch.length > 12) this.scene.remove(this.scorch.shift());
  }
  // গুলি/ঘুষিতে রক্তের ছিটা (GTA V-স্টাইল স্প্ল্যাটার)
  bloodHit(x, y, z, dir = null, n = 8) {
    const dx = dir ? dir.x : 0, dz = dir ? dir.z : 0;
    for (let i = 0; i < n; i++) {
      this.emit('blood', x, y, z, i % 3 ? 0x7a0a0a : 0x4a0606, {
        scale: rand(0.7, 1.4),
        vx: dx * rand(1.2, 3.5) + rand(-1.2, 1.2),
        vz: dz * rand(1.2, 3.5) + rand(-1.2, 1.2),
      });
    }
  }
  // মৃত্যুতে মাটির নিচে রক্ত জমা (ধীরে বড় হয়)
  bloodPool(x, z, size = 0.9) {
    const m = new THREE.Mesh(DISC, BLOOD_DECAL.clone());
    m.rotation.x = -Math.PI / 2;
    const y = (this.world ? this.world.decalY(x, z) : 0.09) + (this.pools.length % 24) * 0.002;
    m.position.set(x + rand(-0.15, 0.15), y, z + rand(-0.15, 0.15));
    m.scale.setScalar(0.12);
    m.userData.noShadow = true;
    m.userData.size = size;
    this.scene.add(m);
    this.pools.push(m);
    if (this.pools.length > 48) this.removePool(this.pools[0]);
    return m;
  }
  removePool(m) {
    if (!m) return;
    this.scene.remove(m);
    if (m.material && m.material !== BLOOD_DECAL) m.material.dispose?.();
    const i = this.pools.indexOf(m);
    if (i >= 0) this.pools.splice(i, 1);
  }
  // নলের মুখে উজ্জ্বল মাজল ফ্ল্যাশ
  muzzleFlash(x, y, z) {
    const m = new THREE.Mesh(SPH, FLASH_MAT);
    m.scale.setScalar(0.16);
    m.position.set(x, y, z);
    m.userData.noShadow = true;
    this.scene.add(m);
    this.fx.push({ m, life: 0.045, grow: 2.8 });
    this.emit('muzzle', x, y, z, 0xfff2a8, { scale: 1.1 });
    this.emit('muzzle', x, y, z, 0xff9020, { scale: 0.55 });
    this.light.position.set(x, y, z);
    this.lightT = Math.max(this.lightT, 0.07);
  }
  // বাতাসে হালকা বুলেট ট্রেসার
  bulletTracer(a, b) {
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (L < 0.4) return;
    const m = new THREE.Mesh(BOX, TRACER_MAT.clone());
    m.scale.set(0.012, 0.012, Math.min(L, 18));
    const t = Math.min(0.55, 9 / L); // শুধু নলের কাছের অংশ দেখায় (GTA-স্টাইল সূক্ষ্ম)
    m.position.set(a.x + (b.x - a.x) * t * 0.5, a.y + (b.y - a.y) * t * 0.5, a.z + (b.z - a.z) * t * 0.5);
    m.lookAt(b.x, b.y, b.z);
    m.userData.noShadow = true;
    this.scene.add(m);
    this.fx.push({ m, life: 0.055, fade: true, disposeMat: true });
  }
  update(dt) {
    const col = new THREE.Color(), c1 = new THREE.Color();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const u = p.t / p.life;
      if (u >= 1) {
        this.scene.remove(p.m);
        (p.m.userData.cube ? this.pool.cube : this.pool.sph).push(p.m);
        this.live.splice(i, 1);
        continue;
      }
      const K = p.K;
      if (K.grav) {
        p.vy -= 16 * dt;
        if (p.m.position.y < 0.1 && p.vy < 0) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
        p.m.rotation.x += dt * 6;
      } else { p.vx *= 1 - dt * 0.8; p.vz *= 1 - dt * 0.8; }
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar((K.s0 + (K.s1 - K.s0) * (K.grav ? 0 : Math.sqrt(u))) * p.sc);
      p.m.material.opacity = K.o0 * (1 - u) * (K.grav ? 1 : Math.min(1, u * 8 + 0.2));
      if (p.c1 !== undefined) { col.setHex(p.c0); c1.setHex(p.c1); p.m.material.color.copy(col.lerp(c1, u)); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.grow) f.m.scale.multiplyScalar(1 + f.grow * dt);
      if (f.fade) f.m.material.opacity = Math.max(0, f.m.material.opacity - dt * 12);
      if (f.life <= 0) { this.scene.remove(f.m); if (f.disposeMat) f.m.material.dispose(); this.fx.splice(i, 1); }
    }
    for (const m of this.pools) {
      const s = m.scale.x, want = m.userData.size;
      if (s < want) m.scale.setScalar(Math.min(want, s + dt * 0.55));
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightT / 0.6) * 500;
    } else if (this.fireLight > 0) {
      this.light.intensity = this.fireLight * (40 + Math.random() * 30);
    } else this.light.intensity = 0;
  }
}

// বৃষ্টি: ক্যামেরার চারপাশে পড়তে থাকা দাগ
export class Rain {
  constructor(scene, n = 1400) {
    this.n = n;
    this.pos = new Float32Array(n * 6);
    this.drops = [];
    for (let i = 0; i < n; i++) this.drops.push({ x: rand(-30, 30), y: rand(0, 22), z: rand(-30, 30), v: rand(16, 22) });
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    g.setAttribute('position', this.attr);
    this.mat = new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(dt, cam, level) {
    this.mat.opacity = level * 0.55;
    this.mesh.visible = level > 0.02;
    if (!this.mesh.visible) return;
    const cx = cam.x, cy = cam.y, cz = cam.z, P = this.pos;
    const active = Math.floor(this.n * level);
    for (let i = 0; i < this.n; i++) {
      const d = this.drops[i], k = i * 6;
      if (i >= active) { P[k] = P[k + 3] = cx; P[k + 1] = P[k + 4] = -10; P[k + 2] = P[k + 5] = cz; continue; }
      d.y -= d.v * dt;
      if (d.y < cy - 8 || d.y < 0) { d.y = cy + rand(8, 18); d.x = cx + rand(-30, 30); d.z = cz + rand(-30, 30); }
      // ক্যামেরা অনেক দূরে সরে গেলে কাছে আনা
      if (Math.abs(d.x - cx) > 32) d.x = cx + rand(-30, 30);
      if (Math.abs(d.z - cz) > 32) d.z = cz + rand(-30, 30);
      P[k] = d.x; P[k + 1] = d.y; P[k + 2] = d.z;
      P[k + 3] = d.x + 0.15; P[k + 4] = d.y + 0.7; P[k + 5] = d.z + 0.08;
    }
    this.attr.needsUpdate = true;
  }
}
