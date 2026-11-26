-- Decisões do QA de 26/11: RV-04 (tarefa do Pix sem saldo), RV-06 (excedente na fatura do mês),
-- RV-08 (FUNDADOR com validade e limite) e SG-04 (cupom oculto ou de grupo não é legível por outra conta).
begin;
select plan(6);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.msg_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
insert into _ctx values ('r', 'c1000000-0000-4000-8000-000000000002'), ('dono', 'c1000000-0000-4000-8000-000000000001');
create function pg_temp.sub(p_end interval) returns void language plpgsql as $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  delete from private.noowe_credit_lots where restaurant_id = r;
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, current_period_start, current_period_end)
    values (r, 'essencial', 'monthly', 'active', now() + p_end - interval '1 month', now() + p_end);
end $$;

-- RV-04
do $$
declare r uuid := pg_temp.ctx('r'); t uuid; rid uuid; k text;
begin
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at, customer_id)
    values (r, 'asaas', 'pix', 4321, 'completed', 'r109-' || gen_random_uuid(), 'order', now(), now(), now(), pg_temp.ctx('dono')) returning id into t;
  update public.gateway_transactions set refund_requested_at = now() where id = t;
  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status)
    values (r, t, 4321, 'Prato errado', 'processing') returning id into rid;
  k := 'refund_no_balance:' || rid;
  perform public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert (select count(*) from public.staff_tasks where dedupe_key = k and status = 'open') = 1, 'uma tarefa aberta';
  assert (select title from public.staff_tasks where dedupe_key = k) like '%43,21%', 'com o valor';
  assert (select detail from public.staff_tasks where dedupe_key = k) like '%Prato errado%', 'com o motivo';
  update public.payment_refunds set status = 'processing' where id = rid;
  perform public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert (select count(*) from public.staff_tasks where dedupe_key = k) = 1, 'sem tarefa repetida';
  update public.payment_refunds set status = 'processing' where id = rid;
  perform public.service_refund_record(rid, 'sent');
  assert (select status from public.staff_tasks where dedupe_key = k) = 'done', 'o estorno saiu: a tarefa fecha';
end $$;
select pass('RV-04: Pix sem saldo vira uma tarefa com valor, cliente e motivo, e fecha quando o estorno sai');

-- RV-06
do $$
declare r uuid := pg_temp.ctx('r'); s public.restaurant_subscriptions; i public.subscription_invoices;
begin
  perform set_config('noowe.param_author', 'teste 109', true);
  update private.noowe_plans set order_allowance = 0 where code = 'essencial';
  perform pg_temp.sub(interval '3 days');
  perform private.subscription_tick();
  assert (select count(*) from public.subscription_invoices where restaurant_id = r and kind = 'renewal' and status = 'open') = 1, 'fatura do mês saiu';
  insert into public.orders(restaurant_id, customer_id, created_at) values (r, pg_temp.ctx('dono'), now() - interval '1 hour'), (r, pg_temp.ctx('dono'), now() - interval '1 hour');
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 minute', renewal_invoiced_for = now() - interval '1 minute' where restaurant_id = r;
  update public.subscription_invoices set period_start = now() - interval '1 minute' where restaurant_id = r;
  perform private.subscription_tick();
  assert not exists (select 1 from public.subscription_invoices where restaurant_id = r and kind = 'overage'), 'sem fatura própria de excedente';
  select * into i from public.subscription_invoices where restaurant_id = r and kind = 'renewal' and status = 'open';
  assert exists (select 1 from public.subscription_invoice_lines l where l.invoice_id = i.id and l.kind = 'overage' and l.amount_cents > 0), 'excedente é linha da fatura do mês';
  assert exists (select 1 from public.subscription_invoice_lines l where l.invoice_id = i.id and l.kind = 'plan'), 'junto com o plano';
  assert (select count(*) from public.subscription_invoices where restaurant_id = r and kind = 'renewal' and status = 'open') = 1, 'uma fatura do mês só';
end $$;
select pass('RV-06: o excedente entra como linha na fatura do mês, não em fatura própria');

-- RV-08
do $$
declare c private.noowe_promo_codes;
begin
  select * into c from private.noowe_promo_codes where code = 'FUNDADOR';
  assert c.validity_days = 90 and c.max_uses = 100, 'parâmetros: ' || row_to_json(c);
  assert private.promo_code_expires_at(c) = c.valid_from + interval '90 days', 'validade a partir do início';
end $$;
select pass('RV-08: FUNDADOR tem 90 dias de validade e 100 restaurantes, como parâmetro');

