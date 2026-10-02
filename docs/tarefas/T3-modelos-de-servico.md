# T3 — Modelos de serviço (Q1, C1, D1, S1)

**Fatias:** [Q1](../fatias/Q1-quick-service.md) · [C1](../fatias/C1-casual-familia-festas.md) · [D1](../fatias/D1-fine-harmonizacao-sommelier.md) · [S1](../fatias/S1-chamados-acoes-garcom.md)
**Spec:** §3.4–§3.6 (Fine), §4.4–§4.6 (Casual), §5.4–§5.6 (Quick)

> **Atualização 2026-10-01:** o texto abaixo foi escrito sobre o commit `bbd69c5` (03/09). A migration
> `20260929120000_service_model_runtime_v2.sql` implementou parte de Q1 no banco. O estado real está
> na tabela "Estado das tarefas T-Q1" mais abaixo; a jornada pedida pelo cliente está no
> [ADR-013](../decisoes/ADR-013-jornada-quick-service-retirada.md).
>
> ~~Q1 é AUSENTE no banco e no servidor~~ — já não é: existem código de retirada, slots, gate de
> pagamento, conferência e confirmação de retirada. Falta a jornada de aceite, retirada com
> validação real, tolerância, estornos e o painel do restaurante.

---

## Q1 — Quick Service

> Telas existentes: `QuickServiceRestaurantView.tsx`, `QuickServiceCheckoutScreen.tsx`,
> `ComboBuilderScreen.tsx`, `OrderReadyScreen.tsx`, `QuickServiceRatingScreen.tsx`,
> `v2/QuickServiceScreen.tsx`. Backend existente: só
> `20260815220807_quick_service_cuisine_and_skip_the_line.sql` (tags + toggle) e
> `20260815224634_quick_service_custom_combo.sql` (combo por matching de texto).

### Estado das tarefas T-Q1 (2026-10-01, após ADR-013)

| Tarefa | Estado | Observação |
|---|---|---|
| 01 Código de retirada | Feito | Aleatório, único por restaurante por dia; o painel valida o código lido ou digitado (ADR-013 §2.7) |
| 02 Capacidade por janela | Parcial | Capacidade existe; falta oferecer o próximo horário |
| 03 `combo_definitions` | Aberta | |
| 04 Desconto de combo da configuração | Feito | `ComboBuilderScreen` usa `policies.comboDiscountBps`; extra de personalização entra sem desconto (ADR-013 §2.9) |
| 05 Quatro etapas + conferência | Feito | Painel com abas Novos, Em preparo (com conferência), Aguardando retirada, Retirados, Não retirados e Agendados; cliente vê as etapas do ADR-013 §2.2 |
| 06 Gate de pagamento | Feito | Passa a exigir também `accepted` (ADR-013 §2.4) |
| 07 Tempo estimado | Parcial | `private.quick_estimated_prep_minutes` (padrão + fila); falta recalcular por item |
| 08 Ciclo pagamento → retirada | Parcial | `order_status_events` grava cada transição com horário; falta o relatório do ciclo |
| 09 Não retirado | Feito | ADR-013 §2.3; política `none` ou `store_credit` |
| 10 Item indisponível após pagamento | Feito | Estorno parcial no servidor, com `audit_log` (ADR-013 §2.5) |
| 11 KDS offline | Aberta | |
| 12 SLA proativo | Aberta | |
| 13 Erro de montagem volta à estação | Feito | Reprovar na conferência devolve só o item apontado |
| 14 Cupons e pontos | Aberta | |
| 15 Modo de retirada e balcão | Feito | `consumption_mode` e `pickup_location`; o push de pronto traz o balcão |
| 16 Recompra | Feito | "Pedir novamente" recalcula preço e personalização com o cardápio de hoje |
| 17 Fila visível antes de pedir | Feito | `customer_quick_service_status`: estado, fila, tempo estimado e local de retirada |

### T-Q1-18 · NOVO — Jornada de pedido antecipado (ADR-013)
**Tipo** banco/servidor/app/painel **Tamanho** G **Depende de** T-Q1-01, T-Q1-06
**Origem** Resposta do cliente: o QS substitui o totem de autoatendimento.
**Escopo** Ações da tela do restaurante por capability (`orderAhead`); nome para chamada; comer aqui ou
levar; agora ou agendar; política de não retirada aceita no checkout; Pix com expiração; aceite
automático ou manual com timeout; etapas Pago → Aceito → Em preparo → Pronto → Retirado; retirada por
QR ou código validado; tolerância 15–60 a partir de "pronto"; Não retirado; estornos; pausa de pedidos;
duplicado; `order_status_events`.
**Aceite** Cada regra do ADR-013 tem teste (SQL ou Jest). A retirada só conclui com o código do cliente.

