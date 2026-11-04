-- P3: um teste por critério do servidor.
begin;
select plan(18);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create function pg_temp.msg_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
-- Comanda: pessoas e itens em centavos; devolve sid e usuários.
create function pg_temp.scene(p_people int, p_cents bigint[]) returns jsonb language plpgsql as $$
declare r uuid := pg_temp.ctx('r'); tbl jsonb; sid uuid; o uuid; u uuid; users jsonb := '[]'; parts jsonb := '[]'; pid uuid; i int; item uuid; items jsonb := '[]';
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'p3-' || gen_random_uuid(), 8);
  for i in 1 .. p_people loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@p3.test');
    insert into public.profiles(id) values (u) on conflict do nothing;
    perform pg_temp.act(u);
    sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    users := users || to_jsonb(u); parts := parts || to_jsonb(pid);
  end loop;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, (users->>0)::uuid, sid) returning id into o;
  for i in 1 .. cardinality(p_cents) loop
    insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents, diner_id)
      values (o, pg_temp.ctx('item'), 1, p_cents[i]::numeric / 100, p_cents[i]::numeric / 100, p_cents[i], (parts->>0)::uuid) returning id into item;
    items := items || to_jsonb(item);
  end loop;
  perform pg_temp.act((users->>0)::uuid);
  return jsonb_build_object('sid', sid, 'users', users, 'parts', parts, 'items', items, 'order', o);
end $$;
create function pg_temp.commit_equal(s jsonb, p_person int default 0) returns void language plpgsql as $$
begin
  perform pg_temp.act((s->'users'->>p_person)::uuid);
  perform public.customer_bill_split_commit((s->>'sid')::uuid, 'equal', '{}', null, gen_random_uuid());
end $$;
create function pg_temp.share(s jsonb, p_person int default 0) returns public.bill_shares language sql as $$
  select * from public.bill_shares where table_session_id = (s->>'sid')::uuid and participant_id = (s->'parts'->>p_person)::uuid and status = 'open' $$;
create function pg_temp.coupon(p_code text, p_extra jsonb default '{}') returns uuid language plpgsql as $$
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  return (public.restaurant_upsert_coupon(pg_temp.ctx('r'), jsonb_build_object('code', p_code, 'title', 'Cupom ' || p_code, 'discountKind', 'percent', 'discountBps', 1000,
    'validFrom', now() - interval '1 day', 'validUntil', now() + interval '30 days') || p_extra)->>'id')::uuid;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid(); m uuid;
begin
  select id into m from public.menu_items where restaurant_id = r limit 1;
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', g), ('item', m);
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (g, g || '@p3.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
  update public.promotions set status = 'inactive' where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}' where restaurant_id = r and not prepaid_required;
  update private.dev_flags set enabled = true where key = 'simulate_share_payment';
end $$;

-- Criação (critério 1, no servidor)
do $$
declare r uuid := pg_temp.ctx('r');
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_upsert_coupon(%L, '{"title":"x"}')$q$, r)) = '22023', 'diga o que o cliente ganha';
  assert pg_temp.state_of(format($q$select public.restaurant_upsert_coupon(%L, '{"discountKind":"percent","discountBps":0,"title":"x"}')$q$, r)) = '22023', 'percentual';
  assert (public.restaurant_upsert_coupon(r, jsonb_build_object('title', 'Sem código', 'discountKind', 'fixed', 'discountCents', 500, 'validFrom', now(), 'validUntil', now() + interval '1 day'))->>'code') is not null, 'gera o código';
  perform pg_temp.act(gen_random_uuid());
  assert pg_temp.state_of(format($q$select public.restaurant_upsert_coupon(%L, '{}')$q$, r)) = '42501', 'só a casa cria';
end $$;
select pass('critério 1: criação valida o que importa e gera o código');

