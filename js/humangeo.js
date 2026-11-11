// মানুষের শরীরের জ্যামিতি (three.js ছাড়া, শুধু সংখ্যা): মসৃণ গোলাকার হাত-পা, আসল অনুপাত, মুখ (চোখ, ভ্রু, নাক, ঠোঁট, কান),
// চুলের ছাঁট, দাড়ি-গোঁফ, আর দেশি পোশাক: শার্ট, টি-শার্ট, গেঞ্জি, পাঞ্জাবি, লুঙ্গি, সালোয়ার-কামিজ-ওড়না, শাড়ি, বোরকা, হিজাব, স্কুল ড্রেস।
// rig.js এটাকে three.js মেশে বদলায়; টেস্টে সরাসরি এঁকে দেখা যায়।
// দিক: সামনে -Z, উপরে +Y। প্রতিটা অংশ তার জোড়ের (জয়েন্ট) সাপেক্ষে।

const TAU = Math.PI * 2;
let SEED = 1;
const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
const pickR = (a) => a[Math.floor(rnd() * a.length)];
export function shadeHex(hex, k) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * k)), g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * k)), b = Math.min(255, Math.max(0, (hex & 255) * k));
  return (r << 16) | (g << 8) | (b | 0);
}
export function mixHex(a, b, t) {
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const A = ch(a), B = ch(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
}
const lumHex = (h) => (0.299 * ((h >> 16) & 255) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255)) / 255;

