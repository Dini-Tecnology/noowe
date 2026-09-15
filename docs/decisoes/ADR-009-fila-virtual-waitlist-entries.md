# ADR-009 — Fila virtual do restaurante: `waitlist_entries`

**Status:** ACEITO (2026-09-14) — registra a escolha já aplicada em `20260908120000_freeze_deferred_domains.sql`
**Origem:** tarefas T-X-03 e T-E2-01; reconciliação §2.10 (duas implementações da fila)
**Impacta:** Fatia E2 (fila virtual), Fatia G1 (origem da sessão), Fatia C1 (modo família)

## Questão

O banco tem duas tabelas de fila: `waitlist_entries` e `queue_entries`. As fatias E2 e G1 precisam de
uma fila só para ordenar grupos, chamar a próxima mesa e registrar a origem da sessão (ADR-008).

## Decisão

**`waitlist_entries` é a única fila virtual dos modelos de sala (Fine e Casual).** `queue_entries`
pertence ao domínio de balada e fica congelada junto com os demais domínios adiados.

| | `waitlist_entries` | `queue_entries` |
|---|---|---|
| Criada em | `20260427101000_create_core_bootstrap_tables.sql` | `20260430180000_generated_rest_platform_tables.sql` |
| Funções que usam (banco vivo, 14/09/2026) | `customer_join_waitlist`, `customer_update_waitlist`, `customer_set_waitlist_has_kids`, `customer_waitlist_stats`, `restaurant_get_waitlist`, `private.restaurant_live_status` | nenhuma |
| Gatilho | `trg_customer_waitlist_notification` | nenhum |
| Telas de produção | `WaitlistScreen` no cliente e no restaurante | nenhuma no navegador montado |
| Campos | tamanho do grupo, preferência, crianças, `called_at`, `no_show_at` | `priority_level_id` (níveis VIP de balada) |

## Por quê

Tudo que o produto usa hoje passa por `waitlist_entries`, e ela já carrega os campos que o §4.4 pede
(preferências, crianças, chamada e no-show). `queue_entries` modela prioridade por nível VIP, que não
existe nos três modelos da spec, e nenhuma função, tela ou chamada do app de lançamento lê dela.

## Consequências

- A coluna de origem da sessão prevista no ADR-008 e em T-G1-01 chama-se `waitlist_entry_id` no banco
  (vocabulário do banco, ver `docs/arquitetura/05-glossario-spec-banco.md`) e referencia
  `waitlist_entries(id)`.
- T-E2-02 substitui `waitlist_entries.waitlist_bar_orders` (jsonb) por pedidos reais vinculados à
  entrada da fila.
- Se o domínio de balada voltar, ele decide se reaproveita o motor de `waitlist_entries` ou descongela
  `queue_entries`. Até lá, nada novo é escrito em `queue_entries`.