-- Critério 2: cada regra, com a mensagem.
do $$
declare s jsonb; c uuid; dow_other integer := (extract(dow from now() at time zone 'America/Sao_Paulo')::integer + 1) % 7; share uuid;
begin
  c := pg_temp.coupon('VENCIDO', jsonb_build_object('validFrom', now() - interval '10 days', 'validUntil', now() - interval '1 day'));
  c := pg_temp.coupon('OUTRODIA', jsonb_build_object('dow', jsonb_build_array(dow_other)));
  c := pg_temp.coupon('MINIMO', '{"minOrderCents":8000}');
  c := pg_temp.coupon('FORAHORA', '{"hoursFrom":"00:00","hoursUntil":"00:01"}');
  c := pg_temp.coupon('SOQUICK', '{"services":["quick_service"]}');
  c := pg_temp.coupon('SOVIP', '{"audience":"vip"}');
  s := pg_temp.scene(1, '{5000}');
  perform pg_temp.commit_equal(s);
  share := (pg_temp.share(s)).id;
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'NAOEXISTE')$q$, share)) = 'Cupom não encontrado', 'não existe';
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'VENCIDO')$q$, share)) like 'Este cupom venceu%', 'validade';
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'OUTRODIA')$q$, share)) like 'Válido %', 'dia';
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'MINIMO')$q$, share)) like 'Pedido mínimo de R$ 80%', 'mínimo: ' || pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'MINIMO')$q$, share));
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'FORAHORA')$q$, share)) = 'Válido das 0h às 0h01', 'horário';
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'SOQUICK')$q$, share)) = 'Este cupom não vale neste tipo de serviço', 'serviço';
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'SOVIP')$q$, share)) = 'Este cupom é para clientes VIP', 'público';
  assert (pg_temp.share(s)).coupon_id is null, 'nenhum grudou';
end $$;
select pass('critério 2: o servidor valida serviço, dia, horário, mínimo e público, e diz por que não vale');

-- Grupos da ficha
do $$
declare r uuid := pg_temp.ctx('r'); u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@p3.test');
  insert into public.profiles(id, birth_date) values (u, (now() at time zone 'America/Sao_Paulo')::date - interval '30 years') on conflict (id) do update set birth_date = excluded.birth_date;
  assert private.customer_in_group(r, u, 'new', null), 'sem visita é novo';
  assert private.customer_in_group(r, u, 'birthday', null), 'aniversariante do mês';
  assert not private.customer_in_group(r, u, 'vip', null), 'não é VIP';
  insert into public.customer_profiles(user_id, restaurant_id, segment, total_visits, total_spent, avg_ticket, favorite_items, dietary_preferences, last_visit_at, created_at, updated_at) values (u, r, 'vip', 3, 0, 0, '[]', '[]', now() - interval '40 days', now(), now());
  assert private.customer_in_group(r, u, 'vip', null), 'VIP';
  assert not private.customer_in_group(r, u, 'new', null), 'não é mais novo';
  assert private.customer_in_group(r, u, 'inactive', 30), 'sem visita há 30 dias';
  assert not private.customer_in_group(r, u, 'inactive', 60), 'não há 60';
end $$;
select pass('grupos da ficha: VIP, aniversariantes, sem visita há X dias, clientes novos');

