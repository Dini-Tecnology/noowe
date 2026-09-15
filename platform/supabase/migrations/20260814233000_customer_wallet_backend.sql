-- Customer wallet backend: private ledger, payment methods and a consolidated
-- snapshot for the client app. Money-moving operations stay server-side.

alter table public.wallets alter column balance set default 0;
alter table public.wallets alter column max_balance set default 100000;
alter table public.wallets alter column daily_limit set default 5000;
alter table public.wallets alter column monthly_limit set default 30000;
alter table public.wallets alter column is_active set default true;
alter table public.wallets alter column metadata set default '{}'::jsonb;
alter table public.wallets alter column created_at set default now();
alter table public.wallets alter column updated_at set default now();

alter table public.wallet_transactions alter column metadata set default '{}'::jsonb;
alter table public.wallet_transactions alter column created_at set default now();

alter table public.payment_methods alter column is_default set default false;
alter table public.payment_methods alter column is_active set default true;
alter table public.payment_methods alter column metadata set default '{}'::jsonb;
alter table public.payment_methods alter column created_at set default now();
alter table public.payment_methods alter column updated_at set default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_user_id_fkey') then
    alter table public.wallets add constraint wallets_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wallet_transactions_wallet_id_fkey') then
    alter table public.wallet_transactions add constraint wallet_transactions_wallet_id_fkey
      foreign key (wallet_id) references public.wallets(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wallet_transactions_payment_method_id_fkey') then
    alter table public.wallet_transactions add constraint wallet_transactions_payment_method_id_fkey
      foreign key (payment_method_id) references public.payment_methods(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_methods_user_id_fkey') then
    alter table public.payment_methods add constraint payment_methods_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create unique index if not exists uq_wallets_user_global
  on public.wallets(user_id, wallet_type)
  where user_id is not null and restaurant_id is null;
create unique index if not exists uq_wallet_transaction_idempotency
  on public.wallet_transactions(wallet_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists uq_payment_methods_user_pix_active
  on public.payment_methods(user_id, pix_key)
  where is_active and pix_key is not null;
create index if not exists idx_wallet_transactions_wallet_created
  on public.wallet_transactions(wallet_id, created_at desc);
create index if not exists idx_payment_methods_user_active
  on public.payment_methods(user_id, is_active, is_default desc);

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

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payment_methods enable row level security;

revoke all on public.wallets, public.wallet_transactions, public.payment_methods from anon;
revoke insert, update, delete on public.wallets, public.wallet_transactions, public.payment_methods from authenticated;
grant select on public.wallets, public.wallet_transactions, public.payment_methods to authenticated;

drop policy if exists wallets_customer_own on public.wallets;
create policy wallets_customer_own on public.wallets for select to authenticated
  using (user_id = auth.uid());

drop policy if exists wallet_transactions_customer_own on public.wallet_transactions;
create policy wallet_transactions_customer_own on public.wallet_transactions for select to authenticated
  using (exists (
    select 1 from public.wallets w
    where w.id = wallet_transactions.wallet_id and w.user_id = auth.uid()
  ));

drop policy if exists payment_methods_customer_own on public.payment_methods;
create policy payment_methods_customer_own on public.payment_methods for select to authenticated
  using (user_id = auth.uid());

create or replace function private.ensure_customer_wallet(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_wallet_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));

  insert into public.wallets(user_id, restaurant_id, wallet_type)
  values (p_user_id, null, 'customer')
  on conflict (user_id, wallet_type) where user_id is not null and restaurant_id is null
  do update set updated_at = public.wallets.updated_at
  returning id into v_wallet_id;

  return v_wallet_id;
end;
$$;

revoke all on function private.ensure_customer_wallet(uuid) from public;

create or replace function public.customer_get_wallet_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet_id uuid;
  v_wallet public.wallets;
  v_methods jsonb;
  v_transactions jsonb;
  v_points numeric;
  v_cashback numeric;
  v_credits numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_wallet_id := private.ensure_customer_wallet(v_user_id);
  select * into v_wallet from public.wallets where id = v_wallet_id;

  select coalesce(sum(lp.points), 0) into v_points
  from public.loyalty_programs lp
  where lp.user_id = v_user_id and lp.is_active;

  select
    coalesce(sum(wt.amount) filter (where wt.transaction_type = 'cashback' and wt.amount > 0), 0),
    coalesce(sum(wt.amount) filter (where wt.transaction_type in ('credit', 'bonus', 'promotion') and wt.amount > 0), 0)
  into v_cashback, v_credits
  from public.wallet_transactions wt
  where wt.wallet_id = v_wallet_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pm.id,
    'methodType', pm.method_type,
    'displayName', case
      when pm.method_type in ('credit_card', 'debit_card') then
        concat(coalesce(nullif(initcap(pm.card_brand), ''), 'Cartão'), ' •••• ', coalesce(pm.card_last_four, '—'))
      when pm.method_type = 'pix' then 'PIX'
      else initcap(replace(pm.method_type, '_', ' '))
    end,
    'detail', case
      when pm.method_type = 'credit_card' then 'Cartão de crédito'
      when pm.method_type = 'debit_card' then 'Cartão de débito'
      when pm.method_type = 'pix' then coalesce(pm.metadata->>'pix_key_type', 'Chave PIX')
      else 'Método de pagamento'
    end,
    'isDefault', pm.is_default
  ) order by pm.is_default desc, pm.created_at desc), '[]'::jsonb)
  into v_methods
  from public.payment_methods pm
  where pm.user_id = v_user_id and pm.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tx.id,
    'kind', tx.kind,
    'amount', tx.amount,
    'description', tx.description,
    'restaurantName', tx.restaurant_name,
    'createdAt', tx.created_at,
    'cashbackAmount', tx.cashback_amount
  ) order by tx.created_at desc), '[]'::jsonb)
  into v_transactions
  from (
    select * from (
    select wt.id, wt.transaction_type as kind, wt.amount,
      coalesce(wt.description, initcap(replace(wt.transaction_type, '_', ' '))) as description,
      coalesce(r.name, wt.metadata->>'counterparty_name') as restaurant_name,
      wt.created_at, null::numeric as cashback_amount
    from public.wallet_transactions wt
    left join public.orders o on o.id = wt.order_id
    left join public.restaurants r on r.id = o.restaurant_id
    where wt.wallet_id = v_wallet_id and wt.transaction_type <> 'payment'

    union all

    select gt.id, 'payment'::text, abs(coalesce(gt.amount, gt.amount_cents / 100)),
      coalesce(r.name, 'Pagamento') as description, r.name as restaurant_name,
      gt.created_at,
      (select c.amount from public.wallet_transactions c
        where c.wallet_id = v_wallet_id
          and c.transaction_type = 'cashback'
          and c.metadata->>'gateway_transaction_id' = gt.id::text
        limit 1) as cashback_amount
    from public.gateway_transactions gt
    left join public.restaurants r on r.id = gt.restaurant_id
    where gt.customer_id = v_user_id and gt.status = 'completed'
    ) all_transactions
    where all_transactions.created_at is not null
    order by all_transactions.created_at desc
    limit 50
  ) tx
  ;

  return jsonb_build_object(
    'walletId', v_wallet.id,
    'balance', v_wallet.balance,
    'cashback', v_cashback,
    'points', v_points,
    'credits', v_credits,
    'currency', 'BRL',
    'paymentMethods', v_methods,
    'transactions', v_transactions,
    'updatedAt', v_wallet.updated_at
  );