### T-Q1-01 · NOVO — Código de retirada
**Tipo** banco/servidor **Tamanho** M
**Spec** §5.4 ("o código é o identificador de entrega"), §5.6 ("o código de retirada é único por pedido e por dia, e a baixa só ocorre com a leitura ou confirmação do código")
**Gap** **`grep "pickup_code|pickup_slot"` nas migrations retorna zero.** `orders.pickup_code` não existe.
O critério não tem nenhuma implementação — a tela `OrderReadyScreen.tsx` exibe algo que o banco não guarda.
**Aceite** Código único por pedido e por dia; baixa só com leitura ou confirmação do código.

### T-Q1-02 · NOVO — Capacidade por janela de retirada
**Tipo** banco/servidor **Tamanho** G
**Spec** §5.4 ("quando a capacidade máxima por janela é atingida, o app oferece o próximo horário disponível em vez de aceitar o pedido"), §7.1 `pickup_capacity_per_slot`
**Gap** `pickup_slots` não existe; a configuração de §7.1 não tem substrato.
**Aceite** Janela cheia faz o app oferecer o próximo horário, e não aceitar o pedido.

### T-Q1-03 · NOVO — `combo_definitions`
**Tipo** banco **Tamanho** M
**Spec** §5.4 ("o montador de combo é um wizard de três etapas — principal, acompanhamento, bebida")
**Gap** O combo é **matching por nome de categoria em texto** — o próprio arquivo declara o atalho:
`20260815224634_quick_service_custom_combo.sql`, linhas 1-8, casa componentes pelo nome
`'Burgers' / 'Acompanhamentos' / 'Bebidas'`. Renomear uma categoria quebra o combo em silêncio.
**Aceite** Combo é definido por dados, com pools por FK; renomear categoria não afeta o combo.

### T-Q1-04 · AJUSTE — Desconto de combo vem da configuração
**Tipo** banco/app **Tamanho** P **Depende de** T-F3-01
**Spec** §7.1 `combo_discount_pct` · §1.2 ("nunca fixos em código")
**Gap** O desconto de 20% é literal em **dois lugares independentes que podem divergir**:
`20260815224634_...:31` (`v_discount_pct constant numeric := 20`) e
`ComboBuilderScreen.tsx:14` (`DISCOUNT_PERCENT = 20`), este último recalculado no app em `:65-66`.
**Aceite** Um único valor, vindo da configuração, e o app não recalcula o desconto.

### T-Q1-05 · NOVO — Máquina de quatro etapas com conferência obrigatória
**Tipo** banco/servidor **Tamanho** M
**Spec** §2.3, §5.4 ("a etapa de conferência é obrigatória e é o ponto de controle de erro de montagem"), §5.6 ("as quatro etapas refletem eventos reais do KDS, não temporizadores fixos")
**Gap** **`grep "conferencia|quality_check|conference"` retorna zero.** A etapa de conferência — descrita
pela spec como obrigatória — não existe. A tela `preparing` mostra quatro etapas sem lastro no KDS.
**Aceite** Recebido → Preparando → Conferência → Pronto, cada transição por evento real do KDS; sem passar pela conferência o pedido não fica pronto.

### T-Q1-06 · NOVO — Gate de pagamento antes da produção
**Tipo** servidor **Tamanho** M **Invariante** 6 **Depende de** T-N4-01, T-N4-05
**Spec** §5.4 ("isso protege a cozinha de pedidos fantasma"), §5.6 ("nenhum pedido entra na produção sem pagamento confirmado")
**Gap** Nenhum gate. `prepaid_required` (§7.1) não tem leitura.
**Aceite** Pedido sem webhook de pagamento confirmado não aparece na fila de produção.

### T-Q1-07 · NOVO — Tempo estimado coerente com a fila real
**Tipo** servidor **Tamanho** M
**Spec** §5.4 ("o tempo estimado considera a fila atual e o tempo de preparo de cada item do carrinho; ele é recalculado até o momento do pagamento"), §5.6
**Gap** Sem implementação server-side.
**Aceite** A estimativa exibida antes do pagamento bate com a fila real da cozinha e é recalculada até o pagamento.

