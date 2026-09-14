-- Varredura 2 — dinheiro é bigint em centavos.  (CLAUDE.md, invariante 1; fatia F2, critério 1)
--
-- COMO ESTA CATRACA FUNCIONA
--
-- O filtro é deliberadamente generoso: casa qualquer coluna `numeric`/`real`/
-- `double precision` cujo nome contenha uma palavra de dinheiro, por substring e
-- sem âncora.  Para uma invariante de dinheiro, sobre-capturar é barato — o falso
-- positivo vira uma entrada documentada na allowlist — e sub-capturar é o modo de
-- falha caro, porque a coluna que escapa é justamente a que ninguém revisou.
--
-- A allowlist tem TRÊS categorias, e a distinção não é burocrática: cada uma sai
-- daqui por uma migration diferente.
--
--   DINHEIRO    -> vira `bigint` em centavos (F2/M1).  É o grosso.
--   PERCENTUAL  -> vira `integer` em basis points (F3).  10% = 1000.  Guardar
--                  percentual em float reintroduz ponto flutuante no caminho do
--                  cálculo pela porta dos fundos.
--   CONTAGEM    -> vira `integer`.  Não é bug de dinheiro, é bug de tipo, e só
--                  aparece aqui porque o nome contém "total".  Sai numa migration
--                  própria para não poluir a conversão monetária.
--
-- Colunas GERADAS são ignoradas (`is_generated = 'NEVER'` no filtro): durante a
-- conversão, cada coluna monetária deixa para trás uma coluna gerada com o nome
-- antigo, por compatibilidade de leitura.  Elas são `numeric` de propósito e
-- somem na migration de limpeza (F2/M4).
--
-- Tabelas de domínio congelado saem por `_test.frozen_tables` — derivado da
-- política de congelamento, não de lista repetida.

begin;
select plan(3);

create temporary table _sweep_money_allowlist (
  table_name  text not null,
  column_name text not null,
  category    text not null check (category in ('dinheiro','percentual','contagem')),
  primary key (table_name, column_name)
) on commit drop;

insert into _sweep_money_allowlist (table_name, column_name, category) values
  -- ---------- DINHEIRO: vira bigint em centavos (F2/M1) ----------
  -- Caminho de cobrança.  Prioridade 1 da conversão.
  ('orders','subtotal','dinheiro'),
  ('orders','tax_amount','dinheiro'),
  ('orders','tip_amount','dinheiro'),
  ('orders','discount_amount','dinheiro'),
  ('orders','total_amount','dinheiro'),
  ('order_items','unit_price','dinheiro'),
  ('order_items','total_price','dinheiro'),
  ('menu_items','price','dinheiro'),
  ('menu_items','original_price','dinheiro'),
  -- ATENÇÃO na conversão: estas duas JÁ se chamam `_cents` mas são `numeric`.
  -- Multiplicá-las por 100 como as demais multiplicaria o histórico de
  -- transações por 100.  Só retipar: `using round(amount_cents)::bigint`.
  ('gateway_transactions','amount_cents','dinheiro'),
  ('gateway_transactions','refunded_amount_cents','dinheiro'),
  -- `amount` em reais, acrescentada por `alter table` em 20260624211000_payment_rpc.sql:7
  -- e redeclarada em 20260624213000.  Convive com `amount_cents`: a conversão decide
  -- qual das duas sobrevive, em vez de converter as duas.
  ('gateway_transactions','amount','dinheiro'),
  -- Conta e sessão.
  ('table_sessions','total_amount','dinheiro'),
  ('table_sessions','total_spent','dinheiro'),
  ('order_guests','amount_due','dinheiro'),
  ('order_guests','amount_paid','dinheiro'),
  ('bills','amount','dinheiro'),
  ('receipts','subtotal','dinheiro'),
  ('receipts','service_fee','dinheiro'),
  ('receipts','tip','dinheiro'),
  ('receipts','total','dinheiro'),
  ('casual_dining_receipts','subtotal','dinheiro'),
  ('casual_dining_receipts','service_fee','dinheiro'),
  ('casual_dining_receipts','tip','dinheiro'),
  ('casual_dining_receipts','discount','dinheiro'),
  ('casual_dining_receipts','cashback','dinheiro'),
  ('casual_dining_receipts','total','dinheiro'),
  -- Carteira.
  ('wallets','balance','dinheiro'),
  ('wallets','max_balance','dinheiro'),
  ('wallet_transactions','amount','dinheiro'),
  ('wallet_transactions','balance_before','dinheiro'),
  ('wallet_transactions','balance_after','dinheiro'),
  -- Caixa, gorjeta, financeiro e fiscal.
  ('cash_register_sessions','opening_balance','dinheiro'),
  ('cash_register_sessions','expected_balance','dinheiro'),
  ('cash_register_sessions','actual_balance','dinheiro'),
  ('cash_register_movements','amount','dinheiro'),
  ('financial_transactions','amount','dinheiro'),
  ('fiscal_documents','total_amount','dinheiro'),
  ('tips','amount','dinheiro'),
  ('approvals','amount','dinheiro'),
  ('loyalty_programs','total_spent','dinheiro'),
  ('customer_profiles','total_spent','dinheiro'),
  -- Configuração com valor monetário.
  ('restaurant_service_configs','fixed_price','dinheiro'),
  ('restaurant_service_configs','price_per_kg','dinheiro'),
  ('promotions','discount_value','dinheiro'),
  ('happy_hour_schedules','discount_value','dinheiro'),

  -- ---------- PERCENTUAL: vira integer em basis points (F3) ----------
  ('casual_dining_receipts','service_fee_percent','percentual'),
  ('loyalty_configs','cashback_percentage','percentual'),
  ('restaurant_service_configs','suggested_tip_percentage','percentual'),

  -- ---------- CONTAGEM: vira integer, migration própria ----------
  ('table_sessions','total_orders','contagem'),
  ('customer_profiles','total_visits','contagem'),
  ('loyalty_programs','total_visits','contagem');

