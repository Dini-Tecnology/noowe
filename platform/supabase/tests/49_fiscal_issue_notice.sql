-- ADR-030: dono e gerente daquela unidade são avisados quando uma nota para. Uma vez por parada, sem
-- o erro do emissor no texto, e o aviso nunca atrapalha a gravação do resultado fiscal.
begin;
select plan(30);

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p_key text) returns uuid language sql as $$ select v from _ctx where k = p_key $$;

-- Nota em processamento, como a deixa service_fiscal_claim, para o resultado valer.
create function pg_temp.new_doc(p_restaurant uuid) returns uuid language plpgsql as $$
declare v_ref uuid := gen_random_uuid(); v_id uuid;
begin
  insert into public.fiscal_documents(restaurant_id, external_ref, status, attempts, total_cents)
    values (p_restaurant, 't-' || v_ref, 'processing', 1, 6000) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.notices(p_user uuid) returns integer language sql as $$
  select count(*)::int from public.notifications
  where user_id = p_user and notification_type = 'fiscal_document_issue' $$;
create function pg_temp.notices_of(p_doc uuid) returns integer language sql as $$
  select count(*)::int from public.notifications
  where related_id = p_doc and notification_type = 'fiscal_document_issue' $$;

-- Tira as notas da lista de paradas, para um bloco não contar como "outra nota parada" no seguinte.
create function pg_temp.clear_issues(p_restaurant uuid) returns void language sql as $$
  update public.fiscal_documents set status = 'authorized' where restaurant_id = p_restaurant $$;

do $$
declare
  owner_id uuid := gen_random_uuid(); manager uuid := gen_random_uuid(); profile_manager uuid := gen_random_uuid();
  waiter uuid := gen_random_uuid(); former uuid := gen_random_uuid(); other_owner uuid := gen_random_uuid();
  other_manager uuid := gen_random_uuid(); r uuid; other_r uuid;
begin
  insert into auth.users(id, email) select u, u || '@fiscal-notice.test'
    from unnest(array[owner_id, manager, profile_manager, waiter, former, other_owner, other_manager]) u;
  insert into public.profiles(id)
    select u from unnest(array[owner_id, manager, profile_manager, waiter, former, other_owner, other_manager]) u
    on conflict do nothing;
  -- O dono do restaurante A existe só em restaurants.owner_id, sem linha em user_roles.
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (owner_id, 'Casa A', 'Rua A', 'São Paulo', 'SP', '01310100', '11900000000', 'a@fiscal-notice.test', 'casual_dining') returning id into r;
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (other_owner, 'Casa B', 'Rua B', 'São Paulo', 'SP', '01310100', '11900000001', 'b@fiscal-notice.test', 'casual_dining') returning id into other_r;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values
    (manager, r, 'manager', true), (waiter, r, 'waiter', true), (former, r, 'manager', false),
    (other_manager, other_r, 'manager', true);
  insert into public.profile_roles(user_id, restaurant_id, role_key, is_active) values (profile_manager, r, 'manager', true);
  insert into _ctx values ('owner', owner_id), ('manager', manager), ('profile_manager', profile_manager), ('waiter', waiter),
    ('former', former), ('other_owner', other_owner), ('other_manager', other_manager), ('r', r), ('other_r', other_r);
end $$;

-- ---------------------------------------------------------------------------
-- Quem recebe
-- ---------------------------------------------------------------------------
insert into _ctx values ('rejected', pg_temp.new_doc(pg_temp.ctx('r')));
select is(public.service_fiscal_record_result(pg_temp.ctx('rejected'), 'rejected',
  '{"errorCode":"cod-sefaz","errorMessage":"NCM inválido token=tok-vazado cliente@exemplo.com"}')->>'status', 'rejected', 'nota fica rejeitada');
select is(pg_temp.notices(pg_temp.ctx('owner')), 1, 'dono recebe, mesmo sem linha em user_roles');
select is(pg_temp.notices(pg_temp.ctx('manager')), 1, 'gerente recebe');
select is(pg_temp.notices(pg_temp.ctx('profile_manager')), 1, 'gerente por profile_roles recebe');
select is(pg_temp.notices(pg_temp.ctx('waiter')), 0, 'garçom não recebe');
select is(pg_temp.notices(pg_temp.ctx('former')), 0, 'gerente desligado não recebe');
select is(pg_temp.notices(pg_temp.ctx('other_owner')), 0, 'dono de outro restaurante não recebe');
select is(pg_temp.notices(pg_temp.ctx('other_manager')), 0, 'gerente de outro restaurante não recebe');

-- ---------------------------------------------------------------------------
-- O que o aviso leva
-- ---------------------------------------------------------------------------
select is((select metadata->>'kind' from public.notifications where user_id = pg_temp.ctx('manager') and related_id = pg_temp.ctx('rejected')),
  'fiscal_document_issue', 'kind que o app traduz na tela de notas');
select is((select metadata->>'restaurant_id' from public.notifications where user_id = pg_temp.ctx('manager') and related_id = pg_temp.ctx('rejected')),
  pg_temp.ctx('r')::text, 'aviso diz de qual unidade é a nota');
select is((select count(*)::int from public.notifications where related_id = pg_temp.ctx('rejected')
    and (title || message || metadata::text) ~ '(tok-vazado|cliente@exemplo|NCM inv|cod-sefaz)'), 0,
  'erro do emissor não vai no aviso');
select ok((select bool_and(message like 'Casa A: %') from public.notifications where related_id = pg_temp.ctx('rejected')),
  'aviso cita a unidade para quem tem mais de uma');
select is((select error_message from public.fiscal_documents where id = pg_temp.ctx('rejected')),
  'NCM inválido token=tok-vazado cliente@exemplo.com', 'o erro continua na nota, para a gerência');

