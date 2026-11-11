// দোকান ডাকাতি: দোকানের দরজায় দোকানদার; পিস্তল তাক করে ধরে থাকলে টাকা দিয়ে দেয়, তারপর পুলিশ
import { makeRig, setPose } from './rig.js';
import { pick, rand, clamp, bn } from './utils.js';
import { bnGroup } from './ui.js';

const NEAR = 6.5; // দরজা থেকে কত দূরে দাঁড়িয়ে তাক করা যায়
const TAKE = 4.5; // কত সেকেন্ড ধরে রাখতে হয়
const COOL = 300; // একই দোকানে আবার ডাকাতির আগে (সেকেন্ড)
const SCARED = ['নেন নেন, সব নিয়া যান!', 'গুলি কইরেন না ভাই!', 'আল্লাহর দোহাই, মাইরেন না!', 'ক্যাশে যা আছে সব দিতেছি!'];
const AFTER = ['ডাকাত! ডাকাত!', 'পুলিশ! পুলিশ! দোকান লুট!', 'কেউ ধরেন ওরে!'];
const HELLO = ['আসেন ভাই, কী লাগবে?', 'আজকে ফ্রেশ মাল আছে!', 'বাকি চলবে না কিন্তু!'];

export class Robbery {
  constructor(g) {
    this.g = g;
    this.shops = [...(g.map.places.restaurants || []), ...(g.map.places.couriers || [])].filter((b) => b.door && b.face);
    this.newKeeper();
    this.shop = null;
    this.prog = 0;
    this.robbedAt = new Map();
    this.goneAt = new Map();
    this.checkT = 0;
    this.sayT = 0;
    this.active = false;
  }
  newKeeper() {
    this.keeper = makeRig({ shirt: 0xe8e2d0, pants: 0x3a3a3a, kurta: true, cap: 0xffffff });
    this.keeper.root.visible = false;
    this.g.scene.add(this.keeper.root);
  }
  // দরজার দোকানদারকে মারলে/গুলি করলে বা গোলাগুলিতে পালালে: পথচারী হয়ে যায়, কিছুক্ষণ এই দোকানে কেউ থাকে না
  bystander() {
    if (this.inShop || !this.shop || !this.keeper.root.visible) return null;
    const b = this.shop;
    if (this.g.time - (this.goneAt.get(b) ?? -1e9) < COOL) return null;
    return { x: this.kx, z: this.kz, rig: this.keeper, yaw: this.keeper.root.rotation.y, take: () => { this.goneAt.set(b, this.g.time); this.robbedAt.set(b, this.g.time); this.shop = null; this.active = false; this.prog = 0; this.newKeeper(); } };
  }
  // দোকানের ভিতরে: কাউন্টারের ক্যাশিয়ারকে ডাকাতি
  setInside(d, cashier) {
    this.prog = 0; this.active = false;
    if (d && cashier) {
      this.inShop = { b: d.b, cashier };
      this.shop = d.b; this.kx = cashier.x; this.kz = cashier.z;
      this.keeper.root.visible = false;
      this.greeted = true;
    } else {
      if (this.inShop) this.inShop.cashier.rig.busy = false;
      this.inShop = null; this.shop = null; this.checkT = 0;
    }
  }
  // খেলোয়াড়ের কাছের দোকান খুঁজে দোকানদারকে দরজায় দাঁড় করানো
  pickShop() {
    if (this.inShop) return;
    const P = this.g.player.pos;
    let best = null, bd = 18;
    for (const b of this.shops) {
      if (this.g.time - (this.goneAt.get(b) ?? -1e9) < COOL) continue; // দোকানদার নেই
      const E = b.entry || b.door;
      const d = Math.hypot(E.x - P.x, E.z - P.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best !== this.shop) {
      this.shop = best;
      this.prog = 0;
      this.active = false;
      if (best) {
        const k = this.keeper.root;
        // খোলা দরজার পাশে (দরজার মুখ না থাকলে রাস্তার কিনারার দরজায়)
        const E = best.entry, f = best.face;
        if (E) { const hw = clamp((E.w || 3) / 2 - 0.5, 0.6, 1.3); this.kx = E.x - f.x * 0.2 - f.z * hw; this.kz = E.z - f.z * 0.2 + f.x * hw; }
        else { this.kx = best.door.x - f.x * 0.35; this.kz = best.door.z - f.z * 0.35; }
        k.position.set(this.kx, 0.16, this.kz);
        k.rotation.set(0, Math.atan2(-best.face.x, -best.face.z), 0);
        this.greeted = false;
      }
    }
    this.keeper.root.visible = !!best;
  }
  update(dt) {
    const g = this.g, P = g.player;
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.5; this.pickShop(); }
    const b = this.shop;
    if (!b) return '';
    if (this.inShop && g.inside && g.inside.room.keeper && g.inside.room.keeper.dead) return ''; // ক্যাশিয়ার মারা গেছে
    const k = this.inShop ? this.inShop.cashier.rig : this.keeper;
    const kx = this.kx, kz = this.kz;
    const d = Math.hypot(P.pos.x - kx, P.pos.z - kz);
    const last = this.robbedAt.get(b) ?? -1e9;
    const cooling = g.time - last < COOL;
    this.sayT -= dt;
    if (!this.greeted && d < 5 && P.state === 'foot' && !g.aiming && !cooling) { this.greeted = true; g.say(k.root, b.name || 'দোকানদার', pick(HELLO), 2.2); }
    // তাক করা: পিস্তল, কাছে, মুখ দোকানদারের দিকে
    let aimed = false;
    if (g.aiming && P.state === 'foot' && d < NEAR && !cooling) {
      const want = Math.atan2(-(kx - P.pos.x), -(kz - P.pos.z));
      let da = want - P.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      aimed = Math.abs(da) < 0.45;
    }
    let pose = cooling ? 'angry' : 'idle';
    let msg = '';
    if (aimed) {
      if (!this.active) {
        this.active = true;
        g.say(k.root, 'দোকানদার', pick(SCARED), 2.4);
        g.traffic.panic(kx, kz, 20, g);
        this.sayT = 2.5;
      }
      this.prog += dt / TAKE;
      pose = 'surrender';
      if (this.sayT <= 0) { this.sayT = 2.6; g.say(k.root, 'দোকানদার', pick(SCARED), 2.2); }
      msg = `দোকানদার টাকা তুলে দিচ্ছে… ${bn(Math.min(99, Math.round(this.prog * 100)))}%`;
      if (this.prog >= 1) this.finish(b);
    } else if (this.active) {
      // মাঝপথে থামালে: দোকানদার শাটার টেনে চিৎকার
      this.active = false;
      if (this.prog > 0.15) { g.say(k.root, 'দোকানদার', pick(AFTER), 2.4); g.law.offense('assault', kx, kz); this.robbedAt.set(b, g.time); }
      this.prog = 0;
    } else if (!cooling && d < NEAR && P.state === 'foot' && g.weapon === 'pistol' && g.arms.pistol) {
      msg = `${g.mobile ? 'নিশানা' : 'ডান ক্লিক ধরে'} দোকানদারের দিকে তাক করুন: ডাকাতি`;
    }
    if (this.inShop) k.busy = pose !== 'idle';
    if (!this.inShop || k.busy) setPose(k, pose, dt, 0, 8);
    return msg;
  }
  finish(b) {
    const g = this.g, k = this.inShop ? this.inShop.cashier.rig : this.keeper;
    this.active = false;
    this.prog = 0;
    this.robbedAt.set(b, g.time);
    this.count = (this.count || 0) + 1; // মিশনের জন্য
    const amt = Math.round(rand(700, 2600) / 10) * 10;
    g.money += amt;
    g.save();
    g.sound.money();
    g.ui.toast(`ডাকাতি! ক্যাশ থেকে পেলেন ৳${bnGroup(amt)}। পুলিশ আসছে, পালান!`, 'money');
    g.say(k.root, 'দোকানদার', pick(AFTER), 2.6);
    g.law.offense('rob', this.kx, this.kz);
    g.traffic.panic(this.kx, this.kz, 40, g);
  }
}
