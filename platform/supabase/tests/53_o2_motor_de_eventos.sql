-- Fatia O2 (docs/fatias/O2-motor-de-eventos.md), um bloco por critério de aceite.
begin;
select plan(93);
update private.dev_flags set enabled = true where key = 'simulate_order_payment';

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
create function pg_temp.new_user(p_name text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, p_name || '-' || u || '@o2.test');
  insert into public.profiles(id, full_name) values (u, p_name) on conflict (id) do update set full_name = p_name;
  insert into _ctx values (p_name, u);
  return u;
end $$;
create function pg_temp.open_tasks(p_kind text) returns integer language sql as $$
  select count(*)::integer from public.staff_tasks where kind = p_kind and status = 'open'
    and restaurant_id = (select v from _ctx where k = 'r')
$$;
create function pg_temp.task(p_kind text) returns public.staff_tasks language sql as $$
  select * from public.staff_tasks where kind = p_kind and restaurant_id = (select v from _ctx where k = 'r')
  order by created_at desc limit 1
$$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; tb jsonb;
  w uuid; m uuid; chef uuid; both_roles uuid; c uuid; maitre uuid;
begin
  insert into _ctx values ('r', r), ('owner', owner_id);
  w := pg_temp.new_user('waiter'); m := pg_temp.new_user('manager'); chef := pg_temp.new_user('chef');
  both_roles := pg_temp.new_user('both'); c := pg_temp.new_user('customer'); maitre := pg_temp.new_user('maitre');
  insert into public.user_roles(user_id, restaurant_id, role) values
    (w, r, 'waiter'), (m, r, 'manager'), (chef, r, 'chef'), (both_roles, r, 'waiter'), (both_roles, r, 'maitre'), (maitre, r, 'maitre');
  perform pg_temp.act(owner_id);
  tb := public.restaurant_create_table(r, 'o2-' || c, 4);
  insert into _ctx values ('table', (tb->>'id')::uuid), ('menu', (select id from public.menu_items where restaurant_id = r limit 1));
end $$;

-- ---------------------------------------------------------------------------
-- Critério 1: cada evento cria a tarefa para o responsável e para o Gerente, uma só linha
-- ---------------------------------------------------------------------------
insert into public.service_calls(restaurant_id, table_id, user_id, call_type, status, message, called_at, created_at, updated_at)
  values (pg_temp.ctx('r'), pg_temp.ctx('table'), pg_temp.ctx('customer'), 'waiter', 'pending', 'Mais água', now(), now(), now());
select is(pg_temp.open_tasks('call.created'), 1, 'critério 1: chamado cria uma só tarefa');
select ok((pg_temp.task('call.created')).audience_roles @> array['waiter','manager']::public.user_roles_role_enum[],
  'critério 1: garçom e gerente enxergam a mesma linha');
select is((select count(*)::integer from public.domain_events where event_type = 'call.created' and restaurant_id = pg_temp.ctx('r')), 1,
  'o evento fica no log');

-- Catálogo: tudo que o motor conhece tem regra.
do $$
declare o uuid; i uuid; s uuid := gen_random_uuid();
begin
  -- reserva
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), now() + interval '3 hours', 2, 'pending') returning id into i;
  insert into _ctx values ('res', i);
  -- fila
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, party_size, status, position)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), 'Ana', 2, 'waiting', 1);
  -- comanda
  insert into public.table_sessions(id, restaurant_id, table_id, status) values (s, pg_temp.ctx('r'), pg_temp.ctx('table'), 'active');
  insert into _ctx values ('session', s);
  -- pedido: ao entrar em preparo
  insert into public.orders(restaurant_id, customer_id, order_type, table_id, table_session_id)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), 'dine_in', pg_temp.ctx('table'), s) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  insert into _ctx values ('order', o), ('item', i);
end $$;
select is(pg_temp.open_tasks('reservation.pending'), 1, 'reserva pendente vai ao Maître');
select is(pg_temp.open_tasks('queue.joined'), 1, 'entrada na fila vira aviso');
select is((pg_temp.task('queue.joined')).task_type, 'notice', 'aviso não pede ação');
select is(pg_temp.open_tasks('table.opened'), 0, 'mesa nova fecha quando o primeiro pedido entra');
select is(pg_temp.open_tasks('order.created'), 1, 'pedido na estação vira tarefa da cozinha');

