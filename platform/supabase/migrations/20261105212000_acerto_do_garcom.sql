-- Acerto do garçom (ADR-029): quem recebeu dinheiro entrega ao caixa, e o Gerente ou o Dono registra quanto recebeu.
-- O dinheiro já conta no esperado da gaveta desde o recebimento. O acerto zera o saldo da pessoa, e só a diferença muda o esperado:
-- a falta fica registrada no acerto e não volta como quebra no fechamento.
-- Cego para o Gerente, como o fechamento (pendência 87): ele vê quem tem acerto a fazer, não quanto. O Dono vê os valores.
alter table public.cash_register_movements
  add column staff_id uuid references public.profiles(id) on delete set null,
  add column due_cents bigint check (due_cents >= 0);

create or replace function private.cash_in_hand_cents(p_session uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select sum(case m.type when 'sale' then m.amount_cents when 'refund' then -m.amount_cents else 0 end)
      from public.cash_register_movements m where m.session_id = p_session and m.actor_id = p_user and m.is_cash), 0)::bigint
    - coalesce((select sum(m.due_cents) from public.cash_register_movements m
      where m.session_id = p_session and m.type = 'acerto' and m.staff_id = p_user), 0)::bigint
$$;
revoke all on function private.cash_in_hand_cents(uuid, uuid) from public, anon, authenticated;

create or replace function public.restaurant_my_cash_in_hand(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_session uuid; v_since timestamptz;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['waiter','maitre','barman']::public.user_roles_role_enum[]);
  select id, opened_at into v_session, v_since from public.cash_register_sessions
    where restaurant_id = p_restaurant_id and status = 'open';
  if v_session is null then return jsonb_build_object('open', false, 'cents', 0); end if;
  -- Recebido menos o que voltou (estorno) e o que já foi acertado; sangria e reforço são do Gerente e não entram aqui.
  return jsonb_build_object('open', true, 'cents', private.cash_in_hand_cents(v_session, auth.uid()), 'since', v_since);
end $$;

create or replace function public.restaurant_cash_team_in_hand(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_session uuid; v_owner boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  v_owner := private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select id into v_session from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open';
  if v_session is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', x.user_id, 'name', coalesce(p.full_name, 'Sem nome'),
        'cents', case when v_owner then x.cents end) order by p.full_name)
    from (select d.user_id, private.cash_in_hand_cents(v_session, d.user_id) as cents
          from (select distinct m.actor_id as user_id from public.cash_register_movements m
                where m.session_id = v_session and m.type = 'sale' and m.is_cash and m.actor_id is not null) d
          where exists (select 1 from public.user_roles ur where ur.user_id = d.user_id and ur.restaurant_id = p_restaurant_id
                  and ur.is_active and ur.role in ('waiter', 'maitre', 'barman'))) x
    left join public.profiles p on p.id = x.user_id
    where x.cents > 0), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_cash_team_in_hand(uuid) from public, anon;
grant execute on function public.restaurant_cash_team_in_hand(uuid) to authenticated, service_role;

create or replace function public.restaurant_settle_staff_cash(p_restaurant_id uuid, p_staff_id uuid, p_delivered_cents bigint, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_owner boolean; v_due bigint; v_diff bigint; v_name text; v_staff text; v_id uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); s public.restaurant_cash_settings;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  v_owner := private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if p_staff_id = auth.uid() and not v_owner then
    raise exception 'Ninguém acerta o próprio dinheiro' using errcode = '42501'; end if;
  if p_delivered_cents is null or p_delivered_cents < 0 then
    raise exception 'Valor entregue inválido' using errcode = '22023'; end if;
  select * into v from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open' for update;
  if v.id is null then raise exception 'Caixa fechado' using errcode = 'P0002'; end if;
  v_due := private.cash_in_hand_cents(v.id, p_staff_id);
  -- Repetir o toque cai aqui: o primeiro acerto já zerou o saldo.
  if v_due <= 0 then raise exception 'Nada a acertar com esta pessoa' using errcode = '22023'; end if;
  v_diff := p_delivered_cents - v_due;
  -- A resposta diz que há diferença, mas não de quanto: o acerto continua cego.
  if v_diff <> 0 and v_reason is null then
    raise exception 'O valor não confere: informe o motivo' using errcode = '22023'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  select full_name into v_staff from public.profiles where id = p_staff_id;
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, description, created_by, actor_id, staff_id, due_cents, created_at)
    values (v.id, 'acerto', p_delivered_cents::numeric / 100, p_delivered_cents, true, coalesce(v_reason, 'Acerto de ' || coalesce(v_staff, 'funcionário')),
      coalesce(v_name, auth.uid()::text), auth.uid(), p_staff_id, v_due, now())
    returning id into v_id;
  if v_diff <> 0 then
    update public.cash_register_sessions set expected_cents = expected_cents + v_diff, expected_balance = (expected_cents + v_diff)::numeric / 100 where id = v.id;
  end if;
  perform private.log_audit(p_restaurant_id, 'cash.staff_settled', 'cash_register_session', v.id, coalesce(v_reason, 'Acerto de dinheiro'),
    jsonb_build_object('staffId', p_staff_id, 'dueCents', v_due), jsonb_build_object('movementId', v_id, 'deliveredCents', p_delivered_cents, 'differenceCents', v_diff));
  s := private.cash_settings(p_restaurant_id);
  if abs(v_diff) > s.break_limit_cents then
    perform private.emit_event_safe(p_restaurant_id, 'cash.settlement_over_limit', 'cash.settlement_over_limit:' || v_id, 'cash_register_session', v.id,
      jsonb_build_object('title', 'Acerto com diferença acima do limite', 'detail', 'Diferença de ' || to_char(v_diff::numeric / 100, 'FM999G990D00') || ' no acerto de ' || coalesce(v_staff, 'alguém da equipe') || '.'));
  end if;
  return jsonb_build_object('settled', true, 'hasDifference', v_diff <> 0);
end $$;
revoke all on function public.restaurant_settle_staff_cash(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.restaurant_settle_staff_cash(uuid, uuid, bigint, text) to authenticated, service_role;

insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority) values
  ('cash.settlement_over_limit', 'notice', '{owner}', false, 'always', 1)
on conflict do nothing;
