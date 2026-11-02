-- ADR-030 — conta encerrada cuja nota falhou ao enfileirar volta a ter documento.
--
-- A varredura parte do rastro `fiscal.enqueue_failed`, não de "contas sem nota": fechamento manual e
-- contas anteriores à emissão também não têm nota, e isso não é falha. Chama de novo as funções de
-- enfileirar. Se a falha persistir, grava um documento `blocked` sem foto do encerramento, que entra
-- na lista da gerência e dispara o aviso de nota parada. A varredura segue tentando montá-lo.

create index audit_logs_fiscal_enqueue_idx on public.audit_logs(entity_id, action, created_at)
  where action in ('fiscal.enqueue_failed', 'fiscal.enqueue_not_applicable');
create index fiscal_documents_enqueue_failed_idx on public.fiscal_documents(next_attempt_at)
  where status = 'blocked' and error_code = 'enqueue_failed';

-- Regra provisória (ADR-030): quanto a falha pode durar antes de chegar à gerência. Falha passageira
-- se resolve sozinha na varredura seguinte, sem push.
create or replace function private.fiscal_enqueue_block_after()
returns interval language sql immutable as $$
  select interval '15 minutes'
$$;
revoke all on function private.fiscal_enqueue_block_after() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Enfileirar preenche o documento sem foto, com a mesma external_ref e o mesmo id
-- ---------------------------------------------------------------------------
create or replace function private.fiscal_enqueue_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_lines jsonb; v_payments jsonb; v_ids uuid[]; v_gross bigint[]; v_fee bigint[]; v_id uuid;
begin
  select * into s from public.table_sessions where id = p_session;
  if s.id is null then return null; end if;
  -- Pagamento simulado não existe para o fisco.
  if exists (select 1 from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
             where b.table_session_id = p_session and b.status = 'paid' and g.provider = 'simulated') then
    return null;
  end if;
  select * into t from private.session_totals(p_session);
  select array_agg(l.order_item_id order by l.order_item_id), array_agg(l.open_cents order by l.order_item_id)
    into v_ids, v_gross
  from private.session_lines(p_session) l where l.open_cents > 0;
  if v_ids is null then return null; end if;
  v_fee := private.allocate_proportional(t.fee_all, v_gross);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', 0, 'feeCents', v_fee[x.ord]) order by x.ord)
    into v_lines
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select g.payment_method as method, sum(b.amount_cents)::bigint as cents
        from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
        where b.table_session_id = p_session and b.status = 'paid' group by g.payment_method) m;
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (s.restaurant_id, p_session, 's-' || p_session, t.base_all,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb)))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.fiscal_enqueue_session(uuid) from public, anon, authenticated;

create or replace function private.fiscal_enqueue_order(p_order uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; v_ids uuid[]; v_gross bigint[]; v_disc bigint[]; v_lines jsonb; v_payments jsonb; v_id uuid; v_total bigint;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null then return null; end if;
  if exists (select 1 from public.gateway_transactions g
             where g.order_id = p_order and g.status = 'completed' and g.provider = 'simulated') then
    return null;
  end if;
  select array_agg(oi.id order by oi.created_at, oi.id),
         array_agg(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) order by oi.created_at, oi.id)
    into v_ids, v_gross
  from public.order_items oi
  where oi.order_id = p_order and oi.status::text <> 'cancelled'
    and coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) > 0;
  if v_ids is null then return null; end if;
  select sum(x) into v_total from unnest(v_gross) x;
  v_disc := private.allocate_proportional(least(coalesce(o.discount_cents, 0), v_total), v_gross);
  v_total := v_total - least(coalesce(o.discount_cents, 0), v_total);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', v_disc[x.ord], 'feeCents', 0) order by x.ord)
    into v_lines
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select g.payment_method as method, sum(g.amount_cents)::bigint as cents
        from public.gateway_transactions g
        where g.order_id = p_order and g.status = 'completed' group by g.payment_method) m;
  insert into public.fiscal_documents(restaurant_id, order_id, external_ref, total_cents, snapshot)
  values (o.restaurant_id, p_order, 'o-' || p_order, v_total,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb)))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.fiscal_enqueue_order(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reconciliação
-- ---------------------------------------------------------------------------
-- Venda real ainda de pé. Zero é simulado, conta sem pagamento ou pedido estornado ou cancelado depois
-- da falha: nada a emitir. Conta paga e sem linhas não cai aqui: pedido marcado `completed` depois do
-- encerramento some de private.session_lines, e a nota continua devida.
create or replace function private.fiscal_paid_cents(p_type text, p_id uuid)
returns bigint language sql stable security definer set search_path = public, private, pg_temp as $$
  select case p_type
    when 'table_session' then (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(b.base_cents), 0) end
      from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_id and b.status = 'paid')
    else (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(g.amount_cents - g.tip_cents), 0) end
      from public.orders o join public.gateway_transactions g on g.order_id = o.id and g.status = 'completed'
      where o.id = p_id and o.payment_status = 'confirmed' and o.status::text <> 'cancelled')
  end::bigint
