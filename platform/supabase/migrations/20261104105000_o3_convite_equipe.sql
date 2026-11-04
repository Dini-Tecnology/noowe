-- O3, critério 6 (ADR-025): novo membro entra por convite, por e-mail ou link, sem senha provisória.
-- Convite com e-mail só vale para quem confirmou esse e-mail. Sem e-mail, o código funciona como senha de uso único.
-- Do código só guardamos o hash. Dono nunca entra por convite (ADR-015): segue vinculado a uma conta que já existe.
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text check (email = lower(btrim(email))),
  roles public.user_roles_role_enum[] not null check (cardinality(roles) > 0 and not 'owner' = any(roles)),
  primary_role public.user_roles_role_enum not null check (primary_role = any(roles)),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index staff_invites_one_pending_email on public.staff_invites(restaurant_id, email) where status = 'pending' and email is not null;
create index staff_invites_email_idx on public.staff_invites(email) where status = 'pending';
-- Só as funções abaixo leem e escrevem: o hash do código não sai daqui.
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from public, anon, authenticated;

-- Regra provisória (ADR-025): quanto tempo o convite vale.
create or replace function private.staff_invite_ttl()
returns interval language sql immutable as $$ select interval '7 days' $$;
revoke all on function private.staff_invite_ttl() from public, anon, authenticated;

create or replace function private.staff_invite_hash(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(lower(btrim(p_code)), 'UTF8')), 'hex')
$$;
revoke all on function private.staff_invite_hash(text) from public, anon, authenticated;

-- Quem convidou ainda pode conceder? Pode ter perdido a função desde o convite.
create or replace function private.staff_invite_inviter_can_grant(p_invite public.staff_invites)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select case
    when 'owner' = any(private.user_effective_roles(p_invite.restaurant_id, p_invite.invited_by)) then true
    when 'manager' = any(p_invite.roles) then false
    else 'manager' = any(private.user_effective_roles(p_invite.restaurant_id, p_invite.invited_by))
  end
$$;
revoke all on function private.staff_invite_inviter_can_grant(public.staff_invites) from public, anon, authenticated;

-- Em gatilho porque quem aceita ainda não tem função para conceder nada: o guarda de funções só olha a escrita direta.
-- O convite já foi validado por quem pode, e a tabela não aceita escrita de fora.
create or replace function private.staff_invite_apply()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.status <> 'accepted' or old.status = 'accepted' then return null; end if;
  insert into public.user_roles(user_id, restaurant_id, role, is_active, is_primary, created_at, updated_at)
  select new.accepted_by, new.restaurant_id, r,  true,
    r = new.primary_role and not exists (select 1 from public.user_roles p
      where p.user_id = new.accepted_by and p.restaurant_id = new.restaurant_id and p.is_primary),
    now(), now()
  from unnest(new.roles) r
  on conflict (user_id, restaurant_id, role) do update set is_active = true, updated_at = now();
  return null;
end $$;
revoke all on function private.staff_invite_apply() from public, anon, authenticated;
create trigger staff_invite_apply after update of status on public.staff_invites
  for each row execute function private.staff_invite_apply();

create or replace function public.restaurant_create_staff_invite(p_restaurant_id uuid, p_email text, p_roles text[], p_primary text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_code text := encode(extensions.gen_random_bytes(16), 'hex'); v_email text := nullif(lower(btrim(p_email)), '');
  v_roles public.user_roles_role_enum[]; v_role public.user_roles_role_enum; v_invite public.staff_invites;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if coalesce(array_length(p_roles, 1), 0) = 0 or p_primary is null or not p_primary = any(p_roles) then
    raise exception 'Escolha as funções e a principal' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  begin
    v_roles := p_roles::public.user_roles_role_enum[];
  exception when invalid_text_representation then
    raise exception 'Função inválida' using errcode = '22023';
  end;
  if 'owner' = any(v_roles) then
    raise exception 'Dono não entra por convite: vincule uma conta que já existe' using errcode = '22023';
  end if;
  foreach v_role in array v_roles loop
    if not private.can_manage_user_role(v_role, p_restaurant_id) then
      raise exception 'Você não pode conceder esta função' using errcode = '42501';
    end if;
  end loop;
  -- Um convite aberto por e-mail: o novo substitui o anterior, e o código antigo deixa de valer.
  update public.staff_invites set status = 'revoked' where restaurant_id = p_restaurant_id and email = v_email and status = 'pending';
  insert into public.staff_invites(restaurant_id, email, roles, primary_role, token_hash, invited_by, expires_at)
  values (p_restaurant_id, v_email, v_roles, p_primary::public.user_roles_role_enum, private.staff_invite_hash(v_code), auth.uid(), now() + private.staff_invite_ttl())
  returning * into v_invite;
  perform private.log_audit(p_restaurant_id, 'staff_invite_created', 'staff_invites', v_invite.id, 'Convite de equipe criado', null,
    jsonb_build_object('email', v_email, 'roles', to_jsonb(p_roles), 'primary', p_primary, 'expiresAt', v_invite.expires_at));
  return jsonb_build_object('id', v_invite.id, 'code', v_code, 'email', v_email, 'expiresAt', v_invite.expires_at,
    'restaurantName', (select name from public.restaurants where id = p_restaurant_id));
end $$;
revoke all on function public.restaurant_create_staff_invite(uuid, text, text[], text) from public, anon;
grant execute on function public.restaurant_create_staff_invite(uuid, text, text[], text) to authenticated;

create or replace function public.restaurant_list_staff_invites(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'roles', to_jsonb(i.roles), 'primaryRole', i.primary_role,
      'expiresAt', i.expires_at) order by i.created_at desc), '[]'::jsonb)
    from public.staff_invites i where i.restaurant_id = p_restaurant_id and i.status = 'pending' and i.expires_at > now());
