# T5 — Decisões e transversais

**Spec:** §7.3 (resiliência), §7.5 (acessibilidade e idioma), §8.1 (decisões em aberto)
**Base:** `docs/RECONCILIACAO-RESULTADO.md` §2 (código sem fatia correspondente) e §2.10 (duplicações)

> Nada aqui pertence a uma das 18 fatias. **Os três primeiros itens bloqueiam a Fase 1** — são
> escolhas humanas que mudam o schema, e implementar por cima de qualquer uma delas sem decidir
> significa refazer depois.

---

## Decisões que bloqueiam

### T-X-01 · DECIDIDO — Vocabulário: manter `restaurants` e traduzir na borda
**Tamanho** — (decisão) · consequência **P**
**Decisão** 2026-09-14, opção (b): o banco mantém `restaurants`, `restaurant_configs`, `table_session_participants`
e `user_roles`; a spec, as fatias e os ADRs continuam com os nomes do documento. A tradução oficial está em
`docs/arquitetura/05-glossario-spec-banco.md`. Nomes que ainda não existem nos dois lados (`bill_shares`,
`capacity_requests`) nascem com o nome da spec.
**Consequência** Nenhuma renomeação. Toda tarefa que cita um nome da spec usa a coluna "No banco" do glossário.

### T-X-02 · DECIDIDO EM PARTE — Os ADRs `PROVISÓRIO`
**Tamanho** — (decisão)
**Decisão** 2026-09-14. ADR-006 e ADR-010 escolhidos pelo responsável do produto; ADR-001, 002, 003, 005, 007 e 008
aceitos com o default, por delegação à recomendação técnica; ADR-009 registra a escolha da migration de
congelamento. **ADR-004 continua `PROVISÓRIO`** e precisa de revisão humana.
**Decidir antes de** T-G3-08 (ADR-004: reabertura de conta parcialmente paga).

### T-X-03 · DECIDIDO EM PARTE — Pares de implementações para o mesmo conceito
**Tamanho** — (decisão) · consequência **G**
**Estado em 2026-09-14**

| Conceito | Fica | Sai | Onde foi decidido |
|---|---|---|---|
| Fila de espera | `waitlist_entries` | `queue_entries` (congelada) | ADR-009 e migration de congelamento |
| Chamado de garçom | `service_calls` | `waiter_calls` (congelada) | migration de congelamento |
| Comanda em grupo | `table_sessions` + `table_session_participants` | `tabs` + `tab_members` + `tab_items` (congeladas) | migration de congelamento |
| Parcelas de conta | `bill_shares` (nova, T-G3-02) | `payment_splits` (congelada) | migration de congelamento |
| Convergência para `ready` | trigger em `order_items` (T-N2-01) | as duas cópias em RPC | T-N2-02 |
| Config do estabelecimento | tabela única de T-F3-01 | `restaurant_configs`, `restaurant_service_configs`, `restaurants.service_config` | pendente em T-F3-01 |
| Fidelidade | registro único de T-P1-01 | `loyalty_programs` e `stamp_cards` separados | pendente em T-P1-01 |
| Documento de auditoria | um arquivo | `AUDITORIA-TECNICA-COMPLETA.md` × `AUDITORIA_TECNICA_COMPLETA.md` | pendente em T-X-18 |

As saídas marcadas "congelada" valem em produção desde 2026-09-14, quando `20260908120000_freeze_deferred_domains.sql` foi aplicada (44 tabelas, nenhuma política nem grant de cliente restante).
**Decidir antes de** T-F3-01 e T-P1-01.

### T-X-04 · DECISÃO — Coexistência de modelos na mesma unidade
**Tamanho** — (decisão) **Relacionado** T-F3-06, T-G1-03
**Spec** §8.1 ("definir como o cliente escolhe o formato ao entrar — QR de mesa versus balcão express")
**Aceite da decisão** Registrada como ADR, com a regra de escolha da porta de entrada explícita.

---

## Domínios implementados sem fatia correspondente

> A reconciliação encontrou **domínios inteiros e funcionais que nenhuma das 18 fatias menciona**.
> Não são detalhes: são produtos. Cada item abaixo precisa de uma decisão de escopo — entra na spec,
> vira produto à parte, ou é removido — **antes** de receber o custo de T-F2-01 (dinheiro em centavos)
> e T-F1-01 (RLS).

