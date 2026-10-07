// =====================================================================
// PARÂMETROS DO SISTEMA (limites dos KPIs, régua, motor de resposta, IA)
// Carregado ANTES do app.js. Os valores salvos ficam na tabela
// "parametros" do Supabase (tela Parâmetros) e uma cópia em cache neste
// navegador, pra tela já abrir com os limites certos.
// =====================================================================
const PARAMS_PADRAO = {
  dataReferencia: '',          // vazio = usa a data de hoje
  consumoBaixo: 70,            // % do estimado abaixo disso = "Atenção"
  consumoAlto: 110,            // % do estimado acima disso = "Oportunidade"
  diasAtencao: 90,             // contrato vencendo em até X dias = "Atenção"
  regua: [120, 90, 60, 30],    // etapas da régua de vencimento (dias)
  ritmoBaixo: 0.8,             // consumo ÷ tempo decorrido abaixo disso = consumindo devagar
  ritmoAlto: 1.2,              // acima disso = vai estourar antes do fim
  semGiroPctVigencia: 50,      // item sem nenhuma compra depois de X% da vigência = "sem giro"
  divergenciaPrecoPct: 5,      // preço praticado diferente do contratado em mais de X% = alerta
  motor: {
    simRef: 0.45,              // nota mínima para "equivalente ao REF"
    simAprendido: 0.9,         // nota mínima para "padrão aprendido"
    simDescricao: 0.62,        // nota mínima para sugerir só pela descrição
    usarDescricao: false,
    travas: { material: true, rosca: true, tipo: true, medidas: true }
  },
  ia: {
    ativa: false,              // usa IA para itens sem resposta
    loteItens: 8,              // itens por chamada
    puter: false,              // true = IA pelo Puter.js no navegador (login Puter de cada usuário, sem chave/servidor); false = função "responder-itens" do Supabase
    modeloPuter: ''            // vazio = modelo padrão do Puter
  }
};

function mesclarParams(base, extra){
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!extra || typeof extra !== 'object') return out;
  Object.keys(extra).forEach(k => {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = mesclarParams(base[k], v);
    else if (v !== undefined && v !== null) out[k] = v;
  });
  return out;
}

const PARAMS_STORAGE_KEY = 'melting_parametros';
let PARAMS = (function(){
  try { return mesclarParams(PARAMS_PADRAO, JSON.parse(localStorage.getItem(PARAMS_STORAGE_KEY) || '{}')); }
  catch (e){ return mesclarParams(PARAMS_PADRAO, {}); }
})();

function dataReferencia(){
  const d = PARAMS.dataReferencia ? new Date(PARAMS.dataReferencia + 'T00:00:00') : new Date();
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? new Date(new Date().setHours(0, 0, 0, 0)) : d;
}

// régua no formato usado pelas telas: [{label, owner, min, max}]
function bucketsRegua(){
  const r = (PARAMS.regua || PARAMS_PADRAO.regua).slice().sort((a, b) => b - a);
  const donos = ['Vendedor interno / externo', 'Comprador + vendas', 'Vendas + gerente', 'Gerentes + vendedores'];
  const out = r.map((d, i) => ({
    label: d + ' dias', owner: donos[i] || 'Vendas', max: d, min: (r[i + 1] != null ? r[i + 1] + 1 : 0)
  }));
  out.push({ label: 'Vencido', owner: 'Gestão comercial', min: -99999, max: -1 });
  return out;
}