### T-Q1-08 · NOVO — Ciclo pagamento → retirada registrado
**Tipo** banco **Tamanho** P
**Spec** §5.4 ("o tempo total do ciclo é registrado por pedido e alimenta os indicadores de throughput"), §5.3
**Aceite** Cada pedido registra o ciclo completo e o indicador de throughput usa esse número.

### T-Q1-09 · NOVO — Pedido não retirado
**Tipo** servidor **Tamanho** M
**Spec** §5.5 ("após o tempo limite configurado, o pedido é marcado como não retirado, com política de descarte e reembolso definida pelo restaurante")
**Aceite** Passado o limite, o pedido vira não retirado e a política configurada é aplicada.

### T-Q1-10 · NOVO — Item indisponível depois do pagamento
**Tipo** servidor **Tamanho** M **Depende de** T-N4-04, T-F2-04
**Spec** §5.5 ("o app oferece substituição ou estorno parcial imediato, com aprovação registrada")
**Aceite** Substituição ou estorno parcial, com aprovação gravada em `audit_log`.

### T-Q1-11 · NOVO — KDS offline enfileira e preserva a ordem
**Tipo** servidor **Tamanho** M **Depende de** T-N3-01
**Spec** §5.5 ("o pedido é enfileirado e injetado na produção assim que o KDS reconecta, preservando a ordem de chegada")
**Aceite** Pedidos pagos com o KDS offline entram na produção na ordem de chegada quando ele volta.

### T-Q1-12 · NOVO — Estouro de SLA comunicado proativamente
**Tipo** servidor/app **Tamanho** M
**Spec** §5.5 ("o app atualiza a estimativa e comunica o atraso proativamente, antes que o cliente pergunte")
**Aceite** Atraso além do SLA dispara push com a nova estimativa antes de qualquer ação do cliente.

### T-Q1-13 · NOVO — Erro de montagem volta à estação
**Tipo** servidor **Tamanho** P **Depende de** T-Q1-05
**Spec** §5.5 ("o item retorna à estação sem reiniciar o pedido inteiro")
**Aceite** Reprovar um item na conferência devolve só ele à estação; os demais mantêm o estado.

### T-Q1-14 · NOVO — Cupons e pontos sobre o subtotal, antes das taxas
**Tipo** servidor **Tamanho** M **Depende de** T-F2-01
**Spec** §5.4 ("cupons e pontos de fidelidade são aplicados sobre o subtotal antes das taxas, com regra de acumulação definida pelo restaurante")
**Aceite** A ordem de aplicação é subtotal → cupom/pontos → taxas, e a regra de acumulação vem da configuração.

### T-Q1-15 · NOVO — Modo de retirada e balcão designado
**Tipo** banco/servidor/app **Tamanho** M **Depende de** T-Q1-01
**Spec** §5.2 etapa 6 ("escolhe o modo de retirada"), §5.4 ("ao ficar pronto, o cliente recebe push com o código de retirada e o balcão designado")
**Gap** Sem tarefa. `OrderReadyScreen.tsx` mostra a retirada sem modo nem balcão guardados no banco.
**Aceite** O pedido guarda o modo de retirada escolhido no carrinho, e o push de pronto traz código e balcão.

### T-Q1-16 · NOVO — Recompra em um toque
**Tipo** servidor/app **Tamanho** M **Depende de** T-N1-02
**Spec** §5.2 etapa 13 ("base para recompra em um toque"), §8 Fase 3
**Gap** Sem tarefa e sem implementação.
**Aceite** Um pedido anterior vira carrinho novo com um toque, com preço, extras e disponibilidade recalculados pelo servidor.

### T-Q1-17 · NOVO — Fila e preparo visíveis antes de pedir
**Tipo** servidor/app **Tamanho** P **Depende de** T-Q1-07
**Spec** §5.2 etapa 2 ("encontra unidades com Skip the Line e vê a fila atual"; "exibe pedidos na fila e em preparo, além do tempo estimado")
**Gap** Sem tarefa. `customer_restaurants_live_status` existe; não foi verificado se expõe pedidos na fila e em preparo.
**Aceite** A descoberta mostra, por unidade, pedidos na fila, em preparo e o tempo estimado, vindos da fila real.

---

## C1 — Casual: família, aniversário e festas

