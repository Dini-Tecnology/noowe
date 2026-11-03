-- T1 (critério 1): enquanto não houver fornecedor de Tap to Pay ativo, nenhum caminho do servidor aceita
-- pagamento por aproximação. A tela do garçom e as listas do cliente já não oferecem; isto fecha a porta para
-- um app antigo ou uma chamada direta. Recibos antigos seguem mostrando o rótulo.
create or replace function public.customer_pay_table_bill(p_table_session_id uuid, p_tip_percent numeric DEFAULT 0,
  p_payment_method text DEFAULT 'pix'::text, p_base_amount numeric DEFAULT NULL::numeric,
  p_split_mode text DEFAULT 'mine'::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_item_ids uuid[] DEFAULT NULL::uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare v_mode public.noowe_split_mode; v_restaurant uuid;
begin
  if p_payment_method = 'tap_to_pay' then
    raise exception 'Pagamento por aproximação indisponível' using errcode = '22023';
  end if;
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
end $function$;
