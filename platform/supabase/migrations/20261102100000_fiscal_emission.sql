-- T-N4-03 / N4 #4 — emissão de NFC-e vinculada ao encerramento (ADR-030).
--
-- O fechamento só grava na fila, na mesma transação. Quem fala com a Focus NFe é a Edge
-- Function `fiscal-emit`, depois do commit: a falha do emissor nunca reabre a conta.
-- pendente -> processando -> autorizado | rejeitado | falhou | bloqueado; os três últimos
-- voltam à fila por `restaurant_fiscal_retry`, com audit_log (invariante 8).

-- ---------------------------------------------------------------------------
-- 1. Tabelas herdadas do backend removido
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fiscal_configs) or exists (select 1 from public.fiscal_documents) then
    raise exception 'fiscal_configs/fiscal_documents têm linhas do backend antigo: mova os segredos para o Vault e revise antes de aplicar esta migration';
  end if;
end $$;

alter table public.fiscal_configs
  drop column focus_nfe_token,
  drop column certificate_base64,
  drop column certificate_password,
  drop column certificate_uploaded,
  drop column csc_id,
  drop column csc_token,
  drop column current_series,
  drop column next_number,
  drop column auto_emit,
  add column focus_token_secret_id uuid,
  add column environment text not null default 'homologation' check (environment in ('homologation', 'production')),
  add column service_fee_in_document boolean not null default false,
  alter column fiscal_provider set default 'focus_nfe',
  alter column endereco set default '{}'::jsonb,
  alter column tax_defaults set default '{}'::jsonb,
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now(),
  add constraint fiscal_configs_restaurant_fk foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  add constraint fiscal_configs_restaurant_key unique (restaurant_id);

alter table public.fiscal_documents
  drop column total_amount,
  drop column items_snapshot,
  drop column xml,
  alter column order_id drop not null,
  alter column type set default 'nfce',
  alter column status set default 'pending',
  alter column provider set default 'focus_nfe',
  alter column external_ref set not null,
  alter column created_at set default now(),
  add column table_session_id uuid references public.table_sessions(id) on delete set null,
  add column total_cents bigint not null default 0 check (total_cents >= 0),
  add column snapshot jsonb not null default '{}'::jsonb,
  add column environment text,
  add column xml_url text,
  add column consult_url text,
  add column contingency boolean not null default false,
  add column error_code text,
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column claimed_at timestamptz,
  add column authorized_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint fiscal_documents_restaurant_fk foreign key (restaurant_id) references public.restaurants(id) on delete restrict,
  add constraint fiscal_documents_order_fk foreign key (order_id) references public.orders(id) on delete set null,
  add constraint fiscal_documents_status_check
    check (status in ('pending', 'processing', 'authorized', 'rejected', 'failed', 'blocked')),
  add constraint fiscal_documents_external_ref_key unique (external_ref);

create index fiscal_documents_due_idx on public.fiscal_documents(next_attempt_at)
  where status in ('pending', 'processing');
create index fiscal_documents_session_idx on public.fiscal_documents(table_session_id);
create index fiscal_documents_order_idx on public.fiscal_documents(order_id);
create index fiscal_documents_restaurant_idx on public.fiscal_documents(restaurant_id, created_at desc);

-- Configuração só por RPC de serviço. O documento é lido pela gerência; o cliente recebe
-- apenas a projeção de private.fiscal_customer_json (invariante 9).
alter table public.fiscal_configs enable row level security;
alter table public.fiscal_documents enable row level security;
revoke all on public.fiscal_configs, public.fiscal_documents from anon, authenticated;
grant select on public.fiscal_documents to authenticated;
create policy fiscal_documents_management_select on public.fiscal_documents
  for select to authenticated using (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]));

-- ---------------------------------------------------------------------------
-- 2. Regras isoladas (ADR-030)
-- ---------------------------------------------------------------------------
create or replace function private.fiscal_retry_policy(
  out max_attempts integer, out base_delay interval, out max_delay interval,
  out stale_after interval, out sweep_batch integer
) language sql immutable as $$
  select 8, interval '2 minutes', interval '1 hour', interval '5 minutes', 50
$$;
revoke all on function private.fiscal_retry_policy() from public, anon, authenticated;

