# Glossário spec → banco

**Decisão:** T-X-01, 14/09/2026. O banco mantém o próprio vocabulário. A spec, as fatias e os ADRs
continuam usando os nomes do documento. Esta tabela é a tradução oficial entre os dois.

> **Regra de uso:** código, migrations e RPCs usam só a coluna "No banco". Um nome da coluna
> "Na spec" aparecendo em SQL ou TypeScript é bug de revisão — é assim que as duplicações da
> reconciliação (§2.10) começaram.

## Entidades

| Na spec | No banco | Observação |
|---|---|---|
| Establishment, estabelecimento, unidade | `restaurants` | |
| `establishment_config` | hoje espalhada em `restaurant_configs`, `restaurant_service_configs` e `restaurants.service_config` | T-F3-01 consolida numa tabela 1:1 com `restaurants`, com prefixo `restaurant_` |
| `service_model`, `service_models[]` | `restaurants.service_type` (escalar) | ADR-003 transforma em lista |
| `staff_members` | `user_roles` | papel em `user_roles_role_enum` |
| Table | `tables` | |
| TableSession | `table_sessions` | uma aberta por mesa: `uq_table_sessions_one_active_per_table` |
| SessionParticipant, `session_participants` | `table_session_participants` | anfitrião marcado por `is_host` |
| GuestLink | `table_session_invites` | T-G2-03 troca `token` por hash |
| `participantId`, `guestId` do item | `order_items.diner_id` | |
| Reservation | `reservations` | |
| Convidado da reserva | `reservation_guests` | |
| Fila virtual, `queue_entry` | `waitlist_entries` | ADR-009; `queue_entries` é da balada e está congelada |
| `queue_entry_id` (origem da sessão, ADR-008) | `waitlist_entry_id` | coluna nova em T-G1-01 |
| Order, OrderItem | `orders`, `order_items` | |
| Estação (cozinha, bar) | `cook_stations` | T-N1-01 cria a FK a partir de `menu_items.station_id` |
| Chamado (`waiter.call`) | `service_calls` | `waiter_calls` está congelada |
| Notification | `notifications` | |
| LoyaltyAccount | `loyalty_programs` (pontos, nível) + `stamp_cards` (selos) | T-P1-01 unifica |
| `audit_log` | `audit_logs` | T-F2-03 acrescenta `restaurant_id`, `reason`, `before`, `after` |
| `bill_shares` | não existe | nasce em T-G3-02 com o nome da spec; `payment_splits` está congelada |
| `capacity_requests` | não existe | nasce em T-G2-02 com o nome da spec |

Nomes que ainda não existem em nenhum dos dois lados nascem com o nome da spec, porque não há
conflito a traduzir.

## Funções de acesso

| Na spec | No banco |
|---|---|
| `auth_establishment_ids()` | `private.user_restaurant_ids()` e `private.jwt_restaurant_ids()` — a canônica é definida em T-F1-05 |
| `auth_role_in(...)` | `private.has_restaurant_role(restaurant_id, roles[])` |

## Papéis (§2.4)

| Na spec | `user_roles_role_enum` |
|---|---|
| Dono | `owner` |
| Gerente | `manager` |
| Maitre | `maitre` |
| Chef | `chef` |
| Cozinheiro | `cook` |
| Barman | `barman` |
| Garçom | `waiter` |
