# T0 — Fundações (F1, F2, F3)

**Fatias:** [F1](../fatias/F1-tenancy-papeis-rls.md) · [F2](../fatias/F2-dinheiro-auditoria-idempotencia.md) · [F3](../fatias/F3-config-capabilities.md)
**Spec:** §7.1 (configuração), §7.2 (dados e integridade), §7.3 (idempotência)

> As três fatias estão **DIVERGENTES**. Este bloco é o mais caro do backlog e o único que não
> pode ser adiado: 105 colunas monetárias, 69 tabelas sem RLS e uma camada de capabilities
> hardcoded em TypeScript são fundações que não se acrescentam depois.

---

## F1 — Tenancy, papéis e RLS

### T-F1-01 · AJUSTE — Política ou justificativa nas tabelas com RLS e sem política
**Tipo** banco **Tamanho** P
**Spec** §7.2 ("toda tabela de negócio precisa de política de acesso por estabelecimento e por papel") **Invariante** 9
**Gap** *Corrigido em 2026-09-14.* A contagem anterior ("69 tabelas sem RLS") vinha de uma leitura estática que
não enxergou os laços dinâmicos de `20260427122300_okinawa_bigbang_bootstrap.sql:120` e
`20260622120000_supabase_auth_roles_rls.sql:358`, que ligam RLS em todas as tabelas de `public`. O banco vivo
confirma: **0 de 121 tabelas sem RLS**. O problema real é outro — **tabelas com RLS e nenhuma política**, que
negam tudo aos papéis de cliente. Fora dos domínios congelados são 8: `edge_rate_limits`, `fire_schedules`,
`kid_activities`, `menu_item_customization_groups`, `order_guests`, `otp_tokens`, `security_incidents` e
`Projeto_Ativo` (esta criada fora das migrations, ver T-X-20).
**Fazer**
- Para cada uma, decidir: continua negando tudo (acesso só por RPC `security definer` ou `service_role`) ou ganha
  política por estabelecimento com `private.has_restaurant_role(...)`. Registrar a decisão em `comment on table`.
- `edge_rate_limits` e `otp_tokens` são acessadas por Edge Function com `service_role`; deny-all é o esperado.
- `kid_activities` é lida pelo modo família só via `customer_list_kid_activities`, que é `security definer`
  (confirmado no banco vivo em 14/09): o deny-all atende.
**Aceite**
- Toda tabela de negócio fora dos domínios congelados tem ao menos uma política ou um comentário que justifica o deny-all.
- `01_sweep_rls.sql` segue verde com allowlist vazia.

### T-F1-02 · AJUSTE — "Garçom vê as próprias mesas" como política de linha
**Tipo** banco **Tamanho** M
**Spec** §7.2 **Invariante** 9
**Gap** O recorte existe apenas dentro de RPCs (`20260624210000_waiter_operations_rpc.sql:70`,
`20260721171000_customer_assistance_backend.sql:403,429,465`). `public.tables` não tem política
que filtre por `assigned_waiter_id` — um `select` direto devolve o salão inteiro, e o Realtime
respeita RLS, então o vazamento é também de evento.
**Fazer** Política de `select` em `tables`, `orders`, `order_items` e `service_calls` que recorte por
papel: garçom → mesas atribuídas; gerente → unidade; dono → todas as unidades.
**Aceite** Garçom autenticado lê apenas as próprias mesas por PostgREST e recebe evento Realtime apenas delas.

### T-F1-03 · NOVO — Canal e política Realtime por estação
**Tipo** banco/servidor **Tamanho** M
**Spec** §7.3 ("canais em tempo real por estabelecimento e por estação, para que o KDS receba apenas o que lhe diz respeito")
**Gap** `order_items` é publicado inteiro (`20260624210000_waiter_operations_rpc.sql:255`). A estação
do bar recebe todos os eventos da casa e filtra no cliente. `cook_stations` existe
(`20260430180000_...:762`) mas não há canal nem política por estação.
**Fazer** Publicação/canal por `station_id`; política de `select` em `order_items` recortada por estação
do usuário. Depende de T-N1-01 (FK de estação).
**Aceite** Estação de bar não recebe evento de item de cozinha, verificado no payload do Realtime.

