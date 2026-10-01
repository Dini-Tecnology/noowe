-- Uma pessoa pode trabalhar em mais de um restaurante.
--
-- O banco já permitia (único índice: user_id + restaurant_id + role) e o RLS é por
-- restaurante; quem barrava era só a tela de equipe, com base em
-- `linked_to_other_restaurant`. Sem essa trava, devolver o NOME do outro
-- restaurante para qualquer dono/gerente que buscasse o e-mail passa a ser
-- vazamento de informação de terceiros — quem trabalha onde é assunto da pessoa
-- e do próprio restaurante. A busca passa a dizer só se a pessoa tem vínculo em
-- outro lugar (works_in_other_restaurant), sem o nome. `linked_to_other_restaurant`
-- continua no JSON, sempre nulo, para não quebrar versões antigas do app (que
-- deixam de bloquear).

create or replace function public.restaurant_find_user_by_email(
  p_restaurant_id uuid,
  p_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_profile record;
  v_existing_here record;
  v_works_elsewhere boolean;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select p.id, p.full_name, p.email, p.avatar_url
  into v_profile
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;

  if v_profile.id is null then
    return null;
  end if;

  select ur.id, ur.role into v_existing_here
  from public.user_roles ur
  where ur.user_id = v_profile.id
    and ur.restaurant_id = p_restaurant_id
    and ur.is_active = true
  limit 1;

  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_profile.id
      and ur.restaurant_id <> p_restaurant_id
      and ur.is_active = true
  ) into v_works_elsewhere;

  return jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'avatar_url', v_profile.avatar_url,
    'already_in_this_restaurant', v_existing_here.id is not null,
    'existing_role', v_existing_here.role,
    'works_in_other_restaurant', v_works_elsewhere,
    'linked_to_other_restaurant', null
  );
end;
$$;

revoke all on function public.restaurant_find_user_by_email(uuid, text) from public;
grant execute on function public.restaurant_find_user_by_email(uuid, text) to authenticated, service_role;
