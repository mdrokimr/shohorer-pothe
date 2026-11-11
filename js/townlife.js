// শহরের জীবন: সব দোকানে দোকানদার-ক্রেতা আর ভিতরে কেনাকাটা, স্কুল-মাদ্রাসায় ক্লাস (শিক্ষকের চাকরি, ক্যান্টিন),
// আদালতে মামলা মেটানো, ব্যাংক (জমা-তোলা, সুদ, ক্যাশিয়ারের কাজ), বিদ্যুৎ অফিস (মিটার পড়ার কাজ), ডাকঘর (ডাকপিয়নের কাজ),
// দরজা দিয়ে লোকজনের আসা-যাওয়া, দারোয়ান, আর কেনা জিনিস রাখার ব্যাগ।
import * as THREE from 'three';
import { makeRig, setPose, giveGun } from './rig.js';
import { pick, rand, bn, clamp } from './utils.js';
import { bnGroup } from './ui.js';
import { planeGeo, texMat, canvasTex, lam, addBox, addCyl } from './lib3d.js';
import { signTex, FONT } from './textures.js';
import { shopType } from './art.js';
import { Room } from './interiors.js';
import { Vehicle } from './vehicles.js';

// ---------- কোন বিল্ডিং কী: স্কুল, মাদ্রাসা, আদালত, ব্যাংক, বিদ্যুৎ অফিস, ডাকঘর, মোটর শোরুম ----------
// World বানানোর আগে ডাকতে হয় (সাইনবোর্ডে নাম ওঠে)
export function assignCivic(M) {
  const B = M.buildings;
  const taken = (b) => ['rest', 'office', 'thana', 'hospital', 'gunshop', 'courier'].includes(b.kind);
  for (const b of B) {
    if (taken(b)) continue;
    const nm = b.landmark || '';
    if (/মাদ্রাসা|মাদরাসা|madras/i.test(nm)) b.civic = 'madrasa';
    else if (b.osmKind === 'school' || b.osmKind === 'college' || /স্কুল|কলেজ|school|college/i.test(nm)) b.civic = 'school';
    if (b.civic) { b.kind = 'civic'; b.name = nm || 'মিরপুর আদর্শ বিদ্যালয়'; }
  }
  const civ = B.filter((b) => b.civic);
  const claim = (civic, name, mainOnly = true, kind = 'civic') => {
    const cand = B.filter((b) => !taken(b) && !b.civic && !b.landmark && (!mainOnly || b.main) && b.door && b.doorD < 14 && b.area > 100)
      .sort((a, c) => c.area - a.area);
    const b = cand.find((x) => civ.every((o) => Math.hypot(o.x - x.x, o.z - x.z) > 220)) || cand[0];
    if (!b) return null;
    b.kind = kind; b.civic = civic; b.name = name;
    civ.push(b);
    return b;
  };
  if (!civ.some((b) => b.civic === 'madrasa')) claim('madrasa', 'দারুল উলূম মাদ্রাসা', false);
  claim('court', 'মিরপুর চৌকি আদালত');
  claim('bank', 'ভরসা ব্যাংক লিমিটেড');
  claim('bank', 'কিস্তি ব্যাংক লিমিটেড');
  claim('power', 'বিদ্যুৎ বিতরণ অফিস, মিরপুর');
  claim('post', 'মিরপুর ডাকঘর');
  claim('motor', 'গতি মোটরস শোরুম', true, 'shop');
  claim('motor', 'চাকা মোটরস', true, 'shop');
  // কিছু দোকান মিষ্টির দোকান (ম্যাপের নামে নেই)
  let k = 0;
  for (const b of B) if (b.kind === 'shop' && /মুদি|সুপার/.test(b.name || '') && k++ % 3 === 0) b.name = pick(['রসনা মিষ্টান্ন ভান্ডার', 'মধুমিতা সুইটস', 'গ্রামবাংলা মিষ্টি ঘর']);
  M.civic = civ;
  if (M.places && M.places.homes) M.places.homes = M.places.homes.filter((b) => b.kind === 'home');
}

// ম্যাপের চিহ্ন: [রং, অক্ষর, নাম]
export const CIVIC_PIN = {
  school: ['#1565c0', 'স্কু', 'স্কুল/কলেজ'], madrasa: ['#00695c', 'মা', 'মাদ্রাসা'], court: ['#6d4c41', '⚖', 'আদালত'],
  bank: ['#2e7d32', '৳', 'ব্যাংক'], power: ['#f9a825', '⚡', 'বিদ্যুৎ অফিস'], post: ['#d84315', 'ডা', 'ডাকঘর'], motor: ['#37474f', 'মো', 'মোটর শোরুম'],
};
export const SHOP_PIN = { grocery: 'মু', pharmacy: '✚', cloth: 'কা', mobile: '📱', sweets: 'মি', book: 'ব', electronics: 'ই', salon: '✂', motor: 'মো' };

// ---------- জিনিসপত্র ----------
export const ITEMS = {
  bread: { name: 'পাউরুটি-কলা', price: 40, hp: 20, kind: 'food' },
  biscuit: { name: 'বিস্কুটের প্যাকেট', price: 20, hp: 10, kind: 'food' },
  water: { name: 'পানির বোতল', price: 20, hp: 8, kind: 'food' },
  chips: { name: 'চিপস', price: 25, hp: 10, kind: 'food' },
  cola: { name: 'ঠান্ডা কোমল পানীয়', price: 35, hp: 12, kind: 'food' },
  rosogolla: { name: 'রসগোল্লা (আধা কেজি)', price: 160, hp: 35, kind: 'food' },
  doi: { name: 'মিষ্টি দই', price: 120, hp: 30, kind: 'food' },
  jilapi: { name: 'জিলাপি', price: 60, hp: 18, kind: 'food' },
  chomchom: { name: 'চমচম', price: 80, hp: 20, kind: 'food' },
  singara: { name: 'সিঙ্গারা', price: 15, hp: 8, kind: 'food' },
  tea: { name: 'চা', price: 15, hp: 6, kind: 'food' },
  ors: { name: 'খাবার স্যালাইন', price: 10, hp: 12, kind: 'med' },
  painkiller: { name: 'ব্যথার ওষুধ', price: 30, hp: 18, kind: 'med' },
  bandage: { name: 'ব্যান্ডেজ', price: 60, hp: 28, kind: 'med' },
  firstaid: { name: 'ফার্স্ট এইড বক্স', price: 350, hp: 75, kind: 'med' },
  notebook: { name: 'খাতা-কলম', price: 60, kind: 'tool', note: 'শিক্ষকের চাকরিতে বোনাস' },
  story: { name: 'গল্পের বই', price: 120, hp: 5, kind: 'read' },
  paper: { name: 'আজকের পত্রিকা', price: 10, kind: 'paper' },
  torch: { name: 'টর্চলাইট', price: 250, kind: 'tool', note: 'ব্যাগে থাকে' },
  rc50: { name: 'মোবাইল রিচার্জ ৳৫০', price: 50, kind: 'recharge', amt: 50 },
  rc100: { name: 'মোবাইল রিচার্জ ৳১০০', price: 100, kind: 'recharge', amt: 100 },
  rc300: { name: 'মোবাইল রিচার্জ ৳৩০০', price: 300, kind: 'recharge', amt: 300 },
  shRed: { name: 'লাল শার্ট', price: 450, kind: 'wear', wear: { shirt: 0xc62828, kurta: false } },
  shGreen: { name: 'সবুজ শার্ট', price: 450, kind: 'wear', wear: { shirt: 0x2e7d32, kurta: false } },
  shYellow: { name: 'হলুদ টি-শার্ট', price: 300, kind: 'wear', wear: { shirt: 0xf2c230, kurta: false } },
  shBlack: { name: 'কালো শার্ট', price: 500, kind: 'wear', wear: { shirt: 0x1b1b1b, kurta: false } },
  panjabi: { name: 'সাদা পাঞ্জাবি', price: 900, kind: 'wear', wear: { shirt: 0xf5f5f0, kurta: true } },
  panjabiBlue: { name: 'নীল পাঞ্জাবি', price: 900, kind: 'wear', wear: { shirt: 0x1d4f8c, kurta: true } },
  jeans: { name: 'জিন্স প্যান্ট', price: 800, kind: 'wear', wear: { pants: 0x2b4a7a } },
  khaki: { name: 'খাকি প্যান্ট', price: 700, kind: 'wear', wear: { pants: 0x8d7b4a } },
  capRed: { name: 'লাল ক্যাপ', price: 200, kind: 'wear', wear: { cap: 0xc62828 } },
  capBlack: { name: 'কালো ক্যাপ', price: 200, kind: 'wear', wear: { cap: 0x1b1b1b } },
  tupi: { name: 'সাদা টুপি', price: 80, kind: 'wear', wear: { cap: 0xf5f5f0, tupi: true } },
  shades: { name: 'সানগ্লাস', price: 350, kind: 'wear', wear: { glasses: true } },
  helmet: { name: 'হেলমেট (দুর্ঘটনায় কম চোট)', price: 1200, kind: 'wear', wear: { helmet: 0x1b1b1b } },
  oldClothes: { name: 'পুরনো জামায় ফিরুন', price: 0, kind: 'reset' },
  haircut: { name: 'চুল কাটা', price: 100, kind: 'salon', hp: 5 },
  shave: { name: 'দাড়ি শেভ', price: 50, kind: 'wear', wear: { beard: false } },
  beard: { name: 'দাড়ি রাখা (স্টাইল)', price: 150, kind: 'wear', wear: { beard: true } },
  hairColor: { name: 'চুলে মেহেদি রং', price: 300, kind: 'wear', wear: { hair: 0x7a3a12 } },
  vBike: { name: 'মোটরসাইকেল', price: 18000, kind: 'vehicle', type: 'bike' },
  vRick: { name: 'রিকশা', price: 9000, kind: 'vehicle', type: 'rickshaw' },
  vEasy: { name: 'ইজিবাইক', price: 25000, kind: 'vehicle', type: 'easybike' },
  vCng: { name: 'সিএনজি', price: 45000, kind: 'vehicle', type: 'cng' },
};
const HEADLINES = [
  'জ্যামে আটকে থাকা বাসে যাত্রীর জন্মদিন পালন', 'মিরপুরে বৃষ্টি: রাস্তায় নৌকা নামানোর দাবি', 'চায়ের দাম এক টাকা বাড়ায় মহল্লায় উত্তেজনা',
  'মেট্রোতে উঠে প্রথমবার সময়মতো অফিসে পৌঁছালেন কর্মকর্তা', 'রিকশাওয়ালার জ্ঞানে মুগ্ধ বিদেশি পর্যটক', 'বিদ্যুৎ গেল, এল, আবার গেল: দিনের সেরা খবর',
];
const STORY = ['গল্পে নায়ক জ্যাম পেরিয়ে সময়মতো বিয়েতে পৌঁছায়। বিশ্বাস হয় না!', 'ভূতের গল্প: রাত তিনটায় মিরপুর ১০-এ ফাঁকা রাস্তা!', 'রহস্য গল্প: চায়ের দোকানের বেঞ্চের নিচে কে রাখল চিঠি?'];

