-- G5 / ADR-032: um teste por critério de aceite da fatia. O critério 1 tem também o teste de propriedade em 36_bill_shares_flow.
-- Concorrência real pede duas conexões: aqui a reserva é conferida em sequência, e a fila é a trava da sessão (FOR UPDATE).
begin;
select plan(23);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;

-- Modo da casa fixado para o teste não depender da configuração atual do restaurante.
create function pg_temp.set_mode(p_mode text) returns void language sql as $$
  update public.restaurant_model_policies set fee_or_tip_mode = p_mode, service_fee_bps = 1000,
      tip_presets_bps = '{1000,1500,2000}', tip_default_bps = 1000,
      split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and not prepaid_required $$;

-- Mesa com p_people pessoas (a primeira é o titular) e um item por valor. p_owners diz de quem é cada item: 0 é sem dono.
create function pg_temp.scene(p_people int, p_cents bigint[], p_owners int[] default null) returns jsonb language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  tbl jsonb; sid uuid; o uuid; menu uuid; u uuid; users jsonb := '[]'; parts jsonb := '[]'; items jsonb := '[]'; i int; item uuid; pid uuid;
begin
  perform pg_temp.act(owner_id);
  u := gen_random_uuid();
  tbl := public.restaurant_create_table(r, 'test-g5-' || u, 8);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  for i in 1 .. p_people loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@g5.test');
    insert into public.profiles(id) values (u) on conflict do nothing;
    perform pg_temp.act(u);
    sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    users := users || to_jsonb(u); parts := parts || to_jsonb(pid);
  end loop;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, (users->>0)::uuid, sid) returning id into o;
  for i in 1 .. cardinality(p_cents) loop
    insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents, diner_id)
      values (o, menu, 1, p_cents[i]::numeric / 100, p_cents[i]::numeric / 100, p_cents[i],
        case when p_owners is not null and p_owners[i] > 0 then (parts->>(p_owners[i] - 1))::uuid end)
      returning id into item;
    items := items || to_jsonb(item);
  end loop;
  perform pg_temp.act((users->>0)::uuid);
  return jsonb_build_object('sid', sid, 'users', users, 'parts', parts, 'items', items, 'order', o);
end $$;

create function pg_temp.commit(s jsonb, p_person int, p_mode text, p_params jsonb default '{}') returns void language plpgsql as $$
begin
  perform pg_temp.act((s->'users'->>p_person)::uuid);
  perform public.customer_bill_split_commit((s->>'sid')::uuid, p_mode::public.noowe_split_mode, p_params, null, gen_random_uuid());
end $$;
create function pg_temp.share(s jsonb, p_person int) returns public.bill_shares language sql as $$
  select * from public.bill_shares where table_session_id = (s->>'sid')::uuid and participant_id = (s->'parts'->>p_person)::uuid and status = 'open' $$;
create function pg_temp.pay(s jsonb, p_person int, p_tip bigint default null) returns void language plpgsql as $$
begin
  perform pg_temp.act((s->'users'->>p_person)::uuid);
  perform public.customer_pay_share((pg_temp.share(s, p_person)).id, 'pix', gen_random_uuid(), p_tip);
end $$;
create function pg_temp.balance(s jsonb) returns bigint language sql as $$
  select private.session_consumption_balance((s->>'sid')::uuid) $$;
create function pg_temp.items_of(s jsonb, p_index int, p_person int) returns jsonb language sql as $$
  select jsonb_build_object('assignments', jsonb_build_array(jsonb_build_object('orderItemId', s->'items'->>p_index,
    'participantIds', jsonb_build_array(s->'parts'->>p_person)))) $$;

update private.dev_flags set enabled = true where key = 'simulate_share_payment';
select pg_temp.set_mode('service_fee');

-- ---------------------------------------------------------------------------
-- 1. Combinação das quatro formas, com taxa retirada
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(3, '{6000,3000,1000}', '{1,2,0}'); i int;
begin
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":1100}');      -- A paga 11,00: 10,00 de consumo
  perform pg_temp.pay(s, 0);
  perform pg_temp.commit(s, 1, 'by_item', pg_temp.items_of(s, 1, 1));        -- B paga o próprio item
  perform pg_temp.act((s->'users'->>1)::uuid);
  perform public.customer_set_share_fee_waived((pg_temp.share(s, 1)).id, true);
  perform pg_temp.pay(s, 1);
  perform pg_temp.commit(s, 2, 'equal', '{"people":2}');                     -- C paga metade do que falta, em partes
  perform pg_temp.pay(s, 2);
  perform pg_temp.commit(s, 0, 'by_owner');                                  -- o resto, por dono
  perform pg_temp.pay(s, 0);
  for i in 1 .. 2 loop
    if (pg_temp.share(s, i)).id is not null then perform pg_temp.pay(s, i); end if;
  end loop;
  assert pg_temp.balance(s) = 0, 'saldo zerou: ' || pg_temp.balance(s);
  assert (select sum(base_cents) from public.bill_shares where table_session_id = (s->>'sid')::uuid and status = 'paid') = 10000, 'consumo pago = consumo total';
  assert (select status from public.table_sessions where id = (s->>'sid')::uuid) = 'ended', 'comanda encerrou';