select pg_temp.act(pg_temp.ctx('chef'));
select public.restaurant_update_order_item_status(pg_temp.ctx('item'), 'ready');
select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.open_tasks('item.ready'), 1, 'item pronto vira tarefa de retirada');
select is(pg_temp.open_tasks('order.created'), 0, 'pedido pronto fecha a tarefa da cozinha');
select public.restaurant_update_order_status(pg_temp.ctx('order'), 'delivered');
select is(pg_temp.open_tasks('item.ready'), 0, 'entregar fecha a tarefa pelo ato de domínio');

update public.tables set status = 'cleaning' where id = pg_temp.ctx('table');
select is(pg_temp.open_tasks('table.cleaning'), 1, 'mesa em Limpeza vira tarefa de liberar');
select is((select count(*)::integer from public.notifications where notification_type = 'staff_task'
  and metadata->>'taskKind' = 'table.cleaning' and user_id = pg_temp.ctx('waiter')), 1,
  'sem responsável, o garçom recebe push: a mesa não fica esquecida');
select is((select count(*)::integer from public.notifications where notification_type = 'staff_task'
  and metadata->>'taskKind' = 'table.cleaning' and user_id = pg_temp.ctx('manager')), 0,
  'gerente vê na lista, sem push (pendência 6)');
update public.tables set status = 'available' where id = pg_temp.ctx('table');
select is(pg_temp.open_tasks('table.cleaning'), 0, 'liberar a mesa fecha a tarefa');
select is(pg_temp.open_tasks('table.released'), 1, 'com gente na fila, mesa livre avisa o Maître');

insert into public.reviews(user_id, restaurant_id, rating, comment) values (pg_temp.ctx('customer'), pg_temp.ctx('r'), 1, 'Demorou');
select is(pg_temp.open_tasks('review.low'), 1, 'avaliação baixa vai a Gerente e Dono');
insert into public.reviews(user_id, restaurant_id, rating, comment) values (pg_temp.ctx('waiter'), pg_temp.ctx('r'), 5, 'Ótimo');
select is(pg_temp.open_tasks('review.low'), 1, 'avaliação boa não gera tarefa');

-- ---------------------------------------------------------------------------
-- Critério 2: quem conclui primeiro fecha para todos
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('waiter'));
select is(public.restaurant_complete_task((pg_temp.task('call.created')).id)->>'closed', 'true', 'critério 2: o primeiro conclui');
select pg_temp.act(pg_temp.ctx('manager'));
select is(public.restaurant_complete_task((pg_temp.task('call.created')).id)->>'alreadyClosed', 'true',
  'critério 2: o segundo recebe a resposta, sem erro');
select is((pg_temp.task('call.created')).completed_by, pg_temp.ctx('waiter'), 'guarda quem concluiu');
select pg_temp.act(pg_temp.ctx('chef'));
select is(pg_temp.state_of(format($q$select public.restaurant_complete_task(%L)$q$, (pg_temp.task('table.released')).id)), '42501',
  'quem não é da função não conclui');
select pg_temp.act(pg_temp.ctx('maitre'));
select is(public.restaurant_claim_task((pg_temp.task('table.released')).id)->>'claimed', 'true', 'assumir registra quem pegou');
select pg_temp.act(pg_temp.ctx('both'));
select is(public.restaurant_claim_task((pg_temp.task('table.released')).id)->>'claimed', 'false', 'só um assume');
select pg_temp.act(pg_temp.ctx('owner'));

-- ---------------------------------------------------------------------------
-- Critério 3: quem acumula funções recebe uma vez só
-- ---------------------------------------------------------------------------
update public.tables set status = 'cleaning' where id = pg_temp.ctx('table');
select is((select count(*)::integer from public.notifications where notification_type = 'staff_task' and metadata->>'taskKind' = 'table.cleaning'
  and metadata->>'taskId' = (pg_temp.task('table.cleaning')).id::text and user_id = pg_temp.ctx('both')), 1,
  'critério 3: garçom e Maître na mesma pessoa, uma notificação');
