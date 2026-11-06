-- A M2 tirou a comissão única (coluna platform_fee_bps de restaurant_payment_accounts), mas
-- service_payment_account_secrets ainda a lia. Em plpgsql isso só falha ao executar, e falhava
-- em toda chamada: payments-create, payments-webhook-asaas, payments-sync e a consulta de status
-- ficavam sem a chave da subconta. Encontrado no primeiro cadastro real no sandbox do Asaas.
-- A taxa agora é por meio de pagamento (private.noowe_pay_rate_bps) e nenhuma Edge Function lia
-- platformFeeBps, então a chave simplesmente sai da resposta.
create or replace function public.service_payment_account_secrets(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare v_acct public.restaurant_payment_accounts;
begin
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id;
  if v_acct.id is null then return null; end if;
  return jsonb_build_object('id', v_acct.id, 'restaurantId', v_acct.restaurant_id, 'status', v_acct.status,
    'walletId', v_acct.wallet_id,
    'webhookTokenHash', v_acct.webhook_token_hash, 'apiKey', private.payment_account_api_key(v_acct.id));
end $$;
