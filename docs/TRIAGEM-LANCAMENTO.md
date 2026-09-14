# Triagem de superfície de lançamento

**Data:** 2026-09-03 · **Branch:** `recovery-fix` · **HEAD:** `bbd69c5`
**Base:** `docs/RECONCILIACAO-RESULTADO.md` · **Invariantes:** `CLAUDE.md`

**Escopo de lançamento:** Fine Dining, Casual Dining, Quick Service.
**Adiados (preservar, não deletar):** balada/clube, pub-bar, estoque/fichas técnicas, RH,
carteira P2P, integrações de delivery.

> Nenhum código foi alterado. Este documento classifica superfície.

---

## 0. O número que interessa

| Varredura | Total | Só ADIADA | **Escopo real (LANÇAMENTO + AMBAS)** |
|---|---:|---:|---:|
| 1. Colunas monetárias em `numeric` | 113 | 55 | **58** |
| 2. Cálculos de valor no cliente | 16 | 3 | **13** |
| 3. Ramificações por modelo de serviço | 60+ | 0 | **60+ (100%)** |
| 4. Tabelas sem RLS | 69 | 40 | **29** |
| 5. Escritas diretas em `orders.status` | 10 | 0 | **10** |
| Tabelas | 120 | 42 | **78** |

**Duas correções ao documento anterior**, encontradas ao recontar:

- As tabelas sem RLS são **69**, não 67. A lista é idêntica; o número anterior foi erro de
  contagem.
- As colunas monetárias em `numeric` são **113**, não 105. As 105 são as declaradas em
  `create table`. Faltavam **8 adicionadas por `alter table`** — e entre elas estão as cinco
  de `orders`, a tabela mais importante do lançamento:
  `20260430180100_orders_order_items_expand.sql:28-32` (`subtotal`, `tax_amount`, `tip_amount`,
  `discount_amount`, `total_amount`), mais `menu_items.original_price`
  (`20260624203000_menu_management_rpc.sql:26`) e `gateway_transactions.amount`
  (`20260624211000_payment_rpc.sql:7`, redeclarada em
  `20260624213000_schema_additions_and_rpc_fixes.sql:29`).

### A leitura de uma linha

Adiar seis domínios **corta quase metade do trabalho de F2** (dinheiro: 113 → 58) e **quase
60% do trabalho de RLS** (69 → 29). **Não corta nada de F3** — as ramificações por modelo são,
por definição, dos três modelos que vão lançar. E não corta nada da invariante 5: as dez
escritas em `orders.status` são todas do caminho de lançamento.

---

## 1. As 120 tabelas

**LANÇAMENTO 20 · AMBAS 58 · ADIADA 42**

### 1.1 LANÇAMENTO (20) — mexer aqui não toca domínio futuro

Sessão de mesa, QR e entrada:
`table_sessions`, `table_session_participants`, `table_session_invites`, `table_qr_codes`,
`qr_scan_logs`, `reservations`, `reservation_guests`, `waitlist_entries`, `service_calls`

Casual Dining e assistência:
`casual_dining_receipts`, `casual_dining_family_loyalty`, `kid_activities`,
`customer_feedback`, `restaurant_special_requests`

Split (hoje inertes, ancoradas em `order_id`):
`payment_splits`, `order_guests`

Fora dos dois domínios — marketing/demo, não são produto:
`waitlist` (leads do site, `20260318004427_...:2`), `demo_leads`, `demo_feedback`,
`simulation_leads`

### 1.2 ADIADA (42) — congelar inteiras

| Domínio | Tabelas |
|---|---|
| Balada / clube (14) | `club_entries`, `club_check_in_outs`, `club_birthday_entries`, `guest_list_entries`, `lineups`, `lineup_slots`, `promoters`, `promoter_sales`, `promoter_payments`, `vip_table_reservations`, `vip_table_guests`, `vip_table_tabs`, `vip_table_tab_items`, `queue_entries` |
| Pub-bar (4) | `tabs`, `tab_items`, `tab_members`, `tab_payments` |
| Estoque / fichas (16) | `ingredients`, `ingredient_prices`, `ingredient_suppliers`, `suppliers`, `supplier_item_mappings`, `recipes`, `recipe_ingredients`, `drink_recipes`, `stock_items`, `stock_movements`, `inventory_counts`, `inventory_count_items`, `inventory_items`, `purchase_records`, `unit_conversions` |
| RH (3) | `shifts`, `attendances`, `leave_requests` |
| Delivery / integrações (6) | `platform_connections`, `external_menu_mappings`, `delivery_settlements`, `restaurant_integrations`, `webhook_subscriptions`, `webhook_deliveries` |

