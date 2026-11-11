import struct, zlib, sys
def parse(path):
    d = open(path, 'rb').read()
    ver = struct.unpack('<I', d[23:27])[0]
    big = ver >= 7500
    pos = 27
    def read_node(pos):
        if big:
            end, nprops, plen = struct.unpack('<QQQ', d[pos:pos+24]); pos += 24
        else:
            end, nprops, plen = struct.unpack('<III', d[pos:pos+12]); pos += 12
        nl = d[pos]; pos += 1
        name = d[pos:pos+nl].decode('latin1'); pos += nl
        if end == 0: return None, pos
        props = []
        for _ in range(nprops):
            t = chr(d[pos]); pos += 1
            if t == 'Y': props.append(struct.unpack('<h', d[pos:pos+2])[0]); pos += 2
            elif t == 'C': props.append(bool(d[pos])); pos += 1
            elif t == 'I': props.append(struct.unpack('<i', d[pos:pos+4])[0]); pos += 4
            elif t == 'F': props.append(struct.unpack('<f', d[pos:pos+4])[0]); pos += 4
            elif t == 'D': props.append(struct.unpack('<d', d[pos:pos+8])[0]); pos += 8
            elif t == 'L': props.append(struct.unpack('<q', d[pos:pos+8])[0]); pos += 8
            elif t in 'fdlib':
                n, enc, cl = struct.unpack('<III', d[pos:pos+12]); pos += 12
                raw = d[pos:pos+cl]; pos += cl
                if enc == 1: raw = zlib.decompress(raw)
                fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'B'}[t]
                import array
                a = array.array(fmt); a.frombytes(raw); props.append(a)
            elif t in 'SR':
                n = struct.unpack('<I', d[pos:pos+4])[0]; pos += 4
                raw = d[pos:pos+n]; pos += n
                props.append(raw.decode('latin1') if t == 'S' else raw)
            else: raise Exception('type ' + t)
        children = []
        while pos < end:
            c, pos = read_node(pos)
            if c is None: break
            children.append(c)
        return {'name': name, 'props': props, 'ch': children}, end
    nodes = []
    while pos < len(d) - 200:
        n, pos = read_node(pos)
        if n is None: break
        nodes.append(n)
    return nodes
def find(n, name): return [c for c in n['ch'] if c['name'] == name]
def one(n, name):
    r = find(n, name); return r[0] if r else None
