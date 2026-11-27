-- QA 26/11: cartão antigo, da página hospedada do Asaas, ficava ativo e "padrão" sem token. A lista o esconde (não dá
-- para cobrar sem token), então o cartão novo não virava padrão e nenhum aparecia como "Padrão". Desde a fase 2 todo
-- cartão salvo nasce com token; os que não têm deixam de valer.
update public.payment_methods pm
   set is_active = false, is_default = false, updated_at = now()
 where pm.method_type = 'credit_card' and pm.is_active
   and not exists (select 1 from public.payment_card_tokens t where t.payment_method_id = pm.id);

-- O padrão volta ao cartão com token mais recente de quem ficou sem padrão.
update public.payment_methods pm
   set is_default = true, updated_at = now()
 where pm.id in (
   select distinct on (c.user_id) c.id
     from public.payment_methods c
    where c.method_type = 'credit_card' and c.is_active
      and not exists (select 1 from public.payment_methods d where d.user_id = c.user_id and d.is_active and d.is_default)
    order by c.user_id, c.created_at desc);
