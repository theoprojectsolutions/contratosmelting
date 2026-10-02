const M=require('../../js/motor.js');const fs=require('fs');
const raw=JSON.parse(fs.readFileSync(__dirname+'/../dados/cat.json'));
let t0=Date.now();
const cat=new M.Catalogo(raw.map(r=>({id:r[0],descricao:r[1],apelido:r[2],situacao:r[3],origem:r[4],um:r[5],familia:r[6],ipi:+r[7]})));
cat.construirIndice(); console.log('index ms',Date.now()-t0,'ativos',cat.lista.length);
const arc=JSON.parse(fs.readFileSync(__dirname+'/../dados/arc.json'));
const gt=arc.filter(a=>a.id&&cat.get(a.id));
const apr=new M.Aprendizado(cat); gt.filter((a,i)=>i%2==1).forEach(a=>apr.adicionar(a.det,a.id));
console.log('gt',gt.length,'aprendidos',apr.itens.length);
function run(name,useRef,useApr,set){
  const st={};let t=Date.now();
  for(const a of set){
    const s=M.sugerir({codCliente:'',descricao:a.det,ref:useRef?a.ref:''},{catalogo:cat,aprendizado:useApr?apr:null});
    const k=s.metodo; st[k]=st[k]||{n:0,ok:0}; st[k].n++; if(s.produto_id===a.id) st[k].ok++;
  }
  let n=0,ok=0;for(const k in st){if(k!=='nenhum'){n+=st[k].n;ok+=st[k].ok}}
  console.log(name,'ms/item',((Date.now()-t)/set.length).toFixed(1),JSON.stringify(st),'| sugeridos',n,'/',set.length,'acerto',(ok/n*100).toFixed(1)+'%');
}
const even=gt.filter((a,i)=>i%2==0);
run('COM REF',true,false,even);
run('SEM REF',false,false,even);
run('SEM REF + aprendido',false,true,even);