// ---------- জ্যামিতির থলে ----------
class Bag {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, na, nb, nc, ca, cb, cc) {
    this.p.push(...a, ...b, ...c); this.n.push(...na, ...nb, ...nc); this.c.push(ca, cb ?? ca, cc ?? ca);
  }
  // ঘোরানো আকৃতি: profile = [[r, y], ...] নিচ থেকে উপরে। o = { x, y, z, sx, sz, seg, a0, a1, color(a, y, i), skip(a, y), tilt }
  lathe(profile, o) {
    const seg = o.seg || 10, sx = o.sx ?? 1, sz = o.sz ?? 1, cx = o.x || 0, cy = o.y || 0, cz = o.z || 0;
    const a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, open = a1 - a0 < TAU - 1e-6;
    const cols = typeof o.color === 'function' ? o.color : () => o.color;
    const L = profile.length;
    // প্রোফাইলের প্রতি বিন্দুতে বাইরের দিক (মসৃণ)
    const pn = profile.map((pt, i) => {
      const pa = profile[Math.max(0, i - 1)], pb = profile[Math.min(L - 1, i + 1)];
      let dr = pb[0] - pa[0], dy = pb[1] - pa[1];
      const l = Math.hypot(dr, dy) || 1;
      return [dy / l, -dr / l];
    });
    const P = (i, a) => { const [r, y] = profile[i]; return [cx + Math.cos(a) * r * sx, cy + y, cz + Math.sin(a) * r * sz]; };
    const N = (i, a) => {
      const [nr, ny] = pn[i];
      let x = Math.cos(a) * nr / sx, z = Math.sin(a) * nr / sz, y = ny;
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    for (let i = 0; i < L - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const aa = a0 + (a1 - a0) * (j / seg), ab = a0 + (a1 - a0) * ((j + 1) / seg);
        const am = (aa + ab) / 2, ym = (profile[i][1] + profile[i + 1][1]) / 2;
        if (o.skip && o.skip(((am % TAU) + TAU) % TAU, ym)) continue;
        const col = cols(((am % TAU) + TAU) % TAU, ym, i);
        const p00 = P(i, aa), p01 = P(i, ab), p10 = P(i + 1, aa), p11 = P(i + 1, ab);
        const n00 = N(i, aa), n01 = N(i, ab), n10 = N(i + 1, aa), n11 = N(i + 1, ab);
        // বাইরে থেকে দেখলে ঘড়ির কাঁটার উল্টো দিকে (three.js-এর সামনের দিক)
        if (profile[i + 1][0] > 1e-6) this.tri(p00, p10, p11, n00, n10, n11, col);
        if (profile[i][0] > 1e-6) this.tri(p00, p11, p01, n00, n11, n01, col);
      }
    }
    void open;
  }
  // উপবৃত্তাকার গোলক
  ell(x, y, z, rx, ry, rz, color, o = {}) {
    const rings = o.rings || 7, prof = [];
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? Math.PI; // নিচ (0) থেকে উপর (π)
    for (let i = 0; i <= rings; i++) { const t = t0 + (t1 - t0) * (i / rings); prof.push([Math.sin(t) * rx, -Math.cos(t) * ry]); }
    this.lathe(prof, { x, y, z, sx: 1, sz: rz / rx, seg: o.seg || 10, color, skip: o.skip, a0: o.a0, a1: o.a1 });
  }
  // খাড়া ক্যাপসুল (জোড় থেকে নিচে): y0 উপরে, y1 নিচে; r0 উপরের, r1 নিচের ব্যাসার্ধ
  cap(x, y0, y1, r0, r1, color, o = {}) {
    const prof = [], k = 2;
    for (let i = 0; i <= k; i++) { const t = (i / k) * (Math.PI / 2); prof.push([Math.sin(t) * r1, y1 - Math.cos(t) * r1 * 0.9]); }
    for (let i = k; i >= 0; i--) { const t = (i / k) * (Math.PI / 2); prof.push([Math.sin(t) * r0, y0 + Math.cos(t) * r0 * 0.9]); }
    this.lathe(prof, { x, z: o.z || 0, sx: 1, sz: o.sz ?? 1, seg: o.seg || 8, color, skip: o.skip });
  }
  // বাক্স (ছোট জিনিস: ভ্রু, বোতাম, ফ্রেম)
  box(x, y, z, w, h, d, color, rz = 0) {
    const hx = w / 2, hy = h / 2, hz = d / 2, c = Math.cos(rz), s = Math.sin(rz);
    const T = (px, py, pz) => [x + px * c - py * s, y + px * s + py * c, z + pz];
    const R = (nx, ny, nz) => [nx * c - ny * s, nx * s + ny * c, nz];
    const F = [[[1, 0, 0], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, 0, 0], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
      [[0, 1, 0], [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[0, -1, 0], [-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
      [[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    for (const [nm, ...q] of F) {
      const v = q.map(([a, b, cc]) => T(a * hx, b * hy, cc * hz)), n = R(...nm);
      this.tri(v[0], v[1], v[2], n, n, n, color); this.tri(v[0], v[2], v[3], n, n, n, color);
    }
  }
  // সমতল ফিতা (ওড়না, শাড়ির আঁচল): পথের বিন্দু [x,y,z], চওড়া দিক w (একক ভেক্টর), দুই পিঠ
  strip(path, wv, width, color) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const h = width / 2;
      const A0 = [a[0] - wv[0] * h, a[1] - wv[1] * h, a[2] - wv[2] * h], A1 = [a[0] + wv[0] * h, a[1] + wv[1] * h, a[2] + wv[2] * h];
      const B0 = [b[0] - wv[0] * h, b[1] - wv[1] * h, b[2] - wv[2] * h], B1 = [b[0] + wv[0] * h, b[1] + wv[1] * h, b[2] + wv[2] * h];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      let n = [d[1] * wv[2] - d[2] * wv[1], d[2] * wv[0] - d[0] * wv[2], d[0] * wv[1] - d[1] * wv[0]];
      const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
      const m = n.map((v) => -v);
      this.tri(A0, A1, B1, n, n, n, color); this.tri(A0, B1, B0, n, n, n, color);
      this.tri(A0, B1, A1, m, m, m, color); this.tri(A0, B0, B1, m, m, m, color);
    }
  }
}

// ---------- রং ----------
export const SKINS = [0x8d5a3b, 0x7a4b30, 0x9c6a48, 0x6b4128, 0xa87452, 0xb98260, 0x5e3a22];
const SHIRTS = [0xe9e4d8, 0x2f6fb5, 0xb53b3b, 0x3c8a4a, 0xd9a43a, 0x6b4fa0, 0x2a2a2a, 0xd0d6e0, 0x3a8f9a, 0xf48fb1, 0x8d6e63, 0xffffff, 0x90caf9, 0xc5e1a5];
const PANTS = [0x1f2a44, 0x3b3b3b, 0x5a4a3a, 0x23324f, 0x2d3a2d, 0x2b4a7a, 0x8d7b4a];
const LUNGI = [[0x1d4f8c, 0x2e7d32], [0x6a1b9a, 0x1d4f8c], [0x2e7d32, 0x1b1b1b], [0xc62828, 0x1d4f8c], [0x37474f, 0x8d6e63], [0x1565c0, 0xffffff]];
const KAMEEZ = [0xc2185b, 0x00897b, 0x5e35b1, 0xef6c00, 0x1e88e5, 0xad1457, 0x43a047, 0xfdd835, 0x8e24aa, 0xd84315];
const SAREE = [[0xc62828, 0xffd54f], [0x00695c, 0xffd54f], [0x6a1b9a, 0xf8bbd0], [0x1565c0, 0xffffff], [0xef6c00, 0x2e7d32], [0xad1457, 0xffd54f]];
const HIJAB = [0x212121, 0x5d4037, 0x1a237e, 0x880e4f, 0x37474f, 0xf5f5f5, 0x00695c, 0x6d4c41];
const HAIR = [0x14100c, 0x1b1410, 0x0d0b09, 0x231a12];

// সাজ ঠিক করা: যা বলা হয়নি তা ঢাকার রাস্তার মতো এলোমেলো
export function resolveLook(o = {}) {
  SEED = Math.floor((o.seed ?? Math.random()) * 2147483646) + 1;
  const L = { ...o };
  L.female = !!o.female;
  L.skin = o.skin ?? pickR(SKINS);
  L.age = o.age ?? (rnd() < 0.15 ? 'old' : rnd() < 0.35 ? 'young' : 'adult');
  L.hair = o.hair ?? (L.age === 'old' ? pickR([0x9e9e9e, 0xbdbdbd, 0x757575, 0x7a3a12]) : pickR(HAIR));
  L.build = o.build ?? (rnd() < 0.2 ? 'heavy' : rnd() < 0.3 ? 'slim' : 'avg');
  L.height = o.height ?? (L.female ? 0.9 + rnd() * 0.06 : 0.93 + rnd() * 0.08);
  if (L.female) {
    // সালোয়ার-কামিজ, শাড়ি, বোরকা, হিজাব
    L.style = o.style ?? (o.burqa ? 'burqa' : o.school ? 'schoolG' : (() => { const r = rnd(); return r < 0.5 ? 'kameez' : r < 0.72 ? 'saree' : r < 0.88 ? 'hijab' : 'burqa'; })());
    const base = o.skirt ?? o.shirt ?? (L.style === 'schoolG' ? 0x1e63b5 : pickR(KAMEEZ));
    L.top = base;
    L.lower = o.pants ?? (L.style === 'saree' ? base : rnd() < 0.5 ? base : pickR([0xf5f5f5, 0x1b1b1b, shadeHex(base, 0.7)]));
    L.orna = o.orna ?? mixHex(base, pickR([0xffffff, 0xffd54f, 0xf8bbd0]), 0.5);
    L.border = pickR(SAREE)[1];
    L.hijab = o.hijab ?? pickR(HIJAB);
    if (L.style === 'burqa') { L.top = o.shirt ?? pickR([0x111111, 0x161616, 0x1c1c2a, 0x2b1d18]); L.lower = L.top; }
    L.hairStyle = o.hairStyle ?? pickR(['long', 'long', 'bun', 'braid']);
  } else {
    const given = o.shirt !== undefined || o.pants !== undefined;
    L.style = o.style ?? (o.school ? 'schoolB' : o.kurta ? 'panjabi' : o.sleeveless ? 'genji' : given && o.pants !== undefined ? (rnd() < 0.3 ? 'tshirt' : 'shirt')
      : given ? pickR(['shirt', 'shirt', 'tshirt', 'lungi']) : (() => { const r = rnd(); return r < 0.4 ? 'shirt' : r < 0.58 ? 'tshirt' : r < 0.72 ? 'panjabi' : r < 0.9 ? 'lungi' : 'genji'; })());
    L.top = o.shirt ?? (L.style === 'genji' ? pickR([0xf2efe6, 0xe8e2d0, 0xffffff, 0xd8d2c4]) : L.style === 'schoolB' ? 0xffffff : pickR(SHIRTS));
    L.lower = o.pants ?? (L.style === 'schoolB' ? 0x1d2a4a : L.style === 'panjabi' && rnd() < 0.5 ? 0xf5f5f0 : pickR(PANTS));
    L.lungi = pickR(LUNGI);
    L.sleeve = o.sleeve ?? (L.style === 'tshirt' ? 'short' : L.style === 'genji' ? 'none' : L.style === 'shirt' ? pickR(['long', 'long', 'rolled', 'short']) : 'long');
    L.hairStyle = o.hairStyle ?? (L.age === 'old' && rnd() < 0.5 ? 'bald' : pickR(['short', 'short', 'side', 'crew', 'puff']));
    L.beard = o.beard ?? (L.age === 'old' ? rnd() < 0.6 : L.style === 'panjabi' ? rnd() < 0.55 : rnd() < 0.22);
    L.mustache = o.mustache ?? (!L.beard && rnd() < 0.3);
    L.belt = L.style === 'shirt' && rnd() < 0.6;
  }
  if (o.cap) L.capStyle = o.tupi || (lumHex(o.cap) > 0.9 && !o.helmet) ? 'tupi' : 'cap';
  L.shoe = o.shoe ?? (L.style === 'lungi' || L.style === 'genji' || L.style === 'saree' || L.style === 'panjabi' && rnd() < 0.6 ? 'sandal' : pickR(['shoe', 'shoe', 'sandal']));
  L.shoeCol = pickR([0x2a221c, 0x1b1b1b, 0x5d4037, 0x3e2723]);
  L.gait = o.gait ?? randomGait();
  return L;
}

// প্রত্যেকের হাঁটার নিজস্ব ধরন: হাত কতটা দোলে, পা কত লম্বা, কতটা ঝোঁকে, কোমর কতটা দোলে, কত দ্রুত
export function randomGait() {
  const r = () => Math.random();
  return { arm: 0.75 + r() * 0.6, stride: 0.9 + r() * 0.2, lean: -0.02 + r() * 0.07, bounce: 0.7 + r() * 0.6, swag: 0.6 + r() * 0.8, rate: 0.92 + r() * 0.16, head: r() * 6 };
}

// ---------- পুরো শরীর ----------
// ফেরত: { parts: { body, head, pelvis, uaL, uaR, faL, faR, thL, thR, shL, shR }, joints, look }
export function buildHuman(o = {}) {
  const L = resolveLook(o);
  const F = L.female, sk = L.skin, top = L.top, low = L.lower;
  const heavy = L.build === 'heavy', slim = L.build === 'slim';
  const W = heavy ? 1.13 : slim ? 0.92 : 1, D = heavy ? 1.18 : slim ? 0.92 : 1; // চওড়া, গভীরতা
  const lungi = L.style === 'lungi' || L.style === 'genji'; // গেঞ্জির সাথে লুঙ্গি
  const longRobe = L.style === 'burqa' || L.style === 'saree' || lungi;
  const parts = {};
  const mk = (k) => (parts[k] = new Bag());
  const lip = mixHex(shadeHex(sk, 0.72), 0x8a3030, 0.35);
  const skD = shadeHex(sk, 0.88);

  // ---------- কোমর (হিপস জোড়ের সাপেক্ষে) ----------
  const pel = mk('pelvis');
  const pelCol = lungi ? L.lungi[0] : ['shirt', 'tshirt', 'schoolB'].includes(L.style) ? low : top;
  pel.lathe([[0.0, -0.13], [0.1 * W, -0.12], [(F ? 0.168 : 0.148) * W, -0.07], [(F ? 0.17 : 0.152) * W, 0.0], [(F ? 0.148 : 0.146) * W, 0.07]], { sz: 0.68 * D, seg: 12, color: pelCol });
  if (L.belt) pel.lathe([[0.15 * W, 0.035], [0.15 * W, 0.072]], { sz: 0.7 * D, seg: 12, color: 0x3e2723 });
  // লম্বা পোশাকের নিচের অংশ (হাঁটুর নিচ পর্যন্ত বা পা পর্যন্ত)
  const robe = (y1, r0, r1, rb, color, sz = 0.74) => pel.lathe([[rb * W, y1], [r1 * W, y1 + 0.04], [r1 * W, (y1 + 0.02) * 0.6], [r0 * W * 1.1, -0.12], [r0 * W, 0.06]], { sz: sz * D, seg: 12, color });
  if (lungi) {
    // চেক লুঙ্গি, সামনে গিঁট
    const [c1, c2] = L.lungi;
    robe(-0.86, 0.165, 0.215, 0.205, (a, y) => ((Math.floor(a / (TAU / 16)) + Math.floor((y + 1) / 0.07)) % 2 ? c1 : mixHex(c1, c2, 0.55)), 0.92);
    pel.ell(0, 0.05, -0.12 * D, 0.045, 0.03, 0.025, shadeHex(c1, 0.8));
  } else if (L.style === 'saree') {
    robe(-0.87, 0.16, 0.215, 0.215, (a, y) => (y < -0.79 ? L.border : (a > 4.2 && a < 5.3 && Math.floor(a * 18) % 2 ? shadeHex(top, 0.86) : top)), 0.9);
  } else if (L.style === 'burqa') {
    robe(-0.9, 0.18, 0.25, 0.255, top, 0.92);
  } else if (L.style === 'panjabi') {
    robe(-0.5, 0.16, 0.21, 0.215, top, 0.72);
  } else if (L.style === 'kameez' || L.style === 'hijab' || L.style === 'schoolG') {
    const dot = L.style === 'schoolG' ? top : mixHex(top, 0xffffff, 0.45);
    robe(-0.48, 0.16, 0.215, 0.22, (a, y) => (L.style !== 'schoolG' && y < -0.38 ? dot : top), 0.72); // নিচে পাড়
    if (L.style === 'schoolG') pel.lathe([[0.165 * W, 0.02], [0.165 * W, 0.07]], { sz: 0.72 * D, seg: 12, color: 0xf5f5f5 }); // সাদা বেল্ট
  }

  // ---------- বুক-পেট (স্পাইন জোড়ের সাপেক্ষে) ----------
  const body = mk('body');
  const tw = F ? 0.92 : 1;
  const torsoCol = (a, y) => {
    if (L.style === 'saree' && y < 0.2 && (a < 1.2 || a > 5.6)) return sk; // শাড়িতে কোমরের পাশ খোলা
    if (L.style === 'genji' && y > 0.52 && (a > 3.6 && a < 5.8)) return sk; // গেঞ্জির গলা
    return L.style === 'saree' ? L.blouse ?? shadeHex(top, 0.8) : top;
  };
  const belly = heavy ? 0.025 : 0;
  body.lathe([[0.145 * W * tw, 0.0], [(0.148 + belly) * W * tw, 0.12], [0.16 * W * tw, 0.26], [(F ? 0.165 : 0.178) * W, 0.38], [(F ? 0.17 : 0.188) * W, 0.47], [0.185 * W, 0.53], [0.15 * W, 0.58], [0.1, 0.615], [0.062, 0.64], [0.05, 0.645]], { sz: 0.6 * D, seg: 12, color: torsoCol });
  if (F) for (const s of [-1, 1]) body.ell(s * 0.056 * W, 0.4, -0.07 * D, 0.058, 0.055, 0.045, torsoCol(4.7, 0.4));
  // কাঁধ
  const slvTop = L.sleeve === 'none' ? sk : (L.style === 'saree' ? shadeHex(top, 0.8) : top);
  for (const s of [-1, 1]) body.ell(s * 0.178 * W, 0.512, 0, 0.06 * W, 0.055, 0.062 * D, slvTop, { seg: 8, rings: 5 });
  // গলা
  body.lathe([[0.052, 0.6], [0.048, 0.66], [0.045, 0.69]], { seg: 10, color: sk, sz: 1.05 });
  // কলার, বোতাম, পকেট
  if (L.style === 'shirt' || L.style === 'schoolB') {
    const cc = L.style === 'schoolB' ? 0xffffff : shadeHex(top, 0.85);
    body.lathe([[0.062, 0.575], [0.068, 0.6], [0.058, 0.63]], { seg: 12, color: cc, a0: Math.PI * 1.62, a1: Math.PI * 3.38, sz: 1.05 });
    for (let i = 0; i < 4; i++) body.box(0, 0.12 + i * 0.12, -0.102 * D - 0.002 - (i > 1 ? 0.006 : 0), 0.012, 0.012, 0.006, shadeHex(top, 0.7));
    body.box(-0.08 * W, 0.42, -0.108 * D, 0.07, 0.06, 0.006, shadeHex(top, 0.9));
  } else if (L.style === 'panjabi') {
    body.box(0, 0.45, -0.11 * D, 0.03, 0.2, 0.006, shadeHex(top, 0.85)); // বোতামের পটি
    for (let i = 0; i < 3; i++) body.box(0, 0.38 + i * 0.06, -0.115 * D, 0.012, 0.012, 0.006, 0xd4af37);
    body.lathe([[0.058, 0.585], [0.056, 0.62]], { seg: 12, color: shadeHex(top, 0.88), sz: 1.05 });
  } else if (L.style === 'tshirt') {
    body.lathe([[0.064, 0.6], [0.06, 0.612]], { seg: 12, color: shadeHex(top, 0.8), sz: 1.05 });
  }
  if (L.style === 'schoolB') body.box(-0.08 * W, 0.42, -0.11 * D, 0.05, 0.05, 0.006, 0x1d4f8c); // ব্যাজ
  // ওড়না: দুই কাঁধের ওপর দিয়ে সামনে U, দুই মাথা পিছনে ঝোলে
  if (L.style === 'kameez' || L.style === 'schoolG') {
    const oc = L.style === 'schoolG' ? 0xffffff : L.orna;
    body.lathe([[0.215 * W, 0.34], [0.215 * W, 0.44], [0.2 * W, 0.53], [0.155 * W, 0.59]], { sz: 0.7 * D, seg: 14, color: oc, skip: (a) => a > 0.35 && a < 2.8 });
    for (const s of [-1, 1]) body.strip([[s * 0.12, 0.58, 0.1 * D], [s * 0.13, 0.3, 0.125 * D], [s * 0.12, 0.0, 0.13 * D], [s * 0.1, -0.22, 0.135 * D]], [1, 0, 0], 0.085, oc);
  }
  // শাড়ির আঁচল: ডান কোমর থেকে আড়াআড়ি বাম কাঁধে, পিছনে ঝুলে
  if (L.style === 'saree') {
    const d = 0.118 * D;
    const path = [[0.15, 0.02, -d * 0.86], [0.08, 0.2, -d * 1.02], [-0.0, 0.34, -d * 1.08], [-0.08, 0.46, -d * 1.02], [-0.15, 0.56, -d * 0.6], [-0.16, 0.6, 0.0], [-0.15, 0.55, d * 0.9], [-0.15, 0.2, d * 1.15], [-0.15, -0.15, d * 1.25]];
    const col = (i) => i;
    void col;
    body.strip(path, [0.72, 0.69, 0], 0.17, top);
    body.strip(path.map(([x, y, z]) => [x - 0.07, y - 0.065, z - (z < 0 ? 0.002 : -0.002)]), [0.72, 0.69, 0], 0.03, L.border);
  }
  if (L.style === 'hijab' || L.style === 'burqa') {
    // হিজাবের কাপড় কাঁধে ছড়ানো
    body.lathe([[0.2 * W, 0.44], [0.19 * W, 0.52], [0.13, 0.6], [0.075, 0.68]], { sz: 0.75 * D, seg: 14, color: L.style === 'burqa' ? top : L.hijab });
  }
  if (L.bag || o.bag) body.ell(0, 0.33, 0.15 * D, 0.15, 0.19, 0.08, o.bag ?? 0x37474f);

  // ---------- মাথা (মাথার জোড়: থুতনির নিচে) ----------
  const head = mk('head');
  const hp = [[0, 0], [0.04, 0.004], [0.07, 0.03], [0.085, 0.07], [0.093, 0.11], [0.097, 0.15], [0.094, 0.19], [0.078, 0.222], [0.048, 0.24], [0, 0.246]];
  const HS = 0.96, HD = 1.1;
  head.lathe(hp, { seg: 12, sx: HS, sz: HD, color: sk });
  const fz = (y) => { // মুখের সামনের তল
    for (let i = 0; i < hp.length - 1; i++) if (y >= hp[i][1] && y <= hp[i + 1][1]) { const t = (y - hp[i][1]) / (hp[i + 1][1] - hp[i][1] || 1); return -(hp[i][0] + (hp[i + 1][0] - hp[i][0]) * t) * HD; }
    return -0.09;
  };
  // কান
  for (const s of [-1, 1]) head.ell(s * 0.093, 0.12, 0.005, 0.013, 0.03, 0.02, skD, { seg: 5, rings: 3 });
  // চোখ: সাদা, মণি, পাতা
  const ey = 0.135, ez = fz(ey);
  for (const s of [-1, 1]) {
    head.ell(s * 0.035, ey, ez + 0.006, 0.0145, 0.0078, 0.007, 0xe6e0d4, { seg: 6, rings: 3 });
    head.ell(s * 0.035, ey - 0.0005, ez - 0.0008, 0.0072, 0.0072, 0.004, 0x24160c, { seg: 5, rings: 2 });
    head.box(s * 0.035, ey + 0.0105, ez + 0.003, 0.036, 0.004, 0.006, shadeHex(sk, 0.7));
    // ভ্রু
    head.box(s * 0.036, 0.158, fz(0.158) - 0.002, 0.038, F ? 0.0055 : 0.008, 0.008, shadeHex(L.hair, 1), s * (F ? -0.12 : -0.08));
  }
  // নাক
  head.ell(0, 0.1, fz(0.1) - 0.006, 0.013, 0.026, 0.016, skD, { seg: 6, rings: 3, t0: 0.4 });
  head.ell(0, 0.083, fz(0.083) - 0.012, 0.016, 0.009, 0.01, skD, { seg: 6, rings: 3 });
  // ঠোঁট
  const beard = !F && L.beard, ly = 0.058;
  head.ell(0, ly + 0.004, fz(ly) + (beard ? -0.012 : 0.001), 0.022, 0.0055, 0.006, lip, { seg: 6, rings: 2 });
  head.ell(0, ly - 0.006, fz(ly) + (beard ? -0.012 : 0.0015), 0.019, 0.0065, 0.006, shadeHex(lip, 1.08), { seg: 6, rings: 2 });
  if (F) for (const s of [-1, 1]) head.ell(s * 0.035, ey, ez - 0.001, 0.019, 0.003, 0.004, 0x111111, { seg: 5, rings: 2 }); // কাজল
  if (F && rnd() < 0.5) head.ell(0, 0.158, fz(0.158) - 0.002, 0.004, 0.004, 0.003, 0xc62828, { seg: 6, rings: 3 }); // টিপ
  const front = (a) => { const d = Math.abs(a - Math.PI * 1.5) % TAU; return Math.min(d, TAU - d); }; // সামনে থেকে কত কোণ
  // দাড়ি-গোঁফ
  const hc = L.hair;
  if (beard) {
    head.lathe([[0.0, -0.014], [0.05, -0.008], [0.08, 0.022], [0.09, 0.055], [0.093, 0.09]], { seg: 14, sx: HS * 1.04, sz: HD * 1.05, color: hc, a0: Math.PI * 0.95, a1: Math.PI * 2.05, skip: (a, y) => (front(a) < 0.42 && y > 0.04) || (front(a) > 1.2 && y > 0.07) });
    head.box(0, 0.072, fz(0.072) - 0.008, 0.05, 0.012, 0.012, hc);
  } else if (L.mustache) head.box(0, 0.071, fz(0.071) - 0.006, 0.046, 0.01, 0.01, hc);
  // চুল
  const hairCap = (skip, k = 1.07, col = hc) => head.lathe(hp.slice(3).map(([r, y]) => [r * k, y + (k - 1) * 0.04]), { seg: 12, sx: HS, sz: HD, color: col, skip });
  const hijab = L.style === 'hijab' || L.style === 'burqa';
  if (o.helmet) {
    head.lathe(hp.slice(2).map(([r, y]) => [r * 1.32, y * 1.06 + 0.012]), { seg: 16, sx: HS, sz: HD, color: o.helmet, skip: (a, y) => front(a) < 0.95 && y < 0.15 });
    head.box(0, 0.165, fz(0.15) - 0.03, 0.17, 0.05, 0.01, 0x101418); // কালো কাচ
  } else if (hijab) {
    const hj = L.style === 'burqa' ? top : L.hijab;
    head.lathe(hp.map(([r, y]) => [r * 1.12 + 0.004, y * 1.04 - 0.01]), { seg: 16, sx: HS, sz: HD, color: hj, skip: (a, y) => front(a) < 0.8 && y > 0.025 && y < (L.style === 'burqa' && o.niqab ? 0.0 : 0.172) });
    if (L.style === 'burqa' && o.niqab) head.lathe([[0.09, 0.02], [0.1, 0.06], [0.1, 0.12]], { seg: 10, sx: HS * 1.12, sz: HD * 1.12, color: hj, a0: Math.PI * 1.15, a1: Math.PI * 1.85 });
  } else if (F) {
    hairCap((a, y) => (front(a) < 0.95 && y < 0.205) || y < 0.06 || (front(a) < 1.45 && y < 0.12));
    for (const s of [-1, 1]) head.ell(s * 0.03, 0.212, fz(0.212) + 0.01, 0.045, 0.016, 0.02, hc, { seg: 8, rings: 4 }); // সিঁথির দুই পাশ
    if (L.hairStyle === 'bun') head.ell(0, 0.17, 0.11, 0.05, 0.045, 0.045, hc);
    else if (L.hairStyle === 'braid') { for (let i = 0; i < 6; i++) head.ell(0, 0.1 - i * 0.065, 0.1 + (i ? 0.01 : 0), 0.028 - i * 0.002, 0.04, 0.026, hc, { seg: 7, rings: 4 }); }
    else head.lathe([[0.075, -0.24], [0.1, -0.16], [0.108, -0.02], [0.105, 0.1], [0.1, 0.18]], { seg: 12, sx: HS * 1.04, sz: HD * 1.0, color: hc, a0: 0.05, a1: Math.PI - 0.05 });
  } else {
    const st = L.hairStyle;
    if (st === 'bald') hairCap((a, y) => y < 0.06 || y > 0.15 || front(a) < 1.6, 1.035);
    else if (st === 'crew') hairCap((a, y) => (front(a) < 1.0 && y < 0.19) || y < 0.075 || (front(a) < 1.6 && y < 0.115), 1.04);
    else if (st === 'puff') hairCap((a, y) => (front(a) < 1.0 && y < 0.2) || y < 0.08 || (front(a) < 1.6 && y < 0.12), 1.12);
    else if (st === 'side') {
      hairCap((a, y) => (front(a) < 1.0 && y < 0.188) || y < 0.075 || (front(a) < 1.6 && y < 0.12), 1.08);
      head.ell(0.03, 0.205, fz(0.2) + 0.012, 0.06, 0.02, 0.03, hc, { seg: 8, rings: 4 }); // সিঁথির ঢেউ
    } else hairCap((a, y) => (front(a) < 1.0 && y < 0.19) || y < 0.075 || (front(a) < 1.6 && y < 0.12), 1.065);
  }
  if (o.cap && !o.helmet && !hijab) {
    if (L.capStyle === 'tupi') head.lathe([[0.1, 0.175], [0.1, 0.205], [0.085, 0.235], [0.05, 0.25], [0, 0.254]], { seg: 14, sx: HS * 1.03, sz: HD * 1.03, color: o.cap });
    else {
      head.lathe(hp.slice(5).map(([r, y]) => [r * 1.1, y + 0.008]), { seg: 14, sx: HS, sz: HD, color: o.cap });
      head.box(0, 0.178, fz(0.17) - 0.045, 0.15, 0.012, 0.09, shadeHex(o.cap, 0.85)); // ঠোঁট (ক্যাপের সামনের অংশ)
    }
  }
  if (o.glasses) {
    for (const s of [-1, 1]) head.box(s * 0.036, ey, ez - 0.01, 0.034, 0.026, 0.004, 0x0b0b0b);
    head.box(0, ey + 0.008, ez - 0.01, 0.02, 0.005, 0.004, 0x0b0b0b);
    for (const s of [-1, 1]) head.box(s * 0.09, ey + 0.006, ez + 0.045, 0.004, 0.005, 0.1, 0x0b0b0b);
  }

  // ---------- হাত ----------
  const sleeveCol = L.style === 'saree' ? shadeHex(top, 0.8) : top;
  const arm = (s) => {
    const ua = mk(s < 0 ? 'uaL' : 'uaR'), fa = mk(s < 0 ? 'faL' : 'faR');
    const sl = F ? (L.style === 'saree' ? 'short' : L.style === 'burqa' ? 'long' : 'mid') : L.sleeve;
    const r0 = 0.05 * W, r1 = 0.04 * W;
    if (sl === 'none') ua.cap(0, 0, -0.29, r0 * 0.95, r1, sk);
    else if (sl === 'short') { ua.cap(0, 0, -0.29, r0 * 0.95, r1, sk); ua.lathe([[r0 * 1.06, -0.15], [r0 * 1.1, -0.05], [r0 * 1.04, 0.03], [r0 * 0.55, 0.07]], { seg: 9, color: sleeveCol }); }
    else ua.cap(0, 0, -0.29, r0 * 1.05, r1 * 1.12, sleeveCol);
    const fr0 = 0.038 * W, fr1 = 0.03 * W;
    if (sl === 'long') { fa.cap(0, 0, -0.245, fr0 * 1.12, fr1 * 1.15, sleeveCol); fa.lathe([[fr1 * 1.2, -0.25], [fr1 * 1.2, -0.21]], { seg: 9, color: shadeHex(sleeveCol, 0.9) }); }
    else if (sl === 'mid' || sl === 'rolled') { fa.cap(0, 0, -0.245, fr0, fr1, sk); fa.lathe([[fr0 * 1.25, -0.1], [fr0 * 1.3, -0.02], [fr0 * 1.2, 0.02]], { seg: 9, color: sleeveCol }); }
    else fa.cap(0, 0, -0.245, fr0, fr1, sk);
    // হাতের তালু, আঙুল, বুড়ো আঙুল
    fa.ell(0, -0.3, 0.0, 0.022, 0.05, 0.04, sk, { seg: 7, rings: 4 });
    fa.ell(0, -0.352, -0.004, 0.019, 0.034, 0.037, skD, { seg: 7, rings: 4 }); // আঙুল (একসাথে)
    fa.ell(-s * 0.012, -0.29, -0.034, 0.012, 0.026, 0.012, sk, { seg: 5, rings: 3 });
  };
  arm(-1); arm(1);

  // ---------- পা ----------
  const legCol = longRobe ? sk : low;
  const baggy = L.style === 'kameez' || L.style === 'hijab' || L.style === 'panjabi' && low === 0xf5f5f0;
  const leg = (s) => {
    const th = mk(s < 0 ? 'thL' : 'thR'), sh = mk(s < 0 ? 'shL' : 'shR');
    const r = (F ? 0.074 : 0.072) * W * (baggy ? 1.15 : 1);
    th.cap(0, 0.02, -0.45, r, 0.056 * W * (baggy ? 1.2 : 1), legCol, { sz: 1.05 });
    sh.cap(0, 0, -0.43, 0.053 * W * (baggy ? 1.15 : 1), 0.036 * (baggy ? 1.35 : 1), legCol, { sz: 1.1 });
    if (baggy) sh.lathe([[0.04, -0.44], [0.046, -0.4]], { seg: 9, color: shadeHex(legCol, 0.85) });
    if (!longRobe && !baggy) sh.lathe([[0.04, -0.43], [0.038, -0.4]], { seg: 8, color: L.shoe === 'sandal' ? sk : low });
    // পায়ের পাতা
    if (L.shoe === 'sandal') {
      sh.ell(0, -0.455, -0.045, 0.036, 0.022, 0.105, sk, { seg: 8, rings: 4 });
      sh.box(0, -0.475, -0.045, 0.08, 0.014, 0.24, L.shoeCol);
      sh.box(0, -0.452, -0.08, 0.075, 0.012, 0.03, L.shoeCol);
    } else {
      sh.ell(0, -0.455, -0.05, 0.045, 0.036, 0.125, L.shoeCol, { seg: 9, rings: 5 });
      sh.box(0, -0.483, -0.05, 0.086, 0.012, 0.25, 0x111111);
    }
  };
  leg(-1); leg(1);
  return {
    parts, look: L,
    joints: { neck: 0.655, shX: 0.205 * W, shY: 0.52, elbow: -0.29, hipX: 0.095 * W, knee: -0.45 },
  };
}

// চক্রের মাঝে মসৃণ মান (Catmull-Rom), keys = [[u, মান], ...] ০..১ বৃত্তাকার
function curve(keys, u) {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && keys[i + 1][0] <= u) i++;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  const u1 = k1[0], u2 = i + 1 < n ? k2[0] : k2[0] + 1;
  const t = (u - u1) / ((u2 - u1) || 1);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * k1[1]) + (-k0[1] + k2[1]) * t + (2 * k0[1] - 5 * k1[1] + 4 * k2[1] - k3[1]) * t2 + (-k0[1] + 3 * k1[1] - 3 * k2[1] + k3[1]) * t3);
}
// হাঁটা আর দৌড়ের মাপ (রেডিয়ান; নিতম্ব + = পা সামনে, হাঁটু + = ভাঁজ, গোড়ালি + = আঙুল উপরে)
const GAIT_WALK = {
  hip: [[0, 0.36], [0.15, 0.3], [0.35, 0.05], [0.55, -0.2], [0.65, -0.12], [0.8, 0.28], [0.9, 0.4]],
  knee: [[0, 0.06], [0.12, 0.3], [0.3, 0.12], [0.45, 0.1], [0.6, 0.55], [0.72, 1.05], [0.85, 0.5], [0.95, 0.05]],
  ankle: [[0, 0.05], [0.07, -0.12], [0.3, 0.06], [0.48, 0.16], [0.62, -0.38], [0.75, 0.0], [0.9, 0.12]],
};
const GAIT_RUN = {
  hip: [[0, 0.5], [0.2, 0.15], [0.38, -0.32], [0.5, -0.2], [0.7, 0.55], [0.85, 0.75]],
  knee: [[0, 0.35], [0.15, 0.7], [0.35, 0.4], [0.5, 0.9], [0.65, 1.9], [0.82, 1.2], [0.95, 0.4]],
  ankle: [[0, 0.1], [0.15, 0.2], [0.35, -0.45], [0.55, -0.1], [0.8, 0.2]],
};

