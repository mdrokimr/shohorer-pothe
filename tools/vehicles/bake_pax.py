# আসল চরিত্রকে বাসযাত্রীর তিন ভঙ্গিতে (বসা, দাঁড়িয়ে হাতল, দরজায় ঝোলা) স্থির মেশ বানানো, ত্রিভুজ কমানো
import sys, json, subprocess, base64, numpy as np
sys.path.insert(0, '.'); sys.path.insert(0, '../vtools')
from glbview import load
import vconv
POSES = [
  ['sit', 0, 0, None, {'hL': 1.45, 'hR': 1.45, 'kL': -1.45, 'kR': -1.45, 'hzL': -0.08, 'hzR': 0.08, 'sL': 0.45, 'sR': 0.45, 'eL': 0.75, 'eR': 0.75, 'szL': 0.12, 'szR': -0.12}],  # দুই পা সমান, হাত কোলে
  ['idle', 0, 0, None, {'sR': 2.45, 'eR': 1.05, 'szR': -0.18, 'headY': 0.15}],
  ['idle', 0, 0, None, {'sR': 2.55, 'eR': 0.45, 'szR': -0.25, 'sL': 0.5, 'szL': 0.85, 'eL': 0.5, 'hipRoll': 0.22, 'lean': 0.05,
                        'hL': 0.55, 'kL': -1.0, 'hzL': -0.45, 'hR': 0.05, 'kR': -0.15, 'headY': -0.5, 'twist': -0.15}],
]
NAMES = ['sit', 'stand', 'hang']
subprocess.run(['node', 'posetest.mjs', json.dumps(POSES), 'posed_pax.json'], check=True)
J, acc, imgs = load('player.glb'); R0 = json.load(open('rig.json')); P0 = json.load(open('posed_pax.json'))
def qm(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
IBM = acc(J['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
parent = R0['parent']; nb = len(parent)
wrap = np.eye(4); wrap[:3, :3] = qm([0, 1, 0, 0])
TGT = {0: 1100, 1: 320}  # শরীর, চুল
out = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [], 'buffers': [],
       'materials': [{'name': 'body', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1]}}, {'name': 'hair', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1]}, 'alphaMode': 'MASK'}], 'extras': {'anchors': {}}}
blob = bytearray()
def add(arr, ctype, typ, target):
    while len(blob) % 4: blob.append(0)
    off = len(blob); b = arr.tobytes(); blob.extend(b)
    out['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': target})
    a = {'bufferView': len(out['bufferViews']) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if typ == 'VEC3' and ctype == 5126: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    out['accessors'].append(a); return len(out['accessors']) - 1
preview = []
hipsI = [b.split(':')[-1] for b in R0['bones']].index('Hips')
for pi, po in enumerate(P0['out']):
    Wm = [None] * nb
    def world(i):
        if Wm[i] is not None: return Wm[i]
        L = np.eye(4); L[:3, :3] = qm(po['q'][i]); t = np.array(R0['local'][i][0], float)
        if parent[i] < 0: t = t + np.array([-po['dx'], po['dy'], 0])
        L[:3, 3] = t
        Wm[i] = (world(parent[i]) if parent[i] >= 0 else wrap) @ L; return Wm[i]
    SK = np.array([world(i) @ IBM[i] for i in range(nb)])
    prims = []; allp = []
    for pr in J['meshes'][0]['primitives']:
        pos = acc(pr['attributes']['POSITION']).astype(float); nor = acc(pr['attributes']['NORMAL']).astype(float)
        jo = acc(pr['attributes']['JOINTS_0']).astype(int); we = acc(pr['attributes']['WEIGHTS_0']).astype(float)
        uv = acc(pr['attributes']['TEXCOORD_0']).astype(float); T = acc(pr['indices']).reshape(-1, 3).astype(np.int64)
        M = np.einsum('vk,vkij->vij', we, SK[jo])
        p2 = np.einsum('vij,vj->vi', M[:, :3, :3], pos) + M[:, :3, 3]
        allp.append(p2); prims.append((pr['material'], p2, uv, T))
    A = np.concatenate(allp)
    # নোঙর: পায়ের নিচ y=0, মাঝখান x/z=0 (কোমর অনুযায়ী)
    hipsW = Wm[hipsI][:3, 3] if hipsI is not None else A.mean(0)
    base = np.array([hipsW[0], A[:, 1].min(), hipsW[2]])
    mesh = {'name': NAMES[pi], 'primitives': []}
    for mat, p2, uv, T in prims:
        P = p2 - base
        q = vconv.qem(P, uv, T, TGT.get(mat, 400))
        if q is None: raise SystemExit('simp missing')
        Pn, Nn, An, Tn = q
        attrs = {'POSITION': add(Pn.astype(np.float32), 5126, 'VEC3', 34962), 'NORMAL': add(Nn.astype(np.float32), 5126, 'VEC3', 34962), 'TEXCOORD_0': add(An.astype(np.float32), 5126, 'VEC2', 34962)}
        I = Tn.reshape(-1).astype(np.uint16 if len(Pn) < 65536 else np.uint32).reshape(-1, 1)
        mesh['primitives'].append({'attributes': attrs, 'indices': add(I, 5123 if I.dtype == np.uint16 else 5125, 'SCALAR', 34963), 'material': mat})
        preview.append((pi, mat, Pn, An, Tn))
        print(NAMES[pi], 'mat', mat, len(T), '->', len(Tn))
    out['meshes'].append(mesh); out['nodes'].append({'name': 'pax_' + NAMES[pi], 'mesh': len(out['meshes']) - 1}); out['scenes'][0]['nodes'].append(len(out['nodes']) - 1)
    out['extras']['anchors'][NAMES[pi]] = {'hipY': float(hipsW[1] - base[1]), 'minY': 0, 'maxY': float(A[:, 1].max() - base[1])}
out['buffers'] = [{'byteLength': len(blob), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(blob)).decode()}]
json.dump(out, open('pax.gltf.json', 'w'), separators=(',', ':'))
np.save('pax_preview.npy', np.array(preview, dtype=object), allow_pickle=True)
print(json.dumps(out['extras']['anchors']))
