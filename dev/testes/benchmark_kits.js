// Kits SGM (dev/dados/relpro_sgm.json) contra os itens da Arcelor cotados com SGM
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const kits = M.agregarKits(require('../dados/relpro_sgm.json'));
console.log('kits', kits.length, '| novos no catálogo', cat.definirKits(kits));
const arc = require('../dados/arc.json').filter(a => a.id && /SGM/i.test(a.ref));
for (const comRef of [true, false]) {
  const st = {};
  for (const a of arc) {
    const s = M.sugerir({ descricao: a.det, ref: comRef ? a.ref : '' }, { catalogo: cat });
    const alt = (s.alternativas || []).some(x => x.id === a.id);
    const k = s.metodo + (s.produto_id === a.id ? ' ok' : alt ? ' kit-nas-alternativas' : s.produto_id ? ' ERR' : '');
    st[k] = (st[k] || 0) + 1;
  }
  console.log(comRef ? 'COM REF' : 'SEM REF', arc.length, JSON.stringify(st));
}
