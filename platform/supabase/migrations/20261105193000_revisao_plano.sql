-- Revisão de M4, M5 e M6. A fatura chega ao Asaas; o atraso só corre com cobrança de verdade; o benefício do código respeita plano, ciclo e
-- conta por fatura; excedente não se cobra duas vezes; restaurante sem plano não fica com tudo de graça para sempre; e o plano vale no
-- servidor para fidelidade, NFC-e e app do garçom.

alter table private.noowe_billing_settings add column invoice_due_days integer not null default 3 check (invoice_due_days > 0);
alter table private.noowe_credit_settings add column expiry_notice_days integer not null default 30 check (expiry_notice_days >= 0);
alter table private.noowe_promo_redemptions add column months_billed integer not null default 0 check (months_billed >= 0);
alter table public.restaurants add column plan_prompted_at timestamptz;

-- Excedente só uma vez por período.
create unique index subscription_invoices_overage_once on public.subscription_invoices(restaurant_id, period_start) where kind = 'overage';

create or replace function private.restaurants_guard_commercial()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.accepted_vouchers is distinct from old.accepted_vouchers
    or new.convenience_absorbed is distinct from old.convenience_absorbed
    or new.noowe_category is distinct from old.noowe_category
    or new.billing_hidden is distinct from old.billing_hidden
    or new.orders_suspended is distinct from old.orders_suspended
    or new.plan_prompted_at is distinct from old.plan_prompted_at) then
    raise exception 'Estes campos só mudam pela função própria, que registra quem mudou' using errcode = '42501';
  end if;
  return new;
end $$;

-- Sem plano ainda: segue com tudo, e os 30 dias contam do primeiro acesso do Dono (pendência 35). Cancelado: sem os recursos do plano (pendência 80).
create or replace function private.plan_allows(p_restaurant uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_plan text := private.restaurant_plan_code(p_restaurant); v boolean;
begin
  if p_feature = 'tap_to_pay' then
    if not private.tap_provider_active() then return false; end if;
    p_feature := 'waiter_app';
  end if;
  if v_plan is null then
    return not exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant and s.status = 'canceled');
  end if;
  if exists (select 1 from private.noowe_plans p where p.code = v_plan and p.is_contract) then return true; end if;
  select enabled into v from private.noowe_plan_features where plan_code = v_plan and feature_key = p_feature;
  return coalesce(v, true);
end $$;

-- Quem não escolheu: conta a partir daqui.
create or replace function public.restaurant_note_plan_prompt(p_restaurant_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  update public.restaurants set plan_prompted_at = now() where id = p_restaurant_id and plan_prompted_at is null
    and not exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant_id);
end $$;
revoke all on function public.restaurant_note_plan_prompt(uuid) from public, anon;
grant execute on function public.restaurant_note_plan_prompt(uuid) to authenticated;

