import sys, json, math, glob, re; sys.path.insert(0,'../fbx')
import numpy as np
from fbxparse import *
TS = 46186158000
R0 = json.load(open('../fbx/rig.json')); names = [b.split(':')[1] for b in R0['bones']]
restQ = {n: np.array(R0['local'][i][1]) for i, n in enumerate(names)}
restT = {n: np.array(R0['local'][i][0]) for i, n in enumerate(names)}
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz])
def qaxis(ax, ang):
    s = math.sin(ang/2); v = np.zeros(4); v[ax] = s; v[3] = math.cos(ang/2); return v
def eulq(x, y, z):  # FBX XYZ: R = Rz Ry Rx
    return qmul(qmul(qaxis(2, math.radians(z)), qaxis(1, math.radians(y))), qaxis(0, math.radians(x)))
NOHIPS = {'Driving', 'Sitting_Idle', 'Jump'}
SKIP = {'Getting_Up', 'Swimming', 'Punching_Bag', 'Falling_Back_Death'}
CFG = {'Talking_On_Phone': (12, 15), 'Terrified': (8, 15), 'Pistol_Idle': (5, 15), 'Driving': (5, 15), 'Sitting_Idle': (4.4, 15), 'Idle': (3.4, 20), 'Happy_Idle': (2.1, 20)}
out = {}
for f in sorted(glob.glob('/mnt/user-data/attachments/56782804-213f-53d0-8961-7fcca0222ff6/*.fbx')):
    clip = re.sub(r'^[0-9a-f]{8}-', '', f.split('/')[-1])[:-4]
    if clip in SKIP: continue
    nodes = parse(f); objs = [n for n in nodes if n['name']=='Objects'][0]
    byid = {c['props'][0]: c for c in objs['ch']}
    conns = [n for n in nodes if n['name']=='Connections'][0]['ch']
    ch = {}
    for c in conns: ch.setdefault(c['props'][2], []).append((c['props'][1], c['props'][3] if len(c['props']) > 3 else None))
    models = {}; tmax = 0
    for c in objs['ch']:
        if c['name'] != 'Model': continue
        nm = c['props'][1].split('\x00')[0].split(':')[-1]
        p70 = {p['props'][0]: p['props'][4:] for p in one(c,'Properties70')['ch']}
        curves = {}
        for a, prop in ch.get(c['props'][0], []):
            cn = byid.get(a)
            if not cn or cn['name'] != 'AnimationCurveNode': continue
            for b, ax in ch.get(a, []):
                cv = byid[b]; kt = np.array(one(cv,'KeyTime')['props'][0], float) / TS; kv = np.array(one(cv,'KeyValueFloat')['props'][0], float)
                curves[(prop, ax)] = (kt, kv); tmax = max(tmax, kt[-1])
        models[nm] = (p70, curves)
    dur, fps = CFG.get(clip, (99, 30)); trimmed = tmax > dur
    tmax = min(tmax, dur)
    n = int(round(tmax * fps)) + 1
    ts = np.arange(n) / fps
    def sample(p70, curves, prop, i, default):
        c = curves.get((prop, 'd|' + 'XYZ'[i]))
        if c is None: return np.full(n, default[i] if default else 0.0)
        return np.interp(ts, c[0], c[1])
    clipd = {'n': n, 'f': fps, 'q': {}}
    if trimmed: clipd['pp'] = 1
    for nm, (p70, curves) in models.items():
        if nm not in restQ: continue
        dflt = p70.get('Lcl Rotation', [0, 0, 0])
        e = [sample(p70, curves, 'Lcl Rotation', i, dflt) for i in range(3)]
        qs = np.array([qmul(restQ[nm], eulq(e[0][k], e[1][k], e[2][k])) for k in range(n)])
        for k in range(1, n):
            if np.dot(qs[k], qs[k-1]) < 0: qs[k] = -qs[k]
        if np.max(np.abs(qs - qs[0])) < 0.002: qs = qs[:1]
        clipd['q'][nm] = np.round(qs.reshape(-1), 3).tolist()
        if nm == 'Hips' and clip not in NOHIPS:
            tD = p70.get('Lcl Translation', [0, 94.02, 0])
            t = np.stack([sample(p70, curves, 'Lcl Translation', i, tD) for i in range(3)], 1)
            base = np.array([t[0, 0], 94.02, t[0, 2]])
            d = (t - base) * 0.01 * (95.7 / 94.02)
            d[:, 0] = np.clip(d[:, 0], -0.2, 0.2); d[:, 2] = np.clip(d[:, 2], -0.2, 0.2)
            hp = restT['Hips'] + d
            clipd['hp'] = np.round(hp.reshape(-1), 3).tolist()
    out[clip] = clipd
    print(clip, n, 'frames', round(n/30, 2), 's', len(clipd['q']), 'bones')
json.dump(out, open('anims.json', 'w'), separators=(',', ':'))
import os; print('size', os.path.getsize('anims.json') / 1e6, 'MB')
