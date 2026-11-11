#!/usr/bin/env python3
"""OpenStreetMap (.osm) ফাইল থেকে গেমের ম্যাপ (data/map.json) বানানো।

চালানো:  python3 tools/osm2game.py map.osm data/map.json
শুধু পাইথনের নিজের লাইব্রেরি লাগে।

মিটারে রূপান্তর: x = পূর্ব দিকে, z = দক্ষিণ দিকে (উত্তর = -z), মাঝখান (0,0) = ম্যাপের কেন্দ্র।
"""
import json
import math
import sys
import xml.etree.ElementTree as ET

# রাস্তার ধরন অনুযায়ী চওড়া (মিটার): দুইমুখী রাস্তার পুরো চওড়া
WIDTH = {
    'trunk': 16, 'primary': 14, 'primary_link': 7, 'secondary': 12, 'secondary_link': 7,
    'tertiary': 9, 'tertiary_link': 6, 'unclassified': 6, 'residential': 6.5,
    'living_street': 5, 'service': 4.5,
}
MAIN = {'trunk', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary'}
POI_KEEP = {
    'restaurant', 'fast_food', 'cafe', 'hospital', 'clinic', 'police', 'fuel', 'bus_station',
    'marketplace', 'school', 'place_of_worship', 'pharmacy', 'bank', 'atm',
}
LANDMARK = {'place_of_worship', 'school', 'college', 'university', 'hospital', 'marketplace', 'stadium', 'mosque', 'retail', 'commercial'}


def main(src, dst, margin=30.0):
    root = ET.parse(src).getroot()
    b = root.find('bounds')
    minlat, minlon = float(b.get('minlat')), float(b.get('minlon'))
    maxlat, maxlon = float(b.get('maxlat')), float(b.get('maxlon'))
    lat0, lon0 = (minlat + maxlat) / 2, (minlon + maxlon) / 2
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0

    def xy(lat, lon):
        return ((lon - lon0) * kx, -(lat - lat0) * ky)

    X0, Z1 = xy(minlat, minlon)
    X1, Z0 = xy(maxlat, maxlon)
    inside = lambda x, z, m=0: X0 - m <= x <= X1 + m and Z0 - m <= z <= Z1 + m

    nodes = {}
    ntags = {}
    for n in root.iter('node'):
        nodes[n.get('id')] = xy(float(n.get('lat')), float(n.get('lon')))
        t = {x.get('k'): x.get('v') for x in n.findall('tag')}
        if t:
            ntags[n.get('id')] = t

    tags = lambda e: {x.get('k'): x.get('v') for x in e.findall('tag')}
    name_of = lambda t: t.get('name:bn') or t.get('name') or ''
    r1 = lambda v: round(v, 1)

    # ---------- রাস্তা: OSM বিন্দুগুলো জালের মোড় ----------
    gid = {}
    gnodes = []
    roads = []
    for w in root.iter('way'):
        t = tags(w)
        hw = t.get('highway')
        if hw not in WIDTH or t.get('area') == 'yes':
            continue
        refs = [r.get('ref') for r in w.findall('nd') if r.get('ref') in nodes]
        # ম্যাপের বাইরের অংশ কেটে ফেলা (একটু বাড়তি রেখে)
        keep = [r for r in refs if inside(*nodes[r], margin)]
        if len(keep) < 2:
            continue
        # একটানা ভিতরের টুকরোগুলো আলাদা রাস্তা
        runs, cur = [], []
        for r in refs:
            if inside(*nodes[r], margin):
                cur.append(r)
            else:
                if len(cur) >= 2:
                    runs.append(cur)
                cur = []
        if len(cur) >= 2:
            runs.append(cur)
        width = WIDTH[hw]
        lanes = t.get('lanes')
        ow = t.get('oneway')
        oneway = 1 if ow in ('yes', 'true', '1') or t.get('junction') == 'roundabout' else -1 if ow == '-1' else 0
        if lanes and lanes.isdigit():
            width = max(width * 0.6, min(22, int(lanes) * 3.4 + (0 if oneway else 1)))
        elif oneway and hw in MAIN:
            width = width * 0.65
        for run in runs:
            ids = []
            for r in run:
                if r not in gid:
                    gid[r] = len(gnodes)
                    x, z = nodes[r]
                    gnodes.append([r1(x), r1(z)])
                if not ids or ids[-1] != gid[r]:
                    ids.append(gid[r])
            if len(ids) >= 2:
                roads.append({'n': name_of(t), 't': hw, 'w': r1(width), 'o': oneway, 'm': 1 if hw in MAIN else 0, 'ids': ids})

    # ---------- বিল্ডিং, পানি, পার্ক ----------
    def ring(w):
        refs = [r.get('ref') for r in w.findall('nd') if r.get('ref') in nodes]
        if len(refs) < 4 or refs[0] != refs[-1]:
            return None
        pts = [[r1(nodes[r][0]), r1(nodes[r][1])] for r in refs[:-1]]
        return pts

    def centroid(p):
        return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)

    def area(p):
        s = 0
        for i in range(len(p)):
            a, c = p[i], p[(i + 1) % len(p)]
            s += a[0] * c[1] - c[0] * a[1]
        return abs(s) / 2

    buildings, water, parks, rail = [], [], [], []
    for w in root.iter('way'):
        t = tags(w)
        if t.get('railway') in ('subway', 'rail', 'light_rail'):
            refs = [r.get('ref') for r in w.findall('nd')]
            refs = [r for r in refs if r in nodes and inside(*nodes[r], margin)]
            if len(refs) >= 2:
                rail.append([[r1(nodes[r][0]), r1(nodes[r][1])] for r in refs])
            continue
        p = ring(w)
        if not p:
            continue
        cx, cz = centroid(p)
        if not inside(cx, cz):
            continue
        if 'building' in t:
            lv = t.get('building:levels', '')
            h = t.get('height', '')
            kind = t.get('amenity') or t.get('shop') and 'shop' or t.get('building')
            item = {'p': p, 'k': kind}
            try:
                if h:
                    item['h'] = round(float(h.split()[0]), 1)
                elif lv:
                    item['l'] = int(float(lv))
            except ValueError:
                pass
            nm = name_of(t)
            if nm and (kind in LANDMARK or t.get('amenity') in LANDMARK):
                item['n'] = nm
            buildings.append(item)
        elif t.get('natural') == 'water' or t.get('water') or t.get('landuse') in ('reservoir', 'basin'):
            water.append({'p': p, 'n': name_of(t)})
        elif t.get('leisure') in ('park', 'garden', 'playground', 'pitch', 'stadium') or t.get('landuse') in ('grass', 'recreation_ground', 'village_green'):
            parks.append({'p': p, 'n': name_of(t), 'k': t.get('leisure') or t.get('landuse'), 'a': round(area(p))})

    # ---------- জায়গার বিন্দু (দোকান, রেস্টুরেন্ট, থানা, হাসপাতাল) ----------
    pois = []
    for nid, t in ntags.items():
        a = t.get('amenity')
        k = a if a in POI_KEEP else ('shop' if 'shop' in t else 'station' if t.get('railway') == 'station' else 'bus_stop' if t.get('highway') == 'bus_stop' else None)
        if not k:
            continue
        x, z = nodes[nid]
        if not inside(x, z):
            continue
        pois.append({'k': k, 'x': r1(x), 'z': r1(z), 'n': name_of(t)})

    out = {
        'source': 'OpenStreetMap',
        'attribution': '© OpenStreetMap contributors (ODbL)',
        'origin': [round(lat0, 6), round(lon0, 6)],
        'bounds': [r1(X0), r1(X1), r1(Z0), r1(Z1)],
        'nodes': gnodes,
        'roads': roads,
        'buildings': buildings,
        'water': water,
        'parks': parks,
        'rail': rail,
        'pois': pois,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'রাস্তা {len(roads)}, মোড়/বিন্দু {len(gnodes)}, বিল্ডিং {len(buildings)}, পানি {len(water)}, পার্ক {len(parks)}, রেল {len(rail)}, জায়গা {len(pois)}')
    print(f'এলাকা: {X1 - X0:.0f} x {Z1 - Z0:.0f} মিটার')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('চালানো: python3 tools/osm2game.py map.osm data/map.json')
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
