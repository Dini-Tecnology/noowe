-- Fila virtual: só aceita entrada com o restaurante aberto + ações do maitre.
--
-- 1. customer_join_waitlist aceitava entrada com o restaurante fechado. A
--    regra "está aberto agora" é a mesma do "Status Agora" da página do
--    restaurante (private.restaurant_live_status → isOpen, horário de
--    America/Sao_Paulo, inclusive turnos que viram a meia-noite) e fica
--    isolada em private.restaurant_is_open_now.
--
-- 2. restaurant_get_waitlist falhava sempre: filtrava por status 'notified',
--    valor que não existe em waitlist_entries_status_enum ("invalid input
--    value for enum"). O painel nunca conseguia listar a fila.
--
-- 3. O painel não tinha como chamar o próximo grupo (spec §4.4, fatia E2).
--    restaurant_update_waitlist_entry faz as transições do maitre:
--      call    : waiting          → called   (called_at)
--      seat    : waiting | called → seated   (seated_at)
--      no_show : called           → no_show  (no_show_at)
--    A mudança de status dispara trg_customer_waitlist_notification, que
--    grava a notificação (e o push) do cliente.

create or replace function private.restaurant_is_open_now(p_restaurant_id uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select coalesce((private.restaurant_live_status(p_restaurant_id)->>'isOpen')::boolean, false)
$$;

create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'virtualQueue')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'waitlist')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyArrival')::boolean, true)
  ) then raise exception 'Waitlist is unavailable for this restaurant' using errcode = 'P0001'; end if;
  if not private.restaurant_is_open_now(p_restaurant_id) then
    raise exception 'Restaurant is closed' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid()
      and restaurant_id = p_restaurant_id and status in ('waiting', 'called'))
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, p_preference::public.waitlist_entries_preference_enum, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.restaurant_get_waitlist(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', we.id,
      'customer_name', we.customer_name,
      'customer_phone', we.customer_phone,
      'party_size', we.party_size,
      'preference', we.preference,
      'has_kids', we.has_kids,
      'status', we.status,
      'position', we.position,
      'estimated_wait_minutes', we.estimated_wait_minutes,
      'called_at', we.called_at,
      'created_at', we.created_at,
      'customer', case when we.customer_id is not null then jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', p.email
      ) else null end
    ) order by (we.status = 'called') desc, we.position asc nulls last, we.created_at asc
  ), '[]'::jsonb)
  into result
  from public.waitlist_entries we
  left join public.profiles p on p.id = we.customer_id
  where we.restaurant_id = p_restaurant_id
    and we.status in ('waiting', 'called');

  return result;
end;
$$;

create or replace function public.restaurant_update_waitlist_entry(p_entry_id uuid, p_action text)
returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  if p_action not in ('call', 'seat', 'no_show') then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  select * into v_entry from public.waitlist_entries where id = p_entry_id for update;
  if v_entry.id is null then raise exception 'Waitlist entry not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(
    v_entry.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if p_action = 'call' and v_entry.status = 'waiting' then
    update public.waitlist_entries set status = 'called', called_at = now(), updated_at = now()
      where id = p_entry_id returning * into v_entry;
  elsif p_action = 'seat' and v_entry.status in ('waiting', 'called') then
    update public.waitlist_entries set status = 'seated', seated_at = now(), updated_at = now()
      where id = p_entry_id returning * into v_entry;
  elsif p_action = 'no_show' and v_entry.status = 'called' then
    update public.waitlist_entries set status = 'no_show', no_show_at = now(), updated_at = now()
      where id = p_entry_id returning * into v_entry;
  else
    raise exception 'Waitlist entry cannot be updated' using errcode = 'P0001';
  end if;
  return v_entry;
end $$;

revoke all on function private.restaurant_is_open_now(uuid) from public;
revoke all on function public.restaurant_update_waitlist_entry(uuid, text) from public;
grant execute on function public.restaurant_update_waitlist_entry(uuid, text) to authenticated;