### T-F1-04 · AJUSTE — Teste que falha se alguma tabela de negócio estiver sem RLS
**Tipo** teste **Tamanho** P
**Spec** §7.2 **Invariante** 9
**Gap** *Atualizado em 2026-09-14.* O teste existe (`platform/supabase/tests/01_sweep_rls.sql`, pgTAP). A allowlist
de 27 tabelas "sem RLS" estava errada (ver T-F1-01) e foi esvaziada; o teste agora também lista, sem reprovar, as
tabelas com RLS e sem política. Falta rodar no CI (T-F2-08).
**Fazer** Manter a allowlist vazia; toda entrada nova exige justificativa escrita ao lado.
**Aceite** Criar tabela nova sem RLS quebra o build.

### T-F1-05 · NOVO — Auditoria de isolamento das políticas existentes
**Tipo** banco/teste **Tamanho** M
**Spec** §7.2 ("o garçom vê as próprias mesas, o gerente vê a unidade, o dono vê todas as unidades") **Invariante** 9
**Gap** RLS ligado não garante isolamento. O banco vivo tem **496 políticas** em `public` (14/09/2026), boa parte
gerada por laço em `20260622120000_supabase_auth_roles_rls.sql:509` para toda tabela com `restaurant_id`. Nenhuma
foi testada com usuário de outro estabelecimento. Há também políticas `using (true)`: escrita anônima nos
formulários de lead do site (`demo_feedback`, `demo_leads`, `simulation_leads`, `waitlist`) e leitura de `roles`.
**Fazer** Teste pgTAP que, para cada tabela de lançamento, cria dois restaurantes e três papéis (dono, gerente,
garçom), personifica com `_test.as_user` e verifica leitura e escrita cruzadas. Revisar as políticas `true`.
**Aceite** Nenhuma tabela de lançamento devolve linha de outro estabelecimento a `authenticated`, verificado por teste.

---

## F2 — Dinheiro, auditoria e idempotência

### T-F2-01 · AJUSTE — Dinheiro em `bigint` de centavos
**Tipo** banco **Tamanho** G **Bloqueia** N4, G3, Q1, P1, e todo cálculo financeiro
**Spec** §7.2 ("valores monetários devem ser armazenados em centavos (inteiros) para eliminar erro de arredondamento na divisão") **Invariante** 1
**Gap** **105 colunas monetárias em `numeric`, zero em `bigint`** (reverificado: `grep -i bigint` nas 81
migrations retorna zero linhas). As duas colunas que já se chamam `_cents` também são `numeric`:
`gateway_transactions.amount_cents` e `.refunded_amount_cents`
(`20260430180000_...:925,932`). Não existe domínio, tipo `Money` compartilhado nem `check (>= 0)`.
`WaiterTapToPayScreen.tsx:55` faz o caminho inverso — `const amount = cents / 100` — reintroduzindo
float a partir de centavos.
**Fazer**
- Domínio `money_cents` = `bigint` com `check (value >= 0)`, exceto colunas que representam ajuste.
- Migração em três tempos por tabela: coluna nova `*_cents` → backfill `round(valor * 100)` →
  troca de leitura → drop da antiga. Não converter as 105 de uma vez.
- Ordem sugerida: `order_items` e `orders` primeiro (base de tudo), depois pagamento, depois
  fidelidade, depois os domínios órfãos do T5.
- Assinaturas de RPC também mudam: `20260624211000_payment_rpc.sql:45,46`,
  `20260624200000_cash_register_rpc.sql:125,184,249`, `20260624203000_menu_management_rpc.sql:122,123,180,181`,
  `20260624208000_loyalty_rpc.sql:64`, `20260709126000_promotions_reviews_rpc.sql:47`,
  `20260714093000_financial_dashboard_and_bills.sql:93`, `20260721193000_...:107`,
  `20260624210000_waiter_operations_rpc.sql:182`, `20260815200000_...:81,82,471,472,753`.
**Aceite**
- Nenhuma coluna monetária em `numeric`/`real`/`double precision`, verificado por varredura de `information_schema` no CI.
- `database.generated.ts` regenerado; nenhum valor monetário tipado como `number` de reais.

