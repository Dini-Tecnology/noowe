-- Production backend for the waiter Customer Assistance hub.
-- Covers QR onboarding, menu allergen intelligence, in-service feedback capture,
-- and special-request lifecycle management with tenant-safe RLS.

-- ─── Persistent feedback captured during a table session ────────────────────

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  table_session_id uuid unique references public.table_sessions(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  sentiment text not null,
  rating smallint,
  note text,
  service_stage text not null default 'finishing',
  collected_by uuid not null references public.profiles(id) on delete restrict,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_feedback_sentiment_check
    check (sentiment in ('positive', 'neutral', 'negative')),
  constraint customer_feedback_rating_check
    check (rating is null or rating between 1 and 5),
  constraint customer_feedback_service_stage_check
    check (service_stage in ('main', 'dessert', 'finishing', 'other')),
  constraint customer_feedback_note_length_check
    check (note is null or char_length(note) <= 2000),
  constraint customer_feedback_customer_name_length_check
    check (customer_name is null or char_length(customer_name) <= 160)
);

create index if not exists customer_feedback_restaurant_collected_idx
  on public.customer_feedback (restaurant_id, collected_at desc);
create index if not exists customer_feedback_table_id_idx
  on public.customer_feedback (table_id);
create index if not exists customer_feedback_customer_id_idx
  on public.customer_feedback (customer_id);
create index if not exists customer_feedback_collected_by_idx
  on public.customer_feedback (collected_by);

create index if not exists table_sessions_assistance_active_idx
  on public.table_sessions (restaurant_id, table_id, started_at desc)
  where status = 'active';
create index if not exists table_qr_codes_assistance_active_idx
  on public.table_qr_codes (restaurant_id, table_id, created_at desc)
  where is_active;

-- ─── Special requests and courtesies ────────────────────────────────────────

create table if not exists public.restaurant_special_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  table_session_id uuid references public.table_sessions(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  handled_by uuid references public.profiles(id) on delete set null,
  request_type text not null default 'other',
  source text not null default 'staff',
  title text not null,
  description text not null,
  action_label text,
  priority smallint not null default 3,
  status text not null default 'pending',
  handled_note text,
  due_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_special_requests_type_check
    check (request_type in ('birthday', 'accessibility', 'vip', 'dietary', 'courtesy', 'photo', 'other')),
  constraint restaurant_special_requests_source_check
    check (source in ('customer', 'staff', 'reservation', 'system')),
  constraint restaurant_special_requests_priority_check
    check (priority between 1 and 5),
  constraint restaurant_special_requests_status_check
    check (status in ('pending', 'acknowledged', 'resolved', 'dismissed')),
  constraint restaurant_special_requests_title_length_check
    check (char_length(title) between 1 and 160),
  constraint restaurant_special_requests_description_length_check
    check (char_length(description) between 1 and 3000),
  constraint restaurant_special_requests_action_length_check
    check (action_label is null or char_length(action_label) <= 120),
  constraint restaurant_special_requests_handled_note_length_check
    check (handled_note is null or char_length(handled_note) <= 2000)
);

create index if not exists restaurant_special_requests_active_idx
  on public.restaurant_special_requests (restaurant_id, status, priority desc, created_at desc)
  where status in ('pending', 'acknowledged');
create index if not exists restaurant_special_requests_table_id_idx
  on public.restaurant_special_requests (table_id);
create index if not exists restaurant_special_requests_table_session_id_idx
  on public.restaurant_special_requests (table_session_id);
create index if not exists restaurant_special_requests_reservation_id_idx
  on public.restaurant_special_requests (reservation_id);
create index if not exists restaurant_special_requests_customer_id_idx
  on public.restaurant_special_requests (customer_id);
create index if not exists restaurant_special_requests_requested_by_idx
  on public.restaurant_special_requests (requested_by);
create index if not exists restaurant_special_requests_assigned_to_idx
  on public.restaurant_special_requests (assigned_to);
create index if not exists restaurant_special_requests_handled_by_idx
  on public.restaurant_special_requests (handled_by);
create unique index if not exists restaurant_special_requests_reservation_source_uq
  on public.restaurant_special_requests (reservation_id)
  where reservation_id is not null and source = 'reservation';

