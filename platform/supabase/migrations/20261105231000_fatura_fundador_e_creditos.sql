-- Fatura da assinatura (respostas 26, 65 e 66 de 05/11/2026).
--  26: fundador com 12 meses grátis e depois 50% vitalício, por unidade, enquanto ativo e em dia. A NOOWE desliga o benefício
--      por restaurante nos parâmetros, e a próxima fatura já sai sem o desconto.
--  65: código ativo não gera créditos, e créditos não entram na fatura com código. Créditos nunca levam a fatura abaixo de 70% da
--      tabela. "Ajuste de taxa NOOWE Pay" e "Ajuste de estorno" são reembolsos: ficam fora do piso, em linhas próprias.
--  66: fatura gerada 7 dias antes do vencimento, que cai no aniversário da assinatura.

-- 1. Parâmetros novos.
alter table private.noowe_credit_settings add column invoice_floor_bps integer not null default 7000 check (invoice_floor_bps between 0 and 10000);
alter table private.noowe_billing_settings add column invoice_lead_days integer not null default 7 check (invoice_lead_days >= 0);

-- Fase sem duração é vitalícia: vale do mês em que começa até o fim do benefício. Só faz sentido como última fase.
alter table private.noowe_promo_code_phases drop constraint noowe_promo_code_phases_duration_months_check, alter column duration_months drop not null;
alter table private.noowe_promo_code_phases add constraint noowe_promo_code_phases_duration_months_check check (duration_months is null or duration_months > 0);

-- Benefício de fundador ativo: sim/não, por restaurante. Sem linha, vale "sim".
create table private.noowe_founder_benefit (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  active boolean not null,
  note text
);
alter table private.noowe_founder_benefit enable row level security;
revoke all on private.noowe_founder_benefit from public, anon, authenticated, service_role;
create trigger trg_noowe_founder_benefit_history after insert or update or delete on private.noowe_founder_benefit
  for each row execute function private.noowe_param_record_change();
create trigger trg_noowe_founder_benefit_no_truncate before truncate on private.noowe_founder_benefit
  for each statement execute function private.noowe_param_refuse_truncate();

-- Quando o código acabou: os créditos voltam no mês seguinte.
alter table private.noowe_promo_redemptions add column ended_at timestamptz;
update private.noowe_promo_redemptions set ended_at = now() where status = 'ended';
create or replace function private.promo_redemption_mark_end()
returns trigger language plpgsql set search_path = private, pg_temp as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then new.ended_at := coalesce(new.ended_at, now()); end if;
  return new;
end $$;
create trigger trg_promo_redemption_end before update of status on private.noowe_promo_redemptions
  for each row execute function private.promo_redemption_mark_end();

alter table public.subscription_invoice_lines drop constraint subscription_invoice_lines_kind_check;
alter table public.subscription_invoice_lines add constraint subscription_invoice_lines_kind_check
  check (kind in ('plan', 'overage', 'upgrade', 'fee_adjustment', 'refund_adjustment', 'credit', 'promo', 'module'));

-- A fatura do próximo período nasce antes da virada: guarda o plano e o ciclo que ela cobrou.
alter table public.restaurant_subscriptions
  add column renewal_invoiced_for timestamptz,
  add column renewal_plan_code text,
  add column renewal_billing_cycle text check (renewal_billing_cycle in ('monthly', 'annual'));

-- 2. Código de fundador, desligado: a equipe NOOWE define validade e limite de usos e liga.
do $$
begin
  perform set_config('noowe.param_author', 'migration: respostas do Pedro, 05/11/2026', true);
  insert into private.noowe_promo_codes(code, kind, duration_months, skips_trial, grants_category, is_active)
    values ('FUNDADOR', 'free_months', 12, true, 'Parceiro Fundador', false)
    on conflict (code) do nothing;
  insert into private.noowe_promo_code_phases(code, phase_order, kind, duration_months, percent_off_bps) values
    ('FUNDADOR', 1, 'free_months', 12, null),
    ('FUNDADOR', 2, 'percent_off', null, 5000)
    on conflict (code, phase_order) do nothing;
end $$;

