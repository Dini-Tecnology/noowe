# Backend Supabase - Progresso de Producao

> Decisao arquitetural: o backend final do NOOWE sera 100% Supabase.
> NestJS fica fora da arquitetura alvo e deve ser tratado como legado removido.

## Status Executivo

- Status geral: **P0 operacional e P0 frontend concluídos (25/Jun/2026)**
- Backend alvo: Supabase Auth + Postgres + RLS + Realtime + Storage + Edge Functions + RPCs SQL
- Backend legado NestJS: removido como dependência operacional em todas as telas V2 ativas
- Progresso mobile: ~20 telas V2 conectadas a dados reais, `v2Mocks.ts` deletado, Realtime ativo
- Próximo foco: RLS audit, env/EAS produção, pagamentos/fiscal, testes E2E

### O Que Foi Entregue — Sessão 1 (25/Jun/2026 — turno 1)

| Item | Arquivo | Status |
|------|---------|--------|
| Bug `getDashboardSnapshot` corrigido | `api.ts` | ✅ |
| `markItemPrepared`/`cancelBarItem` → `updateOrderItemStatus` RPC | `api.ts` | ✅ |
| `getMyRestaurant`/`updateRestaurant` → `restaurant_get_profile` RPC | `api.ts` | ✅ |
| Role real do Supabase no contexto (em vez de `useState('owner')`) | `RestaurantRoleContext.tsx` | ✅ |
| Guards de navegação por role (Financial, Staff, Waiter, BarKDS, Settings) | `navigation/index.tsx` | ✅ |
| `BarKDSScreen` → `getBarQueue` RPC + `updateOrderItemStatus` | `BarKDSScreen.tsx` | ✅ |
| `WaiterScreen` → `getMyTables` + `getServiceCalls` RPC | `WaiterScreen.tsx` | ✅ |
| `RestaurantProfileScreen` → `restaurant_get_profile` + `restaurant_update_profile` | `RestaurantProfileScreen.tsx` | ✅ |
| `BusinessHoursScreen` → campo `business_hours` do perfil | `BusinessHoursScreen.tsx` | ✅ |
| `NotificationSettingsScreen` → `settings.notification_prefs` do perfil | `NotificationSettingsScreen.tsx` | ✅ |
| `PaymentSettingsScreen` → `settings.payment_methods` do perfil | `PaymentSettingsScreen.tsx` | ✅ |
| `OwnerHubScreen` ChefKdsView/CookQueueView → `useKdsOrders()` hook | `OwnerHubScreen.tsx` | ✅ |
| `OwnerHubScreen` BarmanQueueView → `getBarQueue()` RPC | `OwnerHubScreen.tsx` | ✅ |

### O Que Foi Entregue — Sessão 2 (25/Jun/2026 — turno 2)

| Item | Arquivo | Status |
|------|---------|--------|
| Fix crítico: guard `serverRole=null` não bloqueava acesso | `navigation/index.tsx` | ✅ |
| `getWaiterTables` e `getWaiterStats` migrados de REST para Supabase | `api.ts` | ✅ |
| `getBarOrders` corrigido (usava `getKdsQueue` em vez de `getBarQueue`) | `api.ts` | ✅ |
| `CallsScreen` → `getServiceCalls` + `acknowledgeServiceCall` + `resolveServiceCall` | `CallsScreen.tsx` | ✅ |
| `ReservationsScreen` → `getReservations` + `updateReservationStatus` com filtros | `ReservationsScreen.tsx` | ✅ |
| `StaffScreen` → `getStaff` RPC com agrupamento por cargo | `StaffScreen.tsx` | ✅ |
| `FinancialScreen` → `getFinancialSummary` + `getTransactions` com seletor de período | `FinancialScreen.tsx` | ✅ |
| `MenuScreen` → `getMenu` RPC com toggle de disponibilidade por item | `MenuScreen.tsx` | ✅ |
| Supabase Realtime em `orders`, `tables`, `service_calls` | `useRestaurantOperations.ts` | ✅ |
| Hook `useRealtimeSubscription` + hooks especializados para cada tabela | `useRealtimeSubscription.ts` | ✅ |
| `WaiterScreen` + `CallsScreen` com Realtime de chamados e mesas | ambos | ✅ |
| `v2Mocks.ts` **deletado** do repositório | — | ✅ |

## Trilhas De Trabalho

