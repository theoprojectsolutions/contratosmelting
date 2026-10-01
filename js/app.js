// ===================== GUARDA DE AUTENTICAÇÃO =====================
// Enquanto não confirmar uma sessão válida do Supabase, a tela fica
// coberta (evita qualquer flash do sistema com dados fictícios) e depois
// manda pro login se não houver sessão de verdade.
(async function verificarAutenticacao(){
  const liberarTela = () => {
    const gate = document.getElementById('auth-gate');
    if (gate) gate.remove();
  };
  if (typeof supabaseClient === 'undefined' || !supabaseClient){
    window.location.replace('login.html');
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data || !data.session){
      window.location.replace('login.html');
      return;
    }
    liberarTela();
  } catch (e){
    window.location.replace('login.html');
  }
})();

// ===================== DADOS FICTÍCIOS (mock) =====================
// data de referência vem dos Parâmetros (vazio = hoje) — ver js/parametros.js
let HOJE = dataReferencia();

// ===================== PERFIL DE ACESSO (admin / gerente) =====================
// Padrão otimista: começa como admin pra não travar o protótipo enquanto
// o Supabase não está configurado. Quando há sessão real, o papel vem
// da tabela "perfis" (ver supabase/perfis-e-permissoes.sql).
let USER_ROLE = 'admin';

let CONTRATOS = [
  {id:'C-2026-014', cliente:'Grupo Alfa Metalúrgica', grupo:'Grupo Alfa', unidade:'Matriz - SP', uf:'SP', segmento:'Metalurgia', quantidadeItens:34, itensCotados:34, valorCotado:184000, itensVencidos:34, vendedorInterno:'Rafael Souza', vendedorExterno:'Marcos Lima', gerente:'Cíntia Prado', dataInicio:'2025-09-10', dataFim:'2026-08-28', valorContratado:184000, qtdEstimada:1000, qtdConsumida:820, ncm:'8483.40.90', icmsDivergencia:false},
  {id:'C-2026-021', cliente:'Beta Componentes Ind.', grupo:'Grupo Beta', unidade:'Unidade Sul', uf:'RS', segmento:'Autopeças', quantidadeItens:19, itensCotados:19, valorCotado:96000, itensVencidos:19, vendedorInterno:'Rafael Souza', vendedorExterno:'Ana Ferraz', gerente:'Cíntia Prado', dataInicio:'2025-06-01', dataFim:'2026-09-11', valorContratado:96000, qtdEstimada:600, qtdConsumida:324, ncm:'7318.15.00', icmsDivergencia:true},
  {id:'C-2026-032', cliente:'Cerâmica Gama S.A.', grupo:'Grupo Gama', unidade:'Planta 2', uf:'MG', segmento:'Cerâmica', quantidadeItens:41, itensCotados:41, valorCotado:245000, itensVencidos:41, vendedorInterno:'Juliana Reis', vendedorExterno:'Marcos Lima', gerente:'Diego Alves', dataInicio:'2025-05-20', dataFim:'2026-08-19', valorContratado:245000, qtdEstimada:1500, qtdConsumida:1710, ncm:'8481.80.99', icmsDivergencia:false},
  {id:'C-2026-045', cliente:'Delta Papel & Celulose', grupo:'Grupo Delta', unidade:'Matriz - PR', uf:'PR', segmento:'Papel & Celulose', quantidadeItens:57, itensCotados:57, valorCotado:312000, itensVencidos:57, vendedorInterno:'Juliana Reis', vendedorExterno:'Ana Ferraz', gerente:'Diego Alves', dataInicio:'2024-10-01', dataFim:'2026-07-30', valorContratado:312000, qtdEstimada:2200, qtdConsumida:990, ncm:'4811.59.90', icmsDivergencia:true},
  {id:'C-2026-051', cliente:'Épsilon Autopeças', grupo:'Grupo Épsilon', unidade:'Unidade 1', uf:'SP', segmento:'Autopeças', quantidadeItens:23, itensCotados:23, valorCotado:158000, itensVencidos:23, vendedorInterno:'Rafael Souza', vendedorExterno:'Marcos Lima', gerente:'Cíntia Prado', dataInicio:'2025-11-15', dataFim:'2026-10-12', valorContratado:158000, qtdEstimada:900, qtdConsumida:702, ncm:'8708.99.90', icmsDivergencia:false},
  {id:'C-2026-058', cliente:'Zeta Têxtil Industrial', grupo:'Grupo Zeta', unidade:'Matriz - SC', uf:'SC', segmento:'Têxtil', quantidadeItens:15, itensCotados:15, valorCotado:78000, itensVencidos:15, vendedorInterno:'Juliana Reis', vendedorExterno:'Ana Ferraz', gerente:'Diego Alves', dataInicio:'2025-04-02', dataFim:'2026-11-30', valorContratado:78000, qtdEstimada:500, qtdConsumida:355, ncm:'5407.42.00', icmsDivergencia:false},
  {id:'C-2026-063', cliente:'Grupo Alfa Metalúrgica', grupo:'Grupo Alfa', unidade:'Filial - Sorocaba', uf:'SP', segmento:'Metalurgia', quantidadeItens:12, itensCotados:12, valorCotado:64000, itensVencidos:12, vendedorInterno:'Rafael Souza', vendedorExterno:'Marcos Lima', gerente:'Cíntia Prado', dataInicio:'2025-08-01', dataFim:'2026-09-02', valorContratado:64000, qtdEstimada:400, qtdConsumida:170, ncm:'8483.40.90', icmsDivergencia:false},
  {id:'C-2026-071', cliente:'Theta Bebidas', grupo:'Grupo Theta', unidade:'Matriz - GO', uf:'GO', segmento:'Bebidas', quantidadeItens:28, itensCotados:28, valorCotado:210000, itensVencidos:28, vendedorInterno:'Juliana Reis', vendedorExterno:'Ana Ferraz', gerente:'Diego Alves', dataInicio:'2025-02-14', dataFim:'2026-08-13', valorContratado:210000, qtdEstimada:1300, qtdConsumida:1187, ncm:'8422.30.29', icmsDivergencia:false},
  {id:'C-2026-079', cliente:'Iota Agroindustrial', grupo:'Grupo Iota', unidade:'Unidade Oeste', uf:'MT', segmento:'Agroindustrial', quantidadeItens:63, itensCotados:63, valorCotado:405000, itensVencidos:63, vendedorInterno:'Rafael Souza', vendedorExterno:'Marcos Lima', gerente:'Cíntia Prado', dataInicio:'2025-01-05', dataFim:'2026-06-20', valorContratado:405000, qtdEstimada:2600, qtdConsumida:1508, ncm:'8433.51.00', icmsDivergencia:true},
  {id:'C-2026-084', cliente:'Cerâmica Gama S.A.', grupo:'Grupo Gama', unidade:'Planta 1', uf:'MG', segmento:'Cerâmica', quantidadeItens:22, itensCotados:22, valorCotado:132000, itensVencidos:22, vendedorInterno:'Juliana Reis', vendedorExterno:'Marcos Lima', gerente:'Diego Alves', dataInicio:'2025-09-22', dataFim:'2027-01-18', valorContratado:132000, qtdEstimada:800, qtdConsumida:640, ncm:'8481.80.99', icmsDivergencia:false},
  {id:'C-2026-090', cliente:'Beta Componentes Ind.', grupo:'Grupo Beta', unidade:'Unidade Sul', uf:'RS', segmento:'Autopeças', quantidadeItens:9, itensCotados:9, valorCotado:52000, itensVencidos:9, vendedorInterno:'Rafael Souza', vendedorExterno:'Ana Ferraz', gerente:'Cíntia Prado', dataInicio:'2025-07-08', dataFim:'2026-10-05', valorContratado:52000, qtdEstimada:350, qtdConsumida:298, ncm:'7318.15.00', icmsDivergencia:false},
  {id:'C-2026-097', cliente:'Delta Papel & Celulose', grupo:'Grupo Delta', unidade:'Filial - Curitiba', uf:'PR', segmento:'Papel & Celulose', quantidadeItens:31, itensCotados:31, valorCotado:189000, itensVencidos:31, vendedorInterno:'Juliana Reis', vendedorExterno:'Ana Ferraz', gerente:'Diego Alves', dataInicio:'2024-12-01', dataFim:'2026-07-05', valorContratado:189000, qtdEstimada:1100, qtdConsumida:410, ncm:'4811.59.90', icmsDivergencia:false},
];

let COTACOES = [
  {numero:'COT-4821', cliente:'Grupo Alfa Metalúrgica', tipo:'Renovação', dataRecebimento:'2026-07-20', dataEnvio:'2026-08-02', itensEstimados:640, itensCotados:467, valorEstimado:260000, valorCotado:190000, valorContrato:184000, status:'Em negociação', motivo:'Aguardando validação do comprador'},
  {numero:'COT-4835', cliente:'Delta Papel & Celulose', tipo:'Renovação', dataRecebimento:'2026-06-15', dataEnvio:'2026-06-25', itensEstimados:1500, itensCotados:1290, valorEstimado:347000, valorCotado:298000, valorContrato:312000, status:'Perdido', motivo:'Concorrente ofertou prazo de entrega menor'},
  {numero:'COT-4849', cliente:'Iota Agroindustrial', tipo:'Renovação', dataRecebimento:'2026-05-10', dataEnvio:'2026-05-14', itensEstimados:900, itensCotados:900, valorEstimado:420000, valorCotado:420000, valorContrato:405000, status:'Renovado', motivo:'Ajuste de volume aprovado pelo gerente'},
  {numero:'COT-4860', cliente:'Zeta Têxtil Industrial', tipo:'Cliente novo', dataRecebimento:'2026-07-01', dataEnvio:'2026-07-05', itensEstimados:300, itensCotados:297, valorEstimado:82000, valorCotado:81000, valorContrato:78000, status:'Ativo', motivo:'—'},
  {numero:'COT-4873', cliente:'Cerâmica Gama S.A.', tipo:'Renovação', dataRecebimento:'2026-07-25', dataEnvio:'2026-08-01', itensEstimados:480, itensCotados:350, valorEstimado:350000, valorCotado:255000, valorContrato:245000, status:'Em negociação', motivo:'Revisão de preço por alta de insumo'},
  {numero:'COT-4881', cliente:'Théta Bebidas', tipo:'Renovação', dataRecebimento:'2026-06-20', dataEnvio:'2026-06-22', itensEstimados:260, itensCotados:260, valorEstimado:210000, valorCotado:210000, valorContrato:210000, status:'Ativo', motivo:'—'},
];

let CLIENTES = [
  {cliente:'Grupo Alfa Metalúrgica', grupo:'Grupo Alfa', unidades:'Matriz - SP, Filial - Sorocaba', comprador:'Fernando Dias'},
  {cliente:'Beta Componentes Ind.', grupo:'Grupo Beta', unidades:'Unidade Sul', comprador:'Patrícia Nunes'},
  {cliente:'Cerâmica Gama S.A.', grupo:'Grupo Gama', unidades:'Planta 1, Planta 2', comprador:'Roberto Cunha'},
  {cliente:'Delta Papel & Celulose', grupo:'Grupo Delta', unidades:'Matriz - PR, Filial - Curitiba', comprador:'Aline Torres'},
  {cliente:'Épsilon Autopeças', grupo:'Grupo Épsilon', unidades:'Unidade 1', comprador:'Bruno Castro'},
  {cliente:'Zeta Têxtil Industrial', grupo:'Grupo Zeta', unidades:'Matriz - SC', comprador:'Camila Rocha'},
  {cliente:'Theta Bebidas', grupo:'Grupo Theta', unidades:'Matriz - GO', comprador:'Igor Matos'},
  {cliente:'Iota Agroindustrial', grupo:'Grupo Iota', unidades:'Unidade Oeste', comprador:'Sônia Prado'},
];

// ===================== CAMADA DE DADOS DO SUPABASE =====================
// Os arrays acima (CONTRATOS/COTACOES/CLIENTES) continuam servindo de
// dados de demonstração offline. Se o Supabase estiver configurado e
// houver uma sessão ativa, eles são substituídos pelos dados reais do
// banco assim que a página carrega — e toda criação/edição/exclusão
// passa a gravar direto no banco (respeitando as regras de admin/gerente).
let DB_ATIVO = false; // true quando os dados vieram mesmo do Supabase

