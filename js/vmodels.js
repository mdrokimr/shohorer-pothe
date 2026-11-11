// আসল 3D যানবাহন মডেল (Sketchfab, CC-BY; README-তে নাম): লোড হলে কাছের যানবাহনে বসে, দূরে আগের হালকা মডেল
// মডেল না পেলে (অফলাইন/টেস্ট) আগের হাতে-বানানো মডেলই থাকে
import * as THREE from 'three';
import { vurl, VMANAGER, loadGLTF } from './ver.js';
import { paintTex } from './textures.js';
import { freeAfterUpload, isTouch } from './utils.js';
import { LIVERY } from './vehicleart.js';

// গেমের ধরন → মডেলের ফাইল
export const VFILE = {
  car: 'car', police: 'police', cng: 'cng', bike: 'bike', rickshaw: 'rickshaw', bus: 'bus', truck: 'truck',
  heli: 'heli', heli_med: 'heli', heli_police: 'gazelle', plane: 'plane',
};
// দোতলা বাস: ধরন 'bus', কিন্তু আলাদা মডেল
export const fileOf = (v) => (v.dd ? 'ddbus' : VFILE[v.type]);
export const VM = { models: {}, pending: new Set(), near: 80, cam: null, loading: false, specs: null, errors: [] };
const MOBILE_LITE = new Set(['car', 'bike', 'police', 'cng']);
// আসল মডেলে বসার উচ্চতা (কোমর): এসইউভি-র সিট উঁচু, তাই চালক জানালা দিয়ে দেখা যায়
// মডেলের ভিতর মেপে: কার সিট ০.৫৪, মেঝে ০.২৭; বাসের মেঝে ০.৯; ট্রাকের কেবিন ১.০৪
const SEAT_Y = { car: 0.58, police: 0.57, truck: 1.42, bus: 1.32, bike: 0.84, cng: 0.66 };
const SEAT_Z = { car: 0.18, police: 0.3, bus: -3.65 };
// পিছনের লেখা (রিকশা, সিএনজি): মডেলের পিছনে কোথায়
const BACK = { rickshaw: { y: 0.98, z: 1.1, w: 0.78, h: 0.26 }, cng: { y: 0.95, z: 1.31, w: 0.9, h: 0.26 } };

export function isGlassName(n) { return /glass|window|windshield/i.test(n || '') && !/surr|light|lamp|orange|red|ao_tr/i.test(n || ''); }
// মডেলের নিজের পিছনের লাল বাতির কাচ: এগুলোই জ্বলে (আলাদা টুকরো বসাতে হয় না, তাই ঠিক জায়গায়, ঠিক মাপে)
const TAIL_MAT = /^(red_glass|ao_tr_glass|glass_red)$/i;
// ইন্ডিকেটর: মডেলের কমলা কাচের জায়গা মেপে (বাইক) / লাল বারের ভিতরের দিকে (কার)
const LAMP_FIX = {
  car: { indB: [{ x: -0.53, y: 0.99, z: 2.03, w: 0.1, h: 0.035 }, { x: 0.53, y: 0.99, z: 2.03, w: 0.1, h: 0.035 }] },
  bike: { indB: [{ x: -0.12, y: 0.77, z: 0.69, w: 0.045, h: 0.03 }, { x: 0.12, y: 0.77, z: 0.69, w: 0.045, h: 0.03 }], indF: [{ x: -0.115, y: 0.49, z: -0.61, w: 0.04, h: 0.06 }, { x: 0.115, y: 0.49, z: -0.61, w: 0.04, h: 0.06 }] },
};

export function toLambert(m) {
  const glassy = isGlassName(m.name);
  const o = new THREE.MeshLambertMaterial({
    map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    transparent: m.transparent || glassy, opacity: glassy ? Math.min(m.opacity, 0.42) : m.opacity,
    alphaTest: m.alphaTest || 0, side: m.side, vertexColors: !!m.vertexColors,
  });
  if (glassy && !m.map) o.color.setRGB(0.12, 0.16, 0.18);
  if (o.transparent) o.depthWrite = false;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) { o.emissive = m.emissive.clone(); o.emissiveMap = m.emissiveMap || m.map || null; }
  o.name = m.name || '';
  o.userData.glass = glassy;
  o.userData.vm = true;
  return o;
}