### T-F2-02 · AJUSTE — Tipo `Money` no app e formatação só na borda
**Tipo** app **Tamanho** M **Depende de** T-F2-01
**Spec** §7.2 **Invariante** 1
**Gap** `shared/types/database.generated.ts` tipa todas as colunas monetárias como `number` e o app
inteiro opera nesse tipo. Conversões explícitas espalhadas:
`pub-bar/RoundBuilderSheet.tsx:289` (`Number(roundItem.menuItem.price)`), `pub-bar/TabPaymentScreen.tsx:215`.
**Fazer** Tipo nominal `Cents` (branded type) em `shared/types`; helper `formatMoney(cents, locale)` como
única função que produz string de dinheiro; proibir aritmética de dinheiro fora de `shared/money`.
**Aceite** Regra de lint que rejeita operador aritmético sobre valor tipado `Cents` fora de `shared/money`.

### T-F2-03 · AJUSTE — `audit_log` com `restaurant_id`, `reason`, `before` e `after`
**Tipo** banco **Tamanho** P **Bloqueia** T-F2-04, T-G2-02, T-G3-08, T-C1-05, T-N2-06, T-P2-04
**Spec** §7.2 ("toda ação sensível precisa de trilha de auditoria com autor, motivo e horário") **Invariante** 8
**Gap** `audit_logs` existe (`20260430180000_...:622-635`) e **não tem `reason`, `before` nem `after`** —
os três campos que a fatia exige. No banco vivo (14/09/2026) também **não tem coluna de estabelecimento**: as
colunas são de log de autenticação (`email`, `ip_address`, `user_agent`, `success`, `failure_reason`). Sem
`restaurant_id` não existe política de isolamento possível.
**Fazer** Acrescentar `restaurant_id`, `reason`, `before` e `after`; criar helper
`private.log_audit(actor, restaurant_id, action, entity, reason, before, after)` `security definer`, chamável de
dentro de qualquer RPC na mesma transação da ação. Decidir se o log de autenticação continua nesta tabela ou sai
para uma própria.
**Aceite** `log_audit` grava e faz rollback junto com a ação que a chamou, verificado em teste transacional.

### T-F2-04 · NOVO — Instrumentar as seis ações sensíveis
**Tipo** servidor **Tamanho** M **Depende de** T-F2-03
**Spec** §7.2 **Invariante** 8
**Gap** **`grep "insert into public.audit_logs"` nas 81 migrations retorna zero linhas** (reverificado).
Nenhuma das seis ações sensíveis grava rastro. O cancelamento
(`20260803170000_client_production_backend.sql:180`) grava o motivo em `orders.cancellation_reason`
e não registra autor nem horário em lugar nenhum. `public.approvals`
(`20260721193000_manager_approvals_and_staff_overview.sql`) cobre parte do fluxo de aprovação mas
não é auditoria e não é chamada pelas demais ações.
**Fazer** Chamar `log_audit` em: cancelamento, cortesia, estorno, desconto, reabertura de conta e exceção
de lotação. Motivo obrigatório em todas.
**Aceite** Cada uma das seis ações, executada por RPC, deixa exatamente uma linha em `audit_log` com autor, motivo e horário.

### T-F2-05 · NOVO — Chave de idempotência em `place_order`
**Tipo** servidor **Tamanho** M
**Spec** §7.3 ("idempotência em pagamento e criação de pedido, evitando duplicidade em reenvio de requisição") **Invariante** 10
**Gap** `public.place_order` (`20260710130000_place_order_rpc.sql:12-19`) **não tem parâmetro de chave**
(reverificado: `grep idempotency` no arquivo retorna zero). Duas chamadas criam dois pedidos.
**Fazer** Parâmetro `p_idempotency_key` obrigatório; índice único `(restaurant_id, idempotency_key)`;
reenvio devolve o pedido existente em vez de criar outro.
**Aceite** Duas chamadas com a mesma chave produzem um pedido e a mesma resposta.

