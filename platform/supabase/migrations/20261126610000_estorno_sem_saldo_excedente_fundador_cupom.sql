-- Decisões do QA de 26/11, item 4 (RV-04, RV-06, RV-08) e item 6 (SG-04).

-- ---------------------------------------------------------------------------
-- RV-04: Pix sem saldo para o estorno vira tarefa do Dono/Gerente; fecha sozinha quando o estorno sai.
insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority) values
  ('payment.refund_no_balance', 'action', '{manager,owner}', false, 'always', 1)
on conflict do nothing;

create or replace function private.refund_no_balance_task()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_key text := 'refund_no_balance:' || new.id; v_customer text;
begin
  if new.status = 'awaiting_balance' and old.status is distinct from 'awaiting_balance' then
    select coalesce(nullif(btrim(p.full_name), ''), 'cliente') into v_customer
      from public.gateway_transactions g left join public.profiles p on p.id = g.customer_id where g.id = new.gateway_transaction_id;
    perform private.emit_event(new.restaurant_id, 'payment.refund_no_balance', v_key, 'payment_refund', new.id, jsonb_build_object(
      'title', 'Devolver ' || private.format_brl(new.amount_cents::bigint) || ' por Pix',
      'detail', 'Sem saldo na conta Asaas para devolver a ' || coalesce(v_customer, 'cliente') || '. Motivo: ' || coalesce(new.reason, 'estorno')
        || '. Coloque saldo na conta: o app tenta de novo e fecha esta tarefa quando o dinheiro sair.',
      'dedupeKey', v_key, 'amountCents', new.amount_cents, 'customer', v_customer, 'reason', new.reason));
  elsif new.status in ('sent', 'done') and old.status is distinct from new.status then
    update public.staff_tasks set status = 'done', completed_at = clock_timestamp(), updated_at = clock_timestamp()
      where restaurant_id = new.restaurant_id and dedupe_key = v_key and status = 'open';
  end if;
  return new;
end $$;
revoke all on function private.refund_no_balance_task() from public, anon, authenticated;

drop trigger if exists payment_refunds_no_balance_task on public.payment_refunds;
create trigger payment_refunds_no_balance_task after update of status on public.payment_refunds
  for each row execute function private.refund_no_balance_task();

-- ---------------------------------------------------------------------------
-- RV-06: o excedente do mês entra na fatura do mês seguinte (a de renovação), não em fatura própria.
-- Se essa fatura já saiu e não foi paga, ela é refeita com a linha do excedente. Fatura própria só sobra
-- quando não há fatura do mês para receber a linha: já paga, último mês antes do cancelamento, ou anual.
drop function if exists private.subscription_invoice_next(uuid);
create or replace function private.subscription_invoice_next(p_restaurant uuid, p_overage_cents bigint default 0)
 returns void language plpgsql security definer set search_path to 'public', 'private', 'pg_temp' as $function$
declare s public.restaurant_subscriptions; v_plan text; v_cycle text; v_to timestamptz; v_price bigint; v_name text; v_due timestamptz; v_old uuid;
begin
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant for update;
  if s.restaurant_id is null or s.status = 'canceled' or s.cancel_requested_at is not null or s.renewal_invoiced_for = s.current_period_end then return; end if;
  if s.renewal_invoiced_for is not null then
    for v_old in select id from public.subscription_invoices where restaurant_id = p_restaurant and kind in ('renewal', 'upgrade')
        and period_start = s.renewal_invoiced_for and status in ('open', 'overdue') loop
      perform private.invoice_void(v_old, 'O período mudou antes do vencimento');
    end loop;
  end if;
  v_plan := coalesce(s.next_plan_code, s.plan_code);
  v_cycle := coalesce(s.next_billing_cycle, s.billing_cycle);
  v_to := s.current_period_end + case when v_cycle = 'annual' then interval '1 year' else interval '1 month' end;
  v_price := coalesce(private.plan_period_price(s.restaurant_id, v_plan, v_cycle), 0);
  select name into v_name from private.noowe_plans where code = v_plan;
  v_due := case when s.current_period_end > now() + interval '1 day' then s.current_period_end end;
  update public.restaurant_subscriptions set renewal_invoiced_for = s.current_period_end, renewal_plan_code = v_plan, renewal_billing_cycle = v_cycle, updated_at = now()
    where restaurant_id = s.restaurant_id;
  perform private.invoice_create(s.restaurant_id, 'renewal', s.current_period_end, v_to, v_price,
    'Plano ' || coalesce(v_name, v_plan) || case when v_cycle = 'annual' then ' (anual)' else ' (mensal)' end,
    coalesce(p_overage_cents, 0), 'Pedidos acima da franquia', v_due);
