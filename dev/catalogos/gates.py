"""Gates: tabelas de mangueira hidráulica (nome Gates = apelido Melting: 8M2T, 12C2AT, 16EFG6K...).
Linha: [-traço] NOME [código 4657-xxxx] DI(pol mm) DE(pol mm) pressão trabalho / ruptura (psi, MPa ou bar) [vácuo] raio.
O par de pressão é achado por ruptura ≈ 4 x trabalho (ou psi/MPa ≈ 145, psi/bar ≈ 14,5); DI e DE são os mm antes dele.
Uso: python3 dev/catalogos/gates.py dev/dados/catalogos   (grava gates_mangueiras.json)"""
import json, re, sys, collections
D = sys.argv[1]
P = json.load(open(D + '/paginas.json'))
NORMA = re.compile(r'(SAE\s*100\s*R\s*\d+\w*|EN\s*85[3-7]\s*(?:\d?S[NC]|R\d+)?|ISO\s*18752[^\n]{0,12}|ISO\s*1436[^\n]{0,8}|ISO\s*3862[^\n]{0,8})', re.I)
NOME = re.compile(r'(?<![\w.])(\d{1,2})((?:M[2-6]T|M[2-6]K|MXG?\d?K?|C\d{1,2}[A-Z]{0,3}|EFG\d[A-Z]*|G\d[A-Z]*|LOL\w*|J\d\w*|\dXH|\dXP|PWX?|GMV|LOLA)(?:-?(?:MTF|XTF|XTP|XLL))?)(?![\w])')
def num(x):
    x = x.strip()
    if x in ('-', '—'): return None
    m = re.fullmatch(r'(\d+)\s*(\d+)/(\d+)', x) or re.fullmatch(r'(\d+)-(\d+)/(\d+)', x)
    if m: return int(m.group(1)) + int(m.group(2)) / int(m.group(3))
    m = re.fullmatch(r'(\d+)/(\d+)', x)
    if m: return int(m.group(1)) / int(m.group(2))
    if re.fullmatch(r'[1-9]\d{0,2}[.,]\d{3}', x): return float(re.sub(r'[.,]', '', x))   # milhar
    try: return float(x.replace(',', '.'))
    except ValueError: return None
def toks(s):
    s = re.sub(r'(\d+)\s+(\d+/\d+)', r'\1-\2', s)
    return [num(x) for x in s.split()]
def le(v):
    for i in range(2, len(v) - 1):
        a, b = v[i], v[i + 1]
        if not a or not b: continue
        wp = bp = None; j = i + 2
        if a >= 100 and 3.8 <= b / a <= 4.2:                 # psi trabalho, psi ruptura
            wp, bp = round(a / 14.5, 1), round(b / 14.5, 1)
        elif 140 <= a / b <= 150:                              # psi, MPa
            wp = round(b * 10, 1)
            if j + 1 < len(v) and v[j] and v[j + 1] and 140 <= v[j] / v[j + 1] <= 150: bp = round(v[j + 1] * 10, 1); j += 2
        elif 14 <= a / b <= 15:                                # psi, bar
            wp = b
            if j + 1 < len(v) and v[j] and v[j + 1] and 14 <= v[j] / v[j + 1] <= 15: bp = v[j + 1]; j += 2
        else:
            continue
        de, di = v[i - 1], v[i - 2]
        rest = [x for x in v[j:] if x is not None]
        if de and de < 4 and di and di < de:                  # tabela só em polegadas (catálogos EUA)
            di, de = round(di * 25.4, 1), round(de * 25.4, 1)
            rest = [x * 25.4 if x < 40 else x for x in rest[:1]]
        elif di is not None and di < 4 and i >= 4: di = v[i - 3]
        if not (di and de and 2 <= di < de <= di * 2.2 + 25 and 3 <= wp <= 1200): continue
        raio = next((round(x) for x in rest if di * 2 <= x <= di * 16), None)
        return {'di': di, 'de': de, 'wp_bar': wp, 'bp_bar': bp, 'raio': raio}
    return None
out = []
for p in P:
    if '/gates' not in p['arq']: continue
    L = p['txt'].split('\n')
    for k, ln in enumerate(L):
        ln = re.sub(r'(\d)CIT\b', r'\1C1T', ln)   # OCR: CIT = C1T
        m = NOME.search(ln)
        if not m: continue
        resto = ln[m.end():]
        resto = re.sub(r'\b\d{4}-\d{4,5}\b|\b\d{5}\b|—', ' ', resto)   # código Gates 4657-0224 e nº de produto
        r = le(toks(resto))
        if not r: continue
        fam = re.escape(re.sub(r'-?(MTF|XTF|XTP|XLL)$', '', m.group(2)))
        perto = re.search(fam + r'[^\n]{0,60}?' + NORMA.pattern, p['txt'], re.I)
        normas = [perto.group(1)] if perto else (NORMA.findall('\n'.join(L[max(0, k - 60):k])) or NORMA.findall(p['txt']))
        out.append({'marca': 'GATES', 'nome': m.group(1) + m.group(2).replace('-', ''), 'traco': int(m.group(1)), **r,
                    'norma': re.sub(r'\s+', ' ', normas[-1]).strip() if normas else '', 'arq': p['arq'], 'pag': p['pag']})
best = {}
for o in out:
    k = o['nome']
    sc = (2 if o['bp_bar'] else 0) + (1 if o['norma'] else 0) + (1 if o['raio'] else 0)
    if k not in best or sc > best[k][0]: best[k] = (sc, o)
res = sorted((o for _, o in best.values()), key=lambda o: o['nome'])
json.dump(res, open(D + '/gates_mangueiras.json', 'w'), ensure_ascii=False)
print(len(out), 'linhas lidas,', len(res), 'mangueiras Gates')
print(collections.Counter(re.sub(r'^\d+', '', o['nome']) for o in res).most_common(40))
