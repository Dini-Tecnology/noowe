-- Manager approvals workflow and the operational staff overview.
-- Uses the pre-existing public.approvals table created by the platform bootstrap.

alter table public.approvals alter column status set default 'pending';
alter table public.approvals alter column amount set default 0;
alter table public.approvals alter column created_at set default now();
alter table public.approvals alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'approvals_status_check'
      and conrelid = 'public.approvals'::regclass
  ) then
    alter table public.approvals
      add constraint approvals_status_check
      check (status in ('pending', 'approved', 'rejected')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'approvals_amount_nonnegative_check'
      and conrelid = 'public.approvals'::regclass
  ) then
    alter table public.approvals
      add constraint approvals_amount_nonnegative_check
      check (amount >= 0) not valid;
  end if;
end;
$$;

create index if not exists idx_approvals_restaurant_status_created
  on public.approvals(restaurant_id, status, created_at desc);

create index if not exists idx_approvals_order
  on public.approvals(order_id)
  where order_id is not null;

create index if not exists idx_shifts_restaurant_staff_date
  on public.shifts(restaurant_id, staff_id, date);

create index if not exists idx_orders_restaurant_waiter_created
  on public.orders(restaurant_id, waiter_id, created_at desc)
  where waiter_id is not null;

create index if not exists idx_tips_restaurant_staff_created
  on public.tips(restaurant_id, staff_id, created_at desc)
  where staff_id is not null;

create or replace function public.restaurant_get_approvals(
  p_restaurant_id uuid,
  p_status text default 'pending'
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
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'restaurant_id', a.restaurant_id,
      'type', a.type,
      'item_name', a.item_name,
      'table_id', a.table_id,
      'table_number', t.table_number,
      'requester_id', a.requester_id,
      'requester_name', coalesce(requester.full_name, requester.email, 'Equipe'),
      'resolver_id', a.resolver_id,
      'resolver_name', coalesce(resolver.full_name, resolver.email),
      'reason', a.reason,
      'resolution_note', a.resolution_note,
      'amount', a.amount,
      'status', a.status,
      'order_id', a.order_id,
      'created_at', a.created_at,
      'updated_at', a.updated_at,
      'resolved_at', a.resolved_at
    ) order by a.created_at asc
  ), '[]'::jsonb)
  into result
  from public.approvals a
  left join public.tables t on t.id = a.table_id and t.restaurant_id = a.restaurant_id
  left join public.profiles requester on requester.id = a.requester_id
  left join public.profiles resolver on resolver.id = a.resolver_id
  where a.restaurant_id = p_restaurant_id
    and (p_status is null or a.status = p_status);

  return result;
end;
$$;

create or replace function public.restaurant_request_approval(
  p_restaurant_id uuid,
  p_type text,
  p_item_name text,
  p_reason text,
  p_amount numeric default 0,
  p_table_id uuid default null,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_type text := lower(trim(coalesce(p_type, '')));
  v_approval public.approvals%rowtype;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','maitre','chef','cook','barman','waiter']::public.user_roles_role_enum[]
  );

  if v_type not in ('cancellation','order_cancellation','discount','refund','courtesy','other') then
    raise exception 'Invalid approval type: %', p_type using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_item_name, '')), '') is null then
    raise exception 'Item name is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;
  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Table does not belong to this restaurant' using errcode = '23503';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders where id = p_order_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Order does not belong to this restaurant' using errcode = '23503';
  end if;
  if p_order_id is not null and exists (
    select 1
    from public.approvals
    where restaurant_id = p_restaurant_id
      and order_id = p_order_id
      and type = v_type
      and status = 'pending'
  ) then
    raise exception 'A pending approval already exists for this order' using errcode = '23505';
  end if;

  insert into public.approvals(
    restaurant_id, type, item_name, table_id, requester_id, reason,
    amount, status, order_id, created_at, updated_at
  ) values (
    p_restaurant_id, v_type, trim(p_item_name), p_table_id, auth.uid(), trim(p_reason),
    coalesce(p_amount, 0), 'pending', p_order_id, now(), now()
  ) returning * into v_approval;

  return to_jsonb(v_approval);
end;
$$;

