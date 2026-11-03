-- M1, segunda carga (respostas 23, 24, 26 e 28 do Pedro). Tudo comercial continua em tabela, com histórico e sem acesso
-- do restaurante: ver docs/PARAMETROS-NOOWE.md. Os valores seguem provisórios.

-- ---------------------------------------------------------------------------
-- 1. Valores que mudaram
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('noowe.param_author', 'migration: M1 segunda carga (respostas do Pedro, 03/11/2026)', true);
  -- Business: 8.000 pedidos por mês, com NFC-e na mesma franquia (resposta 24).
  update private.noowe_plans set order_allowance = 8000 where code = 'business';
  -- Conveniência em R$ 0 e desligada até o contador confirmar o formato da nota e a passagem pela conta do restaurante
  -- (resposta 28, pendência 38). O fluxo fica pronto: ligar é trocar estes dois valores.
  update private.noowe_convenience_fees set fee_cents = 0, enabled = false, note = 'Desligada até o contador confirmar (pendência 38)'
    where restaurant_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Teste e plano sugerido (resposta 26)
-- ---------------------------------------------------------------------------
alter table private.noowe_billing_settings
  add column trial_days integer not null default 30 check (trial_days >= 0);

-- O app só sugere; quem escolhe é o restaurante. Chave pelo modelo de serviço, e o código só lê a tabela.
create table private.noowe_plan_suggestions (
  service_model public.noowe_service_model primary key,
  plan_code text not null references private.noowe_plans(code) on update cascade
);

create or replace function private.suggested_plan_code(p_service_model public.noowe_service_model)
returns text language sql stable security definer set search_path = private, pg_temp as $$
  select s.plan_code from private.noowe_plan_suggestions s where s.service_model = p_service_model
$$;
revoke all on function private.suggested_plan_code(public.noowe_service_model) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Contrato por restaurante (Enterprise: "Sob consulta", resposta 24)
-- ---------------------------------------------------------------------------
-- Campo vazio herda o do plano. O Enterprise não tem preço de tabela, então o valor mora aqui.
create table private.noowe_restaurant_contracts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  plan_code text not null references private.noowe_plans(code) on update cascade,
  monthly_price_cents bigint check (monthly_price_cents >= 0),
  order_allowance integer check (order_allowance >= 0),
  overage_order_cents bigint check (overage_order_cents >= 0),
  note text
);

-- ---------------------------------------------------------------------------
-- 4. Dados da empresa NOOWE (resposta 28, pendência 34)
-- ---------------------------------------------------------------------------
-- Só o CNPJ foi informado. Os demais campos ficam vazios, e nenhuma nota é emitida sem eles.
create table private.noowe_company (
  id boolean primary key default true check (id),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  legal_name text,
  address text,
  municipal_registration text,
  tax_regime text
);

-- ---------------------------------------------------------------------------
-- 5. Fornecedor de Tap to Pay (resposta 11, pendência 37)
-- ---------------------------------------------------------------------------
-- Só o fornecedor ativo mora aqui. As credenciais ficam em segredo, nunca em tabela: o histórico copiaria o valor.
create table private.noowe_tap_settings (
  id boolean primary key default true check (id),
  provider text,
  active boolean not null default false,
  check (not active or provider is not null)
);

create or replace function private.tap_provider_active()
returns boolean language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((select t.active from private.noowe_tap_settings t), false)
$$;
revoke all on function private.tap_provider_active() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Fora do alcance de cliente e equipe, e com histórico
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['noowe_plan_suggestions', 'noowe_restaurant_contracts', 'noowe_company', 'noowe_tap_settings'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', t);
    execute format('create trigger trg_%s_history after insert or update or delete on private.%I
      for each row execute function private.noowe_param_record_change()', t, t);
    execute format('create trigger trg_%s_no_truncate before truncate on private.%I
      for each statement execute function private.noowe_param_refuse_truncate()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Carga
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('noowe.param_author', 'migration: M1 segunda carga (respostas do Pedro, 03/11/2026)', true);
  insert into private.noowe_plan_suggestions(service_model, plan_code) values
    ('quick_service', 'essencial'), ('casual_dining', 'profissional'), ('fine_dining', 'business');
  insert into private.noowe_company(cnpj) values ('64159447000190');
  insert into private.noowe_tap_settings(provider, active) values (null, false);
end $$;
