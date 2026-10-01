-- Reading the wallet must not write the wallet row: every write is a Realtime
-- event, and the app refetches the snapshot on each event (refetch loop).
begin;
select plan(3);

create temp table wallet_read_results(label text primary key, ok boolean not null);

do $$
declare
  customer_id uuid := gen_random_uuid();
  first_version xid;
  second_version xid;
begin
  insert into auth.users(id, email) values (customer_id, customer_id || '@wallet-read.test');
  insert into public.profiles(id) values (customer_id) on conflict do nothing;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_id, 'role', 'authenticated')::text, true);

  perform public.customer_get_wallet_snapshot();
  insert into wallet_read_results values (
    'first read creates the customer wallet',
    (select count(*) = 1 from public.wallets
      where user_id = customer_id and wallet_type = 'customer' and restaurant_id is null)
  );

  select xmin::text::xid into first_version from public.wallets
    where user_id = customer_id and wallet_type = 'customer' and restaurant_id is null;

  -- The exception block runs in a subtransaction, so any rewrite of the row
  -- would carry a new xmin.
  begin
    perform public.customer_get_wallet_snapshot();
  exception when others then raise;
  end;

  select xmin::text::xid into second_version from public.wallets
    where user_id = customer_id and wallet_type = 'customer' and restaurant_id is null;

  insert into wallet_read_results values (
    'later reads do not rewrite the wallet row', first_version = second_version
  );
  insert into wallet_read_results values (
    'still exactly one wallet',
    (select count(*) = 1 from public.wallets
      where user_id = customer_id and wallet_type = 'customer' and restaurant_id is null)
  );
end $$;

select ok(ok, label) from wallet_read_results order by label;
select * from finish();
rollback;
