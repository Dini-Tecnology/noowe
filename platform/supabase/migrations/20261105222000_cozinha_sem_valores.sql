-- Item G: Chef, Cozinheiro e Barman não veem valores. O KDS já vinha por RPC, sem preço, mas a política deixava ler orders e order_items
-- direto pela API. O tempo real dependia disso: o aviso agora vem de kds_signals, que não carrega valor nenhum.
create table public.kds_signals (
  order_id uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index kds_signals_restaurant_idx on public.kds_signals(restaurant_id);
alter table public.kds_signals enable row level security;
create policy kds_signals_staff_read on public.kds_signals for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager','chef','cook','waiter','barman','maitre','cashier','host']::public.user_roles_role_enum[]));
alter table public.kds_signals replica identity full;
alter publication supabase_realtime add table public.kds_signals;

create or replace function private.kds_signal_from_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.kds_signals(order_id, restaurant_id) values (new.id, new.restaurant_id)
    on conflict (order_id) do update set changed_at = now();
  return null;
end $$;
create or replace function private.kds_signal_from_item()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
begin
  insert into public.kds_signals(order_id, restaurant_id)
    select o.id, o.restaurant_id from public.orders o where o.id = v_order
    on conflict (order_id) do update set changed_at = now();
  return null;
end $$;
revoke all on function private.kds_signal_from_order() from public, anon, authenticated;
revoke all on function private.kds_signal_from_item() from public, anon, authenticated;
create trigger zz_kds_signal after insert or update on public.orders for each row execute function private.kds_signal_from_order();
create trigger zz_kds_signal after insert or update on public.order_items for each row execute function private.kds_signal_from_item();

drop policy orders_select_restaurant_staff on public.orders;
create policy orders_select_restaurant_staff on public.orders for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager','waiter','maitre','cashier','host']::public.user_roles_role_enum[]));

drop policy order_items_select_accessible_order on public.order_items;
create policy order_items_select_accessible_order on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id
    and (o.customer_id = auth.uid() or private.has_restaurant_role(o.restaurant_id, array['owner','manager','waiter','maitre','cashier','host']::public.user_roles_role_enum[]))));
