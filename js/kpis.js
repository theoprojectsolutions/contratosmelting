// =====================================================================
// MELTING · KPIs DE CONSUMO REAL
// Cruza os itens do contrato com o histórico de vendas do SIG.
// Funções puras (sem tela, sem banco) — usadas pelo sistema e pelos testes.
// =====================================================================
(function (root) {
  'use strict';
  const DIA = 86400000;
  const d0 = (s) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : d; };
  const iso = (d) => d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;

  // "Clientes no SIG" do contrato: códigos e/ou nomes (fantasia), separados por vírgula.
  // Ex.: "TRIVIUM PACKAGING, 003142". Item com letra = nome; só números = código.
  const nomeNorm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const semZeros = (s) => String(s == null ? '' : s).trim().replace(/^0+(?=\d)/, '');
  function tokens(contrato) { return String(contrato.codigosCliente || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); }
  function codigos(contrato) { return tokens(contrato).filter(t => !/[A-Za-z]/.test(t)).map(semZeros); }
  function nomes(contrato) { return tokens(contrato).filter(t => /[A-Za-z]/.test(t)).map(nomeNorm); }
  function temCliente(contrato) { return tokens(contrato).length > 0; }
  function vendaDoCliente(contrato, v, cache) {
    const c = cache || { cods: new Set(codigos(contrato)), nomes: new Set(nomes(contrato)) };
    return c.cods.has(semZeros(v.cliente_codigo)) || c.nomes.has(nomeNorm(v.cliente_nome));
  }

  // vendas: [{data, cliente_codigo, produto_id, quantidade, preco_unit, descricao}]
  function calcularContrato(contrato, itens, vendas, params, hoje) {
    params = params || {};
    hoje = hoje || new Date();
    const ini = d0(contrato.dataInicio), fim = d0(contrato.dataFim);
    const chave = { cods: new Set(codigos(contrato)), nomes: new Set(nomes(contrato)) };
    const duracao = (ini && fim) ? Math.max(1, (fim - ini) / DIA) : null;
    const decorrido = (ini && duracao) ? Math.min(duracao, Math.max(0, (hoje - ini) / DIA)) : null;
    const pctTempo = duracao ? decorrido / duracao * 100 : null;

    const vendasCliente = ((chave.cods.size || chave.nomes.size) && ini && fim) ? vendas.filter(v => {
      if (!vendaDoCliente(contrato, v, chave)) return false;
      const d = d0(v.data); return d && d >= ini && d <= fim;
    }) : [];

    const porProduto = new Map();
    for (const v of vendasCliente) {
      const k = String(v.produto_id);
      const a = porProduto.get(k) || { qtd: 0, valor: 0, ultima: null, descricao: v.descricao, pedidos: 0 };
      a.qtd += Number(v.quantidade) || 0;
      a.valor += (Number(v.quantidade) || 0) * (Number(v.preco_unit) || 0);
      a.pedidos++;
      const d = d0(v.data); if (d && (!a.ultima || d > a.ultima)) a.ultima = d;
      porProduto.set(k, a);
    }

    const ativos = itens.filter(it => it.status !== 'rejeitado');
    const noContrato = new Set(ativos.filter(it => it.produto_id).map(it => String(it.produto_id)));
    let valorEstimado = 0, valorConsumido = 0, qtdEst = 0, qtdCons = 0, semGiro = 0, divergentes = 0, comId = 0, semCadastro = 0;
    const usados = new Set();
    const linhas = ativos.map(it => {
      const pid = it.produto_id ? String(it.produto_id) : null;
      if (pid) comId++; else semCadastro++;
      // o mesmo produto pode aparecer em mais de uma linha do contrato: o consumo entra só na primeira
      const a = (pid && !usados.has(pid)) ? porProduto.get(pid) : null;
      if (pid) usados.add(pid);
      const est = Number(it.qtd_estimada) || 0, preco = Number(it.preco_contratado) || 0;
      const qtd = a ? a.qtd : 0, valor = a ? a.valor : 0;
      const precoMedio = qtd > 0 ? valor / qtd : null;
      const pct = est > 0 ? qtd / est * 100 : null;
      const giro = !(qtd === 0 && pctTempo != null && pctTempo >= (params.semGiroPctVigencia || 50) && pid);
      const diverg = (precoMedio != null && preco > 0) ? (precoMedio - preco) / preco * 100 : null;
      const divergente = diverg != null && Math.abs(diverg) > (params.divergenciaPrecoPct || 5);
      if (!giro) semGiro++;
      if (divergente) divergentes++;
      valorEstimado += est * preco; qtdEst += est;
      valorConsumido += (preco > 0 ? qtd * preco : valor); qtdCons += qtd;
      return Object.assign({}, it, {
        qtdConsumida: qtd, valorConsumido: valor, precoMedio, pctConsumo: pct, ultimaCompra: a ? iso(a.ultima) : null,
        semGiro: !giro, divergenciaPreco: diverg, divergente
      });
    });

    const fora = [];
    for (const [pid, a] of porProduto) if (!noContrato.has(pid)) fora.push({ produto_id: pid, descricao: a.descricao, quantidade: a.qtd, valor: a.valor, ultimaCompra: iso(a.ultima), pedidos: a.pedidos });
    fora.sort((x, y) => y.valor - x.valor);
    const valorFora = fora.reduce((s, f) => s + f.valor, 0);

    // valor: usa preço contratado quando houver (mede "quanto do contrato já saiu");
    // sem preço, cai para quantidade
    const temValor = valorEstimado > 0;
    const pctConsumo = temValor ? valorConsumido / valorEstimado * 100 : (qtdEst > 0 ? qtdCons / qtdEst * 100 : null);
    const ritmo = (pctConsumo != null && pctTempo) ? pctConsumo / pctTempo : null;
    let previsaoEsgotamento = null, naoEsgota = false;
    if (pctConsumo && pctConsumo > 0 && decorrido > 0) {
      const diasTotal = decorrido * 100 / pctConsumo;
      // além de 2× a vigência a previsão não diz nada: "não esgota na vigência"
      if (diasTotal <= duracao * 2) previsaoEsgotamento = iso(new Date(ini.getTime() + diasTotal * DIA));
      else naoEsgota = true;
    } else if (pctConsumo === 0 && decorrido > 0) naoEsgota = true;
    let leituraRitmo = 'sem dados';
    if (ritmo != null) {
      if (ritmo < (params.ritmoBaixo || 0.8)) leituraRitmo = 'abaixo do ritmo';
      else if (ritmo > (params.ritmoAlto || 1.2)) leituraRitmo = 'acima do ritmo';
      else leituraRitmo = 'no ritmo';
    }
    return {
      temItens: ativos.length > 0, temVendas: vendasCliente.length > 0, temCodigos: chave.cods.size + chave.nomes.size > 0,
      itens: linhas, totalItens: ativos.length, comId, semCadastro, cobertura: ativos.length ? comId / ativos.length * 100 : null,
      valorEstimado, valorConsumido, qtdEstimada: qtdEst, qtdConsumida: qtdCons, pctConsumo, pctTempo, ritmo, leituraRitmo,
      previsaoEsgotamento, naoEsgota, semGiro, divergentes, fora, valorFora,
      pctFora: (valorConsumido + valorFora) > 0 ? valorFora / (valorConsumido + valorFora) * 100 : null
    };
  }

  function kpisCotacoes(cotacoes) {
    const fechadas = cotacoes.filter(c => c.status === 'Renovado' || c.status === 'Perdido');
    const ganhas = fechadas.filter(c => c.status === 'Renovado').length;
    const tempos = cotacoes.map(c => {
      const a = d0(c.dataRecebimento), b = d0(c.dataEnvio);
      return (a && b && b >= a) ? (b - a) / DIA : null;
    }).filter(x => x != null);
    const cob = cotacoes.filter(c => c.itensEstimados > 0).map(c => c.itensCotados / c.itensEstimados * 100);
    const valorPerdido = cotacoes.filter(c => c.status === 'Perdido').reduce((s, c) => s + (Number(c.valorCotado) || 0), 0);
    return {
      conversao: fechadas.length ? ganhas / fechadas.length * 100 : null, fechadas: fechadas.length, ganhas,
      tempoMedioResposta: tempos.length ? tempos.reduce((s, x) => s + x, 0) / tempos.length : null,
      coberturaMedia: cob.length ? cob.reduce((s, x) => s + x, 0) / cob.length : null,
      valorPerdido, abertas: cotacoes.filter(c => c.status === 'Em negociação' || c.status === 'Ativo').length
    };
  }

  const Kpis = { calcularContrato, kpisCotacoes, codigos, nomes, temCliente, vendaDoCliente, nomeNorm };
  if (typeof module !== 'undefined' && module.exports) module.exports = Kpis;
  else root.Kpis = Kpis;
})(typeof window !== 'undefined' ? window : globalThis);
