-- Varredura 3 — `orders.status` é derivado dos itens.  (CLAUDE.md, invariante 5; fatia N2, critério 3)
--
-- COMO ESTA CATRACA FUNCIONA, E POR QUE ELA LÊ `pg_proc` EM VEZ DE ARQUIVOS
--
-- A tentação é varrer as migrations com grep.  Seria errado: 82 migrations
-- redefinem funções umas por cima das outras com `create or replace`, então o
-- texto de uma migration antiga descreve um estado que não existe mais.
-- `pg_proc.prosrc` contém a definição VIVA — a única que pode causar um bug.
--
-- A allowlist é a lista de funções que hoje escrevem `orders.status` à mão.  A
-- fatia N2 esvazia essa lista redistribuindo cada uma:
--
--   convergência duplicada      -> some, vira o trigger em `order_items`
--   fluxo de produção           -> passa a chamar `update_item_status`
--   fluxo de pagamento          -> passa a escrever `orders.payment_status`,
--                                  coluna nova, porque hoje `orders.status`
--                                  carrega produção E pagamento na mesma coluna,
--                                  e é essa fusão que faz o trigger de derivação
--                                  brigar com o pagamento pelo mesmo campo
--   cancelamento                -> RPC própria, com auditoria
--
-- Quando a lista esvaziar, o teste de comportamento correspondente (tentar o
-- `update` direto e esperar `42501`) entra em 07_status_derivation.sql, e esta
-- varredura passa a proteger o resultado.

begin;
select plan(2);

create temporary table _sweep_status_allowlist (
  routine_name text primary key,
  destino      text not null
) on commit drop;

insert into _sweep_status_allowlist (routine_name, destino) values
  ('restaurant_update_order_status',      'fanout para update_item_status'),
  ('restaurant_update_order_item_status', 'remover: a convergencia vira trigger em order_items'),
  ('restaurant_record_payment',           'escrever orders.payment_status'),
  ('customer_pay_table_bill',             'escrever orders.payment_status'),
  ('customer_cancel_order',               'RPC de cancelamento com auditoria'),
  ('restaurant_resolve_approval',         'RPC de cancelamento com auditoria');

-- ---------------------------------------------------------------------------
-- Funções vivas que escrevem `orders.status` diretamente.
--
-- O padrão casa `update [public.]orders [alias] set ... status =`, tolerando
-- alias e quebras de linha entre o SET e a coluna.  `[^;]*` impede que o casamento
-- atravesse o fim do comando e produza falso positivo com um UPDATE seguinte.
--
-- A fronteira de palavra é `\y`, NÃO `\b`.  No regex do Postgres, `\b` é o
-- caractere backspace: com ele a view não casava função nenhuma, a primeira
-- asserção passava sem medir nada e a catraca ao contrário reprovava.  Com `\y`,
-- o banco vivo casa exatamente as 6 funções da allowlist (verificado em 14/09/2026).
-- ---------------------------------------------------------------------------
create temporary view _sweep_status_found as
  select p.proname as routine_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prokind = 'f'
     and p.prosrc ~* 'update\s+(public\.)?orders(\s+\w+)?\s+set[^;]*\ystatus\s*='
   group by p.proname;

select is(
  (select count(*)::bigint from _sweep_status_found f
    where f.routine_name not in (select routine_name from _sweep_status_allowlist)),
  0::bigint,
  'invariante 5: nenhuma escrita direta nova em orders.status'
);

select diag(_test.diag_list(
  'funcoes que escrevem orders.status fora da allowlist (derive dos itens; nao adicione a allowlist)',
  (select coalesce(array_agg(f.routine_name order by f.routine_name), '{}')
     from _sweep_status_found f
    where f.routine_name not in (select routine_name from _sweep_status_allowlist))
));

-- ---------------------------------------------------------------------------
-- Catraca ao contrário.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::bigint from _sweep_status_allowlist a
    where a.routine_name not in (select routine_name from _sweep_status_found)),
  0::bigint,
  'allowlist de orders.status nao contem funcao ja corrigida (remova a entrada)'
);

select diag(_test.diag_list(
  'entradas obsoletas na allowlist de orders.status (ja corrigidas, remova)',
  (select coalesce(array_agg(a.routine_name order by a.routine_name), '{}')
     from _sweep_status_allowlist a
    where a.routine_name not in (select routine_name from _sweep_status_found))
));

select * from finish();
rollback;
