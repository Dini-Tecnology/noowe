-- Leva a produção as mudanças feitas em duas migrations DEPOIS de elas terem sido aplicadas.  (T-X-20)
--
-- Em 2026-09-14, a comparação entre `supabase_migrations.schema_migrations` e os arquivos mostrou
-- 79 de 81 migrations idênticas.  As duas diferentes foram editadas localmente depois de
-- aplicadas, e três mudanças nunca chegaram a produção:
--
--   20260814233000_customer_wallet_backend.sql
--     1. publicação Realtime de `wallets` e `payment_methods` (linhas 55-70);
--     2. `customer_transfer_wallet`: valor arredondado a 2 casas (`round(p_amount, 2)`) e locks
--        consultivos adquiridos em ordem determinística (`least`/`greatest` dos ids), o que evita
--        deadlock entre duas transferências cruzadas simultâneas (linhas 328-436).
--   20260815211000_table_qr_full_flow.sql
--     3. `customer_leave_table_session`: ao liberar a sessão, uma reserva `seated` daquela mesa
--        volta a `confirmed` e a mesa volta a `reserved` (linhas 332-416).
--
-- A edição de `customer_open_table_session` no mesmo arquivo não entra aqui: 20260816020000
-- redefine a função, e produção já tem esse comportamento.
--
-- `supabase db reset` já produz este estado, porque executa os arquivos editados.  Este arquivo
-- existe para produção convergir com o repositório.
--
-- ATENÇÃO: ESTA MIGRATION MUDA COMPORTAMENTO EM PRODUÇÃO.  Aplicar só com OK explícito.
--
-- Os blocos abaixo são cópia literal dos arquivos editados.  Tudo é idempotente.

-- 1. Realtime de wallets e payment_methods  (20260814233000:55-70)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallets'
    ) then
      alter publication supabase_realtime add table public.wallets;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_methods'
    ) then
      alter publication supabase_realtime add table public.payment_methods;
    end if;
  end if;
end $$;

-- 2. customer_transfer_wallet  (20260814233000:328-436)
create or replace function public.customer_transfer_wallet(
  p_recipient_email text,
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
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_amount is null or v_amount < 1 or v_amount > 5000 then
    raise exception 'Transfer amount must be between 1 and 5000' using errcode = '22023';
  end if;

  select * into v_recipient from public.profiles
  where lower(email) = lower(trim(p_recipient_email)) and is_active and deleted_at is null;
  if v_recipient.id is null or v_recipient.id = v_user_id then
    raise exception 'Recipient not found' using errcode = 'P0002';
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

-- 3. customer_leave_table_session  (20260815211000:332-416)
create or replace function public.customer_leave_table_session(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_next_host uuid;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session
  from public.table_sessions
  where id = p_table_session_id and status = 'active'
  for update;

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = auth.uid()
  ) then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;

  delete from public.table_session_participants
  where table_session_id = p_table_session_id and user_id = auth.uid();

  select count(*)::integer into v_remaining
  from public.table_session_participants
  where table_session_id = p_table_session_id and user_id is not null;

  if v_remaining > 0 and (v_session.customer_id = auth.uid() or v_session.primary_user_id = auth.uid()) then
    select user_id into v_next_host
    from public.table_session_participants
    where table_session_id = p_table_session_id and user_id is not null
    order by joined_at
    limit 1;

    update public.table_session_participants
    set is_host = (user_id = v_next_host)
    where table_session_id = p_table_session_id and user_id is not null;

    update public.table_sessions
    set customer_id = v_next_host, primary_user_id = v_next_host,
        last_activity = now(), updated_at = now()
    where id = p_table_session_id;
  elsif v_remaining = 0 then
    -- An empty session with no order can be released immediately. Sessions
    -- with orders remain open for restaurant staff to settle/close safely.
    if not exists (select 1 from public.orders where table_session_id = p_table_session_id) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if exists (
        select 1 from public.reservations
        where table_id = v_session.table_id and status::text = 'seated'
      ) then
        -- Leaving immediately after a self check-in (before ordering) undoes
        -- that check-in instead of leaving a "seated" reservation on a free table.
        update public.reservations
        set status = 'confirmed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';

        update public.tables
        set status = 'reserved', occupied_since = null, updated_at = now()
        where id = v_session.table_id;
      else
        update public.tables
        set status = 'available', occupied_since = null, updated_at = now()
        where id = v_session.table_id and status = 'occupied';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'tableSessionId', p_table_session_id,
    'left', true,
    'remainingParticipants', v_remaining
  );
end;
$$;

revoke all on function public.customer_leave_table_session(uuid) from public;
grant execute on function public.customer_leave_table_session(uuid) to authenticated;
