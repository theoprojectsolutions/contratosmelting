-- =====================================================================
-- MELTING · GESTÃO DE CONTRATOS
-- Script para colar no SQL Editor do Supabase (Project > SQL Editor > New query)
-- Pode rodar tudo de uma vez, do início ao fim.
-- =====================================================================

-- ============================
-- 1) TABELA: clientes
-- ============================
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  grupo text,
  unidades text,
  comprador text,
  created_at timestamptz not null default now()
);

-- ============================
-- 2) TABELA: contratos
-- ============================
create table if not exists public.contratos (
  id text primary key,              -- ex.: 'C-2026-014'
  cliente text not null,
  grupo text,
  unidade text,
  uf text,
  vendedor_interno text,
  vendedor_externo text,
  gerente text,
  data_inicio date,
  data_fim date,
  valor_contratado numeric(14,2) not null default 0,
  qtd_estimada numeric(14,2) not null default 0,
  qtd_consumida numeric(14,2) not null default 0,
  ncm text,
  icms_divergencia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================
-- 3) TABELA: cotações
-- ============================
create table if not exists public.cotacoes (
  numero text primary key,          -- ex.: 'COT-4821'
  cliente text not null,
  tipo text not null default 'Cliente novo'
    check (tipo in ('Cliente novo','Renovação')),
  valor_cotado numeric(14,2) not null default 0,
  valor_contrato numeric(14,2) not null default 0,
  status text not null default 'Ativo'
    check (status in ('Ativo','Em negociação','Renovado','Perdido')),
  motivo text,
  created_at timestamptz not null default now()
);

-- ============================
-- 4) updated_at automático no contrato quando ele é editado
-- ============================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contratos_updated_at on public.contratos;
create trigger trg_contratos_updated_at
  before update on public.contratos
  for each row execute function public.set_updated_at();

-- ============================
-- 5) SEGURANÇA (RLS)
-- Só quem estiver logado (usuário autenticado no Supabase Auth)
-- consegue ler e escrever nessas tabelas.
-- ============================
alter table public.clientes  enable row level security;
alter table public.contratos enable row level security;
alter table public.cotacoes  enable row level security;

create policy "Usuários logados podem tudo em clientes"
  on public.clientes for all
  to authenticated
  using (true) with check (true);

create policy "Usuários logados podem tudo em contratos"
  on public.contratos for all
  to authenticated
  using (true) with check (true);

create policy "Usuários logados podem tudo em cotações"
  on public.cotacoes for all
  to authenticated
  using (true) with check (true);

-- =====================================================================
-- 6) DADOS DE EXEMPLO (os mesmos que hoje estão fixos no js/app.js)
-- Rode esta parte só se quiser começar já com os dados de teste.
-- Se preferir começar zerado, apague o bloco 6 inteiro antes de rodar.
-- =====================================================================

insert into public.clientes (cliente, grupo, unidades, comprador) values
  ('Grupo Alfa Metalúrgica','Grupo Alfa','Matriz - SP, Filial - Sorocaba','Fernando Dias'),
  ('Beta Componentes Ind.','Grupo Beta','Unidade Sul','Patrícia Nunes'),
  ('Cerâmica Gama S.A.','Grupo Gama','Planta 1, Planta 2','Roberto Cunha'),
  ('Delta Papel & Celulose','Grupo Delta','Matriz - PR, Filial - Curitiba','Aline Torres'),
  ('Épsilon Autopeças','Grupo Épsilon','Unidade 1','Bruno Castro'),
  ('Zeta Têxtil Industrial','Grupo Zeta','Matriz - SC','Camila Rocha'),
  ('Theta Bebidas','Grupo Theta','Matriz - GO','Igor Matos'),
  ('Iota Agroindustrial','Grupo Iota','Unidade Oeste','Sônia Prado');

insert into public.contratos
  (id, cliente, grupo, unidade, uf, vendedor_interno, vendedor_externo, gerente, data_inicio, data_fim, valor_contratado, qtd_estimada, qtd_consumida, ncm, icms_divergencia)
