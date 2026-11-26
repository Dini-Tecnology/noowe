-- QA 26/11, itens 5 e 12 (docs/DECISOES-QA-2026-11-26.md).

-- 5. CPFs guardados sem consentimento são apagados (minimização, LGPD art. 6º, III). Daqui em diante a tabela só aceita linha
-- com consentimento registrado.
delete from private.customer_tax_documents where consent_at is null or nullif(trim(consent_text), '') is null;
alter table private.customer_tax_documents
  alter column consent_at set not null,
  alter column consent_text set not null;

-- O tomador da nota da conveniência passa a ser, nesta ordem: o "CPF na nota" daquele pagamento e o CPF guardado com
-- consentimento. Sem nenhum dos dois a nota fica em waiting_data (fee_note_blocker) até chegar um documento.
do $$
declare v_def text := pg_get_functiondef('private.fee_notes_generate(timestamptz)'::regprocedure); v_new text;
begin
  v_new := replace(v_def, $o$  update private.noowe_fee_notes n set taker_document = t.document,
      taker_name = coalesce(n.taker_name, p.full_name), taker_email = coalesce(n.taker_email, p.email), updated_at = now()
    from public.gateway_transactions g
    join private.customer_tax_documents t on t.user_id = g.customer_id
    left join public.profiles p on p.id = g.customer_id
    where n.kind = 'convenience' and n.status = 'waiting_data' and n.taker_document is null and n.gateway_transaction_id = g.id;$o$,
  $n$  update private.noowe_fee_notes n set taker_document = coalesce(rd.document, t.document),
      taker_name = coalesce(n.taker_name, p.full_name), taker_email = coalesce(n.taker_email, p.email), updated_at = now()
    from public.gateway_transactions g
    left join private.payment_receipt_documents rd on rd.gateway_transaction_id = g.id
    left join private.customer_tax_documents t on t.user_id = g.customer_id
    left join public.profiles p on p.id = g.customer_id
    where n.kind = 'convenience' and n.status = 'waiting_data' and n.taker_document is null and n.gateway_transaction_id = g.id
      and coalesce(rd.document, t.document) is not null;$n$);
  v_new := replace(v_new, $o$select 'convenience', g.restaurant_id, g.id, g.convenience_cents, t.document, p.full_name, p.email from public.gateway_transactions g
    left join private.customer_tax_documents t on t.user_id = g.customer_id$o$,
  $n$select 'convenience', g.restaurant_id, g.id, g.convenience_cents, coalesce(rd.document, t.document), p.full_name, p.email from public.gateway_transactions g
    left join private.payment_receipt_documents rd on rd.gateway_transaction_id = g.id
    left join private.customer_tax_documents t on t.user_id = g.customer_id$n$);
  if v_new not like '%payment_receipt_documents rd%payment_receipt_documents rd%' then
    raise exception 'fee_notes_generate mudou; trecho do tomador não encontrado';
  end if;
  execute v_new;
end $$;

-- 12a. Aceite dos Termos e da Política: registrado no servidor (now() do banco), só por RPC, sem edição nem exclusão pelo app.
revoke insert, update, delete, truncate on public.user_consents from anon, authenticated;
revoke all on public.user_consents from anon;
drop policy if exists authenticated_insert_own_user_id on public.user_consents;
drop policy if exists authenticated_update_own_user_id on public.user_consents;
drop policy if exists authenticated_delete_own_user_id on public.user_consents;
drop policy if exists user_consents_owner_insert on public.user_consents;
drop policy if exists user_consents_owner_update on public.user_consents;
drop policy if exists user_consents_owner_delete on public.user_consents;
alter table public.user_consents enable row level security;

