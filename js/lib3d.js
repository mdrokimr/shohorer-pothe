// three.js-এর ছোট সাহায্যকারী: শেপ, ম্যাটেরিয়াল, মেশ জোড়া লাগানো, মানুষ
import * as THREE from 'three';
import { pick } from './utils.js';

const geoCache = new Map();
const matCache = new Map();

export function boxGeo(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
export function cylGeo(rt, rb, h, s = 12) {
  const k = `c${rt}|${rb}|${h}|${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, s); geoCache.set(k, g); }
  return g;
}
export function sphGeo(r, ws = 10, hs = 8) {
  const k = `s${r}|${ws}|${hs}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs); geoCache.set(k, g); }
  return g;
}
export function planeGeo(w, h) {
  const k = `p${w}|${h}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); geoCache.set(k, g); }
  return g;
}
export function lam(color, opts) {
  const k = 'L' + color + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...opts }); matCache.set(k, m); }
  return m;
}
export function bas(color, opts) {
  const k = 'B' + color + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...opts }); matCache.set(k, m); }
  return m;
}
const texMats = new Map();
export function texMat(tex, extra = {}) {
  const k = tex.uuid + JSON.stringify(extra);
  let m = texMats.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: tex, ...extra }); texMats.set(k, m); }
  return m;
}

export function addBox(p, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  p.add(m);
  return m;
}
export function addCyl(p, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  p.add(m);
  return m;
}
export function addPlane(p, w, h, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(planeGeo(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  p.add(m);
  return m;
}
export const dyn = (o) => { o.userData.dyn = true; return o; };

export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function setShadows(o, cast = true, receive = false) {
  o.traverse((m) => {
    if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; }
  });
}

// একই ম্যাটেরিয়ালের স্থির মেশগুলো জোড়া লাগিয়ে একটা মেশ বানায় (কম draw call, দ্রুত চলে)
// userData.dyn থাকলে (যেগুলো নড়ে বা লুকায়) সেগুলো আলাদা থাকে
export function mergeStatic(root, cast = true, receive = true) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.dyn) return;
    if (o.userData.noMerge) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.userData.noShadow ? 'n' : '');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, geos: [], noShadow: !!o.userData.noShadow }));
    b.geos.push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const b of buckets.values()) {
    let n = 0;
    for (const g of b.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let off = 0;
    for (const g of b.geos) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      off += c;
      g.dispose();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mg.applyMatrix4(inv);
    mg.computeBoundingSphere();
    const m = new THREE.Mesh(mg, b.mat);
    m.castShadow = cast && !b.noShadow;
    m.receiveShadow = receive;
    root.add(m);
  }
}

// ---------------- মানুষ ----------------
// সামনের দিক -Z, পা মাটিতে y = 0
const SKINS = [0x8d5a3b, 0x6e4329, 0xa86f4c, 0x5c3a24, 0x7b4b30];
const SHIRTS = [0xe9e4d8, 0x2f6fb5, 0xb53b3b, 0x3c8a4a, 0xd9a43a, 0x6b4fa0, 0x2a2a2a, 0xd0d6e0, 0x3a8f9a];
const LOWER = [0x1f2a44, 0x3b3b3b, 0x2d5a3d, 0x5a3b2a, 0x23324f];

// style: 'pants' | 'shorts' | 'lungi' | 'panjabi' | 'kameez' | 'shari'
export function makePerson(o = {}) {
  const g = new THREE.Group();
  const style = o.style || 'pants';
  const sk = lam(o.skin ?? pick(SKINS));
  const sh = lam(o.shirt ?? pick(SHIRTS));
  const lo = lam(o.lower ?? pick(LOWER));
  const sleeve = o.sando ? sk : (style === 'shari' ? lam(o.blouse ?? 0x7a1f3a) : sh);
  const legMat = style === 'lungi' || style === 'shari' || style === 'shorts' ? sk : lo;

  const legL = new THREE.Group();
  legL.position.set(-0.1, 0.82, 0);
  addBox(legL, 0.14, 0.82, 0.16, legMat, 0, -0.41, 0);
  addBox(legL, 0.15, 0.07, 0.24, lam(0x2a221c), 0, -0.79, -0.04);
  g.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.1, 0.82, 0);
  addBox(legR, 0.14, 0.82, 0.16, legMat, 0, -0.41, 0);
  addBox(legR, 0.15, 0.07, 0.24, lam(0x2a221c), 0, -0.79, -0.04);
  g.add(legR);
  if (style === 'shorts') {
    addBox(legL, 0.16, 0.36, 0.18, lo, 0, -0.18, 0);
    addBox(legR, 0.16, 0.36, 0.18, lo, 0, -0.18, 0);
  }
  if (style === 'lungi') addBox(g, 0.46, 0.74, 0.3, lo, 0, 0.47, 0);
  if (style === 'shari') addBox(g, 0.5, 1.0, 0.34, lo, 0, 0.55, 0);
  addBox(g, 0.44, 0.62, 0.25, style === 'shari' ? lam(o.blouse ?? 0x7a1f3a) : sh, 0, 1.12, 0);
  if (style === 'panjabi' || style === 'kameez') addBox(g, 0.47, 0.52, 0.28, sh, 0, 0.62, 0);
  if (style === 'shari') {
    // আঁচল কাঁধের উপর দিয়ে
    addBox(g, 0.47, 0.42, 0.27, lo, 0, 1.06, 0);
    addBox(g, 0.16, 0.8, 0.07, lo, -0.15, 1.02, 0.15);
  }
  if (style === 'kameez' && o.orna) {
    const om = lam(o.orna);
    addBox(g, 0.5, 0.12, 0.3, om, 0, 1.33, 0);
    addBox(g, 0.1, 0.62, 0.05, om, -0.2, 1.0, 0.15);
    addBox(g, 0.1, 0.62, 0.05, om, 0.2, 1.0, 0.15);
  }
  const head = new THREE.Mesh(sphGeo(0.14), sk);
  head.position.set(0, 1.57, 0);
  g.add(head);
  const hairM = lam(o.hair ?? 0x15110e);
  if (o.longHair) {
    addBox(g, 0.29, 0.1, 0.29, hairM, 0, 1.68, 0.01);
    addBox(g, 0.28, 0.55, 0.1, hairM, 0, 1.42, 0.12);
  } else if (o.bun) {
    addBox(g, 0.28, 0.08, 0.28, hairM, 0, 1.68, 0.01);
    const b = new THREE.Mesh(sphGeo(0.09, 8, 6), hairM);
    b.position.set(0, 1.6, 0.16);
    g.add(b);
  } else {
    addBox(g, 0.27, 0.08, 0.27, hairM, 0, 1.68, 0.02);
  }
  if (o.beard) addBox(g, 0.2, 0.14, 0.09, lam(o.beard), 0, 1.47, -0.1);
  if (o.cap) addBox(g, 0.3, 0.09, 0.3, lam(o.cap), 0, 1.72, 0);
  if (o.specs) addBox(g, 0.24, 0.04, 0.03, lam(0x111111), 0, 1.6, -0.14);

  const mkArm = (x) => {
    const a = new THREE.Group();
    a.position.set(x, 1.38, 0);
    addBox(a, 0.12, 0.58, 0.13, sleeve, 0, -0.27, 0);
    addBox(a, 0.1, 0.1, 0.1, sk, 0, -0.6, 0);
    g.add(a);
    return a;
  };
  const armL = mkArm(-0.29);
  const armR = mkArm(0.29);
  return { group: g, legL, legR, armL, armR, head };
}

// mode: 'walk' | 'angry' | 'clap' | 'cheer' | 'idle' | 'kiss' | 'laugh'
export function animatePerson(p, phase, amp, mode = 'walk') {
  const s = Math.sin(phase);
  p.legL.rotation.x = s * amp;
  p.legR.rotation.x = -s * amp;
  p.armL.rotation.z = 0;
  p.armR.rotation.z = 0;
  if (mode === 'angry') {
    p.armL.rotation.x = 2.9 + Math.sin(phase * 1.7) * 0.4;
    p.armR.rotation.x = 2.6 + Math.cos(phase * 1.3) * 0.5;
  } else if (mode === 'clap') {
    const t = 0.12 + Math.abs(Math.sin(phase * 2.2)) * 0.4;
    p.armL.rotation.x = 1.35;
    p.armR.rotation.x = 1.35;
    p.armL.rotation.z = t;
    p.armR.rotation.z = -t;
  } else if (mode === 'cheer') {
    p.armL.rotation.x = 3.0 + Math.sin(phase * 2) * 0.2;
    p.armR.rotation.x = 3.0 - Math.sin(phase * 2) * 0.2;
    p.armL.rotation.z = -0.3;
    p.armR.rotation.z = 0.3;
  } else if (mode === 'kiss') {
    p.armL.rotation.x = 0;
    p.armR.rotation.x = 2.5 - Math.max(0, Math.sin(phase)) * 1.1;
    p.armR.rotation.z = 0.25;
  } else if (mode === 'laugh') {
    p.armL.rotation.x = 0.9;
    p.armR.rotation.x = 0.9;
    p.armL.rotation.z = 0.5;
    p.armR.rotation.z = -0.5;
  } else if (mode === 'idle') {
    p.armL.rotation.x = 0.05;
    p.armR.rotation.x = 0.05;
  } else {
    p.armL.rotation.x = -s * amp * 0.8;
    p.armR.rotation.x = s * amp * 0.8;
  }
}

// দুই পিঠের সাইনবোর্ড: পিছন থেকে আয়নার মতো উল্টো লেখা না দেখিয়ে পিছনে আরেকটা সোজা মুখ
export function twoFace(m) {
  if (m.material && m.material.side === THREE.DoubleSide) { m.material = m.material.clone(); m.material.side = THREE.FrontSide; }
  const b = new THREE.Mesh(m.geometry, m.material);
  b.rotation.y = Math.PI;
  b.position.z = -0.012;
  m.add(b);
  return m;
}
