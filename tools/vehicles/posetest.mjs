import fs from 'fs';
import { prepare, retarget, fk, FINGER, THUMB, curlQ } from './posemap.mjs';
import { poseTargets, bikeMods } from './humangeo.mjs';
const R0 = JSON.parse(fs.readFileSync('rig.json'));
const names = R0.bones.map((b) => b.split(':').pop());
const R = prepare(names, R0.parent, R0.local.map((l) => l[1]), [0, 1, 0, 0]);
const poses = JSON.parse(process.argv[2]);
const out = poses.map(([pose, phase, speed, bk, ov]) => {
  const t = poseTargets(pose, phase, speed ?? 1.9, {});
  if (bk) bikeMods(t, bk);
  if (ov) Object.assign(t, ov);
  const e = { hips: [0, t.hipTw, t.hipRoll], spine: [-t.lean, t.twist, -t.hipRoll * 0.6], head: [-t.headX, t.headY - (t.twist + t.hipTw) * 0.7, 0],
    shL: [t.sL, 0, t.szL], elL: [t.eL, 0, 0], shR: [t.sR, 0, t.szR], elR: [t.eR, 0, 0], hpL: [t.hL, 0, t.hzL], knL: [t.kL, 0, 0], hpR: [t.hR, 0, t.hzR], knR: [t.kR, 0, 0], ftL: [t.fL, 0, 0], ftR: [t.fR, 0, 0] };
  const q = retarget(R, fk(e), []);
  names.forEach((n, i) => { if (FINGER.test(n)) q[i] = curlQ(R.restLocal[i], t.curl * (n.endsWith('1') ? 0.8 : 1.1)); if (THUMB.test(n)) q[i] = curlQ(R.restLocal[i], t.curl * 0.35); });
  return { q, dy: t.hipY + t.bob - 0.95, dx: t.hipX };
});
fs.writeFileSync(process.argv[3] || 'posed.json', JSON.stringify({ names, out }));
