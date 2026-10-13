-- ADR-017: descoberta multi-modelo. O cliente precisa saber todos os modelos de um
-- restaurante (Casual + Quick) sem ler restaurant_model_configs, que é só da equipe.
-- restaurants.service_models é derivada de service_type/service_config.active_types
-- pela mesma função que já alimenta restaurant_model_configs.

alter table public.restaurants
  add column if not exists service_models public.noowe_service_model[];

create or replace function private.sync_restaurant_service_models()
returns trigger language plpgsql
set search_path = public, private, pg_temp as $$
begin
  new.service_models := private.noowe_models_from_restaurant(new.service_type, new.service_config);
  return new;
end $$;

drop trigger if exists restaurants_sync_service_models on public.restaurants;
create trigger restaurants_sync_service_models
before insert or update of service_type, service_config on public.restaurants
for each row execute function private.sync_restaurant_service_models();

update public.restaurants r
set service_models = private.noowe_models_from_restaurant(r.service_type, r.service_config)
where service_models is distinct from private.noowe_models_from_restaurant(r.service_type, r.service_config);

create index if not exists idx_restaurants_service_models on public.restaurants using gin (service_models);
