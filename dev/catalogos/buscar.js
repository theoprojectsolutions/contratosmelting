// Consulta os catálogos de fornecedores (texto extraído dos PDFs, fora do git).
//   node dev/catalogos/buscar.js 117467              -> ficha técnica ligada ao ID do cadastro
//   node dev/catalogos/buscar.js sucção cristal 1"    -> fichas + páginas que citam os termos (arquivo e página)
const D = __dirname + '/../dados/catalogos/';
const fs = require('fs');
const sem = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node dev/catalogos/buscar.js <ID | termos>'); process.exit(1); }
const fichas = JSON.parse(fs.readFileSync(D + 'fichas_por_id.json', 'utf8'));
const mostra = (id, f) => f.tipo === 'correia' ? console.log(`${id} ${f.ap}\n  ${f.marca} ${f.material} | espessura ${f.espessura || '?'}${f.lonas ? ' | ' + f.lonas + ' lonas ' + (f.tracao || '') : (f.tracao ? ' | tração ' + f.tracao : '')}` +
  `${f.cobertura ? ' | cobertura ' + f.cobertura + (f.cor ? ' ' + f.cor : '') : ''}${f.carga ? ' | carga ' + f.carga : ''}${f.tensao ? ' | tensão máx. ' + f.tensao : ''}` +
  `\n  polia mín. ${f.polia_min || '?'}${f.polias ? ' (' + f.polias + ')' : ''}${f.temp ? ' | ' + f.temp : ''}${f.antiestatica ? ' | antiestática ' + f.antiestatica : ''}${f.largura_max ? ' | largura máx. ' + f.largura_max : ''}` +
  `${f.aplicacoes ? '\n  aplicações: ' + f.aplicacoes : ''}${f.variantes ? '\n  ATENÇÃO, mais de uma espessura no catálogo: ' + f.variantes : ''}\n  fonte: ${f.fonte}`) : console.log(`${id} ${f.ap}\n  ${f.marca} ${f.modelo || ''} ${f.codigo || ''} | DI ${f.di} mm | DE ${f.de ?? '?'} mm` +
  `${f.esp ? ' | parede ' + f.esp + ' mm' : ''} | trabalho ${f.wp ?? '?'} bar${f.bp ? ' | ruptura ' + f.bp + ' bar' : ''}` +
  `${f.vacuo ? ' | vácuo ' + f.vacuo : ''}${f.temp ? ' | ' + f.temp : ''}${f.raio ? ' | raio ' + f.raio + ' mm' : ''}` +
  `${f.tubo ? '\n  tubo: ' + f.tubo : ''}${f.reforco ? ' | reforço: ' + f.reforco : ''}${f.cobertura ? '\n  cobertura: ' + f.cobertura : ''}` +
  `${f.norma ? '\n  norma: ' + f.norma : ''}\n  fonte: ${f.fonte}`);
if (args.length === 1 && (/^\d+$/.test(args[0]) || fichas[args[0]])) {
  const f = fichas[args[0]];
  if (f) { mostra(args[0], f); process.exit(0); }
  // correia em V / sincronizadora: perfil lido pelo parseCorreia do motor + tabela de perfis (Contitech)
  const cat = require(__dirname + '/../dados/cat.json'), r = cat.find(x => x[0] === args[0]);
  const pc = r && require(__dirname + '/../../js/motor.js').parseCorreia(r[1] + ' ' + r[2], true);
  const perfis = fs.existsSync(D + 'perfis.json') ? JSON.parse(fs.readFileSync(D + 'perfis.json', 'utf8')) : {};
  const pf = pc && perfis[pc.perfil];
  if (pf) {
    const c = pf.comprimentos[String(pc.comp)];
    console.log(`${args[0]} ${r[2]} | ${r[1]}\n  perfil ${pc.perfil} (${pf.tipo})` +
      (pf.tipo === 'V' ? ` | largura no topo ${pf.largura_topo} mm | altura ${pf.altura} mm | comprimento ${pc.comp} mm` + (c ? ' (Ld padrão no catálogo)' : ' (fora da lista padrão do catálogo)')
        : ` | passo ${pf.passo} mm | altura ${pf.altura} mm | dente ${pf.altura_dente} mm | comprimento ${pc.comp} mm` + (pf.passo && pc.comp ? ` = ${Math.round(pc.comp / pf.passo)} dentes` : '') + (pc.larg ? ` | largura ${pc.larg} mm` : '') + (c ? ` (padrão no catálogo, z = ${c.z})` : ''))
      + `\n  fonte: ${pf.fonte_secao}${c ? ' | comprimento: ' + c.fonte : ''}`);
  } else console.log('Sem ficha ligada a esse ID (marca sem catálogo com texto, ou modelo/bitola não encontrado).');
  process.exit(0);
}
const termos = sem(args.join(' ')).split(/\s+/).filter(Boolean);
const fh = Object.entries(fichas).filter(([, f]) => { const t = sem([f.ap, f.desc, f.modelo, f.codigo, f.pol].join(' ')); return termos.every(x => t.includes(x.replace(/"$/, ''))); });
if (fh.length) { console.log(`== ${fh.length} ficha(s) ligada(s) ao cadastro`); fh.slice(0, 15).forEach(([id, f]) => mostra(id, f)); }
const pags = JSON.parse(fs.readFileSync(D + 'paginas.json', 'utf8'));
const res = [];
for (const p of pags) {
  const t = sem(p.txt); let n = 0;
  for (const x of termos) { const c = t.split(x).length - 1; if (!c) { n = -1; break; } n += Math.min(c, 5); }
  if (n > 0) res.push([n, p]);
}
res.sort((a, b) => b[0] - a[0]);
console.log(`\n== ${res.length} página(s) com todos os termos`);
for (const [n, p] of res.slice(0, 10)) {
  const t = sem(p.txt), i = t.indexOf(termos[0]);
  console.log(`- ${p.arq} | p.${p.pag} (${n})\n    ${p.txt.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' ')}`);
}