update public.tables set status = 'available' where id = pg_temp.ctx('table');

-- ---------------------------------------------------------------------------
-- Critério 4: aprovações chegam a Gerente e Dono; ninguém aprova o próprio pedido
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('waiter'));
select (public.restaurant_request_approval(pg_temp.ctx('r'), 'discount', 'Conta da mesa', 'Cliente reclamou', 5, null, pg_temp.ctx('order'))->>'id') as approval_id \gset
select pg_temp.act(pg_temp.ctx('owner'));
select is((select count(*)::integer from public.notifications where related_id = (pg_temp.task('approval.requested')).id
  and user_id in (pg_temp.ctx('manager'), pg_temp.ctx('owner'))), 2, 'critério 4: Gerente e Dono recebem ao mesmo tempo');
select is((select metadata->>'category' from public.notifications where related_id = (pg_temp.task('approval.requested')).id limit 1),
  'approval', 'a notificação traz os botões de aprovar e recusar');
select pg_temp.act(pg_temp.ctx('manager'));
select (public.restaurant_request_approval(pg_temp.ctx('r'), 'other', 'Meu pedido', 'Teste', 0)->>'id') as own_id \gset
select is(pg_temp.state_of(format($q$select public.restaurant_resolve_approval(%L, 'approved')$q$, :'own_id')), '42501',
  'ninguém aprova o próprio pedido');
select lives_ok(format($q$select public.restaurant_resolve_approval(%L, 'approved', 'Ok')$q$, :'approval_id'), 'gerente aprova o pedido do garçom');
select pg_temp.act(pg_temp.ctx('owner'));
select is((select discount_cents from public.orders where id = pg_temp.ctx('order')), 500::bigint, 'o desconto aprovado chega em centavos ao pedido');
select is(pg_temp.open_tasks('approval.requested'), 1, 'resolver fecha a tarefa; a outra segue aberta');
select is((select reason from public.audit_logs where action = 'approval.approved' and entity_id = :'approval_id'::uuid), 'Ok', 'aprovação deixa rastro');

-- ---------------------------------------------------------------------------
-- Critério 5: sem Gerente em turno, entram os gerentes ativos e o Dono
-- ---------------------------------------------------------------------------
select ok(private.manager_fallback_roles(pg_temp.ctx('r')) @> array['manager','owner']::public.user_roles_role_enum[],
  'critério 5: sem turno, gerentes ativos e Dono');
insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
  values (pg_temp.ctx('manager'), pg_temp.ctx('r'), (now() at time zone private.restaurant_time_zone())::date, '00:00', '23:59', 'manager', 'scheduled', false, now(), now());
select is(private.manager_fallback_roles(pg_temp.ctx('r')), array['manager']::public.user_roles_role_enum[], 'com Gerente em turno, só ele');

-- ---------------------------------------------------------------------------
-- Critério 6: engine_tick expira reserva, fila e aceite sem ninguém abrir tela
-- ---------------------------------------------------------------------------
do $$
declare v uuid; r uuid := pg_temp.ctx('r');
begin
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (r, pg_temp.ctx('customer'), now() - interval '5 hours', 2, 'confirmed') returning id into v;
  insert into _ctx values ('old_res', v);
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, party_size, status, position, missed_calls, called_at)
    values (r, pg_temp.ctx('customer'), 'Bia', 2, 'called', 9, 1, now()) returning id into v;
  update public.waitlist_entries set present_until = now() - interval '1 minute' where id = v;
  insert into _ctx values ('old_queue', v);
  perform private.engine_tick();
end $$;
select is((select status::text from public.reservations where id = pg_temp.ctx('old_res')), 'no_show', 'critério 6: reserva vencida vira no-show');
select is((select status::text from public.waitlist_entries where id = pg_temp.ctx('old_queue')), 'no_show', 'critério 6: chamado da fila vencido sai');
select is(pg_temp.open_tasks('queue.call_expired'), 1, 'chamado expirado avisa o Maître');
select ok((select count(*) = 1 from cron.job where jobname = 'engine-tick' and schedule = '* * * * *'), 'o tick roda a cada minuto');

