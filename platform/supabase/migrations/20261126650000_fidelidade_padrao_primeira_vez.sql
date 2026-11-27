-- QA 26/11: na primeira configuração da Fidelidade a tela vinha vazia, sem as faixas padrão.
-- Sem programa salvo, devolve as faixas dos defaults da própria tabela (fonte única dos valores).
create or replace function public.restaurant_get_loyalty_config(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);

  select to_jsonb(lc) into result
  from public.loyalty_configs lc
  where lc.restaurant_id = p_restaurant_id
  limit 1;

  if result is null then
    select jsonb_build_object('restaurant_id', p_restaurant_id, 'points_enabled', false, 'cashback_enabled', false)
           || coalesce(jsonb_object_agg(a.attname, pg_get_expr(d.adbin, d.adrelid)::bigint), '{}'::jsonb)
    into result
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.loyalty_configs'::regclass
      and a.attname in ('tier_silver_min_cents', 'tier_gold_min_cents', 'tier_platinum_min_cents');
  end if;

  return result;
end;
$$;
