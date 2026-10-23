-- G3 / P3 — esquema de bill_shares e funções puras de divisão (ADR-001).
--
-- bill_shares substitui bill_split_plans (grão errado: um plano por pagante, sem
-- vínculo com o participante nem com os itens). Toda parcela pertence à sessão e
-- cobre itens por bill_share_lines, então "quanto falta por item" é sempre definido.

do $$ begin
  create type public.noowe_bill_share_status as enum
    ('open', 'pending_payment', 'paid', 'superseded', 'abandoned', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.noowe_session_billing_status as enum ('open', 'billing');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1. Sessão e participante
-- ---------------------------------------------------------------------------
alter table public.table_sessions
  add column if not exists billing_status public.noowe_session_billing_status not null default 'open',
  add column if not exists billing_started_at timestamptz,
  add column if not exists reopened_count integer not null default 0 check (reopened_count >= 0),
  add column if not exists reopened_at timestamptz;

alter table public.table_session_participants
  add column if not exists walkout_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. bill_shares / bill_share_lines / bill_item_claims
-- ---------------------------------------------------------------------------
create table if not exists public.bill_shares (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  participant_id uuid not null references public.table_session_participants(id) on delete restrict,
  round_no integer not null default 1 check (round_no > 0),
  mode public.noowe_split_mode not null,
  base_cents bigint not null check (base_cents >= 0),
  service_fee_cents bigint not null check (service_fee_cents >= 0),
  amount_cents bigint not null check (amount_cents > 0),
  tip_cents bigint not null default 0 check (tip_cents >= 0),
  tip_recipient_kind public.noowe_tip_allocation,
  tip_recipient_user_id uuid references public.profiles(id) on delete set null,
  status public.noowe_bill_share_status not null default 'open',
  payment_id uuid references public.gateway_transactions(id) on delete set null,
  payer_user_id uuid references public.profiles(id) on delete set null,
  committed_by uuid references public.profiles(id) on delete set null,
  idempotency_key uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_shares_amount_is_base_plus_fee check (amount_cents = base_cents + service_fee_cents),
  constraint bill_shares_tip_within_amount check (tip_cents <= amount_cents)
);

-- Uma parcela viva (aberta ou em pagamento) por participante.
create unique index if not exists bill_shares_one_live_per_participant
  on public.bill_shares(table_session_id, participant_id) where status in ('open', 'pending_payment');
create unique index if not exists bill_shares_commit_idempotency
  on public.bill_shares(committed_by, idempotency_key, participant_id) where idempotency_key is not null;
create index if not exists bill_shares_session_idx on public.bill_shares(table_session_id, status);

alter table public.gateway_transactions
  drop constraint if exists gateway_transactions_bill_share_fk,
  add constraint gateway_transactions_bill_share_fk
    foreign key (bill_share_id) references public.bill_shares(id) on delete set null;

create table if not exists public.bill_share_lines (
  bill_share_id uuid not null references public.bill_shares(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  base_cents bigint not null check (base_cents > 0),
  primary key (bill_share_id, order_item_id)
);
create index if not exists bill_share_lines_item_idx on public.bill_share_lines(order_item_id);

create table if not exists public.bill_item_claims (
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  participant_id uuid not null references public.table_session_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_item_id, participant_id)
);
create index if not exists bill_item_claims_session_idx on public.bill_item_claims(table_session_id);

alter table public.bill_shares enable row level security;
alter table public.bill_share_lines enable row level security;
alter table public.bill_item_claims enable row level security;
revoke all on public.bill_shares, public.bill_share_lines, public.bill_item_claims from anon, authenticated;
grant select on public.bill_shares, public.bill_share_lines, public.bill_item_claims to authenticated;

drop policy if exists bill_shares_select on public.bill_shares;
create policy bill_shares_select on public.bill_shares for select to authenticated
  using (private.is_table_session_participant(table_session_id)
    or private.has_restaurant_role(restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]));