-- ---------------------------------------------------------------------------
-- Critério 7: reenvio do mesmo evento não gera segunda tarefa nem segundo aviso
-- ---------------------------------------------------------------------------
do $$
declare n integer;
begin
  perform private.emit_event(pg_temp.ctx('r'), 'review.low', 'teste-reenvio', 'review', null, jsonb_build_object('title', 'x'));
  select count(*) into n from public.notifications where metadata->>'taskKind' = 'review.low';
  perform private.emit_event(pg_temp.ctx('r'), 'review.low', 'teste-reenvio', 'review', null, jsonb_build_object('title', 'x'));
  assert (select count(*) from public.staff_tasks where dedupe_key = 'teste-reenvio') = 1, 'uma tarefa';
  assert (select count(*) from public.domain_events where idempotency_key = 'teste-reenvio') = 1, 'um evento';
  assert (select count(*) from public.notifications where metadata->>'taskKind' = 'review.low') = n, 'sem novo aviso';
end $$;
select pass('critério 7: reenvio não gera segunda tarefa nem segundo aviso');

-- ---------------------------------------------------------------------------
-- Critério 6 (Quick): aceite sem resposta expira no tick
-- ---------------------------------------------------------------------------
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.ctx('customer'); o uuid; m1 uuid; v record;
begin
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[]
    where restaurant_id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'manual', accept_timeout_min = 5,
      no_pickup_policy = 'none', orders_paused = false
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  perform pg_temp.act(c);
  o := (public.customer_create_order_v2(r, 'quick_service', jsonb_build_array(jsonb_build_object('menu_item_id', m1, 'quantity', 1)),
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true)->>'id')::uuid;
  perform public.customer_start_payment(o, 'credit_card', gen_random_uuid());
  update public.orders set paid_at = now() - interval '10 minutes' where id = o;
  perform set_config('request.jwt.claims', '', true);
  perform private.engine_tick();
  perform pg_temp.act(pg_temp.ctx('owner'));
  insert into _ctx values ('quick', o);
end $$;
select is((select fulfillment_status::text || '/' || payment_status::text from public.orders where id = pg_temp.ctx('quick')), 'cancelled/refunded',
  'critério 6: Quick sem aceite no prazo cancela e estorna, sem tela aberta');
select ok((select count(*) = 0 from public.reservations where id = pg_temp.ctx('old_res') and status::text <> 'no_show'), 'o tick repete sem desfazer');

-- ---------------------------------------------------------------------------
-- Critério 1: o resto do catálogo
-- ---------------------------------------------------------------------------
select is(pg_temp.open_tasks('reservation.unconfirmed'), 1, 'reserva pendente perto da hora cobra a confirmação');
update public.reservations set party_size = 3 where id = pg_temp.ctx('res');
select is(pg_temp.open_tasks('reservation.changed'), 1, 'reserva alterada avisa o Maître');
update public.reservations set status = 'cancelled' where id = pg_temp.ctx('res');
select is(pg_temp.open_tasks('reservation.cancelled'), 1, 'reserva cancelada avisa o Maître');
select is(pg_temp.open_tasks('reservation.pending') + pg_temp.open_tasks('reservation.unconfirmed'), 0, 'cancelar fecha as tarefas da reserva');

