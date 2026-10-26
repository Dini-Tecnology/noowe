-- G4 / ADR-021 — porta 3: Fila Virtual.
-- Chamado, o cliente tem `queue_call_tolerance_min` para se apresentar (ADR-002). Perdido o prazo: a
-- 1ª falta recua uma posição, a 2ª tira da fila. Expiração preguiçosa (sem pg_cron).

alter table public.waitlist_entries
  add column if not exists present_until timestamptz,
  add column if not exists missed_calls integer not null default 0;

-- Prazo para se apresentar (regra isolada, ADR-021 item 9).
create or replace function private.queue_presentation_deadline(p_restaurant uuid, p_called_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p_called_at + make_interval(mins => coalesce(
    (select c.queue_call_tolerance_min from public.restaurant_model_configs c where c.restaurant_id = p_restaurant), 8))
$$;
revoke all on function private.queue_presentation_deadline(uuid, timestamptz) from public, anon, authenticated;

create or replace function private.waitlist_set_present_until()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.status::text = 'called' and (tg_op = 'INSERT' or old.status::text is distinct from 'called') then
    new.called_at := coalesce(new.called_at, now());
    new.present_until := private.queue_presentation_deadline(new.restaurant_id, new.called_at);
  elsif new.status::text <> 'called' then
    new.present_until := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_waitlist_present_until on public.waitlist_entries;
create trigger trg_waitlist_present_until before insert or update of status on public.waitlist_entries
  for each row execute function private.waitlist_set_present_until();

create or replace function private.queue_expire_sweep(p_restaurant uuid default null, p_customer uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_count integer := 0; v_entry record; v_next record;
begin
  for v_entry in
    select w.id, w.restaurant_id, w.position, w.missed_calls from public.waitlist_entries w
    where w.status::text = 'called' and w.present_until is not null and w.present_until < now()
      and (p_restaurant is null or w.restaurant_id = p_restaurant)
      and (p_customer is null or w.customer_id = p_customer)
    for update skip locked
  loop
    if v_entry.missed_calls = 0 then
      -- 1ª falta: volta a esperar uma posição abaixo.
      select o.id, o.position into v_next from public.waitlist_entries o
        where o.restaurant_id = v_entry.restaurant_id and o.status::text = 'waiting'
          and coalesce(o.position, 0) >= coalesce(v_entry.position, 0)
        order by o.position, o.created_at limit 1 for update;
      update public.waitlist_entries
        set status = 'waiting', called_at = null, present_until = null, missed_calls = 1,
            position = coalesce(v_next.position, v_entry.position) + case when v_next.id is null then 0 else 1 end,
            updated_at = now()
        where id = v_entry.id;
      if v_next.id is not null then
        update public.waitlist_entries set position = v_entry.position, updated_at = now() where id = v_next.id;
      end if;
    else
      -- 2ª falta: sai da fila.
      update public.waitlist_entries
        set status = 'no_show', no_show_at = now(), present_until = null, updated_at = now()
        where id = v_entry.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.queue_expire_sweep(uuid, uuid) from public, anon, authenticated;

create or replace function public.customer_my_waitlist()
returns setof public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform private.queue_expire_sweep(null, auth.uid());
  for v_entry in
    select * from public.waitlist_entries
    where customer_id = auth.uid()
    order by created_at desc
  loop
    if v_entry.status = 'waiting' then
      select count(*) + 1 into v_entry.position
      from public.waitlist_entries o
      where o.restaurant_id = v_entry.restaurant_id
        and o.status = 'waiting'
        and o.id <> v_entry.id
        and (coalesce(o.position, 0), o.created_at) < (coalesce(v_entry.position, 0), v_entry.created_at);
    end if;
    return next v_entry;
  end loop;
end $$;
