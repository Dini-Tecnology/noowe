-- Emulator shortcut. The client camera cannot scan a table QR, so development
-- builds ask this function for one real, signed payload and then call
-- customer_open_table_session — the comanda is still created by that RPC.
--
-- The function does nothing until private.dev_flags.simulate_table_scan is
-- turned on. Leave it off on any database that real customers use:
--   update private.dev_flags set enabled = false, updated_at = now()
--   where key = 'simulate_table_scan';

create table if not exists private.dev_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

revoke all on table private.dev_flags from public, anon, authenticated;

insert into private.dev_flags (key, enabled)
values ('simulate_table_scan', false)
on conflict (key) do nothing;

create or replace function public.customer_dev_pick_table_qr(p_restaurant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_table_id uuid;
  v_restaurant_id uuid;
  v_table_number text;
  v_data text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from private.dev_flags
    where key = 'simulate_table_scan'
      and enabled
  ) then
    raise exception 'O atalho de mesa de teste está desligado no banco.'
      using errcode = '42501';
  end if;

  -- One picker at a time, so two taps cannot mint two active QR codes.
  perform pg_advisory_xact_lock(hashtext('customer_dev_pick_table_qr'));

  select t.id, t.restaurant_id, t.table_number
    into v_table_id, v_restaurant_id, v_table_number
  from public.tables t
  join public.restaurants r
    on r.id = t.restaurant_id
   and r.is_active
  where (p_restaurant_id is null or t.restaurant_id = p_restaurant_id)
    and t.status in ('available', 'occupied')
  order by
    case t.status when 'available' then 0 else 1 end,
    t.table_number
  limit 1;

  if v_table_id is null then
    raise exception 'Não há mesa livre para abrir uma comanda de teste.'
      using errcode = 'P0002';
  end if;

  select q.qr_code_data
    into v_data
  from public.table_qr_codes q
  where q.table_id = v_table_id
    and q.is_active
    and (q.expires_at is null or q.expires_at > now())
    and q.signature = encode(sha256(q.qr_code_data::bytea), 'hex')
  order by q.created_at desc
  limit 1;

  if v_data is null then
    update public.table_qr_codes
    set is_active = false,
        updated_at = now()
    where table_id = v_table_id
      and is_active;

    v_data := 'noowe://t/'
      || replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');

    insert into public.table_qr_codes (
      restaurant_id, table_id, qr_code_data, signature, style,
      color_primary, logo_included, version, is_active, expires_at, generated_by,
      created_at, updated_at
    ) values (
      v_restaurant_id, v_table_id, v_data,
      encode(sha256(v_data::bytea), 'hex'), 'default',
      '#000000', false, 1, true, now() + interval '90 days', auth.uid()::text,
      now(), now()
    );

    update public.tables
    set qr_code = v_data,
        updated_at = now()
    where id = v_table_id;
  end if;

  return jsonb_build_object(
    'qrCodeData', v_data,
    'restaurantId', v_restaurant_id,
    'tableNumber', v_table_number
  );
end;
$$;

revoke all on function public.customer_dev_pick_table_qr(uuid) from public, anon;
grant execute on function public.customer_dev_pick_table_qr(uuid) to authenticated;