// ---------- দোকানের ধরন ----------
export const isFood = (n) => /হোটেল|রেস্টুরেন্ট|রেস্তোরাঁ|খাবার|বিরিয়ানি|ফ্রাই|কাবাব|ভাতের/.test(n || '');
export { shopType };
const SHOP_DEF = {
  grocery: { title: 'মুদি দোকান', hello: '"কী লাগবে ভাই? সব আছে।"', keeper: { shirt: 0xf5f5f0, pants: 0x1d4f8c, kurta: true }, goods: [0xc62828, 0xf2c230, 0x1565c0, 0x2e7d32, 0xff7a00, 0xf5f5f5], shelf: 0x8a6a4a, items: ['bread', 'biscuit', 'water', 'chips', 'cola', 'paper'] },
  pharmacy: { title: 'ফার্মেসি', hello: '"কী ওষুধ লাগবে? প্রেসক্রিপশন আছে?"', keeper: { shirt: 0xffffff, pants: 0x37474f }, goods: [0xffffff, 0x90caf9, 0xa5d6a7, 0xef9a9a, 0xfff59d], shelf: 0xf0f0f0, items: ['ors', 'painkiller', 'bandage', 'firstaid'] },
  cloth: { title: 'কাপড়ের দোকান', hello: '"আসেন, নতুন কালেকশন এসেছে!"', keeper: { shirt: 0x6a1b9a, pants: 0x212121 }, goods: [0xc62828, 0x2e7d32, 0x1d4f8c, 0xf2c230, 0xe0157a, 0xffffff, 0x1b1b1b], shelf: 0x5d4037, items: ['shRed', 'shGreen', 'shYellow', 'shBlack', 'panjabi', 'panjabiBlue', 'jeans', 'khaki', 'capRed', 'capBlack', 'tupi', 'shades', 'oldClothes'] },
  mobile: { title: 'মোবাইলের দোকান', hello: '"রিচার্জ নাকি নতুন সেট?"', keeper: { shirt: 0x1565c0, pants: 0x212121 }, goods: [0x111111, 0x263238, 0xe0157a, 0xffd400], shelf: 0xeceff1, items: ['rc50', 'rc100', 'rc300'] },
  sweets: { title: 'মিষ্টির দোকান', hello: '"গরম গরম রসগোল্লা, আজকেই বানানো!"', keeper: { shirt: 0xffffff, pants: 0x5d4037, cap: 0xffffff }, goods: [0xfff8e1, 0x8d5524, 0xffcc80, 0xffffff, 0xd84315], shelf: 0xd7ccc8, items: ['rosogolla', 'doi', 'jilapi', 'chomchom', 'singara'] },
  book: { title: 'বই ও ফটোকপি', hello: '"কোন ক্লাসের বই খুঁজছেন?"', keeper: { shirt: 0x8d6e63, pants: 0x3e2723, glasses: true }, goods: [0xc62828, 0x1565c0, 0x2e7d32, 0xf2c230, 0x6a1b9a, 0xff7a00], shelf: 0x6d4c41, items: ['notebook', 'story', 'paper'] },
  electronics: { title: 'ইলেকট্রনিক্স', hello: '"হেলমেটও রাখি, বাইক চালালে লাগবেই।"', keeper: { shirt: 0x37474f, pants: 0x212121 }, goods: [0x212121, 0x9e9e9e, 0x1565c0, 0xeceff1], shelf: 0x9e9e9e, items: ['helmet', 'torch'] },
  salon: { title: 'সেলুন', hello: '"বসেন ভাই, কেমনে কাটবেন?"', keeper: { shirt: 0xffffff, pants: 0x263238 }, goods: [0x80deea, 0xffffff], shelf: 0xeceff1, items: ['haircut', 'shave', 'beard', 'hairColor'] },
  motor: { title: 'মোটর শোরুম', hello: '"নগদ নাকি কিস্তি? টেস্ট রাইড ফ্রি!"', keeper: { shirt: 0xffffff, pants: 0x1b1b1b }, goods: [0xc62828, 0x1b1b1b], shelf: 0xbdbdbd, items: ['vBike', 'vRick', 'vEasy', 'vCng'] },
};

// ---------- ক্লাসের প্রশ্ন (সঠিক উত্তর প্রথমে; দেখানোর সময় এলোমেলো) ----------
const Q_SCHOOL = [
  ['৭ × ৮ = কত?', '৫৬', '৫৪', '৬৪'], ['৯ + ৬ = কত?', '১৫', '১৪', '১৬'], ['১২-এর অর্ধেক কত?', '৬', '৪', '৮'],
  ['বাংলাদেশের রাজধানী কোথায়?', 'ঢাকা', 'চট্টগ্রাম', 'খুলনা'], ['বাংলাদেশের জাতীয় ফুল কোনটি?', 'শাপলা', 'গোলাপ', 'শিউলি'],
  ['বাংলাদেশের জাতীয় পাখি কোনটি?', 'দোয়েল', 'ময়না', 'কাক'], ['বাংলাদেশের জাতীয় ফল কোনটি?', 'কাঁঠাল', 'আম', 'লিচু'],
  ['বিজয় দিবস কবে?', '১৬ ডিসেম্বর', '২৬ মার্চ', '২১ ফেব্রুয়ারি'], ['স্বাধীনতা দিবস কবে?', '২৬ মার্চ', '১৬ ডিসেম্বর', '১৪ এপ্রিল'],
  ['আন্তর্জাতিক মাতৃভাষা দিবস কবে?', '২১ ফেব্রুয়ারি', '২৬ মার্চ', '১ মে'], ['এক সপ্তাহে কত দিন?', '৭', '৫', '১০'],
  ['ত্রিভুজের কয়টি বাহু?', '৩', '৪', '৫'], ['সূর্য কোন দিকে ওঠে?', 'পূর্ব', 'পশ্চিম', 'উত্তর'], ['পানির রাসায়নিক সংকেত কী?', 'H₂O', 'CO₂', 'O₂'],
  ['১০০ সেন্টিমিটার = কত মিটার?', '১ মিটার', '১০ মিটার', '০.১ মিটার'], ['"আমার সোনার বাংলা" কে লিখেছেন?', 'রবীন্দ্রনাথ ঠাকুর', 'কাজী নজরুল ইসলাম', 'জসীমউদ্দীন'],
  ['বাংলাদেশের জাতীয় কবি কে?', 'কাজী নজরুল ইসলাম', 'রবীন্দ্রনাথ ঠাকুর', 'জীবনানন্দ দাশ'], ['পৃথিবী নিজ অক্ষে একবার ঘুরতে কত সময় নেয়?', 'প্রায় ২৪ ঘণ্টা', 'এক সপ্তাহ', 'এক বছর'],
];
const Q_MADRASA = [
  ['আরবি বর্ণমালায় কয়টি হরফ?', '২৮', '২৬', '৩০'], ['দৈনিক ফরজ নামাজ কত ওয়াক্ত?', '৫', '৩', '৭'], ['রমজান হিজরি সনের কততম মাস?', '৯ম', '১২তম', '১ম'],
  ['পবিত্র কুরআনে সূরা কয়টি?', '১১৪', '১১০', '৩০'], ['কুরআন শরিফ কয় পারা?', '৩০', '১১৪', '৪০'], ['কুরআনের প্রথম সূরা কোনটি?', 'সূরা ফাতিহা', 'সূরা বাকারা', 'সূরা ইখলাস'],
  ['ইসলামের মূল স্তম্ভ কয়টি?', '৫', '৪', '৬'], ['কুরআনের সবচেয়ে বড় সূরা কোনটি?', 'সূরা বাকারা', 'সূরা ফাতিহা', 'সূরা ইয়াসিন'],
  ['৮ × ৭ = কত?', '৫৬', '৬৪', '৪৮'], ['বাংলাদেশের রাজধানী কোথায়?', 'ঢাকা', 'রাজশাহী', 'সিলেট'],
];

// ---------- বোর্ডে চক দিয়ে লেখা ----------
function boardTex(lines) {
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#1f3d2b'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) c.fillRect(Math.random() * w, Math.random() * h, 30, 2);
    c.fillStyle = '#f4f4ec'; c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach((t, i) => { c.font = `${i ? 600 : 700} ${i ? 30 : 38}px ${FONT}`; c.fillText(t, 24, 46 + i * 52); });
  });
}

