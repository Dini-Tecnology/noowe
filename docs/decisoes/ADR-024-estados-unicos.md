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

- Mexe no app cliente (`order-status-ui.ts`).
- **As chaves do banco não mudam:** `pending` é "Recebido", `payment` em mesa é "Conta pedida" e `available` é "Livre". Só o rótulo é único, em `shared/utils/status-label.ts`. Renomear exigiria reescrever mais de 30 funções sem ganho para quem usa.
- **`completed` deixa de ser escrito ao pagar.** Pago é `payment_status`; o pedido entregue segue `delivered`. `completed` só vem de pedido não retirado e dos dados antigos.
- **Cliente não cancela o que já está na estação (pendência 30).** No salão e no Quick com aceite automático, o item entra em preparo na hora: o cancelamento segue para a aprovação do gerente (spec v2, seção de alterações após a confirmação). O estorno automático por restaurante fechado só alcança o aceite manual.
- **Pedido com horário de retirada futuro** fica Recebido até a cozinha marcar Pronto: ainda não há disparo por horário (fatia O7).
- **Mesa em Limpeza recusa o QR até o garçom liberar.** Sem a tarefa da O2, ninguém é avisado, e a mesa pode ficar parada.
- **Mesa não vai sozinha a Conta pedida nem a Pagamento parcial (pendência 31).** Os estados e rótulos existem, mas hoje a mesa nesses estados recusa QR e sai de várias contagens de ocupação; escrever exige ajustar essas funções junto.
- `private.order_requires_quality_check` ainda lê o modelo de serviço, num só lugar. A O7 troca pela opção de Expedição (ADR-028).

## Respostas às pendências 30 e 31

- **Cancelar pelo app (30):** o cliente cancela o item que ainda não foi à estação ("Recebido" ou "Em espera"). Depois, só
  pelo garçom e com aprovação. Quick: estorno integral e automático antes da estação; depois, só com aprovação.
- **Conta pedida (31):** "Conta pedida" e "Pagamento parcial" são só informativos no mapa e nunca bloqueiam a entrada pelo
  QR. A resposta diz "saldo maior que zero"; a pendência 33 confirma o caso da mesa ainda sem pedido.
