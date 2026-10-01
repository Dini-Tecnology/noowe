# Reconciliação — spec × repositório

**Data:** 2026-09-03 · **Branch:** `recovery-fix` · **HEAD:** `bbd69c5`
**Procedimento:** `docs/01-RECONCILIACAO.md` · **Fatias:** `docs/fatias/README.md`

> Este documento **descreve**. Não decide nada sobre as divergências, conforme o procedimento.
> Toda referência é `caminho:linha` relativa à raiz do repositório.

---

## 0. Sumário executivo

| Classificação | Fatias |
|---|---|
| COMPLETA | — (nenhuma) |
| PARCIAL | N1, N3, E1, E2, G1, S1, C1, D1, P2 |
| DIVERGENTE | F1, F2, F3, N2, N4, G2, G3, P1 |
| AUSENTE | Q1 (parcial em UI, ausente em banco/servidor — ver §1.14) |

**O achado estrutural:** o repositório não é um MVP parcial das 18 fatias. É um produto
adjacente, construído sobre um vocabulário diferente (`restaurants` em vez de
`establishments`, `restaurant_configs` em vez de `establishment_config`,
`table_session_participants` em vez de `session_participants`), que **cobre bem a superfície
de telas** e **contradiz seis das dez invariantes** de `CLAUDE.md`.

Invariantes violadas, em ordem de custo de correção:

| # | Invariante | Estado |
|---|---|---|
| 1 | Dinheiro é `bigint` em centavos | **Violada.** 105 colunas monetárias em `numeric`. Zero `bigint`. |
| 2 | Servidor calcula todo valor cobrado | **Violada em parte.** `place_order` calcula; taxa, gorjeta, split e combo são calculados no app. |
| 3 | Uma sessão aberta por mesa | **Atendida.** Índice único parcial existe. |
| 4 | Soma das parcelas == total | **Não implementada.** Não existe `bill_shares` nem `split_commit`. |
| 5 | `orders.status` derivado dos itens | **Invertida.** Existe trigger que propaga o status do pedido **para** os itens. |
| 6 | Quick Service não produz sem pagamento | **Não implementada.** Não existe gate de pagamento. |
| 7 | Estouro de capacidade nunca silencioso | **Não implementada.** Não existe `capacity_requests` nem `seat_count`. |
| 8 | Toda ação sensível deixa rastro | **Violada.** `audit_logs` existe e tem **zero** `insert` em todo o schema. |
| 9 | RLS em toda tabela de negócio | **Violada.** 67 de 120 tabelas sem `enable row level security`. |
| 10 | Pedido e pagamento idempotentes | **Violada.** `place_order` não aceita chave; as chaves do app são geradas por request. |

---

## 1. Fatia a fatia

### 1.1 F1 — Tenancy, papéis e RLS — **DIVERGENTE**

**O que existe**
- Enum de papel em `platform/supabase/migrations/20260427101000_create_core_bootstrap_tables.sql:15`
  (`owner, manager, chef, waiter, barman, maitre`), `cook` acrescentado em
  `20260713160000_add_cook_role_enum.sql`.
- Helper de tenancy unificado: `private.has_restaurant_role(restaurant_id, roles[])` em
  `20260709121000_unify_has_restaurant_role.sql:13-49`, `security definer`, usado
  consistentemente nas RPCs.
- RLS e políticas por papel: `20260622120000_supabase_auth_roles_rls.sql`,
  `20260624120000_harden_auth_role_policies.sql`, `20260709120000_tables_rls_policies.sql`.
- Roteamento por papel no app: `apps/restaurant/src/screens/v2/RoleDashboardScreen.tsx`.

**Divergência**
1. **A entidade é `restaurants`, não `establishments`.** Não existe `staff_members` — o vínculo
   é `user_roles` (`20260427101000:...`). Não existem `auth_establishment_ids()` nem
   `auth_role_in()`. É renomeação, não ausência, mas todo o restante da spec referencia os
   nomes da spec.
2. **Critério de aceite 6 falha.** 67 das 120 tabelas criadas não têm
   `enable row level security` em nenhuma migration. Lista completa em §3.4.
3. **Critério 3 não é RLS.** O recorte "garçom vê só as próprias mesas" existe apenas dentro de
   RPCs (`20260624210000_waiter_operations_rpc.sql:70`,
   `20260721171000_customer_assistance_backend.sql:403,429,465`), não como política de linha
   em `public.tables`. Um `select` direto via PostgREST não é filtrado por
   `assigned_waiter_id`.
4. **Critério 4 não tem substrato.** `cook_stations`
   (`20260430180000_generated_rest_platform_tables.sql:762`) existe, mas não há política nem
   canal Realtime por estação — `order_items` é publicado inteiro
   (`20260624210000_waiter_operations_rpc.sql:255`).
5. **Nenhum teste** varre `pg_tables` procurando RLS desabilitado. Não existe suíte SQL no
   repositório.

---

### 1.2 F2 — Dinheiro, auditoria e idempotência — **DIVERGENTE**

Esta é a divergência mais cara do repositório. As três fundações estão ausentes ou invertidas.

**Dinheiro** — critério 1 falha integralmente.
- **105 colunas monetárias em `numeric`**, nenhuma em `bigint`. Concentração em
  `20260430180000_generated_rest_platform_tables.sql` (~80 colunas) e
  `20260427101000_create_core_bootstrap_tables.sql`.
- As duas únicas colunas com sufixo `_cents` também são `numeric`:
  `gateway_transactions.amount_cents` e `.refunded_amount_cents`
  (`20260430180000_generated_rest_platform_tables.sql:925,932`).
- Não existe domínio, tipo `Money` compartilhado, nem `check (>= 0)`.
- Detalhe por arquivo/linha em §3.1.

**Auditoria** — critério 4 falha integralmente.
- `audit_logs` existe (`20260430180000_generated_rest_platform_tables.sql:622-635`) mas
  **não tem `reason`, `before` nem `after`** — os três campos que a fatia exige.
- **`grep "insert into public.audit_logs"` em todas as 81 migrations retorna zero linhas.**
  Nenhuma das seis ações sensíveis (cancelamento, cortesia, estorno, desconto, reabertura,
  exceção de lotação) grava rastro.
- Não existe helper `log_audit(...)`.
- O cancelamento de pedido em `20260803170000_client_production_backend.sql:180` grava o
  motivo em `orders.cancellation_reason` e não registra autor nem horário em lugar algum.
- Existe `public.approvals` (`20260721193000_manager_approvals_and_staff_overview.sql`) que
  cobre parte do fluxo de aprovação, mas não é `audit_log` e não é chamado pelas demais ações.

**Idempotência** — critérios 2 e 3 falham.
- `public.place_order` (`20260710130000_place_order_rpc.sql:12-19`) **não tem parâmetro de
  chave de idempotência**. Duas chamadas criam dois pedidos.
- `public.restaurant_record_payment` (`20260624211000_payment_rpc.sql:43-48`) também não tem.
- Só existe deduplicação em: `20260710131000_payment_idempotency_fix.sql:54-58`
  (`customer_pay_order`), `20260814233000_customer_wallet_backend.sql:44-46` (índice único de
  carteira) e `20260816010000_casual_dining_payment_and_receipt.sql:140-145`.
- **No app, a chave é gerada por request, não por intenção** — o oposto do que a fatia pede:
  - `apps/client/src/screens/payment/UnifiedPaymentScreen.tsx:321` —
    `` `${order.id}-${Date.now()}` ``
  - `apps/client/src/screens/payment/SplitPaymentScreen.tsx:390` —
    `` `split-${split.id}-${Date.now()}` ``
  - `apps/client/src/services/customer-backend.ts:877,1250,1416` —
    `input.idempotencyKey ?? Crypto.randomUUID()`, com o fallback disparando a cada retry.

---

### 1.3 F3 — Configuração e capability flags — **DIVERGENTE**

