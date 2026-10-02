# ADR-013 — Jornada Quick Service: pedido antecipado, aceite e retirada

**Status:** PROVISÓRIO (2026-10-01). Os defaults abaixo são propostos pelo time técnico a partir da
resposta do cliente; os pontos que o cliente deixou como "X min" precisam de confirmação dele.
**Origem:** resposta do cliente sobre as ações do Quick Service na tela do restaurante
**Impacta:** Q1 (Quick Service), N4 (pagamento), app cliente, app do restaurante
**Regras isoladas em função nomeada:** `private.quick_pickup_deadline`,
`private.quick_estimated_prep_minutes`, `private.quick_service_sweep`,
`private.price_item_customizations`, `quickTrackingStep` (app cliente, `quick-service-ui.ts`)

## 1. Questão

O Quick Service não tinha ações na tela de detalhes do restaurante: o servidor desliga
`tableSession`, `reservations` e `virtualQueue` nesse modelo, e nada ocupava o lugar. O cliente
explicou o conceito: **o Quick Service substitui o totem de autoatendimento**. O cliente faz
cardápio, personalização, pagamento, acompanhamento e retirada pelo app, inclusive fora do
restaurante, e é avisado quando o pedido fica pronto.

## 2. Decisão

### 2.1 Ações na tela do restaurante

Por capability, nunca por `service_model`:

- `orderAhead` (= `prepaidRequired` e `pickupCode`) → **Fazer pedido**, ação principal.
- `pickupSlots` → **Agendar retirada**.
- Pedido ativo no restaurante → **Meus pedidos**; senão, havendo histórico → **Pedir novamente**.

### 2.2 Etapas: junção da spec Q1 com o fluxo do cliente

