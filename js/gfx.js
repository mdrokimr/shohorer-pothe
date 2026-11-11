// গ্রাফিক্সের মান: "সাধারণ" (ফোনে দ্রুত) আর "উঁচু মান" (আসলের মতো আলো, কাচে আকাশের প্রতিফলন, রাতে বাতির আভা, বড় ছায়া)
import * as THREE from 'three';
import { store, isTouch } from './utils.js';

const MOBILE = isTouch();

// আকাশ-মাটির সহজ প্রতিফলনের ছবি (কাচ আর গাড়ির রঙে দেখা যায়)
function envTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#6f9fd8'); gr.addColorStop(0.42, '#cfe2f5'); gr.addColorStop(0.5, '#f4efe4');
  gr.addColorStop(0.53, '#7d7a72'); gr.addColorStop(1, '#3a3936');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  // দূরের বিল্ডিংয়ের সারি
  x.fillStyle = 'rgba(70,78,90,0.55)';
  for (let i = 0; i < 40; i++) { const w = 4 + Math.random() * 9, h = 4 + Math.random() * 14; x.fillRect(i * 6.4, 64 - h, w, h); }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Gfx {
  constructor(g) {
    this.g = g;
    const saved = store('sp_gfx');
    // শক্তিশালী ফোনে (৬+ জিবি র‍্যাম বা ৮ কোর) প্রথম থেকেই উঁচু মান
    // ফোনেও প্রথমে উঁচু মান (ছায়া, আলো, সুন্দর রং); খুব ধীর হলে খেলা নিজে কমিয়ে দেয় (this.auto)
    this.q = saved === 'high' || saved === 'low' ? saved : 'high';
    this.auto = !(saved === 'high' || saved === 'low');
    this.mats = []; // { m, r }
    this.scanT = 0;
    this.post = null;
    this.postFailed = false;
    this.env = null;
    this.bgKey = '';
  }
  get high() { return this.q === 'high'; }
  set(q) {
    if (q === this.q) return;
    this.q = q;
    store('sp_gfx', q);
    this.apply();
  }
  apply() {
    const g = this.g, r = g.renderer, sun = g.sun, H = this.high;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(Math.min(dpr, H ? (MOBILE ? 1.5 : 2) : (MOBILE ? 1 : 1.25)));
    r.toneMapping = H ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = H ? 1.05 : 1; // ধুলোমাখা আকাশ: ১.০–১.০৫; রাতের ব্লুম আলাদা
    // ছায়া: উঁচু মানে বড় এলাকা আর বেশি খুঁটিনাটি
    const ms = H ? (MOBILE ? 2048 : 4096) : (MOBILE ? 1024 : 2048);
    sun.shadow.mapSize.set(ms, ms);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.035;
    const sc = sun.shadow.camera, ext = H ? 70 : 45;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = H ? 280 : 220;
    sc.updateProjectionMatrix();
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (H && !this.env) this.env = envTexture();
    this.scan(true);
    for (const o of this.mats) this.setEnv(o);
    // টোন ম্যাপিং বদলালে সব উপাদান নতুন করে বানাতে হয়
    g.scene.traverse((o) => { const m = o.material; if (!m) return; (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    if (!H) g.scene.background = null;
    else this.bgKey = '';
    if (H && !this.post && !this.postFailed) this.loadPost();
    this.resize();
  }
  setEnv(o) {
    const H = this.high, m = o.m;
    if (m.isMeshStandardMaterial) { // যানবাহনের PBR উপাদান: প্রতিফলন থাকলে আসল ধাতব ভাব, না থাকলে ধাতু কালো দেখায় বলে কম
      m.envMap = H ? this.env : null;
      m.envMapIntensity = m.userData.glass ? 1.1 : 0.85;
      m.metalness = H ? (m.userData.metal || 0) : Math.min(0.12, m.userData.metal || 0);
      m.needsUpdate = true;
      return;
    }
    m.envMap = H ? this.env : null;
    m.combine = THREE.MixOperation;
    m.reflectivity = o.r;
    m.needsUpdate = true;
  }
  // নতুন যানবাহন/কাচের উপাদান খুঁজে প্রতিফলন দেওয়া
  scan(force = false) {
    const add = (m, r) => { m.userData.gfx = true; const o = { m, r }; this.mats.push(o); if (this.high) this.setEnv(o); };
    this.g.scene.traverse((ob) => {
      const m = ob.material;
      if (!m || Array.isArray(m) || m.userData.gfx) return;
      if (m.isMeshStandardMaterial && m.userData.std) { add(m, 0); return; }
      if (!m.isMeshLambertMaterial) return;
      if (m.userData.glass) add(m, 0.55);
      else if (m.userData.paint) add(m, 0.14);
    });
    for (const m of this.g.world.glassMats || []) if (!m.userData.gfx) add(m, 0.12); // উঁচু কাচের টাওয়ার: হালকা প্রতিফলন
    if (this.g.metro && this.g.metro.winM && !this.g.metro.winM.userData.gfx) add(this.g.metro.winM, 0.12); // কম প্রতিফলন: ভিতরের যাত্রী দেখা যায়
  }
  async loadPost() {
    try {
      const base = 'three/addons/postprocessing/';
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import(base + 'EffectComposer.js'), import(base + 'RenderPass.js'), import(base + 'UnrealBloomPass.js'), import(base + 'OutputPass.js'),
      ]);
      const g = this.g, r = g.renderer;
      const w = window.innerWidth, h = window.innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: MOBILE ? 0 : 4 });
      const comp = new EffectComposer(r, rt);
      comp.addPass(new RenderPass(g.scene, g.camera));
      // GTA V-স্টাইল সান গ্লেয়ার: উচ্চ threshold = শুধু সূর্য/উজ্জ্বল বাতি; হালকা strength
      const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.18, 0.65, 0.9);
      comp.addPass(bloom);
      comp.addPass(new OutputPass());
      this.post = { comp, bloom };
      this.resize();
    } catch (e) {
      this.postFailed = true; // ইন্টারনেট/ব্রাউজারে না পেলে আভা ছাড়াই চলে
    }
  }
  resize() {
    if (!this.post) return;
    const r = this.g.renderer, w = window.innerWidth, h = window.innerHeight;
    this.post.comp.setPixelRatio(r.getPixelRatio());
    this.post.comp.setSize(w, h);
  }
  // আকাশ: উঁচু মানে ছবির পেছনে আকাশের রং (ঝলক-প্রভাবে স্বচ্ছতা হারায় বলে)
  sky() {
    const S = this.g.sky;
    if (!S || !S.cols) return;
    const key = S.cols.map((c) => c.getHexString()).join();
    if (key === this.bgKey) return;
    this.bgKey = key;
    if (!this.bgCv) { this.bgCv = document.createElement('canvas'); this.bgCv.width = 4; this.bgCv.height = 256; }
    const x = this.bgCv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + S.cols[0].getHexString()); gr.addColorStop(0.4, '#' + S.cols[1].getHexString()); gr.addColorStop(0.7, '#' + S.cols[2].getHexString()); gr.addColorStop(1, '#' + S.cols[2].getHexString());
    x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
    if (!this.bgTex) { this.bgTex = new THREE.CanvasTexture(this.bgCv); if ('colorSpace' in this.bgTex) this.bgTex.colorSpace = THREE.SRGBColorSpace; }
    this.bgTex.needsUpdate = true;
    this.g.scene.background = this.bgTex;
  }
  render(dt) {
    const g = this.g;
    this.scanT -= dt || 0;
    if (this.scanT <= 0) { this.scanT = 2.5; this.scan(); }
    if (this.high) {
      // ভেজা রাস্তায় আকাশের প্রতিফলন
      const rm = g.world.roadMat;
      if (rm && this.env) {
        const wet = g.world.wet || 0;
        if (wet > 0.05 && rm.envMap !== this.env) { rm.envMap = this.env; rm.combine = THREE.MixOperation; rm.needsUpdate = true; }
        if (rm.envMap) rm.reflectivity = wet * 0.12; // ভেজা রাস্তায় হালকা ঝিলিক (বেশি হলে কাচের মতো লাগে)
      }
      if (this.post) {
        this.sky();
        const night = g.sky ? g.sky.night : 0;
        this.post.bloom.strength = 0.1 + night * 0.5;
        this.post.bloom.threshold = 0.9 - night * 0.08; // দিনে শুধু সূর্য; রাতে বাতিও
        this.post.comp.render(dt);
        return;
      }
    }
    g.renderer.render(g.scene, g.camera);
  }
}
