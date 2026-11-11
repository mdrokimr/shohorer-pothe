// আসল মানুষের মডেল (Mixamo, assets/player.gltf.json): আপনার চরিত্র আর কাছের পথচারীরা
// নড়াচড়া: Mixamo-র আসল (মোশন-ক্যাপচার) অ্যানিমেশন (assets/anims.json); যেটার অ্যানিমেশন নেই সেটা আমাদের নিজের ভঙ্গি থেকে (posemap.js)।
// পথচারীদের জন্য একই মডেলের নানা রূপ: জামা-প্যান্টের রং, গায়ের রং (শ্যামলা-বাদামি), চোখের মণি কালো, উচ্চতা।
import * as THREE from 'three';
import { vurl, VMANAGER, loadGLTF } from './ver.js';
import { freeAfterUpload } from './utils.js';
import { prepare, fk, retarget, FINGER, THUMB, curlQ } from './posemap.js';
import { randomGait } from './humangeo.js';

const isTouchDev = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
export const REAL = { ready: false, active: 0, max: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 3 : 8, variants: [], failed: false };
const SHIRTS = ['#e9e4d8', '#2f6fb5', '#b53b3b', '#3c8a4a', '#d9a43a', '#6b4fa0', '#d0d6e0', '#3a8f9a', '#8d6e63', '#ffffff', '#90caf9', '#1d2a3a', '#c2185b', '#455a64'];
const PANTS = ['#1f2a44', '#3b3b3b', '#5a4a3a', '#23324f', '#2d3a2d', '#2b4a7a', '#8d7b4a', '#1b1b1b', '#6d6250'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let SkeletonUtils = null;
export async function loadReal() {
  try {
    const [{ GLTFLoader }, SU] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
    SkeletonUtils = SU;
    const gltf = await loadGLTF(new GLTFLoader(VMANAGER), vurl('assets/player.gltf.json'));
    const mask = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = vurl('assets/player_mask.png'); });
    const bones = [];
    gltf.scene.traverse((o) => { if (o.isBone) bones.push(o); });
    const names = bones.map((b) => b.name.replace(/^mixamorig\d*:?/, ''));
    const parent = bones.map((b) => bones.indexOf(b.parent));
    const rest = bones.map((b) => [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]);
    REAL.R = prepare(names, parent, rest, [0, 1, 0, 0]);
    REAL.names = names;
    REAL.fingers = names.map((n, i) => (FINGER.test(n) ? i : -1)).filter((i) => i >= 0);
    REAL.thumbs = names.map((n, i) => (THUMB.test(n) ? i : -1)).filter((i) => i >= 0);
    REAL.hipsRest = bones[names.indexOf('Hips')].position.clone();
    REAL.gltf = gltf;
    REAL.mask = mask;
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.userData.shared = true;
        if (o.material && o.material.name === 'body') REAL.bodyMat = o.material;
      }
    });
    // অ্যানিমেশন (না পেলেও চলবে, তখন কোডের ভঙ্গি)
    try {
      const A = await (await fetch(vurl('assets/anims.json'))).json();
      REAL.clips = {};
      for (const [name, c] of Object.entries(A)) REAL.clips[name] = buildClip(name, c);
    } catch (e) { console.warn('anims not loaded', e); REAL.clips = null; }
    REAL.ready = true;
    // পথচারীদের রূপ: একটা একটা করে বানানো (ফ্রেম না আটকাতে)
    const mk = async () => { while (REAL.variants.length < (isTouchDev ? 4 : 7)) { const m = await makeVariantAsync(randomLook()); if (!m) break; REAL.variants.push(m); } };
    setTimeout(mk, 500);
    return true;
  } catch (e) {
    console.warn('real character not loaded', e);
    REAL.err = (e && e.message) || String(e);
    REAL.failed = true;
    return false;
  }
}
// JSON থেকে three.js-এর অ্যানিমেশন: প্রতি হাড়ের কোয়াটারনিয়ন (স্থির হাড়ে একটাই মান), কোমরের অবস্থান
function buildClip(name, c) {
  const n = c.n, f = c.f || 30, dur = (n - 1) / f;
  const times = new Float32Array(n);
  for (let i = 0; i < n; i++) times[i] = i / f;
  const tracks = [];
  for (const [bone, q] of Object.entries(c.q)) {
    if (q.length === 4) tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', [0, dur], [...q, ...q]));
    else tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, q));
  }
  if (c.hp) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, c.hp));
  const clip = new THREE.AnimationClip(name, dur, tracks);
  clip.userData = { pp: !!c.pp, hips: !!c.hp };
  return clip;
}
// ভঙ্গি → অ্যানিমেশন (null = কোডের ভঙ্গি)
const ONCE = { Head_Hit: 1.4, Mma_Kick: 1.8, Jump: 1.25 };
function pickClip(rig, pose, speed) {
  const F = rig.flags || {};
  switch (pose) {
    case 'idle': return [rig.idleClip, 1];
    case 'walk': return ['Walking', Math.min(1.6, Math.max(0.55, speed / 1.3))];
    case 'run': return speed > 4.6 ? ['Fast_Run', Math.min(1.4, Math.max(0.7, speed / 6.2))] : ['Running', Math.min(1.5, Math.max(0.6, speed / 3.6))];
    case 'aim': return [F.shoot ? 'Shooting' : 'Pistol_Idle', 1];
    case 'aimWalk': return [F.back ? 'Pistol_Walk_Backward' : 'Pistol_Walk', Math.min(1.5, Math.max(0.6, speed / 1.5))];
    case 'drive': return null; // নিজের ভঙ্গি (পা মেঝেতে থাকে, মডেলের সাথে মেলে)
    case 'sit': return ['Sitting_Idle', 1];
    case 'phone': return ['Talking_On_Phone', 1];
    case 'surrender': return ['Terrified', 1];
    case 'flinch': case 'stagger': return ['Head_Hit', ONCE.Head_Hit];
    case 'kick': return ['Mma_Kick', ONCE.Mma_Kick];
    case 'air': return ['Jump', ONCE.Jump];
    default: return null;
  }
}

