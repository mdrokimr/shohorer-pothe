// মানুষের মডেল: মসৃণ শরীর, আসল অনুপাত, মুখ-চুল, দেশি পোশাক (জ্যামিতি humangeo.js-এ), জোড়ায় জোড়ায় নাড়ানো
// বাকি কোড শুধু rig.root, setPose, giveGun আর কয়েকটা জোড় (spine, aR.el) ব্যবহার করে
import * as THREE from 'three';
import { damp } from './utils.js';
import { buildHuman, poseTargets, bikeMods } from './humangeo.js';
import { REAL, makeRealRig } from './realrig.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const colCache = new Map();
const tmp = new THREE.Color();
function lin(hex) {
  let c = colCache.get(hex);
  if (!c) { tmp.set(hex); c = [Math.round(tmp.r * 255), Math.round(tmp.g * 255), Math.round(tmp.b * 255)]; colCache.set(hex, c); }
  return c;
}
// মেমরি বাঁচাতে: দিক Int8, রং Uint8 (দুটোই normalized)
function toMesh(bag) {
  const n = bag.c.length;
  const P = new Float32Array(bag.p), N = new Int8Array(n * 3), C = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) N[i] = Math.round(Math.max(-1, Math.min(1, bag.n[i])) * 127);
  for (let i = 0; i < n; i++) { const c = lin(bag.c[i]); C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, MAT);
  m.castShadow = true;
  return m;
}

// বাংলাদেশ পুলিশ (ঢাকা মহানগর পুলিশ, ১ জুলাই ২০২৬ থেকে): হালকা জলপাই শার্ট, খাকি প্যান্ট, গাঢ় নীল টুপি
export const POLICE_LOOK = { shirt: 0xa8a675, pants: 0xb99c6b, cap: 0x1c2a4a, style: 'shirt' };
export function makeRig(o = {}) {
  // কাছের পথচারী (পুরুষ): আসল মডেল, জায়গা থাকলে
  if (o.real && !o.female && REAL.ready && REAL.active < REAL.max) {
    const r = makeRealRig({ variant: 'random', height: 0.92 + Math.random() * 0.1 });
    r.counted = true; REAL.active++;
    return r;
  }
  const H = buildHuman(o), P = H.parts, J = H.joints;
  const root = new THREE.Group();
  root.userData.female = !!H.look.female;
  root.scale.setScalar(H.look.height);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  hips.add(toMesh(P.pelvis));
  const spine = new THREE.Group();
  hips.add(spine);
  spine.add(toMesh(P.body));
  const head = new THREE.Group();
  head.position.set(0, J.neck, -0.005);
  head.add(toMesh(P.head));
  spine.add(head);
  const arm = (s) => {
    const sh = new THREE.Group();
    sh.position.set(s * J.shX, J.shY, 0);
    sh.add(toMesh(P[s < 0 ? 'uaL' : 'uaR']));
    const el = new THREE.Group();
    el.position.y = J.elbow;
    el.add(toMesh(P[s < 0 ? 'faL' : 'faR']));
    sh.add(el);
    spine.add(sh);
    return { sh, el };
  };
  const leg = (s) => {
    const hp = new THREE.Group();
    hp.position.set(s * J.hipX, 0, 0);
    hp.add(toMesh(P[s < 0 ? 'thL' : 'thR']));
    const kn = new THREE.Group();
    kn.position.y = J.knee;
    kn.add(toMesh(P[s < 0 ? 'shL' : 'shR']));
    hp.add(kn);
    hips.add(hp);
    return { hp, kn };
  };
  return {
    root, hips, spine, head, look: H.look,
    aL: arm(-1), aR: arm(1), lL: leg(-1), lR: leg(1),
    cur: {}, phase: Math.random() * 6,
  };
}

