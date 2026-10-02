# ADR-014 — Preço médio cadastrado pelo restaurante

**Status:** ACEITO (2026-10-01). Pedido do cliente na rodada de validação de 27/09 (retorno de 29/09).
**Substitui:** a seção 1 do [ADR-012](ADR-012-preco-medio-e-horario-com-turnos.md) (média calculada do cardápio).
**Origem:** o cliente reprovou a média calculada; quer informar o valor no painel do restaurante.
**Impacta:** perfil do restaurante (app do restaurante), cards, favoritos e página do restaurante (app cliente)
**Regras isoladas em função nomeada:** `public.restaurant_update_profile` (validação do campo),
`formatAveragePrice` (exibição, `home-restaurant-ui.ts`)

## Questão

A média simples dos itens do cardápio (ADR-012) não representa o gasto por pessoa — bebida barata,
prato de degustação e cardápio incompleto distorcem o número — e o cliente a reprovou. O valor que
aparece para o consumidor precisa ser o que o dono do restaurante declara.

## Decisão

- O restaurante cadastra o **preço médio por pessoa** no app do restaurante (Perfil → Informações Básicas),
  em reais, com máscara de centavos ("5000" → "R$ 50,00").
- O servidor guarda em `restaurants.average_price_cents` (`bigint`, centavos — invariante 1) e valida na
  `restaurant_update_profile`: inteiro maior que zero, ou `null` para apagar. Só dono e gerente gravam.
  Decimal, zero, negativo e texto são recusados (`22023`).
- O app cliente mostra **"Preço médio R$ 50,00"** nos cards, nos favoritos e na página do restaurante,
  **somente se houver valor cadastrado**. Sem cadastro, nenhum preço é exibido — não há valor padrão
  nem estimativa.
- O valor aparece em reais, não como "$$$" (o cliente reafirmou em 01/10: configura 50, o cliente vê R$ 50,00).
- Os triggers e funções que calculavam a média foram removidos. Mudar o cardápio não altera o preço.
- A migration zera os valores que existiam: eram médias calculadas, não cadastros.

## Consequências

- Todo restaurante começa sem preço no app até o dono cadastrar o dele.
- `average_ticket` e `price_range` continuam no schema, sem uso na interface.
- As chaves `price_per_person_min/max` de `service_config.casual_dining` ficam como estão (legado, sem
  exibição); só a função `formatPricePerPerson` foi removida.
