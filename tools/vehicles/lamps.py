# মডেলের আসল পিছনের লাল বাতি আর হলুদ ইন্ডিকেটর কোথায়: রং দেখে খুঁজে extras.lamps-এ লেখা
import sys, json, base64, numpy as np
from PIL import Image
CT = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}
def run(fn):
    d = fn.rsplit('/', 1)[0]
    J = json.load(open(fn)); blob = base64.b64decode(J['buffers'][0]['uri'].split(',', 1)[1])
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
        return np.frombuffer(blob, CT[a['componentType']], a['count'] * NC[a['type']], bv['byteOffset']).reshape(a['count'], -1).astype(float)
    tex = {}
    def texel(ti, uv):
        if ti not in tex: tex[ti] = np.array(Image.open(d + '/' + J['images'][J['textures'][ti]['source']]['uri']).convert('RGB').resize((256, 256))).astype(float)
        im = tex[ti]; u = (uv[:, 0] % 1 * 255).astype(int); v = (uv[:, 1] % 1 * 255).astype(int)
        return im[v, u]
    C, Cn, Col, Nm = [], [], [], []
    for nd in J['nodes']:
        if nd['name'].startswith(('wheel', 'rotor', 'tail')): continue
        t = np.array(nd.get('translation', [0, 0, 0]))
        for pr in J['meshes'][nd['mesh']]['primitives']:
            A = pr['attributes']; P = acc(A['POSITION']) + t; N = acc(A['NORMAL']); T = acc(pr['indices']).reshape(-1, 3).astype(int)
            m = J['materials'][pr['material']]; pb = m['pbrMetallicRoughness']; base = np.array(pb['baseColorFactor'][:3]) * 255
            c = P[T].mean(1); n = N[T].mean(1)
            if 'COLOR_0' in A: col = acc(A['COLOR_0'])[T].mean(1) * 255
            elif 'TEXCOORD_0' in A and 'baseColorTexture' in pb: col = texel(pb['baseColorTexture']['index'], acc(A['TEXCOORD_0'])[T].mean(1)) * base / 255
            else: col = np.tile(base, (len(T), 1))
            name = m['name'].lower()
            if 'red' in name or 'light_t' in name: col = np.tile([230, 30, 30], (len(T), 1))
            if 'orange' in name: col = np.tile([240, 140, 20], (len(T), 1))
            C.append(c); Col.append(col); Nm.append(n)
    C = np.concatenate(C); Col = np.concatenate(Col); Nm = np.concatenate(Nm)
    zmin, zmax = C[:, 2].min(), C[:, 2].max(); L = zmax - zmin
    R, G, B = Col[:, 0], Col[:, 1], Col[:, 2]
    red = (R > 140) & (G < 90) & (B < 90) & (R > G * 2)
    amber = (R > 170) & (G > 80) & (G < 190) & (B < 90) & (R > B * 2.5)
    def clusters(mask, rear):
        sel = mask & ((C[:, 2] > zmax - L * 0.1) if rear else (C[:, 2] < zmin + L * 0.1)) & ((Nm[:, 2] > 0.2) if rear else (Nm[:, 2] < -0.2))
        out = []
        for sd in (-1, 1):
            s = sel & (np.sign(C[:, 0]) == sd) & (np.abs(C[:, 0]) > 0.15)
            if s.sum() < 2: continue
            P = C[s]; lo, hi = np.percentile(P, 5, 0), np.percentile(P, 95, 0)
            out.append({'x': round(float((lo[0] + hi[0]) / 2), 3), 'y': round(float((lo[1] + hi[1]) / 2), 3), 'z': round(float(hi[2] if rear else lo[2]), 3),
                        'w': round(float(min(0.45, max(0.12, hi[0] - lo[0]))), 3), 'h': round(float(min(0.3, max(0.07, hi[1] - lo[1]))), 3)})
        if not out:
            s = sel & (np.abs(C[:, 0]) <= 0.3)
            if s.sum() >= 2:
                P = C[s]; lo, hi = np.percentile(P, 5, 0), np.percentile(P, 95, 0)
                out.append({'x': 0.0, 'y': round(float((lo[1] + hi[1]) / 2), 3), 'z': round(float(hi[2] if rear else lo[2]), 3), 'w': round(float(min(0.3, max(0.1, hi[0] - lo[0]))), 3), 'h': round(float(min(0.2, max(0.06, hi[1] - lo[1]))), 3)})
        return out
    lamps = {'tail': clusters(red, True), 'indB': clusters(amber, True), 'indF': clusters(amber, False)}
    if not lamps['tail']:  # দ্বিতীয় চেষ্টা: একটু ফ্যাকাশে লাল, পিছনের ১৫%
        red2 = (R > 115) & (G < 105) & (B < 105) & (R > G * 1.55) & (R > B * 1.55)
        L0 = L; L = L * 1.5
        lamps['tail'] = clusters(red2, True); L = L0
    if not lamps['tail']:
        # রং নেই: পিছনের তলের নিচের দুই কোণে (সেই উচ্চতায় পিছনের সবচেয়ে বাইরের বিন্দু)
        Y0 = {'cng': 0.78, 'truck': 1.0, 'bus': 0.95}.get(fn.split('veh_')[-1].split('.')[0], 0.8)
        back = (Nm[:, 2] > 0.5) & (np.abs(C[:, 1] - Y0) < 0.22) & (C[:, 2] > zmax - L * 0.15)
        for sd in (-1, 1):
            s2 = back & (np.sign(C[:, 0]) == sd)
            if s2.sum() < 1: continue
            P = C[s2]; xe = np.percentile(np.abs(P[:, 0]), 95)
            zz = P[np.abs(P[:, 0]) > xe - 0.35][:, 2].max()
            lamps['tail'].append({'x': round(float(sd * (xe - 0.16)), 3), 'y': Y0, 'z': round(float(zz), 3), 'w': 0.24, 'h': 0.14})
        lamps['shape'] = True
    J['extras']['lamps'] = lamps
    json.dump(J, open(fn, 'w'), separators=(',', ':'))
    print(fn.split('/')[-1], json.dumps(lamps))
for f in sys.argv[1:]: run(f)
