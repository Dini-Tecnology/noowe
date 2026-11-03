-- ADR-030: gerência cadastra e corrige pelo app, vê as notas com problema e reenvia;
-- o token entra no Vault e não volta por nenhum caminho que o app alcance.
begin;
select plan(39);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
grant select on _ctx to authenticated;

create function pg_temp.ctx(p_key text) returns uuid language sql as $$ select v from _ctx where k = p_key $$;

create function pg_temp.valid_config(p_patch jsonb default '{}'::jsonb, p_tax_patch jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('cnpj', '11.222.333/0001-81', 'razaoSocial', 'Casa LTDA', 'stateCode', 'sp',
    'regimeTributario', 'simples_nacional',
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'cfop', '5102', 'icms_origem', '0',
      'icms_situacao_tributaria', '102', 'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49') || p_tax_patch) || p_patch
$$;

create function pg_temp.save_error(p_config jsonb, p_token text default 'tok') returns text language plpgsql as $$
begin
  perform public.restaurant_fiscal_save_config(pg_temp.ctx('r'), p_config, p_token);
  return 'ok';
exception when others then return sqlstate;
end $$;

-- Restaurante próprio do teste: a suíte 46 usa o do seed, e cadastro fiscal é um por restaurante.
do $$
declare
  owner_id uuid := gen_random_uuid(); manager uuid := gen_random_uuid(); waiter uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); other_manager uuid := gen_random_uuid(); r uuid; other_r uuid;
  tbl jsonb; sid uuid; menu uuid;
begin
  insert into auth.users(id, email) select u, u || '@fiscal-mgmt.test'
    from unnest(array[owner_id, manager, waiter, outsider, other_manager]) u;
  insert into public.profiles(id) select u from unnest(array[owner_id, manager, waiter, outsider, other_manager]) u
    on conflict do nothing;
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (owner_id, 'Fiscal A', 'Rua A', 'São Paulo', 'SP', '01310100', '11900000000', 'a@fiscal-mgmt.test', 'casual_dining') returning id into r;
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (other_manager, 'Fiscal B', 'Rua B', 'São Paulo', 'SP', '01310100', '11900000001', 'b@fiscal-mgmt.test', 'casual_dining') returning id into other_r;
  insert into public.user_roles(user_id, restaurant_id, role) values
    (manager, r, 'manager'), (waiter, r, 'waiter'), (other_manager, other_r, 'manager');
  insert into _ctx values ('owner', owner_id), ('manager', manager), ('waiter', waiter), ('outsider', outsider),
    ('other_manager', other_manager), ('r', r), ('other_r', other_r);

  -- Nota de um encerramento que aconteceu antes de o restaurante ter cadastro.
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'mesa-fiscal', 4);
  insert into public.table_sessions(restaurant_id, table_id, status)
    values (r, (tbl->>'id')::uuid, 'ended') returning id into sid;
  insert into _ctx values ('sid', sid);
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (r, sid, 's-' || sid, 6000, jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('orderItemId', gen_random_uuid(), 'description', 'Prato', 'quantity', 1,
      'grossCents', 6000, 'discountCents', 0, 'feeCents', 0)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'pix', 'weightCents', 6000))));
  insert into _ctx select 'doc', id from public.fiscal_documents where external_ref = 's-' || sid;
  insert into public.fiscal_documents(restaurant_id, external_ref, status, total_cents, error_message)
    values (other_r, 'test-other', 'blocked', 100, 'de outro restaurante');
  insert into _ctx select 'other_doc', id from public.fiscal_documents where external_ref = 'test-other';
end $$;

-- ---------------------------------------------------------------------------
-- Quem pode
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('waiter'));
select is(pg_temp.state_of(format('select public.restaurant_fiscal_get_config(%L)', pg_temp.ctx('r'))), '42501', 'garçom não lê o cadastro');
select is(pg_temp.save_error(pg_temp.valid_config()), '42501', 'garçom não grava o cadastro');
select pg_temp.act(pg_temp.ctx('other_manager'));
select is(pg_temp.state_of(format('select public.restaurant_fiscal_get_config(%L)', pg_temp.ctx('r'))), '42501', 'gerente de outro restaurante não lê o cadastro');
select is(pg_temp.save_error(pg_temp.valid_config()), '42501', 'gerente de outro restaurante não grava o cadastro');
select is(pg_temp.state_of(format($q$select public.restaurant_fiscal_retry(%L, 'motivo')$q$, pg_temp.ctx('doc'))), '42501', 'gerente de outro restaurante não reenvia');