-- Pedido é cada envio: o que foi pedido na espera da fila já é um pedido (resposta 25). Entrar na fila, sem pedir, não conta.
create or replace function private.plan_orders_used(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from public.orders o where o.restaurant_id = p_restaurant and o.status::text <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to
$$;

-- Fase do benefício por fatura, e não pelo relógio: uma diferença de segundos entre ticks não pode dar um mês a mais.
create or replace function private.promo_phase_at(p_code text, p_month integer)
returns table(kind text, percent_off_bps integer, amount_off_cents bigint)
language sql stable security definer set search_path = private, pg_temp as $$
  select f.kind, f.percent_off_bps, f.amount_off_cents from private.promo_phases(p_code) f
  where p_month >= f.starts_month and p_month < f.starts_month + f.duration_months limit 1
$$;
revoke all on function private.promo_phase_at(text, integer) from public, anon, authenticated;

create or replace function private.invoice_apply_promo(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; c private.noowe_promo_codes; s public.restaurant_subscriptions; f record; v bigint := 0; v_total_months integer; v_kind text; v_months integer; v_unit bigint; v_month_cents bigint; k integer;
begin
  if p_plan_cents <= 0 then return 0; end if;
  select kind into v_kind from public.subscription_invoices where id = p_invoice;
  if v_kind <> 'renewal' then return 0; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active' for update;
  if r.id is null then return 0; end if;
  select * into c from private.noowe_promo_codes where code = r.code;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  -- Trocou de plano ou de ciclo para um que o código não cobre: o benefício acaba, e o Dono é avisado.
  if (c.plan_codes is not null and cardinality(c.plan_codes) > 0 and not s.plan_code = any(c.plan_codes))
     or (s.billing_cycle = 'monthly' and not c.allow_monthly) or (s.billing_cycle = 'annual' and not c.allow_annual) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
    perform private.log_system_audit(p_restaurant, 'plan.promo_ended', 'restaurant_subscription', p_restaurant, 'O código não vale para este plano ou ciclo', null, jsonb_build_object('code', r.code, 'plan', s.plan_code, 'cycle', s.billing_cycle));
    perform private.notify_owner(p_restaurant, 'Código promocional encerrado', 'O código ' || r.code || ' não vale para o plano ou ciclo atual.', 'plan_promo_ended');
    return 0;
  end if;
  if r.started_at is null then update private.noowe_promo_redemptions set started_at = now() where id = r.id returning * into r; end if;
  -- Cada mês do período na fase dele: no anual, um mês grátis é um doze avos da fatura, e não ela inteira.
  v_months := case when s.billing_cycle = 'annual' then 12 else 1 end;
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
  select coalesce(sum(duration_months), 0) into v_total_months from private.promo_phases(r.code);
  update private.noowe_promo_redemptions set months_billed = months_billed + v_months,
      status = case when months_billed + v_months >= v_total_months then 'ended' else status end where id = r.id;
  if v > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'promo', 'Código promocional ' || r.code, -v);
  end if;
  return v;
end $$;

-- Durante a isenção total o restaurante não gera crédito: é a fase do último mês faturado.
create or replace function private.promo_free_during(p_restaurant uuid, p_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = private, pg_temp as $$
declare r private.noowe_promo_redemptions; v text;
begin
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active';
  if r.id is null or r.started_at is null then return false; end if;
  select kind into v from private.promo_phase_at(r.code, greatest(r.months_billed - 1, 0));
  return v = 'free_months';
end $$;

-- App do garçom é recurso de plano. Quem tem outra função na casa segue cobrando.
create or replace function private.assert_waiter_app(p_restaurant uuid)
returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if private.has_restaurant_role(p_restaurant, array['owner','manager','maitre','cashier']::public.user_roles_role_enum[]) then return; end if;
  perform private.assert_plan_allows(p_restaurant, 'waiter_app');
end $$;
revoke all on function private.assert_waiter_app(uuid) from public, anon, authenticated;

create or replace function public.service_invoice_claim(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; r public.restaurants; s public.restaurant_subscriptions;
begin
  update public.subscription_invoices set claimed_at = now(), attempts = attempts + 1
    where id = p_invoice_id and status in ('open', 'overdue') and provider_ref is null and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    returning * into i;
  if i.id is null then return jsonb_build_object('claimed', false); end if;
  -- O prazo conta a partir da cobrança de verdade: vencimento no passado o provedor recusa, e o Dono não teria como pagar.
  if i.due_at < now() + interval '1 day' then
    update public.subscription_invoices set due_at = now() + make_interval(days => (select invoice_due_days from private.noowe_billing_settings)) where id = i.id returning * into i;
  end if;
  select * into r from public.restaurants where id = i.restaurant_id;
  select * into s from public.restaurant_subscriptions where restaurant_id = i.restaurant_id;
  return jsonb_build_object('claimed', true, 'invoiceId', i.id, 'restaurantId', r.id, 'name', r.name, 'cnpj', upper(regexp_replace(coalesce(nullif((select c.cnpj from public.fiscal_configs c where c.restaurant_id = r.id limit 1), ''), r.settings->>'cnpj', ''), '[^0-9A-Za-z]', '', 'g')),
    'email', r.email, 'customerId', s.provider_customer_id, 'totalCents', i.total_cents, 'dueDate', (i.due_at at time zone 'America/Sao_Paulo')::date);
end $$;

create or replace function public.service_invoice_attach(p_invoice_id uuid, p_customer_id text, p_provider_ref text, p_checkout_url text, p_error text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_restaurant uuid; v_prev text;
begin
  select last_error into v_prev from public.subscription_invoices where id = p_invoice_id;
  update public.subscription_invoices set provider_ref = coalesce(p_provider_ref, provider_ref), checkout_url = coalesce(p_checkout_url, checkout_url), last_error = p_error where id = p_invoice_id returning restaurant_id into v_restaurant;
  -- Sem cobrança o Dono não tem como pagar: precisa saber o motivo.
  if p_error is not null and v_prev is null then perform private.notify_owner(v_restaurant, 'Fatura sem cobrança', p_error || '. Corrija para receber a cobrança.', 'plan_invoice_blocked', p_invoice_id); end if;
  if p_customer_id is not null then update public.restaurant_subscriptions set provider_customer_id = p_customer_id where restaurant_id = v_restaurant; end if;
end $$;

create or replace function private.invoice_create(p_restaurant uuid, p_kind text, p_from timestamptz, p_to timestamptz, p_plan_cents bigint, p_plan_label text, p_extra_cents bigint default 0, p_extra_label text default null)
returns public.subscription_invoices language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; v_total bigint; v_promo bigint := 0; v_credit bigint := 0; v_sub bigint := coalesce(p_plan_cents, 0) + coalesce(p_extra_cents, 0);
begin
  insert into public.subscription_invoices(restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, due_at)
    values (p_restaurant, p_kind, p_from, p_to, v_sub, 0, now() + make_interval(days => (select invoice_due_days from private.noowe_billing_settings))) returning * into i;
  if coalesce(p_plan_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, case when p_kind = 'upgrade' then 'upgrade' else 'plan' end, p_plan_label, p_plan_cents);
  end if;
  if coalesce(p_extra_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, 'overage', p_extra_label, p_extra_cents);
  end if;
  -- Ordem do item E: primeiro o código, depois os créditos, e por fim a compensação.
  v_promo := private.invoice_apply_promo(i.id, p_restaurant, coalesce(p_plan_cents, 0));
  v_credit := private.invoice_apply_credits(i.id, p_restaurant, coalesce(p_plan_cents, 0) - v_promo);
  v_total := private.invoice_apply_compensations(i.id, p_restaurant, v_sub - v_promo - v_credit);
  update public.subscription_invoices set total_cents = greatest(v_total, 0),
      status = case when v_total <= 0 then 'paid' else 'open' end, paid_at = case when v_total <= 0 then now() end
    where id = i.id returning * into i;
  if i.status = 'open' then perform private.invoice_post(i.id); end if;
  return i;
end $$;

create or replace function private.subscription_renew(s public.restaurant_subscriptions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_plan text := coalesce(s.next_plan_code, s.plan_code); v_cycle text := coalesce(s.next_billing_cycle, s.billing_cycle);
  v_from timestamptz := s.current_period_end; v_to timestamptz; v_price bigint; v_name text; v_used bigint; v_over bigint := 0;
begin
  if s.status <> 'trial' and s.billing_cycle = 'monthly' then
    v_used := private.plan_orders_used(s.restaurant_id, s.current_period_start, s.current_period_end);
    v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, v_used);
  end if;
  v_to := v_from + case when v_cycle = 'annual' then interval '1 year' else interval '1 month' end;
  v_price := coalesce(private.plan_period_price(s.restaurant_id, v_plan, v_cycle), 0);
  select name into v_name from private.noowe_plans where code = v_plan;
  update public.restaurant_subscriptions set plan_code = v_plan, billing_cycle = v_cycle, next_plan_code = null, next_billing_cycle = null,
      status = 'active', current_period_start = v_from, current_period_end = v_to, trial_ends_at = null, renewal_notified_for = null, last_overage_billed_at = null, updated_at = now()
    where restaurant_id = s.restaurant_id;
  perform private.invoice_create(s.restaurant_id, 'renewal', v_from, v_to, v_price,
    'Plano ' || coalesce(v_name, v_plan) || case when v_cycle = 'annual' then ' (anual)' else ' (mensal)' end,
    v_over, case when v_over > 0 then 'Pedidos acima da franquia' end);
end $$;

create or replace function private.subscription_apply_overdue(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_oldest timestamptz; b private.noowe_billing_settings; v_days numeric;
begin
  select * into b from private.noowe_billing_settings;
  select min(due_at) into v_oldest from public.subscription_invoices where restaurant_id = p_restaurant and status = 'overdue';
  -- Quem não escolheu plano: ao fim dos 30 dias, valem os mesmos prazos (pendência 35).
  if not exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant) then
    select r.plan_prompted_at + make_interval(days => b.trial_days) into v_oldest from public.restaurants r where r.id = p_restaurant;
    if v_oldest > now() then v_oldest := null; end if;
  end if;
  v_days := case when v_oldest is null then 0 else extract(epoch from now() - v_oldest) / 86400 end;
  update public.restaurants set billing_hidden = v_oldest is not null and v_days > b.grace_days,
      orders_suspended = v_oldest is not null and v_days > b.suspend_orders_after_days
    where id = p_restaurant and (billing_hidden, orders_suspended) is distinct from (v_oldest is not null and v_days > b.grace_days, v_oldest is not null and v_days > b.suspend_orders_after_days);
  if v_oldest is null then
    update public.restaurant_subscriptions set status = 'active', updated_at = now() where restaurant_id = p_restaurant and status = 'past_due';
  else
    update public.restaurant_subscriptions set status = 'past_due', updated_at = now() where restaurant_id = p_restaurant and status = 'active';
  end if;
end $$;

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
      if s.current_period_end <= now() then
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
      union select id from public.restaurants where billing_hidden or orders_suspended
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

create or replace function public.restaurant_choose_plan(p_restaurant_id uuid, p_plan_code text, p_cycle text default 'monthly')
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p private.noowe_plans; v_days integer; v_end timestamptz; s public.restaurant_subscriptions;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into p from private.noowe_plans where code = p_plan_code and is_active;
  if p.code is null then raise exception 'Plano inválido' using errcode = '22023'; end if;
  if p_cycle not in ('monthly', 'annual') then raise exception 'Ciclo inválido' using errcode = '22023'; end if;
  if p.is_contract and not exists (select 1 from private.noowe_restaurant_contracts c where c.restaurant_id = p_restaurant_id and c.plan_code = p.code) then
    raise exception 'Plano sob consulta: fale com a NOOWE' using errcode = 'P0001'; end if;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is not null and s.status <> 'canceled' then raise exception 'Este restaurante já tem plano' using errcode = '23505'; end if;
  select trial_days into v_days from private.noowe_billing_settings;
  -- Quem já testou não testa de novo ao voltar.
  v_end := now() + make_interval(days => case when s.restaurant_id is null then v_days else 0 end);
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, chosen_by)
    values (p_restaurant_id, p_plan_code, p_cycle, 'trial', v_end, now(), v_end, auth.uid())
    on conflict (restaurant_id) do update set plan_code = excluded.plan_code, billing_cycle = excluded.billing_cycle, status = 'trial', trial_ends_at = excluded.trial_ends_at,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, chosen_by = excluded.chosen_by, cancel_requested_at = null,
      cancel_reason = null, canceled_at = null, next_plan_code = null, next_billing_cycle = null, trial_notified = false, last_overage_billed_at = null, updated_at = now();
  perform private.log_audit(p_restaurant_id, 'plan.chosen', 'restaurant_subscription', p_restaurant_id, 'Plano escolhido', null, jsonb_build_object('plan', p_plan_code, 'cycle', p_cycle, 'trialDays', v_days));
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;

create or replace function private.credit_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; cfg private.noowe_credit_settings; v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month')::date; v_from timestamptz; v_to timestamptz;
  fig record; tier record; v_terms record; v_credit bigint; v_prev text; v_lot uuid; l private.noowe_credit_lots; v_n integer := 0; v_tier_name text;
begin
  select * into cfg from private.noowe_credit_settings;
  v_from := v_month::timestamp at time zone 'America/Sao_Paulo';
  v_to := (v_month + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  for s in select x.* from public.restaurant_subscriptions x where x.status <> 'canceled' and x.created_at <= v_from
      and not exists (select 1 from private.noowe_credit_month_close c where c.restaurant_id = x.restaurant_id and c.month = v_month) loop
    select * into fig from private.credit_figures(s.restaurant_id, v_from, v_to);
    select * into tier from private.credit_tier(s.plan_code, fig.paid_cents, fig.index_bps);
    select * into v_terms from private.plan_terms(s.restaurant_id, s.plan_code);
    v_credit := 0;
    if tier.tier_code is not null and not private.promo_free_during(s.restaurant_id, v_from) then
      v_credit := div(coalesce(v_terms.monthly_cents, 0) * tier.credit_bps + 5000, 10000)::bigint;
    end if;
    select tier_code into v_prev from private.noowe_credit_month_close where restaurant_id = s.restaurant_id and month = (v_month - interval '1 month')::date;
    insert into private.noowe_credit_month_close(restaurant_id, month, paid_cents, revenue_cents, index_bps, tier_code, credit_cents)
      values (s.restaurant_id, v_month, fig.paid_cents, fig.revenue_cents, fig.index_bps, tier.tier_code, v_credit);
    if v_credit > 0 then
      insert into private.noowe_credit_lots(restaurant_id, month, tier_code, amount_cents, remaining_cents, available_from, expires_at)
        values (s.restaurant_id, v_month, tier.tier_code, v_credit, v_credit, (v_month + make_interval(months => cfg.release_after_invoices))::date,
          (v_month + interval '1 month' + make_interval(months => case when s.billing_cycle = 'annual' then cfg.expiry_months_annual else cfg.expiry_months_monthly end))::date)
        returning id into v_lot;
      insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (s.restaurant_id, v_lot, 'generated', v_credit);
      perform private.notify_owner(s.restaurant_id, 'Crédito NOOWE Pay gerado', 'O mês fechou com ' || to_char(v_credit::numeric / 100, 'FM999G990D00') || ' de crédito.', 'credit_generated');
    end if;
    if v_prev is distinct from tier.tier_code and (v_prev is not null or tier.tier_code is not null) then
      select name into v_tier_name from private.noowe_credit_tiers where code = tier.tier_code;
      perform private.notify_owner(s.restaurant_id, 'Sua faixa mudou', coalesce('Agora você está na faixa ' || v_tier_name || '.', 'Neste mês o restaurante ficou sem faixa.'), 'credit_tier_changed');
    end if;
    v_n := v_n + 1;
  end loop;
  for l in select * from private.noowe_credit_lots where remaining_cents > 0 and (
      (not release_notified and available_from <= (now() at time zone 'America/Sao_Paulo')::date)
      or (not expiry_notified and expires_at <= (now() at time zone 'America/Sao_Paulo')::date + (select expiry_notice_days from private.noowe_credit_settings))
      or expires_at <= (now() at time zone 'America/Sao_Paulo')::date) loop
    if l.expires_at <= (now() at time zone 'America/Sao_Paulo')::date then
      insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (l.restaurant_id, l.id, 'expired', -l.remaining_cents);
      update private.noowe_credit_lots set remaining_cents = 0 where id = l.id;
    else
      if not l.release_notified and l.available_from <= (now() at time zone 'America/Sao_Paulo')::date then
        perform private.notify_owner(l.restaurant_id, 'Crédito liberado', 'Um crédito NOOWE Pay já abate a próxima fatura.', 'credit_released');
        update private.noowe_credit_lots set release_notified = true where id = l.id;
      end if;
      if not l.expiry_notified and l.expires_at <= (now() at time zone 'America/Sao_Paulo')::date + (select expiry_notice_days from private.noowe_credit_settings) then
        perform private.notify_owner(l.restaurant_id, 'Crédito perto de expirar', 'Um crédito NOOWE Pay expira em breve.', 'credit_expiring');
        update private.noowe_credit_lots set expiry_notified = true where id = l.id;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.restaurant_get_credits(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; v_from timestamptz; fig record; tier record; v_terms record; v_today date := (now() at time zone 'America/Sao_Paulo')::date; nxt private.noowe_credit_tiers; v_gap bigint; v_min bigint;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  v_from := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  select * into fig from private.credit_figures(p_restaurant_id, v_from, now() + interval '1 minute');
  select * into tier from private.credit_tier(s.plan_code, fig.paid_cents, fig.index_bps);
  select * into v_terms from private.plan_terms(p_restaurant_id, s.plan_code);
  select m.min_volume_cents into v_min from private.noowe_credit_plan_minimums m where m.plan_code = s.plan_code;
  select * into nxt from private.noowe_credit_tiers t where t.min_index_bps > fig.index_bps order by t.min_index_bps limit 1;
  -- Pagamento novo pelo app entra nos dois lados da conta.
  if nxt.code is not null then
    v_gap := greatest(ceil((nxt.min_index_bps::numeric * fig.revenue_cents - 10000 * fig.paid_cents) / greatest(10000 - nxt.min_index_bps, 1)), 0)::bigint;
  end if;
  return jsonb_build_object('indexBps', fig.index_bps, 'tierCode', tier.tier_code, 'paidCents', fig.paid_cents, 'revenueCents', fig.revenue_cents, 'minVolumeCents', v_min,
    'marks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'minIndexBps', t.min_index_bps, 'creditBps', t.credit_bps) order by t.min_index_bps) from private.noowe_credit_tiers t), '[]'::jsonb),
    'forecastCents', case when tier.tier_code is null then 0 else div(coalesce(v_terms.monthly_cents, 0) * tier.credit_bps + 5000, 10000)::bigint end,
    'nextTier', case when nxt.code is null then null else jsonb_build_object('name', nxt.name, 'missingCents', v_gap) end,
    'balanceCents', coalesce((select sum(remaining_cents) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.available_from <= v_today and l.expires_at > v_today), 0),
    'toRelease', coalesce((select jsonb_agg(jsonb_build_object('amountCents', l.remaining_cents, 'availableFrom', l.available_from) order by l.available_from) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.remaining_cents > 0 and l.available_from > v_today), '[]'::jsonb),
    'expiringSoonCents', coalesce((select sum(remaining_cents) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.expires_at > v_today and l.expires_at <= v_today + (select expiry_notice_days from private.noowe_credit_settings)), 0),
    'statement', coalesce((select jsonb_agg(x.j order by x.at desc) from (select e.created_at at, jsonb_build_object('kind', e.kind, 'amountCents', e.amount_cents, 'at', e.created_at, 'invoiceId', e.invoice_id, 'month', lot.month) j
      from private.noowe_credit_ledger e left join private.noowe_credit_lots lot on lot.id = e.lot_id where e.restaurant_id = p_restaurant_id order by e.created_at desc limit 60) x), '[]'::jsonb));
end $$;

create or replace function public.service_fiscal_claim(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare d public.fiscal_documents; c public.fiscal_configs; p record; v_token text; v_payload jsonb;
begin
  select * into p from private.fiscal_retry_policy();
  update public.fiscal_documents set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = p_document_id
      and ((status = 'pending' and next_attempt_at <= now())
        or (status = 'processing' and claimed_at < now() - p.stale_after))
    returning * into d;
  if d.id is null then return jsonb_build_object('claimed', false); end if;

  if not private.plan_allows(d.restaurant_id, 'nfce') then
    return private.fiscal_block(d.id, 'plan_without_nfce', 'O plano atual não inclui NFC-e');
  end if;
  select * into c from public.fiscal_configs where restaurant_id = d.restaurant_id and is_active;
  if c.id is not null then
    select decrypted_secret into v_token from vault.decrypted_secrets where id = c.focus_token_secret_id;
  end if;
  if v_token is null then
    return private.fiscal_block(d.id, 'fiscal_config_missing', 'Restaurante sem configuração fiscal ativa');
  end if;
  v_payload := private.fiscal_emission_payload(d, c);
  if jsonb_array_length(v_payload->'blockers') > 0 then
    return private.fiscal_block(d.id, 'fiscal_data_incomplete', 'Dados fiscais incompletos: ' ||
      (select string_agg(b, ', ') from jsonb_array_elements_text(v_payload->'blockers') b));
  end if;
  update public.fiscal_documents set total_cents = (v_payload->>'totalCents')::bigint, environment = c.environment
    where id = d.id;
  return jsonb_build_object('claimed', true, 'documentId', d.id, 'ref', d.external_ref, 'attempt', d.attempts,
    'environment', c.environment, 'token', v_token, 'cnpj', regexp_replace(c.cnpj, '\D', '', 'g'),
    'items', v_payload->'items', 'payments', v_payload->'payments', 'totalCents', v_payload->'totalCents');
end $$;

create or replace function public.restaurant_get_session_bill(p_table_session_id uuid, p_base_cents bigint default null, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_bps integer; v_base bigint; c public.promotions; v_disc bigint := 0; v_refusal text; v_fee bigint; v_code text := nullif(btrim(coalesce(p_coupon_code, '')), '');
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(s, auth.uid());
  perform private.assert_waiter_app(s.restaurant_id);
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  select * into t from private.session_totals(p_table_session_id);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_base := private.adjust_to_balance(coalesce(p_base_cents, t.base_rem), t.base_rem);
  -- O valor que sai é o do servidor, com o cupom: quem cobra vê antes de digitar na maquininha.
  if v_code is not null then
    select * into c from public.promotions x where x.restaurant_id = s.restaurant_id and upper(x.code) = upper(v_code) and x.discount_kind is not null;
    v_refusal := case when c.id is null then 'Cupom não encontrado' else private.coupon_refusal(c, s.service_model::text, null, v_base) end;
    if v_refusal is null then
      v_disc := private.coupon_discount_cents(c, p_table_session_id, null, v_base);
      if v_disc <= 0 then v_refusal := 'Este cupom não vale para esta conta'; end if;
    end if;
  elsif v_base > 0 then
    for c in select * from public.promotions x where x.restaurant_id = s.restaurant_id and x.is_auto and x.status = 'active' and x.discount_kind is not null loop
      continue when private.coupon_refusal(c, s.service_model::text, null, v_base) is not null;
      v_disc := greatest(v_disc, private.coupon_discount_cents(c, p_table_session_id, null, v_base));
    end loop;
  end if;
  v_fee := private.service_fee_cents(v_base - v_disc, v_bps);
  return jsonb_build_object('tableSessionId', s.id, 'consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'balanceCents', t.base_rem,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', v_bps,
    'chargeBaseCents', v_base, 'feeCents', v_fee, 'couponDiscountCents', v_disc, 'couponRefusal', v_refusal,
    'totalWithFeeCents', v_base - v_disc + v_fee, 'totalWithoutFeeCents', v_base - v_disc,
    'adjusted', p_base_cents is not null and p_base_cents > t.base_rem,
    'acceptedVouchers', to_jsonb((select accepted_vouchers from public.restaurants where id = s.restaurant_id)),
    'tapActive', private.tap_available(s.restaurant_id),
    -- Quem cobra a mesa vê quem já pagou. Maître vê o status, sem o valor de cada pagamento.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'),
        'baseCents', case when private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]) then b.base_cents end,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;

create or replace function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null,
  p_voucher_kind text default null, p_coupon_code text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_key text; v_tx public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint;
  v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_kind public.noowe_tip_allocation; v_waiter uuid; v_closed boolean := false;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente');
  v_coupon public.promotions; v_discount bigint := 0;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'credit_card', 'debit_card', 'pix', 'voucher') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  -- O Dono escolhe quais vales aceita. Vale é sempre externo: maquininha da casa.
  if p_payment_method = 'voucher' and not coalesce((select p_voucher_kind = any(r.accepted_vouchers) from public.restaurants r where r.id = v_session.restaurant_id), false) then
    raise exception 'Este vale não é aceito neste restaurante' using errcode = '22023'; end if;
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(v_session, auth.uid());
  perform private.assert_waiter_app(v_session.restaurant_id);

  v_key := 'manual-share:' || p_table_session_id || ':' || p_idempotency_key;
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_tx.bill_share_id, 'amountCents', v_tx.amount_cents, 'idempotentReplay', true);
  end if;
  if v_session.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;

  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 and coalesce(p_tip_cents, 0) = 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  -- Valor zero com gorjeta: pagamento misto, com vale no consumo e cartão na gorjeta.
  if p_base_cents is not null and (p_base_cents < 0 or (p_base_cents = 0 and coalesce(p_tip_cents, 0) = 0)) then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  -- Garçom aplica o cupom a pedido do cliente sem app. O desconto entra antes da taxa.
  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon := private.coupon_for_code(v_session.restaurant_id, p_coupon_code);
    perform private.coupon_assert_valid(v_coupon, v_session.service_model::text, null, v_base);
    v_discount := private.coupon_discount_cents(v_coupon, p_table_session_id, null, v_base);
    if v_discount <= 0 then raise exception 'Este cupom não vale para esta conta' using errcode = 'P0017'; end if;
  elsif v_base > 0 then
    -- Na comanda, sem cliente identificado, o automático vale se for para todos.
    v_coupon := private.coupon_best_auto(v_session.restaurant_id, v_session.service_model::text, null, p_table_session_id, null, v_base);
    if v_coupon.id is not null then v_discount := private.coupon_discount_cents(v_coupon, p_table_session_id, null, v_base); end if;
  end if;
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base - v_discount, v_bps) end;
  -- Gorjeta só no cartão (vale no consumo): o teto é o saldo que ela acompanha.
  if v_tip < 0 or v_tip > (case when v_base > 0 then v_base + v_fee else v_balance end) then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t where t.id = v_session.table_id;
  end if;
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, coupon_discount_cents, coupon_id,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base - v_discount + v_fee, v_discount, v_coupon.id, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
      case when p_waive_fee and v_bps > 0 then auth.uid() end, case when p_waive_fee and v_bps > 0 then now() end,
      case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status,
      idempotency_key, purpose, table_session_id, bill_share_id, confirmed_at, metadata, created_at, updated_at)
    values (v_session.restaurant_id, 'manual', p_payment_method, v_base - v_discount + v_fee + v_tip, v_tip, 0, 'completed', v_key, 'bill_share',
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid(), 'external', p_payment_method <> 'cash', 'voucher_kind', p_voucher_kind), now(), now())
    returning * into v_tx;
  -- Maquininha da casa é pagamento externo, fora do caixa. Dinheiro entra na gaveta (pendência 36).
  if p_payment_method = 'cash' then
    perform private.cash_record(v_session.restaurant_id, 'sale', v_tx.amount_cents, 'Recebido na comanda', v_tx.id, null);
  end if;
  update public.bill_shares set payment_id = v_tx.id where id = v_share;
  if v_discount > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (v_coupon.id, null, p_table_session_id, v_share, v_discount, 'applied');
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = v_coupon.id;
  end if;
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason,
      null, jsonb_build_object('baseCents', v_base));
  end if;
  begin
    v_closed := private.close_session_if_settled(p_table_session_id);
  exception when others then
    perform private.log_system_audit(v_session.restaurant_id, 'bill.close_failed', 'table_session', p_table_session_id, sqlerrm, null, null);
  end;
  return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_share, 'baseCents', v_base, 'feeCents', v_fee, 'tipCents', v_tip,
    'amountCents', v_tx.amount_cents, 'balanceCents', v_balance - v_base, 'requestedCents', p_base_cents,
    'adjusted', p_base_cents is not null and p_base_cents > v_balance, 'closed', v_closed, 'idempotentReplay', false);
