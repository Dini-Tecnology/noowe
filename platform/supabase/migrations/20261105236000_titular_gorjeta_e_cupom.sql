-- Conta do cliente (respostas 49, 55 e 79 de 05/11/2026; a 50 já valia: a taxa é opcional em todo restaurante com taxa).
--  49: o titular passa a titularidade a outro participante presente, que precisa aceitar. Depois disso sai como qualquer convidado.
--  55: gorjeta até 100%, com confirmação acima de 30% do consumo (parâmetro), contra erro de digitação.
--  79: cupom que zera a conta encerra sem cobrança ("Pago com cupom"). Saldo abaixo do mínimo do cartão: o cartão some, e o cliente
--      paga por Pix ou no salão. O desconto do cupom nunca deixa de ser dado.

-- 1. Parâmetros.
alter table private.noowe_billing_settings
  add column tip_confirm_above_bps integer not null default 3000 check (tip_confirm_above_bps between 0 and 10000),
  add column min_pix_charge_cents bigint not null default 500 check (min_pix_charge_cents >= 0);

-- 2. Titularidade.
create table public.table_session_host_transfers (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  from_participant_id uuid not null references public.table_session_participants(id) on delete cascade,
  to_participant_id uuid not null references public.table_session_participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index table_session_host_transfers_one_pending on public.table_session_host_transfers(table_session_id) where status = 'pending';
alter table public.table_session_host_transfers enable row level security;
revoke all on public.table_session_host_transfers from public, anon, authenticated;

create or replace function private.my_participant(p_table_session_id uuid)
returns public.table_session_participants language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.table_session_participants p
  where p.table_session_id = p_table_session_id and p.user_id = auth.uid() and p.walkout_at is null limit 1
$$;
revoke all on function private.my_participant(uuid) from public, anon, authenticated;

-- Para quem o titular pode passar: participantes presentes, com conta no app.
create or replace function public.customer_list_host_candidates(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare me public.table_session_participants;
begin
  me := private.my_participant(p_table_session_id);
  if me.id is null or not me.is_host then raise exception 'Só o titular passa a titularidade' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('participantId', p.id, 'name', coalesce(p.display_name, 'Convidado')) order by p.joined_at)
    from public.table_session_participants p
    where p.table_session_id = p_table_session_id and p.id <> me.id and p.user_id is not null and p.walkout_at is null and not p.is_kid), '[]'::jsonb);
end $$;

