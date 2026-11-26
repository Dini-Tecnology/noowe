-- ADR-033: a Notaas substitui a Focus NFe na emissão da NFC-e.
-- A Notaas é assíncrona e não busca nota por referência nossa: consulta e cancelamento usam o ID dela,
-- que passa a ficar em fiscal_documents.provider_ref. Fila, varredura, avisos e reenvio não mudam.

alter table public.fiscal_documents add column provider_ref text;
alter table public.fiscal_documents alter column provider set default 'notaas';
alter table public.fiscal_configs alter column fiscal_provider set default 'notaas';
comment on column public.fiscal_documents.provider_ref is 'ID da nota na Notaas (invoiceId). Nulo enquanto o emissor não aceitou.';
comment on column public.fiscal_configs.focus_token_secret_id is
  'Segredo no Vault com a chave de API do projeto Notaas do restaurante. O nome vem de quando o emissor era a Focus NFe.';

-- O claim entrega o ID do emissor: com ele, a Edge Function consulta antes de qualquer reenvio.
do $$
declare v_def text; v_old text := $q$'consumerDocument', private.fiscal_consumer_document(d));$q$;
begin
  v_def := pg_get_functiondef('public.service_fiscal_claim(uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'service_fiscal_claim mudou: revisar o ID da Notaas'; end if;
  execute replace(v_def, v_old, $q$'consumerDocument', private.fiscal_consumer_document(d), 'providerRef', d.provider_ref);$q$);
end $$;

-- Todo resultado grava o ID do emissor quando vier, inclusive o transitório de nota ainda em processamento.
do $$
declare v_def text;
  v_old text := $q$if d.status <> 'processing' then return jsonb_build_object('status', d.status, 'ignored', true); end if;$q$;
begin
  v_def := pg_get_functiondef('public.service_fiscal_record_result(uuid, text, jsonb)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'service_fiscal_record_result mudou: revisar o ID da Notaas'; end if;
  execute replace(v_def, v_old, v_old || $q$
  update public.fiscal_documents set provider_ref = coalesce(nullif(p_result->>'providerRef', ''), provider_ref) where id = d.id;$q$);
end $$;

-- O cancelamento na Notaas é pelo ID dela.
do $$
declare v_def text; v_old text := $q$'justification', d.cancel_reason);$q$;
begin
  v_def := pg_get_functiondef('public.service_fiscal_cancel_claim(uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'service_fiscal_cancel_claim mudou: revisar o ID da Notaas'; end if;
  execute replace(v_def, v_old, $q$'justification', d.cancel_reason, 'providerRef', d.provider_ref);$q$);
end $$;

-- Reenvio da gerência: nota rejeitada pela SEFAZ precisa de nota nova (com o cadastro corrigido), então o ID sai.
-- Nota que falhou por esgotar tentativas mantém o ID e continua consultando a mesma nota, sem duplicar.
do $$
declare v_def text;
  v_old text := $q$update public.fiscal_documents set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()$q$;
begin
  v_def := pg_get_functiondef('public.restaurant_fiscal_retry(uuid, text)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'restaurant_fiscal_retry mudou: revisar o ID da Notaas'; end if;
  execute replace(v_def, v_old, v_old || $q$,
        provider_ref = case when d.status = 'rejected' then null else provider_ref end$q$);
end $$;
