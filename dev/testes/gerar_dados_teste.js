// Gera dev/dados/cat.json (catálogo) a partir dos cad_produtos_*.xls do SIG,
// no formato usado por benchmark_motor.js: [id, descricao, apelido, situacao, origem, um, familia, ipi]
// Uso: node dev/testes/gerar_dados_teste.js caminho/para/pasta_com_xls
const XLSX = require('../../js/vendor/xlsx.full.min.js');
const fs = require('fs'), path = require('path');
const pasta = process.argv[2] || '.';
const out = new Map();
for (const f of fs.readdirSync(pasta).filter(x => /cad_produtos/i.test(x))) {
  const wb = XLSX.read(fs.readFileSync(path.join(pasta, f)), { type: 'buffer' });
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })) {
    if (!r['Produto']) continue;
    out.set(String(r['Produto']), [String(r['Produto']), r['Descrição'] || '', String(r['Complemento'] || '').replace(/"/g, ''), r['Situação'] || 'A', r['Descr. (Origem)'] || '', r['UM'] || '', r['Descr. (Família)'] || '', r['% IPI'] || 0]);
  }
}
fs.mkdirSync(path.join(__dirname, '../dados'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../dados/cat.json'), JSON.stringify([...out.values()]));
console.log(out.size, 'produtos ->', 'dev/dados/cat.json');
