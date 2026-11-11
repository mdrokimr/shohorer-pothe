// আসল 3D মানুষের (Mixamo হাড়) ভঙ্গি: আমাদের কোড-চরিত্রের জোড়ের কোণ (setPose-এর c) থেকে প্রতিটা হাড়ের ঘূর্ণন।
// three.js ছাড়া শুধু অঙ্ক, যাতে টেস্টে আলাদা করে চালিয়ে দেখা যায়।
// মডেল ফাইলে মুখ +Z দিকে (Mixamo); আমাদের খেলায় সামনে -Z, তাই পুরো মডেল Y অক্ষে ১৮০° ঘোরানো ধরে হিসাব।

// ---------- কোয়াটার্নিয়ন [x, y, z, w] ----------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (a) => [-a[0], -a[1], -a[2], a[3]];
const qaxis = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [x * s, y * s, z * s, Math.cos(ang / 2)]; };
// three.js Euler 'XYZ' (ম্যাট্রিক্স = Rx·Ry·Rz)
const qeuler = (x, y, z) => qmul(qmul(qaxis(1, 0, 0, x), qaxis(0, 1, 0, y)), qaxis(0, 0, 1, z));
const qpow = (q, t) => { // পরিচয় থেকে q পর্যন্ত t ভাগ
  let [x, y, z, w] = q; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const ang = 2 * Math.acos(Math.min(1, w)), s = Math.sqrt(1 - Math.min(1, w * w));
  if (s < 1e-6) return [0, 0, 0, 1];
  return qaxis(x / s, y / s, z / s, ang * t);
};
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
// এক দিক থেকে আরেক দিকে সবচেয়ে ছোট ঘূর্ণন
function qarc(a, b) {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  a = a.map((v) => v / la); b = b.map((v) => v / lb);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.9999) return [0, 0, 1, 0];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q = [c[0], c[1], c[2], 1 + d], l = Math.hypot(...q);
  return q.map((v) => v / l);
}
// 4x4 (column-major, three.js-এর মতো) থেকে ঘূর্ণন আর অবস্থান
function matRot(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx, r01 = m[4] / sy, r11 = m[5] / sy, r21 = m[6] / sy, r02 = m[8] / sz, r12 = m[9] / sz, r22 = m[10] / sz;
  const tr = r00 + r11 + r22;
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s; }
  else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; w = (r21 - r12) / s; x = 0.25 * s; y = (r01 + r10) / s; z = (r02 + r20) / s; }
  else if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; w = (r02 - r20) / s; x = (r01 + r10) / s; y = 0.25 * s; z = (r12 + r21) / s; }
  else { const s = Math.sqrt(1 + r22 - r00 - r11) * 2; w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = 0.25 * s; }
  return [x, y, z, w];
}
const FLIP = qaxis(0, 1, 0, Math.PI); // মডেল ঘুরিয়ে সামনে -Z

// হাড়ের নাম থেকে কোন জোড়ের দলে: মাথা, হাত, পা...
function role(name) {
  const n = name.replace(/^mixamorig\d*:/, '');
  const side = n.startsWith('Left') ? 'L' : n.startsWith('Right') ? 'R' : '';
  const b = n.replace(/^(Left|Right)/, '');
  if (b === 'Hips') return { g: 'hips' };
  if (b === 'Spine') return { g: 'spine', f: 1 / 3 };
  if (b === 'Spine1') return { g: 'spine', f: 2 / 3 };
  if (b === 'Spine2') return { g: 'spine', f: 1 };
  if (b === 'Neck') return { g: 'neck' };
  if (b === 'Head' || b === 'HeadTop_End') return { g: 'head' };
  if (b === 'Shoulder') return { g: 'spine', f: 1, side };
  if (b === 'Arm') return { g: 'arm', side };
  if (b === 'ForeArm' || b.startsWith('Hand')) return { g: 'fore', side, finger: b.startsWith('Hand') && b !== 'Hand' ? b : null };
  if (b === 'UpLeg') return { g: 'thigh', side };
  if (b === 'Leg' || b === 'Foot' || b.startsWith('Toe')) return { g: 'shin', side };
  return { g: 'spine', f: 1 };
}

