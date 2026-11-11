import sys, io, json, struct; sys.path.insert(0,'.')
import numpy as np
from fbxparse import *
from PIL import Image
SRC = sys.argv[1]; OUT = sys.argv[2]; TEX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
nodes = parse(SRC)
objs = [n for n in nodes if n['name']=='Objects'][0]
byid = {c['props'][0]: c for c in objs['ch']}
conns = [n for n in nodes if n['name']=='Connections'][0]['ch']
children = {}; parents = {}
for c in conns:
    a, b = c['props'][1], c['props'][2]
    children.setdefault(b, []).append((a, c['props'][3] if len(c['props']) > 3 else None))
    parents.setdefault(a, []).append(b)
nm = lambda o: o['props'][1].split('\x00')[0]
def M(arr): return np.array(arr, float).reshape(4, 4).T  # FBX column-major -> numpy row-major
# bones
bones = [c for c in objs['ch'] if c['name']=='Model' and c['props'][2]=='LimbNode']
bid = {b['props'][0]: i for i, b in enumerate(bones)}
G = {}
for p in [c for c in objs['ch'] if c['name']=='Pose']:
    for pn in find(p, 'PoseNode'):
        G.setdefault(one(pn,'Node')['props'][0], M(one(pn,'Matrix')['props'][0]))
# cluster TransformLink is the authoritative bind for skinned bones
meshes = [c for c in objs['ch'] if c['name']=='Model' and c['props'][2]=='Mesh']
clusterLink = {}
mesh_data = []
for m in meshes:
    mid = m['props'][0]
    geo = next(byid[a] for a, _ in children.get(mid, []) if byid.get(a, {}).get('name') == 'Geometry')
    mat = next(nm(byid[a]) for a, _ in children.get(mid, []) if byid.get(a, {}).get('name') == 'Material')
    skin = next(byid[a] for a, _ in children.get(geo['props'][0], []) if byid.get(a, {}).get('name') == 'Deformer')
    V = np.array(one(geo,'Vertices')['props'][0], float).reshape(-1, 3)
    PI = np.array(one(geo,'PolygonVertexIndex')['props'][0], np.int64)
    N = np.array(one(one(geo,'LayerElementNormal'),'Normals')['props'][0], float).reshape(-1, 3)
    luv = one(geo,'LayerElementUV'); UV = np.array(one(luv,'UV')['props'][0], float).reshape(-1, 2); UVI = np.array(one(luv,'UVIndex')['props'][0], np.int64)
    W = [[] for _ in range(len(V))]; meshG = None
    for a, _ in children.get(skin['props'][0], []):
        cl = byid[a]
        if cl['name'] != 'Deformer': continue
        bone = next(x for x, _ in children.get(a, []) if x in bid)
        idx = one(cl,'Indexes'); wts = one(cl,'Weights')
        meshG = M(one(cl,'Transform')['props'][0])
        link = M(one(cl,'TransformLink')['props'][0])
        clusterLink[bone] = link
        if idx is None: continue
        for i, w in zip(idx['props'][0], wts['props'][0]): W[i].append((bid[bone], w))
    # TransformLink is bone_global at bind; Transform is the inverse? (FBX: Transform = mesh global * ... ) handle below
    mesh_data.append(dict(name=nm(m), mat=mat, V=V, PI=PI, N=N, UV=UV, UVI=UVI, W=W, T=meshG))
print('meshes', [(d['name'], d['mat'], len(d['V'])) for d in mesh_data])
for b in bones:
    if b['props'][0] not in G and b['props'][0] not in clusterLink: print('no bind', nm(b))
Gb = [clusterLink.get(b['props'][0], G.get(b['props'][0])) for b in bones]
# FBX cluster 'Transform' = inverse(bone bind) * mesh bind? Most exporters: Transform = mesh global at bind. Check with Hips
print('T sample', np.round(mesh_data[0]['T'], 3))
print('hips', np.round(Gb[0], 3))
np.save('bones.npy', np.array(Gb))
json.dump([nm(b) for b in bones], open('bones.json', 'w'))
import pickle; pickle.dump(dict(mesh_data=mesh_data, Gb=Gb, bones=[nm(b) for b in bones], parent=[next((bid[p] for p in parents.get(b['props'][0], []) if p in bid), -1) for b in bones]), open('scene.pkl', 'wb'))
