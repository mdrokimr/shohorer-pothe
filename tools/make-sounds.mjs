#!/usr/bin/env node
// ElevenLabs দিয়ে "শহরের পথে"-র সব কণ্ঠ আর শব্দ বানানো।
// কণ্ঠ এলোমেলো বাছাই হয় (একবার বাছাই হলে sounds/voices-used.json-এ জমা থাকে, পরের বার একই কণ্ঠ)।
//
// চালানো (প্রজেক্টের মূল ফোল্ডার থেকে):
//   node tools/make-sounds.mjs --test        ২-৩টা লাইন বানিয়ে শুনে দেখা
//   node tools/make-sounds.mjs               সব বানানো (আগে বানানো ফাইল বাদ দেয়)
// বিকল্প:
//   --only voice | --only sfx    শুধু কণ্ঠ বা শুধু শব্দ
//   --model eleven_v3            কণ্ঠের মডেল (ডিফল্ট eleven_v3)
//   --force                      আগে বানানো ফাইলও নতুন করে
//   --new-voices                 নতুন করে এলোমেলো কণ্ঠ বাছাই
//
// API key: ELEVENLABS_API_KEY পরিবেশ চলক, অথবা প্রজেক্টের মূল ফোল্ডারে .env ফাইলে
//   ELEVENLABS_API_KEY=আপনার_key
// Node 18 বা তার পরের সংস্করণ লাগবে। আলাদা কোনো প্যাকেজ লাগে না।

import { readFile, writeFile, mkdir, access, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'sounds');
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TEST = flag('--test');
const FORCE = flag('--force');
const ONLY = opt('--only', null);
const MODEL = opt('--model', 'eleven_v3');

if (typeof fetch !== 'function') {
  console.error('Node 18 বা তার পরের সংস্করণ লাগবে (এখন ' + process.version + ')।');
  process.exit(1);
}

// ---------- API key ----------
async function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    const env = await readFile(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  } catch (e) { /* .env নেই */ }
  console.error('API key পাওয়া যায়নি। প্রজেক্টের মূল ফোল্ডারে .env ফাইলে লিখুন:\n  ELEVENLABS_API_KEY=আপনার_key');
  process.exit(1);
}

// গেমের তালিকা পড়া (js/voicelines.js), package.json ছাড়াই
async function loadLines() {
  const src = await readFile(path.join(ROOT, 'js', 'voicelines.js'), 'utf8');
  return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
}

const exists = (p) => access(p).then(() => true, () => false);
// খালি বা ভাঙা ফাইল থাকলে সেটা আবার বানানো হয়
const good = (p) => stat(p).then((st) => st.size > 1000, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

let KEY = '';
// ধীরগতি (429) বা সার্ভারের সমস্যায় কয়েকবার চেষ্টা
async function call(url, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: body ? 'audio/mpeg' : 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) return r;
    const text = await r.text();
    if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await sleep(2000 * 2 ** i); continue; }
    const err = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
}

// ---------- কণ্ঠ বাছাই ----------
async function pickVoices() {
  const file = path.join(OUT, 'voices-used.json');
  if (!flag('--new-voices') && await exists(file)) {
    const v = JSON.parse(await readFile(file, 'utf8'));
    console.log(`আগের বাছাই করা কণ্ঠ: পুরুষ ${v.m.length}টা, নারী ${v.f.length}টা`);
    return v;
  }
  const r = await call('/v1/voices');
  const { voices } = await r.json();
  if (!voices || !voices.length) throw new Error('অ্যাকাউন্টে কোনো কণ্ঠ পাওয়া যায়নি।');
  const g = (v) => ((v.labels && v.labels.gender) || '').toLowerCase();
  let male = shuffle(voices.filter((v) => g(v) === 'male'));
  let female = shuffle(voices.filter((v) => g(v) === 'female'));
  const other = shuffle(voices.filter((v) => g(v) !== 'male' && g(v) !== 'female'));
  if (!male.length) male = other.slice(0, 5);
  if (!female.length) female = other.slice(0, 5);
  const brief = (v) => ({ id: v.voice_id, name: v.name });
  const pick = {
    m: male.slice(0, 5).map(brief),
    f: female.slice(0, 5).map(brief),
  };
  pick.player = pick.m[0]; // আপনার চরিত্র সবসময় একই কণ্ঠে
  pick.m = pick.m.length > 1 ? pick.m.slice(1) : pick.m;
  await mkdir(OUT, { recursive: true });
  await writeFile(file, JSON.stringify(pick, null, 2));
  console.log('এলোমেলো কণ্ঠ বাছাই হলো:');
  console.log('  আপনার চরিত্র:', pick.player.name);
  console.log('  পুরুষ:', pick.m.map((v) => v.name).join(', '));
  console.log('  নারী:', pick.f.map((v) => v.name).join(', '));
  return pick;
}

// ---------- কণ্ঠ বানানো ----------
let langOk = true;
async function tts(voiceId, line) {
  const v3 = MODEL.includes('v3');
  const text = v3 && line.tag ? `[${line.tag}] ${line.text}` : line.text;
  const body = {
    text,
    model_id: MODEL,
    voice_settings: v3 ? { stability: 0.5, similarity_boost: 0.75 } : { stability: 0.4, similarity_boost: 0.75, style: 0.45 },
  };
  if (langOk) body.language_code = 'bn';
  try {
    const r = await call(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, body);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    // কিছু মডেল language_code নেয় না: ছাড়া আবার চেষ্টা
    if (body.language_code && (e.status === 400 || e.status === 422) && /language/i.test(e.body || '')) {
      langOk = false;
      return tts(voiceId, line);
    }
    throw e;
  }
}