### T-X-05 · DECISÃO — Balada / clube noturno
**Gap** `club_entries`, `club_check_in_outs`, `club_birthday_entries`, `guest_list_entries`, `lineups`,
`lineup_slots`, `promoters`, `promoter_sales`, `promoter_payments`, `vip_table_reservations`,
`vip_table_guests`, `vip_table_tabs`, `vip_table_tab_items`, `queue_entries` — **todos sem RLS**, com
regra de comissão de promoter (`20260430180000_...:250-256`) e crédito de consumação
(`:151-152,182-184,332,348-349,381-385`). Sete telas em `apps/client/src/screens/club/`.
Aritmética de valor no cliente: `club/TicketPurchaseScreen.tsx:249`.
Docs: `docs/epics/EPIC_13_CLUB_BALADA_FRONTEND.md`, `docs/SERVICE_TYPES_ENTERTAINMENT.md`.

### T-X-06 · DECISÃO — Pub / bar com comanda de rodada
**Gap** `tabs`, `tab_items`, `tab_members`, `tab_payments` (`20260430180000_...:1386+`, sem RLS) são um
**segundo motor de comanda em grupo**, paralelo a `table_sessions`. Telas em
`apps/client/src/screens/pub-bar/`, hook `useTab.ts`. Aritmética no cliente:
`RoundBuilderSheet.tsx:289`, `TabPaymentScreen.tsx:215`. Doc: `EPIC_14_PUB_BAR_COMANDA.md`.
**Nota** Este é o par mais caro de T-X-03: dois motores de comanda em grupo divergindo é exatamente o
que a regra estrutural de `CLAUDE.md` existe para impedir.

### T-X-07 · DECISÃO — Estoque, fichas técnicas e compras
**Gap** `ingredients`, `recipes`, `recipe_ingredients`, `drink_recipes`, `stock_items`, `stock_movements`,
`inventory_counts`, `purchase_records`, `suppliers` e mais — **todos sem RLS**. `recipes.calculated_cost`
(`:433`) é regra de custo, **explicitamente fora de escopo de N1** ("Fase 4") e já implementada.

### T-X-08 · DECISÃO — RH, escala e caixa
**Gap** `shifts`, `attendances`, `leave_requests` (sem RLS), `cash_register_sessions`,
`cash_register_movements`. Regra de folha em `shifts.total_pay` (`:617`).

### T-X-09 · DECISÃO — Carteira digital e P2P
**Gap** `wallets`, `wallet_transactions` com `max_balance`, `daily_limit`, `monthly_limit`
(`:995-998`) — regras financeiras que N4 não cita: a fatia menciona a carteira apenas como método
de pagamento. **Transferência P2P entre usuários** (`20260814233000_...:331-430`) é funcionalidade
inteira sem fatia, e tem implicação regulatória.

### T-X-10 · DECISÃO — Integrações de delivery e marketplace
**Gap** `platform_connections`, `external_menu_mappings`, `delivery_settlements`,
`restaurant_integrations`, `webhook_subscriptions`, `webhook_deliveries` — sem RLS.
`orders.source`/`source_order_id` (`20260430180100_...:50-51`), `orders.delivery_rider_eta` (`:52`).
Explicitamente fora de escopo de P2, já implementado.

### T-X-11 · DECISÃO — LGPD, segurança e antifraude
**Gap** `user_consents`, `user_sanctions`, `security_incidents`, `fraud_alerts`, `token_blacklist`,
`biometric_tokens`, `otp_tokens`, `password_reset_tokens`, `user_credentials` — **todos sem RLS**, o
que é notável dado o conteúdo. Prioridade de T-F1-01 independentemente da decisão de escopo.

### T-X-12 · DECISÃO — Buffet por peso, drive-thru e outros modelos
**Gap** `restaurant_service_configs` carrega `price_per_kg`, `smart_scales_enabled`, `drive_thru_lanes`,
`geofencing_enabled`, `license_plate_recognition` (`:1148-1156`); há telas em
`apps/client/src/screens/buffet/`. A spec v2 cobre **três** modelos; `docs/SERVICE_TYPES.md` descreve mais.

### T-X-13 · DECISÃO — KDS Brain / IA de preparo
**Gap** `kds_brain_configs`, `prep_analytics`, `prep_time_suggestions`, `fire_schedules` (sem RLS).
N3 coloca "KDS Analytics e SLA por etapa" fora de escopo (Fase 4) — o schema já existe.

---

## Transversais da spec

### T-X-14 · AJUSTE — Cardápio traduzido de forma estratégica
**Tipo** app **Tamanho** M
**Spec** §7.5 ("todas as jornadas do cliente disponíveis em português, inglês e espanhol, com cardápio traduzido de forma estratégica, não literal")
**Gap** A infraestrutura de i18n existe e é sólida (`shared/i18n/` com pt-BR, en-US, es-ES e
suplementos; `dataTranslations.ts` traduz enums e status). O que **não** existe é tradução de
**conteúdo do cardápio** — nome e descrição de item são texto único em `menu_items`.
**Aceite** Item de cardápio tem tradução por idioma, editável pelo restaurante, e o app exibe a do idioma ativo.