do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.ctx('customer'); v uuid; o uuid; i uuid; s uuid := gen_random_uuid(); t jsonb; w record;
begin
  -- Reserva confirmada: chegando e atrasada, nas janelas do próprio restaurante.
  select * into w from private.reservation_check_in_window(r, now());
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (r, c, now() + (now() - w.opens_at) / 2, 2, 'confirmed');
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (r, c, now() - (w.closes_at - now()) * 3 / 4, 2, 'confirmed');
  perform private.engine_time_rules();

  -- Mesa e comanda próprias, para conta e comanda parada.
  perform pg_temp.act(pg_temp.ctx('owner'));
  t := public.restaurant_create_table(r, 'o2b-' || s, 4);
  insert into _ctx values ('table2', (t->>'id')::uuid), ('session2', s);
  insert into public.table_sessions(id, restaurant_id, table_id, status) values (s, r, (t->>'id')::uuid, 'active');
  update public.table_sessions set billing_status = 'billing' where id = s;
  update public.table_sessions set idle_alerted_at = now() where id = s;

  -- Curso disparado e item atrasado.
  insert into public.orders(restaurant_id, customer_id, order_type, table_id) values (r, c, 'dine_in', (t->>'id')::uuid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, status, course)
    values (o, pg_temp.ctx('menu'), 1, 10, 10, 'on_hold', 'main') returning id into i;
  perform public.restaurant_fire_course(o, 'main');
  insert into _ctx values ('fired_order', o);
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  insert into _ctx values ('late_item', i);
  update public.order_items set expected_ready_at = now() - interval '1 day' where id = i;
  perform private.engine_time_rules();
  update public.menu_items set is_available = false where id = pg_temp.ctx('menu');
  update public.menu_items set is_available = true where id = pg_temp.ctx('menu');
  update public.menu_items set is_available = false where id = pg_temp.ctx('menu');

  -- Pagamentos.
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, created_at, updated_at)
    values (r, 'manual', 'cash', 1000, 'completed', gen_random_uuid()::text, now(), now());
  -- Início de turno.
  insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
    values (pg_temp.ctx('maitre'), r, (now() at time zone private.restaurant_time_zone())::date,
      to_char(now() at time zone private.restaurant_time_zone(), 'HH24:MI'), '23:59', 'maitre', 'scheduled', false, now(), now());
  perform private.engine_time_rules();
end $$;
select is(pg_temp.open_tasks('reservation.arriving'), 1, 'janela de check-in abre o card Chegando');
select is(pg_temp.open_tasks('reservation.late'), 1, 'reserva atrasada alerta na metade da tolerância');
select is(pg_temp.open_tasks('bill.requested'), 1, 'conta pedida vira tarefa do garçom');
select is(pg_temp.open_tasks('session.idle'), 1, 'comanda parada vira tarefa do garçom');
select is((select count(*)::integer from public.domain_events where event_type = 'course.fired' and restaurant_id = pg_temp.ctx('r')), 1, 'curso disparado fica no log');
select is(pg_temp.open_tasks('item.late'), 1, 'item além do preparo mais a margem vira tarefa do Chef');
select is(pg_temp.open_tasks('item.unavailable'), 1, 'item indisponível avisa as mesas afetadas, uma tarefa só');
select ok((pg_temp.task('item.unavailable')).detail like 'Pedidos afetados:%', 'a tarefa diz quais mesas');
select is(pg_temp.open_tasks('payment.in_person'), 1, 'pagamento presencial vai ao caixa');
select is(pg_temp.open_tasks('shift.started'), 1, 'início de turno avisa Maître e Gerente');

select public.restaurant_update_order_item_status(pg_temp.ctx('late_item'), 'ready');
select is(pg_temp.open_tasks('item.late'), 0, 'item pronto fecha o atraso');
update public.table_sessions set status = 'closed' where id = pg_temp.ctx('session2');
select is(pg_temp.open_tasks('bill.requested') + pg_temp.open_tasks('session.idle'), 0, 'fechar a comanda fecha as tarefas dela');

-- Dado antigo não vira tarefa.
do $$
declare v uuid;
begin
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), now() - interval '3 months', 2, 'pending') returning id into v;
  insert into _ctx values ('stale', v);
  perform private.engine_time_rules();
end $$;
select is((select count(*)::integer from public.staff_tasks where entity_id = pg_temp.ctx('stale') and kind <> 'reservation.pending'), 0,
  'regra por tempo não acorda dado antigo');