// যানবাহনের উপাদান: মডেলের নিজের PBR (ধাতব রং, চকচকে ভাব) রাখা, ম্যাট করলে কার্টুনের মতো লাগে
// উঁচু গ্রাফিক্সে আকাশের প্রতিফলন (gfx.js বসায়); প্রতিফলন না থাকলে ধাতু কালো দেখায়, তাই তখন ধাতব ভাব কম
export function toVehMat(m) {
  const glassy = isGlassName(m.name);
  const o = new THREE.MeshStandardMaterial({
    map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    transparent: m.transparent || glassy, opacity: glassy ? Math.min(m.opacity, 0.45) : m.opacity,
    alphaTest: m.alphaTest || 0, side: m.side, vertexColors: !!m.vertexColors,
    roughness: glassy ? 0.06 : Math.min(0.85, Math.max(0.12, m.roughness ?? 0.6)),
    metalness: 0, normalMap: m.normalMap || null,
  });
  if (glassy && !m.map) o.color.setRGB(0.1, 0.13, 0.15);
  if (o.transparent) o.depthWrite = false;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) { o.emissive = m.emissive.clone(); o.emissiveMap = m.emissiveMap || m.map || null; }
  o.name = m.name || '';
  o.userData.glass = glassy;
  o.userData.vm = true;
  o.userData.metal = glassy ? 0 : Math.min(0.85, m.metalness ?? 0); // উঁচু গ্রাফিক্সে এটা বসে
  o.userData.std = true;
  return o;
}

export async function loadVehicleModels(onDone) {
  if (VM.loading) return;
  VM.loading = true;
  let GLTFLoader;
  try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); } catch (e) { return; }
  const loader = new GLTFLoader(VMANAGER);
  const files = [...new Set([...Object.values(VFILE), 'ddbus'])];
  // ছোট/বেশি দেখা মডেল আগে
  const order = ['cng', 'rickshaw', 'car', 'bus', 'ddbus', 'bike', 'police', 'truck', 'heli', 'gazelle', 'plane'].filter((f) => files.includes(f));
  for (const f of order) {
    try {
      // মোবাইলে হালকা মডেল (একই ছবি, ~৪০% ত্রিভুজ); না পেলে পুরোটা
      let gl;
      if (isTouch() && MOBILE_LITE.has(f)) { try { gl = await loadGLTF(loader, vurl(`assets/veh_${f}_m.gltf.json`)); } catch (e) { gl = null; } }
      if (!gl) gl = await loadGLTF(loader, vurl(`assets/veh_${f}.gltf.json`));
      const scene = gl.scene;
      const cache = new Map();
      const extras = (gl.parser && gl.parser.json && gl.parser.json.extras) || {};
      scene.traverse((o) => {
        if (!o.isMesh) return;
        if (!cache.has(o.material)) cache.set(o.material, (THREE.MeshStandardMaterial ? toVehMat : toLambert)(o.material));
        o.material = cache.get(o.material);
        o.castShadow = true; o.receiveShadow = false;
        o.userData.noDent = true;
      });
      // ছবিতে আঁকা জানালা (বাস): জানালার জায়গা কেটে ফেলা হয়েছে, সেখানে আলাদা কাচ (ভিতরের চালক-যাত্রী দেখা যায়, ভাঙা যায়)
      if (extras.winMask) {
        const mask = await new THREE.TextureLoader().loadAsync(vurl(`assets/${extras.winMask}`));
        mask.flipY = false;
        const gm = new THREE.MeshLambertMaterial({ color: 0x1f3a40, transparent: true, opacity: 0.42, alphaMap: mask, depthWrite: false, side: THREE.DoubleSide });
        gm.name = 'glass'; gm.userData.glass = true;
        const add = [];
        scene.traverse((o) => { if (o.isMesh && !o.material.userData.glass) { o.material.side = THREE.DoubleSide; add.push(o); } });
        for (const o of add) { const gmesh = new THREE.Mesh(o.geometry, gm); gmesh.name = 'winglass'; gmesh.userData.noDent = true; o.add(gmesh); }
      }
      // ভিতরে আলাদা দেয়াল নেই এমন খোলস (দোতলা বাস): দুই পাশই আঁকা, কাচ দিয়ে ভিতরে ফাঁকা দেখায় না
      if (f === 'ddbus') scene.traverse((o) => { if (o.isMesh && !o.material.userData.glass) o.material.side = THREE.DoubleSide; });
      VM.models[f] = { scene, extras };
      // আসল মডেলের সিটের উচ্চতা
      if (VM.specs) for (const [t, file] of Object.entries(VFILE)) if (file === f && SEAT_Y[t] && VM.specs[t]) VM.specs[t].seat = { ...VM.specs[t].seat, y: SEAT_Y[t], ...(SEAT_Z[t] !== undefined ? { z: SEAT_Z[t] } : {}) };
      // অপেক্ষায় থাকা যানবাহনে বসানো
      for (const v of [...VM.pending]) {
        if (fileOf(v) !== f) continue;
        VM.pending.delete(v);
        if (v.g && v.g.parent) attachModel(v);
      }
      if (onDone) onDone(f);
    } catch (e) { console.warn('vehicle model', f, e && e.message); VM.errors.push(`${f}: ${(e && e.message) || e}`); }
  }
}