**O que existe** — e é mais do que parece à primeira vista.
- `restaurant_configs` (`20260430180000_generated_rest_platform_tables.sql:1210-1225`) com
  `service_types`, `experience_flags`, `enabled_features` — mas **todos como `text`**, não
  `jsonb` nem colunas tipadas.
- `restaurant_service_configs` (`:1130-1155+`) — 1:N por `service_type`, com ~26 flags.
- Camada de capabilities no app: `getServiceTypeFeatures(serviceType, { featureOverrides,
  customerExperience })` em `platform/mobile/shared/config/service-types.ts`, consumida por
  `apps/client/src/hooks/useServiceTypeFeatures.ts:171-207` (`useServiceTypeFor`). A intenção
  da fatia está presente.

**Divergência**
1. **Não existe `establishment_config` 1:1.** A configuração está espalhada por
   `restaurant_configs`, `restaurant_service_configs`, `restaurants.service_config` (jsonb),
   `loyalty_configs`, `kds_brain_configs` e `gateway_configs`. Não há fonte única.
2. **Nenhum percentual em basis points.** `loyalty_configs.cashback_percentage`,
   `points_per_real`, `happy_hour_schedules.discount_value` — todos `numeric`
   (`20260430180000_...:837,839,1013`).
3. **O arquivo canônico é `service-types.ts`, não `capabilities.ts`**, e as features são
   **hardcoded por modelo em TypeScript** (`SERVICE_TYPE_CONFIGS`,
   `shared/config/service-types.ts:76+`), não derivadas de configuração do banco. Critério 1
   ("trocar service_models muda módulos sem deploy") só vale para os `featureOverrides`.
4. **Critério 2 falha.** 60+ ocorrências de `fine_dining|casual_dining|quick_service` fora de
   `service-types.ts`, incluindo 14 dentro de RPCs. Lista em §3.3.
5. **Critérios 3, 4 e 5 não têm implementação.** Não existe validação de coerência
   (reserva+fila ambas off; `quick_service` com `prepaid_required=false`), nem suporte a
   múltiplos modelos por unidade — `restaurants.service_type` é **escalar**
   (`customer-backend.ts:766` filtra com `.in('service_type', [...])`, um valor por
   restaurante), o que contradiz ADR-003 diretamente.
6. **Critério 6 falha.** Literais de regra de negócio no código: §3.5.

---

### 1.4 N1 — Cardápio, estações e disponibilidade — **PARCIAL**

**Existe:** `menu_categories`, `menu_items` (`20260429120000_menu_categories_and_menu_items.sql`)
com `station_id:40`, `estimated_prep_minutes:41`, `allergens:35`, `is_available:33`, `course:42`.
RPCs de CRUD em `20260624203000_menu_management_rpc.sql` e `20260714090000_...`. Telas:
`apps/client/src/screens/production/MenuScreen.tsx`, `apps/restaurant/src/screens/v2/MenuScreen.tsx`.

**Falta**
- `stations` como tabela própria — existe `cook_stations`
  (`20260430180000_...:762`), mas `menu_items.station_id` **não tem FK** para ela
  (`20260429120000_...:40` declara `uuid` solto).
- `menu_item_options` (extras pagos, remoção, tamanhos) — não existe. Há
  `menu_item_customization_groups` (`20260430180000_...:878`) sem RLS e sem uso em
  `place_order`.
- **Critério 2 falha:** nada impede publicar item sem estação. `station_id` é nullable e sem
  check.
- **Critério 4 falha:** `place_order` (`20260710130000_place_order_rpc.sql:84`) usa
  `v_menu_item.price` puro e grava `customizations` como jsonb opaco — o preço com extras
  exibido no app **não** é o preço que o servidor calcula.
- **Critério 1** (item bloqueado some em tempo real): `menu_items` não está na publicação
  Realtime.
- **Critério 3** (alérgeno propaga para o ticket) não implementado — ver C1.

---

### 1.5 N2 — Pedido, itens e máquina de estado — **DIVERGENTE**

**Existe:** `orders` (`20260427101000_...:243-256`), `order_items` (`:264-277`), expandidos em
`20260430180100_orders_order_items_expand.sql` com `station_id:60`, `prepared_by:58`,
`course:63`, `fire_at:61`. `public.place_order` calcula preço server-side e revoga `insert`
direto de `authenticated` (`20260710130000_place_order_rpc.sql:120-125`) — essa parte atende
à invariante 2. Máquina de transição válida em
`20260815170000_order_tracking_realtime_consistency.sql:45-62`.

**Divergência — a mais grave depois de F2**

1. **A derivação de status está invertida (invariante 5).**
   `private.sync_order_item_status_from_order()`
   (`20260815170000_order_tracking_realtime_consistency.sql:4-40`) é um trigger
   `after update of status on public.orders` que **escreve o status nos itens a partir do
   pedido**. A spec exige exatamente o contrário.
   A convergência real existe apenas como efeito colateral dentro de uma RPC:
   `20260624207000_kds_operations_rpc.sql:84-97` (`bool_and(... in ('ready','served',
   'cancelled'))` → `update orders set status='ready'`), duplicada em
   `20260713161000_cook_role_permissions.sql:180-190`. **Duas implementações da mesma regra.**

2. **Critério 3 falha:** `orders.status` é escrito diretamente em pelo menos 8 lugares. Lista
   em §3.5.

3. **`place_order` não roteia por estação.** O `insert` em `order_items`
   (`20260710130000_place_order_rpc.sql:76-88`) não popula `station_id`. O critério 1
   ("aparece no KDS correto sem intervenção manual") não tem implementação no caminho de
   criação.

4. **Sem `idempotency_key`** (ver F2).

5. **Sem constraint `order_model_coherence`** (ADR-003).

6. **Critérios 5 e 6 sem implementação:** alteração pós-confirmação não entra em fila de
   aprovação com motivo obrigatório + `audit_log`; item indisponível pós-pedido não notifica
   com sugestão de substituição.

---

### 1.6 N3 — KDS e tempo real — **PARCIAL**

**Existe:** `KitchenDisplayScreen.tsx` e `BarKDSScreen.tsx`
(`apps/restaurant/src/screens/v2/`), RPCs em `20260624207000_kds_operations_rpc.sql`,
`20260714170000_kitchen_bar_config_rpc.sql`, publicação Realtime de `order_items`, `tables`,
`table_sessions`, `service_calls`
(`20260624210000_waiter_operations_rpc.sql:249-255`, `20260624202000_service_calls_rpc.sql:242`).
Consistência de tracking em `20260815170000_...`.

**Falta**
- **Critério 2 falha:** não há canal nem política por estação. `order_items` inteiro é
  publicado; a estação do bar recebe todos os eventos e filtra no cliente.
- **Critério 3 e 4:** não existe fila de mutações offline com replay idempotente. `useOffline`
  (`shared/hooks/__tests__/useOffline.test.ts`) trata conectividade, não replay de pedido.
  Sem idempotência (F2), o replay duplicaria.
- **Critério 5:** não existe tela de expedição que libere por convergência.
- Reroteamento de carga entre estações: ausente.

---

### 1.7 N4 — Pagamento e fiscal — **DIVERGENTE**

**Existe:** `gateway_transactions` (`20260430180000_...:918-935`) com `provider`,
`amount_cents`, `status`, `idempotency_key`, `refunded_amount_cents`. `gateway_configs`.
RPCs: `20260624211000_payment_rpc.sql`, `20260710131000_payment_idempotency_fix.sql`,
`20260816010000_casual_dining_payment_and_receipt.sql`. Carteira NOOWE completa
(`20260814233000_customer_wallet_backend.sql`). TAP to Pay:
`apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx`. Recibo digital:
`apps/client/src/screens/production/DigitalReceiptScreen.tsx`, `casual_dining_receipts`.