-- ---------------------------------------------------------------------------
-- O conjunto de violações vivas, derivado do catálogo.
-- ---------------------------------------------------------------------------
create temporary view _sweep_money_found as
  select c.table_name, c.column_name
    from information_schema.columns c
    join pg_tables t
      on t.schemaname = c.table_schema and t.tablename = c.table_name
   where c.table_schema = 'public'
     and c.is_generated = 'NEVER'
     and c.data_type in ('numeric', 'real', 'double precision')
     and c.column_name ~ '(cents|price|amount|subtotal|total|fee|tip|discount|balance|cost|revenue|payout|cashback|spent|charge)'
     and c.table_name not in (select table_name from _test.frozen_tables);

select is(
  (select count(*)::bigint from _sweep_money_found f
    where (f.table_name, f.column_name) not in
          (select table_name, column_name from _sweep_money_allowlist)),
  0::bigint,
  'invariante 1: nenhuma coluna monetaria numeric nova fora da allowlist'
);

select diag(_test.diag_list(
  'colunas monetarias numeric fora da allowlist (converta para bigint centavos; se nao for dinheiro, classifique na allowlist)',
  (select coalesce(array_agg(f.table_name || '.' || f.column_name order by f.table_name, f.column_name), '{}')
     from _sweep_money_found f
    where (f.table_name, f.column_name) not in
          (select table_name, column_name from _sweep_money_allowlist))
));

-- ---------------------------------------------------------------------------
-- Catraca ao contrário: entrada resolvida não pode permanecer na allowlist.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::bigint from _sweep_money_allowlist a
    where (a.table_name, a.column_name) not in
          (select table_name, column_name from _sweep_money_found)),
  0::bigint,
  'allowlist de dinheiro nao contem coluna ja convertida (remova a entrada)'
);

select diag(_test.diag_list(
  'entradas obsoletas na allowlist de dinheiro (ja convertidas, remova)',
  (select coalesce(array_agg(a.table_name || '.' || a.column_name order by a.table_name, a.column_name), '{}')
     from _sweep_money_allowlist a
    where (a.table_name, a.column_name) not in
          (select table_name, column_name from _sweep_money_found))
));

-- ---------------------------------------------------------------------------
-- Meta-asserção: a conversão terminou quando esta contagem chegar a zero.
-- Enquanto não chega, o número é o placar público da fatia F2.
--
-- 46 = entradas `dinheiro` desta allowlist em 14/09/2026.  O valor anterior (41)
-- não batia com a própria lista e reprovaria na primeira execução.  A cada coluna
-- convertida, a entrada sai da allowlist e este número desce no mesmo commit.
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*)::bigint from _sweep_money_allowlist where category = 'dinheiro'),
  '<=', 46::bigint,
  'placar F2: colunas de dinheiro por converter nao aumentou'
);

select * from finish();
rollback;