// রং বদলানো বাসের উপাদান (প্রতি সাজে একটা, সব বাস ভাগ করে)
const BUS_MATS = new Map();
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function busMat(root, li) {
  if (BUS_MATS.has(li)) return BUS_MATS.get(li);
  let base = null;
  root.traverse((o) => { if (!base && o.isMesh && o.material.map && !o.material.userData.glass) base = o.material; });
  let out = null;
  try {
    const img = base && base.map && base.map.image;
    if (img && typeof document !== 'undefined') {
      const w = img.width, h = img.height, cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      const d = c.getImageData(0, 0, w, h), p = d.data;
      const [body, stripe] = [hexRGB(LIVERY[li][0]), hexRGB(LIVERY[li][1])];
      for (let i = 0; i < p.length; i += 4) {
        const px = (i / 4) % w, py = Math.floor(i / 4 / w);
        if (px > w * 0.58 && py > h * 0.56) continue; // ছবির নিচ-ডানে চাকা আর নিচের অংশ: রং বদলায় না
        const r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let col = null, k = 1;
        if (b > 90 && b > r + 45 && b > g + 25) { col = stripe; k = Math.min(1.1, (b + 60) / 230); } // নীল দাগ
        else if (mn > 190 && mx - mn < 30) { col = body; k = mx / 232; } // সাদা-ধূসর গা (ছায়া রেখে)
        if (col) { p[i] = Math.min(255, col[0] * k); p[i + 1] = Math.min(255, col[1] * k); p[i + 2] = Math.min(255, col[2] * k); }
      }
      c.putImageData(d, 0, 0);
      const t = freeAfterUpload(new THREE.CanvasTexture(cv));
      t.flipY = base.map.flipY; t.wrapS = base.map.wrapS; t.wrapT = base.map.wrapT;
      if ('colorSpace' in t) t.colorSpace = base.map.colorSpace;
      t.anisotropy = 4;
      out = base.clone(); out.map = t;
      if (out.emissiveMap === base.map) out.emissiveMap = t;
      out.userData = { ...base.userData };
    }
  } catch (e) { out = null; }
  BUS_MATS.set(li, out);
  return out;
}

