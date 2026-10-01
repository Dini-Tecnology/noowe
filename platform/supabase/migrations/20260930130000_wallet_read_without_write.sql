-- Ler a carteira não pode gravar na carteira.
--
-- private.ensure_customer_wallet resolvia a carteira existente com
-- `on conflict do update set updated_at = updated_at`. Mesmo sem mudar valor,
-- isso é um UPDATE: gera nova versão da linha e um evento no WAL. O app escuta
-- `wallets` pelo Realtime e recarrega o snapshot a cada evento, e o snapshot
-- chama ensure_customer_wallet de novo — o app ficava chamando
-- customer_get_wallet_snapshot a cada ~0,5 s enquanto a carteira estava aberta.
--
-- Agora a carteira existente é só lida; a gravação acontece uma única vez,
-- quando ela ainda não existe.

create or replace function private.ensure_customer_wallet(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_wallet_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select id into v_wallet_id
  from public.wallets
  where user_id = p_user_id and wallet_type = 'customer' and restaurant_id is null;
  if v_wallet_id is not null then
    return v_wallet_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));

  insert into public.wallets(user_id, restaurant_id, wallet_type)
  values (p_user_id, null, 'customer')
  on conflict (user_id, wallet_type) where user_id is not null and restaurant_id is null
  do nothing;

  select id into v_wallet_id
  from public.wallets
  where user_id = p_user_id and wallet_type = 'customer' and restaurant_id is null;

  return v_wallet_id;
end;
$$;

revoke all on function private.ensure_customer_wallet(uuid) from public;
