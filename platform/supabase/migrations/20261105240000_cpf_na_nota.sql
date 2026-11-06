-- CPF do cliente nas notas (resposta do Pedro de 05/11/2026).
--  - Cupom fiscal (NFC-e, do restaurante para o cliente, pela Focus NFe): o CPF é opcional. O cliente marca "CPF na nota" na tela de
--    pagamento; sem isso, a nota sai como consumidor não identificado, como já saía.
--  - Taxa de conveniência (NFS-e da NOOWE para o cliente, pelo Asaas): o tomador é o CPF que o cliente já informa para gerar a cobrança
--    online. Esse CPF passa a ficar guardado no schema privado, fora do alcance da API.

-- 1. CPF ou CNPJ com dígitos verificadores corretos. A SEFAZ recusa a nota com documento inválido.
create or replace function private.tax_document_valid(p text)
returns boolean language plpgsql immutable set search_path = pg_temp as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s integer; r integer; w integer[];
begin
  if length(d) = 11 then
    if d = repeat(left(d, 1), 11) then return false; end if;
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::integer * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::integer then return false; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::integer * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::integer;
  elsif length(d) = 14 then
    if d = repeat(left(d, 1), 14) then return false; end if;
    w := array[5,4,3,2,9,8,7,6,5,4,3,2];
    s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::integer * w[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::integer then return false; end if;
    w := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
    s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::integer * w[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::integer;
  end if;
  return false;
end $$;
revoke all on function private.tax_document_valid(text) from public, anon, authenticated;

-- 2. O CPF de quem paga online (o mesmo que vai para o Asaas). Uma linha por pessoa.
create table private.customer_tax_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document text not null check (private.tax_document_valid(document) and document ~ '^\d+$'),
  source text not null check (source in ('payment', 'provider')),
  updated_at timestamptz not null default now()
);
alter table private.customer_tax_documents enable row level security;
revoke all on private.customer_tax_documents from public, anon, authenticated, service_role;

-- "CPF na nota": escolha do cliente em cada pagamento. Pode ser outro documento que o da cobrança.
create table private.payment_receipt_documents (
  gateway_transaction_id uuid primary key references public.gateway_transactions(id) on delete cascade,
  document text not null check (private.tax_document_valid(document) and document ~ '^\d+$'),
  created_at timestamptz not null default now()
);
alter table private.payment_receipt_documents enable row level security;
revoke all on private.payment_receipt_documents from public, anon, authenticated, service_role;

-- 3. Funções de serviço (só a função de pagamento chama).
create or replace function public.service_customer_save_tax_document(p_user_id uuid, p_document text, p_source text)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
begin
  -- Documento inválido nunca trava o pagamento: o Asaas é quem decide a cobrança. Só não guardamos.
  if not private.tax_document_valid(v) or p_source not in ('payment', 'provider') then return false; end if;
  insert into private.customer_tax_documents(user_id, document, source) values (p_user_id, v, p_source)
    on conflict (user_id) do update set document = excluded.document, source = excluded.source, updated_at = now()
    where customer_tax_documents.document is distinct from excluded.document;
  return true;
end $$;
revoke all on function public.service_customer_save_tax_document(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_customer_save_tax_document(uuid, text, text) to service_role;

-- null tira o CPF da nota (o cliente desmarcou antes de tentar de novo).
create or replace function public.service_payment_set_receipt_document(p_payment_id uuid, p_user_id uuid, p_document text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
begin
  if not exists (select 1 from public.gateway_transactions g where g.id = p_payment_id and g.customer_id = p_user_id) then
    raise exception 'Pagamento não encontrado' using errcode = 'P0002';
  end if;
  if v is null then
    delete from private.payment_receipt_documents where gateway_transaction_id = p_payment_id;
    return;
  end if;
  if not private.tax_document_valid(v) then raise exception 'CPF ou CNPJ inválido' using errcode = '22023'; end if;
  insert into private.payment_receipt_documents(gateway_transaction_id, document) values (p_payment_id, v)
    on conflict (gateway_transaction_id) do update set document = excluded.document, created_at = now();
end $$;
revoke all on function public.service_payment_set_receipt_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_set_receipt_document(uuid, uuid, text) to service_role;

-- A função de pagamento sabe se ainda falta guardar o CPF de quem já tem cadastro no Asaas.
do $$
declare v_def text; v_old text := $q$'phone', p.phone)$q$;
begin
  v_def := pg_get_functiondef('public.service_payment_customer(uuid, uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'service_payment_customer mudou: revisar o CPF guardado'; end if;
  execute replace(v_def, v_old,
    $q$'phone', p.phone, 'hasTaxDocument', exists (select 1 from private.customer_tax_documents d where d.user_id = p.id))$q$);
end $$;

-- 4. O app sugere o CPF já informado quando o cliente marca "CPF na nota". Só o da própria pessoa.
create or replace function public.customer_get_tax_document()
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select d.document from private.customer_tax_documents d where d.user_id = auth.uid()
$$;
revoke all on function public.customer_get_tax_document() from public, anon;
grant execute on function public.customer_get_tax_document() to authenticated;

-- 5. Qual CPF vai na NFC-e. Regra provisória: com a conta dividida, vale o primeiro pagamento da nota que pediu CPF.
-- Pedido do Quick: o pagamento do pedido. Comanda: as parcelas da nota (a primeira nota leva as pagas até ela; a nota do
-- acréscimo, as pagas depois de reabrir).
create or replace function private.fiscal_consumer_document(d public.fiscal_documents)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select r.document
  from private.payment_receipt_documents r
  join public.gateway_transactions g on g.id = r.gateway_transaction_id and g.status = 'completed'
  where (d.order_id is not null and g.order_id = d.order_id)
     or (d.table_session_id is not null and exists (
          select 1 from public.bill_shares b join public.table_sessions s on s.id = b.table_session_id
          where b.payment_id = g.id and b.table_session_id = d.table_session_id and b.status = 'paid'
            and case when coalesce((d.snapshot->>'reopenedAddOn')::boolean, false) then b.paid_at >= s.reopened_at
                     else b.paid_at <= d.created_at end))
  order by g.confirmed_at nulls last, g.created_at, g.id
  limit 1
$$;
revoke all on function private.fiscal_consumer_document(public.fiscal_documents) from public, anon, authenticated;

do $$
declare v_def text; v_old text := $q$'items', v_payload->'items', 'payments', v_payload->'payments', 'totalCents', v_payload->'totalCents');$q$;
begin
  v_def := pg_get_functiondef('public.service_fiscal_claim(uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'service_fiscal_claim mudou: revisar o CPF na nota'; end if;
  execute replace(v_def, v_old,
    $q$'items', v_payload->'items', 'payments', v_payload->'payments', 'totalCents', v_payload->'totalCents',
    'consumerDocument', private.fiscal_consumer_document(d));$q$);
end $$;

-- 6. Nota da conveniência: o tomador é quem pagou, com o CPF guardado. Notas já criadas sem documento são completadas.
do $$
declare v_def text;
  v_old text := $q$insert into private.noowe_fee_notes(kind, restaurant_id, gateway_transaction_id, amount_cents)
    select 'convenience', g.restaurant_id, g.id, g.convenience_cents from public.gateway_transactions g$q$;
begin
  v_def := pg_get_functiondef('private.fee_notes_generate(timestamptz)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'fee_notes_generate mudou: revisar o tomador da conveniência'; end if;
  execute replace(v_def, v_old, $q$update private.noowe_fee_notes n set taker_document = t.document,
      taker_name = coalesce(n.taker_name, p.full_name), taker_email = coalesce(n.taker_email, p.email), updated_at = now()
    from public.gateway_transactions g
    join private.customer_tax_documents t on t.user_id = g.customer_id
    left join public.profiles p on p.id = g.customer_id
    where n.kind = 'convenience' and n.status = 'waiting_data' and n.taker_document is null and n.gateway_transaction_id = g.id;
  insert into private.noowe_fee_notes(kind, restaurant_id, gateway_transaction_id, amount_cents, taker_document, taker_name, taker_email)
    select 'convenience', g.restaurant_id, g.id, g.convenience_cents, t.document, p.full_name, p.email from public.gateway_transactions g
    left join private.customer_tax_documents t on t.user_id = g.customer_id
    left join public.profiles p on p.id = g.customer_id$q$);
end $$;

create or replace function private.fee_note_blocker(n private.noowe_fee_notes)
returns text language sql stable security definer set search_path = private, pg_temp as $$
  select case
    when not private.nfse_ready(n.kind) then 'Faltam o código de serviço e as alíquotas deste tipo de nota'
    when n.taker_document is null and n.kind = 'noowe_pay' then 'Restaurante sem CNPJ'
    -- O CPF vem da cobrança online. Sem ele (pagamento antigo, sem cadastro no Asaas), o Asaas não emite.
    when n.taker_document is null then 'Cliente sem CPF registrado: o Asaas não emite nota sem documento do tomador'
  end
$$;
revoke all on function private.fee_note_blocker(private.noowe_fee_notes) from public, anon, authenticated, service_role;
