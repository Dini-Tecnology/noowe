-- N4 / P1 — valores de enum do livro-razão de pagamentos.
-- Arquivo separado: ALTER TYPE ... ADD VALUE não pode ser usado na mesma
-- transação em que o valor novo é referenciado.

alter type public.noowe_payment_status add value if not exists 'refund_pending';

do $$ begin
  create type public.noowe_payment_purpose as enum ('order', 'bill_share');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.noowe_payment_account_status as enum
    ('creating', 'pending_kyc', 'active', 'rejected', 'disabled');
exception when duplicate_object then null; end $$;
