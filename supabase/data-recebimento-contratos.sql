-- =====================================================================
-- MELTING · GESTÃO DE CONTRATOS
-- CAMPO "DATA DE RECEBIMENTO" EM CONTRATOS
--
-- Este script já foi executado diretamente no banco (via integração
-- Supabase). Ele está aqui só para documentação/histórico — se você
-- estiver montando o banco do zero, rode-o depois do schema.sql, do
-- perfis-e-permissoes.sql e do colunas-adicionais.sql, nessa ordem.
-- =====================================================================

-- Contratos passam a ter "Data de recebimento" assim como cotações já
-- tinham. Diferente de cotações, aqui o campo é opcional (nem todo
-- contrato tem uma data de recebimento original registrada).
alter table public.contratos
  add column if not exists data_recebimento date;

-- As regras de segurança (RLS) já criadas em perfis-e-permissoes.sql
-- funcionam por linha, não por coluna — essa coluna nova já fica
-- protegida automaticamente pelas mesmas políticas.
