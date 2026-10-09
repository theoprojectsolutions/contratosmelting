"""Quebra os catalogos_texto_*.txt (gerados pelo preparar_catalogos.py) em páginas.
Uso: python3 dev/catalogos/paginas.py dev/dados/catalogos   (lê texto/, grava paginas.json)"""
import glob, json, re, sys
D = sys.argv[1]
pags = []
for f in sorted(glob.glob(D + '/texto/catalogos_texto_*.txt')):
    t = open(f, encoding='utf-8').read()
    for m in re.finditer(r'=== ARQUIVO: (.*?) \| PAGINA: (\d+) ===\n(.*?)(?=\n\n=== ARQUIVO: |\Z)', t, re.S):
        pags.append({'arq': m.group(1), 'pag': int(m.group(2)), 'txt': m.group(3).strip()})
json.dump(pags, open(D + '/paginas.json', 'w'), ensure_ascii=False)
print(len(pags), 'páginas,', sum(1 for p in pags if not p['txt'].startswith('[PAGINA SEM TEXTO')), 'com texto')
