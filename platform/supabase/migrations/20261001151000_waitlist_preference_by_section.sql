-- Preferência da fila virtual = setor do mapa de mesas (rodada de validação de 29/09).
--
-- A preferência era um enum fixo ('salao','terraco','qualquer') sem relação com os
-- setores que o restaurante cadastra em tables.section (ex.: Rooftop, Salão Principal,
-- Varanda). Agora a preferência é o NOME do setor — ou 'qualquer'.
--
-- Regras isoladas em funções nomeadas:
--   private.restaurant_sections      → setores existentes do restaurante
--   private.normalize_section_name   → como dois nomes de setor são considerados iguais
--                                      (sem caixa, acento e espaço sobrando)

-- ── 1. Coluna livre em vez de enum ───────────────────────────────────────────
alter table public.waitlist_entries alter column preference drop default;
alter table public.waitlist_entries alter column preference type text using preference::text;
alter table public.waitlist_entries alter column preference set default 'qualquer';
drop type if exists public.waitlist_entries_preference_enum;

-- ── 2. Setores do restaurante ────────────────────────────────────────────────
create or replace function private.normalize_section_name(p_name text)
returns text language sql immutable
set search_path = pg_catalog as $$
  select lower(translate(btrim(coalesce(p_name, '')),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
$$;

-- Grafias diferentes do mesmo setor ("Salão Principal", "salao principal") viram uma opção só;
-- vale a grafia mais usada nas mesas (empate: a primeira em ordem alfabética).
create or replace function private.restaurant_sections(p_restaurant_id uuid)
returns text[] language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(array_agg(section order by section), '{}')
  from (
    select distinct on (name_key) section
    from (
      select private.normalize_section_name(t.section) as name_key, btrim(t.section) as section, count(*) as uses
      from public.tables t
      where t.restaurant_id = p_restaurant_id
        and nullif(btrim(t.section), '') is not null
      group by 1, 2
    ) spellings
    order by name_key, uses desc, section
  ) s
$$;
revoke all on function private.restaurant_sections(uuid) from public, anon, authenticated;
revoke all on function private.normalize_section_name(text) from public, anon, authenticated;

-- O cliente só precisa dos nomes para montar as opções da fila.
create or replace function public.customer_get_waitlist_sections(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.is_active) then
    return '[]'::jsonb;
  end if;
  return to_jsonb(private.restaurant_sections(p_restaurant_id));
end $$;
revoke all on function public.customer_get_waitlist_sections(uuid) from public, anon;
grant execute on function public.customer_get_waitlist_sections(uuid) to authenticated, service_role;

-- ── 3. Entrar na fila valida a preferência contra os setores ─────────────────
-- Última definição: 20260925180520_waitlist_open_hours_and_staff_actions.sql. Igual, mais a
-- resolução da preferência: 'qualquer' ou um setor que o restaurante realmente tem (grava o
-- nome canônico do setor). Qualquer outro valor é recusado, nunca gravado em silêncio.
create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
  v_preference text := coalesce(nullif(btrim(p_preference), ''), 'qualquer');
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

  if lower(v_preference) = 'qualquer' then
    v_preference := 'qualquer';
  else
    select s into v_preference
    from unnest(private.restaurant_sections(p_restaurant_id)) s
    where private.normalize_section_name(s) = private.normalize_section_name(v_preference)
    limit 1;
    if v_preference is null then
      raise exception 'Setor indisponível neste restaurante' using errcode = '22023';
    end if;
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
    p_party_size, v_preference, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

revoke all on function public.customer_join_waitlist(uuid, integer, text, boolean) from public, anon;
grant execute on function public.customer_join_waitlist(uuid, integer, text, boolean) to authenticated, service_role;