function linhaParaContrato(r){
  return {
    id:r.id, cliente:r.cliente, grupo:r.grupo, unidade:r.unidade, uf:r.uf,
    segmento:r.segmento, quantidadeItens:Number(r.quantidade_itens)||0,
    itensCotados:Number(r.itens_cotados)||0, valorCotado:Number(r.valor_cotado)||0,
    itensVencidos:Number(r.itens_vencidos)||0,
    vendedorInterno:r.vendedor_interno, vendedorExterno:r.vendedor_externo, gerente:r.gerente,
    dataInicio:r.data_inicio, dataFim:r.data_fim,
    valorContratado:Number(r.valor_contratado)||0, qtdEstimada:Number(r.qtd_estimada)||0,
    qtdConsumida:Number(r.qtd_consumida)||0, ncm:r.ncm, icmsDivergencia:!!r.icms_divergencia,
    periodo:r.periodo, dataReajuste:r.data_reajuste, situacao:r.situacao,
    observacao:r.observacao, statusPlanilha:r.status_planilha,
    dataRecebimento:r.data_recebimento,
    codigosCliente:r.codigos_cliente
  };
}
function contratoParaLinha(c){
  return {
    id:c.id, cliente:c.cliente, grupo:c.grupo, unidade:c.unidade, uf:c.uf,
    segmento:c.segmento, quantidade_itens:c.quantidadeItens,
    itens_cotados:c.itensCotados, valor_cotado:c.valorCotado, itens_vencidos:c.itensVencidos,
    vendedor_interno:c.vendedorInterno, vendedor_externo:c.vendedorExterno, gerente:c.gerente,
    data_inicio:c.dataInicio, data_fim:c.dataFim,
    valor_contratado:c.valorContratado, qtd_estimada:c.qtdEstimada,
    qtd_consumida:c.qtdConsumida, ncm:c.ncm, icms_divergencia:c.icmsDivergencia,
    periodo:c.periodo||null, data_reajuste:c.dataReajuste||null, situacao:c.situacao||null,
    observacao:c.observacao||null, status_planilha:c.statusPlanilha||null,
    data_recebimento:c.dataRecebimento||null,
    // só envia se o banco já tiver a coluna (supabase/inteligencia.sql)
    ...(c.codigosCliente !== undefined ? { codigos_cliente: c.codigosCliente || null } : {})
  };
}
function linhaParaCotacao(r){
  return {
    numero:r.numero, cliente:r.cliente, tipo:r.tipo,
    dataRecebimento:r.data_recebimento, dataEnvio:r.data_envio,
    itensEstimados:Number(r.itens_estimados)||0, itensCotados:Number(r.itens_cotados)||0,
    valorEstimado:Number(r.valor_estimado)||0,
    valorCotado:Number(r.valor_cotado)||0, valorContrato:Number(r.valor_contrato)||0,
    status:r.status, motivo:r.motivo,
    internos:r.internos, externos:r.externos,
    itensVencidos:r.itens_vencidos!=null?Number(r.itens_vencidos):null,
    valorVencidoEstimado:r.valor_vencido_estimado!=null?Number(r.valor_vencido_estimado):null,
    dataUltimaAtualizacao:r.data_ultima_atualizacao
  };
}
function cotacaoParaLinha(c){
  return {
    numero:c.numero, cliente:c.cliente, tipo:c.tipo,
    data_recebimento:c.dataRecebimento, data_envio:c.dataEnvio,
    itens_estimados:c.itensEstimados, itens_cotados:c.itensCotados,
    valor_estimado:c.valorEstimado,
    valor_cotado:c.valorCotado, valor_contrato:c.valorContrato,
    status:c.status, motivo:c.motivo,
    internos:c.internos||null, externos:c.externos||null,
    itens_vencidos:c.itensVencidos!=null?c.itensVencidos:null,
    valor_vencido_estimado:c.valorVencidoEstimado!=null?c.valorVencidoEstimado:null,
    data_ultima_atualizacao:c.dataUltimaAtualizacao||null
  };
}
function linhaParaCliente(r){
  return { id:r.id, cliente:r.cliente, grupo:r.grupo, unidades:r.unidades, comprador:r.comprador, vendedorPrincipal:r.vendedor_principal };
}
function clienteParaLinha(cl){
  return { cliente:cl.cliente, grupo:cl.grupo, unidades:cl.unidades, comprador:cl.comprador, vendedor_principal:cl.vendedorPrincipal||null };
}

function maiorSufixo(lista, prefixo, campo){
  let maior = 0;
  lista.forEach(item => {
    const m = String(item[campo]||'').match(/(\d+)$/);
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  });
  return maior;
}

function atualizarStatusBanco(estado, detalhe){
  const el = document.getElementById('db-status');
  const txt = document.getElementById('db-status-text');
  if (!el || !txt) return;
  el.classList.remove('online', 'offline');
  if (estado === 'online'){
    el.classList.add('online');
    txt.textContent = 'Conectado ao Supabase';
  } else {
    el.classList.add('offline');
    txt.textContent = 'Modo demonstração (não salva)';
  }
  if (detalhe) console.warn('[Supabase]', detalhe);
}

async function carregarDadosSupabase(){
  if (typeof supabaseClient === 'undefined' || !supabaseClient){
    atualizarStatusBanco('offline', 'Biblioteca do Supabase não carregou (sem internet ou CDN bloqueado).');
    return;
  }
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError){
      atualizarStatusBanco('offline', 'Erro ao checar sessão: ' + sessionError.message);
      return;
    }
    if (!sessionData || !sessionData.session){
      atualizarStatusBanco('offline', 'Sem sessão ativa — faça login pelo login.html antes de abrir o sistema.');
      return;
    }

    const [rc, rq, rl] = await Promise.all([
      supabaseClient.from('contratos').select('*'),
      supabaseClient.from('cotacoes').select('*'),
      supabaseClient.from('clientes').select('*'),
    ]);
    if (rc.error || rq.error || rl.error){
      const err = rc.error || rq.error || rl.error;
      atualizarStatusBanco('offline', 'Falha ao buscar dados: ' + err.message);
      showToast('Não foi possível carregar os dados do banco — veja o console (F12) para detalhes.');
      return; // mantém os dados de demonstração se algo falhar
    }

    CONTRATOS = rc.data.map(linhaParaContrato);
    COTACOES = rq.data.map(linhaParaCotacao);
    CLIENTES = rl.data.map(linhaParaCliente);
    DB_ATIVO = true;
    atualizarStatusBanco('online');

    contratoSeq = Math.max(contratoSeq, maiorSufixo(CONTRATOS, 'C-2026-', 'id'));
    cotacaoSeq = Math.max(cotacaoSeq, maiorSufixo(COTACOES, 'COT-', 'numero'));

    renderDashboardCompleto();
    popularFiltros();
    popularFiltrosCotacoes();
    renderContratos();
    renderCotacoes();
    renderClientes();
    if (typeof Intel !== 'undefined') Intel.aoCarregarBanco();
  } catch (e){
    atualizarStatusBanco('offline', 'Erro de conexão: ' + (e && e.message ? e.message : e));
    // sem internet ou Supabase fora do ar: o protótipo continua com os dados de demonstração
  }
}


function diasParaVencer(dataFim){
  const fim = new Date(dataFim);
  return Math.round((fim - HOJE) / 86400000);
}
function consumoPct(c){
  // com itens respondidos + vendas do SIG, usa o consumo real calculado (js/kpis.js)
  if (c._real && c._real.temItens && c._real.temVendas && c._real.pctConsumo != null) return c._real.pctConsumo;
  if (!c.qtdEstimada) return 0; return (c.qtdConsumida / c.qtdEstimada) * 100;
}

function statusSaude(c){
  const dias = diasParaVencer(c.dataFim);
  const pct = consumoPct(c);
  if (dias < 0) return 'Crítico';
  if (pct > PARAMS.consumoAlto) return 'Oportunidade';
  if (pct < PARAMS.consumoBaixo || dias <= PARAMS.diasAtencao || c.icmsDivergencia) return 'Atenção';
  if (pct >= PARAMS.consumoBaixo && pct <= PARAMS.consumoAlto) return 'Saudável';
  return 'Atenção';
}
function badgeClass(status){
  return {Saudável:'b-green', 'Atenção':'b-amber', 'Crítico':'b-red', Oportunidade:'b-indigo'}[status] || 'b-blue';
}
function barColor(pct){
  if (pct > PARAMS.consumoAlto) return 'var(--indigo-600)';
  if (pct < PARAMS.consumoBaixo) return 'var(--amber-500)';
  return 'var(--green-600)';
}
function acaoSugerida(c){
  const dias = diasParaVencer(c.dataFim);
  const s = statusSaude(c);
  const r = (PARAMS.regua || [120, 90, 60, 30]).slice().sort((a, b) => a - b);
  if (s === 'Crítico') return 'Bloquear/avaliar condição';
  if (dias <= r[0]) return 'Fechar renovação ou registrar perda';
  if (dias <= (r[1] || 60)) return 'Solicitar nova cotação';
  if (dias <= (r[2] || 90)) return 'Validar intenção de renovação';
  if (s === 'Atenção') return 'Revisar ICMS / baixo consumo';
  if (s === 'Oportunidade') return 'Revisar volume/preço';
  return 'Acompanhar';
}
function fmtBRL(v){ return v.toLocaleString('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0}); }
function fmtData(d){ return new Date(d).toLocaleDateString('pt-BR'); }

// ===================== RENDER: KPIs =====================
// ===================== FILTRO DO DASHBOARD (cliente ou grupo) =====================
function contratosFiltradosDashboard(){
  const el = document.getElementById('dash-filtro');
  const q = el ? el.value.trim().toLowerCase() : '';
  if (!q) return CONTRATOS;
  return CONTRATOS.filter(c =>
    c.cliente.toLowerCase().includes(q) || c.grupo.toLowerCase().includes(q) || (c.segmento||'').toLowerCase().includes(q)
  );
}

function renderDashboardCompleto(){
  renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList();
  renderSegmentoChart(); renderRankingVendedores();
  if (typeof Intel !== 'undefined') Intel.renderDashboard();
}

function renderKpis(){
  const base = contratosFiltradosDashboard();
  const ativos = base.filter(c => diasParaVencer(c.dataFim) >= 0).length;
  const aVencer90 = base.filter(c => { const d = diasParaVencer(c.dataFim); return d >= 0 && d <= PARAMS.diasAtencao; }).length;
  const acimaPrevisto = base.filter(c => consumoPct(c) > PARAMS.consumoAlto).length;
  const criticos = base.filter(c => statusSaude(c) === 'Crítico').length;

  const kpis = [
    {label:'Contratos ativos', value: ativos, sub: base.length + ' cadastrados no total', cls:'k-blue'},
    {label:'A vencer em ' + PARAMS.diasAtencao + ' dias', value: aVencer90, sub:'Régua ' + bucketsRegua().slice(0, -1).map(b => b.max).join(' / ') + ' dias', cls:'k-orange'},
    {label:'Consumo acima do previsto', value: acimaPrevisto, sub:'Oportunidade de reajuste', cls:'k-green'},
    {label:'Contratos críticos', value: criticos, sub:'Vencidos ou sem ação definida', cls:'k-red'},
  ];
  document.getElementById('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi ${k.cls}">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');
}

// ===================== RENDER: Régua de alertas =====================
function renderRegua(){
  const base = contratosFiltradosDashboard();
  const buckets = bucketsRegua();
  const html = buckets.map(b => {
    const count = base.filter(c => { const d = diasParaVencer(c.dataFim); return d >= b.min && d <= b.max; }).length;
    return `<div class="regua-step">
      <div class="node">${b.label === 'Vencido' ? '!' : b.label.split(' ')[0]}</div>
      <div class="count">${count}</div>
      <div class="step-label">${b.label}</div>
      <div class="step-owner">${b.owner}</div>
    </div>`;
  }).join('');
  document.getElementById('regua-track').innerHTML = html;
}

// ===================== RENDER: Visão diária =====================
function renderVisaoDiaria(){
  const base = contratosFiltradosDashboard();
  const lista = base
    .filter(c => diasParaVencer(c.dataFim) <= 30)
    .sort((a,b) => diasParaVencer(a.dataFim) - diasParaVencer(b.dataFim))
    .slice(0, 6);
  const tbody = document.querySelector('#tbl-diaria tbody');
  tbody.innerHTML = lista.map(c => {
    const s = statusSaude(c);
    return `<tr class="clickable" data-id="${c.id}">
      <td>${c.cliente}</td>
      <td>${fmtData(c.dataFim)}</td>
      <td><span class="badge ${badgeClass(s)}"><span class="dot"></span>${s}</span></td>
      <td>${acaoSugerida(c)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="color:var(--ink-500)">Nenhum contrato precisa de ação hoje.</td></tr>';
  attachRowClicks(tbody);
}

// ===================== RENDER: consumo por cliente =====================
function renderConsumoList(){
  const base = contratosFiltradosDashboard();
  const top = [...base].sort((a,b) => consumoPct(b) - consumoPct(a)).slice(0,5);

  if (!top.length){
    document.getElementById('consumo-list').innerHTML = '<div style="color:var(--ink-500); font-size:12.5px;">Nenhum contrato encontrado para esse filtro.</div>';
    return;
  }

  const escalaMax = Math.max(140, ...top.map(c => consumoPct(c)));
  document.getElementById('consumo-list').innerHTML = `<div class="consumo-chart">${top.map(c => {
    const pct = consumoPct(c);
    const alturaPct = Math.max(4, Math.min(pct, escalaMax) / escalaMax * 100);
    return `<div class="consumo-col">
      <div class="consumo-col-pct">${pct.toFixed(0)}%</div>
      <div class="consumo-col-bar-wrap">
        <div class="consumo-col-bar" style="height:${alturaPct}%; background:${barColor(pct)}"></div>
      </div>
      <div class="consumo-col-name">${c.cliente.split(' ')[0]}</div>
    </div>`;
  }).join('')}</div>`;
}

// ===================== RENDER: contratos por segmento =====================
function renderSegmentoChart(){
  const base = contratosFiltradosDashboard();
  const contagem = {};
  const clientesPorSegmento = {};
  base.forEach(c => {
    const seg = c.segmento || 'Sem segmento';
    contagem[seg] = (contagem[seg] || 0) + 1;
    if (!clientesPorSegmento[seg]) clientesPorSegmento[seg] = [];
    clientesPorSegmento[seg].push(c.cliente);
  });
  const dados = Object.entries(contagem).sort((a,b) => b[1] - a[1]).slice(0,6);

  if (!dados.length){
    document.getElementById('segmento-list').innerHTML = '<div style="color:var(--ink-500); font-size:12.5px;">Nenhum contrato encontrado para esse filtro.</div>';
    return;
  }

  const max = Math.max(...dados.map(d => d[1]));
  document.getElementById('segmento-list').innerHTML = `<div class="consumo-chart">${dados.map(([seg, qtd]) => {
    const alturaPct = Math.max(6, qtd / max * 100);
    const dica = clientesPorSegmento[seg].join('\n');
    return `<div class="consumo-col" title="${dica.replace(/"/g,'&quot;')}">
      <div class="consumo-col-pct">${qtd}</div>
      <div class="consumo-col-bar-wrap">
        <div class="consumo-col-bar" style="height:${alturaPct}%; background:var(--brand-500)"></div>
      </div>
      <div class="consumo-col-name">${seg}</div>
    </div>`;
  }).join('')}</div>`;
}

// ===================== RENDER: ranking de vendedores =====================
function renderRankingVendedores(){
  const base = contratosFiltradosDashboard();
  const contagem = {};
  const contratosPorVendedor = {};
  base.forEach(c => {
    if (diasParaVencer(c.dataFim) < 0) return; // só contratos ativos
    const v = c.vendedorInterno || 'Não informado';
    contagem[v] = (contagem[v] || 0) + 1;
    if (!contratosPorVendedor[v]) contratosPorVendedor[v] = [];
    contratosPorVendedor[v].push(c.cliente + ' (' + c.id + ')');
  });
  const dados = Object.entries(contagem).sort((a,b) => b[1] - a[1]).slice(0,5);

  if (!dados.length){
    document.getElementById('ranking-list').innerHTML = '<div style="color:var(--ink-500); font-size:12.5px;">Nenhum contrato ativo encontrado para esse filtro.</div>';
    return;
  }

  const max = Math.max(...dados.map(d => d[1]));
  document.getElementById('ranking-list').innerHTML = dados.map(([nome, qtd]) => {
    const dica = contratosPorVendedor[nome].join('\n');
    return `
    <div class="rank-row" title="${dica.replace(/"/g,'&quot;')}">
      <div class="rank-name">${nome}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${qtd/max*100}%; background:var(--brand-600)"></div></div>
      <div class="rank-count">${qtd}</div>
    </div>`;
  }).join('');
}

// ===================== RENDER: tabela de contratos =====================
function contratosFiltradosTabela(){
  const grupo = document.getElementById('f-grupo').value;
  const segmento = document.getElementById('f-segmento').value;
  const vendedor = document.getElementById('f-vendedor').value;
  const status = document.getElementById('f-status').value;
  const busca = document.getElementById('f-busca').value.toLowerCase();

  return CONTRATOS.filter(c => {
    if (grupo && c.grupo !== grupo) return false;
    if (segmento && c.segmento !== segmento) return false;
    if (vendedor && c.vendedorInterno !== vendedor) return false;
    if (status && statusSaude(c) !== status) return false;
    if (busca && !(c.cliente.toLowerCase().includes(busca) || c.id.toLowerCase().includes(busca))) return false;
    if (filtroRecebSelecionado.contratos.size > 0 && !filtroRecebSelecionado.contratos.has(chaveFiltroRecebimento(c.dataRecebimento))) return false;
    return true;
  });
}

let contratosSelecionados = new Set();

function renderContratos(){
  const linhas = contratosFiltradosTabela();
  contratosSelecionados = new Set([...contratosSelecionados].filter(id => linhas.some(c => c.id === id)));

  document.querySelector('#tbl-contratos tbody').innerHTML = linhas.map(c => {
    const s = statusSaude(c);
    const pct = consumoPct(c);
    const dias = diasParaVencer(c.dataFim);
    return `<tr class="clickable" data-id="${c.id}">
      <td class="col-check"><input type="checkbox" class="row-check" data-check-contrato="${c.id}" ${contratosSelecionados.has(c.id) ? 'checked' : ''}></td>
      <td>${c.cliente}</td>
      <td>${c.grupo}</td>
      <td>${c.segmento || '—'}</td>
      <td>${c.vendedorInterno}</td>
      <td>${c.dataRecebimento ? fmtData(c.dataRecebimento) : '—'}</td>
      <td>${fmtData(c.dataInicio)} – ${fmtData(c.dataFim)}</td>
      <td>${dias < 0 ? 'Vencido' : dias + ' dias'}</td>
      <td>${pct.toFixed(0)}%</td>
      <td><span class="badge ${badgeClass(s)}"><span class="dot"></span>${s}</span></td>
      <td class="col-acoes">
        <button type="button" class="icon-btn danger admin-only" data-del-contrato="${c.id}" title="Excluir contrato">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="11" style="color:var(--ink-500); padding:20px;">Nenhum contrato encontrado com esses filtros.</td></tr>';
  attachRowClicks(document.querySelector('#tbl-contratos tbody'));

  document.querySelectorAll('[data-check-contrato]').forEach(chk => {
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', () => {
      if (chk.checked) contratosSelecionados.add(chk.dataset.checkContrato);
      else contratosSelecionados.delete(chk.dataset.checkContrato);
      const todas = document.querySelectorAll('[data-check-contrato]');
      const marcadas = document.querySelectorAll('[data-check-contrato]:checked');
      const selAll = document.getElementById('chk-contratos-all');
      if (selAll) selAll.checked = todas.length > 0 && todas.length === marcadas.length;
    });
  });
  const selAllContratos = document.getElementById('chk-contratos-all');
  if (selAllContratos){
    selAllContratos.checked = linhas.length > 0 && contratosSelecionados.size === linhas.length;
    selAllContratos.onclick = () => {
      const marcar = selAllContratos.checked;
      linhas.forEach(c => { if (marcar) contratosSelecionados.add(c.id); else contratosSelecionados.delete(c.id); });
      document.querySelectorAll('[data-check-contrato]').forEach(chk => { chk.checked = marcar; });
    };
  }

  document.querySelectorAll('[data-del-contrato]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.delContrato;
      const alvo = CONTRATOS.find(c => c.id === id);
      const nomeAlvo = alvo ? alvo.cliente : id;
      showConfirm({
        title: 'Excluir contrato',
        message: `Tem certeza que deseja excluir o contrato de "${nomeAlvo}"? Essa ação não pode ser desfeita.`,
        onConfirm: async () => {
          if (DB_ATIVO){
            const { error } = await supabaseClient.from('contratos').delete().eq('id', id);
            if (error){ showToast('Não foi possível excluir no banco: ' + error.message); return; }
          }
          CONTRATOS = CONTRATOS.filter(c => c.id !== id);
          renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList(); renderContratos();
          showToast('Contrato de "' + nomeAlvo + '" excluído');
        }
      });
    });
  });
}

