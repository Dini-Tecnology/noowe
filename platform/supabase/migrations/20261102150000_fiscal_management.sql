-- ADR-030 — Cadastro fiscal pela gerência no app do restaurante.
--
-- Dono e gerente leem e gravam o cadastro por RPC; `fiscal_configs` continua fechada para o
-- app. O token entra por aqui e vai direto para o Vault: nenhuma resposta o devolve, nem o
-- id do segredo, e a trilha de auditoria registra só que ele mudou. Certificado A1 e CSC
-- ficam na Focus.

-- A única forma do cadastro que sai do banco para o app.
create or replace function private.fiscal_config_view(p_config public.fiscal_configs)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cnpj', p_config.cnpj, 'ie', p_config.ie, 'razaoSocial', p_config.razao_social,
    'nomeFantasia', p_config.nome_fantasia, 'stateCode', p_config.state_code,
    'regimeTributario', p_config.regime_tributario, 'taxDefaults', p_config.tax_defaults,
    'environment', p_config.environment, 'serviceFeeInDocument', p_config.service_fee_in_document,
    'isActive', p_config.is_active, 'hasToken', p_config.focus_token_secret_id is not null)
$$;
revoke all on function private.fiscal_config_view(public.fiscal_configs) from public, anon, authenticated;

create or replace function public.restaurant_fiscal_get_config(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare c public.fiscal_configs;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]);
  select * into c from public.fiscal_configs where restaurant_id = p_restaurant_id;
  return jsonb_build_object(
    'config', case when c.id is null then null else private.fiscal_config_view(c) end,
    'openIssues', (select count(*) from public.fiscal_documents
      where restaurant_id = p_restaurant_id and status in ('blocked', 'rejected', 'failed')));
end $$;
revoke all on function public.restaurant_fiscal_get_config(uuid) from public, anon;
grant execute on function public.restaurant_fiscal_get_config(uuid) to authenticated;

-- Grava pelo mesmo caminho do provisionamento (`service_fiscal_configure`). O app não escolhe o
-- ambiente: cadastro novo nasce em homologação, e a ida para produção segue por service_role até
-- a homologação da Focus ser validada (ADR-030). Token em branco mantém o que está no Vault.
create or replace function public.restaurant_fiscal_save_config(
  p_restaurant_id uuid, p_config jsonb, p_focus_token text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  c public.fiscal_configs; v_after public.fiscal_configs;
  v_token text := nullif(btrim(coalesce(p_focus_token, '')), '');
  v_input jsonb := coalesce(p_config->'taxDefaults', '{}'::jsonb);
  v_cnpj text := regexp_replace(coalesce(p_config->>'cnpj', ''), '\D', '', 'g');
  v_state text := upper(btrim(coalesce(p_config->>'stateCode', '')));
  v_tax jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]);
  select * into c from public.fiscal_configs where restaurant_id = p_restaurant_id for update;

  if v_cnpj !~ '^\d{14}$' then raise exception 'Informe um CNPJ com 14 dígitos' using errcode = '22023'; end if;
  if v_state !~ '^[A-Z]{2}$' then raise exception 'Informe a UF com duas letras' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_config->>'razaoSocial', '')), '') is null then
    raise exception 'Informe a razão social' using errcode = '22023'; end if;
  if coalesce(p_config->>'regimeTributario', '') not in ('simples_nacional', 'lucro_presumido', 'lucro_real') then
    raise exception 'Regime tributário inválido' using errcode = '22023'; end if;
  -- Formato do layout da NFC-e. O NCM zerado conta como vazio na emissão, então não serve de padrão.
  if coalesce(v_input->>'ncm', '') !~ '^\d{8}$' or v_input->>'ncm' = '00000000' then
    raise exception 'Informe o NCM padrão com 8 dígitos' using errcode = '22023'; end if;
  if coalesce(v_input->>'cfop', '') !~ '^\d{4}$' then
    raise exception 'Informe o CFOP padrão com 4 dígitos' using errcode = '22023'; end if;
  if coalesce(v_input->>'icms_origem', '') !~ '^\d$' then
    raise exception 'Informe a origem do ICMS com 1 dígito' using errcode = '22023'; end if;
  if coalesce(v_input->>'icms_situacao_tributaria', '') !~ '^\d{2,3}$' then
    raise exception 'Informe a situação tributária do ICMS com 2 ou 3 dígitos' using errcode = '22023'; end if;
  if coalesce(v_input->>'pis_situacao_tributaria', '') !~ '^\d{2}$' then
    raise exception 'Informe a situação tributária do PIS com 2 dígitos' using errcode = '22023'; end if;
  if coalesce(v_input->>'cofins_situacao_tributaria', '') !~ '^\d{2}$' then
    raise exception 'Informe a situação tributária do COFINS com 2 dígitos' using errcode = '22023'; end if;
  if v_token is null and c.focus_token_secret_id is null then
    raise exception 'Informe o token da Focus NFe' using errcode = '22023'; end if;

  -- Só as chaves do formulário mudam: o que a tela não mostra (unidade, endereço) fica como está.
  v_tax := coalesce(c.tax_defaults, '{}'::jsonb) || jsonb_build_object(
    'ncm', v_input->>'ncm', 'cfop', v_input->>'cfop', 'icms_origem', v_input->>'icms_origem',
    'icms_situacao_tributaria', v_input->>'icms_situacao_tributaria',
    'pis_situacao_tributaria', v_input->>'pis_situacao_tributaria',
    'cofins_situacao_tributaria', v_input->>'cofins_situacao_tributaria');

  perform public.service_fiscal_configure(p_restaurant_id, jsonb_build_object(
    'cnpj', v_cnpj, 'ie', nullif(btrim(coalesce(p_config->>'ie', '')), ''),
    'razaoSocial', btrim(p_config->>'razaoSocial'),
    'nomeFantasia', nullif(btrim(coalesce(p_config->>'nomeFantasia', '')), ''),
    'stateCode', v_state, 'regimeTributario', p_config->>'regimeTributario',
    'taxDefaults', v_tax, 'endereco', coalesce(c.endereco, '{}'::jsonb),
    'environment', coalesce(c.environment, 'homologation'),
    'serviceFeeInDocument', coalesce((p_config->>'serviceFeeInDocument')::boolean, c.service_fee_in_document, false),
    'isActive', coalesce(c.is_active, true)), v_token);

  select * into v_after from public.fiscal_configs where restaurant_id = p_restaurant_id;
  perform private.log_audit(p_restaurant_id, 'fiscal.config_saved', 'fiscal_config', v_after.id,
    'Cadastro fiscal salvo pela gerência',
    case when c.id is null then null else private.fiscal_config_view(c) end,
    private.fiscal_config_view(v_after) || jsonb_build_object('tokenChanged', v_token is not null));
  return private.fiscal_config_view(v_after);
end $$;
revoke all on function public.restaurant_fiscal_save_config(uuid, jsonb, text) from public, anon;
grant execute on function public.restaurant_fiscal_save_config(uuid, jsonb, text) to authenticated;
