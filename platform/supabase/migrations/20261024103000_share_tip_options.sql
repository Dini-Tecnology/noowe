-- G3 / P4 — o app não faz aritmética de dinheiro: as sugestões de gorjeta (em % da parcela)
-- são calculadas aqui. Quem chama passa os percentuais; o servidor devolve os centavos.
create or replace function public.customer_share_tip_options(p_share_id uuid, p_percents integer[])
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from unnest(coalesce(p_percents, '{}')) x where x < 0 or x > 100) then
    raise exception 'Percentual inválido' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('percent', x, 'cents', div(s.amount_cents * x + 50, 100))
    order by x) from unnest(p_percents) x), '[]'::jsonb);
end $$;
revoke all on function public.customer_share_tip_options(uuid, integer[]) from public, anon;
grant execute on function public.customer_share_tip_options(uuid, integer[]) to authenticated;
