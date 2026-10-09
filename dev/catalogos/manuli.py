"""Manuli: tabelas de mangueira (PART. REF. | DN | dash | pol | R.O.D. | O.D. | W.P. bar psi | BURST bar psi | raio mm pol | peso).
Modelo pelo título da página (ROCKMASTER®/2SN, GOLDENISO/21...). Pressões reconhecidas pelo par bar/psi (psi ≈ 14,5 x bar).
Uso: python3 dev/catalogos/manuli.py dev/dados/catalogos   (grava manuli_mangueiras.json)"""
import json, re, sys, collections
D = sys.argv[1]
P = json.load(open(D + '/paginas.json'))
num = lambda x: float(x.replace(',', '.')) if re.fullmatch(r'\d+(?:[.,]\d+)?', x) else None
out = []
for p in P:
    if '/manuli/' not in p['arq'].lower(): continue
    t = p['txt'].replace('®', '').replace('™', '')
    mod = re.search(r'\b([A-Z][A-Z0-9 ]{2,20}/[A-Z0-9 +]{1,12})\b', t)
    modelo = re.sub(r'\s+', ' ', mod.group(1)).strip() if mod else ''
    for ln in t.split('\n'):
        m = re.match(r'^\s*H\w{6,12}\*?\s+(\d{1,3})\s+-(\d{2})\s+(.*)$', ln)
        if not m: continue
        v = [num(x) for x in m.group(3).replace('”', ' ').replace('"', ' ').split()]
        for i in range(1, len(v) - 1):
            a, b = v[i], v[i + 1]
            if a and b and a >= 5 and 14 <= b / a <= 15:
                bp = None
                if i + 3 < len(v) and v[i + 2] and v[i + 3] and 14 <= v[i + 3] / v[i + 2] <= 15: bp = v[i + 2]; j = i + 4
                else: j = i + 2
                de = v[i - 2] if i >= 2 and v[i - 1] is not None and v[i - 1] < 6 else v[i - 1]
                rest = [x for x in v[j:] if x is not None]
                raio = rest[0] if rest and rest[0] >= 20 else None
                dn = int(m.group(1))
                if de and de > dn:
                    out.append({'marca': 'MANULI', 'modelo': modelo, 'dn': dn, 'traco': int(m.group(2)), 'de': de, 'wp_bar': a, 'bp_bar': bp, 'raio': raio, 'arq': p['arq'], 'pag': p['pag']})
                break
best = {}
for o in out:
    k = (o['modelo'], o['traco'])
    sc = (1 if o['bp_bar'] else 0) + (1 if o['raio'] else 0) + (1 if '2018' in o['arq'] else 0)
    if k not in best or sc > best[k][0]: best[k] = (sc, o)
res = [o for _, o in best.values()]
json.dump(res, open(D + '/manuli_mangueiras.json', 'w'), ensure_ascii=False)
print(len(out), 'linhas,', len(res), 'modelo-traço,', len(set(o['modelo'] for o in res)), 'modelos')
print(sorted(collections.Counter(o['modelo'] for o in res).items(), key=lambda x: -x[1])[:30])
