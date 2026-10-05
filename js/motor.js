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
//   4e. Mangueira montada: mangueira + terminais + capa (histórico de FTMs)
//   4d. Correias planas: material Nitta/Mectrol + medida (histórico de cortes)
//   4c. Correias: perfil + comprimento + largura (sincronizadora, micro-V, V)
//   4b. Sem REF: monta o REF pela descrição SAP (conexões de tubo Ermeto/DIN,
//       conexões galvanizadas Tupy)
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

  // ---------------- regras para itens sem REF (descrição SAP -> REF sintético) ----------------
  // Montam um "REF" no padrão Melting a partir dos campos da descrição SAP.
  // Calibradas na planilha da Arcelor (REF do Kayan como gabarito).
  function fracSap(s) { return tofrac(String(s).replace(/-/g, ' ').replace(/(\d)\.(\d\/)/, '$1 $2')); }
  // séries DIN 2353: tubo -> rosca métrica da porca
  const SERIE_L = { 6: 12, 8: 14, 10: 16, 12: 18, 15: 22, 18: 26, 22: 30, 28: 36, 35: 45, 42: 52 };
  const SERIE_S = { 6: 14, 8: 16, 10: 18, 12: 20, 14: 22, 16: 24, 20: 30, 25: 36, 30: 42, 38: 52 };
  const POL = [[1/8,'1/8'],[1/4,'1/4'],[3/8,'3/8'],[1/2,'1/2'],[3/4,'3/4'],[1,'1'],[1.25,'11/4'],[1.5,'11/2'],[2,'2'],[2.5,'21/2'],[3,'3'],[4,'4']];
  function polStr(v) { if (v == null) return null; for (const [k, s] of POL) if (Math.abs(k - v) < 0.01) return s; return null; }

  function materialLetra(t) {
    if (/INOX|AISI|\b316\b|\b304\b/.test(t)) return 'I';
    if (/LATAO|BRONZE/.test(t)) return 'C';
    return 'A';
  }

  // ---------- conexões de tubo (Ermeto / DIN 2353) ----------
  function conexaoTubo(det) {
    const t = up(det).replace(/\s+/g, ' ');
    const erm = t.match(/\b(?:ERMETO|KONNECT\s*LH)\s*:?\s*(C?(?:U[MFSDCO]|J[IM]|T[IM]|CI|P)[AIC]?)(?![A-Z])\s*-?\s*(\d{1,2})?(?:[,.]0)?\s*([LS](?![A-Z]))?\s*(?:X\s*(\d+(?:[.\s-]\d\/\d+)?(?:\/\d+)?)\s*"?\s*(NPT|BSP))?/);
    const tipo = t.match(/^(UNIAO|JOELHO|COTOVELO|TEE?|CRUZETA|PORCA|ADAPTADOR|CONECTOR|DESCRICAO)\b/) || (erm ? [null, 'UNIAO'] : null);
    if (!tipo) return null;
    const tuboM = t.match(/DIAMETRO EXTERNO (?:DO )?TUBO(?: \(?[AB]\)?)?\s*:?\s*(\d{1,2})(?:,0+)?\s*MM/) || t.match(/\bD\.?\s?E\.?\s*:?\s*(\d{1,2})(?:,0+)?\s*MM/) ||
      t.match(/\bTUBO\s*(?:OD\s*)?(\d{1,2})\s*MM/) || t.match(/DIAMETRO NOMINAL\s*:?\s*(\d{1,2})(?:,0+)?\s*MM(?!\s*X)/);
    let tubo = erm && erm[2] ? +erm[2] : (tuboM ? +tuboM[1] : null);
    if (!tubo) { const mt = t.match(/DIAMETRO NOMINAL\s*:?\s*(\d{2})\s*MM\s*X\s*[12][,.]/); if (mt) { const th = +mt[1]; for (const [k, v] of Object.entries(SERIE_S)) if (v === th) tubo = +k; if (!tubo) for (const [k, v] of Object.entries(SERIE_L)) if (v === th) tubo = +k; } }
    if (!tubo) return null;
    let pf = erm ? erm[1].replace(/^C(?=[A-Z]{3})/, '') : null;
    if (pf === 'UCC') pf = 'UDC';
    const temRosca = /\b(NPT|BSP)/.test(t);
    const ext = (t.match(/EXTREMIDADE ?\(?S?\)?\s*:?\s*([A-Z\- ]+?)\s*(?:;|ROSCA|DIAM|$)/) || [, ''])[1];
    const mat = materialLetra(t);
    if (!pf || pf.length < 3) {
      // sem código Ermeto: monta pelo tipo + extremidade + material — só para
      // tubo métrico (DIN 2353); fora pneumática, push-in, PP e tubo em polegada (OD)
      if (!tuboM || /PNEUMAT|PUSH|INSTANTAN|ENGATE|POLIPROP|\bPP\b|PVC|\bOD\b|SWAGELOK|\bFSS\b|PLASTICO|ACETAL|NYLON|POLIAMIDA|\bPU\b/.test(t)) return null;
      const pBar = +((t.match(/PRESSAO[^;]*?(\d{1,3})\s*(?:BAR|KGF)/) || [])[1] || 0);
      if (pBar && pBar <= 20) return null; // pneumática
      const tp = tipo[1];
      let a = null, b = null;
      if (tp === 'PORCA') { a = 'P'; b = ''; }
      else if (tp === 'CRUZETA') { a = 'C'; b = 'I'; }
      else if (/^TE/.test(tp)) { a = 'T'; b = /MACHO/.test(ext) && temRosca ? 'M' : 'I'; }
      else if (/JOELHO|COTOVELO/.test(tp)) { a = 'J'; b = /MACHO/.test(ext) && temRosca ? 'M' : 'I'; }
      else { const rPol = /\d\/\d+\s*(?:POL|")?\s*(?:NPT|BSP)|(?:NPT|BSP)[^;]*?DIAMETRO NOMINAL\s*:?\s*\d[\d\s.\/]*\s*POL|ROSCA\s*:?\s*(?:NPT|BSP)/.test(t);
        a = 'U'; b = /ORIENTAVEL/.test(t) ? 'O' : (/MACHO/.test(ext) || /^[^;]*\bMACHO\b/.test(t) || /CONEXAO\s*:\s*MACHO/.test(t) || (rPol && !/FEMEA/.test(ext))) ? 'M' : /FEMEA/.test(ext) && !/FEMEA-FEMEA/.test(ext) ? 'F' : /TUBO-ENCAIXE SOLDA|^SOLDA/.test(ext) ? 'S' : /DUPLA.*COMPRIDA/.test(t) ? 'C' : 'D'; }
      pf = a + b + (a === 'P' ? (mat === 'I' ? 'I' : 'A') : mat);
    }
    // rosca (para M / F / O)
    let rosca = null;
    if (/^[UJT][MFO]/.test(pf)) {
      let v = null, std = null;
      if (erm && erm[4]) { const x = erm[4].replace(/^(\d)(\d\/\d+)$/, '$1 $2').replace(/^([1357])([248]|16)$/, '$1/$2'); v = fracSap(x); std = erm[5]; }
      if (v == null) {
        const dn = t.match(/DIAMETRO NOMINAL\s*:?\s*(\d+(?:[.\s-]\d\/\d+)?(?:\/\d+)?)\s*(?:POL|")/);
        if (dn) v = fracSap(dn[1]);
        const r = t.match(/ROSCA\s*:?\s*(NPTF?|BSPP?|BSPT)/) || t.match(/\b(NPT|BSP)\b/);
        std = r ? r[1].slice(0, 3) : null;
      }
      if (v == null || !std) {
        const g = t.match(/(\d+(?:[.\s-]\d\/\d+)?(?:\/\d+)?)\s*(?:POL|")?\s*(NPT|BSP)/);
        if (g) { v = fracSap(g[1]); std = g[2]; }
      }
      const ps = polStr(v);
      if (ps && std) rosca = ps + std;
    }
    // série: explícita, pela rosca métrica, ou pelo tubo
    let series = [];
    const sx = (erm && erm[3]) || (t.match(new RegExp('\\b' + tubo + '\\s*([LS])\\b')) || [])[1];
    const mmx = t.match(/\bM\s?(\d{2})\s*X\s*[12][,.]/) || t.match(/DIAMETRO NOMINAL\s*:?\s*(\d{2})\s*X\s*[12][,.]/);
    const mm = mmx;
    const sTxt = /SERIE PESAD|PESADA|PESADO/.test(t) ? 'S' : /SERIE LEVE/.test(t) ? 'L' : null;
    if (sx) series = [sx];
    else if (sTxt) series = [sTxt];
    else if (mm && SERIE_L[tubo] === +mm[1]) series = ['L'];
    else if (mm && SERIE_S[tubo] === +mm[1]) series = ['S'];
    else if (SERIE_L[tubo] && !SERIE_S[tubo]) series = ['L'];
    else if (SERIE_S[tubo] && !SERIE_L[tubo]) series = ['S'];
    else {
      const p = +((t.match(/PRESSAO(?: DE TRABALHO)?\s*:?\s*(\d{2,3})\s*BAR/) || [])[1] || 0);
      series = p >= 400 ? ['S', 'L'] : ['L', 'S'];
    }
    const refs = series.map(s => {
      const m = (s === 'L' ? SERIE_L : SERIE_S)[tubo];
      return pf + tubo + s + (rosca ? 'X' + rosca : '') + (m && pf[0] !== 'P' ? '(M' + m + ')' : '') + (pf[2] === 'I' ? 'INOX316' : '');
    });
    return { tipo: 'tubo', pf, tubo, series, rosca, refs };
  }

  // ---------- conexões galvanizadas / ferro maleável (Tupy) ----------
  function conexaoGalvanizada(det) {
    const t = up(det).replace(/\s+/g, ' ');
    if (!/FERRO MALEAVEL|TUPY/.test(t) && !(/GALVANIZ|ZINCADO/.test(t) && !/\bACO\b/.test(t))) return null;
    if (/INOX|LATAO|PVC|ERMETO|ENGATE|MANGUEIRA|SCH ?80|ASTM A ?105|JIC|UNF/.test(t)) return null;
    const head = t.slice(0, 40);
    let tipo = null;
    if (/^NIPLE DUPLO/.test(t)) tipo = 'NIPLE DUPLO';
    else if (/^NIPLE/.test(t)) tipo = 'NIPLE';
    else if (/^LUVA/.test(t)) tipo = /REDUCAO/.test(head) ? 'LUVA REDUCAO' : 'LUVA';
    else if (/^BUCHA/.test(t)) tipo = 'BUCHA REDUCAO';
    else if (/^(JOELHO|COTOVELO|CURVA)/.test(t)) tipo = 'COTOVELO';
    else if (/^TEE?\b/.test(t)) tipo = 'TE';
    else if (/^BUJAO/.test(t)) tipo = 'BUJAO';
    else if (/^(TAMPAO|CAP)\b/.test(t)) tipo = 'TAMPAO';
    else if (/^UNIAO/.test(t) && /FEMEA|ASSENTO/.test(t)) tipo = 'UNIAO';
    if (!tipo) return null;
    const std = (t.match(/\b(NPT|BSP)/) || [, 'BSP'])[1];
    const F = '(\\d+(?:[.\\s-]\\d\\/\\d+)?(?:\\/\\d+)?)';
    let med = [];
    let m = t.match(new RegExp('DIAMETRO NOMINAL\\s*:?\\s*' + F + '\\s*(?:POL|")?\\s*X\\s*' + F + '\\s*(?:POL|")'));
    if (m) med = [m[1], m[2]];
    else if ((m = t.match(new RegExp('DIAMETRO MENOR\\s*:?\\s*' + F + '.*?DIAMET ?R ?O MAIOR\\s*:?\\s*' + F)))) med = [m[2], m[1]];
    else if ((m = t.match(new RegExp('DIAMETRO(?: NOMINAL)?\\s*:?\\s*' + F + '\\s*(?:POL|")')))) med = [m[1]];
    med = med.map(x => polStr(fracSap(x))).filter(Boolean);
    if (!med.length) return null;
    if (/REDUCAO/.test(tipo) && med.length === 2 && fracSap(med[0].replace(/^(\d)(\d\/)/, '$1 $2')) < fracSap(med[1].replace(/^(\d)(\d\/)/, '$1 $2'))) med.reverse();
    const mf = /MACHO[-\/ ]?FEMEA|EXTREMIDADE\(?S?\)?\s*:?\s*MACHO/.test(t) && /COTOVELO|LUVA/.test(tipo) ? 'MF' : '';
    const ang = tipo === 'COTOVELO' || tipo === 'TE' ? (/\b45\b/.test(t) ? 'X45º' : 'X90º') : '';
    const nome = tipo.replace(/^(COTOVELO|LUVA)/, '$1' + (mf ? ' ' + mf : ''));
    const refs = [nome + ' ' + med.join('X') + ang + ' ' + std + ' TUPY', nome + ' ' + med.join('X') + ang + ' TUPY ' + std];
    if (std === 'BSP') refs.push(nome + ' ' + med.join('X') + ang + ' TUPY'); // BSP é o padrão do Tupy
    return { tipo: 'galvanizada', refs };
  }
  // conexão de tubo: a mesma peça existe "só corpo" e "completa" (com porca PA + anel AA)
  const RX_CORPO = /-?\s*(?:SO\s*)?CORPO|\(?CORPO\s*SEM\s*PA\+?AA\)?/;
  function baseTubo(ap) { return comp(ap).replace(/(?:COPOR|CORPO)SEMPA\+?AA|SOCORPO|CORPO|\+?PA\+?AA|COMPLETA?/g, ''); }
  const ehCorpo = (o) => RX_CORPO.test(o.d + ' ' + o.a) && !/PA\s*\+\s*AA(?!\))/.test(o.a.replace(/SEMPA\+AA/, ''));
  Catalogo.prototype.versoesTubo = function (o) {
    if (!this._vtubo) {
      this._vtubo = new Map();
      for (const p of this.lista) {
        if (!/^C?(?:U[MFSDCO]|J[IM]|T[IM]|CI|P)[AIC]?\d/.test(comp(p.a))) continue;
        const k = baseTubo(p.a).replace(/^C(?=[A-Z]{3}\d)/, '');
        if (!this._vtubo.has(k)) this._vtubo.set(k, []);
        this._vtubo.get(k).push(p);
      }
    }
    return this._vtubo.get(baseTubo(o.a).replace(/^C(?=[A-Z]{3}\d)/, '')) || [o];
  };
  // preferência do cliente (só corpo x completa) aprendida no de-para dele
  function prefCorpo(ctx) {
    if (ctx._prefCorpo !== undefined) return ctx._prefCorpo;
    let c = 0, n = 0;
    if (ctx.depara) for (const id of ctx.depara.values()) {
      const p = ctx.catalogo.get(id); if (!p || !/^C?(?:U|J|T)[A-Z]{1,2}\d/.test(comp(p.a))) continue;
      if (ctx.catalogo.versoesTubo(p).length < 2) continue;
      n++; if (ehCorpo(p)) c++;
    }
    ctx._prefCorpo = n >= 3 ? (c / n >= 0.6 ? true : (c / n <= 0.4 ? false : null)) : null;
    return ctx._prefCorpo;
  }

  function refSintetico(det) { return conexaoTubo(det) || conexaoGalvanizada(det); }

  // ---------------- correias (sincronizadora, micro-V, em V / power band) ----------------
  // Lê perfil + comprimento + largura (ou nº de canais) tanto da descrição do
  // cliente quanto do cadastro, e casa pelo mesmo conjunto. Marca pedida tem
  // preferência; sem a marca, sugere outra (conferir) e lista as demais.
  const PERF_SINC = '(?:D?S?(?:2|3|5|8|14|20)M(?:GT[E2-5]?|R?PP\\d?|CXP)?|(?:[2358]|14)GTE?\\d?|8YU|AT?(?:3|5|10|20)|T(?:2\\.5|10|20|5|2)|MXL|XXH|XH|XL|DH|H|L)';
  const RX_SINC = new RegExp('(?:^|[^A-Z0-9])(TP|D)?\\s*-?\\s*(\\d{2,5})\\s*-?\\s*(' + PERF_SINC + ')(?:(?:\\s*-\\s*|\\s+)(\\d{1,3}(?:[.,]\\d{1,2})?))?(?![A-Z0-9])');
  const RX_SINC_PF = new RegExp('(?:^|[^A-Z0-9])(TP|D)?\\s*(' + PERF_SINC + ')\\s*-\\s*(\\d{2,5})(?:\\s*-\\s*(\\d{1,3}))?(?![A-Z0-9])');
  const RX_MV = [/(?:^|[^A-Z0-9])(\d{2,5})\s*-?\s*(PH|PJ|PK|PL|PM|J|K|L|M)\s*-?\s*(\d{1,2})?(?![A-Z0-9])/, /(?:^|[^A-Z0-9])(PH|PJ|PK|PL|PM)\s*-?\s*(\d{3,5})(?![A-Z0-9])/, /(?:^|[^A-Z0-9])(\d{1,2})\s*(PH|PJ|PK|PL|PM)\s*-?\s*(\d{3,5})(?![A-Z0-9])/];
  const RX_V = /(?:^|[^A-Z0-9])(SPA|SPB|SPC|SPZ|XPA|XPB|XPC|XPZ|3VX|5VX|3V|5V|8V|AXS|BXS|CXS|AX|BX|CX|A|B|C|D|E)\s*-?\s*(\d{2,5})(?:\s*-\s*(\d{1,2}))?(?![A-Z0-9])/;
  const MARCAS_CORREIA = [['GATES', /GATES|POWERGRIP|MECTROL|POLY ?CHAIN/], ['OPTIBELT', /OPTIBELT|\bOP\b|\bOPT\b/], ['CONTITECH', /CONTITECH|\bCONTI\b/], ['HUTCHINSON', /HUTCHINSON|\bHUT\b/], ['MELTING', /MELTING|MELTPOWER|BINLONG|\bM$/], ['BANDO', /BANDO/], ['MEGADYNE', /MEGADYNE|\bMEGA\b|\bMG$/], ['GOODYEAR', /GOODYEAR/], ['DAYCO', /DAYCO/], ['FENNER', /FENNER/], ['SINCRON', /SINCRON\b/], ['PERFLEX', /PERFLEX/]];
  function marcaCorreia(s) { const u = up(s); for (const [n, rx] of MARCAS_CORREIA) if (rx.test(u)) return n; return null; }
  const num = (x) => x == null ? null : Number(String(x).replace(',', '.'));
  function parseCorreia(texto, ehCadastro) {
    let t = up(texto).replace(/\s+/g, ' ');
    if (!/CORREIA|\bCORR\b|SLAB|BELT/.test(t)) return null;
    // formatos curtos de cadastro de cliente: 1040X8MX30, 10408M30 colado, 50DZ, 2500MM
    if (!ehCadastro) {
      t = t.replace(/(\d{3,5})\s*X\s*(D?(?:S?(?:3|5|8|14|20)M|XL|XH|H|L|T5|T10|AT5|AT10))\s*X\s*(\d{1,3})/, '$1 $2 $3')
           .replace(/(?:^|\s)(\d{3,4})(S?(?:3|5|8|14)M)(\d{2,3})(?=\s|$)/, ' $1 $2 $3')
           .replace(/(?:^|\s)(\d{2,4})(XL|XH|L|H)(0\d{2}|\d{3})(?=\s|$)/, ' $1 $2 $3')
           .replace(/(\d)(DZ|ABS|SML)\b/g, '$1 $2').replace(/(\d)MM\b/g, '$1')
           .replace(/\bMULTI\s*V(?=\s*\d)/, 'MICRO V ')
           // Goodyear Eagle: RPP8 = 8M, RPP GOLD / GLD8 = 8MGT ("2400-RPP8-30", "RPP-GOLD-1280-GLD8-50")
           .replace(/\bRPP\s*-?\s*GOLD\s*-?\s*/g, '').replace(/\bGLD\s*(3|5|8|14)\b/g, '$1MGT').replace(/\bRPP\s*(3|5|8|14)\b/g, '$1M')
           .replace(/(\d{3,5})\s*-\s*((?:3|5|8|14)M(?:GT)?)\s*-\s*(\d{1,3})\b/, '$1 $2 $3')
           // largura antes do perfil/comprimento: "25 AT5/480", "32 AT 10/780", "50 ATP10/1150"
           .replace(/(?:^|\s)(\d{1,3})\s*(AT|ATP|T)\s*(5|10|20|3)\s*\/\s*(\d{3,5})\b/, (m0, w, p, n, c) => ' ' + c + ' ' + (p === 'T' ? 'T' : 'AT') + n + ' ' + w)
           // "8MGT 20 X 1160MM" (perfil, largura x comprimento)
           .replace(/\b((?:3|5|8|14)M(?:GT)?|AT5|AT10|T5|T10|XL|L|H)\s+(\d{1,3})\s*X\s*(\d{3,5})\b/, (m0, p, w, c) => c + ' ' + p + ' ' + w)
           // "2600 8M GT30" -> 2600 8MGT 30
           .replace(/\b(\d{3,5})\s+((?:3|5|8|14)M)\s+GT\s*(\d{1,3})\b/, '$1 $2GT $3');
    }
    const twin = /TWIN|DUPLA SINC|DUPLO DENTE|DUPLA DENTADA|DOUBLE/.test(t);
    const largTexto = () => { const w = t.match(/(?:^|[;,\s])(?:L|LARG(?:URA)?)\s*[.:]?\s*(\d{1,3}(?:[.,]\d)?)\s*(?:MM)?(?![\d])/) || t.match(/\bX\s*(\d{1,3})\s*MM\b/); return w ? num(w[1]) : null; };
    const canais = () => { const w = t.match(/(\d{1,2})\s*(?:CANAIS|NERVURAS|RIBS|FRISOS|ESTRIAS)/) || t.match(/(?:CANAIS|NERVURAS|RIBS|FRISOS|ESTRIAS)\s*:?\s*(\d{1,2})/); return w ? +w[1] : null; };
    // micro-V primeiro (PL/PK/PJ...) — só se o texto falar em micro-V / poly-V ou usar perfil P?
    if (/MICRO ?-?V|POLY ?-?V|\bMV\b|RIB|\bP[HJKLM]\b|\d\s*P[HJKLM]\b|\bP[HJKLM]\s*-?\s*\d/.test(t)) {
      let m = t.match(RX_MV[2]);
      if (m) return { fam: 'mv', perfil: m[2], comp: +m[3], larg: +m[1] };
      m = t.match(RX_MV[0]);
      if (m && (/^P/.test(m[2]) || /\bMV\b|MICRO|POLY/.test(t))) return { fam: 'mv', perfil: m[2].replace(/^(?=[JKLM]$)/, 'P'), comp: +m[1], larg: m[3] ? +m[3] : (ehCadastro ? null : (canais() || largTexto())) };
      m = t.match(RX_MV[1]);
      if (m) return { fam: 'mv', perfil: m[1], comp: +m[2], larg: ehCadastro ? null : (canais() || largTexto()) };
    }
    // Polyflex (Gates): 3M / 5M / 7M / 11M — perfil em V, não sincronizadora
    let pf = t.match(/POLYFLEX.*?\b(3|5|7|11)M\s*-?\s*(\d{3,5})(?:\s*-\s*(\d{1,2}))?/);
    if (pf) { const b = t.match(/(\d{1,2})\s*BANDAS?|BANDAS?\s*:?\s*(\d{1,2})/); return { fam: 'v', perfil: 'PF' + pf[1] + 'M', comp: +pf[2], larg: pf[3] ? +pf[3] : (!ehCadastro && b ? +(b[1] || b[2]) : 1) }; }
    // T / AT colados (Contitech): 100T510 = 100 T5 10, 370T1010 = 370 T10 10
    pf = t.match(/(?:^|[^A-Z0-9])(\d{2,5})\s*(AT|T)(10|20|5|3|2)([1-9]\d{0,2})(?![A-Z0-9])/);
    if (pf && !/EM V\b|POWER ?BAND/.test(t)) return { fam: 'sinc', tp: twin, perfil: pf[2] + pf[3], ger: null, comp: +pf[1], larg: +pf[4] };
    if (!/EM V\b|POWER ?BAND|TRAPEZ/.test(t)) {
      let m = t.match(RX_SINC), comp, perfil, larg, tp;
      // perfil + "COMPRIMENTO n" + "LARGURA n" escritos por extenso
      const ce = !ehCadastro && t.match(/(?:^|[^A-Z])(?:COMPRIMENTO|COMPR|COMP)\s*[.:]?\s*(\d{2,5}(?:[.,]\d+)?)/);
      const pe = !ehCadastro && t.match(new RegExp('(?:^|[^A-Z0-9])(' + PERF_SINC + ')(?![A-Z0-9])'));
      if (ce && pe && (!m || !m[4])) { m = null; tp = /\bTP\b|TWIN/.test(t) ? 'TP' : null; comp = Math.round(num(ce[1])); perfil = pe[1]; larg = largTexto(); }
      else if (!m && !ehCadastro && (m = t.match(new RegExp('(?:^|[^A-Z0-9])(TP|D)?\\s*(' + PERF_SINC + ')\\s+(\\d{3,5})\\s+(\\d{1,3})(?![A-Z0-9])')))) { tp = m[1]; perfil = m[2]; comp = +m[3]; larg = +m[4]; m = null; }
      if (m) { tp = m[1]; comp = +m[2]; perfil = m[3]; larg = num(m[4]); }
      if (perfil && /^D(?=\d|H$|XL$|L$)/.test(perfil)) { perfil = perfil.slice(1); tp = 'TP'; }
      else if ((m = t.match(RX_SINC_PF))) { tp = m[1]; perfil = m[2]; comp = +m[3]; larg = num(m[4]); }
      if (m || perfil) {
        const g = perfil.match(/^(.*GT)([2-5])$/);
        if (larg == null && !ehCadastro) larg = largTexto();
        return { fam: 'sinc', tp: !!tp || twin, perfil: g ? g[1] : perfil.replace(/^HTD/, ''), ger: g ? g[2] : null, comp, larg };
      }
    }
    if (/EM V|\bV\b|POWER ?BAND|TRAPEZ|CUNHA|\b(SP[ABCZ]|XP[ABCZ]|[358]VX?|[ABC]XS?)\b|\b[A-E]\s*-?\s*\d{2,3}\b/.test(t)) {
      const m = t.match(RX_V);
      if (m) return { fam: 'v', perfil: m[1], comp: +m[2], larg: m[3] ? +m[3] : (/POWER ?BAND|BANDAS?/.test(t) ? ((t.match(/(\d{1,2})\s*BANDAS?|BANDAS?\s*:?\s*(\d{1,2})/) || []).slice(1).find(Boolean) || null) : 1) };
    }
    return null;
  }
  const chaveCorreia = (p) => [p.fam, p.tp ? 'TP' : '', p.perfil, p.comp, p.larg == null ? '' : p.larg].join('|');
  Catalogo.prototype.indiceCorreias = function () {
    if (this._correias) return this._correias;
    const ix = new Map();
    for (const o of this.lista) {
      if (!/CORREIA|SLAB/.test(o.d + ' ' + up(o.familia))) continue;
      const p = parseCorreia('CORREIA ' + o.d, true);
      if (!p || p.larg == null) continue;
      if (p.fam === 'sinc' && /\bTP\b|TWIN/.test(up(o.familia))) p.tp = true;
      o._correia = p; o._marca = marcaCorreia(o.familia + ' ' + o.d + ' ' + o.a);
      for (const k of [chaveCorreia(p), chaveCorreia(Object.assign({}, p, { larg: '*' }))]) {
        if (!ix.has(k)) ix.set(k, []);
        ix.get(k).push(o);
      }
    }
    // slabs (luva moldada vendida por mm de largura): perfil + comprimento, sem largura
    this._slabs = new Map();
    for (const o of this.lista) {
      if (!/SLAB/.test(o.d) || !/CORREIA|SLAB/.test(o.d + ' ' + up(o.familia))) continue;
      const p = parseCorreia('CORREIA SINCRONIZADA ' + o.d.replace(/SLAB/g, ' '), true);
      if (!p || p.fam !== 'sinc') continue;
      if (/\bTP\b|TWIN/.test(o.d + ' ' + up(o.familia))) p.tp = true;
      const k = ['sinc', p.tp ? 'TP' : '', p.perfil, p.comp].join('|');
      o._marca = o._marca || marcaCorreia(o.familia + ' ' + o.d + ' ' + o.a); o._correia = o._correia || p;
      if (!this._slabs.has(k)) this._slabs.set(k, []);
      this._slabs.get(k).push(o);
    }
    this._correias = ix;
    return ix;
  };
  // marca de correia que o cliente costuma comprar, por família (V, sincronizadora, micro-V): de-para + vendas dele
  function prefMarcaCorreia(ctx, cat, fam) {
    if (!ctx || !(ctx.depara || ctx.historico)) return null;
    if (!ctx._prefMarcaCorreia) {
      cat.indiceCorreias(); const n = {};
      const ids = [...(ctx.depara ? ctx.depara.values() : []), ...(ctx.historico ? [...ctx.historico.values()].map(h => h.id) : [])];
      ctx._linhaCorreia = new Map();      // família do cadastro (ex. CORREIA GATES INDL B VULCOPOWER) -> vezes
      for (const id of ids) {
        const o = cat.get(id); if (!o || !o._correia) continue; const mk = o._marca || 'SEM MARCA';
        for (const k of [o._correia.fam, o._correia.fam + '|' + o._correia.perfil.replace(/GT\d?$|GTE$/, '')]) { n[k] = n[k] || {}; n[k][mk] = (n[k][mk] || 0) + 1; }
        const f = up(o.familia); if (f) ctx._linhaCorreia.set(f, (ctx._linhaCorreia.get(f) || 0) + 1);
      }
      ctx._prefMarcaCorreia = {};
      // por família (V, sincronizadora...) com 2+ compras; por perfil (8M, H, AT10...) quando é a maioria daquele perfil
      for (const k in n) { const e = Object.entries(n[k]).sort((a, b) => b[1] - a[1]); const b = e[0]; if (b && (b[1] >= 2 || (/\|/.test(k) && (!e[1] || e[1][1] < b[1])))) ctx._prefMarcaCorreia[k] = b[0]; }
    }
    return ctx._prefMarcaCorreia[fam] || null;
  }
  function correiaRule(det, cat, ctx) {
    const p = parseCorreia(det, false);
    if (!p) return null;
    if (p.larg == null) return { p, cands: [], vizinhas: (cat.indiceCorreias().get(chaveCorreia(Object.assign({}, p, { larg: '*' }))) || []).slice() };
    const cands = (cat.indiceCorreias().get(chaveCorreia(p)) || []).slice();
    // sem a largura pedida: devolve as outras larguras do mesmo perfil/comprimento como alternativas
    const vizinhas = () => (cat.indiceCorreias().get(chaveCorreia(Object.assign({}, p, { larg: '*' }))) || [])
      .slice().sort((a, b) => Math.abs(a._correia.larg - p.larg) - Math.abs(b._correia.larg - p.larg));
    if (!cands.length) return { p, cands, vizinhas: vizinhas() };
    const marca = marcaCorreia(det.replace(/CORREIA\s+SINCRO\w*\.?/g, ''));
    const pm = !marca && (prefMarcaCorreia(ctx, cat, p.fam + '|' + p.perfil.replace(/GT\d?$|GTE$/, '')) || prefMarcaCorreia(ctx, cat, p.fam));
    const linha = (o) => (!marca && ctx && ctx._linhaCorreia) ? Math.min(3, ctx._linhaCorreia.get(up(o.familia)) || 0) : 0;
    const peso = (o) => (marca && o._marca === marca ? 4 : 0) + (pm && (o._marca || 'SEM MARCA') === pm ? 3 : 0) + linha(o) + (p.ger && o._correia.ger === p.ger ? 2 : 0) + (!p.ger && !o._correia.ger ? 1 : 0) + (o._marca === 'MELTING' ? 0.5 : 0);
    cands.sort((a, b) => peso(b) - peso(a));
    return { p, cands, marca, mesmaMarca: !!marca && cands[0]._marca === marca, prefCliente: pm && (cands[0]._marca || 'SEM MARCA') === pm ? pm : null };
  }

  // ---------------- correias planas (Nitta / Mectrol cortadas sob medida) ----------------
  // Cortes = histórico relpro_nita / relpro_mec agregado: [material, idBase, larg, comp, vezes].
  // Material pedido pelo código (LA-500, TFL-10S...) -> correia pronta no cadastro ou base + "cortar".
  // Outra marca (Habasit...) -> não escolhe material: lista os já cortados na mesma medida,
  // e só quando o pedido não fala em furo / talisca / acessório.
  const PERFIS_LL = ['AT10', 'AT20', 'AT5', 'AT3', 'ATN10', 'ATN5', 'T10', 'T20', 'T5', 'T2', 'S14M', 'S8M', 'S5M', 'S3M', '14MGT', '8MGT', '14M', '8M', '5M', '3M', 'XXH', 'XH', 'XL', 'H', 'L'];
  function parseLL(mat) {
    const c = comp(mat);
    if (!/^LL/.test(c)) return null;
    let r = c.slice(2).replace(/^W(?=[A-Z])/, ''); // LLWH, LLWT = largura larga
    const pf = PERFIS_LL.find(p => r.startsWith(p)); if (!pf) return null;
    const w = r.slice(pf.length).match(/^(\d{1,3})/); if (!w) return null;
    return { perfil: pf.replace(/^ATN/, 'AT'), larg: +w[1], variante: r.slice(pf.length + w[1].length) };
  }
  // ---------------- kits SGM (relpro_sgm): produtos montados pela Melting ----------------
  // linhas: [sgm, produtoId, descricao, componentes[[id, desc, qtd]], unidade]
  function agregarKits(rows) {
    const out = [];
    for (const r of rows || []) {
      const sgm = Number(r.sgm), id = r.produto;
      if (!sgm || !id) continue;
      const comps = [];
      if (r.proprinc_id) comps.push([String(r.proprinc_id), r.descproprinc || '', Number(r.qtdproprinc) || 0]);
      for (let i = 1; i <= 10; i++) if (r['pro' + i + '_id']) comps.push([String(r['pro' + i + '_id']), r['descpro' + i] || '', Number(r['qtdpro' + i]) || 0]);
      if (r.maoobra_id) comps.push([String(r.maoobra_id), r.descmaoobra || 'MAO DE OBRA', Number(r.qtdmaoobra) || 0]);
      out.push([sgm, String(id).replace(/\.0+$/, ''), String(r.descricao || '').trim(), comps, r.unidade || '']);
    }
    return out;
  }
  Catalogo.prototype.definirKits = function (linhas) {
    this._sgm = new Map(); this._kits = new Map(); this._kitsPorPrincipal = new Map();
    let novos = 0;
    for (const [sgm, id, desc, comps, um] of linhas || []) {
      this._sgm.set(Number(sgm), id); this._kits.set(id, { sgm, desc, comps, um });
      const pr = comps && comps[0] && comps[0][0];
      if (pr){ if (!this._kitsPorPrincipal.has(pr)) this._kitsPorPrincipal.set(pr, []); this._kitsPorPrincipal.get(pr).push(id); }
      if (this.byId.has(id)) continue;
      // kit ainda não está no cadastro importado: entra como produto do motor
      const d = up(desc.replace(/^SGM\s*0*\d+\s*\*\s*/i, '')).replace(/\s+/g, ' ').trim();
      const o = { id, d: d + ' (KIT SGM ' + sgm + ')', a: 'SGM' + sgm, ativo: true, origem: 'SGM', um: um || '', familia: 'KIT SGM', ipi: null };
      this.byId.set(id, o); this.lista.push(o);
      if (!this.byApelido.has(comp(o.a))) this.byApelido.set(comp(o.a), id);
      novos++;
    }
    if (novos) { this._index = null; this._correias = null; this._planas = null; }
    return novos;
  };
  Catalogo.prototype.porSgm = function (n) { return this._sgm ? this._sgm.get(Number(n)) || null : null; };
  Catalogo.prototype.kit = function (id) { return this._kits ? this._kits.get(String(id)) || null : null; };

  const codPlana = (s) => comp(String(s || '').replace(/^\s*CORREIA\s+/i, '')).replace(/\//g, '');
  Catalogo.prototype.definirCortes = function (linhas) {
    const porCod = new Map(), porMedida = new Map();
    for (const [mat, base, larg, cmp, n] of linhas || []) {
      const c = codPlana(mat); if (!c || !base) continue;
      if (!porCod.has(c) || porCod.get(c).n < n) porCod.set(c, { base: String(base), n });
      const k = Number(larg) + 'x' + Number(cmp);
      if (!porMedida.has(k)) porMedida.set(k, new Map());
      const mm = porMedida.get(k); mm.set(String(base), (mm.get(String(base)) || 0) + (n || 1));
    }
    // códigos também pelo nome do próprio produto base no cadastro ("CORREIA LA-1000")
    for (const [, v] of porCod) { const b = this.get(v.base); if (b) { const c2 = codPlana(b.d); if (c2 && !porCod.has(c2)) porCod.set(c2, v); } }
    // LL (Mectrol): correia PU em rolo, cortada no comprimento e emendada. Código = LL + perfil + largura + variante
    const porLL = new Map();
    for (const [mat, base, , cmp, n] of linhas || []) {
      const ll = parseLL(mat); if (!ll || !base) continue;
      const k = ll.perfil + '|' + ll.larg;
      if (!porLL.has(k)) porLL.set(k, new Map());
      const mm = porLL.get(k); const b = String(base);
      if (!mm.has(b)) mm.set(b, { base: b, mat, variante: ll.variante, n: 0, comps: new Set() });
      const o = mm.get(b); o.n += n || 1; o.comps.add(Number(cmp));
    }
    this._cortes = { porCod, porMedida, porLL };
  };
  Catalogo.prototype.indicePlanas = function () {
    if (this._planas) return this._planas;
    const ix = new Map();
    for (const o of this.lista) {
      const m = (o.a + ' ' + o.d).match(/^([A-Z0-9 .\-\/]+?)\s*\*\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?\s*\*/);
      if (!m) continue;
      const k = codPlana(m[1]) + '|' + num(m[2]) + 'x' + num(m[3]);
      if (!ix.has(k)) ix.set(k, o);
    }
    this._planas = ix;
    return ix;
  };
  // relpro_nita / relpro_mec (linhas como objetos) -> [material, idBase, larg, comp, vezes]
  function agregarCortes(rows) {
    const g = new Map();
    for (const r of rows || []) {
      const desc = String(r.descricao || ''); const base = r.produto1_id;
      const mat = (desc.split('*')[1] || '').trim();
      const larg = Number(String(r.larg).replace(',', '.')), cmp = Number(String(r.comp).replace(',', '.'));
      if (!mat || !base || !isFinite(larg) || !isFinite(cmp) || !cmp) continue; // larg 0 = LL Mectrol (largura no código)
      const k = [mat, base, larg, cmp].join('|');
      g.set(k, (g.get(k) || 0) + 1);
    }
    return [...g].map(([k, n]) => { const [mat, base, larg, cmp] = k.split('|'); return [mat, String(base), +larg, +cmp, n]; });
  }
  function parsePlana(texto) {
    const t = up(texto).replace(/\s+/g, ' ');
    if (!/CORREIA|ESTEIRA|LENCOL|BELT/.test(t)) return null;
    let larg = null, cmp = null;
    let m = t.match(/(?:^|[^A-Z])(?:C|COMP|COMPR|COMPRIMENTO)\s*[.:]?\s*(\d{2,6}(?:[.,]\d+)?)\s*(?:MM)?/);
    if (m) cmp = num(m[1]);
    m = t.match(/(?:^|[^A-Z])(?:L|LARG|LARGURA)\s*[.:]?\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:MM)?/);
    if (m) larg = num(m[1]);
    if (larg == null || cmp == null) {
      m = t.match(/\*\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:MM)?\s*X\s*(\d{2,6}(?:[.,]\d+)?)\s*(?:MM)?\s*\*/) || t.match(/(\d{1,6}(?:[.,]\d+)?)\s*(?:MM)?\s*X\s*(\d{1,6}(?:[.,]\d+)?)\s*MM/);
      if (m) { const a = num(m[1]), b = num(m[2]); larg = Math.min(a, b); cmp = Math.max(a, b); }
    }
    // "500 X 3200" sem MM: só com marca/tipo de correia plana escrito
    if ((larg == null || cmp == null) && /PLANA|TRANSPORTADORA|HABASIT|SIEGLING|CHIORINO|LEDER|BURRELL|AMMERAAL|FORBO|NITTA/.test(t)) {
      m = t.match(/(?<![\d\/.,])(\d{2,4}(?:[.,]\d+)?)\s*X\s*(\d{3,6}(?:[.,]\d+)?)(?![\d\/])/);
      if (m) { const a = num(m[1]), b = num(m[2]); larg = Math.min(a, b); cmp = Math.max(a, b); }
    }
    if (larg == null || cmp == null) return null;
    const plana = /PLANA|TRANSPORTADORA|TRANSMISSAO|TANGENCIAL|ESTEIRA|LENCOL|HABASIT|NITTA|SIEGLING|CHIORINO|LEDER|BURRELL|AMMERAAL|FORBO|MECTROL/.test(t);
    if (!plana) return null;
    const ref = (t.match(/\bREF(?:ERENCIA)?\.?\s*(?:COMERCIAL)?\s*:?\s*([^;·,]+)/) || [])[1] || '';
    return {
      larg, comp: cmp, ref: ref.trim(),
      fechamento: /ABERTA|\bAB\b/.test(t) ? 'aberta' : (/FECHADA|SEM FIM|EMENDA|VULCANIZ|\bAF\b/.test(t) ? 'fechada' : null),
      acessorio: /FURO|FURAD|TALISCA|PERFURA|TACO|GUIA|PERFIL|REVEST|TRAVESS|LATERAL/.test(t)
    };
  }
  // tabela de equivalência de correias planas (Habasit / Siegling / Chiorino / Leder / Burrell -> Nitta)
  // linhas: [{marca, codigo, nitta, obs}] (tabela equivalencias do banco; dado confidencial, fora do repositório)
  Catalogo.prototype.definirEquivalencias = function (linhas) {
    const E = new Map();
    for (const r of linhas || []) {
      const k = codPlana(r.codigo); if (!k || !r.nitta) continue;
      if (!E.has(k)) E.set(k, []);
      E.get(k).push({ marca: up(r.marca || ''), codigo: String(r.codigo).trim(), nitta: String(r.nitta).trim(), obs: String(r.obs || '').trim() });
    }
    // linha da tabela impressa antes da anotação à mão
    for (const l of E.values()) l.sort((a, b) => (/^ANOTA/i.test(deacc(a.obs)) ? 1 : 0) - (/^ANOTA/i.test(deacc(b.obs)) ? 1 : 0));
    this._equiv = E;
  };
  // procura no pedido um código de outra marca da tabela de equivalência (janela de até 7 palavras: "EM 8/2 0+05 PVC AS")
  function equivalenciaPlana(det, cat) {
    const E = cat._equiv; if (!E || !E.size) return null;
    const t = up(det);
    const tk = t.split(/[\s;,*:()]+/).filter(Boolean);
    let best = null;
    for (let i = 0; i < tk.length; i++) for (let w = Math.min(7, tk.length - i); w >= 1; w--) {
      const k = codPlana(tk.slice(i, i + w).join('')); if (!k || /^\d+$/.test(k) || !E.has(k)) continue;
      if (best && best.k.length >= k.length) continue;
      let rows = E.get(k);
      const comMarca = rows.filter(r => r.marca && r.marca.split('/').some(m => t.includes(m)));
      if (comMarca.length) rows = comMarca;
      else if (k.length <= 3 || !/[A-Z]/.test(k) || !/\d/.test(k)) continue;   // código curto ("F0", "T1") só com a marca escrita
      else if (k.length <= 5 && rows.every(r => !r.marca)) continue;          // anotação sem marca e código curto: risco de confundir com perfil
      best = { k, rows };
    }
    if (!best) return null;
    const C = cat._cortes || { porCod: new Map() };
    const opc = best.rows.map(r => { const c = codPlana(r.nitta); const cut = C.porCod.get(c); return { r, cod: c, base: cut ? cat.get(cut.base) : null }; });
    return { k: best.k, opc, ok: opc.filter(o => o.base) };
  }
  function textoEquiv(e) {
    const o = e.ok[0] || e.opc[0], t0 = e.opc[0];
    return 'equivalente Nitta de ' + (o.r.marca ? o.r.marca + ' ' : '') + o.r.codigo + ': ' + o.r.nitta + (o.r.obs ? ' (' + o.r.obs + ')' : '') +
      (t0 !== o ? ' — a tabela indica ' + t0.r.nitta + ', que a Melting nunca cortou' : '');
  }
  function correiaPlanaRule(det, cat) {
    const p = parsePlana(det); if (!p) return null;
    const C = cat._cortes || { porCod: new Map(), porMedida: new Map() };
    // código de material Nitta/Mectrol escrito no pedido
    let cod = null;
    const toks = up(det).split(/[;·,\s*]+/);
    const cands = [p.ref].concat(toks.slice(1).map((x, i) => toks[i] + x), toks); // "2LRF 2705" antes de "2LRF"
    for (const tok of cands) {
      const c = codPlana(tok);
      if (c.length >= 2 && /\d/.test(c) && C.porCod.has(c) && cat.get(C.porCod.get(c).base)) { cod = c; break; }
    }
    const medida = p.larg + 'x' + p.comp;
    let equiv = null;
    if (!cod) {
      equiv = equivalenciaPlana(det, cat);
      if (equiv && equiv.ok.length) {
        const o = equiv.ok[0]; const pronta = cat.indicePlanas().get(o.cod + '|' + medida);
        return { p, cod: o.cod, pronta, base: o.base, equiv };
      }
    }
    if (cod) {
      const pronta = cat.indicePlanas().get(cod + '|' + medida);
      return { p, cod, pronta, base: cat.get(C.porCod.get(cod).base) };
    }
    const mats = [...((C.porMedida.get(medida)) || new Map())].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ prod: cat.get(id), n })).filter(x => x.prod);
    return { p, cod: null, mats, equiv };
  }


  // ---------------- mangueiras montadas (FTM) ----------------
  // Monta a mangueira pela descrição SAP: norma/reforço -> família (AGR2, EFG4K...), bitola,
  // terminais de cada lado ({bitola}G{rosca}{tipo}[ângulo]SML) e comprimento. O histórico
  // das FTMs (relpro_ftm) decide as ambiguidades (rosca x tubo DIN, série L x S), a mangueira
  // mais usada da família e a capa; e aponta a FTM idêntica, se existir.
  // norma -> famílias de mangueira do cadastro Melting, em ordem de preferência
  const NORMA_FAM = [
    [/100\s*R\s*16|\bR16\b|2SC\b|2\s*SC\b/, ['AGR2', 'C2AT', 'M3K']],
    [/100\s*R\s*17|\bR17\b/, ['M3K', 'AGR2']],
    [/100\s*R\s*12|\bR12\b/, ['EFG4K', 'EFG4KXLL', 'MXG4KXTP']],
    [/100\s*R\s*13|\bR13\b/, ['EFG6K', 'EFG6KXLL', 'EFG5K']],
    [/100\s*R\s*15|\bR15\b/, ['EFG6K', 'EFG6KXLL']],
    [/4\s*SH\b/, ['4XH', 'EFG6K', 'EFG4K']],
    [/4\s*SP\b/, ['EFG4K', 'EFG4KXLL']],
    [/100\s*R\s*2\s*A?T|\bR2AT\b|2\s*SN\b|100\s*R\s*2\b/, ['AGR2', 'C2AT', 'C2ATG2', 'M2T']],
    [/100\s*R\s*1\s*A?T|\bR1AT\b|1\s*SN\b|100\s*R\s*1\b|1\s*SC\b/, ['AGR1', 'C1T', 'C1TG1']],
    [/100\s*R\s*3\b|\bR3\b/, ['C3H']],
    [/100\s*R\s*4\b|\bR4\b/, ['C4H']],
    [/100\s*R\s*5\b|\bR5\b/, ['C5C']],
    [/100\s*R\s*6\b|\bR6\b/, ['C6H']],
    [/100\s*R\s*14|\bR14\b|PTFE|TEFLON/, ['C14']]
  ];
  // sem norma: pelo reforço e pressão
  function familiaPorConstrucao(t, psi) {
    if (/6\s*ESPIRA/.test(t)) return ['EFG6K', 'EFG5K'];
    if (/4\s*ESPIRA/.test(t)) return psi && psi >= 5000 ? ['EFG6K', 'EFG4K'] : ['EFG4K', 'EFG6K'];
    if (/2\s*(TRAN|TRAM|TRAC)/.test(t)) return ['AGR2', 'C2AT', 'M3K'];
    if (/1\s*(TRAN|TRAM|TRAC)/.test(t)) return ['AGR1', 'C1T'];
    return null;
  }
  const DI_DASH = [[4.8, 3], [6.4, 4], [7.9, 5], [9.5, 6], [12.7, 8], [15.9, 10], [19, 12], [25.4, 16], [31.8, 20], [38.1, 24], [50.8, 32], [63.5, 40], [76.2, 48]];
  function dashDe(t) {
    const c = t.replace(/\s+/g, '');                       // SAP quebra palavras e números com espaços
    const mmDash = (v) => { let best = null, bd = 9; for (const [mm, ds] of DI_DASH) if (Math.abs(mm - v) < bd) { bd = Math.abs(mm - v); best = ds; } return bd <= 1.3 ? best : null; };
    let m = c.match(/BITOLA:?-?(\d{1,2})(?![\d,.])/); if (m && +m[1] >= 2 && +m[1] <= 64) return +m[1];
    m = c.match(/BITOLA:?(\d{1,2}[,.]\d+)/); if (m) return mmDash(Number(m[1].replace(',', '.')));
    m = c.match(/DIAMETRO(?:INTERNO|NOMINAL)[^;]*?:?(\d{1,3}(?:[,.]\d+)?)MM/); if (m) { const d = mmDash(Number(m[1].replace(',', '.'))); if (d) return d; }
    m = c.match(/DIAMETRO(?:INTERNO|NOMINAL)?:?(\d+(?:\.\d\/\d+)?|\d\/\d+)(?:POL|")/) || c.match(/^[^;]*?(\d+\.\d\/\d+|\d\/\d+|\d)(?:POL|")/);
    if (m) { const v = tofrac(m[1].replace('.', ' ')); if (v) return Math.round(v * 16); }
    return null;
  }
  function psiDe(t) {
    const m = t.match(/PRESSAO (?:DE )?TRABALHO\s*:?\s*([\d.]+)\s*(PSI|BAR|LBS)/);
    if (!m) return null; const v = Number(m[1].replace(/\./g, ''));
    return m[2] === 'BAR' ? v * 14.5 : v;
  }
  function comprimentoDe(t) {
    const m = t.match(/COMPRIMENTO(?: TOTAL)?\s*:?\s*([\d.]+(?:,\d+)?)\s*MM/) || t.match(/COMPRIMENTO(?: TOTAL)?\s*:?\s*([\d.]+(?:,\d+)?)\s*M\b/);
    if (!m) return null; let v = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (/\s*M\b/.test(m[0]) && !/MM/.test(m[0])) v *= 1000;
    return Math.round(v);
  }

  // ---------------- terminais ----------------
  const MJIC = [[7/16,4],[1/2,5],[9/16,6],[3/4,8],[7/8,10],[1+1/16,12],[1+3/16,14],[1+5/16,16],[1+5/8,20],[1+7/8,24],[2+1/2,32]];
  const MORFS = [[9/16,4],[11/16,6],[13/16,8],[1,10],[1+3/16,12],[1+7/16,16],[1+11/16,20],[2,24]];
  const MPIPE = [[1/8,2],[1/4,4],[3/8,6],[1/2,8],[5/8,10],[3/4,12],[1,16],[1.25,20],[1.5,24],[2,32],[2.5,40],[3,48]];
  const nearM = (tab, v, tol = 0.03) => { let b = null, bd = 9; for (const [k, d] of tab) { const x = Math.abs(k - v); if (x < bd) { bd = x; b = d; } } return bd <= tol ? b : null; };
  const THR_S = { 14: 6, 16: 8, 18: 10, 20: 12, 22: 14, 24: 16, 30: 20, 36: 25, 42: 30, 52: 38 };
  const THR_L = { 12: 6, 14: 8, 16: 10, 18: 12, 22: 15, 26: 18, 30: 22, 36: 28, 45: 35, 52: 42 };
  const TUBO_S = [6, 8, 10, 12, 14, 16, 20, 25, 30, 38], TUBO_L = [6, 8, 10, 12, 15, 18, 22, 28, 35, 42];
  function polDe(s) { const m = s.match(/(\d+\.\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?:POL|"|'')/); if (!m) return null; return /\//.test(m[1]) ? tofrac(m[1].replace('.', ' ')) : Number(m[1].replace(',', '.')); }

  function segmentos(c) {
    // c = texto compacto (sem espaços)
    const c2 = c.replace(/^MANGUEIRA(?:HIDRAULICA)?TERMINAL:?/, 'MANGUEIRA:');
    const ini0 = c2.search(/TERMINAL(?:\(?A\)?(?=[:;])|A:|LADO1|ESQUERDO|ESQ)|TERMINALA|CONEXAOA|MONTAGEM|TERMINAL\(A\)|TERMINAIS|TERMINAL/);
    const ini = ini0 < 0 ? -1 : ini0 + (c.length - c2.length);
    if (ini < 0) return null;
    const rxB = /TERMINAL(?:\(B\)|B(?=[:;])|LADO2|DIREITO)|TERMINALB|CONEXAOB|LADO2|DIREITO:/g;
    rxB.lastIndex = ini + 8; const mb = rxB.exec(c);
    const fim = (s) => { const k = s.search(/MATERIALDOTERMINAL|COMPRIMENTO|REVESTIMENTO|ACABAMENTO|NORMA:|NOTA|APLICACAO|OBSERVA/); return k > 20 ? s.slice(0, k) : s; };
    if (!mb) return { a: fim(c.slice(ini)), b: null };
    return { a: c.slice(ini, mb.index), b: fim(c.slice(mb.index)) };
  }
  function angDe(s, lado) {
    const m = s.match(/ANGULO[A-Z]*?(?:TERMINAL)?[AB]?:?(RETO|90|45)/) || s.match(/(90|45)(?:GR|°|º)/);
    if (m) return m[1] === 'RETO' ? '' : m[1];
    return '';
  }
  function terminal(s, dash, umaTrama, full) {
    const macho = /MACHO/.test(s) && !/FEMEA/.test(s);
    if (/FLANGE/.test(s)) {
      const v = polDe(s); const td = v ? nearM(MPIPE, v, 0.05) : dash;
      const h = /CODIGO62|COD62|SAE62|6000PSI|CODE62/.test(s) || /SAE62|CODIGO62|CODE62/.test(full);
      return { T: h ? 'FLH' : 'FL', td: td || dash };
    }
    const metr = /DKO|24GR|24°|METRICA|DIN|\bM\d{2}\b|ROSCATIPO:M\d{2}/.test(s);
    if (metr && !/UNF|UNS|JIC|NPT|BSP/.test(s)) {
      const nums = [...s.matchAll(/(?:DIAMETRO[A-Z]?:?|DIAMETROEXTERNO(?:DO)?TUBO:?|TUBO:?|ROSCATIPO:M|M|DKO)(\d{2})(?:MM|[LS])?/g)].map(x => +x[1]);
      const opc = [];
      const add = (serie, td) => { if (td) opc.push({ T: macho ? (serie === 'S' ? 'MDH' : 'MDL') : (serie === 'S' ? 'FDHORX' : 'FDLORX'), td }); };
      const ds = s.match(/DKO(\d{2})([LS])/); if (ds) add(ds[2], +ds[1]);
      const thrM = s.match(/ROSCATIPO:M(\d{2})|\bM(\d{2})X|M(\d{2})X\d/);
      if (thrM) { const th = +(thrM[1] || thrM[2] || thrM[3]); add('S', THR_S[th]); add('L', THR_L[th]); }
      for (const v of nums) {
        if (THR_S[v] || THR_L[v]) { add('S', THR_S[v]); add('L', THR_L[v]); }
        if (TUBO_S.includes(v)) add('S', v);
        if (TUBO_L.includes(v)) add('L', v);
      }
      if (!opc.length) return null;
      const r = opc[0]; r.opcoes = opc; return r;
    }
    if (/ORFS|FACEPLANA|SEDEPLANA|ORING|O-RING/.test(s) && !/NPT|BSP/.test(s)) { const v = polDe(s); return { T: macho ? 'MFFOR' : 'FFORX', td: v ? nearM(MORFS, v) : dash }; }
    if (/BSP/.test(s)) { const v = polDe(s); return { T: macho ? 'MBSPP' : 'FBSPORX', td: v ? nearM(MPIPE, v) : dash }; }
    if (/NPT/.test(s)) { const v = polDe(s); return { T: macho ? 'MP' : (/GIRAT/.test(s) ? 'FPX' : 'FP'), td: v ? nearM(MPIPE, v) : dash }; }
    if (/JIC|37|UNF|UNS/.test(s)) { const v = polDe(s); return { T: macho ? 'MJ' : 'FJX', td: v ? nearM(MJIC, v) : dash }; }
    return null;
  }

  // apelido da mangueira -> [_, bitola, família]: 8AGR2, 12EFG4KSML-TRANSPOWER, 164XHXCTN (4SH: família 4XH)
  function famMang(a) {
    const x = String(a || '').match(/^(\d{1,2})(4XH)/); if (x) return x;
    return String(a || '').match(/^(\d{1,2})([A-Z][A-Z0-9]*?)(SML|-|$)/);
  }
  // relpro_ftm (linhas como objetos) -> resumo compacto para o motor
  function agregarFtm(rows) {
    const R = { uso: {}, usoR: {}, usoTer: {}, usoTerR: {}, co: {}, tot: {}, capa: {}, ftms: [] };
    const base = (s) => comp(String(s || '')).replace(/SML.*$/, '').replace(/INOX.*$/, '').replace(/(90|45)$/, '');
    const capas = {};
    // exportação em .xlsx do SIG traz quantidades sem a vírgula (200 = 2,00): detecta e corrige
    let cem = 0, tot = 0; for (const r of rows || []) { const q = Number(r.qtdter1); if (!q) continue; tot++; if (q >= 100 && q % 100 === 0) cem++; }
    const escQ = tot && cem / tot > 0.5 ? 100 : 1;
    if (escQ > 1) rows = rows.map(r => Object.assign({}, r, { qtdter1: Number(r.qtdter1) / 100, qtdter2: Number(r.qtdter2) / 100, qtdcapa: Number(r.qtdcapa) / 100 }));
    // FTMs recentes pesam mais (a Melting troca de marca/fornecedor com o tempo)
    let maxN = 1; for (const r of rows || []) { const n = Number(r.id || r.ftm); if (n > maxN) maxN = n; }
    for (const r of rows || []) {
      const mang = String(r.mang_id || '').replace(/\.0+$/, ''); if (!mang || mang === '0') continue;
      const w = 1 + 20 * Math.pow((Number(r.id || r.ftm) || 0) / maxN, 8);
      R.uso[mang] = (R.uso[mang] || 0) + w;
      const recente = (Number(r.id || r.ftm) || 0) > maxN * 0.85;
      if (recente) R.usoR[mang] = (R.usoR[mang] || 0) + 1;
      const fm = famMang(String(r.descmang || '').trim()); const fk = fm ? fm[1] + fm[2] : '';
      const t1 = String(r.ter1_id || '').replace(/\.0+$/, ''), t2 = String(r.ter2_id || '').replace(/\.0+$/, '');
      for (const [tid, td] of [[t1, r.descter1], [t2, r.descter2]]) {
        if (!tid || tid === '0' || !td) continue;
        R.usoTer[tid] = (R.usoTer[tid] || 0) + w; if (recente) R.usoTerR[tid] = (R.usoTerR[tid] || 0) + 1;
        const b = base(td); R.tot[b] = (R.tot[b] || 0) + 1; const k = fk + '|' + b; R.co[k] = (R.co[k] || 0) + 1;
      }
      const cp = String(r.capa_id || '').replace(/\.0+$/, '');
      if (cp && cp !== '0') { capas[mang] = capas[mang] || {}; capas[mang][cp] = (capas[mang][cp] || 0) + w; }
      const n = Number(r.id || r.ftm); const met = Math.round(Number(String(r.metragem || '0').replace(',', '.')));
      if (n) R.ftms.push([n, mang, t1 === '0' ? '' : t1, t2 === '0' ? '' : t2, met, Number(r.qtdter1) || 0]);
    }
    for (const m in capas) { const best = Object.entries(capas[m]).sort((a, b) => b[1] - a[1])[0]; R.capa[m] = best[0]; }
    for (const o of [R.uso, R.usoTer]) for (const k in o) o[k] = Math.round(o[k] * 10) / 10;
    return R;
  }
  Catalogo.prototype.definirFtm = function (R) {
    if (!R) return;
    this._ftm = R;
    // mangueiras do cadastro por bitola + família, ordenadas pelo uso nas FTMs
    this._mang = new Map();
    for (const o of this.lista) {
      const m = famMang(o.a); if (!m || !/MANG/.test(o.d) || /^FTM|\*/.test(o.id + o.a)) continue;
      const k = +m[1] + '|' + m[2];
      if (!this._mang.has(k)) this._mang.set(k, []);
      this._mang.get(k).push(o);
    }
    const usoM = (o) => (R.usoR[o.id] || 0) * 1e6 + (R.uso[o.id] || 0);
    for (const l of this._mang.values()) l.sort((a, b) => usoM(b) - usoM(a));
    // terminais do cadastro pelo apelido-base
    this._ter = new Map();
    for (const o of this.lista) {
      if (!/^\d{1,2}G\d/.test(o.a) && !/^\d{1,2}PCM/.test(o.a)) continue;
      const b = comp(o.a).replace(/SML.*$/, '');
      if (!this._ter.has(b)) this._ter.set(b, []);
      this._ter.get(b).push(o);
    }
    const usoT = (o) => ((R.usoTerR || {})[o.id] || 0) * 1e6 + (R.usoTer[o.id] || 0);
    for (const l of this._ter.values()) l.sort((a, b) => usoT(b) - usoT(a));
    // construção mais montada por bitola (cliente que não informa norma)
    const fd = new Map();
    for (const [k, l] of this._mang) { const [d, f] = k.split('|'); const u = l.reduce((a, o) => a + (R.usoR[o.id] || 0) * 50 + (R.uso[o.id] || 0), 0); if (!fd.has(+d)) fd.set(+d, []); fd.get(+d).push([f, u]); }
    this._famPorDash = new Map([...fd].map(([d, l]) => [d, l.filter(x => x[1] > 0 && /^(AGR[12]|M3K|C[12]A?T|EFG[46]K)$/.test(x[0])).sort((a, b) => b[1] - a[1]).map(x => x[0])]).filter(([d, l]) => l.length));
    // FTM idêntica: mangueira + terminais
    this._ftmIx = new Map();
    for (const [n, mang, t1, t2, met, q1] of R.ftms) {
      const ts = [t1, q1 >= 2 ? t1 : t2].filter(Boolean).sort().join('+');
      const k = mang + '|' + ts; if (!this._ftmIx.has(k)) this._ftmIx.set(k, []);
      this._ftmIx.get(k).push([n, met]);
    }
  };
  const marcaMang = (a) => (String(a).match(/SML-?([A-Z]+)/) || [, ''])[1];
  // marca de mangueira que o cliente costuma comprar (de-para + vendas dele)
  function prefMarcaMang(ctx, cat) {
    if (!ctx) return null;
    if (ctx._prefMarcaMang !== undefined) return ctx._prefMarcaMang;
    const n = {};
    const ids = [...(ctx.depara ? ctx.depara.values() : []), ...(ctx.historico ? [...ctx.historico.values()].map(h => h.id) : [])];
    for (const id of ids) { const p = cat.get(id); if (!p || !/MANG/.test(p.d)) continue; const mk = marcaMang(p.a); if (mk) n[mk] = (n[mk] || 0) + 1; }
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    ctx._prefMarcaMang = best && best[1] >= 2 ? best[0] : null;
    return ctx._prefMarcaMang;
  }
  function mangueiraRule(det, cat, ctx) {
    if (!cat._ftm) return null;
    const t = up(det).replace(/\s+/g, ' ');
    if (!/^MANGUEIRA/.test(t) || !/TERMINAL|MONTAD|PRENSAD/.test(t)) return null;
    const dash = dashDe(t); if (!dash) return null;
    const psi = psiDe(t);
    let fams = null;
    const tc = t.replace(/\s+/g, '');
    for (const [rx, f] of NORMA_FAM) if (rx.test(t) || rx.test(tc)) { fams = f; break; }
    const porNorma = !!fams;
    if (!fams) fams = familiaPorConstrucao(t, psi);
    if (!fams) return null;
    let mang = null, fam = null, altsM = [];
    const pm = prefMarcaMang(ctx, cat);
    for (const f of fams) {
      const l = cat._mang.get(dash + '|' + f); if (!l || !l.length) continue;
      const pref = pm ? l.find(o => marcaMang(o.a) === pm) : null;
      mang = pref || l[0]; fam = f; altsM = l.filter(o => o !== mang).slice(0, 3); break;
    }
    if (!mang) return null;
    // terminais
    const R = cat._ftm; const sg = segmentos(tc);
    const ters = [];
    if (sg) {
      const umaTrama = /AGR1|C1T|M3K/.test(fam);
      for (const s of [sg.a, sg.b]) {
        if (!s) continue;
        let x = terminal(s, dash, umaTrama, tc); if (!x || !x.td) { ters.push(null); continue; }
        if (x.opcoes) {
          const fk = dash + fam;
          const sc = (o) => { const b = dash + 'G' + o.td + o.T; return (R.co[fk + '|' + b] || 0) * 1000 + (R.tot[b] || 0); };
          x = x.opcoes.slice().sort((p, q) => sc(q) - sc(p))[0];
        }
        const ang = angDe(s); const b = dash + 'G' + x.td + x.T + ang;
        const l = cat._ter.get(b) || [];
        const inox = /INOX|AISI|316|304/.test(s) || /TERMINAL[^;]*INOX/.test(tc);
        const o = (inox ? l.find(z => /INOX/.test(z.a)) : l.find(z => !/INOX/.test(z.a))) || l[0] || null;
        ters.push(o ? { prod: o, apelido: b } : { prod: null, apelido: b });
      }
      if (ters.length === 1) ters.push(ters[0]);
    }
    const comprimento = comprimentoDe(t);
    const capaId = R.capa[mang.id]; const capa = capaId ? cat.get(capaId) : null;
    // FTM idêntica
    let ftm = null;
    if (ters.length === 2 && ters.every(x => x && x.prod)) {
      const l = cat._ftmIx.get(mang.id + '|' + ters.map(x => x.prod.id).sort().join('+')) || [];
      ftm = l.find(([n, met]) => comprimento && met === comprimento) || null;
      if (!ftm && l.length) ftm = ['~' + l[0][0], l[0][1]];
    }
    return { dash, fam, porNorma, mang, altsM, ters, comprimento, capa, ftm };
  }

  // ---------------- mangueira montada pela descrição livre do cliente ----------------
  // "MANG. R2 1/2 X 1,5M C/ TERM. FEMEA JIC 3/4 GIRATORIO RETO E 90", "FLEXIVEL 3/8 2SN DKOL 12 X DKOL 12 90 1200MM",
  // "8AGR2 8G8FJX 8G8FJX90 1000MM", "MANGUEIRA 1/2 1 TRAMA TERMINAIS NPT 1/2 MACHO"...
  // Separa mangueira / terminais / comprimento, monta no padrão Melting e lista o que falta o cliente informar.
  const FAM_COD = /\b(\d{1,2})\s?-?\s?(4XH|AGR1|AGR2|C1TH|C1T|C2AT|M2T|M3K|M4K|EFG4KXLL|EFG4K|EFG5K|EFG6K|C14|C3H|C4H|C5C|C6H|J2AT|MXG4KXTP)\b/;
  const NORMA_CLI = [
    [/\bR\s?2\s?(?:AT)?\b|\b2\s?SN\b|\b2\s?TRAMAS?\b/, ['AGR2', 'C2AT', 'M2T']],
    [/\bR\s?1\s?(?:AT)?\b|\b1\s?SN\b|\b1\s?TRAMAS?\b/, ['AGR1', 'C1T']],
    [/\bR\s?17\b/, ['M3K', 'AGR2']],
    [/\bR\s?12\b|\b4\s?SP\b|\b4\s?ESPIRA/, ['EFG4K', 'EFG4KXLL', 'MXG4KXTP']],
    [/\bR\s?1[35]\b|\b4\s?SH\b|\b6\s?ESPIRA/, ['EFG6K', 'EFG5K']],
    [/\bR\s?7\b|TERMOPLAST/, ['C7', 'M7']],
    [/TEFLON|PTFE|\bR\s?14\b/, ['C14']]
  ];
  const TER_COD = /\b(FJX|FJ|FDLORX|FDHORX|FFORX|FBSPORX|MBSPP|MFFOR|FPX|MDL|MDH|MLSP|FLH|MJ|MP|FP)(90|45)?\b/;
  const TER_KW = /TERMINA|\bTERMS?\b|\bPL\s?\d|PONTA LISA|FEMEA|\bFEM\b|MACHO|JIC|NPT|BSP|ORFS|DKO|FLANGE|BANJO|\bM\d{2}\s?X\s?[12]/;
  const DN_MM = (v) => { let best = null, bd = 9; for (const [mm, ds] of DI_DASH) if (Math.abs(mm - v) < bd) { bd = Math.abs(mm - v); best = ds; } return bd <= 2 ? best : null; };
  function fracDe(s) {
    const m = s.match(/(\d+\.\d+\/\d+|\d\/\d+)/) || s.match(/(?<![\d,.])(\d(?:[.,]\d+)?)\s*(?:"|POL|'')/);
    if (!m) return null; return /\//.test(m[1]) ? tofrac(m[1].replace('.', ' ')) : Number(m[1].replace(',', '.'));
  }
  function compCliente(t) {
    let m = t.match(/\b(?:COMPRIMENTO|COMPR?|L|C)\s?[.:=]?\s*(?:TOTAL\s*)?:?\s*(\d+(?:[.,]\d+)?)\s*(MM|MTS?|METROS?|M|CM)?\b/);
    if (!m) m = t.match(/(?<![\d\/.,])(\d+(?:[.,]\d+)?)\s*(MM|MTS?|METROS?|CM|M)\b(?!\s?\d)/);
    if (!m) { const x = t.match(/\bX\s*(\d{3,5})\s*$/); if (x) return +x[1]; return null; }
    let v = Number(m[1].replace(/\.(?=\d{3}\b)/, '').replace(',', '.')); const u = m[2] || (v < 100 ? 'M' : 'MM');
    if (/^M(T|TS|ETROS?)?$/.test(u)) v *= 1000; else if (u === 'CM') v *= 10;
    return v >= 50 && v <= 100000 ? Math.round(v) : null;
  }
  // um terminal descrito pelo cliente -> {T, td, ang}
  function terminalCliente(seg, dash) {
    let s = seg.replace(/\bDK\s+O\b/g, 'DKO').replace(/DKO\s*(\d{1,2})\s*-?\s*([LS])\b/g, 'DKO$2$1').replace(/\bFG\b/g, 'FEMEA GIRAT').replace(/\bFEM\b\.?/g, 'FEMEA').replace(/GIRAT\w*|\bGIR\b\.?/g, 'GIRAT').replace(/DKO\s?([LS])\s*-?\s*(\d{1,2})\b/g, (m, a, b) => 'DKO' + b.padStart(2, '0') + a)
      .replace(/TUBO\s?(\d{1,2})\s?([LS])\b/g, (m, a, b) => 'DKO' + a.padStart(2, '0') + b).replace(/37\s?(?:°|º|GR\w*)/g, 'JIC').replace(/24\s?(?:°|º|GR\w*)/g, '24GR');
    let ang = '';
    const a = s.match(/(?<![\d\/,.X])(90|45)\s*(?:°|º|GR\w*|G\b)?(?![\d\/,])/);
    if (a) ang = a[1]; else if (/CURV|COTOVELO|JOELHO/.test(s)) ang = '90';
    s = s.replace(/(?<![\d\/,.X])(90|45)\s*(?:°|º|GR\w*|G\b)?(?![\d\/,])/g, ' ');
    const cod = s.match(TER_COD);
    let x = null;
    const pl = s.match(/(?:\b\d{0,2}PL|PONTA LISA(?: TUBO)?)\s?(\d{1,2})\b/);
    if (pl) x = { T: 'MLSP', td: +pl[1] };
    else if (cod) {
      if (cod[2]) ang = cod[2];
      const v = fracDe(s); const n = s.match(/-\s?(\d{1,2})\b/);
      const T = cod[1], tab = /J/.test(T) ? MJIC : /FOR/.test(T) ? MORFS : MPIPE;
      const td = n ? +n[1] : v ? nearM(tab, v, 0.05) : dash;
      x = { T: T === 'FJ' ? 'FJX' : T, td };
    } else {
      // "NPT 1", "ORFS 1 90": polegada inteira sem aspas
      if (/NPT|BSP|ORFS|FLANGE|JIC/.test(s)) s = s.replace(/(?<![\d\/.,A-Z])([1-3])(?![\d\/.,"]|\s?(?:"|POL|MM|MTS?|M\b|[LS]\b))/g, '$1"');
      const sc = s.replace(/(\d+\.\d+\/\d+|\d\/\d+)(?!\d|\s?(?:"|POL))/g, '$1"').replace(/(?:SAE|COD\w*)\s?\.?\s?(6[12])\b/g, 'CODIGO$1').replace(/(\d)\s+(?=\d)/g, '$1_').replace(/\.(?!\d+\/)/g, '').replace(/[^A-Z0-9\/",._]/g, '');
      x = terminal(sc, dash, false, sc);
      const dk = sc.match(/DKO(\d{2})([LS])/);
      if (x && x.opcoes && dk) { const f = x.opcoes.filter(o => o.td === +dk[1] && (dk[2] === 'S' ? /H/ : /L/).test(o.T)); if (f.length) { x = Object.assign({}, f[0]); delete x.opcoes; } }
      else if (x) { const n = s.match(/(?:JIC|NPT|BSP\w*|ORFS)\s*-\s?(\d{1,2})\b|\b-(\d{1,2})\b/); if (n && !/DKO|M\d{2}/.test(sc)) x.td = +(n[1] || n[2]); }
    }
    if (!x || !x.td) return null;
    x.ang = ang; return x;
  }
  // código Continental / COPABO (S4SH-16, SR2SN-12, SR1SN-08, SR16SC-08 + 2=JCFX-1616 / 1=FL45-2424 + 2=UCS-16)
  // -> padrão Melting ("MANGUEIRA 16 4XH 16G16FJX 16G16FJX 1150MM"), lido depois pelo mangueiraLivre
  const CONTI_MANG = { S4SH: ['4XH', 'EFG6K'], S4SP: ['EFG4K'], SR12: ['EFG4K'], SR13: ['EFG6K'], SR15: ['EFG6K'], SR2SN: ['AGR2', 'C2AT'], SR2AT: ['AGR2', 'C2AT'], SR1SN: ['AGR1', 'C1T'], SR1AT: ['AGR1', 'C1T'], SR16SC: ['M2T', 'AGR2'], SR17: ['M3K'], GR1SN: ['C1T', 'AGR1'], GR2SN: ['C2AT', 'AGR2'] };
  const CONTI_TER = { JCFX: 'FJX', JCF: 'FJX', JCM: 'MJ', FL: 'FL', FLH: 'FLH', FLC: 'FLH', NPTM: 'MP', MP: 'MP', BSPF: 'FBSPORX', BSPM: 'MBSPP', ORFF: 'FFORX', ORFM: 'MFFOR', DKOL: 'FDLORX', DKOS: 'FDHORX' };
  function continentalParaMelting(det, cat) {
    const t = up(det).replace(/\s+/g, ' ');
    const h = t.match(/\b(S4SH|S4SP|SR12|SR13|SR15|SR2SN|SR2AT|SR1SN|SR1AT|SR16SC|SR17|GR1SN|GR2SN)-(\d{2})\b/); if (!h) return null;
    const dash = +h[2]; const fs = CONTI_MANG[h[1]];
    const fam = (cat && cat._mang && fs.find(f => (cat._mang.get(dash + '|' + f) || []).length)) || fs[0];
    const ters = []; let incompleto = false;
    // "2=JCFX-1616", "1JCFX90-1612"; cortado na planilha ("2=JCFX", "2=JCFX-16") -> assume rosca = bitola, a confirmar
    for (const m of t.matchAll(/(?:^|[\/;+\s])(\d)\s*=?\s*(JCFX|JCF|JCM|FLH|FLC|FL|NPTM|MP|BSPF|BSPM|ORFF|ORFM|DKOL|DKOS)(90|45)?(?:-(\d{2})(\d{2})?)?(?![A-Z0-9])/g)) {
      const T = CONTI_TER[m[2]]; if (!T) continue;
      const a1 = m[4] ? +m[4] : dash, a2 = m[5] ? +m[5] : (m[4] ? +m[4] : dash);
      if (!m[5]) incompleto = true;
      for (let i = 0; i < Math.min(2, +m[1]); i++) ters.push(a1 + 'G' + a2 + T + (m[3] || ''));
    }
    const cm = t.match(/X\s*([\d.]+)\s*(MM|M)\b/) || t.match(/X\s*(\d{3,5})(?![\d\/])/);
    let comp = null; if (cm) { comp = Number(cm[1].replace(/\.(?=\d{3}\b)/g, '')); if (cm[2] === 'M' && comp < 100) comp *= 1000; }
    return { texto: 'MANGUEIRA ' + dash + ' ' + fam + ' ' + ters.join(' ') + (comp ? ' ' + comp + 'MM' : ''), dash, fam, ters: ters.length, codigo: h[0], incompleto };
  }
  function mangueiraLivre(det, cat, ctx) {
    if (!cat._ftm) return null;
    const t = up(det).replace(/(?<![\/\dA-Z.,])(\d)[\s-]+(\d\/\d+)/g, '$1.$2').replace(/\s+/g, ' ').trim();
    const fc = t.match(FAM_COD);
    if (!fc && !/^(MANG|FLEX)/.test(t)) return null;
    if (/JARDIM|INCENDIO|BOMBEIRO|PVC|SILICONE|CRISTAL|ASPIRA|SUCCAO|GAS\b|OXIGENIO|ACETILENO|AR COMPRIMIDO|PNEUMATIC|POLIURETANO|NYLON/.test(t)) return null;
    // onde começam os terminais
    const iTer = t.search(TER_KW); const iCod = t.search(TER_COD);
    const corte = [iTer, iCod].filter(i => i > 0).sort((a, b) => a - b)[0];
    const head = corte ? t.slice(0, corte) : t;
    // família + bitola
    let fams = null, porNorma = false, dash = null;
    if (fc) { dash = +fc[1]; fams = [fc[2]]; porNorma = true; }
    if (!fams) for (const [rx, f] of NORMA_FAM.concat(NORMA_CLI)) if (rx.test(t)) { fams = f; porNorma = true; break; }
    const psi = (() => { const m = t.match(/(\d[\d.]*)\s*(PSI|BAR)\b/); if (!m) return null; const v = Number(m[1].replace(/\./g, '')); return m[2] === 'BAR' ? v * 14.5 : v; })();
    if (!fams) { const f = familiaPorConstrucao(t, psi); if (f) { fams = f; porNorma = true; } }
    if (!dash) {
      let m = t.match(/BITOLA\s*:?\s*-?\s*(\d{1,2})\b(?![\/.,])/) || head.match(/(?:^|\s)[-#]\s?(\d{1,2})\b(?![\/.,])/);
      if (m) dash = +m[1];
      else if ((m = t.match(/\bDN\s?(\d{1,2})\b/))) dash = DN_MM(+m[1]);
      else if ((m = t.match(/\b(\d{1,2}(?:[.,]\d)?)\s*MM\s*(?:DE\s*)?(?:DI|DIAM|D\.I|INTERNO)/))) dash = DN_MM(Number(m[1].replace(',', '.')));
      else { const v = fracDe(head); if (v && v <= 3) dash = Math.round(v * 16); }
      const h2 = head.replace(/\b\d\s?(?:TRAMAS?|SN|SP|SH|ESPIRA\w*)\b|SAE\s?100\s?R\s?\d+\w*|\bR\s?\d{1,2}(?:AT)?\b/g, ' ').replace(/\s+/g, ' ');
      if (!dash && (m = h2.match(/^(?:MANG\w*|FLEXIVEL|FLEX)\.?\s+(?:HIDRAULICA\s+)?([1-3])\b(?![\/.,]|\s?(?:MM|MTS?|METROS?|M)\b)/))) dash = +m[1] * 16;
      const tc = t.match(/\b(\d{1,2})G\d/); if (!dash && tc) dash = +tc[1];
    }
    if (!dash || dash < 3 || dash > 48) return null;
    const pend = [];
    if (!fams) {
      // sem norma: a construção mais montada nessa bitola
      const fu = cat._famPorDash && cat._famPorDash.get(dash);
      if (!fu) return null;
      fams = fu; pend.push('norma/pressão da mangueira');
    }
    let mang = null, fam = null, altsM = [];
    const pm = prefMarcaMang(ctx, cat);
    for (const f of fams) {
      const l = cat._mang.get(dash + '|' + f); if (!l || !l.length) continue;
      const pref = pm ? l.find(o => marcaMang(o.a) === pm) : null;
      mang = pref || l[0]; fam = f; altsM = l.filter(o => o !== mang).slice(0, 3); break;
    }
    if (!mang) return null;
    // terminais
    const R = cat._ftm; const ters = [];
    const resto = corte ? t.slice(corte) : '';
    const achar = (x) => {
      if (x.opcoes) {
        const fk = dash + fam;
        const sc = (o) => { const b = dash + 'G' + o.td + o.T; return (R.co[fk + '|' + b] || 0) * 1000 + (R.tot[b] || 0); };
        const ang = x.ang; x = x.opcoes.slice().sort((p, q) => sc(q) - sc(p))[0]; x.ang = ang;
      }
      // mangueiras espiraladas (4SP/4SH/R12/R13) usam terminal da linha GS
      let b = dash + 'G' + x.td + x.T + x.ang; let l = cat._ter.get(b) || [];
      if (/^EFG|^MXG|^M4K/.test(fam)) { const bs = dash + 'GS' + x.td + x.T + x.ang; const ls = cat._ter.get(bs) || []; if (ls.length) { b = bs; l = ls; } }
      const inox = /INOX|AISI|316|304/.test(t);
      const o = (inox ? l.find(z => /INOX/.test(z.a)) : l.find(z => !/INOX/.test(z.a))) || null;
      return o ? { prod: o, apelido: b, x } : { prod: null, apelido: b, x };
    };
    // terminais já no padrão Melting (8G12FJX90)
    for (const m of t.matchAll(/\b(\d{1,2})G(\d{1,2}(?:,\d)?)([A-Z]+?)(90|45)?(?:SML\w*)?(?=\s|$|[;,+])/g)) {
      if (+m[1] !== dash) continue;
      ters.push(achar({ T: m[3], td: m[2], ang: m[4] || '' }));
    }
    if (!ters.length && resto) {
      const segs = resto.replace(/^(?:C\/|COM)\s*/, '').split(/\s(?:X|E|\/|\+|-)\s|;|\+|\bLADO\s?[AB12]\s?:?|\bPONTA\s?[AB12]\s?:?|\bOUTRA PONTA\b|\bOUTRO LADO\b|\bTERMINAL\s?[AB12]\s?:?/).map(s => s.trim()).filter(Boolean);
      // "FJX 1.1/16 FJX90 1.1/16" / "FEMEA JIC 3/4 FEMEA JIC 3/4 90": quebra onde começa outro terminal
      const ST = new RegExp('\\b(?:FEMEA|MACHO|FLANGE)\\b|' + TER_COD.source, 'g');
      const segs2 = [];
      for (const sg of segs) { let ini = 0, n = 0; for (const m of sg.matchAll(ST)) { if (n++ && m.index > ini) { segs2.push(sg.slice(ini, m.index).trim()); ini = m.index; } } segs2.push(sg.slice(ini).trim()); }
      let ult = null;
      for (const sg of segs2) {
        if (ters.length >= 2) break;
        const x = terminalCliente(sg, dash);
        if (x) { ters.push(achar(x)); ult = x; continue; }
        // "... RETO E 90": mesmo terminal, outro ângulo
        const so = sg.match(/^(?:RETO|(90|45)\s*(?:°|º|GR\w*)?|CURVO)$/);
        if (so && ult) ters.push(achar(Object.assign({}, ult, { ang: so[1] || (/CURVO/.test(sg) ? '90' : '') })));
      }
      if (ters.length === 1 && (/TERMINAIS|\bTERMS\b|AMBOS|AMBAS|2\s?(?:TERMINAIS|PONTAS)|DUAS PONTAS|AS PONTAS|NAS PONTAS|2X/.test(t) || !/OUTRA|OUTRO|SEM TERMINAL|PONTA LIVRE|PONTA LISA/.test(t))) ters.push(ters[0]);
    }
    if (!ters.length && TER_KW.test(t)) return null;           // fala de terminal mas não entendemos: deixa para outras regras
    if (!ters.length && !porNorma) return null;                // mangueira avulsa só com norma/construção clara
    const comprimento = compCliente(head + ' ' + resto.replace(/(?:JIC|NPT|BSP\w*|ORFS|DKO\w*|M\d{2}X[\d,]+)\s*[\d\/".,-]*/g, ' ')) || compCliente(t);
    if (ters.length === 2 && ters[0].x.ang && ters[1].x.ang && !/ANGULO|POSICAO|DEFASAG|ALINHAD|MESMO PLANO|\d{2,3}\s?(?:°|º|GR)\s*(?:ENTRE|DE MONTAGEM)/.test(t)) pend.push('ângulo de montagem entre os terminais curvos');
    if (ters.length && !comprimento) pend.push('comprimento');
    const capaId = ters.length ? R.capa[mang.id] : null; const capa = capaId ? cat.get(capaId) : null;
    let ftm = null;
    if (ters.length === 2 && ters.every(x => x.prod)) {
      const l = cat._ftmIx.get(mang.id + '|' + ters.map(x => x.prod.id).sort().join('+')) || [];
      ftm = l.find(([n, met]) => comprimento && met === comprimento) || null;
      if (!ftm && l.length) ftm = ['~' + l[0][0], l[0][1]];
    }
    return { dash, fam, porNorma, mang, altsM, ters, comprimento, capa, ftm, pend, avulsa: !ters.length, livre: true };
  }

  // ---------------- conexões pneumáticas (padrão Melting EC/EL/ET/EUC/EUL/EUT) ----------------
  // Festo QS-G1/4-6 -> EC6PT1/4TR; QSL(V)-G1/4-6 -> EL6PT1/4TR; QST-8 -> EUT8TR; QS-16 -> EUC16TR; QSL-8 -> EUL8TR;
  // ou por extenso: "CONEXAO RAPIDA RETA 6MM X 1/4", "CONEXAO PNEUMATICA L 8MM ROSCA 1/8"
  function pneumaticaRule(det, cat) {
    const t = up(det).replace(/\s+/g, ' ');
    let tipo = null, tubo = null, rosca = null, porCodigo = false;
    const f = t.match(/\b(T?QS)(LV|L|T|Y)?(?:-|\s)(?:G|R)?(\d\/\d{1,2}|M\d)?-?(\d{1,2})?(?:-I|-H)?\b/);
    if (f && (f[3] || f[4])) {
      porCodigo = true; rosca = f[3] || null; tubo = f[4] ? +f[4] : (!f[3] ? null : null);
      if (!tubo && f[3] && /^\d{1,2}$/.test(f[3])) { tubo = +f[3]; rosca = null; }
      const k = (f[1] === 'TQS' ? 'T' : '') + (f[2] || '');
      tipo = /T/.test(k) ? (rosca ? 'ET' : 'EUT') : /L/.test(k) ? (rosca ? 'EL' : 'EUL') : (rosca ? 'EC' : 'EUC');
    } else if (/CONEX\w*\s+(RAPIDA|PNEUMATICA|RAP\b)|ENGATE RAPIDO PARA TUBO|CONEXAO INSTANTANEA/.test(t)) {
      const m = t.match(/(?:TUBO|P\/\s*TUBO|PARA TUBO|D\.?\s*E\.?)?\s*(\d{1,2})\s*MM/); if (m) tubo = +m[1];
      const r = t.match(/(?:ROSCA|G|R|BSP\w*|NPT\w*)\s*(\d\/\d{1,2})|(\d\/\d{1,2})\s*(?:"|POL|BSP|NPT)/); if (r) rosca = r[1] || r[2];
      const L = /\bL\b|COTOVELO|CURVA|JOELHO|90/.test(t), T = /\bT\b|\bTE\b|TEE/.test(t), U = /UNIAO|TUBO\s*\/\s*TUBO|TUBO-TUBO/.test(t);
      tipo = T ? (rosca ? 'ET' : 'EUT') : L ? (rosca ? 'EL' : 'EUL') : (rosca && !U ? 'EC' : 'EUC');
    }
    if (!tipo || !tubo || tubo > 16) return null;
    const base = tipo + tubo + (rosca ? 'PT' + rosca : '');
    const inox = /INOX|AISI|316|304/.test(t);
    const exato = cat.lookupApelido(base + 'TR' + (inox ? 'INOX' : ''));
    if (exato && cat.get(exato) && cat.get(exato).ativo) return { prod: cat.get(exato), base, porCodigo };
    const c = cat.lista.filter(o => o.ativo && o.a.startsWith(base) && !/^\d/.test(o.a.slice(base.length)) && !/VALVULA|ALTAPRESSAO/.test(o.a) && /INOX/.test(o.a) === inox).sort((a, b) => a.a.length - b.a.length);
    return c.length ? { prod: c[0], base, porCodigo, outras: c.slice(1, 4) } : { prod: null, base, porCodigo };
  }

  // ---------------- tubo de poliamida / nylon (padrão TUBONYLON[-11-]{DE}X{DI}{COR}) ----------------
  // "Tubing Poliamida 12 ... Espessura 0,75MM; Diametro Externo 4,00 MM; Cor Natural" -> TUBONYLON4X2,5NAT
  const COR_TUBO = [[/NATUR|TRANSL|INCOLOR|CRISTAL/, 'NAT'], [/PRET/, 'PRETO'], [/AZUL/, 'AZUL'], [/VERMELH/, 'VERMELHO'], [/AMAREL/, 'AMARELO'], [/VERDE/, 'VERDE'], [/BRANC/, 'BRANCO']];
  function tuboNylonRule(det, cat) {
    const t = up(det).replace(/\s+/g, ' ');
    if (!/\b(TUBO|TUBING|MANGUEIRA)\b/.test(t) || !/POLIAMIDA|NYLON|\bPA ?1[12]\b/.test(t)) return null;
    const n = (x) => Number(String(x).replace(',', '.'));
    let de = (t.match(/DI[AÂ]METRO EXTERNO\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*MM/) || t.match(/\bD\.?E\.?\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*MM/) || [])[1];
    let di = (t.match(/DI[AÂ]METRO INTERNO\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*MM/) || t.match(/\bD\.?I\.?\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*MM/) || [])[1];
    const esp = (t.match(/ESPESSURA(?: DA PAREDE)?\s*:?\s*(\d(?:[.,]\d+)?)\s*MM/) || [])[1];
    const x = t.match(/(?<![\d,.])(\d{1,2}(?:[.,]\d+)?)\s*X\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:MM)?(?![\d])/);
    if (!de && x) { de = x[1]; di = x[2]; }
    if (!de) return null;
    de = n(de); di = di != null ? n(di) : (esp != null ? Math.round((de - 2 * n(esp)) * 100) / 100 : null);
    if (di == null || di <= 0 || di >= de) return null;
    const f = (v) => String(+v.toFixed(2)).replace('.', ',');
    const cor = (COR_TUBO.find(([rx]) => rx.test(t)) || [, ''])[1];
    const pa11 = /POLIAMIDA\s*11|NYLON\s*-?\s*11|\bPA\s?11\b/.test(t);
    const bases = (pa11 ? ['TUBONYLON-11-'] : ['TUBONYLON', 'TUBONYLON-12-']).map(b => b + f(de) + 'X' + f(di));
    for (const b of bases) {
      const c = cat.lista.filter(o => o.ativo && o.a.startsWith(b) && !/^\d/.test(o.a.slice(b.length)) && (!cor || o.a.slice(b.length).startsWith(cor)))
        .sort((a, z) => a.a.length - z.a.length);
      if (c.length) return { prod: c[0], base: b + cor, outras: c.slice(1, 4), de, di, pa11 };
    }
    return { prod: null, base: bases[0] + cor, de, di, pa11 };
  }

  // ---------------- código do fabricante citado na descrição (20PM, 400SF, FFH04, 837BM...) ----------------
  const COD_RUIM = /^(\d+(MM|CM|M|MT|MTS|KG|G|V|VCA|VCC|W|KW|BAR|PSI|LBS|L|ML|PCS?|UN|HP|RPM|NM|A|MA)|M\d+(X[\d.,]+)?|\d+X\d*|[A-Z]\d|\d[A-Z]|LIB\d*|NR\d+|NBR\d+|DIN\d+|ISO\d+|SAE\d+\w*|ASTM\w*|AISI\d+|R\d{1,2}(AT)?|\d{1,2}SN|\d+(LBS|BAR)\w*|CF8M?|PN\d+|DN\d+|PG\d+|FIG\d+|IP\d+|CL\d+|CLASSE\d+|SCH\d+|N\d+|\d+TH|\d+[A-Z]?\/\d+.*|\d*R\d+[A-Z]*|\d+GR(AUS)?|A\d{3}[A-Z]*|AISI\w*|J\d{3,4}|\d+POL|\d*(BSP|NPT|UNF|JIC|ORFS|BSPP|BSPT|NPTF)\w*|\d+FPP|\d+FIOS|\d+(TRAMAS?|ESPIRAIS?)|SGM\d+|FTM\d+|\d+[LS]|\d+(MPA|KPA|LB|KGF|MCA|TON|GB|MB|TB|MAH|LM|CV)|\d+X\d+\w*)$/;
  function codigosFab(texto) {
    const t = up(texto).replace(/(\d)\s+(PM|SF|SH|PH|PF|SM)\b/g, '$1$2');
    const out = new Set();
    for (const w of t.split(/[\s;,:()"'*=]+/)) {
      const x = w.replace(/^[.\-]+|[.\-]+$/g, '').replace(/[.\-]/g, '');
      if (x.length < 4 || x.length > 14 || !/[A-Z]/.test(x) || !/\d/.test(x) || /\//.test(x) || COD_RUIM.test(x)) continue;
      out.add(x);
    }
    return out;
  }
  Catalogo.prototype.indiceCodigos = function () {
    if (this._codFab) return this._codFab;
    const ix = new Map();
    const df = new Map();
    for (const o of this.lista) {
      if (/^(SGM|FTM)/.test(o.a) || /\bSGM\b|^FTM/.test(o.d)) continue;     // kits/montagens citam códigos dos componentes
      for (const c of codigosFab(o.d)) { if (!ix.has(c)) ix.set(c, []); ix.get(c).push(o); }
      for (const w of new Set(o.d.split(/[^A-Z]+/))) if (w.length >= 4) df.set(w, (df.get(w) || 0) + 1);
    }
    for (const [k, l] of ix) if (l.length > 25) ix.delete(k);       // código genérico demais
    this._codFab = ix; this._dfPalavra = df; return ix;
  };
  function codigoFabricanteRule(det, cat) {
    const ix = cat.indiceCodigos(); const cs = [...codigosFab(det)].filter(c => ix.has(c));
    if (!cs.length) return null;
    const sc = new Map();
    for (const c of cs) for (const o of ix.get(c)) sc.set(o, (sc.get(o) || 0) + 1);
    const fd = fracs(det);
    // além do código, uma palavra pouco comum em comum (marca, tipo de peça: NITTO, ENGATE, SILENCIADOR...)
    const df = cat._dfPalavra; const pal = new Set(up(det).split(/[^A-Z]+/).filter(w => w.length >= 4 && (df.get(w) || 0) < 1500));
    const ok = [...sc].filter(([o]) => { const fc = fracs(o.d + ' ' + o.a); for (const f of fc) if (!fd.has(f)) return false;
      if (![...new Set(o.d.split(/[^A-Z]+/))].some(w => pal.has(w))) return false;
      return !travas(o, null, det, { tipo: false }); })
      .sort((a, b) => b[1] - a[1] || a[0].a.length - b[0].a.length);
    if (!ok.length) return null;
    return { prod: ok[0][0], cods: cs.filter(c => ix.get(c).includes(ok[0][0])), outras: ok.slice(1, 4).map(x => x[0]) };
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
    // inox 316 pedido: candidato que diz só 304 não serve
    if (/316/.test(x) && /304/.test(c) && !/316/.test(c)) return false;
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
    regrasSap: true,       // sem REF: montar o REF pela descrição SAP (conexões de tubo, Tupy)
    regrasCorreia: true,   // correias: casa perfil + comprimento + largura/canais
    regrasMangueira: true, // mangueira montada: mangueira + terminais + capa pelo histórico de FTMs
    descricaoCurta: true,  // descrições curtas: semelhança com o cadastro, todos os números iguais
    simCurta: 0.25,
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
    const res = (id, metodo, confianca, motivo, score, extra) => {
      const r = Object.assign({ produto_id: id ? String(id) : null, metodo, confianca, motivo, score: score == null ? null : Math.round(score * 100) / 100 }, extra || {});
      // a peça sugerida é a principal de algum kit SGM? oferece o kit montado como alternativa
      let ks = null;
      if (id && cat._kitsPorPrincipal && cat._kitsPorPrincipal.size) {
        // a própria peça ou outra versão dela (só corpo x completa) como principal de um kit
        const p0 = cat.get(id); const irmas = p0 && /^C?(?:U|J|T)[A-Z]{1,2}\d/.test(comp(p0.a)) ? cat.versoesTubo(p0) : [p0];
        ks = [].concat(...irmas.filter(Boolean).map(x => cat._kitsPorPrincipal.get(String(x.id)) || []));
      }
      if (ks && ks.length) {
        const kAlt = ks.slice(0, 4).filter(k => k !== String(id) && cat.get(k)).map(k => { const kk = cat.kit(k); return { id: k, score: null, recusa: 'kit SGM ' + kk.sgm + ' (' + kk.comps.slice(1).map(c => c[1]).filter(x => !/MAO ?DE ?OBRA/.test(up(x))).join(' + ').slice(0, 60) + ')' }; });
        r.alternativas = kAlt.concat(r.alternativas || []).slice(0, 8);
        if (kAlt.length) r.motivo += ' — existe kit SGM montado com essa peça (ver alternativas)';
      }
      return r;
    };
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
    // 3a) kit SGM citado no REF ou na descrição
    const sgmM = (ref + ' ' + det).match(/\bSGM\s*[-:]?\s*0*(\d{3,6})\b/);
    if (sgmM && cat.porSgm) {
      const id = cat.porSgm(sgmM[1]);
      if (id && ok(cat.get(id))) return res(id, 'apelido', 'alta', 'Kit SGM ' + sgmM[1] + ' citado no pedido');
    }
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
    // 4b) sem REF: monta um REF a partir da descrição SAP (conexões de tubo, Tupy)
    if (!r && P.regrasSap !== false) {
      const sx = refSintetico(det);
      if (sx) {
        const certo = sx.tipo !== 'tubo' || sx.series.length === 1;
        // escolhe entre "só corpo" e "completa" pela preferência do cliente; a outra vai como alternativa
        const versao = (id, conf, motivo, score) => {
          let p = cat.get(id); const vs = sx.tipo === 'tubo' ? cat.versoesTubo(p).filter(ok) : [p];
          const pref = vs.length > 1 ? prefCorpo(ctx) : null;
          if (pref !== null) { const alvo = vs.find(v => ehCorpo(v) === pref); if (alvo) p = alvo; }
          const outras = vs.filter(v => v.id !== p.id).map(v => ({ id: v.id, score: null, recusa: ehCorpo(v) ? 'só corpo' : 'completa (PA+AA)' }));
          const nota = vs.length > 1 ? (pref === null ? ' — existe ' + (ehCorpo(p) ? 'completa (PA+AA)' : 'só corpo') + ', conferir' : (pref ? ' — cliente costuma comprar só corpo' : ' — cliente costuma comprar completa')) : '';
          return res(p.id, 'regra-sap', vs.length > 1 && pref === null ? 'baixa' : conf, motivo + nota, score, { alternativas: outras.concat(alternativas).slice(0, 6) });
        };
        for (const rs of sx.refs) {
          const idx = cat.lookupApelido(rs);
          if (idx && !travas(cat.get(idx), rs, det, tr)) return versao(idx, certo ? 'media' : 'baixa', 'REF montado da descrição (' + rs + ')' + (certo ? '' : ' — série L/S não informada, conferir'));
        }
        // trava com o REF sem rosca métrica / sufixo (a série pode faltar no cadastro)
        const curto = (s) => s.replace(/\(M\d+\)|INOX316$/g, '');
        const vistos = new Set();
        const semRosca = sx.tipo === 'tubo' && /^[UJT][MFO]/.test(sx.pf) && !sx.rosca;
        for (const rs of semRosca ? [] : sx.refs) {
          for (const c of cat.buscar(rs, 12)) {
            if (c.score < P.simRef || vistos.has(c.prod.id)) continue;
            vistos.add(c.prod.id);
            const motivo = travas(c.prod, curto(rs), det, tr) ||
              (/NPT/.test(rs) && !/NPT|\dMP|\dFP/.test(c.prod.d + ' ' + c.prod.a) ? 'rosca NPT não confirmada no cadastro' : null);
            if (!motivo) return versao(c.prod.id, 'baixa', 'Parecido com o REF montado da descrição (' + rs + ') — conferir', c.score);
            alternativas.push({ id: c.prod.id, score: Math.round(c.score * 100) / 100, recusa: motivo });
          }
        }
      }
    }
    // 4e) mangueira montada: mangueira + terminais + capa (componentes do cadastro)
    if (P.regrasMangueira !== false) {
      // descrição SAP estruturada (BITOLA:, TERMINAL A:, NORMA:...) -> regra SAP; texto livre -> parser do cliente
      const sap = /^MANGUEIRA/.test(det) && /BITOLA|DIAMETRO|TERMINAL\s?\(?[AB]\)?\s?:|NORMA\s?:|PRESSAO|;/.test(det);
      const conti = continentalParaMelting(det + ' ' + (ref || ''), cat);
      const xc = conti && mangueiraLivre(conti.texto, cat, ctx);
      if (xc) { xc.conti = conti; if (conti.incompleto) xc.pend = (xc.pend || []).concat(['medida do terminal (código cortado no pedido, assumida = bitola)']); if (conti.ters < 2) { xc.avulsa = false; xc.pend = (xc.pend || []).concat(conti.ters ? ['terminal do outro lado'] : ['terminais (pedido sem os terminais)']); } }
      const x = conti ? xc : sap ? mangueiraRule(det, cat, ctx) : (mangueiraLivre(det + (ref ? ' ' + up(ref) : ''), cat, ctx) || (/^MANGUEIRA/.test(det) && mangueiraRule(det, cat, ctx)));
      if (x && x.avulsa) {
        const comps = [{ papel: 'mangueira', id: x.mang.id, apelido: x.mang.a, qtd: x.comprimento ? Math.round(x.comprimento) / 1000 : null, un: 'm' }];
        return res(x.mang.id, 'regra-mangueira', 'media', 'Mangueira ' + x.fam + ' bitola ' + x.dash + ' (sem terminais)' + (x.comprimento ? ' — ' + (x.comprimento / 1000).toLocaleString('pt-BR') + ' m' : ''), null,
          { componentes: comps, alternativas: x.altsM.map(o => ({ id: o.id, score: null, recusa: 'outra mangueira ' + x.fam })) });
      }
      if (x) {
        const comps = [{ papel: 'mangueira', id: x.mang.id, apelido: x.mang.a, qtd: x.comprimento ? Math.round(x.comprimento) / 1000 : null, un: 'm' }];
        let faltam = 0;
        x.ters.forEach((tt, k) => { if (tt && tt.prod) comps.push({ papel: 'terminal ' + (k ? 'B' : 'A'), id: tt.prod.id, apelido: tt.prod.a, qtd: 1, un: 'pc' }); else { faltam++; comps.push({ papel: 'terminal ' + (k ? 'B' : 'A'), id: null, apelido: tt ? tt.apelido + ' (não cadastrado)' : 'não identificado', qtd: 1, un: 'pc' }); } });
        if (!x.ters.length) faltam = 2;
        if (x.capa) comps.push({ papel: 'capa', id: x.capa.id, apelido: x.capa.a, qtd: 2, un: 'pc' });
        const resumo = comps.map(c => (c.papel === 'mangueira' && c.qtd ? c.qtd.toLocaleString('pt-BR') + ' m ' : '') + c.apelido).join(' + ');
        const conf = x.porNorma && !faltam && !(x.pend || []).some(p => /norma/.test(p)) ? 'media' : 'baixa';
        const nota = x.ftm ? (String(x.ftm[0]).startsWith('~') ? ' — já montada antes como FTM ' + String(x.ftm[0]).slice(1) + ' (outro comprimento)' : ' — igual à FTM ' + x.ftm[0]) : '';
        if (x.conti) return res(x.mang.id, 'regra-mangueira', x.pend.length ? 'baixa' : 'media', 'Código ' + x.conti.codigo + ' (Continental) → ' + resumo + nota + (faltam ? ' — terminal a conferir' : '') + (x.pend.length ? ' — pedir ao cliente: ' + x.pend.join(', ') : ''), null,
          { componentes: comps, ftm: x.ftm ? String(x.ftm[0]).replace('~', '') : null, alternativas: x.altsM.map(o => ({ id: o.id, score: null, recusa: 'outra mangueira ' + x.fam })) });
        return res(x.mang.id, 'regra-mangueira', conf, 'Montagem: ' + resumo + nota + (faltam ? ' — terminal a conferir' : '') + (x.pend && x.pend.length ? ' — pedir ao cliente: ' + x.pend.join(', ') : ''), null,
          { componentes: comps, ftm: x.ftm ? String(x.ftm[0]).replace('~', '') : null, alternativas: x.altsM.map(o => ({ id: o.id, score: null, recusa: 'outra mangueira ' + x.fam })) });
      }
    }
    // 4d) correias planas (cortadas sob medida)
    if (P.regrasCorreia !== false && /CORREIA|ESTEIRA|LENCOL|BELT/.test(det)) {
      const x = correiaPlanaRule(det + (ref ? ' REF ' + up(ref) : ''), cat);
      // código de outra marca -> equivalente Nitta (tabela de equivalência)
      const txEq = textoEquiv;
      const altEq = (e) => e.ok.slice(1, 4).map(o => ({ id: o.base.id, score: null, recusa: 'outra equivalência: ' + o.r.nitta }));
      if (x) {
        const med = x.p.larg + ' x ' + x.p.comp + ' mm' + (x.p.fechamento ? ' ' + x.p.fechamento : '');
        if (x.equiv && x.cod) {
          if (x.pronta && ok(x.pronta)) return res(x.pronta.id, 'regra-correia', 'baixa', 'Correia plana ' + x.cod + ' ' + med + ' já cadastrada — ' + txEq(x.equiv), null, { alternativas: [{ id: x.base.id, score: null, recusa: 'material base (cortar)' }].concat(altEq(x.equiv)) });
          if (ok(x.base)) return res(x.base.id, 'regra-correia', 'baixa', 'Material ' + x.cod + ' — cortar ' + med + ' — ' + txEq(x.equiv) + (x.p.acessorio ? ' (pedido tem furo/talisca/acessório, conferir)' : ''), null, { alternativas: altEq(x.equiv) });
        }
        if (x.cod && x.pronta && ok(x.pronta)) return res(x.pronta.id, 'regra-correia', 'media', 'Correia plana ' + x.cod + ' ' + med + ' já cadastrada', null, { alternativas: x.base ? [{ id: x.base.id, score: null, recusa: 'material base (cortar)' }] : [] });
        if (x.cod && x.base && ok(x.base)) return res(x.base.id, 'regra-correia', 'media', 'Material ' + x.cod + ' — cortar ' + med + (x.p.acessorio ? ' (pedido tem furo/talisca/acessório, conferir)' : ''));
        if (x.equiv && !x.equiv.ok.length) return res(null, 'nenhum', 'sem_cadastro', 'Correia plana ' + med + ' — ' + txEq(x.equiv) + ' — material nunca cortado pela Melting, consultar a Nitta', null, { alternativas: (x.mats || []).slice(0, 6).map(m => ({ id: m.prod.id, score: null, recusa: 'já cortado ' + m.n + 'x em ' + x.p.larg + 'x' + x.p.comp })) });
        if (!x.cod && x.mats.length) {
          x.mats.slice(0, 8).forEach(m => alternativas.push({ id: m.prod.id, score: null, recusa: 'já cortado ' + m.n + 'x em ' + x.p.larg + 'x' + x.p.comp }));
          return res(null, 'nenhum', 'sem_cadastro', x.p.acessorio
            ? 'Correia plana ' + med + ' com furo/talisca/acessório — não usar similar sem conferir'
            : 'Correia plana de outra marca ' + med + ': ' + x.mats.length + ' material(is) Nitta/Mectrol já cortado(s) nessa medida — escolher', null, { alternativas: alternativas.slice(0, 8) });
        }
      }
    }
    if (P.regrasCorreia !== false && /CORREIA|ESTEIRA|LENCOL|BELT|HABASIT|SIEGLING|CHIORINO|AMMERAAL|FORBO/.test(det) && !parsePlana(det + (ref ? ' ' + up(ref) : '')) && !parseCorreia(det + (ref ? ' ' + up(ref) : ''))) {
      const e = equivalenciaPlana(det + (ref ? ' ' + up(ref) : ''), cat);
      if (e) {
        const tx = textoEquiv(e);
        if (e.ok.length && ok(e.ok[0].base)) return res(e.ok[0].base.id, 'regra-correia', 'baixa', 'Material ' + e.ok[0].cod + ' — ' + tx + ' — medida (largura × comprimento) não informada', null, { alternativas: e.ok.slice(1, 4).map(z => ({ id: z.base.id, score: null, recusa: 'outra equivalência: ' + z.r.nitta })) });
        return res(null, 'nenhum', 'sem_cadastro', 'Correia plana — ' + tx + ' — material nunca cortado pela Melting, consultar a Nitta');
      }
    }
    // 4c) correias: perfil + comprimento + largura/canais
    if (P.regrasCorreia !== false && /CORREIA|SLAB|BELT/.test(det) && !/PLANA|TRANSPORTADORA|TANGENCIAL|ESTEIRA/.test(det)) {
      const x = correiaRule(det + (ref ? ' ' + up(ref) : ''), cat, ctx);
      if (x && x.cands.length) {
        const best = x.cands[0];
        const alts = x.cands.slice(1, 6).map(o => ({ id: o.id, score: null, recusa: o._marca ? 'marca ' + o._marca : 'outra opção' }));
        const desc = (x.p.tp ? 'TP ' : '') + x.p.comp + ' ' + x.p.perfil + (x.p.ger || '') + ' ' + x.p.larg;
        const conf = (x.mesmaMarca || x.prefCliente || (!x.marca && (x.cands.length === 1 || best._marca === 'MELTING'))) ? 'media' : 'baixa';
        const motivo = 'Regra de correia (' + desc + ')' + (x.marca && !x.mesmaMarca ? ' — marca ' + x.marca + ' não encontrada, equivalente ' + (best._marca || 'sem marca') : '') + (x.prefCliente ? ' — marca que o cliente costuma comprar (' + x.prefCliente + ')' : !x.marca && x.cands.length > 1 ? (best._marca === 'MELTING' ? ' — linha Melting (' + x.cands.length + ' marcas no cadastro)' : ' — ' + x.cands.length + ' marcas no cadastro, conferir') : '');
        return res(best.id, 'regra-correia', conf, motivo, null, { alternativas: alts });
      }
      // correia sincronizadora sem pronta no cadastro: slab do mesmo comprimento cortado na largura (vendido por mm)
      if (x && x.p.fam === 'sinc' && x.p.larg != null && !x.cands.length) {
        cat.indiceCorreias();
        const sl = (cat._slabs.get(['sinc', x.p.tp ? 'TP' : '', x.p.perfil, x.p.comp].join('|')) || []).filter(ok);
        if (sl.length) {
          const pref = (o) => (x.marca && o._marca === x.marca ? 4 : 0) + (o._marca === 'MELTING' ? 2 : 0) + (/^MM$/i.test(o.um) ? 1 : 0) + (x.p.ger && o._correia && o._correia.ger === x.p.ger ? 1 : 0);
          sl.sort((a, b) => pref(b) - pref(a));
          const s = sl[0];
          const porMM = /^MM$/i.test(s.um);
          return res(s.id, 'regra-correia', 'media', 'Sem a correia pronta: cortar ' + x.p.larg + ' mm de largura do slab ' + (x.p.tp ? 'TP ' : '') + x.p.comp + ' ' + x.p.perfil + ' (' + s.a + ')',
            null, { componentes: [{ papel: 'slab (cortar a largura)', id: s.id, apelido: s.a, qtd: porMM ? x.p.larg : 1, un: porMM ? 'mm' : (s.um || 'pc').toLowerCase() }],
              alternativas: sl.slice(1, 4).map(o => ({ id: o.id, score: null, recusa: 'outro slab' + (o._marca ? ' ' + o._marca : '') })).concat((x.vizinhas || []).slice(0, 3).map(o => ({ id: o.id, score: null, recusa: 'pronta, largura ' + o._correia.larg }))) });
        }
      }
      // correia sincronizadora sem pronta no cadastro: LL Mectrol (rolo cortado e emendado)
      if (x && x.p.fam === 'sinc' && x.p.larg != null && cat._cortes && cat._cortes.porLL) {
        const ll = cat._cortes.porLL.get(x.p.perfil + '|' + x.p.larg);
        if (ll && ll.size) {
          const D = det;
          const opc = [...ll.values()].map(o => ({ o, peso: (o.comps.has(x.p.comp) ? 4 : 0) + (/ACO|STEEL/.test(D) && /ACO/.test(o.variante) ? 2 : 0) + (/KEVLAR|ARAMID/.test(D) === /KEVLAR/.test(o.variante) ? 2 : 0) + (/\bNT\b|NYLON/.test(D) === /NT/.test(o.variante) ? 1 : 0) + (/BRANC/.test(D) === /BRANC/.test(o.variante) ? 0.5 : 0) + (/MELT|BINLONG/.test(D) === /MELT/.test(o.variante) ? 0.3 : 0) + Math.log(1 + o.n) / 10 }))
            .filter(({ o }) => cat.get(o.base) && ok(cat.get(o.base))).sort((a, b) => b.peso - a.peso);
          if (opc.length) {
            const b = opc[0].o; const ja = b.comps.has(x.p.comp);
            const alts = opc.slice(1, 6).map(({ o }) => ({ id: o.base, score: null, recusa: 'LL ' + o.mat }));
            const llp = cat.get(b.base); const porM = llp && /^MT?$/i.test(llp.um);
            return res(b.base, 'regra-correia', ja ? 'media' : 'baixa',
              'Mectrol: LL ' + x.p.perfil + ' ' + x.p.larg + (b.variante ? ' ' + b.variante : '') + ' — cortar ' + x.p.comp + ' mm e emendar' + (ja ? ' (já feito nesse comprimento)' : ' (material já usado ' + b.n + 'x, conferir)'),
              null, { componentes: [{ papel: 'LL (cortar e emendar)', id: b.base, apelido: llp ? llp.a : b.mat, qtd: porM ? Math.round(x.p.comp) / 1000 : 1, un: porM ? 'm' : 'pc' }],
                alternativas: alts.concat((x.vizinhas || []).slice(0, 3).map(o => ({ id: o.id, score: null, recusa: 'pronta, largura ' + o._correia.larg }))) });
          }
        }
      }
      if (x && x.vizinhas && x.vizinhas.length) {
        const w = x.p.fam === 'mv' ? 'canais' : x.p.fam === 'v' ? 'bandas' : 'largura';
        x.vizinhas.slice(0, 8).forEach(o => alternativas.push({ id: o.id, score: null, recusa: w + ' ' + o._correia.larg + (x.p.larg != null ? ' (pedido ' + x.p.larg + ')' : '') }));
        return res(null, 'nenhum', 'sem_cadastro', 'Correia ' + (x.p.tp ? 'TP ' : '') + x.p.comp + ' ' + x.p.perfil + ' sem ' + w + ' ' + (x.p.larg == null ? 'informada' : x.p.larg) + ' no cadastro — ver alternativas', null, { alternativas: alternativas.slice(0, 8) });
      }
    }
    // 4f) conexão pneumática (Festo QS / por extenso) -> padrão Melting
    {
      const x = pneumaticaRule(det + ' ' + (ref || ''), cat);
      if (x && x.prod && ok(x.prod)) return res(x.prod.id, 'regra-pneumatica', x.porCodigo ? 'media' : 'baixa', 'Conexão pneumática ' + x.base + (x.porCodigo ? ' (código Festo/Camozzi no pedido)' : ' pela descrição') + ' — conferir', null, { alternativas: (x.outras || []).map(o => ({ id: o.id, score: null, recusa: 'variante' })) });
    }
    // 4g) tubo de poliamida/nylon pelo diâmetro externo x interno (ou espessura)
    {
      const x = tuboNylonRule(det + ' ' + (ref || ''), cat);
      if (x && x.prod && ok(x.prod)) return res(x.prod.id, 'regra-tubo', 'media', 'Tubo ' + (x.pa11 ? 'poliamida 11' : 'poliamida/nylon') + ' ' + x.de + ' x ' + x.di + ' mm (padrão ' + x.base + ') — conferir', null, { alternativas: (x.outras || []).map(o => ({ id: o.id, score: null, recusa: 'variante' })) });
      if (x && !x.prod) alternativas.push({ id: null, score: null, recusa: 'tubo ' + x.base + ' não cadastrado' });
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
    // 6b) descrição curta (cadastro do cliente parecido com o da Melting): busca por
    //     semelhança com travas fortes — mesmo tipo de peça, todos os números do pedido
    //     no candidato, correia dupla (TP) só se pedida, travas de material/rosca.
    if (P.descricaoCurta !== false && !ref && det.length <= 90 && (det.match(/;/g) || []).length < 2) {
      const GRUPOS = [[/^(CORREIA|CORR|ESTEIRA|EST|SLAB|LENCOL|TAPETE)\b/, /CORREIA|ESTEIRA|SLAB|LENCOL|TAPETE|\*\d+X\d+\*|^[A-Z0-9 .\/-]*\*\d/], [/^(MANGUEIRA|MANGOTE|MANG)\b/, /MANG|TUBO/], [/^POLIA\b/, /POLIA/], [/^FELTRO\b/, /FELTRO/], [/^(ANEL|RETENTOR|ORING|O-RING)\b/, /ANEL|RETENTOR|ORING|O-RING/]];
      const g = GRUPOS.find(([rx]) => rx.test(det));
      const GEN = /^(CORREIA|CORR|ESTEIRA|EST|MANGUEIRA|MANG|MANGOTE|POLIA|FELTRO|TRANSPOR|TRANSP|TRANSPORTADORA|TRANSPORTE|PLANA|SINCRO|SINCRON|SINCRONIZ|SINCRONIZADA|EM|DE|DO|DA|COM|SEM|MM|POL|UN|PC|M|X|C|S|AF|AB|FEC|DZ|ABS|LISA|GUIA|CENTRAL|TIPO|FLEX|FLEXIVEL|AZUL|BRANCO|BRANCA|VERDE|PRETA|PRETO|CRISTAL)$/;
      const marcas = up(det).split(/[^A-Z0-9]+/).filter(w => /[A-Z]/.test(w) && w.length >= 2 && !GEN.test(w)).map(comp);
      const nums = (det.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?(?:\/\d+)?/g) || []).filter(x => x.length >= 2 || /\//.test(x));
      if (nums.length) {
        for (const c of cat.buscar(det, 25)) {
          if (c.score < (P.simCurta || 0.25)) break;
          const tx = up(c.prod.d + ' ' + c.prod.a).replace(/(\d),(\d)/g, '$1.$2');
          if (g && !g[1].test(up(c.prod.d) + ' ' + c.prod.a)) continue;
          if (!nums.every(n => new RegExp('(^|[^0-9.])' + n.replace('.', '\\.') + '(?![0-9])').test(tx))) continue;
          // pelo menos uma palavra característica do pedido no candidato (tipo, material, marca, código)
          if (marcas.length && !marcas.some(w => comp(tx).includes(w))) continue;
          if (/(^|\s)TP\b|^TP\d|TWIN|DUPLA/.test(tx) && !/\bTP\b|TWIN|DUPLA|\bD8M|\bDH\b/.test(det)) continue;
          if (travas(c.prod, null, det, Object.assign({}, tr, { tipo: false }))) continue;
          return res(c.prod.id, 'descricao', c.score >= 0.5 ? 'media' : 'baixa', 'Descrição parecida com o cadastro e todos os números conferem — conferir', c.score, { alternativas: alternativas.slice(0, 5) });
        }
      }
    }
    // 6c) código do fabricante escrito na descrição e no cadastro (20PM, 400SF, FFH04...)
    if (P.codigoFabricante !== false) {
      const x = (det.match(/;/g) || []).length < 2 ? codigoFabricanteRule(det + ' ' + (ref || ''), cat) : null;
      if (x && ok(x.prod)) return res(x.prod.id, 'codigo-fabricante', 'baixa', 'Código do fabricante ' + x.cods.join(', ') + ' igual ao do cadastro — conferir', null, { alternativas: x.outras.map(o => ({ id: o.id, score: null, recusa: 'mesmo código' })).concat(alternativas).slice(0, 5) });
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
    Catalogo, Aprendizado, sugerir, medidasDescricaoOk, PADRAO, bitolaCliente,
    conexaoTubo, conexaoGalvanizada, refSintetico, parseCorreia, correiaRule, parsePlana, correiaPlanaRule, agregarCortes, parseLL, agregarKits, agregarFtm, mangueiraRule, mangueiraLivre, continentalParaMelting, famMang, equivalenciaPlana, pneumaticaRule, tuboNylonRule, codigoFabricanteRule, codigosFab
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  else root.Motor = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
