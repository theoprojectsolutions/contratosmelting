-- =====================================================================
-- MELTING · GESTÃO DE CONTRATOS
-- COLUNAS ADICIONADAS DEPOIS DO schema.sql ORIGINAL
--
-- Este script já foi executado diretamente no banco (via integração
-- Supabase). Ele está aqui só para documentação/histórico — se você
-- estiver montando o banco do zero, rode-o depois do schema.sql e do
-- perfis-e-permissoes.sql, nessa ordem.
-- =====================================================================

-- Contratos: campos "Segmento" e "Quantidade de itens" adicionados
-- depois no protótipo (ver tela de detalhe do contrato / formulário).
alter table public.contratos
  add column if not exists segmento text,
  add column if not exists quantidade_itens numeric not null default 0;

-- Cotações: campos de datas e itens estimados/cotados adicionados
-- depois (ver tela de Cotações).
alter table public.cotacoes
  add column if not exists data_recebimento date,
  add column if not exists data_envio date,
  add column if not exists itens_estimados numeric not null default 0,
  add column if not exists itens_cotados numeric not null default 0;

-- As regras de segurança (RLS) já criadas em perfis-e-permissoes.sql
-- funcionam por linha, não por coluna — então essas colunas novas já
-- ficam protegidas automaticamente pelas mesmas políticas (leitura para
-- todo mundo logado, escrita só para admin). Não precisa mexer em nada
-- de segurança por causa dessas colunas.

-- =====================================================================
-- OBRIGATORIEDADE E LIMITES DE CARACTERES
-- Espelha exatamente os campos "required" e "maxlength" do formulário
-- do site — se alguém tentar inserir direto no banco pulando o site,
-- essas regras continuam valendo.
-- =====================================================================

alter table public.contratos
  alter column grupo set not null,
  alter column unidade set not null,
  alter column segmento set not null,
  alter column vendedor_interno set not null,
  alter column gerente set not null,
  alter column valor_contratado set not null,
  alter column qtd_estimada set not null,
  alter column quantidade_itens set not null,
  alter column data_inicio set not null,
  alter column data_fim set not null;

alter table public.contratos
  add constraint contratos_cliente_len check (char_length(cliente) <= 150),
  add constraint contratos_grupo_len check (char_length(grupo) <= 100),
  add constraint contratos_unidade_len check (char_length(unidade) <= 100),
  add constraint contratos_segmento_len check (char_length(segmento) <= 60),
  add constraint contratos_uf_len check (uf is null or char_length(uf) <= 2);

alter table public.cotacoes
  alter column data_recebimento set not null,
  alter column data_envio set not null,
  alter column itens_estimados set not null,
  alter column itens_cotados set not null,
  alter column valor_cotado set not null;

alter table public.cotacoes
  add constraint cotacoes_cliente_len check (char_length(cliente) <= 150);

alter table public.clientes
  alter column grupo set not null;

alter table public.clientes
  add constraint clientes_cliente_len check (char_length(cliente) <= 150),
  add constraint clientes_grupo_len check (char_length(grupo) <= 100);
