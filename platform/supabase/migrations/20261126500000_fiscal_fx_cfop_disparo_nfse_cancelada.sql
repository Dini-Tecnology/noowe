-- QA Fiscal FX (26/11): CFOP do restaurante, nota que não sai nunca fica muda, NFS-e cancelada aparece cancelada.

-- FX-1: o default '5102' do item vencia sempre o CFOP configurado em fiscal_configs.tax_defaults.
-- Sem default, o item só leva CFOP próprio quando alguém o define; senão vale o do restaurante
-- (private.fiscal_emission_payload já faz coalesce(item, restaurante)).
-- shortcut: '5102' gravado à mão é indistinguível do default e também vira null; o restaurante com
-- CFOP padrão 5102 emite igual, e quem quiser 5102 num item diferente do padrão grava de novo.
alter table public.menu_items alter column cfop drop default, alter column cfop drop not null;
update public.menu_items set cfop = null where cfop = '5102';

-- FX-2: sem project_url/service_role_key no Vault o disparo falhava em silêncio e a nota ficava
-- 'pending' para sempre. Agora a varredura bloqueia com código próprio; o bloqueio dispara o aviso ao
-- dono e ao gerente (trg_fiscal_notify_issue, teste 49) e a nota aparece em "Notas com problema".
create or replace function private.fiscal_dispatch_due()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare v_id uuid; v_sent integer := 0;
begin
  for v_id in select * from private.fiscal_due_documents() loop
    if private.fiscal_post_emit(v_id) then
      v_sent := v_sent + 1;
    else
      perform private.fiscal_block(v_id, 'dispatch_unavailable', 'Envio ao emissor indisponível: a NOOWE precisa concluir a configuração. Reenvie depois.');
    end if;
  end loop;
  begin
    perform private.fiscal_reconcile_enqueues();
  exception when others then
    raise warning 'Reconciliação fiscal falhou: %', sqlerrm;
  end;
  return v_sent;
end $function$;

-- FX-3: NFS-e cancelada no Asaas (INVOICE_CANCELED) seguia 'issued' com o link da nota.
alter table public.subscription_invoices drop constraint if exists subscription_invoices_nfse_status_check;
alter table public.subscription_invoices add constraint subscription_invoices_nfse_status_check
  check (nfse_status in ('waiting_company_data', 'requested', 'issued', 'failed', 'cancelled'));
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'private.noowe_fee_notes'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%waiting_data%';
  execute format('alter table private.noowe_fee_notes drop constraint %I', c);
end $$;
alter table private.noowe_fee_notes add constraint noowe_fee_notes_status_check
  check (status in ('waiting_data', 'requested', 'issued', 'failed', 'cancelled'));

create or replace function public.service_nfse_result(p_invoice_id uuid, p_status text, p_url text default null::text, p_error text default null::text, p_provider_ref text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare i public.subscription_invoices;
begin
  if p_status not in ('issued', 'failed', 'cancelled') then raise exception 'Status de nota inválido' using errcode = '22023'; end if;
  select * into i from public.subscription_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  -- Cancelada é final. Aviso repetido ou fora de ordem não desfaz nota autorizada nem cancelada.
  if i.nfse_status = 'cancelled' or (i.nfse_status = 'issued' and p_status = 'failed') then return; end if;
  update public.subscription_invoices set nfse_status = p_status, nfse_url = coalesce(p_url, nfse_url),
      nfse_error = case when p_status = 'failed' then p_error else null end,
      nfse_provider_ref = coalesce(nfse_provider_ref, p_provider_ref)
    where id = i.id;
  if p_status <> 'issued' then
    perform private.log_system_audit(i.restaurant_id, 'billing.nfse_' || p_status, 'subscription_invoice', i.id,
      coalesce(p_error, case when p_status = 'cancelled' then 'Nota cancelada' else 'Nota recusada' end), null, null);
  end if;
end $function$;

create or replace function public.service_fee_note_result(p_note_id uuid, p_status text, p_url text default null::text, p_error text default null::text, p_provider_ref text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare n private.noowe_fee_notes;
begin
  if p_status not in ('issued', 'failed', 'cancelled') then raise exception 'Status de nota inválido' using errcode = '22023'; end if;
  select * into n from private.noowe_fee_notes where id = p_note_id for update;
  if n.id is null then raise exception 'Nota não encontrada' using errcode = 'P0002'; end if;
  if n.status = 'cancelled' or (n.status = 'issued' and p_status = 'failed') then return; end if;
  update private.noowe_fee_notes set status = p_status, url = coalesce(p_url, url),
      error = case when p_status = 'failed' then p_error else null end,
      provider_ref = coalesce(provider_ref, p_provider_ref), updated_at = now()
    where id = n.id;
  if p_status <> 'issued' then
    perform private.log_system_audit(n.restaurant_id, 'billing.fee_note_' || p_status, 'noowe_fee_note', n.id,
      coalesce(p_error, case when p_status = 'cancelled' then 'Nota cancelada' else 'Nota recusada' end), null, jsonb_build_object('kind', n.kind));
  end if;
end $function$;
