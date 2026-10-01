-- One category name per restaurant. Existing duplicates collapse onto the row
-- that already holds the most items (oldest row wins a tie). Dishes from the
-- discarded rows move with it, so nothing is left without a category.

do $$
begin
  create temporary table _menu_category_dupes (
    loser_id uuid primary key,
    winner_id uuid not null
  ) on commit drop;

  insert into _menu_category_dupes (loser_id, winner_id)
  with ranked as (
    select
      mc.id,
      mc.restaurant_id,
      lower(btrim(mc.name)) as normalized_name,
      row_number() over (
        partition by mc.restaurant_id, lower(btrim(mc.name))
        order by
          (select count(*) from public.menu_items mi where mi.category_id = mc.id) desc,
          mc.created_at asc,
          mc.id asc
      ) as rn
    from public.menu_categories mc
  )
  select loser.id, winner.id
  from ranked loser
  join ranked winner
    on winner.restaurant_id = loser.restaurant_id
   and winner.normalized_name = loser.normalized_name
   and winner.rn = 1
  where loser.rn > 1;

  update public.menu_items mi
  set category_id = d.winner_id,
      updated_at = now()
  from _menu_category_dupes d
  where mi.category_id = d.loser_id;

  delete from public.menu_categories mc
  using _menu_category_dupes d
  where mc.id = d.loser_id;
end
$$;

create unique index if not exists menu_categories_restaurant_name_key
  on public.menu_categories (restaurant_id, lower(btrim(name)));

comment on index public.menu_categories_restaurant_name_key is
  'Category names are unique per restaurant, ignoring case and surrounding spaces.';

create or replace function public.restaurant_create_menu_category(
  p_restaurant_id uuid,
  p_name text,
  p_description text default null,
  p_image_url text default null,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cat record;
  v_name text := nullif(btrim(p_name), '');
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_name is null then
    raise exception 'Informe um nome.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || ':menu-category:' || lower(v_name)));

  if exists (
    select 1
    from public.menu_categories
    where restaurant_id = p_restaurant_id
      and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'Já existe uma categoria com esse nome.' using errcode = '23505';
  end if;

  begin
    insert into public.menu_categories(
      restaurant_id, name, description, image_url, sort_order, is_active, created_at, updated_at
    )
    values(
      p_restaurant_id, v_name, p_description, p_image_url, p_sort_order, true, now(), now()
    )
    returning * into v_cat;
  exception
    when unique_violation then
      raise exception 'Já existe uma categoria com esse nome.' using errcode = '23505';
  end;

  return to_jsonb(v_cat);
end;
$$;

create or replace function public.restaurant_update_menu_category(
  p_category_id uuid,
  p_name text default null,
  p_description text default null,
  p_image_url text default null,
  p_sort_order integer default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cat record;
  v_updated record;
  v_name text := case when p_name is null then null else nullif(btrim(p_name), '') end;
begin
  select * into v_cat from public.menu_categories where id = p_category_id;
  if v_cat.id is null then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_cat.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if p_name is not null and v_name is null then
    raise exception 'Informe um nome.' using errcode = '22023';
  end if;

  if v_name is not null then
    perform pg_advisory_xact_lock(hashtext(v_cat.restaurant_id::text || ':menu-category:' || lower(v_name)));

    if exists (
      select 1
      from public.menu_categories
      where restaurant_id = v_cat.restaurant_id
        and id <> p_category_id
        and lower(btrim(name)) = lower(v_name)
    ) then
      raise exception 'Já existe uma categoria com esse nome.' using errcode = '23505';
    end if;
  end if;

  begin
    update public.menu_categories
    set
      name        = coalesce(v_name, name),
      description = coalesce(p_description, description),
      image_url   = coalesce(p_image_url, image_url),
      sort_order  = coalesce(p_sort_order, sort_order),
      is_active   = coalesce(p_is_active, is_active),
      updated_at  = now()
    where id = p_category_id
    returning * into v_updated;
  exception
    when unique_violation then
      raise exception 'Já existe uma categoria com esse nome.' using errcode = '23505';
  end;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_create_menu_category(uuid,text,text,text,integer) from public;
revoke all on function public.restaurant_update_menu_category(uuid,text,text,text,integer,boolean) from public;
grant execute on function public.restaurant_create_menu_category(uuid,text,text,text,integer) to authenticated, service_role;
grant execute on function public.restaurant_update_menu_category(uuid,text,text,text,integer,boolean) to authenticated, service_role;
