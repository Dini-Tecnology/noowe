-- Resposta 66: a fatura do próximo período sai 7 dias antes, com vencimento no aniversário da assinatura.
begin;
select plan(6);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.sub(p_plan text, p_end interval) returns void language plpgsql as $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, current_period_start, current_period_end)
    values (r, p_plan, 'monthly', 'active', now() + p_end - interval '1 month', now() + p_end);
end $$;
create function pg_temp.renewals() returns setof public.subscription_invoices language sql as $$
  select * from public.subscription_invoices where restaurant_id = pg_temp.ctx('r') and kind = 'renewal' order by created_at $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001');
  delete from private.noowe_credit_lots where restaurant_id = r;
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
end $$;

do $$
declare lead int;
begin
  select invoice_lead_days into lead from private.noowe_billing_settings;
  assert lead = 7, 'parâmetro: ' || lead;
  perform pg_temp.sub('essencial', make_interval(days => lead + 3));
  perform private.subscription_tick();
  assert not exists (select 1 from pg_temp.renewals()), 'antes do prazo, nada';
end $$;
select pass('antes dos 7 dias, nenhuma fatura do próximo período');

do $$
declare s public.restaurant_subscriptions; i public.subscription_invoices;
begin
  perform pg_temp.sub('essencial', interval '5 days');
  perform private.subscription_tick();
  perform private.subscription_tick();
  select * into s from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r');
  assert (select count(*) from pg_temp.renewals()) = 1, 'uma só';
  select * into i from pg_temp.renewals();
  assert i.due_at = s.current_period_end and i.period_start = s.current_period_end, 'vence no aniversário e cobre o próximo período';
  assert s.plan_code = 'essencial' and s.status = 'active' and s.current_period_end > now(), 'o período atual não muda';
end $$;
select pass('dentro dos 7 dias, sai uma fatura do próximo período, vencendo no aniversário, sem mexer no período atual');

do $$
declare s public.restaurant_subscriptions; v_end timestamptz;
begin
  -- Chegou o aniversário: o período vira com o plano já faturado, sem segunda fatura.
  select current_period_end into v_end from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r');
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 minute', renewal_invoiced_for = now() - interval '1 minute' where restaurant_id = pg_temp.ctx('r');
  update public.subscription_invoices set period_start = now() - interval '1 minute' where restaurant_id = pg_temp.ctx('r');
  perform private.subscription_tick();
  select * into s from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r');
  assert (select count(*) from pg_temp.renewals()) = 1, 'sem segunda fatura';
  assert s.current_period_start > now() - interval '2 minutes' and s.current_period_end > now() + interval '27 days', 'virou: ' || s.current_period_end;
end $$;
select pass('no aniversário, o período vira sem gerar segunda fatura');

do $$
declare j jsonb; i public.subscription_invoices;
begin
  perform pg_temp.sub('essencial', interval '5 days');
  perform private.subscription_tick();
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_change_plan(pg_temp.ctx('r'), 'profissional');
  assert (select renewal_plan_code from public.restaurant_subscriptions where restaurant_id = pg_temp.ctx('r')) = 'profissional', 'próximo período no plano novo';
  assert exists (select 1 from public.subscription_invoice_lines l join public.subscription_invoices x on x.id = l.invoice_id
    where x.restaurant_id = pg_temp.ctx('r') and l.description like 'Diferença do próximo período%' and l.amount_cents = 34900 - 19900), 'cobra a diferença do próximo período';
end $$;
select pass('upgrade depois da fatura gerada: o próximo período passa ao plano novo, com a diferença em fatura própria');

do $$
declare j jsonb;
begin
  perform pg_temp.sub('essencial', interval '5 days');
  perform private.subscription_tick();
  update public.subscription_invoices set provider_ref = 'pay_x' where restaurant_id = pg_temp.ctx('r') and kind = 'renewal';
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_cancel_subscription(pg_temp.ctx('r'), 'Fechando a casa');
  assert (select status from pg_temp.renewals()) = 'void', 'a fatura do próximo período deixa de valer';
  assert public.service_invoice_cancel_ref((select id from pg_temp.renewals())) = 'pay_x', 'a cobrança vai ser cancelada no Asaas';
  perform public.service_invoice_paid((select id from pg_temp.renewals()));
  assert (select status from pg_temp.renewals()) = 'void', 'pagamento atrasado não reativa';
  assert exists (select 1 from public.audit_logs a where a.action = 'plan.void_invoice_paid' and a.entity_id = (select id from pg_temp.renewals())), 'fica registrado para devolver';
end $$;
select pass('cancelar depois da fatura gerada anula a fatura e a cobrança; pagamento que chega depois fica registrado para devolver');

do $$
begin
  perform pg_temp.sub('essencial', interval '5 days');
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 minute' where restaurant_id = pg_temp.ctx('r');
  perform private.subscription_tick();
  assert (select count(*) from pg_temp.renewals()) = 1, 'atrasou a varredura: a fatura sai na virada';
  assert (select due_at from pg_temp.renewals()) > now() + interval '1 day', 'com prazo para pagar';
end $$;
select pass('se a varredura atrasou, a fatura sai na virada, com prazo para pagar');
select * from finish();
rollback;
