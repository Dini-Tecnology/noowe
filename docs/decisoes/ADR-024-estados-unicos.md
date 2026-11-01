# ADR-024 — Estados únicos entre perfis e apps

**Status:** PROVISÓRIO (2026-11-01). Origem: aditivo §1.1 ("Dono vê Novos, Gerente vê Pendente/Confirmado").
**Impacta:** fatia O1, invariante 5, `order_items`, `orders`, `table_sessions`, `tables`, app cliente e restaurante.
**Regras isoladas em função nomeada:** `private.derive_order_status` (trigger em `order_items`), `statusLabel` (módulo único de rótulos compartilhado pelos dois apps).

## Decisão

Um único conjunto de estados, com tradução para o rótulo em um módulo só.

| Objeto | Estados |
|---|---|
| Item | Aguardando pagamento (só Quick) → Recebido → Em espera → Disparado → Em preparo → Pronto → Entregue/Retirado; Cancelado |
| Pedido | **derivado dos itens**, nunca escrito à mão |
| Comanda | Aberta → Conta pedida → Pagamento parcial → Paga → Encerrada |
| Mesa | Livre, Reservada, Ocupada, Conta pedida, Pagamento parcial, Limpeza, Bloqueada |

- O trigger de derivação pedido ← itens passa a existir (fecha T-N2-01); o trigger inverso e as escritas diretas em
  `orders.status` saem, com a varredura `03_sweep_order_status` atualizada.
- `tables.status` ganha `CHECK`; a política que deixa qualquer membro escrever status direto é restringida.
- "Em preparo" é marcado sozinho quando o item aparece na estação; o botão "Iniciar" sai.
- Pagar a comanda leva a mesa a **Limpeza**, não a Livre; liberar é tarefa do garçom.
- Mapeamento para o cliente continua em `quickTrackingStep` (ADR-013). Etapas do Quick ao cliente: pendência 14.
- Cozinheiro: botão **Pronto** no card; pedir ajuda e solicitar indisponível ficam num menu secundário (pendência 12).

## Consequências

- Mexe no app cliente (`order-status-ui.ts`); coordenar com o trabalho do cliente em andamento.
- Migração de dados dos valores antigos (`pending`, `payment`, `available`) para os novos.