function randomLook() {
  return { shirt: pick(SHIRTS), pants: pick(PANTS), skin: 0.82 + Math.random() * 0.22, eyes: true };
}
const hex = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

// জামা-প্যান্ট-গায়ের রং বদলানো টেক্সচার। মাস্কের লাল চ্যানেলে শ্রেণি: ৬৪ = সোয়েটার, ১২৮ = প্যান্ট, ১৯২ = কলার, ২৫৫ = শরীর
// কাজটা টুকরো টুকরো (সারি ধরে) হয়, যাতে খেলা না আটকায়; sync = true দিলে একবারে
function* recolor(o, out) {
  const base = REAL.bodyMat.map.image;
  const W = 1024, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(base, 0, 0, W, H);
  const img = c.getImageData(0, 0, W, H), d = img.data;
  let M = null;
  if (REAL.mask) {
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    const mx = mc.getContext('2d', { willReadFrequently: true });
    mx.imageSmoothingEnabled = false;
    mx.drawImage(REAL.mask, 0, 0, W, H);
    M = mx.getImageData(0, 0, W, H).data;
  }
  yield;
  const rgb = (h) => { const n = parseInt(hex(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const col = { 1: o.shirt ? rgb(o.shirt) : null, 2: o.pants ? rgb(o.pants) : null, 3: o.collar ? rgb(o.collar) : null };
  const cls = (i) => (M ? Math.round(M[i] / 64) : 0);
  // কাপড়ের গড় উজ্জ্বলতা (ভাঁজ-ছায়া ঠিক রাখতে)
  const sum = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i += 32) { const k = cls(i); if (k >= 1 && k <= 3) { sum[k] += (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255; cnt[k]++; } }
  const avg = sum.map((v, k) => (cnt[k] ? v / cnt[k] : 0.2));
  const tint = o.skin ? [0.74 * o.skin, 0.58 * o.skin, 0.47 * o.skin] : null;
  yield;
  for (let y = 0; y < H; y++) {
    for (let i = y * W * 4, e = i + W * 4; i < e; i += 4) {
      const k = cls(i);
      if (!k) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      if (k <= 3) {
        const cc = col[k];
        if (!cc) continue;
        const f = Math.min(1.9, (L / avg[k]) * 0.92);
        d[i] = Math.min(255, cc[0] * f); d[i + 1] = Math.min(255, cc[1] * f); d[i + 2] = Math.min(255, cc[2] * f);
      } else {
        if (tint && r > 55 && r > g && g > b && r - b > 18) { d[i] = r * tint[0]; d[i + 1] = g * tint[1]; d[i + 2] = b * tint[2]; }
        else if (o.eyes && b > r + 8 && b >= g && b > 45) { d[i] = 52 + L * 40; d[i + 1] = 34 + L * 25; d[i + 2] = 22 + L * 15; } // নীল মণি → কালচে বাদামি
      }
    }
    if (y % 96 === 95) yield;
  }
  c.putImageData(img, 0, 0);
  const tex = freeAfterUpload(new THREE.CanvasTexture(cv));
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = REAL.bodyMat.clone();
  m.map = tex;
  out.mat = m;
}
export function makeVariant(o) {
  const out = {};
  for (const _ of recolor(o, out)) { /* একবারে */ }
  return out.mat;
}
export function makeVariantAsync(o) {
  return new Promise((res) => {
    const out = {}, it = recolor(o, out);
    const step = () => { try { if (it.next().done) res(out.mat); else setTimeout(step, 16); } catch (e) { console.warn('variant', e); res(null); } };
    step();
  });
}

// সরল কঙ্কাল (দেখা যায় না): setPose এখানে কোণ লেখে, তারপর আসল হাড়ে বসানো হয়
function dummy() {
  const droot = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; droot.add(hips);
  const spine = new THREE.Group(); hips.add(spine);
  const head = new THREE.Group(); head.position.y = 0.655; spine.add(head);
  const arm = (s) => { const sh = new THREE.Group(); sh.position.set(s * 0.205, 0.52, 0); const el = new THREE.Group(); el.position.y = -0.29; sh.add(el); spine.add(sh); return { sh, el }; };
  const leg = (s) => { const hp = new THREE.Group(); hp.position.x = s * 0.095; const kn = new THREE.Group(); kn.position.y = -0.45; const ft = new THREE.Group(); ft.position.y = -0.44; kn.add(ft); hp.add(kn); hips.add(hp); return { hp, kn, ft }; };
  return { droot, hips, spine, head, aL: arm(-1), aR: arm(1), lL: leg(-1), lR: leg(1) };
}
const E = (o) => [o.rotation.x, o.rotation.y, o.rotation.z];

// o: { variant: material | 'random' | null, height }
export function makeRealRig(o = {}) {
  const scene = SkeletonUtils.clone(REAL.gltf.scene);
  const wrap = new THREE.Group(); wrap.rotation.y = Math.PI; wrap.add(scene);
  const root = new THREE.Group(); root.add(wrap);
  const h = o.height ?? 1;
  root.scale.setScalar(h);
  const bones = [];
  scene.traverse((b) => { if (b.isBone) bones.push(b); });
  let mat = o.variant === 'random' ? (REAL.variants.length ? pick(REAL.variants) : null) : o.variant || null;
  scene.traverse((m) => {
    if (m.isSkinnedMesh) {
      m.castShadow = true; m.userData.shared = true; m.frustumCulled = false;
      if (mat && m.material && m.material.name === 'body') m.material = mat;
    }
  });
  const D = dummy();
  const hipsB = bones[REAL.names.indexOf('Hips')], handR = bones[REAL.names.indexOf('RightHand')];
  const out = [];
  const mixer = REAL.clips ? new THREE.AnimationMixer(scene) : null;
  const actions = {};
  const rig = {
    root, ...D, real: true, look: { female: false, style: 'shirt', age: 'adult', gait: o.gait || randomGait() }, cur: {}, phase: Math.random() * 6, handR, bones,
    idleClip: o.idle || (Math.random() < 0.3 ? 'Happy_Idle' : 'Idle'),
    // আসল অ্যানিমেশন চালানো; true = এই ভঙ্গির অ্যানিমেশন আছে
    anim(pose, dt, speed) {
      const pc = mixer && pickClip(rig, pose, speed);
      const clip = pc && REAL.clips[pc[0]];
      if (!clip) {
        if (rig.clipOn) { mixer.stopAllAction(); rig.clipOn = null; rig.curlApplied = -1; }
        return false;
      }
      if (rig.clipOn !== pc[0]) {
        let a = actions[pc[0]];
        if (!a) {
          a = actions[pc[0]] = mixer.clipAction(clip);
          if (ONCE[pc[0]]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
          else if (clip.userData.pp) a.setLoop(THREE.LoopPingPong, Infinity);
        }
        a.reset();
        if (pc[0] === 'Jump') a.time = 0.25;
        if (!clip.userData.hips) hipsB.position.copy(REAL.hipsRest);
        const prev = rig.clipOn && actions[rig.clipOn];
        a.setEffectiveWeight(1).play();
        if (prev) a.crossFadeFrom(prev, 0.22, false); // আগের অ্যানিমেশন থেকে মসৃণভাবে
        else { mixer.stopAllAction(); a.play(); }
        if (pose === 'idle' || pose === 'sit' || pose === 'phone') a.time = Math.random() * clip.duration; // সবাই একসাথে একই নড়াচড়া নয়
        rig.clipOn = pc[0];
      }
      actions[pc[0]].timeScale = pc[1] * ((rig.look.gait && rig.look.gait.rate) || 1);
      mixer.update(dt);
      return true;
    },
    apply() {
      if (rig.clipOn) return;
      const J = fk({ hips: E(D.hips), spine: E(D.spine), head: E(D.head), shL: E(D.aL.sh), elL: E(D.aL.el), shR: E(D.aR.sh), elR: E(D.aR.el), hpL: E(D.lL.hp), knL: E(D.lL.kn), hpR: E(D.lR.hp), knR: E(D.lR.kn), ftL: E(D.lL.ft), ftR: E(D.lR.ft) });
      retarget(REAL.R, J, out);
      const R = REAL.R;
      for (let i = 0; i < bones.length; i++) if (R.joint[i]) { const q = out[i]; bones[i].quaternion.set(q[0], q[1], q[2], q[3]); }
      // আঙুল: আলগা ভাঁজ (হাঁটায়), মুঠি (মারামারি, হাতল ধরা)
      const cu = rig.curl ?? 0.45;
      if (Math.abs(cu - (rig.curlApplied ?? -1)) > 0.02) {
        rig.curlApplied = cu;
        for (const i of REAL.fingers) bones[i].quaternion.fromArray(curlQ(R.restLocal[i], cu * (REAL.names[i].endsWith('1') ? 0.8 : 1.1)));
        for (const i of REAL.thumbs) bones[i].quaternion.fromArray(curlQ(R.restLocal[i], cu * 0.35));
      }
      hipsB.position.set(REAL.hipsRest.x - D.hips.position.x, REAL.hipsRest.y + (D.hips.position.y - 0.95), REAL.hipsRest.z);
    },
    dispose() {
      if (rig.disposed) return;
      rig.disposed = true;
      if (rig.counted) REAL.active--;
      scene.traverse((m) => { if (m.isSkinnedMesh && m.skeleton) m.skeleton.dispose(); });
    },
  };
  rig.apply();
  return rig;
}