-- ─── Shared helpers ──────────────────────────────────────────────────────────

create or replace function private.normalize_assistance_label(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select translate(
    lower(btrim(value)),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

create or replace function private.set_customer_assistance_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.canonical_assistance_allergen(value text)
returns text
language sql
immutable
strict
set search_path = public, private, pg_catalog
as $$
  select case
    when normalized like any (array['%gluten%', '%trigo%', '%celiac%']) then 'gluten'
    when normalized like any (array['%lact%', '%leite%', '%laticin%']) then 'lactose'
    when normalized like any (array['%fruto%mar%', '%crustac%', '%camarao%', '%marisco%']) then 'seafood'
    when normalized like any (array['%noz%', '%nozes%', '%castanha%', '%amendoim%']) then 'nuts'
    when normalized like any (array['%ovo%', '%egg%']) then 'eggs'
    when normalized like any (array['%soja%', '%soy%']) then 'soy'
    else normalized
  end
  from (select private.normalize_assistance_label(value) as normalized) labels;
$$;

revoke all on function private.normalize_assistance_label(text) from public;
revoke all on function private.set_customer_assistance_updated_at() from public;
revoke all on function private.canonical_assistance_allergen(text) from public;

create or replace function private.ensure_default_table_qr_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_data text := 'noowe://table/' || new.id::text;
begin
  insert into public.table_qr_codes (
    restaurant_id, table_id, qr_code_data, signature, style,
    color_primary, logo_included, version, is_active, generated_by,
    created_at, updated_at
  )
  values (
    new.restaurant_id, new.id, v_data,
    encode(sha256(v_data::bytea), 'hex'), 'default',
    '#000000', false, 1, true, 'system', now(), now()
  );

  update public.tables
  set qr_code = v_data, updated_at = now()
  where id = new.id and qr_code is null;

  return new;
end;
$$;

revoke all on function private.ensure_default_table_qr_code() from public;

drop trigger if exists tables_ensure_default_qr on public.tables;
create trigger tables_ensure_default_qr
  after insert on public.tables
  for each row execute function private.ensure_default_table_qr_code();

-- Backfill legacy tables without an active QR while preserving existing codes.
insert into public.table_qr_codes (
  restaurant_id, table_id, qr_code_data, signature, style,
  color_primary, logo_included, version, is_active, generated_by,
  created_at, updated_at
)
select
  t.restaurant_id,
  t.id,
  'noowe://table/' || t.id::text,
  encode(sha256(('noowe://table/' || t.id::text)::bytea), 'hex'),
  'default',
  '#000000',
  false,
  1,
  true,
  'system-backfill',
  now(),
  now()
from public.tables t
where not exists (
  select 1 from public.table_qr_codes qc
  where qc.table_id = t.id and qc.is_active
);

update public.tables t
set
  qr_code = (
  select qc.qr_code_data
  from public.table_qr_codes qc
  where qc.table_id = t.id and qc.is_active
  order by qc.created_at desc
  limit 1
  ),
  updated_at = now()
where t.qr_code is null
  and exists (
    select 1 from public.table_qr_codes qc
    where qc.table_id = t.id and qc.is_active
  );

drop trigger if exists customer_feedback_set_updated_at on public.customer_feedback;
create trigger customer_feedback_set_updated_at
  before update on public.customer_feedback
  for each row execute function private.set_customer_assistance_updated_at();

drop trigger if exists restaurant_special_requests_set_updated_at on public.restaurant_special_requests;
create trigger restaurant_special_requests_set_updated_at
  before update on public.restaurant_special_requests
  for each row execute function private.set_customer_assistance_updated_at();

create or replace function private.sync_reservation_special_request()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_normalized text;
begin
  v_normalized := private.normalize_assistance_label(coalesce(new.special_requests, ''));

  if btrim(coalesce(new.special_requests, '')) <> ''
    and new.status::text in ('confirmed', 'seated') then
    insert into public.restaurant_special_requests (
      restaurant_id,
      table_id,
      reservation_id,
      customer_id,
      requested_by,
      request_type,
      source,
      title,
      description,
      action_label,
      priority,
      status,
      due_at,
      metadata
    )
    values (
      new.restaurant_id,
      new.table_id,
      new.id,
      new.customer_id,
      new.customer_id,
      case
        when v_normalized like '%anivers%' then 'birthday'
        when v_normalized like '%acessib%' then 'accessibility'
        when v_normalized like '%alerg%' or v_normalized like '%restri%' then 'dietary'
        else 'other'
      end,
      'reservation',
      'Pedido especial da reserva',
      btrim(new.special_requests),
      'Providenciar',
      3,
      'pending',
      new.reservation_time,
      jsonb_build_object('reservation_status', new.status::text)
    )
    on conflict (reservation_id) where reservation_id is not null and source = 'reservation'
    do update set
      table_id = excluded.table_id,
      customer_id = excluded.customer_id,
      request_type = excluded.request_type,
      description = excluded.description,
      due_at = excluded.due_at,
      metadata = excluded.metadata,
      status = case
        when public.restaurant_special_requests.status in ('resolved', 'dismissed')
          then public.restaurant_special_requests.status
        else 'pending'
      end,
      updated_at = now();
  elsif tg_op = 'UPDATE' then
    update public.restaurant_special_requests
    set
      status = 'dismissed',
      handled_note = 'Reserva cancelada ou pedido especial removido',
      resolved_at = now(),
      updated_at = now()
    where reservation_id = new.id
      and source = 'reservation'
      and status in ('pending', 'acknowledged');
  end if;

  return new;
end;
$$;

revoke all on function private.sync_reservation_special_request() from public;

drop trigger if exists reservations_sync_special_request on public.reservations;
create trigger reservations_sync_special_request
  after insert or update of special_requests, status, table_id, reservation_time
  on public.reservations
  for each row execute function private.sync_reservation_special_request();

-- Backfill future/active reservations that predate this migration.
insert into public.restaurant_special_requests (
  restaurant_id, table_id, reservation_id, customer_id, requested_by,
  request_type, source, title, description, action_label, priority, status,
  due_at, metadata
)
select
  r.restaurant_id,
  r.table_id,
  r.id,
  r.customer_id,
  r.customer_id,
  case
    when private.normalize_assistance_label(r.special_requests) like '%anivers%' then 'birthday'
    when private.normalize_assistance_label(r.special_requests) like '%acessib%' then 'accessibility'
    when private.normalize_assistance_label(r.special_requests) like '%alerg%'
      or private.normalize_assistance_label(r.special_requests) like '%restri%' then 'dietary'
    else 'other'
  end,
  'reservation',
  'Pedido especial da reserva',
  btrim(r.special_requests),
  'Providenciar',
  3,
  'pending',
  r.reservation_time,
  jsonb_build_object('reservation_status', r.status::text)
from public.reservations r
where r.status::text in ('confirmed', 'seated')
  and r.special_requests is not null
  and btrim(r.special_requests) <> ''
  and r.reservation_time >= now() - interval '1 day'
on conflict (reservation_id) where reservation_id is not null and source = 'reservation'
do nothing;

-- ─── Tenant-safe RLS ─────────────────────────────────────────────────────────

alter table public.customer_feedback enable row level security;
alter table public.restaurant_special_requests enable row level security;

revoke all on public.customer_feedback from anon, authenticated;
revoke all on public.restaurant_special_requests from anon, authenticated;
grant select on public.customer_feedback to authenticated;
grant select on public.restaurant_special_requests to authenticated;

drop policy if exists customer_feedback_staff_select on public.customer_feedback;
create policy customer_feedback_staff_select
on public.customer_feedback
for select
to authenticated
using (
  private.has_restaurant_role(
    restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  )
  or (
    private.has_restaurant_role(
      restaurant_id,
      array['waiter']::public.user_roles_role_enum[]
    )
    and exists (
      select 1
      from public.tables t
      where t.id = customer_feedback.table_id
        and t.assigned_waiter_id = (select auth.uid())
    )
  )
);

drop policy if exists restaurant_special_requests_staff_select on public.restaurant_special_requests;
create policy restaurant_special_requests_staff_select
on public.restaurant_special_requests
for select
to authenticated
using (
  private.has_restaurant_role(
    restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  )
  or (
    private.has_restaurant_role(
      restaurant_id,
      array['waiter']::public.user_roles_role_enum[]
    )
    and (
      table_id is null
      or exists (
        select 1
        from public.tables t
        where t.id = restaurant_special_requests.table_id
          and t.assigned_waiter_id = (select auth.uid())
      )
    )
  )
);

-- ─── Assistance hub read model ───────────────────────────────────────────────

create or replace function public.restaurant_get_customer_assistance_hub(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_view_all boolean;
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );

  v_can_view_all := private.has_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  );

  with scoped_tables as (
    select t.*
    from public.tables t
    where t.restaurant_id = p_restaurant_id
      and (v_can_view_all or t.assigned_waiter_id = v_user_id)
  ),
  active_sessions as (
    select
      ts.*,
      t.table_number,
      t.section,
      t.status as table_status,
      t.seats,
      t.assigned_waiter_id
    from public.table_sessions ts
    join scoped_tables t on t.id = ts.table_id
    where ts.restaurant_id = p_restaurant_id
      and ts.status = 'active'
  ),
  party_user_ids as (
    select active_sessions.id as table_session_id, active_sessions.table_id,
           active_sessions.table_number, active_sessions.primary_user_id as user_id
    from active_sessions
    where active_sessions.primary_user_id is not null
    union
    select active_sessions.id, active_sessions.table_id,
           active_sessions.table_number, active_sessions.customer_id
    from active_sessions
    where active_sessions.customer_id is not null
    union
    select active_sessions.id, active_sessions.table_id,
           active_sessions.table_number, guest.value::uuid
    from active_sessions
    cross join lateral jsonb_array_elements_text(coalesce(active_sessions.guest_user_ids, '[]'::jsonb)) guest(value)
    where guest.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  party_restrictions as (
    select
      pui.table_id,
      pui.table_number,
      p.id as customer_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Cliente') as customer_name,
      restriction as restriction_name,
      private.canonical_assistance_allergen(restriction) as restriction_key
    from party_user_ids pui
    join public.profiles p on p.id = pui.user_id
    cross join lateral unnest(coalesce(p.dietary_restrictions, array[]::text[])) restriction
  ),
  menu_allergen_rows as (
    select distinct
      private.canonical_assistance_allergen(allergen.value) as allergen_key,
      btrim(allergen.value) as allergen_name,
      mi.id as menu_item_id,
      mi.name as menu_item_name
    from public.menu_items mi
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(mi.allergens) = 'array' then mi.allergens else '[]'::jsonb end
    ) allergen(value)
    where mi.restaurant_id = p_restaurant_id
      and mi.is_available
      and btrim(allergen.value) <> ''
  ),
  menu_allergens as (
    select
      mar.allergen_key,
      min(mar.allergen_name) as allergen_name,
      count(*) as item_count,
      jsonb_agg(mar.menu_item_name order by mar.menu_item_name) as items
    from menu_allergen_rows mar
    group by mar.allergen_key
  ),
  restriction_groups as (
    select
      pr.restriction_key,
      jsonb_agg(
        jsonb_build_object(
          'table_id', pr.table_id,
          'table_number', pr.table_number,
          'customer_id', pr.customer_id,
          'customer_name', pr.customer_name
        ) order by pr.table_number, pr.customer_name
      ) as affected_customers
    from party_restrictions pr
    group by pr.restriction_key
  ),
  feedback_candidates as (
    select
      ts.id as table_session_id,
      ts.table_id,
      ts.table_number,
      coalesce(
        nullif(btrim(ts.guest_name), ''),
        nullif(btrim(customer.full_name), ''),
        'Mesa ' || ts.table_number
      ) as customer_name,
      greatest(ts.guest_count::integer, 1) as guest_count,
      case
        when ts.table_status = 'payment' then 'finishing'
        when exists (
          select 1
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
          left join public.menu_items mi on mi.id = oi.menu_item_id
          where o.table_id = ts.table_id
            and o.status::text not in ('cancelled')
            and coalesce(mi.course, 'main') = 'dessert'
        ) then 'dessert'
        else 'main'
      end as service_stage,
      cf.id as feedback_id,
      cf.sentiment,
      cf.rating,
      cf.note,
      cf.collected_at,
      collector.full_name as collected_by_name
    from active_sessions ts
    left join public.profiles customer on customer.id = coalesce(ts.primary_user_id, ts.customer_id)
    left join public.customer_feedback cf on cf.table_session_id = ts.id
    left join public.profiles collector on collector.id = cf.collected_by
  ),
  visible_special_requests as (
    select
      sr.*,
      t.table_number,
      customer.full_name as customer_name,
      assignee.full_name as assigned_to_name,
      handler.full_name as handled_by_name
    from public.restaurant_special_requests sr
    left join scoped_tables t on t.id = sr.table_id
    left join public.profiles customer on customer.id = sr.customer_id
    left join public.profiles assignee on assignee.id = sr.assigned_to
    left join public.profiles handler on handler.id = sr.handled_by
    where sr.restaurant_id = p_restaurant_id
      and (
        sr.table_id is null
        or t.id is not null
      )
      and (
        sr.status in ('pending', 'acknowledged')
        or (sr.status in ('resolved', 'dismissed') and sr.resolved_at >= now() - interval '12 hours')
      )
  )
  select jsonb_build_object(
    'generated_at', now(),
    'onboarding', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table_id', t.id,
          'table_number', t.table_number,
          'section', t.section,
          'seats', t.seats,
          'status', t.status,
          'guest_name', ts.guest_name,
          'guest_count', coalesce(ts.guest_count, 0),
          'table_session_id', ts.id,
          'qr_code_data', coalesce(qr.qr_code_data, t.qr_code),
          'qr_code_image', qr.qr_code_image
        ) order by t.section nulls last, t.table_number
      )
      from scoped_tables t
      left join active_sessions ts on ts.table_id = t.id
      left join lateral (
        select qc.qr_code_data, qc.qr_code_image
        from public.table_qr_codes qc
        where qc.table_id = t.id
          and qc.restaurant_id = p_restaurant_id
          and qc.is_active
          and (qc.expires_at is null or qc.expires_at > now())
        order by qc.created_at desc
        limit 1
      ) qr on true
      where t.status in ('occupied', 'payment')
        and coalesce(qr.qr_code_data, t.qr_code) is not null
    ), '[]'::jsonb),
    'allergens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', ma.allergen_key,
          'name', ma.allergen_name,
          'item_count', ma.item_count,
          'items', ma.items,
          'affected_customers', coalesce(rg.affected_customers, '[]'::jsonb)
        ) order by ma.allergen_name
      )
      from menu_allergens ma
      left join restriction_groups rg on rg.restriction_key = ma.allergen_key
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(to_jsonb(fc) order by fc.table_number)
      from feedback_candidates fc
    ), '[]'::jsonb),
    'feedback_stats', jsonb_build_object(
      'positive', (select count(*) from feedback_candidates where sentiment = 'positive'),
      'neutral', (select count(*) from feedback_candidates where sentiment = 'neutral'),
      'negative', (select count(*) from feedback_candidates where sentiment = 'negative'),
      'collected', (select count(*) from feedback_candidates where feedback_id is not null),
      'pending', (select count(*) from feedback_candidates where feedback_id is null)
    ),
    'special_requests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sr.id,
          'table_id', sr.table_id,
          'table_number', sr.table_number,
          'table_session_id', sr.table_session_id,
          'reservation_id', sr.reservation_id,
          'customer_id', sr.customer_id,
          'customer_name', sr.customer_name,
          'request_type', sr.request_type,
          'source', sr.source,
          'title', sr.title,
          'description', sr.description,
          'action_label', sr.action_label,
          'priority', sr.priority,
          'status', sr.status,
          'assigned_to', sr.assigned_to,
          'assigned_to_name', sr.assigned_to_name,
          'handled_by', sr.handled_by,
          'handled_by_name', sr.handled_by_name,
          'handled_note', sr.handled_note,
          'due_at', sr.due_at,
          'acknowledged_at', sr.acknowledged_at,
          'resolved_at', sr.resolved_at,
          'metadata', sr.metadata,
          'created_at', sr.created_at,
          'updated_at', sr.updated_at
        ) order by
          case sr.status when 'pending' then 0 when 'acknowledged' then 1 else 2 end,
          sr.priority desc,
          sr.created_at
      )
      from visible_special_requests sr
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- ─── Feedback mutation ───────────────────────────────────────────────────────