**Divergência**
1. **Critério 2 falha frontalmente. Não existe webhook de provedor.** `grep` por webhook
   ligado a pagamento nas migrations retorna zero. `restaurant_record_payment`
   (`20260624211000_payment_rpc.sql:43-95`) recebe `p_amount numeric` **do cliente**, insere
   `gateway_transactions` com `status = 'completed'` na mesma chamada e marca
   `orders.status = 'completed'` (`:90`). A tela de sucesso é, na prática, a fonte da verdade.
   Mesmo padrão em `20260816010000_casual_dining_payment_and_receipt.sql:239-254`.
   (`webhook_subscriptions` e `webhook_deliveries` existem em
   `20260430180000_...` mas são de integração externa e estão sem RLS.)
2. **Critério 1 parcial:** só `customer_pay_order` e o checkout de mesa deduplicam;
   `restaurant_record_payment` não.
3. **Critério 3 sem implementação:** nenhum gate impede produção sem pagamento.
4. **Critério 4 sem implementação:** `fiscal_documents` e `fiscal_configs` existem como
   tabelas (`20260430180000_...`, ambas **sem RLS**) e não há RPC de emissão NFC-e nem
   vínculo com o encerramento.
5. **Critério 5 sem implementação:** não existe fluxo de estorno com aprovação registrada.
   `refunded_amount_cents` nunca é escrito.
6. **`p_amount` não é reconferido contra o total do pedido** — invariante 2.

---

### 1.8 E1 — Reservas — **PARCIAL**

**Existe:** `reservations` (`20260427101000_...:281-294`) com `party_size`, `reservation_time`,
`status`, `special_requests`. `reservation_guests` com `invite_token`
(`20260803170000_client_production_backend.sql:423-435`). Fuso de São Paulo
(`20260815160000_restaurant_reservations_sao_paulo_timezone.sql`). Confirmação
(`20260815123000_...`). Telas: `CreateReservationScreen.tsx`, `ReservationsScreen.tsx`,
`ReservationConfirmationScreen.tsx` (client) e `v2/ReservationsScreen.tsx`, `v2/MaitreScreen.tsx`
(restaurant). Fluxo do maitre em `20260803160000_maitre_table_flow.sql`.

**Falta**
- `confirmation_code` e `occasion` — não existem como colunas.
- Enum de status diverge: `pending/confirmed/...`, não `confirmed → seated|waiting|cancelled`.
- **Critério 1 falha:** validação é de capacidade agregada da casa
  (`20260803170000_...:408-413`: `sum(seats)` vs `sum(party_size)`), **não** `party_size <=
  tables.seats` da mesa alocada. Nada impede check-in de grupo maior que a mesa.
- **Critério 3 falha:** não existe job de no-show. `waitlist_entries.no_show_at` existe
  (`20260427101000_...:338`) mas nada o preenche automaticamente, e não há liberação de mesa.
- **Critério 4 falha:** não existe `reservation_required` como gate — a coluna existe em
  `restaurant_service_configs:1137` e não é lida por nenhum caminho de consumo.
- `reservation_policy` por janela (ADR-008): ausente.
- Branch por modelo dentro da RPC: `20260803170000_...:405`
  (`service_type = 'casual_dining'` bloqueia reserva de fine dining; corrigido depois em
  `20260814090000_service_type_fixes_and_qr_security.sql:7`).

---

### 1.9 E2 — Fila virtual — **PARCIAL**

**Existe:** `waitlist_entries` (`20260427101000_...:319-341`) com `position`,
`estimated_wait_minutes`, `preference`, `has_kids`, `kids_allergies`, `called_at`,
`no_show_at`, e **`waitlist_bar_orders jsonb`** (`:330`) — a tentativa de consumo na espera.
Stats em `20260815190000_customer_waitlist_stats.sql`. Telas: `WaitlistScreen.tsx` (client e
restaurant). Notificação por trigger (`20260803170000_...:473`).

**Falta / divergência**
- **Duas tabelas de fila concorrentes.** `waitlist_entries` (usada pelo produto) e
  `queue_entries` (`20260430180000_...:305-320`, do domínio de balada, **sem RLS**, com
  `priority_level_id`). São modelos diferentes da mesma coisa.
- **Critério 2 falha:** o consumo na espera é `jsonb` dentro da própria entrada
  (`waitlist_bar_orders`), **não** pedidos reais vinculados por FK. Não existe migração para a
  comanda da mesa — os itens teriam de ser relançados.
- **Critério 1 parcial:** não há motor de recálculo contínuo de posição; `position` é
  `integer not null` escrito manualmente.
- **Critério 3 falha:** não existe `tolerance_expires_at` nem queda de posição. ADR-002 sem
  implementação.
- **Critério 4 falha:** não existe conversão de consumo em conta de balcão.
- **Critério 5 falha:** não existe verificação de mesa compatível antes de oferecer posição.

---

### 1.10 G1 — Sessão de mesa, QR e check-in — **PARCIAL**

**Existe — e é a fatia mais bem servida do repositório.**
- `table_sessions` (`20260430180000_...:1346-1367`), `table_qr_codes` (`:1327-1344`) com
  `signature` e `version`, `qr_scan_logs` (`:1294-1305`).
- **Invariante 3 atendida:** índice único parcial
  `uq_table_sessions_one_active_per_table` em
  `20260815211000_table_qr_full_flow.sql:25-27`, precedido de migração de dados que fecha
  duplicatas (`:11-23`). Também `uq_table_qr_codes_one_active_per_table` (`:45-47`).
- Toda leitura do mesmo QR entra na sessão existente — declarado e implementado em
  `20260815211000_table_qr_full_flow.sql` (cabeçalho, linhas 1-6).
- Segurança de QR: `20260814090000_service_type_fixes_and_qr_security.sql`, erros específicos
  em `20260816020000_table_qr_specific_errors.sql`, antifraude documentado em
  `docs/service-types/ANTIFRAUD_QR_PATTERN.md`.
- App: `QrScannerScreen.tsx`, `useTableQrHandler.ts`, `TableQrLinkScreen.tsx`.

**Falta**
- **Critério 3 falha — e é a dependência estrutural do grafo.** Não existe
  `session_needs_entry_origin`: `table_sessions` **não tem `reservation_id` nem
  `queue_entry_id`** (`20260430180000_...:1346-1367`). `grep` por essas colunas ligadas a
  sessão retorna zero. Abrir sessão sem reserva nem fila é o caminho normal hoje.
- **Critério 4 falha:** não existe status `billing`. `grep "'billing'"` nas migrations retorna
  zero. O QR nunca abre o fechamento.
- `qr_codes` com tipo `table | counter` (ADR-003) não existe — só `table_qr_codes`.
- Critério 6 (concorrência) é atendido pelo índice único, mas **sem teste**.

---

### 1.11 G2 — Convite por link e capacidade — **DIVERGENTE**

**Existe:** `table_session_invites` (`20260814110000_table_session_group_ordering.sql:59-75`)
com `token`, `expires_at` (default 6h, `:65`), `revoked_at`; RLS ligada e
`insert/update/delete` revogados de `authenticated` (`:71-75`).
`table_session_participants` (`:29-56`) com `is_host`, `display_name`, RLS ligada, mutação só
por RPC. `order_items.diner_id` e `orders.table_session_id` (`:78`). Acompanhantes sem conta:
`20260815200000_casual_dining_experience.sql:40-50` (`user_id` nullable, `is_kid`, `added_by`)
e `20260815230000_table_companion_kid_details.sql` (`kid_age`, `kid_allergies`). App:
`TableInviteLinkScreen.tsx`, `useTableInviteHandler.ts`, geração via `Share` em
`CartScreen.tsx:57-62`.

**Divergência**
1. **Não existe validação de capacidade — invariante 7 sem substrato.**
   `grep "seat_count|capacity_request|occupied_seats"` nas 81 migrations retorna **zero**.
   Não existe `capacity_requests`, não existe `session_participants.seat_count`, não existe
   fila de exceções do maitre. Critérios 3 e 4 sem implementação; ADR-007 inteiro pendente.
2. **`token` é armazenado em claro** (`:62`), não `token_hash`. Não existe `short_code_hash`,
   nem código de 6 dígitos, nem `max_uses`/`uses`.
