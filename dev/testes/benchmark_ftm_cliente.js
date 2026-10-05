// Mangueiras montadas escritas "do jeito do cliente": pega FTMs reais (relpro_ftm), reescreve cada uma
// como um cliente pediria (bitola em polegada/DN/traço, norma R2/2SN/2 tramas, terminais por extenso ou
// em código, comprimento em mm/m) e confere se o motor remonta a mesma mangueira + terminais.
// Frases sintéticas — servem para medir o parser; a régua real são as cotações respondidas.
// uso: node dev/testes/benchmark_ftm_cliente.js [N=3000]   (dev/dados/cat.json + dev/dados/ftm.json)
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const ftm = require('../dados/ftm.json');
cat.definirFtm(M.agregarFtm(ftm));

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pick = (a) => a[Math.floor(rnd() * a.length)];
const POL = { 2: '1/8', 4: '1/4', 5: '5/16', 6: '3/8', 8: '1/2', 10: '5/8', 12: '3/4', 16: '1', 20: '1.1/4', 24: '1.1/2', 32: '2' };
const JIC = { 4: '7/16', 5: '1/2', 6: '9/16', 8: '3/4', 10: '7/8', 12: '1.1/16', 14: '1.3/16', 16: '1.5/16', 20: '1.5/8', 24: '1.7/8' };
const ORFS = { 4: '9/16', 6: '11/16', 8: '13/16', 10: '1', 12: '1.3/16', 16: '1.7/16', 20: '1.11/16', 24: '2' };
const DN = { 4: 6, 5: 8, 6: 10, 8: 12, 10: 16, 12: 19, 16: 25, 20: 31, 24: 38, 32: 51 };
const NORMA = { AGR2: ['R2', '2SN', '2 TRAMAS', 'SAE 100R2AT'], C2AT: ['R2', '2SN'], M2T: ['R2', '2 TRAMAS'], AGR1: ['R1', '1SN', '1 TRAMA', 'SAE 100R1AT'], C1T: ['R1', '1 TRAMA'],
  EFG4K: ['4SP', 'R12', '4 ESPIRAIS'], EFG6K: ['R13', '6 ESPIRAIS'], M3K: ['R17'] };
