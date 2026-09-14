# T4 — Fidelidade e gestão (P1, P2)

**Fatias:** [P1](../fatias/P1-fidelidade.md) · [P2](../fatias/P2-avaliacao-crm-relatorios.md)
**Spec:** §3.4, §4.4, §5.4 (fidelidade nos três modelos), §6, §8 Fase 4

---

## P1 — Fidelidade

> **DIVERGENTE.** A fidelidade funciona, mas credita a base errada, no momento errado, para a
> pessoa errada numa conta dividida.

### T-P1-01 · NOVO — `loyalty_accounts` e `loyalty_transactions`
**Tipo** banco **Tamanho** G **Depende de** T-F2-01
**Spec** §2.2 (`LoyaltyAccount`: "pontos, níveis e cartão de selos coexistem no mesmo registro")
**Gap** Os três mecanismos **não convivem**: pontos e `tier` em `loyalty_programs`
(`20260430180000_...:846-861`), selos em `stamp_cards` (`:863-876`), e nenhum vínculo entre eles.
Não existe extrato de movimentação.
**Aceite** Um registro por cliente com pontos, nível e selos, e todo crédito/débito rastreável em transação.

### T-P1-02 · AJUSTE — Crédito sobre a base sem taxa nem gorjeta
**Tipo** servidor **Tamanho** M **Depende de** T-G3-02
**Spec** ADR-005 · §3.4 ("os pontos são creditados proporcionalmente ao valor consumido")
**Gap** **O crédito inclui taxa de serviço e gorjeta:**
`20260816010000_...:235-236` → `v_charged := v_total + v_tip` (com `v_total` já somando a taxa) e
`:261` → `loyalty_award_points(..., v_charged)`;
`20260624211000_payment_rpc.sql:96-103` → `loyalty_award_points(..., p_amount)`, valor bruto vindo do cliente;
`20260803170000_...:439` → `loyalty_award_points(..., coalesce(new.total_amount, 0))`.
**Aceite** Pontos calculados sobre o consumo, sem taxa de serviço nem gorjeta.

### T-P1-03 · AJUSTE — Crédito por parcela paga, não por pedido
**Tipo** servidor **Tamanho** M **Depende de** T-G3-02
**Spec** §3.6, ADR-005
**Gap** O crédito é por pedido. **Numa conta dividida, quem paga o checkout leva todos os pontos** —
não existe `bill_share_id` porque não existem parcelas.
**Aceite** Cada participante recebe pontos pela parcela que pagou.

### T-P1-04 · AJUSTE — Deduplicação por índice único
**Tipo** banco **Tamanho** P
**Spec** §5.6 ("o selo é creditado uma única vez por pedido concluído") **Invariante** 10
**Gap** `loyalty_programs.awarded_order_ids` é uma **string CSV** (`20260430180000_...:857`), lida com
`string_to_array(...)` (`20260816010000_...:265`). O próprio código comenta o problema (`:257-260`).
Não é índice único — sob concorrência, credita duas vezes.
**Aceite** Índice único garante crédito único por pedido; a CSV é migrada e removida.

### T-P1-05 · NOVO — Selo do Quick Service creditado na retirada
**Tipo** servidor **Tamanho** P **Depende de** T-Q1-01, ADR-005
**Spec** §5.4 ("uma visita gera um selo"), §5.6 ("por pedido concluído")
**Gap** Hoje o selo sairia no pagamento — e a retirada nem existe (T-Q1-01).
**Aceite** O selo é creditado na baixa da retirada, não no pagamento.

### T-P1-06 · NOVO — Estorno remove pontos
**Tipo** servidor **Tamanho** P **Depende de** T-N4-04, T-P1-01
**Spec** §7.4
**Aceite** Estorno gera transação negativa de fidelidade e o saldo volta ao anterior.

### T-P1-07 · NOVO — `loyalty_mode` como configuração
**Tipo** banco **Tamanho** P **Depende de** T-F3-01
**Spec** §7.1 (`loyalty_mode`: points, tiers, stamps ou combinação), §6 (pontos+níveis em Fine, pontos+CRM em Casual, selos em Quick)
**Gap** Não existe.
**Aceite** O mecanismo ativo vem da configuração, e mudá-lo não exige deploy.