do $$
declare r uuid := pg_temp.ctx('r'); m text;
begin
  perform set_config('noowe.param_author', 'teste 109', true);
  perform pg_temp.sub(interval '10 days');
  insert into private.noowe_promo_redemptions(restaurant_id, code) select id, 'FUNDADOR' from public.restaurants where id <> r
    and not exists (select 1 from private.noowe_promo_redemptions x where x.restaurant_id = restaurants.id) limit 1;
  update private.noowe_promo_codes set is_active = true, max_uses = (select count(*) from private.noowe_promo_redemptions where code = 'FUNDADOR') where code = 'FUNDADOR';
  perform pg_temp.act(pg_temp.ctx('dono'));
  m := pg_temp.msg_of(format('select public.restaurant_apply_promo_code(%L, %L)', r, 'FUNDADOR'));
  assert m like '%limite de % restaurantes%', 'limite: ' || m;
  update private.noowe_promo_codes set max_uses = 100, valid_from = now() - interval '91 days' where code = 'FUNDADOR';
  m := pg_temp.msg_of(format('select public.restaurant_apply_promo_code(%L, %L)', r, 'FUNDADOR'));
  assert m like 'Este código venceu em%', 'validade: ' || m;
  update private.noowe_promo_codes set valid_from = now() - interval '1 day' where code = 'FUNDADOR';
  m := pg_temp.msg_of(format('select public.restaurant_apply_promo_code(%L, %L)', r, 'FUNDADOR'));
  assert m = 'ok', 'dentro da validade e do limite, vale: ' || m;
end $$;
select pass('RV-08: o servidor recusa o código vencido ou esgotado com mensagem clara, e aceita dentro do limite');

-- SG-04
do $$
declare r uuid := pg_temp.ctx('r'); u uuid := gen_random_uuid(); hid uuid; vip uuid; pub uuid; v_seen int; v_list text;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  hid := (public.restaurant_upsert_coupon(r, jsonb_build_object('code', 'OCULTO109', 'title', 'Oculto', 'discountKind', 'percent', 'discountBps', 1000, 'isVisible', false,
    'validFrom', now() - interval '1 day', 'validUntil', now() + interval '30 days'))->>'id')::uuid;
  vip := (public.restaurant_upsert_coupon(r, jsonb_build_object('code', 'VIP109', 'title', 'VIP', 'discountKind', 'percent', 'discountBps', 1000, 'isVisible', true, 'audience', 'vip',
    'validFrom', now() - interval '1 day', 'validUntil', now() + interval '30 days'))->>'id')::uuid;
  pub := (public.restaurant_upsert_coupon(r, jsonb_build_object('code', 'TODOS109', 'title', 'Todos', 'discountKind', 'percent', 'discountBps', 1000, 'isVisible', true,
    'validFrom', now() - interval '1 day', 'validUntil', now() + interval '30 days'))->>'id')::uuid;
  insert into auth.users(id, email) values (u, u || '@sg04.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  perform pg_temp.act(u);
  set local role authenticated;
  select count(*) into v_seen from public.promotions where id in (hid, vip);
  select string_agg(code, ',') into v_list from public.promotions where id in (hid, vip, pub);
  reset role;
  assert v_seen = 0, 'outra conta não lê cupom oculto nem de grupo: ' || coalesce(v_list, '');
  assert v_list = 'TODOS109', 'o cupom aberto segue visível: ' || coalesce(v_list, '');
  assert pg_temp.msg_of(format('select public.restaurant_list_coupons(%L)', r)) <> 'ok', 'a lista do restaurante é só da casa';
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_seen from public.promotions where id in (hid, vip);
  reset role;
  assert v_seen = 0, 'sem login, também não';
end $$;
select pass('SG-04: cupom oculto ou de grupo não aparece a outra conta nem sem login');

-- O cliente do grupo lê o cupom do grupo.
do $$
declare r uuid := pg_temp.ctx('r'); u uuid := gen_random_uuid(); v_seen int;
begin
  insert into auth.users(id, email) values (u, u || '@sg04.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  insert into public.customer_profiles(user_id, restaurant_id, segment, total_visits, total_spent, avg_ticket, favorite_items, dietary_preferences, created_at, updated_at) values (u, r, 'vip', 1, 0, 0, '[]', '[]', now(), now());
  perform pg_temp.act(u);
  set local role authenticated;
  select count(*) into v_seen from public.promotions where code = 'VIP109';
  reset role;
  assert v_seen = 1, 'o VIP vê o cupom VIP';
end $$;
select pass('SG-04: quem é do grupo segue vendo o cupom do grupo');

select * from finish();
rollback;
