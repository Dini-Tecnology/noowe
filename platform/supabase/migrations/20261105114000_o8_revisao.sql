-- O8, revisão: todo restaurante que vende tem dia operacional, e fechar o dia é um só.
create or replace function private.operational_day_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; s public.restaurant_cash_settings; v_turn timestamptz; v_cash boolean; v_n integer := 0; v_sales boolean; v_restaurant uuid;
begin
  -- Restaurante vendendo sem que ninguém tenha aberto caixa ou olhado o dia: o período começa aqui, ou a gorjeta ficaria de fora.
  for v_restaurant in
    select distinct g.restaurant_id from public.gateway_transactions g
    where g.created_at > now() - interval '1 day' and g.status in ('creating', 'pending', 'completed')
      and not exists (select 1 from public.operational_days x where x.restaurant_id = g.restaurant_id and x.status = 'open')
  loop
    perform private.operational_day_current(v_restaurant);
  end loop;
  for d in select * from public.operational_days where status = 'open' loop
    begin
      s := private.cash_settings(d.restaurant_id);
      v_turn := ((d.business_date + 1)::timestamp + s.day_turnover) at time zone 'America/Sao_Paulo';
      continue when now() < v_turn;
      v_cash := exists (select 1 from public.cash_register_sessions c where c.restaurant_id = d.restaurant_id and c.status = 'open');
      v_sales := private.day_has_sales(d.restaurant_id, d.started_at, now());
      if (v_cash or v_sales) and d.alerted_at is null then
        perform private.emit_event_safe(d.restaurant_id, 'day.close_missing', 'day.close_missing:' || d.id, 'operational_day', d.id,
          jsonb_build_object('title', 'Fechamento do dia pendente', 'detail', 'O dia ' || to_char(d.business_date, 'DD/MM') || ' ainda não foi fechado.'));
        update public.operational_days set alerted_at = now() where id = d.id;
      end if;
      if not v_cash then
        update public.operational_days set status = case when v_sales then 'unclosed' else 'closed' end, ended_at = now(),
            closed_at = case when v_sales then null else now() end,
            summary = case when v_sales then null else jsonb_build_object('noSales', true) end
          where id = d.id;
        perform private.operational_day_current(d.restaurant_id);
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'dia operacional %: %', d.id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;

create or replace function public.restaurant_close_operational_day(p_restaurant_id uuid, p_day_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; v_to timestamptz; v_open integer; v_dist public.tip_distributions; v_summary jsonb; v_next public.operational_days;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p_day_id is null then d := private.operational_day_current(p_restaurant_id); p_day_id := d.id; end if;
  -- Dois toques em "Fechar o dia" viram um fechamento só.
  select * into d from public.operational_days where id = p_day_id and restaurant_id = p_restaurant_id for update;
  if d.id is null then raise exception 'Dia operacional não encontrado' using errcode = 'P0002'; end if;
  if d.status = 'closed' then raise exception 'Este dia já foi fechado' using errcode = 'P0001'; end if;
  if d.status = 'open' then
    select count(*) into v_open from public.table_sessions where restaurant_id = p_restaurant_id and status = 'active';
    if v_open > 0 then raise exception 'Há % comanda(s) aberta(s). Feche antes de encerrar o dia.', v_open using errcode = 'P0001'; end if;
    if exists (select 1 from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open') then
      raise exception 'Feche o caixa antes de encerrar o dia.' using errcode = 'P0001'; end if;
  end if;
  v_to := coalesce(d.ended_at, now());
  v_dist := private.tip_distribute(d, v_to);
  select jsonb_build_object('businessDate', d.business_date,
      'byMethod', coalesce((select jsonb_object_agg(x.m, x.c) from (select g.payment_method m, sum(g.amount_cents - g.refunded_amount_cents)::bigint c
        from public.gateway_transactions g where g.restaurant_id = p_restaurant_id and g.status = 'completed'
          and coalesce(g.confirmed_at, g.created_at) >= d.started_at and coalesce(g.confirmed_at, g.created_at) < v_to group by 1) x), '{}'::jsonb),
      'externalCents', coalesce((select sum(g.amount_cents - g.refunded_amount_cents)::bigint from public.gateway_transactions g
        where g.restaurant_id = p_restaurant_id and g.status = 'completed' and g.provider = 'manual' and g.payment_method <> 'cash'
          and coalesce(g.confirmed_at, g.created_at) >= d.started_at and coalesce(g.confirmed_at, g.created_at) < v_to), 0),
      'cashDifferenceCents', coalesce((select sum(c.difference_cents)::bigint from public.cash_register_sessions c
        where c.restaurant_id = p_restaurant_id and c.closed_at >= d.started_at and c.closed_at < v_to + interval '1 second'), 0),
      'tipPoolCents', v_dist.pool_cents, 'tipRetainedCents', v_dist.retained_cents, 'tipDistributedCents', v_dist.distributed_cents,
      'tipUnallocatedCents', v_dist.unallocated_cents)
    into v_summary;
  update public.operational_days set status = 'closed', ended_at = v_to, closed_at = now(), closed_by = auth.uid(), summary = v_summary where id = d.id;
  perform private.log_audit(p_restaurant_id, 'day.closed', 'operational_day', d.id, 'Fechamento do dia', null, v_summary);
  perform private.emit_event_safe(p_restaurant_id, 'day.closed', 'day.closed:' || d.id, 'operational_day', d.id,
    jsonb_build_object('title', 'Dia ' || to_char(d.business_date, 'DD/MM') || ' fechado', 'detail', 'Veja o resumo do dia e o rateio da gorjeta.', 'summary', v_summary));
  v_next := private.operational_day_current(p_restaurant_id);
  return v_summary || jsonb_build_object('dayId', d.id, 'nextDayId', v_next.id);
end $$;
