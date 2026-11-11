// শহরের পথে (ডেমো): মূল গেম
import * as THREE from 'three';
import { bn, rand, pick, clamp, lerp, damp, store, isTouch } from './utils.js';
import { buildTextures, FONT } from './textures.js';
import { loadMap } from './mapgen.js';
import { World } from './world.js';
import { Vehicle, THROW, SIDE_FLIP, TURN_FLIP, MASS, tickDoors } from './vehicles.js';
import { Vfx } from './vfx.js';
import { Wrecks, crashDmg } from './wreck.js';
import { Sky } from './sky.js';
import { Robbery } from './robbery.js';
import { BigMap } from './bigmap.js';
import { makeCraft } from './air.js';
import { OPEN, HEAVY } from './morevehicles.js';
import { Interiors } from './interiors.js';
import { Work } from './workjobs.js';
import { Buses } from './buses.js';
import { Metro } from './metro.js';
import { Gfx } from './gfx.js';
import { StreetDress } from './streetdress.js';
import { BusPax } from './buspax.js';
import { JamHawkers } from './jamhawkers.js';
import { Hawkers } from './hawkers.js';
import { Fuel } from './fuel.js';
import { Garage } from './garage.js';
import { Flood } from './flood.js';
import { RideShare } from './rideshare.js';
import { ShopFolk } from './shopfolk.js';
import { TownLife, assignCivic, CIVIC_PIN } from './townlife.js';
import { RoadWorks } from './roadworks.js';
import { Law } from './law.js';
import { Combat } from './combat.js';
import { Medic } from './medic.js';
import { setPose, giveGun, makeRig } from './rig.js';
import { loadReal, REAL } from './realrig.js';
import { VM, loadVehicleModels } from './vmodels.js';
import { Property } from './property.js';
import { Signals } from './signals.js';
import { Missions } from './missions.js';
import { V, checkUpdate } from './ver.js';
import { Traffic, disposeTree } from './traffic.js';
import { Player } from './player.js';
import { Jobs } from './jobs.js';
import { Nav } from './nav.js';
import { Minimap } from './minimap.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { UI, bnGroup, meters } from './ui.js';

const MOBILE = isTouch();
const CAM_DIST = { foot: 4.4, car: 7.5, cng: 6.2, bike: 5.2, rickshaw: 6.2, ambulance: 9, bus: 13, train: 24, truck: 12, leguna: 8, pickup: 8, easybike: 6.4, autorickshaw: 6.2, van: 6, heli: 14, heli_police: 14, heli_med: 14, plane: 19, boat: 9, inside: 3.2 };
const CAM_H = { foot: 1.55, car: 1.4, cng: 1.6, bike: 1.4, rickshaw: 1.8, ambulance: 2.2, bus: 3.2, train: 4.5, truck: 3.4, leguna: 2.2, pickup: 1.6, easybike: 1.9, autorickshaw: 1.8, van: 1.6, heli: 3.2, heli_police: 3.2, heli_med: 3.2, plane: 4, boat: 2.2, inside: 1.6 };
const MECHANIC = 800;
const HOSPITAL_BILL = 1000;
const PISTOL_PRICE = 2000, AMMO_PRICE = 300;
const CREDIT = 2000; // বাকির সীমা

function angDamp(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

async function waitFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const t = new Promise((r) => setTimeout(r, 2500));
  try { await Promise.race([document.fonts.load(`700 40px ${FONT}`), t]); } catch (e) { /* ফন্ট না এলেও চলবে */ }
}