end $$;
select pass('critério 1: as quatro formas combinadas, com taxa retirada, somam exatamente o consumo');

-- ---------------------------------------------------------------------------
-- 2. Depois de valor fixo, as outras formas continuam, limitadas ao saldo
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{6000,4000}', '{1,2}'); p jsonb; sid uuid := (s->>'sid')::uuid;
begin
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":2200}');
  perform pg_temp.pay(s, 0);
  assert pg_temp.balance(s) = 8000, 'abateu 20,00 de consumo';
  p := public.customer_bill_split_preview(sid, 'by_owner');
  assert (select sum((x->>'baseCents')::bigint) from jsonb_array_elements(p->'shares') x) = 8000, 'Meus itens soma o saldo, não o consumo';
  p := public.customer_bill_split_preview(sid, 'by_item', jsonb_build_object('assignments', jsonb_build_array(
    jsonb_build_object('orderItemId', s->'items'->>0, 'participantIds', jsonb_build_array(s->'parts'->>0)),
    jsonb_build_object('orderItemId', s->'items'->>1, 'participantIds', jsonb_build_array(s->'parts'->>1)))));
  assert (select sum((x->>'baseCents')::bigint) from jsonb_array_elements(p->'shares') x) = 8000, 'Por item fica limitado ao saldo';
  -- Item que cabe no saldo é pago inteiro.
  p := public.customer_bill_split_preview(sid, 'by_item', pg_temp.items_of(s, 0, 0));
  assert (p->'shares'->0->>'baseCents')::bigint = 6000, 'item de R$ 60 cabe nos R$ 80 de saldo: ' || (p->'shares'->0->>'baseCents');
end $$;
select pass('critério 2: depois de valor fixo, Meus itens e Por item continuam, limitados ao saldo');

-- ---------------------------------------------------------------------------
-- 3. Item pago trava; parcela só aberta de outra pessoa não trava
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{3000,2000}'); sid uuid := (s->>'sid')::uuid;
begin
  perform pg_temp.commit(s, 1, 'by_item', pg_temp.items_of(s, 0, 1));
  perform pg_temp.commit(s, 0, 'by_item', pg_temp.items_of(s, 0, 0));
  assert (pg_temp.share(s, 0)).base_cents = 3000, 'parcela aberta de B não trava o item para A';
  perform pg_temp.pay(s, 0);
  assert pg_temp.state_of(format($q$select public.customer_bill_split_preview(%L, 'by_item', %L)$q$, sid, pg_temp.items_of(s, 0, 0))) = '22023', 'item pago não pode ser escolhido de novo';
  -- B ainda tinha a parcela aberta com o mesmo item: pagar agora cobraria o item duas vezes.
  perform pg_temp.act((s->'users'->>1)::uuid);
  assert pg_temp.state_of(format($q$select public.customer_pay_share(%L, 'pix', %L)$q$, (pg_temp.share(s, 1)).id, gen_random_uuid())) = 'P0012', 'parcela com item já pago pede para refazer';
end $$;
select pass('critério 3: item pago fica travado; parcela só aberta não trava, e a sobra pede para refazer');

-- ---------------------------------------------------------------------------
-- 4. Valor acima do saldo é ajustado e mostrado; saldo zero avisa
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(1, '{5000}'); p jsonb; sid uuid := (s->>'sid')::uuid;
begin
  p := public.customer_bill_split_preview(sid, 'fixed_amount', '{"amountCents":999900}');
  assert (p->>'adjusted')::boolean and (p->>'requestedCents')::bigint = 999900, 'preview avisa do ajuste';
  assert (p->'shares'->0->>'baseCents')::bigint = 5000 and (p->'shares'->0->>'amountCents')::bigint = 5500, 'ajustado ao saldo, com a taxa refeita';
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":999900}');
  perform pg_temp.pay(s, 0);
  begin
    perform public.customer_bill_split_preview(sid, 'equal');
    raise exception 'não avisou';
  exception when sqlstate 'P0011' then
    assert sqlerrm = 'Esta conta já está quitada', 'mensagem: ' || sqlerrm;
  end;
