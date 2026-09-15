-- Backend from scratch for PromotionsScreen and ReviewsScreen — both tables existed
-- (20260430180000_generated_rest_platform_tables.sql) but had no RLS and no RPCs.

-- ─── Promotions ───────────────────────────────────────────────────────────────
alter table public.promotions enable row level security;

drop policy if exists "promotions_staff" on public.promotions;
create policy "promotions_staff" on public.promotions
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  );

create or replace function public.restaurant_get_promotions(
  p_restaurant_id uuid,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(to_jsonb(p) order by p.valid_from desc), '[]'::jsonb)
  into result
  from public.promotions p
  where p.restaurant_id = p_restaurant_id
    and (p_status is null or p.status = p_status);

  return result;
end;
$$;

create or replace function public.restaurant_upsert_promotion(
  p_restaurant_id uuid,
  p_promotion_id uuid,
  p_code text,
  p_title text,
  p_type text,
  p_discount_value numeric,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_row record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  if p_promotion_id is null then
    insert into public.promotions (
      restaurant_id, code, title, description, type, status, discount_value,
      current_uses, max_uses_per_user, valid_from, valid_until, created_at, updated_at
    )
    values (
      p_restaurant_id, p_code, p_title, p_description, p_type, 'active', p_discount_value,
      0, 1, p_valid_from, p_valid_until, now(), now()
    )
    returning * into v_row;
  else
    update public.promotions
    set code = p_code, title = p_title, description = p_description, type = p_type,
        discount_value = p_discount_value, valid_from = p_valid_from, valid_until = p_valid_until,
        updated_at = now()
    where id = p_promotion_id and restaurant_id = p_restaurant_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.restaurant_close_promotion(
  p_promotion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_promo record;
  v_result jsonb;
begin
  select * into v_promo from public.promotions where id = p_promotion_id;
  if v_promo.id is null then
    raise exception 'Promotion not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_promo.restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  update public.promotions set status = 'inactive', updated_at = now()
  where id = p_promotion_id
  returning to_jsonb(promotions.*) into v_result;

  return v_result;
end;
$$;

revoke all on function public.restaurant_get_promotions(uuid, text) from public;
revoke all on function public.restaurant_upsert_promotion(uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, text) from public;
revoke all on function public.restaurant_close_promotion(uuid) from public;
grant execute on function public.restaurant_get_promotions(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_upsert_promotion(uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.restaurant_close_promotion(uuid) to authenticated, service_role;

-- ─── Reviews ──────────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_staff" on public.reviews;
create policy "reviews_select_staff" on public.reviews
  for select using (
    private.has_restaurant_role(restaurant_id)
  );

drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public" on public.reviews
  for select to anon, authenticated using (is_visible);

drop policy if exists "reviews_update_staff_response" on public.reviews;
create policy "reviews_update_staff_response" on public.reviews
  for update using (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
  with check (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  );

create or replace function public.restaurant_get_reviews(
  p_restaurant_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);

  select jsonb_build_object(
    'average_rating', (select rating from public.restaurants where id = p_restaurant_id),
    'total_reviews', (select total_reviews from public.restaurants where id = p_restaurant_id),
    'reviews', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'rating', r.rating,
          'comment', r.comment,
          'owner_response', r.owner_response,
          'created_at', r.created_at,
          'customer_name', p.full_name
        ) order by r.created_at desc
      )
      from public.reviews r
      left join public.profiles p on p.id = r.user_id
      where r.restaurant_id = p_restaurant_id
        and r.is_visible
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.restaurant_respond_review(
  p_review_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_review record;
  v_result jsonb;
begin
  select * into v_review from public.reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_review.restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  update public.reviews
  set owner_response = p_response, owner_responded_at = now(), updated_at = now()
  where id = p_review_id
  returning to_jsonb(reviews.*) into v_result;

  return v_result;
end;
$$;

revoke all on function public.restaurant_get_reviews(uuid, integer) from public;
revoke all on function public.restaurant_respond_review(uuid, text) from public;
grant execute on function public.restaurant_get_reviews(uuid, integer) to authenticated, service_role;
grant execute on function public.restaurant_respond_review(uuid, text) to authenticated, service_role;
