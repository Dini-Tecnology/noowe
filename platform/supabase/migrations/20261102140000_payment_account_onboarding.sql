-- ADR-020 — Cadastro da conta de recebimento Asaas de um restaurante.
--
-- Só service_role executa as RPCs: o JWT é validado na Edge Function payments-account, que
-- repassa o user_id. O app nunca vê a apiKey nem o token do webhook.
--
-- Ordem do cadastro (o Asaas só devolve a apiKey na resposta do POST /v3/accounts):
--   1. service_payment_account_begin   -> reserva a linha em `creating` e grava o hash do token.
--   2. Edge Function chama o Asaas com a URL do webhook já apontando para essa linha.
--   3. service_payment_account_attach  -> apiKey no Vault, conta em `pending_kyc`.
--   4. service_payment_account_apply_status -> única saída para `active`, com o status
--      reconsultado no Asaas (nunca o corpo do webhook).

-- Comissão da NOOWE: parâmetro da plataforma, fora do alcance do restaurante. Sem linha aqui o
-- cadastro não começa; quem define o valor é a NOOWE:
--   insert into private.payment_platform_config (platform_fee_bps) values (<bps>)
--   on conflict (id) do update set platform_fee_bps = excluded.platform_fee_bps, updated_at = now();
create table if not exists private.payment_platform_config (
  id boolean primary key default true check (id),
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);
alter table private.payment_platform_config enable row level security;
revoke all on private.payment_platform_config from public, anon, authenticated;

create or replace function private.platform_fee_bps()
returns integer language sql stable security definer set search_path = private, pg_temp as $$
  select platform_fee_bps from private.payment_platform_config where id
$$;
revoke all on function private.platform_fee_bps() from public, anon, authenticated;

-- Variante de has_restaurant_role para quem recebe o usuário por parâmetro (service_role não tem auth.uid()).
create or replace function private.user_has_restaurant_role(
  p_user_id uuid, p_restaurant_id uuid, p_roles public.user_roles_role_enum[]
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.restaurant_id = p_restaurant_id and ur.user_id = p_user_id
      and ur.role = any(p_roles) and ur.is_active
  ) or exists (
    select 1 from public.profile_roles pr
    where pr.restaurant_id = p_restaurant_id and pr.user_id = p_user_id
      and pr.role_key = any(p_roles::text[]) and pr.is_active
  ) or (
    'owner'::public.user_roles_role_enum = any(p_roles)
    and exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.owner_id = p_user_id)
  )
$$;
revoke all on function private.user_has_restaurant_role(uuid, uuid, public.user_roles_role_enum[]) from public, anon, authenticated;

-- De-para da situação geral do Asaas. Só APPROVED ativa; status desconhecido não muda nada.
create or replace function private.asaas_general_to_account_status(p_general text)
returns public.noowe_payment_account_status language sql immutable set search_path = public, pg_temp as $$
  select case p_general
    when 'APPROVED' then 'active'::public.noowe_payment_account_status
    when 'REJECTED' then 'rejected'::public.noowe_payment_account_status
    when 'PENDING' then 'pending_kyc'::public.noowe_payment_account_status
    when 'AWAITING_APPROVAL' then 'pending_kyc'::public.noowe_payment_account_status
    else null end
$$;
revoke all on function private.asaas_general_to_account_status(text) from public, anon, authenticated;

create or replace function private.payment_account_audit(
  p_account public.restaurant_payment_accounts, p_actor_id uuid, p_action text, p_reason text,
  p_before jsonb, p_after jsonb
) returns void language sql security definer set search_path = public, pg_temp as $$
  -- Direto na tabela: evento vindo do webhook não tem usuário (log_audit exige um).
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, reason,
    "before", "after", success, metadata, created_at)
  values (p_account.restaurant_id, p_actor_id, p_action, 'restaurant_payment_account', p_account.id, p_reason,
    p_before, p_after, true, jsonb_build_object('audit_kind', 'operational', 'source',
      case when p_actor_id is null then 'asaas' else 'user' end), now())
