-- Fase 0 — Congelamento dos domínios adiados.
--
-- Escopo de lançamento: Fine Dining, Casual Dining, Quick Service.
-- Adiados (preservar, não deletar): balada/clube, pub-bar, estoque/fichas técnicas,
-- RH/escala, integrações de delivery.  Ver docs/TRIAGEM-LANCAMENTO.md.
--
-- O que esta migration faz e por quê:
--   1. Liga RLS e aplica política deny-all nas tabelas fora do escopo, de modo que
--      nenhum cliente PostgREST (anon/authenticated) leia ou escreva nelas.
--   2. Revoga os grants de tabela dos papéis de cliente.
--
-- O que ela deliberadamente NÃO faz:
--   - Não dropa nenhuma tabela. O trabalho está preservado; congelar é reversível.
--   - Não usa `force row level security`. Funções `security definer` (ex.:
--     restaurant_get_dashboard_snapshot) e o `service_role` precisam continuar
--     acessando as tabelas para que seeds e relatórios não quebrem.
--
-- Efeito colateral desejado: as duas varreduras de RLS e de dinheiro passam a
-- tratar estas tabelas como "congeladas" na allowlist, e o escopo real de F1/F2
-- cai de 120 para 78 tabelas.

do $$
declare
  v_frozen text[] := array[
    -- Balada / clube (14).  `queue_entries` é a fila do domínio balada; a fila do
    -- restaurante é `waitlist_entries` e permanece ativa (ver ADR-009).
    'club_entries', 'club_check_in_outs', 'club_birthday_entries', 'guest_list_entries',
    'lineups', 'lineup_slots', 'promoters', 'promoter_sales', 'promoter_payments',
    'vip_table_reservations', 'vip_table_guests', 'vip_table_tabs', 'vip_table_tab_items',
    'queue_entries',

    -- Pub-bar (4).  Segundo motor de comanda em grupo, clone de `table_sessions`.
    'tabs', 'tab_items', 'tab_members', 'tab_payments',

    -- Estoque, fichas técnicas e compras (15).  Sem superfície de UI no app.
    'ingredients', 'ingredient_prices', 'ingredient_suppliers', 'suppliers',
    'supplier_item_mappings', 'recipes', 'recipe_ingredients', 'drink_recipes',
    'stock_items', 'stock_movements', 'inventory_counts', 'inventory_count_items',
    'inventory_items', 'purchase_records', 'unit_conversions',

    -- RH / escala (3).
    'shifts', 'attendances', 'leave_requests',

    -- Delivery e integrações externas (6).
    'platform_connections', 'external_menu_mappings', 'delivery_settlements',
    'restaurant_integrations', 'webhook_subscriptions', 'webhook_deliveries',

    -- Duplicações perdedoras.  Não são domínio adiado: são a metade descartada de
    -- uma decisão de consolidação, congelada aqui para que ninguém escreva nas duas.
    --   `waiter_calls`  -> consolidada em `service_calls` (S1).  Hoje só o seed
    --                      escreve nela; o caminho vivo escreve `service_calls`.
    --   `payment_splits`-> substituída por `bill_shares` (G3).  Grão errado: está
    --                      ancorada em `order_id`, e uma sessão tem N pedidos.
    'waiter_calls', 'payment_splits'
  ];
  v_table text;
  v_policy text;
begin
  foreach v_table in array v_frozen loop
    if to_regclass('public.' || quote_ident(v_table)) is null then
      raise notice 'freeze: tabela public.% nao existe, ignorando', v_table;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    -- Políticas permissivas pré-existentes são OR'd com a nossa e anulariam o
    -- congelamento.  Removê-las é o que torna o deny-all efetivo.
    for v_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy, v_table);
    end loop;

    execute format(
      'create policy %I on public.%I as restrictive for all to public using (false) with check (false)',
      v_table || '_frozen_deny_all', v_table);

    execute format('revoke all on public.%I from anon, authenticated', v_table);
  end loop;
end $$;

comment on schema public is
  'NOOWE. Tabelas com politica *_frozen_deny_all pertencem a dominios adiados do lancamento; ver 20260908120000_freeze_deferred_domains.sql e docs/TRIAGEM-LANCAMENTO.md.';
