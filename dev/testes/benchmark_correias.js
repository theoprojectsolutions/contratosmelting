// Regra de correias contra o cadastro (dev/dados/cat.json, gerado por gerar_dados_teste.js)
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const ix = cat.indiceCorreias();
const n = cat.lista.filter(o => /CORREIA|SLAB/.test(o.d + ' ' + M.up(o.familia))).length;
let lidos = 0; const porFam = {}; for (const [k, v] of ix) { if (k.endsWith('|*')) continue; lidos += v.length; const f = k.split('|')[0]; porFam[f] = (porFam[f] || 0) + v.length; }
console.log('correias no cadastro', n, '| lidas pela regra', lidos, porFam, '| chaves', ix.size);
// auto-teste: reescreve a descrição do cadastro no jeito "cliente" e vê se volta para um item da mesma chave
let t = 0, ok = 0; const erros = [];
for (const [k, v] of ix) {
  if (k.endsWith('|*')) continue;
  const o = v[0], p = o._correia; t++;
  const det = p.fam === 'mv' ? `CORREIA MICRO V; REF.${p.perfil} ${p.comp}; ${p.larg} CANAIS` :
    p.fam === 'v' && /^PF/.test(p.perfil) ? `CORREIA POLYFLEX ${p.perfil.slice(2)} ${p.comp}` + (p.larg > 1 ? ` ${p.larg} BANDAS` : '') :
    p.fam === 'v' ? `CORREIA EM V ${p.perfil}-${p.comp}` + (p.larg > 1 ? `; POWER BAND ${p.larg} BANDAS` : '') :
    `CORREIA ${p.tp ? 'DUPLA ' : ''}SINCRONIZADA; REF.${p.tp ? 'TP ' : ''}${p.comp} ${p.perfil}${p.ger || ''}; L.${p.larg}`;
  const s = M.sugerir({ descricao: det }, { catalogo: cat });
  if (s.produto_id && v.some(x => x.id === s.produto_id)) ok++; else if (erros.length < 15) erros.push(det + ' => ' + s.metodo + ' ' + s.produto_id + ' ' + (s.produto_id ? cat.get(s.produto_id).d : ''));
}
console.log('auto-teste', ok, '/', t);
erros.forEach(e => console.log('  ', e));
for (const d of process.argv.slice(2)) { const s = M.sugerir({ descricao: d }, { catalogo: cat }); console.log('\n' + d + '\n  =>', s.produto_id, s.produto_id ? cat.get(s.produto_id).a + ' | ' + cat.get(s.produto_id).d : '', '|', s.metodo, s.confianca, '|', s.motivo, '| alt:', (s.alternativas || []).map(a => cat.get(a.id) ? cat.get(a.id).a : a.id).join(', ')); }