### T-X-15 · NOVO — Acessibilidade nas telas de pedido e pagamento
**Tipo** app/teste **Tamanho** M
**Spec** §7.5 ("contraste, alvos de toque adequados e leitura por leitor de tela nas telas de pedido e pagamento")
**Gap** Existem props de acessibilidade em 49 arquivos de tela do cliente — a base está lá —, mas não
há verificação de contraste, de alvo de toque mínimo, nem teste de leitor de tela.
**Aceite** Teste automatizado de contraste e alvo de toque nas telas de pedido e pagamento; navegação por leitor de tela verificada manualmente e registrada.

### T-X-16 · NOVO — Modo degradado do painel
**Tipo** app **Tamanho** M **Ver** T-N3-01, T-N3-02
**Spec** §7.3 ("o app do cliente mantém a comanda localmente e o painel permite lançamento manual quando a conexão cai")
**Gap** Nenhum dos dois lados existe.

### T-X-17 · DECISÃO + AJUSTE — Testes do app do cliente
**Tipo** teste **Tamanho** M
**Gap** *Atualizado em 2026-09-14.* No working tree foram removidos `apps/client/jest.config.js`, os 22 arquivos de
`apps/client/src/__tests__/`, o script `test` do cliente, o script `test:client` da raiz e as devDependencies
`jest-expo`, `@testing-library/react-native` e `@types/jest`. Três fatos mudam o peso disso:
- O `jest.config.js` removido só executava `production.*.test.ts?(x)`: **só 1 dos 22 arquivos rodava**,
  `production.backend.test.ts`. Os outros 21 já estavam fora de qualquer execução.
- Esse teste ainda bate com o código atual (`customer_place_order` com `p_client_request_id`,
  `customer_open_table_session` com `p_qr_data`) e cobre a invariante 2: o app não envia preço.