-- Critérios 3 e 5
do $$
declare s jsonb := pg_temp.scene(2, '{20000}'); c uuid := pg_temp.coupon('DEZ'); v public.bill_shares; j jsonb; o public.bill_shares; tx public.gateway_transactions; f bigint; u uuid;
begin
  perform pg_temp.commit_equal(s);
  u := (s->'users'->>0)::uuid;
  perform pg_temp.act(u);
  j := public.customer_apply_coupon((pg_temp.share(s, 0)).id, 'dez');
  v := pg_temp.share(s, 0); o := pg_temp.share(s, 1);
  assert v.base_cents = 10000 and v.coupon_discount_cents = 1000, 'só na parte de quem aplicou';
  assert v.service_fee_cents = 900 and v.amount_cents = 9900, 'desconto antes da taxa';
  assert o.coupon_discount_cents = 0 and o.amount_cents = 11000, 'a parte do outro não muda';
  assert private.session_consumption_balance((s->>'sid')::uuid) = 20000, 'o saldo de consumo segue inteiro';
  -- Segundo cupom substitui, não soma.
  perform pg_temp.coupon('CINCO', '{"discountBps":500}');
  perform pg_temp.act(u);
  perform public.customer_apply_coupon(v.id, 'CINCO');
  assert (pg_temp.share(s, 0)).coupon_discount_cents = 500, 'não soma: troca';
  perform public.customer_apply_coupon(v.id, 'DEZ');
  -- Outra pessoa não mexe na parte de ninguém.
  perform pg_temp.act((s->'users'->>1)::uuid);
  assert pg_temp.state_of(format($q$select public.customer_apply_coupon(%L, 'DEZ')$q$, v.id)) = 'P0002', 'só a própria parte';
  -- Refazer a divisão mantém o cupom da pessoa.
  perform pg_temp.commit_equal(s, 1);
  assert (pg_temp.share(s, 0)).coupon_id = c, 'o cupom acompanha a pessoa';
  -- Pagar: taxa NOOWE incide sobre o pago, consumo fecha.
  tx := private.reserve_share_payment(u, (pg_temp.share(s, 0)).id, 'credit_card', 0, gen_random_uuid(), 'simulated');
  assert tx.amount_cents = 9900, 'cobra o valor com desconto';
  perform private.apply_payment_event(tx.id, 'simulated', 'ok-' || tx.id, 'R', 'confirmed', tx.amount_cents);
  assert exists (select 1 from public.promotion_redemptions r where r.promotion_id = c and r.user_id = u and r.status = 'applied' and r.discount_cents = 1000), 'uso registrado';
  perform pg_temp.act((s->'users'->>1)::uuid);
  perform public.customer_pay_share((pg_temp.share(s, 1)).id, 'pix', gen_random_uuid());
  assert (select status from public.table_sessions where id = (s->>'sid')::uuid) = 'ended', 'consumo fecha';
  assert (select sum(base_cents) from public.bill_shares where table_session_id = (s->>'sid')::uuid and status = 'paid') = 20000, 'soma do consumo exata';
  -- Depois de usar, não aplica de novo na mesma pessoa.
  assert private.coupon_refusal((select p from public.promotions p where p.id = c), null, u, 10000) = 'Você já usou este cupom', 'limite por cliente';
end $$;
select pass('critérios 3 e 5: um cupom por pessoa, só na própria parte, antes da taxa; o consumo segue fechando');

-- Critério 5: nota e taxa NOOWE.
do $$
declare r uuid := pg_temp.ctx('r'); s jsonb; d uuid; c uuid := pg_temp.coupon('NOTA'); t public.gateway_transactions; u uuid; doc public.fiscal_documents; fee bigint;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  s := pg_temp.scene(1, '{10000}');
  perform pg_temp.commit_equal(s);
  u := (s->'users'->>0)::uuid;
  perform pg_temp.act(u);
  perform public.customer_apply_coupon((pg_temp.share(s, 0)).id, 'NOTA');
  t := private.reserve_share_payment(u, (pg_temp.share(s, 0)).id, 'credit_card', 0, gen_random_uuid(), 'asaas');
  fee := (select fee_cents from private.noowe_pay_transaction_fees where gateway_transaction_id = t.id);
  assert t.amount_cents = 9900 and fee = private.noowe_fee_cents(9900, private.noowe_pay_rate_bps(r, 'credit_card')), 'a taxa NOOWE incide sobre o valor pago';
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'R', 'confirmed', t.amount_cents);
  select * into doc from public.fiscal_documents where table_session_id = (s->>'sid')::uuid;
  assert doc.total_cents = 9000, 'nota pelo valor com desconto: ' || coalesce(doc.total_cents::text, 'sem nota');
  assert (select sum((l->>'discountCents')::bigint) from jsonb_array_elements(doc.snapshot->'lines') l) = 1000, 'sai como desconto na nota';
  assert private.fiscal_paid_cents('table_session', (s->>'sid')::uuid) = 9000, 'venda para o fisco';
end $$;
select pass('critério 5: sai como desconto na nota, e a taxa NOOWE incide sobre o valor pago');

