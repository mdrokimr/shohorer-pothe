// কাচের দোকানের ভিতরের মানুষ: কাছের দোকানে কাউন্টারের পিছনে দোকানদার, সামনে ১-২ জন ক্রেতা (জিনিস দেখে, এদিক-ওদিক সরে)
// শুধু খেলোয়াড়ের কাছের কয়েকটা দোকানে (মোবাইলে কম), দূরে গেলে সরিয়ে ফেলা হয়
import { makeRig, setPose } from './rig.js';
import { pick, rand } from './utils.js';

const MOBILE = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const KEEPER = {
  pharmacy: { shirt: 0xffffff, pants: 0x37474f }, cloth: { shirt: 0x6a1b9a, pants: 0x212121 }, mobile: { shirt: 0x1565c0, pants: 0x212121 },
  sweets: { shirt: 0xffffff, pants: 0x5d4037, cap: 0xffffff }, book: { shirt: 0x8d6e63, pants: 0x3e2723 }, electronics: { shirt: 0x37474f, pants: 0x212121 },
  salon: { shirt: 0xffffff, pants: 0x263238 }, motor: { shirt: 0xffffff, pants: 0x1b1b1b }, rest: { shirt: 0xf5f5f5, pants: 0x3e2723, cap: 0xffffff },
  grocery: { shirt: 0xf5f5f0, pants: 0x1d4f8c, kurta: true },
};
const CUST = [0xc62828, 0x2e7d32, 0x1565c0, 0xf2c230, 0x6a1b9a, 0x37474f, 0x8d6e63, 0xe0157a, 0xffffff];

export class ShopFolk {
  constructor(g) {
    this.g = g; this.active = new Map(); this.t = 0;
    this.slots = (g.world && g.world.shopSlots) || [];
    this.max = MOBILE ? 4 : 9;
    this.R = MOBILE ? 26 : 38;
  }
  spawn(s) {
    const g = this.g, list = [];
    const face = Math.atan2(-s.nx, -s.nz); // রিগের সামনে −z: বাইরের (রাস্তার) দিকে
    const inward = face + Math.PI;
    const at = (o) => ({ x: s.x + s.tx * o, z: s.z + s.tz * o });
    // দোকানদার: দরজার এক পাশে (কাউন্টারের পিছনে), রাস্তার দিকে মুখ
    const ko = s.door ? (s.b.color % 2 ? 1 : -1) * Math.min(s.w / 2 - 0.4, s.door / 2 + 0.55) : 0;
    const k = makeRig({ ...(KEEPER[s.type] || KEEPER.grocery) });
    const kp = at(ko); k.root.position.set(kp.x, 0.16, kp.z); k.root.rotation.y = face; k.root.scale.setScalar(0.96);
    g.scene.add(k.root);
    list.push({ rig: k, o: ko, yaw: face, mode: 'keeper', t: rand(0, 5) });
    // ক্রেতা: ভিতরের তাকের দিকে মুখ, মাঝে মাঝে সরে
    const n = s.w > 3 ? (Math.random() < 0.6 ? 2 : 1) : (Math.random() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const female = Math.random() < 0.4;
      const r = makeRig({ female, skirt: female ? pick([0xc2185b, 0x00897b, 0x5e35b1, 0xef6c00]) : undefined, shirt: pick(CUST), kurta: !female && Math.random() < 0.3 });
      const lim = s.w / 2 - 0.35;
      const o = Math.max(-lim, Math.min(lim, -ko * 0.6 + rand(-0.6, 0.6) + i * 0.7 * (ko > 0 ? -1 : 1)));
      const p = at(o); r.root.position.set(p.x, 0.16, p.z); r.root.rotation.y = inward + rand(-0.5, 0.5); r.root.scale.setScalar(0.95);
      g.scene.add(r.root);
      list.push({ rig: r, o, yaw: r.root.rotation.y, mode: 'cust', t: rand(2, 6), to: o, lim });
    }
    this.active.set(s, list);
  }
  remove(s) {
    for (const p of this.active.get(s) || []) { this.g.scene.remove(p.rig.root); if (p.rig.dispose) p.rig.dispose(); }
    this.active.delete(s);
  }
  update(dt) {
    const g = this.g, P = g.player;
    if (!this.slots.length || !P) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.6;
      const near = this.slots.map((s) => [Math.hypot(s.x - P.pos.x, s.z - P.pos.z), s]).filter((q) => q[0] < this.R).sort((a, b) => a[0] - b[0]).slice(0, this.max).map((q) => q[1]);
      for (const s of [...this.active.keys()]) if (!near.includes(s) || g.inside) this.remove(s);
      if (!g.inside) for (const s of near) if (!this.active.has(s)) this.spawn(s);
      // কাচ ভেঙেছে কিনা (কাছের দোকানগুলোর জন্য, মাঝে মাঝে দেখা)
      const G = g.world.glass;
      for (const s of this.active.keys()) {
        const l = G && G.grid ? (G.grid.get(Math.floor(s.x / 16) + ',' + Math.floor(s.z / 16)) || []) : [];
        s.brk = l.some((q) => q.broken && Math.hypot(q.x - s.x, q.z - s.z) < s.w / 2 + 0.6);
      }
    }
    for (const [s, list] of this.active) {
      const brk = s.brk;
      for (const p of list) {
        p.t -= dt;
        const r = p.rig.root;
        if (brk) { setPose(p.rig, 'surrender', dt, 0); continue; } // কাচ ভাঙলে হাত তুলে ভয়
        if (p.mode === 'cust') {
          if (p.t <= 0) { p.t = rand(3, 8); p.to = Math.max(-p.lim, Math.min(p.lim, p.o + rand(-0.9, 0.9))); }
          const d = p.to - p.o;
          if (Math.abs(d) > 0.03) {
            const st = Math.sign(d) * Math.min(Math.abs(d), dt * 0.7);
            p.o += st;
            r.position.set(s.x + s.tx * p.o, 0.16, s.z + s.tz * p.o);
            setPose(p.rig, 'walk', dt, 0.6);
          } else setPose(p.rig, Math.sin(p.t * 1.7) > 0.85 ? 'phone' : 'idle', dt, 0);
        } else {
          setPose(p.rig, p.t % 9 < 1.5 ? 'wave' : 'idle', dt, 0);
          if (p.t < -1e4) p.t = 0;
        }
      }
    }
  }
}
