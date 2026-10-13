-- ADR-018: trocar a mesa de uma sessão, juntar e separar mesas, atribuir mesa a uma reserva.
-- Os "workers" privados assumem o lock do salão (exclusivo) e o papel já verificados; os wrappers
-- públicos fazem as duas coisas na ordem do protocolo (lock_floor → papel → worker).
-- Toda ação grava audit_log na mesma transação (invariante 8). Erros: P0013 mesa unida a outra ·
-- P0014 destino indisponível · P0015 não cabe.

create or replace function private.move_table_session(
  p_session_id uuid, p_target_table_id uuid, p_reason text, p_note text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_src public.tables; v_tgt public.tables;
  v_enforce boolean; v_headcount integer; v_effective integer; v_user uuid;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session.id is null or v_session.status <> 'active' then
    raise exception 'A sessão da mesa não está ativa' using errcode = 'P0014';
  end if;
  perform 1 from public.tables where id in (v_session.table_id, p_target_table_id) order by id for update;
  select * into v_src from public.tables where id = v_session.table_id;
  select * into v_tgt from public.tables where id = p_target_table_id;

  if v_tgt.id is null or v_tgt.restaurant_id <> v_session.restaurant_id or v_tgt.id = v_src.id then
    raise exception 'Mesa de destino inválida' using errcode = 'P0014';
  end if;
  if v_src.merged_into_id is not null or exists (select 1 from public.tables c where c.merged_into_id = v_src.id) then
    raise exception 'Desfaça a junção antes de trocar a mesa' using errcode = 'P0014';
  end if;
  if v_tgt.merged_into_id is not null or v_tgt.status <> 'available'
     or exists (select 1 from public.table_sessions s where s.table_id = v_tgt.id and s.status = 'active')
     or exists (select 1 from public.reservations r where r.table_id = v_tgt.id and r.status::text = 'confirmed'
                and r.id is distinct from v_session.reservation_id
                and r.reservation_time between now() - interval '2 hours' and now() + interval '6 hours')
     or exists (select 1 from public.capacity_requests q where q.table_id = v_tgt.id and q.status = 'pending'
                and q.table_session_id is distinct from v_session.id) then
    raise exception 'A mesa de destino não está livre' using errcode = 'P0014';
  end if;

  select coalesce(c.enforce_table_capacity, false) into v_enforce
    from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  v_headcount := private.table_session_headcount(v_session.id);
  v_effective := private.table_effective_seats(v_tgt.id);
  if coalesce(v_enforce, false) and v_headcount > v_effective then
    raise exception 'Mesa de destino com % lugares para % pessoas', v_effective, v_headcount using errcode = 'P0015';
  end if;

  update public.table_sessions set table_id = v_tgt.id, previous_table_id = v_src.id,
      last_activity = now(), updated_at = now() where id = v_session.id;
  update public.orders set table_id = v_tgt.id where table_session_id = v_session.id;
  update public.reservations set table_id = v_tgt.id, updated_at = now()
    where id = v_session.reservation_id or (table_id = v_src.id and status::text = 'seated');
  update public.capacity_requests set table_id = v_tgt.id, updated_at = now()
    where table_session_id = v_session.id and status = 'pending';
  update public.service_calls set table_id = v_tgt.id, updated_at = now()
    where table_id = v_src.id and status in ('pending', 'acknowledged');
  if v_session.waitlist_entry_id is not null then
    update public.waitlist_entries set table_number = v_tgt.table_number where id = v_session.waitlist_entry_id;
  end if;
  update public.tables set status = 'cleaning', occupied_since = null, updated_at = now() where id = v_src.id;
  update public.tables set status = 'occupied', occupied_since = coalesce(v_src.occupied_since, now()), updated_at = now()
    where id = v_tgt.id;

  perform private.log_audit(v_session.restaurant_id, 'table_session.moved', 'table_session', v_session.id,
    p_reason || coalesce(': ' || nullif(btrim(p_note), ''), ''),
    jsonb_build_object('tableId', v_src.id, 'tableNumber', v_src.table_number),
    jsonb_build_object('tableId', v_tgt.id, 'tableNumber', v_tgt.table_number), auth.uid());

  for v_user in select p.user_id from public.table_session_participants p
      where p.table_session_id = v_session.id and p.user_id is not null loop
    perform private.create_notification(v_user, 'Mesa alterada', 'Sua mesa agora é a ' || v_tgt.table_number,
      'table_moved', v_session.id, 'table_session',
      jsonb_build_object('kind', 'table_moved', 'table_session_id', v_session.id, 'table_id', v_tgt.id,
        'table_number', v_tgt.table_number, 'previous_table_number', v_src.table_number,
        'restaurant_id', v_session.restaurant_id));
  end loop;

  return private.table_session_visit_payload(v_session.id)
    || jsonb_build_object('previousTableNumber', v_src.table_number);
end $$;

create or replace function private.merge_tables(
  p_main uuid, p_children uuid[], p_reason text, p_note text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_main public.tables; v_child public.tables; v_ids uuid[]; v_seats_before integer; v_effective integer;
begin
  if p_children is null or cardinality(p_children) = 0 or p_main = any(p_children)
     or cardinality(p_children) <> (select count(distinct x) from unnest(p_children) x) then
    raise exception 'Escolha uma ou mais mesas diferentes da principal' using errcode = '22023';
  end if;
  v_ids := array_append(p_children, p_main);
  perform 1 from public.tables where id = any(v_ids) order by id for update;
  select * into v_main from public.tables where id = p_main;
  if v_main.id is null or v_main.merged_into_id is not null or v_main.status in ('blocked', 'cleaning', 'payment') then
    raise exception 'A mesa principal não pode receber outras mesas agora' using errcode = 'P0014';
  end if;
  v_seats_before := private.table_effective_seats(p_main);

  for v_child in select * from public.tables where id = any(p_children) order by id loop
    if v_child.restaurant_id <> v_main.restaurant_id or v_child.merged_into_id is not null
       or exists (select 1 from public.tables c where c.merged_into_id = v_child.id)
       or v_child.status <> 'available'
       or exists (select 1 from public.table_sessions s where s.table_id = v_child.id and s.status = 'active')
       or exists (select 1 from public.reservations r where r.table_id = v_child.id and r.status::text = 'confirmed'
                  and r.reservation_time between now() - interval '2 hours' and now() + interval '6 hours')
       or exists (select 1 from public.capacity_requests q where q.table_id = v_child.id and q.status = 'pending') then
      raise exception 'A mesa % não está livre para a junção', v_child.table_number using errcode = 'P0014';
    end if;
  end loop;
  if cardinality(p_children) <> (select count(*) from public.tables where id = any(p_children)) then
    raise exception 'Mesa não encontrada' using errcode = 'P0014';
  end if;

  update public.tables set merged_into_id = p_main, merged_at = now(), status = v_main.status,
      occupied_since = v_main.occupied_since, updated_at = now()
    where id = any(p_children);
  v_effective := private.table_effective_seats(p_main);

  perform private.log_audit(v_main.restaurant_id, 'table.merged', 'table', p_main,
    p_reason || coalesce(': ' || nullif(btrim(p_note), ''), ''),
    jsonb_build_object('effectiveSeats', v_seats_before),
    jsonb_build_object('effectiveSeats', v_effective, 'childTableIds', to_jsonb(p_children)), auth.uid());
  return jsonb_build_object('mainTableId', p_main, 'childTableIds', to_jsonb(p_children), 'effectiveSeats', v_effective);
end $$;

create or replace function private.unmerge_tables(
  p_main uuid, p_children uuid[], p_reason text, p_note text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_main public.tables; v_ids uuid[]; v_remaining integer; v_session uuid; v_enforce boolean;
begin
  select * into v_main from public.tables where id = p_main;
  if v_main.id is null then raise exception 'Mesa não encontrada' using errcode = 'P0014'; end if;
  select coalesce(array_agg(t.id order by t.id), '{}') into v_ids from public.tables t
    where t.merged_into_id = p_main and (p_children is null or t.id = any(p_children));
  if cardinality(v_ids) = 0 or (p_children is not null and cardinality(v_ids) <> cardinality(p_children)) then
    raise exception 'Estas mesas não estão unidas à mesa principal' using errcode = 'P0014';
  end if;
  perform 1 from public.tables where id = any(array_append(v_ids, p_main)) order by id for update;

  select s.id into v_session from public.table_sessions s where s.table_id = p_main and s.status = 'active';
  select coalesce(c.enforce_table_capacity, false) into v_enforce
    from public.restaurant_model_configs c where c.restaurant_id = v_main.restaurant_id;
  if v_session is not null and coalesce(v_enforce, false) then
    select coalesce(sum(t.seats), 0)::integer into v_remaining from public.tables t
      where (t.id = p_main or t.merged_into_id = p_main) and not (t.id = any(v_ids));
    if private.table_session_headcount(v_session) > v_remaining then
      raise exception 'Sem a junção a mesa teria % lugares para % pessoas', v_remaining,
        private.table_session_headcount(v_session) using errcode = 'P0015';
    end if;
  end if;

  update public.tables set merged_into_id = null, merged_at = null,
      status = case when v_main.status = 'occupied' then 'cleaning' else 'available' end,
      occupied_since = null, updated_at = now()
    where id = any(v_ids);
  perform private.log_audit(v_main.restaurant_id, 'table.unmerged', 'table', p_main,
    p_reason || coalesce(': ' || nullif(btrim(p_note), ''), ''),
    jsonb_build_object('childTableIds', to_jsonb(v_ids)), jsonb_build_object('effectiveSeats', private.table_effective_seats(p_main)),
    auth.uid());
  return jsonb_build_object('mainTableId', p_main, 'releasedTableIds', to_jsonb(v_ids));
end $$;

revoke all on function private.move_table_session(uuid, uuid, text, text),
  private.merge_tables(uuid, uuid[], text, text), private.unmerge_tables(uuid, uuid[], text, text)
  from public, anon, authenticated;

-- ── RPCs públicas (lock do salão → papel → worker) ─────────────────────────
create or replace function public.restaurant_move_table_session(
  p_session_id uuid, p_target_table_id uuid, p_note text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select restaurant_id into v_rid from public.table_sessions where id = p_session_id;
  if v_rid is null then raise exception 'Sessão não encontrada' using errcode = 'P0002'; end if;
  perform private.lock_floor(v_rid, true);
  perform private.require_restaurant_role(v_rid, private.table_layout_roles(v_rid));
  return private.move_table_session(p_session_id, p_target_table_id, 'troca_de_mesa', p_note);
end $$;

create or replace function public.restaurant_merge_tables(
  p_main_table_id uuid, p_child_table_ids uuid[], p_note text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select restaurant_id into v_rid from public.tables where id = p_main_table_id;
  if v_rid is null then raise exception 'Mesa não encontrada' using errcode = 'P0002'; end if;
  perform private.lock_floor(v_rid, true);
  perform private.require_restaurant_role(v_rid, private.table_layout_roles(v_rid));
  return private.merge_tables(p_main_table_id, p_child_table_ids, 'juncao_mesas', p_note);
end $$;

create or replace function public.restaurant_unmerge_tables(
  p_main_table_id uuid, p_child_table_ids uuid[] default null, p_note text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select restaurant_id into v_rid from public.tables where id = p_main_table_id;
  if v_rid is null then raise exception 'Mesa não encontrada' using errcode = 'P0002'; end if;
  perform private.lock_floor(v_rid, true);
  perform private.require_restaurant_role(v_rid, private.table_layout_roles(v_rid));
  return private.unmerge_tables(p_main_table_id, p_child_table_ids, 'juncao_desfeita', p_note);
end $$;

-- Mesa da reserva: só mesa principal, e o grupo tem de caber (senão, juntar mesas antes).
create or replace function public.restaurant_assign_reservation_table(
  p_reservation_id uuid, p_table_id uuid, p_note text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_res public.reservations; v_old public.tables; v_new public.tables; v_effective integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_res from public.reservations where id = p_reservation_id;
  if v_res.id is null then raise exception 'Reservation not found' using errcode = 'P0002'; end if;
  perform private.lock_floor(v_res.restaurant_id, true);
  perform private.require_restaurant_role(v_res.restaurant_id, private.table_layout_roles(v_res.restaurant_id));
  if v_res.status::text not in ('pending', 'confirmed') then
    raise exception 'Só reservas pendentes ou confirmadas recebem mesa' using errcode = '22023';
  end if;

  perform 1 from public.tables where id in (p_table_id, coalesce(v_res.table_id, p_table_id)) order by id for update;
  select * into v_new from public.tables where id = p_table_id;
  if v_new.id is null or v_new.restaurant_id <> v_res.restaurant_id or v_new.merged_into_id is not null
     or v_new.status in ('blocked', 'cleaning', 'payment', 'occupied') then
    raise exception 'A mesa escolhida não está disponível para reserva' using errcode = 'P0014';
  end if;
  v_effective := private.table_effective_seats(v_new.id);
  if v_res.party_size > v_effective then
    raise exception 'Mesa com % lugares para % pessoas: junte mesas antes', v_effective, v_res.party_size using errcode = 'P0015';
  end if;

  if v_res.table_id is not null then select * into v_old from public.tables where id = v_res.table_id; end if;
  update public.reservations set table_id = v_new.id, updated_at = now() where id = v_res.id;
  if v_new.status = 'available' then
    update public.tables set status = 'reserved', updated_at = now() where id = v_new.id;
  end if;
  if v_old.id is not null and v_old.id <> v_new.id and v_old.status = 'reserved' and not exists (
      select 1 from public.reservations r where r.table_id = v_old.id and r.id <> v_res.id
        and r.status::text = 'confirmed' and r.reservation_time between now() - interval '2 hours' and now() + interval '6 hours') then
    update public.tables set status = 'available', updated_at = now() where id = v_old.id;
  end if;

  perform private.log_audit(v_res.restaurant_id, 'reservation.table_assigned', 'reservation', v_res.id,
    'mesa_da_reserva' || coalesce(': ' || nullif(btrim(p_note), ''), ''),
    jsonb_build_object('tableId', v_res.table_id), jsonb_build_object('tableId', v_new.id, 'tableNumber', v_new.table_number), auth.uid());
  perform private.create_notification(v_res.customer_id, 'Mesa da reserva', 'Sua reserva ficou na mesa ' || v_new.table_number,
    'table_moved', v_res.id, 'reservation',
    jsonb_build_object('kind', 'reservation_table_assigned', 'reservation_id', v_res.id, 'table_number', v_new.table_number,
      'restaurant_id', v_res.restaurant_id));
  return jsonb_build_object('reservationId', v_res.id, 'tableId', v_new.id, 'tableNumber', v_new.table_number, 'effectiveSeats', v_effective);
end $$;

revoke all on function public.restaurant_move_table_session(uuid, uuid, text), public.restaurant_merge_tables(uuid, uuid[], text),
  public.restaurant_unmerge_tables(uuid, uuid[], text), public.restaurant_assign_reservation_table(uuid, uuid, text)
  from public, anon;
grant execute on function public.restaurant_move_table_session(uuid, uuid, text), public.restaurant_merge_tables(uuid, uuid[], text),
  public.restaurant_unmerge_tables(uuid, uuid[], text), public.restaurant_assign_reservation_table(uuid, uuid, text)
  to authenticated;