-- 3. Fases: a vitalícia não tem fim.
create or replace function private.promo_phases(p_code text)
returns table(phase_order integer, kind text, duration_months integer, percent_off_bps integer, amount_off_cents bigint, starts_month integer)
language sql stable security definer set search_path = private, pg_temp as $$
  with raw as (
    select f.phase_order, f.kind, f.duration_months, f.percent_off_bps, f.amount_off_cents from private.noowe_promo_code_phases f where f.code = p_code
    union all
    select 1, c.kind, c.duration_months, c.percent_off_bps, c.amount_off_cents from private.noowe_promo_codes c
      where c.code = p_code and not exists (select 1 from private.noowe_promo_code_phases f where f.code = p_code))
  select r.phase_order, r.kind, r.duration_months, r.percent_off_bps, r.amount_off_cents,
    (coalesce(sum(r.duration_months) over (order by r.phase_order rows between unbounded preceding and 1 preceding), 0))::integer
  from raw r order by r.phase_order
$$;

create or replace function private.promo_phase_at(p_code text, p_month integer)
returns table(kind text, percent_off_bps integer, amount_off_cents bigint)
language sql stable security definer set search_path = private, pg_temp as $$
  select f.kind, f.percent_off_bps, f.amount_off_cents from private.promo_phases(p_code) f
  where p_month >= f.starts_month and (f.duration_months is null or p_month < f.starts_month + f.duration_months)
  order by f.phase_order limit 1
$$;

-- Total de meses do código; nulo quando há fase vitalícia.
create or replace function private.promo_total_months(p_code text)
returns integer language sql stable security definer set search_path = private, pg_temp as $$
  select case when bool_or(duration_months is null) then null else coalesce(sum(duration_months), 0)::integer end from private.promo_phases(p_code)
$$;
revoke all on function private.promo_total_months(text) from public, anon, authenticated, service_role;

