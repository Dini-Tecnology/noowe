-- Status ao vivo (20261022120000): `tablesAvailable` conta só mesa `available`. É o que
-- desativa o "Escanear QR" no app; mesa reservada ou em limpeza não recebe ninguém pelo QR.
begin;
select plan(3);

create temp table available_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  t_cleaning uuid;
  t_reserved uuid;
  t_free uuid;
  live jsonb;
begin
  update public.tables set status = 'occupied', updated_at = now() where restaurant_id = r;

  live := private.restaurant_live_status(r);
  insert into available_results values ('todas ocupadas: nenhuma mesa livre',
    (live->>'tablesAvailable')::integer = 0
    and (live->>'tablesTotal')::integer = (live->>'tablesOccupied')::integer);

  select id into t_cleaning from public.tables where restaurant_id = r order by id limit 1;
  select id into t_reserved from public.tables where restaurant_id = r and id <> t_cleaning order by id limit 1;
  update public.tables set status = 'cleaning' where id = t_cleaning;
  update public.tables set status = 'reserved' where id = t_reserved;

  live := private.restaurant_live_status(r);
  insert into available_results values ('limpeza e reserva não contam como livre',
    (live->>'tablesAvailable')::integer = 0
    and (live->>'tablesOccupied')::integer < (live->>'tablesTotal')::integer);

  select id into t_free from public.tables
    where restaurant_id = r and id not in (t_cleaning, t_reserved) order by id limit 1;
  update public.tables set status = 'available' where id = t_free;

  live := public.customer_restaurant_live_status(r);
  insert into available_results values ('uma mesa liberada aparece para o cliente',
    (live->>'tablesAvailable')::integer = 1);
end $$;

select ok(ok, label) from available_results order by label;
select * from finish();
rollback;