| Trilha | Status | Objetivo |
| --- | --- | --- |
| Arquitetura Supabase | ✅ Concluído | Padrão oficial definido: Supabase direto, RPCs, Edge Functions, Realtime |
| Contratos do app restaurante | ✅ Concluído | ~20 telas V2 conectadas; REST legado apenas em domínios P1 |
| Operacao de pedidos/KDS/mesas | ✅ Concluído | Mocks removidos, Realtime ativo, fluxo operacional 100% Supabase |
| Segurança (roles + guards) | ✅ Concluído | Guards corretos, `serverRole=null` nega acesso, roles da DB |
| Chamados e reservas | ✅ Concluído | `CallsScreen` e `ReservationsScreen` com ações reais |
| Equipe e menu | ✅ Concluído | `StaffScreen` e `MenuScreen` com toggle de disponibilidade |
| Financeiro básico | ✅ Concluído | `FinancialScreen` com seletor de período e transações |
| Pagamentos completos | Pendente | Gateway, PIX/cartão/Tap to Pay, webhooks, split, estorno, ledger |
| Fiscal/estoque/custo | Pendente | NFC-e, contingencia, estoque, baixa automatica e COGS |
| CRM/fidelidade/promocoes | Pendente | Segmentacao, pontos, cashback, cupons e campanhas |
| Notificacoes push | Pendente | Push tokens, preferências, segmentação e entrega |
| Env/build producao | Pendente | EAS, app.json, remover SKIP_AUTH, validar build iOS/Android |
| RLS audit | Pendente | Validar policies em todos os domínios multi-tenant |
| Testes E2E | Pendente | Fluxo completo: pedido → KDS → mesa → pagamento → financeiro |
| CI/observabilidade | Pendente | Supabase advisors, migrations CI, monitoramento, runbooks |

## Bloqueadores P0

- [ ] Remover dependencias operacionais de `platform/backend` em Docker/CI/scripts.
- [x] Trocar chamadas REST do app por Supabase client, RPCs ou Edge Functions — telas V2 ativas 100% Supabase; REST legado restante apenas em domínios P1 (HR, analytics, webhooks, AI).
- [x] Remover `v2Mocks.ts` das telas V2 ativas — **arquivo deletado** em 25/Jun/2026.
- [ ] Validar RLS por restaurante em todos os dominios multi-tenant.
- [ ] Criar testes de integracao para fluxos cliente -> restaurante -> financeiro/KDS.

## Contratos Supabase A Implementar

### Operacao Restaurante

- [x] Tabelas base para restaurantes, roles, pedidos, itens, reservas e notificacoes.
- [x] Tabelas geradas para mesas, sessoes, KDS, caixa, fiscal, estoque, recibos e chamados.
- [x] RPC `restaurant_get_orders`.
- [x] RPC `restaurant_update_order_status`.
- [x] RPC `restaurant_get_kds_queue`.
- [x] RPC `restaurant_get_tables`.
- [x] RPC `restaurant_update_table_status`.
- [x] RPC `restaurant_get_dashboard_snapshot`.
- [ ] Realtime para `orders`, `order_items`, `tables`, `waiter_calls`, `reservations`.

### Configuracao Restaurante

- [x] Perfil do restaurante via Supabase (RestaurantProfileScreen conectado a `restaurant_get_profile` / `restaurant_update_profile`).
- [x] Horarios de funcionamento (BusinessHoursScreen lê/grava `business_hours` do perfil via RPC).
- [x] Metodos/preferencias de pagamento (PaymentSettingsScreen lê/grava `settings.payment_methods` via RPC).
- [x] Preferencias de notificacao (NotificationSettingsScreen lê/grava `settings.notification_prefs` via RPC).
- [ ] Configuracoes por service type.
- [ ] Setup progress.

### Pagamentos E Financeiro

- [ ] Wallet e transacoes.
- [ ] PIX/cartao/Tap to Pay via Edge Functions.
- [ ] Split payment.
- [ ] Webhooks de gateway com idempotencia.
- [ ] Caixa: abrir, movimentar, fechar, relatorio.
- [ ] Ledger/reconciliacao.
- [ ] Export financeiro.

### Fiscal, Estoque E Custo

- [ ] Config fiscal e certificado.
- [ ] Emissao NFC-e.
- [ ] Contingencia offline.
- [ ] Ingredientes, receitas e COGS.
- [ ] Stock items e movimentos.
- [ ] Baixa automatica quando pedido for pago/concluido.
- [ ] Importacao XML/NF-e.

### CRM, Fidelidade E Promocoes

- [ ] Perfil de cliente por restaurante.
- [ ] Segmentacao automatica.
- [ ] Pontos por valor gasto.
- [ ] Cashback.
- [ ] Stamp cards.
- [ ] Cupons e campanhas.
- [ ] Push por segmento.

## Telas V2 — Status de Conexao (25/Jun/2026)