3. **Critério 7 falha:** não existe Edge Function de entrada por código curto com rate limit.
   `edge_rate_limits` (`20260624121000_edge_function_rate_limits.sql`) existe e as 5 Edge
   Functions publicadas (`platform/supabase/functions/`) são de e-mail/push/staff — nenhuma de
   convite.
4. **Critério 6 parcial:** expira por TTL e por revogação; não expira ao encerrar a conta.
   O TTL de 6h é literal no default da coluna, não config.
5. **Critério 8 falha:** convidado que sai antes do pagamento não devolve saldo para a mesa —
   não existe saldo de mesa (ver G3).
6. **ADR-006 sem implementação:** não há aviso ao anfitrião sobre responsabilidade pelo saldo
   de convidado sem conta.

**Atualização 2026-09-26: fatia G2b, ADR-011**

O item 1 foi resolvido **para o canal por @username**:
- `capacity_requests`, `table_session_participants.seat_count` e
  `private.table_session_capacity_check` agora existem;
- a tela "Lotação" do maitre está pronta, com decisão auditada.

Continuam em aberto:
- link e QR ainda entram sem checar lotação;
- os itens 2 a 6.

Achados durante a G2b:
- **Resolvido.** O chip "Convidar" de `FecharContaScreen.tsx` aparecia sem checar capability.
  Agora exige `guestLink || userInvite` (teste `production.inviteEntryPoints.test.tsx`).
- **Divergência fora de escopo.** `FecharContaScreen.tsx` tem literais de regra de negócio:
  `TIP_OPTIONS = [0, 10, 15, 20]` e `feePct ?? 10`. Deveriam vir de `tipPresetsBps` e
  `serviceFeeBps`.
- **Divergência fora de escopo.** Em `NotificationsScreen.tsx`, o botão "Recusar" do convite de
  **reserva** só marca a notificação como lida; não recusa no servidor.

---

### 1.12 G3 — Divisão de conta e pagamento parcial — **DIVERGENTE**

**Existe:** `payment_splits` (`20260430180000_...:954-972`) — schema próximo de `bill_shares`,
com `split_mode`, `amount_due`, `amount_paid`, `payment_id`, `service_charge`, `tip_amount`.
`public.restaurant_calculate_split` (`20260624210000_waiter_operations_rpc.sql:168-226`).
Checkout de mesa com `p_split_mode` (`20260816010000_casual_dining_payment_and_receipt.sql:95`).
Telas: `SplitBillScreen.tsx`, `TipPaymentScreen.tsx`,
`apps/client/src/screens/payment/SplitPaymentScreen.tsx`.

**Divergência**
1. **Invariante 4 sem qualquer garantia.** `payment_splits` está **sem RLS**, é ancorada em
   `order_id` (não em sessão), e **nada verifica que a soma das parcelas iguala o total**.
   Não existe teste de propriedade nem verificação transacional no fechamento.
2. **O cálculo do split acontece no app, não no servidor** — invariante 2:
   - `apps/client/src/screens/production/SplitBillScreen.tsx:58` —
     `const totalWithFee = subtotal * (1 + feePct / 100);`
   - `:63-72` — os quatro modos (`mine`/`equal`/`byItem`/`fixed`) calculados em `useMemo`,
     incluindo `subtotal / participantCount` (`:67`) — divisão em ponto flutuante, sem
     tratamento de resto.
   - `:76` — `const myShare = baseAmount * (1 + feePct / 100);`
   - `apps/client/src/screens/production/TipPaymentScreen.tsx:41-43` — taxa, gorjeta e total
     calculados no cliente e enviados como `baseAmount`.
3. **Não existem `split_preview` / `split_commit` / `pay_share`.** A única RPC,
   `restaurant_calculate_split`, é `stable` (não grava), suporta
   `equal | individual | percentage` — **três modos, e `percentage` não é um dos quatro da
   spec**; faltam `by_owner`, `by_item` e `fixed_amount` como modos de gravação.
   Ela arredonda com `round(v_total / greatest(p_parts,1), 2)`
   (`20260624210000_waiter_operations_rpc.sql:201`) — **sem redistribuição de resto**,
   violando ADR-001 e o critério 2 (`max−min ≤ 1`).
4. **Critérios 3, 4, 6, 7 sem implementação:** não existe estado `billing`, nem saldo de
   sessão, nem redistribuição de pool ao abandono, nem regra de reabertura (ADR-004), nem
   alerta ao gerente por saída sem pagar.
5. **Critério 8 contradito** — ver P1.
6. Não existe a interface de arrastar itens; a seleção é por checkbox
   (`SplitBillScreen.tsx:231`), e item compartilhado entre pessoas não é representável.

---

### 1.13 S1 — Chamados e ações do garçom — **PARCIAL**

**Existe:** `service_calls` (`20260430180000_...:95+`), RPCs em
`20260624202000_service_calls_rpc.sql`, publicação Realtime (`:242`). Assistência ao cliente
completa em `20260721171000_customer_assistance_backend.sql` (roteamento ao garçom da mesa:
`:403,429,465,737,756`). Telas: `CallWaiterScreen.tsx` (client),
`v2/CallsScreen.tsx`, `v2/WaiterScreen.tsx`, `v2/WaiterTapToPayScreen.tsx` (restaurant).
Pedido lançado pelo garçom usa o mesmo `place_order` com `p_customer_id`
(`20260710130000_place_order_rpc.sql:41-48`) — critério 4 essencialmente atendido, embora
`orders.source` (`20260430180100_...:50`) tenha default `'noowe'` e não seja diferenciado.

**Falta**
- Tabela paralela `waiter_calls` (`20260430180000_...`, **sem RLS**) duplicando
  `service_calls` — duas implementações do mesmo conceito.
- Critério 2 (previsão de atendimento ao cliente): não implementado.
- Critério 3 (chamado discreto): não há configuração de alerta sonoro.
- Critério 5: `WaiterTapToPayScreen.tsx:55-57` calcula gorjeta e total **no cliente**
  (`Math.round(amount * tipPercent * 100) / 100`) e não quita parcela — não há parcelas.
- Tipo `sommelier` não é condicionado por capability.

---

### 1.14 Q1 — Quick Service completo — **AUSENTE** (banco/servidor) · PARCIAL (UI)

**Existe apenas na superfície.** Telas: `QuickServiceRestaurantView.tsx`,
`QuickServiceCheckoutScreen.tsx`, `ComboBuilderScreen.tsx`, `OrderReadyScreen.tsx`,
`QuickServiceRatingScreen.tsx` (client); `v2/QuickServiceScreen.tsx` (restaurant).
Backend: `20260815220807_quick_service_cuisine_and_skip_the_line.sql` (tags de cozinha +
toggle Skip the Line) e `20260815224634_quick_service_custom_combo.sql` (combo).

**Ausente**
- **`pickup_codes` / `orders.pickup_code` não existem.** `grep "pickup_code|pickup_slot"` nas
  migrations retorna zero. Critério 4 sem qualquer implementação.
