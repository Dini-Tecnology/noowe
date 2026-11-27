-- QA 26/11: nenhum cartão ativo sem token e todo cliente com cartão ativo tem um padrão.
begin;
select plan(2);

select is((select count(*)::int from public.payment_methods pm
            where pm.method_type = 'credit_card' and pm.is_active
              and not exists (select 1 from public.payment_card_tokens t where t.payment_method_id = pm.id)),
          0, 'nenhum cartão ativo sem token');

select is((select count(distinct c.user_id)::int from public.payment_methods c
            where c.method_type = 'credit_card' and c.is_active
              and not exists (select 1 from public.payment_methods d where d.user_id = c.user_id and d.is_active and d.is_default)),
          0, 'todo cliente com cartão ativo tem um padrão');

select * from finish();
rollback;
