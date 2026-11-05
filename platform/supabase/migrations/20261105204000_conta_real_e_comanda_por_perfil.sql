-- Achados da conferência por perfil no simulador.
-- table_sessions.total_spent nunca é atualizado depois de aberta a comanda: a "Conta" do mapa ficava em R$ 0,00.
-- O valor passa a sair do consumo real; o campo só vale para sessão antiga, sem item lançado.
create or replace function private.session_spent(p_session uuid, p_legacy numeric)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif((select sum(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint))
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where o.table_session_id = p_session and o.status::text <> 'cancelled' and oi.status::text <> 'cancelled'), 0)::numeric / 100, p_legacy)
$$;
revoke all on function private.session_spent(uuid, numeric) from public, anon, authenticated;

create or replace function public.restaurant_get_tables(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
  v_can_rearrange boolean;
  v_sees_all boolean;
  v_is_waiter boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id);
  -- ADR-021: comanda parada gera alerta único à equipe; nunca encerra a sessão.
  perform private.session_idle_sweep(p_restaurant_id);
  v_can_rearrange := private.has_restaurant_role(p_restaurant_id, private.table_layout_roles(p_restaurant_id)); -- ADR-018

  -- Aditivo G: Dono e Gerente veem o consumo de todas as mesas; Garçom só o das mesas dele;
  -- Maître e demais veem o estado da mesa, sem valor. O valor da mesa que se cobra vem da própria cobrança.
  v_sees_all := private.has_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  v_is_waiter := private.has_restaurant_role(p_restaurant_id, array['waiter']::public.user_roles_role_enum[]);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'restaurant_id', t.restaurant_id,
        'table_number', t.table_number,
        'seats', t.seats,
        'status', t.status,
        'section', t.section,
        'assigned_waiter_id', t.assigned_waiter_id,
        'position_x', t.position_x,
        'position_y', t.position_y,
        'shape', t.shape,
        'width', t.width,
        'height', t.height,
        'qr_code', t.qr_code,
        'occupied_since', t.occupied_since,
        'notes', t.notes,
        'merged_into_id', t.merged_into_id,
        'merged_into_number', (select m.table_number from public.tables m where m.id = t.merged_into_id),
        'effective_seats', private.table_effective_seats(t.id),
        'merged_children', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'table_number', c.table_number, 'seats', c.seats) order by c.table_number), '[]'::jsonb) from public.tables c where c.merged_into_id = t.id),
        'can_rearrange', v_can_rearrange,
        'active_session', (
          select jsonb_build_object(
            'id', ts.id,
            'guest_name', ts.guest_name,
            'guest_count', ts.guest_count,
            'started_at', ts.started_at,
            'last_activity', ts.last_activity,
            'origin', private.session_origin(ts.id),
            'origin_name', private.session_origin_name(ts.id),
            'idle_since', private.session_idle_since(ts.restaurant_id, ts.last_activity),
            'total_spent', case when v_sees_all or (v_is_waiter and private.table_is_with_user(t.id, auth.uid())) then private.session_spent(ts.id, ts.total_spent) end,
            'spent_hidden', not (v_sees_all or (v_is_waiter and private.table_is_with_user(t.id, auth.uid()))),
            'headcount', private.table_session_headcount(ts.id)
          )
          from public.table_sessions ts
          where ts.table_id = t.id
            and ts.status = 'active'
          order by ts.started_at desc
          limit 1
        ),
        'active_reservation', (
          select jsonb_build_object(
            'id', r.id,
            'customer_name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente'),
            'party_size', r.party_size
          )
          from public.reservations r
          left join public.profiles p on p.id = r.customer_id
          where r.table_id = t.id
            and r.status::text = 'confirmed'
            and t.status = 'reserved'
            and r.reservation_time >= now() - interval '2 hours'
          order by r.reservation_time asc
          limit 1
        ),
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
      order by t.section nulls last, t.table_number
    ),
    '[]'::jsonb
  )
  into result
  from public.tables t
  where t.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

create or replace function public.restaurant_get_table_bill(p_table_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare
  v_restaurant_id uuid;
  v_session public.table_sessions;
  v_diners jsonb;
  v_items jsonb;
  v_subtotal numeric(10,2);
  v_full boolean;
  v_with_me boolean;
begin
  select restaurant_id into v_restaurant_id from public.tables where id = p_table_id;
  if v_restaurant_id is null then raise exception 'Mesa não encontrada' using errcode = 'P0001'; end if;
  perform private.require_restaurant_role(
    v_restaurant_id,
    array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]
  );

  -- Aditivo G: Garçom só abre a comanda das mesas dele. Maître vê o consumo da mesa que cobra, sem o total pago (pendências 76 e 85).
  v_with_me := private.has_restaurant_role(v_restaurant_id, array['waiter']::public.user_roles_role_enum[])
    and private.table_is_with_user(p_table_id, auth.uid());
  v_full := private.has_restaurant_role(v_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]) or v_with_me;
  if not v_full and not private.has_restaurant_role(v_restaurant_id, array['maitre']::public.user_roles_role_enum[]) then
    raise exception 'Esta mesa é de outro garçom' using errcode = '42501';
  end if;

  select * into v_session from public.table_sessions
  where table_id = p_table_id and status = 'active'
  order by started_at desc limit 1;

  if v_session.id is null then
    return jsonb_build_object('tableId', p_table_id, 'tableSessionId', null,
      'diners', '[]'::jsonb, 'items', '[]'::jsonb, 'subtotal', 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dinerId', p.id, 'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host, 'isKid', p.is_kid, 'isCompanion', p.user_id is null,
    'paidCents', case when v_full then coalesce((select sum(s.amount_cents) from public.bill_shares s
      where s.table_session_id = v_session.id and s.participant_id = p.id and s.status = 'paid'), 0) end
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb) into v_diners
  from public.table_session_participants p where p.table_session_id = v_session.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id, 'orderId', o.id, 'name', coalesce(mi.name, 'Item'),
    'quantity', oi.quantity, 'totalPrice', oi.total_price, 'status', oi.status,
    'specialInstructions', oi.special_instructions,
    'dinerId', coalesce(oi.diner_id, placer.id),
    'dinerName', coalesce(diner.display_name, placer.display_name, 'Convidado'),
    'dinerIsKid', coalesce(diner.is_kid, false)
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants placer
    on placer.table_session_id = o.table_session_id and placer.user_id = o.customer_id
  left join public.table_session_participants diner on diner.id = oi.diner_id
  where o.table_session_id = v_session.id and o.status <> 'cancelled';

  return jsonb_build_object(
    'tableId', p_table_id,
    'tableSessionId', v_session.id,
    'diners', v_diners,
    'items', v_items,
    'subtotal', v_subtotal,
    -- ADR-021: quanto já foi pago na mesa, por parcelas quitadas.
    'paidCents', case when v_full then coalesce((select sum(s.amount_cents) from public.bill_shares s
      where s.table_session_id = v_session.id and s.status = 'paid'), 0) end
  );
end $$;
