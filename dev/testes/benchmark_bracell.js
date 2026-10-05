// Contrato Bracell / BPN Feira de Santana (dev/dados/bpn.json): 309 correias com ID preenchido pela Melting.
// A planilha tem IDs repetidos/arrastados de outras linhas, então o gabarito só vale onde a correia do ID
// confere com a descrição do cliente (perfil + comprimento + largura). Gera conferência com -x arquivo.xlsx.
// uso: node --max-old-space-size=8000 dev/testes/benchmark_bracell.js [-v] [-x saida.xlsx]
const M = require('../../js/motor.js');
const D = '../dados/';
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirCortes(M.agregarCortes(require(D + 'relpro_nita.json').concat(require(D + 'relpro_mec.json'))));
try { cat.definirEquivalencias(require(D + 'equivalencias.json')); } catch (e) {}
const V = process.argv.includes('-v'); const xi = process.argv.indexOf('-x');
const rows = require(D + 'bpn.json').filter(r => r.item !== 'ITEM' && r.breve);
const chave = (p) => p ? [p.fam, p.tp ? 'TP' : '', p.perfil.replace(/GT\d?$|GTE$/, ''), p.comp, p.larg].join('|') : null;
const doPedido = (s) => chave(M.parseCorreia(s, false));
const doProduto = (id) => { const p = cat.get(id); return p ? chave(M.parseCorreia('CORREIA ' + p.d, true)) : null; };
const st = { linhas: rows.length, planilha_confere: 0, planilha_nao_confere: 0, planilha_sem_como_comparar: 0, motor_igual_planilha: 0, motor_certo_onde_planilha_confere: 0, motor_responde: 0, planilha_suspeita_motor_confere: 0 };
const out = [['ITEM', 'COD. CLIENTE', 'DESCRIÇÃO DO CLIENTE', 'ID NA PLANILHA', 'APELIDO NA PLANILHA', 'CONFERE COM A DESCRIÇÃO?', 'ID SUGERIDO PELO MOTOR', 'APELIDO MOTOR', 'MÉTODO / CONFIANÇA', 'MOTIVO', 'SITUAÇÃO']];
for (const r of rows) {
  const s = M.sugerir({ descricao: r.breve + ' ' + r.det, ref: '' }, { catalogo: cat });
  const kp = doPedido(r.breve), kPl = r.id && doProduto(r.id), kMo = s.produto_id && doProduto(s.produto_id);
  const conf = kp && kPl ? (kp === kPl ? 'sim' : 'não') : '?';
  if (conf === 'sim') st.planilha_confere++; else if (conf === 'não') st.planilha_nao_confere++; else st.planilha_sem_como_comparar++;
  if (s.produto_id) st.motor_responde++;
  if (s.produto_id && String(s.produto_id) === r.id) st.motor_igual_planilha++;
  if (conf === 'sim' && String(s.produto_id) === r.id) st.motor_certo_onde_planilha_confere++;
  let sit = String(s.produto_id) === r.id ? 'ok (motor = planilha)' : '';
  if (!sit && conf === 'não' && kMo && kMo === kp) { sit = 'PLANILHA SUSPEITA — motor achou a correia da descrição'; st.planilha_suspeita_motor_confere++; }
  else if (!sit && conf === 'não') sit = 'PLANILHA SUSPEITA — ID não confere com a descrição';
  else if (!sit && conf === 'sim') sit = 'motor diferente (planilha confere)';
  else if (!sit) sit = 'conferir';
  const pp = cat.get(r.id), pm = s.produto_id && cat.get(s.produto_id);
  out.push([r.item, r.cod, r.breve, r.id, pp ? pp.a : r.apelido, conf, s.produto_id || '', pm ? pm.a : '', s.metodo + ' ' + (s.confianca || ''), s.motivo || '', sit]);
  if (V && !/^ok/.test(sit)) console.log(sit, '|', r.breve, '\n   planilha', r.id, pp ? pp.a : r.apelido, '| motor', pm ? pm.a : '-', s.metodo, '|', (s.motivo || '').slice(0, 90));
}
console.log(st);
if (xi > 0) { const X = require('../../js/vendor/xlsx.full.min.js'); const ws = X.utils.aoa_to_sheet(out); ws['!cols'] = [6, 12, 45, 9, 30, 10, 9, 30, 20, 60, 45].map(w => ({ wch: w })); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Conferência'); require('fs').writeFileSync(process.argv[xi + 1], X.write(wb, { type: 'buffer', bookType: 'xlsx' })); }
// marca preferida do cliente: metade das linhas conferidas vira de-para, mede a outra metade
{
  const conferidas = rows.filter(r => { const a = doPedido(r.breve), b = r.id && doProduto(r.id); return a && a === b; });
  const dp = new Map(conferidas.filter((r, i) => i % 2 === 0).map(r => ['dp' + r.cod, r.id]));
  const teste = conferidas.filter((r, i) => i % 2 === 1);
  for (const [nome, ctx] of [['a frio', {}], ['com de-para (marca do cliente)', { depara: dp }]]) {
    let ok = 0; for (const r of teste) { const s = M.sugerir({ descricao: r.breve, ref: '' }, Object.assign({ catalogo: cat }, ctx)); if (String(s.produto_id) === r.id) ok++; }
    console.log('metade de teste', teste.length, '|', nome, ':', ok, 'iguais à planilha');
  }
}
