-- Carteira — transferência de saldo por @username (mesmo identificador do convite de mesa, ADR-011).
-- Substitui o destinatário por e-mail; corpo idêntico ao de customer_transfer_wallet, só muda a
-- resolução do destinatário. O e-mail deixa de ser exposto como identificador entre clientes.
drop function if exists public.customer_transfer_wallet(text, numeric, uuid);

create or replace function public.customer_transfer_wallet(
  p_recipient_username text,
  p_amount numeric,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient public.profiles;
  v_source_id uuid;
  v_target_id uuid;
  v_source public.wallets;
  v_target public.wallets;
  v_transfer_id uuid := gen_random_uuid();
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_day_total numeric;
  v_month_total numeric;
  v_username text := private.normalize_username_input(p_recipient_username);
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_amount is null or v_amount < 1 or v_amount > 5000 then
    raise exception 'Transfer amount must be between 1 and 5000' using errcode = '22023';
  end if;

  select * into v_recipient from public.profiles
  where username = v_username and is_active and deleted_at is null and deletion_requested_at is null
    and exists (select 1 from public.profile_roles pr
                where pr.user_id = profiles.id and pr.role_key = 'customer' and pr.is_active);
  if v_recipient.id is null or v_recipient.id = v_user_id then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;

  -- Canonical advisory-lock order prevents opposite transfers from deadlocking
  -- while either side's wallet is being lazily created.
  perform pg_advisory_xact_lock(hashtextextended(
    'wallet:' || least(v_user_id::text, v_recipient.id::text), 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'wallet:' || greatest(v_user_id::text, v_recipient.id::text), 0
  ));

  v_source_id := private.ensure_customer_wallet(v_user_id);
  v_target_id := private.ensure_customer_wallet(v_recipient.id);

  if exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_source_id and idempotency_key = p_idempotency_key::text
  ) then
    return public.customer_get_wallet_snapshot();
  end if;

  perform 1 from public.wallets where id in (v_source_id, v_target_id) order by id for update;
  select * into v_source from public.wallets where id = v_source_id;
  select * into v_target from public.wallets where id = v_target_id;

  -- A concurrent duplicate may have completed while this request waited for
  -- the wallet locks. Return its result instead of surfacing a unique error.
  if exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_source_id and idempotency_key = p_idempotency_key::text
  ) then
    return public.customer_get_wallet_snapshot();
  end if;

  select coalesce(sum(abs(amount)), 0) into v_day_total
  from public.wallet_transactions
  where wallet_id = v_source_id and transaction_type = 'transfer_out'
    and created_at >= date_trunc('day', now());
  select coalesce(sum(abs(amount)), 0) into v_month_total
  from public.wallet_transactions
  where wallet_id = v_source_id and transaction_type = 'transfer_out'
    and created_at >= date_trunc('month', now());

  if not v_source.is_active or v_source.balance < v_amount then
    raise exception 'Insufficient wallet balance' using errcode = 'P0001';
  end if;
  if v_day_total + v_amount > v_source.daily_limit or v_month_total + v_amount > v_source.monthly_limit then
    raise exception 'Wallet transfer limit exceeded' using errcode = 'P0001';
  end if;
  if not v_target.is_active or v_target.balance + v_amount > v_target.max_balance then
    raise exception 'Recipient cannot receive this amount' using errcode = 'P0001';
  end if;

  update public.wallets set balance = balance - v_amount, updated_at = now() where id = v_source_id;
  insert into public.wallet_transactions(
    wallet_id, transaction_type, amount, balance_before, balance_after,
    description, external_transaction_id, idempotency_key, metadata
  ) values (
    v_source_id, 'transfer_out', -v_amount, v_source.balance, v_source.balance - v_amount,
    'Transferência enviada', v_transfer_id, p_idempotency_key::text,
    jsonb_build_object('counterparty_id', v_recipient.id, 'counterparty_name', coalesce(v_recipient.full_name, 'Cliente Noowe'))
  );

  update public.wallets set balance = balance + v_amount, updated_at = now() where id = v_target_id;
  insert into public.wallet_transactions(
    wallet_id, transaction_type, amount, balance_before, balance_after,
    description, external_transaction_id, idempotency_key, metadata
  ) values (
    v_target_id, 'transfer_in', v_amount, v_target.balance, v_target.balance + v_amount,
    'Transferência recebida', v_transfer_id, p_idempotency_key::text,
    jsonb_build_object('counterparty_id', v_user_id,
      'counterparty_name', coalesce((select full_name from public.profiles where id = v_user_id), 'Cliente Noowe'))
  );

  return public.customer_get_wallet_snapshot();
end;
$$;

revoke all on function public.customer_transfer_wallet(text, numeric, uuid) from public;
grant execute on function public.customer_transfer_wallet(text, numeric, uuid) to authenticated, service_role;
