// Consulta os catálogos de fornecedores (texto extraído dos PDFs, fora do git).
//   node dev/catalogos/buscar.js 117467              -> ficha técnica ligada ao ID do cadastro
//   node dev/catalogos/buscar.js sucção cristal 1"    -> fichas + páginas que citam os termos (arquivo e página)
const D = __dirname + '/../dados/catalogos/';
const fs = require('fs');
const sem = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node dev/catalogos/buscar.js <ID | termos>'); process.exit(1); }
const fichas = JSON.parse(fs.readFileSync(D + 'fichas_por_id.json', 'utf8'));
const mostra = (id, f) => console.log(`${id} ${f.ap}\n  ${f.marca} ${f.modelo || ''} ${f.codigo || ''} | DI ${f.di} mm | DE ${f.de ?? '?'} mm` +
  `${f.esp ? ' | parede ' + f.esp + ' mm' : ''} | trabalho ${f.wp ?? '?'} bar${f.bp ? ' | ruptura ' + f.bp + ' bar' : ''}` +
  `${f.vacuo ? ' | vácuo ' + f.vacuo : ''}${f.temp ? ' | ' + f.temp : ''}${f.raio ? ' | raio ' + f.raio + ' mm' : ''}` +
  `${f.tubo ? '\n  tubo: ' + f.tubo : ''}${f.reforco ? ' | reforço: ' + f.reforco : ''}${f.cobertura ? '\n  cobertura: ' + f.cobertura : ''}` +
  `${f.norma ? '\n  norma: ' + f.norma : ''}\n  fonte: ${f.fonte}`);
if (args.length === 1 && /^\d+$/.test(args[0])) {
  const f = fichas[args[0]];
  if (f) mostra(args[0], f); else console.log('Sem ficha ligada a esse ID (marca sem catálogo com texto, ou modelo/bitola não encontrado).');
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
