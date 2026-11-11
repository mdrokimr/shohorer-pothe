// ফোনের কাজ: যাত্রী টানা, খাবার ডেলিভারি, পার্সেল
import * as THREE from 'three';
import { makeRig, setPose } from './rig.js';
import { pick, rand, clamp, bn } from './utils.js';
import { SPECS } from './vehicles.js';

const NAMES = ['রাশেদ ভাই', 'সুমাইয়া আপা', 'জামিল সাহেব', 'তানিয়া', 'মিজান ভাই', 'রুমানা আপা', 'হাসান', 'নুসরাত', 'বাবলু চাচা', 'মৌ'];
const RIDE_LINES = ['ভাই, একটু তাড়াতাড়ি, অফিসে দেরি হয়ে যাচ্ছে!', 'আস্তে চালাবেন, ঝাঁকুনি লাগে।', 'শর্টকাট জানেন তো?', 'ভাড়া কিন্তু ঠিক আছে তো?'];
const THANKS = ['ধন্যবাদ ভাই!', 'ভালো চালাইছেন!', 'নেন, বখশিশসহ।', 'আল্লাহ হাফেজ!'];
const RIDE_FAST = ['ভাই, আস্তে চালান! আমি বাসায় যাইতে চাই, হাসপাতালে না!', 'এত জোরে কেন? রেটিং কম দিমু কিন্তু!', 'আল্লাহর ওয়াস্তে আস্তে!'];
const RIDE_CHAT = ['আজকে জ্যাম মনে হয় কম', 'ভাই, অ্যাপে লোকেশন ঠিক দেখাইতেছে?', 'মিরপুরে নতুন আসছি, রাস্তা চিনি না', 'এসি একটু বাড়ান না!', 'আপনি কতদিন ধরে রাইড দেন?', 'সামনে থেকে বামে, তারপর সোজা'];
const RIDE_RAIN = ['বৃষ্টিতে রিকশাও পাই না, ভাগ্যিস আপনাকে পাইলাম', 'রাস্তায় তো নদী হইয়া গেছে!', 'পানির মধ্যে আস্তে চালান, ইঞ্জিন বন্ধ হইলে বিপদ'];
const ANGRY = ['এভাবে কেউ চালায়?', 'ভাড়া কম দিলাম, ধাক্কা খাইছি তিনবার!'];

export const JOB_INFO = {
  ride: { name: 'যাত্রী নেওয়া', icon: 'যা' },
  food: { name: 'খাবার ডেলিভারি', icon: 'খা' },
  parcel: { name: 'পার্সেল পৌঁছানো', icon: 'পা' },
  letter: { name: 'ডাকপিয়নের চিঠি', icon: 'চি', pick: 'চিঠির বস্তা নিলেন', drop: 'চিঠি পৌঁছে দিলেন', goPick: 'চিঠি নিন', goDrop: 'চিঠি দিন' },
  meter: { name: 'বিদ্যুতের মিটার পড়া', icon: 'মি', pick: 'মিটারের খাতা নিলেন', drop: 'মিটার পড়া হলো', goPick: 'খাতা নিন', goDrop: 'মিটার পড়ুন' },
};