-- Taxa de serviço na nota: ADR-030, ponto a validar com a contabilidade. A gorjeta nunca entra.
create or replace function private.fiscal_fee_in_document(p_config public.fiscal_configs)
returns boolean language sql immutable as $$
  select coalesce(p_config.service_fee_in_document, false)
$$;
revoke all on function private.fiscal_fee_in_document(public.fiscal_configs) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fila: uma nota por encerramento, com referência estável
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
  on conflict (external_ref) do nothing
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
  on conflict (external_ref) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.fiscal_enqueue_order(uuid) from public, anon, authenticated;

-- Pedido sem sessão (Quick Service): o pagamento confirmado é o encerramento. Um erro aqui
-- não pode derrubar o webhook: o dinheiro já entrou e o rastro fica para o gerente.
create or replace function private.fiscal_on_order_paid()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  begin
    perform private.fiscal_enqueue_order(new.id);
  exception when others then
    perform private.log_system_audit(new.restaurant_id, 'fiscal.enqueue_failed', 'order', new.id, sqlerrm, null, null);
  end;
  return new;
end $$;
revoke all on function private.fiscal_on_order_paid() from public, anon, authenticated;
create trigger trg_fiscal_order_paid after update of payment_status on public.orders
  for each row when (new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed'
    and new.table_session_id is null)
  execute function private.fiscal_on_order_paid();

-- Encerramento em saldo zero: mesma função de 20261024101000, com a fila no fim.
create or replace function private.close_session_if_settled(p_session uuid)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record;
begin
  select * into s from public.table_sessions where id = p_session for update;
  if s.id is null or s.status <> 'active' then return false; end if;
  select * into t from private.session_totals(p_session);
  if t.total_all = 0 and t.paid_sum = 0 then return false; end if;
  if t.paid_sum > t.total_all then
    raise exception 'Soma paga (%) excede o total (%)', t.paid_sum, t.total_all using errcode = 'P0009'; end if;
  if t.paid_sum < t.total_all then return false; end if;
  -- A sessão fecha primeiro: a trava confere o total enquanto os pedidos ainda contam.
  update public.table_sessions set status = 'ended', ended_at = now(), updated_at = now() where id = p_session;
  update public.tables set status = 'available', occupied_since = null, updated_at = now() where id = s.table_id;
  update public.reservations set status = 'completed', updated_at = now()
    where table_id = s.table_id and status::text = 'seated';
  -- Pago é payment_status; orders.status continua derivado dos itens (invariante 5).
  update public.orders set payment_status = 'confirmed', updated_at = now()
    where table_session_id = p_session and status::text <> 'cancelled' and payment_status <> 'confirmed';
  -- Falha ao enfileirar não desfaz o encerramento: a conta está paga.
  begin
    perform private.fiscal_enqueue_session(p_session);
  exception when others then
    perform private.log_system_audit(s.restaurant_id, 'fiscal.enqueue_failed', 'table_session', p_session, sqlerrm, null, null);
  end;
  return true;
end $$;
revoke all on function private.close_session_if_settled(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recibo por parcela: o comprovante do cliente nasce na liquidação
-- ---------------------------------------------------------------------------
create or replace function private.write_share_receipt(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_items jsonb;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select * into s from public.bill_shares where id = tx.bill_share_id;
  if s.id is null or tx.customer_id is null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(mi.name, 'Item') || case when l.base_cents < item.cents then ' (parcial)' else '' end,
      'quantity', case when l.base_cents < item.cents then 1 else oi.quantity end,
      'unitPrice', l.base_cents::numeric / 100 / (case when l.base_cents < item.cents then 1 else greatest(oi.quantity, 1) end),
      'totalPrice', l.base_cents::numeric / 100) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_items
  from public.bill_share_lines l
  join public.order_items oi on oi.id = l.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  cross join lateral (select coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) as cents) item
  where l.bill_share_id = s.id;
  insert into public.casual_dining_receipts(gateway_transaction_id, restaurant_id, customer_id, table_session_id,
      items, subtotal, service_fee_percent, service_fee, total, tip, payment_method)
  values (tx.id, s.restaurant_id, tx.customer_id, s.table_session_id, v_items,
    s.base_cents::numeric / 100, private.session_fee_bps(s.table_session_id)::numeric / 100,
    s.service_fee_cents::numeric / 100, s.amount_cents::numeric / 100, tx.tip_cents::numeric / 100, tx.payment_method)
  on conflict (gateway_transaction_id) do nothing;
