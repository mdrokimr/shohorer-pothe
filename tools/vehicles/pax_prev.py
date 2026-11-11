import numpy as np
from PIL import Image
pv = np.load('pax_preview.npy', allow_pickle=True)
tex = {0: np.array(Image.open('player_diffuse.jpg').convert('RGBA').resize((512, 512))), 1: np.array(Image.open('player_hair.png').convert('RGBA').resize((512, 512)))}
W, H = 1500, 700; img = np.full((H, W, 3), 215, np.float32); zb = np.full((H, W), 1e9)
s = 260; L = np.array([0.3, 0.6, 0.75]); L /= np.linalg.norm(L)
for view in range(2):  # ০ = সামনে থেকে (−z দিক থেকে দেখা), ১ = পাশ থেকে (+x)
    for pi, mat, P, UV, T in pv:
        ox = 140 + pi * 230 + view * 750
        for a, b, c in T:
            Q = P[[a, b, c]]
            if view == 0: X = ox + Q[:, 0] * s; Z = Q[:, 2]   # সামনে −z, কাছের = ছোট z
            else: X = ox + Q[:, 2] * s; Z = -Q[:, 0]
            Y = H - 60 - Q[:, 1] * s
            ar = (X[1] - X[0]) * (Y[2] - Y[0]) - (Y[1] - Y[0]) * (X[2] - X[0])
            if abs(ar) < 1e-9: continue
            u = UV[[a, b, c]].mean(0); px = tex[mat][int((u[1] % 1) * 511), int((u[0] % 1) * 511)]
            if px[3] < 100: continue
            n = np.cross(Q[1] - Q[0], Q[2] - Q[0]); nl = np.linalg.norm(n) or 1; k = 0.45 + 0.55 * abs(n @ L / nl)
            minx, maxx = int(max(0, X.min())), int(min(W - 1, X.max() + 1)); miny, maxy = int(max(0, Y.min())), int(min(H - 1, Y.max() + 1))
            gx, gy = np.meshgrid(np.arange(minx, maxx + 1) + .5, np.arange(miny, maxy + 1) + .5)
            w0 = ((X[1] - gx) * (Y[2] - gy) - (Y[1] - gy) * (X[2] - gx)) / ar; w1 = ((X[2] - gx) * (Y[0] - gy) - (Y[2] - gy) * (X[0] - gx)) / ar; w2 = 1 - w0 - w1
            m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0); z = w0 * Z[0] + w1 * Z[1] + w2 * Z[2]; sub = zb[miny:maxy + 1, minx:maxx + 1]; m &= z < sub; sub[m] = z[m]
            img[miny:maxy + 1, minx:maxx + 1][m] = px[:3] * k
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save('pax_prev.png')
