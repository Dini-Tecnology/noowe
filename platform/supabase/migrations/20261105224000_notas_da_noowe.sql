-- Notas da NOOWE (respostas 34, 38 e 91 de 05/11/2026).
-- A empresa emite três tipos de NFS-e, cada um com código de serviço próprio nos parâmetros:
--   subscription: uma nota por fatura paga, para o CNPJ do restaurante;
--   noowe_pay:    uma nota semanal por restaurante, com a soma dos splits da NOOWE na semana (só a margem, nunca a tarifa do Asaas);
--   convenience:  uma nota por pedido para o cliente final, com CPF quando informado.
-- A nota nunca leva o valor da conta do cliente: a NOOWE declara só a própria receita.

-- 1. Empresa: o texto das informações complementares vale para toda nota.
alter table private.noowe_company add column nfse_notes text;

-- 2. Um registro por tipo de nota. Código e alíquotas vêm do contador; vazios, a nota espera.
create table private.noowe_nfse_types (
  kind text primary key check (kind in ('subscription', 'noowe_pay', 'convenience')),
  municipal_service_id text,
  municipal_service_code text,
  municipal_service_name text,
  service_description text,
  iss_bps integer check (iss_bps between 0 and 10000),
  pis_bps integer not null default 0 check (pis_bps between 0 and 10000),
  cofins_bps integer not null default 0 check (cofins_bps between 0 and 10000),
  csll_bps integer not null default 0 check (csll_bps between 0 and 10000),
  inss_bps integer not null default 0 check (inss_bps between 0 and 10000),
  ir_bps integer not null default 0 check (ir_bps between 0 and 10000),
  retain_iss boolean not null default false
);
alter table private.noowe_nfse_types enable row level security;
revoke all on private.noowe_nfse_types from public, anon, authenticated, service_role;
create trigger trg_noowe_nfse_types_history after insert or update or delete on private.noowe_nfse_types
  for each row execute function private.noowe_param_record_change();
create trigger trg_noowe_nfse_types_no_truncate before truncate on private.noowe_nfse_types
  for each statement execute function private.noowe_param_refuse_truncate();

-- 3. Carga: dados da empresa (34) e regras do contador (91). O que já estava na empresa passa para a assinatura.
do $$
begin
  perform set_config('noowe.param_author', 'migration: respostas do Pedro, 05/11/2026', true);
  update private.noowe_company set
    legal_name = 'DINI & CIA. TECNOLOGIA LTDA',
    address = 'Av. José Ribeiro Junqueira, 220, Jardim Colonial, São Paulo/SP, CEP 04821-020',
    municipal_registration = '0.112.566-4',
    tax_regime = 'simples_nacional',
    nfse_notes = 'Empresa optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI, PIS e COFINS.';
  insert into private.noowe_nfse_types(kind, municipal_service_id, municipal_service_code, municipal_service_name, service_description,
      iss_bps, pis_bps, cofins_bps, csll_bps, inss_bps, ir_bps, retain_iss)
    select 'subscription', c.municipal_service_id, c.municipal_service_code, c.municipal_service_name, c.service_description,
      c.iss_bps, 0, 0, 0, 0, 0, false
    from private.noowe_company c;
  insert into private.noowe_nfse_types(kind) values ('noowe_pay'), ('convenience');
end $$;

alter table private.noowe_company
  drop column municipal_service_id, drop column municipal_service_code, drop column municipal_service_name,
  drop column service_description, drop column iss_bps, drop column pis_bps, drop column cofins_bps,
  drop column csll_bps, drop column inss_bps, drop column ir_bps, drop column retain_iss;

-- 4. Pronto para emitir: empresa completa e o tipo com código, nome, descrição e alíquota de ISS.
create or replace function private.nfse_ready(p_kind text)
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((select c.legal_name is not null and c.address is not null and c.municipal_registration is not null and c.tax_regime is not null
      and c.nfse_notes is not null
      and (t.municipal_service_id is not null or t.municipal_service_code is not null)
      and t.municipal_service_name is not null and t.service_description is not null and t.iss_bps is not null
    from private.noowe_company c, private.noowe_nfse_types t where t.kind = p_kind), false)