// ===================== FILTRO: Data de recebimento (multi-seleção) =====================
// Mesmo visual dos outros filtros (um box com seta, igual um <select>), mas
// abre uma lista com caixinhas de marcar — permite escolher quantos meses quiser.
const VALOR_SEM_DATA_RECEB = '__sem-data__';
const filtroRecebSelecionado = { contratos: new Set(), cotacoes: new Set() };

function chaveMesAno(dataISO){
  return dataISO ? String(dataISO).slice(0,7) : '';
}
// datas vazias viram um valor sentinela, pra dar pra marcar "Sem data" como opção própria
function chaveFiltroRecebimento(dataISO){
  return chaveMesAno(dataISO) || VALOR_SEM_DATA_RECEB;
}
function labelMesAno(chave){
  if (!chave || chave === VALOR_SEM_DATA_RECEB) return 'Sem data';
  const [ano, mes] = chave.split('-');
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  const txt = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function popularMultiselectRecebimento(tipo){
  const dados = tipo === 'contratos' ? CONTRATOS : COTACOES;
  const contagem = new Map();
  dados.forEach(item => {
    const chave = chaveFiltroRecebimento(item.dataRecebimento);
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  });
  const chaves = [...contagem.keys()].sort((a, b) => {
    if (a === VALOR_SEM_DATA_RECEB) return 1;
    if (b === VALOR_SEM_DATA_RECEB) return -1;
    return b.localeCompare(a);
  });

  // mantém só as seleções que ainda existem nos dados atuais
  filtroRecebSelecionado[tipo] = new Set([...filtroRecebSelecionado[tipo]].filter(k => contagem.has(k)));

  const lista = document.getElementById(`ms-receb-${tipo}-list`);
  if (lista){
    if (chaves.length === 0){
      lista.innerHTML = '<div class="ms-empty">Nenhuma data de recebimento cadastrada.</div>';
    } else {
      lista.innerHTML = chaves.map(chave => {
        const id = `ms-${tipo}-${chave}`;
        const marcado = filtroRecebSelecionado[tipo].has(chave);
        return `<label class="ms-item" for="${id}">
          <input type="checkbox" id="${id}" data-ms-valor="${chave}" ${marcado ? 'checked' : ''}>
          <span class="ms-item-label">${labelMesAno(chave)}</span>
          <span class="ms-item-n">${contagem.get(chave)}</span>
        </label>`;
      }).join('');
    }
    lista.querySelectorAll('input[data-ms-valor]').forEach(chk => {
      chk.addEventListener('change', () => {
        const valor = chk.dataset.msValor;
        if (chk.checked) filtroRecebSelecionado[tipo].add(valor);
        else filtroRecebSelecionado[tipo].delete(valor);
        atualizarLabelMultiselect(tipo);
        if (tipo === 'contratos') renderContratos(); else renderCotacoes();
      });
    });
  }

  atualizarLabelMultiselect(tipo);
}

function atualizarLabelMultiselect(tipo){
  const n = filtroRecebSelecionado[tipo].size;
  const btn = document.getElementById(`ms-receb-${tipo}-btn`);
  const label = document.getElementById(`ms-receb-${tipo}-label`);
  if (btn) btn.classList.toggle('is-active', n > 0);
  if (label){
    if (n === 0) label.textContent = 'Data recebimento';
    else if (n === 1) label.textContent = labelMesAno([...filtroRecebSelecionado[tipo]][0]);
    else label.textContent = n + ' selecionadas';
  }
}

function fecharMultiselects(){
  ['contratos', 'cotacoes'].forEach(tipo => {
    const panel = document.getElementById(`ms-receb-${tipo}-panel`);
    if (panel) panel.hidden = true;
  });
}

function wireMultiselect(tipo){
  const btn = document.getElementById(`ms-receb-${tipo}-btn`);
  const panel = document.getElementById(`ms-receb-${tipo}-panel`);
  if (!btn || !panel || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = panel.hidden;
    fecharMultiselects();
    if (abrir) panel.hidden = false;
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  const btnFechar = document.querySelector(`[data-ms-close="${tipo}"]`);
  if (btnFechar) btnFechar.addEventListener('click', () => fecharMultiselects());
  const btnTodos = document.querySelector(`[data-ms-all="${tipo}"]`);
  const btnLimpar = document.querySelector(`[data-ms-clear="${tipo}"]`);
  if (btnTodos) btnTodos.addEventListener('click', () => {
    const dados = tipo === 'contratos' ? CONTRATOS : COTACOES;
    filtroRecebSelecionado[tipo] = new Set(dados.map(item => chaveFiltroRecebimento(item.dataRecebimento)));
    popularMultiselectRecebimento(tipo);
    if (tipo === 'contratos') renderContratos(); else renderCotacoes();
  });
  if (btnLimpar) btnLimpar.addEventListener('click', () => {
    filtroRecebSelecionado[tipo] = new Set();
    popularMultiselectRecebimento(tipo);
    if (tipo === 'contratos') renderContratos(); else renderCotacoes();
  });
}
document.addEventListener('click', () => fecharMultiselects());
wireMultiselect('contratos');
wireMultiselect('cotacoes');

function popularFiltros(){
  const grupos = [...new Set(CONTRATOS.map(c => c.grupo))];
  const segmentos = [...new Set(CONTRATOS.map(c => c.segmento).filter(Boolean))];
  const vendedores = [...new Set(CONTRATOS.map(c => c.vendedorInterno))];
  const statuses = ['Saudável','Atenção','Crítico','Oportunidade'];
  const fill = (id, arr) => {
    const el = document.getElementById(id);
    // mantém só a primeira opção (o placeholder "Todos") e recria o resto —
    // assim dá pra chamar de novo quando os dados do Supabase chegarem
    while (el.options.length > 1) el.remove(1);
    arr.forEach(v => { const o = document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); });
  };
  fill('f-grupo', grupos);
  fill('f-segmento', segmentos);
  fill('f-vendedor', vendedores);
  fill('f-status', statuses);
  popularMultiselectRecebimento('contratos');
  ['f-grupo','f-segmento','f-vendedor','f-status'].forEach(id => document.getElementById(id).addEventListener('change', renderContratos));
  document.getElementById('f-busca').addEventListener('input', renderContratos);
}

function popularFiltrosCotacoes(){
  const tipos = ['Cliente novo','Renovação'];
  const statuses = ['Ativo','Em negociação','Renovado','Perdido'];
  const fill = (id, arr) => {
    const el = document.getElementById(id);
    while (el.options.length > 1) el.remove(1);
    arr.forEach(v => { const o = document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); });
  };
  fill('fc-tipo', tipos);
  fill('fc-status', statuses);
  popularMultiselectRecebimento('cotacoes');
  ['fc-tipo','fc-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el.dataset.wired){ el.addEventListener('change', renderCotacoes); el.dataset.wired = '1'; }
  });
  const busca = document.getElementById('fc-busca');
  if (!busca.dataset.wired){ busca.addEventListener('input', renderCotacoes); busca.dataset.wired = '1'; }
}

// ===================== RENDER: cotações =====================
function statusCotClass(s){
  return {Ativo:'b-blue', Renovado:'b-green', Perdido:'b-red', 'Em negociação':'b-amber'}[s] || 'b-blue';
}
function pctCotacao(c){
  if (!c.itensEstimados) return 0;
  return (c.itensCotados / c.itensEstimados) * 100;
}
function cotacoesFiltradasTabela(){
  const fTipo = document.getElementById('fc-tipo').value;
  const fStatus = document.getElementById('fc-status').value;
  const fBusca = document.getElementById('fc-busca').value.toLowerCase();

  return COTACOES.filter(c => {
    if (fTipo && c.tipo !== fTipo) return false;
    if (fStatus && c.status !== fStatus) return false;
    if (fBusca && !(c.cliente.toLowerCase().includes(fBusca) || c.numero.toLowerCase().includes(fBusca))) return false;
    if (filtroRecebSelecionado.cotacoes.size > 0 && !filtroRecebSelecionado.cotacoes.has(chaveFiltroRecebimento(c.dataRecebimento))) return false;
    return true;
  });
}