### T-P1-08 · AJUSTE — RLS em `stamp_cards` e `loyalty_configs`
**Tipo** banco **Tamanho** P **Ver** T-F1-01 **Invariante** 9
**Gap** `loyalty_programs` **tem** RLS (`20260803170000_...:93`); `stamp_cards` e `loyalty_configs` não.
**Aceite** As três tabelas de fidelidade têm RLS por estabelecimento e por cliente.

---

## P2 — Avaliação, CRM e relatórios

### T-P2-01 · NOVO — Avaliação separada por dimensão e citação nominal
**Tipo** banco/app **Tamanho** M
**Spec** §4.4 ("separada por comida, serviço e ambiente, e pode citar o nome do atendente"), §5.2 etapa 10 ("velocidade, sabor e atendimento" em Quick Service)
**Gap** `reviews` tem rating agregado; as dimensões não são modeladas. As dimensões **diferem por
modelo** — comida/serviço/ambiente em Casual, velocidade/sabor/atendimento em Quick — então o
conjunto vem da capability, não do código.
**Aceite** A avaliação grava as dimensões do modelo ativo e pode citar o atendente.

### T-P2-02 · NOVO — Moderação do gerente antes de publicar
**Tipo** servidor/app **Tamanho** M
**Spec** §4.2 etapa 10 ("a avaliação vai para a moderação do gerente")
**Gap** `review_reports` existe, sem fluxo de moderação.
**Aceite** Avaliação só fica pública depois da moderação, e a decisão fica registrada.

### T-P2-03 · NOVO — Avaliação alimenta gorjetas e desempenho
**Tipo** servidor **Tamanho** M **Depende de** T-P2-01
**Spec** §4.3 ("analisa giro de mesas, gorjetas e avaliações recebidas"), §4.4 ("a avaliação alimenta o CRM")
**Aceite** O relatório do turno cruza avaliação nominal com gorjeta por atendente.

### T-P2-04 · NOVO — Tela de auditoria
**Tipo** app **Tamanho** M **Depende de** T-F2-04
**Spec** §7.2 **Invariante** 8
**Gap** Não existe — e não teria conteúdo, porque `audit_logs` recebe zero inserts hoje.
**Aceite** O gerente consulta as seis ações sensíveis por autor, motivo, horário e entidade.

### T-P2-05 · NOVO — Relatórios segmentados por capability
**Tipo** app/servidor **Tamanho** M **Depende de** T-F3-03
**Spec** §8 Fase 4 (indicadores distintos por modelo: giro de mesas em Casual, throughput e SLA por etapa em Quick, custo e margem em Fine)
**Gap** Os relatórios não são segmentados por modelo.
**Aceite** Uma unidade com dois modelos ativos vê os indicadores dos dois, sem ramificar por `service_model` no código.

### T-P2-06 · NOVO — CRM com preferências, ocasiões e histórico
**Tipo** servidor **Tamanho** M
**Spec** §4.4 ("preferências, ocasiões — aniversário — e histórico de visitas ficam disponíveis para o próximo atendimento")
**Gap** `customer_profiles` existe **sem RLS** (ver T-F1-01); a ocasião não é gravada (T-E1-01).
**Aceite** No próximo atendimento, o garçom vê preferências, ocasiões e histórico do cliente.

### T-P2-07 · NOVO — Ticket de suporte vinculado ao pedido ou à visita
**Tipo** servidor/app **Tamanho** M
**Spec** §3.2 etapa 14, §4.2 etapa 13, §5.2 etapa 14 ("abre ticket vinculado ao pedido ou à visita")
**Gap** As telas de suporte existem; o vínculo com pedido/visita não é modelado.
**Aceite** Ticket aberto pelo cliente carrega o pedido ou a sessão de origem.

### T-P2-08 · NOVO — Indicador de desperdício
**Tipo** servidor/app **Tamanho** P
**Spec** §5.3 ("analisa throughput, ticket médio, desperdício e cancelamentos"), §8 Fase 4
**Gap** Sem tarefa. Estoque e fichas técnicas estão congelados, então o indicador nasce de pedidos não retirados e
itens descartados, não de baixa de estoque.
**Aceite** O relatório do turno de Quick Service mostra desperdício por item descartado e por pedido não retirado.
