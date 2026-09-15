# N1 — Cardápio, estações e disponibilidade real

**Objetivo:** cardápio que reflete o que a cozinha realmente consegue produzir agora.
**Depende de:** F3
**Spec:** §3.2 (etapa 4), §4.2 (etapa 6), §5.2 (etapas 3–5), §2.2 (`OrderItem.station`)

## Entregáveis

**Banco**
- `stations` (cozinha, bar, e estações nomeadas dentro delas)
- `menu_categories`, `menu_items` com `station_id`, `price_cents`, `prep_time_min`,
  `available`, `allergens[]`, fotos
- `menu_item_options` — extras pagos, remoção de ingredientes, tamanhos (spec §5.4); cada
  opção afeta preço e, quando aplicável, tempo de preparo

**Servidor**
- Consulta de cardápio já **filtrada por disponibilidade real** — o bloqueio do chef e a falta
  de estoque não chegam ao app como item cinza, chegam como item ausente ou explicitamente
  esgotado
- Cálculo de tempo estimado acumulado do carrinho (spec §5.2 etapa 3)

**App**
- Navegação por categoria, detalhe de item com alérgenos, popularidade e tempo de preparo
- Tela de personalização com recálculo de preço e tempo ao vivo (o valor final vem do servidor)

**Painel**
- Bloqueio/desbloqueio de item pelo chef, refletido no app em tempo real

## Critérios de aceite

1. Item bloqueado pelo chef desaparece do cardápio do cliente em tempo real, sem recarregar.
2. Cada item tem estação; item sem estação não pode ser publicado.
3. Alérgenos declarados no item aparecem no detalhe e propagam para o ticket (usado em C1).
4. O preço exibido com extras é idêntico ao preço que o servidor calcula ao criar o pedido.

## Fora de escopo

Fichas técnicas, custo e margem (Fase 4). Estoque com baixa automática.
