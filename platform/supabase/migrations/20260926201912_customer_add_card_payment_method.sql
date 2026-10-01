-- Cadastro de cartão de crédito/débito na carteira do cliente.
--
-- PCI: este RPC recebe SOMENTE metadados (bandeira, últimos 4 dígitos,
-- validade e nome impresso). O número completo e o CVV nunca chegam ao
-- backend nem são persistidos; a cobrança real exige tokenização no
-- provedor de pagamento (external_payment_method_id).

create or replace function public.customer_add_card_payment_method(
  p_card_type text,
  p_brand text,
  p_last_four text,
  p_exp_month text,
  p_exp_year text,
  p_holder_name text default null,
  p_set_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_card_type, '')));
  v_brand text := lower(trim(coalesce(p_brand, '')));
  v_month int;
  v_year int;
  v_make_default boolean;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;
  if v_type not in ('credit_card', 'debit_card') then
    raise exception 'Tipo de cartão inválido.' using errcode = '22023';
  end if;
  if p_last_four is null or p_last_four !~ '^[0-9]{4}$' then
    raise exception 'Cartão inválido.' using errcode = '22023';
  end if;
  if p_exp_month is null or p_exp_month !~ '^[0-9]{1,2}$'
     or p_exp_year is null or p_exp_year !~ '^[0-9]{2,4}$' then
    raise exception 'Validade inválida.' using errcode = '22023';
  end if;

  v_month := p_exp_month::int;
  v_year := case when length(p_exp_year) = 2 then 2000 + p_exp_year::int else p_exp_year::int end;
  if v_month < 1 or v_month > 12 then
    raise exception 'Validade inválida.' using errcode = '22023';
  end if;
  if make_date(v_year, v_month, 1) + interval '1 month' <= now() then
    raise exception 'Cartão vencido.' using errcode = '22023';
  end if;
  if v_brand = '' or length(v_brand) > 20 then
    v_brand := 'cartão';
  end if;

  if exists (
    select 1 from public.payment_methods
    where user_id = v_user_id and is_active and method_type = v_type
      and card_last_four = p_last_four and lower(coalesce(card_brand, '')) = v_brand
      and card_exp_month = lpad(v_month::text, 2, '0') and card_exp_year = v_year::text
  ) then
    raise exception 'Este cartão já está cadastrado.' using errcode = '23505';
  end if;

  v_make_default := p_set_default or not exists (
    select 1 from public.payment_methods where user_id = v_user_id and is_active
  );
  if v_make_default then
    update public.payment_methods set is_default = false, updated_at = now()
    where user_id = v_user_id and is_active;
  end if;

  insert into public.payment_methods (
    user_id, method_type, card_last_four, card_brand, card_exp_month, card_exp_year,
    is_default, metadata
  ) values (
    v_user_id, v_type, p_last_four, v_brand, lpad(v_month::text, 2, '0'), v_year::text,
    v_make_default,
    jsonb_build_object('holder_name', nullif(left(trim(coalesce(p_holder_name, '')), 60), ''))
  );

  return public.customer_get_wallet_snapshot();
end;
$$;

revoke all on function public.customer_add_card_payment_method(text, text, text, text, text, text, boolean) from public;
grant execute on function public.customer_add_card_payment_method(text, text, text, text, text, text, boolean) to authenticated;
