// Pedidos 2026 (ped2026.csv do SIG -> dev/dados/ped2026.csv, latin1, ';'): REFERENCIACLIENTE = código do material do cliente.
// Mede quanto o histórico de pedidos responde sozinho nos contratos já cotados (Arcelor, Bracell, Mercedes) — passo 2 do motor.
// uso: node --max-old-space-size=8000 dev/testes/benchmark_pedidos.js
const M = require('../../js/motor.js'); const fs = require('fs'); const path = require('path');
const D = path.join(__dirname, '../dados/');
const raw = require(D + 'cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const txt = new TextDecoder('windows-1252').decode(fs.readFileSync(D + 'ped2026.csv'));
const L = txt.split(/\r?\n/).filter(Boolean); const H = L[0].split(';');
const iso = (d) => d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
const R = L.slice(1).map(l => { const c = l.split(';'); const o = {}; H.forEach((h, i) => o[h] = c[i]); return o; })
  .filter(r => r.REFERENCIACLIENTE && r.REFERENCIACLIENTE !== '(NULO)' && Number(String(r.PRECO).replace(',', '.')) > 0)
  .sort((a, b) => iso(a.DATAEMISSAO).localeCompare(iso(b.DATAEMISSAO)));
const hist = new Map(); for (const r of R) hist.set(r.REFERENCIACLIENTE.trim(), { id: r.CODIGOPRODUTO, data: iso(r.DATAEMISSAO), cliente: r.NOMECLIENTE, geral: true });
console.log('pedidos com código do cliente:', R.length, '| códigos distintos:', hist.size);
const casos = [
  ['ARCELOR', require(D + 'arc.json').filter(r => r.id), (r) => ({ codCliente: r.cod, descricao: r.det, ref: '' }), (r) => r.id],
  ['BRACELL (ID da planilha)', require(D + 'bpn.json').filter(r => r.item !== 'ITEM' && r.id), (r) => ({ codCliente: r.cod, descricao: r.breve, ref: '' }), (r) => r.id],
  ['MERCEDES (cotados)', require(D + 'merc.json').filter(r => r.id && r.id !== '0'), (r) => ({ codCliente: r.cod, descricao: r.breve + ' ' + r.det, ref: '' }), (r) => r.id]
];
for (const [nome, itens, item, certo] of casos) {
  for (const [modo, ctx] of [['a frio', {}], ['com pedidos 2026', { historico: hist }]]) {
    let ok = 0, resp = 0, hi = 0;
    for (const r of itens) { const s = M.sugerir(item(r), Object.assign({ catalogo: cat }, ctx)); if (s.produto_id) resp++; if (String(s.produto_id) === String(certo(r))) ok++; if (s.metodo === 'historico') hi++; }
    console.log(nome.padEnd(38), modo.padEnd(17), '| itens', itens.length, '| respondidos', resp, '| iguais à planilha', ok, '| pelo histórico', hi);
  }
}