end $$;
select pass('critério 4: valor acima do saldo é ajustado antes de confirmar; saldo zero diz que a conta está quitada');

-- ---------------------------------------------------------------------------
-- 5. Reserva: nunca abate mais que o saldo; falhou ou expirou, o valor volta
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{5000}'); a public.bill_shares; b public.bill_shares; t public.gateway_transactions; t2 public.gateway_transactions;
  ua uuid := (s->'users'->>0)::uuid; ub uuid := (s->'users'->>1)::uuid;
begin
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":5500}');
  perform pg_temp.commit(s, 1, 'fixed_amount', '{"amountCents":5500}');
  a := pg_temp.share(s, 0); b := pg_temp.share(s, 1);
  t := private.reserve_share_payment(ua, a.id, 'pix', 0, gen_random_uuid(), 'simulated');
  assert pg_temp.balance(s) = 0, 'quem entra no pagamento reserva o valor';
  assert pg_temp.state_of(format($q$select private.reserve_share_payment(%L, %L, 'pix', 0, %L, 'simulated')$q$, ub, b.id, gen_random_uuid())) = 'P0012', 'o segundo não abate além do saldo';

  -- Pix no salão reserva por 10 minutos; cartão, pelo prazo da política.
  assert t.expires_at between now() + interval '9 minutes' and now() + interval '11 minutes', 'Pix reserva por 10 minutos';

  -- Expirou: o valor volta, e a varredura do tick é quem faz.
  update public.gateway_transactions set expires_at = now() - interval '1 second' where id = t.id;
  assert private.bill_hold_sweep() >= 1, 'varredura encontrou a reserva';
  assert (select status from public.gateway_transactions where id = t.id) = 'expired', 'cobrança expirou';
  assert (select status from public.bill_shares where id = a.id) = 'open', 'parcela reaberta';
  assert pg_temp.balance(s) = 5000, 'o valor voltou ao saldo';
  perform private.bill_hold_sweep();
  assert (select status from public.gateway_transactions where id = t.id) = 'expired' and pg_temp.balance(s) = 5000, 'repetir não refaz';

  -- Falhou: o valor volta.
  t2 := private.reserve_share_payment(ub, b.id, 'credit_card', 0, gen_random_uuid(), 'simulated');
  perform private.apply_payment_event(t2.id, 'simulated', 'falhou:' || t2.id, 'FAILED', 'failed');
  assert pg_temp.balance(s) = 5000, 'falha devolve ao saldo';

  -- Pago por B; o Pix de A, que expirou, é confirmado depois: volta para A, sem abater duas vezes.
  perform pg_temp.pay(s, 1);
  perform private.apply_payment_event(t.id, 'simulated', 'tardio:' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  -- Provedor simulado devolve na hora; com o Asaas, passa pela fila (60_n4_estorno).
  assert (select status from public.gateway_transactions where id = t.id) = 'refunded', 'pagamento tardio é estornado';
  assert (select sum(base_cents) from public.bill_shares where table_session_id = (s->>'sid')::uuid and status = 'paid') = 5000, 'consumo pago continua exato';
end $$;
select pass('critério 5: reserva não deixa abater além do saldo; falha e expiração devolvem; tardio é estornado');

-- ---------------------------------------------------------------------------
-- 6. Taxa ou gorjeta, nunca as duas; quem retira a taxa retira só da própria parte
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{5000}'); v public.bill_shares;
begin
  perform pg_temp.commit(s, 0, 'equal');
  v := pg_temp.share(s, 0);
  assert pg_temp.state_of(format($q$select public.customer_set_share_tip(%L, 100)$q$, v.id)) = '22023', 'modo taxa não aceita gorjeta';
  assert pg_temp.state_of(format($q$select public.customer_pay_share(%L, 'pix', %L, 100)$q$, v.id, gen_random_uuid())) = '22023', 'nem no pagamento';
  perform public.customer_set_share_fee_waived(v.id, true);
  assert (pg_temp.share(s, 0)).service_fee_cents = 0 and (pg_temp.share(s, 1)).service_fee_cents = 250, 'retirada só da própria parte';
  assert pg_temp.state_of(format($q$select public.customer_set_share_fee_waived(%L, true)$q$, (pg_temp.share(s, 1)).id)) = 'P0002', 'não retira a taxa de outra pessoa';
  -- A retirada acompanha a pessoa se alguém refizer a divisão.
  perform pg_temp.commit(s, 1, 'equal');
  assert (pg_temp.share(s, 0)).fee_waived_at is not null and (pg_temp.share(s, 0)).service_fee_cents = 0, 'retirada sobrevive à nova divisão';
  assert (pg_temp.share(s, 1)).service_fee_cents = 250, 'a outra parte segue com taxa';

  perform pg_temp.set_mode('tip');
  perform pg_temp.commit(s, 1, 'equal');
  assert (pg_temp.share(s, 1)).service_fee_cents = 0, 'modo gorjeta não tem taxa';
  perform pg_temp.act((s->'users'->>1)::uuid);
  assert (public.customer_share_tip_options((pg_temp.share(s, 1)).id)->0->>'cents')::bigint = 250, 'gorjeta é sobre o consumo da parte';
  perform public.customer_set_share_tip((pg_temp.share(s, 1)).id, 250);
  assert pg_temp.state_of(format($q$update public.bill_shares set service_fee_cents = 1, tip_cents = 1 where id = %L$q$, (pg_temp.share(s, 1)).id)) = '23514', 'o banco não guarda taxa e gorjeta juntas';
  perform pg_temp.set_mode('service_fee');
end $$;
select pass('critério 6: taxa ou gorjeta, nunca as duas; retirar a taxa só vale para a própria parte');

-- ---------------------------------------------------------------------------
-- 7. Quick: gorjeta opcional, sem nada marcado
-- ---------------------------------------------------------------------------
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
begin
  assert not exists (select 1 from public.restaurant_model_policies where prepaid_required and (fee_or_tip_mode <> 'tip' or tip_default_bps is not null)), 'Quick existente sem gorjeta marcada';
  perform pg_temp.act(owner_id);
  if exists (select 1 from public.restaurant_model_policies where restaurant_id = r and service_model = 'quick_service') then
    assert pg_temp.state_of(format($q$select public.restaurant_update_charge_policy(%L, 'quick_service', 'service_fee')$q$, r)) = '22023', 'Quick não usa taxa';
    perform public.restaurant_update_charge_policy(r, 'quick_service', 'tip', null, '{500,1000}', 1000);
    assert (select tip_default_bps from public.restaurant_model_policies where restaurant_id = r and service_model = 'quick_service') is null, 'Quick nunca fica com gorjeta marcada';
  end if;
end $$;
select pass('critério 7: Quick com gorjeta opcional e sem pré-seleção');
select ok(pg_get_functiondef('private.sync_restaurant_model_policies()'::regprocedure) like '%case when model=''casual_dining'' then new.tip_presets_bps[1] end%',
  'padrão sugerido: só o Casual nasce com gorjeta marcada');

-- ---------------------------------------------------------------------------
-- 8. Pagamento misto abate do mesmo saldo; só encerra com saldo zero
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{6000}'); sid uuid := (s->>'sid')::uuid; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  key uuid := gen_random_uuid(); res jsonb; res2 jsonb; waiter_try text;
begin
  perform pg_temp.act(owner_id);
  res := public.restaurant_record_bill_payment(sid, 'cash', key, 2000);
  assert (res->>'amountCents')::bigint = 2200 and (res->>'balanceCents')::bigint = 4000, 'dinheiro abate do saldo, com a taxa calculada no servidor';
  res2 := public.restaurant_record_bill_payment(sid, 'cash', key, 2000);
  assert (res2->>'idempotentReplay')::boolean and pg_temp.balance(s) = 4000, 'reenvio não cobra de novo';
  assert (select status from public.table_sessions where id = sid) = 'active', 'pagamento parcial não encerra';
  res := public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid(), 500, true, 0, 'Cliente reclamou do atendimento');
  assert (res->>'feeCents')::bigint = 0 and (res->>'amountCents')::bigint = 500, 'garçom desmarca a taxa na cobrança presencial';
  assert (select count(*) from public.audit_logs where action = 'bill.fee_waived' and entity_id = (res->>'shareId')::uuid and reason = 'Cliente reclamou do atendimento') = 1, 'fica registrado';

  -- O saldo é o teto também aqui: o que passar é ajustado.
  perform pg_temp.commit(s, 1, 'fixed_amount', '{"amountCents":1100}');
  perform pg_temp.pay(s, 1);
  perform pg_temp.act(owner_id);
  res := public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid(), 999900);
  assert (res->>'adjusted')::boolean and (res->>'baseCents')::bigint = 2500, 'valor acima do saldo é ajustado';
  assert (res->>'closed')::boolean, 'saldo zero encerra';
  assert (select status from public.table_sessions where id = sid) = 'ended', 'comanda encerrada';
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = 6000, 'dinheiro, cartão, Pix e online somam o consumo';
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'paid' and participant_id is null) = 3, 'presencial não precisa de participante';
end $$;
select pass('critério 8: pagamento misto abate do mesmo saldo e só encerra com saldo zero');