export class Jobs {
  constructor(game) {
    this.g = game;
    this.offers = [];
    this.active = null;
    // গন্তব্যের আলোর খুঁটি
    const mk = (color) => {
      const grp = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 20, 1, true), new THREE.MeshBasicMaterial({
        map: game.T.beam, color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }));
      beam.position.y = 20;
      grp.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.25;
      grp.add(ring);
      grp.visible = false;
      game.scene.add(grp);
      return grp;
    };
    this.pickMarker = mk(0xffd400);
    this.dropMarker = mk(0x3ddc84);
    this.npc = null;
  }

  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  makeOffers() {
    const P = this.g.player.pos;
    const pl = this.g.map.places;
    const near = (list, lo, hi, from = P) => {
      const c = list.filter((b) => { const d = this.dist(b.door, from); return d > lo && d < hi; });
      return c.length ? pick(c) : pick(list);
    };
    const offers = [];
    const types = ['ride', 'food', 'parcel'];
    for (const type of types) {
      let from, to;
      if (type === 'ride') { from = near([...pl.homes, ...pl.restaurants], 60, 300); to = near(pl.homes, 250, 800, from.door); }
      else if (type === 'food') { from = near(pl.restaurants, 40, 420); to = near(pl.homes, 200, 700, from.door); }
      else { from = near(pl.couriers, 0, 2000); to = near(pl.homes, 250, 900, from.door); }
      const d = this.dist(from.door, to.door);
      const base = type === 'ride' ? 40 + d * 0.22 : type === 'food' ? 50 + d * 0.14 : 70 + d * 0.16;
      offers.push({
        type, from, to, d, base: Math.round(base / 5) * 5,
        who: pick(NAMES),
        limit: type === 'food' ? Math.round(45 + d / 6) : 0,
      });
    }
    this.offers = offers;
    return offers;
  }

  accept(i) { return this.acceptOffer(this.offers[i]); }
  acceptOffer(o) {
    if (this.active) return false;
    if (!o) return false;
    this.active = { ...o, stage: 'pickup', t: 0, crashes: 0, rough: 0, fastT: 0, chatT: rand(14, 24) };
    this.pickMarker.position.set(o.from.door.x, 0, o.from.door.z);
    this.pickMarker.visible = true;
    this.dropMarker.visible = false;
    if (o.type === 'ride') {
      const female = /আপা|তানিয়া|নুসরাত|মৌ/.test(o.who);
      const rig = makeRig({ female, skirt: female ? pick([0xc2185b, 0x00897b, 0x5e35b1]) : undefined, kurta: !female });
      rig.root.position.set(o.from.door.x, 0.16, o.from.door.z);
      this.g.scene.add(rig.root);
      this.npc = { rig, state: 'wait', t: 0 };
    }
    this.g.sound.ping();
    this.g.ui.toast(o.app ? `রাইড নিলেন: ${o.who} (★${bn(o.rr.toFixed(1))}) অপেক্ষা করছেন, ${o.from.addr}` : `কাজ নিলেন: ${JOB_INFO[o.type].name}`, 'good');
    return true;
  }

  cancel() {
    if (!this.active) return;
    this.clearNpc();
    this.active = null;
    this.pickMarker.visible = this.dropMarker.visible = false;
    this.g.ui.toast('কাজ বাতিল করলেন', 'bad');
    this.g.rating = Math.max(1, this.g.rating - 0.1);
  }
  // ঝামেলায় কাজ বন্ধ (গাড়ি উল্টানো, থানায় আটক)
  abort(msg, drop = 0) {
    if (!this.active) return;
    this.clearNpc();
    this.active = null;
    this.pickMarker.visible = this.dropMarker.visible = false;
    if (msg) this.g.ui.toast(msg, 'bad');
    this.g.rating = Math.max(1, this.g.rating - drop);
  }
  // যে যানবাহনে আছেন সেটা উল্টে গেলে
  onFlip() {
    const a = this.active;
    if (!a || a.stage !== 'drop') return;
    if (a.type === 'ride' && this.npc && this.npc.state === 'ride') {
      const rig = this.npc.rig, who = a.who;
      const p = new THREE.Vector3();
      rig.root.getWorldPosition(p);
      for (const v of this.g.vehicles) if (v.passenger === this.npc) v.passenger = null;
      this.npc = null;
      // যাত্রী ছিটকে পড়ে, উঠে বকা দেয়
      this.g.traffic.adoptPerson(rig, p.x, p.z, 0, { mode: 'fly', vx: rand(-2, 2), vz: rand(-2, 2), vy: 2.5, y: Math.max(0.3, p.y), kind: 'passenger', who });
      this.abort('যাত্রী রাগ করে চলে গেলেন, ভাড়া পেলেন না', 0.3);
    } else {
      a.crashes += 2;
    }
  }
  clearNpc() {
    for (const v of this.g.vehicles) if (this.npc && v.passenger === this.npc) v.passenger = null;
    if (this.npc) {
      if (this.npc.rig.root.parent) this.npc.rig.root.parent.remove(this.npc.rig.root);
      this.npc = null;
    }
  }
  onCrash(power) {
    if (this.active && this.active.stage === 'drop') this.active.crashes++;
    if (this.active && this.active.type === 'ride' && this.active.stage === 'drop' && power > 4 && this.npc) {
      this.g.say(this.npc.rig.root, this.active.who, 'আরে আস্তে! জান বাঁচান!', 2);
    }
  }
  target() {
    const a = this.active;
    if (!a) return null;
    return a.stage === 'pickup' ? a.from.door : a.to.door;
  }

  update(dt) {
    const a = this.active;
    const g = this.g;
    const t = g.time;
    this.pickMarker.rotation.y = t;
    this.dropMarker.rotation.y = -t;
    if (this.npc && this.npc.state === 'wait') {
      setPose(this.npc.rig, 'wave', dt, 0);
      const P = g.player.pos;
      this.npc.rig.root.rotation.y = Math.atan2(-(P.x - this.npc.rig.root.position.x), -(P.z - this.npc.rig.root.position.z));
    }
    if (this.npc && this.npc.state === 'walk') {
      this.npc.t += dt;
      setPose(this.npc.rig, 'walk', dt, 1.4);
      const v = g.player.vehicle;
      if (v) {
        const r = this.npc.rig.root;
        const seat = v.toWorld(v.spec.pass.x, v.spec.pass.z);
        r.position.x += (seat.x - r.position.x) * Math.min(1, dt * 3);
        r.position.z += (seat.z - r.position.z) * Math.min(1, dt * 3);
        if (this.npc.t > 0.9) {
          // গাড়িতে বসানো
          v.g.add(r);
          r.position.set(v.spec.pass.x, v.spec.pass.y - 0.95, v.spec.pass.z);
          r.rotation.set(0, 0, 0);
          v.passenger = this.npc;
          this.npc.state = 'ride';
        }
      }
    }
    if (this.npc && this.npc.state === 'ride') setPose(this.npc.rig, g.player.vehicle ? g.player.vehicle.spec.passPose : 'sit', dt, 0);
    if (this.npc && this.npc.state === 'leave') {
      this.npc.t += dt;
      setPose(this.npc.rig, 'walk', dt, 1.3);
      const r = this.npc.rig.root;
      r.position.x += Math.sin(r.rotation.y) * -1.3 * dt;
      r.position.z += Math.cos(r.rotation.y) * -1.3 * dt;
      if (this.npc.t > 3) this.clearNpc();
    }
    if (!a) return;
    a.t += dt;
    const P = g.player;
    const tgt = this.target();
    const d = this.dist(P.pos, tgt);
    const v = P.vehicle;
    const stopped = !v || Math.abs(v.speed) < 1.5;
    if (a.limit && a.stage === 'drop' && a.t > a.limit && !a.lateWarned) {
      a.lateWarned = true;
      g.ui.toast('দেরি হয়ে গেছে! খাবার ঠান্ডা হচ্ছে…', 'bad');
    }
    // রাইড অ্যাপ: দেরি করলে যাত্রী বাতিল করে; জোরে চালালে আপত্তি; পথে গল্প
    if (a.app) {
      if (a.stage === 'pickup' && a.t > a.wait) { this.abort(`${a.who} অনেকক্ষণ অপেক্ষা করে রাইড বাতিল করলেন`, 0.15); if (g.rideshare) g.rideshare.onCancel(); return; }
      if (a.stage === 'drop' && v && this.npc && this.npc.state === 'ride') {
        if (Math.abs(v.speed) > 17.5) { a.fastT += dt; if (a.fastT > 5) { a.fastT = 0; a.rough++; g.say(this.npc.rig.root, a.who, pick(RIDE_FAST), 2.4); } } else a.fastT = Math.max(0, a.fastT - dt * 0.5);
        a.chatT -= dt;
        if (a.chatT <= 0) { a.chatT = rand(22, 38); g.say(this.npc.rig.root, a.who, pick(g.sky && g.sky.rain > 0.4 ? RIDE_RAIN : RIDE_CHAT), 2.6); }
      }
    }
    if (d > 7 || !stopped) return;
    if (a.stage === 'pickup') {
      if (a.type === 'ride') {
        if (!v || !v.spec.pass) { if (!this.footWarn) { this.footWarn = true; g.ui.toast('যাত্রী নিতে যানবাহন লাগবে', 'bad'); } return; }
        if (this.npc && this.npc.state === 'wait') {
          this.npc.state = 'walk';
          this.npc.t = 0;
          g.say(this.npc.rig.root, a.who, pick(RIDE_LINES), 2.6);
        }
        if (!this.npc || this.npc.state !== 'ride') return;
      } else {
        g.ui.toast(a.type === 'food' ? `খাবার নিলেন: ${a.from.name}` : JOB_INFO[a.type].pick || 'পার্সেল নিলেন', 'good');
      }
      a.stage = 'drop';
      a.t = 0;
      this.footWarn = false;
      this.pickMarker.visible = false;
      this.dropMarker.position.set(a.to.door.x, 0, a.to.door.z);
      this.dropMarker.visible = true;
      g.sound.ping();
      return;
    }
    // পৌঁছে গেছেন
    if (a.type === 'ride' && (!v || v.passenger !== this.npc)) return;
    const mult = a.type === 'ride' ? v.spec.fare * (a.surge || 1) : 1;
    let pay = a.base * mult;
    let tip = 0;
    if (a.limit) {
      if (a.t <= a.limit) tip = Math.round(pay * 0.25);
      else pay *= 0.6;
    } else if (a.crashes === 0) tip = Math.round(pay * 0.15);
    pay *= Math.max(0.4, 1 - a.crashes * 0.15);
    pay = Math.round(pay / 5) * 5;
    if (a.rough) { tip = Math.round(tip * Math.max(0, 1 - a.rough * 0.5)); pay = Math.round(pay * Math.max(0.6, 1 - a.rough * 0.08) / 5) * 5; }
    const stars = clamp(5 - a.crashes - a.rough * 0.5 - (a.limit && a.t > a.limit ? 1.5 : 0), 1, 5);
    g.addMoney(pay + tip, stars);
    g.ui.toast(`+৳${g.bnMoney(pay + tip)}${tip ? ` (বখশিশ ৳${g.bnMoney(tip)})` : ''}${a.app ? ` · ${'★'.repeat(Math.round(stars))}${'☆'.repeat(5 - Math.round(stars))}${a.surge > 1 ? ` · ভাড়া ${bn(a.surge)}×` : ''}` : ''}`, 'money');
    if (a.app && g.rideshare) g.rideshare.onDone(a, stars, pay + tip);
    if (a.type === 'ride' && this.npc) {
      // যাত্রী নেমে হেঁটে চলে যায়
      const r = this.npc.rig.root;
      const p = v.toWorld(-v.spec.door.x, v.spec.door.z);
      v.g.remove(r);
      g.scene.add(r);
      r.position.set(p.x, 0.16, p.z);
      r.rotation.y = v.yaw + Math.PI / 2;
      this.npc.state = 'leave';
      this.npc.t = 0;
      v.passenger = null;
      g.say(r, a.who, a.crashes >= 2 ? pick(ANGRY) : pick(THANKS), 2.4);
    } else {
      g.ui.toast(a.type === 'food' ? 'খাবার পৌঁছে দিলেন' : JOB_INFO[a.type].drop || 'পার্সেল পৌঁছে দিলেন', 'good');
    }
    this.active = null;
    this.dropMarker.visible = false;
    g.sound.money();
    g.jobsDone++;
  }
}
