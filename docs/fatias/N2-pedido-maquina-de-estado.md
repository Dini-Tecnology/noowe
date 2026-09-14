# N2 — Pedido, itens, roteamento e máquina de estado

**Objetivo:** o coração do produto — pedido nasce digital, roteia por estação e converge.
**Depende de:** N1
**Spec:** §2.3 (máquina de estado e convergência), §2.2, §3.4 ("comanda e pedido")
**Arquitetura:** `01-modelo-de-dados.md` (status derivado)

## Entregáveis

**Banco**
- `orders`, `order_items` conforme `01-modelo-de-dados.md`
- Enum de estado: `pending → confirmed → preparing → ready → delivered → paid`
- **Trigger de derivação:** `orders.status` recalculado a partir de `order_items.item_status`.
  Nenhuma tela escreve `orders.status` diretamente.
- Constraint `order_model_coherence` (ADR-003)

**Servidor**
- RPC `create_order(items, idempotency_key, context)` — roteia cada item para a estação da
  ficha técnica, calcula preço server-side
- RPC `update_item_status(item_id, status)` — a única porta de mudança de estado

**App**
- Comanda/carrinho em rascunho local; confirmação gera o pedido
- Acompanhamento por item, com o responsável pelo preparo (spec §3.2 etapa 6)

## Critérios de aceite

1. Um pedido confirmado no app aparece no KDS correto — cozinha ou bar — **sem intervenção
   manual** (spec §3.6).
2. Um pedido com itens de cozinha e de bar só entra em `ready` quando **todos** os itens de
   **todas** as estações estão prontos (convergência, spec §2.3).
3. `orders.status` nunca é escrito diretamente: teste que tenta o `update` e espera rejeição.
4. Nenhum pedido é redigitado em nenhum ponto do fluxo (spec §1.3).
5. Alteração após a confirmação (cancelamento, devolução) vai para a fila de aprovações do
   gerente com motivo obrigatório e registro em `audit_log` (spec §3.4).
6. Item marcado indisponível após o pedido notifica o cliente com sugestão de substituição e só
   sai da comanda mediante confirmação (spec §3.5).

## Fora de escopo

Pagamento (N4), split (G3), a UI do KDS (N3).
