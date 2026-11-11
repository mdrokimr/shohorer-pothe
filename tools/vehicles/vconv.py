# Sketchfab glTF → গেমের হালকা .gltf.json (রূপান্তর বেক, ম্যাটেরিয়াল অনুযায়ী জোড়া, ভার্টেক্স-ক্লাস্টারিং দিয়ে ত্রিভুজ কমানো,
# টেক্সচার ছোট করা, মাপ ঠিক করা: সামনে −Z, মাটি y=0, মাঝখানে; চাকা/রোটর আলাদা নোড)
import subprocess, os
import json, base64, os, re, sys, math, io
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

class G:
    def __init__(s, d):
        s.d = d
        s.j = json.load(open(f'{d}/scene.gltf'))
        s.bufs = []
        for b in s.j['buffers']:
            u = b['uri']
            s.bufs.append(base64.b64decode(u.split(',', 1)[1]) if u.startswith('data:') else open(f'{d}/{u}', 'rb').read())
    def acc(s, i):
        a = s.j['accessors'][i]; bv = s.j['bufferViews'][a['bufferView']]
        dt = CT[a['componentType']]; nc = NC[a['type']]; cnt = a['count']
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = bv.get('byteStride', 0); isz = np.dtype(dt).itemsize * nc
        raw = s.bufs[bv['buffer']]
        if st and st != isz:
            arr = np.ndarray((cnt, nc), dt, raw, off, (st, np.dtype(dt).itemsize))
        else:
            arr = np.frombuffer(raw, dt, cnt * nc, off).reshape(cnt, nc)
        arr = arr.astype(np.float64) if dt != np.uint32 and dt != np.uint16 or nc > 1 else arr.astype(np.int64)
        if a.get('normalized'):
            arr = arr / float(np.iinfo(dt).max)
        return arr

def trs(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    M = np.eye(4)
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M[:3, :3] = R * np.array(n.get('scale', [1, 1, 1]))
    M[:3, 3] = n.get('translation', [0, 0, 0])
    return M

def mat_info(g, mi):
    """ম্যাটেরিয়াল থেকে: রং, টেক্সচার (ছবি সূচক, uv সেট), স্বচ্ছতা, আলো"""
    if mi is None: return {'name': 'def', 'color': [0.8, 0.8, 0.8, 1], 'tex': None, 'tc': 0, 'blend': False, 'emis': [0, 0, 0], 'ds': False}
    m = g.j['materials'][mi]
    pb = m.get('pbrMetallicRoughness', {})
    col = pb.get('baseColorFactor', [1, 1, 1, 1]); tx = pb.get('baseColorTexture')
    sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness')
    if sg:
        col = sg.get('diffuseFactor', col); tx = sg.get('diffuseTexture', tx)
    tex = None; tc = 0
    if tx:
        tex = g.j['textures'][tx['index']].get('source'); tc = tx.get('texCoord', 0)
    tr = m.get('extensions', {}).get('KHR_materials_transmission')
    blend = m.get('alphaMode') == 'BLEND' or bool(tr and tr.get('transmissionFactor', 0) > 0.3)
    return {'name': m.get('name', f'm{mi}'), 'color': list(col), 'tex': tex, 'tc': tc, 'blend': blend,
            'mask': m.get('alphaMode') == 'MASK', 'emis': m.get('emissiveFactor', [0, 0, 0]), 'ds': m.get('doubleSided', False),
            'metal': pb.get('metallicFactor', 1), 'rough': pb.get('roughnessFactor', 1)}

def collect(g, skip):
    out = []
    def walk(i, M, path):
        n = g.j['nodes'][i]; M2 = M @ trs(n); p2 = path + [n.get('name', '')]
        if skip and any(re.search(skip, x, re.I) for x in p2): return
        if 'mesh' in n:
            for pr in g.j['meshes'][n['mesh']]['primitives']:
                if pr.get('mode', 4) != 4: continue
                A = pr['attributes']
                P = g.acc(A['POSITION'])[:, :3]
                idx = g.acc(pr['indices']).reshape(-1).astype(np.int64) if 'indices' in pr else np.arange(len(P))
                mi = pr.get('material'); info = mat_info(g, mi)
                uvk = f'TEXCOORD_{info["tc"]}'
                UV = g.acc(A[uvk])[:, :2] if uvk in A and info['tex'] is not None else None
                N = g.acc(A['NORMAL'])[:, :3] if 'NORMAL' in A else None
                Pw = (np.c_[P, np.ones(len(P))] @ M2.T)[:, :3]
                Nw = None
                if N is not None:
                    Nm = np.linalg.inv(M2[:3, :3]).T; Nw = N @ Nm.T
                    Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-9)
                T = idx.reshape(-1, 3)
                if np.linalg.det(M2[:3, :3]) < 0: T = T[:, [0, 2, 1]]
                out.append({'path': p2, 'mi': mi, 'info': info, 'P': Pw, 'N': Nw, 'UV': UV, 'T': T})
        for c in n.get('children', []): walk(c, M2, p2)
    for r in g.j['scenes'][g.j.get('scene', 0)]['nodes']: walk(r, np.eye(4), [])
    return out