$$;
revoke all on function private.nfse_ready(text) from public, anon, authenticated, service_role;

create or replace function private.nfse_company_ready()
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select private.nfse_ready('subscription')
$$;
revoke all on function private.nfse_company_ready() from public, anon, authenticated, service_role;

-- Dados do serviço e impostos de um tipo, no formato que a função de borda envia ao Asaas.
create or replace function private.nfse_service_json(p_kind text)
returns jsonb language sql stable security definer set search_path = private, pg_temp as $$
  select jsonb_build_object('serviceDescription', t.service_description, 'municipalServiceId', t.municipal_service_id,
    'municipalServiceCode', t.municipal_service_code, 'municipalServiceName', t.municipal_service_name, 'observations', c.nfse_notes,
    'taxes', jsonb_build_object('retainIss', t.retain_iss, 'issBps', t.iss_bps, 'pisBps', t.pis_bps, 'cofinsBps', t.cofins_bps,
      'csllBps', t.csll_bps, 'inssBps', t.inss_bps, 'irBps', t.ir_bps))
  from private.noowe_nfse_types t, private.noowe_company c where t.kind = p_kind
$$;
revoke all on function private.nfse_service_json(text) from public, anon, authenticated, service_role;

-- CNPJ do restaurante: o da configuração fiscal, senão o do perfil. Só dígitos e letras (CNPJ alfanumérico).
create or replace function private.restaurant_cnpj(p_restaurant uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(upper(regexp_replace(coalesce(nullif((select c.cnpj from public.fiscal_configs c where c.restaurant_id = r.id limit 1), ''),
    r.settings->>'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '')
  from public.restaurants r where r.id = p_restaurant
$$;
revoke all on function private.restaurant_cnpj(uuid) from public, anon, authenticated, service_role;

-- 5. Nota da fatura: mesmos passos, agora com o texto fixo e o código da assinatura.
create or replace function public.service_nfse_claim(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; c private.noowe_company;
begin
  if not private.nfse_ready('subscription') then return jsonb_build_object('claimed', false, 'reason', 'company_data_missing'); end if;
  select * into c from private.noowe_company;
  update public.subscription_invoices set nfse_claimed_at = now(), nfse_attempts = nfse_attempts + 1
    where id = p_invoice_id and status = 'paid' and nfse_status = 'requested' and nfse_provider_ref is null and provider_ref is not null
      and nfse_attempts < c.nfse_max_attempts and (nfse_claimed_at is null or nfse_claimed_at < now() - interval '5 minutes')
    returning * into i;
  if i.id is null then return jsonb_build_object('claimed', false); end if;
  return jsonb_build_object('claimed', true, 'invoiceId', i.id, 'paymentRef', i.provider_ref, 'totalCents', i.total_cents,
    'effectiveDate', (now() at time zone 'America/Sao_Paulo')::date, 'attempt', i.nfse_attempts, 'maxAttempts', c.nfse_max_attempts)
    || private.nfse_service_json('subscription');
end $$;
revoke all on function public.service_nfse_claim(uuid) from public, anon, authenticated;
grant execute on function public.service_nfse_claim(uuid) to service_role;

-- 6. Notas avulsas: taxa NOOWE Pay da semana e conveniência por pedido.
create table private.noowe_fee_notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('noowe_pay', 'convenience')),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  period_start date,
  period_end date,
  gateway_transaction_id uuid references public.gateway_transactions(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  taker_document text,
  taker_name text,
  taker_email text,
  customer_ref text,
  status text not null default 'waiting_data' check (status in ('waiting_data', 'requested', 'issued', 'failed')),
  waiting_reason text,
  provider_ref text,
  url text,
  error text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'noowe_pay') = (period_start is not null and period_end is not null)),
  check ((kind = 'convenience') = (gateway_transaction_id is not null))
);
create unique index noowe_fee_notes_week on private.noowe_fee_notes(restaurant_id, period_start) where kind = 'noowe_pay';
create unique index noowe_fee_notes_payment on private.noowe_fee_notes(gateway_transaction_id) where kind = 'convenience';
create index noowe_fee_notes_due on private.noowe_fee_notes(created_at) where status in ('waiting_data', 'requested');
alter table private.noowe_fee_notes enable row level security;
revoke all on private.noowe_fee_notes from public, anon, authenticated, service_role;

-- Semana de segunda a domingo, no horário de São Paulo. A nota sai na segunda depois do meio-dia, quando o estorno do mesmo dia
-- operacional (que devolve o split, resposta 64) já não pode mais mudar o valor.
create or replace function private.noowe_week_bounds(p_at timestamptz)
returns table(week_start date, week_end date) language sql immutable as $$
  select d - 7, d - 1 from (select date_trunc('week', (p_at at time zone 'America/Sao_Paulo'))::date as d) x
$$;

-- Split da NOOWE da semana: margem sem conveniência, fora o devolvido no estorno total do mesmo dia.
create or replace function private.noowe_pay_week_cents(p_restaurant uuid, p_from date, p_to date)
returns bigint language sql stable security definer set search_path = private, public, pg_temp as $$
  select coalesce(sum(m.noowe_split_cents), 0)::bigint from private.noowe_report_payment_margin m
  where m.restaurant_id = p_restaurant and not coalesce(m.fee_returned, false) and m.noowe_split_cents > 0
    and (m.paid_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
$$;
revoke all on function private.noowe_pay_week_cents(uuid, date, date) from public, anon, authenticated, service_role;

create or replace function private.fee_notes_generate(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare w record; r record; v_count integer := 0; v_cents bigint;
begin
  select * into w from private.noowe_week_bounds(p_now);
  if extract(isodow from (p_now at time zone 'America/Sao_Paulo')) > 1 or (p_now at time zone 'America/Sao_Paulo')::time >= time '12:00' then
    for r in select distinct m.restaurant_id from private.noowe_report_payment_margin m
      where (m.paid_at at time zone 'America/Sao_Paulo')::date between w.week_start and w.week_end
        and not exists (select 1 from private.noowe_fee_notes n where n.kind = 'noowe_pay' and n.restaurant_id = m.restaurant_id and n.period_start = w.week_start)
    loop
      v_cents := private.noowe_pay_week_cents(r.restaurant_id, w.week_start, w.week_end);
      continue when v_cents <= 0;
      insert into private.noowe_fee_notes(kind, restaurant_id, period_start, period_end, amount_cents, taker_document, taker_name, taker_email, customer_ref)
        select 'noowe_pay', x.id, w.week_start, w.week_end, v_cents, private.restaurant_cnpj(x.id), x.name, x.email,
          (select s.provider_customer_id from public.restaurant_subscriptions s where s.restaurant_id = x.id)
        from public.restaurants x where x.id = r.restaurant_id
        on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end if;
  -- Conveniência: uma nota por pagamento confirmado. O app não guarda CPF, então hoje o tomador vai sem documento.
  insert into private.noowe_fee_notes(kind, restaurant_id, gateway_transaction_id, amount_cents)
    select 'convenience', g.restaurant_id, g.id, g.convenience_cents from public.gateway_transactions g
    where g.status = 'completed' and g.provider <> 'simulated' and g.convenience_cents > 0
      and not exists (select 1 from private.noowe_fee_notes n where n.kind = 'convenience' and n.gateway_transaction_id = g.id)
    on conflict do nothing;
  return v_count;
end $$;
revoke all on function private.fee_notes_generate(timestamptz) from public, anon, authenticated, service_role;

-- O que falta para a nota sair. Nulo quando pode ir ao Asaas.
create or replace function private.fee_note_blocker(n private.noowe_fee_notes)
returns text language sql stable security definer set search_path = private, pg_temp as $$
  select case
    when not private.nfse_ready(n.kind) then 'Faltam o código de serviço e as alíquotas deste tipo de nota'
    when n.taker_document is null and n.kind = 'noowe_pay' then 'Restaurante sem CNPJ'
    -- O Asaas só emite para tomador com CPF ou CNPJ. Nota sem documento precisa de outro emissor (Focus NFe).
    when n.taker_document is null then 'Cliente sem CPF: o Asaas não emite nota sem documento do tomador'
  end
$$;
revoke all on function private.fee_note_blocker(private.noowe_fee_notes) from public, anon, authenticated, service_role;

create or replace function private.fee_note_post(p_note uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/billing-nfse',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('noteId', p_note));
  return true;
exception when others then
  raise warning 'Disparo de NFS-e avulsa falhou para %: %', p_note, sqlerrm;
  return false;
end $$;
revoke all on function private.fee_note_post(uuid) from public, anon, authenticated;

create or replace function private.fee_notes_tick()
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare n private.noowe_fee_notes; v_max integer;
begin
  perform private.fee_notes_generate();
  select nfse_max_attempts into v_max from private.noowe_company;
  for n in select * from private.noowe_fee_notes where status = 'waiting_data' order by created_at limit 200 loop
    if private.fee_note_blocker(n) is null then
      update private.noowe_fee_notes set status = 'requested', waiting_reason = null, updated_at = now() where id = n.id;
    elsif n.waiting_reason is distinct from private.fee_note_blocker(n) then
      update private.noowe_fee_notes set waiting_reason = private.fee_note_blocker(n), updated_at = now() where id = n.id;
    end if;
  end loop;
  for n in select * from private.noowe_fee_notes
    where status = 'requested' and provider_ref is null and attempts < v_max
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by created_at limit 20
  loop
    perform private.fee_note_post(n.id);
  end loop;
end $$;
revoke all on function private.fee_notes_tick() from public, anon, authenticated;

-- A varredura da NFS-e passa a cuidar também das notas avulsas.
create or replace function private.nfse_tick()
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i record; v_max integer;
begin
  perform private.fee_notes_tick();
  if not private.nfse_ready('subscription') then return; end if;
  select nfse_max_attempts into v_max from private.noowe_company;
  update public.subscription_invoices set nfse_status = 'requested' where nfse_status = 'waiting_company_data' and status = 'paid';
  for i in select id from public.subscription_invoices
    where status = 'paid' and nfse_status = 'requested' and nfse_provider_ref is null and nfse_attempts < v_max
      and provider_ref is not null and (nfse_claimed_at is null or nfse_claimed_at < now() - interval '5 minutes')
    order by paid_at limit 20
  loop
    perform private.nfse_post(i.id);
  end loop;
end $$;
revoke all on function private.nfse_tick() from public, anon, authenticated;

create or replace function public.service_fee_note_claim(p_note_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare n private.noowe_fee_notes; c private.noowe_company;
begin
  select * into c from private.noowe_company;
  select * into n from private.noowe_fee_notes where id = p_note_id;
  if n.id is null or private.fee_note_blocker(n) is not null then return jsonb_build_object('claimed', false); end if;
  update private.noowe_fee_notes set claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = p_note_id and status = 'requested' and provider_ref is null and attempts < c.nfse_max_attempts
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    returning * into n;
  if n.id is null then return jsonb_build_object('claimed', false); end if;
  return jsonb_build_object('claimed', true, 'noteId', n.id, 'kind', n.kind, 'restaurantId', n.restaurant_id, 'totalCents', n.amount_cents,
    'customerId', n.customer_ref, 'takerDocument', n.taker_document, 'takerName', coalesce(n.taker_name, 'Consumidor'), 'takerEmail', n.taker_email,
    'effectiveDate', (now() at time zone 'America/Sao_Paulo')::date, 'attempt', n.attempts, 'maxAttempts', c.nfse_max_attempts,
    'periodStart', n.period_start, 'periodEnd', n.period_end)
    || private.nfse_service_json(n.kind);
end $$;

create or replace function public.service_fee_note_attach(p_note_id uuid, p_provider_ref text, p_customer_ref text default null, p_error text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare n private.noowe_fee_notes; v_max integer;
begin
  select nfse_max_attempts into v_max from private.noowe_company;
  update private.noowe_fee_notes set provider_ref = coalesce(p_provider_ref, provider_ref), customer_ref = coalesce(customer_ref, p_customer_ref),
      error = p_error, updated_at = now(),
      status = case when p_provider_ref is null and attempts >= v_max then 'failed' else status end
    where id = p_note_id returning * into n;
  if n.id is null then raise exception 'Nota não encontrada' using errcode = 'P0002'; end if;
  -- O cliente do Asaas criado para o restaurante serve também à fatura da assinatura.
  if n.kind = 'noowe_pay' and p_customer_ref is not null then
    update public.restaurant_subscriptions set provider_customer_id = p_customer_ref
      where restaurant_id = n.restaurant_id and provider_customer_id is null;
  end if;
  if n.status = 'failed' then
    perform private.log_system_audit(n.restaurant_id, 'billing.fee_note_failed', 'noowe_fee_note', n.id, p_error, null, jsonb_build_object('kind', n.kind, 'attempts', n.attempts));
  end if;
end $$;

create or replace function public.service_fee_note_result(p_note_id uuid, p_status text, p_url text default null, p_error text default null, p_provider_ref text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare n private.noowe_fee_notes;
begin
  if p_status not in ('issued', 'failed') then raise exception 'Status de nota inválido' using errcode = '22023'; end if;
  select * into n from private.noowe_fee_notes where id = p_note_id for update;
  if n.id is null then raise exception 'Nota não encontrada' using errcode = 'P0002'; end if;
  if n.status = 'issued' and p_status = 'failed' then return; end if;
  update private.noowe_fee_notes set status = p_status, url = coalesce(p_url, url), error = case when p_status = 'issued' then null else p_error end,
      provider_ref = coalesce(provider_ref, p_provider_ref), updated_at = now()
    where id = n.id;
  if p_status = 'failed' then
    perform private.log_system_audit(n.restaurant_id, 'billing.fee_note_failed', 'noowe_fee_note', n.id, coalesce(p_error, 'Nota recusada'), null, jsonb_build_object('kind', n.kind));
  end if;
end $$;

revoke all on function public.service_fee_note_claim(uuid) from public, anon, authenticated;
revoke all on function public.service_fee_note_attach(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.service_fee_note_result(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_fee_note_claim(uuid) to service_role;
grant execute on function public.service_fee_note_attach(uuid, text, text, text) to service_role;
grant execute on function public.service_fee_note_result(uuid, text, text, text, text) to service_role;

-- Relatório interno: notas avulsas por situação.
create view private.noowe_report_fee_notes with (security_invoker = true) as
  select kind, status, waiting_reason, count(*) as notes, sum(amount_cents)::bigint as amount_cents
  from private.noowe_fee_notes group by 1, 2, 3;
revoke all on private.noowe_report_fee_notes from public, anon, authenticated, service_role;

-- 7. Restaurantes de teste com o CNPJ da NOOWE (lembrete do item 34): passam para CNPJs de teste válidos.
update public.restaurants set settings = jsonb_set(settings, '{cnpj}', to_jsonb('11.222.333/0001-81'::text))
  where id = 'bdc2bdb4-0645-47da-b1a8-e4f78470b70e' and settings->>'cnpj' = '64.159.447/0001-90';
update public.restaurants set settings = jsonb_set(settings, '{cnpj}', to_jsonb('11.222.333/0002-62'::text))
  where id = 'b1cdf2f4-f25e-4d25-886b-241607867604' and settings->>'cnpj' = '64.159.447/0001-90';
