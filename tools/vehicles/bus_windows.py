# বাসের টেক্সচারে আঁকা জানালা কেটে ফেলা (আলফা ০) আর আলাদা কাচের মাস্ক বানানো
# vconv.py দিয়ে বাস আবার বানালে এটা চালাতে হবে: python3 tools/vehicles/bus_windows.py assets
import sys, json
import numpy as np
from PIL import Image, ImageFilter
d = sys.argv[1]
src = f'{d}/veh_bus_0.jpg'
a = np.array(Image.open(src).convert('RGB')).astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]
lum = (R + G + B) / 3
m = ((G > R + 12) & (np.abs(G - B) < 28) & (lum > 40) & (lum < 140)).astype(np.uint8) * 255  # সবুজাভ-নীল কালচে কাচ
mi = Image.fromarray(m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
rgba = np.array(Image.open(src).convert('RGBA')); rgba[..., 3] = np.where(np.array(mi) > 128, 0, 255).astype(np.uint8)
Image.fromarray(rgba).save(f'{d}/veh_bus_0.png', optimize=True)
mi.convert('L').resize((512, 512)).save(f'{d}/veh_bus_win.png', optimize=True)
g = json.load(open(f'{d}/veh_bus.gltf.json'))
g['images'][0]['uri'] = 'veh_bus_0.png'; g['materials'][0]['alphaMode'] = 'MASK'; g['materials'][0]['alphaCutoff'] = 0.5
g['extras']['winMask'] = 'veh_bus_win.png'
json.dump(g, open(f'{d}/veh_bus.gltf.json', 'w'), separators=(',', ':'))
