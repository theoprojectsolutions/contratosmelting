"""Himaflex (catálogo eletrônico): o PDF sai em colunas (uma célula por linha).
Agrupa as colunas pelo número de itens de cada código (HSL, HSS...) e casa bar x psi (psi = bar x 14,5).
Uso: python3 dev/catalogos/himaflex.py dev/dados/catalogos"""
import json,re,sys
S=sys.argv[1]
P=[p for p in json.load(open(S+'/paginas.json')) if 'himaflex' in p['arq'].lower() and not p['txt'].startswith('[PAG')]
def runs(lines):
    r=[];i=0
    while i<len(lines):
        j=i
        while j+1<len(lines) and type_(lines[j+1])==type_(lines[i]) and type_(lines[i]): j+=1
        r.append((i,j-i+1,type_(lines[i]),lines[i:j+1]));i=j+1
    return r
def type_(s):
    s=s.strip()
    if re.fullmatch(r'H[A-Z]{1,4}',s): return 'cod'
    if re.fullmatch(r'\d+(?:[ .]\d/\d+)?(?:/\d+)?\s*[”"]',s) or re.fullmatch(r'\d+\.\d/\d”',s): return 'pol'
    if re.fullmatch(r'Ø\s*\d+(?:,\d+)?\s*±\s*\d+(?:,\d+)?',s): return 'diam'
    if re.fullmatch(r'\d+(?:,\d+)?\s*±\s*\d+(?:,\d+)?',s): return 'esp'
    if re.fullmatch(r'-?\d+\s*°C\s*>\s*\+?\d+\s*°C',s): return 'temp'
    if re.fullmatch(r'\d+(?:,\d+)?',s): return 'num'
    if re.fullmatch(r'[A-ZÇÃÉ/ \-]{3,}',s) : return 'cor'
    if re.fullmatch(r'[A-Za-zçãéêóú ]{4,40}',s): return 'nome'
    return None
f=lambda x:float(re.sub(r'[^\d,]','',x.split('±')[0]).replace(',','.'))
out=[]
for p in P:
    L=[l.strip() for l in p['txt'].split('\n') if l.strip()]
    R=runs(L)
    for k,(pos,n,ty,vals) in enumerate(R):
        if ty!='cod': continue
        near=lambda t,m=n: sorted([(r[0]+c*m,m,r[2],r[3][c*m:(c+1)*m]) for r in R if r[2]==t and r[1]%m==0 for c in range(r[1]//m)],key=lambda r:abs(r[0]-pos))
        pol=near('pol'); dm=near('diam'); es=near('esp'); te=near('temp'); co=near('cor'); no=near('nome')
        nums=[(r[0]+c,n,r[2],r[3][c:c+n]) for r in R if r[2]=='num' and r[1]>=n for c in range(r[1]-n+1)]
        bar=None
        for a in sorted(nums,key=lambda r:abs(r[0]-pos)):
            for b in nums:
                if b is a or abs(b[0]-a[0])<n: continue
                try:
                    if all(abs(f(y)-f(x)*14.5)<1 for x,y in zip(a[3],b[3])): bar=a;break
                except: pass
            if bar: break
        if not dm or len(dm)<2: continue
        d1,d2=sorted([x for x in dm[:4] if True][:2],key=lambda r:r[0])
        if any(f(b)<=f(a) for a,b in zip(d1[3],d2[3])):
            cand=[(x,y) for x in dm[:4] for y in dm[:4] if x[0]<y[0] and all(f(b)>f(a) for a,b in zip(x[3],y[3]))]
            if not cand: continue
            d1,d2=min(cand,key=lambda c:abs(c[0][0]-pos)+abs(c[1][0]-pos))
        for i in range(n):
            out.append({'marca':'HIMAFLEX','codigo':vals[i],'modelo':(no[0][3][i] if no else ''),'pol':(pol[0][3][i].replace('”','"') if pol else ''),
                'di':f(d1[3][i]),'de':f(d2[3][i]),'esp':(f(es[0][3][i]) if es else None),'cor':(co[0][3][i] if co else ''),
                'temp':(te[0][3][i] if te else ''),'wp_bar':(f(bar[3][i]) if bar else None),'arq':p['arq'],'pag':p['pag']})
    for ln in L:   # linhas únicas: "* 25m* 120* *PISCINA FLUTUANTEHPF 1.1/2” Ø 38,1 ± 0,4 Ø 45,1 ± 1,2 3,5 ± 0,4 AZUL -10 °C > +70 °C"
        m=re.search(r'([A-ZÇÃ ]{3,}?)(H[A-Z]{1,4})\s+([\d .\/]+”)\s+Ø\s*([\d,]+)\s*±\s*[\d,]+\s+Ø\s*([\d,]+)\s*±\s*[\d,]+\s+([\d,]+)\s*±\s*[\d,]+\s+([A-Z/ ]+?)\s+(-?\d+\s*°C\s*>\s*\+?\d+\s*°C)',ln)
        if m:
            out.append({'marca':'HIMAFLEX','codigo':m.group(2),'modelo':m.group(1).strip(),'pol':m.group(3).replace('”','"'),'di':f(m.group(4)),'de':f(m.group(5)),'esp':f(m.group(6)),'cor':m.group(7),'temp':m.group(8),'wp_bar':None,'arq':p['arq'],'pag':p['pag']})
seen=set();G=[]
for o in out:
    k=(o['codigo'],o['pol'],o['di'],o['de'],o['esp'])
    if k in seen: continue
    seen.add(k);G.append(o)
json.dump(G,open(S+'/himaflex.json','w'),ensure_ascii=False)
print(len(G),'linhas Himaflex')