create or replace function private.promo_status(p_restaurant uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; v_months integer; v_plan text; v_cycle text;
begin
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active';
  if r.id is null then return null; end if;
  v_months := private.promo_total_months(r.code);
  select plan_code, billing_cycle into v_plan, v_cycle from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  return jsonb_build_object('code', r.code,
    'endsAt', case when r.started_at is not null and v_months is not null then r.started_at + make_interval(months => v_months) end,
    'lifetime', v_months is null,
    'startsWithFirstInvoice', r.started_at is null,
    'priceAfterCents', private.plan_period_price(p_restaurant, v_plan, v_cycle));
end $$;

-- Código ativo em algum momento do mês: nesse mês não há crédito.
create or replace function private.promo_active_during(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select exists (select 1 from private.noowe_promo_redemptions r where r.restaurant_id = p_restaurant
    and r.started_at is not null and r.started_at < p_to and (r.status = 'active' or r.ended_at >= p_from))
$$;
revoke all on function private.promo_active_during(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- 4. Desconto do código na fatura.
create or replace function private.invoice_apply_promo(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; c private.noowe_promo_codes; s public.restaurant_subscriptions; inv public.subscription_invoices; f record;
  v bigint := 0; v_total_months integer; v_months integer; v_unit bigint; v_month_cents bigint; k integer; v_plan text; v_cycle text;
begin
  if p_plan_cents <= 0 then return 0; end if;
  select * into inv from public.subscription_invoices where id = p_invoice;
  if inv.kind <> 'renewal' then return 0; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active' for update;
  if r.id is null then return 0; end if;
  select * into c from private.noowe_promo_codes where code = r.code;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  -- A fatura do próximo período nasce antes da virada: plano e ciclo são os que ela cobra.
  v_plan := case when s.renewal_invoiced_for = inv.period_start then s.renewal_plan_code else s.plan_code end;
  v_cycle := case when s.renewal_invoiced_for = inv.period_start then s.renewal_billing_cycle else s.billing_cycle end;
  -- A NOOWE desligou o benefício (contrapartidas descumpridas): acaba agora, e esta fatura já sai sem o desconto.
  if exists (select 1 from private.noowe_founder_benefit b where b.restaurant_id = p_restaurant and not b.active) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
    perform private.log_system_audit(p_restaurant, 'plan.promo_ended', 'restaurant_subscription', p_restaurant, 'Benefício desativado pela NOOWE', null, jsonb_build_object('code', r.code));
    perform private.notify_owner(p_restaurant, 'Benefício encerrado', 'O desconto do código ' || r.code || ' foi encerrado pela NOOWE.', 'plan_promo_ended');
    return 0;
  end if;
  -- Trocou de plano ou de ciclo para um que o código não cobre: o benefício acaba, e o Dono é avisado.
  if (c.plan_codes is not null and cardinality(c.plan_codes) > 0 and not v_plan = any(c.plan_codes))
     or (v_cycle = 'monthly' and not c.allow_monthly) or (v_cycle = 'annual' and not c.allow_annual) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
    perform private.log_system_audit(p_restaurant, 'plan.promo_ended', 'restaurant_subscription', p_restaurant, 'O código não vale para este plano ou ciclo', null, jsonb_build_object('code', r.code, 'plan', v_plan, 'cycle', v_cycle));
    perform private.notify_owner(p_restaurant, 'Código promocional encerrado', 'O código ' || r.code || ' não vale para o plano ou ciclo atual.', 'plan_promo_ended');
    return 0;
  end if;
  -- Vale enquanto o restaurante está em dia: com fatura atrasada, este período sai sem desconto, e o benefício não anda.
  if s.status = 'past_due' then return 0; end if;
  if r.started_at is null then update private.noowe_promo_redemptions set started_at = now() where id = r.id returning * into r; end if;
  -- Cada mês do período na fase dele: no anual, um mês grátis é um doze avos da fatura, e não ela inteira.
  v_months := case when v_cycle = 'annual' then 12 else 1 end;
  v_unit := div(p_plan_cents, v_months)::bigint;
  for k in 0 .. v_months - 1 loop
    v_month_cents := case when k = v_months - 1 then p_plan_cents - v_unit * (v_months - 1) else v_unit end;
    select * into f from private.promo_phase_at(r.code, r.months_billed + k);
    if f.kind is not null then
      v := v + case f.kind when 'free_months' then v_month_cents
        when 'percent_off' then div(v_month_cents * f.percent_off_bps + 5000, 10000)::bigint
        else least(v_month_cents, f.amount_off_cents) end;
    end if;
  end loop;
  v_total_months := private.promo_total_months(r.code);
  update private.noowe_promo_redemptions set months_billed = months_billed + v_months,
      status = case when v_total_months is not null and months_billed + v_months >= v_total_months then 'ended' else status end where id = r.id;
  if v > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'promo', 'Desconto do código ' || r.code, -v);
  end if;
  return v;
end $$;

-- 5. Créditos: nunca com código, e nunca abaixo do piso sobre a tabela.
drop function private.invoice_apply_credits(uuid, uuid, bigint);
create or replace function private.invoice_credit_room(p_plan_cents bigint)
returns bigint language sql stable security definer set search_path = private, pg_temp as $$
  select least(div(p_plan_cents * cfg.invoice_cap_bps, 10000)::bigint,
    greatest(p_plan_cents - greatest(cfg.min_invoice_cents, div(p_plan_cents * cfg.invoice_floor_bps + 9999, 10000)::bigint), 0))
  from private.noowe_credit_settings cfg
$$;
revoke all on function private.invoice_credit_room(bigint) from public, anon, authenticated, service_role;

create or replace function private.invoice_apply_credits(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint, p_promo_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_left bigint; v_used bigint := 0; v_take bigint; l private.noowe_credit_lots; v_kind text;
begin
  if p_plan_cents <= 0 or p_promo_cents > 0 then return 0; end if;
  if exists (select 1 from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active' and started_at is not null) then return 0; end if;
  select kind into v_kind from public.subscription_invoices where id = p_invoice;
  if v_kind <> 'renewal' then return 0; end if;
  v_left := private.invoice_credit_room(p_plan_cents);
  for l in select * from private.noowe_credit_lots where restaurant_id = p_restaurant and remaining_cents > 0
      and available_from <= (now() at time zone 'America/Sao_Paulo')::date and expires_at > (now() at time zone 'America/Sao_Paulo')::date order by expires_at, created_at for update loop
    exit when v_left <= 0;
    v_take := least(v_left, l.remaining_cents);
    update private.noowe_credit_lots set remaining_cents = remaining_cents - v_take where id = l.id;
    insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents, invoice_id) values (p_restaurant, l.id, 'used', -v_take, p_invoice);
    v_left := v_left - v_take;
    v_used := v_used + v_take;
  end loop;
  if v_used > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'credit', 'Créditos NOOWE Pay', -v_used);
  end if;
  return v_used;
end $$;
revoke all on function private.invoice_apply_credits(uuid, uuid, bigint, bigint) from public, anon, authenticated;

-- 6. Ajustes: reembolsos, fora do piso, cada um na própria linha. O que sobra segue para a próxima fatura.
create or replace function private.invoice_apply_compensations(p_invoice uuid, p_restaurant uuid, p_base bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare c record; v_left bigint := p_base; v_take bigint; v_owed bigint := 0; v_fee bigint := 0; v_refund bigint := 0;
begin
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind = 'fee_kept_on_refund' for update loop
    v_owed := v_owed + c.amount_cents;
    update private.noowe_pay_compensations set status = 'invoiced', applied_cents = amount_cents, invoice_id = p_invoice where id = c.id;
  end loop;
  v_left := v_left + v_owed;
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind <> 'fee_kept_on_refund' order by created_at for update loop
    exit when v_left <= 0;
    v_take := least(v_left, c.amount_cents - c.applied_cents);
    v_left := v_left - v_take;
    if c.kind = 'tariff_on_refund' then v_refund := v_refund + v_take; else v_fee := v_fee + v_take; end if;
    update private.noowe_pay_compensations set applied_cents = applied_cents + v_take, invoice_id = p_invoice,
        status = case when applied_cents + v_take >= amount_cents then 'invoiced' else 'open' end where id = c.id;
  end loop;
  if v_owed - v_fee <> 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'fee_adjustment', 'Ajuste de taxa NOOWE Pay', v_owed - v_fee);
  end if;
  if v_refund > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'refund_adjustment', 'Ajuste de estorno', -v_refund);
  end if;
  return v_left;
end $$;

-- 7. Fatura: vencimento informado por quem cria; sem ele, o prazo padrão.
drop function private.invoice_create(uuid, text, timestamptz, timestamptz, bigint, text, bigint, text);
create or replace function private.invoice_create(p_restaurant uuid, p_kind text, p_from timestamptz, p_to timestamptz, p_plan_cents bigint, p_plan_label text,
  p_extra_cents bigint default 0, p_extra_label text default null, p_due_at timestamptz default null)
returns public.subscription_invoices language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; v_total bigint; v_promo bigint := 0; v_credit bigint := 0; v_sub bigint := coalesce(p_plan_cents, 0) + coalesce(p_extra_cents, 0);
begin
  insert into public.subscription_invoices(restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, due_at)
    values (p_restaurant, p_kind, p_from, p_to, v_sub, 0,
      coalesce(p_due_at, now() + make_interval(days => (select invoice_due_days from private.noowe_billing_settings)))) returning * into i;
  if coalesce(p_plan_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, case when p_kind = 'upgrade' then 'upgrade' else 'plan' end, p_plan_label, p_plan_cents);
  end if;
  if coalesce(p_extra_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, 'overage', p_extra_label, p_extra_cents);
  end if;
  -- Ordem: código; créditos só sem código; e por fim os ajustes, fora do piso.
  v_promo := private.invoice_apply_promo(i.id, p_restaurant, coalesce(p_plan_cents, 0));
  v_credit := private.invoice_apply_credits(i.id, p_restaurant, coalesce(p_plan_cents, 0), v_promo);
  v_total := private.invoice_apply_compensations(i.id, p_restaurant, v_sub - v_promo - v_credit);
  update public.subscription_invoices set total_cents = greatest(v_total, 0),
      status = case when v_total <= 0 then 'paid' else 'open' end, paid_at = case when v_total <= 0 then now() end
    where id = i.id returning * into i;
  if i.status = 'open' then perform private.invoice_post(i.id); end if;
  return i;
end $$;
revoke all on function private.invoice_create(uuid, text, timestamptz, timestamptz, bigint, text, bigint, text, timestamptz) from public, anon, authenticated;

-- 8. Fatura do próximo período, antes da virada. Vence no aniversário; se já passou, no prazo padrão.
create or replace function private.subscription_invoice_next(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; v_plan text; v_cycle text; v_to timestamptz; v_price bigint; v_name text; v_due timestamptz;
begin
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant for update;
  if s.restaurant_id is null or s.status = 'canceled' or s.cancel_requested_at is not null or s.renewal_invoiced_for = s.current_period_end then return; end if;
  v_plan := coalesce(s.next_plan_code, s.plan_code);
  v_cycle := coalesce(s.next_billing_cycle, s.billing_cycle);
  v_to := s.current_period_end + case when v_cycle = 'annual' then interval '1 year' else interval '1 month' end;
  v_price := coalesce(private.plan_period_price(s.restaurant_id, v_plan, v_cycle), 0);
  select name into v_name from private.noowe_plans where code = v_plan;
  v_due := case when s.current_period_end > now() + interval '1 day' then s.current_period_end end;
  update public.restaurant_subscriptions set renewal_invoiced_for = s.current_period_end, renewal_plan_code = v_plan, renewal_billing_cycle = v_cycle, updated_at = now()
    where restaurant_id = s.restaurant_id;
  perform private.invoice_create(s.restaurant_id, 'renewal', s.current_period_end, v_to, v_price,
    'Plano ' || coalesce(v_name, v_plan) || case when v_cycle = 'annual' then ' (anual)' else ' (mensal)' end, 0, null, v_due);
end $$;
revoke all on function private.subscription_invoice_next(uuid) from public, anon, authenticated;

-- Virada do período: o excedente do mês que terminou vem em fatura própria, e o novo período usa o plano já faturado.
create or replace function private.subscription_renew(s public.restaurant_subscriptions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_over bigint := 0; n public.restaurant_subscriptions;
begin
  if s.status <> 'trial' and s.billing_cycle = 'monthly' then
    v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, private.plan_orders_used(s.restaurant_id, s.current_period_start, s.current_period_end));
    if v_over > 0 and not exists (select 1 from public.subscription_invoices x where x.restaurant_id = s.restaurant_id and x.kind = 'overage' and x.period_start = s.current_period_start) then
      perform private.invoice_create(s.restaurant_id, 'overage', s.current_period_start, s.current_period_end, 0, null, v_over, 'Pedidos acima da franquia');
    end if;
  end if;
  perform private.subscription_invoice_next(s.restaurant_id);
  select * into n from public.restaurant_subscriptions where restaurant_id = s.restaurant_id;
  update public.restaurant_subscriptions set plan_code = n.renewal_plan_code, billing_cycle = n.renewal_billing_cycle,
      -- Mudança feita depois da fatura gerada fica para o período seguinte.
      next_plan_code = case when n.next_plan_code is distinct from n.renewal_plan_code then n.next_plan_code end,
      next_billing_cycle = case when n.next_billing_cycle is distinct from n.renewal_billing_cycle then n.next_billing_cycle end,
      status = 'active', current_period_start = n.current_period_end,
      current_period_end = n.current_period_end + case when n.renewal_billing_cycle = 'annual' then interval '1 year' else interval '1 month' end,
      trial_ends_at = null, renewal_notified_for = null, last_overage_billed_at = null, updated_at = now()
    where restaurant_id = s.restaurant_id;
end $$;
revoke all on function private.subscription_renew(public.restaurant_subscriptions) from public, anon, authenticated;

-- 9. Varredura: gera a fatura do próximo período com antecedência.
create or replace function private.subscription_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; b private.noowe_billing_settings; i public.subscription_invoices; v_n integer := 0; v_used bigint; v_over bigint; v_month timestamptz; v_id uuid;
begin
  select * into b from private.noowe_billing_settings;
  for s in select * from public.restaurant_subscriptions where status <> 'canceled' loop
    begin
      if s.status = 'trial' and not s.trial_notified and s.trial_ends_at - make_interval(days => b.trial_notice_days) <= now() then
        perform private.notify_owner(s.restaurant_id, 'Seu teste está acabando', 'Em breve começa a cobrança do plano. Escolha a forma de pagamento em Módulos e plano.', 'plan_trial_ending');
        update public.restaurant_subscriptions set trial_notified = true where restaurant_id = s.restaurant_id;
      end if;
      -- No anual, excedente e módulos seguem mensais.
      if s.status <> 'trial' and s.billing_cycle = 'annual' then
        v_month := coalesce(s.last_overage_billed_at, s.current_period_start);
        if v_month + interval '1 month' <= now() then
          v_used := private.plan_orders_used(s.restaurant_id, v_month, v_month + interval '1 month');
          v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, v_used);
          update public.restaurant_subscriptions set last_overage_billed_at = v_month + interval '1 month' where restaurant_id = s.restaurant_id;
          if v_over > 0 and not exists (select 1 from public.subscription_invoices x where x.restaurant_id = s.restaurant_id and x.kind = 'overage' and x.period_start = v_month) then
            perform private.invoice_create(s.restaurant_id, 'overage', v_month, v_month + interval '1 month', 0, null, v_over, 'Pedidos acima da franquia');
          end if;
        end if;
      end if;
      if s.status <> 'trial' and s.current_period_end - make_interval(days => b.renewal_notice_days) <= now() and s.renewal_notified_for is distinct from s.current_period_end and s.cancel_requested_at is null then
        perform private.notify_owner(s.restaurant_id, 'Renovação do plano', 'Seu plano renova em breve, no preço de tabela vigente.', 'plan_renewal_notice');
        update public.restaurant_subscriptions set renewal_notified_for = s.current_period_end where restaurant_id = s.restaurant_id;
      end if;
      -- A fatura do próximo período sai antes, com vencimento no aniversário (resposta 66).
      if s.cancel_requested_at is null and s.current_period_end > now() and s.renewal_invoiced_for is distinct from s.current_period_end
         and s.current_period_end - make_interval(days => b.invoice_lead_days) <= now() then
        perform private.subscription_invoice_next(s.restaurant_id);
      end if;
      if s.current_period_end <= now() then
        select * into s from public.restaurant_subscriptions where restaurant_id = s.restaurant_id;
        if s.cancel_requested_at is not null then
          -- O último mês também tem excedente, se houve.
          if s.billing_cycle = 'monthly' and s.status <> 'trial' then
            v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, private.plan_orders_used(s.restaurant_id, s.current_period_start, s.current_period_end));
            if v_over > 0 and not exists (select 1 from public.subscription_invoices x where x.restaurant_id = s.restaurant_id and x.kind = 'overage' and x.period_start = s.current_period_start) then
              perform private.invoice_create(s.restaurant_id, 'overage', s.current_period_start, s.current_period_end, 0, null, v_over, 'Pedidos acima da franquia');
            end if;
          end if;
          update public.restaurant_subscriptions set status = 'canceled', canceled_at = now(), updated_at = now() where restaurant_id = s.restaurant_id;
          perform private.subscription_on_canceled(s.restaurant_id);
        else
          perform private.subscription_renew(s);
        end if;
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'assinatura %: %', s.restaurant_id, sqlerrm;
    end;
  end loop;
  -- Só vence o que virou cobrança: sem ela, o Dono não tem como pagar.
  for i in select * from public.subscription_invoices where status = 'open' and due_at < now() and provider_ref is not null loop
    update public.subscription_invoices set status = 'overdue' where id = i.id;
    perform private.notify_owner(i.restaurant_id, 'Fatura em atraso', 'Regularize para seguir aparecendo no app. Comandas abertas continuam normalmente.', 'plan_invoice_overdue', i.id);
  end loop;
  for v_id in select distinct restaurant_id from public.subscription_invoices where status = 'overdue'
      union select restaurant_id from private.restaurant_billing_flags where billing_hidden or orders_suspended
      union select r.id from public.restaurants r where r.plan_prompted_at is not null and not exists (select 1 from public.restaurant_subscriptions x where x.restaurant_id = r.id) loop
    perform private.subscription_apply_overdue(v_id);
  end loop;
  -- Fatura que ainda não chegou ao Asaas.
  -- Depois das primeiras tentativas, uma por dia: corrigir o CNPJ dias depois ainda gera a cobrança.
  for v_id in select id from public.subscription_invoices where status in ('open', 'overdue') and provider_ref is null
      and (claimed_at is null or claimed_at < now() - case when attempts < 6 then interval '10 minutes' else interval '1 day' end) limit 50 loop
    perform private.invoice_post(v_id);
  end loop;
  return v_n;
end $$;
revoke all on function private.subscription_tick() from public, anon, authenticated;

-- 10. Créditos do mês: nenhum enquanto houve código ativo no mês (resposta 65).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('private.credit_tick()'::regprocedure);
  if position('not private.promo_free_during(s.restaurant_id, v_from)' in v_def) = 0 then
    raise exception 'credit_tick mudou: revisar a troca da regra do código';
  end if;
  execute replace(v_def, 'not private.promo_free_during(s.restaurant_id, v_from)', 'not private.promo_active_during(s.restaurant_id, v_from, v_to)');
end $$;

-- 11. Cancelar depois da fatura do próximo período gerada: ela deixa de valer, e a cobrança no Asaas é cancelada.
create or replace function private.invoice_void(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare i public.subscription_invoices; v_url text; v_key text;
begin
  update public.subscription_invoices set status = 'void' where id = p_invoice and status in ('open', 'overdue') returning * into i;
  if i.id is null then return; end if;
  perform private.log_system_audit(i.restaurant_id, 'plan.invoice_void', 'subscription_invoice', i.id, p_reason, null, jsonb_build_object('totalCents', i.total_cents));
  if i.provider_ref is not null then
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
    if v_url is not null and v_key is not null then
      perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/billing-charge',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('invoiceId', i.id, 'action', 'cancel'));
    end if;
  end if;
end $$;
revoke all on function private.invoice_void(uuid, text) from public, anon, authenticated;

create or replace function public.service_invoice_cancel_ref(p_invoice_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select provider_ref from public.subscription_invoices where id = p_invoice_id and status = 'void'
$$;
revoke all on function public.service_invoice_cancel_ref(uuid) from public, anon, authenticated;
grant execute on function public.service_invoice_cancel_ref(uuid) to service_role;

-- Fatura cancelada não volta a valer se o pagamento chegar depois: fica registrado para a equipe devolver.
create or replace function public.service_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices;
begin
  select * into i from public.subscription_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  if i.status = 'paid' then return; end if;
  if i.status = 'void' then
    perform private.log_system_audit(i.restaurant_id, 'plan.void_invoice_paid', 'subscription_invoice', i.id, 'Pagamento de fatura cancelada: devolver ao restaurante', null, jsonb_build_object('totalCents', i.total_cents));
    return;
  end if;
  update public.subscription_invoices set status = 'paid', paid_at = now(), nfse_status = case when private.nfse_company_ready() then 'requested' else 'waiting_company_data' end where id = i.id;
  perform private.subscription_apply_overdue(i.restaurant_id);
end $$;
revoke all on function public.service_invoice_paid(uuid) from public, anon, authenticated;
grant execute on function public.service_invoice_paid(uuid) to service_role;

create or replace function public.restaurant_cancel_subscription(p_restaurant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; v_inv uuid;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  update public.restaurant_subscriptions set cancel_requested_at = now(), cancel_reason = btrim(p_reason), updated_at = now()
    where restaurant_id = p_restaurant_id and status <> 'canceled' returning * into s;
  if s.restaurant_id is null then raise exception 'Sem assinatura ativa' using errcode = 'P0001'; end if;
  if s.renewal_invoiced_for = s.current_period_end then
    for v_inv in select id from public.subscription_invoices where restaurant_id = p_restaurant_id and kind in ('renewal', 'upgrade')
        and period_start >= s.current_period_end and status in ('open', 'overdue') loop
      perform private.invoice_void(v_inv, 'Assinatura cancelada antes do próximo período');
    end loop;
    update public.restaurant_subscriptions set renewal_invoiced_for = null where restaurant_id = p_restaurant_id;
  end if;
  perform private.log_audit(p_restaurant_id, 'plan.cancel_requested', 'restaurant_subscription', p_restaurant_id, btrim(p_reason), null, null);
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;

-- 12. Upgrade depois da fatura do próximo período: o plano novo vale já, e a diferença do próximo período sai em fatura própria.
-- Plano menor depois da fatura gerada vale a partir do período seguinte.
create or replace function public.restaurant_change_plan(p_restaurant_id uuid, p_plan_code text, p_cycle text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; p private.noowe_plans; v_cycle text; v_old bigint; v_new bigint; v_total numeric; v_left numeric; v_diff bigint; v_old_level integer; v_name text;
  v_next_old bigint; v_next_new bigint; v_invoiced boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id for update;
  if s.restaurant_id is null or s.status = 'canceled' then raise exception 'Escolha um plano primeiro' using errcode = 'P0001'; end if;
  select * into p from private.noowe_plans where code = p_plan_code and is_active;
  if p.code is null then raise exception 'Plano inválido' using errcode = '22023'; end if;
  if p.is_contract then raise exception 'Plano sob consulta: fale com a NOOWE' using errcode = 'P0001'; end if;
  v_cycle := coalesce(p_cycle, s.billing_cycle);
  if v_cycle not in ('monthly', 'annual') then raise exception 'Ciclo inválido' using errcode = '22023'; end if;
  v_old := coalesce(private.plan_period_price(p_restaurant_id, s.plan_code, s.billing_cycle), 0);
  v_new := private.plan_period_price(p_restaurant_id, p_plan_code, s.billing_cycle);
  select sort_order into v_old_level from private.noowe_plans where code = s.plan_code;
  v_invoiced := s.renewal_invoiced_for = s.current_period_end;
  select name into v_name from private.noowe_plans where code = p_plan_code;
  if p.sort_order > v_old_level and v_invoiced then
    -- O próximo período já foi faturado no plano antigo: cobra a diferença dele e passa a faturar o novo.
    v_next_old := coalesce(private.plan_period_price(p_restaurant_id, s.renewal_plan_code, s.renewal_billing_cycle), 0);
    v_next_new := coalesce(private.plan_period_price(p_restaurant_id, p_plan_code, s.renewal_billing_cycle), 0);
    update public.restaurant_subscriptions set renewal_plan_code = p_plan_code where restaurant_id = p_restaurant_id;
    if v_next_new > v_next_old then
      perform private.invoice_create(p_restaurant_id, 'upgrade', s.current_period_end,
        s.current_period_end + case when s.renewal_billing_cycle = 'annual' then interval '1 year' else interval '1 month' end,
        v_next_new - v_next_old, 'Diferença do próximo período: plano ' || v_name);
    end if;
  end if;
  if s.status = 'trial' then
    if v_invoiced and p.sort_order <= v_old_level then
      update public.restaurant_subscriptions set next_plan_code = case when p_plan_code <> s.renewal_plan_code then p_plan_code end,
          next_billing_cycle = case when v_cycle <> s.renewal_billing_cycle then v_cycle end, updated_at = now() where restaurant_id = p_restaurant_id;
    else
      update public.restaurant_subscriptions set plan_code = p_plan_code, billing_cycle = v_cycle, updated_at = now() where restaurant_id = p_restaurant_id;
    end if;
  elsif p.sort_order > v_old_level then
    -- Upgrade: diferença proporcional ao que falta do período. Mudar para anual vale a partir da próxima fatura.
    v_total := greatest(extract(epoch from s.current_period_end - s.current_period_start), 1);
    v_left := greatest(extract(epoch from s.current_period_end - now()), 0);
    v_diff := round((v_new - v_old) * v_left / v_total)::bigint;
    update public.restaurant_subscriptions set plan_code = p_plan_code, next_plan_code = null,
        next_billing_cycle = case when v_cycle <> s.billing_cycle then v_cycle end, updated_at = now() where restaurant_id = p_restaurant_id;
    if v_diff > 0 then perform private.invoice_create(p_restaurant_id, 'upgrade', now(), s.current_period_end, v_diff, 'Diferença proporcional: plano ' || v_name); end if;
  else
    update public.restaurant_subscriptions set next_plan_code = case when p_plan_code <> s.plan_code then p_plan_code end,
        next_billing_cycle = case when v_cycle <> s.billing_cycle then v_cycle end, updated_at = now() where restaurant_id = p_restaurant_id;
  end if;
  perform private.log_audit(p_restaurant_id, 'plan.changed', 'restaurant_subscription', p_restaurant_id, 'Plano alterado',
    jsonb_build_object('plan', s.plan_code, 'cycle', s.billing_cycle), jsonb_build_object('plan', p_plan_code, 'cycle', v_cycle));
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;