const GRUPO = { AGR2: 'R2', C2AT: 'R2', M2T: 'R2', AGR1: 'R1', C1T: 'R1', EFG4K: '4SP', EFG4KXLL: '4SP', MXG4KXTP: '4SP', EFG6K: 'R13', EFG5K: 'R13', M3K: 'R17' };
const rxT = /^(\d{1,2})G(S?)(\d{1,2})(FJX|MJ|MP|FPX|FP|FBSPORX|MBSPP|FDLORX|FDHORX|MDL|MDH|FFORX|MFFOR|FLH|FL|MLSP)(90|45)?(?:SML)?$/;
function terTxt(m) {
  const td = +m[3], T = m[4], ang = m[5] ? pick([' ' + m[5] + '°', ' ' + m[5] + ' GRAUS', ' CURVO ' + m[5], ' ' + m[5]]) : pick(['', ' RETO']);
  const cod = () => T + (m[5] || '') + ' ' + (/J/.test(T) ? JIC[td] : /FOR/.test(T) ? ORFS[td] : POL[td]) + (/J/.test(T) ? '' : '"');
  switch (T) {
    case 'FJX': return JIC[td] && pick([() => 'FEMEA JIC ' + JIC[td] + ' GIRATORIA' + ang, () => 'FEM JIC 37° ' + JIC[td] + ang, () => 'JIC FEMEA ' + JIC[td] + '"' + ang, cod])();
    case 'MJ': return JIC[td] && 'MACHO JIC ' + JIC[td] + ang;
    case 'MP': return POL[td] && pick(['MACHO NPT ' + POL[td] + '"', 'NPT ' + POL[td] + ' MACHO', 'MACHO ' + POL[td] + ' NPT']) + ang;
    case 'FP': case 'FPX': return POL[td] && 'FEMEA NPT ' + POL[td] + (T === 'FPX' ? ' GIRATORIA' : '') + ang;
    case 'FBSPORX': return POL[td] && pick(['FEMEA BSP ' + POL[td] + ' GIRATORIA', 'FEM BSP ' + POL[td] + '"', 'FEMEA ' + POL[td] + ' BSP']) + ang;
    case 'MBSPP': return POL[td] && 'MACHO BSP ' + POL[td] + '"' + ang;
    case 'FDLORX': return pick(['FEMEA DKOL ' + td, 'FEMEA DKOL' + td, 'FEM 24° TUBO ' + td + 'L']) + ang;
    case 'FDHORX': return pick(['FEMEA DKOS ' + td, 'FEM DKOS' + td, 'FEMEA 24° TUBO ' + td + 'S']) + ang;
    case 'MDL': return 'MACHO DKOL ' + td + ang;
    case 'MDH': return 'MACHO DKOS ' + td + ang;
    case 'FFORX': return ORFS[td] && pick(['FEMEA ORFS ' + ORFS[td], 'FEM ORFS ' + ORFS[td] + '"', 'FEMEA FACE PLANA ORFS ' + ORFS[td]]) + ang;
    case 'MFFOR': return ORFS[td] && 'MACHO ORFS ' + ORFS[td] + ang;
    case 'FL': return POL[td] && pick(['FLANGE SAE 61 ' + POL[td] + '"', 'FLANGE COD 61 ' + POL[td]]) + ang;
    case 'FLH': return POL[td] && pick(['FLANGE SAE 62 ' + POL[td] + '"', 'FLANGE COD 62 ' + POL[td]]) + ang;
    case 'MLSP': return pick(['PONTA LISA TUBO ' + td, 'PL' + td]) + ang;
  }
}
const base = (s) => M.comp(s).replace(/SML.*$/, '').replace(/INOX.*$/, '').replace(/^(\d+)GS/, '$1G');
const mx = Math.max(...ftm.map(r => +r.id));
const cands = ftm.filter(r => +r.id > mx * 0.6 && +r.metragem >= 100).map(r => {
  const fm = String(r.descmang || '').trim().match(/^(\d{1,2})([A-Z][A-Z0-9]*?)(SML|-|$)/); if (!fm || !NORMA[fm[2]] || !POL[+fm[1]]) return null;
  const t1 = M.comp(r.descter1 || '').replace(/INOX.*/, ''), t2 = +r.qtdter1 >= 2 ? t1 : M.comp(r.descter2 || '').replace(/INOX.*/, '');
  const m1 = t1.match(rxT), m2 = t2.match(rxT); if (!m1 || !m2 || +m1[1] !== +fm[1] || +m2[1] !== +fm[1]) return null;
  return { r, dash: +fm[1], fam: fm[2], m1, m2, t1, t2 };
}).filter(Boolean);
const N = +(process.argv[2] || 3000);
const amostra = []; for (let i = 0; i < N && cands.length; i++) amostra.push(cands[Math.floor(rnd() * cands.length)]);
const st = { itens: 0, respondidos: 0, norma_ok: 0, mangueira_familia: 0, terminais_ok: 0, comprimento_ok: 0, tudo_certo: 0 }; const conf = {}; const erros = [];
for (const c of amostra) {
  const a = terTxt(c.m1), b = terTxt(c.m2); if (!a || !b) continue;
  const met = +c.r.metragem; const len = pick([met + 'MM', met + ' MM', (met / 1000).toLocaleString('pt-BR') + 'M', 'COMP ' + met + 'MM', 'C=' + met + 'MM', (met / 1000).toLocaleString('pt-BR') + ' METROS']);
  const sz = pick([POL[c.dash] + '"', POL[c.dash], '-' + c.dash, 'DN' + DN[c.dash]]); const nm = pick(NORMA[c.fam]);
  const igual = c.t1 === c.t2;
  const d = pick([
    () => 'MANGUEIRA HIDRAULICA ' + sz + ' ' + nm + ' C/ TERMINAIS ' + a + ' X ' + b + ' ' + len,
    () => 'MANG. ' + nm + ' ' + sz + ' X ' + len + ' TERM. ' + a + ' E ' + b,
    () => 'FLEXIVEL ' + sz + ' ' + nm + ' ' + a + ' / ' + b + ' ' + len,
    () => igual ? 'MANGUEIRA ' + nm + ' ' + sz + ' TERMINAIS ' + a + ' AMBOS LADOS ' + len : 'MANGUEIRA ' + sz + ' ' + nm + ' LADO A: ' + a + ' LADO B: ' + b + ' COMPRIMENTO ' + len
  ])();
  st.itens++;
  const s = M.sugerir({ descricao: d, ref: '' }, { catalogo: cat });
  if (s.metodo !== 'regra-mangueira') { if (erros.length < 15) erros.push(['sem resposta', d]); continue; }
  st.respondidos++; conf[s.confianca] = (conf[s.confianca] || 0) + 1;
  const k = s.componentes; const fam = (k[0].apelido.match(/^\d+([A-Z][A-Z0-9]*?)(?=SML|-|$)/) || [])[1];
  if (GRUPO[fam] && GRUPO[fam] === GRUPO[c.fam]) st.norma_ok++;
  if (fam === c.fam) st.mangueira_familia++;
  const certo = [c.t1, c.t2].map(base).sort().join(), meu = k.filter(x => /terminal/.test(x.papel)).map(x => base(x.apelido)).sort().join();
  const okT = certo === meu; if (okT) st.terminais_ok++; else if (erros.length < 15) erros.push([certo + ' <> ' + meu, d]);
  if (k[0].qtd && Math.round(k[0].qtd * 1000) === met) st.comprimento_ok++;
  if (okT && GRUPO[fam] === GRUPO[c.fam]) st.tudo_certo++;
}
console.log('FTMs candidatas', cands.length); console.log(st, 'confiança', conf);
for (const e of erros) console.log(' -', e[0], '|', e[1]);