end $$;
revoke all on function private.write_share_receipt(uuid) from public, anon, authenticated;

create or replace function private.settle_bill_share(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_kind public.noowe_tip_allocation; v_waiter uuid;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select * into s from public.bill_shares where id = tx.bill_share_id for update;
  if s.id is null or s.status = 'paid' then return; end if;
  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = s.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t
      join public.table_sessions ts on ts.table_id = t.id where ts.id = s.table_session_id;
  end if;
  update public.bill_shares set status = 'paid', paid_at = now(), payment_id = tx.id,
      tip_cents = tx.tip_cents, tip_recipient_kind = v_kind, tip_recipient_user_id = v_waiter,
      payer_user_id = coalesce(payer_user_id, tx.customer_id), updated_at = now()
    where id = s.id;
  begin
    perform private.write_share_receipt(tx.id);
  exception when others then
    perform private.log_system_audit(s.restaurant_id, 'receipt.write_failed', 'payment', tx.id, sqlerrm, null, null);
  end;
  begin
    perform private.close_session_if_settled(s.table_session_id);
  exception when others then
    -- O dinheiro já entrou: o webhook não pode falhar. Fica registrado para o gerente.
    perform private.log_system_audit(s.restaurant_id, 'bill.close_failed', 'table_session', s.table_session_id,
      sqlerrm, null, null);
  end;
end $$;
revoke all on function private.settle_bill_share(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Interface da Edge Function (só service_role)
-- ---------------------------------------------------------------------------
-- Dados tributários vêm do cadastro atual: corrigir o NCM e reenviar basta. Nome, preço e
-- quantidade ficam na foto do encerramento.
create or replace function private.fiscal_emission_payload(p_doc public.fiscal_documents, p_config public.fiscal_configs)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_tax jsonb := coalesce(p_config.tax_defaults, '{}'::jsonb);
  v_with_fee boolean := private.fiscal_fee_in_document(p_config);
  v_lines jsonb := '[]'::jsonb; v_blockers text[] := '{}'; v_total bigint := 0;
  v_methods text[]; v_weights bigint[]; v_alloc bigint[]; v_payments jsonb := '[]'::jsonb;
  l record; v_ncm text; v_cfop text; v_fee bigint; i integer;
  v_key text;
begin
  foreach v_key in array array['icms_origem', 'icms_situacao_tributaria', 'pis_situacao_tributaria', 'cofins_situacao_tributaria'] loop
    if nullif(v_tax->>v_key, '') is null then v_blockers := v_blockers || ('tax_defaults.' || v_key); end if;
  end loop;
  for l in
    select x.value as line, mi.ncm as item_ncm, mi.cfop as item_cfop
    from jsonb_array_elements(p_doc.snapshot->'lines') with ordinality as x(value, ord)
    left join public.menu_items mi on mi.id = nullif(x.value->>'menuItemId', '')::uuid
    order by x.ord
  loop
    v_ncm := coalesce(nullif(nullif(l.item_ncm, ''), '00000000'), nullif(v_tax->>'ncm', ''));
    v_cfop := coalesce(nullif(l.item_cfop, ''), nullif(v_tax->>'cfop', ''));
    if v_ncm is null then v_blockers := v_blockers || ('ncm: ' || (l.line->>'description')); end if;
    if v_cfop is null then v_blockers := v_blockers || ('cfop: ' || (l.line->>'description')); end if;
    v_fee := case when v_with_fee then (l.line->>'feeCents')::bigint else 0 end;
    v_total := v_total + (l.line->>'grossCents')::bigint - (l.line->>'discountCents')::bigint + v_fee;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'productCode', coalesce(l.line->>'menuItemId', l.line->>'orderItemId'),
      'description', l.line->>'description', 'quantity', (l.line->>'quantity')::integer,
      'grossCents', (l.line->>'grossCents')::bigint, 'discountCents', (l.line->>'discountCents')::bigint,
      'feeCents', v_fee, 'ncm', v_ncm, 'cfop', v_cfop, 'unit', coalesce(nullif(v_tax->>'unit', ''), 'un'),
      'icmsOrigin', v_tax->>'icms_origem', 'icmsCst', v_tax->>'icms_situacao_tributaria',
      'pisCst', v_tax->>'pis_situacao_tributaria', 'cofinsCst', v_tax->>'cofins_situacao_tributaria'));
  end loop;
  select array_agg(p->>'method' order by ord), array_agg((p->>'weightCents')::bigint order by ord)
    into v_methods, v_weights
  from jsonb_array_elements(p_doc.snapshot->'payments') with ordinality as x(p, ord);
  if v_methods is null then
    v_blockers := v_blockers || 'payments';
  else
    -- A soma das formas é exatamente o total da nota, mesmo com a taxa fora dela.
    v_alloc := private.allocate_proportional(v_total, v_weights);
    for i in 1 .. array_length(v_methods, 1) loop
      v_payments := v_payments || jsonb_build_array(jsonb_build_object('method', v_methods[i], 'cents', v_alloc[i]));
    end loop;
  end if;
  return jsonb_build_object('items', v_lines, 'payments', v_payments, 'totalCents', v_total, 'blockers', to_jsonb(v_blockers));
