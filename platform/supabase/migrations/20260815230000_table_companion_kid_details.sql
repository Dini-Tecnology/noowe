-- Modo Família's "Quem são as crianças?" needs real age/allergy data per
-- companion (Sofia · 5 anos · Alergias: Nenhuma), not a hardcoded placeholder.

alter table public.table_session_participants add column if not exists kid_age smallint
  check (kid_age is null or kid_age between 0 and 17);
alter table public.table_session_participants add column if not exists kid_allergies text
  check (kid_allergies is null or char_length(kid_allergies) <= 200);

-- Adding two parameters changes the signature, so Postgres would otherwise
-- keep the old 3-arg version around as a second overload — drop it first.
drop function if exists public.customer_add_table_companion(uuid, text, boolean);

create or replace function public.customer_add_table_companion(
  p_table_session_id uuid, p_name text, p_is_kid boolean default false,
  p_kid_age smallint default null, p_kid_allergies text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_allergies text := nullif(trim(coalesce(p_kid_allergies, '')), '');
  v_diner public.table_session_participants;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if v_name is null then raise exception 'Informe o nome da pessoa' using errcode = '22023'; end if;
  if length(v_name) > 40 then raise exception 'Nome muito longo' using errcode = '22023'; end if;
  if p_kid_age is not null and (p_kid_age < 0 or p_kid_age > 17) then
    raise exception 'Idade inválida' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.table_sessions s
    where s.id = p_table_session_id and s.status = 'active'
  ) then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.table_session_participants
    where table_session_id = p_table_session_id;
  if v_count >= 20 then raise exception 'Limite de pessoas na mesa atingido' using errcode = 'P0001'; end if;

  insert into public.table_session_participants(
    table_session_id, user_id, display_name, is_host, is_kid, added_by, kid_age, kid_allergies
  ) values (
    p_table_session_id, null, v_name, false, coalesce(p_is_kid, false), auth.uid(),
    case when p_is_kid then p_kid_age else null end,
    case when p_is_kid then v_allergies else null end
  )
  returning * into v_diner;

  update public.table_sessions
  set guest_count = greatest(guest_count, v_count + 1), last_activity = now(), updated_at = now()
  where id = p_table_session_id;

  return jsonb_build_object(
    'id', v_diner.id, 'userId', null, 'displayName', v_diner.display_name,
    'isHost', false, 'isKid', v_diner.is_kid, 'isMe', false, 'isCompanion', true,
    'kidAge', v_diner.kid_age, 'kidAllergies', v_diner.kid_allergies
  );
end $$;

create or replace function public.customer_list_table_diners(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'userId', p.user_id,
    'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host,
    'isKid', p.is_kid,
    'isMe', p.user_id is not null and p.user_id = auth.uid(),
    'isCompanion', p.user_id is null,
    'kidAge', p.kid_age,
    'kidAllergies', p.kid_allergies
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb)
  into v_result
  from public.table_session_participants p
  where p.table_session_id = p_table_session_id;

  return v_result;
end $$;

revoke all on function public.customer_add_table_companion(uuid, text, boolean, smallint, text) from public;
grant execute on function public.customer_add_table_companion(uuid, text, boolean, smallint, text) to authenticated;
grant execute on function public.customer_list_table_diners(uuid) to authenticated;