create or replace function public.customer_offer_host_transfer(p_table_session_id uuid, p_to_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare me public.table_session_participants; t public.table_session_participants; v_id uuid;
begin
  perform 1 from public.table_sessions where id = p_table_session_id and status = 'active' for update;
  if not found then raise exception 'A mesa não está aberta' using errcode = 'P0002'; end if;
  me := private.my_participant(p_table_session_id);
  if me.id is null or not me.is_host then raise exception 'Só o titular passa a titularidade' using errcode = '42501'; end if;
  select * into t from public.table_session_participants
    where id = p_to_participant_id and table_session_id = p_table_session_id and user_id is not null and walkout_at is null and not is_kid and id <> me.id;
  if t.id is null then raise exception 'Escolha alguém que está na mesa' using errcode = '22023'; end if;
  update public.table_session_host_transfers set status = 'cancelled', responded_at = now() where table_session_id = p_table_session_id and status = 'pending';
  insert into public.table_session_host_transfers(table_session_id, from_participant_id, to_participant_id) values (p_table_session_id, me.id, t.id) returning id into v_id;
  perform private.create_notification(t.user_id, 'Titularidade da mesa',
    coalesce(me.display_name, 'O titular') || ' quer passar a titularidade da mesa para você. Abra a mesa para aceitar.',
    'system', p_table_session_id, null, jsonb_build_object('kind', 'host_transfer_offer', 'table_session_id', p_table_session_id, 'transfer_id', v_id));
  return jsonb_build_object('transferId', v_id, 'toName', coalesce(t.display_name, 'Convidado'));
end $$;

-- O pedido que me diz respeito: o que recebi para aceitar, ou o que enviei e espera resposta.
create or replace function public.customer_pending_host_transfer(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare me public.table_session_participants; x record;
begin
  me := private.my_participant(p_table_session_id);
  if me.id is null then return null; end if;
  select h.id, h.from_participant_id, h.to_participant_id, f.display_name as from_name, t.display_name as to_name into x
    from public.table_session_host_transfers h
    join public.table_session_participants f on f.id = h.from_participant_id
    join public.table_session_participants t on t.id = h.to_participant_id
    where h.table_session_id = p_table_session_id and h.status = 'pending' and me.id in (h.from_participant_id, h.to_participant_id);
  if x.id is null then return null; end if;
  return jsonb_build_object('transferId', x.id, 'incoming', x.to_participant_id = me.id,
    'fromName', coalesce(x.from_name, 'O titular'), 'toName', coalesce(x.to_name, 'Convidado'));
end $$;

create or replace function public.customer_respond_host_transfer(p_transfer_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare h public.table_session_host_transfers; s public.table_sessions; f public.table_session_participants; t public.table_session_participants;
begin
  select * into h from public.table_session_host_transfers where id = p_transfer_id for update;
  if h.id is null or h.status <> 'pending' then raise exception 'Este pedido não está mais valendo' using errcode = 'P0002'; end if;
  select * into t from public.table_session_participants where id = h.to_participant_id;
  if t.user_id is distinct from auth.uid() then raise exception 'Só quem recebeu o pedido responde' using errcode = '42501'; end if;
  select * into s from public.table_sessions where id = h.table_session_id for update;
  select * into f from public.table_session_participants where id = h.from_participant_id;
  if not p_accept then
    update public.table_session_host_transfers set status = 'declined', responded_at = now() where id = h.id;
    perform private.create_notification(f.user_id, 'Titularidade da mesa', coalesce(t.display_name, 'O convidado') || ' não aceitou a titularidade.',
      'system', s.id, null, jsonb_build_object('kind', 'host_transfer_declined', 'table_session_id', s.id));
    return jsonb_build_object('accepted', false);
  end if;
  if s.status <> 'active' or not f.is_host or f.walkout_at is not null or t.walkout_at is not null then
    update public.table_session_host_transfers set status = 'cancelled', responded_at = now() where id = h.id;
    raise exception 'A mesa mudou: o pedido não vale mais' using errcode = 'P0002';
  end if;
  update public.table_session_participants set is_host = (id = t.id) where table_session_id = s.id and user_id is not null;
  update public.table_sessions set customer_id = t.user_id, primary_user_id = t.user_id, last_activity = now(), updated_at = now() where id = s.id;
  update public.table_session_host_transfers set status = 'accepted', responded_at = now() where id = h.id;
  perform private.log_audit(s.restaurant_id, 'bill.host_transferred', 'table_session', s.id, 'Titularidade aceita por quem recebeu',
    jsonb_build_object('participantId', f.id, 'userId', f.user_id), jsonb_build_object('participantId', t.id, 'userId', t.user_id));
  perform private.create_notification(f.user_id, 'Titularidade da mesa', coalesce(t.display_name, 'O convidado') || ' agora é o titular. Você pode sair quando quiser.',
    'system', s.id, null, jsonb_build_object('kind', 'host_transfer_accepted', 'table_session_id', s.id));
  return jsonb_build_object('accepted', true);
end $$;

revoke all on function public.customer_list_host_candidates(uuid) from public, anon;
revoke all on function public.customer_offer_host_transfer(uuid, uuid) from public, anon;
revoke all on function public.customer_pending_host_transfer(uuid) from public, anon;
revoke all on function public.customer_respond_host_transfer(uuid, boolean) from public, anon;
grant execute on function public.customer_list_host_candidates(uuid) to authenticated;
grant execute on function public.customer_offer_host_transfer(uuid, uuid) to authenticated;
grant execute on function public.customer_pending_host_transfer(uuid) to authenticated;
grant execute on function public.customer_respond_host_transfer(uuid, boolean) to authenticated;

-- 3. Gorjeta alta pede confirmação, e o servidor diz quais meios cabem no valor.
create or replace function private.quote_flags(p_amount bigint, p_tip bigint, p_total bigint)
returns jsonb language sql stable security definer set search_path = private, pg_temp as $$
  select jsonb_build_object(
    'confirmTip', p_tip > 0 and p_tip * 10000 > p_amount * b.tip_confirm_above_bps,
    'cardAvailable', p_total >= b.min_online_charge_cents,
    'pixAvailable', p_total >= b.min_pix_charge_cents)
  from private.noowe_billing_settings b
$$;
revoke all on function private.quote_flags(bigint, bigint, bigint) from public, anon, authenticated;

create or replace function public.customer_tip_quote(p_amount_cents bigint, p_tip_bps integer default 0, p_tip_cents bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_tip bigint;
begin
  if p_amount_cents is null or p_amount_cents < 0 or coalesce(p_tip_bps, 0) < 0 or coalesce(p_tip_cents, 0) < 0 then
    raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_tip := coalesce(nullif(p_tip_cents, 0), div(p_amount_cents * coalesce(p_tip_bps, 0) + 5000, 10000)::bigint);
  return jsonb_build_object('tipCents', v_tip, 'totalCents', p_amount_cents + v_tip) || private.quote_flags(p_amount_cents, v_tip, p_amount_cents + v_tip);
end $$;

create or replace function public.customer_checkout_quote(p_restaurant_id uuid, p_amount_cents bigint, p_scheduled boolean default false, p_tip_bps integer default 0, p_tip_cents bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_conv bigint := 0; v_quote jsonb; v_total bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not coalesce((select convenience_absorbed from public.restaurants where id = p_restaurant_id), false) then
    v_conv := private.convenience_fee_cents(p_restaurant_id, case when p_scheduled then 'scheduled' else 'pickup' end);
  end if;
  v_quote := public.customer_tip_quote(p_amount_cents, p_tip_bps, p_tip_cents);
  v_total := (v_quote->>'totalCents')::bigint + v_conv;
  return v_quote || jsonb_build_object('convenienceCents', v_conv, 'totalCents', v_total)
    || private.quote_flags(p_amount_cents, (v_quote->>'tipCents')::bigint, v_total);
end $$;

-- Mínimo do app: o menor entre os meios (o servidor do pagamento confere o do meio escolhido no provedor).
create or replace function private.assert_online_minimum(p_amount bigint)
returns void language plpgsql stable security definer set search_path = private, pg_temp as $$
declare v_min bigint;
begin
  select least(min_online_charge_cents, min_pix_charge_cents) into v_min from private.noowe_billing_settings;
  if p_amount < coalesce(v_min, 0) then
    raise exception 'Valor abaixo do mínimo para pagar pelo app' using errcode = 'P0013', detail = coalesce(v_min, 0)::text;
  end if;
end $$;

-- 4. Cupom: o desconto é sempre dado, mesmo que zere a conta.
create or replace function private.coupon_discount_from(p public.promotions, p_base bigint, p_eligible bigint, p_unit bigint)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v bigint;
begin
  v := case p.discount_kind
    when 'percent' then div(p_eligible * p.discount_bps + 5000, 10000)::bigint
    when 'fixed' then p.discount_cents
    else coalesce(p_unit, 0) end;
  return least(greatest(coalesce(v, 0), 0), p_eligible, p_base);
end $$;

-- Parcela zerada pelo cupom existe e fica paga, sem cobrança.
alter table public.bill_shares drop constraint bill_shares_amount_cents_check;
alter table public.bill_shares add constraint bill_shares_amount_cents_check
  check (amount_cents >= 0 and (amount_cents > 0 or tip_cents > 0 or coupon_discount_cents > 0));

create or replace function private.share_paid_with_coupon(p_share uuid)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares;
begin
  select * into s from public.bill_shares where id = p_share for update;
  if s.id is null or s.status <> 'open' or s.amount_cents <> 0 or s.tip_cents <> 0 or s.coupon_discount_cents = 0 then return false; end if;
  update public.bill_shares set status = 'paid', paid_at = now(), updated_at = now() where id = s.id;
  perform private.log_system_audit(s.restaurant_id, 'bill.paid_with_coupon', 'table_session', s.table_session_id, 'Pago com cupom',
    null, jsonb_build_object('shareId', s.id, 'discountCents', s.coupon_discount_cents));
  perform private.close_session_if_settled(s.table_session_id);
  return true;
end $$;
revoke all on function private.share_paid_with_coupon(uuid) from public, anon, authenticated;

create or replace function private.share_set_coupon(p_share uuid, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_disc bigint; v_bps integer; v_fee bigint; v_amount bigint;
begin
  select * into s from public.bill_shares where id = p_share for update;
  v_disc := case when p.id is null then 0 else private.coupon_discount_cents(p, s.table_session_id, null, s.base_cents, p_share) end;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_fee := case when s.fee_waived_at is not null then 0 else private.service_fee_cents(s.base_cents - v_disc, v_bps) end;
  v_amount := s.base_cents - v_disc + v_fee;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where bill_share_id = p_share and status = 'reserved';
  -- A gorjeta já escolhida acompanha o novo valor, sem passar dele.
  update public.bill_shares set coupon_id = p.id, coupon_discount_cents = v_disc, service_fee_cents = v_fee, amount_cents = v_amount,
      tip_cents = case when v_amount > 0 then least(tip_cents, v_amount) else 0 end, updated_at = now() where id = p_share;
  if p.id is not null and v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (p.id, p_user, s.table_session_id, p_share, v_disc, 'reserved');
  end if;
  -- Cupom que zera a parcela: "Pago com cupom", sem cobrança.
  if v_amount = 0 then perform private.share_paid_with_coupon(p_share); end if;
  return v_disc;
end $$;

-- Pedido (Quick) zerado pelo cupom: pago com cupom, e segue para o preparo como qualquer pedido pago.
create or replace function private.coupon_order_set(p_order public.orders, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_gross bigint := p_order.total_cents + p_order.coupon_discount_cents; v_disc bigint; v_mode text; o public.orders;
begin
  v_disc := case when p.id is null then 0 else private.coupon_discount_cents(p, null, p_order.id, v_gross) end;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = p_order.id and status = 'reserved';
  update public.orders set coupon_id = p.id, coupon_discount_cents = v_disc, total_cents = v_gross - v_disc,
      discount_cents = coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc,
      discount_amount = (coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc)::numeric / 100,
      total_amount = (v_gross - v_disc)::numeric / 100, updated_at = now()
    where id = p_order.id returning * into o;
  if p.id is not null and v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, order_id, discount_cents, status) values (p.id, p_user, p_order.id, v_disc, 'reserved');
  end if;
  if o.total_cents = 0 and v_disc > 0 and o.payment_status is distinct from 'confirmed'
     and not exists (select 1 from public.gateway_transactions g where g.order_id = o.id and g.status in ('pending', 'completed')) then
    perform set_config('noowe.status_actor', 'system', true);
    update public.orders set payment_status = 'confirmed', updated_at = now() where id = o.id returning * into o;
    if o.service_model = 'quick_service' then
      select accept_mode into v_mode from public.restaurant_model_policies where restaurant_id = o.restaurant_id and service_model = 'quick_service';
      if v_mode = 'auto' then update public.orders set fulfillment_status = 'accepted', updated_at = now() where id = o.id; end if;
    end if;
    perform set_config('noowe.status_actor', '', true);
    perform private.log_system_audit(o.restaurant_id, 'order.paid_with_coupon', 'order', o.id, 'Pago com cupom', null, jsonb_build_object('discountCents', v_disc));
  end if;
  return v_disc;
end $$;