- **`pickup_slots` / capacidade por janela não existem.** Critério não implementado.
- **`combo_definitions` não existe.** O combo é matching por **nome de categoria em texto**
  (`20260815224634_...`, cabeçalho linhas 1-8: "matching component items to their pool by
  category name ('Burgers' / 'Acompanhamentos' / 'Bebidas')") — declarado no próprio arquivo
  como atalho de MVP.
- **Desconto de combo é literal em dois lugares que podem divergir:**
  `20260815224634_quick_service_custom_combo.sql:31` (`v_discount_pct constant numeric := 20`)
  e `apps/client/src/screens/production/ComboBuilderScreen.tsx:14` (`DISCOUNT_PERCENT = 20`),
  este último recalculado no app em `:65-67`.
- **Máquina de 4 etapas ausente.** `grep "conferencia|quality_check|conference"` retorna zero.
  Não existe etapa de conferência — o ponto de controle de erro de montagem que a fatia
  descreve como obrigatório.
- **Critério 1 (invariante 6) sem implementação.** Nenhum gate de pagamento antes da produção.
- Critérios 2, 6, 7, 8, 9, 10: sem implementação.

---

### 1.15 C1 — Casual: família, aniversário e festas — **PARCIAL**

**Existe:** `20260815200000_casual_dining_experience.sql`,
`20260815220000_casual_dining_entry_family_and_seed.sql`,
`20260815230000_table_companion_kid_details.sql`,
`20260816010000_casual_dining_payment_and_receipt.sql`. `kid_activities`,
`casual_dining_family_loyalty`, `casual_dining_receipts`.
`table_session_participants.is_kid` (`20260815200000_...:41`), `kid_age`/`kid_allergies`
(`20260815230000_...:4-7`). Telas: `ModoFamiliaScreen.tsx`, `KidsActivitiesScreen.tsx`,
`BirthdayScreen.tsx`, `CasualDiningComandaScreen.tsx`, `v2/CasualDiningScreen.tsx`.
Cardápio kids e alergias registradas.

**Falta**
- **Critérios 1 e 2 falham.** A alergia fica em `table_session_participants.kid_allergies`
  (texto ≤200 chars) e **não propaga para o ticket do KDS**. Existe apenas um
  `'{"allergy_alert":true}'` no seed de simulação
  (`20260730120000_restaurant_client_simulation_seed.sql:731,789`) — dado de demo, não
  mecanismo. Não existe bloqueio de expedição até confirmação do chef.
- **Critério 3 falha:** `tables.merged_into_id` não existe. Junção de mesas não é
  representável.
- **Critério 4 falha:** não existe recálculo de alocação nem de divisão igual por mudança de
  grupo.
- **Critério 5 falha:** cortesia não passa por `audit_log` (nenhuma ação passa — ver F2). A
  cortesia de fidelidade familiar é literal:
  `20260816010000_casual_dining_payment_and_receipt.sql:230` — `least(15.00, v_subtotal)`.
- **Critério 6 falha:** `seat_count = 0` para criança de colo não existe (ADR-007 sem
  substrato — ver G2).
- Modo de conta do grupo (única / por mesa / individual): não existe.

---

### 1.16 D1 — Fine: harmonização, sommelier e níveis — **PARCIAL**

**Existe:** `HarmonizacaoScreen.tsx` (client), `fine-dining-ui.ts`,
`v2/FineDiningScreen.tsx` (restaurant), `20260815210000_fine_dining_ambiance_filters.sql`,
`20260815150000_seed_fine_dining_menu.sql`. Responsável pelo preparo por item:
`order_items.prepared_by` (`20260430180100_...:58`) e
`20260815130000_customer_order_item_preparer_names.sql` — critério parcialmente atendido.
`restaurant_service_configs.sommelier_available` (`20260430180000_...:1135`).
`loyalty_programs.tier` (`:853`).

**Falta**
- **Critério 1:** a harmonização é conteúdo estático em `home-restaurant-ui.ts:74` ("screen
  reachable from the fine_dining menu until a real recommendation") — declarado no próprio
  código como placeholder. Não consulta disponibilidade real.
- **Critério 2:** `sommelier` não é um tipo roteado de `service_call` para papel próprio.
- **Critério 3 falha:** `loyalty_programs.tier` é `text` livre; não há catálogo de níveis
  configurável por estabelecimento.
- Menus especiais e aprovação do chef antes do serviço: ausentes.

---

### 1.17 P1 — Fidelidade — **DIVERGENTE**

**Existe:** `loyalty_programs` (`20260430180000_...:846-861`) com `points`, `tier`,
`total_visits`, `total_spent`, `awarded_order_ids`; `loyalty_configs` (`:833-844`);
`stamp_cards` (`:863-876`) com `current_stamps`/`required_stamps`. RPCs em
`20260624208000_loyalty_rpc.sql` e `20260815143000_customer_loyalty_redemption.sql`.
Trigger de crédito: `private.award_loyalty_on_operational_completion()`
(`20260803170000_client_production_backend.sql:435-446`). Tela `LoyaltyScreen.tsx`.
`loyalty_programs` **tem** RLS (`20260803170000_...:93`); `stamp_cards` e `loyalty_configs`
**não têm**.

**Divergência**
1. **Critério 3 falha frontalmente (ADR-005).** O crédito é calculado sobre valores que
   **incluem taxa de serviço e gorjeta**:
   - `20260816010000_casual_dining_payment_and_receipt.sql:235-236` —
     `v_charged := v_total + v_tip` (onde `v_total := v_subtotal + v_service_fee - v_discount`),
     e `:261` — `loyalty_award_points(..., v_charged)`.
   - `20260624211000_payment_rpc.sql:96-103` — `loyalty_award_points(..., p_amount)`, valor
     bruto vindo do cliente.
   - `20260803170000_client_production_backend.sql:439` —
     `loyalty_award_points(..., coalesce(new.total_amount, 0))`.
2. **Critério 1 falha:** o crédito é **por pedido**, não por parcela paga. Não existe
   `bill_share_id` — não existem parcelas. Numa conta dividida, quem paga o checkout leva
   todos os pontos.
3. **Não existem `loyalty_accounts` nem `loyalty_transactions`.** Os três mecanismos não
   convivem no mesmo registro: pontos e tier em `loyalty_programs`, selos em `stamp_cards`,
   sem vínculo.
4. **Deduplicação é frágil:** `awarded_order_ids` é uma **string CSV**
   (`20260430180000_...:857`), lida com `string_to_array(...)`
   (`20260816010000_...:265`). Não é índice único. O próprio código comenta o problema
   (`20260816010000_...:257-260`).
5. **Critério 4 (ADR-005) falha:** em Quick Service o selo seria creditado no pagamento — não
   existe retirada.
6. **Critério 5 falha:** estorno não remove pontos (não existe estorno).
7. **Critério 6:** `loyalty_mode` não existe como configuração.

---

### 1.18 P2 — Avaliação, CRM e relatórios — **PARCIAL**

**Existe:** `reviews`, `review_reports`, `customer_feedback`, `customer_profiles` (sem RLS).
RPCs: `20260709126000_promotions_reviews_rpc.sql`, `20260714094000_customers_crm_rpc.sql`,
`20260624201000_financial_reports_rpc.sql`, `20260714093000_financial_dashboard_and_bills.sql`.
Telas: `ReviewScreen.tsx`, `ReviewsScreen.tsx` (client); `v2/ReviewsScreen.tsx`,
`v2/CustomersScreen.tsx`, `v2/ReportsScreen.tsx`, `v2/FinancialScreen.tsx`, `v2/TipsScreen.tsx`
(restaurant). UI de configuração: `v2/ServiceConfigScreen.tsx` + `v2/config/*` — o item
"adiado de F3" já existe.

**Falta**
- Avaliação **separada por comida, serviço e ambiente** e citação nominal do atendente:
  não modelada (`reviews` tem rating agregado).
- Moderação pelo gerente antes de publicar: `review_reports` existe, sem fluxo de moderação.
- **Critério 2 falha:** avaliação não alimenta o relatório de gorjetas/desempenho.
- **Critério 4 falha:** não existe tela de auditoria, porque não existe conteúdo em
  `audit_logs` (ver F2).
- Relatórios por modelo (Fine/Casual/Quick, spec §8) não são segmentados por capability.

---

## 2. Código de regra de negócio sem fatia correspondente

Este é o volume que mais surpreende: **domínios inteiros e funcionais que nenhuma das 18
fatias menciona**. Não são detalhes — são produtos.

### 2.1 Balada / clube noturno — grande, completo, fora do escopo dos 3 modelos

**Banco:** `club_entries`, `club_check_in_outs`, `club_birthday_entries`, `guest_list_entries`,
`lineups`, `lineup_slots`, `promoters`, `promoter_sales`, `promoter_payments`,
`vip_table_reservations`, `vip_table_guests`, `vip_table_tabs`, `vip_table_tab_items`,
`queue_entries` — todos em `20260430180000_generated_rest_platform_tables.sql`, **todos sem
RLS**, com regra de comissão de promoter (`:250-256`), crédito de consumação
(`:151-152,182-184,332,348-349,381-385`).

**App:** `apps/client/src/screens/club/` — `ClubHomeScreen`, `TicketPurchaseScreen`,
`VipTableScreen`, `LineupScreen`, `ClubQueueScreen`, `BirthdayBookingScreen`,
`BirthdayEntryRequestScreen`.

**Docs correspondentes:** `docs/epics/EPIC_13_CLUB_BALADA_FRONTEND.md`,
`docs/SERVICE_TYPES_ENTERTAINMENT.md`.

Aritmética de valor no cliente: `apps/client/src/screens/club/TicketPurchaseScreen.tsx:249` —
`const totalPrice = pricePerTicket * quantity;`

### 2.2 Pub / bar com comanda de rodada

**Banco:** `tabs`, `tab_items`, `tab_members`, `tab_payments`
(`20260430180000_...:1386+`, sem RLS) — um **segundo motor de comanda em grupo**, paralelo a
`table_sessions`/`table_session_participants`.

**App:** `apps/client/src/screens/pub-bar/` — `TabScreen`, `RoundBuilderSheet`,
`TabPaymentScreen`. Hook `useTab.ts`.

Aritmética de valor no cliente:
- `apps/client/src/screens/pub-bar/RoundBuilderSheet.tsx:289` —
  `total += Number(roundItem.menuItem.price) * roundItem.quantity;`
- `apps/client/src/screens/pub-bar/TabPaymentScreen.tsx:215` —
  `existing.totalPrice += Number(item.total_price) || Number(item.unit_price) * item.quantity;`

**Doc:** `docs/epics/EPIC_14_PUB_BAR_COMANDA.md`.

### 2.3 Estoque, fichas técnicas e compras

`ingredients`, `ingredient_prices`, `ingredient_suppliers`, `suppliers`,
`supplier_item_mappings`, `recipes`, `recipe_ingredients`, `drink_recipes`, `stock_items`,
`stock_movements`, `inventory_counts`, `inventory_count_items`, `inventory_items`,
`purchase_records`, `unit_conversions` — **todos sem RLS**. RPCs em
`20260624206000_stock_inventory_rpc.sql`. `recipes.calculated_cost`
(`20260430180000_...:433`) é regra de custo — explicitamente **fora de escopo** de N1
("Fichas técnicas, custo e margem (Fase 4)"), mas já implementada.

Docs: `docs/epics/EPIC_05_STOCK_INVENTORY.md`, `EPIC_06_DRINK_RECIPES.md`.

### 2.4 RH / escala / caixa

`shifts`, `attendances`, `leave_requests` (sem RLS), `cash_register_sessions`,
`cash_register_movements`. RPCs: `20260624200000_cash_register_rpc.sql`,
`20260714095000_shifts_crud_rpc.sql`, `20260624204000_staff_management_rpc.sql`,
`20260714092000_staff_management_crud.sql`. Telas `v2/ShiftsScreen.tsx`, `v2/StaffScreen.tsx`.
Regra de folha em `shifts.total_pay` (`20260430180000_...:617`).

### 2.5 Carteira digital NOOWE

`wallets`, `wallet_transactions` (sem RLS na criação; RLS parcial em
`20260814233000_customer_wallet_backend.sql`), com `max_balance`, `daily_limit`,
`monthly_limit` (`20260430180000_...:995-998`) — regras financeiras não citadas em N4, que
menciona a carteira apenas como método de pagamento. Transferência P2P entre usuários
(`20260814233000_...:331-430`) é funcionalidade inteira sem fatia.

### 2.6 Integrações de delivery e marketplace

`platform_connections`, `external_menu_mappings`, `delivery_settlements`,
`restaurant_integrations`, `webhook_subscriptions`, `webhook_deliveries` — sem RLS.
RPC `20260714096000_integrations_rpc.sql`. `orders.source`/`source_order_id`
(`20260430180100_...:50-51`), `orders.delivery_rider_eta` (`:52`).
Explicitamente **fora de escopo** de P2 ("Marketplaces e integrações externas de delivery"),
já implementado.

### 2.7 LGPD, segurança e antifraude

`user_consents`, `user_sanctions`, `security_incidents`, `fraud_alerts`, `token_blacklist`,
`biometric_tokens`, `otp_tokens`, `password_reset_tokens`, `user_credentials` — **todos sem
RLS**, o que é notável dado o conteúdo. RPC `20260710132000_lgpd_data_rights_rpc.sql`.
Docs: `docs/AUDITORIA-LGPD-CONFORMIDADE.md`, `docs/RIPD-TEMPLATE.md`.

### 2.8 Buffet por peso e outros modelos de serviço

`restaurant_service_configs` carrega `price_per_kg`, `smart_scales_enabled`,
`drive_thru_lanes`, `geofencing_enabled`, `license_plate_recognition`
(`20260430180000_...:1148-1156`). Tela `apps/client/src/screens/buffet/`. Nenhuma fatia cobre
buffet nem drive-thru; `docs/SERVICE_TYPES.md` descreve modelos além dos três do MVP.

### 2.9 KDS Brain / IA de preparo

`kds_brain_configs`, `prep_analytics`, `prep_time_suggestions`, `fire_schedules` (sem RLS).
Doc `docs/kds-brain-development-plan.md`. N3 coloca "KDS Analytics e SLA por etapa" fora de
escopo (Fase 4) — já existe schema.

### 2.10 Duplicações internas — dois códigos para a mesma regra

Vale registrar à parte, porque é o risco que o procedimento de reconciliação nomeia como o
pior:

| Conceito | Implementação A | Implementação B |
|---|---|---|
| Fila de espera | `waitlist_entries` (`20260427101000:319`) | `queue_entries` (`20260430180000:305`) |
| Chamado de garçom | `service_calls` (`20260430180000:95`) | `waiter_calls` (`20260430180000`) |
| Comanda em grupo | `table_sessions` + `table_session_participants` | `tabs` + `tab_members` + `tab_items` |
| Convergência para `ready` | `20260624207000:84-97` | `20260713161000:180-190` |
| Config do estabelecimento | `restaurant_configs` | `restaurant_service_configs` + `restaurants.service_config` |
| Fidelidade | `loyalty_programs` + `loyalty_configs` | `stamp_cards` + `casual_dining_family_loyalty` |
| Documento de auditoria | `docs/AUDITORIA-TECNICA-COMPLETA.md` | `docs/AUDITORIA_TECNICA_COMPLETA.md` |

---

## 3. As cinco varreduras

### 3.1 Dinheiro em float

**Resultado: 105 colunas monetárias em `numeric`. Zero colunas monetárias em `bigint`.**
Nenhuma ocorrência de `real` ou `double precision` — a violação é toda por `numeric`.

Amostra representativa (a lista completa está em
`20260430180000_generated_rest_platform_tables.sql`, que sozinho concentra ~80):

| Arquivo:linha | Coluna |
|---|---|
| `platform/supabase/migrations/20260429120000_menu_categories_and_menu_items.sql:30` | `menu_items.price numeric(10,2)` |
| `platform/supabase/migrations/20260427101000_create_core_bootstrap_tables.sql:270` | `order_items.unit_price numeric(10,2)` |
| `platform/supabase/migrations/20260427101000_create_core_bootstrap_tables.sql:271` | `order_items.total_price numeric(10,2)` |
| `platform/supabase/migrations/20260430180100_orders_order_items_expand.sql:29` | `orders.subtotal numeric(10,2)` |
| `platform/supabase/migrations/20260430180100_orders_order_items_expand.sql:30` | `orders.tax_amount numeric(10,2)` |
| `platform/supabase/migrations/20260430180100_orders_order_items_expand.sql:31` | `orders.tip_amount numeric(10,2)` |
| `platform/supabase/migrations/20260430180100_orders_order_items_expand.sql:32` | `orders.discount_amount numeric(10,2)` |
| `platform/supabase/migrations/20260430180100_orders_order_items_expand.sql:33` | `orders.total_amount numeric(10,2)` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:925` | `gateway_transactions.amount_cents numeric` ← centavos em `numeric` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:932` | `gateway_transactions.refunded_amount_cents numeric` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:959-967` | `payment_splits.amount_due / amount_paid / custom_amount / service_charge / tip_amount` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:995-998` | `wallets.balance / max_balance / daily_limit / monthly_limit` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:129-131` | `cash_register_sessions.opening_balance / expected_balance / actual_balance` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:250-256` | `promoters.fixed_commission_amount / total_revenue_generated / total_commission_earned` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:1013,1015` | `promotions.discount_value / min_order_value` |
| `platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql:837,839,840` | `loyalty_configs.cashback_percentage / points_per_real / points_redemption_rate` |

Também nas assinaturas de RPC (dinheiro trafega como `numeric` na fronteira):
`20260624211000_payment_rpc.sql:45,46` · `20260624200000_cash_register_rpc.sql:125,184,249` ·
`20260624203000_menu_management_rpc.sql:122,123,180,181` ·
`20260624208000_loyalty_rpc.sql:64` · `20260709126000_promotions_reviews_rpc.sql:47` ·
`20260714093000_financial_dashboard_and_bills.sql:93` ·
`20260721193000_manager_approvals_and_staff_overview.sql:107` ·
`20260624210000_waiter_operations_rpc.sql:182` ·
`20260815200000_casual_dining_experience.sql:81,82,471,472,753`.

**No app, valores em `Number`** — `shared/types/database.generated.ts` tipa todas essas
colunas como `number`, e todo o app opera nesse tipo. Não existe tipo `Money`.
Conversões explícitas: `apps/client/src/screens/pub-bar/RoundBuilderSheet.tsx:289`
(`Number(roundItem.menuItem.price)`), `TabPaymentScreen.tsx:215`.
`apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx:55` faz o caminho inverso —
`const amount = cents / 100;` — introduzindo float a partir de centavos.

### 3.2 Cálculo de valor cobrado no React Native

Toda ocorrência abaixo produz um valor que o usuário vê como cobrança e que **o servidor não
recalcula**:

| Arquivo:linha | Expressão | O que produz |
|---|---|---|
| `platform/mobile/apps/client/src/screens/production/CartScreen.tsx:84` | `cart.total * (SERVICE_FEE_PCT / 100)` | taxa de serviço |
| `platform/mobile/apps/client/src/screens/production/CartScreen.tsx:85` | `cart.total + serviceFee` | total exibido |
| `platform/mobile/apps/client/src/screens/production/SplitBillScreen.tsx:58` | `subtotal * (1 + feePct / 100)` | total com taxa |
| `platform/mobile/apps/client/src/screens/production/SplitBillScreen.tsx:67` | `subtotal / participantCount` | **parcela do modo `equal`** |
| `platform/mobile/apps/client/src/screens/production/SplitBillScreen.tsx:70-71` | `reduce((sum, item) => sum + item.totalPrice, 0)` | parcela do modo `byItem` |
| `platform/mobile/apps/client/src/screens/production/SplitBillScreen.tsx:76` | `baseAmount * (1 + feePct / 100)` | valor da minha parte |
| `platform/mobile/apps/client/src/screens/production/TipPaymentScreen.tsx:41` | `baseAmount * (serviceFeePercent / 100)` | taxa |
| `platform/mobile/apps/client/src/screens/production/TipPaymentScreen.tsx:42` | `baseAmount * (tipPct / 100)` | gorjeta |
| `platform/mobile/apps/client/src/screens/production/TipPaymentScreen.tsx:43` | `baseAmount + serviceFee + tip` | **valor cobrado**, enviado como `baseAmount` à RPC (`:52`) |
| `platform/mobile/apps/client/src/screens/production/ComboBuilderScreen.tsx:65` | `subtotal * (DISCOUNT_PERCENT / 100)` | desconto de combo |
| `platform/mobile/apps/client/src/screens/production/ComboBuilderScreen.tsx:66` | `subtotal - discount` | total do combo |
| `platform/mobile/apps/client/src/screens/club/TicketPurchaseScreen.tsx:249` | `pricePerTicket * quantity` | total de ingressos |
| `platform/mobile/apps/client/src/screens/pub-bar/RoundBuilderSheet.tsx:289` | `Number(price) * quantity` | total da rodada |
| `platform/mobile/apps/client/src/screens/pub-bar/TabPaymentScreen.tsx:215` | `Number(unit_price) * quantity` | total da comanda |
| `platform/mobile/apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx:56` | `Math.round(amount * tipPercent * 100) / 100` | gorjeta na maquininha |
| `platform/mobile/apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx:57` | `amount + tipAmount` | valor cobrado no TAP to Pay |

O agravante: `restaurant_record_payment` (`20260624211000_payment_rpc.sql:45`) e
`customer_pay_table_bill` aceitam o valor do cliente. O total calculado no app **é** o total
cobrado.

### 3.3 Ramificação por modelo de serviço fora de `capabilities.ts`

Não existe `capabilities.ts`. O arquivo equivalente é
`platform/mobile/shared/config/service-types.ts`. Fora dele e dos testes:

**No app do cliente (lógica, não rótulo):**
- `apps/client/src/hooks/useServiceTypeFeatures.ts:92,94,96,105,106,108,116,120,124` — nove
  comparações num `switch` que decide fluxo de pedido, momento do pagamento, seleção de mesa e
  estilo de cardápio. **É o ponto que a fatia F3 descreve como o que não pode existir.**
- `apps/client/src/screens/production/CartScreen.tsx:27,28,29,33` — `isFineDining`,
  `isCasualDining`, `isQuickService`, `needsTableSession`
- `apps/client/src/screens/production/MenuScreen.tsx:29,30,31`
- `apps/client/src/screens/production/RestaurantScreen.tsx:125,126,331`
- `apps/client/src/screens/production/HomeScreen.tsx:53,54,55,163,164,165,344,345`
- `apps/client/src/screens/production/OrderDetailScreen.tsx:98`
- `apps/client/src/screens/production/ReservationRestaurantScreen.tsx:17`
- `apps/client/src/screens/production/casual-dining-ui.ts:105,117,123`
- `apps/client/src/screens/production/home-restaurant-ui.ts:14,15,16`
- `apps/client/src/services/customer-backend.ts:766`

**No app do restaurante:**
- `apps/restaurant/src/screens/v2/ServiceConfigScreen.tsx:27,34,39,64,65,66,77`
- `apps/restaurant/src/screens/v2/config/configTypes.ts:73,81,138`
- `apps/restaurant/src/screens/v2/config/ConfigExperienceScreen.tsx:40`
- `apps/restaurant/src/screens/auth/CreateRestaurantScreen.tsx:33,34,35`

**Dentro de RPCs (a fatia isenta migrations, mas estas são regra de negócio em execução):**
- `20260803170000_client_production_backend.sql:405` — reserva só para `casual_dining`
- `20260814110000_table_session_group_ordering.sql:239` — `quick_service`
- `20260814090000_service_type_fixes_and_qr_security.sql:132` — `quick_service`
- `20260815103000_service_type_onboarding_and_journey.sql:393` — `quick_service`
- `20260815200000_casual_dining_experience.sql:420,682,729,736`
- `20260815220000_casual_dining_entry_family_and_seed.sql:159`
- `20260815220807_quick_service_cuisine_and_skip_the_line.sql:28,80,87`
- `20260815224634_quick_service_custom_combo.sql:43`

**Total: 60+ ocorrências fora do arquivo canônico.** Critério 2 de F3 falha.

### 3.4 Tabelas de negócio com RLS desabilitado

**120 tabelas criadas · 51 com `enable row level security` · 67 sem.**
Não há habilitação dinâmica (loop/`execute format`) que compense — a varredura por
`ENABLE ROW LEVEL SECURITY` dentro de `execute`/`format` retorna zero.

Lista completa das 67 (todas em `public`, criadas majoritariamente em
`platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql`):

`addresses`, `attendances`, **`audit_logs`**, `biometric_tokens`, `club_birthday_entries`,
`club_check_in_outs`, `club_entries`, `customer_profiles`, `delivery_settlements`,
`drink_recipes`, `external_menu_mappings`, `fire_schedules`, **`fiscal_configs`**,
**`fiscal_documents`**, `fraud_alerts`, `guest_list_entries`, `happy_hour_schedules`,
`ingredient_prices`, `ingredient_suppliers`, `ingredients`, `inventory_count_items`,
`inventory_counts`, `leave_requests`, `lineup_slots`, `lineups`,
`menu_item_customization_groups`, `order_guests`, `otp_tokens`, `password_reset_tokens`,
**`payment_splits`**, `platform_connections`, `prep_analytics`, `prep_time_suggestions`,
`profile_roles`, `promoter_payments`, `promoter_sales`, `promoters`, `purchase_records`,
`qr_scan_logs`, `queue_entries`, `receipts`, `recipe_ingredients`, `recipes`,
**`restaurant_configs`**, `roles`, `security_incidents`, `shifts`, `simulation_leads`,
`stock_items`, `stock_movements`, `supplier_item_mappings`, `suppliers`, **`tab_items`**,
**`tab_members`**, **`tab_payments`**, **`tabs`**, `token_blacklist`, `unit_conversions`,
`user_consents`, `user_credentials`, `user_sanctions`, `users`, `vip_table_guests`,
`vip_table_reservations`, `vip_table_tab_items`, `vip_table_tabs`, `waiter_calls`,
`webhook_deliveries`, `webhook_subscriptions`.

**Em negrito, as que a invariante 9 torna críticas:** auditoria, fiscal, parcelas de
pagamento, comandas de bar e configuração do estabelecimento. `payment_splits` sem RLS
significa que qualquer autenticado pode ler as parcelas de qualquer mesa de qualquer
estabelecimento.

Nota: `restaurant_service_configs`, `stamp_cards` e `loyalty_configs` também aparecem sem
`enable row level security` explícito — confirmar contra o banco linkado antes de agir, já que
`20260427122300_okinawa_bigbang_bootstrap.sql:119` tem um loop que pode ter habilitado algumas
por caminho não capturado pela varredura estática.

### 3.5 Escrita direta de `orders.status`

**Invariante 5 não é apenas descumprida — está invertida.** O único trigger existente
(`20260815170000_order_tracking_realtime_consistency.sql:4-40`) propaga o status do pedido
**para** os itens.

Escritas diretas em SQL:

| Arquivo:linha | Contexto |
|---|---|
| `platform/supabase/migrations/20260624130000_restaurant_operations_rpc.sql:245` | `restaurant_update_order_status` — set manual |
| `platform/supabase/migrations/20260815170000_order_tracking_realtime_consistency.sql:109` | idem, versão revisada |
| `platform/supabase/migrations/20260624207000_kds_operations_rpc.sql:94` | `set status = 'ready'` — convergência dentro da RPC |
| `platform/supabase/migrations/20260713161000_cook_role_permissions.sql:187` | **duplicata** da linha acima |
| `platform/supabase/migrations/20260624211000_payment_rpc.sql:90` | pagamento força `completed` |
| `platform/supabase/migrations/20260710131000_payment_idempotency_fix.sql:94` | idem |
| `platform/supabase/migrations/20260624213000_schema_additions_and_rpc_fixes.sql:83` | idem |
| `platform/supabase/migrations/20260816010000_casual_dining_payment_and_receipt.sql:252` | `set status = 'completed'` no checkout de mesa |
| `platform/supabase/migrations/20260803170000_client_production_backend.sql:180` | `set status = 'cancelled'` |
| `platform/supabase/migrations/20260721193000_manager_approvals_and_staff_overview.sql:209` | `set status = 'cancelled'` via aprovação |

Escrita direta a partir do app (PostgREST, sem RPC):
- `platform/mobile/shared/services/supabase-api.ts:482-491` — `cancelOrder` faz
  `.from('orders').update({ status: 'cancelled', ... })`. As migrations revogam `insert` em
  `orders` (`20260710130000_place_order_rpc.sql:124`) mas **não revogam `update`**.

Chamadas do app que movem status por RPC (legítimas, mas sem derivação):
`apps/restaurant/src/screens/v2/KitchenDisplayScreen.tsx:51`,
`apps/restaurant/src/screens/v2/OrdersScreen.tsx:65,67,70`,
`apps/restaurant/src/screens/v2/OwnerHubScreen.tsx:725,871,1248,1918,2084,2947`.

**Literais numéricos de regra de negócio** (varredura adjacente, critério 6 de F3):

| Arquivo:linha | Literal |
|---|---|
| `platform/mobile/apps/client/src/screens/production/CartScreen.tsx:17` | `const SERVICE_FEE_PCT = 10;` |
| `platform/mobile/apps/client/src/screens/production/ComboBuilderScreen.tsx:14` | `const DISCOUNT_PERCENT = 20;` |
| `platform/mobile/apps/client/src/screens/production/SplitBillScreen.tsx:56` | `serviceFeePercent ?? 10` |
| `platform/mobile/apps/client/src/screens/production/TipPaymentScreen.tsx:35` | `serviceFeePercent ?? 10` |
| `platform/mobile/apps/client/src/screens/production/TipPaymentScreen.tsx:38` | `useState<number>(10)` — gorjeta padrão |
| `platform/supabase/migrations/20260815200000_casual_dining_experience.sql:512` | `(r.service_config->>'service_fee_percent')::numeric, 10` |
| `platform/supabase/migrations/20260815224634_quick_service_custom_combo.sql:31` | `v_discount_pct constant numeric := 20` |
| `platform/supabase/migrations/20260816010000_casual_dining_payment_and_receipt.sql:230` | `least(15.00, v_subtotal)` — cortesia |
| `platform/supabase/migrations/20260814110000_table_session_group_ordering.sql:65` | `now() + interval '6 hours'` — TTL de convite |
| `platform/supabase/migrations/20260803170000_client_production_backend.sql:403` | `party_size > 20`, `now() + interval '30 minutes'` |

Note que a taxa de 10% e o desconto de 20% aparecem **cada um em dois lugares
independentes** (app e SQL). São exatamente os dois pontos que a spec previu que divergiriam.

---

## 4. Estado dos testes

Nenhum critério de aceite de nenhuma fatia tem teste correspondente.

- **Não existe suíte SQL.** Zero testes pgTAP, zero testes de migration, zero varredura de
  `information_schema` ou `pg_tables`. Os critérios F1.6 e F2.1 pedem exatamente isso.
- **O app do cliente está sem testes no working tree.** `git status` mostra
  `platform/mobile/apps/client/jest.config.js` e os 12 arquivos em
  `platform/mobile/apps/client/src/__tests__/` como **deletados** (`D`) e não commitados.
- Os 38 testes restantes (`platform/mobile/shared/`, `platform/mobile/apps/restaurant/`)
  cobrem componentes, hooks de infraestrutura, i18n e formatação — nenhum cobre regra
  financeira, split, convergência de status ou RLS.
- Não existe teste de propriedade para a soma das parcelas (G3.1, ADR-001).

---

## 5. Observação sobre a leitura deste documento

A reconciliação não encontrou "um MVP parcial das fatias". Encontrou **duas coisas
sobrepostas**:

1. Um produto amplo e funcional — três apps, 81 migrations, ~120 tabelas, dezenas de RPCs —
   que cobre a superfície de quase todas as fatias e vai bem além dela (§2).
2. Um conjunto de fundações que a spec trata como inegociáveis e que esse produto não tem:
   dinheiro em centavos, auditoria com rastro, idempotência por intenção, status derivado,
   capacidade validada, parcelas com soma garantida.

O grafo de dependências de `docs/fatias/README.md` diz que F1→F2→F3 vêm antes de tudo
justamente porque essas fundações não se acrescentam depois sem migração de dados. As três
estão classificadas como DIVERGENTE — e é essa a conversa que o procedimento manda ter antes
de qualquer implementação.

Nenhuma decisão foi tomada aqui.