### T-F2-06 · AJUSTE — Idempotência em `restaurant_record_payment`
**Tipo** servidor **Tamanho** P
**Spec** §7.3 **Invariante** 10
**Gap** `restaurant_record_payment` (`20260624211000_payment_rpc.sql:43-48`) não tem chave. A
deduplicação existe só em `20260710131000_payment_idempotency_fix.sql:54-58` (`customer_pay_order`),
`20260814233000_customer_wallet_backend.sql:44-46` e `20260816010000_...:140-145`.
**Aceite** Reenvio da mesma cobrança não gera segunda transação em `gateway_transactions`.

### T-F2-07 · AJUSTE — Chave de idempotência por intenção, não por request
**Tipo** app **Tamanho** P
**Spec** §7.3 **Invariante** 10
**Gap** A chave é gerada por request — o oposto do que a invariante pede, e o fallback dispara a cada retry:
`payment/UnifiedPaymentScreen.tsx:321` → `` `${order.id}-${Date.now()}` `` ·
`payment/SplitPaymentScreen.tsx:390` → `` `split-${split.id}-${Date.now()}` `` ·
`services/customer-backend.ts:877,1250,1416` → `input.idempotencyKey ?? Crypto.randomUUID()`.
**Fazer** Gerar a chave uma vez, quando a **intenção** nasce (abrir o carrinho, escolher a parcela), e
persistir enquanto a intenção viver. Retry reenvia a mesma chave.
**Aceite** Retry de rede em pagamento não gera segunda cobrança, com o app em modo avião simulado.

### T-F2-08 · AJUSTE — Suíte SQL rodando no CI
**Tipo** teste **Tamanho** P **Bloqueia** a definição de pronto de todas as fatias
**Spec** critério de aceite de F1 e F2
**Gap** *Atualizado em 2026-09-14.* A suíte existe — `platform/supabase/tests/00_setup.sql` a
`03_sweep_order_status.sql`, em pgTAP — e o job `supabase` de `.github/workflows/mobile-ci.yml` já roda
`supabase start` e `supabase test db`. As três varreduras teriam reprovado na primeira execução e foram corrigidas
em 14/09 contra o banco vivo:
- `01_sweep_rls.sql` listava 27 tabelas "sem RLS" que têm RLS (ver T-F1-01). Allowlist esvaziada.
- `02_sweep_money.sql` não listava `gateway_transactions.amount`, e o placar dizia `<= 41` com 45 entradas de
  dinheiro. Corrigido para 46.
- `03_sweep_order_status.sql` usava `\b`, que no regex do Postgres é *backspace*: a varredura não casava nenhuma
  função. Trocado por `\y`; no banco vivo casa exatamente as 6 funções da allowlist.
Também em 14/09: `recovery-fix` entrou nos gatilhos de push e pull_request do `mobile-ci.yml`, e `test:client` voltou
(T-X-17). Pendências: a suíte e o workflow precisam ser versionados e enviados (T-X-19); o job `client` reprova no
`npm ci` até o `package-lock.json` ser regenerado (T-X-17), sem afetar o job `supabase`; e sem Docker na máquina de
desenvolvimento a suíte só roda no CI.
**Fazer** Versionar e enviar (T-X-19); regenerar o lock (T-X-17).
**Aceite** `supabase db reset` + suíte roda verde no CI em PR.

---

## F3 — Configuração e capability flags

### T-F3-01 · AJUSTE — `establishment_config` como fonte única
**Tipo** banco **Tamanho** G
**Spec** §7.1 (tabela inteira de parâmetros)
**Gap** Não existe configuração 1:1. Ela está espalhada por **seis** lugares: `restaurant_configs`
(`20260430180000_...:1210-1225`, com `service_types`, `experience_flags`, `enabled_features` **todos
como `text`**), `restaurant_service_configs` (`:1130-1155+`, ~26 flags), `restaurants.service_config`
(jsonb), `loyalty_configs`, `kds_brain_configs` e `gateway_configs`.
**Fazer** Uma tabela 1:1 com o estabelecimento, colunas tipadas, cobrindo os 17 parâmetros de §7.1;
migração dos seis lugares; leitura por uma única função.
**Aceite** Todo parâmetro de §7.1 tem exatamente uma origem, e ela é tipada.

