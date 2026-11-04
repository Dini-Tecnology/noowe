-- O3, critério 5 (ADR-025): Recepcionista é o Maître com permissões reduzidas, sem perfil novo. Não aprova nem recusa reserva
-- e não isenta no-show. A redução é por pessoa, porque uma casa pode ter um Maître completo e uma Recepcionista.
-- "Isentar no-show" hoje é reverter o no-show: a taxa está oculta na primeira versão (resposta 10).
create table public.role_permission_overrides (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_roles_role_enum not null,
  permission text not null,
  allowed boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, user_id, role, permission)
);
alter table public.role_permission_overrides enable row level security;
revoke all on public.role_permission_overrides from public, anon, authenticated;
grant select on public.role_permission_overrides to authenticated;
create policy role_permission_overrides_select on public.role_permission_overrides for select to authenticated
  using (user_id = auth.uid() or private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]));

-- Regra provisória (ADR-025): o que cada função pode. Por enquanto, só o que pode ser reduzido.
create or replace function private.role_permission_set(p_role text)
returns text[] language sql immutable as $$
  select case when p_role in ('owner', 'manager', 'maitre')
    then array['reservation.approve', 'reservation.waive_no_show'] else '{}'::text[] end
$$;
revoke all on function private.role_permission_set(text) from public, anon, authenticated;

-- A soma das funções depois das reduções: quem é Recepcionista e Gerente segue podendo, pela função de Gerente.
create or replace function private.user_permissions(p_restaurant uuid, p_user uuid default auth.uid())
returns text[] language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(array_agg(distinct p order by p), '{}')
  from unnest(private.user_effective_roles(p_restaurant, p_user)) r
  cross join lateral unnest(private.role_permission_set(r)) p
  where not exists (select 1 from public.role_permission_overrides o
    where o.restaurant_id = p_restaurant and o.user_id = p_user and o.role::text = r and o.permission = p and not o.allowed)
$$;
revoke all on function private.user_permissions(uuid, uuid) from public, anon, authenticated;

create or replace function private.has_permission(p_restaurant uuid, p_permission text, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select p_permission = any(private.user_permissions(p_restaurant, p_user))
$$;
revoke all on function private.has_permission(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.restaurant_get_my_roles(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return jsonb_build_object('roles', to_jsonb(private.user_effective_roles(p_restaurant_id)),
    'primary', private.user_primary_role(p_restaurant_id),
    'permissions', to_jsonb(private.user_permissions(p_restaurant_id)));
end $$;

-- Dono e Gerente definem. A pessoa precisa ser Maître nesta unidade, e fica registrado.
create or replace function public.restaurant_set_receptionist(p_restaurant_id uuid, p_user_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_was boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if not exists (select 1 from public.user_roles where restaurant_id = p_restaurant_id and user_id = p_user_id and role = 'maitre' and is_active) then
    raise exception 'A pessoa precisa ter a função de Maître' using errcode = '22023';
  end if;
  v_was := exists (select 1 from public.role_permission_overrides
    where restaurant_id = p_restaurant_id and user_id = p_user_id and role = 'maitre' and not allowed);
  if v_was is not distinct from coalesce(p_enabled, false) then
    return jsonb_build_object('userId', p_user_id, 'receptionist', v_was);
  end if;
  delete from public.role_permission_overrides where restaurant_id = p_restaurant_id and user_id = p_user_id and role = 'maitre';
  if p_enabled then
    insert into public.role_permission_overrides(restaurant_id, user_id, role, permission, allowed, granted_by)
    select p_restaurant_id, p_user_id, 'maitre', p, false, auth.uid() from unnest(private.role_permission_set('maitre')) p;
  end if;
  perform private.log_audit(p_restaurant_id, 'staff_receptionist_changed', 'user_roles', p_user_id,
    case when p_enabled then 'Maître passou a Recepcionista' else 'Recepcionista voltou a Maître' end,
    jsonb_build_object('receptionist', v_was), jsonb_build_object('receptionist', p_enabled));
  return jsonb_build_object('userId', p_user_id, 'receptionist', p_enabled);
end $$;
revoke all on function public.restaurant_set_receptionist(uuid, uuid, boolean) from public, anon;
grant execute on function public.restaurant_set_receptionist(uuid, uuid, boolean) to authenticated;

create or replace function public.restaurant_update_reservation_status(
  p_reservation_id uuid,
  p_status text,
  p_table_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_res record;
  v_updated record;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if v_res.id is null then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_res.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if p_status not in ('pending','confirmed','seated','completed','cancelled','no_show') then
    raise exception 'Invalid reservation status: %', p_status using errcode = '22023';
  end if;

  -- Decidir uma reserva e reverter um no-show exigem a permissão, e ficam registrados (ADR-025).
  if v_res.status::text = 'pending' and p_status in ('confirmed', 'cancelled') then
    if not private.has_permission(v_res.restaurant_id, 'reservation.approve') then
      raise exception 'Sua função não permite aprovar ou recusar reservas' using errcode = '42501';
    end if;
    perform private.log_audit(v_res.restaurant_id, 'reservation.' || p_status, 'reservation', p_reservation_id,
      coalesce(nullif(btrim(p_notes), ''), case p_status when 'confirmed' then 'Reserva aprovada' else 'Reserva recusada' end),
      jsonb_build_object('status', v_res.status), jsonb_build_object('status', p_status));
  elsif v_res.status::text = 'no_show' and p_status <> 'no_show' then
    if not private.has_permission(v_res.restaurant_id, 'reservation.waive_no_show') then
      raise exception 'Sua função não permite isentar no-show' using errcode = '42501';
    end if;
    perform private.log_audit(v_res.restaurant_id, 'reservation.no_show_waived', 'reservation', p_reservation_id,
      coalesce(nullif(btrim(p_notes), ''), 'No-show revertido'),
      jsonb_build_object('status', v_res.status), jsonb_build_object('status', p_status));
  end if;

  update public.reservations
  set
    status   = p_status::public.reservations_status_enum,
    table_id = coalesce(p_table_id, table_id),
    notes    = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_reservation_id
  returning * into v_updated;

  -- if seated, mark table as occupied
  if p_status = 'seated' and v_updated.table_id is not null then
    update public.tables
    set status = 'occupied', occupied_since = now(), updated_at = now()
    where id = v_updated.table_id
      and restaurant_id = v_updated.restaurant_id;
  end if;

  return to_jsonb(v_updated);
end;
$$;

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
      'is_primary', ur.is_primary,
      'is_receptionist', ur.role = 'maitre' and exists (select 1 from public.role_permission_overrides o
        where o.restaurant_id = ur.restaurant_id and o.user_id = ur.user_id and o.role = 'maitre' and not o.allowed),
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
      and s.date >= (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date
      and s.date < (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date + 1
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
         and private.counts_as_revenue(o.status::text, o.payment_status::text)) as sales_value,
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
