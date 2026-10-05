// Equivalências de correias (outra marca -> Nitta): para cada linha da tabela, pede
// "CORREIA PLANA {MARCA} {CÓDIGO} 500 X 3000MM" e confere se o motor devolve o material Nitta equivalente.
// usa dev/dados/cat.json, relpro_nita.json, relpro_mec.json e equivalencias.json (tabela confidencial — fora do git)
const M = require('../../js/motor.js');
const D = '../dados/';
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirCortes(M.agregarCortes(require(D + 'relpro_nita.json').concat(require(D + 'relpro_mec.json'))));
const eq = require(D + 'equivalencias.json'); cat.definirEquivalencias(eq);
const cod = (s) => M.comp(s).replace(/\//g, '');
const st = { linhas: eq.length, com_material_cortado: 0, respondidos: 0, material_certo: 0, sem_material_avisado: 0 }; const erros = [];
for (const r of eq) {
  const d = 'CORREIA PLANA ' + (r.marca || '').split('/')[0] + ' ' + r.codigo + ' 500 X 3000MM';
  const alvo = eq.filter(x => cod(x.codigo) === cod(r.codigo)).map(x => cod(x.nitta));
  const temCorte = alvo.some(c => cat._cortes.porCod.has(c));
  const s = M.sugerir({ descricao: d, ref: '' }, { catalogo: cat });
  if (temCorte) {
    st.com_material_cortado++;
    if (s.metodo === 'regra-correia') st.respondidos++;
    const b = s.produto_id && alvo.some(c => { const x = cat._cortes.porCod.get(c); return x && x.base === String(s.produto_id); });
    if (b || cat._cortes.porCod.has(cod(r.codigo))) st.material_certo++; else if (erros.length < 12) erros.push(d + ' => ' + s.metodo + ' | ' + s.motivo);
  } else if (/nunca cortado/.test(s.motivo || '')) st.sem_material_avisado++;
}
console.log(st);
for (const e of erros) console.log(' -', e);
// não pode atrapalhar correia sincronizadora / em V
for (const d of ['CORREIA SINCRONIZADA T5 10 X 1000', 'CORREIA SINCRONIZADORA 1040 8M 30', 'CORREIA EM V A-40', 'CORREIA T10 1010 32MM']) {
  const s = M.sugerir({ descricao: d, ref: '' }, { catalogo: cat }); if (/equivalente Nitta/.test(s.motivo || '')) console.log(' ! sincronizadora pega pela tabela:', d, '=>', s.motivo);
}
