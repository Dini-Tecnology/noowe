-- G3 — congela o split antigo (bill_split_plans). Substituído por bill_shares.
--
-- O modelo antigo arredondava a parcela igual para cima (cria centavos, ADR-001), calculava a
-- taxa por parcela (a soma podia não bater) e não lia split_fixed_remainder (ADR-010). Nenhum
-- código do app nem teste usa estas RPCs. customer_pay_bill_share ainda estava executável por
-- anon (grant sem revoke de public).
revoke execute on function public.customer_split_preview(uuid, public.noowe_split_mode, bigint, uuid[], integer)
  from public, anon, authenticated;
revoke execute on function public.customer_split_commit(uuid, public.noowe_split_mode, uuid, bigint, uuid[], integer)
  from public, anon, authenticated;
revoke execute on function public.customer_pay_bill_share(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on public.bill_split_plans from anon, authenticated;
comment on table public.bill_split_plans is
  'CONGELADA (G3): substituída por bill_shares. Não escrever.';