### T-F3-02 · AJUSTE — Percentuais em basis points
**Tipo** banco **Tamanho** P **Depende de** T-F2-01
**Spec** §7.2 **Invariante** 1
**Gap** `loyalty_configs.cashback_percentage`, `points_per_real`, `points_redemption_rate`
(`20260430180000_...:837,839,840`) e `happy_hour_schedules.discount_value` (`:1013`) — todos `numeric`.
**Aceite** Nenhum percentual de regra em ponto flutuante.

### T-F3-03 · AJUSTE — Capabilities derivadas do banco, não hardcoded
**Tipo** app/servidor **Tamanho** M **Depende de** T-F3-01
**Spec** §1.3, §6 ("a arquitetura deve tratar o modelo de serviço como um conjunto de flags e políticas, não como três produtos distintos")
**Gap** As features são hardcoded por modelo em TypeScript (`SERVICE_TYPE_CONFIGS`,
`shared/config/service-types.ts:76+`). `getServiceTypeFeatures(...)` e
`apps/client/src/hooks/useServiceTypeFeatures.ts:171-207` já têm a forma certa — mas a fonte é código,
não configuração. Trocar `service_models` só muda módulos hoje pela via de `featureOverrides`.
**Aceite** Mudar a configuração no banco muda os módulos ativos sem deploy.

### T-F3-04 · AJUSTE — Eliminar as 67 ramificações por `service_model` no app
**Tipo** app **Tamanho** G **Depende de** T-F3-03
**Spec** §6 · regra estrutural de `CLAUDE.md`
**Gap** **67 ocorrências em 18 arquivos** fora de `service-types.ts` (reverificado em 2026-09-08).
O pivô é `apps/client/src/hooks/useServiceTypeFeatures.ts:92,94,96,105,106,108,116,120,124` — nove
comparações num `switch` que decide fluxo de pedido, momento do pagamento, seleção de mesa e estilo
de cardápio. É exatamente o que `CLAUDE.md` proíbe. Também:
`production/CartScreen.tsx:27,28,29,33` · `MenuScreen.tsx:29,30,31` ·
`RestaurantScreen.tsx:125,126,331` · `HomeScreen.tsx:53,54,55,163,164,165,344,345` ·
`OrderDetailScreen.tsx:98` · `ReservationRestaurantScreen.tsx:17` · `casual-dining-ui.ts:105,117,123` ·
`home-restaurant-ui.ts:14,15,16` · `services/customer-backend.ts:766` ·
`apps/restaurant/.../ServiceConfigScreen.tsx:27,34,39,64,65,66,77` · `config/configTypes.ts:73,81,138` ·
`config/ConfigExperienceScreen.tsx:40` · `auth/CreateRestaurantScreen.tsx:33,34,35`.
**Fazer** Trocar cada ramificação por leitura de capability. Telas de **configuração** do restaurante
(`ServiceConfigScreen`, `CreateRestaurantScreen`) são a exceção legítima: ali o modelo é o dado
sendo editado, não uma condição de fluxo — documentar a exceção na regra de lint.
**Aceite** Regra de lint que rejeita `fine_dining|casual_dining|quick_service` fora de `service-types.ts` e da allowlist de telas de configuração.

### T-F3-05 · AJUSTE — Eliminar as ramificações por modelo dentro das RPCs
**Tipo** servidor **Tamanho** M
**Spec** §6
**Gap** 14 ocorrências em execução: `20260803170000_...:405` (reserva só para `casual_dining`, corrigido
parcialmente em `20260814090000_...:7`), `20260814110000_...:239`, `20260814090000_...:132`,
`20260815103000_...:393`, `20260815200000_...:420,682,729,736`, `20260815220000_...:159`,
`20260815220807_...:28,80,87`, `20260815224634_...:43`.
**Aceite** Nenhuma RPC decide comportamento comparando `service_type`; todas leem capability.

