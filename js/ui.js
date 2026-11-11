// পর্দার তথ্য: টাকা, কাজ, ফোন, গতি, কথার বেলুন, গন্তব্যের চিহ্ন
import * as THREE from 'three';
import { bn } from './utils.js';
import { JOB_INFO } from './jobs.js';

const $ = (id) => document.getElementById(id);
const v3 = new THREE.Vector3();

export function bnGroup(n) {
  n = Math.round(n);
  const s = String(Math.abs(n));
  let last3 = s.slice(-3), rest = s.slice(0, -3);
  if (rest) last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + bn(rest + last3);
}
export const meters = (d) => (d >= 1000 ? bn((d / 1000).toFixed(1)) + ' কিমি' : bn(Math.round(d / 10) * 10) + ' মি');

export class UI {
  constructor() {
    this.last = {};
    this.bubbles = [];
  }
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  // ফোনে স্পিডোমিটার: টাকার প্যানেলের ঠিক নিচে (প্যানেলের উচ্চতা পর্দা অনুযায়ী বদলায়)
  placeSpeedo() {
    const w = document.querySelector('.wallet');
    if (!w) return;
    const r = w.getBoundingClientRect();
    if (r.height) document.body.style.setProperty('--speedo-top', Math.round(r.bottom + 6) + 'px');
    if (!this._spR) { this._spR = true; addEventListener('resize', () => setTimeout(() => this.placeSpeedo(), 120)); }
  }
  set(key, val, fn) { if (this.last[key] === val) return; this.last[key] = val; fn(val); }

