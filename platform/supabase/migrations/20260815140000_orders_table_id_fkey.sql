-- orders.table_id has never had a real foreign key to public.tables, so
-- PostgREST can't resolve the `table:tables(table_number)` embed the client
-- now uses to show "Mesa X" on the order detail/list screens — every query
-- with that embed fails with "Could not find a relationship between orders
-- and tables in the schema cache", which is what broke the order status
-- screen.
--
-- NOT VALID (same pattern as table_sessions_table_id_fkey in
-- 20260803170000) so existing rows aren't validated/blocked, but the
-- constraint metadata is still enough for PostgREST's relationship cache.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_table_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_table_id_fkey
      foreign key (table_id) references public.tables(id) on delete set null
      not valid;
  end if;
end;
$$;
