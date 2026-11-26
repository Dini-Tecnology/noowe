-- QA 26/11 itens 5 e 12: CPF só com consentimento e nota da conveniência sem ele; aceite dos Termos registrado no servidor;
-- eliminação das contas excluídas depois da carência.
begin;
select plan(12);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _u(k text primary key, v uuid);
insert into _u select k, gen_random_uuid() from unnest(array['a', 'b', 'old', 'hist', 'new']) k;
grant select on _u to authenticated;
insert into auth.users(id, email) select v, v || '@lgpd110.test' from _u;
insert into public.profiles(id, full_name) select v, 'Teste ' || k from _u on conflict (id) do update set full_name = excluded.full_name;
create function pg_temp.u(p text) returns uuid language sql as $$ select v from _u where k = p $$;

-- 5. Nenhum CPF guardado sem consentimento.
select ok(not exists (select 1 from private.customer_tax_documents where consent_at is null),
  'não sobra CPF guardado sem consentimento');

-- Sem CPF guardado, a nota da conveniência usa o CPF na nota daquele pagamento; sem nenhum, espera sem quebrar.
do $$
declare r uuid := (select id from public.restaurants limit 1); g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid();
begin
  insert into public.gateway_transactions(id, restaurant_id, provider, amount_cents, status, payment_method, idempotency_key, purpose, confirmed_at, convenience_cents, customer_id, created_at, updated_at)
    values (g1, r, 'asaas', 2000, 'completed', 'pix', 'l110-' || g1, 'order', now(), 99, pg_temp.u('a'), now(), now()),
           (g2, r, 'asaas', 2000, 'completed', 'pix', 'l110-' || g2, 'order', now(), 99, pg_temp.u('b'), now(), now());
  insert into private.payment_receipt_documents(gateway_transaction_id, document) values (g1, '52998224725');
  insert into _u values ('g1', g1), ('g2', g2);
end $$;
select lives_ok($$select private.fee_notes_generate(now())$$, 'gerar as notas não quebra sem CPF guardado');
select is((select taker_document from private.noowe_fee_notes where gateway_transaction_id = pg_temp.u('g1')), '52998224725',
  'tomador vem do CPF informado no pagamento');
select ok((select taker_document is null and status = 'waiting_data' from private.noowe_fee_notes where gateway_transaction_id = pg_temp.u('g2')),
  'sem CPF nenhum a nota espera');

-- 12a. Aceite dos Termos.
select pg_temp.act(pg_temp.u('a'));
set local role authenticated;
select public.accept_legal_terms('1.0', '1.0');
select public.accept_legal_terms('1.0', '1.0');
select is((select count(*)::int from public.user_consents where user_id = pg_temp.u('a')), 2, 'aceite grava termos e privacidade uma vez');
select public.accept_legal_terms('1.1', '1.0');
select ok((select count(*) = 3 and bool_and(accepted_at <= now()) from public.user_consents where user_id = pg_temp.u('a')),
  'versão nova é um aceite novo, com a hora do servidor');
select throws_ok($$insert into public.user_consents(user_id, consent_type, version) values (auth.uid(), 'terms_of_service', '9')$$,
  '42501', null, 'o app não grava aceite direto');
select throws_ok($$delete from public.user_consents$$, '42501', null, 'nem apaga');
select throws_ok($$select public.accept_legal_terms('', '1.0')$$, '22023', null, 'versão vazia é recusada');
select pg_temp.act(pg_temp.u('b'));
select is((select count(*)::int from public.user_consents where user_id = pg_temp.u('a')), 0, 'um usuário não vê o aceite do outro');
reset role;

-- 12b. Eliminação após a carência (parâmetro em private.noowe_company).
update public.profiles set deletion_requested_at = now() - make_interval(days => (select account_deletion_grace_days + 1 from private.noowe_company limit 1))
  where id in (pg_temp.u('old'), pg_temp.u('hist'));
update public.profiles set deletion_requested_at = now() - interval '1 day' where id = pg_temp.u('new');
insert into public.orders(restaurant_id, customer_id) values ((select id from public.restaurants limit 1), pg_temp.u('hist'));
select public.service_customer_save_tax_document(pg_temp.u('hist'), '52998224725', 'payment', true, 'v1');
select private.purge_deleted_accounts(now());

select ok(not exists (select 1 from auth.users where id = pg_temp.u('old')) and not exists (select 1 from public.profiles where id = pg_temp.u('old')),
  'conta sem histórico é eliminada por inteiro');
select ok((select u.email like 'deleted-%' and u.phone is null from auth.users u where u.id = pg_temp.u('hist'))
    and (select deleted_at is not null and full_name = 'Usuário excluído' from public.profiles where id = pg_temp.u('hist'))
    and exists (select 1 from public.orders where customer_id = pg_temp.u('hist'))
    and not exists (select 1 from private.customer_tax_documents where user_id = pg_temp.u('hist'))
    and exists (select 1 from auth.users where id = pg_temp.u('new'))
    and (select deleted_at is null from public.profiles where id = pg_temp.u('new')),
  'com pedido, o pedido fica com o perfil anônimo e o resto sai; dentro da carência nada muda');

select * from finish();
rollback;