$$;
revoke all on function private.payment_account_audit(public.restaurant_payment_accounts, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;

-- Visão segura da conta: nunca inclui chave, hash ou id do segredo.
create or replace function private.payment_account_view(p_account public.restaurant_payment_accounts)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('accountId', p_account.id, 'restaurantId', p_account.restaurant_id,
    'status', p_account.status, 'providerAccountId', p_account.provider_account_id,
    'onboardingUrl', p_account.onboarding_url, 'platformFeeBps', p_account.platform_fee_bps)
$$;
revoke all on function private.payment_account_view(public.restaurant_payment_accounts) from public, anon, authenticated;

-- Reserva a conta do restaurante (só o dono). Repetir devolve a mesma linha.
create or replace function public.service_payment_account_begin(
  p_user_id uuid, p_restaurant_id uuid, p_webhook_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_acct public.restaurant_payment_accounts; v_fee integer;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_webhook_token_hash is null or p_webhook_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Webhook token hash inválido' using errcode = '22023'; end if;
  if not private.user_has_restaurant_role(p_user_id, p_restaurant_id, array['owner']::public.user_roles_role_enum[]) then
    raise exception 'Só o dono pode cadastrar a conta de recebimento' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-account:' || p_restaurant_id, 0));

  select * into v_acct from public.restaurant_payment_accounts
    where restaurant_id = p_restaurant_id and status <> 'disabled' for update;
  if v_acct.id is not null then
    if v_acct.provider_account_id is not null then
      return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', true);
    end if;
    -- Tentativa anterior não chegou ao Asaas: o token novo substitui o antigo.
    update public.restaurant_payment_accounts
      set webhook_token_hash = p_webhook_token_hash, updated_at = now()
      where id = v_acct.id returning * into v_acct;
    return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', false);
  end if;

  v_fee := private.platform_fee_bps();
  -- Resposta, não exceção: o PostgREST devolve P0xxx como 500 sem corpo JSON, e o código se perderia.
  if v_fee is null then return jsonb_build_object('error', 'platform_fee_not_configured'); end if;

  insert into public.restaurant_payment_accounts(restaurant_id, provider, status, webhook_token_hash, platform_fee_bps, created_by)
  values (p_restaurant_id, 'asaas', 'creating', p_webhook_token_hash, v_fee, p_user_id)
  returning * into v_acct;
  perform private.payment_account_audit(v_acct, p_user_id, 'payment_account_started',
    'Dono iniciou o cadastro da conta de recebimento', null, jsonb_build_object('status', v_acct.status, 'platformFeeBps', v_fee));
  return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', false);
end $$;
revoke all on function public.service_payment_account_begin(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_account_begin(uuid, uuid, text) to service_role;

-- O Asaas criou a subconta: a apiKey vai para o Vault, e a conta fica aguardando o KYC.
create or replace function public.service_payment_account_attach(
  p_account_id uuid, p_user_id uuid, p_provider_account_id text, p_wallet_id text, p_api_key text, p_webhook_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare v_acct public.restaurant_payment_accounts; v_secret uuid;
begin
  if nullif(btrim(coalesce(p_provider_account_id, '')), '') is null or nullif(btrim(coalesce(p_wallet_id, '')), '') is null
    or nullif(btrim(coalesce(p_api_key, '')), '') is null then
    raise exception 'Dados da subconta incompletos' using errcode = '22023'; end if;
  if p_webhook_token_hash is null or p_webhook_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Webhook token hash inválido' using errcode = '22023'; end if;
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id for update;
  if v_acct.id is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  if v_acct.status <> 'creating' or v_acct.provider_account_id is not null then
    raise exception 'Conta já vinculada ao provedor' using errcode = 'P0001'; end if;

  v_secret := vault.create_secret(p_api_key, 'asaas_account_api_key:' || v_acct.id, 'apiKey da subconta Asaas');
  update public.restaurant_payment_accounts
    -- O hash do token que o Asaas de fato recebeu: um begin concorrente pode ter trocado o da linha.
    set provider_account_id = p_provider_account_id, wallet_id = p_wallet_id, api_key_secret_id = v_secret,
        webhook_token_hash = p_webhook_token_hash, status = 'pending_kyc', updated_at = now()
    where id = v_acct.id returning * into v_acct;
  perform private.payment_account_audit(v_acct, p_user_id, 'payment_account_created',
    'Subconta criada no Asaas; aguardando KYC', jsonb_build_object('status', 'creating'),
    jsonb_build_object('status', v_acct.status, 'providerAccountId', p_provider_account_id));
  return private.payment_account_view(v_acct);
end $$;
revoke all on function public.service_payment_account_attach(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_payment_account_attach(uuid, uuid, text, text, text, text) to service_role;

-- Leitura para a tela: dono e gerente da unidade. Sem conta, devolve null.
create or replace function public.service_payment_account_for_user(p_user_id uuid, p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_acct public.restaurant_payment_accounts;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.user_has_restaurant_role(p_user_id, p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]) then
    raise exception 'Sem acesso à conta de recebimento' using errcode = '42501'; end if;
  select * into v_acct from public.restaurant_payment_accounts
    where restaurant_id = p_restaurant_id and status <> 'disabled';
  if v_acct.id is null then return null; end if;
  return private.payment_account_view(v_acct);
end $$;
revoke all on function public.service_payment_account_for_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_payment_account_for_user(uuid, uuid) to service_role;

-- Situação reconsultada no Asaas (GET /myAccount/status). Único caminho para `active`.
create or replace function public.service_payment_account_apply_status(
  p_account_id uuid, p_general text, p_onboarding_url text default null, p_actor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_acct public.restaurant_payment_accounts;
  v_before public.noowe_payment_account_status;
  v_next public.noowe_payment_account_status := private.asaas_general_to_account_status(p_general);
begin
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id for update;
  if v_acct.id is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  if v_acct.status in ('creating', 'disabled') or v_acct.provider_account_id is null then
    return private.payment_account_view(v_acct);
  end if;
  v_before := v_acct.status;
  -- Conta sem chave, carteira ou token não cobra: fica onde está.
  if v_next = 'active' and (v_acct.api_key_secret_id is null or v_acct.wallet_id is null or v_acct.webhook_token_hash is null) then
    v_next := null;
  end if;

  update public.restaurant_payment_accounts
    set status = coalesce(v_next, status),
        onboarding_url = case when coalesce(v_next, status) = 'active' then null else coalesce(p_onboarding_url, onboarding_url) end,
        updated_at = now()
    where id = v_acct.id returning * into v_acct;
  if v_acct.status <> v_before then
    perform private.payment_account_audit(v_acct, p_actor_id, 'payment_account_status_changed',
      'Situação geral informada pelo Asaas: ' || p_general,
      jsonb_build_object('status', v_before), jsonb_build_object('status', v_acct.status));
  end if;
  return private.payment_account_view(v_acct);
end $$;
revoke all on function public.service_payment_account_apply_status(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.service_payment_account_apply_status(uuid, text, text, uuid) to service_role;
