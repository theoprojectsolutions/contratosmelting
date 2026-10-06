// Benchmark "orçamento novo": descrição que entrou no pedido (Complemento, export do ERP) x produto que a Melting vendeu.
// Motor a frio (sem histórico do cliente). Uso: node dev/testes/benchmark_orcamento.js [-n 5000] [-x saida.json]
// Dados: dev/dados/ped_complemento.json = [[cliente, complemento, produto, preço, data(serial excel), cod cliente], ...]
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirFtm(M.agregarFtm(require('../dados/ftm.json')));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const limpa = (s) => String(s || '').replace(/\s+Ped\.:.*$/, '').replace(/\s+(Ref\.|Item):.*$/, '').trim();
const L = require('../dados/ped_complemento.json');
const pares = new Map();
for (const r of L) { if (!/^\d+$/.test(r[2])) continue; const d = limpa(r[1]); if (!d) continue; const k = d + '|' + r[2]; const x = pares.get(k) || { d, id: r[2], n: 0 }; x.n++; pares.set(k, x); }
let lista = [...pares.values()]; const N = +(arg('-n') || 0); if (N) lista = lista.slice(0, N);
const ap = (id) => { const p = cat.get(String(id)); return p ? p.a : ''; };
const st = { pares: lista.length, linhas: 0, id_fora_do_cadastro: 0, respondidos: 0, mesmo_id: 0, mesmo_id_linhas: 0, nas_alternativas: 0, errado: 0, sem_resposta: 0, por_regra: {}, por_familia: {} };
const out = [];
const t0 = Date.now();
lista.forEach((x, i) => {
  st.linhas += x.n;
  const p = cat.get(x.id); if (!p) { st.id_fora_do_cadastro++; return; }
  const s = M.sugerir({ descricao: x.d, ref: '' }, { catalogo: cat });
  const id = s.produto_id || s.id || null; const comps = (s.componentes || []).map(c => String(c.id));
  const regra = s.metodo || s.regra || '?';
  const fam = p.familia || '?'; const F = st.por_familia[fam] = st.por_familia[fam] || { n: 0, certo: 0, resp: 0 }; F.n++;
  let res;
  if (!id && !comps.length) { st.sem_resposta++; res = 'sem'; }
  else { st.respondidos++; F.resp++;
    if (String(id) === x.id || comps.includes(x.id)) { st.mesmo_id++; st.mesmo_id_linhas += x.n; F.certo++; res = 'certo'; }
    else if ((s.alternativas || []).some(a => String(a.id) === x.id)) { st.nas_alternativas++; res = 'alt'; }
    else { st.errado++; res = 'errado'; } }
  const R = st.por_regra[regra + ' ' + res] = (st.por_regra[regra + ' ' + res] || 0) + 1;
  out.push([x.d, x.id, p.a, res, id, id ? ap(id) : '', s.confianca, regra, x.n]);
  if (i % 2000 === 0 && i) process.stderr.write(i + ' em ' + Math.round((Date.now() - t0) / 1000) + 's\n');
});
st.segundos = Math.round((Date.now() - t0) / 1000);
st.por_familia = Object.fromEntries(Object.entries(st.por_familia).sort((a, b) => b[1].n - a[1].n).slice(0, 25));
console.log(JSON.stringify(st, null, 1));
if (arg('-x')) require('fs').writeFileSync(arg('-x'), JSON.stringify(out));