end $function$;
revoke all on function private.subscription_invoice_next(uuid, bigint) from public, anon, authenticated;

create or replace function private.subscription_renew(s restaurant_subscriptions)
 returns void language plpgsql security definer set search_path to 'public', 'private', 'pg_temp' as $function$
declare v_over bigint := 0; n public.restaurant_subscriptions; v_inv public.subscription_invoices;
begin
  if s.status <> 'trial' and s.billing_cycle = 'monthly' then
    v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, private.plan_orders_used(s.restaurant_id, s.current_period_start, s.current_period_end));
  end if;
  if v_over > 0 then
    select * into v_inv from public.subscription_invoices x where x.restaurant_id = s.restaurant_id and x.kind = 'renewal'
      and x.period_start = s.current_period_end and x.status in ('open', 'overdue', 'paid') order by x.created_at desc limit 1;
    if v_inv.id is not null and v_inv.status = 'paid' then
      -- O Dono já pagou o mês: não há fatura aberta para a linha.
      perform private.invoice_create(s.restaurant_id, 'overage', s.current_period_start, s.current_period_end, 0, null, v_over, 'Pedidos acima da franquia');
      v_over := 0;
    elsif v_inv.id is not null then
      -- Refaz a fatura do mês com o excedente: a anterior é anulada e a nova nasce com as duas linhas.
      update public.restaurant_subscriptions set renewal_invoiced_for = null where restaurant_id = s.restaurant_id;
      perform private.invoice_void(v_inv.id, 'Refeita com o excedente do mês');
    end if;
  end if;
  perform private.subscription_invoice_next(s.restaurant_id, v_over);
  select * into n from public.restaurant_subscriptions where restaurant_id = s.restaurant_id;
  update public.restaurant_subscriptions set plan_code = n.renewal_plan_code, billing_cycle = n.renewal_billing_cycle,
      -- Mudança feita depois da fatura gerada fica para o período seguinte.
      next_plan_code = case when n.next_plan_code is distinct from n.renewal_plan_code then n.next_plan_code end,
      next_billing_cycle = case when n.next_billing_cycle is distinct from n.renewal_billing_cycle then n.next_billing_cycle end,
      status = 'active', current_period_start = n.current_period_end,
      current_period_end = n.current_period_end + case when n.renewal_billing_cycle = 'annual' then interval '1 year' else interval '1 month' end,
      trial_ends_at = null, renewal_notified_for = null, last_overage_billed_at = null, updated_at = now()
    where restaurant_id = s.restaurant_id;
end $function$;

-- ---------------------------------------------------------------------------
-- RV-08: validade em dias e limite de restaurantes do código, como parâmetro. FUNDADOR: 90 dias, 100 restaurantes.
alter table private.noowe_promo_codes add column if not exists validity_days integer check (validity_days > 0);

-- Regra única da validade: valid_until explícito, senão valid_from + validity_days.
create or replace function private.promo_code_expires_at(c private.noowe_promo_codes)
returns timestamptz language sql immutable as $$
  select coalesce(c.valid_until, c.valid_from + make_interval(days => c.validity_days)) $$;
revoke all on function private.promo_code_expires_at(private.noowe_promo_codes) from public, anon, authenticated;

do $$
begin
  perform set_config('noowe.param_author', 'migration: decisões do QA, 26/11/2026 (RV-08)', true);
  update private.noowe_promo_codes set validity_days = 90, max_uses = 100, valid_from = coalesce(valid_from, now()) where code = 'FUNDADOR';