do $$
declare s jsonb := pg_temp.scene(2, '{3000,2000}'); sid uuid := (s->>'sid')::uuid; owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; res jsonb;
begin
  -- Versão antiga do app: manda o valor do pedido inteiro. O servidor ignora o valor do cliente e abate pela conta.
  perform pg_temp.act(owner_id);
  res := public.restaurant_record_payment((s->>'order')::uuid, 'cash', 1.00, 0, gen_random_uuid()::text);
  assert pg_temp.balance(s) = 0, 'valor vem do servidor: ' || pg_temp.balance(s);
  assert (select status from public.table_sessions where id = sid) = 'ended', 'quitada, encerra';
end $$;
select pass('pagamento presencial por pedido (versão antiga) abate do saldo com o valor do servidor');

-- ---------------------------------------------------------------------------
-- 9. Quem sai sem pagar deixa a parte para o titular, que é avisado
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(2, '{3000,2000}', '{1,2}'); sid uuid := (s->>'sid')::uuid; res jsonb; ua uuid := (s->'users'->>0)::uuid; pb uuid := (s->'parts'->>1)::uuid; p jsonb;
begin
  perform pg_temp.act((s->'users'->>1)::uuid);
  assert pg_temp.state_of(format($q$select public.customer_leave_table_session(%L)$q$, sid)) = 'P0004', 'sem confirmar, não sai';
  res := public.customer_leave_table_session(sid, true);
  assert (res->>'movedToHost')::boolean, 'a parte fica com o titular';
  assert pg_temp.balance(s) = 5000, 'o saldo não some';
  assert exists (select 1 from public.notifications where user_id = ua and metadata->>'kind' = 'bill_part_left' and metadata->>'participant_id' = pb::text), 'titular é avisado';
  assert exists (select 1 from public.audit_logs where action = 'bill.left_unpaid' and entity_id = sid), 'fica registrado';
  perform pg_temp.act(ua);
  p := public.customer_bill_summary(sid);
  assert jsonb_array_length(p->'leftWithoutPaying') = 1 and p->'leftWithoutPaying'->0->>'participantId' = pb::text, 'titular vê ao abrir a comanda';
  p := public.customer_bill_split_preview(sid, 'by_owner');
  assert jsonb_array_length(p->'shares') = 1 and (p->'shares'->0->>'baseCents')::bigint = 5000, 'parte dele cai para o titular';
  assert pg_temp.state_of(format($q$select public.customer_leave_table_session(%L, true)$q$, sid)) = 'P0004', 'o titular não sai com saldo';