-- ---------------------------------------------------------------------------
-- Sem cadastro: a nota bloqueia e o gerente vê o motivo
-- ---------------------------------------------------------------------------
select is(public.service_fiscal_claim(pg_temp.ctx('doc'))->>'blocked', 'fiscal_config_missing', 'sem cadastro a nota bloqueia sem chamar o emissor');

select pg_temp.act(pg_temp.ctx('manager'));
select is(public.restaurant_fiscal_get_config(pg_temp.ctx('r'))->'config', 'null'::jsonb, 'gerente vê que não há cadastro');
select is((public.restaurant_fiscal_get_config(pg_temp.ctx('r'))->>'openIssues')::int, 1, 'contagem inclui a nota bloqueada');

select _test.as_user(pg_temp.ctx('manager'));
select is((select status from public.fiscal_documents where id = pg_temp.ctx('doc')), 'blocked', 'gerente lê a nota da unidade');
select is((select error_message from public.fiscal_documents where id = pg_temp.ctx('doc')), 'Restaurante sem configuração fiscal ativa', 'gerente lê o motivo do bloqueio');
select is((select count(*)::int from public.fiscal_documents where id = pg_temp.ctx('other_doc')), 0, 'gerente não lê nota de outro restaurante');
select is((select t.table_number from public.table_sessions s join public.tables t on t.id = s.table_id where s.id = pg_temp.ctx('sid')), 'mesa-fiscal', 'gerente identifica a mesa da nota');
select is(pg_temp.state_of('select focus_token_secret_id from public.fiscal_configs'), '42501', 'gerente continua sem acesso direto a fiscal_configs');
select is((select count(*)::int from pg_constraint where conname = 'table_sessions_table_id_fkey'), 1, 'a FK que o app nomeia para achar a mesa existe');
select _test.reset_role();

-- ---------------------------------------------------------------------------
-- Validação no servidor
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('manager'));
select is(pg_temp.save_error(pg_temp.valid_config(), null), '22023', 'primeiro cadastro exige token');
select is(pg_temp.save_error(pg_temp.valid_config(), '   '), '22023', 'token em branco não vale como token');
select is(pg_temp.save_error(pg_temp.valid_config('{"cnpj":"123"}')), '22023', 'CNPJ incompleto é recusado');
select is(pg_temp.save_error(pg_temp.valid_config('{"regimeTributario":"mei"}')), '22023', 'regime desconhecido é recusado');
select is(pg_temp.save_error(pg_temp.valid_config('{}', '{"ncm":"00000000"}')), '22023', 'NCM zerado não serve de padrão');
select is(pg_temp.save_error(pg_temp.valid_config('{}', '{"cfop":""}')), '22023', 'CFOP vazio é recusado');
select is(pg_temp.save_error(pg_temp.valid_config('{}', '{"icms_situacao_tributaria":null}')), '22023', 'situação do ICMS é obrigatória');
select ok(not exists (select 1 from public.fiscal_configs where restaurant_id = pg_temp.ctx('r')), 'cadastro recusado não grava nada');

-- ---------------------------------------------------------------------------
-- Cadastro em homologação, com o token só no Vault
-- ---------------------------------------------------------------------------
create temp table _saved as
  select public.restaurant_fiscal_save_config(pg_temp.ctx('r'),
    pg_temp.valid_config('{"environment":"production","isActive":false,"nomeFantasia":"Casa"}'), ' tok-secreto-1 ') as j;
