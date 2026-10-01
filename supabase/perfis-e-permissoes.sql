-- =====================================================================
-- MELTING · GESTÃO DE CONTRATOS
-- PERFIS DE ACESSO (admin / gerente)
-- Cole no SQL Editor do Supabase e rode tudo de uma vez.
-- Pode rodar depois do schema.sql — não apaga os dados que já existem.
-- =====================================================================

-- ============================
-- 1) TABELA: perfis
-- Cada usuário do Supabase Auth tem uma linha aqui dizendo o papel dele.
-- ============================
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  papel text not null default 'gerente' check (papel in ('admin','gerente')),
  created_at timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- cada usuário só pode ler o próprio perfil (é o suficiente pro site
-- descobrir se quem logou é admin ou gerente)
drop policy if exists "Usuário lê o próprio perfil" on public.perfis;
create policy "Usuário lê o próprio perfil"
  on public.perfis for select
  to authenticated
  using (auth.uid() = id);

-- ============================
-- 2) Cria perfil automaticamente pra todo usuário novo (como "gerente"
-- por padrão — mais seguro começar restrito e promover depois pra admin
-- manualmente do que o contrário).
-- ============================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, papel)
  values (new.id, new.email, 'gerente')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================
-- 3) Função auxiliar: o usuário logado é admin?
-- Usada nas regras de segurança abaixo.
-- ============================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'admin'
  );
$$;

-- ============================
-- 4) Regras de segurança: leitura liberada pra qualquer usuário logado
-- (admin ou gerente); criar/editar/excluir só para admin.
-- Isso substitui as políticas "para tudo" criadas no schema.sql.
-- ============================

-- ---- contratos ----
drop policy if exists "Usuários logados podem tudo em contratos" on public.contratos;
drop policy if exists "Leitura liberada - contratos" on public.contratos;
drop policy if exists "Inserir só admin - contratos" on public.contratos;
drop policy if exists "Editar só admin - contratos" on public.contratos;
drop policy if exists "Excluir só admin - contratos" on public.contratos;

create policy "Leitura liberada - contratos" on public.contratos
  for select to authenticated using (true);
create policy "Inserir só admin - contratos" on public.contratos
  for insert to authenticated with check (public.is_admin());
create policy "Editar só admin - contratos" on public.contratos
  for update to authenticated using (public.is_admin());
create policy "Excluir só admin - contratos" on public.contratos
  for delete to authenticated using (public.is_admin());

-- ---- cotações ----
drop policy if exists "Usuários logados podem tudo em cotações" on public.cotacoes;
drop policy if exists "Leitura liberada - cotacoes" on public.cotacoes;
drop policy if exists "Inserir só admin - cotacoes" on public.cotacoes;
drop policy if exists "Editar só admin - cotacoes" on public.cotacoes;
drop policy if exists "Excluir só admin - cotacoes" on public.cotacoes;

create policy "Leitura liberada - cotacoes" on public.cotacoes
  for select to authenticated using (true);
create policy "Inserir só admin - cotacoes" on public.cotacoes
  for insert to authenticated with check (public.is_admin());
create policy "Editar só admin - cotacoes" on public.cotacoes
  for update to authenticated using (public.is_admin());
create policy "Excluir só admin - cotacoes" on public.cotacoes
  for delete to authenticated using (public.is_admin());

-- ---- clientes ----
drop policy if exists "Usuários logados podem tudo em clientes" on public.clientes;
drop policy if exists "Leitura liberada - clientes" on public.clientes;
drop policy if exists "Inserir só admin - clientes" on public.clientes;
drop policy if exists "Editar só admin - clientes" on public.clientes;
drop policy if exists "Excluir só admin - clientes" on public.clientes;

create policy "Leitura liberada - clientes" on public.clientes
  for select to authenticated using (true);
create policy "Inserir só admin - clientes" on public.clientes
  for insert to authenticated with check (public.is_admin());
create policy "Editar só admin - clientes" on public.clientes
  for update to authenticated using (public.is_admin());
create policy "Excluir só admin - clientes" on public.clientes
  for delete to authenticated using (public.is_admin());

-- =====================================================================
-- 5) DEPOIS DE RODAR O SCRIPT ACIMA:
--
-- a) Você (e qualquer outro admin) precisa logar pelo menos uma vez em
--    login.html — isso cria automaticamente a linha em "perfis" como
--    'gerente' (via trigger). Depois, promova você mesmo a admin:
--
--    update public.perfis set papel = 'admin'
--    where email = 'SEU-EMAIL-AQUI@melting.com.br';
--
-- b) O gerente também precisa logar pelo menos uma vez (ou você pode
--    criar o usuário direto em Authentication > Users). O perfil dele
--    já nasce como 'gerente' — não precisa fazer nada além disso.
--
-- c) Para conferir quem é o quê a qualquer momento:
--    select email, papel from public.perfis order by papel, email;
-- =====================================================================
