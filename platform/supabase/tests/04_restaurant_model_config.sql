-- Fundação de modelos de serviço: configuração canônica, isolamento e contrato
-- de capabilities. Estes testes verificam o esquema; os fluxos que a consomem
-- entram nas próximas fatias.

begin;
select plan(12);

select ok(
  to_regclass('public.restaurant_model_configs') is not null,
  'existe uma configuração canônica por restaurante'
);

select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.restaurant_model_configs'::regclass),
  'restaurant_model_configs tem RLS'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.restaurant_model_configs'::regclass
      and contype = 'p'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.restaurant_model_configs'::regclass
           and attname = 'restaurant_id'
           and not attisdropped)
      ]
  ),
  'restaurant_id é a chave 1:1 da configuração'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.restaurant_model_configs'::regclass
      and conname = 'restaurant_model_configs_service_models_valid'
  ),
  'lista de modelos não pode ser vazia ou duplicada'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.restaurant_model_configs'::regclass
      and conname = 'restaurant_model_configs_room_entry_valid'
  ),
  'modelo de sala exige reserva ou fila'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.restaurant_model_configs'::regclass
      and conname = 'restaurant_model_configs_quick_is_prepaid'
  ),
  'quick service exige pré-pagamento'
);

select ok(
  to_regprocedure('public.get_restaurant_model_capabilities(uuid,public.noowe_service_model)') is not null,
  'RPC canônica de capabilities existe'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_restaurant_model_capabilities(uuid,public.noowe_service_model)',
    'execute'
  ),
  'cliente pode consultar capabilities sem acesso direto à configuração'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_model_configs'
      and policyname = 'restaurant_model_configs_managers_write'
  ),
  'apenas gestor/dono pode alterar configuração diretamente'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.restaurants'::regclass
      and tgname = 'restaurants_create_model_config'
      and not tgisinternal
  ),
  'novos restaurantes ganham configuração canônica automaticamente'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.restaurants'::regclass
      and tgname = 'restaurants_sync_model_config'
      and not tgisinternal
  ),
  'mudar o modelo por qualquer RPC mantém a configuração canônica alinhada'
);

select ok(
  not has_function_privilege('authenticated', 'private.ensure_restaurant_model_config(uuid)', 'execute'),
  'cliente não cria nem altera configuração pelo helper interno'
);

select * from finish();
rollback;