// ---------- ভঙ্গি (জোড়ের কোণ) ----------
export function poseTargets(pose, p, speed, look = {}) {
  const s = Math.sin(p), c = Math.cos(p);
  const F = !!look.female, old = look.age === 'old';
  const t = {
    sL: 0.06, sR: 0.06, eL: 0.18, eR: 0.18, szL: -0.07, szR: 0.07,
    hL: 0, hR: 0, kL: -0.05, kR: -0.05, hzL: 0, hzR: 0, lean: old ? 0.1 : 0, bob: 0, hipY: 0.95, twist: 0,
    hipTw: 0, hipRoll: 0, hipX: 0, headY: 0, headX: old ? -0.08 : 0, fL: 0, fR: 0, curl: 0.45,
  };
  const robe = look.style === 'lungi' || look.style === 'genji' || look.style === 'saree' || look.style === 'burqa';
  const st = robe ? 0.36 : 1; // লম্বা পোশাকে ছোট পা ফেলা
  if (pose === 'walk' || pose === 'run') {
    // আসল মানুষের হাঁটার চক্র (গোড়ালি মাটিতে পড়া = ০): নিতম্ব, হাঁটু (দুইবার ভাঁজ), গোড়ালি (পা গড়িয়ে চলা)
    const run = pose === 'run';
    const gt = look.gait || { arm: 1, stride: 1, lean: 0, bounce: 1, swag: 1, head: 0 };
    const amp = gt.stride * (robe ? (run ? 0.42 : 0.36) : 1) * (run ? 1 : Math.min(1.3, Math.max(0.72, 0.5 + speed * 0.4)));
    const G = run ? GAIT_RUN : GAIT_WALK;
    const uL = (((p / TAU) % 1) + 1) % 1, uR = (uL + 0.5) % 1;
    t.hL = curve(G.hip, uL) * amp; t.hR = curve(G.hip, uR) * amp;
    t.kL = -curve(G.knee, uL) * (0.35 + 0.65 * amp); t.kR = -curve(G.knee, uR) * (0.35 + 0.65 * amp);
    t.fL = curve(G.ankle, uL) * amp; t.fR = curve(G.ankle, uR) * amp;
    // কোমর: সামনে যাওয়া পায়ের দিকে ঘোরে, ভর যে পায়ে সেদিকে সরে, অন্য পাশ একটু নামে; কাঁধ উল্টো দিকে
    const cw = Math.cos(p), sw = Math.sin(p), lag = Math.cos(p - 0.35);
    t.hipTw = -(run ? 0.14 : 0.09) * cw * amp * gt.swag;
    t.twist = (run ? 0.26 : 0.15) * cw * amp * (0.6 + 0.4 * gt.swag);
    t.hipRoll = -(F ? 0.06 : 0.04) * sw * gt.swag;
    t.hipX = -(F ? 0.026 : 0.018) * sw * gt.swag;
    t.bob = (run ? 0.035 * Math.abs(Math.sin(p)) - 0.04 : -0.016 * Math.cos(2 * p) - 0.012) * gt.bounce;
    // হাত: পায়ের উল্টো দিকে, একটু দেরিতে; সামনে যাওয়ার সময় কনুই বেশি ভাঁজ
    const as = (run ? 0.62 : 0.3) * gt.arm;
    t.sL = -as * lag * amp + (run ? 0.25 : 0.05); t.sR = as * lag * amp + (run ? 0.25 : 0.05);
    t.eL = (run ? 1.45 : 0.2) + Math.max(0, -lag) * (run ? 0.15 : 0.22); t.eR = (run ? 1.45 : 0.2) + Math.max(0, lag) * (run ? 0.15 : 0.22);
    t.szL = run ? -0.16 : F ? -0.06 : -0.1; t.szR = -t.szL;
    t.lean = (run ? 0.17 : 0.035) + gt.lean + (old ? 0.1 : 0);
    // মাথা: শরীরের ঘোরা সামলে সামনে, মাঝে মাঝে এদিক-ওদিক তাকায়
    const look2 = Math.sin(p * 0.11 + gt.head) * Math.sin(p * 0.047 + gt.head * 2);
    t.headY = -0.55 * (t.twist + t.hipTw) + (run ? 0 : look2 * 0.35); t.headX = (run ? -0.12 : -0.02) + 0.02 * Math.cos(2 * p) + (old ? -0.08 : 0);
    t.curl = run ? 0.9 : 0.35;
  } else if (pose === 'air') {
    t.hL = 0.7; t.hR = -0.15; t.kL = -1.0; t.kR = -0.5; t.sL = 0.5; t.sR = -0.3; t.eL = 0.8; t.eR = 0.8; t.lean = 0.1;
  } else if (pose === 'drive') {
    // পা সামনে প্যাডেলে (হাঁটু থেকে পা সামনের দিকে নেমে মেঝেতে), পিঠ একটু হেলানো, হাত স্টিয়ারিংয়ে
    // সিট থেকে মেঝে যত কাছে, পা তত সামনে ছড়ানো (প্রাইভেট কারে প্রায় সোজা সামনে, বাস-ট্রাকে বেশি ভাঁজ); পা কখনো মেঝের নিচে যায় না
    const sh = look.seatH ?? 0.36, hip = 1.62;
    const rise = 0.45 * Math.sin(hip - Math.PI / 2); // উরু একটু উপরে
    const ca = Math.min(0.92, Math.max(0.2, (sh - 0.07 + rise) / 0.44));
    const knee = Math.acos(ca) - hip; // হাঁটু (ঋণাত্মক = ভাঁজ)
    t.hL = hip; t.hR = hip; t.kL = knee; t.kR = knee; t.fL = -0.2; t.fR = -0.25; t.sL = 1.05; t.sR = 1.05; t.eL = 0.55; t.eR = 0.55; t.hzL = -0.12; t.hzR = 0.12; t.lean = -0.18;
  } else if (pose === 'bike') {
    // মোটরবাইক: দুই পা দুই পাশে ছড়িয়ে পেগে (হাঁটু বেশি ভাঁজ, পা পিছনে), শরীর সামনে ঝুঁকে, হাত নিচু হাতলে, মাথা তুলে সামনে
    t.hL = 0.95; t.hR = 0.95; t.kL = -1.8; t.kR = -1.8; t.hzL = -0.32; t.hzR = 0.32; t.fL = 0.35; t.fR = 0.35;
    // মেরুদণ্ডে তিন ভাগে ভাগ হয় বলে বুক বেশি ঝোঁকানো (দেখতে প্রায় ৪০°), মাথা তুলে সামনে, হাত সামনে-নিচে হাতলে
    t.sL = 2.15; t.sR = 2.15; t.eL = 0.3; t.eR = 0.3; t.szL = 0.22; t.szR = -0.22; t.lean = 1.3; t.headX = -1.0;
  } else if (pose === 'pedal') {
    t.hL = 1.0 + s * 0.35; t.hR = 1.0 - s * 0.35;
    t.kL = -1.2 - Math.max(0, -s) * 0.5; t.kR = -1.2 - Math.max(0, s) * 0.5;
    t.sL = 1.0; t.sR = 1.0; t.eL = 0.3; t.eR = 0.3; t.szL = 0.2; t.szR = -0.2; t.lean = 0.25; t.hipRoll = s * 0.04; t.headX = -0.2;
  } else if (pose === 'sit') {
    t.hL = 1.45; t.hR = 1.45; t.kL = -1.45; t.kR = -1.45; t.sL = 0.25; t.sR = 0.25; t.eL = 0.75; t.eR = 0.75; t.hzL = F ? 0.02 : -0.1; t.hzR = F ? -0.02 : 0.1;
    t.headY = Math.sin(p * 0.23) * 0.3; t.lean = -0.04 + (old ? 0.1 : 0);
  } else if (pose === 'wave') {
    t.sR = 2.9 + Math.sin(p * 3) * 0.25; t.szR = 0.3; t.eR = 0.4; t.headY = 0.1;
  } else if (pose === 'traffic') {
    // ট্রাফিক পুলিশ: বাম হাত সামনে তুলে "থামুন" (লাল দিকে), ডান হাত পাশ থেকে সামনে বারবার টেনে "আসুন" (সবুজ দিকে)
    const w = Math.sin(p * 2.2);
    t.sL = 1.45; t.szL = 0.05; t.eL = 0.15;
    t.sR = 0.9 + w * 0.55; t.szR = -1.0 + w * 0.35; t.eR = 0.5 + Math.max(0, w) * 0.5;
    t.headY = 0.25 * Math.sin(p * 0.35); t.twist = -0.12 + w * 0.06; t.kL = -0.05; t.kR = -0.05; t.hzL = -0.06; t.hzR = 0.06;
  } else if (pose === 'idle') {
    // দাঁড়িয়ে: শ্বাস, ওজন এক পা থেকে আরেক পায়ে, এদিক-ওদিক তাকানো
    const w = Math.sin(p * 0.22);
    t.sL = 0.06 + Math.sin(p * 0.5) * 0.025; t.sR = 0.06 - Math.sin(p * 0.5) * 0.025;
    t.hipX = w * 0.025; t.hipRoll = w * 0.035; t.hzL = -w * 0.035; t.hzR = -w * 0.035;
    t.kL = -0.05 - Math.max(0, -w) * 0.12; t.kR = -0.05 - Math.max(0, w) * 0.12;
    t.lean = Math.sin(p * 0.9) * 0.012 + (old ? 0.1 : 0); t.headY = Math.sin(p * 0.17) * 0.35 + Math.sin(p * 0.41) * 0.1; t.headX = Math.sin(p * 0.13) * 0.06 + (old ? -0.08 : 0);
    t.twist = -w * 0.04;
  } else if (pose === 'angry') {
    t.sR = 1.6 + Math.sin(p * 4) * 0.45; t.eR = 0.5 + Math.sin(p * 4) * 0.3; t.szR = 0.15;
    t.sL = 0.4; t.eL = 1.9; t.szL = -0.35; t.lean = -0.06; t.headX = 0.08 + Math.sin(p * 4) * 0.05; t.headY = Math.sin(p * 2) * 0.12;
  } else if (pose === 'down') {
    t.sL = 2.6; t.sR = 1.4; t.szL = -0.6; t.szR = 0.9; t.eL = 0.2; t.eR = 0.6;
    t.hL = 0.3; t.hR = -0.1; t.kL = -0.6; t.kR = -0.2; t.hzL = -0.15; t.hzR = 0.2; t.headY = 0.5;
  } else if (pose === 'punch') {
    t.sR = 1.55; t.eR = 0.05; t.szR = -0.05; t.sL = 1.1; t.eL = 1.8; t.szL = 0.2; t.lean = 0.12;
    t.hL = 0.25; t.hR = -0.15; t.twist = 0.3;
  } else if (pose === 'kick') {
    t.hR = 1.65; t.kR = -0.05; t.hL = -0.15; t.kL = -0.35; t.lean = -0.28;
    t.sL = 0.9; t.eL = 1.9; t.sR = -0.5; t.eR = 0.6; t.szL = -0.3; t.szR = 0.3; t.hipY = 0.92;
  } else if (pose === 'guard' || pose === 'block') {
    const b = pose === 'block';
    t.sL = b ? 2.1 : 1.15; t.eL = b ? 2.35 : 2.0; t.szL = b ? 0.5 : 0.25;
    t.sR = b ? 2.1 : 1.05; t.eR = b ? 2.35 : 2.1; t.szR = b ? -0.5 : -0.25;
    t.hL = 0.28 + Math.sin(p * 2) * 0.05; t.hR = -0.2; t.kL = -0.35; t.kR = -0.3;
    t.lean = b ? 0.18 : 0.08; t.hipY = 0.9; t.twist = b ? 0 : -0.18; t.bob = Math.abs(Math.sin(p * 2)) * 0.02; t.headX = 0.12;
  } else if (pose === 'jab') {
    t.sL = 1.62; t.eL = 0.05; t.szL = 0.1; t.sR = 1.1; t.eR = 2.1; t.szR = -0.25;
    t.hL = 0.35; t.hR = -0.2; t.kL = -0.35; t.kR = -0.3; t.lean = 0.12; t.twist = -0.35; t.hipY = 0.9; t.hipTw = -0.1;
  } else if (pose === 'cross') {
    t.sR = 1.62; t.eR = 0.05; t.szR = -0.1; t.sL = 1.1; t.eL = 2.1; t.szL = 0.25;
    t.hL = 0.4; t.hR = -0.3; t.kL = -0.4; t.kR = -0.2; t.lean = 0.2; t.twist = 0.5; t.hipY = 0.9; t.hipTw = 0.2;
  } else if (pose === 'hook') {
    t.sR = 1.25; t.szR = 1.25; t.eR = 1.55; t.sL = 1.15; t.eL = 2.1; t.szL = 0.3;
    t.hL = 0.35; t.hR = -0.25; t.kL = -0.45; t.kR = -0.35; t.lean = 0.14; t.twist = 0.85; t.hipY = 0.88; t.hipTw = 0.25;
  } else if (pose === 'lowkick') {
    t.hR = 0.85; t.hzR = 0.35; t.kR = -0.12; t.hL = -0.1; t.kL = -0.45; t.lean = -0.1; t.twist = 0.55;
    t.sL = 1.15; t.eL = 2.0; t.szL = 0.25; t.sR = 0.9; t.eR = 2.0; t.szR = -0.1; t.hipY = 0.88;
  } else if (pose === 'stomp') {
    t.hR = 0.75; t.kR = -0.15; t.hL = -0.1; t.kL = -0.45; t.lean = 0.3; t.headX = 0.3;
    t.sL = 0.6; t.eL = 1.4; t.sR = 0.4; t.eR = 1.2; t.szL = -0.3; t.szR = 0.3; t.hipY = 0.88;
  } else if (pose === 'swim') {
    t.sL = Math.PI + Math.sin(p * 2) * 1.6; t.sR = Math.PI - Math.sin(p * 2) * 1.6; t.eL = 0.2; t.eR = 0.2;
    t.hL = Math.sin(p * 6) * 0.25; t.hR = -Math.sin(p * 6) * 0.25; t.kL = -0.15; t.kR = -0.15; t.headY = Math.sin(p * 2) * 0.4;
  } else if (pose === 'tread') {
    t.sL = 1.3 + Math.sin(p * 3) * 0.4; t.sR = 1.3 - Math.sin(p * 3) * 0.4; t.szL = -0.9; t.szR = 0.9; t.eL = 0.4; t.eR = 0.4;
    t.hL = 0.4 + Math.sin(p * 3) * 0.3; t.hR = 0.4 - Math.sin(p * 3) * 0.3; t.kL = -0.7; t.kR = -0.7;
  } else if (pose === 'stagger') {
    t.sL = 0.9; t.sR = 0.2; t.szL = -0.7; t.szR = 0.9; t.eL = 0.8; t.eR = 0.4;
    t.lean = -0.45; t.kL = -0.45; t.kR = -0.15; t.hL = -0.25; t.hR = 0.35; t.twist = 0.4; t.hipY = 0.88; t.headX = -0.3;
  } else if (pose === 'swing') {
    t.sR = 2.4 - (p % 1) * 1.6; t.eR = 0.4; t.sL = 0.3 + (1 - (p % 1)) * 0.8; t.eL = 0.6; t.lean = 0.12 + (p % 1) * 0.15; t.headX = 0.2;
  } else if (pose === 'aim') {
    t.sR = 1.5; t.eR = 0.0; t.szR = -0.12; t.sL = 1.4; t.eL = 0.35; t.szL = 0.45; t.twist = 0.1;
  } else if (pose === 'aimWalk') {
    t.sR = 1.5; t.eR = 0.0; t.szR = -0.12; t.sL = 1.4; t.eL = 0.35; t.szL = 0.45;
    t.hL = s * 0.4; t.hR = -s * 0.4; t.kL = Math.max(0, -c) * -0.6; t.kR = Math.max(0, c) * -0.6; t.hipTw = s * 0.08;
  } else if (pose === 'surrender') {
    t.sL = 2.9; t.sR = 2.9; t.eL = 0.6; t.eR = 0.6; t.szL = -0.15; t.szR = 0.15; t.lean = -0.05 + Math.sin(p * 9) * 0.01; t.headX = 0.1;
  } else if (pose === 'flinch') {
    t.sL = 0.6; t.sR = 0.6; t.eL = 1.6; t.eR = 1.6; t.lean = -0.35; t.kL = -0.3; t.kR = -0.3; t.headX = -0.25;
  } else if (pose === 'cheer') {
    t.sL = 2.5 + Math.sin(p * 5) * 0.3; t.sR = 2.5 - Math.sin(p * 5) * 0.3; t.eL = 0.3; t.eR = 0.3; t.szL = -0.2; t.szR = 0.2; t.headX = -0.15;
  } else if (pose === 'phone') {
    // কানে ফোন, মাঝে মাঝে মাথা নাড়ে
    t.sR = 1.3; t.eR = 1.7; t.szR = 0.45; t.headY = Math.sin(p * 0.6) * 0.2; t.headX = 0.05; t.hipX = 0.015; t.hipRoll = 0.03;
  }
  if (['punch', 'jab', 'cross', 'hook', 'guard', 'block', 'swing', 'aim', 'aimWalk', 'drive', 'bike', 'pedal'].includes(pose)) t.curl = 1.25; // মুঠি / হাতল ধরা
  else if (pose === 'surrender' || pose === 'wave' || pose === 'cheer') t.curl = 0.1;
  return t;
}

// বাইক চালানো: জোরে চালালে আরও ঝুঁকে, মোড়ে শরীর আর মাথা ভিতরের দিকে, ভিতরের হাত বেশি ভাঁজ;
// থামলে সোজা হয়ে বসে বাম পা মাটিতে (b.steer: ডানে +, b.speed, b.stop)
export function bikeMods(t, b) {
  const sp = Math.abs(b.speed || 0), f = Math.min(1, sp / 16);
  const s = Math.max(-1, Math.min(1, b.steer || 0)) * Math.min(1, sp / 4);
  t.lean += 0.2 * f; t.headX -= 0.14 * f; t.eL -= 0.06 * f; t.eR -= 0.06 * f;
  t.hipRoll += -s * 0.16; t.headY += -s * 0.32; t.twist += -s * 0.08;
  if (s > 0) { t.eR += s * 0.35; t.eL -= s * 0.12; } else { t.eL += -s * 0.35; t.eR -= -s * 0.12; }
  if (b.stop) {
    t.lean -= 0.5; t.headX += 0.4; t.hipRoll += 0.04;
    t.hL = 0.22; t.kL = -0.3; t.hzL = -0.46; t.fL = 0.2; // বাম পা নিচে মাটিতে
  }
}
