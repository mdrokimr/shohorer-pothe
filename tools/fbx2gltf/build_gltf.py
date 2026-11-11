import sys, io, json, struct, pickle
import numpy as np
from PIL import Image
S = pickle.load(open('scene.pkl','rb'))
OUT = sys.argv[1]; TEX = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
SC = 0.01
Gb = [np.array(g) for g in S['Gb']]; bones = S['bones']; parent = S['parent']
nb = len(bones)
def tom(g):
    g = g.copy(); g[:3, 3] *= SC; return g
Gm = [tom(g) for g in Gb]
# local TRS
def decompose(m):
    t = m[:3, 3].copy(); R = m[:3, :3].copy()
    s = np.linalg.norm(R, axis=0); R = R / s
    # quaternion from rotation matrix
    tr = R[0,0]+R[1,1]+R[2,2]
    if tr > 0:
        w = np.sqrt(1+tr)/2; x = (R[2,1]-R[1,2])/(4*w); y = (R[0,2]-R[2,0])/(4*w); z = (R[1,0]-R[0,1])/(4*w)
    elif R[0,0] > R[1,1] and R[0,0] > R[2,2]:
        x = np.sqrt(1+R[0,0]-R[1,1]-R[2,2])/2; w = (R[2,1]-R[1,2])/(4*x); y = (R[0,1]+R[1,0])/(4*x); z = (R[0,2]+R[2,0])/(4*x)
    elif R[1,1] > R[2,2]:
        y = np.sqrt(1+R[1,1]-R[0,0]-R[2,2])/2; w = (R[0,2]-R[2,0])/(4*y); x = (R[0,1]+R[1,0])/(4*y); z = (R[1,2]+R[2,1])/(4*y)
    else:
        z = np.sqrt(1+R[2,2]-R[0,0]-R[1,1])/2; w = (R[1,0]-R[0,1])/(4*z); x = (R[0,2]+R[2,0])/(4*z); y = (R[1,2]+R[2,1])/(4*z)
    q = np.array([x, y, z, w]); q /= np.linalg.norm(q)
    return t, q, s
locals_ = []
for i in range(nb):
    L = Gm[i] if parent[i] < 0 else np.linalg.inv(Gm[parent[i]]) @ Gm[i]
    locals_.append(decompose(L))
# geometry per material
prims = {}
for d in S['mesh_data']:
    V = d['V'] * SC; PI = d['PI']; N = d['N']; UV = d['UV']; UVI = d['UVI']; W = d['W']
    # polygon split
    polys = []; cur = []
    for k, i in enumerate(PI):
        if i < 0: cur.append((~i, k)); polys.append(cur); cur = []
        else: cur.append((i, k))
    P = prims.setdefault(d['mat'], dict(pos=[], nor=[], uv=[], j=[], w=[], idx=[], key={}))
    for poly in polys:
        ids = []
        for cp, k in poly:
            n = N[k]; uvi = UVI[k]
            key = (cp, int(uvi), round(n[0], 2), round(n[1], 2), round(n[2], 2), d['name'])
            vi = P['key'].get(key)
            if vi is None:
                vi = len(P['pos']); P['key'][key] = vi
                P['pos'].append(V[cp]); P['nor'].append(n / (np.linalg.norm(n) or 1)); u = UV[uvi]; P['uv'].append((u[0], 1 - u[1]))
                ws = sorted(W[cp], key=lambda x: -x[1])[:4]
                while len(ws) < 4: ws.append((0, 0.0))
                tot = sum(w for _, w in ws) or 1
                P['j'].append([b for b, _ in ws]); P['w'].append([w / tot for _, w in ws])
            ids.append(vi)
        for a in range(1, len(ids) - 1): P['idx'] += [ids[0], ids[a], ids[a + 1]]
for k, P in prims.items(): print(k, len(P['pos']), 'verts', len(P['idx']) // 3, 'tris')
# textures
def img_bytes(path, size, fmt, mode=None, fn=None):
    im = Image.open(path)
    if fn: im = fn(im)
    if mode: im = im.convert(mode)
    im = im.resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, fmt, quality=86) if fmt == 'JPEG' else im.save(b, fmt, optimize=True); return b.getvalue()
gloss = Image.open('file5.png').convert('L')
def mr(im):
    g = np.array(gloss.resize(im.size), np.float32)
    rough = np.clip(255 - g * 0.85, 60, 255).astype(np.uint8)
    arr = np.zeros((im.size[1], im.size[0], 3), np.uint8); arr[..., 1] = rough
    return Image.fromarray(arr)