end $$;
do $$
declare s jsonb := pg_temp.scene(2, '{3000,2000}', '{1,2}'); sid uuid := (s->>'sid')::uuid; ub uuid := (s->'users'->>1)::uuid; ua uuid := (s->'users'->>0)::uuid; p jsonb;
begin
  -- Pagou tudo e foi embora: não é "saiu sem pagar", e a mesa não volta para ela.
  perform pg_temp.commit(s, 1, 'by_item', pg_temp.items_of(s, 1, 1));
  perform pg_temp.pay(s, 1);
  perform pg_temp.act(ub);
  perform public.customer_leave_table_session(sid);
  assert public.customer_get_active_visit() is null, 'quem saiu não volta para a mesa ao abrir o app';
  perform pg_temp.act(ua);
  p := public.customer_bill_summary(sid);
  assert jsonb_array_length(p->'leftWithoutPaying') = 0, 'quem pagou não aparece como quem saiu sem pagar';
  assert not exists (select 1 from public.notifications where user_id = ua and metadata->>'kind' = 'bill_part_left' and metadata->>'table_session_id' = sid::text), 'e o titular não é avisado';
  assert jsonb_array_length(public.customer_get_table_bill(sid)->'participants') = 1, 'a conta não lista quem já saiu';
  -- Voltou à mesa: responde de novo.
  perform pg_temp.act(ub);
  perform public.customer_open_table_session((select qr_code from public.tables t join public.table_sessions ts on ts.table_id = t.id where ts.id = sid));
  assert public.customer_get_active_visit()->>'tableSessionId' = sid::text, 'quem volta está na mesa de novo';
end $$;
select pass('quem pagou e saiu não é tratado como quem saiu sem pagar, e não volta sozinho para a mesa');