def face_normals(P, T):
    n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    N = np.zeros_like(P);
    for k in range(3): np.add.at(N, T[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

def cluster(P, N, UV, T, c, uvq=24, nq=1.4):
    keys = [np.floor(P / c).astype(np.int64)]
    if nq: keys.append(np.round(N * nq).astype(np.int64))
    if UV is not None:
        span = max(1.0, float(np.percentile(UV.max(0) - UV.min(0), 50)) if len(UV) else 1.0)
        keys.append(np.floor(UV * (uvq / span)).astype(np.int64))
    K = np.concatenate(keys, 1)
    _, inv = np.unique(K, axis=0, return_inverse=True); inv = inv.reshape(-1)
    m = inv.max() + 1
    cnt = np.bincount(inv, minlength=m).astype(float)[:, None]
    def avg(A):
        o = np.zeros((m, A.shape[1])); np.add.at(o, inv, A); return o / cnt
    P2 = avg(P); N2 = avg(N); N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
    UV2 = avg(UV) if UV is not None else None
    T2 = inv[T]
    ok = (T2[:, 0] != T2[:, 1]) & (T2[:, 1] != T2[:, 2]) & (T2[:, 0] != T2[:, 2])
    T2 = T2[ok]
    # একই ত্রিভুজ দুবার থাকলে একটা (ঘোরার দিক রেখে)
    r = np.argmin(T2, 1); idx = np.arange(len(T2))
    can = np.stack([T2[idx, r], T2[idx, (r + 1) % 3], T2[idx, (r + 2) % 3]], 1)
    _, ui = np.unique(can, axis=0, return_index=True)
    T2 = T2[np.sort(ui)]
    used = np.unique(T2); remap = -np.ones(m, np.int64); remap[used] = np.arange(len(used))
    return P2[used], N2[used], (UV2[used] if UV2 is not None else None), remap[T2]

_here = os.path.dirname(os.path.abspath(__file__))
# simp.cpp থেকে বানানো: g++ -O2 -o simp simp.cpp
SIMP = next((p for p in (os.path.join(_here, 'simp'), os.path.join(_here, '..', 'qem', 'simp')) if os.path.exists(p)), os.path.join(_here, 'simp'))

def crease_normals(P, T, ang=50):
    # কোণ ৫০°-এর বেশি হলে আলাদা ধার (গাড়ির প্যানেলের খাঁজ ধারালো), কম হলে মসৃণ
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    fa = np.linalg.norm(fn, axis=1, keepdims=True); fu = fn / np.maximum(fa, 1e-20)
    nv = len(P); cosl = math.cos(math.radians(ang))
    corner_v = T.reshape(-1); corner_f = np.repeat(np.arange(len(T)), 3)
    order = np.argsort(corner_v, kind='stable'); cv = corner_v[order]; cf = corner_f[order]
    starts = np.searchsorted(cv, np.arange(nv + 1))
    cn = np.zeros((len(corner_v), 3))
    for v in range(nv):
        a0, a1 = starts[v], starts[v + 1]
        if a0 == a1: continue
        fs = cf[a0:a1]; U = fu[fs]; W = fn[fs]
        M = (U @ U.T) >= cosl  # কোন মুখগুলো একসাথে মসৃণ
        acc = M.astype(float) @ W
        cn[order[a0:a1]] = acc / np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-20)
    return cn  # প্রতি কোণার দিক

def qem(P, UV, T, target):
    if not os.path.exists(SIMP): return None
    # একই জায়গা + একই UV/রং হলে জোড়া (না হলে ত্রিভুজগুলো আলাদা থাকে, কমানো যায় না)
    keys = [np.round(P * 1e5).astype(np.int64)]
    if UV is not None: keys.append(np.round(UV * 1e4).astype(np.int64))
    _, first, inv = np.unique(np.concatenate(keys, 1), axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); Pw = P[first]; Aw = UV[first] if UV is not None else np.zeros((len(first), 0))
    Tw = inv[T]
    K = Aw.shape[1]
    buf = np.array([len(Pw), len(Tw), K, int(target)], np.int32).tobytes() + Pw.astype(np.float32).tobytes() + Aw.astype(np.float32).tobytes() + Tw.astype(np.uint32).tobytes()
    r = subprocess.run([SIMP], input=buf, capture_output=True)
    if r.returncode: return None
    o = r.stdout; nv, nt, K2, _ = np.frombuffer(o[:16], np.int32)
    off = 16; P2 = np.frombuffer(o[off:off + nv * 12], np.float32).reshape(nv, 3).astype(float); off += nv * 12
    A2 = np.frombuffer(o[off:off + nv * K2 * 4], np.float32).reshape(nv, K2).astype(float); off += nv * K2 * 4
    T2 = np.frombuffer(o[off:off + nt * 12], np.uint32).reshape(nt, 3).astype(np.int64)
    # ধারালো কোণে ভার্টেক্স ভাগ করে দিক বসানো
    cn = crease_normals(P2, T2)
    cv = T2.reshape(-1)
    key = np.concatenate([cv[:, None], np.round(cn * 20).astype(np.int64)], 1)
    _, fi, inv2 = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv2 = inv2.reshape(-1)
    Pn = P2[cv[fi]]; Nn = np.zeros((len(fi), 3)); np.add.at(Nn, inv2, cn); Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-20)
    An = A2[cv[fi]] if UV is not None else None
    return Pn, Nn, An, inv2.reshape(-1, 3)

