// শব্দ: ইঞ্জিন, হর্ন, রিকশার বেল, পায়ের শব্দ, শহরের গুঞ্জন (সব WebAudio দিয়ে বানানো)
import * as THREE from 'three';
import { store, rand } from './utils.js';
import { LINE_BY_TEXT } from './voicelines.js';

const ENG = {
  car: { base: 45, k: 3.2, type: 'sawtooth', lp: 500, vol: 0.05 },
  ambulance: { base: 42, k: 3, type: 'sawtooth', lp: 480, vol: 0.05 },
  police: { base: 48, k: 3.2, type: 'sawtooth', lp: 520, vol: 0.05 },
  cng: { base: 38, k: 4.5, type: 'square', lp: 700, vol: 0.05, putt: true },
  bike: { base: 60, k: 6.5, type: 'sawtooth', lp: 1100, vol: 0.045 },
  bus: { base: 30, k: 2.5, type: 'sawtooth', lp: 380, vol: 0.06 },
  easybike: { base: 210, k: 14, type: 'sine', lp: 2200, vol: 0.022 },
  autorickshaw: { base: 180, k: 16, type: 'sine', lp: 2000, vol: 0.02 },
  leguna: { base: 40, k: 4, type: 'square', lp: 650, vol: 0.05, putt: true },
  truck: { base: 27, k: 2.3, type: 'sawtooth', lp: 360, vol: 0.065 },
  pickup: { base: 44, k: 3, type: 'sawtooth', lp: 520, vol: 0.05 },
  heli: { base: 34, k: 0.4, type: 'sawtooth', lp: 420, vol: 0.07, putt: true },
  heli_police: { base: 34, k: 0.4, type: 'sawtooth', lp: 420, vol: 0.07, putt: true },
  heli_med: { base: 34, k: 0.4, type: 'sawtooth', lp: 420, vol: 0.07, putt: true },
  plane: { base: 70, k: 1.2, type: 'sawtooth', lp: 900, vol: 0.05 },
  boat: { base: 46, k: 3.5, type: 'sawtooth', lp: 650, vol: 0.05, putt: true },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = store('sp_muted') === '1';
    this.hornT = 3;
    this.listener = null; // THREE.AudioListener (ক্যামেরা ওরিয়েন্টেশন)
    this._cam = null;
    this._v = null;
  }
  // স্থানিক শব্দ: ক্যামেরায় AudioListener + শেয়ারড ctx-এ PannerNode (PositionalAudio-সমতুল্য)
  ensureSpatial(camera) {
    if (!camera) return;
    this._cam = camera;
    this.init();
    if (!this.listener) {
      this.listener = new THREE.AudioListener();
      camera.add(this.listener);
    }
    if (!this._v) this._v = new THREE.Vector3();
  }
  _syncEars() {
    if (!this.ctx || !this._cam) return;
    const l = this.ctx.listener, p = this._cam.getWorldPosition(this._v), e = this._cam.matrixWorld.elements;
    const t = this.ctx.currentTime;
    // ক্যামেরার forward (−Z) ও up (+Y)
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t); l.upY.setValueAtTime(uy, t); l.upZ.setValueAtTime(uz, t);
    } else if (l.setPosition) {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }
  // দূরত্ব অনুযায়ী অবস্থানভিত্তিক শব্দ (HRTF PannerNode ≈ THREE.PositionalAudio)
  playAt(buf, x, y, z, vol = 1, rate = 1) {
    if (!this.ctx || this.muted || !buf || vol < 0.02) return false;
    this._syncEars();
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 14; p.rolloffFactor = 1.15; p.maxDistance = 95;
    if (p.positionX) { p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t); }
    else p.setPosition(x, y, z);
    const g = c.createGain(); g.gain.value = vol;
    s.connect(p).connect(g).connect(this.master);
    s.start();
    return true;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // শহরের গুঞ্জন
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g = (this.humGain = c.createGain()); g.gain.value = 0.05;
    s.connect(f).connect(g).connect(this.master); s.start();
    // ইঞ্জিন
    this.eng = c.createOscillator();
    this.engLP = c.createBiquadFilter(); this.engLP.type = 'lowpass';
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.eng.connect(this.engLP).connect(this.engGain).connect(this.master);
    this.eng.start();
    this.putt = c.createOscillator();
    this.putt.type = 'square'; this.putt.frequency.value = 9;
    this.puttGain = c.createGain(); this.puttGain.gain.value = 0;
    this.putt.connect(this.puttGain).connect(this.engGain.gain);
    this.putt.start();
    // চাকার শব্দ
    const r = c.createBufferSource(); r.buffer = buf; r.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 500;
    this.roadGain = c.createGain(); this.roadGain.gain.value = 0;
    r.connect(rf).connect(this.roadGain).connect(this.master); r.start();
    // পুলিশের সাইরেন: ওঠা-নামা করা সুর
    this.sir = c.createOscillator(); this.sir.type = 'sawtooth'; this.sir.frequency.value = 760;
    const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.45;
    const lfoG = c.createGain(); lfoG.gain.value = 330;
    lfo.connect(lfoG).connect(this.sir.frequency);
    const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.sir.connect(sf).connect(this.sirGain).connect(this.master);
    this.sir.start(); lfo.start();
    // বৃষ্টির ঝিরঝির শব্দ
    const rn = c.createBufferSource(); rn.buffer = buf; rn.loop = true;
    const rnf = c.createBiquadFilter(); rnf.type = 'bandpass'; rnf.frequency.value = 2600; rnf.Q.value = 0.4;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    rn.connect(rnf).connect(this.rainGain).connect(this.master); rn.start();
    // আগুনের চটচট শব্দ
    const fr = c.createBufferSource(); fr.buffer = buf; fr.loop = true;
    const frf = c.createBiquadFilter(); frf.type = 'lowpass'; frf.frequency.value = 900;
    this.fireGain = c.createGain(); this.fireGain.gain.value = 0;
    fr.connect(frf).connect(this.fireGain).connect(this.master); fr.start();
    // মেট্রোর চাকার গুমগুম
    const mt = c.createBufferSource(); mt.buffer = buf; mt.loop = true;
    const mtf = c.createBiquadFilter(); mtf.type = 'lowpass'; mtf.frequency.value = 260;
    this.metroGain = c.createGain(); this.metroGain.gain.value = 0;
    mt.connect(mtf).connect(this.metroGain).connect(this.master); mt.start();
    if (this.pack) this.preload();
  }
  // পুলিশ আর অ্যাম্বুলেন্সের সাইরেন: ফাইল থাকলে ফাইল, না থাকলে কোডে বানানো সুর
  siren(level, amb = 0) {
    if (!this.ctx) return;
    const hp = this.setLoop('siren_police', level * 0.55);
    const ha = this.setLoop('siren_ambulance', amb * 0.55);
    const synth = Math.max(hp ? 0 : level, ha ? 0 : amb);
    this.sirGain.gain.setTargetAtTime(Math.min(0.07, synth * 0.07), this.ctx.currentTime, 0.2);
  }
  // শহর আর লেকের পরিবেশের শব্দ (lake: ০ থেকে ১, লেকের কত কাছে)
  ambience(lake) {
    if (!this.ctx) return;
    const hc = this.setLoop('amb_city', 0.3 * (1 - 0.6 * lake));
    this.setLoop('amb_lake', 0.35 * lake);
    this.humGain.gain.setTargetAtTime(hc ? 0 : 0.05, this.ctx.currentTime, 0.3);
  }

  // বৃষ্টি (০-১) আর কাছের আগুন (০-১)
  weather(rain, fire) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.11, t, 0.6);
    this.fireGain.gain.setTargetAtTime(fire * (0.08 + Math.random() * 0.06), t, 0.05);
    if (rain > 0.5 && Math.random() < 0.0009) this.thunder();
  }
  metro(level) { if (this.ctx) this.metroGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.3); }
  thunder() {
    this.noise(2.6, 0.3, 'lowpass', 400, 40, 0.8);
    this.noise(1.2, 0.18, 'lowpass', 1200, 80, 1, 0.1);
  }
  // গাড়ি বিস্ফোরণ
  boom(vol = 1) {
    if (this.sfx('crash', vol)) { this.noise(1.6, 0.45 * vol, 'lowpass', 900, 40); this.tone('sine', 55, 1.2, 0.4 * vol, 25); return; }
    this.noise(1.8, 0.55 * vol, 'lowpass', 1500, 40);
    this.noise(0.35, 0.35 * vol, 'highpass', 3000, 800, 0.7);
    this.tone('sine', 60, 1.2, 0.45 * vol, 25);
  }

  // ---------- বাইরের শব্দের ফাইল: sounds/manifest.json থাকলে ব্যবহার হয় ----------
  async loadPack(base = 'sounds/') {
    try {
      const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      this.pack = await r.json();
      this.packBase = base;
      this.bufs = new Map();
      this.loops = {};
      this.voicesOn = 0;
      if (this.ctx) this.preload();
    } catch (e) { /* ফাইল নেই, কোডের শব্দই চলবে */ }
  }
  preload() {
    if (!this.pack) return;
    for (const p of Object.values(this.pack.sfx || {})) this.buf(p);
    for (const v of Object.values(this.pack.voice || {})) for (const p of Object.values(v)) this.buf(p);
  }
  buf(p) {
    if (!this.pack || !this.ctx || !p) return null;
    let b = this.bufs.get(p);
    if (b === undefined) {
      this.bufs.set(p, 'loading');
      fetch(this.packBase + p)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((a) => this.ctx.decodeAudioData(a))
        .then((d) => this.bufs.set(p, d))
        .catch(() => this.bufs.set(p, null));
      return null;
    }
    return b && b !== 'loading' ? b : null;
  }
  playBuf(b, vol = 1, rate = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g).connect(this.master);
    s.start();
    return s;
  }
  sfx(id, vol = 1, rate = 1) {
    const b = this.pack && this.buf(this.pack.sfx[id]);
    if (!b) return false;
    this.playBuf(b, vol, rate);
    return true;
  }
  // লুপ (ইঞ্জিন, সাইরেন, পরিবেশ): ফাইল থাকলে আওয়াজ ঠিক করে true ফেরত দেয়
  setLoop(id, vol, rate = 1) {
    const b = this.pack && this.buf(this.pack.sfx[id]);
    if (!b) return false;
    let L = this.loops[id];
    if (!L) {
      if (vol < 0.005) return true;
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g).connect(this.master);
      s.start();
      L = this.loops[id] = { s, g };
    }
    const t = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(vol, t, 0.15);
    L.s.playbackRate.setTargetAtTime(rate, t, 0.1);
    return true;
  }
  // কণ্ঠ: বুদবুদের লেখার সাথে মিলিয়ে, দূরে থাকলে আস্তে
  voice(text, female, dist = 0) {
    const l = LINE_BY_TEXT.get(text);
    if (l) this.voiceId(l.id, female, dist);
  }
  voiceId(id, female = false, dist = 0) {
    if (!this.pack || !this.ctx || !this.pack.voice) return;
    const v = this.pack.voice[id];
    if (!v || this.voicesOn > 4) return;
    const p = (female && v.f) || v.m || v.f;
    const b = this.buf(p);
    const vol = Math.max(0, 1 - (isFinite(dist) ? dist : 0) / 60);
    if (!b || vol < 0.05) return;
    const s = this.playBuf(b, 0.95 * vol, rand(0.97, 1.03));
    this.voicesOn++;
    s.onended = () => { this.voicesOn--; };
  }
  thud(power = 1) {
    if (this.sfx('punch', 0.3 + power * 0.6)) return;
    this.noise(0.18, 0.2 * power + 0.05, 'lowpass', 700, 120);
    this.tone('sine', 120, 0.18, 0.25 * power, 50);
  }
  // ঘুষি/লাথির আঘাত: স্থানিক
  punchHit(x, y, z, power = 1) {
    const vol = 0.35 + power * 0.55;
    const b = this.pack && this.buf(this.pack.sfx.punch);
    if (b && this.playAt(b, x, y, z, vol, rand(0.92, 1.08))) return;
    this.thud(power);
  }
  // খোসা মাটিতে পড়ার টং
  casing(x, y, z) {
    if (!this.ctx || this.muted) return;
    if (this._cam) {
      const lp = this._cam.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
      if (Math.hypot(x - lp.x, z - lp.z) > 28) return;
    }
    const dly = 0.08 + Math.random() * 0.1;
    this.tone('triangle', rand(2200, 3200), 0.035, 0.04, 900, dly, 4000);
    this.noise(0.04, 0.035, 'highpass', 5000, 2500, 1, dly + 0.02);
  }
  // পথচারীর ভয়ের চিৎকার (স্থানিক ভয়েস)
  panicScream(x, y, z, female = false) {
    const ids = ['flee_01', 'flee_02', 'flee_03', 'crowd_01', 'crowd_02', 'shot_01'];
    const id = ids[(Math.random() * ids.length) | 0];
    if (!this.pack || !this.ctx || !this.pack.voice) return;
    const v = this.pack.voice[id];
    if (!v || this.voicesOn > 4) return;
    const p = (female && v.f) || v.m || v.f;
    const b = this.buf(p);
    if (!b) return;
    if (this.playAt(b, x, y, z, 0.85, rand(0.97, 1.04))) { this.voicesOn++; setTimeout(() => { this.voicesOn--; }, 2500); return; }
    let dist = 0;
    if (this._cam) {
      const lp = this._cam.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
      dist = Math.hypot(x - lp.x, z - lp.z);
    }
    this.voiceId(id, female, dist);
  }
  whistle() {
    if (this.sfx('whistle', 0.5)) return;
    for (let i = 0; i < 3; i++) this.tone('sine', 2900 + (i % 2) * 250, 0.12, 0.07, null, i * 0.13);
  }
  gunshot(vol = 1) {
    if (this.sfx('gunshot', 0.9 * vol, rand(0.95, 1.05))) return;
    this.noise(0.16, 0.45 * vol, 'highpass', 1800, 400, 0.7);
    this.noise(0.25, 0.3 * vol, 'lowpass', 900, 120);
    this.tone('square', 140, 0.08, 0.12 * vol, 60);
  }
  // স্থানিক গুলি (দূরত্ব অনুযায়ী)
  gunshotAt(x, y, z, vol = 1) {
    const b = this.pack && this.buf(this.pack.sfx.gunshot);
    if (b && this.playAt(b, x, y, z, 0.9 * vol, rand(0.95, 1.05))) {
      this.casing(x, y - 0.4, z);
      return;
    }
    let atten = vol;
    if (this._cam) {
      const lp = this._cam.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
      atten = vol * Math.max(0.12, 1 - Math.hypot(x - lp.x, z - lp.z) / 90);
    }
    this.gunshot(atten);
    this.casing(x, y - 0.4, z);
  }
  whoosh() { this.noise(0.12, 0.05, 'bandpass', 1200, 500, 2); }
  click() { this.tone('square', 1800, 0.03, 0.05); }
  hurt() { this.tone('sawtooth', 220, 0.18, 0.08, 140, 0, 900); }
  flip() {
    if (this.sfx('crash', 0.9)) { this.sfx('glass', 0.6); return; }
    this.noise(0.6, 0.35, 'lowpass', 3000, 150);
    this.noise(0.3, 0.12, 'highpass', 5000, 2500, 1, 0.08); // কাচ ভাঙার শব্দ
    this.tone('sine', 70, 0.5, 0.35, 35);
  }
  setMuted(m) {
    this.muted = m;
    store('sp_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.05);
  }
  // প্রতি ফ্রেম: যে যানবাহন চালাচ্ছেন তার ইঞ্জিন
  update(dt, vtype, speed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const e = ENG[vtype];
    // ফাইলের ইঞ্জিনের শব্দ থাকলে সেটা, গতির সাথে সুর চড়ে
    const ek = vtype === 'police' || vtype === 'ambulance' ? 'car' : vtype;
    let fileEng = false;
    for (const k of ['car', 'cng', 'bike', 'bus']) {
      const on = k === ek && e;
      const has = this.setLoop('eng_' + k, on ? 0.4 * (0.6 + throttle * 0.5) : 0, on ? 0.75 + Math.min(1.2, Math.abs(speed) * 0.04) : 1);
      if (on && has) fileEng = true;
    }
    if (e) {
      this.eng.type = e.type;
      this.eng.frequency.setTargetAtTime(e.base + Math.abs(speed) * e.k + throttle * 10, t, 0.06);
      this.engLP.frequency.setTargetAtTime(e.lp + throttle * 400, t, 0.1);
      this.engGain.gain.setTargetAtTime(fileEng ? 0 : e.vol * (0.6 + throttle * 0.6), t, 0.1);
      this.puttGain.gain.setTargetAtTime(e.putt ? e.vol * 0.5 : 0, t, 0.1);
      this.putt.frequency.setTargetAtTime(8 + Math.abs(speed) * 1.2, t, 0.1);
    } else {
      this.engGain.gain.setTargetAtTime(0, t, 0.15);
      this.puttGain.gain.setTargetAtTime(0, t, 0.1);
    }
    this.roadGain.gain.setTargetAtTime(vtype ? Math.min(0.08, Math.abs(speed) * 0.004) : 0, t, 0.1);
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = rand(2.5, 6);
      this.beep(rand(420, 620), 0.02, 2);
    }
  }
  tone(type, f0, dur, vol, f1 = null, delay = 0, lp = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.02, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
    n.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol, type = 'lowpass', f0 = 2000, f1 = 200, q = 1, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  beep(f, vol, n = 2) {
    for (let i = 0; i < n; i++) { this.tone('square', f, 0.12, vol, null, i * 0.16, 2200); this.tone('square', f * 1.25, 0.12, vol * 0.8, null, i * 0.16, 2200); }
  }
  // হর্ন: যানবাহন অনুযায়ী
  // pitch: প্রতি গাড়ির নিজের সুর (০.৮৫-১.২); style: 'long' = বাস-ট্রাকের হাইড্রলিক হর্ন, 'double' = দুই টোকা
  horn(type, vol = 1, dist = 0, pitch = 1, style = '') {
    const v = vol * Math.max(0.05, 1 - dist / 120);
    if (style === 'long' && (type === 'bus' || type === 'truck')) { // পা-পা-পুঁ… (ঢাকার বাসের চেনা সুর)
      const f = 220 * pitch;
      [[1, 0.18, 0], [1.26, 0.18, 0.22], [1.5, 0.75, 0.44]].forEach(([k, d, t]) => { this.tone('sawtooth', f * k, d, 0.12 * v, null, t, 1400); this.tone('square', f * k * 1.005, d, 0.05 * v, null, t, 1100); });
      return;
    }
    const hid = type === 'rickshaw' ? 'bell_rickshaw' : type === 'police' || type === 'ambulance' ? 'horn_car' : 'horn_' + type;
    if (this.sfx(hid, 0.8 * v, pitch)) { if (style === 'double') this.sfx(hid, 0.7 * v, pitch); return; }
    if (style === 'double' && type !== 'rickshaw' && type !== 'bus') { this.beep(440 * pitch, 0.09 * v, 2); return; }
    if (type === 'rickshaw') {
      for (let i = 0; i < 2; i++) { this.tone('sine', 2400, 0.25, 0.08 * v, null, i * 0.22); this.tone('sine', 3200, 0.2, 0.05 * v, null, i * 0.22); }
    } else if (type === 'bus') {
      this.tone('sawtooth', 150 * pitch, 0.6, 0.15 * v, null, 0, 900); this.tone('sawtooth', 189 * pitch, 0.6, 0.12 * v, null, 0, 900);
    } else if (type === 'bike') {
      this.tone('square', 700 * pitch, 0.18, 0.08 * v, null, 0, 2400); this.tone('square', 700 * pitch, 0.12, 0.07 * v, null, 0.24, 2400); // পিপ-পিপ
    } else {
      this.beep((type === 'cng' ? 560 : 440) * pitch, 0.1 * v, type === 'cng' ? 3 : 1);
    }
  }
  // রিকশার বেল: টুংটাং (পরপর কয়েকবার)
  bell(vol = 1, dist = 0) {
    const v = vol * Math.max(0.05, 1 - dist / 45);
    if (this.sfx('bell_rickshaw', 0.7 * v, 0.95 + Math.random() * 0.1)) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { this.tone('sine', 2350, 0.22, 0.07 * v, null, i * 0.16); this.tone('sine', 3150, 0.16, 0.045 * v, null, i * 0.16); this.tone('triangle', 4700, 0.08, 0.02 * v, null, i * 0.16); }
  }
  // হেল্পার বাসের গায়ে চাপড় দেয় (থাপ-থাপ: "ওস্তাদ, যান!")
  slap(dist = 0) {
    const v = Math.max(0.05, 1 - dist / 35);
    for (let i = 0; i < 2; i++) { this.noise(0.07, 0.22 * v, 'lowpass', 900, 160, 1, i * 0.2); this.tone('sine', 95, 0.09, 0.12 * v, 60, i * 0.2); }
  }
  // রাস্তার ভিড়ের গুঞ্জন (হালকা, দূরত্ব অনুযায়ী)
  crowdMurmur(vol = 0.3, dist = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this._murmurT && now < this._murmurT) return;
    this._murmurT = now + 0.45;
    const v = Math.max(0.02, vol * (1 - dist / 40));
    this.noise(0.55, 0.045 * v, 'bandpass', 900, 500, 0.8);
    this.noise(0.4, 0.03 * v, 'bandpass', 1400, 700, 0.6, 0.08);
    if (Math.random() < 0.45) this.tone('triangle', rand(180, 320), 0.18, 0.02 * v, null, 0.05, 900);
  }
  step() { if (this.sfx('step', 0.25, rand(0.9, 1.1))) return; this.noise(0.04, 0.03, 'lowpass', 900, 300); }
  crash(power = 1) {
    if (this.sfx('crash', 0.3 + power * 0.6)) return;
    this.noise(0.4, 0.3 * power + 0.08, 'lowpass', 2500, 200);
    this.tone('sine', 90, 0.3, 0.3 * power + 0.05, 40);
  }
  // মেট্রোর ঘোষণা আর দরজা বন্ধের টুং-টাং
  chime(kind = 'ann') {
    if (kind === 'door') { for (let i = 0; i < 6; i++) this.tone('square', i % 2 ? 1180 : 1480, 0.11, 0.035, null, i * 0.16, 2600); return; }
    [784, 988, 1175, 1568].forEach((f, i) => this.tone('sine', f, 0.5, 0.09, null, i * 0.22));
  }
  // যন্ত্রের কণ্ঠে বাংলা ঘোষণা: ব্রাউজারে বাংলা কণ্ঠ থাকলে
  speak(text) {
    try {
      if (this.muted || !window.speechSynthesis) return;
      const v = speechSynthesis.getVoices().find((x) => /^bn/i.test(x.lang));
      if (!v) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.95; u.volume = 0.8;
      setTimeout(() => speechSynthesis.speak(u), 900);
    } catch (e) { /* কণ্ঠ না থাকলে শুধু লেখা */ }
  }
  door() { if (this.sfx('door', 0.6)) return; this.noise(0.08, 0.15, 'lowpass', 1200, 300); this.tone('sine', 140, 0.08, 0.12, 80, 0.05); }
  money() { if (this.sfx('money', 0.6)) return; this.tone('sine', 1046, 0.09, 0.12); this.tone('sine', 1568, 0.25, 0.12, null, 0.08); }
  ping() { this.tone('sine', 880, 0.12, 0.1); this.tone('sine', 1320, 0.18, 0.08, null, 0.1); }
  phone() { if (this.sfx('phone', 0.5)) return; this.tone('sine', 660, 0.06, 0.08); }
}
