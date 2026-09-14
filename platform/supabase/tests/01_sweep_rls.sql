-- Varredura 1 — RLS em toda tabela de negócio.  (CLAUDE.md, invariante 9; fatia F1, critério 6)
--
-- COMO ESTA CATRACA FUNCIONA
--
-- Nenhuma tabela de `public` pode existir sem RLS.  A allowlist está VAZIA, e é
-- esse o estado correto: dois laços dinâmicos ligam RLS em todas as tabelas que
-- existiam quando rodaram —
--   20260427122300_okinawa_bigbang_bootstrap.sql:120
--   20260622120000_supabase_auth_roles_rls.sql:358
-- (`execute format('alter table %I.%I enable row level security', ...)`) — e as
-- tabelas criadas depois ligam RLS explicitamente.  O banco vivo confirma: 0 de
-- 121 tabelas sem RLS em 14/09/2026.
--
-- A versão anterior desta varredura listava 27 tabelas "sem RLS".  O número vinha
-- de uma leitura estática das migrations que não enxergou os laços, e a catraca ao
-- contrário (segunda asserção) teria reprovado na primeira execução.
--
-- Uma entrada nova na allowlist precisa de justificativa escrita ao lado.  O
-- caminho normal é criar a tabela já com `enable row level security` e política.
--
-- RLS LIGADO NÃO É ISOLAMENTO.  Tabela com RLS e sem política nega tudo aos papéis
-- de cliente; política errada vaza entre estabelecimentos.  O `diag` do fim lista
-- as tabelas com RLS e nenhuma política, para a auditoria de T-F1-01 e T-F1-05.
-- Ele informa, não reprova.

begin;
select plan(2);

create temporary table _sweep_rls_allowlist (table_name text primary key) on commit drop;

-- ---------------------------------------------------------------------------
-- A asserção: nenhuma tabela sem RLS fora da allowlist.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::bigint
     from pg_tables t
    where t.schemaname = 'public'
      and not t.rowsecurity
      and t.tablename not in (select table_name from _sweep_rls_allowlist)),
  0::bigint,
  'invariante 9: nenhuma tabela de negocio sem RLS'
);

select diag(_test.diag_list(
  'tabelas sem RLS fora da allowlist (adicione a politica, nao a allowlist)',
  (select coalesce(array_agg(t.tablename order by t.tablename), '{}')
     from pg_tables t
    where t.schemaname = 'public'
      and not t.rowsecurity
      and t.tablename not in (select table_name from _sweep_rls_allowlist))
));

-- ---------------------------------------------------------------------------
-- A catraca ao contrário: a allowlist não pode conter tabela que JÁ tem RLS.
-- Sem isto, uma entrada resolvida ficaria para sempre na lista, e o teste
-- pararia de medir o que falta.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::bigint
     from _sweep_rls_allowlist a
     join pg_tables t on t.schemaname = 'public' and t.tablename = a.table_name
    where t.rowsecurity),
  0::bigint,
  'allowlist de RLS nao contem tabela ja resolvida (remova a entrada)'
);

-- ---------------------------------------------------------------------------
-- Informativo: RLS ligado e nenhuma política.  Fora dos domínios congelados, cada
-- uma destas precisa de política ou de comentário que justifique o deny-all.
-- ---------------------------------------------------------------------------
select diag(_test.diag_list(
  'tabelas com RLS e sem politica (negam tudo ao cliente; decidir em T-F1-01)',
  (select coalesce(array_agg(t.tablename order by t.tablename), '{}')
     from pg_tables t
    where t.schemaname = 'public'
      and t.rowsecurity
      and t.tablename not in (select table_name from _test.frozen_tables)
      and not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename))
));

select * from finish();
rollback;
