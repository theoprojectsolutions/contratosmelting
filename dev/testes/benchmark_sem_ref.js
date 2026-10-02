// catálogo de teste = itens da Arcelor (apelido = REF do Kayan); mede o caminho SEM REF
const M=require('../../js/motor.js');
const a=require('../dados/arc.json');
const prods=new Map();for(const r of a)if(r.id&&r.ref&&!prods.has(r.id))prods.set(r.id,{id:r.id,descricao:r.ref,apelido:r.ref,situacao:'A'});
const cat=new M.Catalogo([...prods.values()]);cat.construirIndice();
const gt=a.filter(r=>r.id&&prods.has(r.id));
for(const regras of [false,true]){const st={};
 for(const r of gt){const s=M.sugerir({codCliente:'',descricao:r.det,ref:''},{catalogo:cat,params:{regrasSap:regras}});const k=s.metodo;st[k]=st[k]||{n:0,ok:0};st[k].n++;if(s.produto_id===r.id)st[k].ok++;}
 console.log('regrasSap='+regras,JSON.stringify(st));}
const st={};for(const r of gt){const s=M.sugerir({codCliente:'',descricao:r.det,ref:r.ref},{catalogo:cat});const k=s.metodo;st[k]=st[k]||{n:0,ok:0};st[k].n++;if(s.produto_id===r.id)st[k].ok++;}console.log('COM REF',JSON.stringify(st));
const erros=[];for(const r of gt){const s=M.sugerir({codCliente:'',descricao:r.det,ref:''},{catalogo:cat});if(s.metodo==='regra-sap'&&s.produto_id!==r.id)erros.push(r.ref+'  => '+(prods.get(s.produto_id)||{}).apelido+'  | '+s.motivo);}erros.slice(0,25).forEach(e=>console.log('  ERR',e));
