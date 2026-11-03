-- ADR-020: cadastro da conta de recebimento Asaas. A apiKey fica no Vault, do token só o sha256,
-- a comissão vem de parâmetro, `active` só depois do KYC e outro restaurante não vê a conta.
begin;
select plan(32);

create temp table _acct(k text primary key, v uuid);
grant select on _acct to authenticated, anon;
create or replace function pg_temp.id(p_k text) returns uuid language sql as $$ select v from _acct where k = p_k $$;
create or replace function pg_temp.hash() returns text language sql as $$ select repeat('a', 64) $$;

do $$
declare u text; r uuid := gen_random_uuid(); other uuid := gen_random_uuid();
begin
  foreach u in array array['owner', 'manager', 'waiter', 'other_owner'] loop
    insert into _acct values (u, gen_random_uuid());
    insert into auth.users(id, email) values ((select v from _acct where k = u), u || '@acct.test');
    insert into public.profiles(id) values ((select v from _acct where k = u)) on conflict do nothing;
  end loop;
  insert into _acct values ('r', r), ('other', other);
  insert into public.restaurants(id, name, owner_id, address, city, email, phone, service_type, state, zip_code) values
    (r, 'Conta A', (select v from _acct where k = 'owner'), 'Rua A', 'SP', 'a@acct.test', '11900000000', 'casual_dining', 'SP', '01000000'),
    (other, 'Conta B', (select v from _acct where k = 'other_owner'), 'Rua B', 'SP', 'b@acct.test', '11900000001', 'casual_dining', 'SP', '01000000');
  insert into public.user_roles(user_id, restaurant_id, role) values
    ((select v from _acct where k = 'manager'), r, 'manager'),
    ((select v from _acct where k = 'waiter'), r, 'waiter');
end $$;

-- Comissão: parâmetro do banco, sem valor padrão no código.
delete from private.payment_platform_config;
select is(public.service_payment_account_begin(pg_temp.id('owner'), pg_temp.id('r'), pg_temp.hash())->>'error',
  'platform_fee_not_configured', 'sem comissão configurada o cadastro não começa');
select is((select count(*)::int from public.restaurant_payment_accounts where restaurant_id = pg_temp.id('r')), 0, 'a tentativa não deixa linha');

insert into private.payment_platform_config (platform_fee_bps) values (137);

-- Só o dono inicia.
select throws_ok(format($$ select public.service_payment_account_begin(%L, %L, %L) $$, pg_temp.id('manager'), pg_temp.id('r'), pg_temp.hash()),
  '42501', null, 'gerente não inicia o cadastro');
select throws_ok(format($$ select public.service_payment_account_begin(%L, %L, %L) $$, pg_temp.id('other_owner'), pg_temp.id('r'), pg_temp.hash()),
  '42501', null, 'dono de outro restaurante não inicia o cadastro');
select throws_ok(format($$ select public.service_payment_account_begin(%L, %L, %L) $$, pg_temp.id('owner'), pg_temp.id('r'), 'token-puro'),
  '22023', null, 'só aceita um sha256, nunca o token');

select lives_ok(format($$ insert into _acct select 'acct', (public.service_payment_account_begin(%L, %L, %L)->>'accountId')::uuid $$,
  pg_temp.id('owner'), pg_temp.id('r'), pg_temp.hash()), 'dono inicia o cadastro');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'creating', 'começa em creating');
select is((select platform_fee_bps from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 137, 'a comissão vem do parâmetro');
select is((select webhook_token_hash from public.restaurant_payment_accounts where id = pg_temp.id('acct')), pg_temp.hash(), 'guarda o hash do token');
select ok(exists (select 1 from public.audit_logs where entity_id = pg_temp.id('acct') and action = 'payment_account_started'
    and user_id = pg_temp.id('owner') and reason is not null), 'início do cadastro fica no audit log');

-- Situação do Asaas não ativa conta que ainda não tem subconta.
select public.service_payment_account_apply_status(pg_temp.id('acct'), 'APPROVED');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'creating', 'sem subconta, APPROVED não ativa');