-- Critério 4
do $$
declare s jsonb; c uuid := pg_temp.coupon('AUTO', '{"isAuto":true,"discountBps":2000}'); o uuid; j jsonb; u uuid := gen_random_uuid(); r uuid := pg_temp.ctx('r');
begin
  perform pg_temp.coupon('AUTOPEQ', '{"isAuto":true,"discountBps":100}');
  s := pg_temp.scene(1, '{10000}');
  perform pg_temp.commit_equal(s);
  assert (pg_temp.share(s)).coupon_id = c and (pg_temp.share(s)).coupon_discount_cents = 2000, 'entra sozinho, o melhor';
  -- Pedido pago antes do preparo.
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[] where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip' where restaurant_id = r and prepaid_required;
  insert into auth.users(id, email) values (u, u || '@p3.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id, service_model, order_type, total_cents, payment_status) values (r, u, 'quick_service', 'pickup', 5000, 'pending') returning id into o;
  j := public.service_payment_reserve_order(u, o, 'credit_card', gen_random_uuid());
  assert (j->>'amountCents')::bigint = 4000, 'automático no pedido: ' || (j->>'amountCents');
  assert (select coupon_id from public.orders where id = o) = c, 'gravado no pedido';
end $$;
select pass('critério 4: cupom automático entra sozinho quando a regra bate');

-- Critério 6
do $$
declare c uuid := pg_temp.coupon('LIM', '{"maxUses":1}'); a jsonb := pg_temp.scene(1, '{5000}'); b jsonb := pg_temp.scene(1, '{5000}');
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_set_coupon_active((select id from public.promotions where restaurant_id = pg_temp.ctx('r') and code = 'AUTO'), false);
  perform public.restaurant_set_coupon_active((select id from public.promotions where restaurant_id = pg_temp.ctx('r') and code = 'AUTOPEQ'), false);
  perform pg_temp.commit_equal(a);
  perform pg_temp.commit_equal(b);
  perform pg_temp.act((a->'users'->>0)::uuid);
  perform public.customer_apply_coupon((pg_temp.share(a)).id, 'LIM');
  perform pg_temp.act((b->'users'->>0)::uuid);
  assert pg_temp.msg_of(format($q$select public.customer_apply_coupon(%L, 'LIM')$q$, (pg_temp.share(b)).id)) = 'Este cupom esgotou', 'não estoura: a linha do cupom é a fila';
  -- Quem desiste devolve o uso.
  perform pg_temp.act((a->'users'->>0)::uuid);
  perform public.customer_remove_coupon((pg_temp.share(a)).id);
  perform pg_temp.act((b->'users'->>0)::uuid);
  assert (public.customer_apply_coupon((pg_temp.share(b)).id, 'LIM')->>'discountCents')::bigint = 500, 'o uso voltou';
end $$;
select pass('critério 6: o limite de usos não estoura; quem desiste devolve o uso');

-- Critério 7
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.coupon('TRAVA'); s jsonb := pg_temp.scene(1, '{5000}'); o public.promotions; p jsonb; v_until timestamptz := now() + interval '90 days';
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  p := public.restaurant_upsert_coupon(r, jsonb_build_object('id', c, 'title', 'Novo nome', 'discountKind', 'percent', 'discountBps', 500, 'validFrom', now(), 'validUntil', now() + interval '10 days'));
  assert p->>'title' = 'Novo nome', 'antes do uso, muda tudo';
  perform pg_temp.commit_equal(s);
  perform pg_temp.act((s->'users'->>0)::uuid);
  perform public.customer_apply_coupon((pg_temp.share(s)).id, 'TRAVA');
  perform public.customer_pay_share((pg_temp.share(s)).id, 'pix', gen_random_uuid());
  perform pg_temp.act(pg_temp.ctx('dono'));
  p := public.restaurant_upsert_coupon(r, jsonb_build_object('id', c, 'title', 'Mudou', 'discountKind', 'percent', 'discountBps', 9000, 'validUntil', v_until, 'maxUses', 7));
  select * into o from public.promotions where id = c;
  assert o.title = 'Novo nome' and o.discount_bps = 500, 'depois do uso, a regra não muda';
  assert o.valid_until = v_until and o.max_uses = 7, 'só validade e limite';
  assert exists (select 1 from jsonb_array_elements(public.restaurant_list_coupons(r)) x where (x->>'id')::uuid = c and (x->>'locked')::boolean and (x->>'uses')::int = 1 and (x->>'discountGivenCents')::bigint = 250), 'relatório';
end $$;
select pass('critério 7: depois do primeiro uso, só validade e limite podem mudar');

-- Garçom aplica na comanda, a pedido do cliente sem app.
do $$
declare s jsonb := pg_temp.scene(1, '{10000}'); c uuid := pg_temp.coupon('BALCAO'); j jsonb; v public.bill_shares;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_record_bill_payment(%L, 'cash', %L, null, false, 0, null, null, 'NAOEXISTE')$q$, s->>'sid', gen_random_uuid())) = 'P0017', 'cupom inválido não passa';
  j := public.restaurant_record_bill_payment((s->>'sid')::uuid, 'cash', gen_random_uuid(), null, false, 0, null, null, 'BALCAO');
  select * into v from public.bill_shares where id = (j->>'shareId')::uuid;
  assert v.base_cents = 10000 and v.coupon_discount_cents = 1000 and v.amount_cents = 9900, 'desconto e taxa';
  assert (select status from public.table_sessions where id = (s->>'sid')::uuid) = 'ended', 'consumo fecha';
  assert exists (select 1 from public.promotion_redemptions r where r.promotion_id = c and r.bill_share_id = v.id and r.status = 'applied'), 'uso conta';