-- ---------------------------------------------------------------------------
-- Tarefa de aprovação só fecha resolvendo
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('manager'));
select is(pg_temp.state_of(format($q$select public.restaurant_complete_task(%L)$q$, (pg_temp.task('approval.requested')).id)), '23514',
  'concluir a tarefa não some com o pedido de aprovação');
select pg_temp.act(pg_temp.ctx('owner'));

-- ---------------------------------------------------------------------------
-- Push: retentativa
-- ---------------------------------------------------------------------------
do $$
declare u uuid := pg_temp.ctx('waiter'); fresh uuid; due uuid; exhausted uuid; expired uuid; closed uuid; task uuid;
begin
  task := (pg_temp.task('call.created')).id;
  insert into public.notifications(user_id, title, message, notification_type, created_at) values (u, 'novo', 'x', 'staff_task', now()) returning id into fresh;
  insert into public.notifications(user_id, title, message, notification_type, created_at) values (u, 'devido', 'x', 'staff_task', now() - interval '5 minutes') returning id into due;
  insert into public.notifications(user_id, title, message, notification_type, created_at, push_attempts) values (u, 'esgotado', 'x', 'staff_task', now() - interval '5 minutes', 5) returning id into exhausted;
  insert into public.notifications(user_id, title, message, notification_type, created_at) values (u, 'velho', 'x', 'staff_task', now() - interval '3 hours') returning id into expired;
  insert into public.notifications(user_id, title, message, notification_type, created_at, related_id, related_type) values (u, 'fechada', 'x', 'staff_task', now() - interval '5 minutes', task, 'staff_task') returning id into closed;
  insert into _ctx values ('n_fresh', fresh), ('n_due', due), ('n_exhausted', exhausted), ('n_expired', expired), ('n_closed', closed);
end $$;
select ok((select count(*) = 1 from private.push_retry_candidates() where id = pg_temp.ctx('n_due')), 'push sem envio é tentado de novo');
select ok((select count(*) = 0 from private.push_retry_candidates() where id in (pg_temp.ctx('n_fresh'), pg_temp.ctx('n_exhausted'), pg_temp.ctx('n_expired'), pg_temp.ctx('n_closed'))),
  'não insiste: recém-criado, esgotado, velho ou de tarefa fechada');

-- ---------------------------------------------------------------------------
-- Concluir faz o ato, ou é recusado quando só a tela decide
-- ---------------------------------------------------------------------------
select is((select status from public.service_calls where id = (pg_temp.task('call.created')).entity_id), 'resolved',
  'concluir o chamado resolve o chamado');
do $$
declare r uuid := pg_temp.ctx('r'); v uuid; o uuid; i uuid; s uuid := gen_random_uuid();
begin
  update public.menu_items set is_available = true where id = pg_temp.ctx('menu');
  v := (public.restaurant_create_table(r, 'o2c-' || s, 4)->>'id')::uuid;
  insert into _ctx values ('table3', v), ('session3', s);
  update public.tables set status = 'cleaning' where id = v;
  perform pg_temp.act(pg_temp.ctx('waiter'));
  perform public.restaurant_complete_task((select id from public.staff_tasks where dedupe_key = 'table.cleaning:' || v and status = 'open'));
  perform pg_temp.act(pg_temp.ctx('owner'));
  -- Pedido na mesa nova.
  insert into public.table_sessions(id, restaurant_id, table_id, status) values (s, r, v, 'active');
  insert into public.orders(restaurant_id, customer_id, order_type, table_id, table_session_id)
    values (r, pg_temp.ctx('customer'), 'dine_in', v, s) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  insert into _ctx values ('order3', o), ('item3', i);
  perform public.restaurant_update_order_item_status(i, 'ready');
end $$;
select is((select status from public.tables where id = pg_temp.ctx('table3')), 'available', 'concluir "Liberar mesa" libera a mesa');
select is((select completed_by from public.staff_tasks where dedupe_key = 'table.cleaning:' || pg_temp.ctx('table3')), pg_temp.ctx('waiter'),
  'e guarda quem concluiu');
select pg_temp.act(pg_temp.ctx('waiter'));
select is(public.restaurant_complete_task((select id from public.staff_tasks where dedupe_key = 'item.ready:' || pg_temp.ctx('order3') and status = 'open'))->>'closed', 'true',
  'concluir "Retirar no passe" funciona');