async function makeVoices(lines, voices) {
  await mkdir(path.join(OUT, 'voice'), { recursive: true });
  const jobs = [];
  for (const l of lines) {
    const gs = l.g === 'any' ? ['m', 'f'] : l.g === 'player' ? ['p'] : [l.g];
    for (const gx of gs) jobs.push({ l, gx });
  }
  const list = TEST ? jobs.slice(0, 4) : jobs;
  const chars = list.reduce((s, j) => s + j.l.text.length, 0);
  console.log(`\nকণ্ঠ: ${list.length}টা ফাইল, মোট প্রায় ${chars} অক্ষর (ElevenLabs ক্রেডিট এভাবে কাটে)`);
  let done = 0, skip = 0, fail = 0;
  await pool(list, 2, async ({ l, gx }) => {
    const name = `${l.id}_${gx === 'p' ? 'm' : gx}.mp3`;
    const file = path.join(OUT, 'voice', name);
    if (!FORCE && await good(file)) { skip++; return; }
    const vp = gx === 'p' ? [voices.player] : voices[gx];
    const v = vp[Math.floor(Math.random() * vp.length)];
    try {
      const buf = await tts(v.id, l);
      if (buf.length < 1000) throw new Error('খালি ফাইল এসেছে, পরে আবার চালালে বানাবে');
      await writeFile(file, buf);
      done++;
      console.log(`  ✓ ${name}  (${v.name})  ${l.text}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${name}: ${e.message}`);
      if (e.status === 401) { console.error('API key ঠিক নেই।'); process.exit(1); }
    }
  });
  console.log(`কণ্ঠ শেষ: নতুন ${done}, আগেই ছিল ${skip}, ব্যর্থ ${fail}`);
}

// ---------- শব্দ বানানো ----------
let loopOk = true;
async function sfx(s) {
  const body = { text: s.prompt, duration_seconds: Math.max(0.5, Math.min(22, s.sec)), prompt_influence: 0.5 };
  if (s.loop && loopOk) body.loop = true;
  try {
    const r = await call('/v1/sound-generation?output_format=mp3_44100_128', body);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    if (body.loop && (e.status === 400 || e.status === 422)) { loopOk = false; return sfx(s); }
    throw e;
  }
}
async function makeSfx(list) {
  await mkdir(path.join(OUT, 'sfx'), { recursive: true });
  const todo = TEST ? list.filter((s) => s.id === 'gunshot' || s.id === 'horn_cng') : list;
  console.log(`\nশব্দ: ${todo.length}টা ফাইল`);
  let done = 0, skip = 0, fail = 0;
  await pool(todo, 2, async (s) => {
    const file = path.join(OUT, 'sfx', `${s.id}.mp3`);
    if (!FORCE && await good(file)) { skip++; return; }
    try {
      await writeFile(file, await sfx(s));
      done++;
      console.log(`  ✓ ${s.id}.mp3`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${s.id}: ${e.message}`);
      if (e.status === 401) { console.error('API key ঠিক নেই।'); process.exit(1); }
    }
  });
  console.log(`শব্দ শেষ: নতুন ${done}, আগেই ছিল ${skip}, ব্যর্থ ${fail}`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// গেম যে তালিকা পড়ে: কোন ID-র কোন ফাইল আছে
async function writeManifest() {
  const man = { voice: {}, sfx: {} };
  const vdir = path.join(OUT, 'voice'), sdir = path.join(OUT, 'sfx');
  for (const f of await readdir(vdir).catch(() => [])) {
    const m = f.match(/^(.+)_([mf])\.mp3$/);
    if (!m || !(await good(path.join(vdir, f)))) continue;
    (man.voice[m[1]] ||= {})[m[2]] = `voice/${f}`;
  }
  for (const f of await readdir(sdir).catch(() => [])) {
    const m = f.match(/^(.+)\.mp3$/);
    if (m) man.sfx[m[1]] = `sfx/${f}`;
  }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(man, null, 1));
  console.log(`\nsounds/manifest.json লেখা হলো: কণ্ঠ ${Object.keys(man.voice).length}টা লাইন, শব্দ ${Object.keys(man.sfx).length}টা`);
}

async function main() {
  KEY = await apiKey();
  const { VOICE_LINES, SFX } = await loadLines();
  console.log(`মডেল: ${MODEL}${TEST ? '  (পরীক্ষা: অল্প কয়েকটা)' : ''}`);
  if (ONLY !== 'sfx') {
    const voices = await pickVoices();
    await makeVoices(VOICE_LINES, voices);
  }
  if (ONLY !== 'voice') await makeSfx(SFX);
  await writeManifest();
  console.log('\nশেষ। গেম লোকাল সার্ভারে চালালে নতুন শব্দ নিজে থেকেই বাজবে।');
  if (TEST) console.log('শুনে ভালো লাগলে --test ছাড়া চালান; কণ্ঠ পছন্দ না হলে --new-voices --force দিয়ে আবার।');
}

main().catch((e) => { console.error('\nসমস্যা:', e.message); process.exit(1); });
