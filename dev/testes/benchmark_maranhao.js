// Contrato Maranhão (dev/dados/mar.json): mangueiras montadas pedidas pelo código Continental / COPABO
// (S4SH-16 1" X 1.150 MM / 2=JCFX-1616 + 2=UCS-16). Gabarito = FTM que a Melting montou (REFERÊNCIA 01, ftm.json).
// uso: node --max-old-space-size=8000 dev/testes/benchmark_maranhao.js [-v]
const M = require('../../js/motor.js');
const D = '../dados/';
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const ftm = require(D + 'ftm.json'); cat.definirFtm(M.agregarFtm(ftm));
const by = new Map(ftm.map(r => [String(+r.id), r]));
const V = process.argv.includes('-v');
const base = (s) => M.comp(String(s || '')).replace(/SML.*$/, '').replace(/INOX.*$/, '');
const fam = (a) => { const m = M.famMang(String(a || '').trim()); return m ? m[1] + m[2] : ''; };
const st = { itens: 0, com_ftm: 0, respondidos: 0, mangueira_familia: 0, mangueira_id: 0, terminais_ok: 0, comprimento_ok: 0, capa_ok: 0, tudo_certo: 0, falta_info_planilha: 0, falta_info_motor_avisou: 0 };
for (const r of require(D + 'mar.json')) {
  st.itens++;
  const d = r.breve + ' ' + (r.obs.split('|')[1] || '');
  const s = M.sugerir({ descricao: d, ref: '' }, { catalogo: cat });
  const id = (r.ref1.match(/FTM\s*(\d+)/) || [])[1]; const x = id && by.get(id);
  if (!x) { if (/FALTA|SEM CADASTRO/.test(r.ref1)) { st.falta_info_planilha++; if (/pedir ao cliente|não cadastrado|nenhum/.test(s.motivo + ' ' + s.metodo)) st.falta_info_motor_avisou++; } if (V) console.log('[' + r.ref1 + ']', d.slice(0, 90), '\n   =>', s.metodo, s.confianca, '|', (s.motivo || '').slice(0, 150)); continue; }
  st.com_ftm++;
  if (s.metodo !== 'regra-mangueira') { if (V) console.log('SEM', d.slice(0, 100), '\n   =>', s.metodo, s.motivo); continue; }
  st.respondidos++;
  const c = s.componentes;
  const okF = fam(c[0].apelido) === fam(x.descmang); if (okF) st.mangueira_familia++;
  if (c[0].id === String(x.mang_id)) st.mangueira_id++;
  const certo = [x.descter1, (+x.qtdter1 >= 2 ? x.descter1 : x.descter2)].filter(Boolean).map(base).sort().join();
  const meu = c.filter(k => /terminal/.test(k.papel)).map(k => base(String(k.apelido).replace(/ \(não cadastrado\)/, ''))).sort().join();
  const okT = certo === meu; if (okT) st.terminais_ok++;
  if (c[0].qtd && Math.abs(c[0].qtd * 1000 - +x.metragem) <= 2) st.comprimento_ok++;
  const capa = c.find(k => k.papel === 'capa'); if (capa && capa.id === String(x.capa_id)) st.capa_ok++;
  if (okF && okT) st.tudo_certo++;
  else if (V) console.log('ERR', d.slice(0, 100), '\n   certo', x.descmang, certo, '| motor', c[0].apelido, meu, '|', s.motivo.slice(0, 80));
}
console.log(st);
