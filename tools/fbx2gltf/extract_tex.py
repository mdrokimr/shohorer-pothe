import sys, io; sys.path.insert(0,'.')
from fbxparse import *
from PIL import Image
nodes = parse('/mnt/user-data/uploads/character.fbx')
objs = [n for n in nodes if n['name']=='Objects'][0]
for c in objs['ch']:
    if c['name']=='Video':
        cont = one(c,'Content'); data = cont['props'][0] if cont and cont['props'] else b''
        nm = c['props'][1].split('\x00')[0]
        if data:
            im = Image.open(io.BytesIO(data)); print(nm, im.size, im.mode)
            open(nm + '.png','wb').write(data)
