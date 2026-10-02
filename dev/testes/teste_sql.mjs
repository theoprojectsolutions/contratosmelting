import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const S='../../supabase/';
// stubs do Supabase
await db.exec(`
create schema auth; create table auth.users(id uuid primary key, email text);
create role authenticated; create role anon;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;
`);
for (const f of ['schema.sql','perfis-e-permissoes.sql','colunas-adicionais.sql','data-recebimento-contratos.sql','inteligencia.sql']) {
  try { await db.exec(fs.readFileSync(S+f,'utf8')); console.log('OK', f); } catch (e) { console.log('ERRO', f, e.message); }
}
await db.exec(fs.readFileSync(S+'inteligencia.sql','utf8')); console.log('OK rerun');
// dados
await db.exec(`
insert into produtos(id,descricao,apelido) values ('100','UMI 16S (M24) X 3/8 NPT INOX 316','UMI16SX3/8NPT(M24)INOX316'),('200','TERMINAL X','4G4FJXSML');
update contratos set codigos_cliente='003142, Trivium Packaging' where id='C-2026-014';
insert into contrato_itens(contrato_id,cod_cliente,descricao_cliente,produto_id,qtd_estimada,preco_contratado,status) values ('C-2026-014','A1','UNIAO','100',10,50,'aprovado');
insert into vendas(pedido,produto_id,data,cliente_codigo,quantidade,preco_unit,cliente_nome) values ('1','100','2026-01-10','003142',4,52,null),('2','100','2026-02-10','999',2,49,'TRIVIUM PACKAGING'),('3','200','2026-02-11','003142',5,10,null),('4','100','2024-01-01','003142',99,1,null);
`);
console.log((await db.query('select item_id is not null ok, qtd_consumida, valor_consumido, preco_medio_praticado, ultima_compra from vw_consumo_item')).rows);
console.log((await db.query('select * from vw_fora_do_contrato')).rows);
await db.exec("update contrato_itens set qtd_estimada=12"); console.log((await db.query('select atualizado_em>criado_em as trig from contrato_itens')).rows);
console.log((await db.query("select tablename, policyname from pg_policies where tablename in ('vendas','objects') order by 1,2")).rows.length);
