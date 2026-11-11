// বড় ম্যাপ (M): পুরো এলাকা, জায়গার নাম, টেনে সরানো, চাকা/চিমটি দিয়ে বড়-ছোট, ক্লিক করে মার্ক (GPS পথ)
import { CIVIC_PIN, SHOP_PIN } from './townlife.js';
const GENERIC = /গলি|রাস্তা|সংযোগ|সড়ক \d|Road \d/;

export class BigMap {
  constructor(g) {
    this.g = g;
    this.el = document.getElementById('bigmap');
    this.c = document.getElementById('bigmapCanvas');
    this.ctx = this.c.getContext('2d');
    this.open = false;
    this.zoom = 1;
    this.cx = 0; this.cz = 0;
    this.labels = this.roadLabels();
    this.bind();
  }
  // বড় রাস্তার নাম কোথায় লেখা হবে: নাম অনুযায়ী সবচেয়ে লম্বা অংশগুলোর মাঝখানে
  roadLabels() {
    const by = new Map();
    for (const s of this.g.map.segments) {
      if (!s.name || GENERIC.test(s.name) || s.len < 25) continue;
      if (!by.has(s.name)) by.set(s.name, []);
      by.get(s.name).push(s);
    }
    const out = [];
    for (const [name, segs] of by) {
      const total = segs.reduce((a, s) => a + s.len, 0);
      if (total < 120 && !segs.some((s) => s.main)) continue;
      segs.sort((a, b) => b.len - a.len);
      const picked = [];
      for (const s of segs) {
        const x = (s.ax + s.bx) / 2, z = (s.az + s.bz) / 2;
        if (picked.some((p) => Math.hypot(p.x - x, p.z - z) < 260)) continue;
        let a = Math.atan2(s.dir.z, s.dir.x);
        if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI; // উল্টো লেখা নয়
        picked.push({ x, z, a, name, main: s.main });
        if (picked.length >= 3) break;
      }
      out.push(...picked);
    }
    return out;
  }
  // পর্দার পিক্সেল ↔ দুনিয়া
  scale() { return this.zoom * Math.min(this.W / this.g.minimap.w, this.H / this.g.minimap.h) * 0.95; }
  toScreen(x, z) { const s = this.scale(); return { x: this.W / 2 + (x - this.cx) * s, y: this.H / 2 + (z - this.cz) * s }; }
  toWorld(px, py) { const s = this.scale(); return { x: this.cx + (px - this.W / 2) / s, z: this.cz + (py - this.H / 2) / s }; }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  show() {
    const P = this.g.player.pos;
    this.open = true;
    this.el.classList.remove('hidden');
    this.resize();
    this.zoom = Math.max(this.zoom, 2.2);
    this.cx = P.x; this.cz = P.z;
    this.clamp();
    this.draw();
  }
  hide() {
    this.open = false;
    this.el.classList.add('hidden');
  }
  clamp() {
    const B = this.g.map.bounds;
    this.zoom = Math.min(14, Math.max(0.9, this.zoom));
    this.cx = Math.min(B.x1, Math.max(B.x0, this.cx));
    this.cz = Math.min(B.z1, Math.max(B.z0, this.cz));
  }
  zoomAt(px, py, k) {
    const before = this.toWorld(px, py);
    this.zoom *= k;
    this.clamp();
    const after = this.toWorld(px, py);
    this.cx += before.x - after.x; this.cz += before.z - after.z;
    this.clamp();
    this.draw();
  }
  // ক্লিক/ছোঁয়া: মার্ক বসানো, মার্কের উপর আবার ক্লিক করলে মুছে যায়
  tap(px, py) {
    const g = this.g;
    if (g.mark) {
      const m = this.toScreen(g.mark.x, g.mark.z);
      if (Math.hypot(m.x - px, m.y - py) < 18) { g.setMark(null); this.draw(); return; }
    }
    const w = this.toWorld(px, py);
    g.setMark(w.x, w.z);
    this.draw();
  }
  bind() {
    const c = this.c;
    const pts = new Map();
    let drag = null, moved = 0, pinch = null;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pts.size === 1) { drag = { x: e.offsetX, y: e.offsetY }; moved = 0; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom };
        drag = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const want = pinch.z * d / Math.max(1, pinch.d);
        this.zoomAt(mx, my, want / this.zoom);
        moved = 99;
        return;
      }
      if (!drag) return;
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const s = this.scale();
      this.cx -= dx / s; this.cz -= dy / s;
      drag = { x: e.offsetX, y: e.offsetY };
      this.clamp();
      this.draw();
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && pts.size === 0 && moved < 8) this.tap(e.offsetX, e.offsetY);
      if (pts.size === 0) drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); drag = null; pinch = null; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.18 : 1 / 1.18); }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    const $ = (id) => document.getElementById(id);
    $('bmClose').onclick = () => this.g.toggleMap(false);
    $('bmIn').onclick = () => this.zoomAt(this.W / 2, this.H / 2, 1.4);
    $('bmOut').onclick = () => this.zoomAt(this.W / 2, this.H / 2, 1 / 1.4);
    $('bmMe').onclick = () => { const P = this.g.player.pos; this.cx = P.x; this.cz = P.z; this.draw(); };
    $('bmClear').onclick = () => { this.g.setMark(null); this.draw(); };
    window.addEventListener('resize', () => { if (this.open) { this.resize(); this.draw(); } });
  }

  draw() {
    if (!this.open) return;
    const g = this.g, ctx = this.ctx, W = this.W, H = this.H, B = g.map.bounds, s = this.scale();
    ctx.fillStyle = '#7f8a66';
    ctx.fillRect(0, 0, W, H);
    const o = this.toScreen(B.x0, B.z0);
    ctx.imageSmoothingEnabled = s < 3;
    ctx.drawImage(g.minimap.off, o.x, o.y, g.minimap.w * s, g.minimap.h * s);
    // GPS পথ
    if (g.route && g.route.length > 1) {
      ctx.strokeStyle = '#7b2cff';
      ctx.lineWidth = Math.max(3, 5 * Math.min(1, s));
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      g.route.forEach((p, i) => { const q = this.toScreen(p.x, p.z); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    }
    // রাস্তার নাম
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s > 0.9) {
      for (const L of this.labels) {
        if (!L.main && s < 1.6) continue;
        const q = this.toScreen(L.x, L.z);
        if (q.x < -100 || q.x > W + 100 || q.y < -20 || q.y > H + 20) continue;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(L.a);
        ctx.font = `${L.main ? 700 : 600} ${L.main ? 13 : 11.5}px "Hind Siliguri", sans-serif`;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(L.name, 0, 0);
        ctx.fillStyle = '#3a3226';
        ctx.fillText(L.name, 0, 0);
        ctx.restore();
      }
    }
    const pin = (x, z, color, label, name, r = 9) => {
      const q = this.toScreen(x, z);
      if (q.x < -40 || q.x > W + 40 || q.y < -40 || q.y > H + 40) return;
      ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (label) { ctx.fillStyle = '#fff'; ctx.font = `700 ${r > 8 ? 12 : 10}px "Hind Siliguri", sans-serif`; ctx.fillText(label, q.x, q.y + 1); }
      if (name) {
        ctx.font = '600 12px "Hind Siliguri", sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(name, q.x, q.y - r - 9);
        ctx.fillStyle = '#fff';
        ctx.fillText(name, q.x, q.y - r - 9);
      }
    };
    const pl = g.map.places;
    const named = s > 2.2; // কাছে গেলে দোকানের নাম
    for (const b of pl.restaurants || []) pin(b.door.x, b.door.z, '#e65100', '🍴', named ? b.name : '', 7);
    for (const b of pl.couriers || []) pin(b.door.x, b.door.z, '#6d4c41', 'প', named ? b.name : '', 7);
    for (const gt of g.metro.gateList()) pin(gt.x, gt.z, '#1f7a3d', 'M', named ? `${gt.st.name} মেট্রো` : '', 9);
    for (const p of g.metro.markers()) pin(p.x, p.z, '#1f7a3d', '', '', 5);
    if (pl.thana) pin(pl.thana.door.x, pl.thana.door.z, '#1a3f8a', 'থ', pl.thana.name, 10);
    if (pl.hospital) pin(pl.hospital.door.x, pl.hospital.door.z, '#c62828', '+', pl.hospital.name, 10);
    if (pl.gunshop) pin(pl.gunshop.door.x, pl.gunshop.door.z, '#222', 'অ', 'অস্ত্রের দোকান', 10);
    for (const c of g.buses.counters) pin(c.shel.x, c.shel.z, '#0277bd', '🚌', named ? `${c.name} কাউন্টার` : '', 8);
    for (const s of g.buses.stands) pin(s.x, s.z, '#2e7d32', 'ই', named ? s.name : '', 7);
    // বিমানবন্দর, ঘাট, অফিস
    const E = g.map.extras;
    if (E) {
      pin(E.terminal.x, E.terminal.z, '#455a64', '✈', 'বিমানবন্দর: পাইলটের কাজ', 10);
      for (const gh of E.ghats) pin(gh.booth.x + 5, gh.booth.z, '#0277bd', '⚓', `${gh.name}: নৌকার কাজ`, 9);
    }
    for (const b of pl.offices || []) pin(b.door.x, b.door.z, '#546e7a', 'অ', named ? b.name : '', 8);
    // দোকান (কাছে গেলে), স্কুল-মাদ্রাসা-আদালত-ব্যাংক-অফিস (সবসময়, নাম সহ)
    if (named && g.life) for (const b of g.life.fronts) if (b.kind === 'shop' && b.civic !== 'motor') { const e = b.entry || b.door; pin(e.x, e.z, '#8e24aa', SHOP_PIN[b.shopType] || 'দো', s > 3.2 ? b.name : '', 6); }
    for (const b of g.map.civic || []) {
      const P = CIVIC_PIN[b.civic]; if (!P) continue;
      const e = b.entry || b.door; if (!e) continue;
      pin(e.x, e.z, P[0], P[1], s > 1.1 ? b.name : '', 10);
    }
    // বাড়ি: বিক্রি হবে (৳) আর আপনার বাড়ি (🏠)
    if (g.missions) for (const m of g.missions.markers()) pin(m.x, m.z, m.color, m.label, s > 0.9 ? m.name : '', 10);
    if (g.property) for (const m of g.property.markers()) pin(m.x, m.z, m.color, m.label, s > 1.1 ? m.name : '', 9);
    for (const src of [g.fuel, g.garage, g.flood]) if (src) for (const m of src.markers()) pin(m.x, m.z, m.color, m.label, s > 1.1 ? m.name : '', 9);
    // আপনার যানবাহন
    for (const v of g.vehicles) if (v !== g.player.vehicle && !v.burnt) pin(v.x, v.z, '#00897b', '🚗', '', 7);
    // কাজ
    const a = g.jobs.active;
    if (a) {
      pin(a.from.door.x, a.from.door.z, '#f9a825', 'তো', a.stage === 'pickup' ? 'তোলার জায়গা' : '', 9);
      pin(a.to.door.x, a.to.door.z, '#2e7d32', 'পৌ', a.stage !== 'pickup' ? 'পৌঁছানোর জায়গা' : 'পৌঁছানো', 9);
    }
    // পুলিশ: খোঁজার এলাকা আর গাড়ি
    const L = g.law;
    if (L.stars > 0 && L.search) {
      const q = this.toScreen(L.search.x, L.search.z);
      ctx.fillStyle = 'rgba(255,48,48,0.14)'; ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, L.searchR * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const u of L.units) if (u.mode === 'chase') pin(u.v.x, u.v.z, '#2a5bff', '', '', 5);
    for (const c of g.traffic.cars) if (c.v.type === 'police' && !c.dead) pin(c.v.x, c.v.z, '#2a5bff', '', '', 4);
    for (const c of L.footCops()) pin(c.x, c.z, '#1a3f8a', '', '', 3.5);
    // আপনার মার্ক
    if (g.mark) {
      const q = this.toScreen(g.mark.x, g.mark.z);
      ctx.fillStyle = '#b026ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.bezierCurveTo(q.x - 14, q.y - 16, q.x - 9, q.y - 30, q.x, q.y - 30);
      ctx.bezierCurveTo(q.x + 9, q.y - 30, q.x + 14, q.y - 16, q.x, q.y);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y - 20, 4, 0, Math.PI * 2); ctx.fill();
    }
    // আপনি
    const P = g.player, q = this.toScreen(P.pos.x, P.pos.z);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(-P.yaw);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // দূরত্ব
    const info = document.getElementById('bmInfo');
    if (info) info.textContent = g.mark ? `মার্ক: ${g.meters(Math.hypot(g.mark.x - P.pos.x, g.mark.z - P.pos.z))} দূরে · আবার ক্লিক করলে মুছে যায়` : 'যেখানে যেতে চান সেখানে ক্লিক করুন (ফোনে ছুঁয়ে দিন)';
  }
}