### Conectadas a dados reais ✅
- [x] `OrdersScreen` — Realtime ativo
- [x] `KitchenDisplayScreen` — Realtime ativo
- [x] `TablesScreen` — Realtime ativo
- [x] `OwnerHubScreen` — dashboard, pedidos, KDS chef/barman/cook, todos via RPC
- [x] `BarKDSScreen` — `getBarQueue` + `updateOrderItemStatus`
- [x] `WaiterScreen` — `getMyTables` + `getServiceCalls` + Realtime
- [x] `RestaurantProfileScreen` — `restaurant_get_profile` + `restaurant_update_profile`
- [x] `BusinessHoursScreen` — `business_hours` do perfil
- [x] `NotificationSettingsScreen` — `settings.notification_prefs`
- [x] `PaymentSettingsScreen` — `settings.payment_methods`
- [x] `CallsScreen` — `getServiceCalls` + acknowledge + resolve + Realtime
- [x] `ReservationsScreen` — `getReservations` + `updateReservationStatus`
- [x] `StaffScreen` — `getStaff` RPC
- [x] `FinancialScreen` — `getFinancialSummary` + `getTransactions`
- [x] `MenuScreen` — `getMenu` + `toggleMenuItem`

### Ainda placeholder estático (P1)
- [ ] `WaitlistScreen`
- [ ] `TipsScreen`
- [ ] `ReportsScreen`
- [ ] `ReviewsScreen`
- [ ] `PromotionsScreen`
- [ ] `LoyaltyScreen`
- [ ] `OrderPaymentScreen`
- [ ] `QRGeneratorScreen` / `QRBatchScreen`
- [ ] `ServiceConfigScreen`
- [ ] `MaitreScreen`
- [ ] `RoleDashboardScreen`
- [ ] `CasualDiningScreen`

## Padrao De Implementacao

- Preferir acesso direto via `supabase.from(...)` para CRUD simples.
- Usar RPC SQL para operacoes transacionais, agregacoes, dashboards e mudancas de estado.
- Usar Edge Functions para integracoes externas, segredos, webhooks, pagamentos, fiscal e emails.
- Usar RLS como fronteira obrigatoria de tenant e permissao.
- Usar Realtime para fluxos operacionais vivos: pedidos, KDS, mesas, reservas e chamados.
- Toda migration nova deve ser idempotente.

## Log De Implementacao

### 2026-06-24

- [x] Arquitetura alvo definida como 100% Supabase.
- [x] Documento de acompanhamento criado.
- [x] Primeiro corte de RPCs operacionais do restaurante em Supabase.
- [x] Adapter mobile compartilhado iniciou migração para RPCs Supabase em pedidos, KDS e mesas.
- [x] Telas V2 `OrdersScreen`, `KitchenDisplayScreen` e `TablesScreen` deixaram de usar mocks e passaram a consumir Supabase.
- [x] `OwnerHubScreen` conectado parcialmente ao snapshot e pedidos reais do Supabase.

### 2026-06-25 — Turno 1

- [x] Bug `getDashboardSnapshot` corrigido em `api.ts`.
- [x] KDS item mutations migradas para `updateOrderItemStatus` RPC.
- [x] `getMyRestaurant`/`updateRestaurant` → `restaurant_get_profile` RPC.
- [x] `RestaurantRoleContext` agora lê `user_roles` do Supabase no mount.
- [x] Guards de navegação implementados (`withRoleGuard`) com 10 telas protegidas.
- [x] `BarKDSScreen`, `WaiterScreen` e 4 telas de settings conectadas a RPCs.
- [x] Subvisões chef/cook/barman do `OwnerHubScreen` usam hooks e RPCs reais.

### 2026-06-25 — Turno 2

- [x] Fix crítico: guard `serverRole=null` bloqueava apenas um dos casos — corrigido para negar por padrão.
- [x] `getWaiterTables`, `getWaiterStats`, `getBarOrders` migrados para Supabase.
- [x] `CallsScreen` conectada com acknowledge + resolve + Realtime.
- [x] `ReservationsScreen` conectada com filtros por status e ações de confirmação/recusa/sentar.
- [x] `StaffScreen` conectada com agrupamento por cargo.
- [x] `FinancialScreen` conectada com seletor de período (hoje/7d/30d) e lista de transações.
- [x] `MenuScreen` conectada com toggle de disponibilidade por item.
- [x] Supabase Realtime implementado: `orders`, `tables`, `service_calls` nos hooks centrais.
- [x] `useRealtimeSubscription.ts` criado com hooks reutilizáveis por tabela.
- [x] `v2Mocks.ts` **deletado** — 15 telas V2 agora em produção com dados reais.
