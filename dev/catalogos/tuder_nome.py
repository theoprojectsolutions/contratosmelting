"""Tuder: nome do modelo pelo texto da página (TUPRESTIGE, TUFLUOR PTFE PHARM...) e remove fichas repetidas. Rodar por último."""
import json,re,sys,collections
S=sys.argv[1]
P={(p['arq'],p['pag']):p['txt'] for p in json.load(open(S+'/paginas.json'))}
F=json.load(open(S+'/tuder_fichas.json'))
RX=re.compile(r'\b((?:TU(?!BIGOMMA|DER)[A-Z]{3,}|GLIDETECH|ALISPIR|MILKFLEX|SPIROIL|STEELBLAST|BREWERY|IMPACT|SPIRALTECH|SUPERALISPIR)(?:[®™]?(?:[ /\-]+(?:[A-Z]{2,}|\d{1,2}-\d{2}|D|NY|BD|II))){0,4})')
nomes=collections.Counter()
for f in F:
    t=P[(f['arq'],f['pag'])]
    m=RX.search(t.replace('®','').replace('™',''))
    nome=re.sub(r'\s+',' ',m.group(1)).strip(' -/') if m else ''
    nome=re.sub(r'\b(DESCRIPTION|CONSTRUCTION|TECHNICAL|EN|PHTHALATES|APPLICATION|SUCTION|DELIVERY|HOSE)\b.*','',nome).strip(' -/')
    if not nome:
        a=f['arq'].rsplit('/',1)[-1].rsplit('.',1)[0]; nome=a.upper()
    f['modelo']=nome; nomes[nome]+=1
# remove duplicadas (mesmo modelo e mesmas linhas)
seen=set();G=[]
for f in F:
    k=(f['modelo'],json.dumps(f['linhas'],sort_keys=True))
    if k in seen: continue
    seen.add(k);G.append(f)
json.dump(G,open(S+'/tuder_fichas.json','w'),ensure_ascii=False)
print(len(F),'->',len(G));print(sorted(set(f['modelo'] for f in G)))
