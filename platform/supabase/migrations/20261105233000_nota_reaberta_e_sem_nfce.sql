-- Notas do restaurante (respostas 62 e 81 de 05/11/2026).
--  62: comanda reaberta gera uma NOVA NFC-e só com os itens acrescentados. A nota já emitida continua valendo.
--  81: no plano sem NFC-e o app não bloqueia nada. A nota é do sistema fiscal do restaurante: o app mostra isso, o cliente vê
--      "Solicite a nota ao restaurante", e o Dono exporta as vendas do dia.

-- 1. Situação nova: a nota é emitida fora do app.
alter table public.fiscal_documents drop constraint fiscal_documents_status_check;
alter table public.fiscal_documents add constraint fiscal_documents_status_check
  check (status in ('pending', 'processing', 'authorized', 'rejected', 'failed', 'blocked', 'external'));

update public.fiscal_documents set status = 'external', error_code = null, error_message = 'Nota fiscal emitida pelo sistema do restaurante', updated_at = now()
  where status = 'blocked' and error_code = 'plan_without_nfce';

-- Já nasce assim quando o plano não inclui NFC-e: nunca entra na fila nem aparece como problema.
create or replace function private.fiscal_document_plan_route()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.status = 'pending' and not private.plan_allows(new.restaurant_id, 'nfce') then
    new.status := 'external';
    new.error_message := 'Nota fiscal emitida pelo sistema do restaurante';
  end if;
  return new;
end $$;
create trigger trg_fiscal_document_plan_route before insert on public.fiscal_documents
  for each row execute function private.fiscal_document_plan_route();

-- O plano mudou depois de a nota entrar na fila: também vira externa, sem bloqueio.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.service_fiscal_claim(uuid)'::regprocedure);
  if position($q$return private.fiscal_block(d.id, 'plan_without_nfce', 'O plano atual não inclui NFC-e');$q$ in v_def) = 0 then
    raise exception 'service_fiscal_claim mudou: revisar a troca do bloqueio por plano';
  end if;
  execute replace(v_def, $q$return private.fiscal_block(d.id, 'plan_without_nfce', 'O plano atual não inclui NFC-e');$q$,
    $q$update public.fiscal_documents set status = 'external', claimed_at = null, error_code = null, error_message = 'Nota fiscal emitida pelo sistema do restaurante', updated_at = now() where id = d.id;
    return jsonb_build_object('claimed', false, 'external', true);$q$);
end $$;

create or replace function private.fiscal_customer_json(p_doc public.fiscal_documents, p_settled boolean)
returns jsonb language sql stable as $$
  select case
    when p_doc.id is null then jsonb_build_object('status', case when p_settled then 'delayed' else 'awaiting_close' end)
    when p_doc.status = 'authorized' then jsonb_build_object('status', 'authorized',
      'number', p_doc.number, 'series', p_doc.series, 'accessKey', p_doc.access_key,
      'qrCodeUrl', p_doc.qr_code_url, 'danfeUrl', p_doc.danfe_url, 'consultUrl', p_doc.consult_url,
      'authorizedAt', p_doc.authorized_at, 'contingency', p_doc.contingency,
      'homologation', p_doc.environment = 'homologation')
    when p_doc.status = 'external' then jsonb_build_object('status', 'external')
    when p_doc.status in ('pending', 'processing') then jsonb_build_object('status', 'issuing')
    else jsonb_build_object('status', 'delayed')
  end
$$;

-- 2. Comanda reaberta: a primeira nota cobre o que foi fechado; cada reabertura gera outra, só com os itens novos e os
-- pagamentos feitos depois de reabrir. Itens já em nota (que não foi cancelada nem descartada) não entram de novo.
create or replace function private.fiscal_enqueue_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_lines jsonb; v_payments jsonb; v_ids uuid[]; v_gross bigint[]; v_fee bigint[]; v_id uuid; v_coupon bigint; v_disc bigint[];
  v_noted uuid[]; v_first boolean; v_ref text; v_total bigint := 0; v_since timestamptz;