$$;
revoke all on function private.fiscal_paid_cents(text, uuid) from public, anon, authenticated;

-- Devolve recovered, not_applicable, waiting (falha recente, ainda sem documento), blocked ou exists.
create or replace function private.fiscal_recover_enqueue(p_type text, p_id uuid, p_restaurant_id uuid, p_failed_at timestamptz)
returns text language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_ref text := case p_type when 'order' then 'o-' else 's-' end || p_id;
  v_paid bigint := private.fiscal_paid_cents(p_type, p_id);
  d public.fiscal_documents; p record; v_id uuid; v_error text; v_empty boolean;
begin
  select * into d from public.fiscal_documents where external_ref = v_ref;
  v_empty := coalesce(d.status = 'blocked' and d.error_code = 'enqueue_failed', false);
  if v_paid = 0 then
    -- O documento sem foto nunca foi à Focus. A marca em audit_logs tira a falha da varredura.
    if v_empty then delete from public.fiscal_documents where id = d.id; end if;
    perform private.log_system_audit(p_restaurant_id, 'fiscal.enqueue_not_applicable', p_type, p_id,
      'Sem venda real a declarar: simulado, sem pagamento, estornado ou cancelado', null, null);
    return 'not_applicable';
  end if;

  begin
    v_id := case p_type when 'order' then private.fiscal_enqueue_order(p_id) else private.fiscal_enqueue_session(p_id) end;
    if v_id is null then
      if d.id is not null and not v_empty then return 'exists'; end if;
      v_error := 'Conta paga sem linhas para a nota';
    end if;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null then
    perform private.log_system_audit(p_restaurant_id, 'fiscal.enqueue_recovered', p_type, p_id,
      'Nota enfileirada pela reconciliação', null, jsonb_build_object('fiscal_document_id', v_id));
    return 'recovered';
  end if;

  select * into p from private.fiscal_retry_policy();
  if d.id is not null then
    -- Sem limite de tentativas: o expoente tem teto para o intervalo não estourar com o passar dos dias.
    update public.fiscal_documents set attempts = attempts + 1, updated_at = now(),
        next_attempt_at = now() + least(p.base_delay * power(2, least(attempts + 1, p.max_attempts)), p.max_delay)
      where id = d.id;
    return 'blocked';
  end if;
  if now() - p_failed_at < private.fiscal_enqueue_block_after() then return 'waiting'; end if;

  -- Nasce em processing porque o aviso de nota parada olha a transição de status.
  insert into public.fiscal_documents(restaurant_id, table_session_id, order_id, external_ref, total_cents,
      status, claimed_at, next_attempt_at)
  values (p_restaurant_id, case when p_type = 'table_session' then p_id end, case when p_type = 'order' then p_id end,
    v_ref, v_paid, 'processing', now(), now() + p.base_delay)
  on conflict (external_ref) do nothing
  returning id into v_id;
  if v_id is not null then
    -- O texto vai para a lista da gerência; o erro técnico fica só na auditoria.
    perform private.fiscal_block(v_id, 'enqueue_failed',
      'A nota não pôde ser montada no encerramento. O sistema segue tentando; se continuar aqui, acione o suporte.');
    perform private.log_system_audit(p_restaurant_id, 'fiscal.enqueue_retry_failed', p_type, p_id, v_error, null,
      jsonb_build_object('fiscal_document_id', v_id));
  end if;
  return 'blocked';
