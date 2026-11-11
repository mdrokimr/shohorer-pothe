// আসল 3D গাছ (Sketchfab, CC-BY): কাছের গাছগুলো আসল মডেলে, দূরেরগুলো আগের হালকা গাছ
// প্রতি ধরনের গাছের প্রতি ম্যাটেরিয়ালে একটা InstancedMesh; খেলোয়াড় সরলে কাছের গাছের তালিকা নতুন করে বসে
import * as THREE from 'three';
import { vurl, VMANAGER, loadGLTF } from './ver.js';
import { VM, toLambert } from './vmodels.js';

const FILES = ['tree_lp1', 'tree_lp2', 'tree_mango', 'tree_a1', 'tree_a2', 'tree_a3'];
const CAP = 140; // প্রতি ধরনে সর্বোচ্চ কাছের গাছ
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class TreeModels {
  constructor(world) {
    this.w = world;
    this.vars = [];
    this.near = new Map(); // গাছের সূচক → { v, slot }
    this.ready = false;
    this.t = 0; this.lx = 1e9; this.lz = 1e9;
  }
  async load() {
    let GLTFLoader;
    try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); } catch (e) { return false; }
    const loader = new GLTFLoader(VMANAGER);
    for (const f of FILES) {
      try {
        const gl = await loadGLTF(loader, vurl(`assets/veh_${f}.gltf.json`));
        const parts = [];
        gl.scene.updateMatrixWorld(true);
        gl.scene.traverse((o) => {
          if (!o.isMesh) return;
          const m = toLambert(o.material);
          // পাতার কিনারা স্বচ্ছ: আলফা-কাট (সাজানোর ঝামেলা নেই)
          if (m.transparent || m.alphaTest) { m.transparent = false; m.depthWrite = true; m.alphaTest = Math.max(0.45, m.alphaTest || 0); m.side = THREE.DoubleSide; }
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          const im = new THREE.InstancedMesh(geo, m, CAP);
          im.count = 0; im.castShadow = true; im.receiveShadow = false;
          im.frustumCulled = false;
          im.userData.leaf = /leaf|^material$|tree_1/i.test(o.material.name || '');
          parts.push(im);
          this.w.scene.add(im);
        });
        if (parts.length) this.vars.push({ name: f, parts });
      } catch (e) { console.warn('tree model', f, e && e.message); }
    }
    this.ready = this.vars.length > 0;
    if (this.ready) this.refresh(true);
    return this.ready;
  }
  // কোন গাছ কোন ধরনের: সূচক থেকে স্থির (প্রতিবার একই)
  variantOf(i) { return (i * 7 + (i >> 3)) % this.vars.length; }
  update(dt, x, z) {
    if (!this.ready) return;
    this.t -= dt;
    if (this.t > 0 && Math.hypot(x - this.lx, z - this.lz) < 10) return;
    this.t = 0.6; this.lx = x; this.lz = z;
    this.refresh(false);
  }
  refresh() {
    const W = this.w, T = W.treeList || [], R = (VM.near || 80) * 1.25;
    const cx = this.lx, cz = this.lz;
    const cand = [];
    for (let i = 0; i < T.length; i++) {
      const d = Math.hypot(T[i][0] - cx, T[i][1] - cz);
      if (d < R) cand.push([d, i]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const used = this.vars.map(() => 0);
    const next = new Map();
    for (const [, i] of cand) {
      const v = this.variantOf(i);
      if (used[v] >= CAP) continue;
      next.set(i, { v, slot: used[v]++ });
    }
    const P = W.inst;
    // দূরে চলে যাওয়া গাছ: আবার হালকা গাছ
    for (const [i] of this.near) if (!next.has(i)) { P.trunk.setMatrixAt(i, W.treeMats[i]); P.leaf.setMatrixAt(i, W.treeMats[i]); }
    for (const [i] of next) { P.trunk.setMatrixAt(i, ZERO); P.leaf.setMatrixAt(i, ZERO); }
    P.trunk.instanceMatrix.needsUpdate = P.leaf.instanceMatrix.needsUpdate = true;
    this.near = next;
    const col = new THREE.Color();
    for (const [i, n] of next) {
      const V = this.vars[n.v];
      const k = 0.85 + ((i * 37) % 31) / 100; // পাতার রং একটু একটু আলাদা
      col.setRGB(k * (0.96 + ((i * 13) % 9) / 100), k, k * 0.95);
      for (const im of V.parts) {
        im.setMatrixAt(n.slot, W.treeMats[i]);
        if (im.userData.leaf) im.setColorAt(n.slot, col);
      }
    }
    this.vars.forEach((V, v) => {
      for (const im of V.parts) {
        im.count = used[v];
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    });
  }
  // গাছ হেলে পড়া/আবার দাঁড়ানো: কাছের গাছ হলে আসল মডেলে, না হলে হালকা গাছে
  pose(i) {
    const n = this.near.get(i);
    if (!n) return false;
    for (const im of this.vars[n.v].parts) { im.setMatrixAt(n.slot, this.w.treeMats[i]); im.instanceMatrix.needsUpdate = true; }
    return true;
  }
}