let cotacoesSelecionadas = new Set();

function renderCotacoes(){
  const linhas = cotacoesFiltradasTabela();
  cotacoesSelecionadas = new Set([...cotacoesSelecionadas].filter(num => linhas.some(c => c.numero === num)));

  document.querySelector('#tbl-cotacoes tbody').innerHTML = linhas.map(c => {
    const pct = pctCotacao(c);
    const motivo = c.motivo || '—';
    return `
    <tr class="clickable" data-numero="${c.numero}">
      <td class="col-check"><input type="checkbox" class="row-check" data-check-cotacao="${c.numero}" ${cotacoesSelecionadas.has(c.numero) ? 'checked' : ''}></td>
      <td>${c.cliente}</td>
      <td><span class="badge ${statusCotClass(c.status)}"><span class="dot"></span>${c.status}</span></td>
      <td>${c.tipo}</td>
      <td>${c.dataRecebimento ? fmtData(c.dataRecebimento) : '—'}</td>
      <td>${c.dataEnvio ? fmtData(c.dataEnvio) : '—'}</td>
      <td>${(c.itensEstimados||0).toLocaleString('pt-BR')}</td>
      <td>${(c.itensCotados||0).toLocaleString('pt-BR')}</td>
      <td>${pct.toFixed(0)}%</td>
      <td>${fmtBRL(c.valorEstimado)}</td>
      <td>${fmtBRL(c.valorCotado)}</td>
      <td class="col-motivo" title="${motivo.replace(/"/g,'&quot;')}">${motivo}</td>
      <td class="col-acoes">
        <button type="button" class="icon-btn danger admin-only" data-del-cotacao="${c.numero}" title="Excluir cotação">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="13" style="color:var(--ink-500); padding:20px;">Nenhuma cotação encontrada com esses filtros.</td></tr>';

  document.querySelectorAll('#tbl-cotacoes tbody tr[data-numero]').forEach(tr => {
    tr.addEventListener('click', () => openCotacaoDetalhe(tr.dataset.numero));
  });

  document.querySelectorAll('[data-check-cotacao]').forEach(chk => {
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', () => {
      if (chk.checked) cotacoesSelecionadas.add(chk.dataset.checkCotacao);
      else cotacoesSelecionadas.delete(chk.dataset.checkCotacao);
      const todas = document.querySelectorAll('[data-check-cotacao]');
      const marcadas = document.querySelectorAll('[data-check-cotacao]:checked');
      const selAll = document.getElementById('chk-cotacoes-all');
      if (selAll) selAll.checked = todas.length > 0 && todas.length === marcadas.length;
    });
  });
  const selAllCotacoes = document.getElementById('chk-cotacoes-all');
  if (selAllCotacoes){
    selAllCotacoes.checked = linhas.length > 0 && cotacoesSelecionadas.size === linhas.length;
    selAllCotacoes.onclick = () => {
      const marcar = selAllCotacoes.checked;
      linhas.forEach(c => { if (marcar) cotacoesSelecionadas.add(c.numero); else cotacoesSelecionadas.delete(c.numero); });
      document.querySelectorAll('[data-check-cotacao]').forEach(chk => { chk.checked = marcar; });
    };
  }

  document.querySelectorAll('[data-del-cotacao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const numero = btn.dataset.delCotacao;
      showConfirm({
        title: 'Excluir cotação',
        message: `Tem certeza que deseja excluir a cotação ${numero}? Essa ação não pode ser desfeita.`,
        onConfirm: async () => {
          if (DB_ATIVO){
            const { error } = await supabaseClient.from('cotacoes').delete().eq('numero', numero);
            if (error){ showToast('Não foi possível excluir no banco: ' + error.message); return; }
          }
          COTACOES = COTACOES.filter(c => c.numero !== numero);
          renderCotacoes();
          showToast('Cotação ' + numero + ' excluída');
        }
      });
    });
  });
}

// ===================== RENDER: fiscal =====================
function renderFiscal(){
  // A tabela de NCM/ICMS foi removida da tela de Planilhas — mantido como
  // no-op para não quebrar as chamadas existentes em outros pontos do app.
  const tbody = document.querySelector('#tbl-fiscal tbody');
  if (!tbody) return;
}

// ===================== PLANILHAS DE CONTRATOS (upload Excel) =====================
// Guardadas só nesta sessão do navegador (memória) — dá pra trocar por
// Supabase Storage depois, mantendo a mesma lista/ordenação.
let PLANILHAS = [];
let planilhaSeq = 0;

function fmtBytes(bytes){
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}
function fmtDataHora(d){
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}
function extDe(nome){
  const m = /\.([a-z0-9]+)$/i.exec(nome);
  return m ? m[1].toUpperCase() : '?';
}

function addPlanilhas(fileList){
  const permitido = /\.(xlsx|xls|csv)$/i;
  let ignorados = 0;
  Array.from(fileList).forEach(file => {
    if (!permitido.test(file.name)){ ignorados++; return; }
    planilhaSeq++;
    PLANILHAS.push({
      id: 'pl-' + planilhaSeq,
      name: file.name,
      size: file.size,
      uploadedAt: new Date(),
      url: URL.createObjectURL(file)
    });
  });
  renderPlanilhas();
  const enviados = fileList.length - ignorados;
  if (enviados > 0) showToast(enviados === 1 ? '1 planilha enviada com sucesso' : enviados + ' planilhas enviadas com sucesso');
  if (ignorados > 0) showToast(ignorados + ' arquivo(s) ignorado(s) — só .xlsx, .xls ou .csv');
}

function removePlanilha(id){
  const item = PLANILHAS.find(p => p.id === id);
  if (item){ URL.revokeObjectURL(item.url); }
  PLANILHAS = PLANILHAS.filter(p => p.id !== id);
  renderPlanilhas();
}

function renderPlanilhas(){
  const buscaEl = document.getElementById('f-planilha-busca');
  const busca = buscaEl ? buscaEl.value.trim().toLowerCase() : '';
  const lista = PLANILHAS
    .filter(p => p.name.toLowerCase().includes(busca))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR', {sensitivity:'base'}));

  const container = document.getElementById('file-list');
  const empty = document.getElementById('file-list-empty');

  if (lista.length === 0){
    container.innerHTML = `<div class="file-list-empty" id="file-list-empty">${
      PLANILHAS.length === 0 ? 'Nenhuma planilha enviada ainda.' : 'Nenhum arquivo encontrado com esse nome.'
    }</div>`;
    return;
  }

  container.innerHTML = lista.map(p => {
    const ext = extDe(p.name);
    const extClass = ext === 'CSV' ? 'ext-csv' : '';
    return `<div class="file-row">
      <div class="file-ext ${extClass}">${ext}</div>
      <div class="file-info">
        <div class="fname">${p.name}</div>
        <div class="fmeta">${fmtBytes(p.size)} · enviado em ${fmtDataHora(p.uploadedAt)}</div>
      </div>
      <div class="file-actions">
        <a href="${p.url}" download="${p.name}" title="Baixar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>
        </a>
        <button type="button" class="admin-only" data-remove="${p.id}" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removePlanilha(btn.dataset.remove));
  });
}

// ===================== IMPORTAR PLANILHA OFICIAL (Contratos + Cotações) =====================
function normalizarTexto(txt){
  return String(txt||'')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function localizarColunas(headerRow, aliasMap){
  const normalizados = (headerRow||[]).map(normalizarTexto);
  const mapa = {};
  for (const campo in aliasMap){
    let idx = -1;
    for (const alias of aliasMap[campo]){
      idx = normalizados.indexOf(normalizarTexto(alias));
      if (idx !== -1) break;
    }
    mapa[campo] = idx;
  }
  return mapa;
}

function valorColuna(row, mapa, campo){
  const idx = mapa[campo];
  if (idx === undefined || idx === -1) return null;
  const v = row[idx];
  return (v === undefined || v === '') ? null : v;
}

function paraDataISO(v){
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date){
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0,10);
  }
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

