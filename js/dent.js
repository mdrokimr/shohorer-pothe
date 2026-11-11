// যেখানে ধাক্কা লাগে সেখানে টোল: গাড়ির জ্যামিতির বিন্দুগুলো ভিতরের দিকে সরানো (GTA-স্টাইল সফট বডি)
// pos: Float32Array (x,y,z...), orig: আসল অবস্থান; lx,lz: লোকাল ইমপ্যাক্ট; dx,dz: ভিতরের দিক (একক ভেক্টর)
export function dentArray(pos, orig, lx, lz, dx, dz, amount, R, maxD, yMin = 0.18) {
  let moved = 0;
  const R2 = R * R;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (y < yMin) continue; // চাকার নিচের অংশ না
    const ddx = x - lx, ddz = z - lz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 >= R2) continue;
    const d = Math.sqrt(d2);
    const t = 1 - d / R;
    // smoothstep: কেন্দ্রে গভীর, কিনারে মসৃণ
    const soft = t * t * (3 - 2 * t);
    const push = amount * soft;
    // ইমপ্যাক্ট নর্মাল + সামান্য রেডিয়াল স্কোয়াশ (ক্রাশড ফিল)
    const rl = d > 1e-4 ? d : 1;
    const nx = x + dx * push + (ddx / rl) * push * 0.28;
    let ny = y - push * 0.32; // বনেট/দরজা বসে যায়
    const nz = z + dz * push + (ddz / rl) * push * 0.28;
    // আসল জায়গা থেকে বেশি দূরে না
    const ox = nx - orig[i], oy = ny - orig[i + 1], oz = nz - orig[i + 2];
    const L = Math.hypot(ox, oy, oz);
    if (L > maxD) {
      const k = maxD / L;
      pos[i] = orig[i] + ox * k;
      pos[i + 1] = Math.max(yMin * 0.45, orig[i + 1] + oy * k);
      pos[i + 2] = orig[i + 2] + oz * k;
    } else {
      pos[i] = nx; pos[i + 1] = Math.max(yMin * 0.45, ny); pos[i + 2] = nz;
    }
    moved++;
  }
  return moved;
}