select pg_temp.act(pg_temp.ctx('owner'));
select is((select status::text from public.order_items where id = pg_temp.ctx('item3')), 'delivered', 'e entrega o que estava pronto');
select pg_temp.act(pg_temp.ctx('maitre'));
select is(pg_temp.state_of(format($q$select public.restaurant_complete_task(%L)$q$, (pg_temp.task('reservation.pending')).id)), '23514',
  'tarefa que pede decisão não fecha com Concluir');
select pg_temp.act(pg_temp.ctx('owner'));
select is((select metadata->>'category' from public.notifications where metadata->>'taskKind' = 'reservation.pending' limit 1), 'staff_task_claim',
  'e o push dela só oferece Assumir');
select is((select metadata->>'recipientId' from public.notifications where metadata->>'taskKind' = 'approval.requested' and user_id = pg_temp.ctx('owner') limit 1),
  pg_temp.ctx('owner')::text, 'o push diz para quem foi: o botão não vale em outra sessão');

-- ---------------------------------------------------------------------------
-- A tarefa acompanha o que mudou
-- ---------------------------------------------------------------------------
create function pg_temp.open_of(p_entity uuid) returns integer language sql as $$
  select count(*)::integer from public.staff_tasks where entity_id = p_entity and status = 'open'
$$;
do $$
declare v uuid;
begin
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), now() + interval '3 hours', 2, 'pending') returning id into v;
  insert into _ctx values ('res_confirm', v);
  perform private.engine_time_rules();
end $$;
select is(pg_temp.open_of(pg_temp.ctx('res_confirm')), 2, 'pendente perto da hora: aprovar e confirmar');
update public.reservations set status = 'confirmed' where id = pg_temp.ctx('res_confirm');
select is(pg_temp.open_of(pg_temp.ctx('res_confirm')), 0, 'confirmar fecha as duas');

do $$
declare v uuid; w record;
begin
  select * into w from private.reservation_check_in_window(pg_temp.ctx('r'), now());
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
    values (pg_temp.ctx('r'), pg_temp.ctx('customer'), now() + (now() - w.opens_at) / 2, 2, 'confirmed') returning id into v;
  insert into _ctx values ('res_move', v);
  perform private.engine_time_rules();
end $$;
select is(pg_temp.open_of(pg_temp.ctx('res_move')), 1, 'reserva confirmada na janela: Chegando');
update public.reservations set reservation_time = reservation_time + interval '2 hours' where id = pg_temp.ctx('res_move');
select is((select count(*)::integer from public.staff_tasks where entity_id = pg_temp.ctx('res_move') and status = 'open' and kind = 'reservation.arriving'), 0,
  'remarcar tira o card do horário antigo');
update public.reservations set reservation_time = reservation_time - interval '119 minutes' where id = pg_temp.ctx('res_move');
select private.engine_time_rules();
select is((select count(*)::integer from public.staff_tasks where entity_id = pg_temp.ctx('res_move') and status = 'open' and kind = 'reservation.arriving'), 1,
  'e o card volta no horário novo');

do $$
declare o uuid := pg_temp.ctx('order3');
begin
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, pg_temp.ctx('menu'), 1, 10, 10);
end $$;
select is((select count(*)::integer from public.staff_tasks where dedupe_key = 'order.created:' || pg_temp.ctx('order3') and status = 'open'), 1,
  'item novo em pedido que já ficou pronto gera tarefa para a cozinha');

update public.table_sessions set billing_status = 'billing' where id = pg_temp.ctx('session3');
update public.table_sessions set billing_status = 'open' where id = pg_temp.ctx('session3');
select is((select count(*)::integer from public.staff_tasks where dedupe_key = 'bill.requested:' || pg_temp.ctx('session3') and status = 'open'), 0,
  'reabrir a conta fecha "Conta pedida"');