create or replace function public.restaurant_collect_customer_feedback(
  p_table_session_id uuid,
  p_sentiment text,
  p_rating smallint default null,
  p_note text default null,
  p_service_stage text default 'finishing'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_customer_id uuid;
  v_customer_name text;
  v_feedback public.customer_feedback%rowtype;
begin
  if p_sentiment not in ('positive', 'neutral', 'negative') then
    raise exception 'Invalid sentiment: %', p_sentiment using errcode = '22023';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_service_stage not in ('main', 'dessert', 'finishing', 'other') then
    raise exception 'Invalid service stage: %', p_service_stage using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'Feedback note exceeds 2000 characters' using errcode = '22001';
  end if;

  select
    ts.*,
    t.assigned_waiter_id,
    t.table_number
  into v_session
  from public.table_sessions ts
  join public.tables t on t.id = ts.table_id
  where ts.id = p_table_session_id;

  if v_session.id is null then
    raise exception 'Table session not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );

  if not private.has_restaurant_role(
    v_session.restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  ) and v_session.assigned_waiter_id is distinct from v_user_id then
    raise exception 'This table is not assigned to the current waiter' using errcode = '42501';
  end if;

  v_customer_id := coalesce(v_session.primary_user_id, v_session.customer_id);
  select coalesce(
    nullif(btrim(v_session.guest_name), ''),
    nullif(btrim(p.full_name), ''),
    'Mesa ' || v_session.table_number
  )
  into v_customer_name
  from (select 1) seed
  left join public.profiles p on p.id = v_customer_id;

  insert into public.customer_feedback (
    restaurant_id,
    table_id,
    table_session_id,
    customer_id,
    customer_name,
    sentiment,
    rating,
    note,
    service_stage,
    collected_by,
    collected_at
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    v_customer_id,
    v_customer_name,
    p_sentiment,
    p_rating,
    nullif(btrim(p_note), ''),
    p_service_stage,
    v_user_id,
    now()
  )
  on conflict (table_session_id)
  do update set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    sentiment = excluded.sentiment,
    rating = excluded.rating,
    note = excluded.note,
    service_stage = excluded.service_stage,
    collected_by = excluded.collected_by,
    collected_at = now(),
    updated_at = now()
  returning * into v_feedback;

  return to_jsonb(v_feedback);
end;
$$;

-- ─── Special-request mutations ───────────────────────────────────────────────

create or replace function public.create_restaurant_special_request(
  p_restaurant_id uuid,
  p_request_type text,
  p_title text,
  p_description text,
  p_table_id uuid default null,
  p_table_session_id uuid default null,
  p_reservation_id uuid default null,
  p_customer_id uuid default null,
  p_action_label text default null,
  p_priority smallint default 3,
  p_due_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_staff boolean;
  v_allowed boolean := false;
  v_effective_table_id uuid := p_table_id;
  v_effective_customer_id uuid := p_customer_id;
  v_source_table_id uuid;
  v_source_customer_id uuid;
  v_request public.restaurant_special_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_type not in ('birthday', 'accessibility', 'vip', 'dietary', 'courtesy', 'photo', 'other') then
    raise exception 'Invalid request type: %', p_request_type using errcode = '22023';
  end if;
  if p_priority < 1 or p_priority > 5 then
    raise exception 'Priority must be between 1 and 5' using errcode = '22023';
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 160 then
    raise exception 'Title is required and must have at most 160 characters' using errcode = '22023';
  end if;
  if btrim(coalesce(p_description, '')) = '' or char_length(p_description) > 3000 then
    raise exception 'Description is required and must have at most 3000 characters' using errcode = '22023';
  end if;

  v_is_staff := private.has_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );

  if p_table_id is not null and not exists (
    select 1 from public.tables t
    where t.id = p_table_id and t.restaurant_id = p_restaurant_id
  ) then
    raise exception 'Table does not belong to restaurant' using errcode = '23503';
  end if;

  if p_table_session_id is not null then
    select
      ts.table_id,
      coalesce(ts.primary_user_id, ts.customer_id),
      (
        v_is_staff
        or ts.customer_id = v_user_id
        or ts.primary_user_id = v_user_id
        or ts.guest_user_ids @> jsonb_build_array(v_user_id::text)
      )
    into v_source_table_id, v_source_customer_id, v_allowed
    from public.table_sessions ts
    where ts.id = p_table_session_id
      and ts.restaurant_id = p_restaurant_id;

    if v_source_table_id is null then
      raise exception 'Table session does not belong to restaurant' using errcode = '23503';
    end if;
    if p_table_id is not null and p_table_id <> v_source_table_id then
      raise exception 'Table and table session do not match' using errcode = '23503';
    end if;
    v_effective_table_id := v_source_table_id;
    v_effective_customer_id := coalesce(v_effective_customer_id, v_source_customer_id);
  end if;

  if p_reservation_id is not null then
    select
      r.table_id,
      r.customer_id,
      (v_is_staff or r.customer_id = v_user_id)
    into v_source_table_id, v_source_customer_id, v_allowed
    from public.reservations r
    where r.id = p_reservation_id
      and r.restaurant_id = p_restaurant_id;

    if not found then
      raise exception 'Reservation does not belong to restaurant' using errcode = '23503';
    end if;
    if p_table_id is not null and v_source_table_id is not null and p_table_id <> v_source_table_id then
      raise exception 'Table and reservation do not match' using errcode = '23503';
    end if;
    v_effective_table_id := coalesce(v_effective_table_id, v_source_table_id);
    v_effective_customer_id := coalesce(v_effective_customer_id, v_source_customer_id);
  end if;

  v_allowed := v_allowed or v_is_staff;
  if not v_allowed then
    raise exception 'No active table session or reservation authorizes this request' using errcode = '42501';
  end if;

  if v_is_staff and v_effective_customer_id is not null and not exists (
    select 1 from public.orders o
    where o.restaurant_id = p_restaurant_id and o.customer_id = v_effective_customer_id
    union all
    select 1 from public.reservations r
    where r.restaurant_id = p_restaurant_id and r.customer_id = v_effective_customer_id
    union all
    select 1 from public.table_sessions ts
    where ts.restaurant_id = p_restaurant_id
      and (
        ts.customer_id = v_effective_customer_id
        or ts.primary_user_id = v_effective_customer_id
        or ts.guest_user_ids @> jsonb_build_array(v_effective_customer_id::text)
      )
  ) then
    raise exception 'Customer is not associated with this restaurant' using errcode = '23503';
  end if;

  insert into public.restaurant_special_requests (
    restaurant_id,
    table_id,
    table_session_id,
    reservation_id,
    customer_id,
    requested_by,
    request_type,
    source,
    title,
    description,
    action_label,
    priority,
    due_at,
    metadata
  )
  values (
    p_restaurant_id,
    v_effective_table_id,
    p_table_session_id,
    p_reservation_id,
    case when v_is_staff then v_effective_customer_id else v_user_id end,
    v_user_id,
    p_request_type,
    case when v_is_staff then 'staff' else 'customer' end,
    btrim(p_title),
    btrim(p_description),
    nullif(btrim(p_action_label), ''),
    p_priority,
    p_due_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_request;

  return to_jsonb(v_request);
end;
$$;

create or replace function public.restaurant_update_special_request_status(
  p_request_id uuid,
  p_status text,
  p_handled_note text default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request record;
  v_updated public.restaurant_special_requests%rowtype;
begin
  if p_status not in ('acknowledged', 'resolved', 'dismissed') then
    raise exception 'Invalid special request status: %', p_status using errcode = '22023';
  end if;
  if p_handled_note is not null and char_length(p_handled_note) > 2000 then
    raise exception 'Handled note exceeds 2000 characters' using errcode = '22001';
  end if;

  select sr.*, t.assigned_waiter_id
  into v_request
  from public.restaurant_special_requests sr
  left join public.tables t on t.id = sr.table_id
  where sr.id = p_request_id;

  if v_request.id is null then
    raise exception 'Special request not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_request.restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );

  if not private.has_restaurant_role(
    v_request.restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  ) and v_request.table_id is not null
    and v_request.assigned_waiter_id is distinct from v_user_id then
    raise exception 'This request is not assigned to the current waiter' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not private.has_restaurant_role(
    v_request.restaurant_id,
    array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]
  ) then
    raise exception 'Only supervisors can reassign special requests' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.user_roles ur
    where ur.restaurant_id = v_request.restaurant_id
      and ur.user_id = p_assigned_to
      and ur.is_active
    union all
    select 1
    from public.profile_roles pr
    where pr.restaurant_id = v_request.restaurant_id
      and pr.user_id = p_assigned_to
      and pr.is_active
  ) then
    raise exception 'Assigned user is not active in this restaurant' using errcode = '23503';
  end if;

  update public.restaurant_special_requests
  set
    status = p_status,
    assigned_to = coalesce(p_assigned_to, assigned_to, v_user_id),
    handled_by = case when p_status in ('resolved', 'dismissed') then v_user_id else handled_by end,
    handled_note = coalesce(nullif(btrim(p_handled_note), ''), handled_note),
    acknowledged_at = case
      when p_status = 'acknowledged' then coalesce(acknowledged_at, now())
      else acknowledged_at
    end,
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() else resolved_at end,
    updated_at = now()
  where id = p_request_id
    and status in ('pending', 'acknowledged')
  returning * into v_updated;

  if v_updated.id is null then
    select * into v_updated from public.restaurant_special_requests where id = p_request_id;
  end if;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.get_my_restaurant_special_requests(
  p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', sr.id,
      'restaurant_id', sr.restaurant_id,
      'table_id', sr.table_id,
      'table_session_id', sr.table_session_id,
      'reservation_id', sr.reservation_id,
      'request_type', sr.request_type,
      'title', sr.title,
      'description', sr.description,
      'priority', sr.priority,
      'status', sr.status,
      'handled_note', sr.handled_note,
      'due_at', sr.due_at,
      'acknowledged_at', sr.acknowledged_at,
      'resolved_at', sr.resolved_at,
      'created_at', sr.created_at,
      'updated_at', sr.updated_at
    ) order by sr.created_at desc
  ), '[]'::jsonb)
  into result
  from public.restaurant_special_requests sr
  where (sr.customer_id = v_user_id or sr.requested_by = v_user_id)
    and (p_restaurant_id is null or sr.restaurant_id = p_restaurant_id);

  return result;
