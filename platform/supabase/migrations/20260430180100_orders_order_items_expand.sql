-- Expandir pedidos para campos esperados pela API mobile / modelo legado sem Nest.
-- Mantém customer_id (bootstrap); expõe user_id como coluna gerada equivalente.

-- ─── Novos valores nos enums já criados no bootstrap ─────────────────────────
-- Requer Postgres ≥15 para ADD VALUE IF NOT EXISTS (Supabase padrão).

alter type public.orders_status_enum add value if not exists 'delivering';
alter type public.orders_status_enum add value if not exists 'open_for_additions';
alter type public.orders_order_type_enum add value if not exists 'tab';
alter type public.orders_order_type_enum add value if not exists 'table_tab';

-- ─── orders — colunas adicionais ────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) then
    alter table public.orders
      add column user_id uuid generated always as (customer_id) stored;
  end if;
end $$;

alter table public.orders add column if not exists waiter_id uuid;
alter table public.orders add column if not exists party_size integer not null default 1;

alter table public.orders add column if not exists subtotal numeric(10, 2);
alter table public.orders add column if not exists tax_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists tip_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists discount_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(10, 2);

alter table public.orders add column if not exists special_instructions text;
alter table public.orders add column if not exists delivery_phone text;

-- Snapshot texto do endereço (bootstrap já usa delivery_address jsonb)
alter table public.orders add column if not exists delivery_address_text text;

alter table public.orders add column if not exists estimated_ready_at timestamptz;
alter table public.orders add column if not exists actual_ready_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;

alter table public.orders add column if not exists is_shared boolean not null default false;
alter table public.orders add column if not exists payment_split_mode text;

alter table public.orders add column if not exists source varchar(20) not null default 'noowe';
alter table public.orders add column if not exists source_order_id varchar(255);
alter table public.orders add column if not exists delivery_rider_eta timestamptz;

comment on column public.orders.user_id is 'Espelho de customer_id para compatibilidade com APIs que usam user_id.';
comment on column public.orders.delivery_address_text is 'Endereço em texto livre; delivery_address (jsonb) permanece para estrutura completa.';

-- ─── order_items — colunas adicionais ───────────────────────────────────────

alter table public.order_items add column if not exists ordered_by uuid;
alter table public.order_items add column if not exists ordered_by_name varchar(100);
alter table public.order_items add column if not exists prepared_by uuid;
alter table public.order_items add column if not exists prepared_at timestamptz;
alter table public.order_items add column if not exists station_id uuid;
alter table public.order_items add column if not exists fire_at timestamptz;
alter table public.order_items add column if not exists expected_ready_at timestamptz;
alter table public.order_items add column if not exists course varchar(20);

create index if not exists idx_orders_waiter_id on public.orders(waiter_id);
create index if not exists idx_order_items_ordered_by on public.order_items(ordered_by);
create index if not exists idx_order_items_station_id on public.order_items(station_id);
