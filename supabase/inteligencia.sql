-- =====================================================================
-- MELTING · GESTÃO DE CONTRATOS
-- MÓDULO DE INTELIGÊNCIA (motor de resposta, consumo real, KPIs, parâmetros)
--
-- Rode no SQL Editor do Supabase DEPOIS dos outros scripts
-- (schema → perfis-e-permissoes → colunas-adicionais → data-recebimento).
-- Pode rodar mais de uma vez: não apaga nada que já existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Contratos: cliente no SIG
--    É por ele que o sistema liga o histórico de vendas (relsitped) ao
--    contrato: nome fantasia como aparece no relsitped e/ou código do
--    cliente, separados por vírgula. Ex.: "TRIVIUM PACKAGING, 003142".
-- ---------------------------------------------------------------------
alter table public.contratos
  add column if not exists codigos_cliente text;

-- ---------------------------------------------------------------------
-- 1) PRODUTOS — cadastro Melting (exportação "cad_produtos" do SIG)
-- ---------------------------------------------------------------------
create table if not exists public.produtos (
  id            text primary key,          -- "Produto" no SIG
  descricao     text,
  apelido       text,                      -- "Complemento" no SIG
  situacao      text not null default 'A', -- A = ativo, I = inativo
  origem        text,                      -- "Descr. (Origem)"
  familia       text,                      -- "Descr. (Família)"
  um            text,
  ipi           numeric,
  marca         text,
  atualizado_em timestamptz not null default now()
);
create index if not exists produtos_apelido_idx on public.produtos (upper(replace(apelido, ' ', '')));

-- ---------------------------------------------------------------------
-- 2) VENDAS — histórico de pedidos (exportação "relsitped" do SIG)
-- ---------------------------------------------------------------------
create table if not exists public.vendas (
  id              bigint generated always as identity primary key,
  pedido          text not null,
  produto_id      text not null,
  linha           int  not null default 1,   -- repetição do mesmo produto no mesmo pedido
  data            date,
  cliente_codigo  text,                      -- "numcli"
  cliente_nome    text,                      -- "fantasia"
  descricao       text,
  ref_cliente     text,                      -- "refere" = código do item no cliente
  quantidade      numeric not null default 0,
  preco_unit      numeric not null default 0,
  situacao        text,                      -- "sitped"
  importado_em    timestamptz not null default now(),
  unique (pedido, produto_id, linha)
);
create index if not exists vendas_cliente_data_idx on public.vendas (cliente_codigo, data);
create index if not exists vendas_cliente_nome_idx on public.vendas (cliente_nome, data);
create index if not exists vendas_produto_idx on public.vendas (produto_id);
create index if not exists vendas_ref_idx on public.vendas (ref_cliente);

-- ---------------------------------------------------------------------
-- 3) ITENS DO CONTRATO — cada linha da planilha do cliente, já respondida
-- ---------------------------------------------------------------------
create table if not exists public.contrato_itens (
  id                uuid primary key default gen_random_uuid(),
  contrato_id       text not null references public.contratos(id) on delete cascade,
  linha             int,
  cod_cliente       text,
  descricao_cliente text,
  ref               text,
  un                text,
  qtd_estimada      numeric not null default 0,
  preco_contratado  numeric,
  produto_id        text,
  status            text not null default 'pendente'
                    check (status in ('pendente','sugerido','aprovado','sem_cadastro','rejeitado')),
  metodo            text,   -- de-para, historico, apelido, regra, regra-sap, ref-similar, aprendido, descricao, ia, manual
  confianca         text,   -- alta, media, baixa, sem_cadastro
  score             numeric,
  motivo            text,
  alternativas      jsonb,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists contrato_itens_contrato_idx on public.contrato_itens (contrato_id);
create index if not exists contrato_itens_produto_idx on public.contrato_itens (produto_id);

create or replace function public.set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contrato_itens_updated_at on public.contrato_itens;
create trigger trg_contrato_itens_updated_at
  before update on public.contrato_itens
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- 4) DE-PARA — o que já foi respondido/aprovado, por cliente.
--    É a "memória" do motor: na renovação, o mesmo código do cliente
--    volta com o mesmo ID automaticamente.
-- ---------------------------------------------------------------------
create table if not exists public.de_para (
  id                bigint generated always as identity primary key,
  cliente_chave     text not null,           -- grupo do cliente normalizado (ex.: ARCELORMITTAL)
  cod_cliente       text not null,
  produto_id        text not null,
  descricao_cliente text,
  origem            text,                    -- aprovado, planilha-antiga, manual
  criado_em         timestamptz not null default now(),
  unique (cliente_chave, cod_cliente)
);

