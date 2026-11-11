# KHR_mesh_quantization: অবস্থান int16 (নোডে সমান স্কেল), দিক int8, রং uint8 — ফাইল প্রায় অর্ধেক, দেখতে একই
import json, base64, sys, numpy as np
CT = {5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
for fn in sys.argv[1:]:
    J = json.load(open(fn)); blob = base64.b64decode(J['buffers'][0]['uri'].split(',', 1)[1])
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
        return np.frombuffer(blob, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)
    S = 0
    for nd in J['nodes']:
        if 'mesh' not in nd: continue
        for p in J['meshes'][nd['mesh']]['primitives']: S = max(S, float(np.abs(acc(p['attributes']['POSITION'])).max()))
    S *= 1.0001
    out = bytearray(); views = []; accs = []
    def add(arr, ctype, typ, norm=False, target=34962, mm=False):
        while len(out) % 4: out.append(0)
        off = len(out); b = arr.tobytes(); out.extend(b)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(b)}
        if target: v['target'] = target
        if target == 34962 and arr.dtype.itemsize * arr.shape[1] % 4: pass
        views.append(v)
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if norm: a['normalized'] = True
        if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    for nd in J['nodes']:
        if 'mesh' not in nd: continue
        nd['scale'] = [S, S, S]
        for p in J['meshes'][nd['mesh']]['primitives']:
            A = p['attributes']; na = {}
            P = acc(A['POSITION']).astype(np.float64) / S
            q = np.round(P * 32767).astype(np.int16); q4 = np.zeros((len(q), 4), np.int16); q4[:, :3] = q
            na['POSITION'] = add(q4[:, :3].copy() if False else q4, 5122, 'VEC4', True)  # ৪ ঘরে ভরাট (সারিবদ্ধতা)
            accs[na['POSITION']]['type'] = 'VEC3'
            views[-1]['byteStride'] = 8
            accs[na['POSITION']]['min'] = q.min(0).astype(int).tolist(); accs[na['POSITION']]['max'] = q.max(0).astype(int).tolist()  # three.js কাঁচা int ধরে স্কেল করে
            N = acc(A['NORMAL']).astype(np.float64); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
            n4 = np.zeros((len(N), 4), np.int8); n4[:, :3] = np.round(N * 127).astype(np.int8)
            na['NORMAL'] = add(n4, 5120, 'VEC3', True); views[-1]['byteStride'] = 4
            if 'COLOR_0' in A:
                C = np.clip(acc(A['COLOR_0']).astype(np.float64), 0, 1)
                c4 = np.full((len(C), 4), 255, np.uint8); c4[:, :C.shape[1]] = np.round(C * 255).astype(np.uint8)
                na['COLOR_0'] = add(c4, 5121, 'VEC3', True); views[-1]['byteStride'] = 4
            if 'TEXCOORD_0' in A:
                na['TEXCOORD_0'] = add(acc(A['TEXCOORD_0']).astype(np.float32), 5126, 'VEC2')
            I = acc(p['indices']).reshape(-1)
            I = I.astype(np.uint16 if I.max() < 65536 else np.uint32).reshape(-1, 1)
            p['indices'] = add(I, 5123 if I.dtype == np.uint16 else 5125, 'SCALAR', target=34963)
            p['attributes'] = na
    J['bufferViews'] = views; J['accessors'] = accs
    J['buffers'] = [{'byteLength': len(out), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(out)).decode()}]
    for k in ('extensionsUsed', 'extensionsRequired'):
        J[k] = sorted(set(J.get(k, [])) | {'KHR_mesh_quantization'})
    json.dump(J, open(fn, 'w'), separators=(',', ':'))
    print(fn.split('/')[-1], 'scale', round(S, 3), 'bytes', len(out))