function paraNumero(v){
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function inferirStatusCotacao(obs){
  const t = normalizarTexto(obs);
  if (!t) return 'Ativo';
  if (t.includes('RENOVADO')) return 'Renovado';
  if (t.includes('PERDID') || t.includes('NAO ENVIADO') || t.includes('CANCELAD')) return 'Perdido';
  if (t.includes('AGUARDANDO') || t.includes('NEGOCIA') || t.includes('BID') || t.includes('PREENCHENDO') || t.includes('ENVIADO')) return 'Em negociação';
  return 'Ativo';
}

function inferirTipoCotacao(v){
  const t = normalizarTexto(v);
  if (t === 'NOVO') return 'Cliente novo';
  if (t === 'RENOVACAO') return 'Renovação';
  return 'Renovação';
}

const MAPA_CONTRATOS_COLUNAS = {
  cliente: ['CLIENTE'],
  vendedor: ['VENDEDOR'],
  periodo: ['PERIODO'],
  segmento: ['SEGMENTO'],
  dataInicio: ['DATA INICIAL'],
  dataFim: ['DATA DO VENCIMENTO','DATA VENCIMENTO'],
  status: ['STATUS'],
  dataReajuste: ['DATA REAJUSTE'],
  situacao: ['SITUACAO'],
  observacao: ['OBSERVACAO'],
};

const MAPA_COTACOES_COLUNAS = {
  cliente: ['CLIENTE'],
  internos: ['INTERNOS'],
  externos: ['EXTERNOS'],
  tipo: ['TIPO'],
  segmento: ['SEGMENTO'],
  dataRecebimento: ['DATA RECEBIMENTO'],
  dataEnvio: ['DATA RETORNO'],
  itensEstimados: ['TOTAL DE ITENS (ESTIMADO)','TOTAL DE ITENS (ESTIMADOS)'],
  itensCotados: ['TOTAL DE ITENS (COTADOS)','COTADOS TOTAL'],
  valorCotado: ['R$ COTADOS TOTAL C/ ICMS','R$TOTAL DE ITENS','R$ TOTAL DE ITENS'],
  itensVencidos: ['TOTAL DE ITENS (VENCIDOS)'],
  valorVencidoEstimado: ['R$ TOTAL ESTIMADO (VENCIDOS)'],
  observacao: ['OBSERVACAO'],
  dataUltimaAtualizacao: ['DATA ULTIMA ATUALIZACAO'],
};

function encontrarLinhaCabecalho(matriz, colunaChave){
  for (let i=0; i<Math.min(matriz.length, 15); i++){
    const normalizados = (matriz[i]||[]).map(normalizarTexto);
    if (normalizados.includes(normalizarTexto(colunaChave))) return i;
  }
  return -1;
}

async function processarPlanilhaOficial(file){
  const resultadoEl = document.getElementById('importar-resultado');
  resultadoEl.innerHTML = '<p style="color:var(--ink-500); font-size:12.5px; margin-top:12px;">Lendo planilha...</p>';

  let wb;
  try {
    const buffer = await file.arrayBuffer();
    wb = XLSX.read(buffer, { type:'array', cellDates:true });
  } catch (e){
    resultadoEl.innerHTML = '<p style="color:var(--red-600); font-size:12.5px; margin-top:12px;">Não foi possível abrir o arquivo. Confirme que é um .xlsx válido.</p>';
    return;
  }

  const novosContratos = [];
  const novasCotacoes = [];
  const abasEncontradas = [];
  const abasEsperadas = ['Controle_Contratos','Controle_Cotações_2025','Controle_Cotações_2026'];

  for (const nomeAba of abasEsperadas){
    const sheet = wb.Sheets[nomeAba];
    if (!sheet) continue;
    const matriz = XLSX.utils.sheet_to_json(sheet, { header:1, raw:true, defval:null });

    if (nomeAba === 'Controle_Contratos'){
      const linhaCab = encontrarLinhaCabecalho(matriz, 'CLIENTE');
      if (linhaCab === -1) continue;
      abasEncontradas.push(nomeAba);
      const mapa = localizarColunas(matriz[linhaCab], MAPA_CONTRATOS_COLUNAS);
      for (let i=linhaCab+1; i<matriz.length; i++){
        const row = matriz[i];
        const cliente = valorColuna(row, mapa, 'cliente');
        if (!cliente) continue;
        contratoSeq++;
        novosContratos.push({
          id:'C-2026-'+String(contratoSeq).padStart(3,'0'),
          cliente: String(cliente).slice(0,150),
          grupo: String(cliente).slice(0,100),
          unidade: '—', uf: null,
          segmento: String(valorColuna(row,mapa,'segmento')||'—').slice(0,60),
          quantidadeItens: 0, itensCotados: 0, valorCotado: 0, itensVencidos: 0,
          vendedorInterno: valorColuna(row,mapa,'vendedor') || '—',
          vendedorExterno: '—', gerente: '—',
          dataInicio: paraDataISO(valorColuna(row,mapa,'dataInicio')) || HOJE.toISOString().slice(0,10),
          dataFim: paraDataISO(valorColuna(row,mapa,'dataFim')) || HOJE.toISOString().slice(0,10),
          valorContratado: 0, qtdEstimada: 0, qtdConsumida: 0,
          ncm: '—', icmsDivergencia: false,
          periodo: valorColuna(row,mapa,'periodo'),
          dataReajuste: paraDataISO(valorColuna(row,mapa,'dataReajuste')),
          situacao: valorColuna(row,mapa,'situacao'),
          observacao: valorColuna(row,mapa,'observacao'),
          statusPlanilha: valorColuna(row,mapa,'status'),
        });
      }
    }

    if (nomeAba === 'Controle_Cotações_2025' || nomeAba === 'Controle_Cotações_2026'){
      const linhaCab = encontrarLinhaCabecalho(matriz, 'CLIENTE');
      if (linhaCab === -1) continue;
      abasEncontradas.push(nomeAba);
      const mapa = localizarColunas(matriz[linhaCab], MAPA_COTACOES_COLUNAS);
      for (let i=linhaCab+1; i<matriz.length; i++){
        const row = matriz[i];
        const cliente = valorColuna(row, mapa, 'cliente');
        if (!cliente) continue;
        cotacaoSeq++;
        const itensEstimados = paraNumero(valorColuna(row,mapa,'itensEstimados'));
        const itensCotados = paraNumero(valorColuna(row,mapa,'itensCotados'));
        const valorCotado = paraNumero(valorColuna(row,mapa,'valorCotado'));
        const valorEstimado = itensCotados > 0 ? Math.round(valorCotado * (itensEstimados/itensCotados)) : valorCotado;
        const dataRecebimento = paraDataISO(valorColuna(row,mapa,'dataRecebimento')) || HOJE.toISOString().slice(0,10);
        const vVencidos = valorColuna(row,mapa,'itensVencidos');
        const vValorVencido = valorColuna(row,mapa,'valorVencidoEstimado');
        novasCotacoes.push({
          numero: 'COT-'+cotacaoSeq,
          cliente: String(cliente).slice(0,150),
          tipo: inferirTipoCotacao(valorColuna(row,mapa,'tipo')),
          dataRecebimento,
          dataEnvio: paraDataISO(valorColuna(row,mapa,'dataEnvio')) || dataRecebimento,
          itensEstimados, itensCotados, valorEstimado, valorCotado,
          valorContrato: 0,
          status: inferirStatusCotacao(valorColuna(row,mapa,'observacao')),
          motivo: valorColuna(row,mapa,'observacao') || '—',
          internos: valorColuna(row,mapa,'internos'),
          externos: valorColuna(row,mapa,'externos'),
          itensVencidos: vVencidos!=null ? paraNumero(vVencidos) : null,
          valorVencidoEstimado: vValorVencido!=null ? paraNumero(vValorVencido) : null,
          dataUltimaAtualizacao: paraDataISO(valorColuna(row,mapa,'dataUltimaAtualizacao')),
        });
      }
    }
  }

  if (!abasEncontradas.length){
    resultadoEl.innerHTML = '<p style="color:var(--red-600); font-size:12.5px; margin-top:12px;">Nenhuma das abas esperadas (Controle_Contratos, Controle_Cotações_2025/2026) foi encontrada nesse arquivo.</p>';
    return;
  }

  if (DB_ATIVO){
    if (novosContratos.length){
      const { error } = await supabaseClient.from('contratos').insert(novosContratos.map(contratoParaLinha));
      if (error){
        resultadoEl.innerHTML = '<p style="color:var(--red-600); font-size:12.5px; margin-top:12px;">Erro ao salvar contratos no banco: ' + error.message + '</p>';
        return;
      }
    }
    if (novasCotacoes.length){
      const { error } = await supabaseClient.from('cotacoes').insert(novasCotacoes.map(cotacaoParaLinha));
      if (error){
        resultadoEl.innerHTML = '<p style="color:var(--red-600); font-size:12.5px; margin-top:12px;">Erro ao salvar cotações no banco: ' + error.message + '</p>';
        return;
      }
    }
  }

  CONTRATOS.push(...novosContratos);
  COTACOES.push(...novasCotacoes);
  const novosClientes = await sincronizarClientesFaltantes();

  renderDashboardCompleto();
  popularFiltros(); popularFiltrosCotacoes();
  renderContratos(); renderCotacoes(); renderFiscal(); renderClientes();

  resultadoEl.innerHTML = `<div class="note" style="margin-top:12px;">
    <b>Importação concluída.</b> Abas lidas: ${abasEncontradas.join(', ')}.<br>
    ${novosContratos.length} contrato(s) e ${novasCotacoes.length} cotação(ões) adicionados ${DB_ATIVO ? 'e salvos no banco' : '(modo demonstração — não salvo no banco)'}.
    ${novosClientes ? '<br>' + novosClientes + ' cliente(s) novo(s) cadastrado(s) automaticamente em "Clientes & grupos".' : ''}
  </div>`;
  showToast(novosContratos.length + ' contratos e ' + novasCotacoes.length + ' cotações importados');
}

// ===================== SINCRONIZAR CLIENTES (a partir de contratos/cotações) =====================
// Cria automaticamente na tela "Clientes & grupos" qualquer cliente que já
// apareça em Contratos ou Cotações mas ainda não tenha cadastro próprio —
// preenchendo Grupo, Unidade e Vendedor principal com o que der pra aproveitar.
async function sincronizarClientesFaltantes(){
  const existentes = new Set(CLIENTES.map(cl => cl.cliente));
  const infoPorCliente = {}; // cliente -> {grupo, unidade, vendedor}

  CONTRATOS.forEach(c => {
    if (!c.cliente || existentes.has(c.cliente) || infoPorCliente[c.cliente]) return;
    infoPorCliente[c.cliente] = {
      grupo: c.grupo || c.cliente,
      unidade: (c.unidade && c.unidade !== '—') ? c.unidade : null,
      vendedor: (c.vendedorInterno && c.vendedorInterno !== '—') ? c.vendedorInterno : null,
    };
  });
  COTACOES.forEach(c => {
    if (!c.cliente || existentes.has(c.cliente) || infoPorCliente[c.cliente]) return;
    infoPorCliente[c.cliente] = {
      grupo: c.cliente,
      unidade: null,
      vendedor: c.internos || null,
    };
  });

  const novos = Object.entries(infoPorCliente).map(([cliente, info]) => ({
    cliente: cliente.slice(0,150),
    grupo: (info.grupo || cliente).slice(0,100),
    unidades: info.unidade || '—',
    comprador: '—',
    vendedorPrincipal: info.vendedor || null,
  }));

  if (!novos.length) return 0;

  if (DB_ATIVO){
    const { data, error } = await supabaseClient.from('clientes').insert(novos.map(clienteParaLinha)).select();
    if (error){ console.error('[Sincronizar clientes]', error.message); return 0; }
    CLIENTES.push(...data.map(linhaParaCliente));
  } else {
    CLIENTES.push(...novos);
  }
  return novos.length;
}

function setupImportarPlanilhaOficial(){
  const input = document.getElementById('file-input-importar');
  const dropzone = document.getElementById('dropzone-importar');
  if (!input || !dropzone) return;
  input.addEventListener('change', () => {
    if (input.files.length) processarPlanilhaOficial(input.files[0]);
    input.value = '';
  });
  ['dragenter','dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files.length) processarPlanilhaOficial(e.dataTransfer.files[0]);
  });
}

function setupUploadPlanilhas(){
  const input = document.getElementById('file-input');
  const dropzone = document.getElementById('dropzone');
  const busca = document.getElementById('f-planilha-busca');
  if (!input || !dropzone) return;

  input.addEventListener('change', () => {
    if (input.files.length) addPlanilhas(input.files);
    input.value = '';
  });

  ['dragenter','dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) addPlanilhas(e.dataTransfer.files);
  });

  if (busca) busca.addEventListener('input', renderPlanilhas);

  renderPlanilhas();
}

// ===================== RENDER: clientes =====================
let clientesSelecionados = new Set();

function renderClientes(){
  const busca = (document.getElementById('fcl-busca')?.value || '').toLowerCase();
  const linhas = CLIENTES.filter(cl => {
    if (!busca) return true;
    return cl.cliente.toLowerCase().includes(busca) || (cl.grupo||'').toLowerCase().includes(busca);
  });
  clientesSelecionados = new Set([...clientesSelecionados].filter(nome => linhas.some(cl => cl.cliente === nome)));

  document.querySelector('#tbl-clientes tbody').innerHTML = linhas.map(cl => {
    const ativos = CONTRATOS.filter(c => c.cliente === cl.cliente && diasParaVencer(c.dataFim) >= 0).length;
    return `<tr>
      <td class="col-check"><input type="checkbox" class="row-check" data-check-cliente="${cl.cliente}" ${clientesSelecionados.has(cl.cliente) ? 'checked' : ''}></td>
      <td>${cl.cliente}</td>
      <td>${cl.grupo}</td>
      <td>${cl.unidades}</td>
      <td>${cl.comprador}</td>
      <td>${cl.vendedorPrincipal || '—'}</td>
      <td>${ativos}</td>
      <td class="col-acoes">
        <button type="button" class="icon-btn danger admin-only" data-del-cliente="${cl.cliente}" title="Excluir cliente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="color:var(--ink-500); padding:20px;">Nenhum cliente encontrado.</td></tr>';

  document.querySelectorAll('[data-check-cliente]').forEach(chk => {
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', () => {
      if (chk.checked) clientesSelecionados.add(chk.dataset.checkCliente);
      else clientesSelecionados.delete(chk.dataset.checkCliente);
      const todas = document.querySelectorAll('[data-check-cliente]');
      const marcadas = document.querySelectorAll('[data-check-cliente]:checked');
      const selAll = document.getElementById('chk-clientes-all');
      if (selAll) selAll.checked = todas.length > 0 && todas.length === marcadas.length;
    });
  });
  const selAllClientes = document.getElementById('chk-clientes-all');
  if (selAllClientes){
    selAllClientes.checked = linhas.length > 0 && clientesSelecionados.size === linhas.length;
    selAllClientes.onclick = () => {
      const marcar = selAllClientes.checked;
      linhas.forEach(cl => { if (marcar) clientesSelecionados.add(cl.cliente); else clientesSelecionados.delete(cl.cliente); });
      document.querySelectorAll('[data-check-cliente]').forEach(chk => { chk.checked = marcar; });
    };
  }

  document.querySelectorAll('[data-del-cliente]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nome = btn.dataset.delCliente;
      showConfirm({
        title: 'Excluir cliente',
        message: `Tem certeza que deseja excluir "${nome}"? Os contratos já cadastrados para esse cliente não serão apagados.`,
        onConfirm: async () => {
          if (DB_ATIVO){
            const { error } = await supabaseClient.from('clientes').delete().eq('cliente', nome);
            if (error){ showToast('Não foi possível excluir no banco: ' + error.message); return; }
          }
          CLIENTES = CLIENTES.filter(c => c.cliente !== nome);
          renderClientes();
          showToast('Cliente "' + nome + '" excluído');
        }
      });
    });
  });
}

// ===================== RENDER: usuários (só admin) =====================
async function renderUsuarios(){
  const tbody = document.querySelector('#tbl-usuarios tbody');
  if (!DB_ATIVO){
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--ink-500); padding:20px;">Conecte ao Supabase (faça login de verdade) para gerenciar usuários.</td></tr>';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--ink-500); padding:20px;">Carregando...</td></tr>';

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const meuEmail = sessionData && sessionData.session && sessionData.session.user && sessionData.session.user.email;

  const { data, error } = await supabaseClient.from('perfis').select('*').order('created_at', { ascending: true });
  if (error){
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--ink-500); padding:20px;">Não foi possível carregar os usuários — veja o console (F12).</td></tr>';
    console.error('[Usuários]', error.message);
    return;
  }

  tbody.innerHTML = data.map(u => {
    const isAdmin = u.papel === 'admin';
    const souEu = u.email === meuEmail;
    return `<tr>
      <td>${u.email}${souEu ? ' <span style="color:var(--ink-500); font-size:12px;">(você)</span>' : ''}</td>
      <td><span class="badge ${isAdmin ? 'b-blue' : 'b-amber'}"><span class="dot"></span>${isAdmin ? 'Admin · acesso total' : 'Gerente · somente leitura'}</span></td>
      <td>${u.created_at ? fmtData(u.created_at.slice(0,10)) : '—'}</td>
      <td class="col-acoes">
        <button type="button" class="btn btn-ghost" data-toggle-papel="${u.id}" data-papel-atual="${u.papel}" data-email="${u.email}" style="padding:6px 12px; font-size:12.5px;">
          ${isAdmin ? 'Rebaixar a gerente' : 'Promover a admin'}
        </button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="color:var(--ink-500); padding:20px;">Nenhum usuário encontrado.</td></tr>';

  document.querySelectorAll('[data-toggle-papel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.togglePapel;
      const atual = btn.dataset.papelAtual;
      const novoPapel = atual === 'admin' ? 'gerente' : 'admin';
      const email = btn.dataset.email;
      const souEuMesmo = email === meuEmail;
      showConfirm({
        title: novoPapel === 'admin' ? 'Promover a admin' : 'Rebaixar a gerente',
        message: souEuMesmo
          ? `Você está prestes a mudar o SEU PRÓPRIO acesso para "${novoPapel}". Se rebaixar a si mesmo, perde o acesso de admin imediatamente. Continuar?`
          : `Confirma que "${email}" deve virar "${novoPapel === 'admin' ? 'admin (acesso total)' : 'gerente (somente leitura)'}"?`,
        onConfirm: async () => {
          const { error } = await supabaseClient.from('perfis').update({ papel: novoPapel }).eq('id', id);
          if (error){ showToast('Não foi possível atualizar: ' + error.message); return; }
          showToast('Usuário atualizado com sucesso');
          renderUsuarios();
        }
      });
    });
  });
}

// ===================== RENDER: histórico de alterações (só admin) =====================
const acaoInfo = {
  insert: {label:'Criou', cls:'b-green'},
  update: {label:'Editou', cls:'b-amber'},
  delete: {label:'Excluiu', cls:'b-red'},
};
const tabelaLabel = { contratos:'Contrato', cotacoes:'Cotação', clientes:'Cliente' };