`queue_entries` entra aqui porque é a fila **do domínio de balada** (`priority_level_id`,
`priority_level_name`) — a fila do restaurante é `waitlist_entries`, que é LANÇAMENTO. São as
duas implementações concorrentes registradas em §2.10 da reconciliação; a triagem separa uma
de cada lado.

A carteira P2P **não aparece aqui** — ver §5.

### 1.3 AMBAS (58) — ver §5

---

## 2. Classificação dos cinco conjuntos de achados

### 2.1 Colunas monetárias em `numeric` — 113 total, **58 no escopo**

| Bucket | Colunas | Tabelas atingidas |
|---|---:|---|
| LANÇAMENTO | 16 | `casual_dining_receipts` (6), `payment_splits` (5), `table_sessions` (3), `order_guests` (2) |
| **AMBAS** | **42** | `orders` (5)*, `order_items` (2), `menu_items` (2)*, `gateway_transactions` (4)*, `wallets` (2), `wallet_transactions` (3), `loyalty_programs` (2), `promotions` (2), `cash_register_sessions` (3), `restaurant_service_configs` (3), `receipts` (4), `customer_profiles` (2), `bills`, `approvals`, `financial_transactions`, `fiscal_documents`, `tips`, `reviews`, `happy_hour_schedules`, `cash_register_movements` |
| ADIADA | 55 | `tabs` (8), `promoters` (7), `vip_table_tabs` (5), `tab_items` (3), `tab_members` (3), `club_entries` (3), `tab_payments` (2), `vip_table_reservations` (2), `vip_table_tab_items` (2), `club_birthday_entries` (2), `promoter_sales` (2), `delivery_settlements` (2), `drink_recipes` (2), + 12 de estoque/RH com 1 cada |

\* inclui colunas adicionadas por `alter table`.

**O centro de gravidade é `orders` + `order_items` + `gateway_transactions` = 11 colunas.** São
elas que carregam todo valor cobrado do lançamento. As 55 adiadas são metade do volume e podem
esperar — mas note que `tabs` sozinha tem 8, mais que `orders`.

### 2.2 Cálculos de valor no cliente — 16 total, **13 no escopo**

| # | Arquivo:linha | Bucket |
|---|---|---|
| 1 | `apps/client/src/screens/production/CartScreen.tsx:84` | LANÇAMENTO |
| 2 | `apps/client/src/screens/production/CartScreen.tsx:85` | LANÇAMENTO |
| 3 | `apps/client/src/screens/production/SplitBillScreen.tsx:58` | LANÇAMENTO |
| 4 | `apps/client/src/screens/production/SplitBillScreen.tsx:67` | LANÇAMENTO |
| 5 | `apps/client/src/screens/production/SplitBillScreen.tsx:70-71` | LANÇAMENTO |
| 6 | `apps/client/src/screens/production/SplitBillScreen.tsx:76` | LANÇAMENTO |
| 7 | `apps/client/src/screens/production/TipPaymentScreen.tsx:41` | LANÇAMENTO |
| 8 | `apps/client/src/screens/production/TipPaymentScreen.tsx:42` | LANÇAMENTO |
| 9 | `apps/client/src/screens/production/TipPaymentScreen.tsx:43` | LANÇAMENTO |
| 10 | `apps/client/src/screens/production/ComboBuilderScreen.tsx:65` | LANÇAMENTO |
| 11 | `apps/client/src/screens/production/ComboBuilderScreen.tsx:66` | LANÇAMENTO |
| 12 | `apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx:56` | LANÇAMENTO |
| 13 | `apps/restaurant/src/screens/v2/WaiterTapToPayScreen.tsx:57` | LANÇAMENTO |
| 14 | `apps/client/src/screens/club/TicketPurchaseScreen.tsx:249` | ADIADA |
| 15 | `apps/client/src/screens/pub-bar/RoundBuilderSheet.tsx:289` | ADIADA |
| 16 | `apps/client/src/screens/pub-bar/TabPaymentScreen.tsx:215` | ADIADA |

O corte aqui quase não ajuda: **13 dos 16 são do lançamento**, e os três mais graves — os que
produzem o valor efetivamente cobrado (`TipPaymentScreen.tsx:43` e `WaiterTapToPayScreen.tsx:57`)
— são todos do lançamento.

