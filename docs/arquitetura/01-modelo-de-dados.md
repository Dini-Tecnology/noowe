# Modelo de dados — Postgres / Supabase

Derivado de spec §2.2, §2.6 e §7.2. Este arquivo define **as invariantes que precisam viver no
banco**, não a migration completa — a migration é gerada pela fatia correspondente.

## Convenções obrigatórias

- Chaves primárias `uuid default gen_random_uuid()`.
- **Dinheiro: `bigint`, em centavos, nome sempre terminado em `_cents`.** Nunca `numeric`,
  nunca `float`. Ver `04-calculo-financeiro.md`.
- Toda tabela de negócio tem `establishment_id uuid not null` — é a chave de tenancy e a base
  de toda política RLS.
- `created_at timestamptz not null default now()` em tudo.
- Enums como tipo Postgres (`create type`), não `text` livre.

## Entidades

### Núcleo (spec §2.2)

| Tabela | Campos que importam | Nota |
|---|---|---|
| `establishments` | `service_models[]`, `timezone` | `service_models` é a lista habilitada (ADR-003) |
| `establishment_config` | 1:1 com establishment, todos os parâmetros de §7.1 | ver `03-config-service-model.md` |
| `staff_members` | `user_id`, `establishment_id`, `role` | enum: dono, gerente, maitre, chef, cozinheiro, barman, garcom. No banco é `user_roles`. Um estabelecimento tem **um ou mais donos** e um dono pode ter **vários estabelecimentos** (ADR-015) |
| `tables` | `number`, `seats`, `status`, `merged_into_id` | `merged_into_id` sustenta junção de mesas |
| `stations` | `type` (cozinha/bar), `name` | roteamento de item vem daqui |
| `menu_items` | `station_id`, `price_cents`, `prep_time_min`, `available`, `allergens[]` | `available` é o bloqueio do chef |
| `orders` | `service_model`, `table_session_id`, `pickup_code`, `status`, `source`, `idempotency_key` | ver constraints abaixo |
| `order_items` | `menu_item_id`, `participant_id`, `station_id`, `item_status`, `unit_price_cents`, `qty`, `notes` | `participant_id` é o que sustenta o split |
| `notifications` | `type`, `payload jsonb`, `read_at` | |
| `audit_log` | `actor_id`, `action`, `reason`, `entity`, `entity_id`, `before jsonb`, `after jsonb` | escrito na mesma transação da ação |

### Motor de grupo (spec §2.6)

| Tabela | Campos que importam |
|---|---|
| `table_sessions` | `table_id`, `status` (open/billing/closed), `host_participant_id`, `capacity`, `reservation_id`, `queue_entry_id`, `opened_at`, `closed_at`, `reopened_count` |
| `guest_links` | `session_id`, `token_hash`, `short_code_hash`, `expires_at`, `max_uses`, `uses`, `created_by`, `revoked_at` |
| `session_participants` | `session_id`, `user_id` (nullable), `display_name`, `role` (host/guest), `seat_count`, `joined_at`, `status` |
| `capacity_requests` | `session_id`, `requested_seat_count`, `status`, `decided_by`, `decision_reason`, `expires_at` |
| `table_session_user_invites` (ADR-011) | `table_session_id`, `inviter_id`, `invitee_id`, `status` (pending/awaiting_capacity/accepted/declined/cancelled/expired/capacity_rejected), `closed_reason`, `expires_at`, `capacity_request_id`. Índice único parcial: um convite em aberto por (sessão, convidado) |

> **Estado real (G2b, 2026-09-26):** `capacity_requests` existe com `table_session_id`,
> `requested_user_id`, `source`, `seat_count`, `status`, `decision_reason`, `decided_by`,
> `expires_at`. `table_session_participants.seat_count` existe (default 1).
> `profiles.username` é único, normalizado e só muda pela RPC `customer_set_my_username`.

