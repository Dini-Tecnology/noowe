-- `customer_reservation_availability` passa a devolver também `capacity`
-- (soma de `tables.seats` do restaurante). Sem ela, o app não distinguia
-- "restaurante sem nenhuma mesa cadastrada" de "lotado neste horário" — os dois
-- chegavam como `remaining = 0` e o cliente via "Tente outro dia ou reduza o
-- grupo" em todas as datas, sem saída (caso do Casa Noowe da Haddock Lobo, que
-- não tem mesas). A coluna é aditiva: clientes antigos ignoram o campo extra.
--
-- Mudar o tipo de retorno exige DROP: `create or replace` não altera `returns table`.

drop function if exists public.customer_reservation_availability(uuid, timestamptz[]);

create function public.customer_reservation_availability(
  p_restaurant_id uuid,
  p_slots timestamptz[]
) returns table(slot timestamptz, remaining integer, capacity integer)
language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_capacity integer;
  v_reserved integer;
  v_slot timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select coalesce(sum(t.seats), 0)::integer into v_capacity
  from public.tables t where t.restaurant_id = p_restaurant_id;

  foreach v_slot in array coalesce(p_slots, array[]::timestamptz[]) loop
    slot := v_slot;
    capacity := v_capacity;
    if v_capacity <= 0 then
      remaining := 0;
    else
      select coalesce(sum(r.party_size), 0)::integer into v_reserved
      from public.reservations r
      where r.restaurant_id = p_restaurant_id
        and r.status::text in ('pending','confirmed')
        and r.reservation_time between v_slot - interval '90 minutes'
                                  and v_slot + interval '90 minutes';
      remaining := greatest(0, v_capacity - v_reserved);
    end if;
    return next;
  end loop;
end $$;

revoke all on function public.customer_reservation_availability(uuid, timestamptz[]) from public;
grant execute on function public.customer_reservation_availability(uuid, timestamptz[]) to authenticated;

comment on function public.customer_reservation_availability(uuid, timestamptz[]) is
  'Retorna assentos livres e capacidade total por slot no restaurante indicado, aplicando a mesma janela ±90 min de `customer_create_reservation`.';
