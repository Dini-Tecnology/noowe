-- Revisão das respostas de 05/11: correções do que a revisão do código achou.

-- 1. Estorno esperando saldo ainda reserva o valor: sem isso, um segundo estorno do mesmo valor passaria.
create or replace function private.refund_available_cents(p_tx uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select g.amount_cents - g.refunded_amount_cents - coalesce((select sum(r.amount_cents) from public.payment_refunds r
    where r.gateway_transaction_id = g.id and r.status in ('pending', 'processing', 'sent', 'awaiting_balance')), 0)
  from public.gateway_transactions g where g.id = p_tx
$$;

create or replace function private.refund_is_total(p_tx uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status in ('pending', 'processing', 'sent', 'awaiting_balance'))
    or private.refund_available_cents(p_tx) = 0
$$;

-- 2. "Sem saldo" só vale para Pix, e não espera para sempre: passado o prazo, vira falha com aviso.
alter table private.noowe_billing_settings add column refund_balance_max_hours integer not null default 72 check (refund_balance_max_hours > 0);

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.service_refund_claim(uuid)'::regprocedure);
  if position($q$'amountCents', r.amount_cents, 'reason', r.reason, 'provider', g.provider,$q$ in v_def) = 0 then raise exception 'service_refund_claim mudou'; end if;
  execute replace(v_def, $q$'amountCents', r.amount_cents, 'reason', r.reason, 'provider', g.provider,$q$,
    $q$'amountCents', r.amount_cents, 'reason', r.reason, 'provider', g.provider, 'paymentMethod', g.payment_method,$q$);

  v_def := pg_get_functiondef('public.service_refund_record(uuid, text, text)'::regprocedure);
  if position($q$  if p_outcome = 'no_balance' then$q$ in v_def) = 0 then raise exception 'service_refund_record mudou'; end if;
  execute replace(v_def, $q$  if p_outcome = 'no_balance' then$q$,
    $q$  if p_outcome = 'no_balance' and r.created_at < now() - make_interval(hours => (select refund_balance_max_hours from private.noowe_billing_settings)) then
    p_outcome := 'failed';
    p_error := coalesce(p_error, 'Saldo insuficiente') || ': prazo de espera esgotado';
  end if;
  if p_outcome = 'no_balance' then$q$);
end $$;

-- 3. Fatura anulada devolve o que consumiu: créditos, ajustes e meses do código.
alter table private.noowe_credit_ledger drop constraint noowe_credit_ledger_kind_check;
alter table private.noowe_credit_ledger add constraint noowe_credit_ledger_kind_check check (kind in ('generated', 'used', 'expired', 'lost', 'returned'));
alter table public.subscription_invoices add column promo_months integer not null default 0;

create table private.noowe_pay_compensation_applications (
  id uuid primary key default gen_random_uuid(),
  compensation_id uuid not null references private.noowe_pay_compensations(id) on delete cascade,
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  cents bigint not null,
  created_at timestamptz not null default now()
);
alter table private.noowe_pay_compensation_applications enable row level security;
revoke all on private.noowe_pay_compensation_applications from public, anon, authenticated, service_role;

create or replace function private.invoice_apply_compensations(p_invoice uuid, p_restaurant uuid, p_base bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare c record; v_left bigint := p_base; v_take bigint; v_owed bigint := 0; v_fee bigint := 0; v_refund bigint := 0;
begin
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind = 'fee_kept_on_refund' for update loop
    v_owed := v_owed + c.amount_cents;
    update private.noowe_pay_compensations set status = 'invoiced', applied_cents = amount_cents, invoice_id = p_invoice where id = c.id;
    insert into private.noowe_pay_compensation_applications(compensation_id, invoice_id, cents) values (c.id, p_invoice, c.amount_cents - c.applied_cents);
  end loop;
  v_left := v_left + v_owed;
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind <> 'fee_kept_on_refund' order by created_at for update loop
    exit when v_left <= 0;
    v_take := least(v_left, c.amount_cents - c.applied_cents);
    v_left := v_left - v_take;
    if c.kind = 'tariff_on_refund' then v_refund := v_refund + v_take; else v_fee := v_fee + v_take; end if;
    update private.noowe_pay_compensations set applied_cents = applied_cents + v_take, invoice_id = p_invoice,
        status = case when applied_cents + v_take >= amount_cents then 'invoiced' else 'open' end where id = c.id;
    insert into private.noowe_pay_compensation_applications(compensation_id, invoice_id, cents) values (c.id, p_invoice, v_take);
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

create or replace function private.invoice_void(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare i public.subscription_invoices; v_url text; v_key text; l record; a record; v_total integer;
begin
  update public.subscription_invoices set status = 'void' where id = p_invoice and status in ('open', 'overdue') returning * into i;
  if i.id is null then return; end if;
  -- Créditos usados voltam aos lotes.
  for l in select * from private.noowe_credit_ledger where invoice_id = i.id and kind = 'used' loop
    update private.noowe_credit_lots set remaining_cents = remaining_cents - l.amount_cents where id = l.lot_id;
    insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents, invoice_id) values (l.restaurant_id, l.lot_id, 'returned', -l.amount_cents, i.id);
  end loop;
  -- Ajustes aplicados voltam a valer para a próxima fatura.
  for a in select * from private.noowe_pay_compensation_applications where invoice_id = i.id loop
    update private.noowe_pay_compensations set applied_cents = greatest(applied_cents - a.cents, 0), status = 'open' where id = a.compensation_id;
  end loop;
  delete from private.noowe_pay_compensation_applications where invoice_id = i.id;
  -- Meses do código que esta fatura contou.
  if i.promo_months > 0 then
    update private.noowe_promo_redemptions r set months_billed = greatest(r.months_billed - i.promo_months, 0),
        status = case when r.status = 'ended' and r.ended_at >= i.created_at then 'active' else r.status end,
        ended_at = case when r.status = 'ended' and r.ended_at >= i.created_at then null else r.ended_at end
      where r.restaurant_id = i.restaurant_id and r.id = (select x.id from private.noowe_promo_redemptions x where x.restaurant_id = i.restaurant_id order by x.applied_at desc limit 1);
  end if;
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

-- 4. Código na fatura: só o benefício de fundador desliga pela tabela; a diferença de upgrade também tem o desconto da fase atual.
create or replace function private.invoice_apply_promo(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; c private.noowe_promo_codes; s public.restaurant_subscriptions; inv public.subscription_invoices; f record;
  v bigint := 0; v_total_months integer; v_months integer; v_unit bigint; v_month_cents bigint; k integer; v_plan text; v_cycle text;
begin
  if p_plan_cents <= 0 then return 0; end if;
  select * into inv from public.subscription_invoices where id = p_invoice;
  if inv.kind not in ('renewal', 'upgrade') then return 0; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active' for update;
  if r.id is null then return 0; end if;
  select * into c from private.noowe_promo_codes where code = r.code;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  v_plan := case when s.renewal_invoiced_for = inv.period_start then s.renewal_plan_code else s.plan_code end;
  v_cycle := case when s.renewal_invoiced_for = inv.period_start then s.renewal_billing_cycle else s.billing_cycle end;
  -- A NOOWE desligou o benefício de fundador (contrapartidas descumpridas): acaba agora, e esta fatura já sai sem o desconto.
  if c.grants_category is not null and exists (select 1 from private.noowe_founder_benefit b where b.restaurant_id = p_restaurant and not b.active) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
    perform private.log_system_audit(p_restaurant, 'plan.promo_ended', 'restaurant_subscription', p_restaurant, 'Benefício desativado pela NOOWE', null, jsonb_build_object('code', r.code));
    perform private.notify_owner(p_restaurant, 'Benefício encerrado', 'O desconto do código ' || r.code || ' foi encerrado pela NOOWE.', 'plan_promo_ended');
    return 0;
  end if;
  if inv.kind = 'renewal' and ((c.plan_codes is not null and cardinality(c.plan_codes) > 0 and not v_plan = any(c.plan_codes))
     or (v_cycle = 'monthly' and not c.allow_monthly) or (v_cycle = 'annual' and not c.allow_annual)) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
    perform private.log_system_audit(p_restaurant, 'plan.promo_ended', 'restaurant_subscription', p_restaurant, 'O código não vale para este plano ou ciclo', null, jsonb_build_object('code', r.code, 'plan', v_plan, 'cycle', v_cycle));
    perform private.notify_owner(p_restaurant, 'Código promocional encerrado', 'O código ' || r.code || ' não vale para o plano ou ciclo atual.', 'plan_promo_ended');
    return 0;
  end if;
  if s.status = 'past_due' then return 0; end if;
  -- Diferença de upgrade: o desconto da fase em que o restaurante está, sem contar mês novo.
  if inv.kind = 'upgrade' then
    if r.started_at is null then return 0; end if;
    select * into f from private.promo_phase_at(r.code, greatest(r.months_billed - 1, 0));
    v := case f.kind when 'free_months' then p_plan_cents when 'percent_off' then div(p_plan_cents * f.percent_off_bps + 5000, 10000)::bigint
      when 'fixed_off' then least(p_plan_cents, f.amount_off_cents) else 0 end;
    if v > 0 then
      insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
        values (p_invoice, p_restaurant, 'promo', 'Desconto do código ' || r.code, -v);
    end if;
    return v;
  end if;
  if r.started_at is null then update private.noowe_promo_redemptions set started_at = now() where id = r.id returning * into r; end if;
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
  update public.subscription_invoices set promo_months = v_months where id = p_invoice;
  if v > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'promo', 'Desconto do código ' || r.code, -v);
  end if;
  return v;
end $$;

-- 5. Fatura do próximo período que ficou para trás (o período mudou, como ao aplicar o código de fundador no teste): é anulada.
create or replace function private.subscription_invoice_next(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
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
    'Plano ' || coalesce(v_name, v_plan) || case when v_cycle = 'annual' then ' (anual)' else ' (mensal)' end, 0, null, v_due);
end $$;

-- 6. Cancelar com o próximo período já pago: o serviço segue até o fim dele, e só então encerra.
do $$
declare v_def text; v_old text := $q$if s.cancel_requested_at is not null then$q$;
begin
  v_def := pg_get_functiondef('private.subscription_tick()'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'subscription_tick mudou'; end if;
  execute replace(v_def, v_old, $q$if s.cancel_requested_at is not null and not exists (select 1 from public.subscription_invoices x
          where x.restaurant_id = s.restaurant_id and x.kind = 'renewal' and x.period_start = s.current_period_end and x.status = 'paid') then$q$);
end $$;

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
    -- Período já pago continua valendo: o cancelamento vale no fim dele.
    if not exists (select 1 from public.subscription_invoices x where x.restaurant_id = p_restaurant_id and x.kind = 'renewal'
        and x.period_start = s.current_period_end and x.status = 'paid') then
      update public.restaurant_subscriptions set renewal_invoiced_for = null where restaurant_id = p_restaurant_id;
    end if;
  end if;
  perform private.log_audit(p_restaurant_id, 'plan.cancel_requested', 'restaurant_subscription', p_restaurant_id, btrim(p_reason), null, null);
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;

-- 7. No teste, depois da fatura do próximo período, trocar o ciclo vale a partir do período seguinte (como o plano menor).
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
    if v_invoiced then
      -- A fatura do próximo período já saiu: upgrade já foi faturado acima; plano menor e troca de ciclo valem no período seguinte.
      update public.restaurant_subscriptions set
          plan_code = case when p.sort_order > v_old_level then p_plan_code else plan_code end,
          next_plan_code = case when p.sort_order <= v_old_level and p_plan_code <> s.renewal_plan_code then p_plan_code end,
          next_billing_cycle = case when v_cycle <> s.renewal_billing_cycle then v_cycle end, updated_at = now()
        where restaurant_id = p_restaurant_id;
    else
      update public.restaurant_subscriptions set plan_code = p_plan_code, billing_cycle = v_cycle, updated_at = now() where restaurant_id = p_restaurant_id;
    end if;
  elsif p.sort_order > v_old_level then
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

-- 8. NFC-e da comanda reaberta: cupom e taxa só dos pagamentos depois de reabrir, repartidos só pelos itens novos.
create or replace function private.fiscal_enqueue_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_lines jsonb; v_payments jsonb; v_ids uuid[]; v_gross bigint[]; v_fee bigint[]; v_id uuid; v_coupon bigint; v_disc bigint[];
  v_noted uuid[]; v_first boolean; v_ref text; v_total bigint := 0; v_since timestamptz; v_fee_all bigint;
begin
  select * into s from public.table_sessions where id = p_session;
  if s.id is null then return null; end if;
  if exists (select 1 from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
             where b.table_session_id = p_session and b.status = 'paid' and g.provider = 'simulated') then
    return null;
  end if;
  v_first := not exists (select 1 from public.fiscal_documents d where d.table_session_id = p_session);
  v_ref := case when v_first or s.reopened_count = 0 then 's-' || p_session else 's-' || p_session || '-r' || s.reopened_count end;
  v_since := case when v_ref = 's-' || p_session then null else s.reopened_at end;
  select coalesce(array_agg((l->>'orderItemId')::uuid), '{}') into v_noted
  from public.fiscal_documents d, jsonb_array_elements(coalesce(d.snapshot->'lines', '[]'::jsonb)) l
  where d.table_session_id = p_session and d.cancel_status is distinct from 'cancelled'
    and d.external_ref <> v_ref and not (d.status = 'failed' and d.error_message = 'Venda estornada antes da emissão');

  select * into t from private.session_totals(p_session);
  -- Só os itens que ainda não estão em nota.
  select array_agg(l.order_item_id order by l.order_item_id), array_agg(l.open_cents order by l.order_item_id)
    into v_ids, v_gross
  from private.session_lines(p_session) l where l.open_cents > 0 and not (l.order_item_id = any(v_noted));
  if v_ids is null then return null; end if;
  -- Primeira nota: a taxa e o cupom da comanda. Acréscimo: só os dos pagamentos feitos depois de reabrir.
  if v_since is null then
    v_fee_all := t.fee_all;
    select coalesce(sum(b.coupon_discount_cents), 0) into v_coupon from public.bill_shares b where b.table_session_id = p_session and b.status = 'paid';
  else
    select coalesce(sum(b.service_fee_cents), 0), coalesce(sum(b.coupon_discount_cents), 0) into v_fee_all, v_coupon
      from public.bill_shares b where b.table_session_id = p_session and b.status = 'paid' and b.paid_at >= v_since;
  end if;
  v_fee := private.allocate_proportional(v_fee_all, v_gross);
  v_disc := private.allocate_proportional(least(v_coupon, (select sum(x) from unnest(v_gross) x)::bigint), v_gross);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', v_disc[x.ord], 'feeCents', v_fee[x.ord]) order by x.ord),
         coalesce(sum(v_gross[x.ord] - v_disc[x.ord]), 0)
    into v_lines, v_total
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select private.fiscal_payment_method(g) as method, sum(b.amount_cents)::bigint as cents
        from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
        where b.table_session_id = p_session and b.status = 'paid' and b.amount_cents > 0
          and (v_since is null or b.paid_at >= v_since)
        group by private.fiscal_payment_method(g)) m;
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (s.restaurant_id, p_session, v_ref, v_total,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb), 'reopenedAddOn', v_ref <> 's-' || p_session))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  if v_id is not null and v_ref <> 's-' || p_session then
    perform private.log_system_audit(s.restaurant_id, 'fiscal.reopened_add_on', 'fiscal_document', v_id, 'Itens acrescentados depois de reabrir a comanda',
      null, jsonb_build_object('sessionId', p_session, 'totalCents', v_total));
  end if;
  return v_id;
end $$;
