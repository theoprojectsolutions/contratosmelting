// =====================================================================
// MELTING · MÓDULO DE INTELIGÊNCIA
//  - Responder planilha do cliente (motor de IDs + revisão + exportação)
//  - Base de dados (cadastro de produtos, histórico de vendas, de-para)
//  - Parâmetros (limites dos KPIs, régua, motor, IA)
//  - Itens e consumo real no detalhe do contrato
//  - KPIs de consumo e cotações no Dashboard
// Depende de: motor.js, kpis.js, parametros.js e app.js (carregados antes).
// =====================================================================
const Intel = (function(){
  'use strict';

  // ---------------- estado ----------------
  const S = {
    catalogo: null,          // Motor.Catalogo
    catalogoInfo: null,      // {versao, total, origem}
    vendas: [],              // vendas dos clientes que têm contrato
    vendasTotal: null,
    itens: [],               // contrato_itens
    depara: [],              // de_para
    aprendizado: null,
    carregando: null
  };
  const RP = {               // estado da tela "Responder planilha"
    wb: null, nomeArquivo: '', aba: null, matriz: [], cab: 0, mapa: {},
    itens: [], contratoId: '', origem: 'arquivo', filtro: '', busca: '', expandido: null
  };

  // ---------------- utilidades ----------------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = typeof v === 'number' ? v : paraNumero(v); return isFinite(n) ? n : 0; };
  const pct = (v, casas) => v == null || !isFinite(v) ? '—' : v.toFixed(casas == null ? 0 : casas).replace('.', ',') + '%';
  const brl = (v) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  const brl0 = (v) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dataBR = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const chaveCliente = (c) => Motor.up((c && (c.grupo && c.grupo !== '—' ? c.grupo : c.cliente)) || '').replace(/[^A-Z0-9]/g, '');
  const ehAdmin = () => typeof USER_ROLE === 'undefined' || USER_ROLE !== 'gerente';
  const espera = () => new Promise(r => setTimeout(r, 0));

  function variantesCodigo(cods){
    const out = new Set();
    cods.forEach(c => { const s = String(c).trim(); if (!s) return; const z = s.replace(/^0+(?=\d)/, ''); out.add(s); out.add(z); out.add(z.padStart(6, '0')); });
    return [...out];
  }

  async function selectAll(tabela, montar, colunas){
    const out = [];
    for (let de = 0; ; de += 1000){
      let q = supabaseClient.from(tabela).select(colunas || '*');
      if (montar) q = montar(q);
      q = q.range(de, de + 999);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function emLotes(lista, tam, fn, progresso){
    for (let i = 0; i < lista.length; i += tam){
      await fn(lista.slice(i, i + tam));
      if (progresso) progresso(Math.min(lista.length, i + tam), lista.length);
    }
  }

  // ---------------- cache local (IndexedDB) ----------------
  const IDB = {
    abrir(){
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('sem IndexedDB'));
        const r = indexedDB.open('melting-motor', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async get(k){ try { const db = await this.abrir(); return await new Promise((res) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); } catch (e){ return null; } },
    async set(k, v){ try { const db = await this.abrir(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e){} }
  };

  // ---------------- parâmetros ----------------
  async function carregarParametros(){
    if (!DB_ATIVO) return;
    try {
      const { data, error } = await supabaseClient.from('parametros').select('*');
      if (error) throw error;
      const reg = {}; (data || []).forEach(r => { reg[r.chave] = r.valor; });
      if (reg.sistema) PARAMS = mesclarParams(PARAMS_PADRAO, reg.sistema);
      S.catalogoInfo = Object.assign({}, S.catalogoInfo || {}, reg.catalogo || {});
      S.cortesInfo = reg.cortes || null;
      S.kitsInfo = reg.kits || null;
      S.ftmInfo = reg.ftm || null;
      S.equivInfo = reg.equivalencias || null;
      S.histDescInfo = reg.histdesc || null;
      try { localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(PARAMS)); } catch (e){}
      HOJE = dataReferencia();
    } catch (e){ console.warn('[Parâmetros]', e.message || e); }
  }
  async function salvarParametro(chave, valor){
    if (!DB_ATIVO) return;
    const { error } = await supabaseClient.from('parametros').upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) throw error;
  }

  // ---------------- catálogo ----------------
  function linhasParaCatalogo(linhas){
    return new Motor.Catalogo(linhas.map(r => Array.isArray(r)
      ? { id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: r[7] }
      : r));
  }
  async function baixarCatalogoStorage(){
    const { data, error } = await supabaseClient.storage.from('motor').download('catalogo.json.gz');
    if (error || !data) throw error || new Error('arquivo não encontrado');
    let texto;
    if (typeof DecompressionStream !== 'undefined'){
      const stream = data.stream().pipeThrough(new DecompressionStream('gzip'));
      texto = await new Response(stream).text();
    } else throw new Error('navegador sem descompressão');
    return JSON.parse(texto);
  }
  async function carregarCatalogo(forcar){
    if (S.catalogo && !forcar) return S.catalogo;
    const cache = await IDB.get('catalogo');
    const versao = S.catalogoInfo && S.catalogoInfo.versao;
    let linhas = null, origem = '';
    if (cache && cache.linhas && (!DB_ATIVO || !versao || cache.versao === versao) && !forcar){ linhas = cache.linhas; origem = 'cache deste navegador'; }
    if (!linhas && DB_ATIVO){
      try { linhas = await baixarCatalogoStorage(); origem = 'arquivo do motor'; }
      catch (e){
        console.warn('[Catálogo] arquivo do motor indisponível, lendo tabela produtos:', e && e.message);
        const rows = await selectAll('produtos', null, 'id,descricao,apelido,situacao,origem,um,familia,ipi');
        linhas = rows.map(r => [r.id, r.descricao, r.apelido, r.situacao, r.origem, r.um, r.familia, r.ipi]);
        origem = 'tabela produtos';
      }
      if (linhas && linhas.length) await IDB.set('catalogo', { versao: versao || new Date().toISOString(), linhas });
    }
    if (!linhas && cache && cache.linhas){ linhas = cache.linhas; origem = 'cache deste navegador'; }
    if (!linhas || !linhas.length) return null;
    S.catalogo = linhasParaCatalogo(linhas);
    S.catalogoInfo = Object.assign({}, S.catalogoInfo || {}, { total: S.catalogo.byId.size, ativos: S.catalogo.lista.length, origem });
    S.aprendizado = null;
    await anexarCortes(S.catalogo);
    await anexarKits(S.catalogo);
    await anexarFtm(S.catalogo);
    await anexarEquivalencias(S.catalogo);
    await anexarHistDesc();
    return S.catalogo;
  }
  // histórico de FTMs (mangueiras montadas): resumo no arquivo do motor -> cache
  async function anexarFtm(cat){
    try {
      const cache = await IDB.get('ftm');
      const versao = S.ftmInfo && S.ftmInfo.versao;
      let R = (cache && cache.resumo && (!DB_ATIVO || !versao || cache.versao === versao)) ? cache.resumo : null;
      if (!R && DB_ATIVO && versao){
        const { data, error } = await supabaseClient.storage.from('motor').download('ftm.json.gz');
        if (error || !data) throw error || new Error('sem arquivo ftm.json.gz');
        R = JSON.parse(await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text());
        await IDB.set('ftm', { versao, resumo: R });
      }
      if (!R && cache && cache.resumo) R = cache.resumo;
      if (R){ cat.definirFtm(R); S.ftmTotal = (R.ftms || []).length; }
    } catch (e){ console.warn('[FTM]', e.message || e); }
  }
  // histórico por descrição de TODAS as vendas (qualquer cliente): arquivo do motor -> cache.
  // Formato: { "<chave da descrição>": [[produto_id, nº vendas, última data, [códigos cliente], [nomes cliente]], ...] }
  async function anexarHistDesc(){
    try {
      const cache = await IDB.get('histdesc');
      const versao = S.histDescInfo && S.histDescInfo.versao;
      let I = (cache && cache.idx && (!DB_ATIVO || !versao || cache.versao === versao)) ? cache.idx : null;
      if (!I && DB_ATIVO && versao){
        const { data, error } = await supabaseClient.storage.from('motor').download('histdesc.json.gz');
        if (error || !data) throw error || new Error('sem arquivo histdesc.json.gz');
        I = JSON.parse(await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text());
        await IDB.set('histdesc', { versao, idx: I });
      }
      if (!I && cache && cache.idx) I = cache.idx;
      if (I){ S.histDescIdx = I; _histDescCache = null; }
    } catch (e){ console.warn('[Histórico por descrição]', e.message || e); }
  }
  function montarIndiceHistDesc(vendas){
    const I = {};
    for (const v of vendas){
      if (!v.descricao || !/^\d+$/.test(String(v.produto_id)) || /CANCEL/i.test(v.situacao || '')) continue;
      const k = Motor.chaveDescHist(v.descricao); if (k.length < 8) continue;
      const l = I[k] || (I[k] = []); const id = String(v.produto_id);
      let e = l.find(x => x[0] === id); if (!e){ e = [id, 0, '', [], []]; l.push(e); }
      e[1]++; if (v.data && String(v.data) > e[2]) e[2] = String(v.data);
      const cod = v.cliente_codigo != null ? String(v.cliente_codigo).replace(/^0+/, '') : ''; if (cod && !e[3].includes(cod) && e[3].length < 40) e[3].push(cod);
      const nm = v.cliente_nome ? Kpis.nomeNorm(v.cliente_nome) : ''; if (nm && !e[4].includes(nm) && e[4].length < 40) e[4].push(nm);
    }
    return I;
  }
  async function gravarHistDesc(st){
    let vendas = S.vendas;
    if (DB_ATIVO){
      st.textContent = 'Montando o histórico por descrição (todas as vendas)...'; await espera();
      vendas = await selectAll('vendas', null, 'produto_id,descricao,cliente_codigo,cliente_nome,data');
    }
    const I = montarIndiceHistDesc(vendas);
    const versao = new Date().toISOString(); const total = Object.keys(I).length;
    if (DB_ATIVO){
      const gz = await gzipJSON(I); if (!gz) throw new Error('navegador sem compressão');
      const { error } = await supabaseClient.storage.from('motor').upload('histdesc.json.gz', gz, { upsert: true, contentType: 'application/gzip' });
      if (error) throw error;
      await salvarParametro('histdesc', { versao, total });
      S.histDescInfo = { versao, total };
    }
    await IDB.set('histdesc', { versao, idx: I });
    S.histDescIdx = I; _histDescCache = null;
    return total;
  }
  // equivalências de correias (outra marca -> Nitta): tabela -> cache
  async function anexarEquivalencias(cat){
    try {
      const cache = await IDB.get('equivalencias');
      const versao = S.equivInfo && S.equivInfo.versao;
      let linhas = (cache && cache.linhas && (!DB_ATIVO || !versao || cache.versao === versao)) ? cache.linhas : null;
      if (!linhas && DB_ATIVO && versao){
        linhas = await selectAll('equivalencias', null, 'marca,codigo,nitta,obs');
        if (linhas && linhas.length) await IDB.set('equivalencias', { versao, linhas });
      }
      if (!linhas && cache && cache.linhas) linhas = cache.linhas;
      if (linhas && linhas.length){ cat.definirEquivalencias(linhas); S.equivLinhas = linhas; }
    } catch (e){ console.warn('[Equivalências]', e.message || e); }
  }
  // kits SGM: arquivo do motor -> tabela -> cache
  async function anexarKits(cat){
    try {
      const cache = await IDB.get('kits');
      const versao = S.kitsInfo && S.kitsInfo.versao;
      let linhas = (cache && cache.linhas && (!DB_ATIVO || !versao || cache.versao === versao)) ? cache.linhas : null;
      if (!linhas && DB_ATIVO && versao){
        try {
          const { data, error } = await supabaseClient.storage.from('motor').download('kits.json.gz');
          if (error || !data) throw error || new Error('sem arquivo');
          linhas = JSON.parse(await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text());
        } catch (e){
          const rows = await selectAll('kits', null, 'sgm,produto_id,descricao,componentes,unidade');
          linhas = rows.map(r => [r.sgm, r.produto_id, r.descricao, r.componentes || [], r.unidade]);
        }
        if (linhas && linhas.length) await IDB.set('kits', { versao, linhas });
      }
      if (!linhas && cache && cache.linhas) linhas = cache.linhas;
      if (linhas && linhas.length){ cat.definirKits(linhas); S.kitsLinhas = linhas; }
    } catch (e){ console.warn('[Kits SGM]', e.message || e); }
  }
  // histórico de cortes (correias planas): arquivo do motor -> tabela -> cache
  async function anexarCortes(cat){
    try {
      const cache = await IDB.get('cortes');
      const versao = S.cortesInfo && S.cortesInfo.versao;
      let linhas = (cache && cache.linhas && (!DB_ATIVO || !versao || cache.versao === versao)) ? cache.linhas : null;
      if (!linhas && DB_ATIVO && versao){
        try {
          const { data, error } = await supabaseClient.storage.from('motor').download('cortes.json.gz');
          if (error || !data) throw error || new Error('sem arquivo');
          linhas = JSON.parse(await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text());
        } catch (e){
          const rows = await selectAll('cortes', null, 'material,base_id,larg,comp,vezes');
          linhas = rows.map(r => [r.material, r.base_id, Number(r.larg), Number(r.comp), r.vezes]);
        }
        if (linhas && linhas.length) await IDB.set('cortes', { versao, linhas });
      }
      if (!linhas && cache && cache.linhas) linhas = cache.linhas;
      if (linhas && linhas.length){ cat.definirCortes(linhas); S.cortesTotal = linhas.length; S.cortesLinhas = linhas; }
    } catch (e){ console.warn('[Cortes]', e.message || e); }
  }
  function descProduto(id){
    const p = S.catalogo && S.catalogo.get(id);
    return p ? p.d : '';
  }
  function apelidoProduto(id){
    const p = S.catalogo && S.catalogo.get(id);
    return p ? p.a : '';
  }

  function aprendizado(){
    if (!S.catalogo) return null;
    if (S.aprendizado) return S.aprendizado;
    const a = new Motor.Aprendizado(S.catalogo);
    S.depara.forEach(d => { if (d.descricao_cliente) a.adicionar(d.descricao_cliente, d.produto_id); });
    S.itens.forEach(it => { if (it.status === 'aprovado' && it.produto_id && it.descricao_cliente) a.adicionar(it.descricao_cliente, it.produto_id); });
    S.aprendizado = a;
    return a;
  }

  // ---------------- carga de dados ----------------
  const COLS_VENDAS = 'pedido,produto_id,linha,data,cliente_codigo,cliente_nome,descricao,ref_cliente,quantidade,preco_unit';
  async function carregarVendas(){
    if (!DB_ATIVO) return;
    const cods = new Set(), nomes = new Set();
    CONTRATOS.forEach(c => { Kpis.codigos(c).forEach(x => cods.add(x)); Kpis.nomes(c).forEach(x => nomes.add(x)); });
    const vc = variantesCodigo([...cods]), vn = [...nomes];
    const out = [];
    for (let i = 0; i < vc.length; i += 50){ const parte = vc.slice(i, i + 50); out.push(...await selectAll('vendas', q => q.in('cliente_codigo', parte), COLS_VENDAS)); }
    for (let i = 0; i < vn.length; i += 50){ const parte = vn.slice(i, i + 50); out.push(...await selectAll('vendas', q => q.in('cliente_nome', parte), COLS_VENDAS)); }
    S.vendas = mesclarVendas([], out);
  }
  async function aoCarregarBanco(){
    if (S.carregando) return S.carregando;
    S.carregando = (async () => {
      await carregarParametros();
      try {
        const [itens, depara] = await Promise.all([selectAll('contrato_itens'), selectAll('de_para')]);
        S.itens = itens; S.depara = depara;
      } catch (e){ console.warn('[Inteligência] tabelas novas ainda não criadas? Rode supabase/inteligencia.sql.', e.message || e); }
      try { await carregarVendas(); } catch (e){ console.warn('[Vendas]', e.message || e); }
      recalcularTodos();
      renderDashboardCompleto();
      renderContratos();
      carregarCatalogo().then(() => { atualizarStatusBase(); if (contratoAtualId) renderDetalheContrato(contratoAtualId); }).catch(e => console.warn('[Catálogo]', e));
      atualizarStatusBase();
    })();
    return S.carregando;
  }

  // ---------------- consumo real ----------------
  function itensDoContrato(id){ return S.itens.filter(it => it.contrato_id === id).sort((a, b) => (a.linha || 0) - (b.linha || 0)); }
  function recalcular(c){
    const itens = itensDoContrato(c.id);
    c._real = (itens.length || Kpis.temCliente(c)) ? Kpis.calcularContrato(c, itens, S.vendas, PARAMS, HOJE) : null;
    return c._real;
  }
  function recalcularTodos(){ CONTRATOS.forEach(recalcular); }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  function renderDashboard(){
    const alvo = $('intel-dashboard'); if (!alvo) return;
    const base = (typeof contratosFiltradosDashboard === 'function') ? contratosFiltradosDashboard() : CONTRATOS;
    const ativos = base.filter(c => diasParaVencer(c.dataFim) >= 0);
    const comItens = ativos.filter(c => c._real && c._real.temItens);
    const est = comItens.reduce((s, c) => s + c._real.valorEstimado, 0);
    const cons = comItens.reduce((s, c) => s + c._real.valorConsumido, 0);
    const fora = ativos.reduce((s, c) => s + ((c._real && c._real.valorFora) || 0), 0);
    const ritmos = comItens.map(c => c._real.ritmo).filter(r => r != null);
    const ritmoMedio = ritmos.length ? ritmos.reduce((s, x) => s + x, 0) / ritmos.length : null;
    const kc = Kpis.kpisCotacoes(COTACOES);
    const semGiro = comItens.reduce((s, c) => s + c._real.semGiro, 0);
    const kpis = [
      { l: 'Consumido × contratado', v: est ? pct(cons / est * 100) : '—', s: est ? brl0(cons) + ' de ' + brl0(est) : 'Responda e salve as planilhas nos contratos', c: 'k-blue' },
      { l: 'Ritmo médio de consumo', v: ritmoMedio != null ? ritmoMedio.toFixed(2).replace('.', ',') + '×' : '—', s: '1,00× = consumo acompanha o tempo de contrato', c: ritmoMedio != null && (ritmoMedio < PARAMS.ritmoBaixo || ritmoMedio > PARAMS.ritmoAlto) ? 'k-orange' : 'k-green' },
      { l: 'Compras fora do contrato', v: brl0(fora), s: 'Itens comprados pelo cliente que não estão no contrato', c: 'k-orange' },
      { l: 'Itens sem giro', v: String(semGiro), s: 'Sem compra após ' + PARAMS.semGiroPctVigencia + '% da vigência', c: 'k-red' },
      { l: 'Conversão de cotações', v: pct(kc.conversao), s: kc.ganhas + ' renovadas de ' + kc.fechadas + ' fechadas', c: 'k-green' },
      { l: 'Tempo médio de resposta', v: kc.tempoMedioResposta != null ? kc.tempoMedioResposta.toFixed(1).replace('.', ',') + ' d' : '—', s: 'Do recebimento ao envio da cotação', c: 'k-blue' },
      { l: 'Cobertura média das cotações', v: pct(kc.coberturaMedia), s: 'Itens cotados ÷ itens pedidos', c: 'k-blue' },
      { l: 'Valor perdido em cotações', v: brl0(kc.valorPerdido), s: kc.abertas + ' cotação(ões) em aberto', c: 'k-red' }
    ];
    const foraRitmo = comItens.filter(c => c._real.ritmo != null && (c._real.ritmo < PARAMS.ritmoBaixo || c._real.ritmo > PARAMS.ritmoAlto))
      .sort((a, b) => Math.abs(1 - b._real.ritmo) - Math.abs(1 - a._real.ritmo)).slice(0, 6);
    const foraLista = [];
    ativos.forEach(c => (c._real && c._real.fora || []).slice(0, 5).forEach(f => foraLista.push(Object.assign({ contrato: c }, f))));
    foraLista.sort((a, b) => b.valor - a.valor);
    alvo.innerHTML = `
      <div class="intel-section-title"><h3>Consumo real e cotações</h3><span>Calculado a partir dos itens respondidos e do histórico de vendas do SIG</span></div>
      <div class="kpi-row intel-kpis">${kpis.map(k => `<div class="kpi ${k.c}"><div class="label">${k.l}</div><div class="value">${k.v}</div><div class="sub">${k.s}</div></div>`).join('')}</div>
      <div class="grid-2">
        <div class="panel">
          <h3>Contratos fora do ritmo</h3>
          <div class="panel-sub">Consumo ÷ tempo decorrido fora da faixa ${String(PARAMS.ritmoBaixo).replace('.', ',')}× – ${String(PARAMS.ritmoAlto).replace('.', ',')}×</div>
          <div class="table-scroll"><table class="intel-table"><thead><tr><th>Contrato</th><th>Consumo</th><th>Tempo</th><th>Ritmo</th><th>Esgota em</th></tr></thead><tbody>
          ${foraRitmo.map(c => `<tr class="clickable" data-id="${esc(c.id)}"><td>${esc(c.cliente)}<div class="intel-muted">${esc(c.id)}</div></td><td>${pct(c._real.pctConsumo)}</td><td>${pct(c._real.pctTempo)}</td><td><span class="badge ${c._real.ritmo > 1 ? 'b-indigo' : 'b-amber'}">${c._real.ritmo.toFixed(2).replace('.', ',')}×</span></td><td>${c._real.naoEsgota ? 'não esgota' : dataBR(c._real.previsaoEsgotamento)}</td></tr>`).join('') || `<tr><td colspan="5" class="intel-muted">${comItens.length ? 'Todos os contratos com itens estão no ritmo.' : 'Nenhum contrato com itens ainda — use "Responder planilha" e salve no contrato.'}</td></tr>`}
          </tbody></table></div>
        </div>
        <div class="panel">
          <h3>Maiores compras fora do contrato</h3>
          <div class="panel-sub">Oportunidade de aditivo: o cliente já compra, mas sem contrato</div>
          <div class="table-scroll"><table class="intel-table"><thead><tr><th>Cliente</th><th>Item</th><th>Valor</th></tr></thead><tbody>
          ${foraLista.slice(0, 6).map(f => `<tr class="clickable" data-id="${esc(f.contrato.id)}"><td>${esc(f.contrato.cliente)}</td><td>${esc(descProduto(f.produto_id) || f.descricao || f.produto_id)}<div class="intel-muted">ID ${esc(f.produto_id)} · ${Number(f.quantidade).toLocaleString('pt-BR')} un</div></td><td>${brl0(f.valor)}</td></tr>`).join('') || '<tr><td colspan="3" class="intel-muted">Sem dados — preencha os códigos do cliente no SIG e importe o histórico de vendas.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openContratoDetalhe(tr.dataset.id)));
  }

  // =====================================================================
  // DETALHE DO CONTRATO
  // =====================================================================
  function renderDetalheContrato(id){
    const alvo = $('intel-contrato'); if (!alvo) return;
    const c = CONTRATOS.find(x => x.id === id); if (!c) return;
    const r = recalcular(c);
    const itens = r ? r.itens : [];
    const admin = ehAdmin();
    const kp = r ? [
      { l: 'Valor estimado (itens)', v: brl0(r.valorEstimado), s: r.totalItens + ' itens · ' + pct(r.cobertura) + ' com ID' },
      { l: 'Consumido no período', v: brl0(r.valorConsumido), s: pct(r.pctConsumo) + ' do estimado' },
      { l: 'Tempo de contrato decorrido', v: pct(r.pctTempo), s: 'Ritmo ' + (r.ritmo != null ? r.ritmo.toFixed(2).replace('.', ',') + '× · ' + r.leituraRitmo : '—') },
      { l: 'Previsão de esgotamento', v: r.naoEsgota ? 'Não esgota' : dataBR(r.previsaoEsgotamento), s: 'Vencimento ' + dataBR(c.dataFim) },
      { l: 'Fora do contrato', v: brl0(r.valorFora), s: r.fora.length + ' item(ns) · ' + pct(r.pctFora) + ' do que o cliente comprou' },
      { l: 'Itens sem giro', v: String(r.semGiro), s: 'Sem compra após ' + PARAMS.semGiroPctVigencia + '% da vigência' },
      { l: 'Preço divergente', v: String(r.divergentes), s: 'Praticado ≠ contratado em mais de ' + PARAMS.divergenciaPrecoPct + '%' },
      { l: 'Sem cadastro', v: String(r.semCadastro), s: 'Itens sem ID Melting' }
    ] : [];
    const avisos = [];
    if (!Kpis.temCliente(c)) avisos.push('Informe o <b>cliente no SIG</b> (nome fantasia como aparece no relsitped e/ou código) para o sistema cruzar o histórico de vendas com este contrato.');
    else if (r && !r.temVendas) avisos.push('Nenhuma venda encontrada para esse cliente dentro da vigência. Confira o nome/código ou importe o histórico de vendas em <b>Base de dados</b>.');
    if (r && !r.temItens) avisos.push('Este contrato ainda não tem itens. Use <b>Responder planilha</b> com a planilha do cliente e salve neste contrato.');
    alvo.innerHTML = `
      <div class="panel intel-panel">
        <div class="intel-panel-head">
          <div><h3>Itens do contrato e consumo real</h3><div class="panel-sub">Consumo = pedidos do SIG para os códigos do cliente, dentro da vigência, dos produtos do contrato.</div></div>
          <div class="intel-actions">
            <label class="intel-inline-field">Cliente no SIG (nome fantasia e/ou código)
              <input type="text" id="intel-codigos" value="${esc(c.codigosCliente || '')}" placeholder="ex.: TRIVIUM PACKAGING, 003142" ${admin ? '' : 'disabled'}>
            </label>
            ${admin ? '<button class="btn btn-ghost" id="intel-salvar-codigos">Salvar</button>' : ''}
            ${admin ? `<button class="btn btn-ghost" id="intel-revisar">${itens.length ? 'Revisar itens' : 'Responder planilha'}</button>` : ''}
            ${itens.length ? '<button class="btn btn-ghost" id="intel-exportar-itens">Exportar itens</button>' : ''}
          </div>
        </div>
        ${avisos.map(a => `<div class="note intel-note">${a}</div>`).join('')}
        ${kp.length ? `<div class="kpi-row intel-kpis compact">${kp.map(k => `<div class="kpi k-blue"><div class="label">${k.l}</div><div class="value">${k.v}</div><div class="sub">${k.s}</div></div>`).join('')}</div>` : ''}
        ${itens.length ? `
        <div class="filters"><input class="filter-input" id="intel-itens-busca" placeholder="Buscar item, código ou ID..." style="min-width:260px;">
          <select id="intel-itens-filtro"><option value="">Todos os itens</option><option value="semgiro">Sem giro</option><option value="diverg">Preço divergente</option><option value="semid">Sem cadastro</option><option value="acima">Acima do estimado</option></select></div>
        <div class="table-scroll intel-scroll-y"><table class="intel-table" id="intel-itens-tbl"><thead><tr>
          <th>#</th><th>Cód. cliente</th><th>Descrição do cliente</th><th>ID Melting</th><th>Status</th><th>Qtd est.</th><th>Consumido</th><th>%</th><th>Preço contr.</th><th>Preço médio</th><th>Última compra</th>
        </tr></thead><tbody></tbody></table></div>` : ''}
        ${r && r.fora.length ? `
        <details class="intel-details"><summary>Compras fora do contrato (${r.fora.length})</summary>
          <div class="table-scroll intel-scroll-y"><table class="intel-table"><thead><tr><th>ID</th><th>Descrição</th><th>Qtd</th><th>Valor</th><th>Pedidos</th><th>Última compra</th></tr></thead><tbody>
          ${r.fora.slice(0, 200).map(f => `<tr><td class="mono">${esc(f.produto_id)}</td><td>${esc(descProduto(f.produto_id) || f.descricao || '')}</td><td>${Number(f.quantidade).toLocaleString('pt-BR')}</td><td>${brl(f.valor)}</td><td>${f.pedidos}</td><td>${dataBR(f.ultimaCompra)}</td></tr>`).join('')}
          </tbody></table></div></details>` : ''}
      </div>`;
    const renderLinhas = () => {
      const tb = alvo.querySelector('#intel-itens-tbl tbody'); if (!tb) return;
      const q = Motor.up(($('intel-itens-busca') || {}).value || '');
      const f = ($('intel-itens-filtro') || {}).value || '';
      const lista = itens.filter(it => {
        if (f === 'semgiro' && !it.semGiro) return false;
        if (f === 'diverg' && !it.divergente) return false;
        if (f === 'semid' && it.produto_id) return false;
        if (f === 'acima' && !(it.pctConsumo > PARAMS.consumoAlto)) return false;
        if (q && !Motor.up([it.cod_cliente, it.descricao_cliente, it.produto_id, descProduto(it.produto_id)].join(' ')).includes(q)) return false;
        return true;
      });
      tb.innerHTML = lista.slice(0, 500).map(it => `<tr>
        <td>${it.linha || ''}</td><td class="mono">${esc(it.cod_cliente || '')}</td>
        <td class="intel-desc" title="${esc(it.descricao_cliente || '')}">${esc((it.descricao_cliente || '').slice(0, 90))}</td>
        <td>${it.produto_id ? `<span class="mono">${esc(it.produto_id)}</span><div class="intel-muted">${esc(descProduto(it.produto_id).slice(0, 60))}</div>` : '<span class="intel-muted">—</span>'}</td>
        <td>${badgeStatus(it.status, it.confianca)}</td>
        <td>${num(it.qtd_estimada).toLocaleString('pt-BR')} ${esc(it.un || '')}</td>
        <td>${it.qtdConsumida.toLocaleString('pt-BR')}${it.semGiro ? ' <span class="badge b-amber">sem giro</span>' : ''}</td>
        <td>${pct(it.pctConsumo)}</td>
        <td>${it.preco_contratado != null ? brl(it.preco_contratado) : '—'}</td>
        <td>${it.precoMedio != null ? brl(it.precoMedio) : '—'}${it.divergente ? ` <span class="badge ${it.divergenciaPreco > 0 ? 'b-red' : 'b-amber'}">${it.divergenciaPreco > 0 ? '+' : ''}${it.divergenciaPreco.toFixed(1).replace('.', ',')}%</span>` : ''}</td>
        <td>${dataBR(it.ultimaCompra)}</td></tr>`).join('') + (lista.length > 500 ? `<tr><td colspan="11" class="intel-muted">Mostrando 500 de ${lista.length} — use a busca.</td></tr>` : '') || '<tr><td colspan="11" class="intel-muted">Nenhum item com esse filtro.</td></tr>';
    };
    renderLinhas();
    const b = $('intel-itens-busca'); if (b) b.addEventListener('input', renderLinhas);
    const fl = $('intel-itens-filtro'); if (fl) fl.addEventListener('change', renderLinhas);
    const bs = $('intel-salvar-codigos');
    if (bs) bs.addEventListener('click', async () => {
      const v = $('intel-codigos').value.trim();
      if (DB_ATIVO){
        const { error } = await supabaseClient.from('contratos').update({ codigos_cliente: v || null }).eq('id', c.id);
        if (error){ showToast('Não foi possível salvar: ' + error.message + ' (rodou o supabase/inteligencia.sql?)'); return; }
      }
      c.codigosCliente = v;
      showToast('Cliente no SIG salvo — recalculando consumo');
      try { await carregarVendas(); } catch (e){}
      recalcularTodos(); renderDetalheContrato(c.id); renderDashboardCompleto();
    });
    const br = $('intel-revisar'); if (br) br.addEventListener('click', () => itens.length ? abrirRevisaoContrato(c.id) : abrirResponder(c.id));
    const be = $('intel-exportar-itens'); if (be) be.addEventListener('click', () => exportarItensContrato(c, r));
  }
  function badgeStatus(status, conf){
    const m = { aprovado: ['b-green', 'Aprovado'], sugerido: [conf === 'alta' ? 'b-blue' : 'b-amber', 'Sugerido' + (conf ? ' · ' + conf : '')], sem_cadastro: ['b-red', 'Sem cadastro'], rejeitado: ['b-red', 'Rejeitado'], pendente: ['b-amber', 'Pendente'] };
    const [cls, txt] = m[status] || ['b-blue', status || '—'];
    return `<span class="badge ${cls}"><span class="dot"></span>${esc(txt)}</span>`;
  }
  function exportarItensContrato(c, r){
    const linhas = [['#', 'Cód. cliente', 'Descrição do cliente', 'REF', 'UN', 'Qtd estimada', 'Preço contratado', 'ID Melting', 'Apelido', 'Descrição Melting', 'Status', 'Confiança', 'Motivo', 'Qtd consumida', '% consumo', 'Preço médio praticado', 'Última compra']];
    r.itens.forEach(it => linhas.push([it.linha, it.cod_cliente, it.descricao_cliente, it.ref, it.un, num(it.qtd_estimada), it.preco_contratado, it.produto_id, apelidoProduto(it.produto_id), descProduto(it.produto_id), it.status, it.confianca, it.motivo, it.qtdConsumida, it.pctConsumo != null ? Math.round(it.pctConsumo) : null, it.precoMedio != null ? Math.round(it.precoMedio * 100) / 100 : null, it.ultimaCompra]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Itens');
    if (r.fora.length){
      const f = [['ID', 'Descrição', 'Quantidade', 'Valor', 'Pedidos', 'Última compra']].concat(r.fora.map(x => [x.produto_id, descProduto(x.produto_id) || x.descricao, x.quantidade, Math.round(x.valor * 100) / 100, x.pedidos, x.ultimaCompra]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f), 'Fora do contrato');
    }
    XLSX.writeFile(wb, c.id + '_itens.xlsx');
  }

  // =====================================================================
  // RESPONDER PLANILHA
  // =====================================================================
  const CAMPOS = [
    { k: 'cod', label: 'Código do item no cliente', alias: ['COD', 'CODIGO', 'COD CLIENTE', 'NI', 'NI SUZANO', 'NI MATERIAL', 'CODIGO CLIENTE', 'CODIGO SAP', 'MATERIAL', 'COD MATERIAL', 'CODIGO DO MATERIAL', 'ITEM CLIENTE', 'SKU', 'N MATERIAL', 'NUMERO DO MATERIAL'] },
    { k: 'desc', label: 'Descrição', alias: ['DESCRICAO', 'DESCRICAO BREVE', 'DESCRICAO CURTA', 'TEXTO BREVE', 'DESC', 'BREVE', 'DESCRICAO DO MATERIAL', 'PRODUTO'] },
    { k: 'desc2', label: 'Descrição detalhada (opcional)', alias: ['DESCRICAO DETALHADA', 'DESCRICAO COMPLETA', 'DESCRICAO LONGA', 'TEXTO LONGO', 'DET', 'DETALHE', 'ESPECIFICACAO', 'DESCRICAO TECNICA'] },
    // mangueira montada em colunas separadas (books técnicos: MANG / CT / T1 / T2) -> vira texto para o motor montar a FTM
    { k: 'mang', label: 'Mangueira — código/norma (opcional)', alias: ['MANG', 'MANGUEIRA', 'COD MANGUEIRA', 'MANGUEIRA CODIGO', 'HOSE'] },
    { k: 'ct', label: 'Comprimento da mangueira (opcional)', alias: ['CT', 'CT H', 'C T MM', 'C T', 'COMPRIMENTO', 'COMPRIMENTO MONTADA MM', 'COMPRIMENTO MONTADA', 'COMPRIMENTO MM'] },
    { k: 'ta', label: 'Terminal A (opcional)', alias: ['T1', 'TERMINAL 1', 'TERMINAL A', 'TERM A', 'TERM 1'] },
    { k: 'tb', label: 'Terminal B (opcional)', alias: ['T2', 'TERMINAL 2', 'TERMINAL B', 'TERM B', 'TERM 2'] },
    { k: 'marca', label: 'Fabricante / marca (opcional)', alias: ['FABRICANTE / MARCA', 'FABRICANTE', 'MARCA', 'FABRICANTE MARCA'] },
    { k: 'ref', label: 'REF / apelido Melting (opcional)', alias: ['REF', 'REFERENCIA', 'REFERENCIA MELTING', 'APELIDO', 'REF MELTING', 'MODELO'] },
    { k: 'un', label: 'Unidade (opcional)', alias: ['UN', 'UND', 'UNID', 'UNIDADE', 'UM', 'U.M.'] },
    { k: 'qtd', label: 'Quantidade estimada', alias: ['QTD', 'QUANTIDADE', 'QTDE', 'QTD ESTIMADA', 'QUANTIDADE ESTIMADA', 'CONSUMO ANUAL', 'CONSUMO', 'QTD ANUAL', 'VOLUME'] },
    { k: 'preco', label: 'Preço unitário (opcional)', alias: ['PRECO', 'PRECO UNITARIO', 'VALOR UNITARIO', 'PRECO UNIT', 'VLR UNIT', 'PRECO S/ IPI', 'PRECO C/ ICMS', 'VALOR'] }
  ];
  const normCab = (s) => normalizarTexto(s).replace(/[^A-Z0-9 /]/g, ' ').replace(/\s+/g, ' ').trim();

  function detectarCabecalho(matriz){
    let melhor = 0, pontos = -1;
    for (let i = 0; i < Math.min(matriz.length, 25); i++){
      const row = (matriz[i] || []).map(normCab);
      let p = 0;
      CAMPOS.forEach(c => { if (row.some(h => h && c.alias.some(a => h === a || (a.length > 3 && h.startsWith(a))))) p += 2; });
      p += row.filter(h => h && isNaN(Number(h))).length * 0.05;
      if (p > pontos){ pontos = p; melhor = i; }
    }
    return melhor;
  }
  function adivinharMapa(cab){
    const h = cab.map(normCab); const mapa = {}; const usados = new Set();
    CAMPOS.forEach(c => {
      let idx = -1;
      for (const a of c.alias){ idx = h.findIndex((x, i) => !usados.has(i) && x === a); if (idx >= 0) break; }
      if (idx < 0) for (const a of c.alias){ if (a.length < 4) continue; idx = h.findIndex((x, i) => !usados.has(i) && x && x.startsWith(a)); if (idx >= 0) break; }
      if (idx >= 0){ mapa[c.k] = idx; usados.add(idx); } else mapa[c.k] = -1;
    });
    return mapa;
  }

  function abrirResponder(contratoId){
    goToView('responder');
    popularContratosSelect(contratoId || '');
  }
  function popularContratosSelect(sel){
    const el = $('rp-contrato'); if (!el) return;
    el.innerHTML = '<option value="">Só responder (não salvar em contrato)</option>' +
      CONTRATOS.slice().sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR')).map(c => `<option value="${esc(c.id)}">${esc(c.cliente)} · ${esc(c.id)}</option>`).join('');
    if (sel != null) el.value = sel;
    RP.contratoId = el.value;
  }

  async function lerArquivoCliente(file){
    const buf = await file.arrayBuffer();
    RP.wb = XLSX.read(buf, { type: 'array', cellDates: true });
    RP.nomeArquivo = file.name;
    RP.origem = 'arquivo'; $('rp-config').classList.remove('modo-texto');
    const abas = RP.wb.SheetNames;
    // escolhe a aba com mais linhas preenchidas
    let melhor = abas[0], n = -1;
    abas.forEach(a => { const ref = RP.wb.Sheets[a]['!ref']; if (!ref) return; const r = XLSX.utils.decode_range(ref); const t = (r.e.r - r.s.r) * Math.min(30, r.e.c - r.s.c + 1); if (t > n){ n = t; melhor = a; } });
    $('rp-aba').innerHTML = abas.map(a => `<option ${a === melhor ? 'selected' : ''}>${esc(a)}</option>`).join('');
    selecionarAba(melhor);
    $('rp-arquivo-nome').textContent = file.name;
    $('rp-config').hidden = false;
    $('rp-resultado').hidden = true;
  }
  function selecionarAba(nome){
    RP.aba = nome;
    RP.matriz = XLSX.utils.sheet_to_json(RP.wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true });
    RP.cab = detectarCabecalho(RP.matriz);
    $('rp-cab').value = RP.cab + 1;
    RP.mapa = adivinharMapa(RP.matriz[RP.cab] || []);
    renderMapa();
  }
  function renderMapa(){
    const cab = RP.matriz[RP.cab] || [];
    const opts = (sel) => '<option value="-1">— não usar —</option>' + cab.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(XLSX.utils.encode_col(i))} · ${esc(String(h == null ? '' : h).slice(0, 40))}</option>`).join('');
    $('rp-mapa').innerHTML = CAMPOS.map(c => `<div class="field"><label>${c.label}</label><select data-campo="${c.k}">${opts(RP.mapa[c.k])}</select></div>`).join('');
    $('rp-mapa').querySelectorAll('select').forEach(s => s.addEventListener('change', () => { RP.mapa[s.dataset.campo] = Number(s.value); renderPreview(); }));
    renderPreview();
  }
  function linhasDados(){
    const out = [];
    const g = (row, k) => { const i = RP.mapa[k]; return (i == null || i < 0) ? null : row[i]; };
    for (let i = RP.cab + 1; i < RP.matriz.length; i++){
      const row = RP.matriz[i] || [];
      const d1 = g(row, 'desc'), d2 = g(row, 'desc2'), cod = g(row, 'cod'), ref = g(row, 'ref'), marca = g(row, 'marca');
      if (!d1 && !d2 && !cod) continue;
      // montagem em colunas: "MANGUEIRA 731-12 10673-12-12 13973-12-12 CT 1265" vem antes da descrição
      const cel = (k) => { const v = g(row, k); return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); };
      const mg = cel('mang'), ta = cel('ta'), tb = cel('tb'), ct = cel('ct');
      const codigoOk = (v) => v && v.length <= 40 && /\d/.test(v) && !/CONTRATO|SIMILAR/i.test(v);
      // terminal avulso com o código na coluna da mangueira (13943-12-12, ISO12151-5-SWS-6-6): vai sem "MANGUEIRA" e sem CT
      const ehTerminal = (v) => /^(?:[0-9][0-9A-Z]{2}\d{2}|[26]F[A-Z0-9]+)-\d{1,2}-\d{1,2}\b|^(?:ISO\s?12151|CAT-?FLANGE|BS\s?5200|SAEJ476)/i.test(v);
      const montagem = codigoOk(mg) && ehTerminal(mg) && !ta && !tb ? mg
        : (codigoOk(mg) || codigoOk(ta) || codigoOk(tb))
          ? ['MANGUEIRA', codigoOk(mg) ? mg : '', codigoOk(ta) ? ta : '', codigoOk(tb) ? tb : '', /\d/.test(ct) ? 'CT ' + ct : ''].filter(Boolean).join(' ') : null;
      const descricao = [montagem, d1, d2, marca ? 'MARCA: ' + marca : null].filter(x => x != null && String(x).trim()).map(x => String(x).trim()).join(' · ');
      out.push({
        linhaPlanilha: i, linha: out.length + 1,
        cod_cliente: cod == null ? '' : String(cod).trim(), descricao_cliente: descricao,
        ref: ref == null ? '' : String(ref).trim(), un: g(row, 'un') == null ? '' : String(g(row, 'un')).trim(),
        qtd_estimada: num(g(row, 'qtd')), preco_contratado: g(row, 'preco') == null || g(row, 'preco') === '' ? null : num(g(row, 'preco'))
      });
    }
    return out;
  }
  function renderPreview(){
    const ls = linhasDados();
    $('rp-preview').innerHTML = `<div class="intel-muted" style="margin-bottom:6px;">${ls.length} item(ns) encontrados. Prévia:</div>
      <div class="table-scroll"><table class="intel-table"><thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>REF</th><th>UN</th><th>Qtd</th><th>Preço</th></tr></thead><tbody>
      ${ls.slice(0, 5).map(r => `<tr><td>${r.linha}</td><td class="mono">${esc(r.cod_cliente)}</td><td class="intel-desc">${esc(r.descricao_cliente.slice(0, 120))}</td><td>${esc(r.ref)}</td><td>${esc(r.un)}</td><td>${r.qtd_estimada.toLocaleString('pt-BR')}</td><td>${r.preco_contratado != null ? brl(r.preco_contratado) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function contextoMotor(contrato){
    const ctx = { catalogo: S.catalogo, params: PARAMS.motor, aprendizado: aprendizado(), depara: new Map(), historico: new Map() };
    if (contrato){
      const chave = chaveCliente(contrato);
      S.depara.filter(d => d.cliente_chave === chave).forEach(d => ctx.depara.set(String(d.cod_cliente).trim(), String(d.produto_id)));
      S.vendas.filter(v => v.ref_cliente && Kpis.vendaDoCliente(contrato, v))
        .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))
        .forEach(v => ctx.historico.set(String(v.ref_cliente).trim(), { id: String(v.produto_id), data: v.data ? dataBR(v.data) : null, preco: v.preco_unit }));
    }
    ctx.histDesc = histPorDescricao(contrato);
    return ctx;
  }
  // "o cliente escreveu X, vendemos Y": descrição da venda (complemento do pedido) -> produto mais vendido com ela.
  // Vendas do próprio cliente do contrato valem mais; descrição que já virou produtos diferentes fica com o mais vendido.
  // Índice de TODAS as vendas (arquivo do motor, gravado na importação de vendas); sem ele, só as vendas carregadas
  // (clientes com contrato).
  let _histDescCache = null;
  function histPorDescricao(contrato){
    let I = S.histDescIdx;
    if (!I){
      if (!S.vendas || !S.vendas.length) return null;
      if (!_histDescCache || _histDescCache.n !== S.vendas.length) _histDescCache = { n: S.vendas.length, I: montarIndiceHistDesc(S.vendas) };
      I = _histDescCache.I;
    }
    const cache = contrato ? { cods: new Set(Kpis.codigos(contrato)), nomes: new Set(Kpis.nomes(contrato)) } : null;
    const doCli = (e) => !!cache && (e[3].some(c => cache.cods.has(c)) || e[4].some(n => cache.nomes.has(n)));
    // Map "preguiçoso": só calcula a chave que o motor pergunta
    const memo = new Map();
    return {
      size: Object.keys(I).length || 0,
      get(k){
        if (memo.has(k)) return memo.get(k);
        const l = I[k]; let best = null;
        if (l) for (const e of l){ const dc = doCli(e); const sc = (dc ? 1e6 : 0) + e[1]; if (!best || sc > best.sc) best = { sc, id: e[0], n: e[1], data: e[2] ? dataBR(e[2]) : null, doCliente: dc, cliente: e[4][e[4].length - 1] || null }; }
        memo.set(k, best); return best;
      }
    };
  }
  // vendas de qualquer cliente SIG com esses códigos de item (o mesmo cliente às vezes tem vários códigos no SIG)
  async function historicoPorCodigos(codigos){
    const lista = [...new Set(codigos.map(c => String(c).trim()).filter(c => c.length >= 5))];
    if (!lista.length) return [];
    if (!DB_ATIVO) return S.vendas.filter(v => v.ref_cliente && lista.includes(String(v.ref_cliente).trim()));
    const out = [];
    for (let i = 0; i < lista.length; i += 150){
      const parte = lista.slice(i, i + 150);
      out.push(...await selectAll('vendas', q => q.in('ref_cliente', parte), 'pedido,produto_id,linha,data,cliente_codigo,cliente_nome,descricao,ref_cliente,quantidade,preco_unit'));
    }
    return out;
  }
  // último preço de venda de cada produto em todo o histórico (qualquer cliente) — usado para slab / LL / montagens
  S.precos = new Map();
  async function carregarPrecos(ids){
    const falta = [...new Set(ids.filter(Boolean).map(String))].filter(id => !S.precos.has(id));
    if (!falta.length) return;
    if (!DB_ATIVO){
      for (const v of S.vendas){ const id = String(v.produto_id); if (!falta.includes(id) || !(Number(v.preco_unit) > 0)) continue; const a = S.precos.get(id); if (!a || String(v.data) > String(a.data)) S.precos.set(id, { preco: Number(v.preco_unit), data: v.data }); }
      return;
    }
    for (let i = 0; i < falta.length; i += 100){
      const parte = falta.slice(i, i + 100);
      try {
        const rows = await selectAll('vendas', q => q.in('produto_id', parte).gt('preco_unit', 0).order('data', { ascending: false }), 'produto_id,preco_unit,data');
        for (const v of rows){ const id = String(v.produto_id); if (!S.precos.has(id)) S.precos.set(id, { preco: Number(v.preco_unit), data: v.data }); }
      } catch (e){ console.warn('[Preços]', e.message || e); }
      parte.forEach(id => { if (!S.precos.has(id)) S.precos.set(id, null); });
    }
  }
  // valor estimado de um item com componentes (slab por mm, LL por metro, montagem de mangueira)
  function valorComponentes(it, contrato){
    const cs = (it.componentes || []).filter(c => c.id);
    if (!cs.length) return null;
    let total = 0, com = 0; const partes = [];
    for (const c of cs){
      const u = ultimoPreco(c.id, contrato); const q = Number(c.qtd) || 1;
      if (u && isFinite(u.preco)){ total += u.preco * q; com++; partes.push(`${String(q).replace('.', ',')} ${c.un || ''} × ${brl(u.preco)}`); }
    }
    return com ? { total, completo: com === cs.length, partes } : null;
  }
  function ultimoPreco(produtoId, contrato){
    if (!produtoId) return null;
    let best = null, bestCli = null;
    for (const v of S.vendas){
      if (String(v.produto_id) !== String(produtoId) || !(Number(v.preco_unit) > 0)) continue;   // componentes de FTM/SGM saem com preço 0
      if (!best || String(v.data) > String(best.data)) best = v;
      if (contrato && Kpis.vendaDoCliente(contrato, v) && (!bestCli || String(v.data) > String(bestCli.data))) bestCli = v;
    }
    const v = bestCli || best;
    if (!v){ const p = S.precos.get(String(produtoId)); return p ? { preco: p.preco, data: p.data, doCliente: false } : null; }
    return { preco: Number(v.preco_unit), data: v.data, doCliente: !!bestCli };
  }

  async function rodarMotor(){
    const btn = $('rp-rodar'); btn.disabled = true;
    const prog = $('rp-progresso');
    try {
      prog.hidden = false; prog.querySelector('span').textContent = 'Carregando o catálogo de produtos...';
      const cat = await carregarCatalogo();
      if (!cat){ showToast('Catálogo de produtos vazio — importe o cadastro em "Base de dados".'); return; }
      prog.querySelector('span').textContent = 'Preparando o índice do motor (só na primeira vez)...';
      await espera(); cat.construirIndice();
      const contrato = CONTRATOS.find(c => c.id === $('rp-contrato').value) || null;
      RP.contratoId = contrato ? contrato.id : '';
      const ctx = contextoMotor(contrato);
      const linhas = linhasDados();
      // histórico pelo código do item, mesmo que o código SIG do cliente ainda não esteja no contrato
      prog.querySelector('span').textContent = 'Procurando os códigos do cliente no histórico de vendas...'; await espera();
      RP.codigosSugeridos = [];
      try {
        const hv = (await historicoPorCodigos(linhas.map(l => l.cod_cliente))).sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
        const chave = contrato ? chaveCliente(contrato) : '';
        const porCliente = new Map();
        hv.forEach(v => {
          const k = String(v.ref_cliente).trim();
          if (!ctx.historico.has(k) || ctx.historico.get(k).geral) ctx.historico.set(k, { id: String(v.produto_id), data: v.data ? dataBR(v.data) : null, preco: v.preco_unit, geral: true, cliente: v.cliente_nome });
          const nm = Kpis.nomeNorm(v.cliente_nome);
          if (nm){ const e = porCliente.get(nm) || { codigo: nm, nome: '', n: 0 }; e.n++; porCliente.set(nm, e); }
        });
        S.vendas = mesclarVendas(S.vendas, hv);
        if (contrato){
          const ja = new Set(Kpis.nomes(contrato));
          RP.codigosSugeridos = [...porCliente.values()].filter(e => !ja.has(e.codigo)).sort((a, b) => b.n - a.n).slice(0, 8);
        }
      } catch (e){ console.warn('[Histórico por código]', e.message || e); }
      RP.itens = [];
      const bar = prog.querySelector('.intel-bar-fill');
      for (let i = 0; i < linhas.length; i++){
        const l = linhas[i];
        const s = Motor.sugerir({ codCliente: l.cod_cliente, descricao: l.descricao_cliente, ref: l.ref }, ctx);
        RP.itens.push(Object.assign({}, l, {
          produto_id: s.produto_id, metodo: s.metodo, confianca: s.confianca, score: s.score, motivo: s.motivo,
          alternativas: s.alternativas || [], componentes: s.componentes || null, ftm: s.ftm || null, status: s.produto_id ? 'sugerido' : 'sem_cadastro'
        }));
        if (i % 25 === 0){ bar.style.width = (i / linhas.length * 100) + '%'; prog.querySelector('span').textContent = `Respondendo item ${i + 1} de ${linhas.length}...`; await espera(); }
      }
      prog.querySelector('span').textContent = 'Buscando últimos preços...'; await espera();
      await carregarPrecos([].concat(...RP.itens.map(it => [it.produto_id].concat((it.componentes || []).map(c => c.id)))));
      bar.style.width = '100%';
      RP.filtro = ''; RP.busca = ''; RP.expandido = null;
      $('rp-resultado').hidden = false;
      renderResultado();
      $('rp-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e){
      console.error(e); showToast('Erro ao responder: ' + (e.message || e));
    } finally { btn.disabled = false; setTimeout(() => { prog.hidden = true; }, 600); }
  }

  function mesclarVendas(a, b){
    const k = (v) => v.pedido + '|' + v.produto_id + '|' + (v.linha || 1);
    const m = new Map(a.map(v => [k(v), v])); b.forEach(v => m.set(k(v), v)); return [...m.values()];
  }

  // ---------- colar descrições (e-mail / colunas do Excel) ----------
  // cada linha vira um item; com TAB (colado do Excel): a célula de texto mais longa é a descrição,
  // um número curto no fim é a quantidade e um código sem espaços é o código do cliente
  function linhasDoTexto(txt){
    const out = [];
    for (let l of String(txt || '').split(/\r?\n/)){
      if (!l.trim()) continue;
      let cod = '', desc = '', qtd = '';
      if (l.includes('\t')){
        const cs = l.split('\t').map(x => x.trim());
        const iq = cs.map((x, i) => /^\d{1,6}(?:[.,]\d+)?$/.test(x) ? i : -1).filter(i => i >= 0).pop();
        if (iq != null && iq >= 0 && cs.filter(x => /[A-Za-z]/.test(x)).length) qtd = cs[iq];
        const textos = cs.map((x, i) => ({ x, i })).filter(o => o.i !== iq && /[A-Za-zÀ-ú]/.test(o.x));
        const d = textos.sort((a, b) => b.x.length - a.x.length)[0];
        desc = d ? d.x : cs.join(' ');
        const c = cs.find((x, i) => i !== iq && (!d || i !== d.i) && /^[\w.\/-]{3,25}$/.test(x) && /\d/.test(x));
        if (c) cod = c;
      } else {
        desc = l.trim().replace(/^(?:item\s*)?\d{1,3}\s*[-–—.)]\s+(?=\S)/i, '');
        const q = desc.match(/\s[-–]?\s*(?:qtd|qtde|quant(?:idade)?)\.?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:pc|pcs|p[çc]s?|un|m)?\.?\s*$/i);
        if (q){ qtd = q[1]; desc = desc.slice(0, q.index).trim(); }
      }
      if (desc) out.push([cod, desc, qtd]);
    }
    return out;
  }
  async function responderTexto(){
    const linhas = linhasDoTexto($('rp-texto').value);
    if (!linhas.length){ showToast('Cole pelo menos uma descrição'); return; }
    RP.origem = 'texto'; RP.wb = null; RP.nomeArquivo = 'descricoes_cliente'; RP.aba = null;
    RP.matriz = [['Código', 'Descrição', 'Qtd']].concat(linhas);
    RP.cab = 0; RP.mapa = adivinharMapa(RP.matriz[0]);
    $('rp-aba').innerHTML = ''; $('rp-cab').value = 1;
    $('rp-arquivo-nome').textContent = linhas.length + ' item(ns) colado(s)';
    $('rp-config').hidden = false; $('rp-config').classList.add('modo-texto');
    renderMapa();
    await rodarMotor();
    const usarIA = $('rp-texto-ia').checked;
    if (usarIA && RP.itens.some(i => !i.produto_id || i.confianca === 'baixa')) await pedirIA();
  }

  async function abrirRevisaoContrato(id){
    goToView('responder');
    popularContratosSelect(id);
    await carregarCatalogo();
    RP.origem = 'contrato'; RP.wb = null; RP.nomeArquivo = '';
    RP.itens = itensDoContrato(id).map(it => Object.assign({}, it, { alternativas: it.alternativas || [] }));
    $('rp-config').hidden = true;
    $('rp-arquivo-nome').textContent = '';
    $('rp-resultado').hidden = false;
    renderResultado();
  }

  const CONF_ORDEM = { alta: 0, media: 1, baixa: 2, sem_cadastro: 3 };
  function itensFiltrados(){
    const q = Motor.up(RP.busca);
    return RP.itens.filter(it => {
      if (RP.filtro === 'pendentes' && it.status === 'aprovado') return false;
      if (RP.filtro && RP.filtro !== 'pendentes' && (it.status === 'sem_cadastro' ? 'sem_cadastro' : it.confianca) !== RP.filtro && !(RP.filtro === 'aprovado' && it.status === 'aprovado')) return false;
      if (RP.filtro === 'aprovado' && it.status !== 'aprovado') return false;
      if (q && !Motor.up([it.cod_cliente, it.descricao_cliente, it.ref, it.produto_id, descProduto(it.produto_id)].join(' ')).includes(q)) return false;
      return true;
    });
  }
  function renderResultado(){
    const n = (f) => RP.itens.filter(f).length;
    const tot = RP.itens.length;
    const resumo = [
      { k: 'alta', l: 'Confiança alta', v: n(i => i.produto_id && i.confianca === 'alta'), c: 'k-green', s: 'De-para, histórico ou apelido idêntico' },
      { k: 'media', l: 'Confiança média', v: n(i => i.produto_id && i.confianca === 'media'), c: 'k-blue', s: 'Equivalente ao REF ou regra de montagem' },
      { k: 'baixa', l: 'Confiança baixa', v: n(i => i.produto_id && i.confianca === 'baixa'), c: 'k-orange', s: 'Conferir antes de aprovar' },
      { k: 'sem_cadastro', l: 'Sem cadastro', v: n(i => !i.produto_id), c: 'k-red', s: 'Nada seguro no cadastro' }
    ];
    $('rp-resumo').innerHTML = resumo.map(r => `<div class="kpi ${r.c} intel-kpi-click ${RP.filtro === r.k ? 'ativo' : ''}" data-filtro="${r.k}"><div class="label">${r.l}</div><div class="value">${r.v}</div><div class="sub">${tot ? pct(r.v / tot * 100) : ''} · ${r.s}</div></div>`).join('');
    $('rp-resumo').querySelectorAll('[data-filtro]').forEach(el => el.addEventListener('click', () => { RP.filtro = RP.filtro === el.dataset.filtro ? '' : el.dataset.filtro; $('rp-filtro').value = RP.filtro; renderResultado(); }));
    const aprovados = n(i => i.status === 'aprovado');
    $('rp-contagem').textContent = `${tot} itens · ${aprovados} aprovados · ${n(i => i.produto_id)} com ID`;
    const iaBtn = $('rp-ia');
    const paraIA = RP.itens.filter(i => !i.produto_id || i.confianca === 'baixa').length;
    iaBtn.hidden = !(PARAMS.ia && PARAMS.ia.ativa);
    iaBtn.textContent = `Pedir à IA (${paraIA})`;
    iaBtn.disabled = !paraIA || (!DB_ATIVO && !usaPuter());
    $('rp-salvar').disabled = !RP.contratoId && !$('rp-contrato').value;
    const dica = $('rp-dica-codigos');
    if (dica){
      const cs = RP.codigosSugeridos || [];
      dica.hidden = !cs.length;
      if (cs.length) dica.innerHTML = `Os códigos desta planilha já foram vendidos no SIG para: ${cs.map(c => `<b>${esc(c.codigo)}</b> (${c.n} venda${c.n > 1 ? 's' : ''})`).join(', ')}. Para o consumo real deste contrato contar essas vendas, ligue esse cliente do SIG ao contrato. <button type="button" class="btn btn-ghost" id="rp-add-codigos">Ligar ao contrato</button>`;
      const ba = $('rp-add-codigos');
      if (ba) ba.onclick = async () => {
        const c = CONTRATOS.find(x => x.id === ($('rp-contrato').value || RP.contratoId)); if (!c) return;
        const atuais = String(c.codigosCliente || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
        const novos = [...new Set(atuais.concat(cs.map(x => x.codigo)))].join(', ');
        if (DB_ATIVO){ const { error } = await supabaseClient.from('contratos').update({ codigos_cliente: novos }).eq('id', c.id); if (error){ showToast('Erro: ' + error.message); return; } }
        c.codigosCliente = novos; RP.codigosSugeridos = [];
        try { await carregarVendas(); } catch (e){}
        recalcularTodos(); renderResultado(); showToast('Cliente do SIG ligado ao contrato ' + c.id);
      };
    }
    $('rp-salvar').title = $('rp-contrato').value ? '' : 'Escolha um contrato de destino lá em cima';
    renderTabela();
  }
  function renderTabela(){
    const tb = document.querySelector('#tbl-rp tbody');
    const lista = itensFiltrados();
    const contrato = CONTRATOS.find(c => c.id === ($('rp-contrato').value || RP.contratoId));
    tb.innerHTML = lista.slice(0, 400).map(it => {
      const i = RP.itens.indexOf(it);
      const conf = it.produto_id ? it.confianca : 'sem_cadastro';
      const confCls = { alta: 'b-green', media: 'b-blue', baixa: 'b-amber', sem_cadastro: 'b-red' }[conf] || 'b-blue';
      const up_ = it.produto_id ? ultimoPreco(it.produto_id, contrato) : null;
      const linha = `<tr class="${it.status === 'aprovado' ? 'rp-aprovado' : ''}" data-i="${i}">
        <td>${it.linha}</td>
        <td class="mono">${esc(it.cod_cliente)}</td>
        <td class="intel-desc" title="${esc(it.descricao_cliente)}">${esc(it.descricao_cliente.slice(0, 110))}${it.ref ? `<div class="intel-muted">REF: ${esc(it.ref)}</div>` : ''}</td>
        <td>${num(it.qtd_estimada).toLocaleString('pt-BR')} ${esc(it.un || '')}</td>
        <td>${it.produto_id ? `<span class="mono">${esc(it.produto_id)}</span> · ${esc(apelidoProduto(it.produto_id))}<div class="intel-muted">${esc(descProduto(it.produto_id))}</div>` : '<span class="intel-muted">—</span>'}${(it.componentes || []).length ? `<ul class="rp-comps">${it.componentes.map(c => `<li><span class="intel-muted">${esc(c.papel)}:</span> ${c.id ? `<span class="mono">${esc(c.id)}</span> · ` : ''}${esc(c.apelido || '')}${c.qtd ? ` <span class="intel-muted">× ${String(c.qtd).replace('.', ',')} ${esc(c.un || '')}</span>` : ''}</li>`).join('')}</ul>` : ''}</td>
        <td><span class="badge ${confCls}">${{ alta: 'Alta', media: 'Média', baixa: 'Baixa', sem_cadastro: 'Sem cadastro' }[conf] || conf}</span><div class="intel-muted rp-motivo">${esc(it.motivo || '')}</div></td>
        <td>${(() => { const vc = valorComponentes(it, contrato); if (vc) return `${brl(vc.total)}<div class="intel-muted">${vc.completo ? 'estimado' : 'parcial'}: ${esc(vc.partes.join(' + '))}</div>`; return up_ ? brl(up_.preco) + `<div class="intel-muted">${up_.doCliente ? 'deste cliente' : 'outro cliente'} · ${dataBR(up_.data)}</div>` : '—'; })()}</td>
        <td class="rp-acoes">
          ${it.produto_id && it.status !== 'aprovado' ? `<button class="icon-btn ok" data-acao="aprovar" title="Aprovar">✓</button>` : ''}
          ${it.status === 'aprovado' ? `<button class="icon-btn" data-acao="desaprovar" title="Voltar para sugerido">↺</button>` : ''}
          <button class="icon-btn" data-acao="trocar" title="Trocar / escolher outro">✎</button>
          ${it.produto_id ? `<button class="icon-btn danger" data-acao="sem" title="Marcar sem cadastro">✕</button>` : ''}
        </td></tr>`;
      return linha + (RP.expandido === i ? linhaTroca(it, i) : '');
    }).join('') + (lista.length > 400 ? `<tr><td colspan="8" class="intel-muted">Mostrando 400 de ${lista.length} — use a busca ou os filtros.</td></tr>` : '') || '<tr><td colspan="8" class="intel-muted">Nenhum item com esse filtro.</td></tr>';
    tb.querySelectorAll('button[data-acao]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.closest('tr').dataset.i); const it = RP.itens[i];
      const a = b.dataset.acao;
      if (a === 'aprovar'){ it.status = 'aprovado'; }
      if (a === 'desaprovar'){ it.status = 'sugerido'; }
      if (a === 'sem'){ it.alternativas = [{ id: it.produto_id, score: it.score }].concat(it.alternativas || []); it.produto_id = null; it.status = 'sem_cadastro'; it.confianca = 'sem_cadastro'; it.metodo = 'manual'; it.motivo = 'Marcado como sem cadastro'; }
      if (a === 'trocar'){ RP.expandido = RP.expandido === i ? null : i; }
      renderResultado();
    }));
    const tr = tb.querySelector('.rp-troca');
    if (tr){
      const i = Number(tr.dataset.i);
      const inp = tr.querySelector('input'); const box = tr.querySelector('.rp-busca-res');
      const buscar = () => {
        const q = inp.value.trim(); if (!q){ box.innerHTML = ''; return; }
        const it = RP.itens[i];
        let res = [];
        const direto = S.catalogo.get(q);
        if (direto) res.push({ prod: direto, score: 1 });
        res = res.concat(S.catalogo.buscar(q, 10).filter(x => !direto || x.prod.id !== direto.id));
        box.innerHTML = res.map(x => {
          const trava = Motor.travas(x.prod, it.ref, Motor.up(it.descricao_cliente));
          return `<button type="button" class="rp-opcao" data-id="${esc(x.prod.id)}"><span class="mono">${esc(x.prod.id)}</span> · ${esc(x.prod.a)} — ${esc(x.prod.d)} ${trava ? `<span class="badge b-amber">${esc(trava)}</span>` : ''}</button>`;
        }).join('') || '<div class="intel-muted">Nada encontrado.</div>';
        box.querySelectorAll('.rp-opcao').forEach(o => o.addEventListener('click', () => escolher(i, o.dataset.id)));
      };
      inp.addEventListener('input', () => { clearTimeout(inp._t); inp._t = setTimeout(buscar, 200); });
      inp.focus();
      tr.querySelectorAll('.rp-alt').forEach(o => o.addEventListener('click', () => escolher(i, o.dataset.id)));
    }
  }
  function linhaTroca(it, i){
    const alts = (it.alternativas || []).filter(a => a && a.id && a.id !== it.produto_id).slice(0, 8);
    return `<tr class="rp-troca" data-i="${i}"><td></td><td colspan="7">
      <div class="rp-troca-box">
        ${alts.length ? `<div class="intel-muted" style="margin-bottom:6px;">Outras opções que o motor considerou:</div>
        ${alts.map(a => `<button type="button" class="rp-opcao rp-alt" data-id="${esc(a.id)}"><span class="mono">${esc(a.id)}</span> · ${esc(apelidoProduto(a.id))} — ${esc(descProduto(a.id))} ${a.score != null ? `<span class="intel-muted">nota ${String(a.score).replace('.', ',')}</span>` : ''} ${a.recusa ? `<span class="badge b-amber">${esc(a.recusa)}</span>` : ''}</button>`).join('')}` : ''}
        <div class="intel-muted" style="margin:10px 0 6px;">Buscar no cadastro (ID, apelido ou descrição):</div>
        <input type="text" class="filter-input" placeholder="ex.: 4G4FJXSML, UMI 16S 3/8 NPT, 18619" style="width:100%;">
        <div class="rp-busca-res"></div>
      </div></td></tr>`;
  }
  function escolher(i, id){
    const it = RP.itens[i];
    it.produto_id = String(id); it.status = 'aprovado'; it.confianca = 'alta'; it.metodo = 'manual'; it.motivo = 'Escolhido manualmente'; it.score = null;
    RP.expandido = null;
    renderResultado();
  }

  // ---------- IA: função do Supabase (Claude com chave no servidor) ou Puter.js (no navegador, conta Puter do usuário) ----------
  const usaPuter = () => !!(PARAMS.ia && PARAMS.ia.puter);
  let _puterCarregando = null;
  function carregarPuter(){
    if (window.puter) return Promise.resolve(window.puter);
    if (!_puterCarregando) _puterCarregando = new Promise((ok, erro) => {
      const sc = document.createElement('script'); sc.src = 'https://js.puter.com/v2/';
      sc.onload = () => ok(window.puter); sc.onerror = () => { _puterCarregando = null; erro(new Error('não foi possível carregar o Puter.js')); };
      document.head.appendChild(sc);
    });
    return _puterCarregando;
  }
  // login do Puter abre uma janela: precisa sair direto do clique (antes de qualquer espera)
  async function loginPuterSePreciso(){
    if (!usaPuter()) return true;
    const p = window.puter || await carregarPuter();
    if (p.auth && p.auth.isSignedIn && !p.auth.isSignedIn()){ try { await p.auth.signIn(); } catch (e){ showToast('Entre na sua conta Puter para usar a IA'); return false; } }
    return true;
  }
  const IA_CONVENCOES = `
Você trabalha na Melting (Soluções em Manutenção Industrial), que vende mangueiras, terminais,
conexões hidráulicas, engates, correias, lençóis de borracha e itens montados. Convenções do cadastro Melting:
- "Apelido" é um código compacto. Terminais de mangueira: {bitola da mangueira em dash}G{bitola da rosca em dash}{tipo}[45|90]SML.
  Tipos: FJX = fêmea giratória JIC 37°; FFORX = fêmea ORFS (sede plana); FBSPORX = fêmea BSP; FDLORX / FDHORX = fêmea DIN série L / S (DKO);
  MP = macho NPT; MBSPP = macho BSP; MJ = macho JIC; MLSP = ponta lisa; FL / FLH = flange código 61 / 62; FP = fêmea NPT fixa.
- Adaptadores hidráulicos: {dash}{tipo}{dash}{tipo}[ângulo], ex.: 12MJ12MBSPP, 8MJ4MP.
- Dash = polegada × 16 (1/4=4, 3/8=6, 1/2=8, 3/4=12, 1=16, 1.1/4=20, 1.1/2=24, 2=32). JIC: 7/16=4, 9/16=6, 3/4=8, 7/8=10, 1.1/16=12, 1.5/16=16, 1.5/8=20.
- Conexões de tubo (anilha 24°): UMA/UMI/UMC (união macho aço/inox/latão), UFA/UFI (fêmea), JIA/JMI (joelho), TIA/TII (tê); número = tubo em mm, L/S = série leve/pesada.
- Lençóis: NATURAL / NITRILICO / NEOPRENE / EPDM + espessura + SL (sem lona) ou 1L/2L (lonas) + largura em metros, ex.: NITRILICO1/8XSLX1,00MTORION.
- Rosca NPT ≠ BSP ≠ UNF/JIC. Inox ≠ aço carbono ≠ latão ≠ PVC. Nunca troque padrão de rosca, material, tipo de peça, dureza ou medida.
`;
  function iaTexto(r){
    if (r == null) return '';
    if (typeof r === 'string') return r;
    const c = r.message && r.message.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(x => x && (x.text || '')).join('');
    if (r.text) return String(r.text);
    return String(r);
  }
  function iaJSON(txt){ const i = txt.indexOf('{'), j = txt.lastIndexOf('}'); if (i < 0 || j < i) throw new Error('resposta da IA sem JSON'); return JSON.parse(txt.slice(i, j + 1)); }
  async function puterChat(sistema, usuario){
    const p = await carregarPuter();
    const msgs = [{ role: 'system', content: sistema }, { role: 'user', content: usuario }];
    const modelo = (PARAMS.ia && PARAMS.ia.modeloPuter || '').trim();
    try { return iaTexto(await p.ai.chat(msgs, modelo ? { model: modelo } : {})); }
    catch (e){ if (!modelo) throw e; console.warn('[Puter] modelo ' + modelo + ' falhou, usando o padrão', e); return iaTexto(await p.ai.chat(msgs)); }
  }
  // mesmos dois passos da função "responder-itens", feitos no navegador
  async function iaPasso(passo, itens){
    if (!usaPuter()){
      const r = await supabaseClient.functions.invoke('responder-itens', { body: { passo, itens } });
      if (r.error) throw r.error; return r.data || {};
    }
    if (passo === 'consultas'){
      const sistema = IA_CONVENCOES + `
Tarefa: para cada item do cliente, escreva de 2 a 4 buscas curtas (no máximo 60 caracteres cada) do jeito que o item
provavelmente está escrito no cadastro Melting: um apelido provável e descrições curtas com tipo, medida, rosca e material.
Responda SOMENTE com JSON: {"itens":[{"consultas":["...","..."]}, ...]} na mesma ordem dos itens.`;
      const usuario = itens.map((it, i) => `${i + 1}. ${String(it.descricao || '').slice(0, 900)}${it.ref ? ` | REF: ${it.ref}` : ''}${it.un ? ` | UN: ${it.un}` : ''}`).join('\n');
      const j = iaJSON(await puterChat(sistema, usuario));
      return { itens: itens.map((_, i) => ({ consultas: (((j.itens || [])[i] || {}).consultas || []).slice(0, 4).map(x => String(x).slice(0, 80)) })) };
    }
    const sistema = IA_CONVENCOES + `
Tarefa: para cada item do cliente, escolha entre os candidatos do cadastro o produto EQUIVALENTE (mesmo tipo de peça,
mesmas medidas, mesmo padrão de rosca, mesmo material, mesmas pontas). Se nenhum for equivalente, responda produto_id null
e escreva em "descricao_sugerida" como o item deveria ser cadastrado no padrão Melting (descrição curta + apelido provável).
Seja conservador: na dúvida, null.
Responda SOMENTE com JSON:
{"itens":[{"produto_id":"123"|null,"confianca":"alta"|"media"|"baixa","justificativa":"até 140 caracteres","descricao_sugerida":"..."}]}
na mesma ordem dos itens.`;
    const usuario = itens.map((it, i) => `ITEM ${i + 1}: ${String(it.descricao || '').slice(0, 900)}${it.ref ? ` | REF: ${it.ref}` : ''}\n  Candidatos:\n` +
      ((it.candidatos || []).slice(0, 20).map(c => `   - ${c.id} | ${c.apelido} | ${c.descricao}`).join('\n') || '   (nenhum)')).join('\n\n');
    const j = iaJSON(await puterChat(sistema, usuario));
    return { itens: itens.map((it, i) => {
      const e = (j.itens || [])[i] || {}; const id = e.produto_id == null ? null : String(e.produto_id);
      return { produto_id: id && (it.candidatos || []).some(c => String(c.id) === id) ? id : null,   // só aceita ID que estava entre os candidatos
        confianca: ['alta', 'media', 'baixa'].includes(String(e.confianca)) ? e.confianca : 'baixa',
        justificativa: String(e.justificativa || '').slice(0, 200), descricao_sugerida: e.descricao_sugerida ? String(e.descricao_sugerida).slice(0, 200) : null };
    }) };
  }

  async function pedirIA(){
    if (!DB_ATIVO && !usaPuter()){ showToast('A IA precisa do Supabase conectado (ou ligue o Puter.js em Parâmetros).'); return; }
    const alvo = RP.itens.filter(i => !i.produto_id || i.confianca === 'baixa');
    if (!alvo.length) return;
    const btn = $('rp-ia'); btn.disabled = true;
    const prog = $('rp-progresso'); prog.hidden = false;
    const bar = prog.querySelector('.intel-bar-fill');
    let feitos = 0, achados = 0;
    try {
      const lote = Math.max(1, (PARAMS.ia && PARAMS.ia.loteItens) || 8);
      for (let k = 0; k < alvo.length; k += lote){
        const parte = alvo.slice(k, k + lote);
        prog.querySelector('span').textContent = `IA: analisando itens ${k + 1}–${k + parte.length} de ${alvo.length}...`;
        // passo 1: a IA escreve buscas no "jeito Melting" de descrever
        const r1 = await iaPasso('consultas', parte.map(it => ({ descricao: it.descricao_cliente, ref: it.ref, un: it.un })));
        const consultas = r1.itens || [];
        // passo 2: o sistema procura no catálogo com essas buscas e a IA escolhe
        const comCand = parte.map((it, j) => {
          const qs = ((consultas[j] && consultas[j].consultas) || []).concat(it.ref ? [it.ref] : []);
          const vistos = new Map();
          qs.forEach(q => S.catalogo.buscar(q, 8).forEach(x => { if (!vistos.has(x.prod.id) || vistos.get(x.prod.id).score < x.score) vistos.set(x.prod.id, x); }));
          (it.alternativas || []).forEach(a => { const p = S.catalogo.get(a.id); if (p && !vistos.has(p.id)) vistos.set(p.id, { prod: p, score: a.score || 0 }); });
          const cands = [...vistos.values()].sort((a, b) => b.score - a.score).slice(0, 20);
          return { it, cands };
        });
        const r2 = await iaPasso('escolher', comCand.map(x => ({ descricao: x.it.descricao_cliente, ref: x.it.ref, un: x.it.un, candidatos: x.cands.map(c => ({ id: c.prod.id, descricao: c.prod.d, apelido: c.prod.a })) })));
        const esc2 = r2.itens || [];
        comCand.forEach((x, j) => {
          const e = esc2[j] || {};
          const it = x.it;
          if (e.produto_id && S.catalogo.get(e.produto_id)){
            const trava = Motor.travas(S.catalogo.get(e.produto_id), it.ref, Motor.up(it.descricao_cliente));
            it.alternativas = [{ id: it.produto_id, score: it.score }].filter(a => a.id).concat(it.alternativas || []);
            it.produto_id = String(e.produto_id); it.metodo = 'ia'; it.status = 'sugerido';
            it.confianca = trava ? 'baixa' : (e.confianca === 'alta' ? 'media' : 'baixa');
            it.motivo = 'IA: ' + (e.justificativa || 'escolhido entre os candidatos') + (trava ? ' — atenção: ' + trava : '');
            achados++;
          } else if (e.descricao_sugerida){
            it.motivo = 'IA: sem equivalente no cadastro. Sugestão de cadastro: ' + e.descricao_sugerida;
          }
        });
        feitos += parte.length;
        bar.style.width = (feitos / alvo.length * 100) + '%';
        renderResultado();
      }
      showToast(`IA encontrou ${achados} de ${alvo.length} item(ns) — confira antes de aprovar`);
    } catch (e){
      console.error(e);
      showToast('IA indisponível: ' + (e.message || e) + (usaPuter() ? ' — confira o login no Puter.' : ' — veja o README (função responder-itens).'));
    } finally { btn.disabled = false; setTimeout(() => { prog.hidden = true; }, 600); }
  }

  // ---------- salvar / exportar ----------
  async function salvarNoContrato(){
    const id = $('rp-contrato').value;
    const c = CONTRATOS.find(x => x.id === id);
    if (!c){ showToast('Escolha o contrato de destino'); return; }
    const existentes = itensDoContrato(id).length;
    const fazer = async () => {
      const linhas = RP.itens.map((it, k) => ({
        contrato_id: id, linha: it.linha || k + 1, cod_cliente: it.cod_cliente || null, descricao_cliente: it.descricao_cliente || null,
        ref: it.ref || null, un: it.un || null, qtd_estimada: num(it.qtd_estimada), preco_contratado: it.preco_contratado == null ? null : num(it.preco_contratado),
        produto_id: it.produto_id || null, status: it.status || (it.produto_id ? 'sugerido' : 'sem_cadastro'), metodo: it.metodo || null,
        confianca: it.confianca || null, score: it.score == null ? null : it.score, motivo: it.motivo || null,
        alternativas: (it.alternativas || []).slice(0, 8), componentes: it.componentes || null
      }));
      const chave = chaveCliente(c);
      const dp = RP.itens.filter(it => it.status === 'aprovado' && it.produto_id && it.cod_cliente)
        .map(it => ({ cliente_chave: chave, cod_cliente: String(it.cod_cliente).trim(), produto_id: String(it.produto_id), descricao_cliente: it.descricao_cliente || null, origem: 'aprovado' }));
      const unicos = [...new Map(dp.map(d => [d.cod_cliente, d])).values()];
      const btn = $('rp-salvar'); btn.disabled = true;
      try {
        if (DB_ATIVO){
          const del = await supabaseClient.from('contrato_itens').delete().eq('contrato_id', id);
          if (del.error) throw del.error;
          const novos = [];
          let semComp = false;
          await emLotes(linhas, 500, async (l) => {
            let { data, error } = await supabaseClient.from('contrato_itens').insert(semComp ? l.map(({ componentes, ...x }) => x) : l).select();
            if (error && /componentes/.test(error.message || '')){ semComp = true; ({ data, error } = await supabaseClient.from('contrato_itens').insert(l.map(({ componentes, ...x }) => x)).select()); }
            if (error) throw error; novos.push(...data);
          });
          if (semComp) showToast('Salvo sem os componentes das montagens — rode o inteligencia.sql atualizado no Supabase');
          if (unicos.length) await emLotes(unicos, 500, async (l) => { const { error } = await supabaseClient.from('de_para').upsert(l, { onConflict: 'cliente_chave,cod_cliente' }); if (error) throw error; });
          S.itens = S.itens.filter(x => x.contrato_id !== id).concat(novos);
          const { data: dpAll } = await supabaseClient.from('de_para').select('*').eq('cliente_chave', chave);
          if (dpAll) S.depara = S.depara.filter(d => d.cliente_chave !== chave).concat(dpAll);
        } else {
          S.itens = S.itens.filter(x => x.contrato_id !== id).concat(linhas.map((l, k) => Object.assign({ id: 'local-' + Date.now() + '-' + k }, l)));
          unicos.forEach(u => { S.depara = S.depara.filter(d => !(d.cliente_chave === u.cliente_chave && d.cod_cliente === u.cod_cliente)); S.depara.push(u); });
        }
        // resumo no contrato (quantidade de itens, itens cotados, valor cotado)
        const comId = linhas.filter(l => l.produto_id).length;
        const valor = linhas.reduce((s, l) => s + (l.preco_contratado ? l.qtd_estimada * l.preco_contratado : 0), 0);
        Object.assign(c, { quantidadeItens: linhas.length, itensCotados: comId, valorCotado: valor || c.valorCotado });
        if (DB_ATIVO){
          const { error } = await supabaseClient.from('contratos').update({ quantidade_itens: linhas.length, itens_cotados: comId, valor_cotado: valor || c.valorCotado || 0 }).eq('id', id);
          if (error) console.warn('[Resumo do contrato]', error.message);
        }
        S.aprendizado = null;
        recalcularTodos(); renderDashboardCompleto(); renderContratos();
        showToast(`${linhas.length} itens salvos em ${id}` + (unicos.length ? ` · ${unicos.length} no de-para do cliente` : ''));
      } catch (e){
        showToast('Erro ao salvar: ' + (e.message || e) + ' (rodou o supabase/inteligencia.sql?)');
      } finally { btn.disabled = false; }
    };
    if (existentes) showConfirm({ title: 'Substituir itens do contrato', message: `O contrato ${id} já tem ${existentes} itens. Salvar substitui todos pelos ${RP.itens.length} desta resposta. Continuar?`, confirmLabel: 'Substituir', onConfirm: fazer });
    else fazer();
  }

  function baixarRespondida(){
    const contrato = CONTRATOS.find(c => c.id === ($('rp-contrato').value || RP.contratoId));
    const extra = ['ID MELTING', 'APELIDO MELTING', 'DESCRIÇÃO MELTING', 'COMPONENTES (MONTAGEM / CORTE)', 'CONFIANÇA', 'STATUS', 'COMO FOI ENCONTRADO', 'ÚLTIMO PREÇO / VALOR ESTIMADO', 'DATA ÚLTIMO PREÇO'];
    const compsTxt = (it) => (it.componentes || []).map(c => (c.qtd ? String(c.qtd).replace('.', ',') + (c.un === 'm' ? ' m ' : 'x ') : '') + (c.id ? c.id + ' ' : '') + (c.apelido || '')).join(' + ');
    const valores = (it) => {
      const vc = valorComponentes(it, contrato);
      const u = vc ? { preco: Math.round(vc.total * 100) / 100, data: null } : (it.produto_id ? ultimoPreco(it.produto_id, contrato) : null);
      return [it.produto_id ? (isNaN(Number(it.produto_id)) ? it.produto_id : Number(it.produto_id)) : 'NÃO ENCONTRADO', apelidoProduto(it.produto_id), descProduto(it.produto_id), compsTxt(it),
        it.produto_id ? it.confianca : 'sem cadastro', it.status, it.motivo || '', u ? u.preco : null, u && u.data ? dataBR(u.data) : null];
    };
    let wb;
    if (RP.origem === 'arquivo' && RP.wb){
      wb = RP.wb;
      const ws = wb.Sheets[RP.aba];
      const range = XLSX.utils.decode_range(ws['!ref']);
      const c0 = range.e.c + 1;
      extra.forEach((h, j) => { ws[XLSX.utils.encode_cell({ r: RP.cab, c: c0 + j })] = { t: 's', v: h }; });
      RP.itens.forEach(it => {
        valores(it).forEach((v, j) => {
          if (v == null || v === '') return;
          ws[XLSX.utils.encode_cell({ r: it.linhaPlanilha, c: c0 + j })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) };
        });
      });
      range.e.c = c0 + extra.length - 1; ws['!ref'] = XLSX.utils.encode_range(range);
    } else {
      const aoa = [['#', 'Cód. cliente', 'Descrição', 'REF', 'UN', 'Qtd estimada', 'Preço'].concat(extra)];
      RP.itens.forEach(it => aoa.push([it.linha, it.cod_cliente, it.descricao_cliente, it.ref, it.un, num(it.qtd_estimada), it.preco_contratado].concat(valores(it))));
      wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Resposta');
    }
    // aba extra com o que não foi encontrado
    const nao = RP.itens.filter(it => !it.produto_id);
    if (nao.length){
      const aoa = [['#', 'Cód. cliente', 'Descrição do cliente', 'REF', 'Qtd', 'Observação']].concat(nao.map(it => [it.linha, it.cod_cliente, it.descricao_cliente, it.ref, num(it.qtd_estimada), it.motivo]));
      const nome = 'Não encontrados';
      if (wb.Sheets[nome]){ delete wb.Sheets[nome]; wb.SheetNames = wb.SheetNames.filter(n => n !== nome); }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome);
    }
    const base = (RP.nomeArquivo || (RP.contratoId || 'resposta')).replace(/\.(xlsx|xls|csv)$/i, '');
    XLSX.writeFile(wb, base + '_respondida.xlsx');
  }

  function setupResponder(){
    const input = $('rp-file'), dz = $('rp-dropzone');
    if (!input) return;
    const abrir = (f) => lerArquivoCliente(f).catch(e => showToast('Não foi possível ler a planilha: ' + (e.message || e)));
    input.addEventListener('change', () => { if (input.files.length) abrir(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) abrir(e.dataTransfer.files[0]); });
    $('rp-aba').addEventListener('change', e => selecionarAba(e.target.value));
    $('rp-cab').addEventListener('change', e => { RP.cab = Math.max(0, Number(e.target.value) - 1); RP.mapa = adivinharMapa(RP.matriz[RP.cab] || []); renderMapa(); });
    $('rp-contrato').addEventListener('change', e => { RP.contratoId = e.target.value; if (!$('rp-resultado').hidden) renderResultado(); });
    $('rp-rodar').addEventListener('click', rodarMotor);
    $('rp-texto-rodar').addEventListener('click', async () => { if ($('rp-texto-ia').checked && !(await loginPuterSePreciso())) return; responderTexto(); });
    $('rp-texto').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); (async () => { if ($('rp-texto-ia').checked && !(await loginPuterSePreciso())) return; responderTexto(); })(); } });
    $('rp-texto-ia').checked = !!(PARAMS.ia && PARAMS.ia.ativa);
    $('rp-texto-ia').addEventListener('change', e => { e.target.dataset.mexido = '1'; });
    $('rp-filtro').addEventListener('change', e => { RP.filtro = e.target.value; renderResultado(); });
    $('rp-busca').addEventListener('input', e => { RP.busca = e.target.value; renderTabela(); });
    $('rp-aprovar-altas').addEventListener('click', () => {
      let n = 0; RP.itens.forEach(it => { if (it.produto_id && it.confianca === 'alta' && it.status !== 'aprovado'){ it.status = 'aprovado'; n++; } });
      renderResultado(); showToast(n + ' item(ns) de confiança alta aprovados');
    });
    $('rp-ia').addEventListener('click', async () => { if (await loginPuterSePreciso()) pedirIA(); });
    $('rp-baixar').addEventListener('click', baixarRespondida);
    $('rp-salvar').addEventListener('click', salvarNoContrato);
    popularContratosSelect('');
  }

  // =====================================================================
  // BASE DE DADOS (importações)
  // =====================================================================
  function lerPlanilhaComoObjetos(buf){
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const m = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    // cabeçalho = primeira linha com 3+ textos
    let h = 0; for (let i = 0; i < Math.min(15, m.length); i++){ if ((m[i] || []).filter(x => typeof x === 'string' && x.trim()).length >= 3){ h = i; break; } }
    const cab = (m[h] || []).map(x => normCab(x));
    const out = [];
    for (let i = h + 1; i < m.length; i++){
      const r = m[i]; if (!r || !r.some(x => x != null && x !== '')) continue;
      const o = {}; cab.forEach((c, j) => { if (c) o[c] = r[j]; }); out.push(o);
    }
    return out;
  }
  const pega = (o, nomes) => { for (const n of nomes){ const k = normCab(n); if (o[k] != null && o[k] !== '') return o[k]; } return null; };
  // CSV do SIG (ped2026, relsitped .csv): lido como texto — vírgula decimal, zeros à esquerda, latin1, ';'
  function lerCSVComoObjetos(buf){
    let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e){ txt = new TextDecoder('windows-1252').decode(buf); }
    const linhas = txt.split(/\r?\n/).filter(l => l.trim());
    if (!linhas.length) return [];
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    const cab = linhas[0].split(sep).map(x => normCab(x.replace(/^"|"$/g, '')));
    return linhas.slice(1).map(l => { const c = l.split(sep); const o = {}; cab.forEach((h, j) => { let v = c[j] == null ? null : c[j].replace(/^"|"$/g, '').trim(); if (v === '' || /^\(NULO\)$/i.test(v)) v = null; if (h) o[h] = v; }); return o; });
  }
  function dataDeCelula(v){
    if (v == null || v === '') return null;
    // "00/00/0000" (data vazia do ERP) e datas impossíveis -> sem data (o banco recusa)
    { const m = typeof v === 'string' && v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/); if (m) return (+m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1900) ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null; }
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    return paraDataISO(v);
  }

  async function gzipJSON(obj){
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    if (typeof CompressionStream === 'undefined') return null;
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  }

  async function importarCadastro(files){
    const st = $('base-cad-status'); const bar = $('base-cad-bar');
    const prods = new Map();
    try {
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + '...'; await espera();
        const rows = lerPlanilhaComoObjetos(await f.arrayBuffer());
        rows.forEach(o => {
          const id = pega(o, ['Produto', 'Código', 'Codigo', 'ID']);
          if (id == null || String(id).trim() === '') return;
          prods.set(String(id).trim(), {
            id: String(id).trim(), descricao: String(pega(o, ['Descrição', 'Descricao']) || '').trim(),
            apelido: String(pega(o, ['Complemento', 'Apelido']) || '').replace(/"/g, '').trim(),
            situacao: String(pega(o, ['Situação', 'Situacao']) || 'A').trim().slice(0, 1).toUpperCase() || 'A',
            origem: String(pega(o, ['Descr. (Origem)', 'Origem']) || '').trim() || null,
            familia: String(pega(o, ['Descr. (Família)', 'Familia']) || '').trim() || null,
            um: String(pega(o, ['UM']) || '').trim() || null,
            ipi: pega(o, ['% IPI']) != null ? num(pega(o, ['% IPI'])) : null,
            marca: String(pega(o, ['Nome (Marca)', 'Marca']) || '').trim() || null
          });
        });
      }
      const lista = [...prods.values()];
      if (!lista.length){ st.textContent = 'Nenhum produto encontrado — confira se é a exportação "cad_produtos" do SIG.'; return; }
      const versao = new Date().toISOString();
      const linhas = lista.map(p => [p.id, p.descricao, p.apelido, p.situacao, p.origem, p.um, p.familia, p.ipi]);
      if (DB_ATIVO){
        await emLotes(lista.map(p => Object.assign({}, p, { atualizado_em: versao })), 1000, async (l) => {
          const { error } = await supabaseClient.from('produtos').upsert(l, { onConflict: 'id' }); if (error) throw error;
        }, (a, b) => { bar.style.width = (a / b * 90) + '%'; st.textContent = `Gravando produtos no banco: ${a.toLocaleString('pt-BR')} de ${b.toLocaleString('pt-BR')}...`; });
        st.textContent = 'Gerando o arquivo do motor...'; await espera();
        let arquivoOk = false;
        try {
          const gz = await gzipJSON(linhas);
          if (gz){
            const { error } = await supabaseClient.storage.from('motor').upload('catalogo.json.gz', gz, { upsert: true, contentType: 'application/gzip' });
            if (error) throw error; arquivoOk = true;
          }
        } catch (e){ console.warn('[Catálogo] não gravou o arquivo do motor (o sistema vai ler da tabela):', e.message || e); }
        await salvarParametro('catalogo', { versao, total: lista.length, arquivo: arquivoOk });
        S.catalogoInfo = { versao, total: lista.length, arquivo: arquivoOk };
      }
      await IDB.set('catalogo', { versao, linhas });
      S.catalogo = linhasParaCatalogo(linhas); S.aprendizado = null;
      S.catalogoInfo = Object.assign({}, S.catalogoInfo, { total: S.catalogo.byId.size, ativos: S.catalogo.lista.length, origem: 'importação agora' });
      bar.style.width = '100%';
      st.textContent = `${lista.length.toLocaleString('pt-BR')} produtos importados${DB_ATIVO ? ' e gravados no banco' : ' (modo demonstração: guardados só neste navegador)'}.`;
      atualizarStatusBase();
      showToast('Cadastro de produtos atualizado');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  async function importarVendas(files){
    const st = $('base-ven-status'); const bar = $('base-ven-bar');
    try {
      const todas = [];
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + '...'; await espera();
        const buf = await f.arrayBuffer();
        const rows = /\.(csv|txt)$/i.test(f.name) ? lerCSVComoObjetos(buf) : lerPlanilhaComoObjetos(buf);
        const cont = new Map();
        rows.forEach(o => {
          const pedido = pega(o, ['pedido_id', 'Pedido', 'Nº pedido', 'Numero pedido']);
          const prod = pega(o, ['idproduto', 'itens_id', 'Produto', 'ID produto', 'CODIGOPRODUTO']);
          if (pedido == null || prod == null) return;
          // export de pedidos com "Complemento": descrição do cliente + "Ped.:… Ref.:<código do cliente> Item:…"
          const compl = pega(o, ['Complemento']);
          const refCompl = compl ? (String(compl).match(/Ref\.?\s*:\s*([^\s*]+)/i) || [])[1] : null;
          const descCompl = compl ? String(compl).replace(/\s+(?:Ped\.?|Ref\.?|Item)\s*:.*$/i, '').trim() : null;
          const k = pedido + '|' + prod; const linha = (cont.get(k) || 0) + 1; cont.set(k, linha);
          todas.push({
            pedido: String(pedido).replace(/\.0+$/, ''), produto_id: String(prod).replace(/\.0+$/, ''), linha,
            data: dataDeCelula(pega(o, ['databreped', 'data', 'Data emissão', 'Data pedido', 'Data', 'DATAEMISSAO', 'Data Geração'])) || dataDeCelula(pega(o, ['Data Entrega', 'DATAENTREGA'])),
            cliente_codigo: pega(o, ['numcli', 'Cliente', 'Código cliente', 'Cod cliente', 'CODIGOCLIENTE']) != null ? String(pega(o, ['numcli', 'Cliente', 'Código cliente', 'Cod cliente', 'CODIGOCLIENTE'])).trim() : null,
            cliente_nome: pega(o, ['fantasia', 'Fantasia (Cliente)', 'Nome cliente', 'Razão social', 'NOMECLIENTE']) ? Kpis.nomeNorm(pega(o, ['fantasia', 'Fantasia (Cliente)', 'Nome cliente', 'Razão social', 'NOMECLIENTE'])) : null,
            descricao: descCompl || pega(o, ['descricao', 'Descrição', 'APELIDOPRODUTO']) || null,
            ref_cliente: refCompl || (pega(o, ['refere', 'Referência cliente', 'Ref cliente', 'REFERENCIACLIENTE']) != null ? String(pega(o, ['refere', 'Referência cliente', 'Ref cliente', 'REFERENCIACLIENTE'])).trim() : null),
            quantidade: num(pega(o, ['qtd', 'Quantidade', 'QUANTIDADEORIGINAL', 'Qtde.Pedida'])), preco_unit: num(pega(o, ['preuni', 'Preço unitário', 'Preco unitario', 'Valor unitário', 'PRECO'])),
            situacao: pega(o, ['sitped', 'Situação', 'SITUACAOPEDIDO', 'Desc.Situação']) || null
          });
        });
      }
      if (!todas.length){ st.textContent = 'Nenhuma venda encontrada — confira se é a exportação "relsitped" do SIG.'; return; }
      if (DB_ATIVO){
        // linhas sem código do cliente vão sem a coluna: o upsert não apaga o ref_cliente que outra exportação já gravou
        todas.forEach(v => { if (v.ref_cliente == null || v.ref_cliente === '' || v.ref_cliente === '(NULO)') delete v.ref_cliente; });
        const comRef = todas.filter(v => 'ref_cliente' in v), semRef = todas.filter(v => !('ref_cliente' in v));
        await emLotes(comRef.concat(semRef), 1000, async (l) => {
          const grupos = [l.filter(v => 'ref_cliente' in v), l.filter(v => !('ref_cliente' in v))].filter(g => g.length);
          for (const g of grupos){ const { error } = await supabaseClient.from('vendas').upsert(g, { onConflict: 'pedido,produto_id,linha' }); if (error) throw error; }
        }, (a, b) => { bar.style.width = (a / b * 100) + '%'; st.textContent = `Gravando vendas: ${a.toLocaleString('pt-BR')} de ${b.toLocaleString('pt-BR')}...`; });
        await carregarVendas();
      } else {
        const k = (v) => v.pedido + '|' + v.produto_id + '|' + v.linha;
        const m = new Map(S.vendas.map(v => [k(v), v])); todas.forEach(v => m.set(k(v), Object.assign({}, m.get(k(v)) || {}, v))); S.vendas = [...m.values()];
      }
      let nDesc = 0;
      try { nDesc = await gravarHistDesc(st); } catch (e){ console.warn('[Histórico por descrição]', e.message || e); }
      bar.style.width = '100%';
      const datas = todas.map(v => v.data).filter(Boolean).sort();
      const clientes = new Set(todas.map(v => v.cliente_codigo));
      st.textContent = `${todas.length.toLocaleString('pt-BR')} linhas de venda importadas · ${clientes.size} cliente(s) · ${datas.length ? dataBR(datas[0]) + ' a ' + dataBR(datas[datas.length - 1]) : ''}${nDesc ? ` · ${nDesc.toLocaleString('pt-BR')} descrições no histórico do motor` : ''}`;
      recalcularTodos(); renderDashboardCompleto(); atualizarStatusBase();
      showToast('Histórico de vendas importado');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  // histórico de cortes: relpro_nita / relpro_mec (correias planas cortadas sob medida)
  async function importarCortes(files){
    const st = $('base-cor-status'); const bar = $('base-cor-bar');
    try {
      const rows = [];
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + '...'; await espera();
        lerPlanilhaComoObjetos(await f.arrayBuffer()).forEach(o => rows.push({
          descricao: pega(o, ['descricao', 'Descrição']), produto1_id: pega(o, ['produto1_id']), larg: pega(o, ['larg', 'Largura']), comp: pega(o, ['comp', 'Comprimento'])
        }));
      }
      const linhas = Motor.agregarCortes(rows);
      if (!linhas.length){ st.textContent = 'Nenhum corte encontrado — confira se é a exportação relpro_nita / relpro_mec do SIG.'; return; }
      const versao = new Date().toISOString();
      if (DB_ATIVO){
        await emLotes(linhas.map(([material, base_id, larg, comp, vezes]) => ({ material, base_id, larg, comp, vezes, atualizado_em: versao })), 1000, async (l) => {
          const { error } = await supabaseClient.from('cortes').upsert(l, { onConflict: 'material,base_id,larg,comp' }); if (error) throw error;
        }, (a, b) => { bar.style.width = (a / b * 90) + '%'; st.textContent = `Gravando cortes: ${a.toLocaleString('pt-BR')} de ${b.toLocaleString('pt-BR')}...`; });
        try {
          const gz = await gzipJSON(linhas);
          if (gz){ const { error } = await supabaseClient.storage.from('motor').upload('cortes.json.gz', gz, { upsert: true, contentType: 'application/gzip' }); if (error) throw error; }
        } catch (e){ console.warn('[Cortes] não gravou o arquivo do motor (o sistema vai ler da tabela):', e.message || e); }
        await salvarParametro('cortes', { versao, total: linhas.length });
        S.cortesInfo = { versao, total: linhas.length };
      }
      await IDB.set('cortes', { versao, linhas });
      if (S.catalogo) S.catalogo.definirCortes(linhas);
      S.cortesTotal = linhas.length; S.cortesLinhas = linhas;
      bar.style.width = '100%';
      st.textContent = `${rows.length.toLocaleString('pt-BR')} cortes lidos · ${linhas.length.toLocaleString('pt-BR')} combinações material × medida${DB_ATIVO ? ' gravadas no banco' : ' (só neste navegador)'}.`;
      atualizarStatusBase();
      showToast('Histórico de cortes importado');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  // equivalências de correias: planilha com MARCA, CODIGO, NITTA, OBS (substitui a tabela inteira)
  async function importarEquivalencias(files){
    const st = $('base-eqv-status'); const bar = $('base-eqv-bar');
    try {
      const rows = [];
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + '...'; await espera();
        lerPlanilhaComoObjetos(await f.arrayBuffer()).forEach(o => {
          const codigo = String(pega(o, ['codigo', 'Código', 'CODIGO']) || '').trim(), nitta = String(pega(o, ['nitta', 'NITTA', 'Nitta']) || '').trim();
          if (codigo && nitta && !/^N\/?A$/i.test(nitta)) rows.push({ marca: String(pega(o, ['marca', 'MARCA', 'Marca']) || '').trim().toUpperCase(), codigo, nitta, obs: String(pega(o, ['obs', 'OBS', 'Observação', 'observacao']) || '').trim() });
        });
      }
      const vistos = new Set(); const linhas = rows.filter(r => { const k = r.marca + '|' + r.codigo + '|' + r.nitta; if (vistos.has(k)) return false; vistos.add(k); return true; });
      if (!linhas.length){ st.textContent = 'Nenhuma equivalência encontrada — a planilha precisa das colunas MARCA, CODIGO, NITTA e OBS.'; return; }
      const versao = new Date().toISOString();
      if (DB_ATIVO){
        { const { error } = await supabaseClient.from('equivalencias').delete().neq('codigo', ''); if (error) throw error; }
        await emLotes(linhas.map(r => Object.assign({ atualizado_em: versao }, r)), 500, async (l) => {
          const { error } = await supabaseClient.from('equivalencias').upsert(l, { onConflict: 'marca,codigo,nitta' }); if (error) throw error;
        }, (a, b) => { bar.style.width = (a / b * 90) + '%'; st.textContent = `Gravando equivalências: ${a} de ${b}...`; });
        await salvarParametro('equivalencias', { versao, total: linhas.length });
        S.equivInfo = { versao, total: linhas.length };
      }
      await IDB.set('equivalencias', { versao, linhas });
      if (S.catalogo) S.catalogo.definirEquivalencias(linhas);
      S.equivLinhas = linhas;
      bar.style.width = '100%';
      st.textContent = `${linhas.length.toLocaleString('pt-BR')} equivalências importadas${DB_ATIVO ? ' e gravadas no banco' : ' (só neste navegador)'}.`;
      atualizarStatusBase();
      showToast('Equivalências de correias importadas');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  // kits SGM: relpro_sgm (produtos montados: peça principal + componentes + mão de obra)
  async function importarKits(files){
    const st = $('base-kit-status'); const bar = $('base-kit-bar');
    try {
      const rows = [];
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + '...'; await espera();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }));
      }
      const linhas = Motor.agregarKits(rows);
      if (!linhas.length){ st.textContent = 'Nenhum kit encontrado — confira se é a exportação relpro_sgm do SIG (colunas sgm, produto, descricao...).'; return; }
      const versao = new Date().toISOString();
      if (DB_ATIVO){
        await emLotes(linhas.map(([sgm, produto_id, descricao, componentes, unidade]) => ({ sgm, produto_id, descricao, componentes, unidade, atualizado_em: versao })), 500, async (l) => {
          const { error } = await supabaseClient.from('kits').upsert(l, { onConflict: 'sgm' }); if (error) throw error;
        }, (a, b) => { bar.style.width = (a / b * 90) + '%'; st.textContent = `Gravando kits: ${a.toLocaleString('pt-BR')} de ${b.toLocaleString('pt-BR')}...`; });
        try {
          const gz = await gzipJSON(linhas);
          if (gz){ const { error } = await supabaseClient.storage.from('motor').upload('kits.json.gz', gz, { upsert: true, contentType: 'application/gzip' }); if (error) throw error; }
        } catch (e){ console.warn('[Kits SGM] não gravou o arquivo do motor (o sistema vai ler da tabela):', e.message || e); }
        await salvarParametro('kits', { versao, total: linhas.length });
        S.kitsInfo = { versao, total: linhas.length };
      }
      await IDB.set('kits', { versao, linhas });
      let novos = 0;
      if (S.catalogo) novos = S.catalogo.definirKits(linhas);
      S.kitsLinhas = linhas;
      bar.style.width = '100%';
      st.textContent = `${linhas.length.toLocaleString('pt-BR')} kits SGM importados${DB_ATIVO ? ' e gravados no banco' : ' (só neste navegador)'}` + (S.catalogo ? ` · ${novos.toLocaleString('pt-BR')} ainda não estavam no cadastro e entraram no motor.` : '.');
      atualizarStatusBase();
      showToast('Kits SGM importados');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  // FTMs: relpro_ftm (CSV/XLS) -> resumo compacto (uso de mangueiras/terminais, capas, FTMs para achar idênticas)
  async function importarFtm(files){
    const st = $('base-ftm-status'); const bar = $('base-ftm-bar');
    try {
      const rows = [];
      for (const f of files){
        st.textContent = 'Lendo ' + f.name + ' (arquivo grande, pode levar alguns segundos)...'; await espera();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', raw: true });
        const ls = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });
        ls.forEach(r => { const o = {}; for (const k in r) o[String(k).trim()] = r[k] == null ? null : String(r[k]).trim(); rows.push(o); });
      }
      st.textContent = 'Resumindo ' + rows.length.toLocaleString('pt-BR') + ' montagens...'; await espera();
      const R = Motor.agregarFtm(rows);
      if (!R.ftms.length){ st.textContent = 'Nenhuma FTM encontrada — confira se é a exportação relpro_ftm (colunas id/ftm, mang_id, ter1_id...).'; return; }
      const versao = new Date().toISOString();
      if (DB_ATIVO){
        st.textContent = 'Gravando no arquivo do motor...'; bar.style.width = '60%'; await espera();
        const gz = await gzipJSON(R);
        if (!gz) throw new Error('navegador sem compressão');
        const { error } = await supabaseClient.storage.from('motor').upload('ftm.json.gz', gz, { upsert: true, contentType: 'application/gzip' });
        if (error) throw error;
        await salvarParametro('ftm', { versao, total: R.ftms.length });
        S.ftmInfo = { versao, total: R.ftms.length };
      }
      await IDB.set('ftm', { versao, resumo: R });
      if (S.catalogo) S.catalogo.definirFtm(R);
      S.ftmTotal = R.ftms.length;
      bar.style.width = '100%';
      st.textContent = `${R.ftms.length.toLocaleString('pt-BR')} montagens FTM resumidas${DB_ATIVO ? ' e gravadas no arquivo do motor' : ' (só neste navegador)'} · ${Object.keys(R.uso).length.toLocaleString('pt-BR')} mangueiras e ${Object.keys(R.usoTer).length.toLocaleString('pt-BR')} terminais diferentes.`;
      atualizarStatusBase();
      showToast('Histórico de FTMs importado');
    } catch (e){ console.error(e); st.textContent = 'Erro: ' + (e.message || e); }
  }

  // ensinar com planilha já respondida: mapeia código do cliente → ID
  const ENS = { wb: null, matriz: [], cab: 0 };
  async function lerEnsino(file){
    ENS.wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const abas = ENS.wb.SheetNames;
    $('ens-aba').innerHTML = abas.map(a => `<option>${esc(a)}</option>`).join('');
    selecionarAbaEnsino(abas[0]);
    $('ens-arquivo').textContent = file.name;
    $('ens-config').hidden = false;
  }
  function selecionarAbaEnsino(nome){
    ENS.aba = nome;
    ENS.matriz = XLSX.utils.sheet_to_json(ENS.wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true });
    ENS.cab = detectarCabecalho(ENS.matriz);
    $('ens-cab').value = ENS.cab + 1;
    renderEnsinoMapa();
  }
  function renderEnsinoMapa(){
    const cab = ENS.matriz[ENS.cab] || [];
    const h = cab.map(normCab);
    const achar = (al) => { for (const a of al){ const i = h.findIndex(x => x === a || (x && a.length > 3 && x.startsWith(a))); if (i >= 0) return i; } return -1; };
    const sel = { cod: achar(CAMPOS[0].alias), id: achar(['ID', 'ID MELTING', 'CODIGO MELTING', 'PRODUTO MELTING', 'COD MELTING', 'ID PRODUTO']), desc: achar(CAMPOS[2].alias.concat(CAMPOS[1].alias)) };
    const opts = (s) => '<option value="-1">— escolher —</option>' + cab.map((x, i) => `<option value="${i}" ${i === s ? 'selected' : ''}>${esc(XLSX.utils.encode_col(i))} · ${esc(String(x == null ? '' : x).slice(0, 40))}</option>`).join('');
    $('ens-col-cod').innerHTML = opts(sel.cod); $('ens-col-id').innerHTML = opts(sel.id); $('ens-col-desc').innerHTML = opts(sel.desc);
    $('ens-cliente').innerHTML = [...new Set(CONTRATOS.map(c => (c.grupo && c.grupo !== '—') ? c.grupo : c.cliente))].sort().map(g => `<option>${esc(g)}</option>`).join('');
  }
  async function salvarEnsino(){
    const ic = Number($('ens-col-cod').value), ii = Number($('ens-col-id').value), idc = Number($('ens-col-desc').value);
    if (ic < 0 || ii < 0){ showToast('Escolha as colunas de código do cliente e de ID Melting'); return; }
    const chave = Motor.up($('ens-cliente').value).replace(/[^A-Z0-9]/g, '');
    const out = new Map();
    for (let i = ENS.cab + 1; i < ENS.matriz.length; i++){
      const r = ENS.matriz[i] || []; const cod = r[ic], id = r[ii];
      if (cod == null || id == null || String(cod).trim() === '' || !/^\w[\w*.-]*$/.test(String(id).trim())) continue;
      const idS = String(id).trim().replace(/\.0+$/, '');
      if (!Number(idS) && !(S.catalogo && S.catalogo.get(idS))) continue;
      out.set(String(cod).trim(), { cliente_chave: chave, cod_cliente: String(cod).trim(), produto_id: idS, descricao_cliente: idc >= 0 && r[idc] ? String(r[idc]) : null, origem: 'planilha-antiga' });
    }
    const lista = [...out.values()];
    if (!lista.length){ showToast('Nenhuma linha com código e ID válidos'); return; }
    try {
      if (DB_ATIVO){
        await emLotes(lista, 500, async (l) => { const { error } = await supabaseClient.from('de_para').upsert(l, { onConflict: 'cliente_chave,cod_cliente' }); if (error) throw error; });
        S.depara = await selectAll('de_para');
      } else {
        lista.forEach(u => { S.depara = S.depara.filter(d => !(d.cliente_chave === u.cliente_chave && d.cod_cliente === u.cod_cliente)); S.depara.push(u); });
      }
      S.aprendizado = null;
      $('ens-status').textContent = `${lista.length} código(s) do cliente aprendidos para ${$('ens-cliente').value}.`;
      atualizarStatusBase();
      showToast('De-para atualizado');
    } catch (e){ showToast('Erro: ' + (e.message || e)); }
  }

  function atualizarStatusBase(){
    const el = $('base-resumo'); if (!el) return;
    const ci = S.catalogoInfo || {};
    const datas = S.vendas.map(v => v.data).filter(Boolean).sort();
    const clientesDp = new Set(S.depara.map(d => d.cliente_chave));
    el.innerHTML = [
      { l: 'Produtos no catálogo do motor', v: S.catalogo ? S.catalogo.byId.size.toLocaleString('pt-BR') : (ci.total ? ci.total.toLocaleString('pt-BR') : '0'), s: S.catalogo ? `${S.catalogo.lista.length.toLocaleString('pt-BR')} ativos · ${ci.origem || ''}` : (ci.versao ? 'ainda não carregado neste navegador' : 'importe o cadastro abaixo') },
      { l: 'Vendas carregadas', v: S.vendas.length.toLocaleString('pt-BR'), s: datas.length ? dataBR(datas[0]) + ' a ' + dataBR(datas[datas.length - 1]) + ' · só clientes ligados a contratos' : 'ligue os contratos ao cliente no SIG' },
      { l: 'De-para (memória do motor)', v: S.depara.length.toLocaleString('pt-BR'), s: clientesDp.size + ' cliente(s)' },
      { l: 'Mangueiras montadas (FTM)', v: (S.ftmTotal || (S.ftmInfo && S.ftmInfo.total) || 0).toLocaleString('pt-BR'), s: S.ftmTotal ? 'histórico de montagens (relpro_ftm)' : 'importe o relpro_ftm abaixo' },
      { l: 'Kits SGM', v: ((S.kitsLinhas || []).length || (S.kitsInfo && S.kitsInfo.total) || 0).toLocaleString('pt-BR'), s: (S.kitsLinhas || []).length ? 'produtos montados (relpro_sgm)' : 'importe o relpro_sgm abaixo' },
      { l: 'Equivalências de correias', v: ((S.equivLinhas || []).length || (S.equivInfo && S.equivInfo.total) || 0).toLocaleString('pt-BR'), s: (S.equivLinhas || []).length ? 'outra marca → Nitta' : 'importe a planilha de equivalências abaixo' },
      { l: 'Cortes de correia plana', v: (S.cortesTotal || (S.cortesInfo && S.cortesInfo.total) || 0).toLocaleString('pt-BR'), s: S.cortesTotal ? 'material × medida (relpro_nita / relpro_mec)' : 'importe o relpro_nita / relpro_mec abaixo' },
      { l: 'Itens de contrato', v: S.itens.length.toLocaleString('pt-BR'), s: new Set(S.itens.map(i => i.contrato_id)).size + ' contrato(s) com itens' }
    ].map(k => `<div class="kpi k-blue"><div class="label">${k.l}</div><div class="value">${k.v}</div><div class="sub">${k.s}</div></div>`).join('');
  }

  function setupBase(){
    const liga = (inputId, dzId, fn) => {
      const input = $(inputId), dz = $(dzId); if (!input) return;
      input.addEventListener('change', () => { if (input.files.length) fn([...input.files]); input.value = ''; });
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
      dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) fn([...e.dataTransfer.files]); });
    };
    liga('base-cad-file', 'base-cad-dz', importarCadastro);
    liga('base-ven-file', 'base-ven-dz', importarVendas);
    liga('base-cor-file', 'base-cor-dz', importarCortes);
    liga('base-kit-file', 'base-kit-dz', importarKits);
    liga('base-eqv-file', 'base-eqv-dz', importarEquivalencias);
    liga('base-ftm-file', 'base-ftm-dz', importarFtm);
    liga('ens-file', 'ens-dz', (fs) => lerEnsino(fs[0]).catch(e => showToast('Erro: ' + e.message)));
    const ea = $('ens-aba'); if (ea) ea.addEventListener('change', e => selecionarAbaEnsino(e.target.value));
    const ec = $('ens-cab'); if (ec) ec.addEventListener('change', e => { ENS.cab = Math.max(0, Number(e.target.value) - 1); renderEnsinoMapa(); });
    const es = $('ens-salvar'); if (es) es.addEventListener('click', salvarEnsino);
    const rc = $('base-recarregar'); if (rc) rc.addEventListener('click', async () => { rc.disabled = true; await carregarCatalogo(true).catch(e => showToast('Erro: ' + e.message)); atualizarStatusBase(); rc.disabled = false; showToast('Catálogo recarregado'); });
  }

  // =====================================================================
  // PARÂMETROS
  // =====================================================================
  const CAMPOS_PARAM = [
    { sec: 'Saúde do contrato e régua', campos: [
      { k: 'dataReferencia', l: 'Data de referência', t: 'date', d: 'Vazio = hoje. Útil para simular uma data.' },
      { k: 'consumoBaixo', l: 'Consumo baixo abaixo de (%)', t: 'number' },
      { k: 'consumoAlto', l: 'Consumo alto acima de (%)', t: 'number', d: 'Vira "Oportunidade" de reajuste.' },
      { k: 'diasAtencao', l: 'Atenção quando vence em até (dias)', t: 'number' },
      { k: 'regua', l: 'Etapas da régua (dias, separados por vírgula)', t: 'list', d: 'Ex.: 120, 90, 60, 30' }
    ]},
    { sec: 'Consumo real', campos: [
      { k: 'ritmoBaixo', l: 'Ritmo baixo abaixo de (×)', t: 'number', step: '0.05', d: 'Consumo ÷ tempo decorrido.' },
      { k: 'ritmoAlto', l: 'Ritmo alto acima de (×)', t: 'number', step: '0.05' },
      { k: 'semGiroPctVigencia', l: 'Item sem giro após (% da vigência)', t: 'number' },
      { k: 'divergenciaPrecoPct', l: 'Alerta de preço divergente acima de (%)', t: 'number' }
    ]},
    { sec: 'Motor de resposta', campos: [
      { k: 'motor.simRef', l: 'Nota mínima "equivalente ao REF" (0–1)', t: 'number', step: '0.01', d: 'Mais alto = menos sugestões, mais certeiras.' },
      { k: 'motor.simAprendido', l: 'Nota mínima "padrão aprendido" (0–1)', t: 'number', step: '0.01' },
      { k: 'motor.usarDescricao', l: 'Sugerir só pela descrição', t: 'bool', d: 'Fraco em descrições SAP longas; prefira a IA.' },
      { k: 'motor.simDescricao', l: 'Nota mínima pela descrição (0–1)', t: 'number', step: '0.01' },
      { k: 'motor.travas.material', l: 'Trava de material (inox / latão / PVC)', t: 'bool' },
      { k: 'motor.travas.rosca', l: 'Trava de padrão de rosca (NPT / BSP / UNF)', t: 'bool' },
      { k: 'motor.travas.tipo', l: 'Trava de tipo de peça (TEE, cotovelo, bucha...)', t: 'bool' },
      { k: 'motor.travas.medidas', l: 'Trava de medidas do REF', t: 'bool' }
    ]},
    { sec: 'IA (Claude)', campos: [
      { k: 'ia.ativa', l: 'Usar IA para itens sem resposta', t: 'bool', d: 'Precisa da função "responder-itens" publicada no Supabase (ver README). Cobra por uso da API.' },
      { k: 'ia.loteItens', l: 'Itens por chamada da IA', t: 'number' },
      { k: 'ia.puter', l: 'Usar Puter.js (sem chave de API)', t: 'bool', d: 'A IA roda no navegador pelo Puter.js: cada usuário entra com a própria conta Puter e o uso fica por conta dela. As descrições passam pelos servidores do Puter. Desligado = função "responder-itens" do Supabase.' },
      { k: 'ia.modeloPuter', l: 'Modelo no Puter (opcional)', t: 'text', d: 'Vazio = modelo padrão do Puter. Se o modelo digitado não existir, o sistema tenta o padrão.' }
    ]}
  ];
  const getP = (o, k) => k.split('.').reduce((a, x) => a == null ? a : a[x], o);
  const setP = (o, k, v) => { const ks = k.split('.'); let a = o; ks.slice(0, -1).forEach(x => { a[x] = a[x] || {}; a = a[x]; }); a[ks[ks.length - 1]] = v; };
  function renderParametros(){
    const el = $('param-form'); if (!el) return;
    const admin = ehAdmin();
    el.innerHTML = CAMPOS_PARAM.map(s => `<div class="form-section"><h4>${s.sec}</h4><div class="form-grid">${s.campos.map(c => {
      const v = getP(PARAMS, c.k);
      const inp = c.t === 'bool' ? `<label class="intel-switch"><input type="checkbox" data-k="${c.k}" data-t="bool" ${v ? 'checked' : ''} ${admin ? '' : 'disabled'}> <span>${v ? 'Ligado' : 'Desligado'}</span></label>`
        : `<input type="${c.t === 'list' ? 'text' : c.t}" ${c.step ? `step="${c.step}"` : ''} data-k="${c.k}" data-t="${c.t}" value="${esc(c.t === 'list' ? (v || []).join(', ') : (v == null ? '' : v))}" ${admin ? '' : 'disabled'}>`;
      return `<div class="field"><label>${c.l}</label>${inp}${c.d ? `<div class="intel-muted">${c.d}</div>` : ''}</div>`;
    }).join('')}</div></div>`).join('') + (admin ? `<div class="form-actions"><button type="button" class="btn btn-ghost" id="param-padrao">Voltar ao padrão</button><button type="button" class="btn" id="param-salvar">Salvar parâmetros</button></div>` : '<div class="note">Somente administradores alteram parâmetros.</div>');
    el.querySelectorAll('input[data-t="bool"]').forEach(i => i.addEventListener('change', () => { i.nextElementSibling.textContent = i.checked ? 'Ligado' : 'Desligado'; }));
    const bs = $('param-salvar');
    if (bs) bs.addEventListener('click', async () => {
      const novo = JSON.parse(JSON.stringify(PARAMS));
      el.querySelectorAll('input[data-k]').forEach(i => {
        const t = i.dataset.t; let v;
        if (t === 'bool') v = i.checked;
        else if (t === 'number') v = i.value === '' ? getP(PARAMS_PADRAO, i.dataset.k) : Number(i.value);
        else if (t === 'list') v = i.value.split(/[,;\s]+/).map(Number).filter(x => x > 0);
        else v = i.value;
        setP(novo, i.dataset.k, v);
      });
      if (!novo.regua || !novo.regua.length) novo.regua = PARAMS_PADRAO.regua.slice();
      try {
        await salvarParametro('sistema', novo);
        PARAMS = mesclarParams(PARAMS_PADRAO, novo);
        try { localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(PARAMS)); } catch (e){}
        HOJE = dataReferencia();
        recalcularTodos(); renderDashboardCompleto(); renderContratos();
        showToast('Parâmetros salvos' + (DB_ATIVO ? '' : ' (modo demonstração: só neste navegador)'));
      } catch (e){ showToast('Não foi possível salvar: ' + (e.message || e)); }
    });
    const bp = $('param-padrao');
    if (bp) bp.addEventListener('click', () => { PARAMS = mesclarParams(PARAMS_PADRAO, {}); renderParametros(); showToast('Valores padrão carregados — clique em Salvar para confirmar'); });
  }

  // ---------------- consultar base (tudo o que foi cadastrado) ----------------
  const CS = { aba: 'produtos', busca: '', filtro: '', pagina: 0, porPagina: 50, linhas: [] };
  const norm = (s) => Motor.up(s == null ? '' : String(s));
  const descId = (id) => { const p = S.catalogo && S.catalogo.get(id); return p ? p.d : ''; };
  const ABAS_CS = {
    produtos: {
      titulo: 'Produtos', total: () => S.catalogo ? S.catalogo.byId.size : 0,
      linhas: () => S.catalogo ? [...S.catalogo.byId.values()] : [],
      filtro: { nome: 'Todas as origens', valores: () => [...new Set(S.catalogo ? [...S.catalogo.byId.values()].map(p => p.origem).filter(Boolean) : [])].sort(), campo: (p) => p.origem },
      colunas: [['ID', p => p.id, 'mono'], ['Apelido', p => p.a, 'mono'], ['Descrição', p => p.d], ['Origem', p => p.origem], ['Família', p => p.familia], ['UM', p => p.um], ['Situação', p => p.ativo ? 'Ativo' : 'Inativo']]
    },
    cortes: {
      titulo: 'Cortes (planas e Mectrol)', total: () => (S.cortesLinhas || []).length,
      linhas: () => (S.cortesLinhas || []).map(([material, base, larg, comp, vezes]) => ({ material, base, larg, comp, vezes })),
      filtro: { nome: 'Nitta e Mectrol', valores: () => ['Plana (Nitta)', 'LL sincronizadora (Mectrol)'], campo: (r) => Motor.parseLL(r.material) ? 'LL sincronizadora (Mectrol)' : 'Plana (Nitta)' },
      colunas: [['Tipo', r => Motor.parseLL(r.material) ? 'LL (Mectrol)' : 'Plana'], ['Material', r => r.material, 'mono'], ['ID base', r => r.base, 'mono'], ['Material base no cadastro', r => descId(r.base)], ['Largura (mm)', r => r.larg || (Motor.parseLL(r.material) || {}).larg || '', 'num'], ['Comprimento (mm)', r => r.comp, 'num'], ['Vezes cortado', r => r.vezes, 'num']]
    },
    kits: {
      titulo: 'Kits SGM', total: () => (S.kitsLinhas || []).length,
      linhas: () => (S.kitsLinhas || []).map(([sgm, id, desc, comps, um]) => ({ sgm, id, desc, comps: comps || [], um })),
      colunas: [['SGM', k => k.sgm, 'mono'], ['ID', k => k.id, 'mono'], ['Descrição', k => k.desc], ['Componentes', k => k.comps.map(c => (c[2] && c[2] !== 1 ? c[2] + '× ' : '') + (c[1] || c[0]) + ' [' + c[0] + ']').join(' + ')], ['UN', k => k.um]]
    },
    equivalencias: {
      titulo: 'Equivalências (→ Nitta)', total: () => (S.equivLinhas || []).length,
      linhas: () => S.equivLinhas || [],
      filtro: { nome: 'Todas as marcas', valores: () => [...new Set((S.equivLinhas || []).map(r => r.marca || '(anotação sem marca)'))].sort(), campo: (r) => r.marca || '(anotação sem marca)' },
      colunas: [['Marca', r => r.marca], ['Código', r => r.codigo, 'mono'], ['Nitta', r => r.nitta, 'mono'], ['Já cortado pela Melting', r => { const C = S.catalogo && S.catalogo._cortes; const b = C && C.porCod.get(Motor.comp(r.nitta).replace(/\//g, '')); return b ? descId(b.base) || b.base : ''; }], ['Observação / diferenças', r => r.obs]]
    },
    depara: {
      titulo: 'De-para dos clientes', total: () => S.depara.length,
      linhas: () => S.depara,
      filtro: { nome: 'Todos os clientes', valores: () => [...new Set(S.depara.map(d => d.cliente_chave))].sort(), campo: (d) => d.cliente_chave },
      colunas: [['Cliente', d => d.cliente_chave], ['Código do cliente', d => d.cod_cliente, 'mono'], ['ID Melting', d => d.produto_id, 'mono'], ['Descrição Melting', d => descId(d.produto_id)], ['Descrição do cliente', d => d.descricao_cliente], ['Origem', d => d.origem]]
    },
    vendas: {
      titulo: 'Vendas', total: () => S.vendas.length,
      linhas: () => S.vendas,
      colunas: [['Data', v => v.data ? dataBR(v.data) : ''], ['Pedido', v => v.pedido, 'mono'], ['Cliente', v => v.cliente_nome || v.cliente_codigo], ['ID', v => v.produto_id, 'mono'], ['Descrição', v => v.descricao || descId(v.produto_id)], ['Cód. cliente', v => v.ref_cliente, 'mono'], ['Qtd', v => v.quantidade, 'num'], ['Preço unit.', v => v.preco_unit != null ? brl(v.preco_unit) : '', 'num']]
    },
    itens: {
      titulo: 'Itens de contrato', total: () => S.itens.length,
      linhas: () => S.itens,
      filtro: { nome: 'Todos os contratos', valores: () => [...new Set(S.itens.map(i => i.contrato_id))].sort(), campo: (i) => i.contrato_id },
      colunas: [['Contrato', i => i.contrato_id, 'mono'], ['Linha', i => i.linha, 'num'], ['Código do cliente', i => i.cod_cliente, 'mono'], ['Descrição do cliente', i => i.descricao_cliente], ['ID Melting', i => i.produto_id, 'mono'], ['Descrição Melting', i => descId(i.produto_id)], ['Status', i => i.status], ['Método', i => i.metodo], ['Qtd est.', i => i.qtd_estimada, 'num']]
    }
  };
  function filtrarConsulta(){
    const A = ABAS_CS[CS.aba];
    let ls = A.linhas();
    if (CS.filtro && A.filtro) ls = ls.filter(r => A.filtro.campo(r) === CS.filtro);
    const termos = norm(CS.busca).split(/\s+/).filter(Boolean);
    if (termos.length){
      ls = ls.filter(r => { const t = norm(A.colunas.map(c => c[1](r)).join(' ')); return termos.every(x => t.includes(x)); });
    }
    CS.linhas = ls;
  }
  function marcar(txt){
    const s = esc(txt == null ? '' : String(txt));
    const termos = CS.busca.trim().split(/\s+/).filter(x => x.length >= 2);
    if (!termos.length) return s;
    let out = s;
    for (const t of termos){ const rx = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); out = out.replace(rx, '<mark>$1</mark>'); }
    return out;
  }
  function renderConsulta(refiltrar){
    const A = ABAS_CS[CS.aba];
    $('cs-abas').innerHTML = Object.entries(ABAS_CS).map(([k, a]) =>
      `<button type="button" class="cs-aba" role="tab" data-aba="${k}" aria-selected="${k === CS.aba}"><b>${esc(a.titulo)}</b><span class="cs-n">${a.total().toLocaleString('pt-BR')}</span></button>`).join('');
    const f = $('cs-filtro');
    if (A.filtro){
      f.hidden = false;
      f.innerHTML = `<option value="">${esc(A.filtro.nome)}</option>` + A.filtro.valores().map(v => `<option ${v === CS.filtro ? 'selected' : ''}>${esc(v)}</option>`).join('');
    } else f.hidden = true;
    if (refiltrar !== false) filtrarConsulta();
    const total = CS.linhas.length, paginas = Math.max(1, Math.ceil(total / CS.porPagina));
    CS.pagina = Math.min(CS.pagina, paginas - 1);
    const pag = CS.linhas.slice(CS.pagina * CS.porPagina, (CS.pagina + 1) * CS.porPagina);
    const tbl = $('tbl-cs');
    tbl.querySelector('thead').innerHTML = '<tr>' + A.colunas.map(c => `<th${c[2] === 'num' ? ' style="text-align:right"' : ''}>${esc(c[0])}</th>`).join('') + '</tr>';
    tbl.querySelector('tbody').innerHTML = pag.length
      ? pag.map(r => '<tr>' + A.colunas.map(c => `<td class="${c[2] || ''}">${c[2] === 'num' ? esc(c[1](r) == null ? '' : (typeof c[1](r) === 'number' ? c[1](r).toLocaleString('pt-BR') : c[1](r))) : marcar(c[1](r))}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${A.colunas.length}" class="intel-muted" style="padding:24px;text-align:center;">${A.total() ? 'Nada encontrado com essa busca.' : (CS.aba === 'produtos' && !S.catalogo ? 'Carregando o catálogo...' : 'Nada cadastrado ainda — importe na tela Base de dados.')}</td></tr>`;
    $('cs-contagem').textContent = total === A.total() ? `${total.toLocaleString('pt-BR')} registro(s)` : `${total.toLocaleString('pt-BR')} de ${A.total().toLocaleString('pt-BR')} registro(s)`;
    $('cs-pagina').textContent = `Página ${CS.pagina + 1} de ${paginas.toLocaleString('pt-BR')}`;
    $('cs-ant').disabled = CS.pagina === 0; $('cs-prox').disabled = CS.pagina >= paginas - 1;
  }
  function baixarConsulta(){
    const A = ABAS_CS[CS.aba];
    if (!CS.linhas.length){ showToast('Nada para baixar'); return; }
    const linhas = [A.colunas.map(c => c[0])].concat(CS.linhas.map(r => A.colunas.map(c => { const v = c[1](r); return v == null ? '' : v; })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), A.titulo.slice(0, 30));
    XLSX.writeFile(wb, 'melting-' + CS.aba + '.xlsx');
  }
  function setupConsulta(){
    const abas = $('cs-abas'); if (!abas) return;
    abas.addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (!b) return; CS.aba = b.dataset.aba; CS.filtro = ''; CS.pagina = 0; renderConsulta(); });
    let t = null;
    $('cs-busca').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { CS.busca = e.target.value; CS.pagina = 0; renderConsulta(); }, 250); });
    $('cs-filtro').addEventListener('change', e => { CS.filtro = e.target.value; CS.pagina = 0; renderConsulta(); });
    $('cs-ant').addEventListener('click', () => { if (CS.pagina > 0){ CS.pagina--; renderConsulta(false); } });
    $('cs-prox').addEventListener('click', () => { CS.pagina++; renderConsulta(false); });
    $('cs-baixar').addEventListener('click', baixarConsulta);
  }

  // ---------------- ganchos chamados pelo app.js ----------------
  function aoAbrirView(view){
    if (view === 'responder'){ if (usaPuter()) carregarPuter().catch(e => console.warn('[Puter]', e.message || e)); popularContratosSelect($('rp-contrato') ? $('rp-contrato').value : ''); const cb = $('rp-texto-ia'); if (cb && !cb.dataset.mexido) cb.checked = !!(PARAMS.ia && PARAMS.ia.ativa); }
    if (view === 'base'){ atualizarStatusBase(); if (!S.catalogo) carregarCatalogo().then(atualizarStatusBase).catch(() => {}); }
    if (view === 'parametros') renderParametros();
    if (view === 'consulta'){ renderConsulta(); if (!S.catalogo) carregarCatalogo().then(() => renderConsulta()).catch(() => {}); }
  }

  setupResponder();
  setupBase();
  setupConsulta();
  // se o banco terminou de carregar antes deste arquivo, dispara a carga agora
  if (typeof DB_ATIVO !== 'undefined' && DB_ATIVO) setTimeout(() => aoCarregarBanco(), 0);

  return { S, RP, aoCarregarBanco, renderDashboard, renderDetalheContrato, aoAbrirView, abrirResponder, carregarCatalogo, recalcularTodos, atualizarStatusBase, _sugerirTeste: (it, c) => Motor.sugerir(it, contextoMotor(c)) };
})();
