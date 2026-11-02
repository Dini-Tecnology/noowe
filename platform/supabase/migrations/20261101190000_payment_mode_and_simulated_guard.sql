-- N4 / invariante 6 — pagamento simulado deixa de ser o caminho padrão.
--
-- customer_start_payment e customer_pay_table_bill confirmavam o pedido e a conta com o
-- provedor "simulated" sem flag nenhuma: qualquer usuário autenticado marcava como pago sem
-- ser cobrado. Agora só rodam com a flag ligada e em restaurante sem conta Asaas ativa.
--
-- O app pergunta ao servidor como cobrar (private.payment_mode) e nunca decide sozinho:
--   asaas       -> Edge Function payments-create; quem confirma é o webhook.
--   simulated   -> só com a flag de desenvolvimento ligada.
--   unavailable -> o restaurante ainda não aceita pagamento online.

insert into private.dev_flags (key, enabled)
values ('simulate_order_payment', false)
on conflict (key) do nothing;

create or replace function private.payment_mode(p_restaurant_id uuid, p_simulation_flag text)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select case
    when exists (select 1 from public.restaurant_payment_accounts a
      where a.restaurant_id = p_restaurant_id and a.status = 'active') then 'asaas'
    when exists (select 1 from private.dev_flags f where f.key = p_simulation_flag and f.enabled) then 'simulated'
    else 'unavailable' end
$$;
revoke all on function private.payment_mode(uuid, text) from public, anon, authenticated;

create or replace function public.customer_order_payment_mode(p_restaurant_id uuid)
returns text language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return private.payment_mode(p_restaurant_id, 'simulate_order_payment');
end $$;
revoke all on function public.customer_order_payment_mode(uuid) from public, anon;
grant execute on function public.customer_order_payment_mode(uuid) to authenticated;

create or replace function public.customer_share_payment_mode(p_share_id uuid)
returns text language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  return private.payment_mode(s.restaurant_id, 'simulate_share_payment');
end $$;
revoke all on function public.customer_share_payment_mode(uuid) from public, anon;
grant execute on function public.customer_share_payment_mode(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedido: o corpo simulado fica privado e a porta pública passa a exigir a flag.
-- ---------------------------------------------------------------------------
alter function public.customer_start_payment(uuid, text, uuid) rename to customer_start_payment_simulated;
revoke all on function public.customer_start_payment_simulated(uuid, text, uuid) from public, anon, authenticated;

create function public.customer_start_payment(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_restaurant uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select restaurant_id into v_restaurant from public.orders where id = p_order_id and customer_id = auth.uid();
  if v_restaurant is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if private.payment_mode(v_restaurant, 'simulate_order_payment') <> 'simulated' then
    raise exception 'Pagamento simulado desligado; use o pagamento online.' using errcode = '42501'; end if;
  return public.customer_start_payment_simulated(p_order_id, p_payment_method, p_idempotency_key);
end $$;
revoke all on function public.customer_start_payment(uuid, text, uuid) from public, anon;
grant execute on function public.customer_start_payment(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Conta da mesa: mesma regra; o caminho real é bill_shares + payments-create.
-- ---------------------------------------------------------------------------
create or replace function public.customer_pay_table_bill(
  p_table_session_id uuid, p_tip_percent numeric default 0, p_payment_method text default 'pix',
  p_base_amount numeric default null, p_split_mode text default 'mine', p_idempotency_key uuid default null,
  p_item_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_mode public.noowe_split_mode; v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.table_sessions where id = p_table_session_id;
  if v_restaurant is null then raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  if private.payment_mode(v_restaurant, 'simulate_share_payment') <> 'simulated' then
    raise exception 'Pagamento simulado desligado; use o pagamento online.' using errcode = '42501'; end if;
  v_mode := case p_split_mode when 'mine' then 'by_owner' when 'equal' then 'equal'
    when 'byItem' then 'by_item' when 'fixed' then 'fixed_amount' else null end;
  if v_mode is null then raise exception 'Modo de divisão inválido' using errcode = '22023'; end if;
  perform private.assert_split_mode_enabled(p_table_session_id, v_mode);
  return public.customer_pay_table_bill_legacy_v1(p_table_session_id, p_tip_percent, p_payment_method,
    p_base_amount, p_split_mode, p_idempotency_key, p_item_ids);
end $$;
revoke all on function public.customer_pay_table_bill(uuid, numeric, text, numeric, text, uuid, uuid[]) from public, anon;
grant execute on function public.customer_pay_table_bill(uuid, numeric, text, numeric, text, uuid, uuid[]) to authenticated;
