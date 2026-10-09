"""Perfis de correia (Contitech "list of dimensions" e catálogos de V/sincronizadoras):
- dimensões da seção: sincronizadora t (passo), h (altura), ht (altura do dente); em V b0 (largura no topo) e h (altura);
- comprimentos padrão por seção: sincronizadora Lp e nº de dentes z; em V Ld (comprimento de referência).
Uso: python3 dev/catalogos/perfis.py dev/dados/catalogos   (grava perfis.json)"""
import json, re, sys
D = sys.argv[1]
P = json.load(open(D + '/paginas.json'))
SINC = {'3M': 3, '5M': 5, '8M': 8, '14M': 14, '20M': 20, 'S3M': 3, 'S5M': 5, 'S8M': 8, 'S14M': 14, 'D5M': 5, 'D8M': 8, 'D14M': 14, 'T5': 5, 'T10': 10, 'T20': 20,
        'AT5': 5, 'AT10': 10, 'AT20': 20, 'XL': 5.08, 'L': 9.525, 'H': 12.7, 'XH': 22.225, 'XXH': 31.75, '8MGT': 8, '14MGT': 14, '5MGT': 5, '3MGT': 3}
V = ['SPZ', 'SPA', 'SPB', 'SPC', 'XPZ', 'XPA', 'XPB', 'XPC', 'Z', 'A', 'B', 'C', 'D', 'E', '3V', '5V', '8V', '3VX', '5VX', 'AX', 'BX', 'CX', 'ZX', '10', '13', '17', '22', '32']
perf = {}
def add(sec, **kw):
    d = perf.setdefault(sec, {'comprimentos': {}})
    for k, v in kw.items():
        if v is not None and k not in d: d[k] = v
fontes = ('contitech', 'conti', 'htd', 'gates', 'megadyne', 'meltpower')
for p in P:
    a = p['arq'].lower()
    if not any(f in a for f in fontes): continue
    t = p['txt']; fonte = f"{p['arq']} p.{p['pag']}"
    for ln in t.split('\n'):
        s = ln.strip()
        m = re.fullmatch(r'(D?S?\d{1,2}M|T\d{1,2}|AT\d{1,2}|XL|XH|L|H)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', s)
        if m and m.group(1) in SINC and abs(float(m.group(2)) - SINC[m.group(1)]) < 0.3:
            a3, a4 = float(m.group(3)), float(m.group(4))
            add(m.group(1), tipo='sincronizadora', passo=float(m.group(2)), altura=max(a3, a4), altura_dente=min(a3, a4), fonte_secao=fonte)
        m = re.fullmatch(r'(SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC|Z|A|B|C|D|E|3V|5V|8V|AX|BX|CX)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', s)
        if m:
            b0, b0i, h, hi = map(float, m.groups()[1:])
            if abs(b0 / 25.4 - b0i) < 0.03 and abs(h / 25.4 - hi) < 0.03:
                add(m.group(1), tipo='V', largura_topo=b0, altura=h, fonte_secao=fonte)
        m = re.fullmatch(r'\*?(?:\d\s+\*?)?(\d{2,5})\s*-\s*(D?S?\d{1,2}M|T\d{1,2}|AT\d{1,2})\b.*?\s([\d.]+)\s+([\d.]+)\s+(\d{2,4})', s)
        if m and m.group(2) in SINC:
            L = float(m.group(3))
            if abs(L - float(m.group(1))) < 1.5:
                perf.setdefault(m.group(2), {'comprimentos': {}})['comprimentos'].setdefault(m.group(1), {'lp': L, 'z': int(m.group(5)), 'fonte': fonte})
    sec = None
    for ln in t.split('\n'):
        s = ln.strip()
        h = re.fullmatch(r'Section\s+(SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC|Z|A|B|C|D|E|3V|5V|8V|AX|BX|CX)', s)
        if h: sec = h.group(1); continue
        if sec:
            m = re.fullmatch(r'\d{6,8}\s+(\d{3,5})\s+([\d.]+)', s)
            if m and abs(float(m.group(1)) / 25.4 - float(m.group(2))) < 0.1:
                perf.setdefault(sec, {'comprimentos': {}})['comprimentos'].setdefault(m.group(1), {'ld': int(m.group(1)), 'fonte': fonte})
json.dump(perf, open(D + '/perfis.json', 'w'), ensure_ascii=False)
for k in sorted(perf): print(k, {x: y for x, y in perf[k].items() if x not in ('comprimentos', 'fonte_secao')}, len(perf[k]['comprimentos']), 'comprimentos')
