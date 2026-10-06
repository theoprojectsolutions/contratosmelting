// "Orçamento novo" com histórico por descrição: vendas até a data de corte viram histórico (ctx.histDesc, como o site monta
// em histPorDescricao), as linhas depois do corte são os pedidos novos. Compara motor a frio x com histórico.
// Uso: node dev/testes/benchmark_hist_desc.js [corte serial excel, padrão 46200 ≈ 26/06/2026] [-n amostra]
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirFtm(M.agregarFtm(require('../dados/ftm.json')));
const corte = +(process.argv[2] || 46200); const iN = process.argv.indexOf('-n'); const N = iN > 0 ? +process.argv[iN + 1] : 3000;
const L = require('../dados/ped_complemento.json').filter(r => /^\d+$/.test(r[2])).sort((a, b) => a[4] - b[4]);
const antes = L.filter(r => r[4] < corte), depois = L.filter(r => r[4] >= corte);
const g = new Map();
for (const r of antes) { const k = M.chaveDescHist(r[1]); if (k.length < 8) continue; const m = g.get(k) || new Map(); const x = m.get(r[2]) || { n: 0, cli: new Set() }; x.n++; x.cli.add(r[5]); m.set(r[2], x); g.set(k, m); }
// amostra espalhada dos pedidos novos, um por descrição+produto
const vistos = new Set(); let teste = depois.filter(r => { const k = r[1] + '|' + r[2] + '|' + r[5]; if (vistos.has(k)) return false; vistos.add(k); return true; });
const passo = Math.max(1, Math.floor(teste.length / N)); teste = teste.filter((_, i) => i % passo === 0).slice(0, N);
const st = { corte, historico_linhas: antes.length, testados: teste.length, frio: { certo: 0, errado: 0, sem: 0 }, com_hist: { certo: 0, errado: 0, sem: 0, pela_descricao: 0, pela_descricao_certo: 0 } };
// mapa sem cliente (barato) + ajuste do próprio cliente na hora
const geral = new Map(); for (const [k, m] of g) { let best = null; for (const [id, x] of m) if (!best || x.n > best.n) best = { id, n: x.n, doCliente: false }; geral.set(k, best); }
const conta = (o, s, id) => { const ids = [s.produto_id].concat((s.componentes || []).map(c => String(c.id))); if (!s.produto_id && !(s.componentes || []).length) o.sem++; else if (ids.includes(id)) o.certo++; else o.errado++; };
for (const r of teste) {
  const it = { descricao: r[1], ref: '' };
  conta(st.frio, M.sugerir(it, { catalogo: cat }), r[2]);
  const k = M.chaveDescHist(r[1]); const m = g.get(k);
  let best = null; if (m) for (const [id, x] of m) { const doCli = x.cli.has(r[5]); const sc = (doCli ? 1e6 : 0) + x.n; if (!best || sc > best.sc) best = { sc, id, n: x.n, doCliente: doCli }; }
  const hd = { size: geral.size, get: (kk) => kk === k && best ? best : geral.get(kk) };
  const s = M.sugerir(it, { catalogo: cat, histDesc: hd });
  conta(st.com_hist, s, r[2]);
  if (/Mesma descrição/.test(s.motivo || '')) { st.com_hist.pela_descricao++; if (s.produto_id === r[2]) st.com_hist.pela_descricao_certo++; }
}
console.log(JSON.stringify(st, null, 1));