Nuance útil: **os 3 adiados já são inalcançáveis** (ver §4). Não precisam ser congelados; já
estão.

### 2.3 Ramificação por modelo de serviço — 60+ total, **60+ no escopo (nenhum corte)**

Óbvio quando se diz em voz alta: os três literais são `fine_dining`, `casual_dining` e
`quick_service` — os três modelos que **vão** lançar. Nenhuma ocorrência pertence a balada,
pub-bar, estoque, RH, carteira ou delivery.

Distribuição inalterada: 9 no `switch` de
`apps/client/src/hooks/useServiceTypeFeatures.ts:92-124`, ~35 em telas de
`apps/client/src/screens/production/` e `apps/restaurant/src/screens/v2/`, 14 dentro de RPCs.

**F3 não encolhe com a triagem.** É a única das três fatias de fundação cujo escopo é idêntico
com ou sem os domínios adiados.

### 2.4 Tabelas sem RLS — 69 total, **29 no escopo**

**LANÇAMENTO (4):** `payment_splits`, `order_guests`, `qr_scan_logs`, `simulation_leads`

**AMBAS (25):** `audit_logs`, `users`, `roles`, `profile_roles`, `restaurant_configs`,
`fiscal_configs`, `fiscal_documents`, `receipts`, `waiter_calls`, `customer_profiles`,
`addresses`, `menu_item_customization_groups`, `happy_hour_schedules`, `fire_schedules`,
`prep_analytics`, `prep_time_suggestions`, `user_consents`, `user_credentials`,
`user_sanctions`, `security_incidents`, `fraud_alerts`, `token_blacklist`, `otp_tokens`,
`password_reset_tokens`, `biometric_tokens`

**ADIADA (40):** as 4 de pub-bar, 12 de balada, 15 de estoque, 3 de RH, 6 de delivery.

Esta é a varredura onde a triagem mais paga: **de 69 para 29**. E dentro das 29, o subconjunto
que a invariante 9 torna urgente é pequeno e nomeável:

- `audit_logs` — o rastro de toda ação sensível, legível por qualquer autenticado
- `fiscal_documents`, `fiscal_configs` — documento fiscal por estabelecimento
- `payment_splits` — parcelas de pagamento de qualquer mesa de qualquer estabelecimento
- `user_credentials`, `otp_tokens`, `password_reset_tokens`, `biometric_tokens`,
  `token_blacklist` — material de autenticação
- `user_consents`, `user_sanctions`, `security_incidents`, `fraud_alerts` — LGPD e segurança

Doze tabelas. É um dia de trabalho, não um mês.

### 2.5 Escritas diretas em `orders.status` — 10 total, **10 no escopo (nenhum corte)**

`orders` é AMBAS, mas nenhuma das dez escritas parte de domínio adiado — o pub-bar não usa
`orders` (usa `tab_items`), a balada não usa `orders` (usa `club_entries`). As dez são todas
do caminho de pedido do restaurante:

`20260624130000:245` · `20260815170000:109` · `20260624207000:94` · `20260713161000:187` ·
`20260624211000:90` · `20260710131000:94` · `20260624213000:83` · `20260816010000:252` ·
`20260803170000:180` · `20260721193000:209`
— mais a escrita via PostgREST em `platform/mobile/shared/services/supabase-api.ts:482-491`.

**Invariante 5 não encolhe com a triagem.**

---

## 3. Escopo real de F1, F2 e F3 depois da triagem

| Fatia | Antes | Depois | Corte |
|---|---:|---:|---:|
| **F1** — RLS em toda tabela de negócio | 69 tabelas sem RLS | **29** | −58% |
| **F2** — dinheiro em centavos | 113 colunas | **58** | −49% |
| **F2** — auditoria | 0 inserts em 6 ações | **0 inserts em 6 ações** | 0% |
| **F2** — idempotência | `place_order` + `restaurant_record_payment` sem chave | **igual** | 0% |
| **F3** — capability flags | 60+ ramificações | **60+** | 0% |
| Invariante 5 | 10 escritas diretas | **10** | 0% |

A triagem é generosa com as duas fatias que são **volume de schema** (F1 e a parte de dinheiro
de F2) e não faz nada pelas quatro que são **desenho** (auditoria, idempotência, capabilities,
derivação de status). Isso é esperado: adiar domínios remove tabelas, não remove decisões.

