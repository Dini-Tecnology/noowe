-- Plano encerrado (resposta 80 de 05/11/2026). Não existe plano gratuito. Ao fim do período pago:
--   o restaurante sai da busca; pedidos e pagamentos pelo app ficam suspensos; comandas abertas fecham normalmente;
--   o Dono mantém acesso aos dados e à exportação por 90 dias. Reativar o plano devolve tudo como estava.

alter table private.noowe_billing_settings add column canceled_data_days integer not null default 90 check (canceled_data_days > 0);
alter table private.restaurant_billing_flags add column app_payments_suspended boolean not null default false;

-- Com o plano encerrado, a equipe segue com as ferramentas do último plano: é o que fecha as comandas abertas.
-- O que deixa de existir para o cliente vem das travas de busca, pedido e pagamento.
create or replace function private.plan_allows(p_restaurant uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_plan text; v boolean;
begin
  if p_feature = 'tap_to_pay' then
    if not private.tap_provider_active() then return false; end if;
    p_feature := 'waiter_app';
  end if;
  select plan_code into v_plan from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  if v_plan is null then return true; end if;
  if exists (select 1 from private.noowe_plans p where p.code = v_plan and p.is_contract) then return true; end if;
  select enabled into v from private.noowe_plan_features where plan_code = v_plan and feature_key = p_feature;
  return coalesce(v, true);
end $$;

-- Travas: atraso (prazos do parâmetro) ou plano encerrado (na hora).
create or replace function private.subscription_apply_overdue(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_oldest timestamptz; b private.noowe_billing_settings; v_days numeric; v_hidden boolean; v_suspended boolean; v_canceled boolean;
begin
  select * into b from private.noowe_billing_settings;
  select min(due_at) into v_oldest from public.subscription_invoices where restaurant_id = p_restaurant and status = 'overdue';
  -- Quem não escolheu plano: ao fim dos 30 dias, valem os mesmos prazos (pendência 35).
  if not exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant) then
    select r.plan_prompted_at + make_interval(days => b.trial_days) into v_oldest from public.restaurants r where r.id = p_restaurant;
    if v_oldest > now() then v_oldest := null; end if;
  end if;
  v_canceled := exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant and s.status = 'canceled');
  v_days := case when v_oldest is null then 0 else extract(epoch from now() - v_oldest) / 86400 end;
  v_hidden := v_canceled or (v_oldest is not null and v_days > b.grace_days);
  v_suspended := v_canceled or (v_oldest is not null and v_days > b.suspend_orders_after_days);
  insert into private.restaurant_billing_flags(restaurant_id, billing_hidden, orders_suspended, app_payments_suspended) values (p_restaurant, v_hidden, v_suspended, v_canceled)
    on conflict (restaurant_id) do update set billing_hidden = excluded.billing_hidden, orders_suspended = excluded.orders_suspended, app_payments_suspended = excluded.app_payments_suspended
    where (private.restaurant_billing_flags.billing_hidden, private.restaurant_billing_flags.orders_suspended, private.restaurant_billing_flags.app_payments_suspended)
      is distinct from (excluded.billing_hidden, excluded.orders_suspended, excluded.app_payments_suspended);
  if v_canceled then return; end if;
  if v_oldest is null then
    update public.restaurant_subscriptions set status = 'active', updated_at = now() where restaurant_id = p_restaurant and status = 'past_due';
  else
    update public.restaurant_subscriptions set status = 'past_due', updated_at = now() where restaurant_id = p_restaurant and status = 'active';
  end if;
end $$;

-- Encerrar e reativar aplicam as travas na hora.
create or replace function private.subscription_on_canceled(p_restaurant uuid)
returns void language plpgsql security definer set search_path = private, pg_temp as $$
declare l private.noowe_credit_lots;
begin
  for l in select * from private.noowe_credit_lots where restaurant_id = p_restaurant and remaining_cents > 0 for update loop
    insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (p_restaurant, l.id, 'lost', -l.remaining_cents);
    update private.noowe_credit_lots set remaining_cents = 0 where id = l.id;
  end loop;
  update private.noowe_promo_redemptions set status = 'ended' where restaurant_id = p_restaurant and status = 'active';
  perform private.subscription_apply_overdue(p_restaurant);
  perform private.notify_owner(p_restaurant, 'Plano encerrado',
    'O restaurante saiu da busca, e pedidos e pagamentos pelo app estão suspensos. As comandas abertas fecham normalmente. Seus dados e a exportação ficam disponíveis por '
    || (select canceled_data_days from private.noowe_billing_settings) || ' dias.', 'plan_canceled');
end $$;

create or replace function private.subscription_reactivated()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if old.status = 'canceled' and new.status <> 'canceled' then
    perform private.subscription_apply_overdue(new.restaurant_id);
  end if;
  return new;
end $$;
create trigger trg_subscription_reactivated after update of status on public.restaurant_subscriptions
  for each row execute function private.subscription_reactivated();

-- Pagamento pelo app (Asaas) com o plano encerrado: suspenso. Pagamento no salão, registrado pela equipe, segue.
create or replace function private.billing_block_app_payment()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.provider = 'asaas' and coalesce((select f.app_payments_suspended from private.restaurant_billing_flags f where f.restaurant_id = new.restaurant_id), false) then
    raise exception 'Este restaurante não está recebendo pagamentos pelo app agora. Pague no salão.' using errcode = 'P0015';
  end if;
  return new;
end $$;
create trigger trg_billing_block_app_payment before insert on public.gateway_transactions
  for each row execute function private.billing_block_app_payment();

-- Resumo do plano: encerrado mostra até quando os dados ficam disponíveis.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.restaurant_get_plan_summary(uuid)'::regprocedure);
  if position($q$return jsonb_build_object('needsChoice', true, 'status', s.status, 'trialDays', (select trial_days from private.noowe_billing_settings));$q$ in v_def) = 0 then
    raise exception 'restaurant_get_plan_summary mudou: revisar o resumo do plano encerrado';
  end if;
  execute replace(v_def, $q$return jsonb_build_object('needsChoice', true, 'status', s.status, 'trialDays', (select trial_days from private.noowe_billing_settings));$q$,
    $q$return jsonb_build_object('needsChoice', true, 'status', s.status, 'trialDays', (select trial_days from private.noowe_billing_settings),
      'canceledAt', s.canceled_at,
      'dataAccessUntil', case when s.status = 'canceled' then coalesce(s.canceled_at, s.current_period_end) + make_interval(days => (select canceled_data_days from private.noowe_billing_settings)) end);$q$);
end $$;

-- Restaurantes já encerrados recebem as travas.
do $$
declare v uuid;
begin
  for v in select restaurant_id from public.restaurant_subscriptions where status = 'canceled' loop
    perform private.subscription_apply_overdue(v);
  end loop;
end $$;
