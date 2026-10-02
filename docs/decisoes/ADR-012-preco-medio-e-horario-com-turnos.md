# ADR-012 — Preço médio do cardápio e horário de funcionamento com turnos

**Status:** ACEITO (2026-09-28). **A seção 1 (preço médio calculado) foi substituída pelo [ADR-014](ADR-014-preco-medio-cadastrado-pelo-restaurante.md) em 2026-10-01**; a seção 2 (horário com turnos) segue valendo. Pedido do responsável do produto após a rodada de testes manuais;
a escolha do cálculo (média simples dos itens disponíveis) foi confirmada por ele.
**Origem:** testes manuais no app cliente e no app do restaurante
**Impacta:** cards e detalhes do restaurante (cliente), perfil e horários (restaurante), check-in de mesa
**Regras isoladas em função nomeada:** `private.compute_avg_menu_price_cents`,
`private.opening_hours_max_shifts_per_day`

## 1. Preço médio no lugar de "por pessoa" — SUBSTITUÍDA pelo ADR-014

### Questão

O card e a página do restaurante mostravam "~R$ 85/pessoa", lido de `restaurants.average_ticket`. Esse
valor era um placeholder de migração (180 / 85 / 38 por modelo de serviço) que nada calculava, e "por
pessoa" não descreve quem pede um item só.

### Decisão

- O app mostra **"Preço médio R$ X"**, a média simples de `menu_items.price` dos itens **disponíveis**
  (`is_available`) em categoria **ativa** (ou sem categoria). Restaurante sem itens não mostra preço.
- O servidor calcula e guarda em `restaurants.avg_menu_price_cents` (`bigint`, centavos — invariantes 1
  e 2). O app só exibe; a conversão para reais acontece na borda da UI (`formatAverageMenuPrice`).
- A coluna é mantida por trigger em `menu_items` e `menu_categories`; as listagens já leem `restaurants`
  com `select *`, sem viagem extra por card.
- `average_ticket` e `price_range` deixam de ser exibidos. O campo "Faixa de preço" saiu do perfil do
  restaurante; no lugar aparece o preço médio calculado, somente leitura.
- Trocar a média por mediana (menos sensível a bebida barata ou prato de degustação) é mudar uma função.

## 2. Horário de funcionamento com turnos

### Questão

O app do restaurante gravava `restaurants.business_hours` (lista com dias em português) e o servidor e o
app cliente liam `restaurants.opening_hours` (objeto com dias em inglês). Nada ligava as duas: o que o dono
editava nunca chegava ao cliente, e um restaurante novo ficava "Fechado" para sempre. O campo de horário
também aceitava qualquer texto ("6700"), e não havia como declarar almoço e jantar no mesmo dia.

### Decisão

- **Uma fonte só:** `restaurants.opening_hours`, no formato
  `{ "monday": { "closed": false, "shifts": [{ "open": "11:00", "close": "14:00" }, ...] }, ... }`.
- O formato antigo (`{open, close}` / `{closed: true}`) e o `business_hours` continuam aceitos e são
  convertidos por trigger, então app antigo não quebra.
- O servidor valida (`private.validate_opening_hours`): HH:MM de 24 horas, turnos sem sobreposição,
  no máximo 4 por dia, e só o último turno do dia pode passar da meia-noite.
- `private.restaurant_live_status` passa a avaliar turnos (intervalo entre turnos = fechado). A fila
  virtual já usa esse status por `private.restaurant_is_open_now`.
- **O check-in de mesa e o QR de balcão também exigem restaurante aberto** (erro `P0010`). O atalho de mesa
  de teste (`customer_dev_check_in`, só com a flag de dev) não é bloqueado. Convite para uma sessão que já
  está aberta continua permitido.

## Consequências

- Restaurante com `opening_hours` vazio fica fechado para a fila e para o check-in: o dono precisa
  cadastrar o horário (o app do restaurante já lê e grava a mesma coluna).
- O placeholder de horário deixa de valer no momento em que o dono salva o dele
  (`settings.profile_placeholder.fields` perde `opening_hours`).
