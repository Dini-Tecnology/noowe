-- Aditivo G: o Garçom vê o dinheiro que recebeu no caixa aberto, só o dele (sem caixa geral).
create or replace function public.restaurant_my_cash_in_hand(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_session uuid; v_since timestamptz; v_cents bigint;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['waiter','maitre','barman']::public.user_roles_role_enum[]);
  select id, opened_at into v_session, v_since from public.cash_register_sessions
    where restaurant_id = p_restaurant_id and status = 'open';
  if v_session is null then return jsonb_build_object('open', false, 'cents', 0); end if;
  -- Recebido menos o que voltou (estorno); sangria e reforço são do Gerente e não entram aqui.
  select coalesce(sum(case m.type when 'sale' then m.amount_cents when 'sangria' then 0 when 'reforco' then 0 else -m.amount_cents end), 0)::bigint
    into v_cents from public.cash_register_movements m
    where m.session_id = v_session and m.actor_id = auth.uid() and m.is_cash;
  return jsonb_build_object('open', true, 'cents', v_cents, 'since', v_since);
end $$;
revoke all on function public.restaurant_my_cash_in_hand(uuid) from public, anon;
grant execute on function public.restaurant_my_cash_in_hand(uuid) to authenticated;
