-- F2 / Invariante 8: auditoria operacional transacional.
-- A tabela já guardava eventos de autenticação. As novas colunas são nulas para
-- preservar esse histórico; todo evento de domínio passa pelo helper abaixo.

alter table public.audit_logs
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column if not exists reason text,
  add column if not exists "before" jsonb,
  add column if not exists "after" jsonb;

create index if not exists idx_audit_logs_restaurant_created_at
  on public.audit_logs (restaurant_id, created_at desc)
  where restaurant_id is not null;

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_restaurant_managers_read on public.audit_logs;
create policy audit_logs_restaurant_managers_read
  on public.audit_logs
  for select to authenticated
  using (
    restaurant_id is not null
    and private.has_restaurant_role(
      restaurant_id,
      array['owner', 'manager']::public.user_roles_role_enum[]
    )
  );

create or replace function private.log_audit(
  p_restaurant_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_actor_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required for operational audit' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_action, '')), '') is null then
    raise exception 'action is required for operational audit' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason is required for operational audit' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'actor is required for operational audit' using errcode = '28000';
  end if;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, reason,
    "before", "after", success, metadata, created_at
  ) values (
    p_restaurant_id, p_actor_id, btrim(p_action), nullif(btrim(p_entity_type), ''), p_entity_id,
    btrim(p_reason), p_before, p_after, true,
    jsonb_build_object('audit_kind', 'operational'), now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- O helper só é chamado por RPCs security definer. Não se expõe um endpoint que
-- permita a um cliente fabricar sua própria trilha de auditoria.
revoke all on function private.log_audit(uuid, text, text, uuid, text, jsonb, jsonb, uuid) from public;
grant execute on function private.log_audit(uuid, text, text, uuid, text, jsonb, jsonb, uuid)
  to service_role;