---

## 4. Telas e rotas de domínios adiados

### 4.1 App do cliente — já inalcançáveis

**Achado que muda o plano:** `apps/client/src/App.tsx:15` importa
`./navigation/production`. O navegador `apps/client/src/navigation/index.tsx` — que é onde
todas as rotas de domínio adiado estão registradas — **não é importado por nenhum arquivo do
app**. É código morto hoje.

Rotas registradas apenas em `apps/client/src/navigation/index.tsx` (não montadas):

| Rota | Linha | Tela | Domínio |
|---|---:|---|---|
| `ClubHome` | 691 | `screens/club/ClubHomeScreen.tsx` | balada |
| `ClubQueue` | 696 | `screens/club/ClubQueueScreen.tsx` | balada |
| `TicketPurchase` | 701 | `screens/club/TicketPurchaseScreen.tsx` | balada |
| `VipTable` | 706 | `screens/club/VipTableScreen.tsx` | balada |
| `Lineup` | 711 | `screens/club/LineupScreen.tsx` | balada |
| `BirthdayBooking` | 716 | `screens/club/BirthdayBookingScreen.tsx` | balada |
| `TabScreen` | 566 | `screens/pub-bar/TabScreen.tsx` | pub-bar |
| `TabPayment` | 571 | `screens/pub-bar/TabPaymentScreen.tsx` | pub-bar |
| `BuffetCheckin` | 735 | `screens/buffet/BuffetCheckinScreen.tsx` | buffet (fora do MVP) |
| `WaitlistBar` | 679 | consumo na espera | limítrofe — E2 |

Sem rota própria, alcançáveis só por outra tela de domínio adiado:
`screens/club/BirthdayEntryRequestScreen.tsx`, `screens/pub-bar/RoundBuilderSheet.tsx`.

Também não montadas, e não são domínio adiado — são **telas de lançamento órfãs**, o que vale
registrar à parte: `UnifiedPayment` (532), `SplitPayment` (537), `Checkout` (522),
`OrderTracking` (583), `SharedOrder` (588), `PartialOrder` (593), `GroupBooking` (622),
`GuestInvitation` (627), `StampCards` (728). São funcionalidade de G2/G3/P1 escrita e nunca
plugada.

**Consequência prática:** congelar os domínios adiados no app do cliente **não exige remover
nada**. Basta não montar `navigation/index.tsx` — que é o estado atual. Os três cálculos de
valor no cliente classificados como ADIADA (§2.2) já são inertes pelo mesmo motivo.

### 4.2 App do restaurante — três rotas vivas de domínio adiado

Ao contrário do cliente, aqui há domínio adiado **montado e alcançável**, em
`apps/restaurant/src/navigation/index.tsx`:

| Rota | Linha | Tela | Domínio |
|---|---:|---|---|
| `Shifts` | 502 | `screens/v2/ShiftsScreen.tsx` | RH |
| `Integrations` | 503 | `screens/v2/IntegrationsScreen.tsx` | delivery |
| `ConfigMarketplace` | 508 | `screens/v2/config/ConfigMarketplaceScreen.tsx` | delivery |

Todas passam por guarda de papel (`GuardedShifts`, `GuardedIntegrations`,
`GuardedConfigMarketplace`), mas estão no navegador de produção.

Estoque e fichas técnicas **não têm tela** no app do restaurante — existem só como schema e
RPC (`20260624206000_stock_inventory_rpc.sql`). Não há superfície de UI para congelar.

A rota `Tabs` (`:472`) **não é pub-bar** — é o `MainTabs`, o navegador de abas inferior. Não
confundir.

---

## 5. As 58 tabelas AMBAS — o mapa de risco

São estas que exigem cuidado: **corrigir para o lançamento mexe em algo que o domínio futuro
usa.** Ordenadas por risco.

### 5.1 Risco alto — a correção de F2 quebra o domínio adiado

