# দোতলা বাস: প্যালেটের লাল → গোলাপি (PNG, ঝাপসা না), জানালার ত্রিভুজ আলাদা 'glass' উপাদানে
import json, base64, sys, colorsys, numpy as np
from PIL import Image
src_tex, fn, out = sys.argv[1], sys.argv[2], sys.argv[3]
J = json.load(open(fn)); blob = bytearray(base64.b64decode(J['buffers'][0]['uri'].split(',', 1)[1]))
CT = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(bytes(blob), CT[a['componentType']], a['count'] * NC[a['type']], bv['byteOffset'] + a.get('byteOffset', 0)).reshape(a['count'], -1)
# ১) মূল ১৬×১৬ প্যালেট থেকে গোলাপি
pal = np.array(Image.open(src_tex).convert('RGBA')).astype(float)
PINK = np.array([0xe8, 0x50, 0x8a], float)
H, W = pal.shape[:2]
for y in range(H):
    for x in range(W):
        r, g, b = pal[y, x, :3] / 255
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if (h < 0.06 or h > 0.97) and s > 0.75 and v > 0.3 and y <= 3 and (x, y) != (3, 2):  # গায়ের লাল (৩,২ = পিছনের বাতি, বাদ)
            pal[y, x, :3] = np.minimum(255, PINK * (v / 0.62))
Image.fromarray(pal.astype(np.uint8)).save(out + '/veh_ddbus_0.png')
J['images'][0]['uri'] = 'veh_ddbus_0.png'; J['images'][0].pop('mimeType', None)
# ২) জানালা: প্যালেটের (2,1) ঘর
WIN = {(2, 1)}
J['materials'].append({'name': 'glass', 'pbrMetallicRoughness': {'baseColorFactor': [0.1, 0.12, 0.14, 0.42], 'metallicFactor': 0, 'roughnessFactor': 0.2}, 'alphaMode': 'BLEND', 'doubleSided': True})
GI = len(J['materials']) - 1
for nd in J['nodes']:
    if nd.get('name') != 'body': continue
    me = J['meshes'][nd['mesh']]; newp = []
    for p in me['primitives']:
        if 'TEXCOORD_0' not in p['attributes']: newp.append(p); continue
        UV = acc(p['attributes']['TEXCOORD_0']); T = acc(p['indices']).reshape(-1, 3)
        u = UV[T].mean(1); cell = np.stack([(u[:, 0] % 1 * W).astype(int), (u[:, 1] % 1 * H).astype(int)], 1)
        isw = np.array([tuple(c) in WIN for c in cell])
        for sel, mat in [(~isw, p['material']), (isw, GI)]:
            idx = T[sel].reshape(-1).astype(np.uint32)
            if not len(idx): continue
            while len(blob) % 4: blob.append(0)
            off = len(blob); blob += idx.tobytes()
            J['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': idx.nbytes, 'target': 34963})
            J['accessors'].append({'bufferView': len(J['bufferViews']) - 1, 'componentType': 5125, 'count': int(len(idx)), 'type': 'SCALAR'})
            q = dict(p); q['indices'] = len(J['accessors']) - 1; q['material'] = mat; newp.append(q)
        print('window tris', int(isw.sum()), 'body', int((~isw).sum()))
    me['primitives'] = newp
J['buffers'][0]['byteLength'] = len(blob)
J['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(bytes(blob)).decode()
json.dump(J, open(out + '/veh_ddbus.gltf.json', 'w'))