-- ---------------------------------------------------------------------
-- 5) PARÂMETROS — limites dos KPIs e do motor (tela "Parâmetros")
-- ---------------------------------------------------------------------
create table if not exists public.parametros (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6) SEGURANÇA — mesma regra do resto do sistema:
--    leitura para qualquer usuário logado, escrita só para admin.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['produtos','vendas','contrato_itens','de_para','parametros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Leitura liberada - %s" on public.%I', t, t);
    execute format('drop policy if exists "Inserir só admin - %s" on public.%I', t, t);
    execute format('drop policy if exists "Editar só admin - %s" on public.%I', t, t);
    execute format('drop policy if exists "Excluir só admin - %s" on public.%I', t, t);
    execute format('create policy "Leitura liberada - %s" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "Inserir só admin - %s" on public.%I for insert to authenticated with check (public.is_admin())', t, t);
    execute format('create policy "Editar só admin - %s" on public.%I for update to authenticated using (public.is_admin())', t, t);
    execute format('create policy "Excluir só admin - %s" on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7) ARMAZENAMENTO DO CATÁLOGO DO MOTOR
--    Ao importar o cadastro, o sistema grava um arquivo compactado com
--    o catálogo (motor/catalogo.json.gz). Cada usuário baixa uma vez e
--    o navegador guarda em cache — o motor roda local, sem custo.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('motor', 'motor', false)
on conflict (id) do nothing;

drop policy if exists "Motor - leitura" on storage.objects;
drop policy if exists "Motor - gravar admin" on storage.objects;
drop policy if exists "Motor - atualizar admin" on storage.objects;
drop policy if exists "Motor - excluir admin" on storage.objects;
create policy "Motor - leitura" on storage.objects
  for select to authenticated using (bucket_id = 'motor');
create policy "Motor - gravar admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'motor' and public.is_admin());
create policy "Motor - atualizar admin" on storage.objects
  for update to authenticated using (bucket_id = 'motor' and public.is_admin());
create policy "Motor - excluir admin" on storage.objects
  for delete to authenticated using (bucket_id = 'motor' and public.is_admin());

-- ---------------------------------------------------------------------
-- 8) VISÕES PRONTAS PARA POWER BI / CONSULTAS
--    (o sistema calcula tudo no navegador; estas visões são para quem
--    quiser ligar o Power BI direto no banco)
-- ---------------------------------------------------------------------
-- a venda pertence ao contrato se o código OU o nome do cliente estiver na lista do contrato
create or replace function public.venda_do_contrato(lista text, codigo text, nome text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(string_to_array(lista, ',')) t(x)
    where (btrim(x) ~ '^[0-9]+$' and ltrim(btrim(x), '0') = ltrim(btrim(coalesce(codigo, '')), '0'))
       or (btrim(x) ~ '[A-Za-z]' and upper(btrim(x)) = upper(btrim(coalesce(nome, ''))))
  );
$$;

create or replace view public.vw_consumo_item
with (security_invoker = true) as
select
  ci.id                as item_id,
  ci.contrato_id,
  c.cliente,
  ci.cod_cliente,
  ci.descricao_cliente,
  ci.produto_id,
  p.descricao          as descricao_melting,
  ci.qtd_estimada,
  ci.preco_contratado,
  coalesce(sum(v.quantidade), 0)                         as qtd_consumida,
  coalesce(sum(v.quantidade * v.preco_unit), 0)          as valor_consumido,
  case when sum(v.quantidade) > 0
       then sum(v.quantidade * v.preco_unit) / sum(v.quantidade) end as preco_medio_praticado,
  max(v.data)                                            as ultima_compra
from public.contrato_itens ci
join public.contratos c on c.id = ci.contrato_id
left join public.produtos p on p.id = ci.produto_id
left join public.vendas v
       on v.produto_id = ci.produto_id
      and v.data between c.data_inicio and c.data_fim
      and c.codigos_cliente is not null
      and public.venda_do_contrato(c.codigos_cliente, v.cliente_codigo, v.cliente_nome)
group by ci.id, c.cliente, p.descricao;

create or replace view public.vw_fora_do_contrato
with (security_invoker = true) as
select
  c.id as contrato_id, c.cliente, v.produto_id, max(v.descricao) as descricao,
  sum(v.quantidade) as quantidade, sum(v.quantidade * v.preco_unit) as valor, max(v.data) as ultima_compra
from public.contratos c
join public.vendas v
  on c.codigos_cliente is not null
 and public.venda_do_contrato(c.codigos_cliente, v.cliente_codigo, v.cliente_nome)
 and v.data between c.data_inicio and c.data_fim
where not exists (
  select 1 from public.contrato_itens ci
  where ci.contrato_id = c.id and ci.produto_id = v.produto_id
)
and exists (select 1 from public.contrato_itens ci2 where ci2.contrato_id = c.id)
group by c.id, c.cliente, v.produto_id;