update public.table_sessions set idle_alerted_at = now() - interval '1 minute' where id = pg_temp.ctx('session3');
update public.table_sessions set last_activity = now() + interval '1 minute' where id = pg_temp.ctx('session3');
select is((select count(*)::integer from public.staff_tasks where dedupe_key = 'session.idle:' || pg_temp.ctx('session3') and status = 'open'), 0,
  'movimento novo fecha "Comanda parada"');

-- Item em espera: o atraso conta de quando foi disparado.
do $$
declare o uuid; i uuid; v uuid := pg_temp.ctx('table2');
begin
  insert into public.orders(restaurant_id, customer_id, order_type, table_id) values (pg_temp.ctx('r'), pg_temp.ctx('customer'), 'dine_in', v) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, status, course, created_at)
    values (o, pg_temp.ctx('menu'), 1, 10, 10, 'on_hold', 'dessert', now() - interval '2 hours') returning id into i;
  perform public.restaurant_fire_course(o, 'dessert');
  perform private.engine_time_rules();
  insert into _ctx values ('held_item', i);
end $$;
select is((select status::text from public.order_items where id = pg_temp.ctx('held_item')), 'preparing', 'item disparado em preparo');
select is((select count(*)::integer from public.domain_events where idempotency_key = 'item.late:' || pg_temp.ctx('held_item')), 0,
  'item recém-disparado não nasce atrasado');

-- Cada pagamento presencial tem o próprio aviso.
insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, created_at, updated_at)
  values (pg_temp.ctx('r'), 'manual', 'pix', 2000, 'completed', gen_random_uuid()::text, now(), now());
select is(pg_temp.open_tasks('payment.in_person'), 2, 'dois pagamentos presenciais, dois avisos');

-- Turno: virada da meia-noite e hora inválida.
select ok(private.shift_covers('2026-11-03', '18:00', '02:00', '2026-11-04 01:00'), 'turno noturno vale depois da meia-noite');
select ok(private.shift_covers('2026-11-03', '10:00', '18:00', '2026-11-03 12:00'), 'turno de dia vale dentro do horário');
select ok(not private.shift_covers('2026-11-03', '18:00', '02:00', '2026-11-04 03:00'), 'turno noturno acaba');
select ok(not private.shift_covers('2026-11-03', '18:00', '02:00', '2026-11-03 17:00'), 'turno noturno ainda não começou');
select is(private.shift_time('25:00'), null, 'hora inválida não é hora');
insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
  values (pg_temp.ctx('manager'), pg_temp.ctx('r'), (now() at time zone private.restaurant_time_zone())::date, '25:00', 'tarde', 'manager', 'scheduled', false, now(), now());
select lives_ok($q$select private.engine_time_rules()$q$, 'turno com hora inválida não derruba as regras');
select lives_ok(format($q$select private.manager_on_shift(%L)$q$, pg_temp.ctx('r')), 'nem a busca de Gerente');

-- Quem pediu pode desistir, mesmo sem poder aprovar.
select pg_temp.act(pg_temp.ctx('manager'));
select lives_ok(format($q$select public.restaurant_resolve_approval(%L, 'rejected', 'Desisti')$q$, :'own_id'), 'quem pediu pode desistir');
select pg_temp.act(pg_temp.ctx('owner'));

-- Nada do que rodou acima falhou em silêncio.
select is((select count(*)::integer from public.audit_logs where action = 'engine.emit_failed'), 0, 'nenhum evento caiu na rede de proteção');

-- ---------------------------------------------------------------------------
-- Critério 8: outro estabelecimento não lê
-- ---------------------------------------------------------------------------
select pg_temp.act('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.staff_tasks where restaurant_id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'critério 8: dono de outra casa não lê as tarefas');
select is((select count(*)::integer from public.domain_events where restaurant_id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'critério 8: nem os eventos');
reset role;
select is(pg_temp.state_of(format($q$select public.restaurant_list_tasks(%L)$q$, pg_temp.ctx('r'))), '42501', 'critério 8: nem pela RPC');
select ok((select count(*) = 2 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('staff_tasks', 'approvals')),
  'critério 8: tarefas no Realtime, com RLS');

select * from finish();
rollback;