do $$
declare s jsonb := pg_temp.scene(2, '{5000}'); sid uuid := (s->>'sid')::uuid; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
begin
  -- Saída sem pagar também sai da visita do cliente.
  perform pg_temp.act((s->'users'->>1)::uuid);
  perform public.customer_leave_table_session(sid, true);
  assert public.customer_get_active_visit() is null, 'quem confirmou a saída não fica preso à mesa';
  -- Walk-out do próprio titular: não há para quem avisar.
  perform pg_temp.act(owner_id);
  perform public.restaurant_mark_walkout(sid, (s->'parts'->>0)::uuid, 'saiu sem pagar');
  assert not exists (select 1 from public.notifications where user_id = (s->'users'->>0)::uuid and metadata->>'kind' = 'bill_part_left'), 'titular não é avisado de si mesmo';
end $$;
select pass('saída sem pagar tira a pessoa da mesa; walk-out do titular não avisa o próprio titular');

do $$
declare s jsonb := pg_temp.scene(2, '{5000}'); sid uuid := (s->>'sid')::uuid; t public.gateway_transactions; ua uuid := (s->'users'->>0)::uuid; owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; o uuid; menu uuid;
begin
  -- Quem tem pagamento em andamento não ganha uma segunda parcela viva.
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":1100}');
  t := private.reserve_share_payment(ua, (pg_temp.share(s, 0)).id, 'pix', 0, gen_random_uuid(), 'simulated');
  perform pg_temp.act(ua);
  assert pg_temp.state_of(format($q$select public.customer_bill_split_preview(%L, 'equal', '{"people":3}')$q$, sid)) = 'P0001', 'partes ajustadas respeita o pagamento em andamento';
  -- Pedido sem nada em aberto não vira cobrança do saldo inteiro.
  select id into menu from public.menu_items where restaurant_id = 'c1000000-0000-4000-8000-000000000002' limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values ('c1000000-0000-4000-8000-000000000002', ua, sid) returning id into o;
  perform pg_temp.act(owner_id);
  assert pg_temp.state_of(format($q$select public.restaurant_record_payment(%L, 'cash', 1.00, 0, null, %L)$q$, o, gen_random_uuid())) = '22023', 'pedido vazio é recusado';
  assert pg_temp.balance(s) = 4000, 'o saldo não muda';
end $$;
select pass('sem segunda parcela durante um pagamento; pedido sem consumo não cobra o saldo inteiro');

select pass('critério 9: quem sai sem pagar deixa a parte para o titular, que é avisado ao abrir a comanda');

-- ---------------------------------------------------------------------------
-- 10. Retirar a taxa grava autor, motivo e horário
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(1, '{5000}'); v public.bill_shares; ua uuid := (s->'users'->>0)::uuid;
begin
  perform pg_temp.commit(s, 0, 'equal');
  perform public.customer_set_share_fee_waived((pg_temp.share(s, 0)).id, true);
  v := pg_temp.share(s, 0);
  assert v.fee_waived_by = ua and v.fee_waived_at is not null and v.fee_waived_reason is not null, 'parcela guarda autor, motivo e horário';
  assert exists (select 1 from public.audit_logs where action = 'bill.fee_waived' and entity_id = v.id and reason is not null), 'auditoria na mesma transação';
  perform public.customer_set_share_fee_waived(v.id, false);
  assert (pg_temp.share(s, 0)).service_fee_cents = 500, 'manter a taxa volta o valor';
  assert exists (select 1 from public.audit_logs where action = 'bill.fee_restored' and entity_id = v.id), 'voltar também fica registrado';
end $$;
select pass('critério 10: retirar a taxa grava autor, motivo e horário');

-- ---------------------------------------------------------------------------
-- 11. Valor fixo é o total que sai do cartão
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(1, '{20000}'); sid uuid := (s->>'sid')::uuid; p jsonb; v public.bill_shares;
begin
  p := public.customer_bill_split_preview(sid, 'fixed_amount', '{"amountCents":5000}');
  assert (p->'shares'->0->>'baseCents')::bigint = 4545 and (p->'shares'->0->>'feeCents')::bigint = 455
    and (p->'shares'->0->>'amountCents')::bigint = 5000 and (p->'shares'->0->>'chargeCents')::bigint = 5000, 'R$ 50 a 10%: 45,45 + 4,55 aparecem antes de confirmar';
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":5000}');
  v := pg_temp.share(s, 0);
  assert v.base_cents = 4545 and v.service_fee_cents = 455 and v.amount_cents = 5000, 'gravado como mostrado';
  perform public.customer_set_share_fee_waived(v.id, true);
  v := pg_temp.share(s, 0);
  assert v.base_cents = 5000 and v.service_fee_cents = 0 and v.amount_cents = 5000, 'sem taxa, os R$ 50 são só consumo';
  perform public.customer_set_share_fee_waived(v.id, false);
  v := pg_temp.share(s, 0);
  assert v.base_cents = 4545 and v.service_fee_cents = 455, 'manter a taxa volta a separação';
  p := public.customer_bill_split_preview(sid, 'fixed_amount', '{"amountCents":5000,"waiveFee":true}');
  assert (p->'shares'->0->>'baseCents')::bigint = 5000, 'retirada também vale ao simular';
