// Mangueiras montadas: regra do motor contra as FTMs que a Melting montou para a Arcelor
// usa dev/dados/cat.json, dev/dados/ftm.json (relpro_ftm completo, CSV) e dev/dados/arc.json
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const ftm = require('../dados/ftm.json');
let t0 = Date.now(); const R = M.agregarFtm(ftm); cat.definirFtm(R);
console.log('FTMs', R.ftms.length, '| resumo em', Date.now() - t0, 'ms | tamanho', (JSON.stringify(R).length / 1e6).toFixed(1), 'MB');
const by = new Map(ftm.map(r => [+r.id, r]));
const arc = require('../dados/arc.json').filter(r => /^FTM/.test(r.ref));
const base = (s) => M.comp(String(s || '')).replace(/SML.*$/, '').replace(/INOX.*$/, '');
const st = { itens: arc.length, respondidos: 0, mangueira_id: 0, mangueira_familia: 0, terminais_ok: 0, capa_ok: 0, comprimento_ok: 0, ftm_identica: 0, tudo_certo: 0 };
const conf = {};
// de-para simulado: metade das FTMs da Arcelor já aprovada (mangueira usada) -> o motor aprende a marca do cliente
const depara = new Map(arc.filter((r, i) => i % 2).map((r, i) => ['x' + i, String(by.get(+r.ref.replace(/\D/g, '')).mang_id)]));
const ctxCli = process.env.SEM_CLIENTE ? null : { depara };
for (const r of arc) {
  const x = by.get(+r.ref.replace(/\D/g, ''));
  const s = M.sugerir({ descricao: r.det, ref: '' }, Object.assign({ catalogo: cat }, ctxCli || {}));
  if (s.metodo !== 'regra-mangueira') continue;
  st.respondidos++; conf[s.confianca] = (conf[s.confianca] || 0) + 1;
  const c = s.componentes;
  const okM = c[0].id === String(x.mang_id); if (okM) st.mangueira_id++;
  const fam = (s2) => (String(s2).match(/^\d+[A-Z][A-Z0-9]*?(?=SML|-|$)/) || [''])[0];
  if (fam(c[0].apelido) === fam(String(x.descmang).trim())) st.mangueira_familia++;
  const certo = [x.descter1, (+x.qtdter1 >= 2 ? x.descter1 : x.descter2)].map(base).sort().join();
  const meu = c.filter(k => /terminal/.test(k.papel)).map(k => base(k.apelido)).sort().join();
  const okT = certo === meu; if (okT) st.terminais_ok++;
  const capa = c.find(k => k.papel === 'capa'); if (capa && capa.id === String(x.capa_id)) st.capa_ok++;
  if (c[0].qtd && Math.round(c[0].qtd * 1000) === Math.round(+x.metragem)) st.comprimento_ok++;
  if (s.ftm === String(+r.ref.replace(/\D/g, ''))) st.ftm_identica++;
  if (okM && okT) st.tudo_certo++;
}
console.log(st, 'confiança', conf);
for (const d of process.argv.slice(2)) { const s = M.sugerir({ descricao: d }, { catalogo: cat }); console.log('\n' + d.slice(0, 120) + '\n  =>', s.metodo, s.confianca, '|', s.motivo); }
