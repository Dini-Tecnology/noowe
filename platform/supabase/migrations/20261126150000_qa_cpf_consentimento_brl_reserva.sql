-- QA 2026-11-25: RV-09 (CPF só com consentimento), ES-05/08 (valores em pt-BR nos avisos) e CT-06 (Pix que falha antes do
-- Asaas libera a parcela na hora).

-- RV-09. 1. Consentimento: quem (user_id), quando e qual texto a pessoa aceitou.
alter table private.customer_tax_documents
  add column if not exists consent_at timestamptz,
  add column if not exists consent_text text;
-- shortcut: linhas antigas (guardadas sem consentimento) ficam sem consent_at e não aparecem para o cliente; apagá-las é decisão
-- humana porque a nota da conveniência usa o documento como tomador.

drop function if exists public.service_customer_save_tax_document(uuid, text, text);
create or replace function public.service_customer_save_tax_document(p_user_id uuid, p_document text, p_source text,
  p_consent boolean default false, p_consent_text text default null)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
begin
  -- LGPD: sem o "Salvar meu CPF" marcado, o CPF serve só a este pagamento e não é guardado.
  if not coalesce(p_consent, false) or nullif(trim(p_consent_text), '') is null then return false; end if;
  -- Documento inválido nunca trava o pagamento: o Asaas é quem decide a cobrança. Só não guardamos.
  if not private.tax_document_valid(v) or p_source not in ('payment', 'provider') then return false; end if;
  insert into private.customer_tax_documents(user_id, document, source, consent_at, consent_text)
    values (p_user_id, v, p_source, now(), p_consent_text)
    on conflict (user_id) do update set document = excluded.document, source = excluded.source, updated_at = now(),
      consent_at = excluded.consent_at, consent_text = excluded.consent_text;
  return true;
end $$;
revoke all on function public.service_customer_save_tax_document(uuid, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.service_customer_save_tax_document(uuid, text, text, boolean, text) to service_role;

-- 2. O cliente só vê o CPF que aceitou guardar.
create or replace function public.customer_get_tax_document()
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select d.document from private.customer_tax_documents d where d.user_id = auth.uid() and d.consent_at is not null
$$;
revoke all on function public.customer_get_tax_document() from public, anon;
grant execute on function public.customer_get_tax_document() to authenticated;

-- 3. Excluir o CPF salvo (Perfil). Apaga também linhas antigas sem consentimento.
create or replace function public.customer_delete_tax_document()
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  delete from private.customer_tax_documents where user_id = auth.uid();
  return found;
end $$;
revoke all on function public.customer_delete_tax_document() from public, anon;
grant execute on function public.customer_delete_tax_document() to authenticated;

-- ES-05/08. Um único formatador de dinheiro para textos gerados no servidor: "R$ 1.234,56", "-R$ 46,00".
create or replace function private.format_brl(p_cents bigint)
returns text language sql immutable set search_path = pg_temp as $$
  select case when p_cents < 0 then '-' else '' end || 'R$ '
    || replace(to_char(abs(p_cents) / 100, 'FM999,999,999,999,990'), ',', '.') || ',' || lpad((abs(p_cents) % 100)::text, 2, '0')
$$;
revoke all on function private.format_brl(bigint) from public, anon, authenticated;

-- Toda função que montava texto com to_char(x::numeric / 100, 'FM999G990D00') (separador do locale "C": "35.20") passa a usar
-- o formatador. Parte da definição atual de cada uma e muda só esse trecho.
do $$
declare f record; v_def text; v_new text;
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('public', 'private') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%FM999G990D00%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_def, $r$to_char\(([^';]+?)::numeric / 100, 'FM999G990D00'\)$r$, 'private.format_brl((\1)::bigint)', 'g');
    v_new := replace(v_new, $q$R$ ' || private.format_brl$q$, $q$' || private.format_brl$q$);
    if v_new like '%FM999G990D00%' then raise exception 'formato não convertido em %', f.oid::regprocedure; end if;
    execute v_new;
  end loop;
end $$;

-- "Estorno parcial" só quando o próprio pagamento ainda tem saldo. Pagamento devolvido por inteiro numa conta com outros
-- pagamentos é total desse pagamento.
do $$
declare v_def text;
  v_old text := $q$v_why := case when v_left then 'Estorno parcial' else 'Estorno fora do prazo de cancelamento da nota' end;$q$;
begin
  v_def := pg_get_functiondef('private.fiscal_after_refund(uuid,text)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'fiscal_after_refund mudou: revisar o texto do estorno'; end if;
  execute replace(v_def, v_old, $q$v_why := private.refund_review_reason(v_left, (select g2.refunded_amount_cents >= g2.amount_cents
      from public.gateway_transactions g2 where g2.id = p_tx));$q$);
end $$;

create or replace function private.refund_review_reason(p_sale_left boolean, p_payment_fully_refunded boolean)
returns text language sql immutable set search_path = pg_temp as $$
  select case
    when not p_sale_left then 'Estorno fora do prazo de cancelamento da nota'
    when coalesce(p_payment_fully_refunded, false) then 'Estorno total de um dos pagamentos da conta'
    else 'Estorno parcial' end
$$;
revoke all on function private.refund_review_reason(boolean, boolean) from public, anon, authenticated;

-- CT-06. Pix/cartão que falhou antes de existir cobrança no Asaas: a parcela volta a ficar aberta na hora, sem esperar a
-- varredura. A chave de idempotência é liberada para a nova tentativa reservar de novo.
create or replace function public.service_payment_abort_unsent(p_payment_id uuid, p_error text)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.gateway_transactions;
begin
  select * into v from public.gateway_transactions
    where id = p_payment_id and status = 'creating' and provider_ref is null and purpose = 'bill_share' for update;
  if v.id is null then return false; end if;
  perform private.apply_payment_event(v.id, v.provider, 'aborted:' || v.id, 'ABORTED', 'failed', null, '{}'::jsonb, 'failed');
  update public.gateway_transactions set idempotency_key = idempotency_key || ':aborted', last_error = left(p_error, 500), updated_at = now()
    where id = v.id;
  return true;
end $$;
revoke all on function public.service_payment_abort_unsent(uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_abort_unsent(uuid, text) to service_role;
