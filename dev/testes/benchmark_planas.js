// Correias planas: histórico de cortes (dev/dados/relpro_nita.json / relpro_mec.json) + cadastro (cat.json)
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const rel = [].concat(require('../dados/relpro_nita.json'), require('../dados/relpro_mec.json'));
const ag = M.agregarCortes(rel); cat.definirCortes(ag);
console.log('cortes', rel.length, '-> agregados', ag.length, '| materiais', cat._cortes.porCod.size, '| medidas', cat._cortes.porMedida.size, '| planas prontas no cadastro', cat.indicePlanas().size);
// auto-teste: pedido "CORREIA PLANA {material} {larg} X {comp} MM" tem que voltar no material base (ou na pronta do mesmo material)
let t = 0, ok = 0; const erros = [];
const amostra = ag.filter((_, i) => i % 7 === 0);
for (const [mat, base, larg, cmp] of amostra) {
  if (!cat.get(base) || !cat.get(base).ativo) continue; t++;
  const s = M.sugerir({ descricao: `CORREIA PLANA TRANSMISSAO ${mat} ${larg} X ${cmp} MM` }, { catalogo: cat });
  const p = s.produto_id && cat.get(s.produto_id);
  if (s.produto_id === base || (p && M.comp(p.a + p.d).includes(M.comp(mat).replace(/\//g, '')))) ok++; else if (erros.length < 12) erros.push(`${mat} ${larg}x${cmp} => ${s.metodo} ${s.produto_id || ''} ${p ? p.d : ''} | ${s.motivo}`);
}
console.log('auto-teste', ok, '/', t); erros.forEach(e => console.log('  ', e));
for (const d of process.argv.slice(2)) { const s = M.sugerir({ descricao: d }, { catalogo: cat }); console.log('\n' + d + '\n  =>', s.produto_id, s.produto_id ? cat.get(s.produto_id).d : '', '|', s.metodo, s.confianca, '|', s.motivo, '\n  alt:', (s.alternativas || []).map(a => (cat.get(a.id) || {}).d + ' [' + a.recusa + ']').join(' ; ')); }

// Mectrol (LL): pedido "CORREIA SINCRONIZADA PU {comp} {perfil} {larg} ACO" -> material LL base (ou correia pronta igual no cadastro)
{
  const mec = M.agregarCortes(require('../dados/relpro_mec.json')).filter(r => M.parseLL(r[0]));
  let t2 = 0, ok2 = 0, base2 = 0, pronta2 = 0, slab2 = 0; const err2 = [];
  for (const [mat, base, , cmp] of mec) {
    const ll = M.parseLL(mat); if (!cat.get(base)) continue; t2++;
    const v = ll.variante; const c = Math.round(cmp);
    const s = M.sugerir({ descricao: `CORREIA SINCRONIZADA POLIURETANO ${c} ${ll.perfil} ${ll.larg}` + (/ACO/.test(v) ? ' CABO ACO' : '') + (/KEVLAR/.test(v) ? ' CABO KEVLAR' : '') + (/NT/.test(v) ? ' NT' : '') + (/BRANC/.test(v) ? ' BRANCA' : '') + (/MELT/.test(v) ? ' MELTING' : '') }, { catalogo: cat });
    const p = s.produto_id && cat.get(s.produto_id);
    if (s.produto_id === base) { ok2++; base2++; }
    else if (p && /SLAB/.test(p.d) && p._correia && p._correia.perfil === ll.perfil && p._correia.comp === Math.round(cmp)) { ok2++; slab2++; }
    else if (p && p._correia && p._correia.perfil.replace(/GT$/, '') === ll.perfil && p._correia.larg === ll.larg && p._correia.comp === Math.round(cmp)) { ok2++; pronta2++; }
    else if (err2.length < 8) err2.push(`${mat} ${cmp} => ${s.metodo} ${p ? p.d : ''} | ${s.motivo}`);
  }
  console.log('Mectrol LL:', ok2, '/', t2, `(material LL ${base2}, correia pronta igual ${pronta2}, slab do mesmo comprimento ${slab2})`); err2.forEach(e => console.log('  ', e));
}
