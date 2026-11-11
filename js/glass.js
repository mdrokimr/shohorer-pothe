// দোকান/অফিসের সামনের কাচ: গাড়ির ধাক্কা, গুলি বা বিস্ফোরণে ভেঙে ঝরে পড়ে, কিছুক্ষণ পরে আবার লাগানো হয়
// সব কাচ দুটো InstancedMesh-এ (আস্ত আর ভাঙা ফ্রেম), টুকরোগুলো আরেকটায়: অনেক কাচ হলেও ড্র-কল কম
import * as THREE from 'three';
import { canvasTex } from './lib3d.js';

const CELL = 16;
const MAX_SHARDS = 220;
const REPAIR = 240; // সেকেন্ড পরে নতুন কাচ (খেলোয়াড় দূরে থাকলে)

// কাচের ছবি: ধূসর অ্যালুমিনিয়ামের ফ্রেম, ভিতরে হালকা নীলচে স্বচ্ছ, তির্যক ঝিলিক
function paneTex(broken) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (!broken) {
      g.fillStyle = 'rgba(150,190,205,0.30)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      for (const [x, s] of [[40, 34], [96, 12], [170, 26]]) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + s, h); g.lineTo(x + s + 90, 0); g.lineTo(x + 90, 0); g.fill(); }
    } else {
      // কিনারায় খাঁজকাটা কাচের টুকরো লেগে থাকে, মাঝখান ফাঁকা; ফাটলের দাগ
      g.fillStyle = 'rgba(165,205,215,0.55)';
      const edge = (x0, y0, x1, y1, ox, oy) => {
        g.beginPath(); g.moveTo(x0, y0);
        const n = 7;
        for (let i = 1; i < n; i++) {
          const t = i / n, d = 10 + Math.random() * 46;
          g.lineTo(x0 + (x1 - x0) * t + ox * d, y0 + (y1 - y0) * t + oy * d);
        }
        g.lineTo(x1, y1); g.closePath(); g.fill();
      };
      edge(0, 0, w, 0, 0, 1); edge(w, 0, w, h, -1, 0); edge(w, h, 0, h, 0, -1); edge(0, h, 0, 0, 1, 0);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        const sx = Math.random() < 0.5 ? (Math.random() < 0.5 ? 6 : w - 6) : Math.random() * w;
        const sy = sx === 6 || sx === w - 6 ? Math.random() * h : (Math.random() < 0.5 ? 6 : h - 6);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (w / 2 - sx) * 0.25 + (Math.random() - 0.5) * 30, sy + (h / 2 - sy) * 0.25 + (Math.random() - 0.5) * 30); g.stroke();
      }
    }
    g.strokeStyle = '#8d9499'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = '#5d6469'; g.lineWidth = 2; g.strokeRect(12, 12, w - 24, h - 24);
  });
}

