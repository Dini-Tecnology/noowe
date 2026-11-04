-- V1: pagamento misto com cartão só na gorjeta: a parcela não tem consumo, só gorjeta.
alter table public.bill_shares drop constraint bill_shares_amount_cents_check;
alter table public.bill_shares add constraint bill_shares_amount_cents_check check (amount_cents >= 0 and (amount_cents > 0 or tip_cents > 0));
alter table public.bill_shares drop constraint bill_shares_tip_within_amount;
alter table public.bill_shares add constraint bill_shares_tip_within_amount check (amount_cents = 0 or tip_cents <= amount_cents);