images = [
    ('image/jpeg', img_bytes('file9.png', TEX, 'JPEG', 'RGB')),
    ('image/jpeg', img_bytes('file3.png', TEX, 'JPEG', 'RGB')),
    ('image/jpeg', img_bytes('file5.png', TEX // 2, 'JPEG', None, mr)),
    ('image/png', img_bytes('file6.png', TEX // 2, 'PNG', 'RGBA')),
]
# build buffers
bin_ = bytearray(); views = []; accs = []
def add_view(data, target=None):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
def add_acc(arr, ctype, typ, target=None, minmax=False, norm=False):
    vi = add_view(arr.tobytes(), target)
    a = {'bufferView': vi, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if norm: a['normalized'] = True
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
gprims = []
mat_index = {'Ch31_body': 0, 'Ch31_hair': 1}
for k, P in prims.items():
    pos = np.array(P['pos'], np.float32); nor = np.array(P['nor'], np.float32); uv = np.array(P['uv'], np.float32)
    j = np.array(P['j'], np.uint8); w = np.array(P['w'], np.float32)
    idx = np.array(P['idx'], np.uint16 if len(pos) < 65536 else np.uint32)
    attrs = {'POSITION': add_acc(pos, 5126, 'VEC3', 34962, True), 'NORMAL': add_acc(nor, 5126, 'VEC3', 34962),
             'TEXCOORD_0': add_acc(uv, 5126, 'VEC2', 34962), 'JOINTS_0': add_acc(j, 5121, 'VEC4', 34962), 'WEIGHTS_0': add_acc(w, 5126, 'VEC4', 34962)}
    ia = add_acc(idx, 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR', 34963)
    gprims.append({'attributes': attrs, 'indices': ia, 'material': mat_index[k]})
ibm = np.array([np.linalg.inv(Gm[i]).T.reshape(-1) for i in range(nb)], np.float32)  # column-major
ibm_acc = add_acc(ibm, 5126, 'MAT4')
img_json = []
IMGN = ['player_diffuse.jpg', 'player_normal.jpg', 'player_mr.jpg', 'player_hair.png']
for (mime, data), fn in zip(images, IMGN):
    open(fn, 'wb').write(data); img_json.append({'uri': fn, 'mimeType': mime})
nodes = []
for i in range(nb):
    t, q, s = locals_[i]
    n = {'name': bones[i].split(':')[-1], 'translation': t.tolist(), 'rotation': q.tolist()}
    ch = [c for c in range(nb) if parent[c] == i]
    if ch: n['children'] = ch
    nodes.append(n)
roots = [i for i in range(nb) if parent[i] < 0]
mesh_node = len(nodes); nodes.append({'name': 'Character', 'mesh': 0, 'skin': 0})
gltf = {
    'asset': {'version': '2.0', 'generator': 'shohorer-pothe fbx2glb'},
    'scene': 0, 'scenes': [{'nodes': roots + [mesh_node]}],
    'nodes': nodes, 'meshes': [{'name': 'Character', 'primitives': gprims}],
    'skins': [{'joints': list(range(nb)), 'inverseBindMatrices': ibm_acc, 'skeleton': roots[0]}],
    'materials': [
        {'name': 'body', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0, 'metallicRoughnessTexture': {'index': 2}}, 'normalTexture': {'index': 1, 'scale': 1.0}},
        {'name': 'hair', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 3}, 'metallicFactor': 0.0, 'roughnessFactor': 0.75}, 'alphaMode': 'MASK', 'alphaCutoff': 0.4, 'doubleSided': True},
    ],
    'textures': [{'source': 0, 'sampler': 0}, {'source': 1, 'sampler': 0}, {'source': 2, 'sampler': 0}, {'source': 3, 'sampler': 0}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
    'images': img_json, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
}
while len(bin_) % 4: bin_.append(0)
import base64
gltf['buffers'] = [{'byteLength': len(bin_), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(bin_)).decode()}]
open(OUT, 'w').write(json.dumps(gltf, separators=(',', ':')))
glb = open(OUT, 'rb').read()
print('glb', len(glb) / 1e6, 'MB', 'images', [len(d) // 1000 for _, d in images])
json.dump({'bones': bones, 'parent': parent, 'local': [[l[0].tolist(), l[1].tolist()] for l in locals_]}, open('rig.json', 'w'))
