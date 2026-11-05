-- Valores das mesas por perfil (aditivo, item G).
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
            'total_spent', case when v_sees_all or (v_is_waiter and private.table_is_with_user(t.id, auth.uid())) then ts.total_spent end,
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