-- ---------------------------------------------------------------------------
-- Sem duplicar
-- ---------------------------------------------------------------------------
select public.service_fiscal_record_result(pg_temp.ctx('rejected'), 'rejected', '{"errorMessage":"de novo"}');
select public.service_fiscal_claim(pg_temp.ctx('rejected'));
select private.fiscal_dispatch_due();
select is(pg_temp.notices_of(pg_temp.ctx('rejected')), 3, 'resultado repetido, novo claim e varredura não avisam de novo');
select is(pg_temp.notices(pg_temp.ctx('manager')), 1, 'cada pessoa recebe um aviso por parada');

-- Falha transitória ainda não é parada: só avisa quando as tentativas acabam.
select pg_temp.clear_issues(pg_temp.ctx('r'));
insert into _ctx values ('failed', pg_temp.new_doc(pg_temp.ctx('r')));
select is(public.service_fiscal_record_result(pg_temp.ctx('failed'), 'transient', '{"errorMessage":"offline"}')->>'status', 'pending',
  'falha transitória volta para a fila');
select is(pg_temp.notices_of(pg_temp.ctx('failed')), 0, 'falha transitória não avisa');
update public.fiscal_documents set status = 'processing', attempts = (select max_attempts from private.fiscal_retry_policy())
  where id = pg_temp.ctx('failed');
select is(public.service_fiscal_record_result(pg_temp.ctx('failed'), 'transient', '{"errorMessage":"offline"}')->>'status', 'failed',
  'tentativas esgotadas');
select is(pg_temp.notices_of(pg_temp.ctx('failed')), 3, 'tentativas esgotadas avisam');

-- Sem configuração fiscal: service_fiscal_claim bloqueia a nota.
select pg_temp.clear_issues(pg_temp.ctx('r'));
insert into _ctx values ('blocked', pg_temp.new_doc(pg_temp.ctx('r')));
update public.fiscal_documents set status = 'pending', next_attempt_at = now() where id = pg_temp.ctx('blocked');
select is(public.service_fiscal_claim(pg_temp.ctx('blocked'))->>'blocked', 'fiscal_config_missing', 'nota sem cadastro fica bloqueada');
select is(pg_temp.notices_of(pg_temp.ctx('blocked')), 3, 'nota bloqueada avisa');
select public.service_fiscal_claim(pg_temp.ctx('blocked'));
select is(pg_temp.notices_of(pg_temp.ctx('blocked')), 3, 'nota bloqueada não é reprocessada nem avisa de novo');

-- Reenvio é decisão nova: se a nota parar outra vez e a lista estava limpa, avisa.
update public.fiscal_documents set status = 'pending', next_attempt_at = now() where id = pg_temp.ctx('blocked');
select public.service_fiscal_claim(pg_temp.ctx('blocked'));
select is(pg_temp.notices_of(pg_temp.ctx('blocked')), 6, 'reenviada que para de novo avisa outra vez');

-- ---------------------------------------------------------------------------
-- Rajada no mesmo restaurante
-- ---------------------------------------------------------------------------
insert into _ctx values ('burst', pg_temp.new_doc(pg_temp.ctx('r')));
select public.service_fiscal_record_result(pg_temp.ctx('burst'), 'rejected', '{"errorMessage":"x"}');
select is(pg_temp.notices_of(pg_temp.ctx('burst')), 0, 'com outra nota parada e aviso recente, não dispara outro push');
select is((select status from public.fiscal_documents where id = pg_temp.ctx('burst')), 'rejected', 'a nota nova entra na lista mesmo assim');

insert into _ctx values ('other_burst', pg_temp.new_doc(pg_temp.ctx('other_r')));
select public.service_fiscal_record_result(pg_temp.ctx('other_burst'), 'rejected', '{"errorMessage":"x"}');
select is(pg_temp.notices_of(pg_temp.ctx('other_burst')), 2, 'o intervalo é por restaurante: a outra unidade é avisada');

update public.notifications set created_at = now() - private.fiscal_issue_notice_cooldown() - interval '1 minute'
  where notification_type = 'fiscal_document_issue' and metadata->>'restaurant_id' = pg_temp.ctx('r')::text;
insert into _ctx values ('late', pg_temp.new_doc(pg_temp.ctx('r')));
select public.service_fiscal_record_result(pg_temp.ctx('late'), 'rejected', '{"errorMessage":"x"}');
select is(pg_temp.notices_of(pg_temp.ctx('late')), 3, 'passado o intervalo, nova parada volta a avisar');

-- ---------------------------------------------------------------------------
-- O aviso não derruba o resultado fiscal
-- ---------------------------------------------------------------------------
create function pg_temp.break_notifications() returns trigger language plpgsql as $$
begin raise exception 'notifications fora do ar'; end $$;
create trigger trg_test_break before insert on public.notifications
  for each row execute function pg_temp.break_notifications();

select pg_temp.clear_issues(pg_temp.ctx('r'));
insert into _ctx values ('broken', pg_temp.new_doc(pg_temp.ctx('r')));
select is(public.service_fiscal_record_result(pg_temp.ctx('broken'), 'rejected', '{"errorMessage":"x"}')->>'status', 'rejected',
  'falha no aviso não derruba a gravação');
select is((select status from public.fiscal_documents where id = pg_temp.ctx('broken')), 'rejected', 'nota fica gravada como rejeitada');
select is((select count(*)::int from public.audit_logs where action = 'fiscal.issue_notice_failed' and entity_id = pg_temp.ctx('broken')), 1,
  'falha no aviso deixa rastro');

select * from finish();
rollback;