drop policy if exists bill_share_lines_select on public.bill_share_lines;
create policy bill_share_lines_select on public.bill_share_lines for select to authenticated
  using (exists (select 1 from public.bill_shares s where s.id = bill_share_id
    and (private.is_table_session_participant(s.table_session_id)
      or private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]))));

drop policy if exists bill_item_claims_select on public.bill_item_claims;
create policy bill_item_claims_select on public.bill_item_claims for select to authenticated
  using (private.is_table_session_participant(table_session_id));

-- Realtime respeita RLS: participantes e garçom veem a marca pago / não pago ao vivo.
do $$
declare t text;
begin
  foreach t in array array['bill_shares', 'bill_item_claims'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Funções puras (immutable, só arrays): a propriedade "soma exata" vive aqui.
-- ---------------------------------------------------------------------------

-- Taxa de serviço sobre a base, meio para cima. Regra de arredondamento isolada
-- numa função só: trocá-la é mudar esta linha.
create or replace function private.service_fee_cents(p_base bigint, p_bps integer)
returns bigint language sql immutable as $$
  select div(p_base::numeric * p_bps + 5000, 10000)::bigint
$$;

-- Maior resto (Hamilton). A soma do resultado é exatamente p_total; cada valor
-- fica a no máximo 1 centavo do ideal; empate no resto vai para o menor índice.
create or replace function private.allocate_proportional(p_total bigint, p_weights bigint[])
returns bigint[] language plpgsql immutable as $$
declare
  n integer := coalesce(array_length(p_weights, 1), 0);
  w numeric; result bigint[]; leftover bigint;
begin
  if n = 0 then
    if p_total <> 0 then raise exception 'allocate_proportional: sem pesos para %', p_total using errcode = '22023'; end if;
    return '{}'::bigint[];
  end if;
  if p_total < 0 or exists (select 1 from unnest(p_weights) x where x < 0) then
    raise exception 'allocate_proportional: valor negativo' using errcode = '22023';
  end if;
  select sum(x) into w from unnest(p_weights) x;
  if w = 0 then
    if p_total <> 0 then raise exception 'allocate_proportional: pesos zerados para %', p_total using errcode = '22023'; end if;
    return array_fill(0::bigint, array[n]);
  end if;
  select array_agg(floor(p_total::numeric * wt / w)::bigint order by i)
    into result from unnest(p_weights) with ordinality as t(wt, i);
  select p_total - sum(x) into leftover from unnest(result) x;
  if leftover > 0 then
    with ranked as (
      select i, row_number() over (
        order by (p_total::numeric * wt - floor(p_total::numeric * wt / w) * w) desc, i) as rk
      from unnest(p_weights) with ordinality as t(wt, i)
    )
    select array_agg(result[i] + case when rk <= leftover then 1 else 0 end order by i)
      into result from ranked;
  end if;
  return result;
end $$;

-- ADR-001: divisão inteira; o resto vai, 1 centavo cada, aos primeiros da lista
-- (quem chama ordena por joined_at). max - min <= 1 sempre.
create or replace function private.split_equal(p_total bigint, p_ids uuid[])
returns table(participant_id uuid, cents bigint) language sql immutable as $$
  select id, (p_total / n) + case when i <= (p_total % n) then 1 else 0 end
  from unnest(p_ids) with ordinality as t(id, i),
       lateral (select greatest(coalesce(array_length(p_ids, 1), 1), 1)::bigint as n) c
$$;

-- Dado o valor total de cada parcela, separa base e taxa de forma que as bases
-- somem p_base_rem e as taxas somem o resto.
create or replace function private.decompose_amounts(p_amounts bigint[], p_base_rem bigint)
returns table(base_cents bigint, fee_cents bigint) language sql immutable as $$
  select b, a - b
  from unnest(p_amounts, private.allocate_proportional(p_base_rem, p_amounts)) as t(a, b)
$$;