// হাতে পিস্তল (দেখানো/লুকানো)
const GUN_GEO = new THREE.BoxGeometry(0.04, 0.17, 0.07);
const GRIP_GEO = new THREE.BoxGeometry(0.035, 0.06, 0.1);
const GUN_MAT = new THREE.MeshLambertMaterial({ color: 0x1b1b1d });
export function giveGun(rig, on) {
  if (!rig.gun && on && rig.handR) {
    // আসল মডেলে ডান হাতের হাড়ে (হাড়ের Y = আঙুলের দিক)
    const g = new THREE.Group();
    const b = new THREE.Mesh(GUN_GEO, GUN_MAT); b.position.set(0, 0.11, 0.03);
    const h = new THREE.Mesh(GRIP_GEO, GUN_MAT); h.position.set(0, 0.06, -0.01); h.rotation.x = 1.4;
    g.add(b, h); g.rotation.x = 1.5; g.position.set(0, 0.06, 0);
    rig.handR.add(g);
    rig.gun = g;
  }
  if (!rig.gun && on) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(GUN_GEO, GUN_MAT);
    b.position.set(0, -0.4, -0.03);
    const h = new THREE.Mesh(GRIP_GEO, GUN_MAT);
    h.position.set(0, -0.33, 0.02);
    g.add(b, h);
    rig.aR.el.add(g);
    rig.gun = g;
  }
  if (rig.gun) rig.gun.visible = !!on;
}

const KM = { hL: 2.2, hR: 2.2, kL: 2.2, kR: 2.2, fL: 2.2, fR: 2.2, hzL: 1.6, hzR: 1.6, bob: 2, hipY: 1.5, sL: 0.7, sR: 0.7, eL: 0.6, eR: 0.6, szL: 0.7, szR: 0.7, headY: 0.45, headX: 0.5, twist: 0.8, curl: 0.5 };
export function setPose(rig, pose, dt, speed = 0, k = 12) {
  if (rig.anim && rig.anim(pose, dt, speed)) return; // আসল মডেল: Mixamo-র অ্যানিমেশন
  const rate = pose === 'swim' ? 1.4 + speed : pose === 'tread' ? 1.2 : pose === 'angry' || pose === 'cheer' ? 3 : pose === 'run' ? 1.6 + speed * 1.45 : pose === 'walk' || pose === 'aimWalk' ? 2.4 + speed * 2.6 : pose === 'pedal' ? speed * 1.6 + 1 : 2;
  rig.phase += dt * rate * ((rig.look && rig.look.gait && rig.look.gait.rate) || 1);
  const t = poseTargets(pose, rig.phase, speed, rig.look);
  if (pose === 'bike' && rig.bike) bikeMods(t, rig.bike);
  const c = rig.cur;
  // পা দ্রুত লক্ষ্যে (পিছলানো নয়), হাত একটু দেরিতে দোলে, মাথা আরও ধীরে: যন্ত্রের মতো একসাথে নড়ে না
  for (const key in t) c[key] = c[key] === undefined ? t[key] : damp(c[key], t[key], k * (KM[key] || 1), dt);
  rig.aL.sh.rotation.x = c.sL; rig.aR.sh.rotation.x = c.sR;
  rig.aL.sh.rotation.z = c.szL; rig.aR.sh.rotation.z = c.szR;
  rig.aL.el.rotation.x = c.eL; rig.aR.el.rotation.x = c.eR;
  rig.lL.hp.rotation.x = c.hL; rig.lR.hp.rotation.x = c.hR;
  rig.lL.hp.rotation.z = c.hzL; rig.lR.hp.rotation.z = c.hzR;
  rig.lL.kn.rotation.x = c.kL; rig.lR.kn.rotation.x = c.kR;
  if (rig.lL.ft) { rig.lL.ft.rotation.x = c.fL; rig.lR.ft.rotation.x = c.fR; rig.curl = c.curl; }
  // কোমর ঘোরে আর দোলে, কাঁধ উল্টো দিকে; মাথা সামনে স্থির থাকার চেষ্টা করে
  rig.hips.rotation.y = c.hipTw; rig.hips.rotation.z = c.hipRoll;
  rig.hips.position.x = c.hipX;
  rig.hips.position.y = c.hipY + c.bob;
  rig.spine.rotation.x = -c.lean;
  rig.spine.rotation.y = c.twist;
  rig.spine.rotation.z = -c.hipRoll * 0.6;
  if (rig.head) { rig.head.rotation.y = c.headY - (c.twist + c.hipTw) * 0.7; rig.head.rotation.x = -c.headX; }
  if (rig.apply) rig.apply();
}
