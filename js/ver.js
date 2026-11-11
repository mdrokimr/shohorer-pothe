// ভার্সন: প্রতিবার প্রকাশের সময় বাড়ে। ফোনের ব্রাউজার পুরোনো ফাইল ক্যাশে রেখে দেয়; ?v= দিলে নতুনটা আনে
import * as THREE from 'three';
export const V = 53;
export const vurl = (u) => (/^(data:|blob:|https?:)/.test(u) || u.includes('v=') ? u : u + (u.includes('?') ? '&' : '?') + 'v=' + V);
// মডেলের ভিতরের ছবিগুলোর ঠিকানাতেও ভার্সন
export const VMANAGER = new THREE.LoadingManager();
VMANAGER.setURLModifier(vurl);

// মডেল লোড: ভিতরের data: ডেটা লোডারকে fetch করতে না দিয়ে নিজেরা খুলে (atob) বাইনারি GLB বানিয়ে দেওয়া।
// মোবাইলের Claude অ্যাপে নিরাপত্তার নিয়মে data: ঠিকানা fetch করা যায় না ("Failed to load buffer data:...")
export async function loadGLTF(loader, url) {
  let glb = null;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    const J = await r.json();
    const parts = [];
    let total = 0;
    for (const b of J.buffers || []) {
      if (!b.uri || !b.uri.startsWith('data:')) throw new Error('external buffer');
      const s = atob(b.uri.slice(b.uri.indexOf(',') + 1));
      const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      const off = (total + 3) & ~3; // ৪ বাইটে সারি
      parts.push({ u8, off }); total = off + u8.length;
    }
    for (const bv of J.bufferViews || []) { bv.byteOffset = (bv.byteOffset || 0) + parts[bv.buffer || 0].off; bv.buffer = 0; }
    if (parts.length) J.buffers = [{ byteLength: total }]; else delete J.buffers;
    const enc = new TextEncoder().encode(JSON.stringify(J));
    const jl = (enc.length + 3) & ~3, bl = (total + 3) & ~3;
    const len = 12 + 8 + jl + (parts.length ? 8 + bl : 0);
    const out = new ArrayBuffer(len), dv = new DataView(out), u = new Uint8Array(out);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, len, true);
    dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); u.set(enc, 20); u.fill(0x20, 20 + enc.length, 20 + jl);
    if (parts.length) {
      const o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004e4942, true);
      for (const p of parts) u.set(p.u8, o + 8 + p.off);
    }
    glb = out;
  } catch (e) { console.warn('glb pack', url, e && e.message); glb = null; }
  if (!glb) return loader.loadAsync(url); // আগের পথ (ডেস্কটপে চলে)
  const base = url.split('?')[0].replace(/[^/]*$/, ''); // ছবিগুলোর ঠিকানা এর সাপেক্ষে
  return loader.parseAsync(glb, base);
}

// নতুন ভার্সন প্রকাশ হলে (ফোনে পুরোনোটা খোলা থাকলে) নিজে থেকে নতুনটা আনা
export async function checkUpdate(onNew) {
  try {
    const t = await (await fetch('js/ver.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const m = /export const V = (\d+);/.exec(t);
    if (m && +m[1] > V) onNew(+m[1]);
  } catch (e) { /* অফলাইন: ঠিক আছে */ }
}
