"""Fichas técnicas de correias planas: Meltpower ("Código: ...", "Espessura Total: ...") e Nitta PolyBelt (TFL, XH, VRT, 2LRAFP).
Grava correias_fichas.json com um registro por material (chave sem separadores e sem MELTPOWER).
Uso: python3 dev/catalogos/correias_fichas.py dev/dados/catalogos"""
import json, re, sys
D = sys.argv[1]
P = json.load(open(D + '/paginas.json'))
chave = lambda s: re.sub(r'[^A-Z0-9]', '', s.upper().replace('MELTPOWER', ''))
out = {}
for p in P:
    a, t = p['arq'], p['txt']
    if 'ficha técnica correias' in a and 'Código:' in t:
        kv = dict((k.strip(), v.strip()) for k, v in re.findall(r'^([A-ZÁ-Úa-zá-ú ]{3,40}):\s*(.+)$', t, re.M))
        cod = kv.get('Código', '')
        polias = re.findall(r'Diâmetro mínimo da polia (\d):\s*(\S+)', t)
        out[chave(cod)] = {'marca': 'MELTPOWER', 'material': cod, 'lonas': kv.get('Número de Lonas'), 'tracao': kv.get('Camadas de Tração'),
            'cor': kv.get('Cor'), 'cobertura': kv.get('Cobertura Superior'), 'inferior': kv.get('Camada Inferior'), 'espessura': kv.get('Espessura Total'),
            'carga': kv.get('Carga de Trabalho'), 'largura_max': kv.get('Largura Máxima') or (re.search(r'Largura Máxima\s*(\S+)', t) or [None, None])[1],
            'polia_min': kv.get('Diâmetro Mínimo da Polia'), 'polias': ' / '.join(f'{n}: {v}' for n, v in polias) if len(polias) > 1 else '',
            'temp': kv.get('Temperatura de Trabalho'), 'antiestatica': kv.get('Antiestática'), 'fonte': f"{a} p.{p['pag']}"}
    elif '/nitta belt/' in a or 'nittacatalogo' in a:
        def campo(rx):
            m = re.search(rx, t, re.I | re.S); return re.sub(r'\s+', ' ', m.group(1)).strip() if m else ''
        nome = campo(r'Tipo de correia\s*\n([^\n]+)') or campo(r'^(\d\s*LRAFP[^\n]{0,30}?)\s+\d plies') or campo(r'Technical PolyBelt\s+([A-Z][A-Z0-9\- ]{2,12})') or a.rsplit('/', 1)[-1][:-4].upper()
        if 'vrt14a' in a: nome = 'VRT14A'
        if 'xh-3s-3' in a: nome = 'XH-3S-3'
        out.setdefault(chave(nome), {'marca': 'NITTA', 'material': nome, 'espessura': campo(r'Espessura total\s*\n?\s*([\d,.]+\s*mm)') or campo(r'(?:Total )?[Tt]hickness[^\d]{0,20}([\d,.]+\s*mm)'),
            'polia_min': campo(r'Diâmetro mínimo da polia.*?(\d+\s*mm)') or campo(r'[Mm]in(?:imum)?\.? pulley[^\d]{0,30}(\d+\s*mm)'),
            'temp': campo(r'Faixa de temperatura de operação\s*\n?\s*([-\d]+ a \d+ °C)') or campo(r'(-\d+\s*(?:to|a|~)\s*\+?\d+\s*°C)'),
            'tracao': campo(r'Elemento de tração\s*\n(?:Emenda\s*\n)?([^\n]+)'), 'aplicacoes': campo(r'Aplicações\s*\n(.*?)\nConstrução'),
            'tensao': campo(r'Tensão máxima admissível\s*\n?([\d,.]+\s*N/mm)'), 'resumo': re.sub(r'\s+', ' ', t[:400]), 'fonte': f"{a} p.{p['pag']}"})
out.pop('NITTACATALOGO', None)
json.dump(out, open(D + '/correias_fichas.json', 'w'), ensure_ascii=False)
print(len(out), 'materiais:', ', '.join(sorted(out)))