export class TownLife {
  constructor(g) {
    this.g = g;
    const I = (this.I = g.interiors), M = g.map;
    this.bag = {};
    this.outfit = {};
    this.phoneBal = 50;
    this.bank = 0;
    this.bankAcc = 0;
    this.load();
    // ঘর বানানো (শহর থেকে দূরে, x = 9000+)
    let idx = 6;
    this.shopRooms = {};
    for (const t of Object.keys(SHOP_DEF)) this.shopRooms[t] = I.rooms['shop_' + t] = this.buildShop(t, idx++);
    I.rooms.school = this.buildClass('school', idx++);
    I.rooms.madrasa = this.buildClass('madrasa', idx++);
    I.rooms.court = this.buildCourt(idx++);
    I.rooms.bank = this.buildBank(idx++);
    I.rooms.power = this.buildPower(idx++);
    I.rooms.post = this.buildPost(idx++);
    // দরজা: সব দোকান আর সরকারি-বেসরকারি ভবন
    this.fronts = [];
    for (const b of M.buildings) {
      if (!b.door || !b.name) continue;
      let kind = null;
      if (b.kind === 'shop') { b.shopType = b.civic === 'motor' ? 'motor' : shopType(b.name); kind = 'shop_' + b.shopType; }
      else if (b.kind === 'civic') kind = b.civic;
      if (!kind) continue;
      I.doors.push({ b, kind, name: b.name });
      this.fronts.push(b);
    }
    for (const d of I.doors) if (d.b && d.b.entry) this.fixEntry(d.b);
    // বাইরের মানুষ: দোকানদার, ক্রেতা, আসা-যাওয়া, দারোয়ান (কাছের দোকানগুলোতে, পুল থেকে)
    this.pool = { keeper: [], cust: [], walker: [], guard: [] };
    this.assignT = 0;
    this.walkers = [];
    this.grid = new Map();
    for (const b of this.fronts) { const k = Math.floor(b.door.x / 50) + ',' + Math.floor(b.door.z / 50); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(b); }
    if (this.outfit && Object.keys(this.outfit).length) g.player.setOutfit(this.outfit);
    // ডায়নামিক ইভেন্ট: মিছিল / অবরোধ
    this.evtCd = 28 + Math.random() * 22;
    this.michil = null;
    this.oborod = null;
  }

  // ট্রাফিক AI: সামনে মিছিল/অবরোধ থাকলে থামার কারণ
  roadHaltAhead(seg, x, z, fwd) {
    if (!seg) return null;
    const t = (x - seg.ax) * seg.dir.x + (z - seg.az) * seg.dir.z;
    const dir = fwd ? 1 : -1;
    if (this.michil && this.michil.seg === seg) {
      const d = (this.michil.t - t) * dir;
      if (d > -4 && d < 30) return 'michil';
    }
    if (this.oborod && this.oborod.seg === seg) {
      const o = this.oborod;
      const edge = fwd ? o.t0 : o.t1;
      const d = (edge - t) * dir;
      if (d > -4 && d < 34) return 'oborod';
      if (t >= o.t0 - 1 && t <= o.t1 + 1) return 'oborod';
    }
    return null;
  }
  // জ্যামের বাধা (obstacles তালিকায়)
  blockBodies() {
    const out = [];
    if (this.michil) for (const p of this.michil.people) out.push({ x: p.x, z: p.z, ped: true, r: 0.85, event: 'michil' });
    if (this.oborod) out.push({ x: this.oborod.cx, z: this.oborod.cz, r: this.oborod.r, event: 'oborod' });
    return out;
  }

  _pickEventSeg(minD = 70, maxD = 170) {
    const g = this.g, P = g.player, segs = g.map.segments.filter((s) => s.main && s.len > 40 && s.width >= 7 && !s.bridge);
    const near = [];
    for (const s of segs) {
      const t = s.len * (0.3 + Math.random() * 0.4);
      const x = s.ax + s.dir.x * t, z = s.az + s.dir.z * t;
      const d = Math.hypot(x - P.pos.x, z - P.pos.z);
      if (d >= minD && d <= maxD && g.map.lakeDist(x, z) > 2) near.push({ s, t, x, z, d });
    }
    if (!near.length) return null;
    return near[Math.floor(Math.random() * near.length)];
  }

  spawnMichil() {
    const pickS = this._pickEventSeg(75, 160);
    if (!pickS) return;
    const g = this.g, { s, t } = pickS;
    const slogans = ['ভোট দিন', 'ন্যায় চাই', 'জনতার মিছিল', 'দাবি মানতে হবে', 'গণতন্ত্র রক্ষা করো'];
    const people = [];
    const N = 12 + (Math.random() * 8 | 0);
    const span = Math.min(22, s.len * 0.25);
    for (let i = 0; i < N; i++) {
      const tt = clamp(t - span * 0.35 + (i / N) * span, 1, s.len - 1);
      const lat = ((i % 3) - 1) * 1.15;
      const x = s.ax + s.dir.x * tt - s.dir.z * lat, z = s.az + s.dir.z * tt + s.dir.x * lat;
      const rig = makeRig({ real: true, shirt: pick([0xc62828, 0x1565c0, 0xf5f5f0, 0x2e7d32, 0xffc107]), kurta: Math.random() < 0.45 });
      g.scene.add(rig.root);
      if (i % 3 === 0) {
        const ban = new THREE.Mesh(planeGeo(1.15, 0.7), texMat(signTex(pick(slogans), 'road'), { side: THREE.DoubleSide }));
        ban.position.set(0.15, 1.55, 0.25); ban.userData.noShadow = true; rig.root.add(ban);
      } else if (i % 3 === 1) {
        const flag = new THREE.Mesh(planeGeo(0.55, 0.9), new THREE.MeshLambertMaterial({ color: pick([0xc62828, 0x1565c0, 0x2e7d32]), side: THREE.DoubleSide }));
        flag.position.set(0.35, 1.7, 0.1); flag.userData.noShadow = true; rig.root.add(flag);
        addCyl(rig.root, 0.02, 0.02, 1.6, lam(0x5d4037), 0.35, 1.0, 0.05, 5);
      }
      people.push({ rig, t: tt, lat, x, z, speed: rand(0.85, 1.15) });
    }
    this.michil = { seg: s, t, span, people, life: 48 + Math.random() * 25, dir: 1 };
    s.michil = this.michil;
    if (g.ui && g.ui.toast) g.ui.toast('রাস্তায় মিছিল — যানজট!', 'warn');
  }

  tickMichil(dt) {
    const m = this.michil, s = m.seg;
    m.life -= dt;
    m.t += m.dir * 1.05 * dt;
    if (m.t > s.len - 8 || m.t < 8) m.dir *= -1;
    for (let i = 0; i < m.people.length; i++) {
      const p = m.people[i];
      p.t = clamp(m.t - m.span * 0.35 + (i / m.people.length) * m.span, 1, s.len - 1);
      p.x = s.ax + s.dir.x * p.t - s.dir.z * p.lat;
      p.z = s.az + s.dir.z * p.t + s.dir.x * p.lat;
      p.rig.root.position.set(p.x, 0.16, p.z);
      p.rig.root.rotation.y = Math.atan2(-s.dir.x * m.dir, -s.dir.z * m.dir);
      setPose(p.rig, 'walk', dt, p.speed, 8);
    }
    if (m.life > 0) return;
    for (const p of m.people) {
      if (p.rig.root.parent) p.rig.root.parent.remove(p.rig.root);
      if (p.rig.dispose) p.rig.dispose();
    }
    delete s.michil;
    this.michil = null;
  }

  spawnOborod() {
    const pickS = this._pickEventSeg(80, 155);
    if (!pickS) return;
    const g = this.g, { s, t, x, z } = pickS;
    const Lz = 7 + Math.random() * 4, t0 = clamp(t - Lz / 2, 2, s.len - Lz - 2), t1 = t0 + Lz;
    const grp = new THREE.Group();
    const yaw = Math.atan2(s.dir.x, s.dir.z);
    const nx = -s.dir.z, nz = s.dir.x, hw = s.width / 2 - 0.4;
    const wood = lam(0x6d4c41), tire = lam(0x1a1a1a), bar = lam(0xc62828);
    for (let i = 0; i < 5; i++) {
      const tt = t0 + 0.8 + i * ((Lz - 1.6) / 4), lat = ((i % 2) ? 1 : -1) * (hw * 0.35);
      const bx = s.ax + s.dir.x * tt + nx * lat, bz = s.az + s.dir.z * tt + nz * lat;
      addBox(grp, 1.6, 0.35, 0.25, bar, bx, 0.45, bz).rotation.y = yaw;
      addBox(grp, 0.08, 1.0, 0.08, wood, bx - nx * 0.7, 0.5, bz - nz * 0.7);
      addBox(grp, 0.08, 1.0, 0.08, wood, bx + nx * 0.7, 0.5, bz + nz * 0.7);
    }
    const tires = [];
    for (let i = 0; i < 4; i++) {
      const tt = t0 + 1.5 + i * 1.2, lat = (i - 1.5) * 0.9;
      const tx = s.ax + s.dir.x * tt + nx * lat, tz = s.az + s.dir.z * tt + nz * lat;
      const m = addCyl(grp, 0.38, 0.38, 0.28, tire, tx, 0.22, tz, 10);
      m.rotation.x = Math.PI / 2; tires.push({ x: tx, z: tz });
    }
    g.scene.add(grp);
    const poly = [
      [s.ax + s.dir.x * t0 + nx * hw, s.az + s.dir.z * t0 + nz * hw],
      [s.ax + s.dir.x * t1 + nx * hw, s.az + s.dir.z * t1 + nz * hw],
      [s.ax + s.dir.x * t1 - nx * hw, s.az + s.dir.z * t1 - nz * hw],
      [s.ax + s.dir.x * t0 - nx * hw, s.az + s.dir.z * t0 - nz * hw],
    ];
    const col = g.world.addPoly(poly, 1.35, 'oborod');
    this.oborod = { seg: s, t0, t1, cx: x, cz: z, r: Lz * 0.55 + hw * 0.4, grp, col, tires, life: 42 + Math.random() * 28, smokeT: 0 };
    s.oborod = this.oborod;
    if (g.ui && g.ui.toast) g.ui.toast('অবরোধ — রাস্তা বন্ধ!', 'bad');
  }

