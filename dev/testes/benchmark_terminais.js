// Terminal avulso descrito no estilo do SIG ("FEMEA GIRATORIA RETA JIC 37º UNF 9/16 X 3/8 2TR") -> regra terminalSigRule.
// Gabarito: base PBI de terminais hidráulicos (dev/dados/pbi_terminais.json = [[id, descrição, tipo, linha, material], ...], fora do git).
// Uso: node dev/testes/benchmark_terminais.js [-v]
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const L = require('../dados/pbi_terminais.json');
const base = (id) => { const p = cat.get(id); return p ? p.a.replace(/SML.*$/, '') : ''; };
const st = { itens: L.length, respondidos: 0, mesmo_id: 0, mesmo_codigo_outro_id: 0, errado: 0, sem_resposta: 0 };
const v = process.argv.includes('-v');
for (const [id, d] of L) {
  const x = M.terminalSigRule(d, (c) => cat.lookupApelido(c));
  if (!x) { st.sem_resposta++; continue; }
  st.respondidos++;
  if (x.id === id) st.mesmo_id++;
  else if (base(x.id) === base(id)) st.mesmo_codigo_outro_id++;
  else { st.errado++; if (v) console.log('ERR', d, '->', x.apelido, '| certo', cat.get(id) && cat.get(id).a); }
}
console.log(st);