def decimate(P, N, UV, T, target, size):
    if len(T) <= target: return P, N, UV, T
    q = qem(P, UV, T, target)
    if q is not None and len(q[3]) <= target * 1.6: return q
    # আগে UV সীমানা রেখে; লক্ষ্যে না পৌঁছালে UV-র ভাগ মোটা করে (ছোট যন্ত্রাংশে টেক্সচার একটু গলে যায়, সমস্যা নেই)
    res = None
    for uvq, nq in ((24, 1.4), (8, 1.4), (2, 0.8), (0, 0.8), (0, 0)):
        lo, hi = size * 1e-4, size * 0.08
        best = None
        for _ in range(16):
            c = math.sqrt(lo * hi)
            r = cluster(P, N, UV if uvq else None, T, c, uvq or 24, nq)
            if len(r[3]) > target: lo = c
            else: hi = c; best = r
        if best is None: best = cluster(P, N, UV if uvq else None, T, hi, uvq or 24, nq)
        if not uvq and UV is not None:
            # UV ছাড়া জোড়া দিলেও ছবির রং রাখতে: প্রতিটা নতুন ভার্টেক্সে কাছের পুরোনো ভার্টেক্সের UV
            Pn = best[0]; key = np.floor(P / (size * 0.002)).astype(np.int64)
            idx = nearest(P, Pn)
            best = (best[0], best[1], UV[idx], best[3])
        res = best
        if len(best[3]) <= target * 1.3: break
    return res

def nearest(P, Q):
    """Q-র প্রতিটা বিন্দুর জন্য P-র সবচেয়ে কাছের বিন্দুর সূচক (গ্রিড দিয়ে)"""
    c = max(1e-6, float(np.ptp(P, 0).max()) / 64)
    from collections import defaultdict
    grid = defaultdict(list)
    K = np.floor(P / c).astype(np.int64)
    for i, k in enumerate(map(tuple, K)): grid[k].append(i)
    out = np.zeros(len(Q), np.int64)
    KQ = np.floor(Q / c).astype(np.int64)
    for j, k in enumerate(KQ):
        cand = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    cand += grid.get((k[0] + dx, k[1] + dy, k[2] + dz), [])
        if not cand: cand = [int(np.argmin(((P - Q[j]) ** 2).sum(1)))]
        cand = np.array(cand); out[j] = cand[np.argmin(((P[cand] - Q[j]) ** 2).sum(1))]
    return out