  tickOborod(dt) {
    const o = this.oborod, g = this.g;
    o.life -= dt;
    o.smokeT -= dt;
    if (o.smokeT <= 0 && g.vfx) {
      o.smokeT = 0.35;
      for (const t of o.tires) {
        if (Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) > 90) continue;
        g.vfx.emit('fire', t.x, 0.4, t.z, 0xff8020, { scale: 0.7 });
        g.vfx.emit('smoke', t.x, 0.9, t.z, 0x303030, { scale: 1.1 });
      }
    }
    if (o.life > 0) return;
    g.scene.remove(o.grp);
    if (o.col) o.col.h = -1;
    delete o.seg.oborod;
    this.oborod = null;
  }

  updateEvents(dt) {
    if (this.michil) this.tickMichil(dt);
    if (this.oborod) this.tickOborod(dt);
    this.evtCd -= dt;
    if (this.evtCd > 0 || this.michil || this.oborod || this.g.inside) return;
    this.evtCd = 50 + Math.random() * 45;
    if (Math.random() < 0.58) this.spawnMichil();
    else this.spawnOborod();
  }
  // রাস্তার সাজের ছোট দোকানগুলোও আসল দোকান: দরজা, দোকানদার, ভিতরে কেনাকাটা
  addFront(b) {
    if (!this.fixEntry(b)) return;
    b.door = { x: b.entry.x, z: b.entry.z };
    const food = isFood(b.name);
    b.shopType = food ? 'rest' : shopType(b.name);
    this.I.doors.push({ b, kind: food ? 'rest' : 'shop_' + b.shopType, name: b.name });
    this.fronts.push(b);
    const k = Math.floor(b.door.x / 50) + ',' + Math.floor(b.door.z / 50);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(b);
  }
  // দরজার মুখ যেন অন্য বিল্ডিংয়ের ভিতরে না পড়ে (বের হওয়ার জায়গাসহ); না মিললে রাস্তার কিনারার দরজাই থাকে
  fixEntry(b) {
    const e = b.entry, W = this.g.world;
    if (!e) return true;
    const fx = e.x - e.nx * 0.9, fz = e.z - e.nz * 0.9; // দেয়ালের মাঝ
    for (const k of [0.9, 1.3, 1.8, 2.4]) {
      const x = fx + e.nx * k, z = fz + e.nz * k;
      if (!W.blocked(x, 1, z) && !W.blocked(x + e.nx * 0.6, 1, z + e.nz * 0.6)) { e.x = x; e.z = z; return true; }
    }
    if (b.side) return false;
    delete b.entry;
    return true;
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('sp_life') || 'null');
      if (s) { this.bag = s.bag || {}; this.outfit = s.outfit || {}; this.phoneBal = s.phone ?? 50; this.bank = s.bank || 0; if (s.record) this.g.law.record = s.record; }
    } catch (e) { /* না থাকলে নতুন */ }
  }
  save() {
    try { localStorage.setItem('sp_life', JSON.stringify({ bag: this.bag, outfit: this.outfit, phone: this.phoneBal, bank: Math.round(this.bank), record: this.g.law.record })); } catch (e) { /* ঠিক আছে */ }
  }

  // ================= ঘর বানানো =================
  shelfRow(r, x0, x1, z, y0, rows, colors, depth = 0.5, along = 'x') {
    for (let i = 0; i < rows; i++) {
      const y = y0 + i * 0.75;
      if (along === 'x') r.box(x1 - x0, 0.05, depth, r.shelfCol, (x0 + x1) / 2, y, z);
      else r.box(depth, 0.05, x1 - x0, r.shelfCol, z, y, (x0 + x1) / 2);
      for (let p = x0 + 0.3; p < x1 - 0.2; p += 0.62) {
        if (Math.random() < 0.15) continue;
        const h = 0.25 + Math.random() * 0.3, c = pick(colors);
        if (along === 'x') r.box(0.4, h, depth * 0.7, c, p, y + h / 2 + 0.03, z);
        else r.box(depth * 0.7, h, 0.4, c, z, y + h / 2 + 0.03, p);
      }
    }
  }
  buildShop(type, idx) {
    const g = this.g, D = SHOP_DEF[type];
    const r = new Room(g, 'shop', idx, 16, 12);
    r.shelfCol = D.shelf;
    r.box(5.2, 1.0, 0.8, 0x6d4c41, 0, 0.5, -2.4, true);
    r.box(5.3, 0.06, 0.9, 0xe8dcc4, 0, 1.03, -2.4);
    r.keeper = r.person(D.keeper, 0, -3.3, Math.PI, 'idle');
    if (type !== 'motor' && type !== 'salon') {
      this.shelfRow(r, -7, 7, -5.6, 0.5, 4, D.goods);
      this.shelfRow(r, -5, 3.5, -7.4, 0.5, 3, D.goods, 0.5, 'z');
      this.shelfRow(r, -5, 3.5, 7.4, 0.5, 3, D.goods, 0.5, 'z');
    }
    if (type === 'pharmacy') { r.box(0.25, 1.0, 0.1, 0x2e7d32, -5.5, 3.3, -5.9); r.box(1.0, 0.25, 0.1, 0x2e7d32, -5.5, 3.3, -5.9); }
    if (type === 'grocery') for (let i = 0; i < 5; i++) r.box(0.7, 0.8, 0.5, 0xd7c49e, -6 + i * 0.85, 0.4, 3.5, true);
    if (type === 'cloth') for (const z of [-0.5, 2.5]) { r.box(5, 0.05, 0.05, 0x9e9e9e, -3, 1.9, z); for (let x = -5.2; x < -0.8; x += 0.5) r.box(0.42, 0.75, 0.05, pick(D.goods), x, 1.45, z); }
    if (type === 'mobile') { r.box(3, 1.0, 0.8, 0xb3e5fc, 4.5, 0.5, 0.5, true); for (let i = 0; i < 6; i++) r.box(0.18, 0.02, 0.32, 0x111111, 3.4 + i * 0.42, 1.02, 0.5); }
    if (type === 'sweets') { r.box(4, 1.0, 0.9, 0xfff3e0, 4, 0.5, 0.2, true); for (let i = 0; i < 18; i++) r.box(0.14, 0.12, 0.14, pick(D.goods), 2.4 + (i % 9) * 0.38, 1.07, -0.05 + Math.floor(i / 9) * 0.4); }
    if (type === 'book') r.box(1.2, 1.1, 0.8, 0x9e9e9e, 5, 0.55, 2, true);
    if (type === 'electronics') for (let i = 0; i < 4; i++) { r.box(1.2, 0.75, 0.08, 0x111111, -5 + i * 1.6, 2.1, -5.85); r.box(1.05, 0.6, 0.02, 0x4fc3f7, -5 + i * 1.6, 2.1, -5.8, false, true); }
    if (type === 'salon') {
      for (const x of [-3.5, 3.5]) { r.box(1.0, 0.5, 1.0, 0xc62828, x, 0.6, -4.5, true); r.box(1.6, 1.2, 0.05, 0x80deea, x, 2.1, -5.9, false, true); }
      r.person({ shirt: 0x90a4ae }, -3.5, -4.4, Math.PI, 'sit', 0.85);
      r.person({ shirt: 0xffffff, pants: 0x263238 }, -2.8, -3.8, -Math.PI / 2, 'swing');
    }
    if (type === 'motor') {
      for (const [t, x, z, ry] of [['bike', -4, -4, 0.6], ['rickshaw', 0.5, -4.6, 0], ['easybike', 4.5, -3.8, -0.5], ['cng', -4.5, 2.5, 1.2]]) {
        try { const v = new Vehicle(g.scene, t, { x: r.X + x, z: r.Z + z, yaw: ry }); v.sync(0); } catch (e) { /* মডেল না হলে থাক */ }
      }
    }
    // ক্রেতা
    for (let i = 0; i < (type === 'motor' ? 1 : 2); i++) r.person({ shirt: pick([0x1565c0, 0x2e7d32, 0xef6c00, 0x6a1b9a]), female: Math.random() < 0.4, skirt: pick([0xc2185b, 0x00897b]) }, -1.2 + i * 2.2, -1.2, 0, i ? 'idle' : 'phone');
    r.signMesh = r.sign(D.title, null, 0, 3.2, -5.95, 6);
    r.spots.push({ x: 0, z: -1.2, r: 1.8, label: 'কাউন্টারে কেনাকাটা', fn: (d) => this.shopDialog(type, d) });
    r.onEnter = (d) => {
      r.signMesh.material = texMat(signTex(d.name, null));
      if (Math.random() < 0.7) this.g.say(r.keeper.rig.root, 'দোকানদার', D.hello.replace(/"/g, ''), 2.5);
    };
    return r;
  }
  buildClass(kind, idx) {
    const g = this.g, mad = kind === 'madrasa';
    const r = new Room(g, kind, idx, 20, 16);
    r.box(7, 2.4, 0.1, 0x1f3d2b, 0, 2.1, -7.8);
    r.board = new THREE.Mesh(planeGeo(6.6, 2.1), texMat(boardTex(mad ? ['আজকের সবক', 'আলিফ, বা, তা, ছা...', 'সবাই মন দিয়ে পড়ো'] : ['আজকের পড়া: গুণ ও ভাগ', '৭ × ৮ = ৫৬', '৬৩ ÷ ৯ = ৭'])));
    r.board.position.set(0, 2.1, -7.74);
    r.grp.add(r.board);
    r.box(2.2, 0.85, 0.9, 0x6d4c41, 0, 0.42, -5.6, true);
    r.teacher = r.person(mad ? { shirt: 0xf5f5f0, kurta: true, cap: 0xf5f5f0, tupi: true, beard: true, pants: 0xf5f5f0 } : { shirt: 0xbcaaa4, pants: 0x3e2723, glasses: true }, 0, -6.5, Math.PI, 'wave');
    // ছাত্রছাত্রী
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const x = -5.5 + col * 5.5, z = -2.8 + row * 2.4;
      if (mad) {
        r.box(3.4, 0.03, 1.3, 0x8d6e63, x, 0.02, z); // মাদুর
        for (const dx of [-0.8, 0.8]) { r.box(0.5, 0.3, 0.35, 0x8d5524, x + dx, 0.2, z - 0.45); r.person({ shirt: 0xf5f5f0, kurta: true, cap: 0xf5f5f0, tupi: true, pants: 0xf5f5f0, height: 0.84, age: 'young', beard: false, mustache: false }, x + dx, z + 0.1, 0, 'sit', 0.25); }
      } else {
        r.box(3.4, 0.08, 0.6, 0x8d6e63, x, 0.75, z - 0.5, true);
        r.box(3.4, 0.45, 0.4, 0x6d4c41, x, 0.23, z + 0.1);
        for (const dx of [-0.8, 0.8]) {
          const girl = (row + col + (dx > 0 ? 1 : 0)) % 2 === 0;
          r.person(girl ? { female: true, school: true, height: 0.82, age: 'young' } : { school: true, height: 0.84, age: 'young', beard: false, mustache: false }, x + dx, z + 0.15, 0, 'sit', 0.45);
        }
      }
    }
    // ক্যান্টিন
    r.box(3, 1.0, 0.8, 0x8b5a2b, 8, 0.5, 5.5, true);
    r.canteen = r.person({ shirt: 0xffffff, cap: 0xffffff }, 8, 6.4, 0, 'idle');
    r.signMesh = r.sign(mad ? 'মাদ্রাসা' : 'বিদ্যালয়', 'road', 0, 3.6, -7.7, 7);
    r.spots.push({ x: 0, z: -4.6, r: 1.6, label: mad ? 'উস্তাদের জায়গায়: শিক্ষকের চাকরি (ক্লাস নিন)' : 'শিক্ষকের চাকরি: ক্লাস নিন', fn: (d) => this.startClass(kind, d) });
    r.spots.push({ x: 8, z: 4.6, r: 1.6, label: 'ক্যান্টিন: নাস্তা কিনুন', fn: () => this.sellDialog('ক্যান্টিন', '"চা-সিঙ্গারা গরম আছে।"', ['tea', 'singara', 'biscuit', 'water']) });
    r.onEnter = (d) => { r.signMesh.material = texMat(signTex(d.name, 'road')); };
    return r;
  }
  buildCourt(idx) {
    const g = this.g, r = new Room(g, 'court', idx, 22, 16);
    r.box(8, 1.4, 1.4, 0x4e342e, 0, 0.7, -6, true); // বিচারকের ডেস্ক (উঁচু)
    r.box(8.4, 0.5, 2.6, 0x5d4037, 0, 0.25, -6.4, true);
    r.judge = r.person({ shirt: 0x111111, pants: 0x111111, glasses: true }, 0, -6.9, Math.PI, 'idle', 0);
    r.judge.rig.root.position.y = 0.66;
    r.box(3, 0.9, 0.8, 0x6d4c41, -5, 0.45, -2.6, true); // পেশকারের টেবিল
    r.peshkar = r.person({ shirt: 0xf5f5f0, pants: 0x37474f }, -5, -3.4, Math.PI, 'drive', 0.5);
    // কাঠগড়া
    for (const [w, d2, x, z] of [[1.8, 0.08, 6, -2], [0.08, 1.6, 5.1, -2.8], [0.08, 1.6, 6.9, -2.8]]) r.box(w, 1.1, d2, 0x5d4037, x, 0.55, z, true);
    r.person({ shirt: 0x8d6e63, kurta: true }, 6, -2.8, Math.PI / 2, 'angry');
    // উকিল (কালো কোট, সাদা কলার)
    r.lawyer = r.person({ shirt: 0x111111, pants: 0x111111 }, 2.5, -2.2, Math.PI, 'wave');
    r.person({ shirt: 0x111111, pants: 0x111111 }, -2, -1.4, 0, 'phone');
    r.person({ shirt: 0x34507a, pants: 0x1c2333, cap: 0x1c2b4a }, 9.6, -4, -Math.PI / 2, 'idle');
    for (let row = 0; row < 3; row++) {
      r.box(14, 0.45, 0.6, 0x6d4c41, 0, 0.22, 1.5 + row * 1.8, true);
      for (let i = 0; i < 4; i++) if (Math.random() < 0.7) r.person({ shirt: pick([0x6d4c41, 0x1565c0, 0x2e7d32, 0xbdbdbd]), female: Math.random() < 0.3, skirt: 0x5e35b1 }, -6 + i * 4 + rand(-0.5, 0.5), 1.5 + row * 1.8, Math.PI, 'sit', 0.45);
    }
    r.sign('মিরপুর চৌকি আদালত', 'road', 0, 3.4, -7.8, 7);
    r.spots.push({ x: -5, z: -1.6, r: 1.8, label: 'পেশকার: মামলা মেটান', fn: () => this.courtDialog() });
    r.spots.push({ x: 2.5, z: -1.0, r: 1.5, label: 'উকিলের সাথে কথা বলুন', fn: () => this.lawyerDialog() });
    return r;
  }
  buildBank(idx) {
    const g = this.g, r = new Room(g, 'bank', idx, 22, 16);
    for (const x of [-6, -2, 2, 6]) {
      r.box(3.2, 1.1, 0.8, 0x37474f, x, 0.55, -3, true);
      r.box(3.2, 1.1, 0.05, 0xb3e5fc, x, 1.65, -2.8, false, true);
      r.person({ shirt: pick([0xffffff, 0xbbdefb]), pants: 0x263238, female: x > 0 && x < 4, skirt: 0x283593, orna: 0x9fa8da }, x, -3.9, Math.PI, 'drive', 0.5);
    }
    for (let i = 0; i < 3; i++) r.person({ shirt: pick([0x6d4c41, 0x1565c0, 0x2e7d32]) }, -2, -1.6 + i * 1.0, 0, i ? 'idle' : 'phone');
    r.box(4, 0.45, 1, 0x5d4037, -7, 0.22, 4.5, true);
    r.person({ shirt: 0x9e9e9e }, -7.5, 4.5, Math.PI, 'sit', 0.45);
    r.box(2.2, 0.8, 1.0, 0x5d4037, 7, 0.4, 3.5, true);
    r.manager = r.person({ shirt: 0x263238, pants: 0x212121, glasses: true }, 7, 2.6, 0, 'phone', 0.5);
    const guard = r.person({ shirt: 0x8d7b4a, pants: 0x5d4e2e, cap: 0x5d4e2e }, 9.5, 6, -Math.PI / 2, 'idle');
    giveGun(guard.rig, true);
    r.guard = guard;
    r.box(2.4, 2.6, 0.25, 0x78909c, 0, 1.3, -7.75, true); // ভল্টের দরজা
    r.box(0.5, 0.5, 0.1, 0xb0bec5, 0.6, 1.4, -7.6, false);
    r.signMesh = r.sign('ব্যাংক', 'road', 0, 3.4, -7.8, 7);
    r.spots.push({ x: -2, z: -1.8, r: 2.0, label: 'ক্যাশ কাউন্টার: টাকা জমা / তোলা', fn: (d) => this.bankDialog(d) });
    r.spots.push({ x: 7, z: 1.8, r: 1.6, label: 'ম্যানেজার: ক্যাশিয়ারের কাজ', fn: () => this.startCashier() });
    r.onEnter = (d) => { r.signMesh.material = texMat(signTex(d.name, 'road')); this.accrue(); };
    return r;
  }
  buildPower(idx) {
    const g = this.g, r = new Room(g, 'power', idx, 20, 14);
    for (const x of [-4, 0, 4]) { r.box(3, 1.1, 0.8, 0x8d6e63, x, 0.55, -3, true); r.person({ shirt: pick([0xbcaaa4, 0xcfd8dc]), pants: 0x37474f }, x, -3.9, Math.PI, 'drive', 0.5); }
    for (let i = 0; i < 2; i++) { r.box(6, 0.45, 0.6, 0x5d4037, -2, 0.22, 2 + i * 2, true); for (let k = 0; k < 3; k++) r.person({ shirt: pick([0x6d4c41, 0x2e7d32, 0x1565c0]), female: Math.random() < 0.3, skirt: 0x8e24aa }, -4 + k * 2, 2 + i * 2, Math.PI, 'sit', 0.45); }
    r.person({ shirt: 0x1565c0, pants: 0x212121, helmet: 0xffd400 }, 7, 3, -Math.PI / 2, 'idle');
    r.sign('বিদ্যুৎ বিতরণ অফিস', 'road', 0, 3.4, -6.8, 7);
    r.spots.push({ x: 0, z: -1.8, r: 2.0, label: 'কাউন্টার: মিটার পড়ার কাজ / অভিযোগ', fn: (d) => this.powerDialog(d) });
    return r;
  }
  buildPost(idx) {
    const g = this.g, r = new Room(g, 'post', idx, 18, 14);
    r.box(6, 1.1, 0.8, 0xc62828, 0, 0.55, -2.8, true);
    r.person({ shirt: 0xffecb3, pants: 0x5d4037 }, -1.5, -3.7, Math.PI, 'drive', 0.5);
    r.person({ shirt: 0xffecb3, pants: 0x5d4037, glasses: true }, 1.5, -3.7, Math.PI, 'phone', 0.5);
    for (let x = -6; x <= 6; x += 1.5) r.box(1.3, 2.4, 0.5, 0x8d6e63, x, 1.2, -6.5);
    for (let i = 0; i < 4; i++) r.box(0.6, 0.7, 0.6, 0xbcaaa4, 5 + (i % 2) * 0.7, 0.35 + Math.floor(i / 2) * 0.7, 2);
    r.postman = r.person({ shirt: 0x8d7b4a, pants: 0x5d4e2e, cap: 0x8d7b4a, bag: 0x6d4c41 }, -5, 1.5, Math.PI / 2, 'idle');
    r.sign('মিরপুর ডাকঘর', 'road', 0, 3.4, -6.8, 6);
    r.spots.push({ x: 0, z: -1.7, r: 2.0, label: 'কাউন্টার: ডাকপিয়নের কাজ / পার্সেল পাঠান', fn: (d) => this.postDialog(d) });
    return r;
  }

  // ================= কেনাকাটা আর ব্যাগ =================
  shopDialog(type, d) {
    const D = SHOP_DEF[type];
    this.sellDialog(d.name, D.hello, D.items, d);
  }
  sellDialog(title, hello, ids, d) {
    const I = this.I;
    const items = ids.map((id) => {
      const it = ITEMS[id];
      const note = it.kind === 'food' || it.kind === 'med' ? `+${bn(it.hp)} স্বাস্থ্য · ব্যাগে রাখা হবে (B)` : it.kind === 'wear' ? 'এখনই পরে নেবেন' : it.kind === 'recharge' ? `ফোনে ব্যালেন্স এখন ৳${bnGroup(this.phoneBal)}` : it.kind === 'vehicle' ? 'দোকানের সামনে রেখে দেবে' : it.note || '';
      return { label: it.name, note, price: it.price || undefined, keep: it.kind !== 'vehicle', act: () => this.buy(id, d) };
    });
    I.dialog(title, hello, items);
  }
  buy(id, d) {
    const g = this.g, it = ITEMS[id];
    if (it.price && !g.spend(it.price, it.name)) return;
    if (it.price) g.sound.money();
    if (it.kind === 'food' || it.kind === 'med' || it.kind === 'tool' || it.kind === 'read') {
      this.bag[id] = (this.bag[id] || 0) + 1;
      g.ui.toast(`${it.name} কিনে ব্যাগে রাখলেন${it.hp ? ' · খেতে/ব্যবহার করতে B' : ''}`, 'good');
    } else if (it.kind === 'wear') {
      Object.assign(this.outfit, it.wear);
      for (const k of Object.keys(this.outfit)) if (this.outfit[k] === false) delete this.outfit[k];
      g.player.setOutfit(this.outfit);
      g.ui.toast(`${it.name} পরলেন`, 'good');
    } else if (it.kind === 'reset') {
      this.outfit = {};
      g.player.setOutfit({});
      g.ui.toast('পুরনো জামা পরলেন', '');
    } else if (it.kind === 'salon') {
      g.player.health = Math.min(100, g.player.health + (it.hp || 0));
      g.ui.toast('চুল কাটা হলো, একদম ফ্রেশ লাগছে!', 'good');
    } else if (it.kind === 'recharge') {
      this.phoneBal += it.amt;
      g.ui.toast(`রিচার্জ হলো! ফোনে ব্যালেন্স ৳${bnGroup(this.phoneBal)}`, 'good');
    } else if (it.kind === 'paper') {
      g.ui.toast(`আজকের শিরোনাম: "${pick(HEADLINES)}"`, '');
    } else if (it.kind === 'vehicle') {
      const b = d.b, f = b.face;
      const x = b.door.x + f.x * 4.5, z = b.door.z + f.z * 4.5;
      const v = new Vehicle(g.scene, it.type, { x, z, yaw: Math.atan2(-f.z, f.x), dynWheels: true, owned: true });
      g.vehicles.push(v);
      this.I.exit();
      g.ui.toast(`নতুন ${it.name} কিনলেন! দোকানের সামনে রাখা আছে`, 'good');
    }
    this.save();
  }
  openBag() {
    const g = this.g, I = this.I;
    if (g.state !== 'play') return;
    const ids = Object.keys(this.bag).filter((k) => this.bag[k] > 0 && ITEMS[k]);
    const items = ids.map((id) => {
      const it = ITEMS[id];
      return { label: `${it.name} × ${bn(this.bag[id])}`, note: it.hp ? `+${bn(it.hp)} স্বাস্থ্য` : it.note || '', keep: true, act: () => this.useItem(id) };
    });
    const sub = `ফোনে ব্যালেন্স ৳${bnGroup(this.phoneBal)} · ব্যাংকে ৳${bnGroup(Math.round(this.bank))}${g.law.record.length ? ` · না মেটানো মামলা ${bn(g.law.record.length)}টি` : ''}`;
    if (!items.length) items.push({ label: 'ব্যাগ খালি', note: 'দোকান থেকে খাবার, ওষুধ, বই কিনলে এখানে থাকে', act: () => {} });
    I.dialog('ব্যাগ', sub, items);
  }
  useItem(id) {
    const g = this.g, it = ITEMS[id];
    if (!this.bag[id]) return;
    if (it.kind === 'tool') { g.ui.toast(`${it.name}: ${it.note || 'ব্যাগে আছে'}`, ''); return; }
    this.bag[id]--;
    if (it.kind === 'read') g.ui.toast(pick(STORY), '');
    else g.ui.toast(`${it.name} ${it.kind === 'med' ? 'নিলেন' : 'খেলেন'}: +${bn(it.hp)} স্বাস্থ্য`, 'good');
    g.player.health = Math.min(100, g.player.health + (it.hp || 0));
    this.save();
    this.openBag();
  }

  // ================= স্কুল-মাদ্রাসা: শিক্ষকের চাকরি =================
  startClass(kind, d) {
    const g = this.g;
    if (this.classCool > 0) { g.ui.toast(`পরের ক্লাস ${bn(Math.ceil(this.classCool))} সেকেন্ড পরে`, ''); return; }
    const bank = kind === 'madrasa' ? Q_MADRASA : Q_SCHOOL;
    const qs = [...bank].sort(() => Math.random() - 0.5).slice(0, 5);
    this.cls = { kind, qs, i: 0, ok: 0, pay: 0, bonus: (this.bag.notebook || 0) > 0, d };
    this.askQ();
  }
  askQ() {
    const C = this.cls, g = this.g;
    if (C.i >= C.qs.length) {
      const bonus = C.bonus ? Math.round(C.pay * 0.5) : 0;
      if (C.pay + bonus) g.addMoney(C.pay + bonus);
      this.cls = null;
      this.classCool = 45;
      this.I.closeDialog();
      g.ui.toast(`ক্লাস শেষ! ${bn(C.ok)}/৫ সঠিক · আয় ৳${bnGroup(C.pay + bonus)}${bonus ? ' (খাতা-কলমের বোনাস সহ)' : ''}`, C.ok >= 3 ? 'good' : '');
      return;
    }
    const [q, a, ...wrong] = C.qs[C.i];
    const opts = [a, ...wrong].sort(() => Math.random() - 0.5);
    this.I.dialog(`ক্লাস নিন (${bn(C.i + 1)}/৫)`, `ছাত্রছাত্রীদের প্রশ্ন: ${q}`, opts.map((o) => ({ label: o, keep: true, act: () => this.answer(o === a, a) })));
  }
  answer(ok, a) {
    const C = this.cls, g = this.g;
    if (!C) return;
    C.i++;
    if (ok) { C.ok++; C.pay += 100; g.sound.ping(); g.ui.toast('সঠিক! ছাত্রছাত্রীরা হাততালি দিল: +৳১০০', 'good'); }
    else { g.ui.toast(`ভুল! সঠিক উত্তর: ${a}। পেছনের বেঞ্চে হাসাহাসি`, 'bad'); }
    this.askQ();
  }

  // ================= আদালত =================
  courtDialog() {
    const g = this.g, rec = g.law.record;
    if (!rec.length) { this.I.dialog('পেশকার', '"আপনার নামে কোনো মামলা নেই। সাক্ষী দিতে এসেছেন নাকি?"', [{ label: 'ঠিক আছে', act: () => {} }]); return; }
    const k = this.lawyer ? 0.5 : 1;
    const total = rec.reduce((s, c) => s + Math.round((c.fine * k) / 10) * 10, 0);
    const items = rec.map((c, i) => ({ label: `মামলা ${bn(i + 1)}: ${c.names.join(', ')}`, price: Math.round((c.fine * k) / 10) * 10, act: () => this.payCase(i) }));
    items.push({ label: `সব মামলা একসাথে মেটান${this.lawyer ? ' (উকিলের কারণে অর্ধেক)' : ''}`, price: total, act: () => this.payAll(total) });
    this.I.dialog('পেশকার', `"জরিমানা দিলে মামলা নিষ্পত্তি। ${this.lawyer ? 'উকিল সাহেব আছেন, জরিমানা অর্ধেক।' : 'উকিল নিলে জরিমানা কমে।'}"`, items);
  }
  payCase(i) {
    const g = this.g, c = g.law.record[i];
    if (!c) return;
    const fine = Math.round((c.fine * (this.lawyer ? 0.5 : 1)) / 10) * 10;
    if (!g.spend(fine, 'জরিমানা')) return;
    g.law.record.splice(i, 1);
    g.sound.money();
    g.ui.toast(`মামলা নিষ্পত্তি হলো: −৳${bnGroup(fine)}`, 'good');
    this.save();
  }
  payAll(total) {
    const g = this.g;
    if (!g.spend(total, 'জরিমানা')) return;
    g.law.record = [];
    g.sound.money();
    g.ui.toast(`সব মামলা নিষ্পত্তি! এখন আর পুলিশ চিনে ধরবে না (−৳${bnGroup(total)})`, 'good');
    this.save();
  }
  lawyerDialog() {
    const g = this.g;
    if (this.lawyer) { this.I.dialog('উকিল সাহেব', '"আমি তো আছি, পেশকারের কাছে যান।"', [{ label: 'ঠিক আছে', act: () => {} }]); return; }
    this.I.dialog('উকিল সাহেব', '"আমাকে নিলে জরিমানা অর্ধেক করে দেব। ফি ৳২০০।"', [
      { label: 'উকিল নিন', price: 200, act: () => { if (!g.spend(200, 'উকিলের ফি')) return; this.lawyer = true; g.sound.money(); g.ui.toast('উকিল নিলেন: এবার জরিমানা অর্ধেক', 'good'); } },
      { label: 'লাগবে না', act: () => {} },
    ]);
  }

  // ================= ব্যাংক =================
  accrue() {
    // খেলার প্রতি দিনে (২৪ মিনিট) ২% সুদ
    if (this.bank > 0 && this.bankAcc > 0) { this.bank *= Math.pow(1.02, this.bankAcc / 1440); }
    this.bankAcc = 0;
  }
  bankDialog(d) {
    const g = this.g;
    this.accrue();
    const cash = Math.max(0, Math.floor(g.money));
    const dep = (n) => () => { n = Math.min(n, Math.max(0, Math.floor(g.money))); if (n <= 0) { g.ui.toast('জমা দেওয়ার মতো নগদ টাকা নেই', 'bad'); return; } g.money -= n; this.bank += n; g.save(); this.save(); g.sound.money(); g.ui.toast(`জমা দিলেন ৳${bnGroup(n)} · ব্যাংকে ৳${bnGroup(Math.round(this.bank))}`, 'good'); this.bankDialog(d); };
    const wd = (n) => () => { n = Math.min(n, Math.floor(this.bank)); if (n <= 0) { g.ui.toast('ব্যাংকে টাকা নেই', 'bad'); return; } this.bank -= n; g.money += n; g.save(); this.save(); g.sound.money(); g.ui.toast(`তুললেন ৳${bnGroup(n)}`, 'good'); this.bankDialog(d); };
    this.I.dialog(d.name, `ব্যাংকে আছে ৳${bnGroup(Math.round(this.bank))} · হাতে নগদ ৳${bnGroup(cash)} · খেলার প্রতিদিন ২% সুদ। ব্যাংকের টাকা হাসপাতালের বিল বা জরিমানায় কাটে না`, [
      { label: 'জমা দিন ৳৫০০', keep: true, act: dep(500) }, { label: 'জমা দিন ৳২,০০০', keep: true, act: dep(2000) }, { label: 'সব নগদ জমা দিন', keep: true, act: dep(cash) },
      { label: 'তুলুন ৳৫০০', keep: true, act: wd(500) }, { label: 'তুলুন ৳২,০০০', keep: true, act: wd(2000) }, { label: 'সব তুলে নিন', keep: true, act: wd(1e9) },
      ...(g.arms.pistol && g.arms.ammo > 0 ? [{ label: '🔫 ডাকাতি! ক্যাশের সব টাকা দাও', note: 'অনেক টাকা, পুলিশের তাড়া (৩+ তারা)', act: () => this.startHeist(d) }] : []),
    ]);
  }
  // ব্যাংক ডাকাতি: পিস্তল তাক করে ধরে রাখুন, ক্যাশিয়ার ব্যাগে টাকা ভরে; দারোয়ান গুলি চালায় (আগে তাকে সামলান)
  startHeist(d) {
    const g = this.g, r = this.I.rooms.bank;
    if (this.heist) return;
    if (g.time - (this.bankRobbed ?? -1e9) < 600) { g.ui.toast('কিছুক্ষণ আগেই ডাকাতি হয়েছে, ক্যাশ খালি। পরে আসুন', 'bad'); return; }
    if (r.npcs.filter((n) => !n.dead && n !== r.guard && n.pose0 === 'drive').length === 0) { g.ui.toast('কাউন্টারে কেউ নেই, টাকা দেবে কে?', 'bad'); return; }
    this.heist = { r, t: 0, dur: 10, amt: Math.round((30000 + Math.random() * 45000) / 500) * 500, shotT: 1.4, beep: 0, name: d.name };
    g.combat.scareRoom(r, r.guard && !r.guard.dead ? r.guard : null);
    if (r.guard && !r.guard.dead) { r.guard.pose = 'aim'; r.guard.rig.busy = false; }
    r.crimeT = g.time;
    g.law.offense('bankRob');
    g.ui.toast('ডাকাতি! "ব্যাগে ভরো, তাড়াতাড়ি!" দারোয়ানের দিকে খেয়াল রাখুন', 'bad');
  }
  heistText() {
    const H = this.heist; if (!H) return '';
    return `💰 ক্যাশিয়ার ব্যাগে টাকা ভরছে… ${bn(Math.min(100, Math.floor(H.t / H.dur * 100)))}% (ঘর থেকে বের হবেন না)`;
  }
  updateHeist(dt) {
    const g = this.g, H = this.heist, P = g.player, r = H.r;
    if (!g.inside || g.inside.room !== r || P.state === 'dead') { this.heist = null; g.ui.toast('ডাকাতি অর্ধেক ফেলে চলে এলেন, টাকা পেলেন না', 'bad'); return; }
    H.t += dt;
    // অ্যালার্মের বিপ বিপ
    H.beep -= dt;
    if (H.beep <= 0) { H.beep = 0.6; g.sound.tone('square', 1350, 0.25, 0.05); }
    // দারোয়ান বেঁচে থাকলে গুলি
    const gd = r.guard;
    if (gd && !gd.dead) {
      const gx = r.X + gd.x, gz = r.Z + gd.z;
      gd.rig.root.rotation.y = Math.atan2(-(P.pos.x - gx), -(P.pos.z - gz));
      setPose(gd.rig, 'aim', dt, 0, 10);
      H.shotT -= dt;
      if (H.shotT <= 0) {
        H.shotT = 1.1 + Math.random() * 0.6;
        g.sound.gunshot(0.8);
        if (Math.random() < 0.42) g.damagePlayer(9, 'bullet', { x: gx, z: gz });
      }
    }
    if (H.t >= H.dur) {
      g.addMoney ? g.addMoney(H.amt) : (g.money += H.amt);
      this.bankRobbed = g.time;
      this.heist = null;
      g.sound.money(); g.save();
      g.ui.toast(`ব্যাংক ডাকাতি সফল! ব্যাগে ৳${bnGroup(H.amt)}। পুলিশ আসছে, পালান!`, 'money');
    }
  }
  startCashier() {
    const g = this.g;
    if (this.cashCool > 0) { g.ui.toast(`পরের শিফট ${bn(Math.ceil(this.cashCool))} সেকেন্ড পরে`, ''); return; }
    this.cash = { i: 0, ok: 0 };
    this.cashQ();
  }
  cashQ() {
    const C = this.cash, g = this.g;
    if (C.i >= 5) {
      const pay = C.ok * 120 + (C.ok === 5 ? 200 : 0);
      if (pay) g.addMoney(pay);
      this.cash = null; this.cashCool = 45;
      this.I.closeDialog();
      g.ui.toast(`শিফট শেষ! ${bn(C.ok)}/৫ গ্রাহক ঠিকঠাক · আয় ৳${bnGroup(pay)}`, C.ok >= 3 ? 'good' : '');
      return;
    }
    // গ্রাহক কত টাকা তুলবেন, কোন নোটগুলো দেবেন
    const n1000 = Math.floor(rand(0, 4)), n500 = Math.floor(rand(0, 2)), n100 = Math.floor(rand(0, 5)), n50 = Math.floor(rand(0, 2));
    const amt = n1000 * 1000 + n500 * 500 + n100 * 100 + n50 * 50 || 600;
    const fmt = (a, b, c, d2) => [a && `${bn(a)}টা ১০০০`, b && `${bn(b)}টা ৫০০`, c && `${bn(c)}টা ১০০`, d2 && `${bn(d2)}টা ৫০`].filter(Boolean).join(' + ') || '৬টা ১০০';
    const right = fmt(n1000, n500, n100, n50);
    const wrong1 = fmt(n1000, n500, n100 + 1, n50), wrong2 = fmt(Math.max(0, n1000 - 1), n500 + 1, n100, n50 + 1);
    const opts = [right, wrong1, wrong2].sort(() => Math.random() - 0.5);
    this.I.dialog(`ক্যাশিয়ারের কাজ (${bn(C.i + 1)}/৫)`, `গ্রাহক তুলবেন ৳${bnGroup(amt)}। কোন নোটগুলো দেবেন?`, opts.map((o) => ({ label: o, keep: true, act: () => { C.i++; if (o === right) { C.ok++; g.sound.ping(); g.ui.toast('ঠিক গুনেছেন!', 'good'); } else g.ui.toast(`ভুল! ঠিক ছিল: ${right}`, 'bad'); this.cashQ(); } })));
  }

  // ================= বিদ্যুৎ অফিস আর ডাকঘর =================
  officeJob(type, d) {
    const g = this.g, J = g.jobs;
    if (J.active) { g.ui.toast('আগে চলমান কাজটা শেষ করুন', 'bad'); return; }
    const homes = g.map.places.homes;
    const far = homes.filter((h) => { const dd = Math.hypot(h.door.x - d.b.door.x, h.door.z - d.b.door.z); return dd > 150 && dd < 600; });
    const to = pick(far.length ? far : homes);
    const dist = Math.hypot(to.door.x - d.b.door.x, to.door.z - d.b.door.z);
    J.offers = [{ type, from: d.b, to, d: dist, base: Math.round((90 + dist * 0.2) / 5) * 5, who: d.name, limit: 0 }];
    J.accept(0);
    this.I.exit();
  }
  powerDialog(d) {
    const g = this.g;
    this.I.dialog(d.name, '"মিটার রিডার লাগবে, যাবেন? নাকি অভিযোগ?"', [
      { label: 'মিটার পড়ার কাজ নিন (বাসায় গিয়ে মিটার পড়ে আসুন)', act: () => this.officeJob('meter', d) },
      { label: 'লোডশেডিং নিয়ে অভিযোগ দিন', act: () => g.ui.toast('কর্মকর্তা: "অভিযোগ জমা হলো। বিদ্যুৎ এলে জানাবো... যদি আসে।"', '') },
    ]);
  }
  postDialog(d) {
    const g = this.g;
    this.I.dialog(d.name, '"চিঠি বিলি করবেন নাকি কিছু পাঠাবেন?"', [
      { label: 'ডাকপিয়নের কাজ নিন (চিঠি পৌঁছে দিন)', act: () => this.officeJob('letter', d) },
      { label: 'গ্রামের বাড়িতে পার্সেল পাঠান', price: 60, act: () => { if (!g.spend(60, 'পার্সেল')) return; g.sound.money(); g.ui.toast('পার্সেল পাঠালেন, ৩ দিনে পৌঁছাবে (ইনশাআল্লাহ)', 'good'); } },
      { label: 'ডাকটিকিট কিনুন (স্মৃতি হিসেবে)', price: 10, act: () => { if (!g.spend(10, 'ডাকটিকিট')) return; g.ui.toast('একটা সুন্দর ডাকটিকিট কিনলেন', ''); } },
    ]);
  }

  // ================= বাইরের মানুষ =================
  take(kind, opts) {
    const P = this.pool[kind];
    let o = P.find((x) => !x.used);
    if (!o) {
      const rig = makeRig(opts());
      this.g.scene.add(rig.root);
      o = { rig, used: false };
      P.push(o);
    }
    o.used = true;
    o.rig.root.visible = true;
    return o;
  }
  update(dt) {
    const g = this.g, P = g.player;
    this.bankAcc += dt;
    if (this.classCool > 0) this.classCool -= dt;
    if (this.cashCool > 0) this.cashCool -= dt;
    if (this.heist) this.updateHeist(dt);
    this.updateEvents(dt); // মিছিল / অবরোধ
    const inside = !!g.inside;
    this.assignT -= dt;
    if (this.assignT <= 0) { this.assignT = 0.8; this.assign(inside); }
    if (inside) return;
    for (const kind of ['keeper', 'cust', 'guard']) for (const o of this.pool[kind]) if (o.used) setPose(o.rig, o.pose, dt, 0, 6);
    // আসা-যাওয়া করা মানুষ
    for (const w of this.pool.walker) {
      if (!w.used) continue;
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { w.used = false; w.rig.root.visible = false; continue; }
      const st = Math.min(d, 1.25 * dt);
      w.x += (dx / d) * st; w.z += (dz / d) * st;
      w.rig.root.position.set(w.x, w.y, w.z);
      w.rig.root.rotation.y = Math.atan2(-dx, -dz);
      setPose(w.rig, 'walk', dt, 1.2, 8);
    }
    // কাছে গেলে দোকানদার ডাকে (ফুটপাতের ঢাকাই ডাক)
    this.callT = (this.callT || 0) - dt;
    if (this.callT <= 0) {
      this.callT = rand(3.5, 7);
      const k = this.pool.keeper.find((o) => o.used && Math.hypot(o.x - P.pos.x, o.z - P.pos.z) < 9);
      if (k) {
        const cry = pick([
          'আসেন ভাই, কী লাগবে?', 'দেখে যান, দাম কম!', 'ভিতরে আসেন, সব আছে!', 'মামা, কিছু নিবেন?',
          'দেখে নে বাইচ্চা নেন, ১০০ টাকা!', 'এক দেখে যান, দুই কিনবেন!', 'আজকে অফার, তাড়াতাড়ি আসেন!',
          'বাইচ্চা দেখেন, দাম শোনেন!', 'মামা আসেন, ফ্রেশ মাল!', 'এই ভাই, একবার দেখে যান!',
          '৫০ টাকা, ৫০ টাকা! নেন নেন!', 'দোকান বন্ধ করার আগে আসেন!', 'কী লাগবে বলেন, সব আছে!',
        ]);
        g.say(k.rig.root, 'দোকানদার', cry, 2.3);
        if (g.sound.crowdMurmur) g.sound.crowdMurmur(0.25, Math.hypot(k.x - P.pos.x, k.z - P.pos.z));
      }
    }
  }
  // কাছের দরজাগুলোতে মানুষ বসানো
  assign(inside) {
    const g = this.g, P = g.player;
    for (const kind of ['keeper', 'cust', 'guard']) for (const o of this.pool[kind]) { o.used = false; o.rig.root.visible = false; }
    if (inside) { for (const w of this.pool.walker) { w.used = false; w.rig.root.visible = false; } return; }
    // গোলাগুলির পরে কিছুক্ষণ দোকানের সামনে কেউ নেই (সবাই পালিয়েছে)
    if (g.time < (this.scaredUntil || 0)) { for (const w of this.pool.walker) { w.used = false; w.rig.root.visible = false; } return; }
    const near = [];
    const cx = Math.floor(P.pos.x / 50), cz = Math.floor(P.pos.z / 50);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const B of this.grid.get(cx + a + ',' + (cz + b)) || []) {
      const E0 = B.entry || B.door, d = Math.hypot(E0.x - P.pos.x, E0.z - P.pos.z);
      if (d < 55) near.push([d, B]);
    }
    near.sort((p, q) => p[0] - q[0]);
    let nk = 0, nc = 0, ng = 0;
    for (const [, B] of near) {
      const f = B.face, yaw = Math.atan2(-f.x, -f.z), lx = -f.z, lz = f.x;
      const E = B.entry || B.door, hw = B.entry ? clamp((B.entry.w || 3) / 2 - 0.5, 0.6, 1.3) : 0.9;
      const y = g.world.onRoad(E.x, E.z, 3) ? 0.16 : 0;
      if (B.kind === 'shop' && nk < 10) {
        const o = this.take('keeper', () => ({ shirt: pick([0xf5f5f0, 0x1565c0, 0x6d4c41, 0x2e7d32]), kurta: Math.random() < 0.5, pants: pick([0x1d4f8c, 0x37474f, 0x5d4037]) }));
        o.x = E.x - f.x * 0.2 + lx * hw; o.z = E.z - f.z * 0.2 + lz * hw;
        if (g.world.blocked(o.x, 1, o.z)) { o.x = E.x - f.x * 0.2 - lx * hw; o.z = E.z - f.z * 0.2 - lz * hw; }
        if (g.world.blocked(o.x, 1, o.z)) { o.x = E.x + f.x * 0.5 + lx * 0.7; o.z = E.z + f.z * 0.5 + lz * 0.7; }
        o.rig.root.position.set(o.x, y, o.z); o.rig.root.rotation.set(0, yaw, 0);
        o.pose = (B.color % 3 === 0) ? 'phone' : 'idle';
        nk++;
        if (B.color % 2 === 0 && nc < 6) {
          const c = this.take('cust', () => ({ shirt: pick([0xc62828, 0x2e7d32, 0xef6c00, 0x6a1b9a, 0x9e9e9e]), female: Math.random() < 0.4, skirt: pick([0xc2185b, 0x00897b, 0x5e35b1]), orna: pick([0xf8bbd0, 0xb2dfdb]) }));
          c.x = o.x + f.x * 1.2; c.z = o.z + f.z * 1.2;
          c.rig.root.position.set(c.x, y, c.z); c.rig.root.rotation.set(0, yaw + Math.PI, 0);
          c.pose = B.color % 4 === 0 ? 'wave' : 'idle';
          nc++;
        }
      } else if (B.kind === 'civic' && ng < 4) {
        const o = this.take('guard', () => ({ shirt: 0x8d7b4a, pants: 0x5d4e2e, cap: 0x5d4e2e }));
        o.x = E.x + lx * (hw + 0.6); o.z = E.z + lz * (hw + 0.6);
        o.rig.root.position.set(o.x, y, o.z); o.rig.root.rotation.set(0, yaw, 0);
        o.pose = 'idle';
        ng++;
      }
    }
    // নতুন আসা-যাওয়া (একসাথে ৬ জন পর্যন্ত)
    const busy = this.pool.walker.filter((w) => w.used).length;
    if (busy < 6 && near.length) {
      const B = near[Math.floor(Math.random() * Math.min(near.length, 12))][1];
      if (B) {
        const f = B.face, lx = -f.z, lz = f.x, side = Math.random() < 0.5 ? -1 : 1, E = B.entry || B.door;
        const w = this.take('walker', () => ({ shirt: pick([0x1565c0, 0xc62828, 0xf5f5f0, 0x2e7d32, 0x8d6e63, 0x37474f]), female: Math.random() < 0.4, skirt: pick([0xc2185b, 0x00897b, 0x5e35b1, 0xef6c00]), orna: pick([0xf8bbd0, 0xb2dfdb, 0xfff59d]), bag: B.civic === 'school' && Math.random() < 0.6 ? 0x1d63c8 : undefined }));
        const out = [E.x + f.x * 2.5 + lx * side * 6, E.z + f.z * 2.5 + lz * side * 6];
        const door = [E.x - f.x * (B.entry ? 1.1 : 0.3), E.z - f.z * (B.entry ? 1.1 : 0.3)];
        const goingIn = Math.random() < 0.5;
        [w.x, w.z] = goingIn ? out : door;
        [w.tx, w.tz] = goingIn ? door : out;
        w.y = g.world.onRoad(E.x, E.z, 3) ? 0.16 : 0;
      }
    }
  }
}