end $$;
select pass('critério 11: valor fixo é o total do cartão, separado antes de confirmar; sem taxa, é só consumo');

-- ---------------------------------------------------------------------------
-- 12. Gorjeta em percentual segue a conta do valor fixo; valor livre entra por cima
-- ---------------------------------------------------------------------------
do $$
declare s jsonb; v public.bill_shares; t public.gateway_transactions;
begin
  perform pg_temp.set_mode('tip');
  s := pg_temp.scene(1, '{20000}');
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":5000,"tipBps":1000}');
  v := pg_temp.share(s, 0);
  assert v.base_cents = 4545 and v.tip_cents = 455 and v.service_fee_cents = 0, 'gorjeta em % sai de dentro do valor';
  t := private.reserve_share_payment((s->'users'->>0)::uuid, v.id, 'pix', null, gen_random_uuid(), 'simulated');
  assert t.amount_cents = 5000 and t.tip_cents = 455, 'sai do cartão o valor pedido';
  s := pg_temp.scene(1, '{20000}');
  assert (public.customer_bill_split_preview((s->>'sid')::uuid, 'fixed_amount', '{"amountCents":5000,"tipCents":300}')->'shares'->0->>'chargeCents')::bigint = 5300, 'o total com a gorjeta aparece antes de confirmar';
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":5000,"tipCents":300}');
  v := pg_temp.share(s, 0);
  assert v.base_cents = 5000 and v.tip_cents = 300, 'gorjeta em valor entra por cima, à parte';
  t := private.reserve_share_payment((s->'users'->>0)::uuid, v.id, 'pix', null, gen_random_uuid(), 'simulated');
  assert t.amount_cents = 5300, 'cobrança = valor + gorjeta';
  s := pg_temp.scene(1, '{20000}');
  perform pg_temp.commit(s, 0, 'fixed_amount', '{"amountCents":5000}');
  v := pg_temp.share(s, 0);
  assert v.base_cents = 5000 and v.tip_cents = 0 and v.amount_cents = 5000, 'sem gorjeta, é só consumo';
  perform pg_temp.set_mode('service_fee');
end $$;
select pass('critério 12: gorjeta em percentual segue a conta do valor fixo; em valor livre entra por cima');

-- ---------------------------------------------------------------------------
-- 13. Partes iguais: consumo igual, taxa de cada um
-- ---------------------------------------------------------------------------
do $$
declare s jsonb := pg_temp.scene(3, '{30000}');
begin
  perform pg_temp.commit(s, 0, 'equal');
  perform public.customer_set_share_fee_waived((pg_temp.share(s, 0)).id, true);
  assert (pg_temp.share(s, 0)).amount_cents = 10000, 'quem retirou paga R$ 100';
  assert (pg_temp.share(s, 1)).amount_cents = 11000 and (pg_temp.share(s, 2)).amount_cents = 11000, 'os outros, R$ 110';
  assert (select max(base_cents) - min(base_cents) from public.bill_shares where table_session_id = (s->>'sid')::uuid and status = 'open') = 0, 'consumo igual';
  assert (select count(*) from public.bill_share_lines l join public.bill_shares b on b.id = l.bill_share_id where b.table_session_id = (s->>'sid')::uuid and b.status = 'open') = 0, 'partes iguais não travam item';
end $$;
select pass('critério 13: em partes iguais o consumo é igual e a taxa é de cada um (R$ 300 entre 3: 100, 110, 110)');

