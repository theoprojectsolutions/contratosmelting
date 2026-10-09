"""Tuder (fichas antigas, inglês): modelo, tubo, reforço, cobertura, temperatura, vácuo, norma e linhas ID/OD/pressão de trabalho/ruptura/peso/raio.
A linha é reconhecida pelo par trabalho x ruptura (fator 3 ou 4).
Uso: python3 dev/catalogos/tuder.py dev/dados/catalogos"""
import json,re,sys,collections
S=sys.argv[1]
P=json.load(open(S+'/paginas.json'))
def num(x):
    x=x.rstrip('"')
    if '/' in x: return None
    return float(x.replace(',','.'))
out=[]
for p in P:
    t=p['txt']
    if not re.search(r'Working\s*\n?\s*pressur',t): continue
    if 'tuder' not in p['arq'].lower() and 'tudertechnica' not in t.lower(): continue
    body=t.split('tudertechnica.com',1)[-1]
    m=re.search(r'\n?\s*([A-Z][A-Z0-9®/ \-\.]{3,40}?)\s*(?:\n|\s{2,})',body)
    modelo=re.sub(r'\s+',' ',m.group(1).replace('®','')).strip() if m else ''
    tc=t.split('TECHNICAL CHARACTERISTICS',1)[-1]
    linhas=[]
    for ln in tc.split('\n'):
        if re.search(r'[a-z]{4,}',ln): continue
        toks=re.findall(r'\d+(?:[.,]\d+)?(?:/\d+)?"?',ln)
        if len(toks)<5: continue
        v=[num(x) for x in toks]
        for i in range(1,len(v)-1):
            a,b=v[i],v[i+1]
            if a and b and a>=1 and abs(b/a-round(b/a))<0.01 and round(b/a) in (3,4):
                vac=None
                if i==1: de,di=None,v[0]
                elif v[i-1] is not None and v[i-1]<=1 and i>=3: vac,de,di=v[i-1],v[i-2],v[i-3]
                else: de,di=v[i-1],v[i-2]
                if not(di and (de is None or de>di)): continue
                if de is None: del_de=True
                d={'di':di,'wp':a,'bp':b}
                if de: d['de']=de
                if vac is not None: d['vac']=vac
                rest=v[i+2:]
                if len(rest)>=1: d['kg']=rest[0]
                if len(rest)>=2: d['raio']=rest[1]
                linhas.append(d);break
    if not linhas: continue
    def prop(rx):
        m=re.search(rx,t,re.I|re.S); return re.sub(r'\s+',' ',m.group(1)).strip() if m else ''
    out.append({'marca':'TUDER','modelo':modelo,'arq':p['arq'],'pag':p['pag'],
        'tubo':prop(r'Tube\s+(.{3,140}?)(?:\.|Reinf)'),'reforco':prop(r'Reinf(?:orcement|\.)\s+(.{3,90}?)(?:Cover|\n)'),
        'cobertura':prop(r'Cover\s+(.{3,120}?)(?:Sterili|Marking|\n)'),
        'temp':prop(r'Temperature range\s+(-?\s*\d+\s*°C\s*/\s*\+?\s*\d+\s*°C)'),'vacuo':prop(r'Vacuum\s+(\d+(?:,\d+)?\s*bar)'),
        'norma':prop(r'Norm\s+(.{3,80}?)(?:\n|$)'),'linhas':linhas})
json.dump(out,open(S+'/tuder_fichas.json','w'),ensure_ascii=False)
print(len(out),'fichas',sum(len(o['linhas']) for o in out),'linhas',len(set(o['modelo'] for o in out)),'modelos')
