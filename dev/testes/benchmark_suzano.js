// RFQ Suzano - correias (dev/dados/suz.json, aba USO MELTING): 985 itens, 921 cotados com ID, 192 negociados.
// Descrição SAP com REFERENCIA COMERCIAL e referências de fabricante (GATES: 5V1320 GOODYEAR: ...).
// uso: node --max-old-space-size=8000 dev/testes/benchmark_suzano.js [-v]
const M = require('../../js/motor.js'); const fs = require('fs'); const path = require('path');
const D = path.join(__dirname, '../dados/');
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirCortes(M.agregarCortes(require(D + 'relpro_nita.json').concat(require(D + 'relpro_mec.json'))));
cat.definirFtm(M.agregarFtm(require(D + 'ftm.json'))); cat.definirKits(M.agregarKits(require(D + 'relpro_sgm.json')));
try { cat.definirEquivalencias(require(D + 'equivalencias.json')); } catch (e) {}
const V = process.argv.includes('-v');
const iso = (d) => d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
const hist = new Map();
try {
  const txt = new TextDecoder('windows-1252').decode(fs.readFileSync(D + 'ped2026.csv')); const L = txt.split(/\r?\n/).filter(Boolean); const H = L[0].split(';');
  L.slice(1).map(l => { const c = l.split(';'); const o = {}; H.forEach((h, i) => o[h] = c[i]); return o; })
    .filter(r => r.REFERENCIACLIENTE && r.REFERENCIACLIENTE !== '(NULO)' && Number(String(r.PRECO).replace(',', '.')) > 0)
    .sort((a, b) => iso(a.DATAEMISSAO).localeCompare(iso(b.DATAEMISSAO)))
    .forEach(r => hist.set(r.REFERENCIACLIENTE.trim(), { id: r.CODIGOPRODUTO, data: iso(r.DATAEMISSAO), cliente: r.NOMECLIENTE, geral: !/SUZANO/.test(r.NOMECLIENTE) }));
} catch (e) {}
const itens = require(D + 'suz.json').filter(r => r.id);
const chave = (s, cad) => { const p = M.parseCorreia(s, cad); return p ? [p.fam, p.tp ? 'TP' : '', p.perfil.replace(/GT\d?$|GTE$|LW$/, ''), p.comp, p.larg].join('|') : null; };
for (const [modo, ctx] of [['a frio', {}], ['com pedidos 2026', { historico: hist }]]) {
  const st = { itens: itens.length, respondidos: 0, mesmo_id: 0, mesma_correia_outra_marca: 0, diferente: 0, sem_resposta: 0, negociados_mesmo_id: 0 }; const met = {}; const ex = [];
  for (const r of itens) {
    const s = M.sugerir({ codCliente: r.cod, descricao: r.breve + ' ' + r.det, ref: '' }, Object.assign({ catalogo: cat }, ctx));
    let k;
    if (!s.produto_id) k = 'sem_resposta';
    else if (String(s.produto_id) === r.id) k = 'mesmo_id';
    else { const a = cat.get(s.produto_id), b = cat.get(r.id); const ka = a && chave('CORREIA ' + a.d, true), kb = b && chave('CORREIA ' + b.d, true); k = ka && ka === kb ? 'mesma_correia_outra_marca' : 'diferente'; }
    st[k]++; if (s.produto_id) st.respondidos++; if (k === 'mesmo_id' && r.neg) st.negociados_mesmo_id++;
    met[s.metodo + ' ' + k] = (met[s.metodo + ' ' + k] || 0) + 1;
    if (V && k === 'diferente' && ex.length < 40) { const a = cat.get(s.produto_id); ex.push(r.breve.slice(0, 60) + '\n   planilha ' + r.id + ' ' + r.apelido + ' | motor ' + (a ? a.a : '') + ' ' + s.metodo + ' | ' + (s.motivo || '').slice(0, 80)); }
  }
  console.log(modo, st); console.log('  ', JSON.stringify(met)); ex.forEach(e => console.log(e));
}
