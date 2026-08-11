-- Canonical public.users row per auth user (identity + audit).
-- Runs before okinawa_bigbang_bootstrap so the RLS sweep includes this table.

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email_lower on public.users (lower(email));

insert into public.users (id, email, created_at, updated_at)
select
  id,
  email,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from auth.users
on conflict (id) do update set
  email = excluded.email,
  updated_at = excluded.updated_at;

create or replace function private.sync_auth_user_to_public_users()
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
  return new;
end;
$$;

revoke all on function private.sync_auth_user_to_public_users() from public;
grant execute on function private.sync_auth_user_to_public_users() to postgres, service_role;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email on auth.users
  for each row
  execute function private.sync_auth_user_to_public_users();

comment on table public.users is
  'Application identity mirror of auth.users; kept in sync via private.sync_auth_user_to_public_users.';