select is((select j->>'environment' from _saved), 'homologation', 'o app não escolhe produção: cadastro nasce em homologação');
select is((select (j->>'isActive')::boolean from _saved), true, 'cadastro novo nasce ativo');
select is((select j->>'cnpj' from _saved), '11222333000181', 'CNPJ grava só com dígitos');
select is((select j->>'stateCode' from _saved), 'SP', 'UF grava em maiúsculas');
select ok((select (j->>'hasToken')::boolean from _saved), 'resposta diz que há token');
select ok((select not (j::text ~* 'tok-secreto' or j ? 'focus_token_secret_id' or j ? 'token') from _saved), 'resposta não traz o token nem o id do segredo');
select is((select s.decrypted_secret from vault.decrypted_secrets s join public.fiscal_configs c on c.focus_token_secret_id = s.id where c.restaurant_id = pg_temp.ctx('r')), 'tok-secreto-1', 'token fica no Vault');
select ok(not (select to_jsonb(c)::text ~* 'tok-secreto' from public.fiscal_configs c where c.restaurant_id = pg_temp.ctx('r')), 'token não fica em fiscal_configs');
select ok(not (public.restaurant_fiscal_get_config(pg_temp.ctx('r'))::text ~* 'tok-secreto'), 'leitura do cadastro não traz o token');
select ok(not exists (select 1 from public.audit_logs a where a.entity_type = 'fiscal_config' and a.restaurant_id = pg_temp.ctx('r')
  and (a."after"::text ~* 'tok-secreto' or coalesce(a."before"::text, '') ~* 'tok-secreto')), 'auditoria não traz o token');
select results_eq(
  format($q$select user_id, action, reason, ("after"->>'tokenChanged')::boolean from public.audit_logs where entity_type = 'fiscal_config' and restaurant_id = %L$q$, pg_temp.ctx('r')),
  format($q$values (%L::uuid, 'fiscal.config_saved'::text, 'Cadastro fiscal salvo pela gerência'::text, true)$q$, pg_temp.ctx('manager')),
  'salvar deixa autor e motivo na auditoria');

-- ---------------------------------------------------------------------------
-- Corrigir mantém o que a tela não mostra
-- ---------------------------------------------------------------------------
do $$
begin
  update public.fiscal_configs set environment = 'production', is_active = false,
    tax_defaults = tax_defaults || '{"unit":"kg"}', endereco = '{"cep":"01310100"}' where restaurant_id = pg_temp.ctx('r');
  perform public.restaurant_fiscal_save_config(pg_temp.ctx('r'), pg_temp.valid_config('{"serviceFeeInDocument":true}', '{"ncm":"19059090"}'), '');
end $$;
select results_eq(
  format($q$select environment, is_active, tax_defaults->>'unit', tax_defaults->>'ncm', endereco->>'cep', service_fee_in_document from public.fiscal_configs where restaurant_id = %L$q$, pg_temp.ctx('r')),
  $q$values ('production'::text, false, 'kg'::text, '19059090'::text, '01310100'::text, true)$q$,
  'corrigir não troca ambiente nem reativa, e preserva unidade e endereço');
select is((select s.decrypted_secret from vault.decrypted_secrets s join public.fiscal_configs c on c.focus_token_secret_id = s.id where c.restaurant_id = pg_temp.ctx('r')), 'tok-secreto-1', 'token em branco mantém o atual');
update public.fiscal_configs set environment = 'homologation', is_active = true where restaurant_id = pg_temp.ctx('r');

-- ---------------------------------------------------------------------------
-- Critério: cadastra, vê a bloqueada, corrige e reenvia
-- ---------------------------------------------------------------------------
select is((select status from public.fiscal_documents where id = pg_temp.ctx('doc')), 'blocked', 'salvar o cadastro não libera nota antiga sozinho');
select is(public.restaurant_fiscal_retry(pg_temp.ctx('doc'), 'cadastro feito')->>'status', 'pending', 'gerente devolve a nota à fila');
create temp table _claim as select public.service_fiscal_claim(pg_temp.ctx('doc')) as j;
select is((select j->>'token' from _claim), 'tok-secreto-1', 'a emissão usa o token gravado pelo gerente');
select is((select j->>'environment' from _claim), 'homologation', 'a emissão vai para a homologação');

select * from finish();
rollback;
