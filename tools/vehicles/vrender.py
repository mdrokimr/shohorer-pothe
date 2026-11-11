# ছোট z-buffer রেন্ডার: পাশ থেকে (+x দিক থেকে, সামনে −Z বাম দিকে) আর উপর থেকে; ঠিক দিক আর মাপ যাচাই
import sys, json, base64, numpy as np
from PIL import Image
fn = sys.argv[1]; d = fn.rsplit('/', 1)[0]
J = json.load(open(fn)); blob = base64.b64decode(J['buffers'][0]['uri'].split(',', 1)[1])
CT = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(blob, CT[a['componentType']], a['count'] * NC[a['type']], bv['byteOffset']).reshape(a['count'], -1)
texc = {}
def tex(ti):
    if ti not in texc: texc[ti] = np.array(Image.open(d + '/' + J['images'][J['textures'][ti]['source']]['uri']).convert('RGBA').resize((256, 256)))
    return texc[ti]
tris = []
for nd in J['nodes']:
    t = np.array(nd.get('translation', [0, 0, 0]))
    for pr in J['meshes'][nd['mesh']]['primitives']:
        P = acc(pr['attributes']['POSITION']).astype(float) + t; N = acc(pr['attributes']['NORMAL']).astype(float)
        UV = acc(pr['attributes']['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in pr['attributes'] else None
        T = acc(pr['indices']).reshape(-1, 3).astype(int); m = J['materials'][pr['material']]; pb = m['pbrMetallicRoughness']
        VC = acc(pr['attributes']['COLOR_0']).astype(float) if 'COLOR_0' in pr['attributes'] else None
        col = np.array(pb['baseColorFactor'][:3]) * 255
        for tr in T:
            c = col if VC is None else VC[tr].mean(0) * 255
            if UV is not None and 'baseColorTexture' in pb:
                u = UV[tr].mean(0); px = tex(pb['baseColorTexture']['index'])[int((u[1] % 1) * 255), int((u[0] % 1) * 255)]
                c = px[:3] * col / 255
            tris.append((P[tr], N[tr].mean(0), c, nd['name'].startswith(('wheel', 'rotor', 'tail'))))
def view(mode, S=520):
    allp = np.concatenate([t[0] for t in tris])
    if mode == 'side': ax = (2, 1, 0); sgn = (1, 1, 1)   # সামনে (−z) বাঁয়ে
    elif mode == 'top': ax = (0, 2, 1); sgn = (1, 1, 1)  # উপর থেকে, সামনে উপরে
    else: ax = (0, 1, 2); sgn = (1, 1, -1)              # পিছন থেকে
    lo = allp.min(0); hi = allp.max(0); span = (hi - lo)[[ax[0], ax[1]]].max() * 1.08
    img = np.full((S, S, 3), 225, np.float32); zb = np.full((S, S), -1e9)
    L = np.array([0.4, 0.8, 0.45]); L /= np.linalg.norm(L)
    for P, n, c, hl in tris:
        X = (P[:, ax[0]] - (lo[ax[0]] + hi[ax[0]]) / 2) / span * S + S / 2
        Y = (P[:, ax[1]] - (lo[ax[1]] + hi[ax[1]]) / 2) / span * S + S / 2
        if mode != 'top': Y = S - Y
        Z = P[:, ax[2]] * sgn[2] * (-1 if mode == 'top' else 1)
        if mode == 'top': Z = P[:, 1]
        minx, maxx = int(max(0, X.min())), int(min(S - 1, X.max() + 1)); miny, maxy = int(max(0, Y.min())), int(min(S - 1, Y.max() + 1))
        if minx > maxx or miny > maxy: continue
        ar = (X[1] - X[0]) * (Y[2] - Y[0]) - (Y[1] - Y[0]) * (X[2] - X[0])
        if abs(ar) < 1e-9: continue
        gx, gy = np.meshgrid(np.arange(minx, maxx + 1) + .5, np.arange(miny, maxy + 1) + .5)
        w0 = ((X[1] - gx) * (Y[2] - gy) - (Y[1] - gy) * (X[2] - gx)) / ar; w1 = ((X[2] - gx) * (Y[0] - gy) - (Y[2] - gy) * (X[0] - gx)) / ar; w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        z = w0 * Z[0] + w1 * Z[1] + w2 * Z[2]; sub = zb[miny:maxy + 1, minx:maxx + 1]; m &= z > sub; sub[m] = z[m]
        nn = n / (np.linalg.norm(n) or 1); k = 0.5 + 0.55 * abs(nn @ L)
        cc = np.array([255, 60, 60.]) * k if hl and len(sys.argv) > 3 else c * k
        img[miny:maxy + 1, minx:maxx + 1][m] = cc
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
a, b, c = view('side'), view('top'), view('back')
o = Image.new('RGB', (1560, 520)); o.paste(a, (0, 0)); o.paste(b, (520, 0)); o.paste(c, (1040, 0)); o.save(sys.argv[2]); print('ok', len(tris))
