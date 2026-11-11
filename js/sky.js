// দিন-রাত আর বৃষ্টি: সূর্য, আকাশের রং, কুয়াশা, রাস্তার বাতি, জানালার আলো, গাড়ির হেডলাইট
import * as THREE from 'three';
import { clamp, rand, bn } from './utils.js';
import { Rain } from './vfx.js';
import { HEAD_BEAM } from './vehicles.js';

const HOUR_SEC = 60; // খেলার এক ঘণ্টা = আসল এক মিনিট (পুরো দিন ২৪ মিনিট)
const C = (h) => new THREE.Color(h);
// আকাশের তিন স্তর: উপরে, মাঝে, দিগন্তে
const SKY = {
  day: [C(0x6e9fcf), C(0xa9c6dd), C(0xe9d8bf)],
  dusk: [C(0x34497e), C(0xd9845a), C(0xf2b27a)],
  night: [C(0x0a1430), C(0x18264a), C(0x31426a)], // GTA V-এর মতো গাঢ় নীল, কালো নয়
  rain: [C(0x56606b), C(0x77818b), C(0x959ca2)],
};
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Sky {
  constructor(g, hemi, sun) {
    this.g = g;
    this.hemi = hemi;
    this.sun = sun;
    this.hour = 16.5; // বিকেলে শুরু: কিছুক্ষণ পরেই সন্ধ্যা দেখা যায়
    this.rain = 0;
    this.rainTarget = 0;
    this.rainLeft = 0;
    this.nextRoll = 1;
    this.night = 0;
    this.fx = new Rain(g.scene, g.mobile ? 700 : 1400);
    // আপনার গাড়ির হেডলাইট (একটাই আলো, আগে থেকে রাখা)
    this.head = new THREE.SpotLight(0xfff0d0, 0, 55, 0.6, 0.45, 1.1);
    this.head.position.set(0, -50, 0);
    g.scene.add(this.head, this.head.target);
    this.bgT = 0;
    this.cols = SKY.day.map((c) => c.clone());
  }
  get label() {
    const h = Math.floor(this.hour) % 24, m = Math.floor((this.hour % 1) * 60);
    const part = h < 5 ? 'রাত' : h < 7 ? 'ভোর' : h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const icon = this.rain > 0.3 ? '🌧' : this.night > 0.5 ? '🌙' : '☀';
    return `${icon} ${part} ${bn(h12)}:${bn(String(m).padStart(2, '0'))}`;
  }
  update(dt) {
    const g = this.g;
    this.hour = (this.hour + dt / HOUR_SEC) % 24;
    // আবহাওয়া: মাঝে মাঝে বৃষ্টি নামে, কিছুক্ষণ পরে থামে
    this.nextRoll -= dt;
    if (this.nextRoll <= 0) {
      this.nextRoll = HOUR_SEC;
      if (this.rainLeft <= 0 && Math.random() < 0.2) { this.rainTarget = rand(0.6, 1); this.rainLeft = rand(1.5, 3) * HOUR_SEC; }
    }
    if (this.rainLeft > 0) { this.rainLeft -= dt; if (this.rainLeft <= 0) this.rainTarget = 0; }
    this.rain += clamp(this.rainTarget - this.rain, -dt * 0.08, dt * 0.08);
    const rain = this.rain;

    const a = ((this.hour - 6) / 12) * Math.PI;
    const elev = Math.sin(a); // দিনে ধনাত্মক
    const day = smooth(-0.12, 0.22, elev);
    const dusk = clamp(1 - Math.abs(elev) / 0.3, 0, 1) * (this.hour > 12 ? 1 : 0.7);
    this.night = 1 - day;
    // সূর্য বা চাঁদ: খেলোয়াড়ের চারপাশে ঘোরে (ছায়ার জন্য)
    const P = g.player.pos;
    const sx = elev > -0.05 ? -Math.cos(a) * 70 : -40, sy = elev > -0.05 ? Math.max(12, elev * 75) : 60;
    this.sun.position.set(P.x + sx, sy, P.z + 30);
    this.sun.target.position.set(P.x, 0, P.z);
    const sunCol = C(0xffe2b8).lerp(C(0xff9a50), dusk * 0.8);
    if (day > 0.05) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 2.4 * day * (1 - 0.65 * rain);
    } else {
      // চাঁদের নীলচে আলো: রাস্তা-বিল্ডিং সব দেখা যায়
      this.sun.color.setHex(0xb4c4f0);
      this.sun.intensity = 1.0 * (1 - rain * 0.5);
    }
    // রাতেও চারপাশ দেখা যায় (GTA V-এর মতো নীলচে), দিনের প্রায় এক-তৃতীয়াংশ আলো
    this.hemi.color.copy(C(0xcfe0ff).lerp(C(0x93a6dc), this.night)).lerp(C(0x9aa3ad), rain * 0.5 * day);
    this.hemi.groundColor.copy(C(0x7a6a50).lerp(C(0x464b62), this.night));
    this.hemi.intensity = 1.25 + this.night * 0.2 - rain * 0.2;
    // আকাশ আর কুয়াশা
    for (let i = 0; i < 3; i++) {
      const c = this.cols[i].copy(SKY.day[i]).lerp(SKY.dusk[i], dusk * 0.85).lerp(SKY.night[i], this.night);
      c.lerp(SKY.rain[i].clone().multiplyScalar(1 - this.night * 0.8), rain * 0.75);
    }
    const fog = g.scene.fog;
    fog.color.copy(this.cols[2]);
    fog.near = 95 - rain * 55 - this.night * 15; // ধুলোমাখা ঢাকার বাতাস
    fog.far = 470 - rain * 250 - this.night * 60;
    this.bgT -= dt;
    if (this.bgT <= 0) {
      this.bgT = 0.4;
      const hex = (c) => '#' + c.getHexString();
      const bg = `linear-gradient(to bottom, ${hex(this.cols[0])} 0%, ${hex(this.cols[1])} 40%, ${hex(this.cols[2])} 70%, ${hex(this.cols[2])} 100%)`;
      if (bg !== this.bg) { this.bg = bg; document.body.style.background = bg; document.documentElement.style.background = bg; }
    }
    g.world.setNight(clamp(this.night * 1.1 + rain * 0.25, 0, 1));
    // সব গাড়ির হেডলাইটের আলো রাস্তায়
    const beam = clamp(Math.max(this.night, rain * 0.5) * 1.3 - 0.15, 0, 1);
    HEAD_BEAM.opacity = beam * 0.55;
    HEAD_BEAM.visible = beam > 0.02;
    g.world.setWet(rain);
    // হেডলাইট: রাতে বা বৃষ্টিতে আপনার গাড়িতে
    const v = g.player.state === 'drive' && g.player.vehicle;
    const want = v && !v.burnt && v.hp > 0 ? clamp(Math.max(this.night, rain * 0.5) * 1.4 - 0.2, 0, 1) : 0;
    this.head.intensity = want * (v && v.type === 'bike' ? 26 : 40);
    if (want > 0) {
      const f = v.fwd(), front = v.toWorld(0, -v.spec.len / 2);
      this.head.position.set(front.x, v.y + 0.9, front.z);
      this.head.target.position.set(front.x + f.x * 20, 0, front.z + f.z * 20);
    } else this.head.position.set(0, -50, 0);
    this.fx.update(dt, g.camPos, g.inside ? 0 : rain);
  }
}
