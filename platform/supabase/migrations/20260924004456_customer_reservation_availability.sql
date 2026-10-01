-- Expor a mesma regra que `customer_create_reservation` usa para aceitar ou
-- recusar uma reserva, mas em modo consulta: dado um restaurante e um vetor de
-- horários candidatos, devolve `remaining` (assentos livres) por slot,
-- considerando reservas pendentes/confirmadas na janela ±90 min e a capacidade
-- total das mesas. Sem esta função, o app precisaria adivinhar disponibilidade
-- ou mostrar horários que o RPC de criação recusaria com "No availability for
-- this time" — foi o bug relatado no fluxo de reserva do Casa Noowe.

create or replace function public.customer_reservation_availability(
  p_restaurant_id uuid,
  p_slots timestamptz[]
) returns table(slot timestamptz, remaining integer)
language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_capacity integer;
  v_reserved integer;
  v_slot timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select coalesce(sum(seats), 0)::integer into v_capacity
  from public.tables where restaurant_id = p_restaurant_id;

  foreach v_slot in array coalesce(p_slots, array[]::timestamptz[]) loop
    if v_capacity <= 0 then
      slot := v_slot;
      remaining := 0;
      return next;
    else
      select coalesce(sum(party_size), 0)::integer into v_reserved
      from public.reservations
      where restaurant_id = p_restaurant_id
        and status::text in ('pending','confirmed')
        and reservation_time between v_slot - interval '90 minutes'
                                and v_slot + interval '90 minutes';
      slot := v_slot;
      remaining := greatest(0, v_capacity - v_reserved);
      return next;
    end if;
  end loop;
end $$;

revoke all on function public.customer_reservation_availability(uuid, timestamptz[]) from public;
grant execute on function public.customer_reservation_availability(uuid, timestamptz[]) to authenticated;

comment on function public.customer_reservation_availability(uuid, timestamptz[]) is
  'Retorna assentos livres por slot no restaurante indicado, aplicando a mesma janela ±90 min de `customer_create_reservation`.';
