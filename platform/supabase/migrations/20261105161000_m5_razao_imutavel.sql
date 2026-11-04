-- M5: as chaves com "set null" reescreviam linhas do razão imutável. Fatura e lote viram só referência. Apagar o restaurante inteiro continua possível.
alter table private.noowe_credit_ledger drop constraint noowe_credit_ledger_invoice_id_fkey;
alter table private.noowe_credit_ledger drop constraint noowe_credit_ledger_lot_id_fkey;
create or replace function private.credit_ledger_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'O razão de créditos é imutável' using errcode = '42501';
end $$;
