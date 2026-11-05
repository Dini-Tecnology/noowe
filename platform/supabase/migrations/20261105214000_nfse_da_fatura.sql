-- NFS-e da fatura da assinatura pelo módulo de notas do Asaas (resposta 28, critério 13 da M4).
-- Sem os dados da empresa e do serviço, nenhuma nota sai (pendência 34). Quando os dados entrarem, as faturas pagas que esperavam são emitidas.
-- Regras fiscais vêm dos parâmetros, nunca do código: quem as define é o contador.
alter table private.noowe_company
  add column municipal_service_id text,
  add column municipal_service_code text,
  add column municipal_service_name text,
  add column service_description text,
  add column iss_bps integer check (iss_bps between 0 and 10000),
  add column pis_bps integer not null default 0 check (pis_bps between 0 and 10000),
  add column cofins_bps integer not null default 0 check (cofins_bps between 0 and 10000),
  add column csll_bps integer not null default 0 check (csll_bps between 0 and 10000),
  add column inss_bps integer not null default 0 check (inss_bps between 0 and 10000),
  add column ir_bps integer not null default 0 check (ir_bps between 0 and 10000),
  add column retain_iss boolean not null default false,
  add column nfse_max_attempts integer not null default 5 check (nfse_max_attempts > 0);

alter table public.subscription_invoices
  add column nfse_provider_ref text,
  add column nfse_error text,
  add column nfse_attempts integer not null default 0,
  add column nfse_claimed_at timestamptz;
create index subscription_invoices_nfse_due_idx on public.subscription_invoices(paid_at) where nfse_status in ('waiting_company_data', 'requested');

create or replace function private.nfse_company_ready()
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((select c.legal_name is not null and c.address is not null and c.municipal_registration is not null and c.tax_regime is not null
      and (c.municipal_service_id is not null or c.municipal_service_code is not null)
      and c.municipal_service_name is not null and c.service_description is not null and c.iss_bps is not null
    from private.noowe_company c), false)
$$;
revoke all on function private.nfse_company_ready() from public, anon, authenticated, service_role;

create or replace function public.service_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices;
begin
  select * into i from public.subscription_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  if i.status = 'paid' then return; end if;
  update public.subscription_invoices set status = 'paid', paid_at = now(), nfse_status = case when private.nfse_company_ready() then 'requested' else 'waiting_company_data' end where id = i.id;
  perform private.subscription_apply_overdue(i.restaurant_id);
end $$;

create or replace function private.nfse_post(p_invoice uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/billing-nfse',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('invoiceId', p_invoice));
  return true;
exception when others then
  raise warning 'Disparo de NFS-e falhou para %: %', p_invoice, sqlerrm;
  return false;
end $$;
revoke all on function private.nfse_post(uuid) from public, anon, authenticated;

-- Varredura: libera o que esperava pelos dados da empresa e reenvia o que ainda não foi agendado.
create or replace function private.nfse_tick()
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i record; v_max integer;
begin
  if not private.nfse_company_ready() then return; end if;
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

create or replace function public.service_nfse_claim(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; c private.noowe_company; v_tax jsonb;
begin
  if not private.nfse_company_ready() then return jsonb_build_object('claimed', false, 'reason', 'company_data_missing'); end if;
  select * into c from private.noowe_company;
  update public.subscription_invoices set nfse_claimed_at = now(), nfse_attempts = nfse_attempts + 1
    where id = p_invoice_id and status = 'paid' and nfse_status = 'requested' and nfse_provider_ref is null and provider_ref is not null
      and nfse_attempts < c.nfse_max_attempts and (nfse_claimed_at is null or nfse_claimed_at < now() - interval '5 minutes')
    returning * into i;
  if i.id is null then return jsonb_build_object('claimed', false); end if;
  v_tax := jsonb_build_object('retainIss', c.retain_iss, 'issBps', c.iss_bps, 'pisBps', c.pis_bps, 'cofinsBps', c.cofins_bps, 'csllBps', c.csll_bps, 'inssBps', c.inss_bps, 'irBps', c.ir_bps);
  return jsonb_build_object('claimed', true, 'invoiceId', i.id, 'paymentRef', i.provider_ref, 'totalCents', i.total_cents,
    'effectiveDate', (now() at time zone 'America/Sao_Paulo')::date, 'attempt', i.nfse_attempts, 'maxAttempts', c.nfse_max_attempts,
    'serviceDescription', c.service_description, 'municipalServiceId', c.municipal_service_id, 'municipalServiceCode', c.municipal_service_code,
    'municipalServiceName', c.municipal_service_name, 'taxes', v_tax);
end $$;

-- Resultado do agendamento. Só a varredura repete; depois do limite, a nota fica como falha e alguém da NOOWE precisa olhar.
create or replace function public.service_nfse_attach(p_invoice_id uuid, p_provider_ref text, p_error text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; v_max integer;
begin
  select nfse_max_attempts into v_max from private.noowe_company;
  update public.subscription_invoices set nfse_provider_ref = coalesce(p_provider_ref, nfse_provider_ref), nfse_error = p_error,
      nfse_status = case when p_provider_ref is null and nfse_attempts >= v_max then 'failed' else nfse_status end
    where id = p_invoice_id returning * into i;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  if i.nfse_status = 'failed' then
    perform private.log_system_audit(i.restaurant_id, 'billing.nfse_failed', 'subscription_invoice', i.id, p_error, null, jsonb_build_object('attempts', i.nfse_attempts));
  end if;
end $$;

-- Resposta do Asaas pelo webhook: a nota só vale depois de autorizada.
create or replace function public.service_nfse_result(p_invoice_id uuid, p_status text, p_url text default null, p_error text default null, p_provider_ref text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices;
begin
  if p_status not in ('issued', 'failed') then raise exception 'Status de nota inválido' using errcode = '22023'; end if;
  select * into i from public.subscription_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  -- Aviso repetido ou fora de ordem não desfaz nota já autorizada.
  if i.nfse_status = 'issued' and p_status = 'failed' then return; end if;
  update public.subscription_invoices set nfse_status = p_status, nfse_url = coalesce(p_url, nfse_url), nfse_error = case when p_status = 'issued' then null else p_error end,
      nfse_provider_ref = coalesce(nfse_provider_ref, p_provider_ref)
    where id = i.id;
  if p_status = 'failed' then
    perform private.log_system_audit(i.restaurant_id, 'billing.nfse_failed', 'subscription_invoice', i.id, coalesce(p_error, 'Nota recusada'), null, null);
  end if;
end $$;

revoke all on function public.service_nfse_claim(uuid) from public, anon, authenticated;
revoke all on function public.service_nfse_attach(uuid, text, text) from public, anon, authenticated;
revoke all on function public.service_nfse_result(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_nfse_claim(uuid) to service_role;
grant execute on function public.service_nfse_attach(uuid, text, text) to service_role;
grant execute on function public.service_nfse_result(uuid, text, text, text, text) to service_role;

select cron.schedule('nfse-sweep', '*/5 * * * *', 'select private.nfse_tick()');
