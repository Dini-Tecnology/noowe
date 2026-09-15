-- Fase 0 — Montagem do ambiente de teste.
--
-- Este arquivo roda primeiro (pg_prove executa em ordem alfabética) e cria, FORA
-- de transação, o que os demais arquivos consomem: a extensão pgTAP, o schema
-- `_test` e os helpers.  Os arquivos de teste seguintes rodam dentro de
-- `begin ... rollback`, então nada que eles criem sobrevive — por isso a
-- infraestrutura precisa nascer aqui.

create extension if not exists pgtap with schema extensions;

create schema if not exists _test;

-- ---------------------------------------------------------------------------
-- Congelamento, derivado — não é lista fixa.
--
-- Uma tabela é "congelada" quando carrega a política criada por
-- 20260908120000_freeze_deferred_domains.sql.  Derivar em vez de repetir a lista
-- tem uma consequência que é o ponto todo: no dia em que um domínio for
-- descongelado, ele volta a ser cobrado por todas as varreduras sozinho, sem
-- ninguém lembrar de editar um segundo lugar.
-- ---------------------------------------------------------------------------
create or replace view _test.frozen_tables as
  select distinct tablename as table_name
  from pg_policies
  where schemaname = 'public'
    and policyname like '%\_frozen\_deny\_all';

-- ---------------------------------------------------------------------------
-- Personificação.  Sem isto não se testa RLS nenhuma: as políticas leem
-- `auth.uid()`, que por sua vez lê a claim `sub` do JWT.  O terceiro argumento
-- `true` de set_config limita o efeito à transação corrente, então cada teste
-- volta ao estado neutro no rollback.
-- ---------------------------------------------------------------------------
create or replace function _test.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function _test.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
end $$;

create or replace function _test.reset_role()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Relatório de diferença.
--
-- Toda varredura falha da mesma forma: "encontrei N violações fora da
-- allowlist".  Sem dizer QUAIS, a falha custa uma investigação a cada vez.  Este
-- helper transforma a falha em instrução — a saída lista exatamente as linhas a
-- corrigir ou, se forem legítimas, a acrescentar à allowlist.
-- ---------------------------------------------------------------------------
create or replace function _test.diag_list(p_label text, p_items text[])
returns text language sql immutable as $$
  select case
    when p_items is null or cardinality(p_items) = 0 then ''
    else p_label || ': ' || array_to_string(p_items, ', ')
  end;
$$;

begin;
select plan(3);

select has_schema('_test', 'schema _test existe');
select has_extension('extensions', 'pgtap', 'extensao pgtap instalada');
select ok(
  (select count(*) from _test.frozen_tables) >= 40,
  'congelamento aplicado: pelo menos 40 tabelas com politica *_frozen_deny_all'
);

select * from finish();
rollback;
