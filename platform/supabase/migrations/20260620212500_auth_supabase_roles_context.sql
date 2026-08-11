-- Complete Supabase-first auth bootstrap for mobile apps.

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

alter type public.user_roles_role_enum add value if not exists 'cashier';
alter type public.user_roles_role_enum add value if not exists 'host';

alter table public.profiles
  add column if not exists preferences jsonb,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists accepted_terms_version text,
  add column if not exists accepted_privacy_version text;

create table if not exists public.biometric_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  token_hash text not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_user_consents_active
  on public.user_consents (user_id, consent_type, version)
  where revoked_at is null;

create table if not exists private.user_app_metadata_sync_queue (
  user_id uuid primary key,
  queued_at timestamptz not null default now(),
  reason text not null default 'role_changed'
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    phone,
    provider,
    last_login_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    new.phone,
    nullif(new.raw_app_meta_data ->> 'provider', ''),
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    phone = coalesce(public.profiles.phone, excluded.phone),
    provider = coalesce(public.profiles.provider, excluded.provider),
    last_login_at = now(),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
grant execute on function private.handle_new_user() to postgres, service_role;

drop trigger if exists on_auth_user_sync on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update of email, phone, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row
  execute function private.handle_new_user();

create or replace function private.enqueue_user_app_metadata_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user_id uuid;
begin
  target_user_id := coalesce(new.user_id, old.user_id);

  if target_user_id is not null then
    insert into private.user_app_metadata_sync_queue (user_id, queued_at, reason)
    values (target_user_id, now(), tg_op)
    on conflict (user_id) do update set
      queued_at = excluded.queued_at,
      reason = excluded.reason;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.enqueue_user_app_metadata_sync() from public;
grant execute on function private.enqueue_user_app_metadata_sync() to postgres, service_role;

drop trigger if exists user_roles_enqueue_metadata_sync on public.user_roles;
create trigger user_roles_enqueue_metadata_sync
  after insert or update or delete on public.user_roles
  for each row
  execute function private.enqueue_user_app_metadata_sync();

alter table public.biometric_tokens enable row level security;
alter table public.user_consents enable row level security;

grant select, insert, update, delete on public.biometric_tokens to authenticated;
grant select, insert, update, delete on public.user_consents to authenticated;

drop policy if exists biometric_tokens_owner_select on public.biometric_tokens;
drop policy if exists biometric_tokens_owner_insert on public.biometric_tokens;
drop policy if exists biometric_tokens_owner_update on public.biometric_tokens;
drop policy if exists biometric_tokens_owner_delete on public.biometric_tokens;

create policy biometric_tokens_owner_select
on public.biometric_tokens
for select
to authenticated
using (user_id = auth.uid());

create policy biometric_tokens_owner_insert
on public.biometric_tokens
for insert
to authenticated
with check (user_id = auth.uid());

create policy biometric_tokens_owner_update
on public.biometric_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy biometric_tokens_owner_delete
on public.biometric_tokens
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists user_consents_owner_select on public.user_consents;
drop policy if exists user_consents_owner_insert on public.user_consents;
drop policy if exists user_consents_owner_update on public.user_consents;
drop policy if exists user_consents_owner_delete on public.user_consents;

create policy user_consents_owner_select
on public.user_consents
for select
to authenticated
using (user_id = auth.uid());

create policy user_consents_owner_insert
on public.user_consents
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_consents_owner_update
on public.user_consents
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_consents_owner_delete
on public.user_consents
for delete
to authenticated
using (user_id = auth.uid());
