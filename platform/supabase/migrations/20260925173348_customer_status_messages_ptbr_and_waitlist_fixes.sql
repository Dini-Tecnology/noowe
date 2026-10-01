-- Notificações de status em português + correções da fila virtual.
--
-- 1. private.notify_customer_state_change gravava "Novo status: cancelled" —
--    o valor cru do enum chegava ao cliente (lista de notificações e push).
--    A mensagem agora sai de private.customer_status_message(kind, status),
--    única função que traduz status de pedido, reserva e fila para PT-BR.
--    Notificações antigas no formato "Novo status: <enum>" são reescritas.
--
-- 2. Fila virtual:
--    - public.customer_my_waitlist(): a posição gravada em waitlist_entries é
--      a do momento da entrada e nunca era recalculada; quem estava em 5º
--      continuava vendo "5º" depois que os quatro da frente saíam. A posição
--      devolvida ao cliente passa a ser a posição viva entre os que esperam.
--    - customer_join_waitlist: um cliente já chamado ('called') podia entrar
--      de novo na mesma fila, gerando entrada duplicada.
--    - customer_update_waitlist / customer_set_waitlist_has_kids: só aceitavam
--      'waiting'; depois de chamado o cliente não conseguia sair da fila nem
--      mexer no Modo Família (a tela exibia o botão e o RPC recusava).

create or replace function private.customer_status_message(p_kind text, p_status text)
returns text language sql immutable
set search_path = pg_catalog, pg_temp as $$
  select coalesce(
    case p_kind
      when 'order' then case p_status
        when 'pending' then 'Seu pedido foi recebido.'
        when 'confirmed' then 'Seu pedido foi confirmado.'
        when 'preparing' then 'Seu pedido está em preparo.'
        when 'ready' then 'Seu pedido está pronto.'
        when 'delivering' then 'Seu pedido saiu para entrega.'
        when 'delivered' then 'Seu pedido foi entregue.'
        when 'completed' then 'Seu pedido foi concluído.'
        when 'cancelled' then 'Seu pedido foi cancelado.'
        when 'open_for_additions' then 'Seu pedido está aberto para novos itens.'
      end
      when 'reservation' then case p_status
        when 'pending' then 'Sua reserva está aguardando confirmação.'
        when 'confirmed' then 'Sua reserva foi confirmada.'
        when 'seated' then 'Você foi acomodado na mesa da sua reserva.'
        when 'completed' then 'Sua reserva foi concluída.'
        when 'cancelled' then 'Sua reserva foi cancelada.'
        when 'no_show' then 'Sua reserva foi encerrada por não comparecimento.'
      end
      when 'waitlist' then case p_status
        when 'waiting' then 'Você está na fila de espera.'
        when 'called' then 'Sua mesa está pronta! Dirija-se à recepção.'
        when 'seated' then 'Você foi acomodado. Bom apetite!'
        when 'cancelled' then 'Sua entrada na fila de espera foi cancelada.'
        when 'no_show' then 'Sua entrada na fila foi encerrada por não comparecimento.'
      end
    end,
    'Seu status foi atualizado.'
  )
$$;

create or replace function private.notify_customer_state_change()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_title text; v_kind text; v_customer uuid;
begin
  if tg_op <> 'UPDATE' or new.status::text = old.status::text then return new; end if;
  v_customer := new.customer_id;
  if tg_table_name = 'orders' then v_title := 'Atualização do pedido'; v_kind := 'order';
  elsif tg_table_name = 'reservations' then v_title := 'Atualização da reserva'; v_kind := 'reservation';
  else v_title := 'Atualização da fila'; v_kind := 'waitlist'; end if;
  if v_customer is not null then
    perform private.create_notification(v_customer, v_title,
      private.customer_status_message(v_kind, new.status::text),
      'system', new.id, case when v_kind = 'waitlist' then null else v_kind end,
      jsonb_build_object('screen', v_kind, 'id', new.id, 'status', new.status::text));
  end if;
  return new;
end $$;

update public.notifications
set message = private.customer_status_message(metadata->>'screen', substring(message from '^Novo status: (.*)$'))
where message ~ '^Novo status: [a-z_]+$'
  and metadata->>'screen' in ('order', 'reservation', 'waitlist');

create or replace function public.customer_my_waitlist()
returns setof public.waitlist_entries language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
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

create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'virtualQueue')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'waitlist')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyArrival')::boolean, true)
  ) then raise exception 'Waitlist is unavailable for this restaurant' using errcode = 'P0001'; end if;
  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid()
      and restaurant_id = p_restaurant_id and status in ('waiting', 'called'))
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, p_preference::public.waitlist_entries_preference_enum, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.customer_update_waitlist(p_entry_id uuid, p_action text)
returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  if p_action not in ('cancel','arrive') then raise exception 'Invalid action' using errcode = '22023'; end if;
  update public.waitlist_entries set
    status = case when p_action = 'cancel' then 'cancelled'::public.waitlist_entries_status_enum else status end,
    updated_at = now(),
    notes = case when p_action = 'arrive' then concat_ws(E'\n', notes, 'Chegada confirmada pelo cliente') else notes end
  where id = p_entry_id and customer_id = auth.uid() and status in ('waiting', 'called')
  returning * into v_entry;
  if v_entry.id is null then raise exception 'Waitlist entry cannot be updated' using errcode = 'P0001'; end if;
  return v_entry;
end $$;

create or replace function public.customer_set_waitlist_has_kids(p_entry_id uuid, p_has_kids boolean)
returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  update public.waitlist_entries
  set has_kids = coalesce(p_has_kids, false), updated_at = now()
  where id = p_entry_id and customer_id = auth.uid() and status in ('waiting', 'called')
  returning * into v_entry;
  if v_entry.id is null then raise exception 'Waitlist entry cannot be updated' using errcode = 'P0001'; end if;
  return v_entry;
end $$;

revoke all on function private.customer_status_message(text, text) from public;
revoke all on function public.customer_my_waitlist() from public;
grant execute on function public.customer_my_waitlist() to authenticated;