def components(P, T, cell):
    """ছোঁয়া-লাগা অংশ আলাদা (চাকাগুলো): মোটা গ্রিডে ভরা ঘর জুড়ে জুড়ে"""
    C = np.floor(P / cell).astype(np.int64)
    keys = {tuple(k) for k in np.unique(C, axis=0)}
    lab = {}; cur = 0
    for k in keys:
        if k in lab: continue
        st = [k]; lab[k] = cur
        while st:
            a = st.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        b = (a[0] + dx, a[1] + dy, a[2] + dz)
                        if b in keys and b not in lab: lab[b] = cur; st.append(b)
        cur += 1
    vl = np.array([lab[tuple(k)] for k in C])
    return vl[T[:, 0]], cur

def rotY(deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def convert(cfg, src, outdir):
    name = cfg['name']
    g = G(src)
    items = collect(g, cfg.get('skip'))
    allP = np.concatenate([it['P'] for it in items])
    if cfg.get('crop'):
        # একই ফাইলে কয়েকটা মডেল পাশাপাশি: x-এর ভগ্নাংশ দিয়ে একটা কেটে নেওয়া
        ax = cfg.get('cropAxis', 0); lo0, hi0 = allP[:, ax].min(), allP[:, ax].max(); f0, f1 = cfg['crop']
        keep = []
        for it in items:
            fr = (it['P'][it['T']].mean(1)[:, ax] - lo0) / (hi0 - lo0)
            m = (fr >= f0) & (fr < f1)
            if not m.any(): continue
            T = it['T'][m]; u = np.unique(T); rm = -np.ones(len(it['P']), np.int64); rm[u] = np.arange(len(u))
            it['T'] = rm[T]; it['P'] = it['P'][u]
            if it['N'] is not None: it['N'] = it['N'][u]
            if it['UV'] is not None: it['UV'] = it['UV'][u]
            keep.append(it)
        items = keep
        allP = np.concatenate([it['P'] for it in items])
    R = np.eye(3)
    if cfg.get('upz'): R = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.0]])  # Z-উপরে → Y-উপরে
    if cfg.get('pca'):
        Q0 = allP @ R.T; xz = Q0[:, [0, 2]] - Q0[:, [0, 2]].mean(0)
        w, v = np.linalg.eigh(xz.T @ xz); ax0 = v[:, 1]
        R = rotY(-math.degrees(math.atan2(ax0[0], ax0[1]))) @ R
        Q1 = allP @ R.T
        print('  pca check ext', np.round(Q1.max(0) - Q1.min(0), 2))
    R = rotY(cfg.get('yaw', 0)) @ R
    Q = allP @ R.T
    lo, hi = Q.min(0), Q.max(0)
    # লম্বা দিক z হওয়া উচিত
    L = hi[2] - lo[2]
    sc = cfg['height'] / (hi - lo)[1] if cfg.get('height') else cfg['len'] / (cfg.get('lenAxis') and (hi - lo)[cfg['lenAxis']] or L)
    ctr = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    print(f'{name}: raw ext {np.round(hi - lo, 3)}  scale {sc:.4f}  items {len(items)}')
    groups = {}  # (group, matkey) → lists
    def group_of(it):
        for gname, rx in cfg.get('groups', {}).items():
            s = '/'.join(it['path']) + '|' + it['info']['name']
            if re.search(rx, s, re.I): return gname
        return 'body'
    ext = (hi - lo) * sc
    def split_items(it):
        P = (it['P'] @ R.T - ctr) * sc
        N = it['N'] @ R.T if it['N'] is not None else face_normals(P, it['T'])
        for rx, colr in cfg.get('colors', {}).items():
            if re.search(rx, '/'.join(it['path']), re.I):
                it['info'] = dict(it['info'], color=[int(colr[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1], name=it['info']['name'] + '_' + colr, tex=None)
                it['UV'] = None
                break
        T = it['T']; rest = np.ones(len(T), bool)
        fr = (P[T].mean(1) - np.array([-ext[0] / 2, 0, -ext[2] / 2])) / ext
        for gname, box in cfg.get('boxes', {}).items():
            m = rest & np.all(fr >= box[:3], 1) & np.all(fr <= box[3:], 1)
            if m.any(): yield gname, P, N, T[m]; rest &= ~m
        if rest.any():
            Z = cfg.get('zones')
            if not Z: yield None, P, N, T[rest]; return
            # এলাকা অনুযায়ী রং (টেক্সচারহীন মডেল): প্রথম মিলে যাওয়া নিয়ম
            Tr = T[rest]; C = P[Tr].mean(1); left = np.ones(len(Tr), bool)
            for z in Z + [{'c': cfg.get('zdef', 'cccccc')}]:
                m = left.copy()
                if 'box' in z: b = z['box']; m &= np.all(C >= b[:3], 1) & np.all(C <= b[3:], 1)
                if 'cyl' in z:
                    cy, cz, r0, r1 = z['cyl']; r = np.hypot(C[:, 1] - cy, C[:, 2] - cz); m &= (r >= r0) & (r <= r1)
                    if 'x' in z: m &= (C[:, 0] >= z['x'][0]) & (C[:, 0] <= z['x'][1])
                if not m.any(): continue
                left &= ~m
                yield ('zone:' + z['c'], P, N, Tr[m])
    for it in items:
      for bg, P, N, Tsub in split_items(it):
        info = it['info']; uv = it['UV']
        if bg and bg.startswith('zone:'):
            colr = bg[5:]; bg = None; uv = None
            info = dict(info, tex=None, name='z' + colr, color=[int(colr[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1])
        gk = bg or group_of(it)
        # রঙিন (টেক্সচারহীন) অংশগুলো এক ম্যাটেরিয়ালে, রং ভার্টেক্সে: অনেক কম ড্র-কল
        if cfg.get('mergeSolid', True) and info['tex'] is None and not info['blend'] and not re.search(r'glass|window|paint|paitn|roof_light', info['name'], re.I) and not any(info['emis']):
            uv = np.tile(np.array(info['color'][:3], float), (len(P), 1))
            info = {'name': '__solid', 'color': [1, 1, 1, 1], 'tex': None, 'tc': 0, 'blend': False, 'emis': [0, 0, 0], 'ds': True, 'metal': 0, 'rough': 1}
        mk = info['name']
        e = groups.setdefault((gk, mk), {'P': [], 'N': [], 'UV': [], 'T': [], 'n': 0, 'info': info, 'hasuv': True})
        e['T'].append(Tsub + e['n']); e['n'] += len(P)
        e['P'].append(P); e['N'].append(N)
        if uv is None: e['hasuv'] = False
        e['UV'].append(uv if uv is not None else np.zeros((len(P), 2)))
    total = sum(sum(len(t) for t in e['T']) for e in groups.values())
    frac = min(1.0, cfg['tris'] / total)
    size = cfg.get('len') or cfg['height']
    out = {'asset': {'version': '2.0', 'generator': 'shohorer-pothe vconv'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
           'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
           'accessors': [], 'bufferViews': [], 'buffers': []}
    blob = bytearray()
    def add_acc(arr, typ, ctype, target=None, mm=False):
        nonlocal blob
        while len(blob) % 4: blob.append(0)
        b = arr.tobytes(); bv = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(b)}
        if target: bv['target'] = target
        out['bufferViews'].append(bv); blob += b
        a = {'bufferView': len(out['bufferViews']) - 1, 'componentType': ctype, 'count': len(arr), 'type': typ}
        if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        out['accessors'].append(a); return len(out['accessors']) - 1
    imgmap = {}; matmap = {}
    def add_mat(info, hasuv):
        key = (info['name'], hasuv)
        if key in matmap: return matmap[key]
        m = {'name': info['name'], 'pbrMetallicRoughness': {'baseColorFactor': [round(float(x), 4) for x in info['color']],
             'metallicFactor': float(info.get('metal', 0)), 'roughnessFactor': float(info.get('rough', 1))}}
        if info['blend']: m['alphaMode'] = 'BLEND'
        if info.get('mask'): m['alphaMode'] = 'MASK'
        if info['ds']: m['doubleSided'] = True
        if any(info['emis']): m['emissiveFactor'] = [float(x) for x in info['emis'][:3]]
        if info['tex'] is not None and hasuv:
            if info['tex'] not in imgmap:
                im = g.j['images'][info['tex']]
                if 'uri' in im: pil = Image.open(f'{src}/{im["uri"]}')
                else:
                    bv = g.j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
                    pil = Image.open(io.BytesIO(g.bufs[bv['buffer']][o:o + bv['byteLength']]))
                pil.load()
                mx = cfg.get('texmax', 512)
                if max(pil.size) > mx:
                    k = mx / max(pil.size); pil = pil.resize((max(4, int(pil.size[0] * k)), max(4, int(pil.size[1] * k))), Image.LANCZOS)
                alpha = pil.mode in ('RGBA', 'LA', 'P') and np.array(pil.convert('RGBA'))[..., 3].min() < 250
                fn = f'veh_{name}_{len(imgmap)}.' + ('png' if alpha else 'jpg')
                if alpha: pil.convert('RGBA').save(f'{outdir}/{fn}', optimize=True)
                else: pil.convert('RGB').save(f'{outdir}/{fn}', quality=80)
                out['images'].append({'uri': fn}); out['textures'].append({'sampler': 0, 'source': len(out['images']) - 1})
                imgmap[info['tex']] = len(out['textures']) - 1
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': imgmap[info['tex']]}
        out['materials'].append(m); matmap[key] = len(out['materials']) - 1
        return matmap[key]
    def prim(P, N, UV, T, mat, solid=False):
        A = {'POSITION': add_acc(P.astype(np.float32), 'VEC3', 5126, 34962, True), 'NORMAL': add_acc(N.astype(np.float32), 'VEC3', 5126, 34962)}
        if solid and UV is not None: A['COLOR_0'] = add_acc(np.clip(UV[:, :3], 0, 1).astype(np.float32), 'VEC3', 5126, 34962)
        elif UV is not None: A['TEXCOORD_0'] = add_acc(UV.astype(np.float32), 'VEC2', 5126, 34962)
        it = T.reshape(-1).astype(np.uint16 if len(P) < 65536 else np.uint32)
        return {'attributes': A, 'indices': add_acc(it.reshape(-1, 1), 'SCALAR', 5123 if it.dtype == np.uint16 else 5125, 34963), 'material': mat}
    bygroup = {}
    stats = 0
    for (gk, mk), e in groups.items():
        P = np.concatenate(e['P']); N = np.concatenate(e['N']); UV = np.concatenate(e['UV']) if e['hasuv'] else None; T = np.concatenate(e['T'])
        tgt = max(12, int(len(T) * frac * cfg.get('gmul', {}).get(gk, 1)))
        P, N, UV, T = decimate(P, N, UV, T, tgt, size)
        if UV is not None and e['info']['tex'] is None and e['info']['name'] != '__solid': UV = None
        stats += len(T)
        bygroup.setdefault(gk, []).append((P, N, UV, T, e['info'], e['hasuv']))
    meta = {'len': cfg.get('len'), 'wheels': [], 'rotors': []}
    def emit(nodename, parts, center=None):
        prims = []
        for P, N, UV, T, info, hasuv in parts:
            if center is not None: P = P - center
            sol = info['name'] == '__solid'
            prims.append(prim(P, N, UV, T, add_mat(info, (hasuv and UV is not None) and not sol), sol))
        if not prims: return
        out['meshes'].append({'name': nodename, 'primitives': prims})
        nd = {'name': nodename, 'mesh': len(out['meshes']) - 1}
        if center is not None: nd['translation'] = [round(float(x), 4) for x in center]
        out['nodes'].append(nd); out['scenes'][0]['nodes'].append(len(out['nodes']) - 1)
    for gk in sorted(bygroup, key=lambda k: k == 'body'):
        parts = bygroup[gk]
        if gk in ('wheel', 'rotor', 'tail') and cfg.get('split', {}).get(gk, True):
            # অংশগুলো আলাদা করা (চাকা চারটা আলাদা ঘোরে)
            P = np.concatenate([p[0] for p in parts])
            offs = np.cumsum([0] + [len(p[0]) for p in parts])
            T = np.concatenate([p[3] + offs[i] for i, p in enumerate(parts)])
            if gk == 'wheel':
                lab, n = components(P, T, cfg.get('wcell', size * 0.012))
                # প্রতিটা অংশের মাঝখান; ছোট টুকরো কাছের বড়টায়
                cents = []
                for k in range(n):
                    sel = np.unique(T[lab == k]);
                    if len(sel) == 0: cents.append(None); continue
                    cents.append((P[sel].min(0), P[sel].max(0), len(sel)))
                # চাকা = মাটি ছোঁয়া গোল অংশ (মাঝখানের উচ্চতা ≈ ব্যাসার্ধ); অতিরিক্ত চাকা (স্পেয়ার) বডিতে থাকে
                def touches(k):
                    lo3, hi3 = cents[k][0], cents[k][1]; r = (hi3[1] - lo3[1]) / 2
                    return r > size * cfg.get('wmin', 0.03) and lo3[1] < r * 0.35
                big = [k for k in range(n) if cents[k] and touches(k)]
                # একই চাকা (টায়ার আর রিম আলাদা অংশ হলেও): মাঝখান কাছাকাছি হলে এক
                wh = []
                for k in big:
                    c = (cents[k][0] + cents[k][1]) / 2
                    for w in wh:
                        if np.linalg.norm(w['c'][[0, 2]] - c[[0, 2]]) < size * cfg.get('wmerge', 0.08): w['ks'].append(k); w['r'] = max(w['r'], (cents[k][1][1] - cents[k][0][1]) / 2); break
                    else: wh.append({'c': c, 'ks': [k], 'r': (cents[k][1][1] - cents[k][0][1]) / 2})
                assign = {}
                for k in range(n):
                    if not cents[k]: continue
                    c = (cents[k][0] + cents[k][1]) / 2
                    if not wh: continue
                    d = [np.linalg.norm(w['c'] - c) for w in wh]; j = int(np.argmin(d))
                    if d[j] < wh[j]['r'] * 1.1: assign[k] = j
                toff = np.cumsum([0] + [len(p[3]) for p in parts])
                tri_w = np.array([assign.get(int(x), -1) for x in lab])
                for wi, w in enumerate(wh):
                    sub = []
                    for i, p in enumerate(parts):
                        mask = tri_w[toff[i]:toff[i + 1]] == wi
                        if not mask.any(): continue
                        Tm = p[3][mask]; used = np.unique(Tm); rm = -np.ones(len(p[0]), np.int64); rm[used] = np.arange(len(used))
                        sub.append((p[0][used], p[1][used], p[2][used] if p[2] is not None else None, rm[Tm], p[4], p[5]))
                    c = w['c']
                    emit(f'wheel{wi}', sub, c)
                    meta['wheels'].append({'x': round(float(c[0]), 3), 'y': round(float(c[1]), 3), 'z': round(float(c[2]), 3), 'r': round(float(w['r']), 3)})
                # কোনো চাকার কাছে নেই এমন টুকরো → বডি
                for i, p in enumerate(parts):
                    mask = tri_w[toff[i]:toff[i + 1]] < 0
                    if not mask.any(): continue
                    Tm = p[3][mask]; used = np.unique(Tm); rm = -np.ones(len(p[0]), np.int64); rm[used] = np.arange(len(used))
                    bygroup.setdefault('body', []).append((p[0][used], p[1][used], p[2][used] if p[2] is not None else None, rm[Tm], p[4], p[5]))
            else:
                lo2, hi2 = P.min(0), P.max(0); c = (lo2 + hi2) / 2
                if gk == 'rotor':
                    # রোটরের অক্ষ: ব্লেডের মাঝখান = সবচেয়ে ঘন জায়গা (হাব)
                    c[0] = np.median(P[:, 0]); c[2] = np.median(P[:, 2]); c[1] = lo2[1]
                emit(gk, parts, c)
                meta['rotors'].append({'name': gk, 'x': round(float(c[0]), 3), 'y': round(float(c[1]), 3), 'z': round(float(c[2]), 3), 'ax': 'y' if gk == 'rotor' else 'x'})
        else:
            emit(gk, parts)
    out['buffers'].append({'byteLength': len(blob), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(blob)).decode()})
    out['extras'] = meta
    allq = np.concatenate([(it['P'] @ R.T - ctr) * sc for it in items])
    meta['ext'] = [round(float(x), 3) for x in (allq.max(0) - allq.min(0))]
    fn = f'{outdir}/veh_{name}.gltf.json'
    json.dump(out, open(fn, 'w'), separators=(',', ':'))
    print(f'  → {stats} tris (from {total}), ext {meta["ext"]}, wheels {len(meta["wheels"])}, {os.path.getsize(fn) // 1024} KB, imgs {len(imgmap)}')
    return meta

if __name__ == '__main__':
    cfgs = json.load(open(sys.argv[1]))
    only = sys.argv[4:]
    res = {}
    for c in cfgs:
        if only and c['name'] not in only: continue
        res[c['name']] = convert(c, f"{sys.argv[2]}/{c['src']}", sys.argv[3])
    print(json.dumps(res))
