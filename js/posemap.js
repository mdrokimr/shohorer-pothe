// আসল (Mixamo) কঙ্কালে আমাদের ভঙ্গি বসানো: three.js ছাড়া শুধু কোয়াটারনিয়নের হিসাব (টেস্টে সরাসরি চালানো যায়)
// নিয়ম: আমাদের সরল কঙ্কালের প্রতিটা জোড় যতটা ঘোরে (হাত ঝোলানো অবস্থা থেকে), আসল হাড়ও ঠিক ততটা ঘোরে।
// আসল মডেলের বাঁধা ভঙ্গি T (হাত দুই পাশে সোজা); তাই হাতের "বিশ্রাম" ধরা হয় হাত নিচে নামানো অবস্থা।

export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qinv = (a) => [-a[0], -a[1], -a[2], a[3]];
// q-এর t অংশ (একক থেকে q পর্যন্ত slerp)
export function qpow(q, t) {
  let w = q[3], x = q[0], y = q[1], z = q[2];
  if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-8) return [0, 0, 0, 1];
  const a = Math.atan2(s, w) * t, k = Math.sin(a) / s;
  return [x * k, y * k, z * k, Math.cos(a)];
}
const ax = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [x * s, y * s, z * s, Math.cos(ang / 2)]; };
// three.js-এর Euler 'XYZ' ক্রম
export const qeuler = (x, y, z) => qmul(qmul(ax(1, 0, 0, x), ax(0, 1, 0, y)), ax(0, 0, 1, z));

// জোড়ের নাম → আসল হাড়ের নাম (mixamorig-এর পরের অংশ)
export const MAP = {
  Hips: 'hips', Spine: 'sp1', Spine1: 'sp2', Spine2: 'spine', Neck: 'neck', Head: 'head',
  LeftArm: 'shL', LeftForeArm: 'elL', RightArm: 'shR', RightForeArm: 'elR',
  LeftUpLeg: 'hpL', LeftLeg: 'knL', RightUpLeg: 'hpR', RightLeg: 'knR', LeftFoot: 'ftL', RightFoot: 'ftR',
};
const DOWN = { LeftArm: Math.PI / 2, LeftForeArm: Math.PI / 2, RightArm: -Math.PI / 2, RightForeArm: -Math.PI / 2 };

// সরল কঙ্কালের জোড়গুলোর ঘূর্ণন (মূলের সাপেক্ষে); e = { hips: [x,y,z], spine, head, shL, elL, shR, elR, hpL, knL, hpR, knR }
export function fk(e) {
  const E = (k) => qeuler(e[k][0], e[k][1], e[k][2]);
  const hips = E('hips'), spine = qmul(hips, E('spine')), head = qmul(spine, E('head'));
  const shL = qmul(spine, E('shL')), shR = qmul(spine, E('shR'));
  const hpL = qmul(hips, E('hpL')), hpR = qmul(hips, E('hpR'));
  const knL = qmul(hpL, E('knL')), knR = qmul(hpR, E('knR'));
  // মেরুদণ্ডের বাঁক তিন ভাগে ভাগ (কোমর থেকে বুক পর্যন্ত মসৃণ), ঘাড় মাথার অর্ধেক ঘোরে
  const rs = qmul(qinv(hips), spine), rh = qmul(qinv(spine), head);
  const sp1 = qmul(hips, qpow(rs, 0.34)), sp2 = qmul(hips, qpow(rs, 0.67)), neck = qmul(spine, qpow(rh, 0.45));
  const r = { hips, spine, head, sp1, sp2, neck, shL, shR, elL: qmul(shL, E('elL')), elR: qmul(shR, E('elR')), hpL, hpR, knL, knR };
  if (e.ftL) { r.ftL = qmul(knL, E('ftL')); r.ftR = qmul(knR, E('ftR')); }
  return r;
}

// হাড়ের তালিকা থেকে বিশ্রাম-অবস্থার হিসাব (মডেল লোড হলে একবার)
// names: হাড়ের নাম ('Hips', 'LeftArm', ...), parent: মা-হাড়ের সূচক (-1 = মূল), restLocal: [x,y,z,w], wrap: মডেলের বাইরের ঘূর্ণন
export function prepare(names, parent, restLocal, wrap) {
  const n = names.length, order = [], seen = new Set();
  const visit = (i) => { if (seen.has(i)) return; if (parent[i] >= 0) visit(parent[i]); seen.add(i); order.push(i); };
  for (let i = 0; i < n; i++) visit(i);
  const restWorld = new Array(n);
  for (const i of order) restWorld[i] = qmul(parent[i] >= 0 ? restWorld[parent[i]] : wrap, restLocal[i]);
  const joint = names.map((nm) => MAP[nm] || null);
  const qRest = names.map((nm, i) => (DOWN[nm] !== undefined ? qmul(ax(0, 0, 1, DOWN[nm]), restWorld[i]) : restWorld[i]));
  return { n, order, parent, restLocal, wrap, joint, qRest };
}

// আঙুল একটু ভাঁজ (মুঠি): আঙুলের হাড়ের নিজের X অক্ষে ঘোরানো (দুই হাতেই + = তালুর দিকে)
export const FINGER = /Hand(Index|Middle|Ring|Pinky)[123]$/, THUMB = /HandThumb[23]$/;
export const curlQ = (rest, ang) => qmul(rest, ax(1, 0, 0, ang));

// প্রতি ফ্রেমে: প্রতিটা হাড়ের নতুন স্থানীয় ঘূর্ণন (যে হাড়ের জোড় নেই সে বিশ্রামেই থাকে)
export function retarget(R, J, out) {
  const world = new Array(R.n);
  for (const i of R.order) {
    const pw = R.parent[i] >= 0 ? world[R.parent[i]] : R.wrap;
    const j = R.joint[i];
    if (j && J[j]) {
      const w = qmul(J[j], R.qRest[i]);
      world[i] = w;
      out[i] = qmul(qinv(pw), w);
    } else {
      out[i] = R.restLocal[i];
      world[i] = qmul(pw, R.restLocal[i]);
    }
  }
  return out;
}