end $$;
revoke all on function public.restaurant_list_staff_invites(uuid) from public, anon;
grant execute on function public.restaurant_list_staff_invites(uuid) to authenticated;

create or replace function public.restaurant_revoke_staff_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_invite public.staff_invites; v_role public.user_roles_role_enum;
begin
  select * into v_invite from public.staff_invites where id = p_invite_id for update;
  if v_invite.id is null then raise exception 'Convite não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_invite.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  foreach v_role in array v_invite.roles loop
    if not private.can_manage_user_role(v_role, v_invite.restaurant_id) then
      raise exception 'Você não pode alterar este convite' using errcode = '42501';
    end if;
  end loop;
  if v_invite.status <> 'pending' then return jsonb_build_object('id', p_invite_id, 'revoked', false); end if;
  update public.staff_invites set status = 'revoked' where id = p_invite_id;
  perform private.log_audit(v_invite.restaurant_id, 'staff_invite_revoked', 'staff_invites', p_invite_id, 'Convite de equipe cancelado',
    jsonb_build_object('email', v_invite.email), null);
  return jsonb_build_object('id', p_invite_id, 'revoked', true);
end $$;
revoke all on function public.restaurant_revoke_staff_invite(uuid) from public, anon;
grant execute on function public.restaurant_revoke_staff_invite(uuid) to authenticated;

create or replace function private.staff_invite_accept(p_invite public.staff_invites)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update public.staff_invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_invite.id;
  perform private.log_audit(p_invite.restaurant_id, 'staff_invite_accepted', 'staff_invites', p_invite.id, 'Convite de equipe aceito', null,
    jsonb_build_object('userId', auth.uid(), 'roles', to_jsonb(p_invite.roles), 'invitedBy', p_invite.invited_by));
end $$;
revoke all on function private.staff_invite_accept(public.staff_invites) from public, anon, authenticated;

create or replace function public.staff_accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_invite public.staff_invites; v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_invite from public.staff_invites where token_hash = private.staff_invite_hash(p_code) for update;
  if v_invite.id is null or v_invite.status = 'revoked' then
    raise exception 'Convite não encontrado ou cancelado' using errcode = 'P0002';
  end if;
  if v_invite.status = 'accepted' then
    if v_invite.accepted_by = auth.uid() then return jsonb_build_object('restaurantId', v_invite.restaurant_id, 'alreadyAccepted', true); end if;
    raise exception 'Este convite já foi usado' using errcode = '23514';
  end if;
  if v_invite.expires_at <= now() then raise exception 'Este convite expirou' using errcode = '23514'; end if;
  if v_invite.email is not null then
    select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
    if v_email is distinct from v_invite.email then
      raise exception 'Este convite é para outro e-mail' using errcode = '42501';
    end if;
  end if;
  if not private.staff_invite_inviter_can_grant(v_invite) then
    raise exception 'Este convite não vale mais: peça um novo' using errcode = '23514';
  end if;
  perform private.staff_invite_accept(v_invite);
  return jsonb_build_object('restaurantId', v_invite.restaurant_id, 'alreadyAccepted', false);
end $$;
revoke all on function public.staff_accept_invite(text) from public, anon;
grant execute on function public.staff_accept_invite(text) to authenticated;

-- Quem se cadastra com o e-mail convidado entra sem digitar nada: o e-mail confirmado é a prova.
create or replace function public.staff_claim_my_invites()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_email text; v_invite public.staff_invites; v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  for v_invite in select * from public.staff_invites
      where email = v_email and status = 'pending' and expires_at > now() for update skip locked loop
    if private.staff_invite_inviter_can_grant(v_invite) then
      perform private.staff_invite_accept(v_invite);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.staff_claim_my_invites() from public, anon;
grant execute on function public.staff_claim_my_invites() to authenticated;