async function renderHistorico(){
  const tbody = document.querySelector('#tbl-historico tbody');
  if (!DB_ATIVO){
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-500); padding:20px;">Conecte ao Supabase (faça login de verdade) para ver o histórico.</td></tr>';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-500); padding:20px;">Carregando...</td></tr>';

  const { data, error } = await supabaseClient
    .from('auditoria')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (error){
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-500); padding:20px;">Não foi possível carregar o histórico — veja o console (F12).</td></tr>';
    console.error('[Histórico]', error.message);
    return;
  }

  tbody.innerHTML = data.map(r => {
    const a = acaoInfo[r.acao] || {label:r.acao, cls:'b-blue'};
    const quando = new Date(r.criado_em);
    const quandoFmt = quando.toLocaleDateString('pt-BR') + ' às ' + quando.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    return `<tr>
      <td>${quandoFmt}</td>
      <td>${r.usuario_email || '—'}</td>
      <td>${tabelaLabel[r.tabela] || r.tabela}</td>
      <td><span class="badge ${a.cls}"><span class="dot"></span>${a.label}</span></td>
      <td>${r.registro_id || '—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--ink-500); padding:20px;">Nenhum registro ainda.</td></tr>';
}

// ===================== DETALHE DO CONTRATO =====================
function attachRowClicks(tbody){
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => openContratoDetalhe(tr.dataset.id));
  });
}

let contratoAtualId = null;

function openContratoDetalhe(id){
  const c = CONTRATOS.find(x => x.id === id);
  if (!c) return;
  contratoAtualId = id;
  const s = statusSaude(c);
  const pct = consumoPct(c);
  const dias = diasParaVencer(c.dataFim);

  document.getElementById('det-id').textContent = c.id;
  document.getElementById('det-sub').textContent = `${c.cliente} · ${c.grupo} · ${c.unidade} · ${c.segmento || '—'}`;
  const badge = document.getElementById('det-status-badge');
  badge.className = 'badge ' + badgeClass(s);
  badge.innerHTML = `<span class="dot"></span>${s}`;

  document.getElementById('det-vigencia').textContent = `${fmtData(c.dataInicio)} – ${fmtData(c.dataFim)}`;
  document.getElementById('det-dias').textContent = dias < 0 ? 'Vencido' : dias + ' dias';
  document.getElementById('det-data-receb').textContent = c.dataRecebimento ? fmtData(c.dataRecebimento) : '—';
  document.getElementById('det-valor').textContent = fmtBRL(c.valorContratado);
  document.getElementById('det-acao').textContent = acaoSugerida(c);

  document.getElementById('det-qtd-itens').textContent = (c.quantidadeItens || 0).toLocaleString('pt-BR');
  document.getElementById('det-itens-cotados').textContent = (c.itensCotados || 0).toLocaleString('pt-BR');
  document.getElementById('det-valor-cotado').textContent = fmtBRL(c.valorCotado);
  document.getElementById('det-itens-vencidos').textContent = (c.itensVencidos || 0).toLocaleString('pt-BR');

  document.getElementById('det-vend-int').textContent = c.vendedorInterno;
  document.getElementById('det-vend-ext').textContent = c.vendedorExterno;
  document.getElementById('det-gerente').textContent = c.gerente;
  document.getElementById('det-unidade').textContent = c.unidade;

  document.getElementById('det-qtd-est').textContent = c.qtdEstimada.toLocaleString('pt-BR');
  document.getElementById('det-qtd-real').textContent = c.qtdConsumida.toLocaleString('pt-BR');
  document.getElementById('det-consumo-pct').textContent = pct.toFixed(0) + '%';
  const bar = document.getElementById('det-consumo-bar');
  bar.style.width = Math.min(pct,130) + '%';
  bar.style.background = barColor(pct);

  const buckets = bucketsRegua();
  document.getElementById('det-regua-track').innerHTML = buckets.map(b => {
    const atual = dias >= b.min && dias <= b.max;
    return `<div class="regua-step" style="${atual ? 'outline:2px solid var(--brand-600); outline-offset:6px; border-radius:10px;' : 'opacity:.4;'}">
      <div class="node">${b.label === 'Vencido' ? '!' : b.label.split(' ')[0]}</div>
      <div class="step-label">${b.label}</div>
      <div class="step-owner">${b.owner}</div>
    </div>`;
  }).join('');

  goToView('detalhe-contrato');
  if (typeof Intel !== 'undefined') Intel.renderDetalheContrato(id);
}

document.getElementById('btn-voltar-detalhe').addEventListener('click', () => goToView('contratos'));
document.getElementById('btn-excluir-detalhe').addEventListener('click', () => {
  if (!contratoAtualId) return;
  const id = contratoAtualId;
  showConfirm({
    title: 'Excluir contrato',
    message: `Tem certeza que deseja excluir o contrato ${id}? Essa ação não pode ser desfeita.`,
    onConfirm: async () => {
      if (DB_ATIVO){
        const { error } = await supabaseClient.from('contratos').delete().eq('id', id);
        if (error){ showToast('Não foi possível excluir no banco: ' + error.message); return; }
      }
      CONTRATOS = CONTRATOS.filter(c => c.id !== id);
      renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList(); renderContratos();
      showToast('Contrato ' + id + ' excluído');
      goToView('contratos');
    }
  });
});
document.getElementById('btn-editar-detalhe').addEventListener('click', () => {
  if (contratoAtualId) abrirEdicaoContrato(contratoAtualId);
});
document.getElementById('nc-cancel-btn').addEventListener('click', () => limparFormContrato());
document.getElementById('btn-nova-cotacao-detalhe').addEventListener('click', () => goToView('nova-cotacao'));
document.getElementById('btn-renovar-detalhe').addEventListener('click', () => {
  showToast('Renovação registrada para ' + (contratoAtualId || 'o contrato'));
});

document.getElementById('btn-exportar-detalhe').addEventListener('click', () => {
  const c = CONTRATOS.find(x => x.id === contratoAtualId);
  if (!c) return;
  const dias = diasParaVencer(c.dataFim);
  exportarCSV(
    ['ID','Cliente','Grupo','Segmento','Unidade','Vendedor interno','Vendedor externo','Gerente','Data recebimento','Vigência','Dias p/ vencer','Valor contratado','Quantidade de itens','Itens cotados','Total cotado','Itens vencidos','Consumo estimado','Consumo realizado','Índice de consumo','Saúde'],
    [[c.id, c.cliente, c.grupo, c.segmento||'', c.unidade||'', c.vendedorInterno, c.vendedorExterno, c.gerente,
      c.dataRecebimento ? fmtData(c.dataRecebimento) : '', fmtData(c.dataInicio)+' – '+fmtData(c.dataFim), dias < 0 ? 'Vencido' : dias+' dias',
      c.valorContratado, c.quantidadeItens, c.itensCotados, c.valorCotado, c.itensVencidos,
      c.qtdEstimada, c.qtdConsumida, consumoPct(c).toFixed(0)+'%', statusSaude(c)]],
    c.id + '.csv'
  );
});
document.getElementById('btn-imprimir-detalhe').addEventListener('click', () => window.print());

// ===================== DETALHE DA COTAÇÃO =====================
let cotacaoAtualNumero = null;
let ITENS_COTACAO = []; // itens da cotação atualmente aberta

async function carregarItensCotacao(numero){
  if (!DB_ATIVO) return ITENS_COTACAO.filter(it => it.cotacao_numero === numero || it._local === numero);
  const { data, error } = await supabaseClient
    .from('cotacao_itens').select('*').eq('cotacao_numero', numero).order('quantidade', { ascending:false });
  if (error){ console.error('[Itens da cotação]', error.message); return []; }
  return data;
}

function renderItensCotacaoTabela(itens){
  const tbody = document.querySelector('#tbl-cotacao-itens tbody');
  if (!itens.length){
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-500); padding:16px;">Nenhum item detalhado ainda — use o formulário abaixo para adicionar.</td></tr>';
    return;
  }
  const ordenados = [...itens].sort((a,b) => (b.quantidade||0) - (a.quantidade||0));
  const totalQtd = ordenados.reduce((s,it) => s + (Number(it.quantidade)||0), 0) || 1;
  tbody.innerHTML = ordenados.map((it, i) => {
    const pct = (Number(it.quantidade)||0) / totalQtd * 100;
    return `<tr>
      <td>${it.item_nome}${i===0 ? '<span class="item-mais-cotado">★ Mais cotado</span>' : ''}</td>
      <td>${(Number(it.quantidade)||0).toLocaleString('pt-BR')}</td>
      <td>${pct.toFixed(0)}%</td>
      <td>${fmtBRL(it.valor)}</td>
      <td class="col-acoes">
        <button type="button" class="icon-btn danger admin-only" data-del-item="${it.id}" title="Remover item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('[data-del-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delItem;
      if (DB_ATIVO){
        const { error } = await supabaseClient.from('cotacao_itens').delete().eq('id', id);
        if (error){ showToast('Não foi possível remover: ' + error.message); return; }
      } else {
        ITENS_COTACAO = ITENS_COTACAO.filter(it => String(it.id) !== String(id));
      }
      const atualizados = await carregarItensCotacao(cotacaoAtualNumero);
      renderItensCotacaoTabela(atualizados);
      showToast('Item removido');
    });
  });
}

async function openCotacaoDetalhe(numero){
  const c = COTACOES.find(x => x.numero === numero);
  if (!c) return;
  cotacaoAtualNumero = numero;
  const pct = pctCotacao(c);

  document.getElementById('detcot-cliente').textContent = c.cliente;
  document.getElementById('detcot-sub').textContent = `${c.tipo} · ${c.dataRecebimento ? fmtData(c.dataRecebimento) : '—'} – ${c.dataEnvio ? fmtData(c.dataEnvio) : '—'}`;
  const badge = document.getElementById('detcot-status-badge');
  badge.className = 'badge ' + statusCotClass(c.status);
  badge.innerHTML = `<span class="dot"></span>${c.status}`;

  document.getElementById('detcot-tipo').textContent = c.tipo;
  document.getElementById('detcot-data-receb').textContent = c.dataRecebimento ? fmtData(c.dataRecebimento) : '—';
  document.getElementById('detcot-data-envio').textContent = c.dataEnvio ? fmtData(c.dataEnvio) : '—';
  document.getElementById('detcot-motivo').textContent = c.motivo || '—';

  document.getElementById('detcot-itens-est').textContent = (c.itensEstimados||0).toLocaleString('pt-BR');
  document.getElementById('detcot-itens-cot').textContent = (c.itensCotados||0).toLocaleString('pt-BR');
  document.getElementById('detcot-pct').textContent = pct.toFixed(0) + '%';
  document.getElementById('detcot-valor-estimado').textContent = fmtBRL(c.valorEstimado);
  document.getElementById('detcot-valor-cotado').textContent = fmtBRL(c.valorCotado);

  document.getElementById('detcot-internos').textContent = c.internos || '—';
  document.getElementById('detcot-externos').textContent = c.externos || '—';

  document.querySelector('#tbl-cotacao-itens tbody').innerHTML = '<tr><td colspan="5" style="color:var(--ink-500); padding:16px;">Carregando...</td></tr>';
  goToView('detalhe-cotacao');
  const itens = await carregarItensCotacao(numero);
  renderItensCotacaoTabela(itens);
}

document.getElementById('btn-voltar-detalhe-cotacao').addEventListener('click', () => goToView('cotacoes'));

document.getElementById('btn-excluir-detcot').addEventListener('click', () => {
  if (!cotacaoAtualNumero) return;
  const numero = cotacaoAtualNumero;
  showConfirm({
    title: 'Excluir cotação',
    message: `Tem certeza que deseja excluir a cotação de "${(COTACOES.find(c=>c.numero===numero)||{}).cliente || numero}"? Essa ação não pode ser desfeita.`,
    onConfirm: async () => {
      if (DB_ATIVO){
        const { error } = await supabaseClient.from('cotacoes').delete().eq('numero', numero);
        if (error){ showToast('Não foi possível excluir no banco: ' + error.message); return; }
      }
      COTACOES = COTACOES.filter(c => c.numero !== numero);
      renderCotacoes();
      showToast('Cotação excluída');
      goToView('cotacoes');
    }
  });
});

document.getElementById('btn-exportar-detcot').addEventListener('click', () => {
  const c = COTACOES.find(x => x.numero === cotacaoAtualNumero);
  if (!c) return;
  const pct = pctCotacao(c);
  exportarCSV(
    ['Cliente','Status','Tipo','Data recebimento','Data envio','Itens estimados','Itens cotados','%','Total dos itens','R$ Cotado total','Internos','Externos','Motivo'],
    [[c.cliente, c.status, c.tipo, c.dataRecebimento?fmtData(c.dataRecebimento):'', c.dataEnvio?fmtData(c.dataEnvio):'',
      c.itensEstimados||0, c.itensCotados||0, pct.toFixed(0)+'%', c.valorEstimado||0, c.valorCotado||0,
      c.internos||'', c.externos||'', c.motivo||'']],
    (c.numero || c.cliente) + '.csv'
  );
});
document.getElementById('btn-imprimir-detcot').addEventListener('click', () => window.print());

document.getElementById('btn-add-item-cotacao').addEventListener('click', async () => {
  const nome = document.getElementById('ci-nome').value.trim();
  const qtd = Number(document.getElementById('ci-qtd').value) || 0;
  const valor = Number(document.getElementById('ci-valor').value) || 0;
  if (!nome){ showToast('Digite o nome do item'); return; }
  if (!cotacaoAtualNumero) return;

  if (DB_ATIVO){
    const { error } = await supabaseClient.from('cotacao_itens').insert({
      cotacao_numero: cotacaoAtualNumero, item_nome: nome, quantidade: qtd, valor: valor
    });
    if (error){ showToast('Não foi possível salvar: ' + error.message); return; }
  } else {
    ITENS_COTACAO.push({ id: 'local-'+Date.now(), cotacao_numero: cotacaoAtualNumero, item_nome: nome, quantidade: qtd, valor: valor });
  }
  document.getElementById('ci-nome').value = '';
  document.getElementById('ci-qtd').value = '';
  document.getElementById('ci-valor').value = '';
  const atualizados = await carregarItensCotacao(cotacaoAtualNumero);
  renderItensCotacaoTabela(atualizados);
  showToast('Item adicionado');
});