-- Vault: a chave não fica em coluna nenhuma.
select lives_ok(format($$ select public.service_payment_account_attach(%L, %L, 'acc_1', 'wallet_1', '$aact_hmlg_chave_de_teste', %L) $$,
  pg_temp.id('acct'), pg_temp.id('owner'), repeat('b', 64)), 'vincula a subconta');
select is((select webhook_token_hash from public.restaurant_payment_accounts where id = pg_temp.id('acct')), repeat('b', 64),
  'fica o hash do token enviado ao Asaas, mesmo se um begin concorrente trocou o da linha');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'pending_kyc', 'fica aguardando o KYC');
select is(private.payment_account_api_key(pg_temp.id('acct')), '$aact_hmlg_chave_de_teste', 'a chave é lida do Vault por api_key_secret_id');
select ok((select to_jsonb(a)::text not like '%aact_hmlg_chave_de_teste%' from public.restaurant_payment_accounts a where id = pg_temp.id('acct')),
  'a linha da conta não contém a chave');
select ok((select string_agg(coalesce("after"::text, '') || coalesce(reason, ''), ' ') not like '%aact_hmlg%' from public.audit_logs where entity_id = pg_temp.id('acct')),
  'o audit log não contém a chave');
select throws_ok(format($$ select public.service_payment_account_attach(%L, %L, 'acc_2', 'wallet_2', 'outra', %L) $$, pg_temp.id('acct'), pg_temp.id('owner'), repeat('c', 64)),
  'P0001', null, 'não vincula uma segunda subconta');

-- Repetir o início não cria outra conta.
select ok((public.service_payment_account_begin(pg_temp.id('owner'), pg_temp.id('r'), pg_temp.hash())->>'alreadyCreated')::boolean, 'repetir informa que já foi criada');
select is((select count(*)::int from public.restaurant_payment_accounts where restaurant_id = pg_temp.id('r')), 1, 'continua uma conta só');

-- KYC: só APPROVED ativa.
select public.service_payment_account_apply_status(pg_temp.id('acct'), 'AWAITING_APPROVAL', 'https://asaas.test/link');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'pending_kyc', 'em análise continua pendente');
select is((select onboarding_url from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'https://asaas.test/link', 'guarda o link de documentos');
select public.service_payment_account_apply_status(pg_temp.id('acct'), 'QUALQUER_COISA');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'pending_kyc', 'situação desconhecida não muda nada');
select public.service_payment_account_apply_status(pg_temp.id('acct'), 'APPROVED');
select is((select status::text from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'active', 'APPROVED ativa');
select ok((select onboarding_url is null from public.restaurant_payment_accounts where id = pg_temp.id('acct')), 'aprovada não guarda link');
select ok(exists (select 1 from public.audit_logs where entity_id = pg_temp.id('acct') and action = 'payment_account_status_changed'
    and user_id is null and "after"->>'status' = 'active' and metadata->>'source' = 'asaas'), 'ativação fica no audit log');

-- RLS.
select _test.as_user(pg_temp.id('other_owner'));
select is((select count(*)::int from public.restaurant_payment_accounts), 0, 'outro restaurante não vê a conta');
select _test.as_user(pg_temp.id('waiter'));
select is((select count(*)::int from public.restaurant_payment_accounts), 0, 'garçom não vê a conta');
select _test.as_user(pg_temp.id('manager'));
select is((select count(*)::int from public.restaurant_payment_accounts), 1, 'gerente da unidade vê a conta');
select _test.as_user(pg_temp.id('owner'));
select throws_ok($$ select api_key_secret_id from public.restaurant_payment_accounts $$, '42501', null, 'o dono não lê o id do segredo');
select throws_ok($$ update public.restaurant_payment_accounts set status = 'active' $$, '42501', null, 'o dono não muda o status direto');
select _test.reset_role();

select ok(not has_function_privilege('authenticated', 'public.service_payment_account_apply_status(uuid,text,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.service_payment_account_apply_status(uuid,text,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.service_payment_account_begin(uuid,uuid,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.service_payment_account_attach(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'só service_role executa as RPCs do cadastro');

select * from finish();
rollback;
