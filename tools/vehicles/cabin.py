# চালকের জায়গায় মডেলের মেঝে আর ছাদের উচ্চতা (z বরাবর ফালি করে)
import sys, json, base64, numpy as np
CT = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}
fn, sx = sys.argv[1], float(sys.argv[2])
J = json.load(open(fn)); blob = base64.b64decode(J['buffers'][0]['uri'].split(',', 1)[1])
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(blob, CT[a['componentType']], a['count'] * NC[a['type']], bv['byteOffset']).reshape(a['count'], -1).astype(float)
C = []; N = []
for nd in J['nodes']:
    if nd['name'].startswith('wheel'): continue
    t = np.array(nd.get('translation', [0, 0, 0]))
    for pr in J['meshes'][nd['mesh']]['primitives']:
        P = acc(pr['attributes']['POSITION']) + t; T = acc(pr['indices']).reshape(-1, 3).astype(int)
        n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        C.append(P[T].mean(1)); N.append(n)
C = np.concatenate(C); N = np.concatenate(N)
ext = J['extras']['ext']; L = ext[2]
print(fn.split('/')[-1], 'ext', ext)
for z in np.arange(-L / 2 + 0.2, L / 2, 0.25):
    s = (np.abs(C[:, 0] - sx) < 0.22) & (np.abs(C[:, 2] - z) < 0.13)
    ys = np.sort(C[s, 1])
    up = np.sort(C[s & (np.abs(N[:, 1]) > 0.5), 1])
    print(f'  z {z:+.2f}  n {s.sum():4d}  horiz-surfaces y: {np.round(up[:: max(1, len(up)//8)], 2)[:9]}')
