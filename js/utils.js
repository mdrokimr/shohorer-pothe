// ছোট হেল্পার
const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => String(v).replace(/\d/g, (d) => BN[d]);
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const isTouch = () =>
  (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
export function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, String(val));
  } catch (e) { /* প্রাইভেট মোডে localStorage নাও থাকতে পারে */ }
  return null;
}

// মোবাইলে (iPhone-এর Safari সব ক্যানভাস মিলিয়ে সীমিত মেমরি দেয়, সীমা ছাড়ালে নতুন ছবি আঁকা যায় না):
// একবার আঁকা ছবি গ্রাফিক্সে চলে গেলে ক্যানভাস ছোট করে মেমরি ছেড়ে দেওয়া। শুধু যেগুলো পরে আর আঁকা হয় না
export function freeAfterUpload(tex) {
  if (!tex || !isTouch()) return tex;
  tex.onUpdate = () => {
    const im = tex.image;
    if (im && typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement && im.width > 1) { im.width = 1; im.height = 1; }
    tex.onUpdate = null;
  };
  return tex;
}