class Game {
  constructor(map) {
    this.canvas = document.getElementById('game');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !MOBILE, alpha: true, powerPreference: 'high-performance' }));
    // ফোনে অন্য অ্যাপে গেলে গ্রাফিক্স হারিয়ে যেতে পারে; ফিরে এলে নতুন করে লোড (মোবাইলে আঁকা ছবির ক্যানভাস খালি করা থাকে)
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    this.canvas.addEventListener('webglcontextrestored', () => { try { this.save(); } catch (e) { /* না হলেও চলে */ } location.reload(); });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.75));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05; // gfx.apply() হাই/লোতে আকাশ অনুযায়ী ওভাররাইড করে
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe6d2b2, 90, 470); // ঢাকার ধুলোমাখা বাতাস
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1500); // কাছের সীমা একটু দূরে: দূরের রাস্তা ঝিলমিল কমে
    this.mobile = MOBILE;
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x7a6a50, 1.25);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffe2b8, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun, sun.target);

    this.T = buildTextures();
    this.map = map;
    assignCivic(this.map); // স্কুল, মাদ্রাসা, আদালত, ব্যাংক, বিদ্যুৎ অফিস, ডাকঘর
    this.world = new World(this.scene, this.T, this.map);
    this.world.game = this;
    this.vehicles = this.map.parked.map((p) => new Vehicle(this.scene, p.type, { x: p.x, z: p.z, yaw: p.yaw, dynWheels: true, owned: true }));
    // আকাশ আর পানির যানবাহন: বিমানবন্দরে বিমান-হেলিকপ্টার, ছাদের হেলিপ্যাডে হেলিকপ্টার, ঘাটে স্পিডবোট
    this.craft = { boats: [] };
    const E = this.map.extras, pl0 = this.map.places;
    const addCraft = (key, type, o) => { const v = makeCraft(this.scene, type, { ...o, owned: true }); this.vehicles.push(v); if (key) this.craft[key] = v; return v; };
    if (E) {
      addCraft('plane', 'plane', E.planeSpot);
      addCraft('heliAir', 'heli', E.heliSpot);
      for (const gh of E.ghats) { gh.boatV = addCraft(null, 'boat', gh.boat); this.craft.boats.push(gh.boatV); }
    }
    const roofHeli = (b, type, key) => { if (b && b.area > 150) addCraft(key, type, { x: b.x, z: b.z, y: b.h, yaw: 0 }); };
    roofHeli(pl0.hospital, 'heli_med', 'heliMed');
    roofHeli(pl0.thana, 'heli_police', 'heliPolice');
    roofHeli((pl0.offices || [])[0], 'heli', 'heliOffice');
    this.traffic = new Traffic(this.scene, this.map, this.world);
    this.traffic.maxCars = this.carsBase = MOBILE ? 28 : 48; // রাস্তায় ভিড় (মোড়ে জ্যাম লাগে); ধীর হলে নিচে নিজে কমে
    this.signals = new Signals(this); // ট্রাফিক সিগন্যাল
    this.traffic.maxPeds = MOBILE ? 10 : 18;
    this.traffic.patrolMax = MOBILE ? 1 : 2;
    this.traffic.g = this;
    this.player = new Player(this.scene);
    this.player.place(this.map.spawn.x, this.map.spawn.z, this.map.spawn.yaw);
    this.jobs = new Jobs(this);
    this.nav = new Nav(this.map, this.world);
    this.combat = new Combat(this);
    this.medic = new Medic(this);
    this.law = new Law(this);
    this.vfx = new Vfx(this.scene);
    this.vfx.world = this.world;
    this.wrecks = new Wrecks(this);
    this.robbery = new Robbery(this);
    this.minimap = new Minimap(document.getElementById('minimap'), this.map);
    this.sound = new Sound();
    this.input = new Input();
    this.ui = new UI();
    this.sky = new Sky(this, this.hemi, this.sun);
    this.bigmap = new BigMap(this);
    this.interiors = new Interiors(this);
    this.work = new Work(this);
    this.buses = new Buses(this);
    this.metro = new Metro(this);
    this.life = new TownLife(this); // দোকানদার, কেনাকাটা, ক্লাস, আদালত, ব্যাংক, অফিস, আসা-যাওয়া
    this.property = new Property(this); // বাড়ি কেনা
    this.missions = new Missions(this); // মিশন
    // ল্যাম্পপোস্ট-গাছ ভাঙার শব্দ
    this.world.onBreak = (it) => { this.sound.crash(it.kind === 'tree' ? 0.45 : 0.35); this.shake = Math.max(this.shake || 0, 0.15); };
    this.inside = null;
    this.mark = null;
    this.meters = meters;

    const save = (() => { try { return JSON.parse(store('sp_save') || 'null'); } catch (e) { return null; } })();
    this.money = save ? save.money : 500;
    this.mrtPass = save ? save.mrt || 0 : 0;
    this.rating = save ? save.rating : 4.5;
    this.jobsDone = save ? save.jobs : 0;
    // শুরু থেকেই পিস্তল আর ৪৮টা গুলি (আগের সেভে পিস্তল না থাকলেও)
    this.arms = { pistol: true, ammo: save && save.pistol ? save.ammo || 0 : 48 };
    this.weapon = 'fist';
    this.aiming = false;
    this.hurtT = 0;
    this.lastHurt = -99;

    this.state = 'menu';
    this.time = 0;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.zoom = 0;
    this.lookIdle = 9;
    this.camPos = new THREE.Vector3();
    this.phoneOpen = false;
    this.route = null;
    this.routeT = 0;
    this.mapT = 0;
    this.offersT = -99;
    this.dress = new StreetDress(this);
    this.busPax = new BusPax(this); // বাসের যাত্রী, ঝোলা লোক, হেল্পার
    this.jamHawkers = new JamHawkers(this); // জ্যামে গাড়ির ফাঁকে ফেরিওয়ালা
    this.hawkers = new Hawkers(this); // ফুটপাতের হকার (কেনা যায়, গাড়িতে ভাঙে)
    try { this.fuel = new Fuel(this); } catch (e) { console.warn('fuel', e); } // পেট্রোল পাম্প, জ্বালানি
    try { this.garage = new Garage(this); } catch (e) { console.warn('garage', e); } // নিজের গ্যারেজ
    try { this.flood = new Flood(this); } catch (e) { console.warn('flood', e); } // বৃষ্টিতে জলাবদ্ধতা, ছাতা
    try { this.rideshare = new RideShare(this); } catch (e) { console.warn('rideshare', e); } // রাইড অ্যাপ
    try { this.shopFolk = new ShopFolk(this); } catch (e) { console.warn('shopfolk', e); } // কাচের দোকানের ভিতরের মানুষ
    // ঢাকার রাস্তার সাজ: তার, ব্যানার, সাইনবোর্ড, দোকান (বাস কাউন্টার, মেট্রো গেট, দরজা এড়িয়ে)
    try { this.works = new RoadWorks(this); } catch (e) { console.warn('roadworks', e); } // ভাঙা রাস্তা, গর্ত, মেরামতের কাজ
    this.gfx = new Gfx(this);
    this.bindUI();
    this.gfx.apply();
    // আসল মানুষের মডেল (assets/player.glb): লোড হলে আপনার চরিত্র আর কাছের পথচারীরা
    VM.cam = this.camPos; VM.world = this.world;
    { const vl = document.getElementById('verLabel'); if (vl) vl.textContent = `ভার্সন ${bn(V)}`; }
    checkUpdate((nv) => {
      // একবারই নিজে খোলে (ক্যাশ না ছাড়লে বারবার না ঘোরে)
      let done = null; try { done = sessionStorage.getItem('sp_reload'); } catch (e) { /* ঠিক আছে */ }
      if (done === String(nv)) { this.ui.toast(`নতুন ভার্সন ${bn(nv)} আছে, কিন্তু ফোন পুরোনোটা দেখাচ্ছে। ব্রাউজারে পেজটা রিফ্রেশ করুন`, 'bad'); return; }
      try { sessionStorage.setItem('sp_reload', String(nv)); } catch (e) { /* ঠিক আছে */ }
      this.ui.toast(`নতুন ভার্সন ${bn(nv)} এসেছে, নতুন করে খুলছি…`, 'good'); setTimeout(() => location.reload(), 1500);
    });
    loadReal().then((ok) => { if (ok) this.player.useReal(); else setTimeout(() => this.ui.toast(`আসল চরিত্র লোড হয়নি${REAL.err ? ': ' + REAL.err.slice(0, 80) : ''}`, 'bad'), 3000); })
      .finally(() => loadVehicleModels().then(() => {
        // কোনো যানবাহনের মডেল লোড না হলে কারণসহ জানানো (স্ক্রিনশট দিলে ধরা যায়)
        if (VM.errors.length) this.ui.toast(`কিছু গাড়ির মডেল লোড হয়নি — ${VM.errors.join(' | ').slice(0, 140)}`, 'bad');
        return this.world.treeModels.load();
      }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  bnMoney(n) { return bnGroup(n); }
  say(obj, name, text, dur) {
    this.ui.bubble(obj, name, text, dur);
    // কণ্ঠের ফাইল থাকলে বাজে, দূরে হলে আস্তে
    let dist = 0;
    try { const p = new THREE.Vector3(); obj.getWorldPosition(p); dist = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z); } catch (e) { /* অবস্থান না পেলে কাছেই ধরি */ }
    this.sound.voice(text, !!(obj.userData && obj.userData.female), dist);
  }
  allVehicles() { return [...this.vehicles, ...this.traffic.cars.map((c) => c.v), ...this.law.vehicles(), ...this.medic.units.map((u) => u.v), ...(this.work ? this.work.vehicles() : []), ...(this.buses ? this.buses.vehicles() : [])]; }
  // বাকিতে কেনা: টাকা −৳২,০০০ পর্যন্ত নামতে পারে, পরের আয় থেকে আপনি শোধ হয়
  canPay(n) { return this.money - n >= -CREDIT; }
  spend(n, what) {
    if (!this.canPay(n)) {
      this.ui.toast(`বাকির সীমা (৳${bnGroup(CREDIT)}) শেষ, আগে কিছু আয় করুন`, 'bad');
      return false;
    }
    this.money -= n;
    if (this.money < 0) this.ui.toast(`${what ? what + ' — ' : ''}বাকিতে কিনলেন, এখন বাকি ৳${bnGroup(-this.money)}`, 'bad');
    this.save();
    return true;
  }
  // বিল/জরিমানা: যতটা বাকির সীমায় ধরে ততটাই কাটে
  charge(n) { const paid = Math.min(n, Math.max(0, this.money + CREDIT)); this.money -= paid; this.save(); return paid; }
  addMoney(n, stars) {
    this.money += n;
    this.rating = clamp(this.rating * 0.85 + stars * 0.15, 1, 5);
    this.save();
  }
  save() { if (this.life) this.life.save(); store('sp_save', JSON.stringify({ money: Math.round(this.money), rating: this.rating, jobs: this.jobsDone, mrt: this.mrtPass || 0, pistol: this.arms.pistol, ammo: this.arms.ammo })); }

  bindUI() {
    const I = this.input;
    I.bind(this.canvas, document.getElementById('touch'));
    const $ = (id) => document.getElementById(id);
    $('btnStart').onclick = () => this.start();
    $('btnResume').onclick = () => this.resume();
    $('btnPause').onclick = () => this.pause();
    $('btnSound').onclick = () => this.toggleMute();
    $('btnPhone').onclick = () => this.togglePhone();
    $('btnReset').onclick = () => { this.money = 500; this.rating = 4.5; this.jobsDone = 0; this.arms = { pistol: true, ammo: 48 }; this.save(); this.ui.toast('হিসাব নতুন করে শুরু', ''); };
    $('phoneClose').onclick = () => this.togglePhone(false);
    const gs = $('gfxSel');
    if (gs) { gs.value = this.gfx.q; gs.onchange = () => { this.gfx.set(gs.value); this.ui.toast(gs.value === 'high' ? 'উঁচু মানের গ্রাফিক্স চালু' : 'সাধারণ গ্রাফিক্স (দ্রুত)', ''); }; }
    const tt = $('touchToggle');
    const saved = store('sp_touch');
    this.showTouch = saved === null ? MOBILE : saved === '1';
    tt.checked = this.showTouch;
    tt.onchange = () => { this.showTouch = tt.checked; store('sp_touch', tt.checked ? '1' : '0'); this.applyTouch(); };
    this.updateSoundIcon();
    I.on('canLock', () => this.state === 'play' && !this.phoneOpen);
    I.on('use', () => this.use());
    I.on('jump', () => { if (this.state !== 'play') return; if (this.inside && this.inside.room.kind === 'metro' && this.interiors.concourse.tryVault()) return; this.player.jump(this); });
    I.on('phone', () => this.togglePhone());
    I.on('horn', () => {
      const v = this.player.vehicle;
      if (this.state !== 'play' || !v || this.player.state !== 'drive') return;
      // পুলিশের গাড়ি বা অ্যাম্বুলেন্সে সাইরেন চালু/বন্ধ
      if (v.type === 'police' || v.type === 'ambulance') { v.siren = !v.siren; this.ui.toast(v.siren ? 'সাইরেন চালু' : 'সাইরেন বন্ধ', ''); }
      else { this.sound.horn(v.type, 1, 0); if (Math.random() < 0.15) this.sound.voiceId('player_horn_01'); if (this.jamHawkers) this.jamHawkers.honk(); } // জানালার ফেরিওয়ালার থেকে কেনা
    });
    I.on('mute', () => this.toggleMute());
    I.on('map', () => this.toggleMap());
    I.on('bag', () => this.life && this.life.openBag());
    $('btnMap').onclick = () => this.toggleMap();
    if ($('btnBag')) $('btnBag').onclick = () => this.life && this.life.openBag();
    document.getElementById('minimap').addEventListener('click', () => this.toggleMap(true));
    I.on('pause', () => (this.state === 'busted' || this.state === 'wasted' ? null : this.state === 'map' ? this.toggleMap(false) : this.state === 'dialog' ? this.interiors.closeDialog() : this.state === 'shop' ? this.closeShop() : this.state === 'pause' ? this.resume() : this.phoneOpen ? this.togglePhone(false) : this.pause()));
    I.on('blur', () => { if (this.state === 'play') this.pause(); });
    I.on('o1', () => (this.state === 'dialog' ? this.interiors.pick(0) : this.phoneOpen ? this.acceptJob(0) : this.setWeapon('fist')));
    I.on('o2', () => (this.state === 'dialog' ? this.interiors.pick(1) : this.phoneOpen ? this.acceptJob(1) : this.setWeapon('pistol')));
    I.on('o4', () => this.state === 'dialog' && this.interiors.pick(3));
    I.on('o5', () => this.state === 'dialog' && this.interiors.pick(4));
    I.on('weapon', () => this.setWeapon(this.weapon === 'pistol' ? 'fist' : 'pistol'));
    I.on('attack', () => this.attack());
    // ডান ক্লিক: পিস্তল হাতে থাকলে নিশানা, খালি হাতে লাথি
    I.on('alt', () => { if (!(this.weapon === 'pistol' && this.arms.pistol)) this.kickNow(); });
    I.on('kick', () => this.kickNow());
    I.on('fight', () => this.fightNow());
    I.on('repair', () => this.fixNow());
    I.on('act', () => this.actNow());
    I.on('rideYes', () => this.rideshare && this.rideshare.accept());
    I.on('shoot', () => this.shootTouch());
    $('btnHospital').onclick = () => this.release();
    $('shopClose').onclick = () => this.closeShop();
    $('buyPistol').onclick = () => this.buy('pistol');
    $('buyAmmo').onclick = () => this.buy('ammo');
    I.on('o3', () => (this.state === 'dialog' ? this.interiors.pick(2) : this.phoneOpen && this.acceptJob(2)));
    I.on('cancel', () => (this.rideshare && this.rideshare.req && !this.phoneOpen ? this.rideshare.reject() : this.phoneOpen ? this.cancelJob() : this.state === 'play' && this.work.job && this.work.cancel()));
    I.on('view', () => { this.zoom = this.zoom > 2 ? -1 : this.zoom + 1.5; });
    I.on('enter', () => { if (this.state === 'menu') this.start(); else if (this.state === 'pause') this.resume(); else if ((this.state === 'busted' || this.state === 'wasted') && this.bustReady) this.release(); });
    $('btnRelease').onclick = () => this.release();
  }
  applyTouch() {
    const on = this.showTouch && this.state === 'play';
    document.getElementById('touch').classList.toggle('hidden', !on);
    document.body.classList.toggle('touching', this.showTouch);
    document.body.classList.toggle('playing', this.state !== 'menu');
    this.touchMode = null;
    this.updateTouchMode();
  }
  // গাড়িতে উঠলে GTA মোবাইলের মতো বোতাম (ডান-বাম, গ্যাস-ব্রেক), আকাশে উপরে-নিচে
  updateTouchMode() {
    const P = this.player, v = P.state === 'drive' && P.vehicle;
    // হাঁটার সময় কাছে কিছু থাকলে (ওঠা, ঢোকা, কেনা...) তবেই "ব্যবহার" বোতাম, লেখাও সেই কাজের
    const pt = (document.getElementById('prompt') || {}).textContent || '';
    const can = !v && /:/.test(pt) && P.state === 'foot';
    document.body.classList.toggle('canuse', can);
    document.body.classList.toggle('armed', !!(this.arms.pistol && this.arms.ammo > 0));
    if (can) {
      const w = /উঠুন/.test(pt) ? 'উঠুন' : /ঢুকুন/.test(pt) ? 'ঢুকুন' : /কিনুন/.test(pt) ? 'কিনুন' : /ছিনিয়ে|নিয়ে নিন/.test(pt) ? 'ছিনিয়ে নিন' : /নামুন/.test(pt) ? 'নামুন' : 'ব্যবহার';
      if (w !== this.useLab) { this.useLab = w; const b = document.querySelector('#touch [data-key="use"]'); if (b) b.textContent = w; }
    }
    const mode = !v ? 'foot' : v.air || v.spec.air ? 'fly' : 'drive';
    if (mode === this.touchMode) return;
    this.touchMode = mode;
    document.body.classList.toggle('driving', mode !== 'foot');
    document.body.classList.toggle('flying', mode === 'fly');
    const lab = (k, t) => { const b = document.querySelector(`#touch [data-key="${k}"]`); if (b) b.textContent = t; };
    lab('space', mode === 'fly' ? '⬆' : mode === 'drive' ? 'হ্যান্ড ব্রেক' : '⤴');
    lab('run', mode === 'fly' ? '⬇' : '🏃');
    // উপরের বোতাম: ফোনে শুধু আইকন
    const ic = { btnPhone: ['📱', 'ফোন'], btnMap: ['🗺️', 'ম্যাপ'], btnBag: ['🎒', 'ব্যাগ'] };
    for (const [id, [i, t]] of Object.entries(ic)) { const b = document.getElementById(id); if (b) b.textContent = this.showTouch ? i : t; }
    lab('use', mode === 'foot' ? 'ব্যবহার' : 'নামা'); this.useLab = null;
    this.input.touch.left = this.input.touch.right = this.input.touch.up = false;
  }
  // ফোনে পুরো পর্দা আর আড়াআড়ি (যেখানে ব্রাউজার দেয়)
  goLandscape() {
    if (!MOBILE) return;
    try {
      const el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = fs && !document.fullscreenElement ? fs.call(el, { navigationUI: 'hide' }) : null;
      const lock = () => { try { const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (q && q.catch) q.catch(() => {}); } catch (e) { /* না দিলে ঘোরানোর পর্দা */ } };
      if (p && p.then) p.then(lock, lock); else lock();
    } catch (e) { /* ঠিক আছে */ }
  }
  updateSoundIcon() { document.getElementById('btnSound').textContent = this.sound.muted ? '🔇' : '🔊'; }
  toggleMute() { this.sound.setMuted(!this.sound.muted); this.updateSoundIcon(); }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.baseFov = w / h < 0.8 ? 72 : 60;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    if (this.gfx) this.gfx.resize();
  }

  start() {
    this.goLandscape();
    this.sound.init();
    this.ui.hide('start');
    this.ui.show('hud');
    this.state = 'play';
    this.camYaw = this.player.yaw;
    this.applyTouch();
    this.ui.toast(MOBILE ? 'ফোন বোতাম চেপে কাজ নিন' : 'J চেপে ফোন খুলুন, কাজ নিন', 'good');
    this.later = [];
  }
  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.clear();
    if (document.exitPointerLock && this.input.locked) document.exitPointerLock();
    this.ui.show('pause');
    this.applyTouch();
  }
  resume() {
    if (this.state !== 'pause') return;
    this.goLandscape();
    this.ui.hide('pause');
    this.state = 'play';
    this.applyTouch();
  }
  togglePhone(force) {
    if (this.state !== 'play') return;
    this.phoneOpen = force === undefined ? !this.phoneOpen : force;
    if (this.phoneOpen) {
      if (this.input.locked && document.exitPointerLock) document.exitPointerLock();
      if (this.time - this.offersT > 30 || !this.jobs.offers.length) { this.jobs.makeOffers(); this.offersT = this.time; }
      this.sound.phone();
    }
    this.ui.phone(this, this.phoneOpen);
  }
  acceptJob(i) {
    if (this.jobs.accept(i)) {
      this.jobs.offers.splice(i, 1);
      this.togglePhone(false);
      this.routeT = 0;
    }
  }
  // বড় ম্যাপ: খোলা থাকলে খেলা থেমে থাকে
  toggleMap(force) {
    const open = force === undefined ? this.state !== 'map' : force;
    if (open && this.state === 'play') {
      if (this.phoneOpen) this.togglePhone(false);
      this.state = 'map';
      this.input.clear();
      if (document.exitPointerLock && this.input.locked) document.exitPointerLock();
      this.ui.prompt('');
      this.bigmap.show();
      this.applyTouch();
    } else if (!open && this.state === 'map') {
      this.bigmap.hide();
      this.state = 'play';
      this.applyTouch();
    }
  }
  // নিজের মার্ক: কাছের রাস্তায় বসে, GPS সেখানে নিয়ে যায়
  setMark(x, z) {
    if (x === null || x === undefined) { this.mark = null; this.routeT = 0; return; }
    const nr = this.world.nearestRoad(x, z);
    this.mark = nr ? { x: nr.px, z: nr.pz } : { x, z };
    this.routeT = 0;
    this.route = this.nav.route(this.player.pos.x, this.player.pos.z, this.mark.x, this.mark.z);
    this.sound.ping();
  }
  // GPS কোথায়: নিজের মার্ক থাকলে সেটা, না হলে চলমান কাজের জায়গা
  gpsTarget() { return this.mark || this.work.target() || this.jobs.target() || this.missions.target() || this.courtTarget(); }
  // না মেটানো মামলা থাকলে (আর পুলিশ তাড়া না করলে) GPS আদালতের দরজায়
  courtTarget() {
    if (!this.law.record || !this.law.record.length || this.law.stars > 0 || this.inside) return null;
    const c = (this.map.civic || []).find((b) => b.civic === 'court');
    const e = c && (c.entry || c.door);
    return e ? { x: e.x, z: e.z, court: true } : null;
  }
  // হারানো/নষ্ট যানবাহন শুরুর জায়গায় ফেরত
  resetVehicles() {
    this.map.parked.forEach((p, i) => {
      const v = this.vehicles[i];
      if (!v || v === this.player.vehicle) return;
      v.repair();
      v.x = p.x; v.z = p.z; v.yaw = p.yaw; v.speed = 0; v.steer = 0;
      v.sync(0);
    });
    for (const v of this.vehicles) if (v.reset && v !== this.player.vehicle) v.reset();
  }
  cancelJob() { this.jobs.cancel(); this.ui.phone(this, this.phoneOpen); }

  // F: সবচেয়ে কাছের নিজের যানবাহনে ওঠা, অথবা নামা
  nearestVehicle() {
    const P = this.player.pos;
    let best = null, bd = 3.4;
    for (const v of this.vehicles) {
      if (v.driver || v.tumble || v.hp <= 0) continue; // জ্বলন্ত বা পোড়া গাড়িতে ওঠা যায় না
      if (Math.abs((v.y || 0) - this.player.y) > 2) continue; // ছাদের হেলিকপ্টার নিচ থেকে না
      const d = Math.hypot(v.x - P.x, v.z - P.z) - v.spec.len * 0.3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  // R: কাছের (বা যেটাতে বসে আছেন) ক্ষতিগ্রস্ত যানবাহন মেকানিক দিয়ে সারানো
  fixTarget() {
    const P = this.player;
    if (P.state === 'drive') {
      const v = P.vehicle;
      return v && !v.tumble && v.hp > 0 && !v.wrecked && Math.abs(v.speed) < 1 && v.hp < v.maxHp * 0.98 ? v : null;
    }
    if (P.state !== 'foot') return null;
    const v = this.nearestVehicle();
    return v && !v.wrecked && v.hp < v.maxHp * 0.98 ? v : null;
  }
  // গাড়িতে বসে কাজ: পাম্পে তেল ভরা, গ্যারেজে রাখা (G / কাজের বোতাম)
  actTarget() {
    if (this.state !== 'play' || this.player.state !== 'drive') return null;
    return (this.fuel && this.fuel.action()) || (this.garage && this.garage.action()) || null;
  }
  setAct(a) {
    const on = !!a;
    if (on !== this.actOn) { this.actOn = on; document.body.classList.toggle('canact', on); }
    if (a && a.label !== this.actLab) { this.actLab = a.label; const b = document.querySelector('#touch [data-key="act"]'); if (b) b.textContent = a.label; }
  }
  actNow() {
    const a = this.actTarget();
    if (a) a.run();
  }
  fixNow() {
    if (this.state !== 'play') return;
    const v = this.fixTarget();
    if (!v) return;
    // ফোনে মেকানিক ডাকা: ফোনে ব্যালেন্স লাগে (মোবাইলের দোকানে রিচার্জ)
    if (this.life) {
      if (this.life.phoneBal < 10) { this.ui.toast('ফোনে ব্যালেন্স নেই! মোবাইলের দোকান থেকে রিচার্জ করুন', 'bad'); return; }
      this.life.phoneBal -= 10;
      this.life.save();
    }
    this.repair(v, true);
  }
  // রাস্তার যে গাড়ি ছিনিয়ে নেওয়া যায় (চালক থাকুক বা না থাকুক)
  nearestJack() {
    const P = this.player.pos;
    let best = null, bd = 3.4;
    const consider = (v, kind, ref, hasDriver) => {
      if (!v || v.tumble || v.wrecked || Math.abs(v.speed) > 4.2) return;
      const d = Math.hypot(v.x - P.x, v.z - P.z) - v.spec.len * 0.3;
      if (d < bd) { bd = d; best = { v, kind, ref, hasDriver }; }
    };
    for (const c of this.traffic.cars) if (!c.dead) consider(c.v, 'traffic', c, !!c.rig);
    for (const v of this.law.parked) consider(v, 'parked', v, false);
    for (const u of this.law.units) if (u.out || u.mode === 'dead') consider(u.v, 'unit', u, false);
    for (const u of this.medic.units) consider(u.v, 'amb', u, true);
    return best;
  }
  startJack(t) {
    const P = this.player, v = t.v;
    let rig = null;
    if (t.kind === 'traffic') {
      const c = t.ref;
      this.traffic.cars.splice(this.traffic.cars.indexOf(c), 1);
      rig = c.rig; c.rig = null;
    } else if (t.kind === 'parked') {
      this.law.parked.splice(this.law.parked.indexOf(v), 1);
    } else if (t.kind === 'unit') {
      const u = t.ref;
      this.law.units.splice(this.law.units.indexOf(u), 1);
      if (u.out && !u.cop.dead) this.law.adoptCop(u.cop);
    } else if (t.kind === 'amb') {
      const u = t.ref;
      this.medic.units.splice(this.medic.units.indexOf(u), 1);
      if (u.body && !u.body.gone) u.body.amb = null;
      rig = u.drv;
    }
    v.ai = false; v.stolen = true; v.stun = 0; v.siren = false;
    v.jackRig = rig;
    this.vehicles.push(v);
    P.enter(v, !!rig);
    if (v.type === 'police') this.law.offense('stealCop', v.x, v.z);
    else this.law.offense('steal', v.x, v.z);
  }
  // চালককে টেনে নামিয়ে ছুড়ে ফেলা
  onJackPull(v) {
    const rig = v.jackRig;
    v.jackRig = null;
    if (!rig) return;
    const door = v.toWorld(v.spec.door.x, v.spec.door.z);
    const ox = Math.cos(v.yaw), oz = -Math.sin(v.yaw); // গাড়ির ডান দিক (দরজার দিক)
    this.traffic.adoptPerson(rig, door.x, door.z, v.yaw, { mode: 'fly', vx: ox * 3.6, vz: oz * 3.6, vy: 2.4, y: 0.9, kind: 'jacked' });
    this.sound.thud(0.6);
    this.sound.door();
    // বাসের যাত্রীরা চিৎকার করে নেমে পালায়
    if (v.type === 'bus') {
      for (let i = 0; i < 3; i++) {
        const p = v.toWorld(-1.6, -2 + i * 2);
        this.traffic.adoptPerson(makeRig({}), p.x, p.z, v.yaw, { mode: 'flee', t: rand(6, 9), kind: 'busPass', shout: i === 0, fx: v.x, fz: v.z, delay: i * 0.3 });
      }
    }
  }
  use() {
    if (this.state !== 'play') return;
    const P = this.player;
    if (P.state === 'foot') {
      if (this.inside) { this.interiors.use(); return; }
      const v = this.nearestVehicle();
      const j = v ? null : this.nearestJack();
      const door = this.interiors.nearDoor(), kiosk = this.work.nearKiosk();
      const mis = this.missions && this.missions.near();
      if (mis) { this.missions.startNear(mis); return; }
      const home = this.property && this.property.near();
      if (home && !(v && Math.hypot(v.x - P.pos.x, v.z - P.pos.z) < 2)) this.property.use(home);
      else if (v && v.wrecked) this.repair(v);
      else if (v) P.enter(v);
      else if (j) this.startJack(j);
      else if (this.hawkers && this.hawkers.near()) this.hawkers.buy(this.hawkers.near());
      else if (this.garage && this.garage.near()) this.garage.open(this.garage.near());
      else if (door) this.interiors.enter(door);
      else if (kiosk) this.work.useKiosk(kiosk);
      else if (this.metro.nearEntrance()) this.metro.towerDialog(this.metro.nearEntrance());
      else if (this.metro.onPlatform()) { this.metro.ride = null; this.interiors.enterMetroFromPlatform(this.metro.onPlatform().st); }
      else if (this.buses.nearCounter()) this.buses.ticket(this.buses.nearCounter());
      else if (this.buses.nearStand()) {
        const st = this.buses.nearStand();
        this.interiors.dialog(st.name, '"মামা, শেয়ারে যাইবেন? তিনজন যাত্রী বইসা আছে।"', [{ label: 'ইজিবাইকে শেয়ারের যাত্রী নিন', note: 'প্রতি যাত্রী ৳৬০+', act: () => this.work.start('share', { stand: st }) }]);
      }
      else if (P.y > 2) this.leaveRoof();
    } else if (P.state === 'swim') {
      const v = this.nearestVehicle();
      if (v && v.boat) { P.state = 'foot'; P.y = 0; P.enter(v); }
    } else if (P.state === 'ride') {
      if (!this.metro.skip()) this.buses.skipRide();
    } else if (P.state === 'drive') {
      if (P.vehicle.tumble) return;
      // GTA V-এর মতো: চলন্ত যানবাহন থেকেও লাফ দিয়ে নামা যায়; গাড়ি নিজে গড়িয়ে চলতে থাকে
      const bv = P.vehicle, bs = bv.speed;
      if (!bv.wrecked && !bv.air && !bv.boat && Math.abs(bs) > 3) {
        const f = bv.fwd();
        this.sound.door();
        P.exit(this);
        bv.speed = bs;
        P.knock(f.x * bs * 0.55, f.z * bs * 0.55, 2.2, 1.4);
        if (Math.abs(bs) > 7) this.damagePlayer((Math.abs(bs) - 7) * 2.2, 'crash');
        this.ui.toast('চলন্ত গাড়ি থেকে লাফ!', '');
        return;
      }
      this.sound.door();
      P.exitSmooth(this);
    }
  }

  // ছাদ থেকে সিঁড়ি দিয়ে নিচে, রাস্তায়
  leaveRoof() {
    const P = this.player;
    const nr = this.world.nearestRoad(P.pos.x, P.pos.z);
    const s = nr.seg, side = nr.lat >= 0 ? 1 : -1;
    const off = s.width / 2 + 0.8;
    P.place(nr.px + s.dir.z * side * off, nr.pz - s.dir.x * side * off, P.yaw);
    P.y = 0; P.vy = 0;
    this.sound.door();
  }
  // ---------- অস্ত্র ----------
  setWeapon(w) {
    if (this.state !== 'play') return;
    if (w === 'pistol' && !this.arms.pistol) { this.ui.toast('পিস্তল নেই। সেনপাড়ার অস্ত্রের দোকান থেকে কিনুন (মিনি-ম্যাপে "অ")', 'bad'); return; }
    this.weapon = w;
    this.sound.click();
  }
  attack() {
    if (this.state !== 'play' || this.phoneOpen) return;
    const P = this.player;
    if (P.state !== 'foot') return;
    if (this.weapon === 'pistol' && this.arms.pistol) { const ray = this.aiming ? this.aimRay() : null; if (this.combat.shoot(ray) && this.inside) this.interiors.shot(ray || this.aimRay()); }
    else this.combat.punch();
    this.save();
  }
  fightNow() {
    if (this.state !== 'play' || this.phoneOpen || this.player.state !== 'foot') return;
    if (this.inside) { this.combat.auto(); return; }
    this.combat.auto();
  }
  kickNow() {
    if (this.state !== 'play' || this.phoneOpen || this.player.state !== 'foot') return;
    this.combat.kick();
  }
  shootTouch() {
    if (this.state !== 'play' || this.phoneOpen || this.player.state !== 'foot') return;
    if (this.arms.pistol) this.weapon = 'pistol';
    this.combat.shoot(null);
    this.save();
  }
  // ক্যামেরার মাঝ বরাবর রে
  aimRay() {
    const o = { x: this.camPos.x, y: this.camPos.y, z: this.camPos.z };
    const L = this.camLook;
    let dx = L.x - o.x, dy = L.y - o.y, dz = L.z - o.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const P = this.player;
    return { o, d: { x: dx / l, y: dy / l, z: dz / l }, skip: Math.hypot(P.pos.x - o.x, P.pos.z - o.z) + 0.6 };
  }
  nearShop() {
    const G = this.map.places.gunshop;
    if (!G) return false;
    return Math.hypot(G.door.x - this.player.pos.x, G.door.z - this.player.pos.z) < 3;
  }
  openShop() {
    this.state = 'shop';
    this.input.clear();
    if (document.exitPointerLock && this.input.locked) document.exitPointerLock();
    this.ui.prompt('');
    this.ui.shop(this);
    this.ui.show('shop');
    this.sound.voiceId('shop_01');
    this.applyTouch();
  }
  closeShop() {
    if (this.state !== 'shop') return;
    this.ui.hide('shop');
    this.state = 'play';
    this.applyTouch();
  }
  buy(what) {
    if (what === 'pistol' && !this.arms.pistol && this.canPay(PISTOL_PRICE)) {
      this.spend(PISTOL_PRICE, 'পিস্তল');
      this.arms.pistol = true;
      this.arms.ammo += 12;
      this.weapon = 'pistol';
      this.sound.money();
      this.ui.toast('পিস্তল কিনলেন (সাথে ১২টা গুলি)', 'good');
      this.sound.voiceId('shop_02');
    } else if (what === 'ammo' && this.canPay(AMMO_PRICE) && this.arms.ammo < 240) {
      this.spend(AMMO_PRICE, 'গুলি');
      this.arms.ammo = Math.min(240, this.arms.ammo + 30);
      this.sound.money();
    }
    this.save();
    this.ui.shop(this);
  }

  // ---------- আপনার স্বাস্থ্য ----------
  damagePlayer(dmg, kind, from) {
    const P = this.player;
    if (this.state !== 'play' || P.state === 'dead') return;
    // হেলমেট পরা থাকলে দুর্ঘটনা আর পড়ে যাওয়ায় কম চোট
    if (this.life && this.life.outfit.helmet && (kind === 'crash' || kind === 'fall')) dmg *= 0.6;
    // ব্লক: সামনে থেকে আসা ঘুষি-লাথি-লাঠির আঘাত অনেক কম লাগে
    if (P.blocking && from && (kind === 'punch' || kind === 'kick' || kind === 'baton')) {
      const a = Math.atan2(-(from.x - P.pos.x), -(from.z - P.pos.z)) - P.yaw;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 1.3) {
        dmg *= 0.25;
        this.sound.thud(0.25);
        this.combat.fightT = 4;
        P.health -= dmg;
        this.lastHurt = this.time;
        if (P.health <= 0) this.playerDie(kind);
        return;
      }
    }
    P.health -= dmg;
    this.hurtT = 0.35;
    this.lastHurt = this.time;
    this.sound.hurt();
    if (!this.hurtVoiceT || this.time - this.hurtVoiceT > 1.5) { this.hurtVoiceT = this.time; this.sound.voiceId(pick(['player_hurt_01', 'player_hurt_02'])); }
    this.shake = Math.max(this.shake || 0, 0.2);
    this.lastHurtKind = kind;
    // ঘুষি/লাঠিতে একটু পিছনে সরে যাওয়া
    if ((kind === 'punch' || kind === 'kick' || kind === 'baton') && P.state === 'foot' && from) {
      const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      const k = kind === 'kick' ? 0.55 : 0.3;
      P.pos.x += (dx / d) * k; P.pos.z += (dz / d) * k;
      this.combat.fightT = 4;
    }
    if (P.health <= 0) this.playerDie(kind);
  }
  playerDie(kind) {
    const P = this.player;
    P.health = 0;
    // জান হারালে সব মামলা খারিজ: খাতা খালি, পুলিশের তাড়াও শেষ (হাসপাতাল থেকে নতুন করে শুরু)
    this.casesClosed = !!(this.law.record && this.law.record.length) || this.law.stars > 0;
    this.law.record = []; this.law.offenses = {};
    if (this.life && this.life.save) this.life.save();
    P.die(this);
    giveGun(P.rig, false);
    this.aiming = false;
    this.deathT = 2.8;
    this.deathKind = kind;
    this.jobs.abort('', 0);
    this.ui.toast('আপনি জ্ঞান হারালেন…', 'bad');
    this.sound.voiceId('player_down_01');
  }
  showWasted() {
    const paid = this.charge(HOSPITAL_BILL);
    const cause = { drown: 'পানিতে ডুবে জ্ঞান হারালেন', fall: 'উঁচু থেকে পড়ে আহত', explode: 'গাড়ি বিস্ফোরণে গুরুতর আহত', fire: 'আগুনে পুড়ে আহত', kick: 'মারামারিতে আহত', bullet: 'গুলি লেগে গুরুতর আহত', punch: 'মারামারিতে আহত', baton: 'পুলিশের লাঠির আঘাতে আহত', car: 'সড়ক দুর্ঘটনায় আহত', crash: 'সড়ক দুর্ঘটনায় আহত' }[this.deathKind] || 'গুরুতর আহত';
    this.state = 'wasted';
    this.phoneOpen = false;
    this.ui.phone(this, false);
    this.input.clear();
    if (document.exitPointerLock && this.input.locked) document.exitPointerLock();
    this.ui.prompt('');
    this.ui.wasted({ cause, bill: `৳${bnGroup(HOSPITAL_BILL)}`, paid: paid < HOSPITAL_BILL ? `বাকির সীমায় ধরল ৳${bnGroup(paid)}, বাকিটা মওকুফ` : (this.money < 0 ? `বাকিতে দিলেন, এখন বাকি ৳${bnGroup(-this.money)}` : '') });
    this.bustReady = false;
    const btn = document.getElementById('btnHospital');
    btn.disabled = true;
    clearTimeout(this.bustTimer);
    this.bustTimer = setTimeout(() => { this.bustReady = true; btn.disabled = false; btn.focus && btn.focus(); }, 3200);
    this.sound.siren(0);
    this.applyTouch();
  }

  // উল্টানো যানবাহন সোজা করা: বাইক-রিকশা নিজেই তোলা যায়, গাড়ি-সিএনজিতে মেকানিক লাগে
  repairText(v) {
    if (OPEN.has(v.type)) return `${v.spec.name} তুলে সোজা করুন`;
    return `মেকানিক ডাকুন (৳${bnGroup(MECHANIC)})`;
  }
  // full = ইঞ্জিন-বডি মেরামত (টাকা লাগে); না হলে শুধু সোজা করা
  repair(v, full = false) {
    if (!full && OPEN.has(v.type)) {
      const hp = v.hp;
      v.repair();
      v.hp = Math.max(hp, v.maxHp * 0.4);
      this.sound.door();
      this.ui.toast(`${v.spec.name} তুলে দাঁড় করালেন`, 'good');
      return;
    }
    if (!this.spend(MECHANIC, 'মেকানিক')) return;
    v.repair();
    this.sound.money();
    this.ui.toast(`মেকানিক এসে ${v.spec.name} ঠিক করে দিল: −৳${bnGroup(MECHANIC)}`, 'money');
  }
  // যানবাহন উল্টানো (আপনার বা অন্যের)
  flipVehicle(v, px, pz, power) {
    const P = this.player;
    const sp = v.speed, f = v.fwd();
    if (!v.flip(px, pz, power)) return false;
    this.sound.flip();
    this.shake = Math.max(this.shake || 0, 0.6);
    if (v === P.vehicle) {
      this.jobs.onFlip();
      if (OPEN.has(v.type)) {
        P.throwOff(this, f.x * sp * 0.6 + px * 2, f.z * sp * 0.6 + pz * 2, 3.5);
        this.ui.toast(`উফ! ${v.spec.name} থেকে ছিটকে পড়লেন`, 'bad');
        this.damagePlayer(12 + Math.abs(sp) * 1.5, 'crash');
      } else {
        this.ui.toast(`${v.spec.name} উল্টে গেল!`, 'bad');
        this.damagePlayer(6 + power * 0.5, 'crash');
        v.damage(6 + power * 0.4);
      }
    }
    return true;
  }

  tick(dt) {
    this.time += dt;
    if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'busted' && this.player.state === 'foot') setPose(this.player.rig, 'surrender', dt, 0, 8);
    this.updateCamera(dt);
    tickDoors(dt);
    if (this.showTouch) this.updateTouchMode();
    if (this.showTouch && this.input.touch.fight && this.state === 'play') this.fightNow(); // ধরে রাখলে পরপর মার
    // ফোনে উঁচু গ্রাফিক্সে খুব ধীর হলে (৬ সেকেন্ড গড়ে ২০ ফ্রেমের কম) নিজে থেকে একবার কমানো
    if (this.state === 'play' && this.gfx.auto && this.gfx.high) {
      this.fpsT = (this.fpsT || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
      if (this.fpsT > 6) {
        if (this.fpsN / this.fpsT < 20) { this.gfx.auto = false; this.gfx.q = 'low'; this.gfx.apply(); this.ui.toast('ফোন একটু ধীর চলছিল, তাই গ্রাফিক্স কমানো হলো (থামান মেনু থেকে আবার উঁচু করা যায়)', ''); }
        this.fpsT = 0; this.fpsN = 0;
      }
    }
    // গাড়ির সংখ্যা: ৫ সেকেন্ডের গড়ে খেলা ধীর (২৪ ফ্রেমের কম) হলে কয়েকটা কমে, ভালো চললে আবার বাড়ে
    if (this.state === 'play') {
      this.tfT = (this.tfT || 0) + dt; this.tfN = (this.tfN || 0) + 1;
      if (this.tfT > 5) {
        const fps = this.tfN / this.tfT, T = this.traffic, lo = Math.round(this.carsBase * 0.55);
        if (fps < 24 && T.maxCars > lo) T.maxCars = Math.max(lo, T.maxCars - 4);
        else if (fps > 45 && T.maxCars < this.carsBase) T.maxCars = Math.min(this.carsBase, T.maxCars + 2);
        this.tfT = 0; this.tfN = 0;
      }
    }
    this.world.update(dt, this.time);
    if (this.state === 'play' || this.state === 'menu') this.sky.update(this.state === 'play' ? dt : dt * 0.2);
    this.vfx.update(dt);
    this.ui.update(this.state === 'play' ? dt : 0, this.camera, this);
    if (this.state === 'play') this.ui.hud(this);
    const pv = this.player.state === 'drive' && this.player.vehicle;
    if (this.state === 'play') {
      this.sound.siren(Math.max(this.law.sirenLvl, pv && pv.siren && pv.type === 'police' ? 0.7 : 0), Math.max(this.medic.sirenLvl, pv && pv.siren && pv.type === 'ambulance' ? 0.7 : 0));
      const ld = this.map.lakeDist(this.player.pos.x, this.player.pos.z);
      this.sound.ambience(clamp(1 - ld / 45, 0, 1));
      this.sound.weather(this.sky.rain * (this.inside ? 0.3 : 1), this.wrecks.fireNear);
      this.sound.metro(this.inside ? 0 : this.metro.hum || 0);
    } else { this.sound.siren(0, 0); this.sound.weather(0, 0); }
    const v = this.player.vehicle;
    this.sound.update(this.state === 'play' ? dt : 0, this.state === 'play' && this.player.state === 'drive' ? v.type : null, v ? v.speed : 0, this.throttle || 0);
    if (this.dress) this.dress.update();
    if (this.works && (this.state === 'play' || this.state === 'dialog')) this.works.update(dt);
    if (this.life && (this.state === 'play' || this.state === 'dialog')) this.life.update(dt);
    VM.near = this.gfx.q === 'high' ? 90 : 45;
    this.gfx.render(dt);
  }

  updatePlay(dt) {
    const P = this.player, I = this.input;
    const look = I.consumeLook();
    if (look.dx || look.dy) {
      this.camYaw -= look.dx * 0.0042;
      this.camPitch = clamp(this.camPitch + look.dy * 0.003, -0.12, 1.15);
      this.lookIdle = 0;
    } else this.lookIdle += dt;
    if (I.zoom) { this.zoom = clamp(this.zoom + I.zoom * 0.6, -2, 6); I.zoom = 0; }
    const inp = this.phoneOpen ? { axis: () => ({ x: 0, y: 0 }), get: () => false, joy: { active: false } } : I;
    this.throttle = 0;
    const key = MOBILE ? 'ওঠা বোতাম' : 'F';
    this.aiming = !this.phoneOpen && P.state === 'foot' && this.weapon === 'pistol' && this.arms.pistol && I.get('aim');
    P.blocking = !this.phoneOpen && P.state === 'foot' && !this.aiming && I.get('block');
    let fixable = false;
    giveGun(P.rig, P.state === 'foot' && this.weapon === 'pistol' && this.arms.pistol);
    this.hurtT = Math.max(0, this.hurtT - dt);
    // কিছুক্ষণ আঘাত না পেলে স্বাস্থ্য ফেরে
    if (P.state !== 'dead' && this.time - this.lastHurt > 8) P.health = Math.min(100, P.health + 4 * dt);
    if (P.state === 'dead') {
      P.updateFall(dt, this);
      this.ui.prompt('');
      this.deathT -= dt;
      if (this.deathT <= 0) { this.showWasted(); return; }
    } else if (P.state === 'foot') {
      P.updateFoot(dt, inp, this.camYaw, this, this.aiming);
      if (this.aiming) this.lookIdle = 0;
      const v = this.nearestVehicle();
      const j = v ? null : this.nearestJack();
      const fx = this.fixTarget();
      fixable = !!fx;
      const fixTxt = fx ? ` · ${MOBILE ? 'মেরামত বোতাম' : 'R'}: মেকানিক (৳${bnGroup(MECHANIC)})` : '';
      const inner = this.interiors.update(dt);
      const rob = this.robbery.update(dt);
      const door = this.interiors.nearDoor(), kiosk = this.work.nearKiosk();
      const home = this.property && this.property.near();
      const mis = this.missions && this.missions.near();
      const hawk = !v && !j && this.hawkers && this.hawkers.near();
      const gar = !v && !j && !hawk && this.garage && this.garage.near();
      this.ui.prompt(this.inside ? ((this.life.heist && this.life.heistText()) || rob || inner)
        : mis ? this.missions.prompt(mis, key)
        : home ? this.property.prompt(home, key)
        : v ? `${key}: ${v.wrecked ? this.repairText(v) : `${v.spec.name}-এ উঠুন`}${fixTxt}`
        : j ? `${key}: ${j.v.spec.name} ${j.hasDriver ? 'ছিনিয়ে নিন' : 'নিয়ে নিন'}`
        : hawk ? this.hawkers.prompt(hawk, key)
        : gar ? this.garage.prompt(gar, key)
        : door ? `${key}: ${door.name}-এ ঢুকুন`
        : kiosk ? `${key}: ${kiosk.label}`
        : this.metro.nearEntrance() ? `${key}: ${this.metro.nearEntrance().name} মেট্রো স্টেশন: টিকিট / চালান / চাকরি`
        : this.metro.onPlatform() ? (this.metro.ride ? `${this.metro.ride.to.name} যাওয়ার ট্রেনের অপেক্ষা… (${key}: নিচে কনকোর্সে)` : `${key}: নিচে কনকোর্সে নামুন`)
        : this.buses.nearCounter() ? `${key}: ${this.buses.nearCounter().name} বাস কাউন্টার: টিকিট / চাকরি`
        : this.buses.nearStand() ? `${key}: ইজিবাইক শেয়ারে যাত্রী নিন`
        : P.y > 2 ? `${key}: সিঁড়ি দিয়ে নিচে নামুন`
        : rob);
    } else if (P.state === 'vault') {
      // মেট্রো গেট টপকানো: কনকোর্স নিজেই নড়াচড়া চালায়
      this.interiors.update(dt);
      this.ui.prompt('');
    } else if (P.state === 'swim') {
      P.updateSwim(dt, inp, this.camYaw, this);
      const v = this.nearestVehicle();
      this.ui.prompt(v && v.boat ? `${key}: ${v.spec.name}-এ উঠুন` : P.y < -0.9 ? 'ডুবে আছেন: দম ফুরানোর আগে উঠুন' : `${MOBILE ? 'লাফ বোতাম' : 'Space'} ধরে রাখলে ডুব`);
    } else if (P.state === 'ride' && (this.metro.ride || this.metro.drive)) {
      const MR = this.metro.ride;
      this.ui.prompt(MR ? `মেট্রোতে যাচ্ছেন: ${MR.to.name} · ${key}: তাড়াতাড়ি পৌঁছান` : `W গতি · S ব্রেক · থেমে ${key}: নামুন`);
      if (this.lookIdle > 1.2) this.camYaw = angDamp(this.camYaw, P.yaw, 2, dt);
    } else if (P.state === 'ride') {
      this.ui.prompt(this.buses.ride && this.buses.ride.stage === 'go' ? `বাসে যাচ্ছেন: ${this.buses.ride.to.name} · ${key}: তাড়াতাড়ি পৌঁছান` : '');
    } else if (P.state === 'fall') {
      P.updateFall(dt, this);
      this.ui.prompt('');
    } else if (P.state === 'drive' && !P.vehicle.air && (P.vehicle.tumble || P.vehicle.wrecked)) {
      // উল্টে যাওয়া বা পানিতে ডুবতে থাকা গাড়ির ভিতরে
      const v = P.vehicle;
      if (v.sink) {
        v.updateSink(dt); v.sync(dt);
        P.pos.x = v.x; P.pos.z = v.z;
        this.ui.prompt(`${key}: বের হয়ে সাঁতার কাটুন!`);
        // অনেক নিচে গেলে নিজেই বের হয়ে আসেন
        if (v.y < -1.6) { P.exit(this); P.y = -1; P.startSwim(this); }
      } else {
        if (v.tumble && v.updateTumble(dt, this.world) && v.wrecked) this.ui.toast(`${v.spec.name} উল্টে পড়ে আছে! ${key} চেপে বের হন`, 'bad');
        v.sync(dt);
        P.pos.x = v.x; P.pos.z = v.z;
        this.ui.prompt(v.wrecked && !v.tumble ? `${key}: বের হন` : '');
      }
    } else if (P.state === 'exit') {
      P.updateExit(dt, this);
      this.ui.prompt('');
    } else if (P.state === 'enter') {
      const ev = P.vehicle;
      if (ev && ev.stolen) { ev.drive(dt, { throttle: 0, steer: 0, handbrake: true }, this.world); ev.sync(dt); if (ev.jackRig) setPose(ev.jackRig, 'drive', dt, 0, 8); }
      P.updateEnter(dt, this);
      this.ui.prompt('');
    } else if (P.state === 'drive') {
      const res = P.updateDrive(dt, inp, this);
      this.throttle = res.throttle;
      const v = P.vehicle;
      // দেয়ালে ধাক্কা: গাড়ি উল্টায় না, দুমড়ে যায়। বাইক-রিকশা জোরে লাগলে কাত হয়ে পড়ে
      if (res.impact > 2.5) { this.crash(res.impact); v.damage(crashDmg(res.impact)); v.crashDent(res.impact); }
      if (THROW[v.type] && res.impact > THROW[v.type]) { const f = v.fwd(); v.speed = res.impact * 0.5; this.flipVehicle(v, -f.x, -f.z, res.impact * 0.6); }
      // খুব জোরে তীক্ষ্ণ বাঁক: সিএনজি-রিকশা কাত হয়; গাড়ি শুধু হ্যান্ডব্রেক টেনে খুব জোরে ঘোরালে
      const tf = TURN_FLIP[v.type];
      const needHB = v.type === 'car' || v.type === 'police' || v.type === 'ambulance';
      if (P.state === 'drive' && tf && !v.tumble && !v.wrecked && Math.abs(v.speed) > tf && Math.abs(v.steer) > 0.85 && (!needHB || v.hb)) {
        v.turnT = (v.turnT || 0) + dt;
        if (v.turnT > (needHB ? 0.5 : 0.65)) {
          v.turnT = 0;
          const f = v.fwd(), sg = Math.sign(v.steer);
          this.flipVehicle(v, sg * f.z, -sg * f.x, Math.abs(v.speed) * 0.45);
        }
      } else v.turnT = 0;
      if (P.state === 'drive') this.vehicleHits(dt);
      // হেলিকপ্টার-বিমান পানিতে পড়ে ডুবলে
      if (P.state === 'drive' && v.sink && v.y < -1.6) { P.exit(this); P.y = -1; P.startSwim(this); }
      // আকাশ বা পানির যানবাহনে প্রথমবার উঠলে নিয়ন্ত্রণ দেখানো
      if (P.state === 'drive' && (v.air || v.boat) && this.ctrlShown !== v.type) {
        this.ctrlShown = v.type;
        const m = MOBILE;
        this.ui.toast(v.spec.air === 'heli' ? (m ? 'লাফ বোতাম: উপরে, দৌড় বোতাম: নিচে, জয়স্টিক: সামনে-পিছে আর ঘোরা' : 'Space উপরে · Shift নিচে · W/S সামনে-পিছে · A/D ঘোরা')
          : v.spec.air === 'plane' ? (m ? 'জয়স্টিক উপরে: জোরে · লাফ বোতাম: ওড়া/নাক উপরে · জয়স্টিক নিচে: নামা, মাটিতে ব্রেক' : 'W জোরে · রানওয়েতে জোরে চালিয়ে Space: ওড়া · আকাশে Space নাক উপরে, S বা Shift: নামা · মাটিতে S: ব্রেক · A/D ঘোরা')
          : 'পানিতে চালান, পাড়ের কাছে নামা যায়', '');
      }
      if (P.state === 'drive') {
        const fx = this.fixTarget();
        fixable = !!fx;
        const act = this.actTarget();
        this.ui.prompt(Math.abs(P.vehicle.speed) < 1 ? `${act ? `${MOBILE ? 'কমলা বোতাম' : 'G'}: ${act.text} · ` : ''}${MOBILE ? 'নামা বোতাম' : 'F'}: নামুন${fx ? ` · ${MOBILE ? 'মেরামত বোতাম' : 'R'}: মেকানিক (৳${bnGroup(MECHANIC)})` : ''}` : '');
        this.setAct(act);
      }
      // চলতে থাকলে ক্যামেরা আস্তে আস্তে পিছনে চলে আসে
      if (P.state === 'drive' && Math.abs(P.vehicle.speed) > 2 && this.lookIdle > 1.2) {
        const back = P.vehicle.speed < -0.5 ? P.vehicle.yaw + Math.PI : P.vehicle.yaw;
        this.camYaw = angDamp(this.camYaw, back, 2.2, dt);
      }
    }
    if (P.state !== 'drive' && this.actOn) this.setAct(null);
    if (fixable !== this.fixable) { this.fixable = fixable; document.body.classList.toggle('canfix', fixable); }
    if (P.state !== 'foot') this.robbery.update(dt);
    // দূরে ফেলে আসা ছিনতাইয়ের গাড়ি সরানো (+ dispose = মেমরি লিক রোধ)
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.stolen && v !== P.vehicle && Math.hypot(v.x - P.pos.x, v.z - P.pos.z) > 300) {
        this.scene.remove(v.g); disposeTree(v.g); this.vehicles.splice(i, 1);
      }
    }
    // নিজের যে যানবাহন খালি পড়ে উল্টাচ্ছে; চালকহীন হেলিকপ্টার-বিমান-নৌকা
    const idle = { throttle: 0, steer: 0, handbrake: true }, coast = { throttle: 0, steer: 0, handbrake: false };
    for (const v of this.vehicles) {
      if (v === P.vehicle) continue;
      if (v.sink) { v.updateSink(dt); v.sync(dt); }
      else if (v.air || v.boat) { v.drive(dt, idle, this.world); v.sync(dt); }
      else if (!v.driver && !v.tumble && Math.abs(v.speed) > 0.05) { v.drive(dt, coast, this.world); v.sync(dt); } // চালক ছাড়া গড়িয়ে চলা
      else if (v.tumble) { v.updateTumble(dt, this.world); v.sync(dt); }
    }
    // হেঁটে চলার সময় গাড়ির ধাক্কা (শুধু কাছের গাড়ি)
    if (P.state === 'foot' && !this.inside) {
      for (const c of this.traffic.cars) {
        if (c.dead || Math.abs(c.v.speed) < 3) continue;
        if (Math.hypot(c.v.x - P.pos.x, c.v.z - P.pos.z) > 18) continue;
        for (const cc of c.v.circles()) {
          if (Math.hypot(cc.x - P.pos.x, cc.z - P.pos.z) < cc.r + 0.4) {
            if (!this.hitCd || this.time - this.hitCd > 2) {
              this.hitCd = this.time;
              this.sound.crash(0.4);
              this.ui.toast('সাবধানে রাস্তা পার হন!', 'bad');
              const sp = Math.abs(c.v.speed), f = c.v.fwd();
              c.v.stun = 1.2;
              this.damagePlayer(sp * 5, 'car');
              if (sp > 7 && P.state === 'foot') P.knock(f.x * sp * 0.5, f.z * sp * 0.5, 2.5);
            }
          }
        }
      }
    }
    // ভিতরে থাকলে বাইরের শহর থেমে থাকে (GTA-র ঘরের মতো)
    if (!this.inside) {
      this.signals.update(dt);
      this.missions.update(dt);
      this.traffic.update(dt, this);
      this.buses.update(dt);
      if (this.busPax) this.busPax.update(dt);
      if (this.jamHawkers) this.jamHawkers.update(dt);
      if (this.hawkers) this.hawkers.update(dt);
      if (this.flood) this.flood.update(dt);
      if (this.shopFolk) this.shopFolk.update(dt);
      if (this.rideshare) this.rideshare.update(dt);
      this.metro.update(dt);
      this.world.updateBreak(dt, P.pos.x, P.pos.z);
      this.traffic.noPatrol = this.law.stars > 0;
      this.medic.update(dt);
      this.law.update(dt);
    }
    this.combat.update(dt);
    this.wrecks.update(dt);
    if (this.state !== 'play') return;
    if (!this.inside) { this.jobs.update(dt); this.work.update(dt); if (this.fuel) this.fuel.update(dt); }
    // GPS
    this.routeT -= dt;
    if (this.mark && Math.hypot(this.mark.x - P.pos.x, this.mark.z - P.pos.z) < 12) { this.mark = null; this.ui.toast('মার্ক করা জায়গায় পৌঁছে গেছেন', 'good'); this.sound.ping(); }
    const tgt = this.gpsTarget();
    if (tgt && this.routeT <= 0) { this.routeT = 0.8; this.route = this.nav.route(P.pos.x, P.pos.z, tgt.x, tgt.z); }
    if (!tgt) this.route = null;
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 1 / 30;
      const pl = this.map.places;
      const markers = [];
      if (pl.thana) markers.push({ x: pl.thana.door.x, z: pl.thana.door.z, color: '#1a3f8a', label: 'থ', r: 8 });
      if (pl.hospital) markers.push({ x: pl.hospital.door.x, z: pl.hospital.door.z, color: '#c62828', label: '+', r: 8 });
      for (const gt of this.metro.gateList()) markers.push({ x: gt.x, z: gt.z, color: '#1f7a3d', label: 'M', r: 7 });
      for (const p of this.metro.markers()) markers.push({ x: p.x, z: p.z, color: '#1f7a3d', r: 5, noClamp: true });
      for (const c of this.buses.counters) markers.push({ x: c.shel.x, z: c.shel.z, color: '#0277bd', label: 'বা', r: 6, noClamp: true });
      if (pl.gunshop) markers.push({ x: pl.gunshop.door.x, z: pl.gunshop.door.z, color: '#222', label: 'অ', r: 8 });
      for (const b of this.map.civic || []) { const P = CIVIC_PIN[b.civic], e = b.entry || b.door; if (P && e) markers.push({ x: e.x, z: e.z, color: P[0], label: P[1], r: 8, noClamp: true }); }
      if (this.property) for (const m of this.property.markers()) markers.push(m);
      if (this.fuel) for (const m of this.fuel.markers()) markers.push(m);
      if (this.garage) for (const m of this.garage.markers()) markers.push(m);
      if (this.flood) for (const m of this.flood.markers()) if (Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z) < 220) markers.push(m);
      for (const m of this.missions.markers()) markers.push(m);
      for (const m of this.signals.markers()) if (Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z) < 160) markers.push(m);
      const blink = Math.floor(this.time * 4) % 2;
      const L = this.law;
      if (L.stars > 0 && L.search) markers.unshift({ x: L.search.x, z: L.search.z, ring: L.searchR, color: blink ? '#ff3030' : '#2a5bff', fill: blink ? 'rgba(255,48,48,0.16)' : 'rgba(42,91,255,0.16)' });
      for (const u of this.law.units) if (u.mode === 'chase') markers.push({ x: u.v.x, z: u.v.z, color: blink ? '#ff3030' : '#2a5bff', r: 4, noClamp: true });
      const wt = this.work.target();
      if (wt) markers.push({ x: wt.x, z: wt.z, color: this.work.job && this.work.job.kind === 'police' && this.work.job.stage === 'chase' ? '#ff2020' : '#3ddc84' });
      const jt = this.jobs.target();
      if (jt) markers.push({ x: jt.x, z: jt.z, color: this.jobs.active.stage === 'pickup' ? '#ffd400' : '#3ddc84' });
      if (this.mark) markers.push({ x: this.mark.x, z: this.mark.z, color: '#b026ff' });
      this.minimap.draw(P.pos.x, P.pos.z, this.camYaw, P.yaw, this.route, markers);
    }
  }

  // নিজের যানবাহন বনাম রাস্তার অন্য গাড়ি
  vehicleHits() {
    const v = this.player.vehicle;
    const others = [...this.traffic.cars.map((c) => c.v), ...this.vehicles.filter((o) => o !== v), ...this.law.vehicles(), ...this.medic.units.map((u) => u.v), ...this.work.vehicles(), ...this.buses.vehicles()];
    for (const o of others) {
      if (Math.hypot(o.x - v.x, o.z - v.z) > 9 || Math.abs((o.y || 0) - (v.y || 0)) > 2.5) continue;
      for (const a of v.circles()) {
        for (const b of o.circles()) {
          const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), r = a.r + b.r;
          if (d >= r || d < 1e-4) continue;
          const push = r - d;
          v.x += (dx / d) * push;
          v.z += (dz / d) * push;
          const f = v.fwd(), g2 = o.fwd();
          const rel = Math.abs((f.x * v.speed - g2.x * o.speed) * dx / d + (f.z * v.speed - g2.z * o.speed) * dz / d);
          if (rel > 2.5 && (!this.vhCd || this.time - this.vhCd > 0.6)) {
            this.vhCd = this.time;
            this.crash(rel);
            const ox = -dx / d, oz = -dz / d; // আপনার দিক থেকে ওই গাড়ির দিকে
            const police = o.type === 'police';
            const car = this.traffic.cars.find((c) => c.v === o);
            // দোষ আপনার কিনা: আপনি ওই দিকে কত জোরে যাচ্ছিলেন
            const mine = (f.x * v.speed) * ox + (f.z * v.speed) * oz > 2.5;
            const mv = MASS[v.type], mo = MASS[o.type];
            const hitO = rel * (2 * mv) / (mv + mo), hitV = rel * (2 * mo) / (mv + mo);
            // ধাক্কা কতটা পাশ থেকে (১ = একদম পাশে, ০ = সামনে-পিছনে)
            const side = (veh) => { const q = veh.fwd(); return Math.abs(q.x * oz - q.z * ox); };
            const light = (t) => OPEN.has(t);
            v.damage(crashDmg(hitV) * 0.9);
            o.damage(crashDmg(hitO) * 0.9, mine ? 'player' : undefined);
            // দুই গাড়িতেই ধাক্কার জায়গায় টোল
            const cx = b.x + (a.x - b.x) * (b.r / r), cz = b.z + (a.z - b.z) * (b.r / r);
            v.dent(cx, cz, dx / d, dz / d, Math.min(0.34, (hitV - 3) * 0.018));
            o.dent(cx, cz, -dx / d, -dz / d, Math.min(0.34, (hitO - 3) * 0.018));
            // GTA V-এর মতো: খুব জোরে পাশ থেকে বা বাসের ধাক্কায় উল্টায়; বাইক-রিকশা সহজে পড়ে
            const flipO = !o.tumble && o.type !== 'bus' && (light(o.type) ? hitO > SIDE_FLIP[o.type]
              : hitO * side(o) > SIDE_FLIP[o.type] || (HEAVY.has(v.type) && hitO > 17 && side(o) > 0.5));
            if (flipO) {
              const ok = car ? this.traffic.flipCar(car, ox, oz, rel, this) : o.flip(ox, oz, rel);
              if (ok) { this.sound.flip(); if ((car || police) && mine) this.law.offense('flip'); }
            } else if (o.ai && !o.tumble) {
              o.stun = 1.5;
              if (car && rel > 5 && mine) this.law.offense('crash');
            }
            if (police && mine) this.law.offense('police');
            // আপনার যানবাহন: একই নিয়মে (পুলিশের ধাক্কায় একটু কম)
            const flipV = !v.tumble && v.type !== 'bus' && rel > 6 && (light(v.type) ? hitV > SIDE_FLIP[v.type]
              : hitV * side(v) > SIDE_FLIP[v.type] * (police ? 1.25 : 1) || (HEAVY.has(o.type) && hitV > 17 && side(v) > 0.5));
            if (flipV) { v.speed = rel * 0.4 * Math.sign(v.speed || 1); this.flipVehicle(v, dx / d, dz / d, rel * 0.7); return; }
            v.speed *= 0.4;
          }
        }
      }
    }
  }
  crash(power) {
    if (this.crashCd && this.time - this.crashCd < 0.5) return;
    this.crashCd = this.time;
    this.sound.crash(Math.min(1, power / 12));
    this.shake = Math.min(0.6, power * 0.05);
    this.jobs.onCrash(power);
    const P = this.player;
    if (P.state === 'drive') {
      const open = OPEN.has(P.vehicle.type);
      if (open && power > 8) this.damagePlayer((power - 8) * 2.5, 'crash');
      else if (!open && power > 14) this.damagePlayer((power - 14) * 0.8, 'crash'); // গাড়ির ভিতরে বেল্ট বাঁধা
    }
  }

  // ধরা পড়ার কার্ড
  showBusted(info) {
    this.state = 'busted';
    this.phoneOpen = false;
    this.ui.phone(this, false);
    this.input.clear();
    if (document.exitPointerLock && this.input.locked) document.exitPointerLock();
    this.ui.prompt('');
    this.ui.busted(info);
    this.bustReady = false;
    const btn = document.getElementById('btnRelease');
    btn.disabled = true;
    clearTimeout(this.bustTimer);
    this.bustTimer = setTimeout(() => { this.bustReady = true; btn.disabled = false; btn.focus && btn.focus(); }, 3200);
    this.applyTouch();
  }
  release() {
    if (this.state !== 'busted' && this.state !== 'wasted') return;
    const fromHospital = this.state === 'wasted';
    const P = this.player;
    if (this.inside) this.interiors.exit();
    if (this.work.job) this.work.cancel('');
    if (this.buses.ride) this.buses.endRide();
    if (this.metro.ride || this.metro.drive) { this.metro.endAll(); P.rig.root.visible = true; }
    this.law.release();
    P.health = 100;
    this.lastHurt = -99;
    this.aiming = false;
    if (P.state === 'drive' || P.state === 'enter' || P.state === 'exit') {
      if (P.vehicle && (P.vehicle.driver === P || P.inT || P.outT)) P.exit(this);
      P.state = 'foot'; P.vehicle = null;
    }
    // আপনার যানবাহন শুরুর গলিতে ফেরত
    this.map.parked.forEach((p, i) => {
      const v = this.vehicles[i];
      v.repair();
      v.x = p.x; v.z = p.z; v.yaw = p.yaw; v.speed = 0; v.steer = 0;
      v.sync(0);
    });
    for (const v of this.vehicles) if (v.reset) v.reset();
    // থানা বা হাসপাতালের দরজায়
    const T = fromHospital ? this.map.places.hospital : this.map.places.thana;
    const door = T ? T.door : this.map.spawn;
    const yaw = T && T.face ? Math.atan2(-T.face.x, -T.face.z) : 0;
    P.state = 'foot'; P.fall = null; P.y = 0; P.vy = 0; P.speed = 0;
    P.rig.root.rotation.set(0, yaw, 0);
    P.place(door.x, door.z, yaw);
    this.camYaw = yaw;
    this.camPos.set(door.x + Math.sin(yaw) * 4, 2.5, door.z + Math.cos(yaw) * 4);
    this.ui.hide('busted');
    this.ui.hide('wasted');
    this.state = 'play';
    this.applyTouch();
    if (fromHospital) this.sound.voiceId('hospital_01', true);
    // হাসপাতাল থেকে ফেরা: পুরোনো সব মামলা শেষ (আদালতে যেতে হয় না)
    let closed = fromHospital && !!this.casesClosed; this.casesClosed = false;
    if (fromHospital && this.law.record && this.law.record.length) { this.law.record = []; closed = true; if (this.life && this.life.save) this.life.save(); }
    this.ui.toast(fromHospital ? `সুস্থ হয়ে বের হলেন।${closed ? ' সব মামলা খারিজ হয়ে গেছে।' : ''} যানবাহন শুরুর গলিতে রাখা আছে` : 'ছাড়া পেলেন। আপনার যানবাহন শুরুর গলিতে রাখা আছে', 'good');
  }

  // ক্যামেরা: খেলোয়াড়ের পিছনে, মাউস দিয়ে ঘোরানো যায়, দেয়ালের ভিতরে ঢোকে না
  updateCamera(dt) {
    const cam = this.camera, P = this.player;
    if (this.state === 'menu') {
      const a = this.time * 0.05;
      cam.position.set(P.pos.x + Math.sin(a) * 60, 38, P.pos.z + Math.cos(a) * 60);
      cam.lookAt(P.pos.x, 4, P.pos.z);
      this.camPos.copy(cam.position);
      return;
    }
    const key = P.state === 'drive' ? (P.vehicle.type === 'police' ? 'car' : P.vehicle.type) : P.state === 'ride' ? (this.metro.ride || this.metro.drive ? 'train' : 'bus') : this.inside ? 'inside' : 'foot';
    const aim = this.aiming && this.state === 'play';
    this.aimK = damp(this.aimK || 0, aim ? 1 : 0, 10, dt);
    // GTA-র মতো: জোরে চললে ক্যামেরা একটু পিছিয়ে যায়
    const spdK = P.state === 'drive' ? clamp(Math.abs(P.vehicle.speed) / 30, 0, 1) : 0;
    this.camPull = damp(this.camPull || 0, spdK, 1.5, dt);
    const dist = lerp(Math.max(2.2, (CAM_DIST[key] || 6) + this.zoom + this.camPull * 1.4), 2.3, this.aimK);
    const h = lerp(CAM_H[key] || 1.5, 1.62, this.aimK);
    // নিশানার সময় ক্যামেরা ডান কাঁধের উপর
    const sx = Math.cos(this.camYaw) * 0.6 * this.aimK, sz = -Math.sin(this.camYaw) * 0.6 * this.aimK;
    const rtx = (P.state === 'drive' ? P.vehicle.x : P.pos.x) + sx;
    const rtz = (P.state === 'drive' ? P.vehicle.z : P.pos.z) + sz;
    const rty = (P.state === 'drive' ? P.vehicle.y : P.state === 'fall' || P.state === 'dead' ? 0 : P.y) + h;
    // যেদিকে তাকায় সেই বিন্দুও মসৃণভাবে চলে (ঝাঁকুনি, ফুটপাতে ওঠা-নামায় ক্যামেরা লাফায় না)
    const CT = this.camT || (this.camT = { x: rtx, y: rty, z: rtz });
    if (Math.hypot(CT.x - rtx, CT.z - rtz) > 12 || this.state === 'pause') { CT.x = rtx; CT.y = rty; CT.z = rtz; }
    const kt = aim ? 30 : P.state === 'drive' ? 16 : 22;
    CT.x = damp(CT.x, rtx, kt, dt); CT.z = damp(CT.z, rtz, kt, dt); CT.y = damp(CT.y, rty, 9, dt);
    const tx = CT.x, ty = CT.y, tz = CT.z;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    let cx = tx + Math.sin(this.camYaw) * cp * dist;
    let cy = ty + sp * dist;
    let cz = tz + Math.cos(this.camYaw) * cp * dist;
    // দেয়ালে আটকালে কাছে টেনে আনা
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = tx + (cx - tx) * u, y = ty + (cy - ty) * u, z = tz + (cz - tz) * u;
      if (this.world.blocked(x, y, z)) {
        const uu = Math.max(0.15, (i - 1.5) / steps);
        cx = tx + (cx - tx) * uu; cy = ty + (cy - ty) * uu; cz = tz + (cz - tz) * uu;
        break;
      }
    }
    cy = Math.max(0.5, cy);
    if (this.inside) { const c = { x: cx, y: cy, z: cz }; this.interiors.clampCam(c); cx = c.x; cy = c.y; cz = c.z; }
    // দেয়ালে আটকালে দ্রুত কাছে আসে, ছাড়া পেলে ধীরে পিছিয়ে যায় (হঠাৎ লাফ নেই)
    const curD = Math.hypot(this.camPos.x - tx, this.camPos.z - tz), newD = Math.hypot(cx - tx, cz - tz);
    const k = newD < curD - 0.3 ? 24 : P.state === 'drive' ? 7 : 12;
    this.camPos.x = damp(this.camPos.x, cx, k, dt);
    this.camPos.y = damp(this.camPos.y, cy, k, dt);
    this.camPos.z = damp(this.camPos.z, cz, k, dt);
    if (this.state === 'pause') this.camPos.set(cx, cy, cz);
    const sh = (this.shake || 0) * 0.3;
    cam.position.set(this.camPos.x + rand(-sh, sh), this.camPos.y + rand(-sh, sh), this.camPos.z);
    cam.lookAt(tx, ty, tz);
    this.camLook = { x: tx, y: ty, z: tz };
    this.shake = damp(this.shake || 0, 0, 6, dt);
    const spd = P.state === 'drive' ? Math.abs(P.vehicle.speed) : 0;
    const fov = this.baseFov + clamp(spd, 0, 34) * 0.4 - this.aimK * 12;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
  }
}

async function boot() {
  const [map] = await Promise.all([loadMap('data/map.json'), waitFonts()]);
  const game = new Game(map);
  window.__sp = game; // ডিবাগের জন্য
  window.__spReady = true;
  game.sound.loadPack(); // sounds/ ফোল্ডারে ElevenLabs-এর ফাইল থাকলে
  document.getElementById('loading').classList.add('hidden');
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.tick(dt);
  };
  requestAnimationFrame(frame);
}
boot();
