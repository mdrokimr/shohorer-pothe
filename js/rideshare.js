// রাইড শেয়ার অ্যাপ "ঝটপট রাইড" (বানানো নাম): ফোন থেকে অনলাইন হলে, যাত্রী বসানো যায় এমন যানবাহন চালানোর সময়
// কাছের যাত্রীর রিকোয়েস্ট আসে: নাম, রেটিং, দূরত্ব, ভাড়া। নিলে GPS যাত্রীর কাছে; বৃষ্টি বা রাতে ভাড়া বেশি
// টানা ৩টা রাইডে বোনাস; যাত্রী শেষে তারা দেন (ধাক্কা, জোরে চালানো, দেরি দেখে)
import { pick, rand, bn, store, isTouch } from './utils.js';
import { bnGroup, meters } from './ui.js';

const NAMES = ['রাশেদ', 'সুমাইয়া', 'জামিল', 'তানিয়া', 'মিজান', 'রুমানা', 'হাসান', 'নুসরাত', 'বাবলু', 'মৌ', 'সাকিব', 'ফারিয়া', 'আরিফ', 'লাবণী', 'তুষার', 'নাদিয়া', 'রবিন', 'মিম'];
const FEMALE = /সুমাইয়া|তানিয়া|রুমানা|নুসরাত|মৌ|ফারিয়া|লাবণী|নাদিয়া|মিম/;
const APP = 'ঝটপট রাইড';

export class RideShare {
  constructor(g) {
    this.g = g; this.online = false; this.req = null; this.nextT = 6; this.streak = 0;
    try { const s = JSON.parse(store('sp_ride') || '{}'); this.total = s.total || 0; this.earn = s.earn || 0; } catch (e) { this.total = 0; this.earn = 0; }
    this.el = document.getElementById('rideReq');
    if (this.el) {
      this.el.querySelector('.rr-yes').onclick = () => this.accept();
      this.el.querySelector('.rr-no').onclick = () => this.reject();
      if (isTouch()) this.el.querySelector('.rr-yes').textContent = 'নিন';
    }
  }
  save() { store('sp_ride', JSON.stringify({ total: this.total, earn: this.earn })); }
  surge() {
    const s = this.g.sky;
    if (!s) return 1;
    if (s.rain > 0.4) return 1.5;
    if (s.night > 0.6) return 1.2;
    return 1;
  }
  toggle() {
    this.online = !this.online;
    this.nextT = rand(4, 8);
    if (!this.online) this.hide();
    const S = this.surge();
    this.g.ui.toast(this.online ? `${APP}: অনলাইন! যাত্রী বসানো যায় এমন গাড়ি-বাইক চালান, রিকোয়েস্ট আসবে${S > 1 ? ` (এখন ভাড়া ${bn(S)}×)` : ''}` : `${APP}: অফলাইন`, this.online ? 'good' : '');
  }
  canTake() {
    const g = this.g, P = g.player, v = P.vehicle;
    return P.state === 'drive' && v && v.spec.pass && !v.spec.air && !v.boat && !g.jobs.active && !(g.work && g.work.job) && !(g.missions && g.missions.active) && !(g.law && g.law.stars > 0) && g.state === 'play';
  }
  makeReq() {
    const g = this.g, P = g.player.pos, pl = g.map.places;
    const homes = [...pl.homes, ...(pl.restaurants || []), ...(pl.offices || [])].filter((b) => b.door);
    const near = homes.filter((b) => { const d = Math.hypot(b.door.x - P.x, b.door.z - P.z); return d > 60 && d < 380; });
    if (!near.length) return null;
    const from = pick(near);
    const far = pl.homes.filter((b) => { const d = Math.hypot(b.door.x - from.door.x, b.door.z - from.door.z); return d > 280 && d < 950; });
    if (!far.length) return null;
    const to = pick(far);
    const d = Math.hypot(to.door.x - from.door.x, to.door.z - from.door.z);
    const pd = Math.hypot(from.door.x - P.x, from.door.z - P.z);
    const surge = this.surge();
    const name = pick(NAMES);
    const v = g.player.vehicle;
    const base = Math.round((40 + d * 0.22) / 5) * 5;
    return {
      type: 'ride', app: true, from, to, d, base, who: name + (FEMALE.test(name) ? ' আপা' : ' ভাই'), surge, rr: rand(4.2, 5),
      pd, wait: 70 + pd / 4, fare: Math.round(base * (v ? v.spec.fare : 1) * surge / 5) * 5, life: 14,
    };
  }
  show(r) {
    this.req = r;
    if (!this.el) return;
    const $ = (s) => this.el.querySelector(s);
    $('.rr-who').textContent = `${r.who} · ★${bn(r.rr.toFixed(1))}`;
    $('.rr-route').textContent = `${r.from.name || r.from.addr} → ${r.to.addr}`;
    $('.rr-meta').textContent = `যাত্রী ${meters(r.pd)} দূরে · যাত্রা ${meters(r.d)}${r.surge > 1 ? ` · ${this.g.sky.rain > 0.4 ? 'বৃষ্টি' : 'রাত'}: ভাড়া ${bn(r.surge)}×` : ''}`;
    $('.rr-fare').textContent = `৳${bnGroup(r.fare)}`;
    this.el.classList.remove('hidden');
    this.g.sound.phone ? this.g.sound.phone() : this.g.sound.ping();
  }
  hide() { this.req = null; if (this.el) this.el.classList.add('hidden'); }
  accept() {
    const r = this.req;
    if (!r) return false;
    this.hide();
    if (!this.canTake()) { this.g.ui.toast('এখন রাইড নেওয়া যাচ্ছে না', 'bad'); return false; }
    if (this.g.jobs.acceptOffer(r)) { this.g.routeT = 0; return true; }
    return false;
  }
  reject() {
    if (!this.req) return false;
    this.hide();
    this.nextT = rand(10, 20);
    return true;
  }
  onCancel() { this.streak = 0; this.nextT = rand(8, 15); }
  onDone(a, stars, pay) {
    const g = this.g;
    this.total++; this.earn += pay;
    this.streak = stars >= 4 ? this.streak + 1 : 0;
    if (this.streak > 0 && this.streak % 3 === 0) {
      const bonus = 150;
      g.money += bonus; g.save();
      setTimeout(() => g.ui.toast(`${APP} বোনাস: টানা ${bn(this.streak)}টা ভালো রাইড! +৳${bnGroup(bonus)}`, 'money'), 1600);
    }
    this.save();
    this.nextT = rand(8, 16);
  }
  update(dt) {
    if (!this.online) return;
    if (this.req) {
      this.req.life -= dt;
      const t = this.el && this.el.querySelector('.rr-time');
      if (t) t.style.width = Math.max(0, this.req.life / 14 * 100) + '%';
      if (this.req.life <= 0 || !this.canTake()) { this.hide(); this.nextT = rand(8, 16); }
      return;
    }
    if (!this.canTake()) return;
    this.nextT -= dt * (this.surge() > 1 ? 1.6 : 1); // বৃষ্টিতে রিকোয়েস্ট বেশি
    if (this.nextT > 0) return;
    const r = this.makeReq();
    if (r) this.show(r); else this.nextT = 5;
  }
  // ফোনে অ্যাপের অবস্থা
  status() {
    const S = this.surge();
    return `${this.online ? '🟢 অনলাইন' : '⚪ অফলাইন'} · রেটিং ★${bn(this.g.rating.toFixed(1))} · মোট ${bn(this.total)} রাইড, ৳${bnGroup(Math.round(this.earn))}${S > 1 ? ` · এখন ভাড়া ${bn(S)}×` : ''}`;
  }
}
