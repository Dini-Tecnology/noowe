-- F6 — cartão salvo (Asaas, checkout hospedado).
-- O número do cartão nunca passa pelo nosso servidor: o cliente paga na página do Asaas e, com o
-- consentimento ("salvar este cartão"), o webhook de pagamento confirmado traz o token. Só o token
-- fica guardado, numa tabela privada que o app não lê; o app vê apenas bandeira e final.

create table if not exists public.payment_card_tokens (
  payment_method_id uuid primary key references public.payment_methods(id) on delete cascade,
  payment_account_id uuid not null,
  provider text not null default 'asaas',
  token text not null check (length(token) between 8 and 200),
  created_at timestamptz not null default now()
);
alter table public.payment_card_tokens enable row level security;
revoke all on public.payment_card_tokens from anon, authenticated;

-- Cartão removido (is_active = false) perde o token: nada mais cobra nele.
create or replace function private.drop_card_token_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.is_active = false and old.is_active is distinct from false then
    delete from public.payment_card_tokens where payment_method_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_drop_card_token_on_deactivate on public.payment_methods;
create trigger trg_drop_card_token_on_deactivate after update of is_active on public.payment_methods
  for each row execute function private.drop_card_token_on_deactivate();

-- Marca a cobrança com a escolha do cliente: salvar o cartão e/ou qual cartão salvo foi usado.
create or replace function public.service_payment_set_card_options(
  p_payment_id uuid, p_user_id uuid, p_save_card boolean, p_payment_method_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_payment_method_id is not null and not exists (
    select 1 from public.payment_methods pm
    where pm.id = p_payment_method_id and pm.user_id = p_user_id and pm.is_active and pm.method_type = 'credit_card'
  ) then
    raise exception 'Payment method not found' using errcode = 'P0002';
  end if;
  update public.gateway_transactions
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('save_card', coalesce(p_save_card, false))
      || case when p_payment_method_id is null then '{}'::jsonb
              else jsonb_build_object('card_payment_method_id', p_payment_method_id) end,
        updated_at = now()
    where id = p_payment_id and customer_id = p_user_id and provider = 'asaas'
      and payment_method = 'credit_card' and status in ('creating', 'pending');
  if not found then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
end;
$$;

-- Webhook de pagamento confirmado com cartão: guarda o token se (e só se) o cliente consentiu.
create or replace function public.service_payment_save_card(
  p_payment_id uuid, p_token text, p_brand text, p_last4 text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  tx public.gateway_transactions;
  v_pm uuid;
  v_brand text := nullif(btrim(p_brand), '');
begin
  select * into tx from public.gateway_transactions where id = p_payment_id and provider = 'asaas';
  if tx.id is null or coalesce(tx.metadata->>'save_card', 'false') <> 'true'
     or tx.customer_id is null or tx.payment_account_id is null then
    return jsonb_build_object('saved', false);
  end if;
  if p_token is null or length(btrim(p_token)) < 8 or p_last4 is null or p_last4 !~ '^\d{4}$' then
    return jsonb_build_object('saved', false);
  end if;

  -- Mesmo cartão (bandeira + final) reaproveita o registro e só renova o token.
  select pm.id into v_pm from public.payment_methods pm
    where pm.user_id = tx.customer_id and pm.method_type = 'credit_card' and pm.is_active
      and pm.card_last_four = p_last4 and lower(coalesce(pm.card_brand, '')) = lower(coalesce(v_brand, ''))
    order by pm.created_at desc limit 1;
  if v_pm is null then
    insert into public.payment_methods(user_id, method_type, card_last_four, card_brand, is_default)
    values (tx.customer_id, 'credit_card', p_last4, v_brand,
      not exists (select 1 from public.payment_methods d where d.user_id = tx.customer_id and d.is_active and d.is_default))
    returning id into v_pm;
  end if;
  insert into public.payment_card_tokens(payment_method_id, payment_account_id, provider, token)
  values (v_pm, tx.payment_account_id, 'asaas', btrim(p_token))
  on conflict (payment_method_id) do update
    set token = excluded.token, payment_account_id = excluded.payment_account_id, created_at = now();
  return jsonb_build_object('saved', true, 'paymentMethodId', v_pm);
end;
$$;

-- Token de um cartão salvo para cobrar de novo. Só o servidor lê; nunca volta ao app.
create or replace function public.service_payment_card_token(
  p_user_id uuid, p_payment_method_id uuid, p_account_id uuid
) returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select t.token from public.payment_card_tokens t
  join public.payment_methods pm on pm.id = t.payment_method_id
  where pm.id = p_payment_method_id and pm.user_id = p_user_id and pm.is_active
    and t.payment_account_id = p_account_id
$$;

revoke all on function public.service_payment_set_card_options(uuid, uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.service_payment_save_card(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.service_payment_card_token(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_payment_set_card_options(uuid, uuid, boolean, uuid) to service_role;
grant execute on function public.service_payment_save_card(uuid, text, text, text) to service_role;
grant execute on function public.service_payment_card_token(uuid, uuid, uuid) to service_role;

-- Cartões salvos que dá para usar em um toque: o app vê bandeira e final, nunca o token.
create or replace function public.customer_list_saved_cards()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pm.id, 'brand', pm.card_brand, 'lastFour', pm.card_last_four, 'isDefault', pm.is_default)
      order by pm.is_default desc, pm.created_at desc)
    from public.payment_methods pm
    join public.payment_card_tokens t on t.payment_method_id = pm.id
    where pm.user_id = auth.uid() and pm.is_active and pm.method_type = 'credit_card'
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.customer_list_saved_cards() from public, anon;
grant execute on function public.customer_list_saved_cards() to authenticated;
