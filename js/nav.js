// রাস্তার জালে সবচেয়ে ছোট পথ (GPS): হিপ দিয়ে Dijkstra, লক্ষ্য পেলেই থামে
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(d, id) {
    const a = this.a;
    a.push([d, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class Nav {
  constructor(map, world) {
    this.map = map;
    this.world = world;
  }
  // শুরু আর শেষের সবচেয়ে কাছের রাস্তা ধরে পথ: বিন্দুর তালিকা
  route(sx, sz, tx, tz) {
    const M = this.map;
    const rs = this.world.nearestRoad(sx, sz), rt = this.world.nearestRoad(tx, tz);
    if (!rs || !rt) return [{ x: sx, z: sz }, { x: tx, z: tz }];
    if (rs.seg === rt.seg) return [{ x: sx, z: sz }, { x: rs.px, z: rs.pz }, { x: rt.px, z: rt.pz }, { x: tx, z: tz }];
    const dist = new Map(), prev = new Map(), done = new Set();
    const h = new Heap();
    const relax = (id, d, p) => {
      if (dist.has(id) && dist.get(id) <= d) return;
      dist.set(id, d);
      prev.set(id, p);
      h.push(d, id);
    };
    relax(rs.seg.a, rs.t, null);
    relax(rs.seg.b, rs.seg.len - rs.t, null);
    const goalA = rt.seg.a, goalB = rt.seg.b;
    let found = 0;
    while (h.size) {
      const [d, id] = h.pop();
      if (done.has(id)) continue;
      done.add(id);
      if (id === goalA || id === goalB) { if (++found === 2 || done.has(goalA) && done.has(goalB)) break; }
      for (const l of M.nodes[id].links) relax(l.to, d + M.segments[l.seg].len, id);
    }
    const ca = (dist.get(goalA) ?? Infinity) + rt.t;
    const cb = (dist.get(goalB) ?? Infinity) + (rt.seg.len - rt.t);
    const end = ca < cb ? goalA : goalB;
    if (!dist.has(end)) return [{ x: sx, z: sz }, { x: tx, z: tz }];
    const chain = [];
    for (let id = end; id !== null && id !== undefined; id = prev.get(id)) chain.push(id);
    chain.reverse();
    const pts = [{ x: sx, z: sz }, { x: rs.px, z: rs.pz }];
    for (const id of chain) pts.push({ x: M.nodes[id].x, z: M.nodes[id].z });
    pts.push({ x: rt.px, z: rt.pz }, { x: tx, z: tz });
    return pts;
  }
}