- `.github/workflows/mobile-ci.yml` ainda chama `npm run test:client`, então o job `client` reprova.
**Feito** 2026-09-14, com OK do responsável: restaurados `production.backend.test.ts`, o `jest.config.js` do cliente,
o script `test` do cliente e `test:client` na raiz; os outros 21 ficam fora. Dois ajustes: a expectativa do teste ganhou
`diner_id: null`, que `placeOrder` passou a enviar; e `transformIgnorePatterns` passou a cobrir também o layout do
pnpm da máquina de desenvolvimento. Resultado local: **3 de 3 testes passando**.
**Pendente** As três devDependencies **não** voltaram ao `package.json` do cliente: acrescentá-las sem regenerar o
`package-lock.json` quebraria o `npm ci`, e elas já resolvem pela raiz e pelo app do restaurante. O `package-lock.json`
já está fora de sincronia por outro motivo (`expo-print` falta no lock), então o job `client` do CI reprova no
`npm ci` até o lock ser regenerado. Nessa hora, declarar `jest-expo` no cliente. O repositório também está migrando
para pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`) enquanto o CI instala com npm; decidir um dos dois.
**Aceite** O job `client` do `mobile-ci.yml` roda verde, com ao menos o teste de contrato do backend.

### T-X-18 · AJUSTE — Consolidar a documentação duplicada
**Tipo** docs **Tamanho** P
**Gap** `docs/AUDITORIA-TECNICA-COMPLETA.md` e `docs/AUDITORIA_TECNICA_COMPLETA.md` são dois arquivos
que diferem só pelo separador. Há também várias auditorias sobrepostas
(`AUDIT_REPORT.md`, `BIDIRECTIONAL-AUDIT-FINAL.md`, `DEEP-INTEGRATION-AUDIT-FINAL.md`,
`INTEGRATION-AUDIT-REPORT.md`, `PRODUCTION-READINESS-AUDIT-FINAL.md`).
**Aceite** Um documento por assunto; os demais removidos ou marcados como histórico com data.

### T-X-19 · NOVO — Versionar o que já está em produção
**Tipo** repositório **Tamanho** P · ação de quem faz os commits
**Gap** Em 2026-09-14, 23 migrations aplicadas em produção (`20260814090000` a `20260816020000`) estavam fora do git,
junto com `CLAUDE.md`, `docs/spec`, `docs/fatias`, `docs/tarefas`, `docs/decisoes`, `docs/arquitetura`, a suíte
`platform/supabase/tests/` e cerca de 45 telas e hooks do app, no branch `recovery-fix`. Estão versionados por engano
caches do Supabase CLI (`platform/supabase/.temp/`, `supabase/.temp/`) e do Expo (`.expo/`). A varredura por chaves
JWT, `sk_live`/`sk_test` e chaves privadas não encontrou segredo nos arquivos fora do git.
**Fazer** Commits por assunto (migrations; docs de spec e decisões; suíte SQL; app). `.temp/` já está no `.gitignore`;
falta `git rm --cached` nos caches versionados.
**Aceite** `git status` limpo depois dos commits, e nenhuma migration aplicada em produção fora do git.

### T-X-20 · FEITO — Repositório reproduz o banco de produção
**Tipo** banco **Tamanho** M
**Gap** Comparação do catálogo vivo com as migrations em 2026-09-14:
- **RLS não é drift.** Os laços dinâmicos das migrations ligam RLS em todas as tabelas (ver T-F1-01).
- **79 das 81 migrations aplicadas são idênticas ao arquivo local.** Duas foram editadas depois de aplicadas, e três
  mudanças não chegaram a produção: a ordem dos locks e o arredondamento em `customer_transfer_wallet` e a
  publicação Realtime de `wallets` e `payment_methods` (`20260814233000`); e a volta da reserva para `confirmed` e da
  mesa para `reserved` em `customer_leave_table_session` (`20260815211000`). A edição de
  `customer_open_table_session` no mesmo arquivo não gera diferença, porque `20260816020000` redefine a função.
- **Objetos criados direto no banco:** `Projeto_Ativo` (automação do plano free), `orders.order_number` com índice
  único, `private.assign_order_number` com o gatilho `orders_assign_order_number`, `restaurant_get_customer_crm` e
  três índices (`idx_customer_profiles_restaurant_segment`, `idx_customer_profiles_restaurant_spent`,
  `idx_reservations_metadata_gin`).
**Feito** `20260914120000_capture_live_manual_objects.sql` captura os objetos manuais;
`20260914121000_catch_up_edited_migrations.sql` leva as três mudanças a produção. Aplicadas em 2026-09-14 por
`supabase db push`, com OK do responsável, junto com o congelamento, e verificadas no banco vivo: histórico com 84
migrations; `customer_leave_table_session` e `customer_transfer_wallet` com o código do repositório; `wallets` e
`payment_methods` na publicação Realtime; gatilho `orders_assign_order_number` presente.
**Aceite** Com as duas migrations aplicadas, o catálogo de produção e o de `supabase db reset` coincidem em tabelas,
colunas, funções, gatilhos e índices.

### T-X-21 · FEITO — ADR-009: fila virtual
**Tipo** decisão **Tamanho** P
**Feito** 2026-09-14: `docs/decisoes/ADR-009-fila-virtual-waitlist-entries.md`, citado pela migration de congelamento e
até então inexistente.

### T-X-22 · FEITO — ADR-010: regras de fechamento por unidade
**Tipo** decisão **Tamanho** P
**Feito** 2026-09-14: `docs/decisoes/ADR-010-regras-de-fechamento-por-unidade.md`. As duas diferenças reais entre §3.4
e §4.4 viram parâmetros (`split_fixed_remainder`, `tip_allocation`). A fatia D1 e T-D1-02 foram corrigidas quanto ao
roteamento do sommelier.

### T-X-23 · DECIDIDO — Telas órfãs do navegador legado
**Tipo** app **Tamanho** P
**Gap** `apps/client/src/navigation/index.tsx` não é montado. Entre as telas registradas só nele estão duas que a spec
nomeia — `StampCardsScreen` (stamp-card, §5.2) e `WaitlistBarScreen` (waitlist-bar, §4.2) — e outras que as telas
de produção já substituíram (`UnifiedPayment`, `SplitPayment`, `Checkout`, `SharedOrder`, `PartialOrder`,
`GroupBooking`, `GuestInvitation`, `OrderTracking`).
**Decisão** 2026-09-14: **não montar nenhuma.** As verificadas (`StampCards`, `WaitlistBar`, `UnifiedPayment`,
`SplitPayment`, `Checkout`, `SharedOrder`, `PartialOrder`) usam o gateway REST/WebSocket legado (`ApiService`,
`useWebSocket`), que o app de produção não usa mais; montá-las traria de volta um segundo backend. `stamp-card` é
reescrita sobre Supabase em P1 (T-P1-05) e `waitlist-bar` em E2 (T-E2-02). As demais saem numa limpeza própria, junto
com `navigation/index.tsx`.
**Aceite** Nenhuma tela do navegador legado montada; as duas telas da spec existem em `screens/production/` sobre Supabase.

> **Não virou tarefa:** os sete diagramas do `.docx` estão versionados em
> `docs/spec/diagramas/` (sete PNGs) e reescritos em Mermaid em `docs/spec/fluxos.md`
> (sete seções, §1.4 como tabela e as outras seis como fluxogramas). Nada da spec ficou só no `.docx`.
