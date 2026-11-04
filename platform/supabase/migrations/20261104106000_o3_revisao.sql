-- O3: correções da revisão de código.
-- - Decidir reserva vale para qualquer transição, e não só pending -> confirmed/cancelled.
-- - Editar turno só valida o que mudou, e função vazia limpa.
-- - Quem não pode alterar uma função da pessoa não mexe nas outras nem na principal dela.
-- - Tirar uma função apaga a linha; inativar e reativar valem para a pessoa inteira.
-- - Validade do convite vai para os parâmetros NOOWE, e a auditoria do caixa grava centavos.
alter table private.noowe_billing_settings
  add column staff_invite_days integer not null default 7 check (staff_invite_days > 0);

create or replace function private.staff_invite_ttl()
returns interval language sql stable security definer set search_path = private, pg_temp as $$
  select make_interval(days => s.staff_invite_days) from private.noowe_billing_settings s
$$;
revoke all on function private.staff_invite_ttl() from public, anon, authenticated;

create or replace function private.user_roles_grant_guard()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Mudar outra coisa da linha não é conceder função.
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.is_active is not distinct from old.is_active
     and new.user_id is not distinct from old.user_id and new.restaurant_id is not distinct from old.restaurant_id then
    return new;
  end if;
  if tg_op <> 'INSERT' and not private.can_manage_user_role(old.role, old.restaurant_id) then
    raise exception 'Você não pode alterar esta função' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and not private.can_manage_user_role(new.role, new.restaurant_id) then
    raise exception 'Você não pode conceder esta função' using errcode = '42501';
  end if;
  -- Quem não pode alterar uma das funções da pessoa também não mexe nas outras: um Gerente não dá funções ao Dono nem a si mesmo.
  if tg_op <> 'DELETE' and exists (select 1 from public.user_roles o
      where o.user_id = new.user_id and o.restaurant_id = new.restaurant_id and o.is_active and o.id <> new.id
        and not private.can_manage_user_role(o.role, o.restaurant_id)) then
    raise exception 'Você não pode alterar as funções desta pessoa' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.restaurant_set_staff_roles(p_restaurant_id uuid, p_user_id uuid, p_roles text[], p_primary text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_role text; v_cast public.user_roles_role_enum; v_previous text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma função' using errcode = '22023';
  end if;
  if p_primary is null or not p_primary = any(p_roles) then
    raise exception 'A função principal precisa estar entre as funções da pessoa' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  -- Trava a pessoa nesta unidade: duas edições ao mesmo tempo não misturam funções.
  perform 1 from public.user_roles where user_id = p_user_id and restaurant_id = p_restaurant_id for update;
  if p_user_id = auth.uid() and not 'owner' = any(p_roles) and exists (
      select 1 from public.user_roles where user_id = p_user_id and restaurant_id = p_restaurant_id and role = 'owner' and is_active) then
    raise exception 'Cannot remove your own owner role' using errcode = '23514';
  end if;

  if exists (select 1 from public.user_roles o
      where o.user_id = p_user_id and o.restaurant_id = p_restaurant_id and o.is_active
        and not private.can_manage_user_role(o.role, p_restaurant_id)) then
    raise exception 'Você não pode alterar as funções desta pessoa' using errcode = '42501';
  end if;

  v_previous := private.user_primary_role(p_restaurant_id, p_user_id);
  update public.user_roles set is_primary = false
    where user_id = p_user_id and restaurant_id = p_restaurant_id and is_primary;
  -- Tirar uma função apaga a linha: linha inativa é só de quem foi inativado por inteiro, e volta inteira ao reativar.
  delete from public.user_roles
    where user_id = p_user_id and restaurant_id = p_restaurant_id and not role::text = any(p_roles);
  foreach v_role in array p_roles loop
    begin
      v_cast := v_role::public.user_roles_role_enum;
    exception when invalid_text_representation then
      raise exception 'Invalid role: %', v_role using errcode = '22023';
    end;
    insert into public.user_roles(user_id, restaurant_id, role, is_active, is_primary, created_at, updated_at)
    values (p_user_id, p_restaurant_id, v_cast, true, v_role = p_primary, now(), now())
    on conflict (user_id, restaurant_id, role)
    do update set is_active = true, is_primary = excluded.is_primary, updated_at = now();
  end loop;

  if v_previous is distinct from p_primary then
    if not private.can_manage_user_role(p_primary::public.user_roles_role_enum, p_restaurant_id) then
      raise exception 'Você não pode definir esta função como principal' using errcode = '42501';
    end if;
    perform private.log_audit(p_restaurant_id, 'staff_primary_changed', 'user_roles', p_user_id, 'Função principal alterada',
      jsonb_build_object('primary', v_previous), jsonb_build_object('primary', p_primary));
  end if;
  return jsonb_build_object('roles', to_jsonb(private.user_effective_roles(p_restaurant_id, p_user_id)),
    'primary', private.user_primary_role(p_restaurant_id, p_user_id));
end $$;

create or replace function public.restaurant_reactivate_staff(
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role record;
  v_updated record;
begin
  select * into v_role from public.user_roles where id = p_role_id;
  if v_role.id is null then
    raise exception 'Staff role not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_role.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- Inativar vale para a pessoa inteira, então reativar também: linha inativa é só de quem foi inativado.
  update public.user_roles
  set is_active = true, updated_at = now()
  where user_id = v_role.user_id and restaurant_id = v_role.restaurant_id and not is_active;
  select * into v_updated from public.user_roles where id = p_role_id;

  return to_jsonb(v_updated);
end;
$$;

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

  -- Decidir uma reserva e reverter um no-show exigem a permissão, e ficam registrados (ADR-025). Vale para qualquer
  -- caminho: confirmar de outro estado ou tirar do pendente direto para sentada também é decidir.
  if p_status is distinct from v_res.status::text then
    if v_res.status::text = 'no_show' then
      if not private.has_permission(v_res.restaurant_id, 'reservation.waive_no_show') then
        raise exception 'Sua função não permite isentar no-show' using errcode = '42501';
      end if;
      perform private.log_audit(v_res.restaurant_id, 'reservation.no_show_waived', 'reservation', p_reservation_id,
        coalesce(nullif(btrim(p_notes), ''), 'No-show revertido'),
        jsonb_build_object('status', v_res.status), jsonb_build_object('status', p_status));
    elsif v_res.status::text = 'pending' or p_status = 'confirmed' then
      if not private.has_permission(v_res.restaurant_id, 'reservation.approve') then
        raise exception 'Sua função não permite aprovar ou recusar reservas' using errcode = '42501';
      end if;
      perform private.log_audit(v_res.restaurant_id, 'reservation.' || p_status, 'reservation', p_reservation_id,
        coalesce(nullif(btrim(p_notes), ''), case p_status when 'confirmed' then 'Reserva aprovada' else 'Decisão sobre a reserva' end),
        jsonb_build_object('status', v_res.status), jsonb_build_object('status', p_status));
    end if;
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

-- Campo nulo mantém o valor; função e área vazias e p_clear_station limpam. Só o que mudou é validado: a pessoa pode ter
-- perdido a função, e isso não pode impedir de cancelar o turno.
create or replace function public.restaurant_update_shift(
  p_shift_id uuid,
  p_date timestamptz default null,
  p_start_time text default null,
  p_end_time text default null,
  p_role text default null,
  p_status text default null,
  p_notes text default null,
  p_area text default null,
  p_station_id uuid default null,
  p_clear_station boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
  v_updated record;
  v_role text;
  v_area text;
  v_station uuid;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_shift.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if p_status is not null and p_status not in ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;

  v_role := case when p_role = '' then null else coalesce(private.shift_role(p_role), v_shift.role) end;
  v_area := case when p_area is null then v_shift.area else nullif(btrim(p_area), '') end;
  v_station := case when p_clear_station then null else coalesce(p_station_id, v_shift.station_id) end;
  perform private.assert_shift_assignment(v_shift.restaurant_id, v_shift.staff_id,
    case when v_role is distinct from v_shift.role then v_role end,
    case when v_area is distinct from v_shift.area then v_area end,
    case when v_station is distinct from v_shift.station_id then v_station end);

  update public.shifts
  set
    date       = coalesce(p_date, date),
    start_time = coalesce(p_start_time, start_time),
    end_time   = coalesce(p_end_time, end_time),
    role       = v_role,
    area       = v_area,
    station_id = v_station,
    status     = coalesce(p_status, status),
    notes      = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_shift_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

create or replace function private.staff_invite_apply()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.status <> 'accepted' or old.status = 'accepted' then return null; end if;
  -- Quem volta por convite não herda a principal de quando foi inativado.
  update public.user_roles set is_primary = false
    where user_id = new.accepted_by and restaurant_id = new.restaurant_id and is_primary and not is_active;
  insert into public.user_roles(user_id, restaurant_id, role, is_active, is_primary, created_at, updated_at)
  select new.accepted_by, new.restaurant_id, r,  true,
    r = new.primary_role and not exists (select 1 from public.user_roles p
      where p.user_id = new.accepted_by and p.restaurant_id = new.restaurant_id and p.is_primary),
    now(), now()
  from unnest(new.roles) r
  on conflict (user_id, restaurant_id, role) do update set is_active = true, updated_at = now();
  return null;
end $$;

create or replace function public.restaurant_close_cash_register(
  p_session_id uuid,
  p_actual_balance numeric,
  p_closing_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_session record;
  v_updated record;
begin
  select * into v_session
  from public.cash_register_sessions
  where id = p_session_id and status = 'open';

  if v_session.id is null then
    raise exception 'Cash register session not found or already closed' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select full_name into v_profile from public.profiles where id = v_user_id;

  update public.cash_register_sessions
  set
    status = 'closed',
    actual_balance = p_actual_balance,
    difference = p_actual_balance - expected_balance,
    closed_at = now(),
    closed_by = coalesce(v_profile.full_name, v_user_id::text),
    closing_notes = p_closing_notes
  where id = p_session_id
  returning * into v_updated;

  if private.cash_closed_by_receiver(v_session.restaurant_id, v_session.opened_at) then
    perform private.log_audit(v_session.restaurant_id, 'cash.closed_by_receiver', 'cash_register_session', p_session_id,
      'Caixa fechado por quem recebeu dinheiro neste período',
      null, jsonb_build_object('differenceCents', round(coalesce(v_updated.difference, 0) * 100)::bigint));
    -- O Dono que fecha o próprio caixa não precisa ser avisado disso.
    if not private.has_restaurant_role(v_session.restaurant_id, array['owner']::public.user_roles_role_enum[]) then
      perform private.emit_event_safe(v_session.restaurant_id, 'cash.closed_by_receiver', 'cash.closed_by_receiver:' || p_session_id,
        'cash_register_session', p_session_id,
        jsonb_build_object('title', 'Caixa fechado por quem recebeu dinheiro',
          'detail', coalesce(v_profile.full_name, 'Alguém da equipe') || ' lançou dinheiro e fechou este caixa'));
    end if;
  end if;

  return to_jsonb(v_updated);
end;
$$;