end $$;
revoke all on function private.fiscal_emission_payload(public.fiscal_documents, public.fiscal_configs) from public, anon, authenticated;

create or replace function private.fiscal_block(p_id uuid, p_code text, p_message text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.fiscal_documents;
begin
  update public.fiscal_documents set status = 'blocked', error_code = p_code, error_message = p_message, updated_at = now()
    where id = p_id returning * into d;
  perform private.log_system_audit(d.restaurant_id, 'fiscal.emission_blocked', 'fiscal_document', d.id, p_message, null, null);
  return jsonb_build_object('claimed', false, 'blocked', p_code);
end $$;
revoke all on function private.fiscal_block(uuid, text, text) from public, anon, authenticated;

create or replace function public.service_fiscal_claim(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare d public.fiscal_documents; c public.fiscal_configs; p record; v_token text; v_payload jsonb;
begin
  select * into p from private.fiscal_retry_policy();
  update public.fiscal_documents set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = p_document_id
      and ((status = 'pending' and next_attempt_at <= now())
        or (status = 'processing' and claimed_at < now() - p.stale_after))
    returning * into d;
  if d.id is null then return jsonb_build_object('claimed', false); end if;

  select * into c from public.fiscal_configs where restaurant_id = d.restaurant_id and is_active;
  if c.id is not null then
    select decrypted_secret into v_token from vault.decrypted_secrets where id = c.focus_token_secret_id;
  end if;
  if v_token is null then
    return private.fiscal_block(d.id, 'fiscal_config_missing', 'Restaurante sem configuração fiscal ativa');
  end if;
  v_payload := private.fiscal_emission_payload(d, c);
  if jsonb_array_length(v_payload->'blockers') > 0 then
    return private.fiscal_block(d.id, 'fiscal_data_incomplete', 'Dados fiscais incompletos: ' ||
      (select string_agg(b, ', ') from jsonb_array_elements_text(v_payload->'blockers') b));
  end if;
  update public.fiscal_documents set total_cents = (v_payload->>'totalCents')::bigint, environment = c.environment
    where id = d.id;
  return jsonb_build_object('claimed', true, 'documentId', d.id, 'ref', d.external_ref, 'attempt', d.attempts,
    'environment', c.environment, 'token', v_token, 'cnpj', regexp_replace(c.cnpj, '\D', '', 'g'),
    'items', v_payload->'items', 'payments', v_payload->'payments', 'totalCents', v_payload->'totalCents');
end $$;
revoke all on function public.service_fiscal_claim(uuid) from public, anon, authenticated;
grant execute on function public.service_fiscal_claim(uuid) to service_role;

create or replace function public.service_fiscal_record_result(p_document_id uuid, p_outcome text, p_result jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.fiscal_documents; p record; v_message text := p_result->>'errorMessage'; v_delay interval;
begin
  if p_outcome not in ('authorized', 'rejected', 'transient') then
    raise exception 'Resultado fiscal inválido: %', p_outcome using errcode = '22023'; end if;
  select * into d from public.fiscal_documents where id = p_document_id for update;
  if d.id is null then raise exception 'Documento fiscal não encontrado' using errcode = 'P0002'; end if;
  -- Só quem está em processamento recebe resultado: repetir ou chegar atrasado não muda nota autorizada.
  if d.status <> 'processing' then return jsonb_build_object('status', d.status, 'ignored', true); end if;

  if p_outcome = 'authorized' then
    update public.fiscal_documents set status = 'authorized', authorized_at = now(), updated_at = now(),
        access_key = p_result->>'accessKey', number = nullif(p_result->>'number', '')::numeric,
        series = nullif(p_result->>'series', '')::numeric, protocol = p_result->>'protocol',
        qr_code_url = p_result->>'qrCodeUrl', danfe_url = p_result->>'danfeUrl', consult_url = p_result->>'consultUrl',
        xml_url = p_result->>'xmlUrl', contingency = coalesce((p_result->>'contingency')::boolean, false),
        error_code = null, error_message = null
      where id = d.id returning * into d;
  elsif p_outcome = 'rejected' then
    update public.fiscal_documents set status = 'rejected', error_code = p_result->>'errorCode',
        error_message = v_message, updated_at = now() where id = d.id returning * into d;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.emission_rejected', 'fiscal_document', d.id, v_message, null,
      jsonb_build_object('error_code', p_result->>'errorCode'));
  else
    select * into p from private.fiscal_retry_policy();
    if d.attempts >= p.max_attempts then
      update public.fiscal_documents set status = 'failed', error_code = p_result->>'errorCode',
          error_message = v_message, updated_at = now() where id = d.id returning * into d;
      perform private.log_system_audit(d.restaurant_id, 'fiscal.emission_failed', 'fiscal_document', d.id, v_message, null,
        jsonb_build_object('attempts', d.attempts));
    else
      v_delay := least(p.base_delay * power(2, greatest(d.attempts - 1, 0)), p.max_delay);
      update public.fiscal_documents set status = 'pending', next_attempt_at = now() + v_delay,
          error_code = p_result->>'errorCode', error_message = v_message, updated_at = now()
        where id = d.id returning * into d;
    end if;
  end if;
  return jsonb_build_object('status', d.status);
end $$;
revoke all on function public.service_fiscal_record_result(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.service_fiscal_record_result(uuid, text, jsonb) to service_role;

-- Provisionamento manual até existir a tela (ver ACOES_HUMANAS_PUBLICACAO.md). O token vai para o
-- Vault; certificado A1 e CSC ficam só na Focus. Não libera notas antigas bloqueadas: isso é decisão
-- da gerência, por restaurant_fiscal_retry.
create or replace function public.service_fiscal_configure(
  p_restaurant_id uuid, p_config jsonb, p_focus_token text default null
) returns uuid language plpgsql security definer set search_path = public, vault, pg_temp as $$
declare v_id uuid; v_secret uuid; v_name text := 'fiscal_focus_token:' || p_restaurant_id;
begin
  if nullif(regexp_replace(coalesce(p_config->>'cnpj', ''), '\D', '', 'g'), '') is null
    or nullif(p_config->>'razaoSocial', '') is null or nullif(p_config->>'stateCode', '') is null
    or nullif(p_config->>'regimeTributario', '') is null then
    raise exception 'cnpj, razaoSocial, stateCode e regimeTributario são obrigatórios' using errcode = '22023';
  end if;
  insert into public.fiscal_configs(restaurant_id, cnpj, ie, razao_social, nome_fantasia, state_code, endereco,
      regime_tributario, tax_defaults, environment, service_fee_in_document, is_active)
  values (p_restaurant_id, regexp_replace(p_config->>'cnpj', '\D', '', 'g'), p_config->>'ie', p_config->>'razaoSocial',
    p_config->>'nomeFantasia', p_config->>'stateCode', coalesce(p_config->'endereco', '{}'::jsonb), p_config->>'regimeTributario',
    coalesce(p_config->'taxDefaults', '{}'::jsonb), coalesce(p_config->>'environment', 'homologation'),
    coalesce((p_config->>'serviceFeeInDocument')::boolean, false), coalesce((p_config->>'isActive')::boolean, true))
  on conflict (restaurant_id) do update set cnpj = excluded.cnpj, ie = excluded.ie, razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia, state_code = excluded.state_code, endereco = excluded.endereco,
    regime_tributario = excluded.regime_tributario, tax_defaults = excluded.tax_defaults,
    environment = excluded.environment, service_fee_in_document = excluded.service_fee_in_document,
    is_active = excluded.is_active, updated_at = now()
  returning id, focus_token_secret_id into v_id, v_secret;
  if nullif(btrim(coalesce(p_focus_token, '')), '') is not null then
    if v_secret is null then
      select id into v_secret from vault.secrets where name = v_name;
    end if;
    if v_secret is null then
      v_secret := vault.create_secret(btrim(p_focus_token), v_name, 'Token Focus NFe do restaurante');
    else
      perform vault.update_secret(v_secret, btrim(p_focus_token));
    end if;
    update public.fiscal_configs set focus_token_secret_id = v_secret where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.service_fiscal_configure(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.service_fiscal_configure(uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Reenvio pela gerência
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_fiscal_retry(p_document_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.fiscal_documents; v_before text;
begin
  select * into d from public.fiscal_documents where id = p_document_id for update;
  if d.id is null then raise exception 'Documento fiscal não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(d.restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  if d.status not in ('blocked', 'rejected', 'failed') then
    raise exception 'Documento fiscal não pode ser reenviado neste estado' using errcode = 'P0001'; end if;
  v_before := d.status;
  update public.fiscal_documents set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
    where id = d.id returning * into d;
  perform private.log_audit(d.restaurant_id, 'fiscal.emission_retry', 'fiscal_document', d.id, p_reason,
    jsonb_build_object('status', v_before), jsonb_build_object('status', d.status));
  return jsonb_build_object('documentId', d.id, 'status', d.status);
end $$;
revoke all on function public.restaurant_fiscal_retry(uuid, text) from public, anon;
grant execute on function public.restaurant_fiscal_retry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Disparo e varredura
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function private.fiscal_post_emit(p_document_id uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/fiscal-emit',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('documentId', p_document_id));
  return true;
exception when others then
  raise warning 'Disparo fiscal falhou para %: %', p_document_id, sqlerrm;
  return false;
end $$;
revoke all on function private.fiscal_post_emit(uuid) from public, anon, authenticated;

-- A requisição do pg_net só sai depois do commit: rollback do fechamento não emite nota.
create or replace function private.fiscal_dispatch_on_due()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.fiscal_post_emit(new.id);
  return new;
end $$;
revoke all on function private.fiscal_dispatch_on_due() from public, anon, authenticated;
create trigger trg_fiscal_dispatch_on_due after insert or update of status on public.fiscal_documents
  for each row when (new.status = 'pending' and new.next_attempt_at <= now())
  execute function private.fiscal_dispatch_on_due();

create or replace function private.fiscal_due_documents()
returns setof uuid language sql stable security definer set search_path = public, private, pg_temp as $$
  select d.id from public.fiscal_documents d, private.fiscal_retry_policy() p
  where (d.status = 'pending' and d.next_attempt_at <= now())
     or (d.status = 'processing' and d.claimed_at < now() - p.stale_after)
  order by d.next_attempt_at limit (select sweep_batch from private.fiscal_retry_policy())
$$;
revoke all on function private.fiscal_due_documents() from public, anon, authenticated;

create or replace function private.fiscal_dispatch_due()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_sent integer := 0;
begin
  for v_id in select * from private.fiscal_due_documents() loop
    if private.fiscal_post_emit(v_id) then v_sent := v_sent + 1; end if;
  end loop;
  return v_sent;
end $$;
revoke all on function private.fiscal_dispatch_due() from public, anon, authenticated;

-- Reexecutável: se o pg_cron for habilitado depois, basta chamar de novo (ADR-023).
create or replace function private.fiscal_schedule_sweep()
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron indisponível: a varredura fiscal não foi agendada';
    return false;
  end if;
  execute $sql$select cron.schedule('fiscal-emission-sweep', '* * * * *', 'select private.fiscal_dispatch_due()')$sql$;
  return true;
end $$;
revoke all on function private.fiscal_schedule_sweep() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise warning 'pg_cron não habilitado: %', sqlerrm;
  end;
  perform private.fiscal_schedule_sweep();
end $$;

-- ---------------------------------------------------------------------------
-- 8. O que o cliente vê: sem token, sem erro interno, sem payload
-- ---------------------------------------------------------------------------
create or replace function private.fiscal_customer_json(p_doc public.fiscal_documents, p_settled boolean)
returns jsonb language sql stable as $$
  select case
    when p_doc.id is null then jsonb_build_object('status', case when p_settled then 'delayed' else 'awaiting_close' end)
    when p_doc.status = 'authorized' then jsonb_build_object('status', 'authorized',
      'number', p_doc.number, 'series', p_doc.series, 'accessKey', p_doc.access_key,
      'qrCodeUrl', p_doc.qr_code_url, 'danfeUrl', p_doc.danfe_url, 'consultUrl', p_doc.consult_url,
      'authorizedAt', p_doc.authorized_at, 'contingency', p_doc.contingency,
      'homologation', p_doc.environment = 'homologation')
    when p_doc.status in ('pending', 'processing') then jsonb_build_object('status', 'issuing')
    else jsonb_build_object('status', 'delayed')
  end
$$;
revoke all on function private.fiscal_customer_json(public.fiscal_documents, boolean) from public, anon, authenticated;

-- customer_get_receipt de 20260923120000, agora com o documento fiscal da sessão.
create or replace function public.customer_get_receipt(p_receipt_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare
  v_receipt public.casual_dining_receipts; v_restaurant public.restaurants; v_doc public.fiscal_documents;
  v_simulated boolean; v_settled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_receipt from public.casual_dining_receipts where id = p_receipt_id and customer_id = auth.uid();
  if v_receipt.id is null then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  select * into v_restaurant from public.restaurants where id = v_receipt.restaurant_id;
  v_simulated := exists (select 1 from public.gateway_transactions where id = v_receipt.gateway_transaction_id and provider = 'simulated');
  select * into v_doc from public.fiscal_documents where table_session_id = v_receipt.table_session_id;
  select status <> 'active' into v_settled from public.table_sessions where id = v_receipt.table_session_id;
  return to_jsonb(v_receipt) || jsonb_build_object(
    'simulated', v_simulated,
    'restaurantName', v_restaurant.name,
    'restaurantCnpj', coalesce(v_restaurant.settings->>'cnpj', null),
    -- Código do comprovante, não chave da SEFAZ: a chave real, quando existe, vem em `fiscal`.
    'accessKey', regexp_replace(rpad(replace(v_receipt.id::text, '-', ''), 44, '0'), '(.{4})(?=.)', '\1 ', 'g'),
    'fiscal', case when v_simulated then jsonb_build_object('status', 'none')
      else private.fiscal_customer_json(v_doc, coalesce(v_settled, true)) end
  );
end $$;

create or replace function public.customer_order_fiscal(p_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare o public.orders; v_doc public.fiscal_documents; v_settled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid();
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.gateway_transactions g
             where g.provider = 'simulated' and (g.order_id = p_order_id
               or (o.table_session_id is not null and g.table_session_id = o.table_session_id))) then
    return jsonb_build_object('status', 'none');
  end if;
  -- Pedido de mesa: a nota é a do encerramento da sessão, não a do pedido.
  if o.table_session_id is not null then
    select * into v_doc from public.fiscal_documents where table_session_id = o.table_session_id;
    select status <> 'active' into v_settled from public.table_sessions where id = o.table_session_id;
  else
    select * into v_doc from public.fiscal_documents where order_id = p_order_id;
    v_settled := o.payment_status = 'confirmed';
  end if;
  return private.fiscal_customer_json(v_doc, coalesce(v_settled, false));
end $$;
revoke all on function public.customer_order_fiscal(uuid) from public, anon;
grant execute on function public.customer_order_fiscal(uuid) to authenticated;

comment on table public.fiscal_documents is
  'NFC-e por encerramento (ADR-030). external_ref é a referência idempotente na Focus NFe; a emissão roda fora da transação do fechamento.';