// বাঁধা অবস্থা থেকে প্রস্তুতি: names[], parent[] (-1 = মূল), worlds[] = প্রতিটা হাড়ের বিশ্ব ম্যাট্রিক্স (column-major 16), locals[] = স্থানীয় অবস্থান [x,y,z]
export function prepareBind(names, parent, worlds, localPos) {
  const n = names.length;
  const W = worlds.map((m) => qmul(FLIP, matRot(m)));
  const P = worlds.map((m) => qrot(FLIP, [m[12], m[13], m[14]]));
  const roles = names.map(role);
  const idx = (s) => names.findIndex((x) => x.replace(/^mixamorig\d*:/, '') === s);
  // হাত আর পা সোজা নিচে নামানোর সংশোধন (T-pose থেকে)
  const fix = {};
  for (const s of ['Left', 'Right']) {
    const a = idx(s + 'Arm'), f = idx(s + 'ForeArm'), u = idx(s + 'UpLeg'), l = idx(s + 'Leg');
    const k = s === 'Left' ? 'L' : 'R';
    if (a >= 0 && f >= 0) fix['arm' + k] = qarc([P[f][0] - P[a][0], P[f][1] - P[a][1], P[f][2] - P[a][2]], [0, -1, 0]);
    if (u >= 0 && l >= 0) fix['leg' + k] = qarc([P[l][0] - P[u][0], P[l][1] - P[u][1], P[l][2] - P[u][2]], [0, -1, 0]);
  }
  const Wf = W.map((q, i) => {
    const r = roles[i];
    if (r.g === 'arm' || r.g === 'fore') return qmul(fix['arm' + r.side] || [0, 0, 0, 1], q);
    if (r.g === 'thigh' || r.g === 'shin') return qmul(fix['leg' + r.side] || [0, 0, 0, 1], q);
    return q;
  });
  const hips = idx('Hips');
  return { n, names, parent, roles, Wf, localPos, hips, hipsY: P[hips][1] };
}

// c = setPose-এর হিসাব করা মান; ফেরত: প্রতিটা হাড়ের স্থানীয় কোয়াটার্নিয়ন (ফাইলের নিজের দিকে) আর কোমরের অবস্থান
export function computePose(B, c, unit = 100) {
  const Mh = qeuler(0, c.hipTw || 0, c.hipRoll || 0);
  const S = qeuler(-(c.lean || 0), c.twist || 0, c.spineZ ?? -(c.hipRoll || 0) * 0.6);
  const Ms = qmul(Mh, S);
  const Hd = qeuler(-(c.headX || 0), (c.headY || 0) - ((c.twist || 0) + (c.hipTw || 0)) * 0.7, 0);
  const M = {
    hips: Mh, spine: Ms, neck: qmul(Ms, qpow(Hd, 0.4)), head: qmul(Ms, Hd),
    armL: qmul(Ms, qeuler(c.sL, 0, c.szL)), armR: qmul(Ms, qeuler(c.sR, 0, c.szR)),
    thighL: qmul(Mh, qeuler(c.hL, 0, c.hzL)), thighR: qmul(Mh, qeuler(c.hR, 0, c.hzR)),
  };
  M.foreL = qmul(M.armL, qeuler(c.eL, 0, 0)); M.foreR = qmul(M.armR, qeuler(c.eR, 0, 0));
  M.shinL = qmul(M.thighL, qeuler(c.kL, 0, 0)); M.shinR = qmul(M.thighR, qeuler(c.kR, 0, 0));
  const world = new Array(B.n), local = new Array(B.n);
  for (let i = 0; i < B.n; i++) {
    const r = B.roles[i];
    let m;
    if (r.g === 'spine') m = r.f === 1 ? Ms : qmul(Mh, qpow(S, r.f));
    else if (r.g === 'arm' || r.g === 'fore' || r.g === 'thigh' || r.g === 'shin') m = M[r.g + r.side];
    else m = M[r.g];
    world[i] = qmul(m, B.Wf[i]);
  }
  for (let i = 0; i < B.n; i++) {
    const p = B.parent[i];
    local[i] = qmul(qinv(p >= 0 ? world[p] : FLIP), world[i]);
  }
  // কোমর ওঠানামা আর দোলা (মিটার থেকে ফাইলের একক)
  const d = qrot(qinv(FLIP), [(c.hipX || 0) * unit, ((c.hipY ?? 0.95) + (c.bob || 0) - 0.95) * unit, 0]);
  const lp = B.localPos[B.hips];
  return { local, hipsPos: [lp[0] + d[0], lp[1] + d[1], lp[2] + d[2]] };
}