end $$;
select pass('o garçom aplica um cupom válido na comanda');

-- Divulgação
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.coupon('VISTO', '{"isVisible":true,"audience":"all"}'); u uuid := gen_random_uuid(); j jsonb;
begin
  insert into auth.users(id, email) values (u, u || '@p3.test');
  insert into public.profiles(id, marketing_consent) values (u, true) on conflict (id) do update set marketing_consent = true;
  insert into public.customer_profiles(user_id, restaurant_id, segment, total_visits, total_spent, avg_ticket, favorite_items, dietary_preferences, created_at, updated_at) values (u, r, 'regular', 1, 0, 0, '[]', '[]', now(), now());
  perform pg_temp.act(u);
  assert exists (select 1 from public.promotions x where x.restaurant_id = r and x.code = 'VISTO'), 'visível na página';
  assert pg_temp.state_of(format($q$select public.restaurant_send_coupon(%L)$q$, c)) = '42501', 'cliente não dispara';
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_send_coupon(c);
  assert (j->>'recipients')::int >= 1, 'envia a quem aceitou';
  assert exists (select 1 from public.notifications where user_id = u and metadata->>'code' = 'VISTO'), 'chegou';
  update public.profiles set marketing_consent = false where id = u;
  delete from public.notifications where user_id = u;
  perform public.restaurant_send_coupon(c);
  assert not exists (select 1 from public.notifications where user_id = u and metadata->>'code' = 'VISTO'), 'quem não aceitou não recebe';
end $$;
select pass('divulgação: cupom visível na página; envio só a quem aceitou receber ofertas');

-- O código de um cupom fora da página não é público, e o resgate antigo não existe mais.
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.coupon('SECRETO'); u uuid := gen_random_uuid(); v_seen int;
begin
  insert into auth.users(id, email) values (u, u || '@p3.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  perform pg_temp.act(u);
  set local role authenticated;
  select count(*) into v_seen from public.promotions x where x.id = c;
  reset role;
  assert v_seen = 0, 'cupom sem "visível" não aparece a quem não é da casa';
  assert to_regprocedure('public.customer_redeem_promotion(uuid)') is null, 'resgate que esgotava o cupom saiu';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  set local role authenticated;
  begin
    update public.promotions set max_uses = 1 where id = c;
    get diagnostics v_seen = row_count;
  exception when insufficient_privilege then v_seen := 0;
  end;
  reset role;
  assert v_seen = 0, 'o gerente não muda a tabela direto: só pelas funções, que auditam';
end $$;
select pass('cupom fora da página não é público; escrever só pelas funções');

-- A mensagem no formato do aditivo, e o que o formulário não pode deixar passar.
do $$
declare r uuid := pg_temp.ctx('r'); s jsonb := pg_temp.scene(1, '{10000}'); v_share uuid; v_today int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_days int[] := array[(v_today + 1) % 7, (v_today + 2) % 7, (v_today + 3) % 7];
begin
  assert private.coupon_days_label('{2,3,4}') = 'de terça a quinta', 'dias em sequência';
  assert private.coupon_days_label('{0,6}') = 'domingo, sábado', 'dias soltos';
  assert private.coupon_hour_label('15:00') = '15h' and private.coupon_hour_label('15:30') = '15h30', 'hora';
  perform pg_temp.coupon('MSG', jsonb_build_object('dow', '{2,3,4}'::int[], 'hoursFrom', '15:00', 'hoursUntil', '18:00'));
  assert private.coupon_refusal((select p from public.promotions p where p.restaurant_id = r and p.code = 'MSG') , null, null, 10000) is null
      or private.coupon_refusal((select p from public.promotions p where p.restaurant_id = r and p.code = 'MSG'), null, null, 10000) ~ '^Válido (de terça a quinta, das 15h às 18h|das 15h às 18h)$', 'mensagem do aditivo';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('title','x','discountKind','percent','discountBps',1000,'hoursFrom','25:00','hoursUntil','26:00','validFrom',now(),'validUntil',now() + interval '1 day'))) like 'Confira o horário%', 'hora inválida';
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('title','x','discountKind','percent','discountBps',1000,'hoursFrom','18:00','validFrom',now(),'validUntil',now() + interval '1 day'))) like 'Informe o início%', 'horário pela metade';
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('title','x','discountKind','percent','discountBps',1000,'scope','items','validFrom',now(),'validUntil',now() + interval '1 day'))) like 'Escolha onde%', 'escopo vazio';
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('title','x','discountKind','free_item','freeItemId',gen_random_uuid(),'validFrom',now(),'validUntil',now() + interval '1 day'))) like 'Escolha o item%', 'item de outra casa';
end $$;
select pass('a regra aparece como o aditivo pede, e horário ou escopo inválido nem chega a salvar');