end;
$$;

revoke all on function public.restaurant_get_customer_assistance_hub(uuid) from public;
revoke all on function public.restaurant_collect_customer_feedback(uuid, text, smallint, text, text) from public;
revoke all on function public.create_restaurant_special_request(uuid, text, text, text, uuid, uuid, uuid, uuid, text, smallint, timestamptz, jsonb) from public;
revoke all on function public.restaurant_update_special_request_status(uuid, text, text, uuid) from public;
revoke all on function public.get_my_restaurant_special_requests(uuid) from public;

grant execute on function public.restaurant_get_customer_assistance_hub(uuid) to authenticated, service_role;
grant execute on function public.restaurant_collect_customer_feedback(uuid, text, smallint, text, text) to authenticated, service_role;
grant execute on function public.create_restaurant_special_request(uuid, text, text, text, uuid, uuid, uuid, uuid, text, smallint, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.restaurant_update_special_request_status(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.get_my_restaurant_special_requests(uuid) to authenticated, service_role;

-- Realtime invalidates the read model after feedback/special-request mutations.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_feedback'
  ) then
    alter publication supabase_realtime add table public.customer_feedback;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurant_special_requests'
  ) then
    alter publication supabase_realtime add table public.restaurant_special_requests;
  end if;
end;
$$;

alter table public.customer_feedback replica identity full;
alter table public.restaurant_special_requests replica identity full;

comment on table public.customer_feedback is
  'Feedback captured by restaurant staff during an active table session.';
comment on table public.restaurant_special_requests is
  'Production queue for customer special requests, courtesies, accessibility and VIP workflows.';
comment on function public.restaurant_get_customer_assistance_hub(uuid) is
  'Tenant-scoped read model for QR onboarding, allergen intelligence, feedback candidates and special requests.';
