-- Quem está em atraso com a NOOWE não pode ser público: billing_hidden e orders_suspended eram legíveis por qualquer um na tabela restaurants.
-- Os campos vão para uma tabela privada. A busca do cliente usa "listed", que só diz se o restaurante aparece, sem dizer por quê.
create table private.restaurant_billing_flags (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  billing_hidden boolean not null default false,
  orders_suspended boolean not null default false
);
alter table private.restaurant_billing_flags enable row level security;
revoke all on private.restaurant_billing_flags from public, anon, authenticated, service_role;
insert into private.restaurant_billing_flags(restaurant_id, billing_hidden, orders_suspended)
  select id, billing_hidden, orders_suspended from public.restaurants where billing_hidden or orders_suspended;

create or replace function private.billing_block_new_session()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if coalesce((select f.orders_suspended from private.restaurant_billing_flags f where f.restaurant_id = new.restaurant_id), false) then
    raise exception 'Este restaurante não está recebendo pedidos pelo app agora' using errcode = 'P0015';
  end if;
  return new;
end $$;

create or replace function private.billing_block_new_order()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.table_session_id is null and coalesce((select f.orders_suspended from private.restaurant_billing_flags f where f.restaurant_id = new.restaurant_id), false) then
    raise exception 'Este restaurante não está recebendo pedidos pelo app agora' using errcode = 'P0015';
  end if;
  return new;
end $$;

create or replace function private.restaurants_guard_commercial()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.accepted_vouchers is distinct from old.accepted_vouchers
    or new.convenience_absorbed is distinct from old.convenience_absorbed
    or new.noowe_category is distinct from old.noowe_category
    or new.plan_prompted_at is distinct from old.plan_prompted_at) then
    raise exception 'Estes campos só mudam pela função própria, que registra quem mudou' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.subscription_apply_overdue(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_oldest timestamptz; b private.noowe_billing_settings; v_days numeric; v_hidden boolean; v_suspended boolean;
begin
  select * into b from private.noowe_billing_settings;
  select min(due_at) into v_oldest from public.subscription_invoices where restaurant_id = p_restaurant and status = 'overdue';
  -- Quem não escolheu plano: ao fim dos 30 dias, valem os mesmos prazos (pendência 35).
  if not exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant) then
    select r.plan_prompted_at + make_interval(days => b.trial_days) into v_oldest from public.restaurants r where r.id = p_restaurant;
    if v_oldest > now() then v_oldest := null; end if;
  end if;
  v_days := case when v_oldest is null then 0 else extract(epoch from now() - v_oldest) / 86400 end;
  v_hidden := v_oldest is not null and v_days > b.grace_days;
  v_suspended := v_oldest is not null and v_days > b.suspend_orders_after_days;
  insert into private.restaurant_billing_flags(restaurant_id, billing_hidden, orders_suspended) values (p_restaurant, v_hidden, v_suspended)
    on conflict (restaurant_id) do update set billing_hidden = excluded.billing_hidden, orders_suspended = excluded.orders_suspended
    where (private.restaurant_billing_flags.billing_hidden, private.restaurant_billing_flags.orders_suspended) is distinct from (excluded.billing_hidden, excluded.orders_suspended);
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

create or replace function public.restaurant_get_plan_summary(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; t record; v_from timestamptz; v_to timestamptz; v_used bigint; v_total numeric; v_elapsed numeric; v_proj bigint; v_name text; v_contract boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is null or s.status = 'canceled' then
    return jsonb_build_object('needsChoice', true, 'status', s.status, 'trialDays', (select trial_days from private.noowe_billing_settings));
  end if;
  select * into t from private.plan_terms(p_restaurant_id, s.plan_code);
  select name, is_contract into v_name, v_contract from private.noowe_plans where code = s.plan_code;
  v_from := case when s.billing_cycle = 'annual' then greatest(s.current_period_start, date_trunc('month', now())) else s.current_period_start end;
  v_to := case when s.billing_cycle = 'annual' then v_from + interval '1 month' else s.current_period_end end;
  v_used := private.plan_orders_used(p_restaurant_id, v_from, now());
  v_total := greatest(extract(epoch from v_to - v_from), 1);
  v_elapsed := greatest(extract(epoch from now() - v_from), 1);
  v_proj := ceil(v_used * v_total / v_elapsed)::bigint;
  return jsonb_build_object('needsChoice', false, 'planCode', s.plan_code, 'planName', v_name, 'isContract', v_contract, 'cycle', s.billing_cycle, 'status', s.status,
    'priceCents', case when v_contract then null else private.plan_period_price(p_restaurant_id, s.plan_code, s.billing_cycle) end,
    'trialEndsAt', s.trial_ends_at, 'periodEnd', s.current_period_end, 'nextPlanCode', s.next_plan_code, 'nextCycle', s.next_billing_cycle,
    'cancelAt', case when s.cancel_requested_at is not null then s.current_period_end end,
    'usage', jsonb_build_object('orders', v_used, 'allowance', t.allowance, 'projectedOrders', v_proj,
      'projectedOverageCents', private.plan_overage_cents(p_restaurant_id, s.plan_code, v_proj), 'overageCents', private.plan_overage_cents(p_restaurant_id, s.plan_code, v_used)),
    'promo', private.promo_status(p_restaurant_id),
    'category', (select noowe_category from public.restaurants where id = p_restaurant_id),
    'billingHidden', coalesce((select billing_hidden from private.restaurant_billing_flags where restaurant_id = p_restaurant_id), false),
    'ordersSuspended', coalesce((select orders_suspended from private.restaurant_billing_flags where restaurant_id = p_restaurant_id), false),
    'locked', coalesce((select jsonb_agg(x.key) from (select distinct f.feature_key as key from private.noowe_plan_features f) x where not private.plan_allows(p_restaurant_id, x.key)), '[]'::jsonb));
end $$;

alter table public.restaurants drop column billing_hidden, drop column orders_suspended;

-- A busca filtra por este campo calculado, que não aparece em select *.
create or replace function public.listed(r public.restaurants)
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select not coalesce((select f.billing_hidden from private.restaurant_billing_flags f where f.restaurant_id = r.id), false)
$$;
grant execute on function public.listed(public.restaurants) to anon, authenticated, service_role;

-- Versão do app já instalada ainda filtra por este nome: continua funcionando, sem revelar nada. Remover depois do próximo build.
create or replace function public.billing_hidden(r public.restaurants)
returns boolean language sql immutable as $$ select false $$;
grant execute on function public.billing_hidden(public.restaurants) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