| Tabela | Por que é compartilhada | O que quebra |
|---|---|---|
| **`menu_items`** | `tab_items.menu_item_id`, `recipes`, `external_menu_mappings`, `drink_recipes` | Migrar `price` para `bigint` centavos muda o tipo lido pelo motor de comanda do pub-bar, pelo custo de ficha técnica e pelo mapeamento de cardápio do delivery. Três consumidores adiados, um tipo. |
| **`gateway_transactions`** | trigger de carteira (`20260814233000_...:504-507`), `tab_payments.transaction_id`, `delivery_settlements` | É a tabela de pagamento única. `amount`, `amount_cents` e `refunded_amount_cents` são `numeric`. Corrigir os três dispara o trigger de cashback e afeta a conciliação de delivery. |
| **`wallets` / `wallet_transactions`** | **a carteira não é só P2P** — ver §5.4 | 5 colunas `numeric` de saldo. Migrar mexe no cashback do lançamento e no P2P adiado ao mesmo tempo. |
| **`orders`** | `source`, `source_order_id`, `delivery_rider_eta` são colunas de delivery (`20260430180100_...:50-52`) | As 5 colunas monetárias e a máquina de estado. Delivery lê `orders` — congelar o domínio não desacopla a tabela. |
| **`restaurant_service_configs`** | carrega `price_per_kg`, `smart_scales_enabled`, `drive_thru_lanes`, `geofencing_*` (`20260430180000_...:1148-1156`) | É a tabela de configuração de **todos** os modelos, inclusive os fora do MVP. F3 vai reescrevê-la; o desenho precisa acomodar buffet e drive-thru sem implementá-los. |

### 5.2 Risco alto — a correção de F1 (RLS) tem alcance maior que o lançamento

| Tabela | Consumidores adiados |
|---|---|
| **`audit_logs`** | RH (`leave_requests`), estoque (`purchase_records`), balada (comissão de promoter) precisarão auditar. A política escrita agora vai valer para eles. |
| **`fiscal_documents`, `fiscal_configs`** | emissão fiscal serve delivery e pub-bar também |
| **`waiter_calls`** | tem `tab_id` — coluna do pub-bar (`20260430180000_...:1462`). Habilitar RLS numa tabela cujo modelo já prevê o domínio adiado. |
| **`user_roles`, `roles`, `profile_roles`, `users`, `profiles`** | o modelo de papéis do RH adiado é o mesmo (`shifts`, `attendances` referenciam papel) |
| **`restaurant_configs`** | `kitchen_stations`, `team_config`, `enabled_features` cobrem estoque e RH |

### 5.3 Risco médio — compartilhamento real, correção contida

`order_items` (pub-bar tem `tab_items` próprio, mas KDS é comum) · `cook_stations`,
`fire_schedules`, `kds_brain_configs`, `prep_analytics`, `prep_time_suggestions` (o KDS serve
pub-bar) · `loyalty_programs`, `loyalty_configs`, `stamp_cards` (fidelidade prevista para
balada) · `promotions`, `promotion_redemptions`, `happy_hour_schedules` (happy hour é pub-bar
por natureza) · `cash_register_sessions`, `cash_register_movements` (caixa serve todos) ·
`financial_transactions`, `bills`, `receipts`, `tips`, `approvals` · `tables` (`tabs.table_id`,
VIP de balada) · `reviews`, `review_reports`, `customer_profiles`, `addresses`, `favorites` ·
`notifications`, `device_push_tokens` · `menu_categories`, `menu_item_customization_groups` ·
`payment_methods`, `gateway_configs` · `user_consents`, `user_sanctions`, `security_incidents`,
`fraud_alerts`, `token_blacklist`, `otp_tokens`, `password_reset_tokens`, `biometric_tokens`,
`user_credentials`, `edge_rate_limits` · `restaurants`.

### 5.4 A carteira não é adiável como está

O cliente pediu para adiar "carteira P2P". A triagem encontra que **a carteira está dentro do
caminho de pagamento do lançamento**:

`private.apply_customer_wallet_payment()` é um trigger
`after insert or update of status on public.gateway_transactions`
(`20260814233000_customer_wallet_backend.sql:504-507`). Ele roda em **todo** pagamento —
inclusive o `customer_pay_table_bill` do Casual Dining, que explicitamente lê o cashback de
volta em vez de recalculá-lo (`20260816010000_...:272-280`).

Ou seja: `wallets`, `wallet_transactions` e `payment_methods` são **AMBAS**, não ADIADA. O que
é adiável é uma função só — `public.customer_transfer_wallet(text, numeric, uuid)`
(`20260814233000_...:328`, grant em `:519`). A transferência entre usuários é a parte P2P; o
saldo e o cashback não são.

### 5.5 Onde a triagem é barata