-- ---------------------------------------------------------------------------
-- Configuração por serviço: quem muda, com registro; forma desligada não vale
-- ---------------------------------------------------------------------------
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; s jsonb; m public.noowe_service_model; u uuid := gen_random_uuid();
begin
  s := pg_temp.scene(1, '{5000}');
  select service_model into m from public.table_sessions where id = (s->>'sid')::uuid;
  insert into auth.users(id, email) values (u, u || '@g5.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  perform pg_temp.act(u);
  assert pg_temp.state_of(format($q$select public.restaurant_update_charge_policy(%L, %L, 'tip')$q$, r, m)) = '42501', 'quem não é da casa não muda';
  perform pg_temp.act(owner_id);
  perform public.restaurant_update_charge_policy(r, m, 'service_fee', 1200, '{1000}', 1000, '{equal,by_owner}');
  assert exists (select 1 from public.audit_logs where action = 'config.charge_policy_changed' and before->>'serviceFeeBps' = '1000' and after->>'serviceFeeBps' = '1200'), 'antes e depois ficam registrados';
  perform pg_temp.act((s->'users'->>0)::uuid);
  assert pg_temp.state_of(format($q$select public.customer_bill_split_preview(%L, 'fixed_amount', '{"amountCents":100}')$q$, s->>'sid')) = '23514', 'forma desligada não vale';
  -- Mudar a configuração geral não apaga a escolha por serviço.
  update public.restaurant_model_configs set service_fee_bps = service_fee_bps where restaurant_id = r;
  assert (select service_fee_bps from public.restaurant_model_policies where restaurant_id = r and service_model = m) = 1200, 'escolha por serviço fica';
  assert (select split_modes from public.restaurant_model_policies where restaurant_id = r and service_model = m) = '{equal,by_owner}', 'formas por serviço ficam';
  perform pg_temp.set_mode('service_fee');
end $$;
select pass('Dono e Gerente escolhem taxa, gorjeta e formas por serviço, com registro');

select is((select public.get_restaurant_model_capabilities_v2('c1000000-0000-4000-8000-000000000002', ts.service_model)->'policies'->>'feeOrTipMode'
    from public.table_sessions ts where ts.restaurant_id = 'c1000000-0000-4000-8000-000000000002' and ts.service_model <> 'quick_service' limit 1),
  'service_fee', 'o app lê taxa ou gorjeta nas capacidades');

select is(private.fee_or_tip_mode(gen_random_uuid()), 'service_fee', 'sessão sem política cai no comportamento antigo');

do $$
declare s jsonb := pg_temp.scene(1, '{5000}'); b jsonb; owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.act(owner_id);
  b := public.restaurant_get_session_bill((s->>'sid')::uuid, 2000);
  assert (b->>'chargeBaseCents')::bigint = 2000 and (b->>'feeCents')::bigint = 200 and (b->>'totalWithFeeCents')::bigint = 2200 and not (b->>'adjusted')::boolean, 'garçom vê a conta pronta';
  b := public.restaurant_get_session_bill((s->>'sid')::uuid, 999900);
  assert (b->>'chargeBaseCents')::bigint = 5000 and (b->>'adjusted')::boolean, 'valor acima do saldo é ajustado na tela';
  assert exists (select 1 from jsonb_array_elements(public.restaurant_get_charge_policies(r)) x where x->>'feeOrTipMode' = 'service_fee'), 'Dono vê a escolha por serviço';
  update public.orders o set table_id = ts.table_id from public.table_sessions ts where ts.id = o.table_session_id and o.id = (s->>'order')::uuid;
  assert exists (select 1 from jsonb_array_elements(public.restaurant_get_table_bills(r)) x where x->>'table_session_id' = s->>'sid'), 'a conta aponta para a sessão aberta';
  perform pg_temp.act((s->'users'->>0)::uuid);
  assert pg_temp.state_of(format($q$select public.restaurant_get_session_bill(%L)$q$, s->>'sid')) = '42501', 'cliente não usa a tela do garçom';
  assert pg_temp.state_of(format($q$select public.restaurant_get_charge_policies(%L)$q$, r)) = '42501', 'cliente não lê a configuração';
end $$;
select pass('garçom e gerente leem os valores prontos do servidor');

do $$
declare s jsonb := pg_temp.scene(1, '{5000}'); t public.gateway_transactions; v public.bill_shares; c public.gateway_transactions; ua uuid := (s->'users'->>0)::uuid;
begin
  perform pg_temp.commit(s, 0, 'equal');
  v := pg_temp.share(s, 0);
  t := private.reserve_share_payment(ua, v.id, 'pix', 0, gen_random_uuid(), 'simulated');
  -- Mudou de Pix para cartão: a primeira cobrança não vale mais, e só existe uma reserva.
  c := private.reserve_share_payment(ua, v.id, 'credit_card', 0, gen_random_uuid(), 'simulated');
  assert c.id <> t.id and (select status from public.gateway_transactions where id = t.id) = 'cancelled', 'a forma trocada cancela a anterior';
  assert (select payment_id from public.bill_shares where id = v.id) = c.id, 'parcela aponta para a nova';
  assert pg_temp.balance(s) = 0, 'continua reservado uma vez só';
end $$;
select pass('trocar a forma de pagamento cancela a cobrança anterior e não reserva duas vezes');

select * from finish();
rollback;
