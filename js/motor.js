// =====================================================================
// MELTING · MOTOR DE RESPOSTA DE PLANILHAS
// ---------------------------------------------------------------------
// Sugere o ID do cadastro Melting para cada item de uma planilha de
// cliente. É a mesma lógica usada nas análises da Arcelor / Suzano /
// Trivium, portada para rodar direto no navegador:
//
//   1. De-para do cliente  (código do cliente já respondido/aprovado antes)
//   2. Histórico de vendas (mesmo código do cliente já vendido)
//   3. REF / apelido idêntico ao cadastro
//   4. Regras de terminal e adaptador hidráulico (monta o apelido SML)
//   5. Equivalente ao REF no cadastro (similaridade + travas)
//   6. Padrão aprendido (item parecido já aprovado, troca só a bitola)
//   7. Similaridade pela descrição (só com travas e nota alta)
//
// Travas aplicadas em toda sugestão por similaridade: material (inox /
// latão / aço), padrão de rosca (NPT / BSP / JIC / UNF), tipo de peça
// (TEE, cotovelo, bucha, PVC...), medidas do REF e prefixo de conexão
// de tubo (UMI / UMA / JMI...).
//
// Arquivo sem dependências: funciona no navegador (window.Motor) e no
// Node (module.exports) — é assim que ele é testado.
// =====================================================================
(function (root) {
  'use strict';

  // ---------------- utilidades de texto ----------------
  function deacc(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function up(s) { return deacc(s).toUpperCase().replace(/ /g, ' '); }
  function comp(s) { return up(s).replace(/[^A-Z0-9/]/g, ''); }
  function limpaApelido(s) { return String(s || '').replace(/"/g, '').trim(); }

  // normalização de bitolas (hoseparse.norm)
  function norm(t) {
    t = up(t);
    t = t.replace(/(?<![\d,.])(\d)\.(2|4|8|16|32|64)(?=\s*(POL|"|”|''|UNF|NPT|BSP|X|\b))/g, '$1/$2');
    t = t.replace(/(\d)\.(\d\/\d+)/g, '$1 $2');
    t = t.replace(/(\d)-(\d\/\d+)\s*(POL|")/g, '$1 $2$3');
    return t;
  }
  function tofrac(s) {
    if (s == null) return null;
    const parts = String(s).trim().split(/\s+/);
    let tot = 0;
    for (const p of parts) {
      if (!p) continue;
      if (p.includes('/')) {
        const [a, b] = p.split('/').map(Number);
        if (!isFinite(a) || !isFinite(b) || b === 0) return null;
        tot += a / b;
      } else {
        const n = Number(p);
        if (!isFinite(n)) return null;
        tot += n;
      }
    }
    return tot;
  }
  function frac(s) { return s ? tofrac(String(s).replace(/-/g, ' ')) : null; }

  // tabelas de bitola (chave = polegada, valor = dash)
  const T = (pairs) => pairs.map(([k, v]) => [k, v]);
  const JIC = T([[7/16,4],[1/2,5],[9/16,6],[3/4,8],[7/8,10],[1+1/16,12],[1+3/16,14],[1+5/16,16],[1+5/8,20],[1+7/8,24],[2+1/2,32]]);
  const ORFS = T([[9/16,4],[11/16,6],[13/16,8],[1,10],[1+3/16,12],[1+7/16,16],[1+11/16,20],[2,24]]);
  const PIPE = T([[1/8,2],[1/4,4],[3/8,6],[1/2,8],[3/4,12],[1,16],[1.25,20],[1.5,24],[2,32],[2.5,40],[3,48]]);
  const DASH_F = T([[1/8,2],[3/16,3],[1/4,4],[5/16,5],[3/8,6],[1/2,8],[5/8,10],[3/4,12],[1,16],[1.25,20],[1.5,24],[2,32],[2.5,40],[3,48]]);
  const DINL = {12:6,14:8,16:10,18:12,22:15,26:18,30:22,36:28,45:35,52:42};
  const DINS = {14:6,16:8,18:10,20:12,22:14,24:16,30:20,36:25,42:30,52:38};
  const THREAD_ONLY = [7/16,9/16,7/8,1+1/16,1+3/16,1+5/16,1+5/8,1+7/8,11/16,13/16,1+7/16,1+11/16];
  const PIPE_KEYS = PIPE.map(p => p[0]);

  function nearest(tab, v, tol) {
    if (v == null) return null;
    tol = tol == null ? 0.02 : tol;
    let best = null, bd = Infinity;
    for (const [k, d] of tab) { const x = Math.abs(k - v); if (x < bd) { bd = x; best = d; } }
    return bd <= tol ? best : null;
  }

  // ---------------- leitura de bitolas e pontas (hoseparse.sizes / side_spec) ----------------
  function sizes(s) {
    let s2 = s.replace(/\b(90|45|37|60|30)\s*(GR|º|°|GRAUS)?\b/g, '').replace(/JIC ?37/g, 'JIC');
    const out = [];
    const rx = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[,.]\d+)?)\s*(?:"|'')?\s*(X\s*\d+\s*(?:FPP|UNF|UN)?|UNF|UNS|UN\b|NPTF?|BSPP?|BSPT|POL|"|MM|FPP)?/g;
    let m;
    while ((m = rx.exec(s2)) !== null) {
      if (m[0] === '') { rx.lastIndex++; continue; }
      const raw = m[1];
      let v = (raw.includes('/') || raw.trim().includes(' ')) ? tofrac(raw.replace(',', '.')) : null;
      if (v == null) { v = Number(raw.replace(',', '.')); if (!isFinite(v)) continue; }
      out.push([v, (m[2] || '').replace(/ /g, ''), raw]);
    }
    return out;
  }

  function sideSpec(s, full, hd, P) {
    s = ' ' + s.trim() + ' ';
    const ang = /90/.test(s) ? 90 : (/\b45/.test(s) ? 45 : 0);
    const male = /MACHO|\bMAC\b|\bMC\b/.test(s) && !/FEM|\bFM\b|\bF GIR/.test(s);
    const st = s.trim();
    let m = s.match(/\b1(00|90|45)FJ-(\d+)-(\d+)/) || full.match(/\b1(00|90|45)FJ-(\d+)-(\d+)/);
    if (m && !/FLA|LISA|DKO|BSP|NPT/.test(s)) return { T: 'FJX', td: +m[2], ang: { '00': 0, '90': 90, '45': 45 }[m[1]], txt: st };
    m = s.match(/\bJIC\s*-?(\d{1,2})\b(?!\s*\/)/);
    if (m && [4,5,6,8,10,12,16,20,24,32].includes(+m[1])) return { T: male ? 'MJ' : 'FJX', td: +m[1], ang, txt: st };
    if (/FLA/.test(s)) {
      const sz = sizes(s).filter(x => ['POL', '"', ''].includes(x[1]) && x[0] > 0.4 && x[0] <= 4);
      const td = sz.length ? nearest(PIPE, sz[0][0]) : hd;
      const code62 = /COD\.? ?62|CODE ?62|SAE ?62|\b62\b|6000/.test(s) || /COD\.? ?62|SAE ?62|CODE ?62/.test(full) || !!(P && P >= 4500);
      return { T: code62 ? 'FLH' : 'FL', td, ang, txt: st };
    }
    if (/PONTA LISA|PT LISA|\bLISA\b/.test(s)) {
      const sz = sizes(s).filter(x => x[1] === 'MM' || (x[1] === '' && x[0] >= 4 && x[0] <= 60 && Number.isInteger(x[0])));
      return { T: 'MLSP', td: sz.length ? Math.trunc(sz[0][0]) : null, ang, txt: st };
    }
    const metric = /DKO|METRIC|\bM\s?\d{2}\s*X|TB ?\d+|\b\d{1,2}\s?[LS]\b|DN ?\d+/.test(s);
    const sz = sizes(s);
    const mmv = sz.filter(x => x[1] === 'MM' && x[0] >= 6 && x[0] <= 42);
    if (metric || (mmv.length && !/UNF|NPT|BSP|JIC|POL/.test(s))) {
      let tb = s.match(/TB ?(\d+)/) || s.match(/\b(\d{1,2})\s?([LS])\b/) || s.match(/DN ?\d+\/(\d+)/) || (s + ' ' + full).match(/\bT ?(\d{2})\b/);
      const mm = s.match(/\bM\s?(\d{2})/);
      let serie = null, td = null;
      if (tb) { td = +tb[1]; serie = tb[2] && /^[LS]$/.test(tb[2]) ? tb[2] : null; }
      else if (mm) {
        const th = +mm[1];
        if ([20, 24, 42].includes(th)) serie = 'S';
        else if ([26, 45, 12].includes(th)) serie = 'L';
        else serie = (P && P >= 4000) ? 'S' : 'L';
        td = (serie === 'S' ? DINS : DINL)[th] || null;
      } else if (mmv.length) td = Math.trunc(mmv[0][0]);
      if (serie == null && td != null) serie = [14, 16, 20, 25, 30, 38].includes(td) ? 'S' : 'L';
      const Tt = male ? (serie === 'S' ? 'MDH' : 'MDL') : (serie === 'S' ? 'FDHORX' : 'FDLORX');
      return { T: Tt, td, ang, txt: st };
    }
    let std = null;
    if (/ORFS|\bORS\b|SEDE PLANA|FACE PLANA|FACE SEAL|O-?RING FACE/.test(s)) std = 'ORFS';
    else if (/BSP/.test(s)) std = 'BSP';
    else if (/NPT/.test(s)) std = 'NPT';
    else if (/JIC|UNF|UNS|\bUN\b|X\s?\d{2}\s?FPP|SEDE 37/.test(s)) std = 'JIC';
    else if (/ORFS|FACE SEAL|SEDE PLANA/.test(full)) std = 'ORFS';
    else if (/JIC/.test(full)) std = 'JIC';
    else if (/BSP/.test(full)) std = 'BSP';
    else if (/NPT/.test(full)) std = 'NPT';
    const cand = sz.filter(x => x[0] && x[0] > 0.1 && x[0] <= 3 && (x[2].includes('/') || ['POL', '"', 'UNF', 'UNS', 'NPT', 'NPTF', 'BSP', 'BSPP', 'BSPT'].includes(x[1]) || x[1].startsWith('X')));
    if (!cand.length) return { T: { ORFS: 'FFORX', BSP: 'FBSPORX', NPT: 'MP', JIC: 'FJX' }[std] || null, td: null, ang, txt: st };
    const [v, unit] = cand[0];
    const threadunit = unit === 'UNF' || unit === 'UNS' || unit.startsWith('X');
    const isThreadOnly = THREAD_ONLY.some(k => Math.abs(v - k) < 0.01);
    if (std === 'ORFS') {
      let td = (threadunit || isThreadOnly || !PIPE_KEYS.includes(v)) ? nearest(ORFS, v) : nearest(PIPE, v);
      if (td == null) td = nearest(ORFS, v);
      return { T: male ? 'MFFOR' : 'FFORX', td, ang, txt: st };
    }
    if (std === 'BSP') return { T: male ? 'MBSPP' : 'FBSPORX', td: nearest(PIPE, v), ang, txt: st };
    if (std === 'NPT') return { T: (/FEM/.test(s) && !/GIR/.test(s)) ? 'FP' : (!/FEM/.test(s) ? 'MP' : 'FPX'), td: nearest(PIPE, v), ang, txt: st };
    let td = (threadunit || isThreadOnly) ? nearest(JIC, v) : nearest(PIPE, v);
    if (td == null) td = nearest(JIC, v);
    return { T: male ? 'MJ' : 'FJX', td, ang, txt: st, inf: std == null };
  }

  // ---------------- regras de terminal / adaptador (fit.py) ----------------
  function terminalRule(det, lookup) {
    const t = norm(det);
    if (!t.startsWith('TERMINAL')) return null;
    const m = t.match(/DIAMETRO MANGUEIRA\s*:?\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+)\s*POL/);
    if (!m) return null;
    const hd = nearest(DASH_F, frac(m[1]));
    const r = t.match(/DIAMETRO\/ROSCA\s*:?\s*([^ ]+(?: [^ ]+)?)/);
    if (!r || !hd) return null;
    const angm = t.match(/ANGULO\/RAIO\s*:?\s*(45|90)/);
    const ang = angm ? angm[1] : '';
    const female = t.startsWith('TERMINAL FEM');
    const spec = sideSpec((female ? 'FEMEA GIRATORIA ' : 'MACHO ') + r[1] + (ang ? ' ' + ang : '') +
      (/ORFS|FACE|SEAL-LOK|SEAL LOK/.test(t) ? ' SEDE PLANA' : ''), t, hd, null);
    if (!spec || !spec.T || !spec.td) return null;
    const a = spec.ang ? String(spec.ang) : '';
    const codes = [`${hd}G${spec.td}${spec.T}${a}SML`, `${hd}G${spec.td}${spec.T}${a}`];
    for (const c of codes) { const id = lookup(c); if (id) return { id, apelido: c }; }
    return null;
  }

  function endSpec(seg) {
    seg = seg.trim();
    const m = seg.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+)\s*(UNF|UNS|NPTF|NPT|BSPP|BSPT|BSP|JIC|ORFS|MM)?/);
    if (!m) return null;
    const v = frac(m[1]);
    let std = null;
    if (/ORFS|FACE|SEDE PLANA/.test(seg)) std = 'ORFS';
    else if (/BSP/.test(seg)) std = 'BSP';
    else if (/NPT/.test(seg)) std = 'NPT';
    else if (/JIC|37/.test(seg)) std = 'JIC';
    else if (/UNF|UNS|ORING|O-RING|BOSS/.test(seg)) std = 'UNF';
    let d;
    if (std === 'JIC') d = nearest(JIC, v);
    else if (std === 'ORFS') d = nearest(ORFS, v);
    else if (std === 'BSP' || std === 'NPT') d = nearest(PIPE, v);
    else if (std === 'UNF') { d = nearest(JIC, v); std = 'BOSS'; }
    else return null;
    return { std, d };
  }
  const TYPEM = { JIC: 'MJ', NPT: 'MP', BSP: 'MBSPP', ORFS: 'MFFOR', BOSS: 'MB' };
  const TYPEF = { JIC: 'FJX', NPT: 'FP', BSP: 'FBSPP', ORFS: 'FFORX', BOSS: 'FB' };
  function adapterRule(det, lookup) {
    const t = norm(det);
    if (!/^(ADAPTADOR|COTOVELO|NIPLE|UNIAO|TE|CONECTOR|BUJAO|TAMPAO|PLUGUE)\b/.test(t)) return null;
    if (/TUB|FOFO|GALV|FERRO|MALEAV|TUBO/.test(t.slice(0, 120))) return null;
    const m = t.match(/CONEXAO\s*:?\s*(.+?)(?:\s(?:ACESSORIOS|F\/R|NORMA|MATERIAL|NORMAL|APLICACAO|USO)|$)/) ||
              t.match(/DIMENSOES\s*:?\s*(.+?)(?:\s(?:APLICACAO|F\/R|MATERIAL)|$)/);
    if (!m) return null;
    const parts = m[1].split(/(?<=[A-Z0-9])X(?=\s*\d)/);
    const angm = t.match(/ANGULO\s*:?\s*(45|90)/);
    const ang = angm ? angm[1] : ((t.slice(0, 12).includes('COTOVELO') && !t.slice(0, 40).includes('45')) ? '90' : '');
    const male = /MACH/.test(t.slice(0, 25)), fem = /FEM/.test(t.slice(0, 25));
    if (parts.length < 2) return null;
    const ends = [endSpec(parts[0]), endSpec(parts[1])];
    if (!ends[0] || !ends[1] || ends[0].d == null || ends[1].d == null) return null;
    const TT = (fem && !male) ? TYPEF : TYPEM;
    const c1 = `${ends[0].d}${TT[ends[0].std]}`, c2 = `${ends[1].d}${TT[ends[1].std]}`;
    const codes = [c1 + c2 + ang, c2 + c1 + ang, c1 + c2 + (t.slice(0, 12).includes('COTOVELO') ? (ang || '90') : ''), c2 + c1];
    for (const c of codes) { const id = lookup(c); if (id) return { id, apelido: c }; }
    return null;
  }

  // ---------------- travas (arcfill2.strict) ----------------
  function toks(s) {
    s = comp(s).replace(/1\.1\//g, '11/');
    const out = new Set(s.match(/\d+\/\d+/g) || []);
    (s.match(/(?<![\d/])\d{1,3}(?:[LS])?(?![\d/])/g) || []).forEach(x => out.add(x));
    return out;
  }
  function materialOk(cand, ref, det) {
    const c = up(cand), x = up((ref || '') + ' ' + (det || ''));
    const inox = /INOX|AISI|316|304/.test(x);
    // inox é caro: só aceita candidato que diga claramente que é inox
    if (inox && !/INOX|316|304|FSS/.test(c)) return false;
    if (!inox && /INOX|FSS/.test(c)) return false;
    if (inox && /LATAO/.test(c)) return false;
    // latão pedido: recusa só se o candidato disser outro material
    if (/LATAO/.test(x) && !inox && /\bACO\b|ZINC|GALV|PVC|NYLON|POLIPROP/.test(c) && !/LATAO|LAT\b/.test(c)) return false;
    return true;
  }
  // JIC e ORFS usam rosca UNF — ficam no mesmo grupo
  const THR = { NPT: /NPT|\dMP|\dFP|NPTF/, BSP: /BSP|\bG\s?\d/, UNF: /JIC|\dMJ|\dFJ|UNF|ORB|\dMO|ORFS|\bORS\b|FFOR/ };
  function threads(s) {
    s = up(s); const o = new Set();
    for (const k in THR) if (THR[k].test(s)) o.add(k);
    return o;
  }
  const TYP_ALIAS = { TE: 'TEE', JOELHO: 'COTOVELO', PLUG: 'BUJAO', TAMPAO: 'BUJAO', BRACADEIRA: 'ABRACADEIRA' };
  const TYP_LIST = ['TEE', 'TE', 'COTOVELO', 'JOELHO', 'CURVA', 'BUCHA', 'NIPLE', 'LUVA', 'TAMPAO', 'PLUG', 'BUJAO', 'CRUZETA', 'ABRACADEIRA', 'VALVULA', 'ENGATE', 'PVC', 'CAP', 'BRACADEIRA'];
  function types(s) {
    s = up(s); const o = new Set();
    for (const t of TYP_LIST) if (new RegExp('\\b' + t + '\\b').test(s)) o.add(TYP_ALIAS[t] || t);
    if (/PVC|POLICLORETO/.test(s)) o.add('PVC');
    return o;
  }
  const sub = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };
  const uni = (a, arr) => new Set([...a, ...arr]);
  const PREFIXOS_TUBO = ['UMI', 'UMA', 'UMC', 'UFA', 'UFI', 'UFC', 'USA', 'UOA', 'UDA', 'UDC', 'UDI', 'UCA', 'PI', 'JII', 'JIA', 'JIC', 'TII', 'TIA', 'TIC', 'CII', 'CIA', 'JMI', 'JMA', 'JMC', 'TMI', 'TMA', 'PL', 'OBA', 'OBI'];

  // todas as polegadas do candidato precisam estar escritas no pedido
  function fracs(s) { return new Set(comp(norm(s)).match(/\d+\/\d+/g) || []); }
  function medidasDescricaoOk(prod, det) {
    const fc = fracs(prod.d + ' ' + prod.a), fd = fracs(det);
    for (const f of fc) if (!fd.has(f)) return false;
    return true;
  }
  const MARCAS = ['FASTER', 'STAUBLI', 'PARKER', 'GATES', 'TUPY', 'DYNAMICS', 'HIMAFLEX', 'GOODYEAR', 'EATON', 'MANULI', 'ALFAGOMMA', 'SWAGELOK', 'HOLDTIGHT', 'ACOPLEX', 'SNAP-TITE', 'SNAPTITE', 'HANSEN', 'PARFLEX', 'KANAFLEX', 'SIEGLING', 'HABASIT', 'NITTA', 'RYCO', 'TOYOX'];
  function marcas(s) { const u = up(s); return new Set(MARCAS.filter(m => u.includes(m))); }

  // devolve null se passou, ou o motivo (texto) da recusa
  function travas(prod, ref, det, opts) {
    opts = opts || {};
    const c = prod.d + ' ' + prod.a;
    if (opts.material !== false && !materialOk(c, ref, det)) return 'material diferente';
    const x = (ref || '') + ' ' + det;
    if (opts.rosca !== false) {
      const refFix = ref ? up(ref).replace(/BPS/g, 'BSP') : '';
      const src = (ref && threads(refFix).size) ? refFix : det;
      const tx = threads(src), tc = threads(c);
      if (tx.size && tc.size && !sub(tc, tx)) return 'padrão de rosca diferente';
    }
    if (opts.tipo !== false) {
      // tipo pedido no REF tem que aparecer no candidato; tipo escrito no
      // candidato tem que ter sido pedido (REF ou descrição)
      const tyRef = ref ? types(ref) : new Set(), tyAll = types(x), tyc = types(c);
      if (tyc.size && tyRef.size && !sub(tyRef, uni(tyc, ['PVC']))) return 'tipo de peça diferente';
      if (tyc.size && !sub(tyc, uni(tyAll, ['CAP']))) return 'tipo de peça diferente';
      if (tyc.has('PVC') && !tyAll.has('PVC')) return 'material (PVC) diferente';
      if (tyRef.has('PVC') && !tyc.has('PVC')) return 'material (PVC) diferente';
    }
    if (ref) {
      const mr = marcas(ref), mc = marcas(c);
      if (mr.size && mc.size && ![...mr].some(m => mc.has(m))) return 'marca diferente';
      const rr = comp(ref), ca = comp(prod.a);
      const n1 = (rr.match(/\d+(?:MJ|FJ|MP|FP|MBSPP|MO)/g) || []).length;
      const n2 = (ca.match(/\d+(?:MJ|FJ|MP|FP|MBSPP|MO)/g) || []).length;
      if (n1 >= 2 && n2 && n1 !== n2) return 'número de pontas diferente';
      if (n1 >= 2 && n2 === 0) return 'número de pontas diferente';
      // conexões de tubo (UMI 16S, CII 10...): prefixo e número do tubo têm que bater
      const m1 = rr.match(/^([A-Z]{2,4})(\d+)/), m2 = ca.match(/^([A-Z]{2,5})(\d+)/);
      if (m1 && m2 && (PREFIXOS_TUBO.includes(m1[1]) || PREFIXOS_TUBO.includes(m2[1].replace(/^C/, '')))) {
        if (m2[1] !== m1[1] && m2[1] !== 'C' + m1[1]) return 'tipo de conexão de tubo diferente';
        if (m1[2] !== m2[2]) return 'diâmetro do tubo diferente';
      }
      const C = up(prod.d);
      // engate camlock (AE, CI, DC...): o código tem que aparecer no candidato
      const cl = rr.match(/^(ENGATE)?(A|B|C|D|E|F|DC|DP)(E|I)?(?=\d)/);
      if (cl && cl[2] + (cl[3] || '') !== '' && /ENGATE|CAMLOCK/.test(C + ' ' + up(det)) && (cl[3] || cl[1])) {
        const code = cl[2] + (cl[3] || '');
        if (!new RegExp('\\b' + code + '\\b').test(C)) return 'tipo de engate diferente';
      }
      // macho x fêmea escrito no REF
      const R = up(ref);
      if (/FEMEA|\bFEM\b/.test(R) && !/MACHO/.test(R) && /MACHO/.test(C) && !/FEMEA|\bFEM\b|\bFF\b/.test(C)) return 'macho/fêmea diferente';
      if (/MACHO/.test(R) && !/FEMEA|\bFEM\b/.test(R) && /FEMEA|\bFEM\b/.test(C) && !/MACHO|\bMF\b/.test(C)) return 'macho/fêmea diferente';
      for (const d of String(ref || '').match(/\d+,\d/g) || []) {
        if (!c.includes(d) && !c.includes(d.replace(',', '.'))) return 'medida ' + d + ' não confere';
      }
      if (opts.medidas !== false) {
        const rt = toks(ref);
        if (rt.size && !sub(rt, toks(c))) return 'medidas do REF não conferem';
      }
    }
    return null;
  }

  // ---------------- índice de similaridade (trigramas com peso tf-idf) ----------------
  function grams(s) {
    // trigramas + quadrigramas do texto compacto (equivalente ao char 3-5gram do Python)
    const out = new Map();
    for (const w of s.split(' ')) {
      if (!w) continue;
      const p = ' ' + w + ' ';
      for (let n = 3; n <= 4; n++) for (let i = 0; i + n <= p.length; i++) {
        const g = p.substr(i, n); out.set(g, (out.get(g) || 0) + 1);
      }
    }
    return out;
  }

  function Catalogo(produtos) {
    // produtos: [{id, descricao, apelido, situacao, origem, um, familia, ipi}]
    this.lista = [];
    this.byId = new Map();
    this.byApelido = new Map();
    for (const p of produtos) {
      const id = String(p.id);
      if (this.byId.has(id)) continue;
      const o = {
        id, d: up(p.descricao || '').replace(/\s+/g, ' ').trim(), a: up(limpaApelido(p.apelido)).replace(/ /g, ''),
        ativo: (p.situacao || 'A') === 'A', origem: p.origem || '', um: p.um || '', familia: p.familia || '', ipi: p.ipi
      };
      this.byId.set(id, o);
      if (!o.ativo) continue;
      const ca = comp(o.a);
      if (ca && !this.byApelido.has(ca)) this.byApelido.set(ca, id);
      this.lista.push(o);
    }
    this._index = null;
  }
  Catalogo.prototype.lookupApelido = function (codigo) { return this.byApelido.get(comp(codigo)) || null; };
  Catalogo.prototype.get = function (id) { return this.byId.get(String(id)) || null; };
  Catalogo.prototype.construirIndice = function () {
    if (this._index) return this._index;
    const N = this.lista.length;
    const gid = new Map(); const df = [];
    const docs = new Array(N);
    for (let i = 0; i < N; i++) {
      const o = this.lista[i];
      const g = grams(comp(o.d) + ' ' + comp(o.a));
      const arr = [];
      for (const [k, tf] of g) {
        let j = gid.get(k);
        if (j === undefined) { j = df.length; gid.set(k, j); df.push(0); }
        df[j]++; arr.push(j, tf);
      }
      docs[i] = arr;
    }
    const idf = new Float32Array(df.length);
    for (let j = 0; j < df.length; j++) idf[j] = Math.log((1 + N) / (1 + df[j])) + 1;
    // listas invertidas
    const cnt = new Int32Array(df.length + 1);
    for (const arr of docs) for (let k = 0; k < arr.length; k += 2) cnt[arr[k] + 1]++;
    for (let j = 0; j < df.length; j++) cnt[j + 1] += cnt[j];
    const post = new Int32Array(cnt[df.length]); const wts = new Float32Array(cnt[df.length]);
    const fill = cnt.slice();
    const norm2 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const arr = docs[i]; let s = 0;
      for (let k = 0; k < arr.length; k += 2) { const w = (1 + Math.log(arr[k + 1])) * idf[arr[k]]; s += w * w; }
      norm2[i] = Math.sqrt(s) || 1;
      for (let k = 0; k < arr.length; k += 2) {
        const j = arr[k]; const w = (1 + Math.log(arr[k + 1])) * idf[j] / norm2[i];
        post[fill[j]] = i; wts[fill[j]] = w; fill[j]++;
      }
    }
    this._index = { gid, idf, cnt, post, wts, N };
    return this._index;
  };
  // devolve [{prod, score}] ordenado (cosseno 0..1)
  Catalogo.prototype.buscar = function (texto, k) {
    k = k || 15;
    const ix = this.construirIndice();
    const g = grams(comp(texto).replace(/\//g, '/'));
    const q = []; let qn = 0;
    for (const [gram, tf] of g) {
      const j = ix.gid.get(gram); if (j === undefined) continue;
      const len = ix.cnt[j + 1] - ix.cnt[j];
      if (ix.N > 1000 && len > ix.N * 0.25) continue; // trigramas comuns demais não ajudam
      const w = (1 + Math.log(tf)) * ix.idf[j]; q.push([j, w]); qn += w * w;
    }
    // termos sem índice também contam no tamanho do vetor da consulta
    for (const [gram, tf] of g) if (!ix.gid.has(gram)) { const w = (1 + Math.log(tf)) * Math.log(1 + ix.N); qn += w * w; }
    qn = Math.sqrt(qn) || 1;
    const acc = new Map();
    for (const [j, w] of q) {
      for (let p = ix.cnt[j]; p < ix.cnt[j + 1]; p++) {
        const i = ix.post[p]; acc.set(i, (acc.get(i) || 0) + w * ix.wts[p]);
      }
    }
    const top = [];
    for (const [i, s] of acc) {
      const sc = s / qn;
      if (top.length < k) { top.push([i, sc]); if (top.length === k) top.sort((a, b) => b[1] - a[1]); }
      else if (sc > top[k - 1][1]) { top[k - 1] = [i, sc]; top.sort((a, b) => b[1] - a[1]); }
    }
    top.sort((a, b) => b[1] - a[1]);
    return top.map(([i, s]) => ({ prod: this.lista[i], score: s }));
  };

  // ---------------- padrão aprendido (nn.py) ----------------
  const DASH_S = { '1/8': 2, '3/16': 3, '1/4': 4, '5/16': 5, '3/8': 6, '1/2': 8, '5/8': 10, '3/4': 12, '7/8': 14, '1': 16, '1.1/4': 20, '1.1/2': 24, '1.3/4': 28, '2': 32, '2.1/2': 40, '3': 48, '4': 64 };
  function bitolaCliente(t) {
    t = norm(t);
    const m = t.match(/DIAMETRO(?: INTERNO| NOMINAL)?\s*:?\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+)\s*(POL|")/) || t.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+)\s*(POL|")/);
    if (!m) return null;
    const s = m[1].trim().replace(/\s+/g, '.');
    return DASH_S[s] ? s : null;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function templateDesc(desc, size) {
    for (const s of [size, size.replace('.', ' '), size.replace('.', '-')]) {
      const rx = new RegExp('(?<![\\d/.])' + esc(s) + '(?![\\d/])');
      if (rx.test(desc)) return desc.replace(rx, '{S}');
    }
    return null;
  }
  function templateApelido(ap, size) {
    const d = DASH_S[size];
    if (d && new RegExp('^' + d + '(?=[A-Z])').test(ap)) return ap.replace(new RegExp('^' + d), '{D}');
    const s = size.replace('.', '');
    if (ap.includes(s)) return ap.replace(s, '{S}');
    return null;
  }
  function semBitola(t) {
    return up(t).replace(/\b\d+-\d+\/\d+\b|\b\d+\/\d+\b|\b\d+\b/g, ' ').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  }

  function Aprendizado(catalogo) {
    this.cat = catalogo; this.itens = []; this.df = new Map(); this.byDesc = null;
  }
  Aprendizado.prototype.adicionar = function (texto, produtoId) {
    const p = this.cat.get(produtoId); if (!p) return;
    const s = bitolaCliente(texto); if (!s) return;
    const tD = templateDesc(p.d, s), tA = templateApelido(p.a, s);
    if (!tD && !tA) return;
    const words = semBitola(texto); const tf = new Map();
    for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) this.df.set(w, (this.df.get(w) || 0) + 1);
    this.itens.push({ texto, id: String(produtoId), tD, tA, tf });
  };
  Aprendizado.prototype._vec = function (tf) {
    const N = this.itens.length || 1; const v = new Map(); let n = 0;
    for (const [w, c] of tf) { const x = (1 + Math.log(c)) * (Math.log((1 + N) / (1 + (this.df.get(w) || 0))) + 1); v.set(w, x); n += x * x; }
    n = Math.sqrt(n) || 1; for (const [w, x] of v) v.set(w, x / n); return v;
  };
  Aprendizado.prototype._gerar = function (kind, tpl, size) {
    if (!this.byDesc) { this.byDesc = new Map(); for (const p of this.cat.lista) if (!this.byDesc.has(p.d)) this.byDesc.set(p.d, p.id); }
    if (kind === 'D') {
      for (const s of [size, size.replace('.', ' '), size.replace('.', '-')]) {
        const k = tpl.replace('{S}', s).replace(/\s+/g, ' ').trim();
        if (this.byDesc.has(k)) return this.byDesc.get(k);
      }
      return null;
    }
    const k = tpl.replace('{D}', String(DASH_S[size] || '')).replace('{S}', size.replace('.', ''));
    return this.cat.lookupApelido(k);
  };
  Aprendizado.prototype.prever = function (texto, minsim) {
    minsim = minsim == null ? 0.45 : minsim;
    if (!this.itens.length) return null;
    const s = bitolaCliente(texto); if (!s) return null;
    const tf = new Map(); for (const w of semBitola(texto)) tf.set(w, (tf.get(w) || 0) + 1);
    const q = this._vec(tf);
    const sc = this.itens.map((it, i) => {
      if (!it._v) it._v = this._vec(it.tf);
      let d = 0; for (const [w, x] of q) { const y = it._v.get(w); if (y) d += x * y; }
      return [i, d];
    }).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const t = norm(texto); const qf = (t.match(/[A-Z]+/) || [''])[0];
    for (const [i, d] of sc) {
      if (d < minsim) break;
      const it = this.itens[i]; const cd = this.cat.get(it.id).d;
      if (qf.startsWith('MANG') && !cd.startsWith('MANG')) continue;
      if (qf === 'TERMINAL' && !cd.startsWith('TERMINAL')) continue;
      if (/MONTAD|TERMINA|\bMONT\b/.test(t) && qf.startsWith('MANG')) continue;
      for (const [kind, tpl] of [['D', it.tD], ['A', it.tA]]) {
        if (!tpl) continue;
        const id = this._gerar(kind, tpl, s);
        if (id) return { id, base: it.id, score: d };
      }
    }
    return null;
  };

  // ---------------- parâmetros padrão do motor ----------------
  const PADRAO = {
    simRef: 0.45,          // nota mínima para "equivalente ao REF"
    simDescricao: 0.62,    // nota mínima para sugerir só pela descrição
    simAprendido: 0.9,     // nota mínima para padrão aprendido
    usarDescricao: false,  // sugerir só pela descrição (fraco em textos SAP longos — melhor usar a IA)
    travas: { material: true, rosca: true, tipo: true, medidas: true }
  };

  // ---------------- função principal ----------------
  // item: {codCliente, descricao, ref}
  // ctx : {catalogo, depara: Map('cod'→id), historico: Map('cod'→{id,preco,data}), aprendizado, params}
  function sugerir(item, ctx) {
    const cat = ctx.catalogo; const P = Object.assign({}, PADRAO, ctx.params || {});
    const tr = Object.assign({}, PADRAO.travas, (ctx.params || {}).travas || {});
    const det = up(item.descricao || '').replace(/\s+/g, ' ');
    let ref = String(item.ref || '').trim();
    if (!ref || /^(NONE|N\/A|-|NAN)$/i.test(ref)) ref = '';
    const cod = String(item.codCliente || '').trim();
    const res = (id, metodo, confianca, motivo, score, extra) => Object.assign({
      produto_id: id ? String(id) : null, metodo, confianca, motivo, score: score == null ? null : Math.round(score * 100) / 100
    }, extra || {});
    const ok = (p) => p && p.ativo;

    // 1) de-para
    if (cod && ctx.depara && ctx.depara.has(cod)) {
      const id = ctx.depara.get(cod);
      if (ok(cat.get(id))) return res(id, 'de-para', 'alta', 'Código do cliente já respondido/aprovado antes');
    }
    // 2) histórico de vendas
    if (cod && ctx.historico && ctx.historico.has(cod)) {
      const h = ctx.historico.get(cod);
      if (ok(cat.get(h.id))) return res(h.id, 'historico', 'alta', 'Mesmo código do cliente já vendido' + (h.cliente ? ' para ' + h.cliente : '') + (h.data ? ' (último pedido ' + h.data + ')' : ''));
    }
    const alternativas = [];
    // 3) REF idêntico
    const r = comp(ref);
    const kit = /\+/.test(ref.replace(/PA\s*[+-]\s*AA/gi, '')); // REF com mais de um item ("PA+AA" = porca + anel do próprio item, não conta)
    if (r && r.length >= 4 && !/^\d+$/.test(r)) {
      const idExato = cat.lookupApelido(r);
      if (idExato && materialOk(cat.get(idExato).d + ' ' + cat.get(idExato).a, ref, det)) {
        return res(idExato, 'apelido', kit ? 'media' : 'alta', 'Apelido idêntico ao REF' + (kit ? ' — REF tem mais de um item, conferir' : ''));
      }
      const semInox = r.replace(/INOX(304|316L?)?$/, '');
      const idSem = semInox !== r ? cat.lookupApelido(semInox) : null;
      if (idSem && !travas(cat.get(idSem), ref, det, tr)) return res(idSem, 'apelido', 'alta', 'Apelido idêntico ao REF (sem o sufixo de material)');
    }
    // 4) regras de montagem
    const look = (c) => cat.lookupApelido(c);
    for (const [rule, nome] of [[terminalRule, 'regra de terminal'], [adapterRule, 'regra de adaptador']]) {
      const x = rule(det, look);
      if (x && !travas(cat.get(x.id), ref, det, Object.assign({}, tr, { tipo: false }))) return res(x.id, 'regra', 'media', 'Montado pela ' + nome + ' (' + x.apelido + ')');
    }
    // 5) equivalente ao REF
    if (r && r.length >= 4 && !/^\d+$/.test(r)) {
      for (const c of cat.buscar(r, 12)) {
        if (c.score < P.simRef) break;
        const motivo = travas(c.prod, ref, det, tr);
        if (!motivo) return res(c.prod.id, 'ref-similar', kit ? 'baixa' : 'media', 'Equivalente ao REF no cadastro' + (kit ? ' — REF tem mais de um item, conferir' : ''), c.score, { alternativas: alternativas.slice(0, 5) });
        alternativas.push({ id: c.prod.id, score: Math.round(c.score * 100) / 100, recusa: motivo });
      }
    }
    // 6) padrão aprendido
    if (ctx.aprendizado) {
      const x = ctx.aprendizado.prever(det, P.simAprendido);
      if (x && x.score >= P.simAprendido && medidasDescricaoOk(cat.get(x.id), det) && !travas(cat.get(x.id), ref, det, Object.assign({}, tr, { medidas: !!ref }))) {
        return res(x.id, 'aprendido', 'baixa', 'Padrão de item parecido já aprovado (ID ' + x.base + '), trocando a bitola', x.score);
      }
    }
    // 7) descrição
    const cands = cat.buscar(det.split(/REFER[EÊ]NCIA COMERCIAL|F\/R|NOTA:/)[0] + ' ' + ref, 15);
    if (P.usarDescricao) {
      for (const c of cands) {
        if (c.score < P.simDescricao) break;
        const motivo = travas(c.prod, ref || null, det, tr) || (medidasDescricaoOk(c.prod, det) ? null : 'medidas');
        if (!motivo) return res(c.prod.id, 'descricao', 'baixa', 'Parecido pela descrição — conferir', c.score, { alternativas: alternativas.slice(0, 5) });
      }
    }
    for (const c of cands.slice(0, 8)) if (c.score >= 0.3 && !alternativas.some(a => a.id === c.prod.id)) alternativas.push({ id: c.prod.id, score: Math.round(c.score * 100) / 100 });
    return res(null, 'nenhum', 'sem_cadastro', 'Nada seguro no cadastro', null, { alternativas: alternativas.slice(0, 8) });
  }

  const Motor = {
    deacc, up, comp, norm, tofrac, sizes, sideSpec, terminalRule, adapterRule, travas, threads, types, toks,
    Catalogo, Aprendizado, sugerir, medidasDescricaoOk, PADRAO, bitolaCliente
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  else root.Motor = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