-- Critério 9: criam Dono e Gerente; aplicam Garçom (mesas dele), Maître e Gerente; a cozinha não vê.
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.coupon('NOVE'); c2 uuid := pg_temp.coupon('PAUSADO'); g uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); m uuid := gen_random_uuid(); ck uuid := gen_random_uuid();
  s jsonb := pg_temp.scene(1, '{10000}'); v_table uuid; j jsonb; u uuid; v_seen int;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  foreach u in array array[g, g2, m, ck] loop
    insert into auth.users(id, email) values (u, u || '@p3.test');
    insert into public.profiles(id) values (u) on conflict do nothing;
  end loop;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'waiter', true), (g2, r, 'waiter', true), (m, r, 'maitre', true), (ck, r, 'cook', true);
  perform public.restaurant_set_coupon_active(c2, false);
  select table_id into v_table from public.table_sessions where id = (s->>'sid')::uuid;
  update public.tables set assigned_waiter_id = g where id = v_table;
  -- Garçom e Maître veem só os ativos, sem número; não criam.
  perform pg_temp.act(g);
  j := public.restaurant_list_coupons(r);
  assert exists (select 1 from jsonb_array_elements(j) x where x->>'code' = 'NOVE'), 'garçom vê o ativo';
  assert not exists (select 1 from jsonb_array_elements(j) x where x->>'code' = 'PAUSADO'), 'pausado não aparece ao garçom';
  assert not exists (select 1 from jsonb_array_elements(j) x where x ? 'revenueCents' or x ? 'uses' or x ? 'discountGivenCents'), 'relatório é de Dono e Gerente';
  assert pg_temp.state_of(format($q$select public.restaurant_upsert_coupon(%L, '{}')$q$, r)) = '42501', 'garçom não cria';
  assert pg_temp.state_of(format($q$select public.restaurant_set_coupon_active(%L, false)$q$, c)) = '42501', 'garçom não pausa';
  -- Outro garçom não aplica nesta mesa; o dela, sim.
  perform pg_temp.act(g2);
  assert pg_temp.msg_of(format($q$select public.restaurant_record_bill_payment(%L, 'cash', %L, 1000, false, 0, null, null, 'NOVE')$q$, s->>'sid', gen_random_uuid())) = 'Este cupom só pode ser aplicado nas suas mesas', 'mesa de outro garçom';
  perform pg_temp.act(g);
  j := public.restaurant_record_bill_payment((s->>'sid')::uuid, 'cash', gen_random_uuid(), 1000, false, 0, null, null, 'NOVE');
  assert (select coupon_id from public.bill_shares where id = (j->>'shareId')::uuid) = c, 'garçom aplica na mesa dele';
  perform pg_temp.act(m);
  j := public.restaurant_list_coupons(r);
  assert jsonb_array_length(j) > 0, 'maître vê';
  -- A cozinha não acessa, e a fila do KDS não traz desconto.
  perform pg_temp.act(ck);
  assert pg_temp.state_of(format($q$select public.restaurant_list_coupons(%L)$q$, r)) = '42501', 'cozinha não vê cupons';
  set local role authenticated;
  select count(*) into v_seen from public.promotions x where x.id = c;
  reset role;
  assert v_seen = 0, 'cozinha não lê a tabela de cupons';
  assert public.restaurant_get_kds_queue(p_restaurant_id => r)::text !~* 'coupon|discount|cupom|desconto', 'KDS mostra só o item';