O cliente vê **Pago → Aceito → Em preparo → Pronto → Retirado**, com os terminais
**Não retirado** e **Cancelado/Estornado**. A **Conferência continua obrigatória no KDS**
(critérios Q1 #3 e #9); para o cliente ela aparece dentro de "Em preparo".

| Cliente vê | Estado no banco |
|---|---|
| Pago | `payment_status = confirmed` e `fulfillment_status = received` |
| Aceito | `fulfillment_status = accepted` (novo) |
| Em preparo | `preparing` ou `checking` |
| Pronto | `ready` |
| Retirado | `picked_up` |
| Não retirado | `not_picked_up` (novo) |
| Cancelado / Estornado | `cancelled`, com `payment_status = refunded` |

O mapeamento mora numa função só (`quickTrackingStep`), para trocar a regra em um ponto.

### 2.3 Tolerância de retirada

- A tolerância conta a partir de **pronto**, não da criação do pedido. Antes,
  `customer_create_order_v2` calculava `now() + pickup_expiry_min` na criação, o que consumia a
  tolerância durante o preparo.
- Faixa válida **15 a 60 min**, default **30**, configurável por restaurante
  (`restaurant_model_policies.pickup_expiry_min`).
- Ao vencer, o pedido vai para `not_picked_up`. A política (`no_pickup_policy`) é `none`
  (sem reembolso, o default do cliente) ou `store_credit` (crédito na carteira).
- A política é **exibida e aceita no checkout**; a aceitação grava
  `orders.pickup_policy_accepted_at`.
- Lembretes: ao ficar pronto (push do servidor), na metade do prazo e 5 min antes de expirar.
  Como o projeto **não tem pg_cron**, os dois últimos são **notificações locais** agendadas pelo
  app ao ver o pedido `ready`. Limitação: se o app nunca abrir o pedido, não há lembrete.

### 2.4 Aceite

- `accept_mode` = `auto` (default) ou `manual`. Em `auto`, o pagamento confirmado leva o
  pedido direto a `accepted`.
- Em `manual`, sem resposta em `accept_timeout_min` (default **5**), o pedido é cancelado com
  estorno integral. Ator `system`, com linha em `audit_log` (invariante 8).
- O pedido só entra em produção com pagamento confirmado **e** `accepted` (invariante 6 e
  critério Q1 #1).

### 2.5 Cancelamento e estorno

- Cliente cancela **só até o início do preparo**, com estorno integral.
- Restaurante cancela com **motivo obrigatório**, estorno integral e `audit_log`.
- Item esgotado após o pagamento: **estorno parcial** calculado no servidor, em centavos, com
  aprovação registrada (critério Q1 #8).
- Restaurante fechou depois do pagamento e antes do preparo: estorno automático.
- Este ADR **não revoga o ADR-004**: o estorno de QS vale só para pedido pré-pago de retirada,
  que não tem reabertura de conta.

### 2.6 Operação

- Pausar pedidos, ajustar tempo de preparo e **encerrar pedidos X min antes do fechamento**
  (`close_orders_before_min`, default **15**).
- Pix expira em `pix_expiry_min` (default **15**). Expirado, o pagamento vira `failed` e o
  pedido é cancelado.
- Aviso de distância quando o cliente estiver a mais de `distance_warning_km` (default **2**).
  Só avisa, não bloqueia.
- Pedido duplicado: um pedido não terminal do mesmo usuário, no mesmo restaurante e com o mesmo
  carrinho é recusado (`P0005`), devolvendo o pedido existente. Isto é **além** da
  idempotência por `client_request_id`, que só cobre o reenvio da mesma requisição.

### 2.7 Código de retirada

Passa a ser aleatório, de 6 caracteres sem ambíguos, **único por restaurante por dia**
(critério Q1 #4). Antes era o prefixo do UUID do pedido, único só por restaurante.
O QR do cliente carrega `noowe://pickup/<orderId>/<code>`. O restaurante **valida** o código lido
ou digitado: não reenvia mais o código armazenado do próprio pedido.

### 2.8 Rastro

`order_status_events` registra horário, ator e motivo de cada mudança de pagamento e de
cumprimento, para contestação.

### 2.9 Personalização de itens

Atende à etapa "Personalização" do fluxo do cliente e à T-N1-02. **Não é exclusiva do Quick
Service**: vale para qualquer item de qualquer modelo, porque `place_order` é o ponto único de preço.

- Modelo: `menu_item_option_groups` (mínimo e máximo de escolhas; obrigatório = mínimo ≥ 1) e
  `menu_item_options` (extra em centavos, `bigint`, nunca negativo). Ingredientes removíveis em
  `menu_items.removable_ingredients` e sugestões em `menu_items.upsell_item_ids` (até 5, do
  mesmo restaurante). A tabela gerada `menu_item_customization_groups`, que nunca foi usada,
  fica como legado.
- O app envia só `{ options: [ids], removed: [nomes] }`. O servidor valida (opção do item,
  disponível, sem repetição, dentro da faixa do grupo, ingrediente declarado removível) e
  **precifica** (invariante 2). O preço enviado pelo app é ignorado.
- O pedido guarda um snapshot legível em `order_items.customizations` e o resumo
  ("Ponto: Ao ponto · Sem cebola") à frente de `special_instructions`, que é o que a cozinha já lê.
- **Combo:** o desconto incide só sobre o **preço base** dos itens; o extra entra cheio
  (default proposto, ver ponto em aberto 4).
- Reeditar a personalização **preserva os ids** de grupos e opções enviados. Assim, carrinho aberto
  e "Pedir novamente" continuam válidos após um ajuste de preço ou de nome.
- No "Pedir novamente", opção ou ingrediente que deixou de existir é descartado. Se faltar uma
  escolha obrigatória, o item fica de fora e o cliente é avisado para escolher de novo.
- Fora deste ADR: o efeito do extra no tempo de preparo, citado na T-N1-02.

## 3. Pontos em aberto (confirmar com o cliente)

1. Valores de `accept_timeout_min` (5), `pix_expiry_min` (15), `close_orders_before_min` (15) e
   `distance_warning_km` (2).
2. Se "crédito em caso de não retirada" é por restaurante ou global.
3. Se o cliente aceita que lembretes de retirada dependam do app aberto (ver 2.3) até haver job
   agendado no servidor.
4. Se o desconto do combo deve valer também sobre os extras escolhidos (hoje: só o preço base).

## 4. Fora do escopo

- **Impressora térmica:** nenhuma integração existe no repositório e exige hardware.
- **Gateway real de Pix e cartão:** fatia N4. Hoje só existe o provedor simulado; a jornada fica
  pronta para receber o webhook real.

## Consequências

- A divergência com a spec (4 etapas visíveis) fica registrada aqui; a fatia Q1 é atualizada.
- Trocar qualquer número deste ADR é mudança em `restaurant_model_policies`, nunca em código.