  hud(g) {
    this.set('money', Math.round(g.money), (v) => { const el = $('money'); el.textContent = v < 0 ? `বাকি ৳${bnGroup(-v)}` : '৳' + bnGroup(v); el.classList.toggle('debt', v < 0); if (this.prevMoney < 0 && v >= 0) this.toast('সব বাকি শোধ হয়ে গেল', 'good'); this.prevMoney = v; });
    this.set('rating', g.rating.toFixed(1), (v) => { $('rating').textContent = bn(v); });
    this.set('jobs', g.jobsDone, (v) => { $('jobsDone').textContent = bn(v); });
    // স্বাস্থ্য আর অস্ত্র
    const hp = Math.max(0, Math.round(g.player.health));
    this.set('hp', hp, (h) => { const el = $('hpFill'); el.style.width = h + '%'; el.classList.toggle('low', h < 35); });
    const wtxt = g.weapon === 'pistol' && g.arms.pistol ? `পিস্তল · ${bn(g.arms.ammo)} গুলি` : 'খালি হাত';
    this.set('weapon', wtxt, (t) => { $('weapon').textContent = t; });
    const br = g.player.state === 'swim' && g.player.breath < 0.995 ? Math.round(g.player.breath * 100) : -1;
    this.set('breath', br, (b) => { $('breath').classList.toggle('hidden', b < 0); if (b >= 0) $('breathFill').style.width = b + '%'; });
    if (g.sky) this.set('clock', g.sky.label, (t) => { $('clock').textContent = t; });
    this.set('cross', g.aiming ? 1 : 0, (c) => $('cross').classList.toggle('hidden', !c));
    const hurt = Math.max(g.hurtT > 0 ? 0.9 : 0, hp < 30 ? 0.35 : 0);
    this.set('hurt', hurt, (h) => { $('hurt').style.opacity = h; });
    // পুলিশের তারকা আর ধরা পড়ার মিটার
    const st = g.law.stars;
    this.set('stars', st, (s) => {
      const el = $('stars');
      el.classList.toggle('hidden', !s);
      el.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('b');
        b.textContent = '★';
        if (i < s) b.className = 'on';
        el.appendChild(b);
      }
    });
    this.set('lost', st && g.law.spotted && g.law.unseen > 2 ? 1 : 0, (l) => $('stars').classList.toggle('fading', !!l));
    this.set('bust', Math.round(g.law.bust * 40), (b) => {
      $('bustBar').classList.toggle('hidden', !b);
      $('bustFill').style.width = (b / 40) * 100 + '%';
    });
    const v = g.player.vehicle;
    this.set('veh', v ? v.type : '', (t) => {
      $('speedo').classList.toggle('hidden', !t);
      if (t) this.placeSpeedo();
      if (t) $('vehName').textContent = v.spec.name;
    });
    if (v) this.set('spd', Math.round(Math.abs(v.speed) * 3.6), (s) => { $('speed').textContent = bn(s); });
    if (v) this.set('alt', v.air ? Math.round(v.y) : -1, (a) => { $('vehName').textContent = a >= 0 ? `${v.spec.name} · ${bn(a)} মি উঁচুতে` : v.spec.name; });
    // চাকরির তথ্য (অ্যাম্বুলেন্স, পুলিশ, পাইলট, নৌকা)
    const W = (g.metro && g.metro.hud()) || (g.work && g.work.hud());
    if (W) {
      this.set('job', 'W' + W.text, () => { $('jobPanel').classList.remove('hidden'); $('jobText').textContent = W.text; $('jobType').textContent = W.type; });
      const tgt = g.gpsTarget();
      const d = tgt ? Math.hypot(tgt.x - g.player.pos.x, tgt.z - g.player.pos.z) : 0;
      this.set('jd', Math.round(d / 10), () => { $('jobDist').textContent = tgt ? meters(d) : ''; });
      const tl = W.left === null ? '' : Math.ceil(W.left);
      this.set('jt', tl, (s) => { $('jobTimer').textContent = s === '' ? '' : `সময় বাকি ${bn(Math.floor(s / 60))}:${bn(String(s % 60).padStart(2, '0'))}`; $('jobTimer').classList.toggle('late', s !== '' && s < 10); });
      return;
    }
    // কাজের তথ্য
    const a = g.jobs.active;
    const txt = !a ? '' : a.stage === 'pickup'
      ? (a.type === 'ride' ? `${a.who}-কে তুলুন: ${a.from.addr || a.from.name}` : `${a.type === 'food' ? 'খাবার নিন' : JOB_INFO[a.type].goPick || 'পার্সেল নিন'}: ${a.from.name || a.from.addr}`)
      : (a.type === 'ride' ? `যাত্রীকে নামান: ${a.to.addr}` : `${JOB_INFO[a.type].goDrop || 'পৌঁছে দিন'}: ${a.to.addr}`);
    this.set('job', txt, (t) => {
      $('jobPanel').classList.toggle('hidden', !t);
      $('jobText').textContent = t;
      if (a) $('jobType').textContent = JOB_INFO[a.type].name;
    });
    if (a) {
      const tgt = g.jobs.target();
      const d = Math.hypot(tgt.x - g.player.pos.x, tgt.z - g.player.pos.z);
      this.set('jd', Math.round(d / 10), () => { $('jobDist').textContent = meters(d); });
      const tl = a.limit && a.stage === 'drop' ? Math.max(0, a.limit - a.t) : null;
      this.set('jt', tl === null ? '' : Math.ceil(tl), (s) => {
        $('jobTimer').textContent = s === '' ? '' : `সময় বাকি ${bn(Math.floor(s / 60))}:${bn(String(s % 60).padStart(2, '0'))}`;
        $('jobTimer').classList.toggle('late', s === 0);
      });
    }
  }

  shop(g) {
    $('shopMoney').textContent = `৳${bnGroup(g.money)}`;
    $('shopMoney').classList.toggle('debt', g.money < 0);
    const bp = $('buyPistol');
    bp.disabled = g.arms.pistol || !g.canPay(2000);
    bp.textContent = g.arms.pistol ? 'কেনা আছে' : '৳২,০০০';
    $('pistolState').textContent = g.arms.pistol ? 'আপনার কাছে আছে, ২ চেপে হাতে নিন' : 'একবার কিনলে সবসময় থাকবে';
    $('buyAmmo').disabled = !g.canPay(300) || g.arms.ammo >= 240;
    $('ammoState').textContent = `কাছে আছে ${bn(g.arms.ammo)}টা (সর্বোচ্চ ২৪০)`;
  }
  wasted(info) {
    $('wastedCause').textContent = info.cause;
    $('wastedBill').textContent = info.bill;
    $('wastedPaid').textContent = info.paid;
    const bar = $('wardBar');
    bar.classList.remove('run');
    void bar.offsetWidth;
    bar.classList.add('run');
    this.show('wasted');
  }
  busted(info) {
    $('caseNo').textContent = info.caseText;
    const ul = $('caseList');
    ul.innerHTML = '';
    for (const o of info.offenses) { const li = document.createElement('li'); li.textContent = o; ul.appendChild(li); }
    $('caseStars').textContent = '★'.repeat(info.stars) + '☆'.repeat(4 - info.stars);
    $('caseFine').textContent = info.fine;
    $('casePaid').textContent = info.paid;
    $('caseHours').textContent = info.hours;
    const bar = $('jailBar');
    bar.classList.remove('run');
    void bar.offsetWidth;
    bar.classList.add('run');
    this.show('busted');
  }

  prompt(t) {
    this.set('prompt', t, (v) => { $('prompt').textContent = v; $('prompt').classList.toggle('show', !!v); });
  }

  phone(g, open) {
    $('phone').classList.toggle('hidden', !open);
    if (!open) return;
    const list = $('offers');
    list.innerHTML = '';
    // রাইড অ্যাপ: অনলাইন/অফলাইন
    if (g.rideshare) {
      const R = g.rideshare;
      const h = document.createElement('div'); h.className = 'phone-sec'; h.textContent = '🚗 ঝটপট রাইড (রাইড শেয়ার)'; list.appendChild(h);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'offer' + (R.online ? ' active' : '');
      b.innerHTML = '<i></i><div><b></b><span></span></div><em></em>';
      b.querySelector('i').textContent = R.online ? '🟢' : '⚪';
      b.querySelector('b').textContent = R.online ? 'অনলাইন আছেন · চাপলে অফলাইন' : 'অনলাইন হোন';
      b.querySelector('span').textContent = R.status() + ' · গাড়ি/বাইক/সিএনজি চালালে রিকোয়েস্ট আসবে';
      b.querySelector('em').textContent = R.surge() > 1 ? `${bn(R.surge())}×` : '';
      b.onclick = () => { R.toggle(); this.phone(g, true); };
      list.appendChild(b);
    }
    // মিশন (উপরে): গল্পের পরের মিশন, পার্শ্ব মিশন, চলমান মিশন বাতিল
    if (g.missions) {
      const h = document.createElement('div'); h.className = 'phone-sec'; h.textContent = '🎯 মিশন'; list.appendChild(h);
      for (const m of g.missions.list()) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'offer mission' + (m.active ? ' active' : '');
        b.innerHTML = '<i></i><div><b></b><span></span></div><em></em>';
        b.querySelector('i').textContent = m.active ? '▶' : m.story ? '★' : m.done ? '👑' : '◆';
        b.querySelector('b').textContent = m.active ? `চলছে: ${m.name}` : m.name.replace(/^[★◆] /, '');
        b.querySelector('span').textContent = m.active ? `${m.sub} · চাপলে বাতিল` : m.sub;
        b.querySelector('em').textContent = m.pay ? `৳${bnGroup(m.pay)}` : '';
        b.onclick = () => {
          if (m.active) g.missions.cancel();
          else if (m.story) g.missions.startStory();
          else if (m.side) g.missions.startSide(m.side);
          else return;
          g.togglePhone(false);
        };
        list.appendChild(b);
      }
      const h2 = document.createElement('div'); h2.className = 'phone-sec'; h2.textContent = '📦 কাজ'; list.appendChild(h2);
    }
    if (g.jobs.active) {
      const a = g.jobs.active;
      const d = document.createElement('div');
      d.className = 'offer active';
      d.innerHTML = '<b></b><span></span>';
      d.children[0].textContent = 'চলমান কাজ: ' + JOB_INFO[a.type].name;
      d.children[1].textContent = `${a.from.name || a.from.addr} → ${a.to.addr}`;
      list.appendChild(d);
      const c = document.createElement('button');
      c.className = 'btn small';
      c.type = 'button';
      c.textContent = 'কাজ বাতিল (X)';
      c.onclick = () => g.cancelJob();
      list.appendChild(c);
      return;
    }
    g.jobs.offers.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'offer';
      b.innerHTML = '<i></i><div><b></b><span></span><small></small></div><em></em>';
      b.querySelector('i').textContent = bn(i + 1);
      b.querySelector('b').textContent = JOB_INFO[o.type].name + (o.type === 'ride' ? ` · ${o.who}` : '');
      b.querySelector('span').textContent = `${o.from.name || o.from.addr} → ${o.to.addr}`;
      b.querySelector('small').textContent = `${meters(o.d)}${o.limit ? ` · সময় ${bn(Math.round(o.limit / 60))} মিনিট` : ''}${o.type === 'ride' ? ' · যানবাহন লাগবে' : ''}`;
      b.querySelector('em').textContent = o.type === 'ride' ? `৳${bnGroup(o.base)}+` : `৳${bnGroup(o.base)}`;
      b.onclick = () => g.acceptJob(i);
      list.appendChild(b);
    });
  }

  // মেট্রোর ঘোষণা: উপরে কমলা এলইডি ফিতা
  announce(text) {
    const el = $('announce');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.annT);
    this.annT = setTimeout(() => el.classList.remove('show'), 5200);
  }
  toast(text, cls = '') {
    const box = $('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2600);
  }
  bubble(obj, name, text, dur = 2.6) {
    const old = this.bubbles.find((b) => b.obj === obj);
    if (old) this.removeBubble(old);
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = '<b></b><span></span>';
    el.querySelector('b').textContent = name;
    el.querySelector('span').textContent = text;
    $('bubbles').appendChild(el);
    this.bubbles.push({ obj, el, t: dur });
  }
  removeBubble(b) { b.el.remove(); this.bubbles = this.bubbles.filter((x) => x !== b); }

  update(dt, camera, g) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const b of [...this.bubbles]) {
      b.t -= dt;
      if (b.t <= 0) { this.removeBubble(b); continue; }
      b.obj.getWorldPosition(v3);
      v3.y += 2.1;
      v3.project(camera);
      const vis = v3.z < 1;
      const x = Math.min(W - 90, Math.max(90, (v3.x * 0.5 + 0.5) * W));
      const y = Math.min(H - 60, Math.max(80, (-v3.y * 0.5 + 0.5) * H));
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      b.el.style.opacity = vis ? 1 : 0;
    }
    // গন্তব্যের চিহ্ন (পর্দার বাইরে থাকলে কিনারায়)
    const wp = $('waypoint');
    const tgt = g.gpsTarget ? g.gpsTarget() : g.jobs.target();
    if (!tgt || g.state !== 'play') { wp.style.display = 'none'; return; }
    v3.set(tgt.x, 3, tgt.z);
    v3.project(camera);
    let x = v3.x, y = v3.y;
    const behind = v3.z > 1;
    if (behind) { x = -x; y = -y; }
    const m = 0.9;
    const k = Math.max(Math.abs(x) / m, Math.abs(y) / m, behind ? 1 : 0);
    if (k > 1) { x /= k; y /= k; }
    wp.style.display = 'block';
    wp.style.transform = `translate(${(x * 0.5 + 0.5) * W}px, ${(-y * 0.5 + 0.5) * H}px) translate(-50%, -50%)`;
    const d = Math.hypot(tgt.x - g.player.pos.x, tgt.z - g.player.pos.z);
    this.set('wpd', Math.round(d / 10), () => { wp.querySelector('span').textContent = meters(d); });
    this.set('wpc', g.mark ? 'mark' : g.work && g.work.job ? 'drop' : g.jobs.active ? g.jobs.active.stage : 'drop', (s) => { wp.className = 'waypoint ' + s; });
  }
}