begin
  select * into s from public.table_sessions where id = p_session;
  if s.id is null then return null; end if;
  -- Pagamento simulado não existe para o fisco.
  if exists (select 1 from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
             where b.table_session_id = p_session and b.status = 'paid' and g.provider = 'simulated') then
    return null;
  end if;
  v_first := not exists (select 1 from public.fiscal_documents d where d.table_session_id = p_session);
  v_ref := case when v_first or s.reopened_count = 0 then 's-' || p_session else 's-' || p_session || '-r' || s.reopened_count end;
  v_since := case when v_ref = 's-' || p_session then null else s.reopened_at end;
  select coalesce(array_agg((l->>'orderItemId')::uuid), '{}') into v_noted
  from public.fiscal_documents d, jsonb_array_elements(coalesce(d.snapshot->'lines', '[]'::jsonb)) l
  where d.table_session_id = p_session and d.cancel_status is distinct from 'cancelled'
    and d.external_ref <> v_ref and not (d.status = 'failed' and d.error_message = 'Venda estornada antes da emissão');

  select * into t from private.session_totals(p_session);
  select array_agg(l.order_item_id order by l.order_item_id), array_agg(l.open_cents order by l.order_item_id)
    into v_ids, v_gross
  from private.session_lines(p_session) l where l.open_cents > 0;
  if v_ids is null then return null; end if;
  v_fee := private.allocate_proportional(t.fee_all, v_gross);
  -- O cupom sai como desconto na nota. O restante é o que foi vendido.
  select coalesce(sum(b.coupon_discount_cents), 0) into v_coupon from public.bill_shares b where b.table_session_id = p_session and b.status = 'paid';
  v_disc := private.allocate_proportional(v_coupon, v_gross);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', v_disc[x.ord], 'feeCents', v_fee[x.ord]) order by x.ord),
         coalesce(sum(v_gross[x.ord] - v_disc[x.ord]), 0)
    into v_lines, v_total
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  where not (x.id = any(v_noted));
  if v_lines is null then return null; end if;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select private.fiscal_payment_method(g) as method, sum(b.amount_cents)::bigint as cents
        from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
        -- Parcela só de gorjeta não é forma de pagamento da nota: a gorjeta fica fora dela.
        where b.table_session_id = p_session and b.status = 'paid' and b.amount_cents > 0
          and (v_since is null or b.paid_at >= v_since)
        group by private.fiscal_payment_method(g)) m;
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (s.restaurant_id, p_session, v_ref, v_total,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb), 'reopenedAddOn', v_ref <> 's-' || p_session))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  if v_id is not null and v_ref <> 's-' || p_session then
    perform private.log_system_audit(s.restaurant_id, 'fiscal.reopened_add_on', 'fiscal_document', v_id, 'Itens acrescentados depois de reabrir a comanda',
      null, jsonb_build_object('sessionId', p_session, 'totalCents', v_total));
  end if;
  return v_id;
end $$;

-- 3. Vendas do dia para o sistema fiscal do restaurante (81). Só o Dono.
create or replace function public.restaurant_export_fiscal_sales(p_restaurant_id uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'documentId', d.id, 'at', d.created_at, 'table', tb.table_number, 'orderNumber', o.order_number,
      'description', l->>'description', 'quantity', (l->>'quantity')::numeric, 'grossCents', (l->>'grossCents')::bigint,
      'discountCents', coalesce((l->>'discountCents')::bigint, 0), 'feeCents', coalesce((l->>'feeCents')::bigint, 0),
      'payments', d.snapshot->'payments') order by d.created_at, l->>'description')
    from public.fiscal_documents d
    cross join lateral jsonb_array_elements(coalesce(d.snapshot->'lines', '[]'::jsonb)) l
    left join public.table_sessions ts on ts.id = d.table_session_id
    left join public.tables tb on tb.id = ts.table_id
    left join public.orders o on o.id = d.order_id
    where d.restaurant_id = p_restaurant_id
      and (d.created_at at time zone 'America/Sao_Paulo')::date = p_day
      and d.cancel_status is distinct from 'cancelled'
      and not (d.status = 'failed' and d.error_message = 'Venda estornada antes da emissão')), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_export_fiscal_sales(uuid, date) from public, anon;
grant execute on function public.restaurant_export_fiscal_sales(uuid, date) to authenticated;