### Entrada, conta e fidelidade

| Tabela | Campos que importam |
|---|---|
| `reservations` | `party_size`, `scheduled_at`, `status`, `phone`, `notes`, `occasion` |
| `queue_entries` | `party_size`, `preferences jsonb`, `position`, `called_at`, `tolerance_expires_at` |
| `bill_shares` | `session_id`, `participant_id`, `mode`, `amount_cents`, `tip_cents`, `status`, `payment_id` |
| `payments` | `provider`, `provider_ref`, `amount_cents`, `status`, `idempotency_key` |
| `loyalty_accounts` | `user_id`, `establishment_id`, `points`, `tier`, `stamps` |
| `loyalty_transactions` | `bill_share_id` **ou** `order_id`, `points_delta`, `stamps_delta` |

## Invariantes que PRECISAM estar no banco

A spec §7.2 é explícita: "a restrição precisa ser garantida no banco, não apenas na aplicação".

```sql
-- 1. Uma única sessão aberta por mesa  (spec §2.6, CLAUDE.md invariante 3)
create unique index one_open_session_per_table
  on table_sessions (table_id)
  where status in ('open', 'billing');

-- 2. Sessão só abre com origem de entrada rastreável  (ADR-008, spec §3.6)
alter table table_sessions add constraint session_needs_entry_origin
  check (reservation_id is not null or queue_entry_id is not null);

-- 3. Pedido quick nunca tem sessão de mesa, e vice-versa  (ADR-003)
alter table orders add constraint order_model_coherence check (
  (service_model = 'quick_service' and table_session_id is null and pickup_code is not null)
  or
  (service_model <> 'quick_service' and table_session_id is not null and pickup_code is null)
);

-- 4. Idempotência de pedido e de pagamento  (spec §7.3)
create unique index orders_idempotency   on orders   (establishment_id, idempotency_key);
create unique index payments_idempotency on payments (establishment_id, idempotency_key);

-- 5. Dinheiro nunca negativo, exceto estorno explícito
alter table order_items add constraint positive_price check (unit_price_cents >= 0);
alter table bill_shares add constraint positive_share check (amount_cents >= 0);

-- 6. Um bill_share gera no máximo um crédito de fidelidade  (ADR-005)
create unique index one_loyalty_per_share
  on loyalty_transactions (bill_share_id) where bill_share_id is not null;

-- 7. Código de retirada único por estabelecimento por dia  (spec §5.6)
create unique index pickup_code_per_day
  on orders (establishment_id, pickup_code, (created_at::date))
  where pickup_code is not null;

-- 8. Anfitrião existe e tem conta  (ADR-006)
--    session_participants.user_id não pode ser null quando role = 'host'
alter table session_participants add constraint host_must_have_account
  check (role <> 'host' or user_id is not null);
```

## Fechamento de conta: a checagem que não pode faltar

O critério de aceite da spec §3.6 — "a soma das parcelas é exatamente igual ao total" — precisa
ser verificado no momento de fechar, dentro da transação:

```sql
-- Ao mover a sessão para 'closed':
--   sum(bill_shares.amount_cents + tip_cents) where status='paid'  ==  total da sessão
-- Divergência de 1 centavo aborta a transação. Não arredonde aqui.
```

Implementar como trigger `before update` em `table_sessions` quando `status` vira `closed`, ou
dentro da RPC de fechamento. **Não** deixar essa verificação só no cliente.

## Status do pedido é derivado (CLAUDE.md invariante 5)

`orders.status` não é escrito diretamente por nenhuma tela. É recalculado por trigger a partir
de `order_items.item_status`:

- algum item `pending` → `confirmed`
- algum item `preparing` → `preparing`
- **todos** os itens de **todas** as estações `ready` → `ready`  ← a convergência da spec §2.3
- todos `delivered` → `delivered`

Cozinha e bar produzem em paralelo; o pedido só converge quando ambos terminam.
