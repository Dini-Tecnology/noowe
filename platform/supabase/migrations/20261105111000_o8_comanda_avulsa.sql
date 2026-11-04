-- O8: a mesa da comanda avulsa existe só enquanto a comanda está aberta. Terminou, a comanda volta para a mesa de origem, e a avulsa some.
alter table public.table_sessions add column standalone_origin_table_id uuid references public.tables(id) on delete set null;

drop trigger zz_retire_standalone_table on public.table_sessions;
drop function private.retire_standalone_table();

create or replace function private.standalone_back_to_origin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'active' and old.status = 'active' and new.standalone_origin_table_id is not null then
    new.table_id := new.standalone_origin_table_id;
    new.standalone_origin_table_id := null;
  end if;
  return new;
end $$;
revoke all on function private.standalone_back_to_origin() from public, anon, authenticated;
create trigger table_sessions_standalone_back before update of status on public.table_sessions
  for each row execute function private.standalone_back_to_origin();

create or replace function private.standalone_remove_table()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.standalone_origin_table_id is not null and new.standalone_origin_table_id is null and old.table_id <> new.table_id then
    update public.orders set table_id = new.table_id where table_id = old.table_id;
    begin
      delete from public.tables where id = old.table_id and is_standalone;
    exception when others then
      -- Alguma referência antiga impede apagar: fica fora de serviço, sem atrapalhar o fechamento.
      update public.tables set status = 'available', notes = 'Comanda avulsa encerrada', updated_at = now() where id = old.table_id;
    end;
  end if;
  return new;
end $$;
revoke all on function private.standalone_remove_table() from public, anon, authenticated;
create trigger zz_table_sessions_standalone_remove after update of status on public.table_sessions
  for each row execute function private.standalone_remove_table();

-- Os pagamentos feitos continuam valendo: só a diferença fica em aberto. Mesa ocupada: comanda avulsa, com mesa própria.
create or replace function private.reopen_paid_session(p_session uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; v_table uuid; v_origin uuid;
begin
  select * into s from public.table_sessions where id = p_session for update;
  perform private.assert_session_reopenable(s);
  v_table := s.table_id;
  if exists (select 1 from public.table_sessions x where x.table_id = s.table_id and x.status = 'active') then
    insert into public.tables(restaurant_id, table_number, seats, status, is_standalone, qr_code, created_at, updated_at)
      values (s.restaurant_id, 'Avulsa ' || left(s.id::text, 4), 1, 'occupied', true, 'avulsa-' || s.id, now(), now())
      returning id into v_table;
    v_origin := s.table_id;
  else
    update public.tables set status = 'occupied', occupied_since = now(), updated_at = now() where id = s.table_id;
  end if;
  update public.table_sessions set status = 'active', table_id = v_table, standalone_origin_table_id = v_origin, ended_at = null, billing_status = 'open',
      reopened_count = reopened_count + 1, reopened_at = now(), updated_at = now() where id = p_session;
  perform private.log_system_audit(s.restaurant_id, 'bill.reopened_paid', 'table_session', p_session, p_reason,
    jsonb_build_object('status', s.status, 'tableId', s.table_id), jsonb_build_object('status', 'active', 'tableId', v_table));
end $$;