`payment_splits`, `order_guests`, `qr_scan_logs` são LANÇAMENTO **e** estão sem RLS **e** não
têm consumidor adiado. Não há negociação: podem ser corrigidas sem olhar para o futuro.
Somadas, são 7 das 16 colunas monetárias de LANÇAMENTO.

---

## 6. O segundo motor de comanda do pub-bar é isolável?

**Sim, e mais do que se esperaria — mas não pelo motivo certo.**

### 6.1 O que ele não compartilha

`tabs`, `tab_items`, `tab_members`, `tab_payments` **não referenciam** `table_sessions`,
`table_session_participants`, `orders` nem `order_items`. Nenhuma coluna, em lugar nenhum.
Verificado em `20260430180000_generated_rest_platform_tables.sql:1386-1455`.

`tabs` tem seu próprio `invite_token` (`:1450`) em vez de `table_session_invites`, seu próprio
`tab_members` em vez de `table_session_participants`, e seu próprio `tab_payments` em vez de
`payment_splits`. É um clone completo do motor de sessão, escrito em paralelo.

### 6.2 O que ele compartilha

Três chaves, todas de catálogo e chão de salão, nenhuma de sessão:

| Coluna | Aponta para | Bucket do alvo |
|---|---|---|
| `tabs.restaurant_id` (`:1436`) | `restaurants` | AMBAS |
| `tabs.table_id` (`:1437`) | `tables` | AMBAS |
| `tabs.host_user_id` (`:1438`), `tab_members.user_id` (`:1408`), `tab_items.ordered_by_user_id` (`:1390`) | `profiles` | AMBAS |
| `tab_items.menu_item_id` (`:1389`) | `menu_items` | AMBAS |
| `waiter_calls.tab_id` (`:1462`) | `tabs` — **acoplamento na direção inversa** | AMBAS → ADIADA |

O único acoplamento que aponta **do lançamento para o adiado** é `waiter_calls.tab_id`. E
`waiter_calls` está viva no caminho de lançamento: é contada no snapshot do dashboard
(`20260624130000_restaurant_operations_rpc.sql:516`) e populada pelo seed
(`20260730120000_restaurant_client_simulation_seed.sql:925`).

### 6.3 A ressalva importante

**Nada disso é enforçado pelo banco.** O arquivo que cria as quatro tabelas declara na linha 4:
"Sem FKs aqui — adicionar em migração dedicada quando estáveis"
(`20260430180000_generated_rest_platform_tables.sql:4`). Nenhuma FK foi adicionada depois para
essas tabelas — a busca por `add constraint` ligada a `tab_*` retorna zero.

Então o isolamento é **de fato, não de desenho**. O motor está isolado porque ninguém escreveu
a ligação, não porque a ligação foi proibida.

### 6.4 E o app não fala com o mesmo backend

`apps/client/src/hooks/useTab.ts:24,26` importa `ApiService` de `@/shared/services/api` e
`useWebSocket` — o gateway REST/WS legado. As telas de pub-bar
(`RoundBuilderSheet.tsx:45`, `TabPaymentScreen.tsx`) fazem o mesmo. **Nenhuma chamada
Supabase** (`from(...)` ou `rpc(...)`) em todo o diretório `screens/pub-bar/`.

O motor de pub-bar é, hoje: quatro tabelas sem FK, sem RLS, sem RPC, servidas por um backend
que o app de produção não usa mais, atrás de rotas num navegador que não é montado.

**Conclusão:** totalmente isolável. Congelar o pub-bar custa uma coisa só — decidir o que fazer
com `waiter_calls.tab_id` ao habilitar RLS em `waiter_calls`. Fora isso, ele já está congelado
por acidente.

---

## 7. O que esta triagem não decide

- Se as 42 tabelas ADIADA ficam no schema (com RLS negando tudo) ou saem para um schema
  separado. São 40 sem RLS hoje; deixá-las assim é vazamento entre estabelecimentos mesmo em
  domínio congelado.
- Se `queue_entries` e `waitlist_entries` convivem ou se uma vence — a triagem só registra que
  caem em lados opostos.
- Se `navigation/index.tsx` é removido, mantido como referência, ou reaproveitado. Ele contém
  nove telas de **lançamento** órfãs (§4.1) que talvez sejam trabalho já pago.
- O que fazer com `customer_transfer_wallet` — desabilitar o grant ou manter.

Nenhuma dessas é decisão técnica isolada. Todas dependem de quando o cliente quer os domínios
adiados de volta.