create or replace function public.accept_legal_terms(p_terms_version text, p_privacy_version text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if coalesce(length(trim(p_terms_version)), 0) not between 1 and 32 or coalesce(length(trim(p_privacy_version)), 0) not between 1 and 32 then
    raise exception 'Versão do documento inválida' using errcode = '22023';
  end if;
  -- Reaceite da mesma versão não duplica: vale o primeiro aceite.
  insert into public.user_consents(user_id, consent_type, version)
    values (v_uid, 'terms_of_service', trim(p_terms_version)), (v_uid, 'privacy_policy', trim(p_privacy_version))
    on conflict (user_id, consent_type, version) where revoked_at is null do nothing;
end $$;
revoke all on function public.accept_legal_terms(text, text) from public, anon;
grant execute on function public.accept_legal_terms(text, text) to authenticated;

-- 12b. Retenção: a carência entre o pedido de exclusão e a eliminação é parâmetro da NOOWE.
alter table private.noowe_company add column if not exists account_deletion_grace_days integer not null default 30
  check (account_deletion_grace_days between 1 and 365);

do $$
declare v_def text := pg_get_functiondef('public.request_account_deletion()'::regprocedure); v_new text;
begin
  v_new := replace(v_def, $o$v_scheduled_for timestamptz := now() + interval '30 days';$o$,
    $n$v_scheduled_for timestamptz := now() + make_interval(days => (select c.account_deletion_grace_days from private.noowe_company c limit 1));$n$);
  v_new := replace(v_new, $o$Physical purge after the grace period is a
  -- follow-up (needs a scheduled job, out of scope here).$o$, $n$The rest is purged after the grace period by
  -- private.purge_deleted_accounts (pg_cron account-purge).$n$);
  if v_new = v_def then raise exception 'request_account_deletion mudou; prazo não encontrado'; end if;
  execute v_new;
end $$;

-- Elimina o que resta de dado pessoal das contas excluídas há mais que a carência. Guarda, anonimizado, o que a lei exige
-- (pedidos, pagamentos, notas, carteira, gorjetas, auditoria, consentimentos): o perfil fica como "Usuário excluído" para
-- servir de referência a esses registros. Conta sem nenhum registro desses some por inteiro (auth.users em cascata).
create or replace function private.purge_deleted_accounts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r record; v_count integer := 0; v_grace integer;
begin
  select account_deletion_grace_days into strict v_grace from private.noowe_company limit 1;
  for r in select id from public.profiles
    where deletion_requested_at <= p_now - make_interval(days => v_grace) and deleted_at is null
    order by deletion_requested_at limit 500
  loop
    begin
      delete from auth.users where id = r.id;
    exception when foreign_key_violation then
      -- Há registro financeiro/fiscal apontando para o perfil: a conta de login é desfeita e o perfil fica anônimo.
      update auth.users set email = 'deleted-' || r.id || '@deleted.local', phone = null, encrypted_password = '',
          raw_user_meta_data = '{}', banned_until = 'infinity', updated_at = p_now where id = r.id;
      delete from auth.identities where user_id = r.id;
      delete from auth.sessions where user_id = r.id;
      delete from auth.refresh_tokens where user_id = r.id::text;
      delete from auth.mfa_factors where user_id = r.id;
      delete from public.addresses where user_id = r.id;
      delete from public.biometric_tokens where user_id = r.id;
      delete from public.device_push_tokens where user_id = r.id;
      delete from public.favorites where user_id = r.id;
      delete from public.notifications where user_id = r.id;
      delete from public.payment_methods where user_id = r.id;
      delete from public.user_credentials where user_id = r.id;
      delete from public.password_reset_tokens where user_id = r.id;
      delete from public.customer_profiles where user_id = r.id;
      delete from public.review_reports where user_id = r.id;
      delete from public.reviews where user_id = r.id;
      delete from public.table_session_user_invites where inviter_id = r.id or invitee_id = r.id;
      delete from public.table_session_invites where created_by = r.id;
      delete from public.user_roles where user_id = r.id;
      delete from public.profile_roles where user_id = r.id;
      delete from private.customer_tax_documents where user_id = r.id;
      update public.profiles set full_name = 'Usuário excluído', email = 'deleted-' || r.id || '@deleted.local', phone = null,
          avatar_url = null, default_address = null, dietary_restrictions = null, favorite_cuisines = null, preferences = null,
          birth_date = null, google_id = null, apple_id = null, fcm_token = null, call_name = null, last_login_at = null,
          marketing_consent = false, biometric_enabled = false, is_active = false, deleted_at = p_now, updated_at = p_now
        where id = r.id;
    end;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.purge_deleted_accounts(timestamptz) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'account-purge';
select cron.schedule('account-purge', '30 6 * * *', 'select private.purge_deleted_accounts()');