end $$;
revoke all on function private.fiscal_recover_enqueue(text, uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function private.fiscal_enqueue_failures_due()
returns table(entity_type text, entity_id uuid, restaurant_id uuid, first_failed_at timestamptz)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select f.entity_type, f.entity_id, f.restaurant_id, f.first_failed_at
  from (select a.entity_type, a.entity_id, a.restaurant_id, min(a.created_at) as first_failed_at, max(a.created_at) as last_failed_at
        from public.audit_logs a where a.action = 'fiscal.enqueue_failed'
        group by a.entity_type, a.entity_id, a.restaurant_id) f
  left join public.fiscal_documents d on d.external_ref = case f.entity_type when 'order' then 'o-' else 's-' end || f.entity_id
  where case when d.id is not null
    then d.status = 'blocked' and d.error_code = 'enqueue_failed' and d.next_attempt_at <= now()
    else not exists (select 1 from public.audit_logs m where m.action = 'fiscal.enqueue_not_applicable'
      and m.entity_id = f.entity_id and m.created_at >= f.last_failed_at) end
  order by coalesce(d.next_attempt_at, f.first_failed_at)
  limit (select sweep_batch from private.fiscal_retry_policy())
$$;
revoke all on function private.fiscal_enqueue_failures_due() from public, anon, authenticated;

-- Uma conta com problema não impede as outras na mesma varredura.
create or replace function private.fiscal_reconcile_enqueues()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f record; v_recovered integer := 0;
begin
  for f in select * from private.fiscal_enqueue_failures_due() loop
    begin
      if private.fiscal_recover_enqueue(f.entity_type, f.entity_id, f.restaurant_id, f.first_failed_at) = 'recovered' then
        v_recovered := v_recovered + 1;
      end if;
    exception when others then
      raise warning 'Reconciliação fiscal falhou para % %: %', f.entity_type, f.entity_id, sqlerrm;
    end;
  end loop;
  return v_recovered;
end $$;
revoke all on function private.fiscal_reconcile_enqueues() from public, anon, authenticated;

-- Roda no job fiscal-emission-sweep que já existe. Depois do disparo, porque a nota recuperada sai
-- pelo gatilho de fiscal_documents e não pode ser acionada duas vezes.
create or replace function private.fiscal_dispatch_due()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_sent integer := 0;
begin
  for v_id in select * from private.fiscal_due_documents() loop
    if private.fiscal_post_emit(v_id) then v_sent := v_sent + 1; end if;
  end loop;
  begin
    perform private.fiscal_reconcile_enqueues();
  exception when others then
    raise warning 'Reconciliação fiscal falhou: %', sqlerrm;
  end;
  return v_sent;
end $$;
revoke all on function private.fiscal_dispatch_due() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reenvio pela gerência: documento sem foto precisa ser montado antes de voltar à fila
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_fiscal_retry(p_document_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.fiscal_documents; v_before text; v_restaurant uuid;
begin
  select * into d from public.fiscal_documents where id = p_document_id for update;
  if d.id is null then raise exception 'Documento fiscal não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(d.restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  if d.status not in ('blocked', 'rejected', 'failed') then
    raise exception 'Documento fiscal não pode ser reenviado neste estado' using errcode = 'P0001'; end if;
  v_before := d.status;
  v_restaurant := d.restaurant_id;
  if d.error_code = 'enqueue_failed' then
    if private.fiscal_recover_enqueue(case when d.order_id is not null then 'order' else 'table_session' end,
         coalesce(d.order_id, d.table_session_id), d.restaurant_id, d.created_at) = 'blocked' then
      raise exception 'A nota ainda não pôde ser montada. O sistema segue tentando; se continuar assim, acione o suporte.'
        using errcode = 'P0001';
    end if;
    select * into d from public.fiscal_documents where id = p_document_id;
  else
    update public.fiscal_documents set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
      where id = d.id returning * into d;
  end if;
  perform private.log_audit(v_restaurant, 'fiscal.emission_retry', 'fiscal_document', p_document_id, p_reason,
    jsonb_build_object('status', v_before), jsonb_build_object('status', d.status));
  return jsonb_build_object('documentId', p_document_id, 'status', coalesce(d.status, 'discarded'));
end $$;
revoke all on function public.restaurant_fiscal_retry(uuid, text) from public, anon;
grant execute on function public.restaurant_fiscal_retry(uuid, text) to authenticated;
