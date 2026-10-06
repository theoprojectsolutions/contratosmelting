// Benchmark: pedido com código Parker (mangueira 471TC-6 + terminais 10643-6-6) -> FTM montada pelo motor.
// Gabarito: books de mangueira da Suzano já preenchidos pela ferramenta dev/ferramentas/preencher_book_parker.js
// (mangueira = o que a Melting respondeu ao cliente; terminais = estilo Parker -> tipo Melting).
// Uso: node dev/testes/benchmark_parker.js   (lê dev/dados/parker/e2995_preenchido.xlsx e e1010_preenchido.xlsx)
const fs = require('fs');
const X = require('../../js/vendor/xlsx.full.min.js');
const M = require('../../js/motor.js');
const raw = require('../dados/cat.json');
const cat = new M.Catalogo(raw.map(r => ({ id: r[0], descricao: r[1], apelido: r[2], situacao: r[3], origem: r[4], um: r[5], familia: r[6], ipi: +r[7] })));
cat.definirFtm(M.agregarFtm(require('../dados/ftm.json')));
const livros = [{ f: 'e2995', hi: 0, mg: 11, ct: 12, t1: 16, t2: 20, om: 14, o1: 18, o2: 22 }, { f: 'e1010', hi: 0, mg: 6, ct: 7, t1: 11, t2: 15, om: 9, o1: 13, o2: 17 }];
const st = { linhas: 0, parker: 0, respondidos: 0, mang_id: 0, mang_familia: 0, mang_gab: 0, ter_ok: 0, ter_tipo_ok: 0, ter_gab: 0, tudo_certo: 0, gab_completo: 0 };
const erros = [];
// mesma família de mangueira (12EFG6KSML-HYLIK ~ 12EFG6KSML-TRANSPOWER) / mesmo terminal base (12GS12FJX ~ 12GS12FJXSMLMODELOGATESEFG5K)
const ap = (id) => { const p = cat.get(String(id)); return p ? p.a : ''; };
const famK = (id) => { const x = M.famMang(ap(id)); return x ? x[1] + x[2] : ap(id); };
const terK = (id) => (ap(id).match(/^\d{1,2}GS?\d{1,2}[A-Z]+?(?:90|45)?(?=SML|$|[^A-Z])/) || [ap(id)])[0];
for (const L of livros) {
  const p = __dirname + '/../dados/parker/' + L.f + '_preenchido.xlsx'; if (!fs.existsSync(p)) continue;
  const wb = X.read(fs.readFileSync(p)); const m = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  for (const r of m.slice(L.hi + 1)) {
    const mg = String(r[L.mg]).replace(/\s+/g, ''); if (!mg) continue; st.linhas++;
    const d = 'MANGUEIRA ' + mg + ' ' + String(r[L.t1]).replace(/\s+/g, '') + ' ' + String(r[L.t2]).replace(/\s+/g, '') + (r[L.ct] ? ' CT ' + r[L.ct] : '');
    if (!M.parkerParaMelting(d, cat) || M.parkerParaMelting(d, cat).soTerminais) continue; st.parker++;
    const s = M.sugerir({ descricao: d, ref: '' }, { catalogo: cat });
    const c = s.componentes || []; if (c.length) st.respondidos++;
    const gm = String(r[L.om] || ''), g1 = String(r[L.o1] || ''), g2 = String(r[L.o2] || '');
    const cm = c.find(x => x.papel === 'mangueira'), ct = c.filter(x => /^terminal/.test(x.papel)).map(x => String(x.id || ''));
    if (gm) { st.mang_gab++; if (cm && String(cm.id) === gm) st.mang_id++; if (cm && famK(cm.id) === famK(gm)) st.mang_familia++; }
    const ctk = ct.map(terK);
    for (const g of [g1, g2].filter(Boolean)) { const k = ctk.indexOf(terK(g)); if (k >= 0) { st.ter_tipo_ok++; ctk.splice(k, 1); } }
    let tOk = true;
    for (const g of [g1, g2].filter(Boolean)) { st.ter_gab++; const k = ct.indexOf(g); if (k >= 0) { st.ter_ok++; ct.splice(k, 1); } else tOk = false; }
    if (gm && g1 && g2) { st.gab_completo++; if (cm && String(cm.id) === gm && tOk) st.tudo_certo++; else if (erros.length < 25) erros.push(d + ' | gab ' + [gm, g1, g2].join(',') + ' | motor ' + c.map(x => x.id + ':' + x.apelido).join(',')); }
  }
}
console.log(st);
erros.forEach(e => console.log(' - ' + e));
