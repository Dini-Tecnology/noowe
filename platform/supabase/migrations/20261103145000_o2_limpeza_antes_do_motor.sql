-- O2: dados de teste parados, antes de o motor ligar. Sem isto, o primeiro tick marca reservas de
-- meses atrás como no-show e manda push ao cliente e à equipe. Corte fixo: o que é de novembro em
-- diante segue o fluxo normal. Num banco novo não há o que limpar.
do $$
declare
  v_cutoff constant timestamptz := '2026-11-01 00:00:00-03';
  v_reason constant text := 'Limpeza de dado antigo antes do motor de eventos (O2)';
  r record;
begin
  -- Depois do motor, cada linha limpa aqui viraria evento e tarefa.
  if to_regclass('public.domain_events') is not null then
    raise exception 'Esta limpeza roda antes da migration do motor de eventos';
  end if;

  -- Só o aviso ao cliente fica desligado, e o DO inteiro é uma transação: não há como ficar assim.
  alter table public.reservations disable trigger trg_customer_reservation_notification;
  alter table public.waitlist_entries disable trigger trg_customer_waitlist_notification;

  -- Mesmo efeito de private.reservation_expire_sweep, sem o aviso.
  for r in
    select x.id, x.restaurant_id, x.table_id, x.reservation_time from public.reservations x
    where x.status::text = 'confirmed' and x.reservation_time < v_cutoff
    for update
  loop
    update public.reservations set status = 'no_show', updated_at = now() where id = r.id;
    if r.table_id is not null then
      update public.tables t set status = 'available', updated_at = now()
      where t.id = r.table_id and t.status = 'reserved'
        and not exists (select 1 from public.reservations o
          where o.table_id = t.id and o.id <> r.id and o.status::text = 'confirmed');
    end if;
    perform private.log_system_audit(r.restaurant_id, 'engine.stale_cleanup', 'reservation', r.id, v_reason,
      jsonb_build_object('status', 'confirmed', 'reservationTime', r.reservation_time),
      jsonb_build_object('status', 'no_show'));
  end loop;

  -- Fila parada viraria "mesa livre: chame o próximo da fila" chamando quem saiu há meses.
  for r in
    select w.id, w.restaurant_id, w.created_at from public.waitlist_entries w
    where w.status::text = 'waiting' and w.created_at < v_cutoff
    for update
  loop
    update public.waitlist_entries set status = 'cancelled', updated_at = now() where id = r.id;
    perform private.log_system_audit(r.restaurant_id, 'engine.stale_cleanup', 'waitlist', r.id, v_reason,
      jsonb_build_object('status', 'waiting', 'createdAt', r.created_at),
      jsonb_build_object('status', 'cancelled'));
  end loop;

  -- A comanda continua aberta: só conta como já avisada, para o tick não avisar a equipe de novo.
  for r in
    select s.id, s.restaurant_id, s.last_activity, s.idle_alerted_at from public.table_sessions s
    where s.status = 'active' and s.last_activity < v_cutoff
      and (s.idle_alerted_at is null or s.idle_alerted_at < s.last_activity)
    for update
  loop
    update public.table_sessions set idle_alerted_at = now() where id = r.id;
    perform private.log_system_audit(r.restaurant_id, 'engine.stale_cleanup', 'table_session', r.id, v_reason,
      jsonb_build_object('idleAlertedAt', r.idle_alerted_at, 'lastActivity', r.last_activity),
      jsonb_build_object('idleAlertedAt', now()));
  end loop;

  alter table public.reservations enable trigger trg_customer_reservation_notification;
  alter table public.waitlist_entries enable trigger trg_customer_waitlist_notification;
end $$;