export class Glass {
  constructor() {
    this.panes = [];
    this.grid = new Map();
    this.shards = [];
  }
  // x,z = কাচের মাঝখান (মাটিতে), nx,nz = বাইরের দিক, w চওড়া, h উঁচু, y0 নিচের কিনারা
  add(x, z, nx, nz, w, h, y0 = 0.05, kind = 'shop') {
    const p = { i: this.panes.length, x, z, nx, nz, tx: nz, tz: -nx, w, h, y0, kind, broken: false, t: 0 };
    this.panes.push(p);
    const k0 = Math.floor((x - w / 2) / CELL), k1 = Math.floor((x + w / 2) / CELL), j0 = Math.floor((z - w / 2) / CELL), j1 = Math.floor((z + w / 2) / CELL);
    for (let a = k0; a <= k1; a++) for (let b = j0; b <= j1; b++) {
      const key = a + ',' + b;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(p);
    }
    return p;
  }
  build(scene) {
    const n = this.panes.length;
    if (!n) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mk = (broken) => new THREE.MeshPhongMaterial({
      map: paneTex(broken), transparent: true, depthWrite: false, side: THREE.DoubleSide,
      color: 0xffffff, specular: 0x58666c, shininess: broken ? 16 : 40, // ঝিলিক কম: রোদের কোণে পুরো সামনেটা সাদা চকচক করত
    });
    this.whole = new THREE.InstancedMesh(geo, mk(false), n);
    this.cracked = new THREE.InstancedMesh(geo, mk(true), n);
    for (const m of [this.whole, this.cracked]) { m.userData.noShadow = true; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); }
    for (const p of this.panes) this.setPane(p);
    // ঝরে পড়া টুকরো
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.08, 0.02, 0, -0.01, 0.11, 0], 3));
    sg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    this.shardMesh = new THREE.InstancedMesh(sg, new THREE.MeshPhongMaterial({ color: 0xcfe6ee, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), MAX_SHARDS);
    this.shardMesh.count = 0; this.shardMesh.frustumCulled = false; this.shardMesh.userData.noShadow = true;
    scene.add(this.shardMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  mat(p, on) {
    const m = this._m || (this._m = new THREE.Matrix4());
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(p.nx, p.nz), 0));
    return m.compose(new THREE.Vector3(p.x, p.y0 + p.h / 2, p.z), q, on ? new THREE.Vector3(p.w, p.h, 1) : new THREE.Vector3(0, 0, 0));
  }
  setPane(p) {
    if (!this.whole) return;
    this.whole.setMatrixAt(p.i, this.mat(p, !p.broken));
    this.cracked.setMatrixAt(p.i, this.mat(p, p.broken));
    this.whole.instanceMatrix.needsUpdate = true; this.cracked.instanceMatrix.needsUpdate = true;
  }
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }
  // বিন্দু থেকে কাচের রেখার দূরত্ব (উপর থেকে)
  dist(p, x, z) {
    const rx = x - p.x, rz = z - p.z;
    const a = Math.max(-p.w / 2, Math.min(p.w / 2, rx * p.tx + rz * p.tz));
    return Math.hypot(rx - a * p.tx, rz - a * p.tz);
  }
  // ভাঙা: dx,dz = ধাক্কা/গুলির দিক (টুকরো সেদিকে ছিটকায়)
  smash(p, dx, dz, power, g, byPlayer) {
    if (p.broken) return false;
    p.broken = true; p.t = 0;
    this.setPane(p);
    const into = Math.sign(dx * -p.nx + dz * -p.nz) || 1; // ভিতরের দিকে ঠেলা হলে টুকরো ভিতরে বেশি
    const cnt = Math.min(40, Math.round(p.w * p.h * 9));
    for (let k = 0; k < cnt; k++) {
      const a = (Math.random() - 0.5) * p.w, y = p.y0 + Math.random() * p.h;
      const out = (Math.random() < 0.7 ? -into : into) * (0.4 + Math.random() * 1.6) * (0.5 + power * 0.5);
      this.spawn(p.x + a * p.tx, y, p.z + a * p.tz,
        -p.nx * out * -1 + dx * power * 0.6 + (Math.random() - 0.5), Math.random() * 1.8, -p.nz * out * -1 + dz * power * 0.6 + (Math.random() - 0.5));
    }
    if (g) {
      const d = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z);
      const v = Math.max(0.08, 1 - d / 70);
      if (g.sound && !g.sound.sfx('glass', 0.7 * v, 0.9 + Math.random() * 0.2)) {
        // কাচ ভাঙার শব্দ: তীক্ষ্ণ ঝনঝন + ছোট ছোট টুকরোর টুং
        g.sound.noise(0.5, 0.35 * v, 'highpass', 5200, 2600, 0.8);
        for (let i = 0; i < 6; i++) g.sound.tone('sine', 2600 + Math.random() * 3200, 0.08, 0.05 * v, null, 0.05 + Math.random() * 0.45);
      }
      if (byPlayer && g.law && !(this.lawCd > 0)) { this.lawCd = 4; g.law.offense('glass', p.x, p.z); }
      if (g.traffic && g.traffic.panic) g.traffic.panic(p.x, p.z, 10, g);
    }
    return true;
  }
  spawn(x, y, z, vx, vy, vz) {
    if (this.shards.length >= MAX_SHARDS) this.shards.shift();
    this.shards.push({ x, y, z, vx, vy, vz, rx: Math.random() * 6, ry: Math.random() * 6, w: (Math.random() - 0.5) * 18, s: 0.6 + Math.random() * 0.9, life: 25 + Math.random() * 10, rest: false });
  }
  // গাড়ির ধাক্কা: গাড়ির বৃত্তগুলো কাচের কাছে এলে আর যথেষ্ট জোরে চললে ভাঙে
  impact(v, g) {
    const sp = Math.abs(v.speed);
    if (sp < 2.2 || !this.panes.length) return 0;
    let n = 0;
    const f = v.fwd(), sg = Math.sign(v.speed) || 1;
    for (const c of v.circles()) {
      for (const p of this.near(c.x, c.z)) {
        if (p.broken) continue;
        if (this.dist(p, c.x, c.z) < c.r + 0.25) { if (this.smash(p, f.x * sg, f.z * sg, Math.min(2, sp / 6), g, g && v === g.player.vehicle)) n++; }
      }
    }
    if (n) { v.speed *= 0.85; v.damage(1.5 * n); }
    return n;
  }
  // গুলির পথ (o থেকে d দিকে maxT পর্যন্ত): প্রথম যে কাচে লাগে সেটা ভাঙে, গুলি থামে না
  shoot(o, d, maxT, g, byPlayer) {
    if (!this.panes.length) return null;
    const seen = new Set();
    let best = null, bt = maxT;
    const steps = Math.ceil(maxT / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxT, s * CELL * 0.5);
      for (const p of this.near(o.x + d.x * t, o.z + d.z * t)) {
        if (seen.has(p) || p.broken) continue;
        seen.add(p);
        const den = d.x * p.nx + d.z * p.nz;
        if (Math.abs(den) < 1e-4) continue;
        const tt = ((p.x - o.x) * p.nx + (p.z - o.z) * p.nz) / den;
        if (tt <= 0.05 || tt >= bt) continue;
        const hx = o.x + d.x * tt, hz = o.z + d.z * tt, hy = o.y + d.y * tt;
        const a = (hx - p.x) * p.tx + (hz - p.z) * p.tz;
        if (Math.abs(a) > p.w / 2 || hy < p.y0 || hy > p.y0 + p.h) continue;
        best = p; bt = tt;
      }
    }
    if (best) this.smash(best, d.x, d.z, 0.6, g, byPlayer);
    return best ? { t: bt, pane: best } : null;
  }
  // বিস্ফোরণ: আশেপাশের সব কাচ
  blast(x, z, R, g) {
    for (const p of this.panes) if (!p.broken && Math.hypot(p.x - x, p.z - z) < R) {
      const dx = p.x - x, dz = p.z - z, L = Math.hypot(dx, dz) || 1;
      this.smash(p, dx / L, dz / L, 1.6, g, false);
    }
  }
  update(dt, px, pz) {
    if (this.lawCd > 0) this.lawCd -= dt;
    // মেরামত: অনেকক্ষণ পরে, খেলোয়াড় দূরে থাকলে
    if (this.panes.length) {
      this._k = ((this._k || 0) + 1) % 30;
      if (!this._k) for (const p of this.panes) {
        if (!p.broken) continue;
        p.t += dt * 30;
        if (p.t > REPAIR && Math.hypot(p.x - px, p.z - pz) > 60) { p.broken = false; this.setPane(p); }
      }
    }
    if (!this.shardMesh) return;
    const S = this.shards, m = this._m;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i];
      s.life -= dt;
      if (s.life <= 0) { S.splice(i, 1); continue; }
      if (!s.rest) {
        s.vy -= 14 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        s.rx += s.w * dt; s.ry += s.w * 0.7 * dt;
        if (s.y <= 0.03) {
          s.y = 0.03;
          if (Math.abs(s.vy) > 1.5) { s.vy *= -0.25; s.vx *= 0.5; s.vz *= 0.5; s.w *= 0.5; }
          else { s.rest = true; s.rx = -Math.PI / 2; s.ry = Math.random() * 6; }
        }
      }
    }
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const sc = s.s * Math.min(1, s.life / 3);
      this._e.set(s.rx, s.ry, 0, s.rest ? 'XZY' : 'XYZ');
      this._q.setFromEuler(this._e);
      m.compose(this._v.set(s.x, s.y, s.z), this._q, this._s.set(sc, sc, sc));
      this.shardMesh.setMatrixAt(i, m);
    }
    this.shardMesh.count = S.length;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }
}