create or replace function public.restaurant_resolve_approval(
  p_approval_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_approval public.approvals%rowtype;
  v_updated public.approvals%rowtype;
begin
  select * into v_approval
  from public.approvals
  where id = p_approval_id
  for update;

  if v_approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_approval.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_status not in ('approved','rejected') then
    raise exception 'Invalid resolution status: %', p_status using errcode = '22023';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '23514';
  end if;

  if v_status = 'approved' and v_approval.order_id is not null then
    if v_approval.type in ('cancellation', 'order_cancellation') then
      update public.orders
      set status = 'cancelled',
          cancellation_reason = v_approval.reason,
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
    elsif v_approval.type = 'discount' then
      update public.orders
      set discount_amount = greatest(coalesce(discount_amount, 0), v_approval.amount),
          total_amount = greatest(
            coalesce(subtotal, total_amount, 0)
              + coalesce(tax_amount, 0)
              + coalesce(tip_amount, 0)
              - greatest(coalesce(discount_amount, 0), v_approval.amount),
            0
          ),
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
    end if;
  end if;

  update public.approvals
  set status = v_status,
      resolver_id = auth.uid(),
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = now(),
      updated_at = now()
  where id = p_approval_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- Extend the existing staff RPC with the fields required by every team view.
create or replace function public.restaurant_get_staff(
  p_restaurant_id uuid
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
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role_id', ur.id,
      'id', ur.id,
      'user_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'role', ur.role,
      'is_active', ur.is_active,
      'shift', case when current_shift.id is null then null else jsonb_build_object(
        'id', current_shift.id,
        'start_time', current_shift.start_time,
        'end_time', current_shift.end_time,
        'status', current_shift.status
      ) end,
      'sales_value', coalesce(performance.sales_value, 0),
      'tips_value', coalesce(performance.tips_value, 0),
      'operational_status', case
        when not ur.is_active then 'inactive'
        when current_shift.status = 'in_progress' then 'on_shift'
        when current_shift.id is not null then 'scheduled'
        else 'active'
      end,
      'created_at', ur.created_at,
      'updated_at', ur.updated_at
    ) order by ur.is_active desc, ur.role, p.full_name
  ), '[]'::jsonb)
  into result
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join lateral (
    select s.id, s.start_time, s.end_time, s.status
    from public.shifts s
    where s.restaurant_id = p_restaurant_id
      and s.staff_id = ur.user_id
      and s.date >= date_trunc('day', now())
      and s.date < date_trunc('day', now()) + interval '1 day'
      and s.status not in ('cancelled', 'no_show')
    order by case when s.status = 'in_progress' then 0 else 1 end, s.start_time
    limit 1
  ) current_shift on true
  left join lateral (
    select
      (select coalesce(sum(o.total_amount), 0)
       from public.orders o
       where o.restaurant_id = p_restaurant_id
         and o.waiter_id = ur.user_id
         and o.created_at >= date_trunc('day', now())
         and o.created_at < date_trunc('day', now()) + interval '1 day'
         and o.status::text in ('delivered', 'completed')) as sales_value,
      (select coalesce(sum(tp.amount), 0)
       from public.tips tp
       where tp.restaurant_id = p_restaurant_id
         and tp.staff_id = ur.user_id
         and tp.created_at >= date_trunc('day', now())
         and tp.created_at < date_trunc('day', now()) + interval '1 day'
         and tp.status not in ('cancelled', 'refunded')) as tips_value
  ) performance on true
  where ur.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

revoke all on function public.restaurant_get_approvals(uuid, text) from public;
revoke all on function public.restaurant_request_approval(uuid, text, text, text, numeric, uuid, uuid) from public;
revoke all on function public.restaurant_resolve_approval(uuid, text, text) from public;

grant execute on function public.restaurant_get_approvals(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_request_approval(uuid, text, text, text, numeric, uuid, uuid) to authenticated, service_role;
grant execute on function public.restaurant_resolve_approval(uuid, text, text) to authenticated, service_role;

alter table public.approvals enable row level security;

drop policy if exists approvals_management_select on public.approvals;
create policy approvals_management_select on public.approvals
  for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

drop policy if exists approvals_staff_insert on public.approvals;
create policy approvals_staff_insert on public.approvals
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and private.has_restaurant_role(
      restaurant_id,
      array['owner','manager','maitre','chef','cook','barman','waiter']::public.user_roles_role_enum[]
    )
  );

drop policy if exists approvals_management_update on public.approvals;
create policy approvals_management_update on public.approvals
  for update to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]))
  with check (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

comment on function public.restaurant_get_approvals(uuid, text)
  is 'Lists restaurant approval requests with requester, resolver and table context.';
comment on function public.restaurant_request_approval(uuid, text, text, text, numeric, uuid, uuid)
  is 'Creates a pending operational approval request for the authenticated staff member.';
comment on function public.restaurant_resolve_approval(uuid, text, text)
  is 'Atomically approves/rejects a request and applies supported order cancellation or discount effects.';
