-- Preço médio do cardápio no lugar de "por pessoa".
--
-- restaurants.average_ticket era um valor fixo de migração (180/85/38) que nada
-- calculava, e o "por pessoa" do card nem faz sentido para quem pede um item só.
-- O app passa a mostrar o preço médio do cardápio, calculado aqui no servidor
-- (o app só exibe, nunca determina valor) e guardado em centavos (bigint).
--
-- Regra isolada em função nomeada (ADR provisório):
--   private.compute_avg_menu_price_cents → média simples dos itens disponíveis,
--   em categoria ativa (ou sem categoria). Trocar por mediana é mudar esta função.
--
-- Coluna mantida por trigger em vez de RPC porque as listagens do app já leem
-- restaurants com select *, sem uma viagem extra por card.

alter table public.restaurants
  add column if not exists avg_menu_price_cents bigint
  check (avg_menu_price_cents is null or avg_menu_price_cents > 0);

comment on column public.restaurants.avg_menu_price_cents is
  'Preço médio do cardápio em centavos (média simples dos itens disponíveis). Mantido por trigger; null = sem itens.';

create or replace function private.compute_avg_menu_price_cents(p_restaurant_id uuid)
returns bigint language sql stable
set search_path = public, pg_temp as $$
  select nullif(round(avg(m.price) * 100)::bigint, 0)
  from public.menu_items m
  left join public.menu_categories c on c.id = m.category_id
  where m.restaurant_id = p_restaurant_id
    and m.is_available
    and m.price > 0
    and (m.category_id is null or coalesce(c.is_active, true))
$$;

create or replace function private.refresh_avg_menu_price(p_restaurant_id uuid)
returns void language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if p_restaurant_id is null then return; end if;
  update public.restaurants
    set avg_menu_price_cents = private.compute_avg_menu_price_cents(p_restaurant_id)
    where id = p_restaurant_id
      and avg_menu_price_cents is distinct from private.compute_avg_menu_price_cents(p_restaurant_id);
end $$;
revoke all on function private.refresh_avg_menu_price(uuid) from public, anon, authenticated;

create or replace function private.menu_items_refresh_avg_price()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.refresh_avg_menu_price(old.restaurant_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.restaurant_id is distinct from old.restaurant_id) then
    perform private.refresh_avg_menu_price(new.restaurant_id);
  end if;
  return null;
end $$;

drop trigger if exists menu_items_refresh_avg_price on public.menu_items;
create trigger menu_items_refresh_avg_price
  after insert or delete or update of price, is_available, category_id, restaurant_id on public.menu_items
  for each row execute function private.menu_items_refresh_avg_price();

create or replace function private.menu_categories_refresh_avg_price()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  perform private.refresh_avg_menu_price(coalesce(new.restaurant_id, old.restaurant_id));
  return null;
end $$;

drop trigger if exists menu_categories_refresh_avg_price on public.menu_categories;
create trigger menu_categories_refresh_avg_price
  after delete or update of is_active on public.menu_categories
  for each row execute function private.menu_categories_refresh_avg_price();

-- Backfill: todos os restaurantes com cardápio.
update public.restaurants r
  set avg_menu_price_cents = private.compute_avg_menu_price_cents(r.id)
  where avg_menu_price_cents is distinct from private.compute_avg_menu_price_cents(r.id);