### T-C1-01 · NOVO — Alergia propaga ao ticket do KDS
**Tipo** servidor **Tamanho** M **Depende de** T-N1-04
**Spec** §4.4 ("alergias registradas viram alerta obrigatório no ticket do KDS"), §4.6 ("aparecem em destaque")
**Gap** A alergia fica em `table_session_participants.kid_allergies` (texto ≤ 200 chars,
`20260815230000_...:4-7`) e **não propaga**. O único `'{"allergy_alert":true}'` do repositório está no
seed de simulação (`20260730120000_...:731,789`) — **dado de demo, não mecanismo**.
**Aceite** Alergia registrada aparece em destaque no ticket, propagada pelo servidor.

### T-C1-02 · NOVO — Bloqueio de expedição até confirmação do chef
**Tipo** servidor **Tamanho** M **Depende de** T-C1-01, T-N3-03
**Spec** §4.4 ("exigem confirmação do chef antes da expedição"), §4.5 ("alergia crítica bloqueia a expedição até a confirmação explícita do chef")
**Aceite** Item com alergia crítica não é expedido sem confirmação explícita do chef.

### T-C1-03 · NOVO — Junção de mesas
**Tipo** banco/app **Tamanho** G
**Spec** §4.4 ("o restaurante pode juntar mesas para formar o grupo"), §4.6 ("reflete no mapa de salão e em uma conta consolidada coerente com o modo escolhido"), §2.6 ("soma das mesas juntadas")
**Gap** `tables.merged_into_id` não existe. **Junção de mesas não é representável** — o que também
impede a saída "juntar mesas" da exceção de lotação (T-G2-02) e a alocação de reserva grande (T-E1-03).
**Aceite** Mesas juntadas aparecem como grupo no mapa de salão, somam capacidade e produzem uma conta consolidada.

### T-C1-04 · NOVO — Recálculo por mudança de tamanho do grupo
**Tipo** servidor **Tamanho** M **Depende de** T-G2-01, T-G3-03
**Spec** §4.5 ("recalcula a alocação e pode exigir junção de mesas; a divisão igual é recalculada automaticamente")
**Aceite** Mudar o tamanho do grupo recalcula alocação e divisão igual sem intervenção manual.

### T-C1-05 · AJUSTE — Cortesia com aprovação e auditoria
**Tipo** servidor **Tamanho** P **Depende de** T-F2-04
**Spec** §4.4 ("cortesias de comemoração passam pela aprovação do gerente e ficam registradas com valor e motivo"), §3.6 **Invariante** 8
**Gap** A cortesia é literal: `20260816010000_casual_dining_payment_and_receipt.sql:230` —
`least(15.00, v_subtotal)`. Não passa por aprovação nem grava auditoria.
**Aceite** Cortesia exige aprovação, grava valor e motivo em `audit_log`, e o teto vem da configuração.

### T-C1-06 · NOVO — Criança de colo não ocupa assento
**Tipo** banco **Tamanho** P **Depende de** T-G2-01
**Spec** §2.6 ("aprovar com exceção — ex.: criança sem assento"), §8.1, ADR-007
**Gap** `is_kid` e `kid_age` existem (`20260815200000_...:41`, `20260815230000_...:4-7`) mas
`seat_count = 0` não existe — ADR-007 sem substrato.
**Aceite** Criança de colo entra sem consumir assento, conforme a política da unidade.

### T-C1-07 · NOVO — Modo de conta do grupo
**Tipo** banco/app **Tamanho** M **Depende de** T-G3-03, T-C1-03
**Spec** §4.4 ("o grupo escolhe o modo de conta: conta única, dividida por mesa ou individual. A escolha define como as parcelas serão apresentadas no fechamento")
**Gap** Não existe.
**Aceite** Os três modos existem e o fechamento apresenta as parcelas conforme o escolhido.

---

## D1 — Fine: harmonização, sommelier e níveis

### T-D1-01 · AJUSTE — Harmonização consulta disponibilidade real
**Tipo** servidor/app **Tamanho** M
**Spec** §3.2 etapa 4 ("consulta harmonização sugerida"), §8 Fase 3
**Gap** É conteúdo estático, e o **próprio código declara o placeholder**: `home-restaurant-ui.ts:74` —
"screen reachable from the fine_dining menu until a real recommendation". Não consulta disponibilidade.
**Aceite** A sugestão só oferece item disponível no momento da consulta.

