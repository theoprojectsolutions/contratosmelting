// Liga as fichas de catálogo (Tuder, Himaflex) aos IDs ativos do cadastro pelo modelo + bitola.
// Uso: node dev/catalogos/ligar.js   (lê dev/dados/cat.json e dev/dados/catalogos/*.json; grava fichas_por_id.json)
const R=__dirname+'/../../';const S=R+'dev/dados/catalogos';const fs=require('fs');
const cat=require(R+'dev/dados/cat.json');
const T=require(S+'/tuder_fichas.json'),H=require(S+'/himaflex.json');
const G={};try{for(const o of require(S+'/gates_mangueiras.json'))G[o.nome]=o;}catch(e){}
const POL={'1/4':6.35,'3/8':9.5,'1/2':12.7,'5/8':15.9,'3/4':19.05,'1':25.4,'11/4':31.75,'1,1/4':31.75,'1.1/4':31.75,'11/2':38.1,'1,1/2':38.1,'1.1/2':38.1,'2':50.8,'21/2':63.5,'2,1/2':63.5,'2.1/2':63.5,'3':76.2,'4':101.6,'5':127,'6':152.4,'8':203.2,'10':254};
const key=s=>s.toUpperCase().replace(/NR\b/g,'NATURAL').replace(/CONDUTIVE/g,'CONDUCTIVE').replace(/CRUSCH/g,'CRUSH').replace(/PREMIUN/g,'PREMIUM').replace(/[^A-Z]/g,'');
const polDesc=d=>{for(const w of d.toUpperCase().replace(/"/g,'').split(/\s+/).reverse()){const x=w.replace(/POL$/,'');if(POL[x])return POL[x];}return null;};
const polMM=s=>{const m=s.match(/(\d+[.,]?\d?\/\d+|\d+)\s*(?:"|POL|$|\*|\s|X|-)/);if(!m)return null;return POL[m[1].replace(' ','')]||null;};
// modelos Tuder: prefere a ficha mais completa (com DE e raio)
const tmod={};for(const f of T){const k=key(f.modelo);const sc=f.linhas.length+(f.linhas[0].de?5:0)+(f.temp?2:0);if(!tmod[k]||sc>tmod[k].sc)tmod[k]={f,sc};}
const ALIAS={TUPRESTIGE:'TUPRESTIGE',TUPRESTIGEVERMELHA:'TUPRESTIGE',TUPRESTIGEBAR:'TUPRESTIGE',TUPRESTIGEFORTYEIGHT:'TUPRESTIGEFORTYEIGHT',ALISPIR:'TUFOODNATURALD',TUSILBRIGHT:'TUSILBRIGHT',TUSILPURE:'TUSILPURE',TUFOODVITON:'TUFOODVITON',LATTERIATUBLUESTREAM:'TUACQUAKTW',GLIDETECHALISPIR:'GLIDETECHNATURAL'};
const out={};let nt=0,nh=0;const semT={},semH={};
for(const r of cat){
  const ap=r[2]||'';if(/\*/.test(ap)||r[3]!=='A')continue;
  if(/^TUDER/.test(ap)){
    let fam=ap.replace(/^TUDER/,'');const is1648=/16-48/.test(fam);
    let k=key(fam.replace(/[\d\/,.\-"]+.*$/,'')) ;if(/TUPRESTIGE/.test(k))k='TUPRESTIGE';
    let mk=is1648?Object.keys(tmod).find(x=>x==='TUPRESTIGE'):(ALIAS[k]||k);
    let cand=Object.keys(tmod).filter(x=>x===mk);if(!cand.length)cand=Object.keys(tmod).filter(x=>x.startsWith(mk)||mk.startsWith(x)).sort((a,b)=>b.length-a.length);
    if(is1648){cand=Object.keys(tmod).filter(x=>x==='TUPRESTIGE'&&false);const f16=T.find(f=>/16-48/.test(f.modelo)&&f.linhas.some(l=>l.de));if(f16)cand=['__16'];tmod['__16']={f:f16};}
    if(!cand.length){semT[k]=(semT[k]||0)+1;continue;}
    const f=tmod[cand[0]].f;const mm=polDesc(r[1])||polMM(fam.replace(/^.*?(?:12-36-|16-48-)/,'').replace(/^[A-Z\-]+/,''));
    if(!mm){semT['(bitola) '+k]=(semT['(bitola) '+k]||0)+1;continue;}
    const l=f.linhas.slice().sort((a,b)=>Math.abs(a.di-mm)-Math.abs(b.di-mm))[0];
    if(Math.abs(l.di-mm)>3){semT['(sem DI '+mm+') '+k]=(semT['(sem DI '+mm+') '+k]||0)+1;continue;}
    out[r[0]]={marca:'TUDER',modelo:f.modelo,ap,desc:r[1],...l,temp:f.temp,vacuo:f.vacuo||(l.vac?l.vac+' bar':''),tubo:f.tubo,reforco:f.reforco,cobertura:f.cobertura,norma:f.norma,fonte:f.arq+' p.'+f.pag};nt++;
  } else if(/HIMAFLEX/.test(ap)){
    const d=r[1].toUpperCase();const ALI={HSCA:'HAS',HBSA:'HASB',HSBA:'HASB',HSBAA:'HASB',HVO:'HSV',HVS:'HSV',HARG:'HAG'};
    let cod=(d.match(/\b(H[A-Z]{2,4})\b/)||[])[1];
    const byName=[[/LIGHT AZUL/,'HSL'],[/STANDARD LARANJA/,'HSS'],[/STANDARD CRISTAL/,'HAS'],[/LIGHT BRANCA/,'HASB'],[/VERDE OLIVA/,'HSV'],[/MARROM/,'HSP'],[/CONCRETO|GRAFITE/,'HSC'],[/EXTRA LEVE/,'HSEL']].find(([rx])=>rx.test(d));
    let c=byName?byName[1]:(ALI[cod]||cod);
    const mm=polDesc(d)||polMM(d.replace(/^[^\d]*/,''));
    const L=H.filter(h=>h.codigo===c);
    if(!L.length||!mm){semH[(c||'?')+(mm?'':' sem bitola')]=(semH[(c||'?')+(mm?'':' sem bitola')]||0)+1;continue;}
    const l=L.slice().sort((a,b)=>Math.abs(a.di-mm)-Math.abs(b.di-mm))[0];
    if(Math.abs(l.di-mm)>1.5){semH[c+' DI '+mm]=(semH[c+' DI '+mm]||0)+1;continue;}
    out[r[0]]={marca:'HIMAFLEX',ap,desc:r[1],codigo:l.codigo,modelo:l.modelo,pol:l.pol,di:l.di,de:l.de,esp:l.esp,wp:l.wp_bar,cor:l.cor,temp:l.temp,fonte:l.arq+' p.'+l.pag};nh++;
  }
}
// mangueiras hidráulicas no padrão Gates (8M2T, 12C2AT, 16EFG6K, 12C1TSML-BALFLEX...): mesma construção/norma da Gates
let ng=0;const semG={};
for(const r of cat){
  const ap=(r[2]||'').trim();if(/\*/.test(ap)||r[3]!=='A'||!/MANGUEIRAS HIDRAULICAS/.test(r[4]))continue;
  const m=ap.replace(/\s+/g,'').match(/^(\d{1,2})([A-Z][A-Z0-9]*?)(MTF|XTF|XTP|XLL|XCTN|G2|ENFAIXADA)?(SML.*|-.*)?$/);if(!m)continue;
  const k1=m[1]+m[2]+(m[3]&&/MTF|XTF/.test(m[3])?m[3]:''),k2=m[1]+m[2];
  const o=G[k1]||G[k2]||G[m[1]+m[2].replace(/^C/,'G')];
  if(!o){semG[m[2]]=(semG[m[2]]||0)+1;continue;}
  const sml=/SML/.test(m[4]||'');
  out[r[0]]={marca:'GATES',modelo:o.nome+(sml?' (equivalente: '+ap.replace(/^.*SML-?/,'')+' no padrão Gates)':''),ap,desc:r[1],di:o.di,de:o.de,wp:o.wp_bar,bp:o.bp_bar,raio:o.raio,norma:o.norma,fonte:o.arq+' p.'+o.pag};ng++;
}
console.log('Gates hidráulicas ligadas',ng,'sem ficha',Object.entries(semG).sort((a,b)=>b[1]-a[1]).slice(0,15));
fs.writeFileSync(S+'/fichas_por_id.json',JSON.stringify(out));
console.log('Tuder ligados',nt,'Himaflex ligados',nh);console.log('Tuder sem ficha',semT);console.log('Himaflex sem ficha',semH);
