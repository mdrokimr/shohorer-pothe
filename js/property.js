// বাড়ি কেনা: শহরের কয়েকটা বাড়ির সামনে "বিক্রি হবে" সাইনবোর্ড। কিনলে নিজের বাড়ি: বিশ্রাম (স্বাস্থ্য পুরো, সেভ), ভাড়ার আয়
import * as THREE from 'three';
import { canvasTex, lam } from './lib3d.js';
import { bnGroup } from './ui.js';
import { bn } from './utils.js';

const COUNT = 9;
const DAY = 1440; // খেলার এক দিন (সেকেন্ড, খেলার সময়ে)

function boardTex(top, price, owned) {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = owned ? '#1b5e20' : '#b71c1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = owned ? '#1b5e20' : '#b71c1c'; g.fillRect(24, 24, w - 48, 120);
    g.fillStyle = '#ffffff'; g.font = '800 76px "Anek Bangla", "Hind Siliguri", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(top, w / 2, 86);
    g.fillStyle = '#1a1a1a'; g.font = '800 64px "Anek Bangla", "Hind Siliguri", sans-serif';
    g.fillText(price, w / 2, 210);
    g.font = '600 30px "Hind Siliguri", sans-serif'; g.fillStyle = '#444';
    g.fillText(owned ? 'বিশ্রাম · ভাড়ার আয়' : 'যোগাযোগ: এখানেই', w / 2, 272);
  });
}

