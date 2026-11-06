-- Correções da revisão das respostas de 05/11.
begin;
select plan(7);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.sub(p_status text, p_end interval) returns void language plpgsql as $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  delete from private.noowe_founder_benefit where restaurant_id = r;
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
    values (r, 'essencial', 'monthly', p_status, case when p_status = 'trial' then now() + p_end end, now() + p_end - interval '1 month', now() + p_end);
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001');
  delete from private.noowe_credit_lots where restaurant_id = r;
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_promo_codes set is_active = true where code = 'FUNDADOR';
end $$;

do $$
declare t uuid; rid uuid;
begin
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at)
    values (pg_temp.ctx('r'), 'asaas', 'pix', 10000, 'completed', 'r89-' || gen_random_uuid(), 'order', now(), now(), now()) returning id into t;
  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status) values (pg_temp.ctx('r'), t, 4000, 'Teste', 'awaiting_balance');
  assert private.refund_available_cents(t) = 6000, 'esperando saldo ainda reserva: ' || private.refund_available_cents(t);
end $$;
select pass('estorno esperando saldo reserva o valor: não dá para estornar de novo');

do $$
declare n integer;
begin
  perform pg_temp.sub('trial', interval '5 days');
  perform private.subscription_tick();
  assert (select count(*) from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal' and status = 'open') = 1, 'fatura do fim do teste';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_apply_promo_code(pg_temp.ctx('r'), 'FUNDADOR');
  select count(*) into n from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal' and status in ('open', 'overdue');
  assert n = 0, 'nenhuma fatura cheia em aberto: ' || n;
  assert (select status from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal' order by created_at limit 1) = 'void', 'a antiga é anulada';
end $$;
select pass('código de fundador no fim do teste: a fatura cheia já gerada é anulada, sem duas faturas para o mesmo período');

do $$
declare i public.subscription_invoices; v_month date := (now() at time zone 'America/Sao_Paulo')::date; lot uuid;
begin
  perform pg_temp.sub('active', interval '5 days');
  insert into private.noowe_credit_lots(restaurant_id, month, tier_code, amount_cents, remaining_cents, available_from, expires_at)
    values (pg_temp.ctx('r'), v_month, 'silver', 3000, 3000, v_month - 1, v_month + 90) returning id into lot;
  insert into private.noowe_pay_compensations(restaurant_id, kind, amount_cents) values (pg_temp.ctx('r'), 'tariff_on_refund', 500);
  perform private.subscription_tick();
  select * into i from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal';
  assert (select remaining_cents from private.noowe_credit_lots where id = lot) < 3000, 'usou crédito';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_cancel_subscription(pg_temp.ctx('r'), 'Fechando');
  assert (select status from public.subscription_invoices where id = i.id) = 'void', 'anulada';
  assert (select remaining_cents from private.noowe_credit_lots where id = lot) = 3000, 'o crédito volta';
  assert (select applied_cents from private.noowe_pay_compensations where restaurant_id = pg_temp.ctx('r') and kind = 'tariff_on_refund' and status = 'open') = 0, 'o ajuste volta';
end $$;
select pass('fatura anulada devolve os créditos e os ajustes que tinha usado');

do $$
declare i public.subscription_invoices;
begin
  perform pg_temp.sub('active', interval '5 days');
  perform private.subscription_tick();
  update public.subscription_invoices set status = 'paid', paid_at = now() where restaurant_id = pg_temp.ctx('r') and kind = 'renewal';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_cancel_subscription(pg_temp.ctx('r'), 'Fechando');
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 minute', renewal_invoiced_for = now() - interval '1 minute' where restaurant_id = pg_temp.ctx('r');
  update public.subscription_invoices set period_start = now() - interval '1 minute' where restaurant_id = pg_temp.ctx('r') and kind = 'renewal';
  perform private.subscription_tick();
  assert (select status from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r')) = 'active', 'o período pago segue';
  assert (select cancel_requested_at is not null from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r')), 'o cancelamento continua pedido';
  assert (select count(*) from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal') = 1, 'sem nova fatura';
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 second' where restaurant_id = pg_temp.ctx('r');
  perform private.subscription_tick();
  assert (select status from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r')) = 'canceled', 'no fim do período pago, encerra';
end $$;
select pass('cancelar com o próximo período já pago: o serviço vai até o fim dele, e só então encerra');

do $$
declare v bigint;
begin
  perform pg_temp.sub('active', interval '5 days');
  insert into private.noowe_promo_redemptions(restaurant_id, code, started_at, months_billed) values (pg_temp.ctx('r'), 'FUNDADOR', now() - interval '3 months', 3);
  perform private.subscription_tick();
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_change_plan(pg_temp.ctx('r'), 'profissional');
  select sum(total_cents) into v from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'upgrade';
  assert coalesce(v, 0) = 0, 'nos meses grátis, a diferença também é grátis: ' || coalesce(v, 0);
end $$;
select pass('upgrade de fundador nos meses grátis não cobra a diferença');

do $$
begin
  perform pg_temp.sub('active', interval '20 days');
  perform set_config('noowe.param_author', 'teste', true);
  insert into private.noowe_promo_codes(code, kind, duration_months, percent_off_bps) values ('METADE89', 'percent_off', 3, 5000) on conflict do nothing;
  insert into private.noowe_promo_redemptions(restaurant_id, code, started_at, months_billed) values (pg_temp.ctx('r'), 'METADE89', now(), 0);
  insert into private.noowe_founder_benefit(restaurant_id, active) values (pg_temp.ctx('r'), false);
  perform private.invoice_create(pg_temp.ctx('r'), 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert (select status from private.noowe_promo_redemptions where restaurant_id = pg_temp.ctx('r')) = 'active', 'outro código não acaba';
  -- Teste: troca de ciclo depois da fatura do próximo período vale no período seguinte.
  perform pg_temp.sub('trial', interval '5 days');
  perform private.subscription_tick();
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_change_plan(pg_temp.ctx('r'), 'profissional', 'annual');
  assert (select next_billing_cycle = 'annual' and renewal_plan_code = 'profissional' from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r')), 'ciclo novo no período seguinte';
end $$;
select pass('desligar o benefício de fundador não encerra outro código; no teste, o ciclo novo vale no período seguinte');
-- Validação das notas de 06/11: a fatura anulada devolve também os meses do código.
-- Na fase de 50% (depois dos 12 meses grátis), a fatura tem valor e fica em aberto; o mês grátis gera fatura zerada, já paga.
do $$
declare i public.subscription_invoices; m integer;
begin
  perform pg_temp.sub('active', interval '5 days');
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_apply_promo_code(pg_temp.ctx('r'), 'FUNDADOR');
  update private.noowe_promo_redemptions set months_billed = 12 where restaurant_id = pg_temp.ctx('r');
  perform private.subscription_tick();
  select * into i from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal' and status <> 'void' order by created_at desc limit 1;
  assert i.status = 'open' and i.total_cents > 0 and i.promo_months = 1, 'fatura da fase de 50%, em aberto: ' || i.status || ' ' || i.total_cents || ' ' || i.promo_months;
  select months_billed into m from private.noowe_promo_redemptions where restaurant_id = pg_temp.ctx('r');
  assert m = 13, 'contou o mês: ' || m;
  perform public.restaurant_cancel_subscription(pg_temp.ctx('r'), 'Fechando');
  assert (select status from public.subscription_invoices where id = i.id) = 'void', 'anulada';
  assert (select months_billed from private.noowe_promo_redemptions where restaurant_id = pg_temp.ctx('r')) = 12, 'o mês volta ao código';
end $$;
select pass('fatura anulada devolve os meses que tinha contado do código promocional');
select * from finish();
rollback;
