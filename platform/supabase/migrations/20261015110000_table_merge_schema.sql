-- ADR-018: junção e troca de mesas (fatias G2 e C1).
-- Junção de um nível: uma mesa FILHA aponta para a PRINCIPAL (merged_into_id). Sessão, reserva,
-- solicitação e QR operam sempre na principal; a capacidade efetiva é a soma dos lugares do grupo e
-- vem de uma única função (private.table_effective_seats), lida por todas as checagens.
-- Regras provisórias ficam em funções nomeadas (CLAUDE.md): headcount, status da filha ao desfazer,
-- papéis que reorganizam o salão.

alter table public.tables
  add column if not exists merged_into_id uuid references public.tables(id) on delete restrict,
  add column if not exists merged_at timestamptz;
alter table public.tables drop constraint if exists tables_merged_not_self;
alter table public.tables add constraint tables_merged_not_self check (merged_into_id is distinct from id);
create index if not exists idx_tables_merged_into on public.tables (merged_into_id) where merged_into_id is not null;

alter table public.table_sessions
  add column if not exists previous_table_id uuid references public.tables(id) on delete set null;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function private.table_group_root(p_table_id uuid)
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(t.merged_into_id, t.id) from public.tables t where t.id = p_table_id
$$;

create or replace function private.table_group_ids(p_table_id uuid)
returns uuid[] language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(array_agg(t.id order by t.id), '{}'::uuid[]) from public.tables t
  where t.id = private.table_group_root(p_table_id) or t.merged_into_id = private.table_group_root(p_table_id)
$$;

-- Única fonte de capacidade de uma mesa: a soma dos lugares do grupo (a mesa sozinha = seus lugares).
create or replace function private.table_effective_seats(p_table_id uuid)
returns integer language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(sum(t.seats), 0)::integer from public.tables t
  where t.id = private.table_group_root(p_table_id) or t.merged_into_id = private.table_group_root(p_table_id)
$$;

-- PROVISÓRIO: quantas pessoas a mesa tem de acomodar ao trocar/desfazer junção.
create or replace function private.table_session_headcount(p_table_session_id uuid)
returns integer language sql stable security definer
set search_path = public, private, pg_temp as $$
  select greatest(
    private.table_session_occupied_seats(s.id),
    coalesce(s.declared_party_size, 0),
    coalesce(s.guest_count, 0))::integer
  from public.table_sessions s where s.id = p_table_session_id
$$;

-- PROVISÓRIO: status que a mesa filha assume quando a junção termina junto com a sessão.
create or replace function private.merged_child_status_after_close()
returns text language sql immutable as $$ select 'cleaning'::text $$;

-- Quem reorganiza o salão (trocar, juntar, separar): os mesmos papéis que decidem sobre lotação.
create or replace function private.table_layout_roles(p_restaurant_id uuid)
returns public.user_roles_role_enum[] language sql stable security definer
set search_path = public, private, pg_temp as $$
  select private.capacity_decider_roles(p_restaurant_id)
$$;

