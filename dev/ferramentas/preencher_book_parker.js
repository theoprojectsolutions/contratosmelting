// Preenche os books de mangueiras da Suzano (código Parker / ISO 12151 / código do fornecedor anterior) com Apelido / ID / Preço Melting.
// uso: node --max-old-space-size=8000 dev/ferramentas/preencher_book_parker.js <pasta>   (pasta com enviado.xlsx, e27/e948/e1010/e2995.xlsx e subpasta out/)
// Mangueira: o que a Melting já cotou para o mesmo código Parker (planilha enviada ao cliente); terminal: estilo Parker -> tipo Melting
const R = require('path').join(__dirname, '../../') + '/'; const SP = (process.argv[2] || '.').replace(/\/?$/, '/');
const X = require(R + 'js/vendor/xlsx.full.min.js'); const fs = require('fs'); const M = require(R + 'js/motor.js');
const raw = require(R + 'dev/dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
const ftm = require(R + 'dev/dados/ftm.json'); cat.definirFtm(M.agregarFtm(ftm));
const comp = M.comp;
// ---- último preço de venda (pedidos 2026) ----
const preco = new Map();
{ const txt = new TextDecoder('windows-1252').decode(fs.readFileSync(R + 'dev/dados/ped2026.csv')); const L = txt.split(/\r?\n/); const H = L[0].split(';');
  const iso = (d) => d.slice(6, 10) + d.slice(3, 5) + d.slice(0, 2);
  L.slice(1).map(l => { const c = l.split(';'); const o = {}; H.forEach((h, i) => o[h] = c[i]); return o; }).filter(r => r.CODIGOPRODUTO && Number(String(r.PRECO).replace(',', '.')) > 0)
    .sort((a, b) => iso(a.DATAEMISSAO || '').localeCompare(iso(b.DATAEMISSAO || ''))).forEach(r => preco.set(String(r.CODIGOPRODUTO).trim(), Number(String(r.PRECO).replace(',', '.')))); }
// ---- 1) mangueira: o que a Melting já respondeu para cada código Parker (planilha enviada ao cliente) ----
const env = X.read(fs.readFileSync(SP + 'enviado.xlsx')); const E = new Map();
for (const n of ['BA', 'ES', 'TLS', 'RRP', 'MA', 'SP']) for (const r of X.utils.sheet_to_json(env.Sheets[n], { header: 1, defval: '' }).slice(3)) { const ref = String(r[18]).trim(); if (r[1] && ref && !/^(FTM|MANGUEIRA|0$)/.test(ref)) E.set(String(r[1]).trim(), ref.replace(/\s+/g, '')); }
const livros = [
  { f: 'e2995', hi: 0, ni: 1, mg: 11, ct: 12, t1: 16, t2: 20, pr: 24, out: { m: [13, 14, 15], t1: [17, 18, 19], t2: [21, 22, 23], pr: [27, 28, 29] } },
  { f: 'e1010', hi: 0, ni: 1, mg: 6, ct: 7, t1: 11, t2: 15, pr: 19, out: { m: [8, 9, 10], t1: [12, 13, 14], t2: [16, 17, 18] } },
  { f: 'e948', hi: 1, ni: 2, mg: 5, ct: 6, t1: 10, t2: 14, pr: 18, out: { m: [7, 8, 9], t1: [11, 12, 13], t2: [15, 16, 17], pr: [20, 21, 22] } },
  { f: 'e27', aba: 'Plan1 (2)', hi: 0, ni: 0, mg: 6, ct: 3, t1: 9, t2: 12, pr: 15, out: { m: [7, 8, null], t1: [10, 11, null], t2: [13, 14, null], pr: [16, 17, null] } }
];
const pk = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
const votoCod = {}, votoFam = {};
for (const L of livros) { const wb = X.read(fs.readFileSync(SP + L.f + '.xlsx')); const m = X.utils.sheet_to_json(wb.Sheets[L.aba || wb.SheetNames[0]], { header: 1, defval: '' });
  for (const r of m.slice(L.hi + 1)) { const ni = String(r[L.ni]).trim(), mg = pk(r[L.mg]); const ref = E.get(ni); const z = mg.match(/^(\w+?)-(\d+)$/); if (!ref || !z) continue;
    (votoCod[mg] = votoCod[mg] || {})[ref] = (votoCod[mg][ref] || 0) + 1;
    const d = String(+z[2]); if (ref.startsWith(d)) { const fam = ref.slice(d.length); (votoFam[z[1]] = votoFam[z[1]] || {})[fam] = (votoFam[z[1]][fam] || 0) + 1; } } }
const top = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
function mangueira(code) {
  { const c0 = pk(code); if (/^[0-9A-Z]{3}\d{2}-\d+-\d+/.test(c0) || /^[246]F[A-Z0-9]+-\d+-\d+/.test(c0) || /^ISO12151/.test(c0)) { const t = terminal(c0, ''); if (t) { t.obs = 'item é terminal avulso: ' + (t.obs || ''); return t; } } }
  let c = pk(code); if (!votoCod[c] && /^(EN8|SAE|100R)/.test(c)) c = mangIso(c) || c; const z = c.match(/^(\w+?)-(\d+)$/); if (!z) return null;
  const ehMang = !/^(MP|PS|AS|AG|FS|SG|PUN|LUB|UI|UC)$/.test(z[1]);   // proteção/acessório avulso: vale o voto como veio
  const v = top(votoCod[c]).filter(([ref]) => cat.lookupApelido(ref) && (!ehMang || (ref.startsWith(String(+z[2])) && !/^\d/.test(ref.slice(String(+z[2]).length).replace(/^4X/, 'X')))));
  if (v.length) { const id = cat.lookupApelido(v[0][0]); return { id, a: v[0][0], obs: 'como já cotado para a Suzano (' + v[0][1] + 'x)' }; }
  for (const [fam, n] of top(votoFam[z[1]])) { const ap = String(+z[2]) + fam; const id = cat.lookupApelido(ap); if (id) return { id, a: ap, obs: 'família ' + z[1] + ' → ' + fam + ' (padrão das cotações Suzano)' }; }
  return { id: null, a: '', obs: 'mangueira Parker ' + z[1] + ' sem equivalente nas cotações — conferir' };
}
// ---- 2) terminal: estilo Parker -> tipo Melting ----
// estilos Parker confirmados pelo cruzamento com a norma ISO 12151 dos mesmos NIs (livro de 948 itens)
const ESTILO = { '101': 'MP', '103': 'MJ', '106': 'FJX', '137': 'FJX45', '139': 'FJX90', '141': 'FJX90', '1JC': 'FFORX', '1JS': 'FFORX', '1J7': 'FFORX45', '1J9': 'FFORX90', '1J5': 'FFORX90', '1J1': 'FFORX90', '1J0': 'MFFOR',
  '115': 'FL', '117': 'FL45', '119': 'FL90', '116': 'FL', '189': 'FL90', '16A': 'FLH', '16F': 'FLH45', '16N': 'FLH90', '1XA': 'FLC', '1XF': 'FLC45', '1XN': 'FLC90',
  '1CA': 'FDLORX', '1C9': 'FDLORX90', '192': 'FBSPORX', '1B2': 'FBSPORX', '1D9': 'FBSPORX90', '1D0': 'FBSPORX',
  // código próprio do fornecedor anterior (livro de 1010): FG = fêmea giratória JIC, FGB = fêmea BSP, FP = face plana (ORFS), F61 = flange cód. 61
  'FGRE': 'FJX', 'FG90': 'FJX90', 'FG45': 'FJX45', 'FGBRE': 'FBSPORX', 'FGB90': 'FBSPORX90', 'FPRE': 'FFORX', 'FP90': 'FFORX90', 'FP45': 'FFORX45', 'F61RE': 'FL', 'F6190': 'FL90', 'F6145': 'FL45', 'F62RE': 'FLH', 'F6290': 'FLH90', 'F6245': 'FLH45' };
const DUVIDA = new Set(['116', '189', '1CA', '1C9', '192', '1B2', '1D9', '1D0', 'FPRE', 'FP90', 'FP45', 'F61RE', 'F6190', 'F6145', 'F62RE', 'F6290', 'F6245', 'FGBRE', 'FGB90']);
// ---- ISO/EN (livro de 948) -> Parker, aprendido pelos NIs que aparecem nos dois livros ----
const isoFit = {}, isoMang = {};
{ const rd = (f, sh, hi) => { const wb = X.read(fs.readFileSync(SP + f + '.xlsx')); return X.utils.sheet_to_json(wb.Sheets[sh || wb.SheetNames[0]], { header: 1, defval: '' }).slice(hi + 1); };
  const A = new Map(); rd('e2995', null, 0).forEach(r => { const k = String(r[1]).trim(); if (!A.has(k)) A.set(k, r); });
  for (const r of rd('e948', '948', 1)) { const a = A.get(String(r[2]).trim()); if (!a) continue;
    const km = pk(r[5]).replace(/-\d+$/, ''), vm = pk(a[11]).replace(/-\d+$/, ''); if (km && vm) (isoMang[km] = isoMang[km] || {})[vm] = (isoMang[km][vm] || 0) + 1;
    for (const [x, y] of [[r[10], a[16]], [r[14], a[20]]]) { const kx = pk(x).replace(/-\d+-\d+.*$/, ''), ky = pk(y).match(/^([0-9A-Z]{3}\d{2})-/); if (kx && ky) (isoFit[kx] = isoFit[kx] || {})[ky[1]] = (isoFit[kx][ky[1]] || 0) + 1; } } }
function isoParaParker(c) {
  const m = c.match(/^(ISO12151.*?|BS5200-AGR|SAEJ476A|DIN7642)-(\d+)-(\d+)/); if (!m) return null;
  const t = top(isoFit[m[1]])[0]; return t ? t[0] + '-' + m[2] + '-' + m[3] : null;
}
function mangIso(code) { const c = pk(code); const m = c.match(/^(.+)-(\d+)$/); if (!m) return null; const t = top(isoMang[m[1]])[0]; return t ? t[0] + '-' + m[2] : null; }
function terminal(code, hoseAp) {
  let c = pk(code); if (!c) return null;
  c = isoParaParker(c) || c;
  let z = c.match(/^([0-9A-Z]{3})(\d{2})-(\d+)-(\d+)/);
  const h = !z && c.match(/^([246])(F[A-Z0-9]+?(?:RE|90|45))-(\d+)-(\d+)/);   // 2FPRE-8-6 (série 2 = tramas, 6 = espiral)
  if (h) z = [null, h[2], h[1] === '2' ? '43' : '73', h[3], h[4]];
  if (!z) return { id: null, a: '', obs: 'código ' + c + ' fora do padrão Parker — conferir' };
  const T = ESTILO[z[1]]; if (!T) return { id: null, a: '', obs: 'estilo Parker ' + z[1] + ' sem regra — conferir' };
  const hd = +z[4], td = +z[3]; const espiral = /EFG|MXG|4XP|4XH|4K|5K|6K/.test(hoseAp || '') || /^7[0-9]$/.test(z[2]);
  const bases = (espiral ? ['GS', 'G'] : ['G', 'GS']).map(g => hd + g + td + T);
  const fam = ((hoseAp || '').match(/^\d{1,2}([A-Z0-9]+?)(?:SML|X|$)/) || [])[1] || '';
  const nota = (o) => (fam && o.a.includes(fam) ? 2 : 0) - (/MODELO|MANG|RYCO|LONGO/.test(o.a) && !(fam && o.a.includes(fam)) ? 1 : 0);
  for (const b of bases) { const l = (cat._ter.get(b) || []).filter(o => !/INOX/.test(o.a)).sort((x, y) => nota(y) - nota(x)); if (l.length) return { id: l[0].id, a: l[0].a, obs: (DUVIDA.has(z[1]) ? 'estilo ' + z[1] + ' a conferir; ' : '') + (b !== bases[0] ? 'linha ' + b.match(/GS?/)[0] : '') }; }
  return { id: null, a: bases[0], obs: bases[0] + ' não cadastrado' };
}
// ---- 3) proteção: mola que a Melting mais usa nessa bitola ----
const mola = {};
for (const x of ftm) { const d = (String(x.descmang || '').match(/^(\d{1,2})/) || [])[1]; for (const [id, de] of [[x.aces1_id, x.descaces1], [x.aces2_id, x.descaces2]]) if (d && /^MOLA/.test(String(de))) { (mola[d] = mola[d] || {})[String(id)] = (mola[d][String(id)] || 0) + 1; } }
function protecao(code, hd) { const c = pk(code); if (!c || /^Ñ|^N$|^NAO/.test(c)) return null; const t = top(mola[String(hd)]).find(([id]) => cat.get(id)); if (!t) return { id: null, a: '', obs: 'proteção ' + c + ' — conferir' }; const p = cat.get(t[0]); return { id: p.id, a: p.a, obs: 'mola mais usada pela Melting na bitola ' + hd + ' (proteção ' + c + ') — conferir' }; }
// ---- preencher ----
const resumo = {};
for (const L of livros) {
  const wb = X.read(fs.readFileSync(SP + L.f + '.xlsx'), { cellStyles: true }); const aba = L.aba || wb.SheetNames[0]; const ws = wb.Sheets[aba];
  const m = X.utils.sheet_to_json(ws, { header: 1, defval: '' }); const st = resumo[L.f] = { linhas: 0, mangueira: 0, t1: 0, t2: 0, prot: 0, t_total: 0 };
  const obsCol = m[L.hi].length; X.utils.sheet_add_aoa(ws, [['OBS MELTING (motor)']], { origin: { r: L.hi, c: obsCol } });
  m.slice(L.hi + 1).forEach((r, i) => {
    const row = L.hi + 1 + i; if (!String(r[L.mg]).trim()) return; st.linhas++;
    const put = (cols, x) => { if (!x || !cols) return; const v = [x.a || '', x.id || '', x.id && preco.has(String(x.id)) ? preco.get(String(x.id)) : '']; cols.forEach((c, k) => { if (c != null) X.utils.sheet_add_aoa(ws, [[v[k]]], { origin: { r: row, c } }); }); };
    const mg = mangueira(r[L.mg]); put(L.out.m, mg); if (mg && mg.id) st.mangueira++;
    const hd = (pk(r[L.mg]).match(/-(\d+)$/) || [])[1];
    const t1 = terminal(r[L.t1], mg && mg.a), t2 = terminal(r[L.t2], mg && mg.a); put(L.out.t1, t1); put(L.out.t2, t2);
    for (const t of [t1, t2]) if (t) { st.t_total++; if (t.id) t.id && (t === t1 ? st.t1++ : st.t2++); }
    const pr = L.out.pr && protecao(r[L.pr], hd); put(L.out.pr, pr); if (pr && pr.id) st.prot++;
    const obs = [mg && 'Mang: ' + mg.obs, t1 && t1.obs && 'T1: ' + t1.obs, t2 && t2.obs && 'T2: ' + t2.obs, pr && pr.obs && 'Prot: ' + pr.obs].filter(Boolean).join(' | ');
    X.utils.sheet_add_aoa(ws, [[obs]], { origin: { r: row, c: obsCol } });
  });
  fs.writeFileSync(SP + 'out/' + L.f + '_preenchido.xlsx', X.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
console.log(resumo);
module.exports = { mangueira, terminal };
