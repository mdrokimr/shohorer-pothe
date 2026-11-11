import pickle, numpy as np
from PIL import Image, ImageDraw
S = pickle.load(open('scene.pkl','rb')); N = 512
ch = {'Ch31_Sweater': 0, 'Ch31_Pants': 1, 'Ch31_Collar': 2, 'Ch31_Body': 3}
layers = [Image.new('L', (N, N), 0) for _ in range(4)]
for d in S['mesh_data']:
    if d['name'] not in ch: continue
    dr = ImageDraw.Draw(layers[ch[d['name']]]); UV = d['UV']; UVI = d['UVI']; PI = d['PI']
    cur = []
    for k, i in enumerate(PI):
        cur.append(UVI[k])
        if i < 0:
            pts = [(UV[u][0] * N, (1 - UV[u][1]) * N) for u in cur]
            if len(pts) >= 3: dr.polygon(pts, fill=255, outline=255)
            cur = []
from PIL import ImageFilter
layers = [l.filter(ImageFilter.MaxFilter(3)) for l in layers]
Image.merge('RGBA', layers).save('player_mask.png', optimize=True)
import os; print(os.path.getsize('player_mask.png'))
prev = Image.merge('RGB', layers[:3]); prev.save('../maskprev.png')
