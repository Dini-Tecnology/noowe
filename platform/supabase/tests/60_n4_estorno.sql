-- N4: o estorno chega ao provedor, com aprovação registrada, e a nota fiscal acompanha.
begin;
select plan(9);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Pagamento real concluído, ligado a uma comanda de duas pessoas já paga por inteiro.
create function pg_temp.new_paid(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid; u uuid;
begin
  insert into auth.users(id, email) values (a, a || '@refund.test'), (b, b || '@refund.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-refund-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20, 60);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  foreach u in array array[a, b] loop
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    update public.gateway_transactions set provider_ref = 'pay_' || tx.id where id = tx.id;
    perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
    insert into _ctx values (p_label || ':tx:' || (case when u = a then 'a' else 'b' end), tx.id), (p_label || ':' || (case when u = a then 'a' else 'b' end), u);
  end loop;
  insert into _ctx values (p_label || ':sid', sid);
  return sid;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m uuid := gen_random_uuid();
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  insert into auth.users(id, email) values (m, m || '@refund.test');
  insert into public.profiles(id) values (m) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (m, r, 'manager', true);
  insert into _ctx values ('manager', m), ('owner', 'c1000000-0000-4000-8000-000000000001');
  perform pg_temp.new_paid('main');
end $$;

-- Critério 5: aprovação registrada, com autor, motivo e horário; ninguém aprova o próprio.
do $$
declare tx uuid := pg_temp.ctx('main:tx:a'); a jsonb; m uuid := pg_temp.ctx('manager'); w uuid := gen_random_uuid(); r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.act(pg_temp.ctx('main:a'));
  assert pg_temp.state_of(format($q$select public.restaurant_request_refund(%L, 'quero')$q$, tx)) = '42501', 'cliente não pede estorno por aqui';
  perform pg_temp.act(m);
  assert pg_temp.state_of(format($q$select public.restaurant_request_refund(%L, ' ')$q$, tx)) = '22023', 'motivo obrigatório';
  assert pg_temp.state_of(format($q$select public.restaurant_request_refund(%L, 'x', 99999999)$q$, tx)) = '23514', 'não passa do pago';
  a := public.restaurant_request_refund(tx, 'Prato veio errado');
  assert a->>'status' = 'pending', 'gerente pede, não aplica';
  assert not exists (select 1 from public.payment_refunds where gateway_transaction_id = tx), 'nada sai antes de aprovar';
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'pagamento segue de pé';
  assert pg_temp.state_of(format($q$select public.restaurant_request_refund(%L, 'de novo')$q$, tx)) = '23505', 'um pedido por vez';
  assert pg_temp.state_of(format($q$select public.restaurant_resolve_approval(%L, 'approved')$q$, a->>'id')) <> 'ok', 'ninguém aprova o próprio pedido';
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_resolve_approval((a->>'id')::uuid, 'approved', 'Confirmado');
  assert (select status from public.payment_refunds where gateway_transaction_id = tx) = 'pending', 'aprovado, entra na fila';
  assert (select requested_by from public.payment_refunds where gateway_transaction_id = tx) = m, 'autor registrado';
  assert (select reason from public.payment_refunds where gateway_transaction_id = tx) = 'Prato veio errado', 'motivo registrado';
  assert (select status from public.gateway_transactions where id = tx) = 'refund_pending', 'aguardando o provedor';
  assert exists (select 1 from public.audit_logs where action = 'approval.approved' and entity_id = (a->>'id')::uuid), 'aprovação auditada';
end $$;
select pass('critério 5: estorno exige aprovação registrada, e nada sai antes dela');

-- Worker: envio, confirmação pelo webhook e reenvio.
do $$
declare tx uuid := pg_temp.ctx('main:tx:a'); rid uuid := (select id from public.payment_refunds where gateway_transaction_id = pg_temp.ctx('main:tx:a')); j jsonb; amount bigint;
begin
  j := public.service_refund_claim(rid);
  assert (j->>'claimed')::boolean and j->>'action' = 'send' and (j->>'total')::boolean, 'reservado para envio';
  assert j->>'providerRef' = 'pay_' || tx, 'vai a referência do provedor';
  assert not (public.service_refund_claim(rid)->>'claimed')::boolean, 'dois workers não enviam o mesmo';
  perform public.service_refund_record(rid, 'transient', 'fora do ar');
  assert (select status from public.payment_refunds where id = rid) = 'pending' and (select next_attempt_at from public.payment_refunds where id = rid) > now(), 'falha tenta de novo mais tarde';
  assert not (public.service_refund_claim(rid)->>'claimed')::boolean, 'respeita a espera';
  update public.payment_refunds set next_attempt_at = now() - interval '1 second' where id = rid;
  j := public.service_refund_claim(rid);
  perform public.service_refund_record(rid, 'sent');
  assert (select status from public.payment_refunds where id = rid) = 'sent', 'aceito pelo provedor';
  assert (select status from public.gateway_transactions where id = tx) = 'refund_pending', 'aceitar não é devolver: quem confirma é o webhook';
  select amount_cents into amount from public.gateway_transactions where id = tx;
  perform private.apply_payment_event(tx, 'asaas', 'evt-ref-' || tx, 'PAYMENT_REFUNDED', 'refunded', null, '{}', 'refunded');
  assert (select status from public.payment_refunds where id = rid) = 'done', 'webhook conclui o estorno';
  assert (select status from public.gateway_transactions where id = tx) = 'refunded' and (select refunded_amount_cents from public.gateway_transactions where id = tx) = amount, 'valor devolvido registrado';
  assert (select status from public.bill_shares where payment_id = tx) = 'refunded', 'a parcela acompanha';
  assert not (public.service_refund_claim(rid)->>'claimed')::boolean, 'concluído não sai de novo';
end $$;
select pass('worker: reserva, tenta de novo e só o webhook conclui');

select ok(not has_function_privilege('authenticated', 'public.service_refund_claim(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.service_refund_record(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.service_fiscal_cancel_claim(uuid)', 'EXECUTE'), 'as portas do worker não abrem para o app');

-- Recusa do provedor: o dinheiro não saiu, a venda volta a valer, e alguém é avisado.
do $$
declare tx uuid := pg_temp.ctx('main:tx:b'); rid uuid;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_request_refund(tx, 'Cliente desistiu');
  select id into rid from public.payment_refunds where gateway_transaction_id = tx;
  perform public.service_refund_claim(rid);
  perform public.service_refund_record(rid, 'failed', 'Asaas recusou');
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'venda volta a valer';
  assert exists (select 1 from public.audit_logs where action = 'payment.refund_failed' and entity_id = tx), 'fica registrado';
  assert exists (select 1 from public.notifications n join public.user_roles u on u.user_id = n.user_id where n.metadata->>'refund_id' = rid::text and u.role = 'owner'), 'o Dono é avisado';
  -- Depois disso, dá para pedir de novo.
  assert private.refund_available_cents(tx) > 0, 'o valor segue disponível';
end $$;
select pass('recusa do provedor: venda volta a valer e o Dono é avisado');

-- Estorno parcial: a venda continua, e só o valor muda.
do $$
declare s uuid := pg_temp.new_paid('part'); tx uuid := pg_temp.ctx('part:tx:a'); rid uuid; amount bigint;
begin
  select amount_cents into amount from public.gateway_transactions where id = tx;
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_request_refund(tx, 'Item esgotado', 500);
  select id into rid from public.payment_refunds where gateway_transaction_id = tx;
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'parcial não tira a venda';
  assert not (public.service_refund_claim(rid)->>'total')::boolean, 'worker sabe que é parcial';
  perform public.service_refund_record(rid, 'sent');
  perform private.apply_payment_event(tx, 'asaas', 'evt-in-' || tx, 'PAYMENT_REFUND_IN_PROGRESS', 'refund_pending', null, '{}', 'refund_pending');
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'em andamento parcial não muda a venda';
  perform private.apply_payment_event(tx, 'asaas', 'evt-p-' || tx, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (select refunded_amount_cents from public.gateway_transactions where id = tx) = 500, 'só o valor devolvido';
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'venda continua';
  assert (select status from public.bill_shares where payment_id = tx) = 'paid', 'parcela continua paga';
  assert (select status from public.payment_refunds where id = rid) = 'done', 'estorno concluído';
  assert private.refund_available_cents(tx) = amount - 500, 'só o resto pode voltar';
end $$;
select pass('estorno parcial não derruba a venda');

-- Quick: cancelar pedido pago devolve de verdade.
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; a uuid := gen_random_uuid(); o uuid; tx uuid; menu uuid; item uuid;
begin
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[], pickup_capacity_per_slot = 5 where restaurant_id = r;
  insert into auth.users(id, email) values (a, a || '@refund.test');
  insert into public.profiles(id) values (a) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform set_config('noowe.status_actor', 'system', true);
  insert into public.orders(restaurant_id, customer_id, service_model, payment_status, order_type, total_cents, fulfillment_status)
    values (r, a, 'quick_service', 'confirmed', 'pickup', 3000, 'accepted') returning id into o;
  insert into public.gateway_transactions(restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, provider_ref, created_at, updated_at)
    values (r, o, a, 'asaas', 'pix', 3000, 0, 'completed', 'test-' || o, 'order', 'pay_q', now(), now()) returning id into tx;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 30, 30);
  update public.orders set cancellation_reason = 'Sem ingrediente' where id = o;
  -- O status do pedido vem dos itens (invariante 5).
  update public.order_items set status = 'cancelled' where order_id = o;
  assert (select payment_status from public.orders where id = o) = 'refund_pending', 'cancelado aguarda o provedor, não finge que devolveu';
  assert (select status from public.payment_refunds where gateway_transaction_id = tx) = 'pending', 'entra na fila';
  assert (select status from public.gateway_transactions where id = tx) = 'refund_pending', 'transação aguardando';
  assert (select refunded_amount_cents from public.gateway_transactions where id = tx) = 0, 'nada devolvido ainda';
  perform private.apply_payment_event(tx, 'asaas', 'evt-q-' || tx, 'PAYMENT_REFUNDED', 'refunded', null, '{}', 'refunded');
  assert (select payment_status from public.orders where id = o) = 'refunded', 'confirmado pelo provedor';
  perform set_config('noowe.status_actor', '', true);
end $$;
select pass('cancelar pedido pago do Quick chega ao provedor e só o webhook marca como estornado');

-- Nota fiscal: estorno da venda inteira cancela; de parte, avisa para revisar.
do $$
declare s uuid := pg_temp.new_paid('fis'); d uuid := gen_random_uuid(); ta uuid := pg_temp.ctx('fis:tx:a'); tb uuid := pg_temp.ctx('fis:tx:b'); j jsonb; r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  delete from public.fiscal_documents where table_session_id = s;
  insert into public.fiscal_documents(id, restaurant_id, table_session_id, external_ref, total_cents, status) values (d, r, s, 's-' || s, 6000, 'authorized');
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_request_refund(ta, 'Só uma parte');
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'pedir não mexe na nota';
  perform private.apply_payment_event(ta, 'asaas', 'evt-fa-' || ta, 'PAYMENT_REFUNDED', 'refunded', null);
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'parte da venda não cancela a nota';
  assert exists (select 1 from public.audit_logs where action = 'fiscal.refund_review' and entity_id = d), 'pede revisão';
  perform public.restaurant_request_refund(tb, 'O restante');
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'antes de o dinheiro voltar, a nota segue';
  perform private.apply_payment_event(tb, 'asaas', 'evt-fb-' || tb, 'PAYMENT_REFUNDED', 'refunded', null);
  assert (select cancel_status from public.fiscal_documents where id = d) = 'requested', 'toda a venda estornada cancela a nota';
  assert length((select cancel_reason from public.fiscal_documents where id = d)) between 15 and 255, 'justificativa no tamanho da SEFAZ';
  perform public.service_fiscal_configure(r, jsonb_build_object('cnpj', '12.345.678/0001-23', 'razaoSocial', 'Casa LTDA', 'stateCode', 'SP',
    'regimeTributario', 'simples_nacional', 'taxDefaults', jsonb_build_object('ncm', '21069090')), 'tok-homolog');
  j := public.service_fiscal_cancel_claim(d);
  assert (j->>'claimed')::boolean and j->>'ref' = 's-' || s and j->>'token' = 'tok-homolog', 'worker recebe o que precisa';
  assert not (public.service_fiscal_cancel_claim(d)->>'claimed')::boolean, 'dois workers não cancelam a mesma nota';
  perform public.service_fiscal_cancel_record(d, 'failed', 'Prazo de cancelamento superior ao permitido');
  assert (select cancel_status from public.fiscal_documents where id = d) = 'failed', 'recusa da SEFAZ fica registrada';
  assert (select status from public.fiscal_documents where id = d) = 'authorized', 'a nota segue autorizada';
  assert exists (select 1 from public.notifications where metadata->>'kind' = 'staff_fiscal_cancel_failed' and metadata->>'document_id' = d::text), 'gerente e Dono são avisados';
end $$;
select pass('estorno de toda a venda pede o cancelamento da nota; de parte dela, pede revisão');

select is((select count(*)::int from public.gateway_transactions g where g.id = pg_temp.ctx('main:tx:a') and g.status = 'refunded'), 1, 'estorno concluído continua registrado');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_refunds'::regclass), 'RLS ligado na fila de estornos');

select * from finish();
rollback;