const sideMats = new Map();
function sideMat(name, sub, fg) {
  const k = name + '|' + sub + '|' + fg;
  if (!sideMats.has(k)) sideMats.set(k, new THREE.MeshLambertMaterial({ map: paintTex(name, sub, null, fg, 1536, 160), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  return sideMats.get(k);
}

const backTex = new Map();
function backMat(text) {
  if (!backTex.has(text)) backTex.set(text, new THREE.MeshLambertMaterial({ map: paintTex(text, null, '#fff3c4', '#b71c1c', 512, 150), side: THREE.DoubleSide }));
  return backTex.get(text);
}

// যানবাহনে মডেল বসানো; v.procKids = আগের হাতে-বানানো অংশগুলো (দূরে এগুলো দেখা যায়)
export function attachModel(v) {
  const f = fileOf(v);
  if (!f || v.model) return false;
  const M = VM.models[f];
  if (!M) { VM.pending.add(v); return false; }
  const root = M.scene.clone(true);
  root.name = 'vmodel';
  v.mWheels = []; v.mRotor = null; v.mTail = null;
  for (const c of root.children) {
    if (/^wheel/.test(c.name)) { c.userData.s0 = c.scale.y; v.mWheels.push(c); }
    else if (c.name === 'rotor') v.mRotor = c;
    else if (c.name === 'tail') v.mTail = c;
  }
  // প্রাইভেট কারের রং আলাদা আলাদা
  if (v.type === 'car' && v.color) {
    root.traverse((o) => {
      if (o.isMesh && /paint|paitn|body/i.test(o.material.name)) {
        if (!o.material.userData.own) { o.material = o.material.clone(); o.material.userData.own = true; o.material.color.setHex(v.color).multiplyScalar(1.15); }
      }
    });
  }
  // বাসের রং: ছবির সাদা গা আর নীল দাগ বদলে দূরের মডেলের সাজের রং (গোলাপি বাসসহ)
  if (v.type === 'bus' && !v.dd && v.g.userData.livery !== undefined) {
    const mat = busMat(root, v.g.userData.livery);
    if (mat) root.traverse((o) => { if (o.isMesh && o.material.map && !o.material.userData.glass) o.material = mat; });
  }
  // বাসের দুই পাশে নাম আর রুট (দোতলায় দুই তলার মাঝের গোলাপি পট্টিতে)
  if (v.type === 'bus' && v.g.userData.busName) {
    const rt = v.g.userData.busRoute || ['', ''];
    let fg = '#ffffff';
    if (!v.dd && v.g.userData.livery !== undefined) { const [r, g, b] = hexRGB(LIVERY[v.g.userData.livery][0]); if (0.299 * r + 0.587 * g + 0.114 * b > 150) fg = '#1b1b1b'; }
    const mat = sideMat(v.g.userData.busName, `${rt[0]} — ${rt[1]}`, fg);
    const P = v.dd ? { xl: -1.275, xr: 1.275, y: 2.92, z: 0.2, w: 6 } : { xl: -1.205, xr: 1.113, y: 1.22, z: 0.3, w: 5 };
    for (const [x, ry] of [[P.xl, -Math.PI / 2], [P.xr, Math.PI / 2]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.w / 9.6), mat);
      pl.position.set(x, P.y, P.z); pl.rotation.y = ry; pl.userData.noShadow = true; pl.userData.noDent = true;
      root.add(pl);
    }
  }
  // পুলিশের ছাদের বাতি
  if (v.type === 'police') {
    root.traverse((o) => {
      if (o.isMesh && /roof_lights|light_bar/i.test(o.material.name) && !v.mSiren) {
        o.material = o.material.clone(); o.material.emissive = new THREE.Color(0); v.mSiren = o.material;
      }
    });
  }
  // কাচ: প্রতিটা যানবাহনের নিজের (আলাদা আলাদা ভাঙে)
  v.mGlass = [];
  const own = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material.userData.glass) return;
    if (!own.has(o.material)) { const c = o.material.clone(); c.userData.base = { map: c.map, opacity: c.opacity, color: c.color.getHex() }; own.set(o.material, c); }
    o.material = own.get(o.material);
    v.mGlass.push(o);
  });
  // পিছনের লাল বাতির কাচ: প্রতিটা যানবাহনের নিজের (ব্রেকে আলাদা জ্বলে)
  v.mTailMats = [];
  const ownT = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !TAIL_MAT.test(o.material.name || '')) return;
    if (!ownT.has(o.material)) {
      const c = o.material.clone();
      c.transparent = false; c.opacity = 1; c.depthWrite = true; c.color.setRGB(0.32, 0.02, 0.02); c.emissive = new THREE.Color(0x3a0303); c.emissiveMap = null;
      ownT.set(o.material, c); v.mTailMats.push(c);
    }
    o.material = ownT.get(o.material);
  });
  // পিছনের মজার লেখা
  const B = BACK[v.type];
  if (B && v.backText) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), backMat(v.backText));
    p.position.set(0, B.y, B.z); p.userData.noShadow = true;
    root.add(p);
  }
  v.g.add(root);
  v.model = root;
  v.mExt = M.extras.ext || null;
  v.mLamps = M.extras.lamps ? { ...M.extras.lamps, ...(LAMP_FIX[v.type] || {}) } : null;
  if (v.placeLamps) v.placeLamps();
  if (v.placeSteer) v.placeSteer(); // আসল মডেলে সিটের উচ্চতা বদলায়
  // হেলিকপ্টারের রোটর: আগের ঘোরানোর কোড এগুলোই ঘোরাবে
  if (v.mRotor && v.g.userData.rotors) {
    v.procRotors = v.g.userData.rotors;
    v.g.userData.rotors = [v.mRotor, v.mTail || new THREE.Object3D(), v.procRotors[2] || null];
  }
  v.lodNear = null;
  v.setLod(true);
  return true;
}