end $$;

create or replace function public.restaurant_apply_promo_code(p_restaurant_id uuid, p_code text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'private', 'pg_temp' as $function$
declare c private.noowe_promo_codes; s public.restaurant_subscriptions; v_code text := upper(btrim(coalesce(p_code, ''))); v_used integer; r private.noowe_promo_redemptions;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into c from private.noowe_promo_codes where code = v_code and is_active for update;
  if c.code is null then raise exception 'Código inválido' using errcode = 'P0016'; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant_id and code = v_code;
  if r.id is not null then return public.restaurant_get_plan_summary(p_restaurant_id); end if;
  if exists (select 1 from private.noowe_promo_redemptions x where x.restaurant_id = p_restaurant_id and x.status = 'active') then
    raise exception 'Já há um código em uso neste restaurante' using errcode = 'P0016'; end if;
  if c.valid_from is not null and now() < c.valid_from then
    raise exception 'Este código ainda não está valendo' using errcode = 'P0016'; end if;
  if now() > private.promo_code_expires_at(c) then
    raise exception 'Este código venceu em %', to_char(private.promo_code_expires_at(c) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = 'P0016'; end if;
  select count(*) into v_used from private.noowe_promo_redemptions where code = v_code;
  if c.max_uses is not null and v_used >= c.max_uses then
    raise exception 'Este código já chegou ao limite de % restaurantes', c.max_uses using errcode = 'P0016'; end if;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is null or s.status = 'canceled' then raise exception 'Escolha um plano primeiro' using errcode = 'P0016'; end if;
  if c.plan_codes is not null and cardinality(c.plan_codes) > 0 and not s.plan_code = any(c.plan_codes) then raise exception 'Este código não vale para o seu plano' using errcode = 'P0016'; end if;
  if (s.billing_cycle = 'monthly' and not c.allow_monthly) or (s.billing_cycle = 'annual' and not c.allow_annual) then
    raise exception 'Este código não vale para este ciclo de cobrança' using errcode = 'P0016'; end if;
  if c.new_restaurants_only and exists (select 1 from public.subscription_invoices i where i.restaurant_id = p_restaurant_id) then
    raise exception 'Este código é só para restaurantes novos' using errcode = 'P0016'; end if;
  insert into private.noowe_promo_redemptions(restaurant_id, code, applied_by, started_at)
    values (p_restaurant_id, v_code, auth.uid(), case when s.status <> 'trial' or c.skips_trial then now() end) returning * into r;
  if c.grants_category is not null then update public.restaurants set noowe_category = c.grants_category where id = p_restaurant_id; end if;
  perform private.log_audit(p_restaurant_id, 'plan.promo_applied', 'restaurant_subscription', p_restaurant_id, 'Código promocional aplicado', null, jsonb_build_object('code', v_code));
  -- Código de fundador dispensa o teste: a primeira fatura já sai, com o benefício.
  if c.skips_trial and s.status = 'trial' then
    update public.restaurant_subscriptions set current_period_end = now() where restaurant_id = p_restaurant_id returning * into s;
    perform private.subscription_renew(s);
  end if;
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $function$;

-- ---------------------------------------------------------------------------
-- SG-04: cupom de grupo (VIP, novos, aniversariantes, inativos) só é legível por quem está no grupo.
-- Cupom oculto (is_visible = false) já ficava fora; o de grupo ficava visível a qualquer conta.
create or replace function private.coupon_audience_is_me(p_restaurant uuid, p_audience text, p_inactive_days integer)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.customer_in_group(p_restaurant, auth.uid(), p_audience, p_inactive_days) $$;
revoke all on function private.coupon_audience_is_me(uuid, text, integer) from public;
grant execute on function private.coupon_audience_is_me(uuid, text, integer) to anon, authenticated;

drop policy if exists promotions_customer_active on public.promotions;
create policy promotions_customer_active on public.promotions for select using (
  is_visible and discount_kind is not null and status = 'active' and valid_from <= now() and valid_until >= now()
  and (audience = 'all' or private.coupon_audience_is_me(restaurant_id, audience, inactive_days)));
