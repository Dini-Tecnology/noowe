-- N4 / P0 — fecha a escrita direta em gateway_transactions e gateway_configs.
--
-- A policy `gateway_transactions_staff` era `FOR ALL USING (... or customer_id =
-- auth.uid())` sem WITH CHECK, e nenhuma migration revogava os grants padrão do
-- Supabase. Um cliente autenticado conseguia, via PostgREST, inserir uma linha
-- `status = 'completed'` com `provider <> 'simulated'` para o próprio pedido, e
-- private.table_unpaid_items passava a tratar o pedido como pago (invariante 6:
-- a confirmação só pode vir do provedor).
--
-- Toda escrita legítima acontece em RPC security definer, que não depende dos
-- grants de `authenticated`. O app não lê estas tabelas direto.

revoke insert, update, delete, truncate on public.gateway_transactions from anon, authenticated;
revoke all on public.gateway_transactions from anon;

drop policy if exists "gateway_transactions_staff" on public.gateway_transactions;
-- Policies de escrita herdadas do bootstrap (existem no banco remoto).
drop policy if exists authenticated_insert_by_restaurant_manager on public.gateway_transactions;
drop policy if exists authenticated_update_by_restaurant_manager on public.gateway_transactions;
drop policy if exists authenticated_delete_by_restaurant_manager on public.gateway_transactions;
drop policy if exists gateway_transactions_select_staff on public.gateway_transactions;
drop policy if exists gateway_transactions_select_own on public.gateway_transactions;

create policy gateway_transactions_select_staff on public.gateway_transactions
  for select to authenticated
  using (private.has_restaurant_role(
    restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]));

create policy gateway_transactions_select_own on public.gateway_transactions
  for select to authenticated
  using (customer_id = auth.uid());

-- `credentials` guarda segredo do provedor. A conta de recebimento do Asaas
-- (restaurant_payment_accounts, P1) não passa por aqui; esta tabela fica sem
-- acesso de cliente algum.
revoke all on public.gateway_configs from anon, authenticated;
drop policy if exists "gateway_configs_staff" on public.gateway_configs;
