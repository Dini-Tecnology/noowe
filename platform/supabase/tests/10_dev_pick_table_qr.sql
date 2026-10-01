-- The emulator shortcut must stay off by default, and when it is on it must
-- hand back a payload that customer_open_table_session accepts.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  customer_id uuid := gen_random_uuid();
  picked jsonb;
  minted jsonb;
  visit jsonb;
begin
  insert into auth.users(id, email) values (customer_id, customer_id || '@dev-scan.test');
  insert into public.profiles(id) values (customer_id) on conflict do nothing;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.restaurant_create_table(r, 'dev-scan-' || customer_id, 4);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_id, 'role', 'authenticated')::text, true);
  begin
    perform public.customer_dev_pick_table_qr(r);
    raise exception 'dev scan ran while the flag was off';
  exception when sqlstate '42501' then null;
  end;

  update private.dev_flags
  set enabled = true, updated_at = now()
  where key = 'simulate_table_scan';

  picked := public.customer_dev_pick_table_qr(r);
  assert exists (
    select 1 from public.table_qr_codes
    where qr_code_data = picked->>'qrCodeData'
      and is_active
      and restaurant_id = r
  ), 'returns an active QR for the restaurant';

  update public.table_qr_codes q
  set is_active = false, updated_at = now()
  from public.tables t
  where q.table_id = t.id
    and t.restaurant_id = r
    and q.is_active;

  minted := public.customer_dev_pick_table_qr(r);
  assert minted->>'qrCodeData' like 'noowe://t/%', 'mints a signed payload when the table has none';
  assert minted->>'qrCodeData' is distinct from picked->>'qrCodeData', 'minted payload is a new code';

  visit := public.customer_open_table_session(minted->>'qrCodeData');
  assert (visit->>'tableSessionId') is not null, 'the shortcut payload opens a comanda';
  assert (visit->>'restaurantId')::uuid = r, 'the comanda belongs to the requested restaurant';
end $$;
select pass('dev table scan stays gated and opens a real comanda');
select * from finish();
rollback;
