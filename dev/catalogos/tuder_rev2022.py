"""Tuder (fichas REV 2022+): cabeçalho de unidades [mm] [in] [mm] [in] ... define as colunas. Acrescenta em tuder_fichas.json (rodar depois de tuder.py)."""
# formato novo Tuder (REV 2022+): cabeçalho de unidades "[mm] [in] [mm] [in] [mt] [ft] [bar] [psi]..."
import json,re,sys
S=sys.argv[1]
P=json.load(open(S+'/paginas.json'))
out=[]
for p in P:
    t=p['txt']
    h=re.search(r'^((?:\[[a-z/]+\]\s*){6,})$',t,re.M)
    if not h or 'tudertechnica' not in t.lower(): continue
    units=re.findall(r'\[([a-z/]+)\]',h.group(1))
    mm=[i for i,u in enumerate(units) if u=='mm']; bar=[i for i,u in enumerate(units) if u=='bar']
    sem={}
    if len(mm)>=2: sem[mm[0]]='di'; sem[mm[1]]='de'
    if len(mm)>=3: sem[mm[-1]]='raio'
    if len(bar)==3: sem[bar[0]]='vac'; sem[bar[1]]='wp'; sem[bar[2]]='bp'
    elif len(bar)==2: sem[bar[0]]='wp'; sem[bar[1]]='bp'
    for i,u in enumerate(units):
        if u=='kg/mt': sem[i]='kg'
        if u=='mt': sem[i]='comp_m'
    linhas=[]
    for ln in t[h.end():].split('\n'):
        toks=ln.split()
        if len(toks)!=len(units) or not all(re.fullmatch(r'\d+(?:,\d+)?',x) for x in toks): 
            if linhas: break
            continue
        linhas.append({sem[i]:float(x.replace(',','.')) for i,x in enumerate(toks) if i in sem})
    if not linhas: continue
    first=t.strip().split('\n')[0]
    modelo=re.sub(r'[®™]','',first).strip()
    def prop(rx):
        m=re.search(rx,t,re.I|re.S); return re.sub(r'\s+',' ',m.group(1)).strip() if m else ''
    out.append({'marca':'TUDER','modelo':modelo,'arq':p['arq'],'pag':p['pag'],
      'tubo':prop(r'\nTube\s*\n?(.{3,160}?)(?:\n[A-Z][a-z]+\s*\n|Reinforcement)'),'reforco':prop(r'Reinforcement\s*\n?(.{3,120}?)(?:\nCover|Cover)'),
      'cobertura':prop(r'\nCover\s*\n?(.{3,140}?)(?:\n[A-Z][a-z]+\s*\n|Marking)'),
      'temp':prop(r'(-\s*\d+\s*°C\s*/\s*\+\s*\d+\s*°C)'),'vacuo':'','norma':prop(r'(EN\s*\d{4,5}|ISO\s*\d{3,5}[^\n]{0,40}|3-?A Sanitary[^\n]{0,30})'),'linhas':linhas})
old=json.load(open(S+'/tuder_fichas.json'))
json.dump(old+out,open(S+'/tuder_fichas.json','w'),ensure_ascii=False)
print('novo formato',len(out),'fichas',sum(len(o['linhas']) for o in out))