-- Ordem de trava (evita deadlock): 1) este lock do salão, 2) solicitação, 3) sessão, 4) mesas por id.
-- Reorganizar o salão pede exclusivo; check-in e abertura de sessão pedem compartilhado.
create or replace function private.lock_floor(p_restaurant_id uuid, p_exclusive boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if p_exclusive then
    perform pg_advisory_xact_lock(hashtextextended('noowe.floor:' || p_restaurant_id::text, 0));
  else
    perform pg_advisory_xact_lock_shared(hashtextextended('noowe.floor:' || p_restaurant_id::text, 0));
  end if;
end $$;

revoke all on function private.table_group_root(uuid), private.table_group_ids(uuid),
  private.table_effective_seats(uuid), private.table_session_headcount(uuid),
  private.merged_child_status_after_close(), private.table_layout_roles(uuid),
  private.lock_floor(uuid, boolean) from public, anon, authenticated;

-- ── Guarda de topologia (INVOKER: precisa ver o papel de quem escreve) ──────
-- Staff pode escrever em tables direto (política tables_update_restaurant_staff), então a regra
-- vive no banco: só as RPCs de junção (SECURITY DEFINER, rodando como dono) mexem em merged_into_id.
create or replace function private.tables_topology_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare v_parent public.tables;
begin
  if tg_op = 'DELETE' then
    if current_user in ('authenticated', 'anon')
       and (old.merged_into_id is not null or exists (select 1 from public.tables c where c.merged_into_id = old.id)) then
      raise exception 'Desfaça a junção antes de remover a mesa' using errcode = 'P0013';
    end if;
    return old;
  end if;

  if new.merged_into_id is not null then
    select * into v_parent from public.tables where id = new.merged_into_id;
    if v_parent.id is null or v_parent.restaurant_id <> new.restaurant_id then
      raise exception 'A mesa principal precisa ser do mesmo restaurante' using errcode = 'P0014';
    end if;
    if v_parent.merged_into_id is not null or exists (select 1 from public.tables c where c.merged_into_id = new.id) then
      raise exception 'Junção de um nível só: a mesa principal não pode ser filha de outra' using errcode = 'P0014';
    end if;
    if current_user in ('authenticated', 'anon')
       and (tg_op = 'INSERT' or old.merged_into_id is distinct from new.merged_into_id) then
      raise exception 'A junção de mesas só é feita pelas funções da recepção' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' and old.merged_into_id is not null and current_user in ('authenticated', 'anon') then
    raise exception 'A junção de mesas só é desfeita pelas funções da recepção' using errcode = '42501';
  end if;

  -- Mesa filha: o status acompanha a principal e não muda à mão.
  if tg_op = 'UPDATE' and new.merged_into_id is not null and old.merged_into_id is not null
     and new.status is distinct from old.status and current_user in ('authenticated', 'anon') then
    raise exception 'Esta mesa está unida a outra: mude o status da mesa principal' using errcode = 'P0013';
  end if;
  return new;
end $$;
drop trigger if exists trg_tables_topology_guard on public.tables;
create trigger trg_tables_topology_guard before insert or update of merged_into_id, status, restaurant_id or delete
  on public.tables for each row execute function private.tables_topology_guard();

-- A principal muda de status → as filhas acompanham; se ela volta a livre sem sessão, a junção termina.
create or replace function private.tables_mirror_children()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.status in ('available', 'cleaning')
     and not exists (select 1 from public.table_sessions s where s.table_id = new.id and s.status = 'active') then
    update public.tables set merged_into_id = null, merged_at = null, status = new.status, updated_at = now()
      where merged_into_id = new.id;
  else
    update public.tables set status = new.status, occupied_since = new.occupied_since, updated_at = now()
      where merged_into_id = new.id and (status is distinct from new.status or occupied_since is distinct from new.occupied_since);
  end if;
  return new;
end $$;
drop trigger if exists trg_tables_mirror_children on public.tables;
create trigger trg_tables_mirror_children after update of status on public.tables
  for each row when (new.merged_into_id is null and old.status is distinct from new.status)
  execute function private.tables_mirror_children();

-- Sessão ativa só na mesa principal (rede de segurança, como o índice de uma sessão por mesa).
create or replace function private.table_sessions_root_only()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.tables t where t.id = new.table_id and t.merged_into_id is not null) then
    raise exception 'Mesa unida a outra: abra a sessão na mesa principal' using errcode = 'P0013';
  end if;
  return new;
end $$;
drop trigger if exists trg_table_sessions_root_only on public.table_sessions;
create trigger trg_table_sessions_root_only before insert or update of table_id, status on public.table_sessions
  for each row when (new.status = 'active') execute function private.table_sessions_root_only();

-- A sessão da principal termina → a junção termina com ela (pagar, fechar, sair, abandonar).
create or replace function private.table_sessions_release_merge()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_released integer;
begin
  update public.tables set merged_into_id = null, merged_at = null,
      status = private.merged_child_status_after_close(), updated_at = now()
    where merged_into_id = new.table_id;
  get diagnostics v_released = row_count;
  -- log_audit exige um ator; encerramentos automáticos (sem usuário) são consequência, não decisão.
  if v_released > 0 and auth.uid() is not null then
    perform private.log_audit(new.restaurant_id, 'table.unmerged', 'table', new.table_id,
      'sessao_encerrada', null, jsonb_build_object('released', v_released), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_table_sessions_release_merge on public.table_sessions;
create trigger trg_table_sessions_release_merge after update of status on public.table_sessions
  for each row when (old.status = 'active' and new.status is distinct from 'active')
  execute function private.table_sessions_release_merge();

revoke all on function private.tables_topology_guard(), private.tables_mirror_children(),
  private.table_sessions_root_only(), private.table_sessions_release_merge() from public, anon, authenticated;
