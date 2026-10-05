// Supabase falso, em memória — só para testar o sistema no navegador
(function(){
  const T = window.__TABELAS = window.__TABELAS || {
    perfis:[{id:'u1',email:'teste@melting.com.br',papel:'admin'}], clientes:[], cotacoes:[], contratos:[], contrato_itens:[], de_para:[], parametros:[], produtos:[], vendas:[], auditoria:[], cotacao_itens:[]
  };
  const ARQ = {};
  let seq = 1;
  function Q(tabela){ this.t=tabela; this.f=[]; this.op='select'; this.rows=null; this.r=null; this.ord=null; this.one=false; this.ret=false; this.opts={}; }
  Q.prototype.select=function(){ if(this.op!=='select') this.ret=true; return this; };
  Q.prototype.insert=function(rows){ this.op='insert'; this.rows=[].concat(rows); return this; };
  Q.prototype.upsert=function(rows,o){ this.op='upsert'; this.rows=[].concat(rows); this.opts=o||{}; return this; };
  Q.prototype.update=function(obj){ this.op='update'; this.rows=obj; return this; };
  Q.prototype.delete=function(){ this.op='delete'; return this; };
  Q.prototype.eq=function(c,v){ this.f.push(r=>String(r[c])===String(v)); return this; };
  Q.prototype.in=function(c,vs){ const s=new Set(vs.map(String)); this.f.push(r=>s.has(String(r[c]))); return this; };
  Q.prototype.gte=function(c,v){ this.f.push(r=>r[c]>=v); return this; };
  Q.prototype.gt=function(c,v){ this.f.push(r=>r[c]>v); return this; };
  Q.prototype.neq=function(c,v){ this.f.push(r=>String(r[c])!==String(v)); return this; };
  Q.prototype.lte=function(c,v){ this.f.push(r=>r[c]<=v); return this; };
  Q.prototype.order=function(c,o){ this.ord=[c,(o&&o.ascending===false)?-1:1]; return this; };
  Q.prototype.range=function(a,b){ this.r=[a,b]; return this; };
  Q.prototype.single=function(){ this.one=true; return this; };
  Q.prototype.then=function(res,rej){ try{ res(this._run()); }catch(e){ res({data:null,error:{message:e.message}}); } };
  Q.prototype._run=function(){
    const tab = T[this.t] = T[this.t] || [];
    const ok = r => this.f.every(f=>f(r));
    if (this.op==='select'){
      let d = tab.filter(ok);
      if (this.ord) d = d.slice().sort((a,b)=> (a[this.ord[0]]>b[this.ord[0]]?1:-1)*this.ord[1]);
      if (this.r) d = d.slice(this.r[0], this.r[1]+1);
      d = JSON.parse(JSON.stringify(d));
      return {data:this.one?(d[0]||null):d, error:this.one&&!d[0]?{message:'not found'}:null};
    }
    if (this.op==='insert'){
      const novos = this.rows.map(r=>Object.assign({id: r.id || ('id'+(seq++)), criado_em:new Date().toISOString()}, JSON.parse(JSON.stringify(r))));
      tab.push(...novos);
      return {data:this.one?novos[0]:novos, error:null};
    }
    if (this.op==='upsert'){
      const keys = (this.opts.onConflict||'id').split(',');
      const k = r => keys.map(x=>String(r[x])).join('|');
      const idx = new Map(tab.map((r,i)=>[k(r),i]));
      this.rows.forEach(r=>{ const kk=k(r); if(idx.has(kk)) Object.assign(tab[idx.get(kk)], r); else { const n=Object.assign({id:'id'+(seq++)},r); idx.set(kk,tab.length); tab.push(n);} });
      return {data:null,error:null};
    }
    if (this.op==='update'){ const d=tab.filter(ok); d.forEach(r=>Object.assign(r,this.rows)); return {data:this.one?d[0]:d,error:null}; }
    if (this.op==='delete'){ const rest=tab.filter(r=>!ok(r)); const n=tab.length-rest.length; T[this.t]=rest; return {data:null,error:null,count:n}; }
  };
  const client = {
    auth:{
      getSession: async()=>({data:{session:{user:{id:'u1',email:'teste@melting.com.br'}}},error:null}),
      getUser: async()=>({data:{user:{id:'u1',email:'teste@melting.com.br'}},error:null}),
      onAuthStateChange: ()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({error:null})
    },
    from:(t)=>new Q(t),
    storage:{ from:(b)=>({
      upload: async(nome,blob)=>{ ARQ[b+'/'+nome]=blob; return {data:{path:nome},error:null}; },
      download: async(nome)=> ARQ[b+'/'+nome] ? {data:ARQ[b+'/'+nome],error:null} : {data:null,error:{message:'Object not found'}}
    })},
    functions:{ invoke: async(nome,{body})=>{
      window.__IA_CHAMADAS = (window.__IA_CHAMADAS||0)+1;
      if (body.passo==='consultas') return {data:{itens:body.itens.map(it=>({consultas:[(it.ref||'')+'', (it.descricao||'').split(/[;:]/)[0].slice(0,40)]}))},error:null};
      return {data:{itens:body.itens.map(it=>({produto_id:null,confianca:'baixa',justificativa:'teste',descricao_sugerida:'SUGESTÃO DE CADASTRO TESTE'}))},error:null};
    }}
  };
  window.supabase = { createClient: ()=>client };
})();
