// Contrato Mercedes-Benz (dev/dados/merc.json, aba USO MELTING): 71 itens cotados com ID pela Melting.
// Motor "a frio" (sem de-para nem histórico do cliente): quanto ele acerta sozinho e o que responde no resto.
// uso: node --max-old-space-size=8000 dev/testes/benchmark_mercedes.js [-v]
const M = require('../../js/motor.js');
const D = '../dados/';
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirCortes(M.agregarCortes(require(D + 'relpro_nita.json').concat(require(D + 'relpro_mec.json'))));
cat.definirKits(M.agregarKits(require(D + 'relpro_sgm.json')));
cat.definirFtm(M.agregarFtm(require(D + 'ftm.json')));
try { cat.definirEquivalencias(require(D + 'equivalencias.json')); } catch (e) {}
const rows = require(D + 'merc.json');
const V = process.argv.includes('-v');
const q = rows.filter(r => r.id && r.id !== '0');
const st = { cotados: q.length, respondidos: 0, certo: 0, certo_nas_alternativas: 0, errado: 0, sem_resposta: 0 }; const met = {};
const lin = [];
for (const r of q) {
  const s = M.sugerir({ descricao: (r.breve + ' ' + r.det).trim(), ref: '' }, { catalogo: cat });
  const alt = (s.alternativas || []).some(a => String(a.id) === r.id);
  const k = !s.produto_id ? 'sem_resposta' : String(s.produto_id) === r.id ? 'certo' : alt ? 'certo_nas_alternativas' : 'errado';
  st[k]++; if (s.produto_id) st.respondidos++;
  met[s.metodo + ' ' + k] = (met[s.metodo + ' ' + k] || 0) + 1;
  const p = s.produto_id && cat.get(s.produto_id);
  lin.push([k, r.id + ' ' + r.ref, (r.breve + ' | ' + r.det).replace(/\s+/g, ' ').slice(0, 110), s.metodo + ' ' + (s.confianca || '') + ' ' + (p ? p.id + ' ' + p.a : '') + ' | ' + (s.motivo || '').slice(0, 120)]);
}
console.log('itens na planilha', rows.length, '|', st); console.log(met);
if (V) for (const l of lin.sort()) console.log(l.join('\n   '));
// itens ainda não cotados: o que o motor sugeriria
const nq = rows.filter(r => !r.id || r.id === '0');
const sm = {}; let n = 0; const ex = [];
for (const r of nq) {
  const s = M.sugerir({ descricao: (r.breve + ' ' + r.det).trim(), ref: '' }, { catalogo: cat });
  sm[s.metodo + ' ' + (s.confianca || '')] = (sm[s.metodo + ' ' + (s.confianca || '')] || 0) + 1;
  if (s.produto_id) { n++; if (ex.length < 40 && Math.random() < 0.15) { const p = cat.get(s.produto_id); ex.push((r.breve + ' | ' + r.det).replace(/\s+/g, ' ').slice(0, 100) + '\n   => ' + s.metodo + ' ' + s.confianca + ' ' + p.id + ' ' + p.a + ' | ' + (s.motivo || '').slice(0, 90)); } }
}
console.log('\nnão cotados', nq.length, '| motor sugere', n, sm);
if (V) ex.forEach(e => console.log(e));