end $$;

create or replace function public.restaurant_get_table_bills(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
  v_manages boolean := private.has_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  -- Maître acompanha o status de pagamento, sem o valor.
  v_values boolean := private.has_restaurant_role(p_restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]);
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );
  perform private.assert_waiter_app(p_restaurant_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      -- Comanda aberta é cobrada pelo saldo da sessão, não pelo pedido.
      'table_session_id', case when exists (select 1 from public.table_sessions ts where ts.id = o.table_session_id and ts.status = 'active') then o.table_session_id end,
      'table_id', o.table_id,
      'table_number', t.table_number,
      'total_amount', case when v_values then o.total_amount end,
      'payment_method', o.payment_method,
      'status', o.status,
      'payment_status', o.payment_status,
      'is_paid', private.order_is_paid(o),
      'created_at', o.created_at
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into result
  from public.orders o
  left join public.tables t on t.id = o.table_id
  where o.restaurant_id = p_restaurant_id
    and o.table_id is not null
    and o.created_at > now() - interval '24 hours'
    -- Garçom vê as mesas dele. Quem tem outra função na casa continua vendo a casa toda.
    and (v_manages or private.has_restaurant_role(p_restaurant_id, array['maitre']::public.user_roles_role_enum[]) or t.assigned_waiter_id is null or t.assigned_waiter_id = auth.uid());

  return result;
end;
$$;

create or replace function public.customer_redeem_loyalty_reward(
  p_loyalty_program_id uuid,
  p_reward_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program public.loyalty_programs;
  v_title text;
  v_points_cost numeric;
  v_claim jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_program
  from public.loyalty_programs
  where id = p_loyalty_program_id
    and user_id = auth.uid()
    and is_active
  for update;
  if v_program.id is not null then perform private.assert_plan_allows(v_program.restaurant_id, 'loyalty'); end if;

  if v_program.id is null then
    raise exception 'Loyalty program not found' using errcode = 'P0002';
  end if;

  select reward.title, reward.points_cost
  into v_title, v_points_cost
  from (values
    ('dessert'::text, 'Sobremesa grátis'::text, 500::numeric),
    ('house_drink', 'Drink da casa', 800::numeric),
    ('premium_starter', 'Entrada premium', 1200::numeric),
    ('dinner_for_two', 'Jantar para 2', 3000::numeric)
  ) as reward(code, title, points_cost)
  where reward.code = p_reward_code;

  if v_title is null then
    raise exception 'Reward not found' using errcode = 'P0002';
  end if;

  if v_program.points < v_points_cost then
    raise exception 'Insufficient loyalty points' using errcode = 'P0001';
  end if;

  v_claim := jsonb_build_object(
    'code', p_reward_code,
    'title', v_title,
    'points_cost', v_points_cost,
    'created_at', now()
  );

  update public.loyalty_programs
  set points = points - v_points_cost,
      rewards_claimed = coalesce(rewards_claimed, '[]'::jsonb) || jsonb_build_array(v_claim),
      updated_at = now()
  where id = v_program.id;

  return jsonb_build_object(
    'programId', v_program.id,
    'reward', v_claim,
    'remainingPoints', v_program.points - v_points_cost
  );
end;
$$;

create or replace function public.restaurant_check_in_reservation(
  p_reservation_id uuid,
  p_table_id uuid,
  p_guest_name text default null,
  p_guest_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_guest_name text;
  v_guest_count integer;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if v_reservation.id is not null then perform private.assert_plan_allows(v_reservation.restaurant_id, 'reservations'); end if;

  if v_reservation.id is null then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;

  -- ADR-018: o check-in da recepção acontece na mesa principal do grupo.
  select * into v_table from public.tables where id = p_table_id;
  if v_table.merged_into_id is not null then
    raise exception 'Mesa unida a outra: faça o check-in na mesa principal' using errcode = 'P0013';
  end if;
  perform private.lock_floor(v_table.restaurant_id, false);
  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if v_table.id is null or v_table.restaurant_id <> v_reservation.restaurant_id then
    raise exception 'Table not found for this reservation' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_reservation.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if v_reservation.status::text <> 'confirmed' then
    raise exception 'Only confirmed reservations can check in' using errcode = '22023';
  end if;

  if v_table.status not in ('available', 'reserved') then
    raise exception 'Table is not available for check-in' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.table_sessions ts
    where ts.table_id = p_table_id and ts.status = 'active'
  ) then
    raise exception 'Table already has an active session' using errcode = '23505';
  end if;

  if v_reservation.customer_id is not null then
    perform private.assert_single_active_session(v_reservation.customer_id, p_table_id); -- ADR-021
  end if;

  v_guest_name := nullif(btrim(p_guest_name), '');
  if v_guest_name is null then
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente')
    into v_guest_name
    from public.profiles p
    where p.id = v_reservation.customer_id;
  end if;

  v_guest_count := coalesce(p_guest_count, v_reservation.party_size);
  if v_guest_count < 1 or v_guest_count > private.table_effective_seats(p_table_id) then
    raise exception 'Guest count exceeds table capacity' using errcode = '22023';
  end if;

  insert into public.table_sessions(
    table_id, restaurant_id, customer_id, reservation_id, guest_name, guest_count, guest_user_ids,
    status, started_at, last_activity, total_orders, total_spent, created_at, updated_at
  )
  values(
    p_table_id, v_reservation.restaurant_id, v_reservation.customer_id, v_reservation.id,
    v_guest_name, v_guest_count, '[]'::jsonb,
    'active', now(), now(), 0, 0, now(), now()
  )
  returning * into v_session;

  -- ADR-021: o cliente da reserva passa a ser participante, para a comanda aparecer no app dele.
  if v_reservation.customer_id is not null then
    insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
    values (v_session.id, v_reservation.customer_id, coalesce(v_guest_name, 'Cliente'), true)
    on conflict (table_session_id, user_id) where user_id is not null do nothing;
  end if;

  update public.reservations
  set table_id = p_table_id, status = 'seated', updated_at = now()
  where id = p_reservation_id;

  update public.tables
  set status = 'occupied', occupied_since = now(), updated_at = now()
  where id = p_table_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'table_id', p_table_id,
    'session', to_jsonb(v_session)
  );
end;
$$;