end $$;
select pass('critério 9: Garçom nas mesas dele, Maître e Gerente aplicam; a cozinha não vê desconto');

-- Painel: status e relatório.
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.coupon('PAINEL'); ag uuid := pg_temp.coupon('AGENDADO', jsonb_build_object('validFrom', now() + interval '2 days')); lim uuid := pg_temp.coupon('CHEIO', '{"maxUses":1}');
  s jsonb := pg_temp.scene(1, '{10000}'); u uuid; v public.bill_shares; tx public.gateway_transactions; j jsonb; x jsonb;
begin
  u := (s->'users'->>0)::uuid;
  perform pg_temp.commit_equal(s);
  perform pg_temp.act(u);
  perform public.customer_apply_coupon((pg_temp.share(s)).id, 'PAINEL');
  tx := private.reserve_share_payment(u, (pg_temp.share(s)).id, 'credit_card', 0, gen_random_uuid(), 'simulated');
  perform private.apply_payment_event(tx.id, 'simulated', 'ok-' || tx.id, 'R', 'confirmed', tx.amount_cents);
  insert into public.promotion_redemptions(promotion_id, user_id, status) values (lim, null, 'applied');
  perform pg_temp.act(pg_temp.ctx('gerente'));
  j := public.restaurant_list_coupons(r);
  select e into x from jsonb_array_elements(j) e where e->>'code' = 'PAINEL';
  assert (x->>'status') = 'active' and (x->>'uses')::int = 1 and (x->>'discountGivenCents')::bigint = 1000, 'usos e desconto: ' || x;
  assert (x->>'revenueCents')::bigint = 9000 and (x->>'avgTicketCents')::bigint = 9000, 'faturamento sem o desconto: ' || x;
  assert (x->>'newCustomers')::int = 1, 'cliente novo: ' || x;
  assert (select e->>'status' from jsonb_array_elements(j) e where e->>'code' = 'AGENDADO') = 'scheduled', 'agendado';
  assert (select e->>'status' from jsonb_array_elements(j) e where e->>'code' = 'CHEIO') = 'sold_out', 'esgotado';
  perform public.restaurant_set_coupon_active(ag, false);
  assert (select e->>'status' from jsonb_array_elements(public.restaurant_list_coupons(r)) e where e->>'code' = 'AGENDADO') = 'paused', 'pausado';
  perform public.restaurant_end_coupon(ag);
  assert (select e->>'status' from jsonb_array_elements(public.restaurant_list_coupons(r)) e where e->>'code' = 'AGENDADO') = 'ended', 'encerrado';
  assert pg_temp.msg_of(format($q$select public.restaurant_set_coupon_active(%L, true)$q$, ag)) like 'Cupom encerrado%', 'encerrado não volta';
  assert exists (select 1 from public.audit_logs a where a.entity_id = ag and a.action = 'coupon.ended'), 'rastro';
end $$;
select pass('painel: Ativo, Agendado, Pausado, Esgotado e Encerrado; usos, desconto, faturamento, ticket e clientes novos');

select ok(not has_function_privilege('authenticated', 'private.coupon_discount_cents(public.promotions,uuid,uuid,bigint)', 'EXECUTE'), 'o cálculo do desconto não abre para o app');
select ok((select relrowsecurity from pg_class where oid = 'public.promotions'::regclass), 'RLS em promotions');
select ok((select relrowsecurity from pg_class where oid = 'public.promotion_redemptions'::regclass), 'RLS nos usos');
select is((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'promotions' and column_name = 'discount_cents'), 'bigint', 'desconto em centavos');

select * from finish();
rollback;