export class Property {
  constructor(g) {
    this.g = g;
    this.homes = [];
    this.owned = this.load();
    // শহরের নানা জায়গার বড় আবাসিক বিল্ডিং (একটা থেকে আরেকটা দূরে)
    const cands = g.map.buildings.filter((b) => b.kind === 'home' && !b.name && b.door && b.face && b.area > 140)
      .sort((a, b) => (a.color * 7919 % 997) - (b.color * 7919 % 997)); // নানা মাপের (ছোট-বড়), খেলা যতবারই খুলুন একই বাড়ি
    for (const b of cands) {
      if (this.homes.length >= COUNT) break;
      if (this.homes.some((h) => Math.hypot(h.b.x - b.x, h.b.z - b.z) < 160)) continue;
      const sx = b.door.x - b.face.x * 0.4, sz = b.door.z - b.face.z * 0.4;
      if (g.world.blocked(sx, 1, sz)) continue;
      const id = g.map.buildings.indexOf(b);
      const price = Math.round(Math.min(500000, Math.max(40000, 30000 + Math.sqrt(b.area * Math.max(1, b.floors)) * 1500)) / 5000) * 5000;
      const h = { id, b, x: sx, z: sz, price, rent: Math.round(price * 0.03), name: `${b.floors > 2 ? 'ফ্ল্যাট' : 'বাড়ি'}, ${b.road || 'মিরপুর'}` };
      this.homes.push(h);
      this.makeSign(h);
    }
    for (const h of this.homes) if (this.owned[h.id]) this.setOwned(h, true);
  }
  load() { try { return JSON.parse(localStorage.getItem('sp_homes') || '{}') || {}; } catch (e) { return {}; } }
  save() { try { localStorage.setItem('sp_homes', JSON.stringify(this.owned)); } catch (e) { /* ঠিক আছে */ } }
  makeSign(h) {
    const grp = new THREE.Group();
    grp.position.set(h.x, 0.16, h.z);
    grp.rotation.y = Math.atan2(-h.b.face.x, -h.b.face.z) + Math.PI;
    const post = lam(0x5d4037);
    for (const x of [-0.75, 0.75]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), post); m.position.set(x, 1.1, 0); grp.add(m); }
    h.board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.06), new THREE.MeshLambertMaterial({ map: boardTex('বিক্রি হবে', `৳${bnGroup(h.price)}`, false), side: THREE.DoubleSide }));
    h.board.position.set(0, 1.75, 0.05);
    grp.add(h.board);
    this.g.scene.add(grp);
    h.grp = grp;
  }
  setOwned(h, on) {
    h.own = on;
    h.board.material.map = boardTex(on ? 'আপনার বাড়ি' : 'বিক্রি হবে', on ? h.name.split(',')[0] : `৳${bnGroup(h.price)}`, on);
    h.board.material.needsUpdate = true;
    if (on && !this.owned[h.id]) { this.owned[h.id] = { t: this.g.time }; this.save(); }
  }
  near() {
    const P = this.g.player;
    if (P.state !== 'foot' || this.g.inside || P.y > 1) return null;
    let best = null, bd = 2.6;
    for (const h of this.homes) { const d = Math.hypot(h.x - P.pos.x, h.z - P.pos.z); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  prompt(h, key) { return h.own ? `${key}: আপনার বাড়ি (বিশ্রাম / ভাড়া)` : `${key}: বাড়ি কিনুন (৳${bnGroup(h.price)})`; }
  rentDue(h) {
    const o = this.owned[h.id]; if (!o) return 0;
    return Math.floor(Math.max(0, this.g.time - o.t) / DAY * h.rent);
  }
  use(h) {
    const g = this.g, I = g.interiors;
    if (!h.own) {
      const cash = Math.floor(g.money), bankAmt = g.life ? Math.floor(g.life.bank) : 0;
      I.dialog(h.name, `দাম ৳${bnGroup(h.price)} · হাতে ৳${bnGroup(cash)}, ব্যাংকে ৳${bnGroup(bankAmt)}। কিনলে এখানে বিশ্রাম নিতে পারবেন (স্বাস্থ্য পুরো, খেলা সেভ), আর প্রতিদিন ভাড়া আসবে ৳${bnGroup(h.rent)}।`, [
        { label: 'নগদে কিনুন', note: `৳${bnGroup(h.price)}`, act: () => this.buy(h, 'cash') },
        { label: 'ব্যাংক থেকে কিনুন', note: 'ব্যাংকের টাকায়', act: () => this.buy(h, 'bank') },
        { label: 'পরে দেখি', act: () => {} },
      ]);
      return;
    }
    const due = this.rentDue(h);
    I.dialog('আপনার বাড়ি', `${h.name} · জমা ভাড়া ৳${bnGroup(due)}`, [
      { label: 'বিশ্রাম নিন', note: 'স্বাস্থ্য পুরো, খেলা সেভ', act: () => this.rest(h) },
      { label: 'ভাড়া তুলুন', note: `৳${bnGroup(due)}`, act: () => this.collect(h) },
      { label: 'বাড়ি বিক্রি করুন', note: `৳${bnGroup(Math.round(h.price * 0.7))} পাবেন`, act: () => this.sell(h) },
    ]);
  }
  buy(h, how) {
    const g = this.g;
    if (how === 'cash') {
      if (g.money < h.price) { g.ui.toast(`নগদ টাকা কম: আরও ৳${bnGroup(Math.ceil(h.price - g.money))} লাগবে`, 'bad'); return; }
      g.money -= h.price;
    } else {
      if (!g.life || g.life.bank < h.price) { g.ui.toast('ব্যাংকে এত টাকা নেই', 'bad'); return; }
      g.life.bank -= h.price; g.life.save();
    }
    this.setOwned(h, true);
    g.sound.money(); g.save();
    g.ui.toast(`অভিনন্দন! ${h.name} এখন আপনার। এখানে বিশ্রাম নিন, প্রতিদিন ভাড়া পাবেন`, 'money');
  }
  rest(h) {
    const g = this.g, P = g.player;
    if (g.law.stars > 0) { g.ui.toast('পুলিশ পিছনে! আগে পালান, তারপর বিশ্রাম', 'bad'); return; }
    P.health = 100;
    if (P.armor !== undefined) P.armor = Math.max(P.armor || 0, 0);
    g.save(); if (g.life) g.life.save();
    g.ui.toast('ভালো একটা ঘুম দিলেন। স্বাস্থ্য পুরো, খেলা সেভ হয়েছে', 'good');
  }
  collect(h) {
    const g = this.g, due = this.rentDue(h);
    if (due <= 0) { g.ui.toast('এখনো ভাড়া জমেনি, পরে আসুন', ''); return; }
    g.money += due; this.owned[h.id].t = g.time; this.save(); g.save(); g.sound.money();
    g.ui.toast(`ভাড়া পেলেন ৳${bnGroup(due)}`, 'money');
  }
  sell(h) {
    const g = this.g, amt = Math.round(h.price * 0.7) + this.rentDue(h);
    g.money += amt; delete this.owned[h.id]; this.save(); this.setOwned(h, false); g.save(); g.sound.money();
    g.ui.toast(`বাড়ি বিক্রি করলেন: ৳${bnGroup(amt)}`, 'money');
  }
  // ম্যাপের চিহ্ন
  markers() { return this.homes.map((h) => ({ x: h.x, z: h.z, color: h.own ? '#2e7d32' : '#c62828', label: h.own ? '🏠' : '৳', r: 7, noClamp: !h.own, name: h.own ? 'আপনার বাড়ি' : `বিক্রি হবে ৳${bnGroup(h.price)}` })); }
}
export { bn };