### T-F3-06 · NOVO — Múltiplos modelos por unidade
**Tipo** banco/app **Tamanho** M
**Spec** §1.3 ("o modelo de serviço … pode coexistir — ex.: um restaurante casual com balcão express"), §7.1 `service_models[]`, ADR-003
**Gap** `restaurants.service_type` é **escalar**; `customer-backend.ts:766` filtra com
`.in('service_type', [...])`, um valor por restaurante. Contradiz ADR-003 diretamente.
**Aceite** Uma unidade com `['casual_dining','quick_service']` ativos oferece as duas jornadas, e o QR de mesa versus balcão express decide qual (ver T-X-04).

### T-F3-07 · NOVO — Validação de coerência da configuração
**Tipo** banco **Tamanho** P **Depende de** T-F3-01
**Spec** §7.1
**Gap** Sem implementação. Nada impede `reservation_enabled=false` **e** `queue_enabled=false` no mesmo
Fine Dining (jornada sem porta de entrada), nem `quick_service` com `prepaid_required=false`
(contradiz a invariante 6).
**Aceite** Configuração incoerente é rejeitada por constraint com mensagem que nomeia o conflito.

### T-F3-08 · AJUSTE — Remover os literais de regra de negócio
**Tipo** app/servidor **Tamanho** M **Depende de** T-F3-01
**Spec** §1.2 ("todos devem ser configuráveis por estabelecimento, nunca fixos em código") · convenção de valores de `CLAUDE.md`
**Gap** A taxa de 10% e o desconto de 20% aparecem **cada um em dois lugares independentes** — app e SQL —
exatamente os dois pontos que a spec previu que divergiriam:

| Arquivo:linha | Literal |
|---|---|
| `apps/client/src/screens/production/CartScreen.tsx:17` | `const SERVICE_FEE_PCT = 10;` |
| `apps/client/src/screens/production/ComboBuilderScreen.tsx:14` | `const DISCOUNT_PERCENT = 20;` |
| `apps/client/src/screens/production/SplitBillScreen.tsx:56` | `serviceFeePercent ?? 10` |
| `apps/client/src/screens/production/TipPaymentScreen.tsx:35,38` | `?? 10` e gorjeta padrão `useState(10)` |
| `apps/client/src/screens/production/FecharContaScreen.tsx:43` | `serviceFeePercent ?? 10` |
| `20260815200000_casual_dining_experience.sql:512` | `(service_config->>'service_fee_percent')::numeric, 10` |
| `20260815224634_quick_service_custom_combo.sql:31` | `v_discount_pct constant numeric := 20` |
| `20260816010000_casual_dining_payment_and_receipt.sql:230` | `least(15.00, v_subtotal)` — cortesia |
| `20260814110000_table_session_group_ordering.sql:65` | `now() + interval '6 hours'` — TTL de convite |
| `20260803170000_client_production_backend.sql:403` | `party_size > 20`, `now() + interval '30 minutes'` |

**Aceite** Nenhum literal numérico de regra de negócio no código-fonte; o valor sai da configuração e o app não tem default próprio.

### T-F3-09 · NOVO — Completar o contrato de capabilities com o que o §6 diferencia
**Tipo** app/servidor **Tamanho** M **Depende de** T-F3-01
**Spec** §6 (tabela comparativa), §6.1 (UC-02, UC-07), ADR-010
**Gap** `docs/arquitetura/03-config-service-model.md` lista capabilities derivadas do §7.1. O §6 diferencia os
modelos em pontos que o §7.1 não parametriza — e, sem capability, o código acaba comparando `service_type`:

| Diferença no §6 | Fine | Casual | Quick |
|---|---|---|---|
| Acompanhamento | por item, com responsável | status do pedido da mesa | 4 etapas com conferência |
| Consumo na espera (UC-07) | opcional (bar/lounge) | padrão | não se aplica |
| Convite por link (UC-02) | desde a reserva | a partir do check-in | não se aplica |
| Tipos de chamado | garçom, sommelier, ajuda | apoio de sala e família | nenhum |
| Gorjeta | configurável, ao garçom | sugerida, à equipe | opcional |
| Dimensões da avaliação | — | comida, serviço, ambiente | velocidade, sabor, atendimento |

**Aceite** Cada linha acima é uma capability ou parâmetro lido da configuração; nenhuma é decidida por `service_type`.