end;
$$;

create or replace function public.customer_add_pix_payment_method(
  p_pix_key text,
  p_set_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := trim(p_pix_key);
  v_key_type text;
  v_make_default boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if length(v_key) < 5 or length(v_key) > 140 then
    raise exception 'Invalid PIX key' using errcode = '22023';
  end if;

  v_key_type := case
    when v_key ~ '^[0-9]{11}$' then 'Chave CPF'
    when v_key ~ '^[0-9]{14}$' then 'Chave CNPJ'
    when v_key ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then 'Chave e-mail'
    when v_key ~ '^\\+?[0-9]{10,15}$' then 'Chave telefone'
    else 'Chave aleatória'
  end;

  v_make_default := p_set_default or not exists (
    select 1 from public.payment_methods where user_id = v_user_id and is_active
  );
  if v_make_default then
    update public.payment_methods set is_default = false, updated_at = now()
    where user_id = v_user_id and is_active;
  end if;

  insert into public.payment_methods(
    user_id, method_type, pix_key, is_default, metadata
  ) values (
    v_user_id, 'pix', v_key, v_make_default, jsonb_build_object('pix_key_type', v_key_type)
  )
  on conflict (user_id, pix_key) where is_active and pix_key is not null
  do update set is_default = excluded.is_default,
    metadata = excluded.metadata, updated_at = now();

  return public.customer_get_wallet_snapshot();
end;
$$;

create or replace function public.customer_set_default_payment_method(p_payment_method_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.payment_methods
    where id = p_payment_method_id and user_id = v_user_id and is_active
  ) then raise exception 'Payment method not found' using errcode = 'P0002'; end if;

  update public.payment_methods set is_default = (id = p_payment_method_id), updated_at = now()
  where user_id = v_user_id and is_active;
  return public.customer_get_wallet_snapshot();
end;
$$;

create or replace function public.customer_remove_payment_method(p_payment_method_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_default boolean;
begin
  select is_default into v_was_default from public.payment_methods
  where id = p_payment_method_id and user_id = v_user_id and is_active;
  if not found then raise exception 'Payment method not found' using errcode = 'P0002'; end if;

  update public.payment_methods set is_active = false, is_default = false, updated_at = now()
  where id = p_payment_method_id and user_id = v_user_id;

  if v_was_default then
    update public.payment_methods set is_default = true, updated_at = now()
    where id = (
      select id from public.payment_methods
      where user_id = v_user_id and is_active
      order by created_at desc limit 1
    );
  end if;
  return public.customer_get_wallet_snapshot();
end;
$$;

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

-- Payment completion is the only automatic source of balance changes. Wallet
-- payments debit first; eligible restaurant payments then credit cashback.
create or replace function private.apply_customer_wallet_payment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_wallet public.wallets;
  v_amount numeric := abs(coalesce(new.amount, new.amount_cents / 100));
  v_cashback_percentage numeric;
  v_cashback numeric;
  v_restaurant_name text;
begin
  if new.customer_id is null or new.status <> 'completed' or v_amount <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;

  v_wallet_id := private.ensure_customer_wallet(new.customer_id);
  select * into v_wallet from public.wallets where id = v_wallet_id for update;
  select name into v_restaurant_name from public.restaurants where id = new.restaurant_id;

  if new.payment_method = 'wallet' and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'wallet-payment:' || new.id::text
  ) then
    if v_wallet.balance < v_amount then
      raise exception 'Insufficient wallet balance' using errcode = 'P0001';
    end if;
    update public.wallets set balance = balance - v_amount, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'payment', -v_amount, v_wallet.balance, v_wallet.balance - v_amount,
      coalesce(v_restaurant_name, 'Pagamento'), new.order_id, new.id,
      'wallet-payment:' || new.id::text, jsonb_build_object('gateway_transaction_id', new.id)
    );
    v_wallet.balance := v_wallet.balance - v_amount;
  end if;

  select lc.cashback_percentage into v_cashback_percentage
  from public.loyalty_configs lc
  where lc.restaurant_id = new.restaurant_id and lc.cashback_enabled
  order by lc.updated_at desc limit 1;
  v_cashback := round(v_amount * coalesce(v_cashback_percentage, 0) / 100, 2);

  if v_cashback > 0 and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'cashback:' || new.id::text
  ) then
    update public.wallets set balance = balance + v_cashback, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'cashback', v_cashback, v_wallet.balance, v_wallet.balance + v_cashback,
      'Cashback recebido', new.order_id, new.id, 'cashback:' || new.id::text,
      jsonb_build_object('gateway_transaction_id', new.id, 'restaurant_name', v_restaurant_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_wallet_payment on public.gateway_transactions;
create trigger trg_customer_wallet_payment
after insert or update of status on public.gateway_transactions
for each row execute function private.apply_customer_wallet_payment();

revoke all on function public.customer_get_wallet_snapshot() from public;
revoke all on function public.customer_add_pix_payment_method(text, boolean) from public;
revoke all on function public.customer_set_default_payment_method(uuid) from public;
revoke all on function public.customer_remove_payment_method(uuid) from public;
revoke all on function public.customer_transfer_wallet(text, numeric, uuid) from public;

grant execute on function public.customer_get_wallet_snapshot() to authenticated, service_role;
grant execute on function public.customer_add_pix_payment_method(text, boolean) to authenticated, service_role;
grant execute on function public.customer_set_default_payment_method(uuid) to authenticated, service_role;
grant execute on function public.customer_remove_payment_method(uuid) to authenticated, service_role;
grant execute on function public.customer_transfer_wallet(text, numeric, uuid) to authenticated, service_role;
