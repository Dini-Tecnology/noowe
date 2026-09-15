-- LGPD Art. 18 rights (data portability + erasure), which had no backend
-- support at all: no export endpoint, no deletion flow, despite
-- profiles.deletion_requested_at/deletion_scheduled_for already existing
-- as unused columns.

create or replace function public.export_user_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'profile', (
      select to_jsonb(p) - 'deletion_requested_at' - 'deletion_scheduled_for'
      from public.profiles p
      where p.id = v_user_id
    ),
    'orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'restaurant_id', o.restaurant_id,
          'order_type', o.order_type,
          'status', o.status,
          'total_amount', o.total_amount,
          'created_at', o.created_at,
          'items', private.order_items_json(o.id)
        )
        order by o.created_at desc
      ), '[]'::jsonb)
      from public.orders o
      where o.customer_id = v_user_id
    ),
    'reservations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'restaurant_id', r.restaurant_id,
          'reservation_time', r.reservation_time,
          'party_size', r.party_size,
          'status', r.status
        )
        order by r.reservation_time desc
      ), '[]'::jsonb)
      from public.reservations r
      where r.customer_id = v_user_id
    ),
    'loyalty', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'restaurant_id', lp.restaurant_id,
          'points', lp.points,
          'tier', lp.tier,
          'total_visits', lp.total_visits,
          'total_spent', lp.total_spent
        )
      ), '[]'::jsonb)
      from public.loyalty_programs lp
      where lp.user_id = v_user_id
    ),
    'consents', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'consent_type', c.consent_type,
          'version', c.version,
          'accepted_at', c.accepted_at,
          'revoked_at', c.revoked_at
        )
        order by c.accepted_at desc
      ), '[]'::jsonb)
      from public.user_consents c
      where c.user_id = v_user_id
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.export_user_data() from public;
grant execute on function public.export_user_data() to authenticated;

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_for timestamptz := now() + interval '30 days';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Anonymize PII immediately; keep orders/payments/reservations intact for
  -- fiscal/legal retention. Physical purge after the grace period is a
  -- follow-up (needs a scheduled job, out of scope here).
  update public.profiles
  set
    full_name = 'Usuário excluído',
    email = 'deleted-' || v_user_id::text || '@deleted.local',
    phone = null,
    avatar_url = null,
    default_address = null,
    dietary_restrictions = null,
    favorite_cuisines = null,
    preferences = null,
    birth_date = null,
    is_active = false,
    deletion_requested_at = now(),
    deletion_scheduled_for = v_scheduled_for,
    updated_at = now()
  where id = v_user_id;

  return jsonb_build_object(
    'deletion_requested_at', now(),
    'deletion_scheduled_for', v_scheduled_for
  );
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