values
  ('C-2026-014','Grupo Alfa Metalúrgica','Grupo Alfa','Matriz - SP','SP','Rafael Souza','Marcos Lima','Cíntia Prado','2025-09-10','2026-08-28',184000,1000,820,'8483.40.90',false),
  ('C-2026-021','Beta Componentes Ind.','Grupo Beta','Unidade Sul','RS','Rafael Souza','Ana Ferraz','Cíntia Prado','2025-06-01','2026-09-11',96000,600,324,'7318.15.00',true),
  ('C-2026-032','Cerâmica Gama S.A.','Grupo Gama','Planta 2','MG','Juliana Reis','Marcos Lima','Diego Alves','2025-05-20','2026-08-19',245000,1500,1710,'8481.80.99',false),
  ('C-2026-045','Delta Papel & Celulose','Grupo Delta','Matriz - PR','PR','Juliana Reis','Ana Ferraz','Diego Alves','2024-10-01','2026-07-30',312000,2200,990,'4811.59.90',true),
  ('C-2026-051','Épsilon Autopeças','Grupo Épsilon','Unidade 1','SP','Rafael Souza','Marcos Lima','Cíntia Prado','2025-11-15','2026-10-12',158000,900,702,'8708.99.90',false),
  ('C-2026-058','Zeta Têxtil Industrial','Grupo Zeta','Matriz - SC','SC','Juliana Reis','Ana Ferraz','Diego Alves','2025-04-02','2026-11-30',78000,500,355,'5407.42.00',false),
  ('C-2026-063','Grupo Alfa Metalúrgica','Grupo Alfa','Filial - Sorocaba','SP','Rafael Souza','Marcos Lima','Cíntia Prado','2025-08-01','2026-09-02',64000,400,170,'8483.40.90',false),
  ('C-2026-071','Theta Bebidas','Grupo Theta','Matriz - GO','GO','Juliana Reis','Ana Ferraz','Diego Alves','2025-02-14','2026-08-13',210000,1300,1187,'8422.30.29',false),
  ('C-2026-079','Iota Agroindustrial','Grupo Iota','Unidade Oeste','MT','Rafael Souza','Marcos Lima','Cíntia Prado','2025-01-05','2026-06-20',405000,2600,1508,'8433.51.00',true),
  ('C-2026-084','Cerâmica Gama S.A.','Grupo Gama','Planta 1','MG','Juliana Reis','Marcos Lima','Diego Alves','2025-09-22','2027-01-18',132000,800,640,'8481.80.99',false),
  ('C-2026-090','Beta Componentes Ind.','Grupo Beta','Unidade Sul','RS','Rafael Souza','Ana Ferraz','Cíntia Prado','2025-07-08','2026-10-05',52000,350,298,'7318.15.00',false),
  ('C-2026-097','Delta Papel & Celulose','Grupo Delta','Filial - Curitiba','PR','Juliana Reis','Ana Ferraz','Diego Alves','2024-12-01','2026-07-05',189000,1100,410,'4811.59.90',false);

insert into public.cotacoes (numero, cliente, tipo, valor_cotado, valor_contrato, status, motivo) values
  ('COT-4821','Grupo Alfa Metalúrgica','Renovação',190000,184000,'Em negociação','Aguardando validação do comprador'),
  ('COT-4835','Delta Papel & Celulose','Renovação',298000,312000,'Perdido','Concorrente ofertou prazo de entrega menor'),
  ('COT-4849','Iota Agroindustrial','Renovação',420000,405000,'Renovado','Ajuste de volume aprovado pelo gerente'),
  ('COT-4860','Zeta Têxtil Industrial','Cliente novo',81000,78000,'Ativo',null),
  ('COT-4873','Cerâmica Gama S.A.','Renovação',255000,245000,'Em negociação','Revisão de preço por alta de insumo'),
  ('COT-4881','Theta Bebidas','Renovação',210000,210000,'Ativo',null);