// ===================== NAVEGAÇÃO =====================
const titles = {
  'visao-geral':'Dashboard', 'contratos':'Contratos', 'cotacoes':'Cotações',
  'fiscal':'Planilhas', 'clientes':'Clientes & grupos',
  'novo-contrato':'Novo contrato', 'nova-cotacao':'Nova cotação',
  'novo-cliente':'Novo cliente',
  'detalhe-contrato':'Detalhe do contrato',
  'detalhe-cotacao':'Detalhe da cotação',
  'perfil':'Meu perfil',
  'usuarios':'Usuários', 'historico':'Histórico de alterações',
  'responder':'Responder planilha', 'base':'Base de dados', 'parametros':'Parâmetros'
};
function goToView(view){
  const viewsRestritas = ['novo-contrato', 'nova-cotacao', 'novo-cliente', 'usuarios', 'historico', 'responder', 'base'];
  if (typeof USER_ROLE !== 'undefined' && USER_ROLE === 'gerente' && viewsRestritas.includes(view)){
    showToast('Seu acesso é somente leitura — fale com um administrador.');
    view = 'contratos';
  }
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navMatch = document.querySelector('.nav-item[data-view="'+view+'"]');
  if (navMatch) navMatch.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('page-title').textContent = titles[view];
  if (view === 'usuarios') renderUsuarios();
  if (view === 'historico') renderHistorico();
  if (typeof Intel !== 'undefined') Intel.aoAbrirView(view);
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'novo-contrato') abrirNovoContrato();
    else goToView(item.dataset.view);
    fecharMenuMobile();
  });
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.goto === 'novo-contrato') abrirNovoContrato();
    else goToView(btn.dataset.goto);
    fecharMenuMobile();
  });
});

function showToast(msg){
  const t = document.getElementById('toast');
  t.querySelector('.tmsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ===================== MODAL DE CONFIRMAÇÃO (excluir) =====================
function showConfirm({ title = 'Excluir item', message = 'Tem certeza que deseja excluir? Essa ação não pode ser desfeita.', confirmLabel = 'Excluir', onConfirm }){
  const overlay = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;

  const okBtn = document.getElementById('confirm-ok-btn');
  okBtn.textContent = confirmLabel;
  // troca o botão por um clone "limpo" pra não empilhar listeners de chamadas anteriores
  const freshBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(freshBtn, okBtn);
  freshBtn.addEventListener('click', () => {
    hideConfirm();
    if (onConfirm) onConfirm();
  });

  overlay.classList.add('show');
}
function hideConfirm(){
  document.getElementById('confirm-modal').classList.remove('show');
}
document.getElementById('confirm-cancel-btn').addEventListener('click', hideConfirm);
document.getElementById('confirm-modal').addEventListener('click', (e) => {
  if (e.target.id === 'confirm-modal') hideConfirm();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideConfirm();
});

let contratoSeq = 98;
let cotacaoSeq = 4890;
let editingContratoId = null;

function limparFormContrato(){
  const f = document.getElementById('form-contrato');
  f.reset();
  document.getElementById('nc-id').value = '';
  editingContratoId = null;
  document.getElementById('nc-heading').textContent = 'Novo contrato';
  document.getElementById('nc-desc').textContent = 'Campos recomendados conforme o escopo definido: cadastro geral e dados do contrato.';
  document.getElementById('nc-submit-btn').textContent = 'Salvar contrato';
}

function abrirNovoContrato(){
  limparFormContrato();
  goToView('novo-contrato');
}

function abrirEdicaoContrato(id){
  const c = CONTRATOS.find(x => x.id === id);
  if (!c) return;
  editingContratoId = id;
  document.getElementById('nc-heading').textContent = 'Editar contrato · ' + c.id;
  document.getElementById('nc-desc').textContent = 'Atualize os dados do contrato selecionado.';
  document.getElementById('nc-submit-btn').textContent = 'Salvar alterações';

  document.getElementById('nc-id').value = c.id;
  document.getElementById('nc-grupo').value = c.grupo;
  document.getElementById('nc-cliente').value = c.cliente;
  document.getElementById('nc-unidade').value = c.unidade;
  document.getElementById('nc-segmento').value = c.segmento || '';
  document.getElementById('nc-tipo').value = 'Renovação';
  document.getElementById('nc-status').value = 'Ativo';
  document.getElementById('nc-inicio').value = c.dataInicio;
  document.getElementById('nc-fim').value = c.dataFim;
  document.getElementById('nc-data-receb').value = c.dataRecebimento || '';
  document.getElementById('nc-vend-int').value = c.vendedorInterno;
  document.getElementById('nc-vend-ext').value = c.vendedorExterno;
  document.getElementById('nc-gerente').value = c.gerente;
  document.getElementById('nc-qtd-itens').value = c.quantidadeItens || '';
  document.getElementById('nc-itens-cotados').value = c.itensCotados || '';
  document.getElementById('nc-valor').value = c.valorContratado || '';
  document.getElementById('nc-valor-cotado').value = c.valorCotado || '';
  const campoCodigos = document.getElementById('nc-codigos');
  if (campoCodigos) campoCodigos.value = c.codigosCliente || '';

  goToView('novo-contrato');
}

document.getElementById('form-contrato').addEventListener('submit', async (e) => {
  e.preventDefault();
  const grupo = document.getElementById('nc-grupo').value || 'Grupo não informado';
  const cliente = document.getElementById('nc-cliente').value || 'Novo cliente';
  const unidade = document.getElementById('nc-unidade').value || '—';
  const segmento = document.getElementById('nc-segmento').value || '—';
  const dataInicio = document.getElementById('nc-inicio').value || HOJE.toISOString().slice(0,10);
  const dataFim = document.getElementById('nc-fim').value || HOJE.toISOString().slice(0,10);
  const dataRecebimento = document.getElementById('nc-data-receb').value || null;
  const vendInt = document.getElementById('nc-vend-int').value || '—';
  const vendExt = document.getElementById('nc-vend-ext').value || '—';
  const gerente = document.getElementById('nc-gerente').value || '—';
  const qtdItens = Number(document.getElementById('nc-qtd-itens').value) || 0;
  const itensCotados = Number(document.getElementById('nc-itens-cotados').value) || 0;
  const valorContratado = Number(document.getElementById('nc-valor').value) || 0;
  const valorCotado = Number(document.getElementById('nc-valor-cotado').value) || 0;
  const campoCodigos = document.getElementById('nc-codigos');
  const codigosCliente = campoCodigos && campoCodigos.value.trim() ? campoCodigos.value.trim() : undefined;

  const submitBtn = e.target.querySelector('button[type=submit]');
  if (submitBtn) submitBtn.disabled = true;

  if (editingContratoId){
    const c = CONTRATOS.find(x => x.id === editingContratoId);
    if (c){
      // ...c primeiro pra manter ncm/uf/icms/itensVencidos como já estavam
      // (itensVencidos é uma foto do momento em que o contrato foi fechado —
      // não muda só porque o cadastro foi editado depois)
      const atualizado = {
        ...c, grupo, cliente, unidade, segmento, dataInicio, dataFim, dataRecebimento,
        vendedorInterno: vendInt, vendedorExterno: vendExt, gerente,
        quantidadeItens: qtdItens, itensCotados, valorContratado, valorCotado,
        ...(codigosCliente !== undefined || c.codigosCliente ? { codigosCliente: codigosCliente || '' } : {})
      };
      if (DB_ATIVO){
        const { error } = await supabaseClient.from('contratos').update(contratoParaLinha(atualizado)).eq('id', c.id);
        if (error){
          showToast('Não foi possível salvar no banco: ' + error.message);
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
      }
      Object.assign(c, atualizado);
      renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList(); renderContratos(); renderFiscal();
      showToast('Contrato ' + c.id + ' atualizado com sucesso');
    }
  } else {
    contratoSeq++;
    const novo = {
      id:'C-2026-'+String(contratoSeq).padStart(3,'0'),
      cliente, grupo, unidade, segmento, uf:'—',
      vendedorInterno: vendInt, vendedorExterno: vendExt, gerente,
      dataInicio, dataFim, dataRecebimento,
      valorContratado, qtdEstimada: 0, quantidadeItens: qtdItens, qtdConsumida: 0,
      itensCotados, valorCotado, itensVencidos: qtdItens,
      ncm: '—', icmsDivergencia: false,
      ...(codigosCliente !== undefined ? { codigosCliente } : {})
    };
    if (DB_ATIVO){
      const { data, error } = await supabaseClient.from('contratos').insert(contratoParaLinha(novo)).select().single();
      if (error){
        showToast('Não foi possível salvar no banco: ' + error.message);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      Object.assign(novo, linhaParaContrato(data));
    }
    CONTRATOS.unshift(novo);
    renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList(); renderContratos(); renderFiscal();
    showToast('Contrato ' + novo.id + ' cadastrado com sucesso');
  }
  if (submitBtn) submitBtn.disabled = false;
  limparFormContrato();
  goToView('contratos');
});

document.getElementById('form-cotacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  cotacaoSeq++;
  const nova = {
    numero:'COT-'+cotacaoSeq,
    cliente: document.getElementById('cot-cliente').value || 'Novo cliente',
    tipo: document.getElementById('cot-tipo').value,
    status: document.getElementById('cot-status').value,
    dataRecebimento: document.getElementById('cot-data-receb').value || null,
    dataEnvio: document.getElementById('cot-data-envio').value || null,
    itensEstimados: Number(document.getElementById('cot-itens-est').value) || 0,
    itensCotados: Number(document.getElementById('cot-itens-cot').value) || 0,
    valorEstimado: Number(document.getElementById('cot-valor-estimado').value) || 0,
    valorCotado: Number(document.getElementById('cot-valor-cotado').value) || 0,
    valorContrato: Number(document.getElementById('cot-valor-contrato').value) || 0,
    motivo: document.getElementById('cot-motivo').value || '—'
  };
  const submitBtn = e.target.querySelector('button[type=submit]');
  if (submitBtn) submitBtn.disabled = true;

  if (DB_ATIVO){
    const { data, error } = await supabaseClient.from('cotacoes').insert(cotacaoParaLinha(nova)).select().single();
    if (error){
      showToast('Não foi possível salvar no banco: ' + error.message);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    Object.assign(nova, linhaParaCotacao(data));
  }
  COTACOES.unshift(nova);
  renderCotacoes();
  showToast('Cotação ' + nova.numero + ' cadastrada com sucesso');
  if (submitBtn) submitBtn.disabled = false;
  e.target.reset();
  goToView('cotacoes');
});

document.getElementById('form-cliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('cl-nome').value.trim();
  if (!nome) return;
  const novo = {
    cliente: nome,
    grupo: document.getElementById('cl-grupo').value || '—',
    unidades: document.getElementById('cl-unidades').value || '—',
    comprador: document.getElementById('cl-comprador').value || '—',
    vendedorPrincipal: document.getElementById('cl-vendedor').value || null
  };
  const submitBtn = e.target.querySelector('button[type=submit]');
  if (submitBtn) submitBtn.disabled = true;

  if (DB_ATIVO){
    const { data, error } = await supabaseClient.from('clientes').insert(clienteParaLinha(novo)).select().single();
    if (error){
      showToast('Não foi possível salvar no banco: ' + error.message);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    Object.assign(novo, linhaParaCliente(data));
  }
  CLIENTES.unshift(novo);
  renderClientes();
  showToast('Cliente ' + novo.cliente + ' cadastrado com sucesso');
  if (submitBtn) submitBtn.disabled = false;
  e.target.reset();
  goToView('clientes');
});

// ===================== BUSCA GLOBAL =====================
function setupGlobalSearch(){
  const input = document.getElementById('global-search');
  const box = document.getElementById('global-search-results');

  function renderResults(query){
    const q = query.trim().toLowerCase();
    if (!q){ box.classList.remove('show'); box.innerHTML=''; return; }

    const contratos = CONTRATOS.filter(c =>
      c.id.toLowerCase().includes(q) ||
      c.cliente.toLowerCase().includes(q) ||
      c.grupo.toLowerCase().includes(q)
    ).slice(0,6);

    const clientes = CLIENTES.filter(cl =>
      cl.cliente.toLowerCase().includes(q) || cl.grupo.toLowerCase().includes(q)
    ).slice(0,4);

    let html = '';
    if (contratos.length){
      html += '<div class="sr-group-label">Contratos</div>';
      html += contratos.map(c => `<div class="sr-item" data-type="contrato" data-id="${c.id}">
        <span class="sr-title">${c.id} · ${c.cliente}</span>
        <span class="sr-sub">${c.grupo} · ${statusSaude(c)}</span>
      </div>`).join('');
    }
    if (clientes.length){
      html += '<div class="sr-group-label">Clientes</div>';
      html += clientes.map(cl => `<div class="sr-item" data-type="cliente" data-nome="${cl.cliente}">
        <span class="sr-title">${cl.cliente}</span>
        <span class="sr-sub">${cl.grupo} · ${cl.unidades}</span>
      </div>`).join('');
    }
    if (!html){
      html = '<div class="sr-empty">Nenhum resultado para "' + query + '"</div>';
    }
    box.innerHTML = html;
    box.classList.add('show');

    box.querySelectorAll('.sr-item[data-type="contrato"]').forEach(el => {
      el.addEventListener('click', () => {
        openContratoDetalhe(el.dataset.id);
        input.value = '';
        box.classList.remove('show');
      });
    });
    box.querySelectorAll('.sr-item[data-type="cliente"]').forEach(el => {
      el.addEventListener('click', () => {
        goToView('contratos');
        document.getElementById('f-busca').value = el.dataset.nome;
        renderContratos();
        input.value = '';
        box.classList.remove('show');
      });
    });
  }

  input.addEventListener('input', () => renderResults(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) renderResults(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      const first = box.querySelector('.sr-item');
      if (first) first.click();
    } else if (e.key === 'Escape'){
      box.classList.remove('show'); input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) box.classList.remove('show');
  });
}

// ===================== TEMA CLARO / ESCURO =====================
const THEME_STORAGE_KEY = 'melting_theme';

function aplicarTema(tema){
  document.documentElement.setAttribute('data-theme', tema);
  const label = document.getElementById('theme-toggle-label');
  if (label) label.textContent = tema === 'dark' ? 'Tema escuro' : 'Tema claro';
}

function setupThemeToggle(){
  const salvo = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  aplicarTema(salvo);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const novo = atual === 'dark' ? 'light' : 'dark';
    aplicarTema(novo);
    localStorage.setItem(THEME_STORAGE_KEY, novo);
  });
}
setupThemeToggle();

// ===================== MENU MOBILE (gaveta deslizante) =====================
function fecharMenuMobile(){
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
}
function setupMenuMobile(){
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggle || !sidebar || !backdrop) return;
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
  });
  backdrop.addEventListener('click', fecharMenuMobile);
}
setupMenuMobile();