### T-D1-02 · AJUSTE — `sommelier` como tipo de chamado para o garçom responsável
**Tipo** servidor **Tamanho** P **Depende de** T-S1-05
**Spec** §3.4 ("três tipos de chamado: garçom, sommelier e ajuda geral"), §3.6 ("chamados de garçom e sommelier chegam à tela do garçom responsável com identificação da mesa"), §3.2 etapa 12
**Gap** `restaurant_service_configs.sommelier_available` existe (`20260430180000_...:1135`), mas `sommelier` não é um
tipo de chamado condicionado por capability. *Corrigido em 2026-09-14:* a versão anterior desta tarefa mandava o
chamado "para papel próprio"; a spec manda para o garçom responsável, e o §2.4 não tem papel de sommelier.
**Aceite** Chamado de sommelier chega à tela do garçom responsável pela mesa, com tipo sommelier, mesa e tempo de espera.

### T-D1-03 · NOVO — Catálogo de níveis configurável
**Tipo** banco **Tamanho** M **Depende de** T-F3-01
**Spec** §3.4 ("fidelidade por pontos com níveis progressivos"), §6 ("Fine: pontos e níveis")
**Gap** `loyalty_programs.tier` é **`text` livre** (`20260430180000_...:853`); não há catálogo de níveis por estabelecimento.
**Aceite** Os níveis e seus limiares são configuráveis por estabelecimento, e `tier` referencia o catálogo.

### T-D1-04 · NOVO — Menus especiais com aprovação do chef
**Tipo** servidor/app **Tamanho** M
**Spec** §3.3 ("antes do serviço, o chef aprova menus especiais e bloqueia itens indisponíveis")
**Gap** Ausente.
**Aceite** Menu especial só fica visível ao cliente depois da aprovação do chef.

---

## S1 — Chamados e ações do garçom

### T-S1-01 · DECISÃO + AJUSTE — Remover a tabela duplicada `waiter_calls`
**Tipo** banco **Tamanho** P **Ver** T-X-03
**Gap** `waiter_calls` (`20260430180000_...`, **sem RLS**) duplica `service_calls` (`:95+`). Duas
implementações do mesmo conceito.
**Aceite** Um único mecanismo de chamado.

### T-S1-02 · NOVO — Previsão de atendimento para o cliente
**Tipo** app/servidor **Tamanho** M
**Spec** §3.4 ("o cliente vê a confirmação e a previsão de atendimento")
**Gap** Não implementado.
**Aceite** Ao chamar, o cliente vê confirmação e previsão; o garçom vê mesa, tipo e tempo de espera.

### T-S1-03 · NOVO — Chamado discreto
**Tipo** app **Tamanho** P
**Spec** §3.4 ("chamado discreto na tela do garçom"), §3.1 ("a tecnologia precisa ser discreta")
**Gap** Não há configuração de alerta sonoro/visual.
**Aceite** O alerta do chamado é configurável e o padrão em Fine Dining é discreto.

### T-S1-04 · AJUSTE — TAP to Pay quita parcela e não calcula valor
**Tipo** app/servidor **Tamanho** M **Invariante** 2 **Depende de** T-G3-03
**Spec** §3.3 ("cobra na mesa por NFC, PIX ou cartão quando o cliente prefere"), §7.4
**Gap** `WaiterTapToPayScreen.tsx:55-57` calcula gorjeta e total **no cliente**
(`Math.round(amount * tipPercent * 100) / 100`), converte centavos para float (`cents / 100`) e
**não quita parcela** — porque parcelas não existem.
**Aceite** O TAP to Pay quita uma `bill_share` com valor vindo do servidor, em centavos.

### T-S1-05 · AJUSTE — Tipos de chamado por capability
**Tipo** app **Tamanho** P **Depende de** T-F3-03
**Spec** §6 ("Quick Service: sem chamado; contato no balcão")
**Gap** O tipo `sommelier` não é condicionado por capability.
**Aceite** Os tipos de chamado oferecidos vêm da configuração, e Quick Service não oferece nenhum.

### T-S1-06 · AJUSTE — `orders.source` diferenciado
**Tipo** banco **Tamanho** P
**Spec** §2.2 ("`source` distingue app do cliente, garçom, QR, balcão e marketplace")
**Gap** `orders.source` (`20260430180100_...:50`) tem default `'noowe'` e não distingue as cinco origens.
O pedido lançado pelo garçom já usa o mesmo `place_order` com `p_customer_id`
(`20260710130000_place_order_rpc.sql:41-48`) — falta só marcar a origem.
**Aceite** As cinco origens são distinguíveis e aparecem no relatório do turno.
