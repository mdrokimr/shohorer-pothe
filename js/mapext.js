// ম্যাপ বাড়ানো: পশ্চিমে নদী (তুরাগের মতো) আর দুইটা ঘাট, উত্তরে ছোট বিমানবন্দর। আসল ম্যাপের বাইরে, বানানো জায়গা
// data/map.json পড়ার পরে, buildMap-এর আগে কাঁচা ডেটায় যোগ হয়

const RIVER_X0 = -1140, RIVER_X1 = -1005; // নদীর দুই পাড়
const BANK_ROAD_X = -985;
export const RUNWAY = { x0: -620, x1: 460, z: -830, w: 46 };
export const APRON = { x0: -430, x1: 210, z0: -730, z1: -656 };

export function extendMap(d) {
  const N = d.nodes;
  const add = (x, z) => { N.push([x, z]); return N.length - 1; };
  const used = new Set();
  for (const r of d.roads) for (const i of r.ids) used.add(i);
  const usedIds = [...used];
  // পশ্চিমের সবচেয়ে শেষ রাস্তা আর উত্তরের সবচেয়ে শেষ রাস্তা থেকে সংযোগ
  const west = usedIds.reduce((a, i) => (N[i][0] < N[a][0] ? i : a), usedIds[0]);
  const north = usedIds.reduce((a, i) => (N[i][1] < N[a][1] && Math.abs(N[i][0]) < 400 ? i : a), usedIds.find((i) => Math.abs(N[i][0]) < 400));

  // ---------- বেড়িবাঁধ সড়ক: নদীর পাড় ধরে ----------
  const wz = N[west][1];
  const bank = [];
  for (let z = -600; z <= 480; z += 60) bank.push(z);
  if (!bank.some((z) => Math.abs(z - wz) < 20)) bank.push(wz);
  bank.sort((a, b) => a - b);
  const bankIds = bank.map((z) => add(BANK_ROAD_X, z));
  d.roads.push({ n: 'বেড়িবাঁধ সড়ক', t: 'tertiary', w: 8, o: 0, m: 1, ids: bankIds });
  const jIdx = bankIds[bank.findIndex((z) => Math.abs(z - wz) < 20 || z === wz)];
  d.roads.push({ n: 'বেড়িবাঁধ সংযোগ', t: 'tertiary', w: 7, o: 0, m: 1, ids: [west, add((N[west][0] + BANK_ROAD_X) / 2, wz), jIdx] });
  // নদী
  d.water.push({ p: [[RIVER_X0, -1060], [RIVER_X1, -1060], [RIVER_X1 + 6, -300], [RIVER_X1, 200], [RIVER_X1 + 4, 700], [RIVER_X0, 700], [RIVER_X0 - 10, 200]], n: 'তুরাগ নদী' });
  // ঘাট: পাড় থেকে পানিতে কাঠের জেটি
  const ghats = [
    { name: 'বিরুলিয়া ঘাট', z: -420 },
    { name: 'গাবতলী ঘাট', z: 360 },
  ].map((g) => ({ ...g, x: RIVER_X1, pier: { x0: RIVER_X1 - 26, x1: RIVER_X1 + 14, z0: g.z - 4, z1: g.z + 4 }, booth: { x: -996, z: g.z + 9 }, boat: { x: RIVER_X1 - 16, z: g.z + 7.8, yaw: 0 } }));
  // টিকিট কাউন্টারের ছোট ঘর
  for (const g of ghats) d.buildings.push({ p: rect(g.booth.x - 3, g.booth.x + 3, g.booth.z - 2, g.booth.z + 2), k: 'yes', h: 3.4, n: g.name });

  // ---------- বিমানবন্দর ----------
  const nz = N[north][1], nx = N[north][0];
  const apronIds = [];
  for (let x = APRON.x0; x <= APRON.x1; x += 70) apronIds.push(add(x, -650));
  const jx = add(nx, -650);
  apronIds.push(jx);
  apronIds.sort((a, b) => N[a][0] - N[b][0]);
  d.roads.push({ n: 'এয়ারপোর্ট রোড', t: 'tertiary', w: 8, o: 0, m: 1, ids: apronIds });
  d.roads.push({ n: 'এয়ারপোর্ট রোড', t: 'tertiary', w: 8, o: 0, m: 1, ids: [north, add(nx, (nz - 650) / 2), jx] });
  // ঘাস
  d.parks.push({ p: rect(RUNWAY.x0 - 60, RUNWAY.x1 + 60, -990, -662), n: 'বিমানবন্দর', k: 'grass' });
  // টার্মিনাল, হ্যাঙ্গার, কন্ট্রোল টাওয়ার (রাস্তার দক্ষিণ পাশে)
  d.buildings.push({ p: rect(-390, -230, -636, -606), k: 'yes', h: 13, n: 'শাহ মিরপুর বিমানবন্দর' });
  d.buildings.push({ p: rect(60, 130, -640, -604), k: 'yes', h: 12, n: 'হ্যাঙ্গার' });
  d.buildings.push({ p: rect(-118, -106, -630, -618), k: 'yes', h: 30, n: 'কন্ট্রোল টাওয়ার' });

  // সব সীমানা বড়
  d.bounds = [Math.min(d.bounds[0], RIVER_X0 - 110), d.bounds[1], Math.min(d.bounds[2], -1000), d.bounds[3]];
  d.extras = {
    runway: RUNWAY, apron: APRON, ghats,
    terminal: { x: -310, z: -644, name: 'ফ্লাইট ডেস্ক' },
    planeSpot: { x: -300, z: -700, yaw: -Math.PI / 2 },
    heliSpot: { x: 150, z: -700, yaw: -Math.PI / 2 },
    taxiway: { x: -100, z0: APRON.z0, z1: RUNWAY.z + RUNWAY.w / 2 },
  };
  return d;
}

function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