// ===================== INIT =====================
renderKpis();
renderRegua();
renderVisaoDiaria();
renderConsumoList();
renderSegmentoChart();
renderRankingVendedores();
popularFiltros();
popularFiltrosCotacoes();
renderContratos();
renderCotacoes();
renderFiscal();
renderClientes();
setupGlobalSearch();
setupUploadPlanilhas();
setupImportarPlanilhaOficial();

const btnSincronizarClientes = document.getElementById('btn-sincronizar-clientes');
if (btnSincronizarClientes){
  btnSincronizarClientes.addEventListener('click', async () => {
    btnSincronizarClientes.disabled = true;
    const qtd = await sincronizarClientesFaltantes();
    renderClientes();
    showToast(qtd ? qtd + ' cliente(s) novo(s) cadastrado(s)' : 'Nenhum cliente novo — já está tudo sincronizado');
    btnSincronizarClientes.disabled = false;
  });
}

// ===================== EXCLUIR SELECIONADOS (Contratos / Cotações / Clientes) =====================
const fclBusca = document.getElementById('fcl-busca');
if (fclBusca) fclBusca.addEventListener('input', renderClientes);

const btnExcluirSelContratos = document.getElementById('btn-excluir-selecionados-contratos');
if (btnExcluirSelContratos){
  btnExcluirSelContratos.addEventListener('click', () => {
    if (contratosSelecionados.size === 0){ showToast('Selecione pelo menos um contrato pra excluir'); return; }
    const ids = [...contratosSelecionados];
    showConfirm({
      title: 'Excluir contratos selecionados',
      message: `Tem certeza que deseja excluir ${ids.length} contrato(s) selecionado(s)? Essa ação não pode ser desfeita.`,
      onConfirm: async () => {
        if (DB_ATIVO){
          const { error } = await supabaseClient.from('contratos').delete().in('id', ids);
          if (error){ showToast('Não foi possível excluir: ' + error.message); return; }
        }
        CONTRATOS = CONTRATOS.filter(c => !ids.includes(c.id));
        contratosSelecionados.clear();
        renderKpis(); renderRegua(); renderVisaoDiaria(); renderConsumoList(); renderContratos(); renderFiscal();
        showToast(ids.length + ' contrato(s) excluído(s)');
      }
    });
  });
}

const btnExcluirSelCotacoes = document.getElementById('btn-excluir-selecionados-cotacoes');
if (btnExcluirSelCotacoes){
  btnExcluirSelCotacoes.addEventListener('click', () => {
    if (cotacoesSelecionadas.size === 0){ showToast('Selecione pelo menos uma cotação pra excluir'); return; }
    const numeros = [...cotacoesSelecionadas];
    showConfirm({
      title: 'Excluir cotações selecionadas',
      message: `Tem certeza que deseja excluir ${numeros.length} cotação(ões) selecionada(s)? Essa ação não pode ser desfeita.`,
      onConfirm: async () => {
        if (DB_ATIVO){
          const { error } = await supabaseClient.from('cotacoes').delete().in('numero', numeros);
          if (error){ showToast('Não foi possível excluir: ' + error.message); return; }
        }
        COTACOES = COTACOES.filter(c => !numeros.includes(c.numero));
        cotacoesSelecionadas.clear();
        renderCotacoes();
        showToast(numeros.length + ' cotação(ões) excluída(s)');
      }
    });
  });
}

const btnExcluirSelClientes = document.getElementById('btn-excluir-selecionados-clientes');
if (btnExcluirSelClientes){
  btnExcluirSelClientes.addEventListener('click', () => {
    if (clientesSelecionados.size === 0){ showToast('Selecione pelo menos um cliente pra excluir'); return; }
    const nomes = [...clientesSelecionados];
    showConfirm({
      title: 'Excluir clientes selecionados',
      message: `Tem certeza que deseja excluir ${nomes.length} cliente(s) selecionado(s)? Os contratos já cadastrados não serão apagados. Essa ação não pode ser desfeita.`,
      onConfirm: async () => {
        if (DB_ATIVO){
          const { error } = await supabaseClient.from('clientes').delete().in('cliente', nomes);
          if (error){ showToast('Não foi possível excluir: ' + error.message); return; }
        }
        CLIENTES = CLIENTES.filter(c => !nomes.includes(c.cliente));
        clientesSelecionados.clear();
        renderClientes();
        showToast(nomes.length + ' cliente(s) excluído(s)');
      }
    });
  });
}

// ===================== EXPORTAR RELATÓRIOS (CSV / Excel) =====================
function exportarCSV(headers, linhas, nomeArquivo){
  const escapa = (v) => {
    let s = String(v ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) s = '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const csv = '\uFEFF' + [headers, ...linhas].map(l => l.map(escapa).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Arquivo "' + nomeArquivo + '" baixado');
}

const btnImprimirContratos = document.getElementById('btn-imprimir-contratos');
if (btnImprimirContratos) btnImprimirContratos.addEventListener('click', () => window.print());

const btnImprimirCotacoes = document.getElementById('btn-imprimir-cotacoes');
if (btnImprimirCotacoes) btnImprimirCotacoes.addEventListener('click', () => window.print());

const btnExportarContratos = document.getElementById('btn-exportar-contratos');
if (btnExportarContratos){
  btnExportarContratos.addEventListener('click', () => {
    const base = contratosSelecionados.size > 0
      ? CONTRATOS.filter(c => contratosSelecionados.has(c.id))
      : contratosFiltradosTabela();
    const linhas = base.map(c => [
      c.id, c.cliente, c.grupo, c.segmento||'', c.vendedorInterno,
      c.dataRecebimento ? fmtData(c.dataRecebimento) : '',
      fmtData(c.dataInicio)+' – '+fmtData(c.dataFim),
      diasParaVencer(c.dataFim) < 0 ? 'Vencido' : diasParaVencer(c.dataFim)+' dias',
      consumoPct(c).toFixed(0)+'%', statusSaude(c)
    ]);
    exportarCSV(['ID','Cliente','Grupo','Segmento','Vendedor','Data recebimento','Vigência','Dias p/ vencer','Consumo','Saúde'], linhas, 'contratos.csv');
  });
}

const btnExportarCotacoes = document.getElementById('btn-exportar-cotacoes');
if (btnExportarCotacoes){
  btnExportarCotacoes.addEventListener('click', () => {
    const base = cotacoesSelecionadas.size > 0
      ? COTACOES.filter(c => cotacoesSelecionadas.has(c.numero))
      : cotacoesFiltradasTabela();
    const linhas = base.map(c => [
      c.cliente, c.status, c.tipo, c.dataRecebimento?fmtData(c.dataRecebimento):'', c.dataEnvio?fmtData(c.dataEnvio):'',
      c.itensEstimados||0, c.itensCotados||0, pctCotacao(c).toFixed(0)+'%',
      c.valorEstimado||0, c.valorCotado||0, c.motivo || ''
    ]);
    exportarCSV(['Cliente','Status','Tipo','Data recebimento','Data envio','Itens estimados','Itens cotados','%','Total dos itens','R$ Cotado total','Motivo'], linhas, 'cotacoes.csv');
  });
}

const btnAtualizarHistorico = document.getElementById('btn-atualizar-historico');
if (btnAtualizarHistorico) btnAtualizarHistorico.addEventListener('click', renderHistorico);

// ===================== CAMPO CNPJ (só números) =====================
const campoCnpj = document.getElementById('nc-cnpj');
if (campoCnpj){
  campoCnpj.addEventListener('input', () => {
    campoCnpj.value = campoCnpj.value.replace(/\D/g, '').slice(0, 14);
  });
}
carregarDadosSupabase();

const dashFiltroInput = document.getElementById('dash-filtro');
const dashFiltroLimpar = document.getElementById('dash-filtro-limpar');
if (dashFiltroInput){
  dashFiltroInput.addEventListener('input', renderDashboardCompleto);
}
if (dashFiltroLimpar){
  dashFiltroLimpar.addEventListener('click', () => {
    if (dashFiltroInput){
      dashFiltroInput.value = '';
      renderDashboardCompleto();
      dashFiltroInput.focus();
    }
  });
}

// ===================== MENU DO USUÁRIO (dropdown) =====================
async function fazerLogout(){
  if (typeof supabaseClient !== 'undefined' && supabaseClient){
    try { await supabaseClient.auth.signOut(); } catch(e){ /* ignora erro de rede em ambiente local */ }
  }
  window.location.href = 'login.html';
}

function setupUserMenu(){
  const trigger = document.getElementById('user-menu-trigger');
  const dropdown = document.getElementById('user-dropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) dropdown.classList.remove('show');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('show');
  });

  document.getElementById('menu-perfil').addEventListener('click', () => {
    dropdown.classList.remove('show');
    goToView('perfil');
  });
  document.getElementById('menu-sair').addEventListener('click', () => {
    dropdown.classList.remove('show');
    fazerLogout();
  });

  // preenche e-mail real da sessão do Supabase, se disponível
  if (typeof supabaseClient !== 'undefined' && supabaseClient){
    supabaseClient.auth.getUser().then(({ data }) => {
      const email = data && data.user && data.user.email;
      if (email){
        document.getElementById('udd-email').textContent = email;
        const perfilEmail = document.getElementById('perfil-email');
        if (perfilEmail) perfilEmail.textContent = email;
      } else {
        document.getElementById('udd-email').textContent = 'Sessão local (sem Supabase)';
      }
    }).catch(() => {
      document.getElementById('udd-email').textContent = 'Sessão local (sem Supabase)';
    });
  } else {
    document.getElementById('udd-email').textContent = 'Sessão local (sem Supabase)';
  }
}
setupUserMenu();

// ===================== CARREGAR PAPEL DO USUÁRIO (admin/gerente) =====================
function aplicarPermissoesPorPapel(){
  document.body.classList.toggle('role-gerente', USER_ROLE === 'gerente');

  const labelAcesso = USER_ROLE === 'gerente' ? 'Somente leitura' : 'Acesso total';
  const perfilAcesso = document.getElementById('perfil-acesso');
  if (perfilAcesso) perfilAcesso.textContent = labelAcesso;
  const perfilCargo = document.getElementById('perfil-cargo-display');
  if (perfilCargo) perfilCargo.textContent = USER_ROLE === 'gerente' ? 'Gerente · Somente leitura' : 'Assistente comercial · Acesso total';
}

async function carregarPapelUsuario(){
  aplicarPermissoesPorPapel(); // aplica o padrão (admin) imediatamente

  if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const user = sessionData && sessionData.session && sessionData.session.user;
    if (!user) return;

    const { data, error } = await supabaseClient
      .from('perfis')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (!error && data && data.papel){
      USER_ROLE = data.papel;
      aplicarPermissoesPorPapel();
    }
  } catch (e){
    // sem internet / Supabase fora do ar: mantém o padrão (admin) pro protótipo continuar usável
  }
}
carregarPapelUsuario();

// ===================== TELA "MEU PERFIL" =====================
const btnSairPerfil = document.getElementById('btn-sair-perfil');
if (btnSairPerfil) btnSairPerfil.addEventListener('click', fazerLogout);

// ===================== NOME DO USUÁRIO (salvo neste navegador) =====================
const NOME_STORAGE_KEY = 'melting_user_name';

function aplicarNomeUsuario(nome){
  const temNome = !!(nome && nome.trim());
  const nomeExibido = temNome ? nome.trim() : null;

  const umtName = document.getElementById('umt-name');
  const uddName = document.getElementById('udd-name');
  const perfilDisplay = document.getElementById('perfil-nome-display');

  if (umtName) umtName.textContent = nomeExibido || 'Minha conta';
  if (uddName) uddName.textContent = nomeExibido || 'Minha conta';
  if (perfilDisplay) perfilDisplay.textContent = nomeExibido || 'Usuário Melting';
}

function carregarNomeUsuario(){
  const salvo = localStorage.getItem(NOME_STORAGE_KEY) || '';
  const input = document.getElementById('perfil-nome-input');
  if (input) input.value = salvo;
  aplicarNomeUsuario(salvo);
}

const btnSalvarNome = document.getElementById('btn-salvar-nome');
if (btnSalvarNome){
  btnSalvarNome.addEventListener('click', () => {
    const input = document.getElementById('perfil-nome-input');
    const nome = input.value.trim();
    if (nome){
      localStorage.setItem(NOME_STORAGE_KEY, nome);
      showToast('Nome atualizado');
    } else {
      localStorage.removeItem(NOME_STORAGE_KEY);
      showToast('Nome removido');
    }
    aplicarNomeUsuario(nome);
  });
  const nomeInput = document.getElementById('perfil-nome-input');
  if (nomeInput){
    nomeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnSalvarNome.click();
    });
  }
}
carregarNomeUsuario();
