"""Parker: tabelas de mangueira (série-traço → DI, DE, pressão de trabalho e ruptura, raio mínimo) e a norma do bloco.
As colunas variam entre catálogos (pol/mm, psi/MPa, psi/bar); cada linha é lida pelo próprio conteúdo:
o par de pressão é reconhecido pela razão psi/MPa ≈ 145 (ou psi/bar ≈ 14,5), DI e DE são os mm antes dele.
Uso: python3 dev/catalogos/parker.py dev/dados/catalogos   (grava parker_mangueiras.json)"""
import json, re, sys, collections
D = sys.argv[1]
P = json.load(open(D + '/paginas.json'))
NORMA = re.compile(r'(SAE\s*100\s*R\s*\d+\w*(?:\s*(?:Tipo|Type)\s*\w+)?|EN\s*85[3-7]\s*(?:\d?S[NC]|R\d+|type\s*\w+)?|ISO\s*18752[^\n]{0,12}|ISO\s*3862[^\n]{0,10}|ISO\s*1436[^\n]{0,12}|SAE\s*J517[^\n]{0,8})', re.I)
def toks(s):
    s = re.sub(r'(\d+)\s+(\d+)/(\d+)', lambda m: str(int(m.group(1)) + int(m.group(2)) / int(m.group(3))), s)
    s = re.sub(r'(\d+)-(\d+)/(\d+)', lambda m: str(int(m.group(1)) + int(m.group(2)) / int(m.group(3))), s)
    s = re.sub(r'\b(\d+)/(\d+)\b', lambda m: str(int(m.group(1)) / int(m.group(2))), s)
    out = []
    for x in s.split():
        try: out.append(float(x.replace(',', '.')))
        except ValueError: out.append(None)
    return out
def par(a, b):
    if not a or not b: return None
    r = a / b
    if 140 <= r <= 150: return ('psi', 'mpa')
    if 14 <= r <= 15: return ('psi', 'bar')
    if 1 / 15 <= r <= 1 / 14: return ('bar', 'psi')
    return None
def le(v):
    for i in range(2, len(v) - 1):
        t = par(v[i], v[i + 1])
        if not t: continue
        bar = lambda x, y, tt: x * 10 if tt == ('psi', 'mpa') else (x / 14.5 if tt == ('psi', 'bar') else x)
        wp = round(v[i + 1] * 10 if t == ('psi', 'mpa') else (v[i + 1] if t == ('psi', 'bar') else v[i]), 1)
        j = i + 2; bp = None
        if j + 1 < len(v) and par(v[j], v[j + 1]) == t:
            bp = round(v[j + 1] * 10 if t == ('psi', 'mpa') else (v[j + 1] if t == ('psi', 'bar') else v[j]), 1); j += 2
        de = v[i - 1]; di = v[i - 2]
        if di is not None and di < 4 and i >= 4: di = v[i - 3]   # DE em polegada entre DI(mm) e DE(mm)
        if not (di and de and 2 <= di < de <= di * 2.2 + 25): return None
        rest = [x for x in v[j:] if x is not None]
        raio = None
        if len(rest) >= 2 and abs(rest[1] - rest[0] * 25.4) <= max(3, rest[0] * 2): raio = rest[1]
        elif rest and rest[0] >= 20: raio = rest[0]
        if not (3 <= wp <= 1200) or (bp and bp < wp * 1.9): return None
        return {'di': di, 'de': de, 'wp_bar': wp, 'bp_bar': bp, 'raio': raio}
    return None
out = []
for p in P:
    if '/parker/' not in p['arq']: continue
    L = p['txt'].split('\n')
    for k, ln in enumerate(L):
        m = re.match(r'^\s*([0-9]{2,4}[A-Z]{0,4}(?:-[A-Z0-9]{1,4})?)-(\d{1,2})\s+(.*)$', ln)
        if not m: continue
        r = le(toks(m.group(3)))
        if not r: continue
        normas = NORMA.findall('\n'.join(L[max(0, k - 60):k])) or NORMA.findall(p['txt'])
        out.append({'marca': 'PARKER', 'serie': m.group(1), 'traco': int(m.group(2)), **r,
                    'norma': re.sub(r'\s+', ' ', normas[-1]).strip() if normas else '', 'arq': p['arq'], 'pag': p['pag']})
best = {}
for o in out:
    k = (o['serie'], o['traco'])
    sc = (2 if o['bp_bar'] else 0) + (1 if o['norma'] else 0) + (1 if o['raio'] else 0) + (1 if '4400 br' in o['arq'] else 0)
    if k not in best or sc > best[k][0]: best[k] = (sc, o)
res = sorted((o for _, o in best.values()), key=lambda o: (o['serie'], o['traco']))
json.dump(res, open(D + '/parker_mangueiras.json', 'w'), ensure_ascii=False)
print(len(out), 'linhas lidas,', len(res), 'série-traço,', len(set(o['serie'] for o in res)), 'séries')
print(collections.Counter(o['norma'] for o in res).most_common(20))
